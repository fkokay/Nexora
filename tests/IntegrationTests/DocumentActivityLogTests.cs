using AIERP.Api;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class DocumentActivityLogTests
{
    [Fact]
    public async Task Add_then_read_returns_rows_oldest_first_and_tenant_scoped()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("activity-a");
        var other = await factory.SeedAsync("activity-b");
        var documentId = Guid.NewGuid();
        await factory.WithTenantDbAsync(async db =>
        {
            DocumentActivityLog.Add(db, seed.TenantId, "satis.siparis", documentId, "onayla", "Kontroller", "core", "done", null, seed.AdminUserId);
            await db.SaveChangesAsync();
            DocumentActivityLog.Add(db, seed.TenantId, "satis.siparis", documentId, "onayla", "Onaylandı", "core", "done",
                new string('x', 600), seed.AdminUserId);
            DocumentActivityLog.Add(db, other.TenantId, "satis.siparis", documentId, "iptal", "Başka firma", "core", "done", null, null);
            await db.SaveChangesAsync();
        });

        var rows = await factory.WithTenantDbAsync(db =>
            DocumentActivityLog.ReadAsync(db, seed.TenantId, "satis.siparis", documentId, CancellationToken.None));

        Assert.Equal(["Kontroller", "Onaylandı"], rows.Select(x => x.Step).ToArray());
        Assert.Equal(500, rows[1].Message!.Length);
        Assert.All(rows, x => Assert.Equal("core", x.Source));
    }
}
