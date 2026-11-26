using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class TenantCustomPageRevisionBatchTests
{
    [Fact]
    public async Task Revision_stores_migration_batch()
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var tenantId = Guid.NewGuid();
        var withBatch = new TenantCustomPageRevision { TenantId = tenantId, CustomPageId = Guid.NewGuid(), Revision = 1, Code = "a", Name = "A", MigrationBatch = "batch-2026-11-26" };
        var withoutBatch = new TenantCustomPageRevision { TenantId = tenantId, CustomPageId = Guid.NewGuid(), Revision = 1, Code = "b", Name = "B" };
        await using (var db = new TenantDbContext(options))
        {
            db.TenantCustomPageRevisions.AddRange(withBatch, withoutBatch);
            await db.SaveChangesAsync();
        }

        await using var read = new TenantDbContext(options);
        Assert.Equal("batch-2026-11-26", (await read.TenantCustomPageRevisions.SingleAsync(x => x.Id == withBatch.Id)).MigrationBatch);
        Assert.Null((await read.TenantCustomPageRevisions.SingleAsync(x => x.Id == withoutBatch.Id)).MigrationBatch);

        var entity = read.Model.FindEntityType(typeof(TenantCustomPageRevision))!;
        Assert.Equal(64, entity.FindProperty(nameof(TenantCustomPageRevision.MigrationBatch))!.GetMaxLength());
        Assert.Contains(entity.GetIndexes(), i => i.Properties.Select(p => p.Name).SequenceEqual(new[] { "TenantId", "MigrationBatch" }));
    }
}
