using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Api;

public static class SalesDeliveryIdempotency
{
    public static bool MatchesPayload(SalesDelivery delivery, Guid orderId, SalesDeliveryWriteRequest request,
        IReadOnlyDictionary<Guid, Guid?> storageLocationByLine)
    {
        if (delivery.OrderId != orderId || delivery.RequestId != request.RequestId
            || delivery.WarehouseId != request.WarehouseId || delivery.DeliveryDate != request.DeliveryDate
            || delivery.Lines.Count != request.Lines.Count)
            return false;

        var existingLines = delivery.Lines.ToDictionary(x => x.OrderLineNumber);
        foreach (var input in request.Lines)
        {
            if (!existingLines.TryGetValue(input.OrderLineNumber, out var existing)
                || (existing.EnteredQuantity ?? existing.Quantity) != input.Quantity
                || !string.Equals(existing.EnteredUnitCode ?? existing.UnitCode,
                    string.IsNullOrWhiteSpace(input.UnitCode) ? existing.UnitCode : input.UnitCode.Trim(),
                    StringComparison.OrdinalIgnoreCase)
                || !storageLocationByLine.TryGetValue(existing.Id, out var storageLocationId)
                || storageLocationId != input.StorageLocationId)
                return false;
        }

        return true;
    }
}
