using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class SqlServerAccessControlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Access_control_get_endpoints_project_sql_fields_and_scope_tenant_data()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantAId = Guid.NewGuid();
        var tenantBId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var memberAId = Guid.NewGuid();
        var memberBId = Guid.NewGuid();
        var databaseName = $"AIERP_AccessControl_{Guid.NewGuid():N}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(connectionString).Options;
        await using var seedDb = new PlatformDbContext(options);
        var databaseCreated = false;
        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);

            var tenantA = new Tenant { Id = tenantAId, Name = "Access tenant A", Slug = $"access-a-{tenantAId:N}", IsActive = true };
            var tenantB = new Tenant { Id = tenantBId, Name = "Access tenant B", Slug = $"access-b-{tenantBId:N}", IsActive = true };
            var admin = User(adminId, "admin-a@example.invalid", "Access Admin");
            var memberA = User(memberAId, "member-a@example.invalid", "Aardvark Member");
            var memberB = User(memberBId, "member-b@example.invalid", "Other Tenant Member");
            seedDb.Tenants.AddRange(tenantA, tenantB);
            seedDb.Users.AddRange(admin, memberA, memberB);
            seedDb.TenantMemberships.AddRange(
                new TenantMembership { TenantId = tenantAId, Tenant = tenantA, UserId = adminId, User = admin, Role = "TenantAdmin" },
                new TenantMembership { TenantId = tenantAId, Tenant = tenantA, UserId = memberAId, User = memberA, Role = "TenantUser" },
                new TenantMembership { TenantId = tenantBId, Tenant = tenantB, UserId = memberBId, User = memberB, Role = "TenantUser" });
            var manufacturingRead = await seedDb.PermissionDefinitions.SingleAsync(x => x.Code == "erp.manufacturing.read");
            seedDb.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = tenantBId,
                Tenant = tenantB,
                SubjectType = TenantPermissionSubjectType.Role,
                SubjectRole = "TenantUser",
                PermissionCode = manufacturingRead.Code,
                Permission = manufacturingRead,
                Effect = TenantPermissionEffect.Deny
            });
            await seedDb.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<PlatformDbContext>(db => db.UseSqlServer(connectionString));
            builder.Services.AddAuthentication("access-control-test")
                .AddScheme<AuthenticationSchemeOptions, TenantAdminAuthenticationHandler>("access-control-test", _ => { });
            builder.Services.AddAuthorization(options => options.DefaultPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser().Build());
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapAccessControlEndpoints();
            await app.StartAsync();

            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-User", adminId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantAId.ToString("D"));
            using var response = await client.GetAsync("/api/access-control/members");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var members = await response.Content.ReadFromJsonAsync<TenantPermissionMemberView[]>();
            Assert.NotNull(members);
            Assert.Collection(members.OrderBy(x => x.DisplayName),
                member =>
                {
                    Assert.Equal(memberAId, member.UserId);
                    Assert.Equal("Aardvark Member", member.DisplayName);
                    Assert.Equal("TenantUser", member.Role);
                },
                member =>
                {
                    Assert.Equal(adminId, member.UserId);
                    Assert.Equal("Access Admin", member.DisplayName);
                    Assert.Equal("TenantAdmin", member.Role);
                });
            Assert.DoesNotContain(members, member => member.UserId == memberBId);

            using var permissionsResponse = await client.GetAsync("/api/access-control/permissions");
            Assert.Equal(HttpStatusCode.OK, permissionsResponse.StatusCode);
            var permissions = await permissionsResponse.Content.ReadFromJsonAsync<PlatformPermissionDefinition[]>();
            Assert.NotNull(permissions);
            Assert.Contains(permissions, permission => permission.Code == "erp.manufacturing.read");

            using var rulesResponse = await client.GetAsync("/api/access-control/rules");
            Assert.Equal(HttpStatusCode.OK, rulesResponse.StatusCode);
            var rules = await rulesResponse.Content.ReadFromJsonAsync<TenantPermissionRuleView[]>();
            Assert.NotNull(rules);
            Assert.Empty(rules);
            Assert.Equal(1, await seedDb.TenantPermissionRules.CountAsync(x => x.TenantId == tenantBId));
        }
        finally
        {
            if (databaseCreated) await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static AppUser User(Guid id, string email, string displayName) => new()
    {
        Id = id,
        Email = email,
        DisplayName = displayName,
        PasswordHash = "not-used",
        IsActive = true
    };

    private sealed class TenantAdminAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new[]
            {
                new Claim("sub", Request.Headers["X-Test-User"].ToString()),
                new Claim("tenant_id", Request.Headers["X-Test-Tenant"].ToString()),
                new Claim("role", "TenantAdmin")
            };
            var identity = new ClaimsIdentity(claims, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
