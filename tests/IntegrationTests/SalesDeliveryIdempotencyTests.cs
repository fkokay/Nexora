using AIERP.Api;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class SalesDeliveryIdempotencyTests
{
    [Fact]
    public void Matching_tenant_request_replays_only_for_the_same_delivery_payload()
    {
        var tenantId = Guid.NewGuid();
        var orderId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var locationId = Guid.NewGuid();
        var delivery = new SalesDelivery
        {
            TenantId = tenantId,
            RequestId = requestId,
            OrderId = orderId,
            WarehouseId = warehouseId,
            DeliveryDate = new DateOnly(2026, 10, 23)
        };
        delivery.Lines.Add(new SalesDeliveryLine
        {
            TenantId = tenantId,
            OrderLineNumber = 2,
            UnitCode = "EA",
            Quantity = 40m,
            EnteredQuantity = 4m,
            EnteredUnitCode = "BOX"
        });
        delivery.Lines.Add(new SalesDeliveryLine
        {
            TenantId = tenantId,
            OrderLineNumber = 1,
            UnitCode = "EA",
            EnteredQuantity = 1.5m,
            EnteredUnitCode = "EA"
        });
        var request = new SalesDeliveryWriteRequest(requestId, warehouseId, delivery.DeliveryDate,
        [
            new SalesDeliveryLineWriteRequest(1, 1.5m, "ea", locationId),
            new SalesDeliveryLineWriteRequest(2, 4m, "box")
        ]);
        var storageLocations = new Dictionary<Guid, Guid?>
        {
            [delivery.Lines.Single(x => x.OrderLineNumber == 1).Id] = locationId,
            [delivery.Lines.Single(x => x.OrderLineNumber == 2).Id] = null
        };
        var storageLocationsMissingMovement = new Dictionary<Guid, Guid?>(storageLocations);
        storageLocationsMissingMovement.Remove(delivery.Lines.Single(x => x.OrderLineNumber == 2).Id);

        Assert.True(SalesDeliveryIdempotency.MatchesPayload(delivery, orderId, request, storageLocations));
        Assert.False(SalesDeliveryIdempotency.MatchesPayload(delivery, orderId, request, storageLocationsMissingMovement));
        Assert.False(SalesDeliveryIdempotency.MatchesPayload(delivery, Guid.NewGuid(), request, storageLocations));
        Assert.False(SalesDeliveryIdempotency.MatchesPayload(delivery, orderId,
            request with { Lines = [.. request.Lines, new SalesDeliveryLineWriteRequest(3, 1m)] }, storageLocations));
        Assert.False(SalesDeliveryIdempotency.MatchesPayload(delivery, orderId,
            request with { Lines = [new SalesDeliveryLineWriteRequest(1, 1m, "ea", locationId), request.Lines[1]] }, storageLocations));
        Assert.False(SalesDeliveryIdempotency.MatchesPayload(delivery, orderId,
            request with { Lines = [request.Lines[0] with { StorageLocationId = null }, request.Lines[1]] }, storageLocations));
    }
}
