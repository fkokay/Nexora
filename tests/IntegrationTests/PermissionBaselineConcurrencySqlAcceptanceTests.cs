using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using AIERP.Platform.Infrastructure.Migrations.Platform;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Concurrent login backfills of the role baseline against a real SQL Server: the filtered unique index
/// <see cref="TenantPermissionDefaults.UnconditionalRoleRuleIndexName"/> stops the second insert, the loser re-reads and
/// returns quietly, and the <see cref="DeduplicateUnconditionalRoleRules"/> migration removes only true duplicates.
/// Skipped without AIERP_REPORT_TEST_SQL_CONNECTION_STRING (a disposable SQL Server).
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class PermissionBaselineConcurrencySqlAcceptanceTests
{
    private const string SeededAction = "permission.baseline.seeded";

    [SqlServerAcceptanceFact]
    public async Task Parallel_backfills_insert_the_baseline_once_with_one_audit_event()
    {
        await using var database = await DatabaseAsync();
        for (var round = 0; round < 5; round++)
        {
            var tenantId = await SeedTenantAsync(database);
            var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
            {
                await using var db = database.Create();
                return await TenantPermissionDefaults.AddMissingRoleBaselineAsync(db, tenantId, "TenantDeveloper", Guid.NewGuid());
            }));

            await using var verify = database.Create();
            var rules = await verify.TenantPermissionRules.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.SubjectRole == "TenantDeveloper").ToListAsync();
            Assert.NotEmpty(rules);
            Assert.Equal(rules.Count, rules.Select(x => x.PermissionCode).Distinct().Count());
            Assert.Equal(rules.Count, results.Sum());
            var seeded = await verify.AuditEvents.AsNoTracking().Where(x => x.TenantId == tenantId && x.Action == SeededAction).ToListAsync();
            Assert.Equal(results.Count(x => x > 0), seeded.Count);
        }
    }

    [SqlServerAcceptanceFact]
    public async Task Backfill_that_loses_the_race_returns_zero_without_error_or_audit()
    {
        await using var database = await DatabaseAsync();
        var tenantId = await SeedTenantAsync(database);
        var winner = Guid.NewGuid();
        var loser = Guid.NewGuid();
        var interceptor = new RunOnceBeforeSaveInterceptor(async () =>
        {
            // Another login seeds the same tenant and role between the loser's read and its insert.
            await using var other = database.Create();
            Assert.True(await TenantPermissionDefaults.AddMissingRoleBaselineAsync(other, tenantId, "TenantUser", winner) > 0);
        });

        await using (var db = database.Create(interceptor))
        {
            Assert.Equal(0, await TenantPermissionDefaults.AddMissingRoleBaselineAsync(db, tenantId, "TenantUser", loser));
            Assert.True(interceptor.Ran);
            Assert.False(db.ChangeTracker.HasChanges());
            // The context stays usable for the caller's own save (refresh session, tenant.selected audit).
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = loser, Action = "tenant.selected", Resource = "x" });
            await db.SaveChangesAsync();
        }

        await using var verify = database.Create();
        var codes = await verify.TenantPermissionRules.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SubjectRole == "TenantUser").Select(x => x.PermissionCode).ToListAsync();
        Assert.NotEmpty(codes);
        Assert.Equal(codes.Count, codes.Distinct().Count());
        var seeded = Assert.Single(await verify.AuditEvents.AsNoTracking().Where(x => x.TenantId == tenantId && x.Action == SeededAction).ToListAsync());
        Assert.Equal(winner, seeded.UserId);
        Assert.Equal($"TenantUser:added={codes.Count}", seeded.Resource);
    }

    [SqlServerAcceptanceFact]
    public async Task Backfill_that_loses_part_of_the_race_inserts_only_what_is_still_missing()
    {
        await using var database = await DatabaseAsync();
        var tenantId = await SeedTenantAsync(database);
        var interceptor = new RunOnceBeforeSaveInterceptor(async () =>
        {
            // Another writer adds one baseline permission (as a role Allow) after the read.
            await using var other = database.Create();
            other.TenantPermissionRules.Add(Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow));
            await other.SaveChangesAsync();
        });

        int added;
        await using (var db = database.Create(interceptor))
            added = await TenantPermissionDefaults.AddMissingRoleBaselineAsync(db, tenantId, "TenantUser", Guid.NewGuid());

        await using var verify = database.Create();
        var codes = await verify.TenantPermissionRules.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SubjectRole == "TenantUser").Select(x => x.PermissionCode).ToListAsync();
        Assert.Equal(codes.Count, codes.Distinct().Count());
        Assert.Equal(codes.Count - 1, added);
        var seeded = Assert.Single(await verify.AuditEvents.AsNoTracking().Where(x => x.TenantId == tenantId && x.Action == SeededAction).ToListAsync());
        Assert.Equal($"TenantUser:added={added}", seeded.Resource);
    }

    [SqlServerAcceptanceFact]
    public async Task Migration_deletes_only_exact_duplicate_unconditional_role_rules_and_keeps_the_oldest()
    {
        await using var database = await DatabaseAsync();
        var tenantId = await SeedTenantAsync(database);
        var otherTenantId = await SeedTenantAsync(database);
        var userId = Guid.NewGuid();
        await using (var db = database.Create())
        {
            // Simulate the pre-index schema, where concurrent logins could insert the same baseline rule twice.
            await db.Database.ExecuteSqlRawAsync(
                $"DROP INDEX [{TenantPermissionDefaults.UnconditionalRoleRuleIndexName}] ON [dbo].[TenantPermissionRules];");
            db.Users.Add(new AppUser { Id = userId, Email = $"dedupe-{userId:N}@example.invalid", DisplayName = "Dedupe" });
            db.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = userId, Role = "TenantUser" });
            await db.SaveChangesAsync();
        }

        var t0 = new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero);
        var oldest = Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0);
        var rules = new[]
        {
            oldest,
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(1)),
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(2), resourceType: "erp.manufacturing"),
            // Differs in Effect / IsActive / attribute / subject / role / tenant: never a duplicate of the Allow above.
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Deny, t0.AddSeconds(3)),
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(4), isActive: false),
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(5), attribute: true),
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(6), attribute: true),
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(7), userId: userId),
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(8), userId: userId),
            Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(9), role: "TenantDeveloper"),
            Rule(otherTenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(10)),
            // Duplicated Deny: exactly one survives.
            Rule(tenantId, "erp.manufacturing.create", TenantPermissionEffect.Deny, t0.AddSeconds(11)),
            Rule(tenantId, "erp.manufacturing.create", TenantPermissionEffect.Deny, t0.AddSeconds(12)),
        };
        var deletedIds = new[] { rules[1].Id, rules[2].Id, rules[12].Id };
        await using (var db = database.Create())
        {
            db.TenantPermissionRules.AddRange(rules);
            await db.SaveChangesAsync();
        }

        await using (var db = database.Create())
        {
            var migration = new DeduplicateUnconditionalRoleRules();
            var commands = db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model);
            foreach (var command in commands) await db.Database.ExecuteSqlRawAsync(command.CommandText);
        }

        await using var verify = database.Create();
        var remaining = await verify.TenantPermissionRules.AsNoTracking().Where(x => x.TenantId == tenantId || x.TenantId == otherTenantId)
            .Select(x => x.Id).ToListAsync();
        Assert.Equal(rules.Select(x => x.Id).Except(deletedIds).OrderBy(x => x), remaining.OrderBy(x => x));
        Assert.Contains(oldest.Id, remaining);
        // The index now exists again and rejects a new duplicate.
        verify.TenantPermissionRules.Add(Rule(tenantId, "erp.manufacturing.read", TenantPermissionEffect.Allow, t0.AddSeconds(20)));
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => verify.SaveChangesAsync());
        Assert.True(TenantPermissionDefaults.IsUniqueViolation(exception));
    }

    private static TenantPermissionRule Rule(Guid tenantId, string code, TenantPermissionEffect effect, DateTimeOffset? createdAt = null,
        bool isActive = true, bool attribute = false, Guid? userId = null, string role = "TenantUser", string? resourceType = null) => new()
    {
        TenantId = tenantId,
        SubjectType = userId is null ? TenantPermissionSubjectType.Role : TenantPermissionSubjectType.User,
        SubjectRole = userId is null ? role : null,
        SubjectUserId = userId,
        PermissionCode = code,
        Effect = effect,
        ResourceType = resourceType,
        AttributeName = attribute ? "resource.type" : null,
        AttributeOperator = attribute ? TenantPermissionConditionOperator.Equals : null,
        AttributeValue = attribute ? "erp.manufacturing" : null,
        IsActive = isActive,
        CreatedAt = createdAt ?? DateTimeOffset.UtcNow
    };

    private static async Task<Guid> SeedTenantAsync(Database database)
    {
        var tenantId = Guid.NewGuid();
        await using var db = database.Create();
        db.Tenants.Add(new Tenant { Id = tenantId, Name = "Baseline race", Slug = $"baseline-race-{tenantId:N}", IsActive = true });
        await db.SaveChangesAsync();
        return tenantId;
    }

    private static async Task<Database> DatabaseAsync()
    {
        var connectionString = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING"))
        {
            InitialCatalog = $"AIERP_BaselineRace_{Guid.NewGuid():N}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var database = new Database(connectionString);
        await using var db = database.Create();
        Assert.True(await db.Database.EnsureCreatedAsync());
        return database;
    }

    private sealed class Database(string connectionString) : IAsyncDisposable
    {
        public PlatformDbContext Create(IInterceptor? interceptor = null)
        {
            var builder = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(connectionString);
            if (interceptor is not null) builder.AddInterceptors(interceptor);
            return new PlatformDbContext(builder.Options);
        }

        public async ValueTask DisposeAsync()
        {
            SqlConnection.ClearAllPools();
            await using var db = Create();
            await db.Database.EnsureDeletedAsync();
        }
    }

    /// <summary>Runs <paramref name="action"/> once, right before the first SaveChanges of the context it is attached to.</summary>
    private sealed class RunOnceBeforeSaveInterceptor(Func<Task> action) : SaveChangesInterceptor
    {
        public bool Ran { get; private set; }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (!Ran)
            {
                Ran = true;
                await action();
            }
            return result;
        }
    }
}
