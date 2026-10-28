namespace AIERP.Platform.Domain;

/// <summary>
/// Captures supplier-provided invoice data without posting or creating accounting,
/// inventory, payment, return, or journal effects.
/// </summary>
public sealed class PurchaseInvoiceDraft
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid SupplierId { get; set; }
    public CustomerAccount Supplier { get; set; } = null!;
    public Guid RequestId { get; set; }
    public string InvoiceNumber { get; set; } = "";
    public string NormalizedInvoiceNumber { get; set; } = "";
    public DateOnly InvoiceDate { get; set; }
    public DateOnly? DueDate { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public string? Notes { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public PurchaseInvoiceDraftStatus Status { get; set; } = PurchaseInvoiceDraftStatus.Draft;
    public DateTimeOffset? PostedAt { get; set; }
    public Guid? PostedByUserId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<PurchaseInvoiceDraftLine> Lines { get; set; } = new List<PurchaseInvoiceDraftLine>();
    public CustomerLedgerEntry? LedgerEntry { get; set; }
}

public enum PurchaseInvoiceDraftStatus { Draft = 1, Posted = 2 }

/// <summary>Source-document line capture only; no tax rates or totals are inferred.</summary>
public sealed class PurchaseInvoiceDraftLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PurchaseInvoiceDraftId { get; set; }
    public PurchaseInvoiceDraft PurchaseInvoiceDraft { get; set; } = null!;
    public int LineNumber { get; set; }
    public string Description { get; set; } = "";
    public decimal? Quantity { get; set; }
    public string? UnitCode { get; set; }
    public decimal? UnitPrice { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal Total { get; set; }
    /// <summary>Optional tenant ledger expense account selected for later posting; never posted while this is a draft.</summary>
    public Guid? ExpenseAccountId { get; set; }
    /// <summary>VAT percentage copied from the supplier document; it is not calculated or treated as a tax determination.</summary>
    public decimal? VatRate { get; set; }
}
