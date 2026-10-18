using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace AIERP.Platform.UnitTests;

public sealed class MigrationDataSafetyTests
{
    [Fact]
    public void Sales_invoice_custom_field_migration_checks_legacy_values_before_dropping_columns()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseSqlServer("Server=localhost;Database=AIERPPlatform;User Id=test;Password=test;TrustServerCertificate=True")
            .Options;
        using var db = new PlatformDbContext(options);
        var script = db.GetService<IMigrator>().GenerateScript(
            toMigration: "20261015180928_FixSalesInvoiceCustomFieldRelationships",
            options: MigrationsSqlGenerationOptions.Idempotent);

        var guard = script.IndexOf("THROW 51003", StringComparison.OrdinalIgnoreCase);
        var firstDrop = script.IndexOf("DROP COLUMN [SalesInvoiceId]", StringComparison.OrdinalIgnoreCase);

        Assert.True(guard >= 0, "The migration SQL must stop if either table contains a differing legacy invoice reference.");
        Assert.True(firstDrop > guard, "The data check must run before either legacy column is dropped.");
        Assert.Contains("SalesInvoiceCustomFieldValues", script);
        Assert.Contains("SalesInvoiceCustomFieldValueRevisions", script);
        Assert.Contains("[SalesInvoiceId] <> [InvoiceId]", script);
    }
}
