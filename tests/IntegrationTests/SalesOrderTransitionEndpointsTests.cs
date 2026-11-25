using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 1, task 4: Onayla, Onayı geri al, İptal et.</summary>
public sealed class SalesOrderTransitionEndpointsTests
{
    private static Task<HttpResponseMessage> Post(HttpClient client, Guid orderId, string transition, Guid? requestId = null, string? reason = null) =>
        client.PostAsJsonAsync($"/api/sales/orders/{orderId}/{transition}", new { requestId, reason });

    private static Task<SalesOrder> OrderAsync(SalesOrderApiFactory factory, Guid id) =>
        factory.WithTenantDbAsync(db => db.SalesOrders.AsNoTracking().SingleAsync(x => x.Id == id));

    private static Task<List<TenantDocumentActivity>> ActivityAsync(SalesOrderApiFactory factory, Guid id) =>
        factory.WithTenantDbAsync(db => db.TenantDocumentActivities.AsNoTracking().Where(x => x.DocumentId == id).OrderBy(x => x.CreatedAt).ToListAsync());

    [Fact]
    public async Task Approve_draft_moves_to_approved_and_logs()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "approve", Guid.NewGuid());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Open", (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("status").GetString());
        Assert.Equal(SalesOrderStatus.Open, (await OrderAsync(factory, orderId)).Status);
        var activity = await ActivityAsync(factory, orderId);
        Assert.Contains(activity, x => x.Transition == "onayla" && x.Step == "Onaylandı" && x.Outcome == "done" && x.ActorUserId == seed.AdminUserId);
        Assert.True(await factory.WithTenantDbAsync(db => db.AuditEvents.AnyAsync(x => x.TenantId == seed.TenantId && x.Action == "sales-order.approved")));
    }

    [Fact]
    public async Task Approve_twice_with_same_request_id_returns_current_order_once_logged()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        using var client = factory.Client(seed);
        var requestId = Guid.NewGuid();

        using var first = await Post(client, orderId, "approve", requestId);
        using var second = await Post(client, orderId, "approve", requestId);
        using var other = await Post(client, orderId, "approve", Guid.NewGuid());

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, other.StatusCode);
        Assert.Single(await ActivityAsync(factory, orderId), x => x.Step == "Onaylandı");
    }

    [Fact]
    public async Task Approve_non_draft_conflicts()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "approve");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Approve_rejects_when_stock_item_became_inactive()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        await factory.WithTenantDbAsync(async db =>
        {
            (await db.StockItems.SingleAsync(x => x.Id == seed.StockItemId)).IsActive = false;
            await db.SaveChangesAsync();
        });
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "approve");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("lines", await response.Content.ReadAsStringAsync());
        Assert.Equal(SalesOrderStatus.Draft, (await OrderAsync(factory, orderId)).Status);
    }

    [Fact]
    public async Task Approve_blocks_over_risk_limit()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 4m); // grand total 48
        await factory.WithTenantDbAsync(async db =>
        {
            var customer = await db.CustomerAccounts.SingleAsync(x => x.Id == seed.CustomerId);
            customer.RiskLimit = 100m;
            db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = seed.TenantId, CustomerId = customer.Id, EntryDate = new DateOnly(2026, 10, 1),
                Direction = CustomerLedgerDirection.Debit, Amount = 60m, CurrencyCode = "TRY", Description = "Açık bakiye" });
            await db.SaveChangesAsync();
        });
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "approve");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(108m, (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("projectedBalance").GetDecimal());
        Assert.Equal(SalesOrderStatus.Draft, (await OrderAsync(factory, orderId)).Status);
    }

    [Fact]
    public async Task Approve_warns_but_succeeds_when_stock_short()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 150m); // 100 on hand
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "approve");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var warnings = (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("warnings").EnumerateArray().ToArray();
        Assert.Single(warnings);
        Assert.Contains("MAT-1", warnings[0].GetString());
        Assert.Contains(await ActivityAsync(factory, orderId), x => x.Outcome == "warned");
    }

    [Fact]
    public async Task Unapprove_clean_open_order_returns_to_draft()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "unapprove");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SalesOrderStatus.Draft, (await OrderAsync(factory, orderId)).Status);
        Assert.Contains(await ActivityAsync(factory, orderId), x => x.Transition == "onayiGeriAl");
    }

    [Fact]
    public async Task Unapprove_with_reservation_conflicts()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        await SeedReservationAsync(factory, seed, orderId);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "unapprove");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Cancel_draft_with_reason()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "cancel", reason: "Müşteri vazgeçti");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SalesOrderStatus.Cancelled, (await OrderAsync(factory, orderId)).Status);
        Assert.Contains(await ActivityAsync(factory, orderId), x => x.Transition == "iptal" && x.Message == "Müşteri vazgeçti");
    }

    [Fact]
    public async Task Cancel_without_reason_is_validation_error()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "cancel", reason: "  ");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(SalesOrderStatus.Draft, (await OrderAsync(factory, orderId)).Status);
    }

    [Fact]
    public async Task Cancel_open_with_delivery_conflicts()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        await factory.WithTenantDbAsync(async db =>
        {
            db.SalesDeliveries.Add(new SalesDelivery { TenantId = seed.TenantId, OrderId = orderId, WarehouseId = seed.WarehouseId,
                Code = "IRS-1", DeliveryDate = new DateOnly(2026, 11, 3), RequestId = Guid.NewGuid() });
            await db.SaveChangesAsync();
        });
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "cancel", reason: "Vazgeçildi");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Cancel_releases_active_reservations()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Open);
        var reservationId = await SeedReservationAsync(factory, seed, orderId);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "cancel", reason: "Vazgeçildi");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reservation = await factory.WithTenantDbAsync(db => db.SalesOrderReservations.AsNoTracking().SingleAsync(x => x.Id == reservationId));
        Assert.Equal(SalesOrderReservationStatus.Released, reservation.Status);
        Assert.NotNull(reservation.ReleasedAt);
    }

    [Fact]
    public async Task Cancel_pending_approval_conflicts()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.PendingApproval);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "cancel", reason: "Vazgeçildi");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task TenantUser_denied_execute_cannot_approve()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft);
        await factory.WithPlatformDbAsync(async platform =>
        {
            var permission = await platform.PermissionDefinitions.SingleAsync(x => x.Code == "erp.sales-orders.execute");
            platform.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = seed.TenantId, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permission.Code, Permission = permission, Effect = TenantPermissionEffect.Deny, ResourceType = "erp.sales-orders"
            });
            await platform.SaveChangesAsync();
        });
        using var client = factory.Client(seed, "TenantUser");

        using var response = await Post(client, orderId, "approve");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(SalesOrderStatus.Draft, (await OrderAsync(factory, orderId)).Status);
    }

    [Fact]
    public async Task Other_tenant_order_is_not_found()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        var other = await factory.SeedAsync("other");
        var orderId = await factory.SeedOrderAsync(other, SalesOrderStatus.Draft);
        using var client = factory.Client(seed);

        using var response = await Post(client, orderId, "approve");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static Task<Guid> SeedReservationAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, Guid orderId) =>
        factory.WithTenantDbAsync(async db =>
        {
            var reservation = new SalesOrderReservation { TenantId = seed.TenantId, RequestId = Guid.NewGuid(), OrderId = orderId,
                OrderLineNumber = 1, WarehouseId = seed.WarehouseId, Quantity = 2m };
            db.SalesOrderReservations.Add(reservation);
            await db.SaveChangesAsync();
            return reservation.Id;
        });
}
