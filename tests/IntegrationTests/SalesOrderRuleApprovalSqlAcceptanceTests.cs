using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Belge kuralları PR 3 on SQL Server: a published Onay iste rule holds the order (UPDLOCK approve path), the listed person decides
/// (UPDLOCK decision path) and cancelling a held order closes its workflow. Skipped without a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class SalesOrderRuleApprovalSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Rule_holds_the_order_listed_person_approves_and_cancel_closes_the_flow()
    {
        await using var harness = await FiscalCloseRouteSqlAcceptanceHarness.CreateAsync("RuleApproval");
        var tenantId = harness.TenantId;
        var approver = Guid.NewGuid();
        await using (var platform = harness.NewPlatformDb())
        {
            platform.Users.Add(new AppUser { Id = approver, Email = $"approver-{harness.Suffix}@example.invalid", DisplayName = "Synthetic approver", PasswordHash = "test" });
            platform.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = approver, Role = "TenantAdmin" });
            await platform.SaveChangesAsync();
        }
        var customer = new CustomerAccount { TenantId = tenantId, Code = "C-RUL", Name = "Synthetic customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY", IsActive = true };
        var warehouse = new Warehouse { TenantId = tenantId, Code = "WH-RUL", Name = "Synthetic warehouse" };
        var item = new StockItem { TenantId = tenantId, Code = "S-RUL", Name = "Synthetic stock", UnitCode = "KG", TrackingMode = InventoryTrackingMode.None };
        await using (var seedDb = harness.NewTenantDb())
        {
            seedDb.Tenants.Add(harness.Tenant);
            seedDb.CustomerAccounts.Add(customer);
            seedDb.Warehouses.Add(warehouse);
            seedDb.StockItems.Add(item);
            seedDb.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, Warehouse = warehouse, StockItem = item, EntryDate = new DateOnly(2026, 11, 1),
                Direction = InventoryDirection.Receipt, Quantity = 1000m, UnitCostBase = 1m, Description = "Synthetic opening stock" });
            await seedDb.SaveChangesAsync();
        }
        harness.StartApi();

        async Task<JsonElement> Send(HttpClient client, HttpMethod method, string url, object? body, HttpStatusCode expected)
        {
            using var request = new HttpRequestMessage(method, url) { Content = body is null ? null : JsonContent.Create(body) };
            using var response = await client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == expected, $"{url} {response.StatusCode}: {text}");
            return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
        }
        async Task<Guid> CreateOrder() => (await Send(harness.Client, HttpMethod.Post, "/api/sales/orders", new { code = "", customerId = customer.Id, orderDate = "2026-11-20",
            currencyCode = "TRY", lines = new object[] { new { stockItemId = item.Id, quantity = 4m, unitPrice = 10m, vatPercent = 20m } } }, HttpStatusCode.Created)).GetProperty("id").GetGuid();
        async Task<SalesOrderStatus> StatusAsync(Guid orderId)
        {
            await using var db = harness.NewTenantDb();
            return (await db.SalesOrders.AsNoTracking().SingleAsync(x => x.Id == orderId)).Status;
        }
        async Task<TenantWorkflowInstance> InstanceAsync(Guid orderId)
        {
            await using var db = harness.NewTenantDb();
            return await db.TenantWorkflowInstances.AsNoTracking().SingleAsync(x => x.SubjectType == "SalesOrder" && x.SubjectId == orderId);
        }

        const string rules = "/api/document-rules/satis.siparis/onayla";
        await Send(harness.Client, HttpMethod.Put, rules + "/draft", new { rules = new[] { new { code = "onay", order = 1, enabled = true, always = false,
            field = "grandTotal", op = "GreaterThan", value = "10", action = "approval", approverUserIds = new[] { approver } } } }, HttpStatusCode.OK);
        await Send(harness.Client, HttpMethod.Post, rules + "/publish", new { }, HttpStatusCode.OK);

        var first = await CreateOrder();
        var held = await Send(harness.Client, HttpMethod.Post, $"/api/sales/orders/{first}/approve", new { requestId = Guid.NewGuid() }, HttpStatusCode.OK);
        Assert.Equal("PendingApproval", held.GetProperty("status").GetString());
        var instance = await InstanceAsync(first);
        await Send(harness.Client, HttpMethod.Post, $"/api/workflows/instances/{instance.Id}/decision", new { decision = "Approved" }, HttpStatusCode.Forbidden);
        await Send(harness.ClientFor(approver), HttpMethod.Post, $"/api/workflows/instances/{instance.Id}/decision", new { decision = "Approved" }, HttpStatusCode.OK);
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(first));

        var second = await CreateOrder();
        await Send(harness.Client, HttpMethod.Post, $"/api/sales/orders/{second}/approve", new { requestId = Guid.NewGuid() }, HttpStatusCode.OK);
        await Send(harness.Client, HttpMethod.Post, $"/api/sales/orders/{second}/cancel", new { reason = "Vazgeçildi" }, HttpStatusCode.OK);
        Assert.Equal(SalesOrderStatus.Cancelled, await StatusAsync(second));
        Assert.Equal("Cancelled", (await InstanceAsync(second)).Status);
    }
}
