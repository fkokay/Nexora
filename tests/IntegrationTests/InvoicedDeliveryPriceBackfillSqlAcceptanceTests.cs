using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// The BackfillInvoicedDeliveryLinePrices migrations on SQL Server: the real <c>EXEC(N'...')</c> UPDATEs run against a disposable
/// Platform / Tenant database and must price exactly the lines the invoice endpoints price today
/// (<see cref="DeliveryLinePricing.FromInvoiceLinePrice"/>). Skipped without a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class InvoicedDeliveryPriceBackfillSqlAcceptanceTests
{
    private sealed record Seeded(SalesDelivery Wholesale, SalesDelivery Retail, SalesDelivery Voided, SalesDelivery OrderBased,
        StandaloneSalesDelivery? Standalone);

    [SqlServerAcceptanceFact]
    public async Task Tenant_backfill_prices_invoiced_orderless_and_standalone_lines_like_the_invoice_endpoints()
    {
        var tenantId = Guid.NewGuid();
        var connection = DatabaseConnection($"AIERPTenant_Backfill_{tenantId:N}");
        await using var db = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options);
        Assert.True(await db.Database.EnsureCreatedAsync());
        try
        {
            var seeded = await SeedAsync(db, tenantId, withStandalone: true);
            var ids = new[] { seeded.Wholesale.Id, seeded.Voided.Id };
            Assert.All((await DeliveryPricingViews.SalesDeliveriesAsync(db, tenantId, ids)).Values,
                summary => Assert.Equal(DeliveryLinePricing.Unpriced, summary.PricingState));

            // Twice: the backfill is idempotent (only unpriced, non-free lines are touched).
            var migration = new AIERP.Platform.Infrastructure.Migrations.Tenant.BackfillTenantInvoicedDeliveryLinePrices();
            await RunUpSqlAsync(db, migration);
            await RunUpSqlAsync(db, migration);

            db.ChangeTracker.Clear();
            await AssertSalesDeliveriesAsync(db, seeded);
            var summaries = await DeliveryPricingViews.SalesDeliveriesAsync(db, tenantId, [seeded.Wholesale.Id, seeded.Retail.Id, seeded.Voided.Id]);
            Assert.Equal(DeliveryLinePricing.Priced, summaries[seeded.Wholesale.Id].PricingState);
            Assert.Equal(DeliveryLinePricing.PartlyFree, summaries[seeded.Retail.Id].PricingState);
            Assert.Equal(DeliveryLinePricing.Unpriced, summaries[seeded.Voided.Id].PricingState);

            var standaloneLines = await db.StandaloneSalesDeliveryLines.AsNoTracking().Where(x => x.DeliveryId == seeded.Standalone!.Id)
                .OrderBy(x => x.LineNumber).ToListAsync();
            // Box of 12: base price 10 per piece ⇒ 120 per entered box; a base-unit line keeps the invoice price.
            Assert.Equal((120m, 5m, 20m), (standaloneLines[0].UnitPrice!.Value, standaloneLines[0].DiscountPercent!.Value, standaloneLines[0].VatPercent!.Value));
            Assert.Equal(DeliveryLinePricing.FromInvoiceLinePrice(10m, 20m, false, 24m, 2m), standaloneLines[0].UnitPrice);
            Assert.Equal(3.3333m, standaloneLines[1].UnitPrice);
            Assert.Equal(DeliveryLinePricing.Priced,
                (await DeliveryPricingViews.StandaloneSalesDeliveriesAsync(db, tenantId, [seeded.Standalone!.Id]))[seeded.Standalone.Id].PricingState);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [SqlServerAcceptanceFact]
    public async Task Platform_backfill_prices_invoiced_orderless_sales_delivery_lines()
    {
        var tenantId = Guid.NewGuid();
        var connection = DatabaseConnection($"AIERP_BackfillPlatform_{tenantId:N}");
        await using var db = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(connection).Options);
        Assert.True(await db.Database.EnsureCreatedAsync());
        try
        {
            var seeded = await SeedAsync(db, tenantId, withStandalone: false);
            var migration = new AIERP.Platform.Infrastructure.Migrations.Platform.BackfillInvoicedDeliveryLinePrices();
            await RunUpSqlAsync(db, migration);
            await RunUpSqlAsync(db, migration);
            db.ChangeTracker.Clear();
            await AssertSalesDeliveriesAsync(db, seeded);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    private static async Task AssertSalesDeliveriesAsync<TContext>(PlatformDbContextBase<TContext> db, Seeded seeded) where TContext : DbContext
    {
        var lines = await db.SalesDeliveryLines.AsNoTracking().ToListAsync();
        var headers = await db.SalesDeliveries.AsNoTracking().ToDictionaryAsync(x => x.Id);
        SalesDeliveryLine Line(SalesDelivery delivery, int number) => lines.Single(x => x.DeliveryId == delivery.Id && x.OrderLineNumber == number);

        // Wholesale invoice: the invoice price as is; the header takes the invoice currency.
        var wholesale = Line(seeded.Wholesale, 1);
        Assert.Equal((12.5m, 10m, 20m, false), (wholesale.UnitPrice!.Value, wholesale.DiscountPercent!.Value, wholesale.VatPercent!.Value, wholesale.IsFreeOfCharge));
        Assert.Equal("USD", headers[seeded.Wholesale.Id].CurrencyCode);
        // Retail (VAT-included) invoice: VAT is taken out, 4 decimals, away from zero, like POST /api/sales/invoices.
        Assert.Equal(100m, Line(seeded.Retail, 1).UnitPrice);
        Assert.Equal(DeliveryLinePricing.FromInvoiceLinePrice(10m, 20m, true, 1m, 1m), Line(seeded.Retail, 2).UnitPrice);
        Assert.Equal(8.3333m, Line(seeded.Retail, 2).UnitPrice);
        Assert.Equal((50m, 0m), (Line(seeded.Retail, 3).UnitPrice!.Value, Line(seeded.Retail, 3).VatPercent!.Value));
        // A free line stays free (no price); an already priced line is not overwritten.
        var free = Line(seeded.Retail, 4);
        Assert.Equal((true, (decimal?)null, (decimal?)null), (free.IsFreeOfCharge, free.UnitPrice, free.VatPercent));
        Assert.Equal((7m, 0m), (Line(seeded.Retail, 5).UnitPrice!.Value, Line(seeded.Retail, 5).DiscountPercent!.Value));
        // Voided invoice: left unpriced, header currency untouched.
        Assert.Null(Line(seeded.Voided, 1).UnitPrice);
        Assert.Null(headers[seeded.Voided.Id].CurrencyCode);
        // Order-based line: not this backfill's business (order-line backfill, or deliberately unpriced since the release).
        Assert.Null(Line(seeded.OrderBased, 1).UnitPrice);
    }

    private static async Task RunUpSqlAsync(DbContext db, Migration migration)
    {
        var operations = migration.UpOperations;
        Assert.All(operations, x => Assert.IsType<SqlOperation>(x));
        foreach (var operation in operations.Cast<SqlOperation>()) await db.Database.ExecuteSqlRawAsync(operation.Sql);
    }

    private static async Task<Seeded> SeedAsync<TContext>(PlatformDbContextBase<TContext> db, Guid tenantId, bool withStandalone) where TContext : DbContext
    {
        var tenant = new Tenant { Id = tenantId, Name = "Backfill", Slug = $"backfill-{tenantId:N}", BaseCurrencyCode = "TRY" };
        var customer = new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = "C-BF", Name = "Customer", Type = CounterpartyType.Customer, CurrencyCode = "USD" };
        var warehouse = new Warehouse { TenantId = tenantId, Tenant = tenant, Code = "WH-BF", Name = "Warehouse" };
        var item = new StockItem { TenantId = tenantId, Tenant = tenant, Code = "MAT-BF", Name = "Material", UnitCode = "EA" };
        var date = new DateOnly(2026, 11, 20);
        SalesDelivery Delivery(string code, SalesOrder? order = null) => new()
        {
            TenantId = tenantId, Tenant = tenant, RequestId = Guid.NewGuid(), Order = order, Warehouse = warehouse, Code = code, DeliveryDate = date
        };
        SalesDeliveryLine DeliveryLine(SalesDelivery delivery, int number, decimal quantity, decimal? unitPrice = null, bool free = false, SalesOrder? order = null)
        {
            var line = new SalesDeliveryLine
            {
                TenantId = tenantId, Delivery = delivery, OrderId = order?.Id, OrderLineNumber = number, StockItemId = item.Id, StockCode = item.Code,
                StockName = item.Name, Quantity = quantity, EnteredQuantity = quantity, EnteredUnitCode = "EA", UnitPrice = unitPrice,
                DiscountPercent = unitPrice is null ? null : 0m, VatPercent = unitPrice is null ? null : 20m, IsFreeOfCharge = free
            };
            delivery.Lines.Add(line);
            return line;
        }
        SalesInvoice Invoice(string code, SalesDelivery delivery, SalesInvoiceType type = SalesInvoiceType.Wholesale,
            SalesInvoiceStatus status = SalesInvoiceStatus.Posted, SalesOrder? order = null) => new()
        {
            TenantId = tenantId, Delivery = delivery, Order = order, Customer = customer, Code = code, InvoiceDate = date, CurrencyCode = "USD",
            InvoiceType = type, Status = status, GrandTotal = 1m
        };
        void InvoiceLine(SalesInvoice invoice, SalesDeliveryLine? deliveryLine, int number, decimal quantity, decimal price,
            decimal discount, decimal vat, Guid? standaloneLineId = null) => invoice.Lines.Add(new SalesInvoiceLine
        {
            TenantId = tenantId, Invoice = invoice, DeliveryLine = deliveryLine, StandaloneDeliveryLineId = standaloneLineId, OrderLineNumber = number,
            StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, Quantity = quantity, UnitPrice = price, DiscountPercent = discount,
            VatPercent = vat
        });

        var wholesale = Delivery("NXR-W");
        var wholesaleInvoice = Invoice("F-W", wholesale);
        InvoiceLine(wholesaleInvoice, DeliveryLine(wholesale, 1, 3m), 1, 3m, 12.5m, 10m, 20m);

        var retail = Delivery("NXR-R");
        var retailInvoice = Invoice("F-R", retail, SalesInvoiceType.Retail);
        InvoiceLine(retailInvoice, DeliveryLine(retail, 1, 2m), 1, 2m, 120m, 0m, 20m);
        InvoiceLine(retailInvoice, DeliveryLine(retail, 2, 1m), 2, 1m, 10m, 0m, 20m);
        InvoiceLine(retailInvoice, DeliveryLine(retail, 3, 1m), 3, 1m, 50m, 0m, 0m);
        InvoiceLine(retailInvoice, DeliveryLine(retail, 4, 1m, free: true), 4, 1m, 5m, 0m, 20m);
        InvoiceLine(retailInvoice, DeliveryLine(retail, 5, 1m, unitPrice: 7m), 5, 1m, 9m, 0m, 20m);

        var voided = Delivery("NXR-V");
        var voidedInvoice = Invoice("F-V", voided, status: SalesInvoiceStatus.Voided);
        InvoiceLine(voidedInvoice, DeliveryLine(voided, 1, 1m), 1, 1m, 40m, 0m, 20m);

        var order = new SalesOrder { TenantId = tenantId, Tenant = tenant, Customer = customer, Code = "SIP-BF", OrderDate = date, CurrencyCode = "USD" };
        order.Lines.Add(new SalesOrderLine { TenantId = tenantId, Order = order, LineNumber = 1, StockItem = item, StockCode = item.Code, StockName = item.Name,
            Quantity = 1m, UnitPrice = 30m, VatPercent = 20m });
        var orderBased = Delivery("NXR-O", order);
        var orderInvoice = Invoice("F-O", orderBased, order: order);
        InvoiceLine(orderInvoice, DeliveryLine(orderBased, 1, 1m, order: order), 1, 1m, 30m, 0m, 20m);

        db.AddRange(tenant, customer, warehouse, item, order, wholesale, retail, voided, orderBased,
            wholesaleInvoice, retailInvoice, voidedInvoice, orderInvoice);
        await db.SaveChangesAsync();
        StandaloneSalesDelivery? standalone = null;
        if (withStandalone)
        {
            standalone = new StandaloneSalesDelivery
            {
                TenantId = tenantId, RequestId = Guid.NewGuid(), Customer = customer, Warehouse = warehouse, Code = "BIRS-BF", DeliveryDate = date,
                CurrencyCode = "USD", Status = StandaloneInventoryDocumentStatus.Posted
            };
            var box = new StandaloneSalesDeliveryLine { TenantId = tenantId, Delivery = standalone, LineNumber = 1, StockItemId = item.Id,
                StockCode = item.Code, StockName = item.Name, Quantity = 24m, EnteredQuantity = 2m, EnteredUnitCode = "BOX" };
            var piece = new StandaloneSalesDeliveryLine { TenantId = tenantId, Delivery = standalone, LineNumber = 2, StockItemId = item.Id,
                StockCode = item.Code, StockName = item.Name, Quantity = 3m, EnteredQuantity = 3m, EnteredUnitCode = "EA" };
            db.AddRange(standalone, box, piece);
            await db.SaveChangesAsync();
            var standaloneInvoice = new SalesInvoice { TenantId = tenantId, StandaloneDeliveryId = standalone.Id, Customer = customer, Code = "F-S",
                InvoiceDate = date, CurrencyCode = "USD", GrandTotal = 1m };
            InvoiceLine(standaloneInvoice, null, 1, 24m, 10m, 5m, 20m, box.Id);
            InvoiceLine(standaloneInvoice, null, 2, 3m, 3.3333m, 0m, 20m, piece.Id);
            db.Add(standaloneInvoice);
            await db.SaveChangesAsync();
        }
        return new Seeded(wholesale, retail, voided, orderBased, standalone);
    }

    private static string DatabaseConnection(string database) =>
        new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING")) { InitialCatalog = database }.ConnectionString;
}
