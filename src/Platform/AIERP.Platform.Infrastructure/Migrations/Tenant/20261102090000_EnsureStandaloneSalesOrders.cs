using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace AIERP.Platform.Infrastructure.Migrations.Tenant;

[DbContext(typeof(TenantDbContext))]
[Migration("20261102090000_EnsureStandaloneSalesOrders")]
public sealed class EnsureStandaloneSalesOrders : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.SalesOrders') AND name = N'QuoteId' AND is_nullable = 0)
        BEGIN
            DROP INDEX [IX_SalesOrders_TenantId_QuoteId] ON [dbo].[SalesOrders];
            ALTER TABLE [dbo].[SalesOrders] ALTER COLUMN [QuoteId] uniqueidentifier NULL;
            CREATE UNIQUE INDEX [IX_SalesOrders_TenantId_QuoteId]
                ON [dbo].[SalesOrders] ([TenantId], [QuoteId]) WHERE [QuoteId] IS NOT NULL;
        END;
        """);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        IF EXISTS (SELECT 1 FROM [dbo].[SalesOrders] WHERE [QuoteId] IS NULL)
            THROW 51000, 'Cannot require a quote while standalone sales orders exist.', 1;
        DROP INDEX [IX_SalesOrders_TenantId_QuoteId] ON [dbo].[SalesOrders];
        ALTER TABLE [dbo].[SalesOrders] ALTER COLUMN [QuoteId] uniqueidentifier NOT NULL;
        CREATE UNIQUE INDEX [IX_SalesOrders_TenantId_QuoteId] ON [dbo].[SalesOrders] ([TenantId], [QuoteId]);
        """);
}
