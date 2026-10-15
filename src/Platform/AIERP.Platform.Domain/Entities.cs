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

public sealed class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public string BaseCurrencyCode { get; set; } = "TRY";
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

public enum CounterpartyType { Customer = 1, Supplier = 2, Both = 3 }
public enum CustomerAddressKind { General = 1, Billing = 2, Delivery = 3 }

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
    public Guid? GroupId { get; set; }
    public CustomerGroup? Group { get; set; }
    public string CurrencyCode { get; set; } = "TRY";
    public decimal? RiskLimit { get; set; }
    public int PaymentTermDays { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<CustomerAddress> Addresses { get; set; } = new List<CustomerAddress>();
    public ICollection<CustomerLedgerEntry> LedgerEntries { get; set; } = new List<CustomerLedgerEntry>();
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
    public bool IsDefault { get; set; }
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
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public byte[] RowVersion { get; set; } = [];
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

public enum InventoryDirection { Receipt = 1, Issue = 2 }
public enum InventoryTransferStatus { Posted = 1, Voided = 2 }

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
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public DateOnly EntryDate { get; set; }
    public InventoryDirection Direction { get; set; }
    public decimal Quantity { get; set; }
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
    public Guid? SupplierReturnLineId { get; set; }
    public SupplierReturnLine? SupplierReturnLine { get; set; }
    public Guid? InventoryTransferId { get; set; }
    public InventoryTransfer? InventoryTransfer { get; set; }
}

public enum PurchaseOrderStatus { Open = 1, PartiallyReceived = 2, Received = 3, Cancelled = 4 }
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
    public PurchaseOrder? PurchaseOrder { get; set; }
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
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
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
public enum FinancialTransferStatus { Posted = 1, Voided = 2 }
public enum BankStatementStatus { Imported = 1, Reconciled = 2 }

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

public sealed class FinancialAccountTransaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid FinancialAccountId { get; set; }
    public FinancialAccount FinancialAccount { get; set; } = null!;
    public string CurrencyCode { get; set; } = "TRY";
    public DateOnly TransactionDate { get; set; }
    public FinancialDirection Direction { get; set; }
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
