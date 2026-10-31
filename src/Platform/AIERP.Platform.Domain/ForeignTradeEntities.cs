namespace AIERP.Platform.Domain;

public enum ForeignTradeDirection { Import = 1, Export = 2 }
public enum ForeignTradeStatus { Draft = 1, Booked = 2, Shipped = 3, CustomsClearance = 4, Arrived = 5, Closed = 6, Cancelled = 7 }

/// <summary>Operational foreign-trade dossier linked to one tenant purchase or sales order.</summary>
public sealed class ForeignTradeCase
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public ForeignTradeDirection Direction { get; set; }
    public ForeignTradeStatus Status { get; set; } = ForeignTradeStatus.Draft;
    public Guid? PurchaseOrderId { get; set; }
    public Guid? SalesOrderId { get; set; }
    /// <summary>New cases must reference the standard posted receipt/delivery before they can be finalized.</summary>
    public bool InventoryPostingRequired { get; set; }
    public Guid? PurchaseReceiptId { get; set; }
    public Guid? SalesDeliveryId { get; set; }
    public DateTimeOffset? InventoryDocumentLinkedAt { get; set; }
    public Guid? InventoryDocumentLinkedByUserId { get; set; }
    public string ReferenceCode { get; set; } = "";
    public string OriginCountryCode { get; set; } = "";
    public string DestinationCountryCode { get; set; } = "";
    public string? IncotermsCode { get; set; }
    public string? HarmonizedSystemCode { get; set; }
    public string TransportMode { get; set; } = "Road";
    public string? CarrierReference { get; set; }
    public string? CustomsReference { get; set; }
    public decimal DeclaredValue { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public DateOnly? PlannedShipDate { get; set; }
    public DateOnly? ActualShipDate { get; set; }
    public DateOnly? PlannedArrivalDate { get; set; }
    public DateOnly? ActualArrivalDate { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
