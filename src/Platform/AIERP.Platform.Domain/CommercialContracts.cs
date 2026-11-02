namespace AIERP.Platform.Domain;

public enum CommercialContractType { Sales = 1, Purchase = 2 }

public enum CommercialContractStatus { Draft = 1, Active = 2, Suspended = 3, Completed = 4, Terminated = 5, Cancelled = 6 }

public sealed class CommercialContract
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public CommercialContractType Type { get; set; }
    public Guid CounterpartyId { get; set; }
    public string CounterpartyNameSnapshot { get; set; } = "";
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly EffectiveThrough { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public CommercialContractStatus Status { get; set; } = CommercialContractStatus.Draft;
    public Guid? SalesQuoteId { get; set; }
    public Guid? SalesOrderId { get; set; }
    public Guid? PurchaseSupplierQuoteId { get; set; }
    public Guid? PurchaseOrderId { get; set; }
    public Guid CreateIdempotencyKey { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public int Revision { get; set; } = 1;
    public ICollection<CommercialContractStatusTransition> Transitions { get; set; } = new List<CommercialContractStatusTransition>();
}

public sealed class CommercialContractStatusTransition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ContractId { get; set; }
    public CommercialContract? Contract { get; set; }
    public CommercialContractStatus FromStatus { get; set; }
    public CommercialContractStatus ToStatus { get; set; }
    public string? Reason { get; set; }
    public Guid IdempotencyKey { get; set; }
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
}
