using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Belge kuralları PR 1, task 5: the order status follows its posted deliveries and their invoices. The delivery, invoice and void
/// endpoints lock rows with SQL Server hints, so this exercises <see cref="SalesOrderStatusDeriver"/> on the data they leave behind;
/// the endpoints themselves are covered by <c>SalesOrderStateChainSqlAcceptanceTests</c>.
/// </summary>
public sealed class SalesOrderStatusDerivationTests
{
    private static async Task<SalesOrderStatus> RecomputeAsync(SalesOrderApiFactory factory, Guid orderId) =>
        await factory.WithTenantDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(x => x.Id == orderId);
            await SalesOrderStatusDeriver.RecomputeAsync(db, order, null, CancellationToken.None);
            await db.SaveChangesAsync();
            return order.Status;
        });

    private static Task<Guid> DeliverAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, Guid orderId, decimal quantity,
        SalesDeliveryStatus status = SalesDeliveryStatus.Posted) =>
        factory.WithTenantDbAsync(async db =>
        {
            var delivery = new SalesDelivery { TenantId = seed.TenantId, OrderId = orderId, WarehouseId = seed.WarehouseId, Code = $"IRS-{Guid.NewGuid():N}"[..12],
                DeliveryDate = new DateOnly(2026, 11, 3), RequestId = Guid.NewGuid(), Status = status };
            delivery.Lines.Add(new SalesDeliveryLine { TenantId = seed.TenantId, Delivery = delivery, OrderId = orderId, OrderLineNumber = 1,
                StockItemId = seed.StockItemId, Quantity = quantity });
            db.SalesDeliveries.Add(delivery);
            await db.SaveChangesAsync();
            return delivery.Id;
        });

    private static Task<Guid> InvoiceAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, Guid orderId, Guid deliveryId,
        SalesInvoiceStatus status = SalesInvoiceStatus.Posted) =>
        factory.WithTenantDbAsync(async db =>
        {
            var invoice = new SalesInvoice { TenantId = seed.TenantId, DeliveryId = deliveryId, OrderId = orderId, CustomerId = seed.CustomerId,
                Code = $"FTR-{Guid.NewGuid():N}"[..12], InvoiceDate = new DateOnly(2026, 11, 4), CurrencyCode = "TRY", Status = status };
            db.SalesInvoices.Add(invoice);
            await db.SaveChangesAsync();
            return invoice.Id;
        });

    [Fact]
    public async Task Partial_delivery_keeps_approved()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open, quantity: 4m);
        await DeliverAsync(factory, seed, orderId, 3m);

        Assert.Equal(SalesOrderStatus.Open, await RecomputeAsync(factory, orderId));
    }

    [Fact]
    public async Task Full_delivery_moves_to_shipped_and_logs()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open, quantity: 4m);
        await DeliverAsync(factory, seed, orderId, 1m);
        await DeliverAsync(factory, seed, orderId, 3m);
        await DeliverAsync(factory, seed, orderId, 9m, SalesDeliveryStatus.Voided);

        Assert.Equal(SalesOrderStatus.Fulfilled, await RecomputeAsync(factory, orderId));
        Assert.True(await factory.WithTenantDbAsync(db => db.TenantDocumentActivities.AnyAsync(x => x.DocumentId == orderId && x.Step == "Sevk edildi")));
    }

    [Fact]
    public async Task Invoicing_every_posted_delivery_moves_to_invoiced()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Fulfilled, quantity: 4m);
        var first = await DeliverAsync(factory, seed, orderId, 1m);
        var second = await DeliverAsync(factory, seed, orderId, 3m);
        await InvoiceAsync(factory, seed, orderId, first);

        Assert.Equal(SalesOrderStatus.Fulfilled, await RecomputeAsync(factory, orderId));

        await InvoiceAsync(factory, seed, orderId, second);
        Assert.Equal(SalesOrderStatus.Invoiced, await RecomputeAsync(factory, orderId));
    }

    [Fact]
    public async Task Invoice_void_then_delivery_void_steps_back_to_approved()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Invoiced, quantity: 4m);
        var delivery = await DeliverAsync(factory, seed, orderId, 4m);
        var invoice = await InvoiceAsync(factory, seed, orderId, delivery);
        Assert.Equal(SalesOrderStatus.Invoiced, await RecomputeAsync(factory, orderId));

        await factory.WithTenantDbAsync(async db =>
        {
            (await db.SalesInvoices.SingleAsync(x => x.Id == invoice)).Status = SalesInvoiceStatus.Voided;
            await db.SaveChangesAsync();
        });
        Assert.Equal(SalesOrderStatus.Fulfilled, await RecomputeAsync(factory, orderId));

        await factory.WithTenantDbAsync(async db =>
        {
            (await db.SalesDeliveries.SingleAsync(x => x.Id == delivery)).Status = SalesDeliveryStatus.Voided;
            await db.SaveChangesAsync();
        });
        Assert.Equal(SalesOrderStatus.Open, await RecomputeAsync(factory, orderId));
    }

    [Fact]
    public async Task Cancelled_order_is_not_rederived()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Cancelled, quantity: 4m);
        await DeliverAsync(factory, seed, orderId, 4m);

        Assert.Equal(SalesOrderStatus.Cancelled, await RecomputeAsync(factory, orderId));
    }
}
