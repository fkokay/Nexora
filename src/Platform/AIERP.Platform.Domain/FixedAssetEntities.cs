namespace AIERP.Platform.Domain;

public enum FixedAssetStatus { Active = 1, Disposed = 2 }

/// <summary>Book asset record. Tax depreciation and statutory classifications are intentionally out of scope.</summary>
public sealed class FixedAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string AssetCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Category { get; set; }
    public DateOnly AcquisitionDate { get; set; }
    public DateOnly InServiceDate { get; set; }
    public decimal AcquisitionCostBase { get; set; }
    public decimal ResidualValueBase { get; set; }
    public int UsefulLifeMonths { get; set; }
    /// <summary>Immutable advisory snapshot of the GİB VUK depreciation lower limit applicable at acquisition.</summary>
    public int? VukTaxYear { get; set; }
    public decimal? VukDepreciationLowerLimitTry { get; set; }
    public int? VukCommuniqueNumber { get; set; }
    public string? VukSourceUrl { get; set; }
    public Guid? SupplierAccountId { get; set; }
    /// <summary>Optional purchase invoice that is the accounting source for this acquisition.</summary>
    public Guid? PurchaseInvoiceId { get; set; }
    public string? SourceReference { get; set; }
    public decimal AccumulatedDepreciationBase { get; set; }
    public FixedAssetStatus Status { get; set; } = FixedAssetStatus.Active;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Immutable posted depreciation period linked to its balanced general-ledger journal entry.</summary>
public sealed class FixedAssetDepreciationPosting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetId { get; set; }
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
    public decimal AmountBase { get; set; }
    public Guid JournalEntryId { get; set; }
    public Guid PostedByUserId { get; set; }
    public DateTimeOffset PostedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Immutable tenant-scoped record of an asset disposal. Book value is calculated from the
/// configured straight-line schedule through the last complete month before disposal; a
/// linked balanced general-ledger entry records the disposal and any depreciation catch-up.
/// This is operational book accounting and does not represent tax/statutory treatment.
/// </summary>
public sealed class FixedAssetDisposal
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetId { get; set; }
    public DateOnly DisposalDate { get; set; }
    public string Reason { get; set; } = "";
    public decimal ProceedsBase { get; set; }
    public decimal PostedAccumulatedDepreciationBase { get; set; }
    public decimal ScheduleAccumulatedDepreciationBase { get; set; }
    public decimal BookValueBase { get; set; }
    public decimal GainLossBase { get; set; }
    public DateOnly? ScheduleThroughPeriod { get; set; }
    public Guid IdempotencyKey { get; set; }
    public Guid DisposedByUserId { get; set; }
    public DateTimeOffset DisposedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Custody history; returning an asset closes the assignment without deleting its history.</summary>
public sealed class FixedAssetAssignment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetId { get; set; }
    public Guid EmployeeId { get; set; }
    public DateOnly AssignedDate { get; set; }
    public DateOnly? ReturnedDate { get; set; }
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public Guid AssignedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}
