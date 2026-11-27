using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// The system-page CHECK constraint and the per-code draft index against a migrated tenant database. Runs only when
/// AIERP_REPORT_TEST_SQL_CONNECTION_STRING points at a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class SystemPageStorageSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Check_constraint_rejects_mismatched_code()
    {
        await using var database = await MigratedTenantDatabase.CreateAsync();
        var tenantId = database.TenantId;

        await using (var db = database.Context())
        {
            db.TenantCustomPages.Add(Page(tenantId, "@inventory-warehouses", "inventory-warehouses", 1));
            await db.SaveChangesAsync();
        }
        await AssertCheckViolationAsync(database, Page(tenantId, "@customer-accounts", "inventory-warehouses", 1));
        await AssertCheckViolationAsync(database, Page(tenantId, "inventory-warehouses", "inventory-warehouses", 1));
        await AssertCheckViolationAsync(database, Page(tenantId, "@inventory-warehouses", "inventory-warehouses", null, archived: true));
        await AssertCheckViolationAsync(database, Page(tenantId, "@inventory-warehouses", "inventory-warehouses", 0, archived: true));

        // Ordinary custom pages are unaffected.
        await using (var db = database.Context())
        {
            db.TenantCustomPages.Add(Page(tenantId, "musteri-panosu", null, null));
            await db.SaveChangesAsync();
            Assert.Equal(2, await db.TenantCustomPages.CountAsync(x => x.TenantId == tenantId));
        }
    }

    [SqlServerAcceptanceFact]
    public async Task Second_open_draft_for_same_screen_key_is_rejected()
    {
        await using var database = await MigratedTenantDatabase.CreateAsync();
        var tenantId = database.TenantId;
        await using (var db = database.Context())
        {
            db.TenantCustomPages.AddRange(
                Page(tenantId, "@inventory-warehouses", "inventory-warehouses", 1),
                Page(tenantId, "@inventory-warehouses", "inventory-warehouses", 1, published: true),
                Page(tenantId, "@inventory-warehouses", "inventory-warehouses", 1, archived: true));
            await db.SaveChangesAsync();
        }

        await using var second = database.Context();
        second.TenantCustomPages.Add(Page(tenantId, "@inventory-warehouses", "inventory-warehouses", 2));
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => second.SaveChangesAsync());
        Assert.True(CustomPageAccessEndpoints.IsConflict(exception));
    }

    /// <summary>Two readers of an old copy at once: the required updates are written once (serializable read, unique revision index).</summary>
    [SqlServerAcceptanceFact]
    public async Task Concurrent_readers_apply_required_updates_once()
    {
        await using var database = await MigratedTenantDatabase.CreateAsync();
        var tenantId = database.TenantId;
        var copy = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "SystemPageCopies", "sales-orders-v2.json"));
        Guid pageId;
        await using (var db = database.Context())
        {
            var page = Page(tenantId, "@sales-orders", "sales-orders", 2, published: true);
            page.DefinitionJson = copy;
            db.TenantCustomPages.Add(page);
            db.TenantCustomPageRevisions.Add(TenantCustomPageEndpoints.RevisionOf(page, page.CreatedByUserId, "CreatedFromStandard"));
            await db.SaveChangesAsync();
            pageId = page.Id;
        }
        Assert.True(SystemPageStandards.TryGet("sales-orders", out var standard));

        await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
        {
            await using var db = database.Context();
            await SystemPageEndpoints.ApplyRequiredUpdatesAsync(db, tenantId, standard, CancellationToken.None);
        }));

        await using var check = database.Context();
        var stored = await check.TenantCustomPages.AsNoTracking().SingleAsync(x => x.Id == pageId);
        Assert.Equal(4, stored.Revision);
        Assert.Equal(["CreatedFromStandard", "Update:zincir", "Update:rozet", "Update:etiket"], await check.TenantCustomPageRevisions.AsNoTracking()
            .Where(x => x.CustomPageId == pageId).OrderBy(x => x.Revision).Select(x => x.ChangeKind).ToListAsync());
        Assert.Equal(3, await check.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "system-page.standard-updated"));
    }

    private static async Task AssertCheckViolationAsync(MigratedTenantDatabase database, TenantCustomPage page)
    {
        await using var db = database.Context();
        db.TenantCustomPages.Add(page);
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        var sql = Assert.IsType<SqlException>(exception.GetBaseException());
        Assert.Equal(547, sql.Number);
        Assert.Contains("CK_TenantCustomPages_ScreenKey", sql.Message, StringComparison.Ordinal);
    }

    private static TenantCustomPage Page(Guid tenantId, string code, string? screenKey, int? standardVersion,
        bool published = false, bool archived = false)
    {
        var now = DateTimeOffset.UtcNow;
        return new TenantCustomPage
        {
            TenantId = tenantId, Code = code, ScreenKey = screenKey, StandardVersion = standardVersion, Name = "Depo Yönetimi",
            DefinitionJson = "{\"schemaVersion\":1,\"components\":[]}", Revision = 1, IsPublished = published, IsArchived = archived,
            CreatedByUserId = Guid.NewGuid(), UpdatedByUserId = Guid.NewGuid(), CreatedAt = now, UpdatedAt = now
        };
    }

    private sealed class MigratedTenantDatabase : IAsyncDisposable
    {
        private readonly DbContextOptions<TenantDbContext> _options;
        private MigratedTenantDatabase(DbContextOptions<TenantDbContext> options, Guid tenantId) { _options = options; TenantId = tenantId; }
        public Guid TenantId { get; }
        public TenantDbContext Context() => new(_options);

        public static async Task<MigratedTenantDatabase> CreateAsync()
        {
            var configured = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
            Assert.False(string.IsNullOrWhiteSpace(configured));
            var connectionString = new SqlConnectionStringBuilder(configured)
            {
                InitialCatalog = $"AIERP_SystemPageStorageAcceptance_{Guid.NewGuid():N}",
                ConnectTimeout = 15,
                TrustServerCertificate = true
            }.ConnectionString;
            var database = new MigratedTenantDatabase(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options, Guid.NewGuid());
            try
            {
                await using var db = database.Context();
                // The migrations themselves (not EnsureCreated) must produce the constraint and the index.
                await db.Database.MigrateAsync();
                db.Tenants.Add(new Tenant { Id = database.TenantId, Name = "Synthetic system pages", Slug = $"system-pages-{database.TenantId:N}" });
                await db.SaveChangesAsync();
                return database;
            }
            catch
            {
                await database.DisposeAsync();
                throw;
            }
        }

        public async ValueTask DisposeAsync()
        {
            await using var db = Context();
            await db.Database.EnsureDeletedAsync();
        }
    }
}
