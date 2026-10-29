namespace AIERP.Platform.Domain;

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
}

public sealed class PlatformUserRole
{
    public Guid UserId { get; set; }
    public string Role { get; set; } = "";
    public Guid? AssignedByUserId { get; set; }
    public DateTimeOffset AssignedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PlatformRefreshSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid TenantId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PlatformModulePublisherKey
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Publisher { get; set; } = "";
    public string KeyId { get; set; } = "";
    public string PublicKeyPem { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PlatformModuleRelease
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ModuleCode { get; set; } = "";
    public string Version { get; set; } = "";
    public string Publisher { get; set; } = "";
    public string ManifestJson { get; set; } = "";
    public string ArtifactSha256 { get; set; } = "";
    public string SignatureBase64 { get; set; } = "";
    public string KeyId { get; set; } = "";
    public string StorageKey { get; set; } = "";
    public string? RuntimeKind { get; set; }
    public DateTimeOffset? RuntimeValidatedAt { get; set; }
    public string Status { get; set; } = "Draft";
    public string? RevocationReason { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid? PublishedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? PublishedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}

/// <summary>Tenant-scoped enablement of a signed catalog release.</summary>
public sealed class TenantModuleActivation
{
    public Guid TenantId { get; set; }
    public string ModuleCode { get; set; } = "";
    public string Version { get; set; } = "";
    public Guid ActivatedByUserId { get; set; }
    public DateTimeOffset ActivatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public string BaseCurrencyCode { get; set; } = "TRY";
    public int AuditRetentionDays { get; set; } = 365;
    public DateTimeOffset? AuditLastPurgeAt { get; set; }
    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
    public ICollection<CustomerAccount> Customers { get; set; } = new List<CustomerAccount>();
    public ICollection<CustomerGroup> CustomerGroups { get; set; } = new List<CustomerGroup>();
    public ICollection<StockItem> StockItems { get; set; } = new List<StockItem>();
    public ICollection<Warehouse> Warehouses { get; set; } = new List<Warehouse>();
    public ICollection<SalesQuote> SalesQuotes { get; set; } = new List<SalesQuote>();
    public ICollection<SalesOrder> SalesOrders { get; set; } = new List<SalesOrder>();
    public ICollection<SalesDelivery> SalesDeliveries { get; set; } = new List<SalesDelivery>();
    public ICollection<SalesInvoice> SalesInvoices { get; set; } = new List<SalesInvoice>();
    public ICollection<CustomerCollection> CustomerCollections { get; set; } = new List<CustomerCollection>();
    public ICollection<SalesReturn> SalesReturns { get; set; } = new List<SalesReturn>();
    public ICollection<PurchaseOrder> PurchaseOrders { get; set; } = new List<PurchaseOrder>();
    public ICollection<PurchaseRequest> PurchaseRequests { get; set; } = new List<PurchaseRequest>();
    public ICollection<PurchaseReceipt> PurchaseReceipts { get; set; } = new List<PurchaseReceipt>();
    public ICollection<PurchaseInvoice> PurchaseInvoices { get; set; } = new List<PurchaseInvoice>();
    public ICollection<SupplierPayment> SupplierPayments { get; set; } = new List<SupplierPayment>();
    public ICollection<FinancialAccount> FinancialAccounts { get; set; } = new List<FinancialAccount>();
}

/// <summary>Legal identity details for one tenant, kept in the platform catalog rather than operational tenant databases.</summary>
public sealed class TenantCompanyProfile
{
    public Guid TenantId { get; set; }
    public string LegalName { get; set; } = "";
    public string? TaxOffice { get; set; }
    public string? TaxNumber { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Company-specific ERP behavior stored with that company's tenant database.</summary>
public sealed class TenantOperationalSettings
{
    public Guid TenantId { get; set; }
    public bool AllowNegativeStock { get; set; }
    public Guid? UpdatedByUserId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

public enum EmployeeEmploymentStatus { Active = 1, OnLeave = 2, Terminated = 3 }
public enum EmployeeLeaveStatus { Requested = 1, Approved = 2, Rejected = 3, Cancelled = 4 }

/// <summary>Minimal tenant-scoped personnel record. National ID, bank and health data are intentionally excluded.</summary>
public sealed class EmployeeRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string PersonnelCode { get; set; } = "";
    public string FullName { get; set; } = "";
    public Guid? UserId { get; set; }
    public string? Department { get; set; }
    public string? JobTitle { get; set; }
    /// <summary>Employer-defined category used to group employees for payroll policy selection.</summary>
    public string? EmploymentCategory { get; set; }
    public string? WorkEmail { get; set; }
    public DateOnly HireDate { get; set; }
    public DateOnly? TerminationDate { get; set; }
    public EmployeeEmploymentStatus Status { get; set; } = EmployeeEmploymentStatus.Active;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class EmployeeLeaveRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public string LeaveType { get; set; } = "Annual";
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public decimal RequestedDays { get; set; }
    public string? Note { get; set; }
    public EmployeeLeaveStatus Status { get; set; } = EmployeeLeaveStatus.Requested;
    public Guid RequestedByUserId { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? ReviewNote { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public sealed class EmployeeAttendanceRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public DateOnly WorkDate { get; set; }
    public int WorkedMinutes { get; set; }
    public int OvertimeMinutes { get; set; }
    public string? Note { get; set; }
    public Guid RecordedByUserId { get; set; }
    public string ApprovalStatus { get; set; } = "PendingApproval";
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Second-approved, effective-dated employee workplace assignment used for historical payroll runs.</summary>
public sealed class PayrollEmployeeWorkplaceAssignment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public string WorkplaceCode { get; set; } = "";
    public DateOnly EffectiveFrom { get; set; }
    public int Version { get; set; } = 1;
    public string Status { get; set; } = "PendingApproval";
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public Guid? RejectedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>A tenant-owned workplace, branch, or factory used as an operational and payroll reference.</summary>
public sealed class WorkplaceDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "Workplace";
    public bool IsActive { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Approved effective-dated weekly and date-exception schedule for a workplace.</summary>
public sealed class PayrollWorkplaceCalendar
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string WorkplaceCode { get; set; } = "";
    public DateOnly EffectiveFrom { get; set; }
    public int Version { get; set; } = 1;
    public string WeeklyMinutesJson { get; set; } = "{}";
    public string DateOverridesJson { get; set; } = "[]";
    public string PolicyReference { get; set; } = "";
    public string Status { get; set; } = "PendingApproval";
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public Guid? RejectedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Approved effective-dated employee schedule replacing the workplace calendar during its active range.</summary>
public sealed class PayrollEmployeeWorkCalendarOverride
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public int Version { get; set; } = 1;
    public string WeeklyMinutesJson { get; set; } = "{}";
    public string DateOverridesJson { get; set; } = "[]";
    public string PolicyReference { get; set; } = "";
    public string Status { get; set; } = "PendingApproval";
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public Guid? RejectedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Versioned statutory input envelope; calculation inputs are reviewable and effective-dated.</summary>
public sealed class PayrollRuleSet
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string JurisdictionCode { get; set; } = "TR";
    public string TaxYear { get; set; } = "2026";
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public int Version { get; set; } = 1;
    public string RulesJson { get; set; } = "{}";
    public string OfficialSourceUrl { get; set; } = "";
    public string Status { get; set; } = "Draft";
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ApprovedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Confidential, immutable gross/net compensation target change; only Approved rows are effective.</summary>
public sealed class PayrollCompensationRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public string TargetKind { get; set; } = "Gross";
    public decimal Amount { get; set; }
    public string CurrencyCode { get; set; } = "";
    public string PayBasisCode { get; set; } = "";
    public DateOnly EffectiveFrom { get; set; }
    public int Version { get; set; } = 1;
    public string Status { get; set; } = "PendingApproval";
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public Guid? RejectedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Second-approved prior-employer tax-base declaration, kept generic until an employer's authorized code list is configured.</summary>
public sealed class PayrollPriorEmployerTaxBaseDeclaration
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public int TaxYear { get; set; }
    public string DeclarationKind { get; set; } = "NoPriorEmployer";
    public string BaseEntriesJson { get; set; } = "[]";
    public string EvidenceReference { get; set; } = "";
    public int Version { get; set; } = 1;
    public string Status { get; set; } = "PendingApproval";
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public Guid? RejectedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Immutable, tenant-scoped input snapshot for an internal payroll draft run.</summary>
public sealed class PayrollRunSnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string PeriodKind { get; set; } = "CalendarMonth";
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
    public string ProfileCode { get; set; } = "TR-4A-PRIVATE";
    public string Status { get; set; } = "Blocked";
    public int EmployeeCount { get; set; }
    public string SnapshotJson { get; set; } = "{}";
    public string SnapshotSha256 { get; set; } = "";
    public string BlockersJson { get; set; } = "[]";
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Immutable formula-derived payroll result tied to an exact approved input snapshot.</summary>
public sealed class PayrollRunCalculation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RunId { get; set; }
    public int Version { get; set; } = 1;
    public string RunSnapshotSha256 { get; set; } = "";
    public string ResultJson { get; set; } = "{}";
    public string ResultSha256 { get; set; } = "";
    public string Status { get; set; } = "PendingApproval";
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public Guid? RejectedByUserId { get; set; }
    public Guid? FinalizedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }
    public DateTimeOffset? FinalizedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public sealed class TenantAIProviderSettings
{
    public Guid TenantId { get; set; }
    public string Provider { get; set; } = "OpenAI";
    public string? OpenAIKeyCipherText { get; set; }
    public string OpenAIModel { get; set; } = "gpt-6-astra";
    public string? NvidiaKeyCipherText { get; set; }
    public string NvidiaModel { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum TenantDatabaseProvisioningState { Provisioning = 1, Copying = 2, Ready = 3, Failed = 4 }

public sealed class TenantDatabaseCatalogEntry
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string DatabaseName { get; set; } = "";
    public TenantDatabaseProvisioningState State { get; set; } = TenantDatabaseProvisioningState.Provisioning;
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadyAt { get; set; }
}

public sealed class DatabaseSeparationComponentState
{
    public string Component { get; set; } = "";
    public string DatabaseName { get; set; } = "";
    public TenantDatabaseProvisioningState State { get; set; } = TenantDatabaseProvisioningState.Provisioning;
    public string? LastError { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadyAt { get; set; }
}

public interface IAuditExecutionContext
{
    Guid? TenantId { get; }
    Guid? UserId { get; }
    string Source { get; }
}

public sealed record AuditExecutionContext(Guid? TenantId, Guid? UserId, string Source) : IAuditExecutionContext;

public sealed class TenantExchangeRate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string CurrencyCode { get; set; } = "USD";
    public DateOnly RateDate { get; set; }
    public int Revision { get; set; } = 1;
    // Base-currency units for one unit of CurrencyCode.
    public decimal Rate { get; set; }
    public string? Source { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum FxRevaluationDirection { Receivable = 1, Payable = 2 }

public sealed class FxRevaluationVoucher
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly AsOfDate { get; set; }
    public string BaseCurrencyCode { get; set; } = "TRY";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
    public ICollection<FxRevaluationVoucherLine> Lines { get; set; } = new List<FxRevaluationVoucherLine>();
}

public sealed class FxRevaluationVoucherLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid VoucherId { get; set; }
    public FxRevaluationVoucher Voucher { get; set; } = null!;
    public FxRevaluationDirection Direction { get; set; }
    public Guid InvoiceId { get; set; }
    public string InvoiceCode { get; set; } = "";
    public string CounterpartyName { get; set; } = "";
    public string CurrencyCode { get; set; } = "";
    public decimal OutstandingAmount { get; set; }
    public decimal InvoiceDateRate { get; set; }
    public decimal ClosingRate { get; set; }
    public decimal PreviousAdjustmentBase { get; set; }
    public decimal TargetAdjustmentBase { get; set; }
    public decimal AdjustmentBase { get; set; }
    public string DebitAccount { get; set; } = "";
    public string CreditAccount { get; set; } = "";
    public decimal DebitBaseAmount { get; set; }
    public decimal CreditBaseAmount { get; set; }
}

public sealed class LedgerAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public LedgerAccountStatementSection StatementSection { get; set; } = LedgerAccountStatementSection.Unclassified;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum TenantBudgetPlanStatus { Draft = 1, Approved = 2 }

public sealed class TenantBudgetPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public int FiscalYear { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public TenantBudgetPlanStatus Status { get; set; } = TenantBudgetPlanStatus.Draft;
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public int Revision { get; set; } = 1;
    public ICollection<TenantBudgetLine> Lines { get; set; } = new List<TenantBudgetLine>();
}

public sealed class TenantBudgetLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid BudgetPlanId { get; set; }
    public TenantBudgetPlan BudgetPlan { get; set; } = null!;
    public Guid AccountId { get; set; }
    public LedgerAccount Account { get; set; } = null!;
    public DateOnly PeriodStart { get; set; }
    public decimal PlannedAmount { get; set; }
    public string? Notes { get; set; }
}

public enum DirectCashBudgetPlanStatus { Draft = 1, Approved = 2 }
public enum DirectCashBudgetDirection { Inflow = 1, Outflow = 2 }

/// <summary>Planning-only cash scenario. It does not represent a journal or cash transaction.</summary>
public sealed class DirectCashBudgetPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public int FiscalYear { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public DirectCashBudgetPlanStatus Status { get; set; } = DirectCashBudgetPlanStatus.Draft;
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public int Revision { get; set; } = 1;
    public ICollection<DirectCashBudgetLine> Lines { get; set; } = new List<DirectCashBudgetLine>();
}

public sealed class DirectCashBudgetLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PlanId { get; set; }
    public DirectCashBudgetPlan Plan { get; set; } = null!;
    public DateOnly PeriodStart { get; set; }
    public DirectCashBudgetDirection Direction { get; set; }
    public string Category { get; set; } = "Other";
    public string Description { get; set; } = "";
    public decimal Amount { get; set; }
}

public enum LedgerAccountStatementSection
{
    Unclassified = 0,
    Asset = 1,
    Liability = 2,
    Equity = 3,
    Revenue = 4,
    Expense = 5
}

public sealed class LedgerAccountMapping
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string MappingKey { get; set; } = "";
    public Guid AccountId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class JournalEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public DateOnly EntryDate { get; set; }
    public string Description { get; set; } = "";
    public string SourceType { get; set; } = "";
    public Guid SourceId { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<JournalEntryLine> Lines { get; set; } = new List<JournalEntryLine>();
}

public sealed class JournalEntryLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid JournalEntryId { get; set; }
    public Guid AccountId { get; set; }
    public int LineNumber { get; set; }
    public string Description { get; set; } = "";
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
}

public static class LedgerMappingKeys
{
    public const string FinancialAccountPrefix = "financial-account.";
    public const string CreditFacilityPrincipal = "credit-facility.principal";
    public const string CreditFacilityInterestExpense = "credit-facility.interest-expense";
    public const string CreditFacilityAccruedInterest = "credit-facility.accrued-interest";
    public const string CreditFacilityFeeExpense = "credit-facility.fee-expense";
    public const string SalesReceivable = "sales.receivable";
    public const string SalesRevenue = "sales.revenue";
    public const string SalesCost = "sales.cost";
    public const string SalesTaxPayable = "sales.tax-payable";
    public const string CustomerCardClearing = "collection.card-clearing";
    public const string CustomerCheckClearing = "collection.check-clearing";
    public const string PurchasePayable = "purchase.payable";
    public const string PurchaseCost = "purchase.cost";
    public const string PurchaseTaxRecoverable = "purchase.tax-recoverable";
    public const string PurchaseReceiptAccrual = "purchase.receipt-accrual";
    public const string SupplierCardClearing = "payment.card-clearing";
    public const string SupplierCheckClearing = "payment.check-clearing";
    public const string InstrumentReceivablePortfolio = "instrument.receivable-portfolio";
    public const string InstrumentPayablePortfolio = "instrument.payable-portfolio";
    public const string InstrumentReceivableOffset = "instrument.receivable-offset";
    public const string InstrumentPayableOffset = "instrument.payable-offset";
    public const string InstrumentEndorsementOffset = "instrument.endorsement-offset";
    public const string FxReceivable = "fx.receivable";
    public const string FxPayable = "fx.payable";
    public const string FxGain = "fx.gain";
    public const string FxLoss = "fx.loss";
    public const string InventoryAsset = "inventory.asset";
    public const string InventoryReturnCostOffset = "inventory.return-cost-offset";
    public const string InventoryRevaluationOffset = "inventory.revaluation-offset";
    public const string InventoryLandedCostOffset = "inventory.landed-cost-offset";
    public const string InventoryReversalOffset = "inventory.reversal-offset";
    public const string FixedAssetDepreciationExpense = "fixed-assets.depreciation-expense";
    public const string FixedAssetAccumulatedDepreciation = "fixed-assets.accumulated-depreciation";
    public const string FixedAssetCost = "fixed-assets.cost";
    public const string FixedAssetDisposalProceeds = "fixed-assets.disposal-proceeds";
    public const string FixedAssetDisposalGain = "fixed-assets.disposal-gain";
    public const string FixedAssetDisposalLoss = "fixed-assets.disposal-loss";
}

public enum CounterpartyType { Customer = 1, Supplier = 2, Both = 3 }
public enum CustomerAddressKind { General = 1, Billing = 2, Delivery = 3 }
public enum CrmOpportunityStage { Prospecting = 1, Qualified = 2, Proposal = 3, Negotiation = 4, Won = 5, Lost = 6 }

public sealed class CustomerGroup
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public ICollection<CustomerAccount> Customers { get; set; } = new List<CustomerAccount>();
}

public sealed class CustomerAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public CounterpartyType Type { get; set; }
    public string? TaxNumber { get; set; }
    public string? IdentityNumber { get; set; }
    public string? TaxOffice { get; set; }
    public Guid? GroupId { get; set; }
    public CustomerGroup? Group { get; set; }
    public Guid? ParentCompanyId { get; set; }
    public CustomerAccount? ParentCompany { get; set; }
    public ICollection<CustomerAccount> Subsidiaries { get; set; } = new List<CustomerAccount>();
    public string CurrencyCode { get; set; } = "TRY";
    public decimal? RiskLimit { get; set; }
    public int PaymentTermDays { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<CustomerAddress> Addresses { get; set; } = new List<CustomerAddress>();
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
}

public sealed class CrmOpportunity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public Guid? CustomerId { get; set; }
    public CustomerAccount? Customer { get; set; }
    public CrmOpportunityStage Stage { get; set; } = CrmOpportunityStage.Prospecting;
    public decimal? EstimatedValue { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public int ProbabilityPercent { get; set; } = 10;
    public DateOnly? ExpectedCloseDate { get; set; }
    public DateTimeOffset? NextActivityAt { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class CustomerCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CustomerCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CustomerCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CustomerCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CustomerAddress
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public CustomerAddressKind Kind { get; set; }
    public string Label { get; set; } = "";
    public string AddressLine { get; set; } = "";
    public string City { get; set; } = "";
    public string? District { get; set; }
    public string? PostalCode { get; set; }
    public string CountryCode { get; set; } = "TR";
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class CustomerLocationProvince
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public ICollection<CustomerLocationDistrict> Districts { get; set; } = new List<CustomerLocationDistrict>();
}

public sealed class CustomerLocationDistrict
{
    public int Id { get; set; }
    public int ProvinceId { get; set; }
    public CustomerLocationProvince Province { get; set; } = null!;
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

public enum CustomerLedgerDirection { Debit = 1, Credit = 2 }

public sealed class CustomerLedgerEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public DateOnly EntryDate { get; set; }
    public CustomerLedgerDirection Direction { get; set; }
    public decimal Amount { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public string Description { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ReversalOfId { get; set; }
    public CustomerLedgerEntry? ReversalOf { get; set; }
    public CustomerLedgerEntry? ReversalEntry { get; set; }
    public Guid? SalesInvoiceId { get; set; }
    public SalesInvoice? SalesInvoice { get; set; }
    public Guid? CustomerCollectionId { get; set; }
    public CustomerCollection? CustomerCollection { get; set; }
    public Guid? SalesReturnId { get; set; }
    public SalesReturn? SalesReturn { get; set; }
    public Guid? PurchaseInvoiceId { get; set; }
    public PurchaseInvoice? PurchaseInvoice { get; set; }
    public Guid? PurchaseInvoiceDraftId { get; set; }
    public PurchaseInvoiceDraft? PurchaseInvoiceDraft { get; set; }
    public Guid? SupplierPaymentId { get; set; }
    public SupplierPayment? SupplierPayment { get; set; }
    public Guid? SupplierReturnId { get; set; }
    public SupplierReturn? SupplierReturn { get; set; }
}

public sealed class StockItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Barcode { get; set; }
    public string UnitCode { get; set; } = "EA";
    public string? Category { get; set; }
    public decimal MinimumStock { get; set; }
    public int ProcurementLeadTimeDays { get; set; }
    public int ManufacturingLeadTimeDays { get; set; }
    public InventoryTrackingMode TrackingMode { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<StockItemUnitConversion> UnitConversions { get; set; } = new List<StockItemUnitConversion>();
}

public sealed class StockItemCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum InventoryTrackingMode { None = 0, Lot = 1, Serial = 2 }

public enum ManufacturingOrderStatus { Planned = 1, Released = 2, Completed = 3, Cancelled = 4 }
public enum ManufacturingOperationStatus { Planned = 1, InProgress = 2, Completed = 3 }

public sealed class BillOfMaterial
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public Guid ProductStockItemId { get; set; }
    public decimal OutputQuantity { get; set; } = 1m;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<BillOfMaterialLine> Lines { get; set; } = new List<BillOfMaterialLine>();
    public ICollection<BillOfMaterialOperation> Operations { get; set; } = new List<BillOfMaterialOperation>();
}

public sealed class ManufacturingWorkCenter
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public int CapacityMinutesPerDay { get; set; } = 480;
    /// <summary>Tenant-configurable shift window, in local minutes after midnight. Legacy schedules use 08:00–16:00.</summary>
    public int ShiftStartMinuteOfDay { get; set; } = 480;
    public int ShiftEndMinuteOfDay { get; set; } = 960;
    /// <summary>Bit 0 is Sunday through bit 6 for Saturday. The default keeps all weekdays open for legacy schedules.</summary>
    public int WorkingDaysMask { get; set; } = 127;
    public decimal LaborCostPerHourBase { get; set; }
    public decimal OverheadCostPerHourBase { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Date-specific capacity for a tenant work center; zero closes the center on that date.</summary>
public sealed class ManufacturingWorkCenterCapacityOverride
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WorkCenterId { get; set; }
    public DateOnly WorkDate { get; set; }
    public int CapacityMinutes { get; set; }
    public string? Note { get; set; }
}

/// <summary>
/// Annual work-center capacity rule. Month/day is interpreted in the tenant's
/// calendar; February 29 applies only in leap years and is skipped otherwise.
/// A zero capacity closes the work center for that day.
/// </summary>
public sealed class ManufacturingWorkCenterAnnualCapacityRule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WorkCenterId { get; set; }
    public int Month { get; set; }
    public int Day { get; set; }
    public int CapacityMinutes { get; set; }
    public string? Note { get; set; }
}

/// <summary>
/// Tenant-scoped effective-dated repeating shift calendar. The first pattern day
/// applies on EffectiveFromDate; rotation advances by calendar days and repeats.
/// </summary>
public sealed class ManufacturingWorkCenterShiftRotation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WorkCenterId { get; set; }
    public DateOnly EffectiveFromDate { get; set; }
    public DateOnly? EffectiveToDate { get; set; }
    public string? Note { get; set; }
    public ICollection<ManufacturingWorkCenterShiftRotationDay> Days { get; set; } = new List<ManufacturingWorkCenterShiftRotationDay>();
}

/// <summary>One indexed calendar day in a repeating shift rotation.</summary>
public sealed class ManufacturingWorkCenterShiftRotationDay
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ShiftRotationId { get; set; }
    public int DayIndex { get; set; }
    public int CapacityMinutes { get; set; }
    public int ShiftStartMinuteOfDay { get; set; }
    public int ShiftEndMinuteOfDay { get; set; }
}

/// <summary>Tenant-configurable sequence-dependent setup or prohibited transition for a work center.</summary>
public sealed class ManufacturingSetupTransitionRule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WorkCenterId { get; set; }
    public string FromSetupFamilyCode { get; set; } = "";
    public string ToSetupFamilyCode { get; set; } = "";
    public decimal SetupMinutes { get; set; }
    public bool IsTransitionAllowed { get; set; } = true;
}

public sealed class BillOfMaterialOperation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid BillOfMaterialId { get; set; }
    public int Sequence { get; set; }
    public Guid WorkCenterId { get; set; }
    public decimal SetupMinutes { get; set; }
    public decimal RunMinutesPerOutputUnit { get; set; }
    /// <summary>Standard electricity use (kWh) per BOM output unit.</summary>
    public decimal PlannedEnergyKwhPerOutput { get; set; }
    /// <summary>Standard electricity price in the tenant base currency per kWh.</summary>
    public decimal PlannedEnergyCostPerKwhBase { get; set; }
    /// <summary>Minimum whole calendar days to wait after the preceding routed operation ends.</summary>
    public int MinimumWaitDaysAfterPrevious { get; set; }
    /// <summary>Optional routing family used to match setup transitions; blank preserves legacy behavior.</summary>
    public string SetupFamilyCode { get; set; } = "";
    public ICollection<BillOfMaterialOperationWorkCenterOption> EligibleWorkCenters { get; set; } = new List<BillOfMaterialOperationWorkCenterOption>();
}

/// <summary>A tenant work center allowed for a recipe operation; exactly one option is preferred.</summary>
public sealed class BillOfMaterialOperationWorkCenterOption
{
    public Guid TenantId { get; set; }
    public Guid BillOfMaterialOperationId { get; set; }
    public Guid WorkCenterId { get; set; }
    public bool IsPreferred { get; set; }
}

public sealed class BillOfMaterialLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid BillOfMaterialId { get; set; }
    public Guid ComponentStockItemId { get; set; }
    public decimal Quantity { get; set; }
    public decimal ScrapPercent { get; set; }
    /// <summary>Planned component unit cost in the tenant base currency.</summary>
    public decimal StandardUnitCostBase { get; set; }
}

public sealed class ManufacturingOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public Guid BillOfMaterialId { get; set; }
    public Guid WarehouseId { get; set; }
    public decimal PlannedQuantity { get; set; }
    public ManufacturingOrderStatus Status { get; set; } = ManufacturingOrderStatus.Planned;
    public DateOnly PlannedDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public ICollection<ManufacturingOrderLine> Lines { get; set; } = new List<ManufacturingOrderLine>();
    public ICollection<ManufacturingOrderOperation> Operations { get; set; } = new List<ManufacturingOrderOperation>();
}

public sealed class MrpPlanSnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public DateOnly PlanDate { get; set; }
    public bool IncludesOpenSalesOrders { get; set; }
    public string SupplyCaveat { get; set; } = "";
    public string ResultJson { get; set; } = "";
    public string ConversionStateJson { get; set; } = "[]";
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class ManufacturingOrderOperation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ManufacturingOrderId { get; set; }
    public int Sequence { get; set; }
    public Guid WorkCenterId { get; set; }
    public string WorkCenterCodeSnapshot { get; set; } = "";
    public string WorkCenterNameSnapshot { get; set; } = "";
    public decimal SetupMinutes { get; set; }
    public decimal RunMinutes { get; set; }
    /// <summary>Snapshot of the recipe's minimum wait between this operation and its predecessor.</summary>
    public int MinimumWaitDaysAfterPrevious { get; set; }
    /// <summary>Immutable order-time snapshot of the recipe operation's transition family.</summary>
    public string SetupFamilyCodeSnapshot { get; set; } = "";
    /// <summary>Transition setup minutes selected by the scheduler from its routing snapshot.</summary>
    public decimal SequenceSetupMinutes { get; set; }
    /// <summary>JSON snapshot of transition rules for this operation's eligible work centers.</summary>
    public string SetupTransitionRulesSnapshotJson { get; set; } = "[]";
    public ICollection<ManufacturingOrderOperationWorkCenterOption> EligibleWorkCenters { get; set; } = new List<ManufacturingOrderOperationWorkCenterOption>();
    public decimal LaborCostPerHourBase { get; set; }
    public decimal OverheadCostPerHourBase { get; set; }
    /// <summary>Order-time snapshot of the planned electricity use for this operation.</summary>
    public decimal PlannedEnergyQuantityKwh { get; set; }
    public decimal PlannedEnergyCostPerKwhBase { get; set; }
    public decimal PlannedEnergyCostBase { get; set; }
    public decimal PlannedCostBase { get; set; }
    public ManufacturingOperationStatus Status { get; set; } = ManufacturingOperationStatus.Planned;
    public decimal? ActualSetupMinutes { get; set; }
    public decimal? ActualRunMinutes { get; set; }
    public decimal? ActualEnergyQuantityKwh { get; set; }
    public decimal? ActualEnergyCostPerKwhBase { get; set; }
    public decimal? ActualEnergyCostBase { get; set; }
    public decimal? ActualCostBase { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateOnly? ScheduledStartDate { get; set; }
    public DateOnly? ScheduledEndDate { get; set; }
    public int? ScheduledStartMinuteOfDay { get; set; }
    public int? ScheduledEndMinuteOfDay { get; set; }
}

/// <summary>Order-time snapshot of the machine eligibility matrix for a routed operation.</summary>
public sealed class ManufacturingOrderOperationWorkCenterOption
{
    public Guid TenantId { get; set; }
    public Guid ManufacturingOrderOperationId { get; set; }
    public Guid WorkCenterId { get; set; }
    public bool IsPreferred { get; set; }
}

public sealed class ManufacturingCapacityAllocation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ManufacturingOrderOperationId { get; set; }
    public Guid WorkCenterId { get; set; }
    public DateOnly ScheduledDate { get; set; }
    public decimal AllocatedMinutes { get; set; }
    public int StartMinuteOfDay { get; set; }
    public int EndMinuteOfDay { get; set; }
}

public sealed class ManufacturingOrderLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ManufacturingOrderId { get; set; }
    public Guid ComponentStockItemId { get; set; }
    public string ComponentCodeSnapshot { get; set; } = "";
    public string ComponentNameSnapshot { get; set; } = "";
    public decimal RequiredQuantity { get; set; }
    /// <summary>Immutable order-time copy of the BOM component standard cost.</summary>
    public decimal StandardUnitCostBaseSnapshot { get; set; }
    /// <summary>Planned component cost including the recipe scrap quantity.</summary>
    public decimal PlannedCostBase { get; set; }
}

public sealed class StockItemUnitConversion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid StockItemId { get; set; }
    public string UnitCode { get; set; } = "";
    public decimal FactorToBase { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum CustomFieldDataType { Text = 1, Decimal = 2, Date = 3, Boolean = 4 }

public sealed class StockItemCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StockItemCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StockItemCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid StockItemId { get; set; }
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StockItemCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid StockItemId { get; set; }
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Warehouse
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class WarehouseLocation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public Guid? ParentLocationId { get; set; }
    public WarehouseLocation? ParentLocation { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class WarehouseCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class WarehouseCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class WarehouseCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class WarehouseCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum InventoryDirection { Receipt = 1, Issue = 2 }
public enum InventoryTransferStatus { Posted = 1, Voided = 2 }
public enum InventoryCostAdjustmentKind { Revaluation = 1, LandedCost = 2, Reversal = 3 }

public sealed class InventoryTransfer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RequestId { get; set; }
    public Guid FromWarehouseId { get; set; }
    public Guid ToWarehouseId { get; set; }
    public string Code { get; set; } = "";
    public DateOnly TransferDate { get; set; }
    public InventoryTransferStatus Status { get; set; } = InventoryTransferStatus.Posted;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class InventoryTransaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public Guid? StorageLocationId { get; set; }
    public WarehouseLocation? StorageLocation { get; set; }
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public DateOnly EntryDate { get; set; }
    public InventoryDirection Direction { get; set; }
    public decimal Quantity { get; set; }
    public decimal? EnteredQuantity { get; set; }
    public string? EnteredUnitCode { get; set; }
    // Nullable for legacy movements and explicitly uncosted manual receipts.
    public decimal? UnitCostBase { get; set; }
    public string Description { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ReversalOfId { get; set; }
    public InventoryTransaction? ReversalOf { get; set; }
    public InventoryTransaction? ReversalEntry { get; set; }
    public Guid? SalesDeliveryLineId { get; set; }
    public SalesDeliveryLine? SalesDeliveryLine { get; set; }
    public Guid? SalesReturnLineId { get; set; }
    public SalesReturnLine? SalesReturnLine { get; set; }
    public Guid? PurchaseReceiptLineId { get; set; }
    public PurchaseReceiptLine? PurchaseReceiptLine { get; set; }
    public Guid? StandaloneSalesDeliveryLineId { get; set; }
    public StandaloneSalesDeliveryLine? StandaloneSalesDeliveryLine { get; set; }
    public Guid? StandalonePurchaseReceiptLineId { get; set; }
    public StandalonePurchaseReceiptLine? StandalonePurchaseReceiptLine { get; set; }
    public Guid? SupplierReturnLineId { get; set; }
    public SupplierReturnLine? SupplierReturnLine { get; set; }
    /// <summary>Stable tenant-scoped source for material issues posted while completing a manufacturing order.</summary>
    public Guid? ManufacturingOrderId { get; set; }
    public Guid? InventoryTransferId { get; set; }
    public InventoryTransfer? InventoryTransfer { get; set; }
    public ICollection<InventoryTransactionTrace> Tracking { get; set; } = new List<InventoryTransactionTrace>();
}

public sealed class InventoryTransactionTrace
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid InventoryTransactionId { get; set; }
    public InventoryTransaction InventoryTransaction { get; set; } = null!;
    public Guid StockItemId { get; set; }
    public InventoryTrackingMode TrackingMode { get; set; }
    public string TrackingCode { get; set; } = "";
    public decimal Quantity { get; set; }
    public DateOnly? ExpiryDate { get; set; }
}

public sealed class InventoryCostAdjustment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public DateOnly EntryDate { get; set; }
    public InventoryCostAdjustmentKind Kind { get; set; }
    public Guid? PurchaseReceiptId { get; set; }
    public Guid? StandalonePurchaseReceiptId { get; set; }
    public Guid? PurchaseInvoiceDraftId { get; set; }
    public string Description { get; set; } = "";
    public Guid? ReversalOfId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
    public ICollection<InventoryCostAdjustmentLine> Lines { get; set; } = new List<InventoryCostAdjustmentLine>();
}

public sealed class InventoryCostAdjustmentLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AdjustmentId { get; set; }
    public InventoryCostAdjustment Adjustment { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Guid StockItemId { get; set; }
    public Guid? PurchaseReceiptLineId { get; set; }
    public Guid? StandalonePurchaseReceiptLineId { get; set; }
    public decimal QuantitySnapshot { get; set; }
    public decimal? UnitCostSnapshotBase { get; set; }
    public decimal AmountBase { get; set; }
}

public enum PurchaseOrderStatus { Open = 1, PartiallyReceived = 2, Received = 3, Cancelled = 4, PendingApproval = 5, Rejected = 6 }
public enum PurchaseRequestStatus { Submitted = 1, Approved = 2, Rejected = 3, Ordered = 4 }
public enum PurchaseSupplierQuoteStatus { Submitted = 1, Selected = 2, NotSelected = 3 }

public sealed class PurchaseRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestedByUserId { get; set; }
    public TenantMembership RequestedBy { get; set; } = null!;
    public Guid? ReviewedByUserId { get; set; }
    public TenantMembership? ReviewedBy { get; set; }
    public string Code { get; set; } = "";
    public DateOnly RequestDate { get; set; }
    public DateOnly? NeededByDate { get; set; }
    public string Description { get; set; } = "";
    public PurchaseRequestStatus Status { get; set; } = PurchaseRequestStatus.Submitted;
    public string? ReviewNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAt { get; set; }
    public ICollection<PurchaseRequestLine> Lines { get; set; } = new List<PurchaseRequestLine>();
    public ICollection<PurchaseRequestCustomFieldValue> CustomFieldValues { get; set; } = new List<PurchaseRequestCustomFieldValue>();
    public ICollection<PurchaseSupplierQuote> SupplierQuotes { get; set; } = new List<PurchaseSupplierQuote>();
    public PurchaseOrder? PurchaseOrder { get; set; }
}

public sealed class PurchaseRequestCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseRequestCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseRequestCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid PurchaseRequestId { get; set; }
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseRequestCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PurchaseRequestId { get; set; }
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseRequestLine
{
    public Guid TenantId { get; set; }
    public Guid PurchaseRequestId { get; set; }
    public PurchaseRequest PurchaseRequest { get; set; } = null!;
    public int LineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
}

public sealed class PurchaseSupplierQuote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PurchaseRequestId { get; set; }
    public PurchaseRequest PurchaseRequest { get; set; } = null!;
    public Guid SupplierId { get; set; }
    public CustomerAccount Supplier { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly QuoteDate { get; set; }
    public DateOnly? ValidUntil { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public PurchaseSupplierQuoteStatus Status { get; set; } = PurchaseSupplierQuoteStatus.Submitted;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<PurchaseSupplierQuoteLine> Lines { get; set; } = new List<PurchaseSupplierQuoteLine>();
    public ICollection<PurchaseSupplierQuoteCustomFieldValue> CustomFieldValues { get; set; } = new List<PurchaseSupplierQuoteCustomFieldValue>();
    public ICollection<PurchaseSupplierQuoteCustomFieldValueRevision> CustomFieldValueRevisions { get; set; } = new List<PurchaseSupplierQuoteCustomFieldValueRevision>();
    public PurchaseOrder? PurchaseOrder { get; set; }
}

public sealed class PurchaseSupplierQuoteCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseSupplierQuoteCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseSupplierQuoteCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid QuoteId { get; set; }
    public PurchaseSupplierQuote Quote { get; set; } = null!;
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseSupplierQuoteCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid QuoteId { get; set; }
    public PurchaseSupplierQuote Quote { get; set; } = null!;
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseSupplierQuoteLine
{
    public Guid TenantId { get; set; }
    public Guid QuoteId { get; set; }
    public PurchaseSupplierQuote Quote { get; set; } = null!;
    public Guid PurchaseRequestId { get; set; }
    public int RequestLineNumber { get; set; }
    public PurchaseRequestLine RequestLine { get; set; } = null!;
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public sealed class PurchaseOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid SupplierId { get; set; }
    public CustomerAccount Supplier { get; set; } = null!;
    public Guid? SourcePurchaseRequestId { get; set; }
    public PurchaseRequest? SourcePurchaseRequest { get; set; }
    public Guid? SourceSupplierQuoteId { get; set; }
    public PurchaseSupplierQuote? SourceSupplierQuote { get; set; }
    public string Code { get; set; } = "";
    public DateOnly OrderDate { get; set; }
    public DateOnly? ExpectedReceiptDate { get; set; }
    public Guid? TargetWarehouseId { get; set; }
    public Warehouse? TargetWarehouse { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Open;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<PurchaseOrderLine> Lines { get; set; } = new List<PurchaseOrderLine>();
    public ICollection<PurchaseReceipt> Receipts { get; set; } = new List<PurchaseReceipt>();
    public ICollection<PurchaseOrderCustomFieldValue> CustomFieldValues { get; set; } = new List<PurchaseOrderCustomFieldValue>();
    public ICollection<PurchaseOrderCustomFieldValueRevision> CustomFieldValueRevisions { get; set; } = new List<PurchaseOrderCustomFieldValueRevision>();
}

public sealed class PurchaseOrderCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseOrderCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseOrderCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseOrderCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseOrderLine
{
    public Guid TenantId { get; set; }
    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public int LineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public enum PurchaseReceiptStatus { Posted = 1, Voided = 2 }

public enum StandaloneInventoryDocumentStatus { Draft = 0, Posted = 1, Voided = 2 }

/// <summary>Sales dispatch that is not sourced from a sales order.</summary>
public sealed class StandaloneSalesDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RequestId { get; set; }
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly DeliveryDate { get; set; }
    public StandaloneInventoryDocumentStatus Status { get; set; } = StandaloneInventoryDocumentStatus.Draft;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<StandaloneSalesDeliveryLine> Lines { get; set; } = new List<StandaloneSalesDeliveryLine>();
}

public sealed class StandaloneSalesDeliveryLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DeliveryId { get; set; }
    public StandaloneSalesDelivery Delivery { get; set; } = null!;
    public int LineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal? EnteredQuantity { get; set; }
    public string? EnteredUnitCode { get; set; }
    public string? TrackingCode { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public Guid? StorageLocationId { get; set; }
    public WarehouseLocation? StorageLocation { get; set; }
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
}

/// <summary>Purchase receipt that is not sourced from a purchase order.</summary>
public sealed class StandalonePurchaseReceipt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RequestId { get; set; }
    public Guid SupplierId { get; set; }
    public CustomerAccount Supplier { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly ReceiptDate { get; set; }
    public StandaloneInventoryDocumentStatus Status { get; set; } = StandaloneInventoryDocumentStatus.Draft;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<StandalonePurchaseReceiptLine> Lines { get; set; } = new List<StandalonePurchaseReceiptLine>();
}

public sealed class StandalonePurchaseReceiptLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ReceiptId { get; set; }
    public StandalonePurchaseReceipt Receipt { get; set; } = null!;
    public int LineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal UnitCostBase { get; set; }
    public decimal? EnteredQuantity { get; set; }
    public string? EnteredUnitCode { get; set; }
    public string? TrackingCode { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public Guid? StorageLocationId { get; set; }
    public WarehouseLocation? StorageLocation { get; set; }
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
}

public sealed class PurchaseReceipt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestId { get; set; }
    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly ReceiptDate { get; set; }
    public PurchaseReceiptStatus Status { get; set; } = PurchaseReceiptStatus.Posted;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<PurchaseReceiptLine> Lines { get; set; } = new List<PurchaseReceiptLine>();
    public ICollection<PurchaseInvoice> Invoices { get; set; } = new List<PurchaseInvoice>();
    public ICollection<PurchaseReceiptCustomFieldValue> CustomFieldValues { get; set; } = new List<PurchaseReceiptCustomFieldValue>();
    public ICollection<PurchaseReceiptCustomFieldValueRevision> CustomFieldValueRevisions { get; set; } = new List<PurchaseReceiptCustomFieldValueRevision>();
}

public sealed class PurchaseReceiptCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseReceiptCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseReceiptCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid ReceiptId { get; set; }
    public PurchaseReceipt Receipt { get; set; } = null!;
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
}

public sealed class PurchaseReceiptCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ReceiptId { get; set; }
    public PurchaseReceipt Receipt { get; set; } = null!;
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PurchaseReceiptLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ReceiptId { get; set; }
    public PurchaseReceipt Receipt { get; set; } = null!;
    public Guid PurchaseOrderId { get; set; }
    public int OrderLineNumber { get; set; }
    public PurchaseOrderLine OrderLine { get; set; } = null!;
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal? EnteredQuantity { get; set; }
    public string? EnteredUnitCode { get; set; }
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
}

/// <summary>
/// Supplier-issued delivery note evidence. This document records quantities only and never posts inventory.
/// </summary>
public sealed class PurchaseDeliveryNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public Guid? PurchaseReceiptId { get; set; }
    public PurchaseReceipt? PurchaseReceipt { get; set; }
    public string DocumentNumber { get; set; } = "";
    public DateOnly DocumentDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<PurchaseDeliveryNoteLine> Lines { get; set; } = new List<PurchaseDeliveryNoteLine>();
}

public sealed class PurchaseDeliveryNoteLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DeliveryNoteId { get; set; }
    public PurchaseDeliveryNote DeliveryNote { get; set; } = null!;
    public Guid PurchaseOrderId { get; set; }
    public int OrderLineNumber { get; set; }
    public decimal Quantity { get; set; }
    public string UnitCode { get; set; } = "EA";
}

public enum PurchaseInvoiceStatus { Posted = 1, Voided = 2 }

public sealed class PurchaseInvoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid PurchaseReceiptId { get; set; }
    public PurchaseReceipt PurchaseReceipt { get; set; } = null!;
    public Guid PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public Guid SupplierId { get; set; }
    public CustomerAccount Supplier { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly InvoiceDate { get; set; }
    public DateOnly DueDate { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public PurchaseInvoiceStatus Status { get; set; } = PurchaseInvoiceStatus.Posted;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<PurchaseInvoiceLine> Lines { get; set; } = new List<PurchaseInvoiceLine>();
    public ICollection<SupplierPayment> Payments { get; set; } = new List<SupplierPayment>();
    public ICollection<SupplierReturn> Returns { get; set; } = new List<SupplierReturn>();
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
}

public sealed class PurchaseInvoiceLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PurchaseInvoiceId { get; set; }
    public PurchaseInvoice PurchaseInvoice { get; set; } = null!;
    public Guid PurchaseReceiptLineId { get; set; }
    public Guid PurchaseReceiptId { get; set; }
    public PurchaseReceiptLine PurchaseReceiptLine { get; set; } = null!;
    public int OrderLineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public enum SupplierReturnStatus { Posted = 1, Voided = 2 }

public sealed class SupplierReturn
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestId { get; set; }
    public Guid PurchaseInvoiceId { get; set; }
    public PurchaseInvoice PurchaseInvoice { get; set; } = null!;
    public Guid SupplierId { get; set; }
    public CustomerAccount Supplier { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly ReturnDate { get; set; }
    public SupplierReturnStatus Status { get; set; } = SupplierReturnStatus.Posted;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<SupplierReturnLine> Lines { get; set; } = new List<SupplierReturnLine>();
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
}

public sealed class SupplierReturnLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid SupplierReturnId { get; set; }
    public SupplierReturn SupplierReturn { get; set; } = null!;
    public Guid PurchaseInvoiceId { get; set; }
    public Guid PurchaseInvoiceLineId { get; set; }
    public PurchaseInvoiceLine PurchaseInvoiceLine { get; set; } = null!;
    public int OrderLineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal? EnteredQuantity { get; set; }
    public string? EnteredUnitCode { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
}

public enum SupplierPaymentStatus { Posted = 1, Voided = 2 }

public sealed class SupplierPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestId { get; set; }
    public Guid PurchaseInvoiceId { get; set; }
    public PurchaseInvoice PurchaseInvoice { get; set; } = null!;
    public Guid SupplierId { get; set; }
    public CustomerAccount Supplier { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly PaymentDate { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = "Bank transfer";
    public string? Reference { get; set; }
    public SupplierPaymentStatus Status { get; set; } = SupplierPaymentStatus.Posted;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? FinancialAccountId { get; set; }
    public FinancialAccount? FinancialAccount { get; set; }
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
    public ICollection<FinancialAccountTransaction> FinancialTransactions { get; set; } = new List<FinancialAccountTransaction>();
}

public enum SalesQuoteStatus { Draft = 1, Sent = 2, Accepted = 3, Rejected = 4, Expired = 5 }

public sealed class SalesQuote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly QuoteDate { get; set; }
    public DateOnly ValidUntil { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public SalesQuoteStatus Status { get; set; } = SalesQuoteStatus.Draft;
    public string? Notes { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<SalesQuoteLine> Lines { get; set; } = new List<SalesQuoteLine>();
    public SalesOrder? Order { get; set; }
}

public sealed class SalesPromotionCampaign
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal DiscountPercent { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly EffectiveThrough { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}

public sealed class SalesPromotionApplication
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CampaignId { get; set; }
    public Guid QuoteId { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal DiscountAmount { get; set; }
    public DateOnly AppliedOn { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? AppliedByUserId { get; set; }
}

public sealed class SalesQuoteLine
{
    public Guid TenantId { get; set; }
    public Guid QuoteId { get; set; }
    public SalesQuote Quote { get; set; } = null!;
    public int LineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public sealed class SalesQuoteCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesQuoteCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesQuoteCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid QuoteId { get; set; }
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesQuoteCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid QuoteId { get; set; }
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum SalesOrderStatus { Open = 1, Fulfilled = 2, Cancelled = 3 }

public sealed class SalesOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid QuoteId { get; set; }
    public SalesQuote Quote { get; set; } = null!;
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly OrderDate { get; set; }
    public DateOnly? RequestedDeliveryDate { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public SalesOrderStatus Status { get; set; } = SalesOrderStatus.Open;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<SalesOrderLine> Lines { get; set; } = new List<SalesOrderLine>();
    public ICollection<SalesOrderReservation> Reservations { get; set; } = new List<SalesOrderReservation>();
    public ICollection<SalesDelivery> Deliveries { get; set; } = new List<SalesDelivery>();
}

public sealed class SalesOrderCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesOrderCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesOrderCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid OrderId { get; set; }
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesOrderCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid OrderId { get; set; }
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesInvoiceCustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; } = 200;
    public int Version { get; set; } = 1;
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesInvoiceCustomFieldDefinitionRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public int Version { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public CustomFieldDataType DataType { get; set; }
    public int MaxLength { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public string ChangeKind { get; set; } = "";
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesInvoiceCustomFieldValue
{
    public Guid TenantId { get; set; }
    public Guid InvoiceId { get; set; }
    public Guid DefinitionId { get; set; }
    public string Value { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesInvoiceCustomFieldValueRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid InvoiceId { get; set; }
    public Guid DefinitionId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public int DefinitionVersion { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SalesOrderLine
{
    public Guid TenantId { get; set; }
    public Guid OrderId { get; set; }
    public SalesOrder Order { get; set; } = null!;
    public int LineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public enum SalesOrderReservationStatus { Active = 1, Released = 2 }

public sealed class SalesOrderReservation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestId { get; set; }
    public Guid OrderId { get; set; }
    public SalesOrder Order { get; set; } = null!;
    public int OrderLineNumber { get; set; }
    public SalesOrderLine OrderLine { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public decimal Quantity { get; set; }
    public decimal FulfilledQuantity { get; set; }
    public SalesOrderReservationStatus Status { get; set; } = SalesOrderReservationStatus.Active;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReleasedAt { get; set; }
}

public enum SalesDeliveryStatus { Posted = 1, Voided = 2 }

public sealed class SalesDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RequestId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid OrderId { get; set; }
    public SalesOrder Order { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly DeliveryDate { get; set; }
    public SalesDeliveryStatus Status { get; set; } = SalesDeliveryStatus.Posted;
    public SalesInvoice? Invoice { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<SalesDeliveryLine> Lines { get; set; } = new List<SalesDeliveryLine>();
}

public sealed class SalesDeliveryLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DeliveryId { get; set; }
    public SalesDelivery Delivery { get; set; } = null!;
    public Guid OrderId { get; set; }
    public int OrderLineNumber { get; set; }
    public SalesOrderLine OrderLine { get; set; } = null!;
    public Guid? ReservationId { get; set; }
    public SalesOrderReservation? Reservation { get; set; }
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal? EnteredQuantity { get; set; }
    public string? EnteredUnitCode { get; set; }
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
    public SalesInvoiceLine? InvoiceLine { get; set; }
}

public enum SalesInvoiceStatus { Posted = 1, Voided = 2 }

public sealed class SalesInvoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid DeliveryId { get; set; }
    public SalesDelivery Delivery { get; set; } = null!;
    public Guid OrderId { get; set; }
    public SalesOrder Order { get; set; } = null!;
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly InvoiceDate { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public SalesInvoiceStatus Status { get; set; } = SalesInvoiceStatus.Posted;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<SalesInvoiceLine> Lines { get; set; } = new List<SalesInvoiceLine>();
    public ICollection<SalesInvoiceCustomFieldValue> CustomFieldValues { get; set; } = new List<SalesInvoiceCustomFieldValue>();
    public ICollection<SalesInvoiceCustomFieldValueRevision> CustomFieldValueRevisions { get; set; } = new List<SalesInvoiceCustomFieldValueRevision>();
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
    public ICollection<SalesReturn> Returns { get; set; } = new List<SalesReturn>();
}

public sealed class SalesInvoiceLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid InvoiceId { get; set; }
    public SalesInvoice Invoice { get; set; } = null!;
    public Guid DeliveryLineId { get; set; }
    public SalesDeliveryLine DeliveryLine { get; set; } = null!;
    public int OrderLineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public enum CustomerCollectionStatus { Posted = 1, Voided = 2 }

public sealed class CustomerCollection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public Guid RequestId { get; set; }
    public string Code { get; set; } = "";
    public DateOnly CollectionDate { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = "Bank transfer";
    public string? Reference { get; set; }
    public CustomerCollectionStatus Status { get; set; } = CustomerCollectionStatus.Posted;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? FinancialAccountId { get; set; }
    public FinancialAccount? FinancialAccount { get; set; }
    public ICollection<CustomerCollectionAllocation> Allocations { get; set; } = new List<CustomerCollectionAllocation>();
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
    public ICollection<FinancialAccountTransaction> FinancialTransactions { get; set; } = new List<FinancialAccountTransaction>();
}

public enum FinancialAccountType { Cash = 1, Bank = 2 }
public enum FinancialDirection { Inflow = 1, Outflow = 2 }
public enum CashFlowCategory { Unclassified = 0, Operating = 1, Investing = 2, Financing = 3, InternalTransfer = 4, OpeningBalance = 5 }
public enum FinancialTransferStatus { Posted = 1, Voided = 2 }
public enum BankStatementStatus { Imported = 1, Reconciled = 2 }
public enum PaymentInstrumentType { Check = 1, PromissoryNote = 2 }
public enum PaymentInstrumentDirection { Receivable = 1, Payable = 2 }
public enum PaymentInstrumentStatus { Portfolio = 1, Endorsed = 2, Collected = 3, Bounced = 4, Cancelled = 5 }

/// <summary>Company-scoped portfolio instrument. Collection and bounce movements are recorded separately in the cash/bank ledger.</summary>
public sealed class PaymentInstrument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestId { get; set; }
    public PaymentInstrumentType Type { get; set; }
    public PaymentInstrumentDirection Direction { get; set; }
    public PaymentInstrumentStatus Status { get; set; } = PaymentInstrumentStatus.Portfolio;
    public string Code { get; set; } = "";
    public string InstrumentNumber { get; set; } = "";
    public string CounterpartyName { get; set; } = "";
    /// <summary>Stable customer/supplier identity when the instrument is entered after this field was introduced. Older instruments may have only the display name.</summary>
    public Guid? CounterpartyAccountId { get; set; }
    public CustomerAccount? CounterpartyAccount { get; set; }
    public string BankName { get; set; } = "";
    public string CurrencyCode { get; set; } = "TRY";
    public decimal Amount { get; set; }
    public DateOnly IssueDate { get; set; }
    public DateOnly DueDate { get; set; }
    public DateOnly PortfolioDate { get; set; }
    public string? EndorsedTo { get; set; }
    public DateTimeOffset? EndorsedAt { get; set; }
    public DateTimeOffset? CollectedAt { get; set; }
    public Guid? FinancialAccountId { get; set; }
    public FinancialAccount? FinancialAccount { get; set; }
    public Guid? FinancialAccountTransactionId { get; set; }
    public FinancialAccountTransaction? FinancialAccountTransaction { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<PaymentInstrumentEvent> Events { get; set; } = new List<PaymentInstrumentEvent>();
}

public sealed class PaymentInstrumentEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid PaymentInstrumentId { get; set; }
    public PaymentInstrument PaymentInstrument { get; set; } = null!;
    public Guid RequestId { get; set; }
    public string EventType { get; set; } = "";
    public PaymentInstrumentStatus? PreviousStatus { get; set; }
    public PaymentInstrumentStatus NewStatus { get; set; }
    public DateOnly EventDate { get; set; }
    public string? Note { get; set; }
    public Guid? FinancialAccountTransactionId { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class BankStatement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid AccountId { get; set; }
    public FinancialAccount Account { get; set; } = null!;
    public string CurrencyCode { get; set; } = "TRY";
    public Guid RequestId { get; set; }
    public string Code { get; set; } = "";
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public decimal OpeningBalance { get; set; }
    public decimal ClosingBalance { get; set; }
    public BankStatementStatus Status { get; set; } = BankStatementStatus.Imported;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<BankStatementLine> Lines { get; set; } = new List<BankStatementLine>();
}

public sealed class BankStatementLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid StatementId { get; set; }
    public BankStatement Statement { get; set; } = null!;
    public Guid FinancialAccountId { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public int LineNumber { get; set; }
    public string? ExternalId { get; set; }
    public DateOnly TransactionDate { get; set; }
    public FinancialDirection Direction { get; set; }
    public decimal Amount { get; set; }
    public string Description { get; set; } = "";
    public string? Reference { get; set; }
    public Guid? FinancialAccountTransactionId { get; set; }
    public FinancialAccountTransaction? FinancialAccountTransaction { get; set; }
    public bool IsBookEntryCreated { get; set; }
    public DateTimeOffset? MatchedAt { get; set; }
}

public sealed class FinancialAccountTransfer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestId { get; set; }
    public string Code { get; set; } = "";
    public Guid FromAccountId { get; set; }
    public Guid ToAccountId { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public string ToCurrencyCode { get; set; } = "TRY";
    public DateOnly TransferDate { get; set; }
    public decimal Amount { get; set; }
    public decimal DestinationAmount { get; set; }
    public decimal ExchangeRate { get; set; } = 1m;
    public string? Reference { get; set; }
    public string Description { get; set; } = "";
    public FinancialTransferStatus Status { get; set; } = FinancialTransferStatus.Posted;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<FinancialAccountTransaction> Transactions { get; set; } = new List<FinancialAccountTransaction>();
}

public sealed class FinancialAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public FinancialAccountType Type { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<FinancialAccountTransaction> Transactions { get; set; } = new List<FinancialAccountTransaction>();
    public ICollection<BankStatement> BankStatements { get; set; } = new List<BankStatement>();
}

public enum CreditFacilityStatus { Active = 1, Closed = 2 }
public enum CreditFacilityScheduleStatus { Planned = 1, Paid = 2, Cancelled = 3 }
public enum CreditFacilityMovementType { Drawdown = 1, Repayment = 2, Reversal = 3 }
public enum CreditSecurityType { Guarantee = 1, Collateral = 2 }
public enum CreditSecurityStatus { Active = 1, Released = 2, Called = 3, Expired = 4 }

public sealed class CreditFacility
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public string LenderName { get; set; } = "";
    public string FacilityType { get; set; } = "Loan";
    public string CurrencyCode { get; set; } = "TRY";
    public decimal ApprovedLimit { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? MaturityDate { get; set; }
    public decimal? AnnualInterestRatePercent { get; set; }
    public CreditFacilityStatus Status { get; set; } = CreditFacilityStatus.Active;
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<CreditFacilitySchedule> Schedule { get; set; } = new List<CreditFacilitySchedule>();
    public ICollection<CreditFacilityMovement> Movements { get; set; } = new List<CreditFacilityMovement>();
    public ICollection<CreditFacilitySecurity> Securities { get; set; } = new List<CreditFacilitySecurity>();
}

public sealed class CreditFacilitySecurity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CreditFacilityId { get; set; }
    public CreditFacility CreditFacility { get; set; } = null!;
    public CreditSecurityType Type { get; set; }
    public string Code { get; set; } = "";
    public string Issuer { get; set; } = "";
    public string Beneficiary { get; set; } = "";
    public decimal Amount { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public decimal CommissionAmount { get; set; }
    public DateOnly IssueDate { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public CreditSecurityStatus Status { get; set; } = CreditSecurityStatus.Active;
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CreditFacilitySchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CreditFacilityId { get; set; }
    public CreditFacility CreditFacility { get; set; } = null!;
    public DateOnly DueDate { get; set; }
    public decimal PrincipalAmount { get; set; }
    public decimal InterestAmount { get; set; }
    public decimal FeeAmount { get; set; }
    public CreditFacilityScheduleStatus Status { get; set; } = CreditFacilityScheduleStatus.Planned;
    public DateOnly? PaidDate { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CreditFacilityMovement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CreditFacilityId { get; set; }
    public CreditFacility CreditFacility { get; set; } = null!;
    public Guid FinancialAccountTransactionId { get; set; }
    public FinancialAccountTransaction FinancialAccountTransaction { get; set; } = null!;
    public Guid? CreditFacilityScheduleId { get; set; }
    public CreditFacilitySchedule? CreditFacilitySchedule { get; set; }
    public Guid? ReversesMovementId { get; set; }
    public CreditFacilityMovement? ReversesMovement { get; set; }
    public ICollection<CreditFacilityMovement> Reversals { get; set; } = new List<CreditFacilityMovement>();
    public Guid RequestId { get; set; }
    public CreditFacilityMovementType Type { get; set; }
    public DateOnly TransactionDate { get; set; }
    public decimal PrincipalAmount { get; set; }
    public decimal InterestAmount { get; set; }
    public decimal FeeAmount { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class FinancialAccountTransaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid FinancialAccountId { get; set; }
    public FinancialAccount FinancialAccount { get; set; } = null!;
    public string CurrencyCode { get; set; } = "TRY";
    public DateOnly TransactionDate { get; set; }
    public FinancialDirection Direction { get; set; }
    public CashFlowCategory CashFlowCategory { get; set; } = CashFlowCategory.Unclassified;
    public decimal Amount { get; set; }
    public string Description { get; set; } = "";
    public string? Reference { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ReversalOfId { get; set; }
    public FinancialAccountTransaction? ReversalOf { get; set; }
    public FinancialAccountTransaction? ReversalEntry { get; set; }
    public Guid? CustomerCollectionId { get; set; }
    public CustomerCollection? CustomerCollection { get; set; }
    public Guid? SupplierPaymentId { get; set; }
    public SupplierPayment? SupplierPayment { get; set; }
    public Guid? TransferId { get; set; }
    public FinancialAccountTransfer? Transfer { get; set; }
    public Guid? RequestId { get; set; }
    public BankStatementLine? BankStatementMatch { get; set; }
}

public sealed class CustomerCollectionAllocation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CustomerCollectionId { get; set; }
    public CustomerCollection CustomerCollection { get; set; } = null!;
    public Guid SalesInvoiceId { get; set; }
    public SalesInvoice SalesInvoice { get; set; } = null!;
    public decimal Amount { get; set; }
}

public enum SalesReturnStatus { Posted = 1, Voided = 2 }

public sealed class SalesReturn
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid RequestId { get; set; }
    public Guid SalesInvoiceId { get; set; }
    public SalesInvoice SalesInvoice { get; set; } = null!;
    public Guid CustomerId { get; set; }
    public CustomerAccount Customer { get; set; } = null!;
    public Guid WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;
    public string Code { get; set; } = "";
    public DateOnly ReturnDate { get; set; }
    public SalesReturnStatus Status { get; set; } = SalesReturnStatus.Posted;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<SalesReturnLine> Lines { get; set; } = new List<SalesReturnLine>();
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
}

public sealed class SalesReturnLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid SalesReturnId { get; set; }
    public SalesReturn SalesReturn { get; set; } = null!;
    public Guid SalesInvoiceLineId { get; set; }
    public SalesInvoiceLine SalesInvoiceLine { get; set; } = null!;
    public int OrderLineNumber { get; set; }
    public Guid StockItemId { get; set; }
    public string StockCode { get; set; } = "";
    public string StockName { get; set; } = "";
    public string UnitCode { get; set; } = "EA";
    public decimal Quantity { get; set; }
    public decimal? EnteredQuantity { get; set; }
    public string? EnteredUnitCode { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
}

public sealed class TenantMembership
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Role { get; set; } = "TenantUser";
}

public enum TenantPermissionSubjectType { Role = 1, User = 2 }
public enum TenantPermissionEffect { Allow = 1, Deny = 2 }
public enum TenantPermissionConditionOperator { Equals = 1, NotEquals = 2, In = 3 }

public sealed class PermissionDefinition
{
    public string Code { get; set; } = "";
    public string ResourceType { get; set; } = "";
    public string Action { get; set; } = "";
    public string Description { get; set; } = "";
}

public sealed class TenantPermissionRule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public TenantPermissionSubjectType SubjectType { get; set; }
    public string? SubjectRole { get; set; }
    public Guid? SubjectUserId { get; set; }
    public string PermissionCode { get; set; } = "";
    public PermissionDefinition Permission { get; set; } = null!;
    public TenantPermissionEffect Effect { get; set; }
    public string? ResourceType { get; set; }
    public string? AttributeName { get; set; }
    public TenantPermissionConditionOperator? AttributeOperator { get; set; }
    public string? AttributeValue { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantCustomFormDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public int Version { get; set; } = 1;
    public string Status { get; set; } = "Draft";
    public string FieldsJson { get; set; } = "[]";
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantCustomFormRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid FormId { get; set; }
    public TenantCustomFormDefinition Form { get; set; } = null!;
    public int Version { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Status { get; set; } = "Draft";
    public string FieldsJson { get; set; } = "[]";
    public string ChangeKind { get; set; } = "Updated";
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantCustomFormSubmission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid FormId { get; set; }
    public TenantCustomFormDefinition Form { get; set; } = null!;
    public string FormCode { get; set; } = "";
    public string FormName { get; set; } = "";
    public int FormVersion { get; set; }
    public string FieldsJsonSnapshot { get; set; } = "[]";
    public string ValuesJson { get; set; } = "{}";
    public string Status { get; set; } = "Submitted";
    public Guid SubmittedByUserId { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? DecidedByUserId { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public string? DecisionReason { get; set; }
}

/// <summary>A tenant-scoped, allowlisted layout override for a built-in ERP list screen.</summary>
public sealed class TenantScreenView
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string ScreenKey { get; set; } = "";
    public string Name { get; set; } = "";
    public string LayoutJson { get; set; } = "[]";
    public int Revision { get; set; } = 1;
    public bool IsPublished { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<TenantScreenViewRevision> Revisions { get; set; } = new List<TenantScreenViewRevision>();
}

public sealed class TenantScreenViewRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ScreenViewId { get; set; }
    public TenantScreenView ScreenView { get; set; } = null!;
    public int Revision { get; set; }
    public string ScreenKey { get; set; } = "";
    public string Name { get; set; } = "";
    public string LayoutJson { get; set; } = "[]";
    public string ChangeKind { get; set; } = "Updated";
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantWorkflowDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public int Version { get; set; } = 1;
    public string Status { get; set; } = "Draft";
    public string StepsJson { get; set; } = "[]";
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantWorkflowInstance
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid DefinitionId { get; set; }
    public TenantWorkflowDefinition Definition { get; set; } = null!;
    public string DefinitionCode { get; set; } = "";
    public string DefinitionName { get; set; } = "";
    public int DefinitionVersion { get; set; }
    public string StepsJsonSnapshot { get; set; } = "[]";
    public string SubjectType { get; set; } = "";
    public string SubjectTitle { get; set; } = "";
    public Guid? SubjectId { get; set; }
    public string ContextJson { get; set; } = "{}";
    public string Status { get; set; } = "Pending";
    public int CurrentStepIndex { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public Guid StartedByUserId { get; set; }
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class TenantWorkflowAction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid InstanceId { get; set; }
    public TenantWorkflowInstance Instance { get; set; } = null!;
    public int StepIndex { get; set; }
    public string StepName { get; set; } = "";
    public string Decision { get; set; } = "Approved";
    public string? Comment { get; set; }
    public Guid ActorUserId { get; set; }
    public string ActorRole { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantBusinessRuleDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Trigger { get; set; } = "purchase-request.submitted";
    public int Version { get; set; } = 1;
    public string Status { get; set; } = "Draft";
    public string ConditionsJson { get; set; } = "[]";
    public string WorkflowCode { get; set; } = "";
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantBusinessRuleEvaluation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RuleId { get; set; }
    public TenantBusinessRuleDefinition Rule { get; set; } = null!;
    public Guid EventId { get; set; }
    public bool Matched { get; set; }
    public Guid? WorkflowInstanceId { get; set; }
    public TenantWorkflowInstance? WorkflowInstance { get; set; }
    public string Details { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantSavedReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "Report";
    public string Source { get; set; } = "customers";
    public string DefinitionJson { get; set; } = "{}";
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public int DefinitionRevision { get; set; } = 1;
    public ICollection<TenantSavedReportRevision> Revisions { get; set; } = new List<TenantSavedReportRevision>();
}

public sealed class TenantSavedReportRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid SavedReportId { get; set; }
    public TenantSavedReport SavedReport { get; set; } = null!;
    public int Revision { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "Report";
    public string Source { get; set; } = "customers";
    public string DefinitionJson { get; set; } = "{}";
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantDashboardWidget
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid SavedReportId { get; set; }
    public TenantSavedReport SavedReport { get; set; } = null!;
    public int Position { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TenantCustomMenuEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public string TargetPage { get; set; } = "";
    public int Position { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public Guid? TenantId { get; set; }
    public Guid? UserId { get; set; }
    public string Action { get; set; } = "";
    public string Resource { get; set; } = "";
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DevelopmentRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? ProjectId { get; set; }
    public DevelopmentProject? Project { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Status { get; set; } = "Submitted";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DevelopmentProject
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Name { get; set; } = "";
    public string RepositoryUrl { get; set; } = "";
    public string DefaultBranch { get; set; } = "main";
    public long? GitHubInstallationId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<DevelopmentProjectAccess> AccessGrants { get; set; } = new List<DevelopmentProjectAccess>();
}

public sealed class GitHubInstallationAuthorizationState
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public string StateHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}

public sealed class DevelopmentProjectAccess
{
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public DevelopmentProject Project { get; set; } = null!;
    public Guid UserId { get; set; }
    public string AccessLevel { get; set; } = "Viewer";
    public Guid GrantedByUserId { get; set; }
    public DateTimeOffset GrantedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>User-confirmed tenant mapping from an enabled ERP module code to an existing Studio project and bounded source scope.</summary>
public sealed class StudioModuleSourceMapping
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string ModuleCode { get; set; } = "";
    public Guid ProjectId { get; set; }
    public string Ref { get; set; } = "main";
    public string PathAllowlistJson { get; set; } = "[]";
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DevelopmentWorkspaceRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? DevelopmentRequestId { get; set; }
    public DevelopmentRequest? DevelopmentRequest { get; set; }
    public Guid RequestedByUserId { get; set; }
    public string BranchName { get; set; } = "main";
    public string? WorkspaceBranchName { get; set; }
    public string Status { get; set; } = "PendingApproval";
    public Guid? ReviewedByUserId { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? ReviewNote { get; set; }
    public string? CommitSha { get; set; }
    public string? ProvisioningError { get; set; }
    public DateTimeOffset? ProvisionedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ArchitecturePlanRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string BranchName { get; set; } = "main";
    public string CommitSha { get; set; } = "";
    public string Summary { get; set; } = "";
    public string PlanJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AITestPlanRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string BranchName { get; set; } = "main";
    public string CommitSha { get; set; } = "";
    public string Summary { get; set; } = "";
    public string PlanJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ReleaseCandidateRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid TestJobId { get; set; }
    public string BranchName { get; set; } = "";
    public string CommitSha { get; set; } = "";
    public string TestTargetPath { get; set; } = "";
    public string TestSnapshotSha256 { get; set; } = "";
    public DateTimeOffset TestCompletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public int? GitHubPullRequestNumber { get; set; }
    public string? GitHubPullRequestUrl { get; set; }
    public string? GitHubRepository { get; set; }
    public string? GitHubBaseBranch { get; set; }
    public string? GitHubPullRequestState { get; set; }
    public DateTimeOffset? GitHubPullRequestUpdatedAt { get; set; }
}

public sealed class StudioReleaseVersionRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid ReleaseCandidateId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Version { get; set; } = "";
    public string CommitSha { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StudioReleasePackageRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid ReleaseVersionId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Version { get; set; } = "";
    public string CommitSha { get; set; } = "";
    public string TestSnapshotSha256 { get; set; } = "";
    public string PackageSha256 { get; set; } = "";
    public string FileName { get; set; } = "";
    public long SizeBytes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StudioReleaseDeploymentRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid ReleasePackageId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid? RollbackOfDeploymentId { get; set; }
    public Guid? RollbackTargetDeploymentId { get; set; }
    public Guid IdempotencyKey { get; set; } = Guid.NewGuid();
    public string Environment { get; set; } = "Staging";
    public string Provider { get; set; } = "DockerCompose";
    public string Status { get; set; } = "Queued";
    public string PackageSha256 { get; set; } = "";
    public string CommitSha { get; set; } = "";
    public string? ProviderDeploymentId { get; set; }
    public string? EnvironmentUrl { get; set; }
    public string? FailureCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class ReleaseCandidateReviewRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid ReleaseCandidateId { get; set; }
    public Guid ReviewedByUserId { get; set; }
    public string Decision { get; set; } = "Rejected";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StudioProductionPromotionApprovalRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid StagingDeploymentId { get; set; }
    public Guid ReleasePackageId { get; set; }
    public Guid RequestedByUserId { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public string Status { get; set; } = "AwaitingReview";
    public string RequestNote { get; set; } = "";
    public string? ReviewNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAt { get; set; }
}

public sealed class StudioConversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Title { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StudioConversationMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ConversationId { get; set; }
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StudioKnowledgeDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid IndexedByUserId { get; set; }
    public string Path { get; set; } = "";
    public string ContentSha256 { get; set; } = "";
    public string CommitSha { get; set; } = "";
    public string Content { get; set; } = "";
    public string? EmbeddingModel { get; set; }
    public string? EmbeddingJson { get; set; }
    public DateTimeOffset IndexedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StudioKnowledgeRefreshConsent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid GrantedByUserId { get; set; }
    public string SelectedPathsJson { get; set; } = "[]";
    public DateTimeOffset GrantedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastRefreshedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class StudioCodeReviewThread
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceRequestId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Path { get; set; } = "";
    public int LineNumber { get; set; }
    public string HeadCommitSha { get; set; } = "";
    public string Status { get; set; } = "Open";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class StudioCodeReviewComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ThreadId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Body { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public long? GitHubReviewCommentId { get; set; }
    public DateTimeOffset? GitHubSyncedAt { get; set; }
    public string? GitHubAuthorLogin { get; set; }
    public int? GitHubPullRequestNumber { get; set; }
    public string? GitHubRepository { get; set; }
}
