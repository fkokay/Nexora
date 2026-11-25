using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using static AIERP.Api.IntegrationTests.StudioAccessEndpointsIntegrationTests;

namespace AIERP.Api.IntegrationTests;

public sealed class StudioDeveloperGuardIntegrationTests
{
    private static readonly Guid DeveloperId = Guid.Parse("44444444-4444-4444-4444-444444444444");
    private static readonly Guid NoneId = Guid.Parse("55555555-5555-5555-5555-555555555555");

    [Fact]
    public async Task Consultant_gets_403_on_projects_list()
    {
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/projects/", UserId);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("studio.role.developer_required", json.GetProperty("code").GetString());
        Assert.Equal("Bu işlem için Yazılımcı rolü gerekir.", json.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Consultant_gets_403_on_workspace_requests()
    {
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/workspace-requests/pending", UserId);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("studio.role.developer_required", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Developer_by_grant_keeps_project_access()
    {
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/projects/", DeveloperId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Admin_passes_guard()
    {
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/projects/", AdminId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Service_token_without_role_claim_is_not_blocked()
    {
        // AIService has no inbound /studio/projects or /studio/workspace-requests callbacks from Runner/Deployer
        // (it calls them outbound), so this is a single synthetic token without a role claim. A consultant
        // (which would be blocked as a user) must pass the guard untouched.
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/projects/", UserId, withoutRoleClaim: true);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task None_role_cannot_list_requests_or_read_capabilities()
    {
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();

        using var requests = await SendAsync(client, HttpMethod.Get, "/studio/requests/", NoneId);
        using var capabilities = await SendAsync(client, HttpMethod.Get, "/studio/capabilities", NoneId);

        Assert.Equal(HttpStatusCode.Forbidden, requests.StatusCode);
        Assert.Equal("studio.role.none", (await requests.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, capabilities.StatusCode);
    }

    [Fact]
    public async Task Consultant_can_still_list_requests()
    {
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/requests/", UserId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Requests_list_reports_stage_and_ownership()
    {
        await using var factory = await CreateSeededFactoryAsync();
        using var client = factory.CreateClient();
        var requestId = Guid.NewGuid();
        var untouchedId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AIStudioDbContext>();
            var project = await db.DevelopmentProjects.FirstAsync();
            db.DevelopmentRequests.AddRange(
                new DevelopmentRequest { Id = requestId, TenantId = TenantId, CreatedByUserId = UserId, Title = "Staged", Description = "d" },
                new DevelopmentRequest { Id = untouchedId, TenantId = TenantId, CreatedByUserId = AdminId, Title = "Untouched", Description = "d" });
            var workspace = new DevelopmentWorkspaceRequest { TenantId = TenantId, ProjectId = project.Id, DevelopmentRequestId = requestId, RequestedByUserId = UserId };
            var candidate = new ReleaseCandidateRecord { TenantId = TenantId, ProjectId = project.Id, WorkspaceRequestId = workspace.Id, CreatedByUserId = UserId };
            var version = new StudioReleaseVersionRecord { TenantId = TenantId, ProjectId = project.Id, ReleaseCandidateId = candidate.Id, CreatedByUserId = UserId };
            var package = new StudioReleasePackageRecord { TenantId = TenantId, ProjectId = project.Id, ReleaseVersionId = version.Id, CreatedByUserId = UserId };
            db.DevelopmentWorkspaceRequests.Add(workspace);
            db.ReleaseCandidateRecords.Add(candidate);
            db.StudioReleaseVersionRecords.Add(version);
            db.StudioReleasePackageRecords.Add(package);
            db.StudioReleaseDeploymentRecords.Add(new StudioReleaseDeploymentRecord
            {
                TenantId = TenantId, ProjectId = project.Id, ReleasePackageId = package.Id, CreatedByUserId = UserId,
                Environment = StudioReleaseDeploymentRules.Staging, Status = StudioReleaseDeploymentRules.Succeeded
            });
            await db.SaveChangesAsync();
        }

        using var response = await SendAsync(client, HttpMethod.Get, "/studio/requests/", UserId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToDictionary(x => x.GetProperty("id").GetGuid());
        Assert.Equal("Staging", rows[requestId].GetProperty("stage").GetString());
        Assert.True(rows[requestId].GetProperty("isMine").GetBoolean());
        Assert.Equal("New", rows[untouchedId].GetProperty("stage").GetString());
        Assert.False(rows[untouchedId].GetProperty("isMine").GetBoolean());
    }

    private static async Task<StudioFactory> CreateSeededFactoryAsync()
    {
        var factory = await CreateFactoryAsync();
        using var scope = factory.Services.CreateScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        platform.Users.AddRange(
            new AppUser { Id = DeveloperId, Email = "dev@test.local", DisplayName = "Dev" },
            new AppUser { Id = NoneId, Email = "none@test.local", DisplayName = "None" });
        platform.TenantMemberships.AddRange(
            new TenantMembership { TenantId = TenantId, UserId = DeveloperId, Role = "TenantUser" },
            new TenantMembership { TenantId = TenantId, UserId = NoneId, Role = "TenantUser", StudioRole = "None" });
        await platform.SaveChangesAsync();
        var studio = scope.ServiceProvider.GetRequiredService<AIStudioDbContext>();
        var project = new DevelopmentProject { TenantId = TenantId, CreatedByUserId = AdminId, Name = "Guarded project", RepositoryUrl = "https://example.test/repo" };
        studio.DevelopmentProjects.Add(project);
        studio.DevelopmentProjectAccesses.Add(new DevelopmentProjectAccess
        {
            TenantId = TenantId, ProjectId = project.Id, UserId = DeveloperId, AccessLevel = "Contributor", GrantedByUserId = AdminId
        });
        await studio.SaveChangesAsync();
        return factory;
    }
}
