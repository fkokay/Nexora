using Xunit;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

namespace AIERP.Api.IntegrationTests;

public sealed class TenantCatalogReleaseModelTests
{
    [Fact]
    public void Model_maps_catalog_release_with_active_filter_index()
    {
        using var db = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>()
            .UseSqlServer("Server=.;Database=ModelOnly;Integrated Security=true;TrustServerCertificate=true").Options);
        var entity = db.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(TenantCatalogRelease))!;
        Assert.NotNull(entity);

        var version = Assert.Single(entity.GetIndexes(), x => x.Properties.Select(p => p.Name).SequenceEqual(["TenantId", "Version"]));
        Assert.True(version.IsUnique);

        var active = Assert.Single(entity.GetIndexes(), x => x.GetDatabaseName() == "IX_TenantCatalogReleases_Active");
        Assert.True(active.IsUnique);
        Assert.Equal(["TenantId"], active.Properties.Select(p => p.Name));
        Assert.Equal("[Status] = 'Active'", active.GetFilter());

        var rowVersion = entity.FindProperty(nameof(TenantCatalogRelease.RowVersion))!;
        Assert.True(rowVersion.IsConcurrencyToken);
        Assert.Equal(ValueGenerated.OnAddOrUpdate, rowVersion.ValueGenerated);
    }
}
