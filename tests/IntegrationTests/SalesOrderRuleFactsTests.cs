using AIERP.Api.DocumentRules;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 3, task 2: the facts a satış siparişi Onayla rule reads.</summary>
public sealed class SalesOrderRuleFactsTests
{
    [Fact]
    public async Task Facts_carry_totals_lines_max_discount_customer_group_salesperson_and_dates()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 4m);

        var facts = await factory.WithTenantDbAsync(async db =>
        {
            var group = new CustomerGroup { TenantId = seed.TenantId, Code = "KL", Name = "Kara liste" };
            db.CustomerGroups.Add(group);
            var employee = new EmployeeRecord { TenantId = seed.TenantId, PersonnelCode = "P1", FullName = "Selin Arslan" };
            db.EmployeeRecords.Add(employee);
            var customer = await db.CustomerAccounts.SingleAsync(x => x.Id == seed.CustomerId);
            customer.GroupId = group.Id;
            var order = await db.SalesOrders.Include(x => x.Lines).SingleAsync(x => x.Id == orderId);
            order.SalespersonEmployeeId = employee.Id;
            order.RequestedDeliveryDate = new DateOnly(2026, 12, 5);
            order.DiscountTotal = 3m;
            order.Lines.Add(new SalesOrderLine
            {
                TenantId = seed.TenantId, Order = order, LineNumber = 2, StockItemId = seed.StockItem2Id, StockCode = "S2", StockName = "İkinci",
                UnitCode = "ADET", Quantity = 1m, UnitPrice = 10m, DiscountPercent = 12.5m, VatPercent = 20m, LineSubtotal = 10m, LineTotal = 12m
            });
            await db.SaveChangesAsync();
            var loaded = await db.SalesOrders.Include(x => x.Lines).SingleAsync(x => x.Id == orderId);
            return await SalesOrderRuleFacts.BuildAsync(db, seed.TenantId, loaded, CancellationToken.None);
        });

        Assert.Equal(48m, facts["grandTotal"]);
        Assert.Equal(40m, facts["subtotal"]);
        Assert.Equal(3m, facts["discountTotal"]);
        Assert.Equal(2m, facts["lineCount"]);
        Assert.Equal(12.5m, facts["maxLineDiscount"]);
        Assert.Equal("Kara liste", facts["customerGroup"]);
        Assert.Equal("TRY", facts["currency"]);
        Assert.Equal("Selin Arslan", facts["salesperson"]);
        Assert.Equal(new DateOnly(2026, 11, 2), facts["orderDate"]);
        Assert.Equal(new DateOnly(2026, 12, 5), facts["deliveryDate"]);
        Assert.False(string.IsNullOrEmpty((string?)facts["customer"]));
        Assert.Equal(DocumentRuleSchemaFieldCodes, facts.Keys.Order().ToArray());
    }

    private static readonly string[] DocumentRuleSchemaFieldCodes =
        AIERP.Platform.Application.DocumentRuleSchema.FieldsOf(AIERP.Platform.Application.DocumentRuleSchema.SalesOrderApprove).Select(x => x.Code).Order().ToArray();

    [Fact]
    public async Task Amounts_are_in_base_currency_and_a_missing_rate_leaves_them_empty()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 4m);

        async Task<IReadOnlyDictionary<string, object?>> FactsAsync() => await factory.WithTenantDbAsync(async db =>
        {
            var order = await db.SalesOrders.Include(x => x.Lines).SingleAsync(x => x.Id == orderId);
            return await SalesOrderRuleFacts.BuildAsync(db, seed.TenantId, order, CancellationToken.None);
        });
        await factory.WithTenantDbAsync(async db =>
        {
            (await db.SalesOrders.SingleAsync(x => x.Id == orderId)).CurrencyCode = "USD";
            await db.SaveChangesAsync();
        });

        var missing = await FactsAsync();
        Assert.Null(missing["grandTotal"]);
        Assert.Equal("USD", missing["currency"]);

        await factory.WithTenantDbAsync(async db =>
        {
            db.TenantExchangeRates.Add(new TenantExchangeRate { TenantId = seed.TenantId, CurrencyCode = "USD", RateDate = new DateOnly(2026, 11, 1), Rate = 35m });
            await db.SaveChangesAsync();
        });
        var converted = await FactsAsync();
        Assert.Equal(48m * 35m, converted["grandTotal"]);
        Assert.Equal(40m * 35m, converted["subtotal"]);
    }
}
