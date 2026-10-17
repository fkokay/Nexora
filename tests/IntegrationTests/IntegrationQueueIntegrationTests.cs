using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class IntegrationQueueIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Integration_requests_are_encrypted_idempotent_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        client.DefaultRequestHeaders.Add("Idempotency-Key", "purchase-123-attempt-1");
        var payload = new { payload = new { supplierCode = "SUP-1", note = "private integration content" } };

        var accepted = await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload);

        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);
        var acceptedBody = await accepted.Content.ReadFromJsonAsync<JsonElement>();
        var operationId = acceptedBody.GetProperty("operationId").GetGuid();
        Assert.Equal("Queued", acceptedBody.GetProperty("status").GetString());

        var repeated = await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload);
        Assert.Equal(HttpStatusCode.Accepted, repeated.StatusCode);
        Assert.Equal(operationId, (await repeated.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/integrations/netsis/execute",
            new { payload = new { supplierCode = "SUP-2" } })).StatusCode);

        var status = await client.GetFromJsonAsync<JsonElement>($"/api/integrations/operations/{operationId:D}");
        Assert.Equal("Queued", status.GetProperty("status").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/integrations/operations/{operationId:D}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload)).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString("D"));
        var tenantBSubmission = await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload);
        Assert.Equal(HttpStatusCode.Accepted, tenantBSubmission.StatusCode);
        var tenantBOperationId = (await tenantBSubmission.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid();
        Assert.NotEqual(operationId, tenantBOperationId);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/integrations/operations/{operationId:D}")).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var stored = await db.IntegrationOperations.SingleAsync(x => x.Id == operationId);
        Assert.Equal(2, await db.IntegrationOperations.CountAsync());
        Assert.DoesNotContain("private integration content", stored.EncryptedPayload, StringComparison.Ordinal);
        Assert.DoesNotContain("purchase-123-attempt-1", stored.IdempotencyKeyHash, StringComparison.Ordinal);
        Assert.Equal(TenantA, stored.TenantId);
        Assert.Equal("Queued", stored.Status);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"integration-queue-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["IntegrationQueue:EncryptionKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("integration-execute", limiter =>
        {
            limiter.PermitLimit = 6;
            limiter.Window = TimeSpan.FromSeconds(10);
            limiter.QueueLimit = 0;
        }));

        var app = builder.Build();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapIntegrationExecutionApi();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        return app;
    }
}
