namespace AIERP.Platform.Application;

using AIERP.Platform.Domain;

public sealed record TenantSummary(Guid Id, string Name, string Slug, string Role);
public sealed record DashboardSummary(string TenantName, int OpenDevelopmentRequests, string PlatformStatus);
public sealed record AuditEventView(long Id, string Action, string Resource, Guid? UserId, string? UserDisplayName, DateTimeOffset OccurredAt);
public sealed record AuditEventPage(IReadOnlyList<AuditEventView> Items, int Page, int PageSize, int TotalCount);
public sealed record AuditRetentionPolicyView(int RetentionDays, int MinimumRetentionDays, int MaximumRetentionDays, DateTimeOffset? LastPurgeAt);
public sealed record AuditRetentionPolicyWriteRequest(int RetentionDays);
public sealed record CreateDevelopmentRequest(string Title, string Description);
public sealed record CustomerView(Guid Id, string Code, string Name, CounterpartyType Type, string? TaxNumber,
    bool IsActive, DateTimeOffset CreatedAt, byte[] RowVersion, Guid? GroupId = null, string? GroupName = null,
    string CurrencyCode = "TRY", decimal? RiskLimit = null, int PaymentTermDays = 0);
public sealed record CustomerWriteRequest(string Code, string Name, CounterpartyType Type, string? TaxNumber,
    bool IsActive = true, byte[]? RowVersion = null, Guid? GroupId = null, string CurrencyCode = "TRY",
    decimal? RiskLimit = null, int PaymentTermDays = 0, IReadOnlyDictionary<string, string?>? CustomFields = null);
public sealed record CustomerPage(IReadOnlyList<CustomerView> Items, int Page, int PageSize, int TotalCount);
public sealed record CustomerGroupView(Guid Id, string Code, string Name, bool IsActive);
public sealed record CustomerGroupWriteRequest(string Code, string Name);
public sealed record CustomerAddressView(Guid Id, CustomerAddressKind Kind, string Label, string AddressLine, string City,
    string? District, string? PostalCode, string CountryCode, bool IsDefault, bool IsActive);
public sealed record CustomerAddressWriteRequest(CustomerAddressKind Kind, string Label, string AddressLine, string City,
    string? District, string? PostalCode, string CountryCode = "TR", bool IsDefault = false, bool IsActive = true);
public sealed record CustomerLedgerView(Guid Id, DateOnly EntryDate, CustomerLedgerDirection Direction, decimal Amount,
    string CurrencyCode, string Description, Guid? ReversalOfId, bool IsReversal, bool HasReversal);
public sealed record CustomerLedgerWriteRequest(DateOnly EntryDate, CustomerLedgerDirection Direction, decimal Amount,
    string CurrencyCode, string Description);
public sealed record CustomerLedgerReverseRequest(string Reason);
public sealed record CustomerLedgerBalance(string CurrencyCode, decimal Balance, string BalanceSide, decimal? RiskLimit);
public sealed record CustomerLedgerPage(IReadOnlyList<CustomerLedgerView> Items, int Page, int PageSize, int TotalCount);
public sealed record CustomerStatementLine(Guid Id, DateOnly EntryDate, CustomerLedgerDirection Direction, decimal Amount,
    string CurrencyCode, string Description, Guid? ReversalOfId, bool HasReversal, decimal Balance);
public sealed record CustomerStatementView(Guid CustomerId, string CustomerCode, string CustomerName, string CurrencyCode,
    DateOnly From, DateOnly To, decimal OpeningBalance, decimal DebitTotal, decimal CreditTotal, decimal ClosingBalance,
    IReadOnlyList<CustomerStatementLine> Items);
public sealed record CustomerCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record CustomerCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label, CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record CustomerCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record CustomerCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record CustomerCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record CustomerCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record CustomerCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record CustomerCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record CustomerCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record StockItemView(Guid Id, string Code, string Name, string? Barcode, string UnitCode, string? Category,
    decimal MinimumStock, bool IsActive, DateTimeOffset CreatedAt, byte[] RowVersion, InventoryTrackingMode TrackingMode = InventoryTrackingMode.None,
    int ProcurementLeadTimeDays = 0, int ManufacturingLeadTimeDays = 0);
public sealed record InventoryTrackingAllocationRequest(string TrackingCode, decimal Quantity, DateOnly? ExpiryDate = null);
public sealed record InventoryTrackingAllocationView(string TrackingCode, decimal Quantity, DateOnly? ExpiryDate);
public sealed record StockItemUnitConversionView(Guid Id, string UnitCode, decimal FactorToBase, bool IsActive);
public sealed record StockItemUnitConversionWriteRequest(string UnitCode, decimal FactorToBase);
public sealed record StockCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record StockCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record StockCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record StockCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record StockCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record StockCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record StockCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record StockCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record StockCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record StockItemWriteRequest(string Code, string Name, string? Barcode, string UnitCode = "EA",
    string? Category = null, decimal MinimumStock = 0, bool IsActive = true, IReadOnlyDictionary<string, string?>? CustomFields = null,
    InventoryTrackingMode TrackingMode = InventoryTrackingMode.None, int ProcurementLeadTimeDays = 0, int ManufacturingLeadTimeDays = 0);
public sealed record StockItemUpdateRequest(string Code, string Name, string? Barcode, string UnitCode, string? Category, decimal MinimumStock, byte[]? RowVersion,
    InventoryTrackingMode? TrackingMode = null, int ProcurementLeadTimeDays = 0, int ManufacturingLeadTimeDays = 0);
public sealed record StockItemStateChangeRequest(byte[]? RowVersion, bool Confirmation);
public sealed record WarehouseView(Guid Id, string Code, string Name, bool IsActive, byte[] RowVersion);
public sealed record WarehouseCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record WarehouseCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record WarehouseCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record WarehouseCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record WarehouseCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record WarehouseCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record WarehouseCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record WarehouseCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record WarehouseCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record WarehouseWriteRequest(string Code, string Name, IReadOnlyDictionary<string, string?>? CustomFields = null);
public sealed record WarehouseUpdateRequest(string Code, string Name, byte[]? RowVersion);
public sealed record WarehouseStateChangeRequest(bool IsActive, bool Confirmation);
public sealed record InventoryBalanceView(Guid StockItemId, string Code, string Name, string UnitCode,
    decimal MinimumStock, decimal QuantityOnHand, bool BelowMinimum, decimal ReservedQuantity, decimal AvailableQuantity,
    decimal ValuationAmountBase = 0, decimal UnvaluedQuantity = 0, string BaseCurrencyCode = "TRY");
public sealed record InventoryTransactionView(Guid Id, DateOnly EntryDate, InventoryDirection Direction,
    decimal Quantity, string Description, Guid? ReversalOfId, bool IsReversal, bool HasReversal, decimal? UnitCostBase = null,
    decimal? EnteredQuantity = null, string? EnteredUnitCode = null, IReadOnlyList<InventoryTrackingAllocationView>? Tracking = null);
public sealed record InventoryTransactionWriteRequest(DateOnly EntryDate, InventoryDirection Direction,
    decimal Quantity, string Description, decimal? UnitCostBase = null, string? UnitCode = null,
    IReadOnlyList<InventoryTrackingAllocationRequest>? Tracking = null);
public sealed record InventoryCostRevaluationRequest(DateOnly EntryDate, decimal AmountBase, string Reason);
public sealed record InventoryCostAdjustmentLineView(Guid Id, Guid StockItemId, string StockCode, string StockName,
    Guid WarehouseId, string WarehouseCode, decimal QuantitySnapshot, decimal? UnitCostSnapshotBase, decimal AmountBase,
    Guid? PurchaseReceiptLineId);
public sealed record InventoryCostAdjustmentView(Guid Id, string Code, DateOnly EntryDate, InventoryCostAdjustmentKind Kind,
    Guid? PurchaseReceiptId, string Description, Guid? ReversalOfId, DateTimeOffset CreatedAt, decimal TotalAmountBase,
    IReadOnlyList<InventoryCostAdjustmentLineView> Lines);
public sealed record LandedCostWriteRequest(DateOnly EntryDate, decimal AmountBase, string AllocationMethod, string Description);
public sealed record InventoryReverseRequest(string Reason);
public sealed record InventoryTransferLineWriteRequest(Guid StockItemId, decimal Quantity, string? UnitCode = null);
public sealed record InventoryTransferWriteRequest(Guid RequestId, Guid FromWarehouseId, Guid ToWarehouseId, DateOnly TransferDate,
    IReadOnlyList<InventoryTransferLineWriteRequest> Lines);
public sealed record InventoryTransferVoidRequest(string Reason, bool Confirmation);
public sealed record InventoryTransferSummary(Guid Id, string Code, Guid FromWarehouseId, string FromWarehouseName,
    Guid ToWarehouseId, string ToWarehouseName, DateOnly TransferDate, InventoryTransferStatus Status,
    int LineCount, DateTimeOffset CreatedAt);
public sealed record InventoryTransferLineView(Guid StockItemId, string Code, string Name, string UnitCode, decimal Quantity,
    decimal? EnteredQuantity = null, string? EnteredUnitCode = null);
public sealed record InventoryTransferDetailView(InventoryTransferSummary Transfer, IReadOnlyList<InventoryTransferLineView> Lines);
public sealed record StockItemPage(IReadOnlyList<StockItemView> Items, int Page, int PageSize, int TotalCount);
public sealed record InventoryTransactionPage(IReadOnlyList<InventoryTransactionView> Items, int Page, int PageSize, int TotalCount);
public sealed record SalesQuoteLineWriteRequest(Guid StockItemId, decimal Quantity, decimal UnitPrice, decimal DiscountPercent = 0, decimal VatPercent = 20, string? UnitCode = null);
public sealed record SalesQuoteWriteRequest(string Code, Guid CustomerId, DateOnly QuoteDate, DateOnly ValidUntil,
    string CurrencyCode, string? Notes, IReadOnlyList<SalesQuoteLineWriteRequest> Lines,
    IReadOnlyDictionary<string, string?>? CustomFields = null);
public sealed record SalesQuoteCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record SalesQuoteCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record SalesQuoteCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record SalesQuoteCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record SalesQuoteCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record SalesQuoteCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record SalesQuoteCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record SalesQuoteCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record SalesQuoteCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record SalesQuoteLineAmounts(decimal LineSubtotal, decimal DiscountAmount, decimal TaxAmount, decimal LineTotal);
public sealed record SalesQuoteTotals(decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal);
public sealed record SalesQuoteLineView(int LineNumber, Guid StockItemId, string StockCode, string StockName, string UnitCode,
    decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent, decimal LineSubtotal,
    decimal DiscountAmount, decimal TaxAmount, decimal LineTotal);
public sealed record SalesQuoteView(Guid Id, string Code, Guid CustomerId, string CustomerName, DateOnly QuoteDate,
    DateOnly ValidUntil, string CurrencyCode, SalesQuoteStatus Status, string? Notes, decimal Subtotal,
    decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, DateTimeOffset CreatedAt, IReadOnlyList<SalesQuoteLineView> Lines,
    bool HasSalesOrder = false, IReadOnlyList<SalesQuoteCustomFieldValueView>? CustomFields = null);
public sealed record SalesQuoteSummary(Guid Id, string Code, Guid CustomerId, string CustomerName, DateOnly QuoteDate,
    DateOnly ValidUntil, string CurrencyCode, SalesQuoteStatus Status, decimal GrandTotal, int LineCount, DateTimeOffset CreatedAt,
    bool HasSalesOrder = false);
public sealed record SalesQuotePage(IReadOnlyList<SalesQuoteSummary> Items, int Page, int PageSize, int TotalCount);
public sealed record SalesOrderSummary(Guid Id, string Code, Guid QuoteId, string QuoteCode, Guid CustomerId,
    string CustomerName, DateOnly OrderDate, string CurrencyCode, SalesOrderStatus Status, decimal GrandTotal,
    int LineCount, DateTimeOffset CreatedAt, DateOnly? RequestedDeliveryDate = null);
public sealed record SalesOrderCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record SalesOrderCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record SalesOrderCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record SalesOrderCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record SalesOrderCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record SalesOrderCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record SalesOrderCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record SalesOrderCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record SalesOrderCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record SalesOrderDeliveryDateWriteRequest(DateOnly? RequestedDeliveryDate);
public sealed record SalesOrderView(Guid Id, string Code, Guid QuoteId, string QuoteCode, Guid CustomerId,
    string CustomerName, DateOnly OrderDate, string CurrencyCode, SalesOrderStatus Status, decimal Subtotal,
    decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, DateTimeOffset CreatedAt,
    IReadOnlyList<SalesOrderLineView> Lines, IReadOnlyList<SalesOrderCustomFieldValueView>? CustomFields = null,
    DateOnly? RequestedDeliveryDate = null);
public sealed record SalesOrderLineView(int LineNumber, Guid StockItemId, string StockCode, string StockName, string UnitCode,
    decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent, decimal LineSubtotal,
    decimal DiscountAmount, decimal TaxAmount, decimal LineTotal, decimal DeliveredQuantity, decimal RemainingQuantity,
    Guid? ReservationId, Guid? ReservationWarehouseId, string? ReservationWarehouseName, decimal ReservedQuantity);
public sealed record SalesOrderPage(IReadOnlyList<SalesOrderSummary> Items, int Page, int PageSize, int TotalCount);
public sealed record SalesOrderReservationWriteRequest(Guid RequestId, Guid WarehouseId);
public sealed record SalesOrderReservationReleaseRequest(string Reason, bool Confirmation);
public sealed record SalesOrderReservationSummary(Guid Id, Guid OrderId, int OrderLineNumber, Guid WarehouseId,
    string WarehouseName, Guid StockItemId, string StockCode, decimal ReservedQuantity, decimal FulfilledQuantity,
    decimal RemainingReservedQuantity, SalesOrderReservationStatus Status, DateTimeOffset CreatedAt, DateTimeOffset? ReleasedAt);
public sealed record SalesDeliveryLineWriteRequest(int OrderLineNumber, decimal Quantity, string? UnitCode = null);
public sealed record SalesDeliveryWriteRequest(Guid RequestId, Guid WarehouseId, DateOnly DeliveryDate, IReadOnlyList<SalesDeliveryLineWriteRequest> Lines);
public sealed record SalesDeliveryLineView(int OrderLineNumber, Guid StockItemId, string StockCode, string StockName,
    string UnitCode, decimal Quantity, decimal? EnteredQuantity = null, string? EnteredUnitCode = null);
public sealed record SalesDeliverySummary(Guid Id, string Code, Guid OrderId, string OrderCode, Guid WarehouseId,
    string WarehouseName, DateOnly DeliveryDate, SalesDeliveryStatus Status, int LineCount, DateTimeOffset CreatedAt,
    bool HasSalesInvoice = false, SalesInvoiceStatus? InvoiceStatus = null, Guid? InvoiceId = null);
public sealed record SalesDeliveryView(Guid Id, string Code, Guid OrderId, string OrderCode, Guid WarehouseId,
    string WarehouseName, DateOnly DeliveryDate, SalesDeliveryStatus Status, DateTimeOffset CreatedAt,
    IReadOnlyList<SalesDeliveryLineView> Lines, bool HasSalesInvoice = false, SalesInvoiceStatus? InvoiceStatus = null, Guid? InvoiceId = null);
public sealed record SalesDeliveryPage(IReadOnlyList<SalesDeliverySummary> Items, int Page, int PageSize, int TotalCount);
public sealed record SalesInvoiceSummary(Guid Id, string Code, Guid DeliveryId, string DeliveryCode, Guid OrderId,
    string OrderCode, Guid CustomerId, string CustomerName, DateOnly InvoiceDate, string CurrencyCode,
    SalesInvoiceStatus Status, decimal GrandTotal, int LineCount, DateTimeOffset CreatedAt);
public sealed record SalesInvoiceCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record SalesInvoiceCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record SalesInvoiceCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record SalesInvoiceCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record SalesInvoiceCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record SalesInvoiceCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record SalesInvoiceCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record SalesInvoiceCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record SalesInvoiceCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record SalesInvoiceLineView(Guid Id, int OrderLineNumber, string StockCode, string StockName, string UnitCode,
    decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent, decimal LineSubtotal,
    decimal DiscountAmount, decimal TaxAmount, decimal LineTotal, Guid StockItemId);
public sealed record SalesInvoiceView(Guid Id, string Code, Guid DeliveryId, string DeliveryCode, Guid OrderId,
    string OrderCode, Guid CustomerId, string CustomerName, DateOnly InvoiceDate, string CurrencyCode,
    SalesInvoiceStatus Status, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal,
    Guid? LedgerEntryId, DateTimeOffset CreatedAt, IReadOnlyList<SalesInvoiceLineView> Lines,
    decimal PaidAmount = 0, decimal ReturnedAmount = 0, decimal OutstandingAmount = 0,
    IReadOnlyList<CustomerCollectionSummary>? Collections = null, IReadOnlyList<SalesReturnSummary>? Returns = null,
    IReadOnlyList<SalesInvoiceCustomFieldValueView>? CustomFields = null);
public sealed record SalesInvoicePage(IReadOnlyList<SalesInvoiceSummary> Items, int Page, int PageSize, int TotalCount);
public sealed record CustomerCollectionWriteRequest(Guid RequestId, DateOnly CollectionDate, decimal Amount, string PaymentMethod, string? Reference = null, Guid? FinancialAccountId = null);
public sealed record CustomerCollectionSummary(Guid Id, string Code, Guid CustomerId, string CustomerName,
    Guid SalesInvoiceId, string InvoiceCode, DateOnly CollectionDate, decimal Amount, string CurrencyCode,
    string PaymentMethod, string? Reference, CustomerCollectionStatus Status, DateTimeOffset CreatedAt,
    Guid? FinancialAccountId = null, string? FinancialAccountName = null);
public sealed record SalesReturnLineWriteRequest(Guid SalesInvoiceLineId, decimal Quantity, string? UnitCode = null);
public sealed record SalesReturnWriteRequest(Guid RequestId, Guid WarehouseId, DateOnly ReturnDate, IReadOnlyList<SalesReturnLineWriteRequest> Lines);
public sealed record SalesReturnLineView(Guid SalesInvoiceLineId, int OrderLineNumber, string StockCode, string StockName,
    string UnitCode, decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent,
    decimal LineSubtotal, decimal DiscountAmount, decimal TaxAmount, decimal LineTotal,
    decimal? EnteredQuantity = null, string? EnteredUnitCode = null);
public sealed record SalesReturnSummary(Guid Id, string Code, Guid SalesInvoiceId, string InvoiceCode, Guid WarehouseId,
    string WarehouseName, DateOnly ReturnDate, SalesReturnStatus Status, decimal GrandTotal, int LineCount,
    DateTimeOffset CreatedAt, IReadOnlyList<SalesReturnLineView> Lines);
public sealed record PurchaseOrderWriteRequest(string Code, Guid SupplierId, DateOnly OrderDate, string CurrencyCode,
    string? Notes, IReadOnlyList<SalesQuoteLineWriteRequest> Lines, IReadOnlyDictionary<string, string?>? CustomFields = null,
    DateOnly? ExpectedReceiptDate = null, Guid? TargetWarehouseId = null);
public sealed record PurchaseRequestLineWriteRequest(Guid StockItemId, decimal Quantity, string? UnitCode = null);
public sealed record PurchaseRequestWriteRequest(string Code, DateOnly RequestDate, DateOnly? NeededByDate,
    string Description, IReadOnlyList<PurchaseRequestLineWriteRequest> Lines, IReadOnlyDictionary<string, string?>? CustomFields = null);
public sealed record PurchaseRequestCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record PurchaseRequestCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label, CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record PurchaseRequestCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record PurchaseRequestCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record PurchaseRequestCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record PurchaseRequestCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record PurchaseRequestCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record PurchaseRequestCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record PurchaseRequestCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record PurchaseRequestDecisionRequest(bool Approved, string? Note);
public sealed record PurchaseSupplierQuoteLineWriteRequest(int RequestLineNumber, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent = 20);
public sealed record PurchaseSupplierQuoteWriteRequest(string Code, Guid SupplierId, DateOnly QuoteDate, DateOnly? ValidUntil,
    string? Notes, IReadOnlyList<PurchaseSupplierQuoteLineWriteRequest> Lines, IReadOnlyDictionary<string, string?>? CustomFields = null);
public sealed record PurchaseSupplierQuoteCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record PurchaseSupplierQuoteCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record PurchaseSupplierQuoteCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record PurchaseSupplierQuoteCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record PurchaseSupplierQuoteCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record PurchaseSupplierQuoteCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record PurchaseSupplierQuoteCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record PurchaseSupplierQuoteCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record PurchaseSupplierQuoteCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record PurchaseSupplierQuoteLineView(int RequestLineNumber, string StockCode, string StockName, string UnitCode,
    decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent, decimal LineSubtotal,
    decimal DiscountAmount, decimal TaxAmount, decimal LineTotal);
public sealed record PurchaseSupplierQuoteSummary(Guid Id, Guid PurchaseRequestId, string Code, Guid SupplierId,
    string SupplierName, DateOnly QuoteDate, DateOnly? ValidUntil, string CurrencyCode, PurchaseSupplierQuoteStatus Status,
    decimal GrandTotal, int LineCount, DateTimeOffset CreatedAt);
public sealed record PurchaseSupplierQuoteView(Guid Id, Guid PurchaseRequestId, string RequestCode, string Code, Guid SupplierId,
    string SupplierName, DateOnly QuoteDate, DateOnly? ValidUntil, string CurrencyCode, PurchaseSupplierQuoteStatus Status,
    decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, string? Notes, DateTimeOffset CreatedAt,
    IReadOnlyList<PurchaseSupplierQuoteLineView> Lines, string BaseCurrencyCode = "TRY", decimal? ComparableGrandTotal = null,
    decimal? AppliedExchangeRate = null, DateOnly? AppliedRateDate = null,
    IReadOnlyList<PurchaseSupplierQuoteCustomFieldValueView>? CustomFields = null);
public sealed record TenantCurrencySettingsView(string BaseCurrencyCode);
public sealed record TenantCurrencySettingsWriteRequest(string BaseCurrencyCode);
public sealed record TenantExchangeRateWriteRequest(string CurrencyCode, DateOnly RateDate, decimal Rate, string? Source = null);
public sealed record TenantExchangeRateView(Guid Id, string CurrencyCode, DateOnly RateDate, int Revision, decimal Rate,
    string? Source, DateTimeOffset CreatedAt);
public sealed record FxExposureLineView(string Direction, Guid InvoiceId, string InvoiceCode, string CounterpartyName,
    DateOnly InvoiceDate, string CurrencyCode, decimal OutstandingAmount, decimal? InvoiceDateRate, decimal? CurrentRate,
    decimal? HistoricalBaseAmount, decimal? CurrentBaseAmount, decimal? EstimatedChangeBase);
public sealed record FxExposureCurrencySummary(string Direction, string CurrencyCode, int InvoiceCount, decimal OutstandingAmount,
    decimal? HistoricalBaseAmount, decimal? CurrentBaseAmount, decimal? EstimatedChangeBase, int UnconvertedInvoiceCount);
public sealed record FxExposureReport(string BaseCurrencyCode, DateOnly AsOfDate, IReadOnlyList<FxExposureCurrencySummary> Summaries,
    IReadOnlyList<FxExposureLineView> Invoices);
public sealed record FxRevaluationCreateRequest(DateOnly AsOfDate);
public sealed record FxRevaluationVoucherLineView(Guid Id, FxRevaluationDirection Direction, Guid InvoiceId, string InvoiceCode,
    string CounterpartyName, string CurrencyCode, decimal OutstandingAmount, decimal InvoiceDateRate, decimal ClosingRate,
    decimal PreviousAdjustmentBase, decimal TargetAdjustmentBase, decimal AdjustmentBase, string DebitAccount,
    string CreditAccount, decimal DebitBaseAmount, decimal CreditBaseAmount);
public sealed record FxRevaluationVoucherView(Guid Id, string Code, DateOnly AsOfDate, string BaseCurrencyCode,
    DateTimeOffset CreatedAt, Guid? CreatedByUserId, decimal TotalDebit, decimal TotalCredit,
    IReadOnlyList<FxRevaluationVoucherLineView> Lines);
public sealed record LedgerAccountWriteRequest(string Code, string Name, bool IsActive = true);
public sealed record LedgerAccountView(Guid Id, string Code, string Name, bool IsActive);
public sealed record LedgerMappingWriteRequest(string MappingKey, Guid AccountId);
public sealed record LedgerMappingView(string MappingKey, string Label, Guid? AccountId, string? AccountCode, string? AccountName);
public sealed record JournalEntryLineView(int LineNumber, Guid AccountId, string AccountCode, string AccountName,
    string Description, decimal Debit, decimal Credit);
public sealed record JournalEntryView(Guid Id, string Code, DateOnly EntryDate, string Description, string SourceType,
    Guid SourceId, DateTimeOffset CreatedAt, decimal TotalDebit, decimal TotalCredit, IReadOnlyList<JournalEntryLineView> Lines, bool IsReversed = false);
public sealed record JournalTransferRequest(string SourceType, Guid SourceId);
public sealed record ManualJournalEntryWriteRequest(DateOnly EntryDate, string Description, IReadOnlyList<ManualJournalLineWriteRequest> Lines);
public sealed record ManualJournalLineWriteRequest(Guid AccountId, string Description, decimal Debit, decimal Credit);
public sealed record ManualJournalEntryReverseRequest(DateOnly EntryDate, string Reason);
public sealed record PurchaseRequestOrderLineRequest(int LineNumber, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent = 20);
public sealed record PurchaseRequestOrderWriteRequest(string Code, Guid SupplierId, DateOnly OrderDate, string? Notes,
    IReadOnlyList<PurchaseRequestOrderLineRequest> Lines, Guid? SupplierQuoteId = null, IReadOnlyDictionary<string, string?>? CustomFields = null,
    DateOnly? ExpectedReceiptDate = null, Guid? TargetWarehouseId = null);
public sealed record PurchaseRequestLineView(int LineNumber, Guid StockItemId, string StockCode, string StockName,
    string UnitCode, decimal Quantity);
public sealed record PurchaseRequestSummary(Guid Id, string Code, DateOnly RequestDate, DateOnly? NeededByDate,
    string Description, Guid RequestedByUserId, string RequestedByName, PurchaseRequestStatus Status,
    Guid? ReviewedByUserId, string? ReviewedByName, string? ReviewNote, DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt, int LineCount, Guid? PurchaseOrderId, string? PurchaseOrderCode);
public sealed record PurchaseRequestView(Guid Id, string Code, DateOnly RequestDate, DateOnly? NeededByDate,
    string Description, Guid RequestedByUserId, string RequestedByName, PurchaseRequestStatus Status,
    Guid? ReviewedByUserId, string? ReviewedByName, string? ReviewNote, DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt, IReadOnlyList<PurchaseRequestLineView> Lines, Guid? PurchaseOrderId, string? PurchaseOrderCode,
    IReadOnlyList<PurchaseRequestCustomFieldValueView>? CustomFields = null);
public sealed record PurchaseRequestPage(IReadOnlyList<PurchaseRequestSummary> Items, int Page, int PageSize, int TotalCount);
public sealed record PurchaseOrderLineView(int LineNumber, Guid StockItemId, string StockCode, string StockName, string UnitCode,
    decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent, decimal LineSubtotal,
    decimal DiscountAmount, decimal TaxAmount, decimal LineTotal, decimal ReceivedQuantity, decimal RemainingQuantity);
public sealed record PurchaseOrderSummary(Guid Id, string Code, Guid SupplierId, string SupplierName, DateOnly OrderDate,
    string CurrencyCode, PurchaseOrderStatus Status, decimal GrandTotal, int LineCount, DateTimeOffset CreatedAt,
    DateOnly? ExpectedReceiptDate = null, Guid? TargetWarehouseId = null);
public sealed record PurchaseOrderCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record PurchaseOrderCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record PurchaseOrderCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record PurchaseOrderCustomFieldValueRevisionView(Guid Id, Guid DefinitionId, string Code, string Label, string? PreviousValue, string? NewValue, int DefinitionVersion, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record PurchaseOrderCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record PurchaseOrderCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record PurchaseOrderCustomFieldRestoreRequest(int Version, bool Confirmation);
public sealed record PurchaseOrderCustomFieldValuesWriteRequest(IReadOnlyDictionary<string, string?>? Values);
public sealed record PurchaseOrderCustomFieldValueRestoreRequest(bool Confirmation);
public sealed record PurchaseOrderView(Guid Id, string Code, Guid SupplierId, string SupplierName, DateOnly OrderDate,
    string CurrencyCode, PurchaseOrderStatus Status, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal,
    string? Notes, DateTimeOffset CreatedAt, IReadOnlyList<PurchaseOrderLineView> Lines,
    IReadOnlyList<PurchaseReceiptSummary> Receipts, IReadOnlyList<PurchaseOrderCustomFieldValueView>? CustomFields = null,
    DateOnly? ExpectedReceiptDate = null, Guid? TargetWarehouseId = null);
public sealed record PurchaseOrderPage(IReadOnlyList<PurchaseOrderSummary> Items, int Page, int PageSize, int TotalCount);
public sealed record PurchaseReceiptLineWriteRequest(int OrderLineNumber, decimal Quantity, string? UnitCode = null,
    IReadOnlyList<InventoryTrackingAllocationRequest>? Tracking = null);
public sealed record PurchaseReceiptWriteRequest(Guid RequestId, Guid WarehouseId, DateOnly ReceiptDate,
    IReadOnlyList<PurchaseReceiptLineWriteRequest> Lines, IReadOnlyDictionary<string, string?>? CustomFields = null);
public sealed record PurchaseReceiptCustomFieldDefinitionView(Guid Id, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int Version, bool IsRequired, bool IsActive);
public sealed record PurchaseReceiptCustomFieldDefinitionRevisionView(Guid Id, Guid DefinitionId, int Version, string Code, string Label,
    CustomFieldDataType DataType, int MaxLength, bool IsRequired, bool IsActive, string ChangeKind, Guid? ChangedByUserId, DateTimeOffset CreatedAt);
public sealed record PurchaseReceiptCustomFieldValueView(Guid DefinitionId, string Code, string Label, CustomFieldDataType DataType, int MaxLength, int DefinitionVersion, bool IsRequired, string Value);
public sealed record PurchaseReceiptCustomFieldCreateRequest(string? Code, string? Label, CustomFieldDataType DataType, int MaxLength = 200, bool IsRequired = false);
public sealed record PurchaseReceiptCustomFieldUpdateRequest(string? Label, int MaxLength, bool? IsRequired = null);
public sealed record PurchaseReceiptLineView(int OrderLineNumber, Guid StockItemId, string StockCode, string StockName,
    string UnitCode, decimal Quantity, IReadOnlyList<InventoryTrackingAllocationView>? Tracking = null,
    decimal? EnteredQuantity = null, string? EnteredUnitCode = null);
public sealed record PurchaseReceiptSummary(Guid Id, string Code, Guid PurchaseOrderId, string PurchaseOrderCode,
    Guid WarehouseId, string WarehouseName, DateOnly ReceiptDate, PurchaseReceiptStatus Status, int LineCount,
    DateTimeOffset CreatedAt, IReadOnlyList<PurchaseReceiptLineView>? Lines = null, PurchaseInvoiceSummary? Invoice = null,
    IReadOnlyList<PurchaseReceiptCustomFieldValueView>? CustomFields = null);
public sealed record PurchaseReceiptPage(IReadOnlyList<PurchaseReceiptSummary> Items, int Page, int PageSize, int TotalCount);
public sealed record PurchaseInvoiceCreateRequest(string Code, DateOnly InvoiceDate);
public sealed record PurchaseInvoiceLineView(Guid Id, Guid PurchaseReceiptLineId, int OrderLineNumber, string StockCode,
    string StockName, string UnitCode, decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent,
    decimal LineSubtotal, decimal DiscountAmount, decimal TaxAmount, decimal LineTotal, Guid StockItemId);
public sealed record SupplierPaymentSummary(Guid Id, string Code, Guid PurchaseInvoiceId, string InvoiceCode,
    DateOnly PaymentDate, decimal Amount, string CurrencyCode, string PaymentMethod, string? Reference,
    SupplierPaymentStatus Status, DateTimeOffset CreatedAt, Guid? FinancialAccountId = null, string? FinancialAccountName = null);
public sealed record SupplierReturnLineWriteRequest(Guid PurchaseInvoiceLineId, decimal Quantity, string? UnitCode = null);
public sealed record SupplierReturnWriteRequest(Guid RequestId, Guid WarehouseId, DateOnly ReturnDate,
    IReadOnlyList<SupplierReturnLineWriteRequest> Lines);
public sealed record SupplierReturnLineView(Guid PurchaseInvoiceLineId, int OrderLineNumber, string StockCode, string StockName,
    string UnitCode, decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent,
    decimal LineSubtotal, decimal DiscountAmount, decimal TaxAmount, decimal LineTotal,
    decimal? EnteredQuantity = null, string? EnteredUnitCode = null);
public sealed record SupplierReturnSummary(Guid Id, string Code, Guid PurchaseInvoiceId, string InvoiceCode,
    Guid WarehouseId, string WarehouseName, DateOnly ReturnDate, SupplierReturnStatus Status, decimal GrandTotal,
    int LineCount, DateTimeOffset CreatedAt, IReadOnlyList<SupplierReturnLineView> Lines);
public sealed record PurchaseInvoiceSummary(Guid Id, string Code, Guid PurchaseReceiptId, string ReceiptCode,
    Guid PurchaseOrderId, string PurchaseOrderCode, Guid SupplierId, string SupplierName, DateOnly InvoiceDate,
    DateOnly DueDate, string CurrencyCode, PurchaseInvoiceStatus Status, decimal GrandTotal, decimal PaidAmount, decimal OutstandingAmount,
    int LineCount, DateTimeOffset CreatedAt);
public sealed record PurchaseInvoiceView(Guid Id, string Code, Guid PurchaseReceiptId, string ReceiptCode,
    Guid PurchaseOrderId, string PurchaseOrderCode, Guid SupplierId, string SupplierName, DateOnly InvoiceDate,
    DateOnly DueDate, string CurrencyCode, PurchaseInvoiceStatus Status, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal,
    decimal GrandTotal, decimal PaidAmount, decimal OutstandingAmount, DateTimeOffset CreatedAt,
    IReadOnlyList<PurchaseInvoiceLineView> Lines, IReadOnlyList<SupplierPaymentSummary> Payments,
    IReadOnlyList<SupplierReturnSummary>? Returns = null);
public sealed record PurchaseInvoicePage(IReadOnlyList<PurchaseInvoiceSummary> Items, int Page, int PageSize, int TotalCount);
public sealed record SupplierPaymentWriteRequest(Guid RequestId, DateOnly PaymentDate, decimal Amount,
    string PaymentMethod, string? Reference = null, Guid? FinancialAccountId = null);
public sealed record FinancialAccountWriteRequest(string Code, string Name, FinancialAccountType Type, string CurrencyCode, decimal OpeningBalance = 0m);
public sealed record FinancialAccountMovementWriteRequest(Guid RequestId, DateOnly TransactionDate, FinancialDirection Direction,
    decimal Amount, string Description, string? Reference = null);
public sealed record FinancialAccountTransferWriteRequest(Guid RequestId, Guid FromAccountId, Guid ToAccountId,
    DateOnly TransferDate, decimal Amount, string? Reference = null, string Description = "Hesaplar arası transfer", decimal ExchangeRate = 1m);
public sealed record FinancialAccountSummary(Guid Id, string Code, string Name, FinancialAccountType Type, string CurrencyCode,
    bool IsActive, decimal Balance, int TransactionCount, DateTimeOffset CreatedAt);
public sealed record FinancialAccountTransferSummary(Guid Id, string Code, Guid FromAccountId, string FromAccountName,
    Guid ToAccountId, string ToAccountName, string CurrencyCode, DateOnly TransferDate, decimal Amount,
    string? Reference, string Description, FinancialTransferStatus Status, DateTimeOffset CreatedAt,
    string? ToCurrencyCode = null, decimal? DestinationAmount = null, decimal? ExchangeRate = null);
public sealed record BankStatementLineImportRequest(DateOnly TransactionDate, decimal SignedAmount, string Description,
    string? Reference = null, string? ExternalId = null);
public sealed record BankStatementImportRequest(Guid RequestId, DateOnly StartDate, DateOnly EndDate,
    decimal OpeningBalance, decimal ClosingBalance, IReadOnlyList<BankStatementLineImportRequest> Lines);
public sealed record BankStatementMatchRequest(Guid FinancialAccountTransactionId);
public sealed record BankStatementSummary(Guid Id, string Code, Guid AccountId, string AccountName, string CurrencyCode,
    DateOnly StartDate, DateOnly EndDate, decimal OpeningBalance, decimal ClosingBalance, int LineCount,
    int MatchedLineCount, BankStatementStatus Status, DateTimeOffset CreatedAt);
public sealed record BankStatementLineView(Guid Id, int LineNumber, string? ExternalId, DateOnly TransactionDate,
    FinancialDirection Direction, decimal Amount, string Description, string? Reference, Guid? FinancialAccountTransactionId,
    bool IsBookEntryCreated, DateTimeOffset? MatchedAt);
public sealed record BankStatementUnmatchedMovementView(Guid Id, DateOnly TransactionDate, FinancialDirection Direction,
    decimal Amount, string CurrencyCode, string Description, string? Reference, string? SourceType, string? SourceCode);
public sealed record BankStatementDetail(Guid Id, string Code, Guid AccountId, string AccountName, string CurrencyCode,
    DateOnly StartDate, DateOnly EndDate, decimal OpeningBalance, decimal ClosingBalance, BankStatementStatus Status,
    DateTimeOffset CreatedAt, IReadOnlyList<BankStatementLineView> Lines);
public sealed record FinancialAccountTransactionView(Guid Id, DateOnly TransactionDate, FinancialDirection Direction,
    decimal Amount, string CurrencyCode, string Description, string? Reference, string? SourceType, string? SourceCode,
    Guid? ReversalOfId, DateTimeOffset CreatedAt, Guid? TransferId = null);
public sealed record FinancialAccountDetail(Guid Id, string Code, string Name, FinancialAccountType Type, string CurrencyCode,
    bool IsActive, decimal Balance, DateTimeOffset CreatedAt, IReadOnlyList<FinancialAccountTransactionView> Transactions);

public static class FinancialMovementValidation
{
    public static Dictionary<string, string[]>? Validate(FinancialAccountMovementWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar gönderim anahtarı zorunludur."];
        if (!Enum.IsDefined(request.Direction)) errors["direction"] = ["Hareket yönü Inflow veya Outflow olmalıdır."];
        if (request.Amount <= 0 || request.Amount > 9999999999999999.99m || request.Amount != decimal.Round(request.Amount, 2))
            errors["amount"] = ["Tutar pozitif olmalı, decimal(18,2) sınırını aşmamalı ve en fazla iki ondalık basamak içermelidir."];
        if (string.IsNullOrWhiteSpace(request.Description) || request.Description.Trim().Length > 240) errors["description"] = ["Açıklama zorunludur ve en fazla 240 karakter olabilir."];
        if (request.Reference?.Trim().Length > 100) errors["reference"] = ["Referans en fazla 100 karakter olabilir."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(FinancialAccountTransferWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar gönderim anahtarı zorunludur."];
        if (request.FromAccountId == Guid.Empty) errors["fromAccountId"] = ["Kaynak hesap seçilmelidir."];
        if (request.ToAccountId == Guid.Empty || request.ToAccountId == request.FromAccountId) errors["toAccountId"] = ["Hedef hesap kaynak hesaptan farklı olmalıdır."];
        if (request.Amount <= 0 || request.Amount > 9999999999999999.99m || request.Amount != decimal.Round(request.Amount, 2))
            errors["amount"] = ["Tutar pozitif olmalı, decimal(18,2) sınırını aşmamalı ve en fazla iki ondalık basamak içermelidir."];
        if (request.ExchangeRate <= 0 || request.ExchangeRate > 9999999999.99999999m || request.ExchangeRate != decimal.Round(request.ExchangeRate, 8))
            errors["exchangeRate"] = ["Kur pozitif olmalı, decimal(18,8) sınırını aşmamalı ve en fazla sekiz ondalık basamak içermelidir."];
        if (string.IsNullOrWhiteSpace(request.Description) || request.Description.Trim().Length > 240) errors["description"] = ["Açıklama zorunludur ve en fazla 240 karakter olabilir."];
        if (request.Reference?.Trim().Length > 100) errors["reference"] = ["Referans en fazla 100 karakter olabilir."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class BankStatementValidation
{
    public static Dictionary<string, string[]>? Validate(BankStatementImportRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar gönderim anahtarı zorunludur."];
        if (request.StartDate > request.EndDate) errors["endDate"] = ["Ekstre bitiş tarihi başlangıç tarihinden önce olamaz."];
        if (request.OpeningBalance > 9999999999999999.99m || request.OpeningBalance < -9999999999999999.99m || request.OpeningBalance != decimal.Round(request.OpeningBalance, 2))
            errors["openingBalance"] = ["Açılış bakiyesi decimal(18,2) sınırında ve en fazla iki ondalık basamaklı olmalıdır."];
        if (request.ClosingBalance > 9999999999999999.99m || request.ClosingBalance < -9999999999999999.99m || request.ClosingBalance != decimal.Round(request.ClosingBalance, 2))
            errors["closingBalance"] = ["Kapanış bakiyesi decimal(18,2) sınırında ve en fazla iki ondalık basamaklı olmalıdır."];
        if (request.Lines is null || request.Lines.Count > 5000) errors["lines"] = ["Ekstre en fazla 5000 hareket içerebilir."];
        if (request.Lines is not null)
        {
            var externalIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            decimal total = 0m;
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                var prefix = $"lines[{i}]";
                if (line.TransactionDate < request.StartDate || line.TransactionDate > request.EndDate) errors[$"{prefix}.transactionDate"] = ["Hareket tarihi ekstre döneminin içinde olmalıdır."];
                if (line.SignedAmount == 0 || line.SignedAmount > 9999999999999999.99m || line.SignedAmount < -9999999999999999.99m || line.SignedAmount != decimal.Round(line.SignedAmount, 2))
                    errors[$"{prefix}.signedAmount"] = ["Ekstre tutarı sıfır olamaz; decimal(18,2) sınırında ve en fazla iki basamaklı olmalıdır."];
                if (string.IsNullOrWhiteSpace(line.Description) || line.Description.Trim().Length > 240) errors[$"{prefix}.description"] = ["Açıklama zorunludur ve en fazla 240 karakter olabilir."];
                if (line.Reference?.Trim().Length > 100) errors[$"{prefix}.reference"] = ["Referans en fazla 100 karakter olabilir."];
                if (line.ExternalId?.Trim().Length > 100) errors[$"{prefix}.externalId"] = ["Banka hareket kimliği en fazla 100 karakter olabilir."];
                if (!string.IsNullOrWhiteSpace(line.ExternalId) && !externalIds.Add(line.ExternalId.Trim())) errors[$"{prefix}.externalId"] = ["Ekstrede banka hareket kimliği tekrarlanamaz."];
                total += line.SignedAmount;
            }
            if (request.OpeningBalance + total != request.ClosingBalance) errors["closingBalance"] = ["Kapanış bakiyesi açılış bakiyesi ile ekstre hareketlerinin toplamına eşit olmalıdır."];
        }
        return errors.Count == 0 ? null : errors;
    }
}

public static class FinancialAccountValidation
{
    public static Dictionary<string, string[]>? Validate(FinancialAccountWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 40) errors["code"] = ["Hesap kodu zorunludur ve en fazla 40 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120) errors["name"] = ["Hesap adı zorunludur ve en fazla 120 karakter olabilir."];
        if (!Enum.IsDefined(request.Type)) errors["type"] = ["Hesap türü Cash veya Bank olmalıdır."];
        if (request.CurrencyCode?.Trim().Length != 3 || request.CurrencyCode.Any(c => !char.IsAsciiLetter(c))) errors["currencyCode"] = ["Döviz kodu 3 harfli ISO kodu olmalıdır."];
        if (request.OpeningBalance > 9999999999999999.99m || request.OpeningBalance < -9999999999999999.99m || request.OpeningBalance != decimal.Round(request.OpeningBalance, 2))
            errors["openingBalance"] = ["Açılış bakiyesi decimal(18,2) sınırında ve en fazla iki ondalık basamaklı olmalıdır."];
        if (request.Type == FinancialAccountType.Cash && request.OpeningBalance < 0) errors["openingBalance"] = ["Kasa hesabının açılış bakiyesi negatif olamaz."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class CustomerValidation
{
    public static Dictionary<string, string[]>? Validate(CustomerWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 64)
            errors["code"] = ["Cari kodu zorunludur ve en fazla 64 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 200)
            errors["name"] = ["Unvan zorunludur ve en fazla 200 karakter olabilir."];
        if (!Enum.IsDefined(request.Type))
            errors["type"] = ["Cari türü Customer, Supplier veya Both olmalıdır."];
        if (request.TaxNumber?.Trim().Length > 32)
            errors["taxNumber"] = ["Vergi numarası en fazla 32 karakter olabilir."];
        if (request.CurrencyCode?.Trim().Length != 3 || request.CurrencyCode.Any(c => !char.IsAsciiLetter(c)))
            errors["currencyCode"] = ["Döviz kodu 3 harfli ISO kodu olmalıdır."];
        if (request.RiskLimit < 0)
            errors["riskLimit"] = ["Risk limiti negatif olamaz."];
        if (request.PaymentTermDays is < 0 or > 3650)
            errors["paymentTermDays"] = ["Vade günü 0 ile 3650 arasında olmalıdır."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class CustomerAddressValidation
{
    public static Dictionary<string, string[]>? Validate(CustomerAddressWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (!Enum.IsDefined(request.Kind)) errors["kind"] = ["Adres türü General, Billing veya Delivery olmalıdır."];
        if (string.IsNullOrWhiteSpace(request.Label) || request.Label.Trim().Length > 80) errors["label"] = ["Adres etiketi zorunludur ve en fazla 80 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.AddressLine) || request.AddressLine.Trim().Length > 400) errors["addressLine"] = ["Adres satırı zorunludur ve en fazla 400 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.City) || request.City.Trim().Length > 100) errors["city"] = ["Şehir zorunludur ve en fazla 100 karakter olabilir."];
        if (request.District?.Trim().Length > 100) errors["district"] = ["İlçe en fazla 100 karakter olabilir."];
        if (request.PostalCode?.Trim().Length > 20) errors["postalCode"] = ["Posta kodu en fazla 20 karakter olabilir."];
        if (request.CountryCode?.Trim().Length != 2 || request.CountryCode.Any(c => !char.IsAsciiLetter(c))) errors["countryCode"] = ["Ülke kodu 2 harfli ISO kodu olmalıdır."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class CustomerLedgerValidation
{
    public static Dictionary<string, string[]>? Validate(CustomerLedgerWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (!Enum.IsDefined(request.Direction)) errors["direction"] = ["Hareket yönü Debit veya Credit olmalıdır."];
        if (request.Amount <= 0 || request.Amount > 9999999999999999.99m) errors["amount"] = ["Tutar 0'dan büyük ve decimal(18,2) sınırlarında olmalıdır."];
        if (request.Amount != decimal.Round(request.Amount, 2)) errors["amount"] = ["Tutar en fazla iki ondalık basamak içerebilir."];
        if (string.IsNullOrWhiteSpace(request.CurrencyCode) || request.CurrencyCode.Trim().Length != 3 || request.CurrencyCode.Any(c => !char.IsAsciiLetter(c))) errors["currencyCode"] = ["Döviz kodu 3 harfli ISO kodu olmalıdır."];
        if (string.IsNullOrWhiteSpace(request.Description) || request.Description.Trim().Length > 240) errors["description"] = ["Açıklama zorunludur ve en fazla 240 karakter olabilir."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? ValidateReversal(CustomerLedgerReverseRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.Reason) && request.Reason.Trim().Length <= 160) return null;
        return new Dictionary<string, string[]> { ["reason"] = ["Ters kayıt nedeni zorunludur ve en fazla 160 karakter olabilir."] };
    }
}

public static class CustomerLedgerBalanceCalculator
{
    public static CustomerLedgerBalance Calculate(string currencyCode, decimal debitTotal, decimal creditTotal, decimal? riskLimit)
    {
        var balance = debitTotal - creditTotal;
        return new CustomerLedgerBalance(currencyCode, balance, balance > 0 ? "Debit" : balance < 0 ? "Credit" : "Balanced", riskLimit);
    }
}

public static class InventoryValidation
{
    public static Dictionary<string, string[]>? Validate(StockItemWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 64) errors["code"] = ["Stok kodu zorunludur ve en fazla 64 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 200) errors["name"] = ["Stok adı zorunludur ve en fazla 200 karakter olabilir."];
        if (request.Barcode?.Trim().Length > 64) errors["barcode"] = ["Barkod en fazla 64 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.UnitCode) || request.UnitCode.Trim().Length > 8) errors["unitCode"] = ["Birim kodu zorunludur ve en fazla 8 karakter olabilir."];
        if (request.Category?.Trim().Length > 120) errors["category"] = ["Kategori en fazla 120 karakter olabilir."];
        if (!Enum.IsDefined(request.TrackingMode)) errors["trackingMode"] = ["Takip modu None, Lot veya Serial olmalıdır."];
        if (request.MinimumStock < 0 || request.MinimumStock > 99999999999999.9999m || request.MinimumStock != decimal.Round(request.MinimumStock, 4)) errors["minimumStock"] = ["Minimum stok negatif olamaz; en fazla 4 ondalık basamak kullanılabilir."];
        if (request.ProcurementLeadTimeDays is < 0 or > 3650) errors["procurementLeadTimeDays"] = ["Tedarik süresi 0–3650 gün aralığında olmalıdır."];
        if (request.ManufacturingLeadTimeDays is < 0 or > 3650) errors["manufacturingLeadTimeDays"] = ["Üretim süresi 0–3650 gün aralığında olmalıdır."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(WarehouseWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 40) errors["code"] = ["Depo kodu zorunludur ve en fazla 40 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120) errors["name"] = ["Depo adı zorunludur ve en fazla 120 karakter olabilir."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(WarehouseUpdateRequest request)
    {
        var errors = Validate(new WarehouseWriteRequest(request.Code, request.Name)) ?? new Dictionary<string, string[]>();
        if (request.RowVersion is null || request.RowVersion.Length != 8) errors["rowVersion"] = ["Depo güncellemesi için geçerli sürüm bilgisi zorunludur."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(WarehouseStateChangeRequest request)
    {
        if (request.Confirmation) return null;
        return new Dictionary<string, string[]> { ["confirmation"] = ["Depo durumu değişikliği için açık onay gerekir."] };
    }

    public static Dictionary<string, string[]>? Validate(InventoryTransactionWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (!Enum.IsDefined(request.Direction)) errors["direction"] = ["Hareket yönü Receipt veya Issue olmalıdır."];
        if (request.Quantity <= 0 || request.Quantity > 99999999999999.9999m || request.Quantity != decimal.Round(request.Quantity, 4)) errors["quantity"] = ["Miktar 0'dan büyük olmalı ve en fazla 4 ondalık basamak içermelidir."];
        if (request.UnitCode is { } unitCode && (string.IsNullOrWhiteSpace(unitCode) || unitCode.Trim().Length > 8)) errors["unitCode"] = ["Birim kodu en fazla 8 karakter olabilir."];
        if (string.IsNullOrWhiteSpace(request.Description) || request.Description.Trim().Length > 240) errors["description"] = ["Açıklama zorunludur ve en fazla 240 karakter olabilir."];
        if (request.UnitCostBase is < 0 or > 9999999999.99999999m || request.UnitCostBase is { } cost && cost != decimal.Round(cost, 8)) errors["unitCostBase"] = ["Birim maliyet negatif olamaz ve decimal(18,8) sınırında en fazla sekiz ondalık basamak içermelidir."];
        if (request.Direction == InventoryDirection.Issue && request.UnitCostBase is not null) errors["unitCostBase"] = ["Çıkış maliyeti sistem tarafından mevcut ağırlıklı ortalama maliyetten belirlenir."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(InventoryTransferWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
        if (request.FromWarehouseId == Guid.Empty) errors["fromWarehouseId"] = ["Kaynak depo seçilmelidir."];
        if (request.ToWarehouseId == Guid.Empty) errors["toWarehouseId"] = ["Hedef depo seçilmelidir."];
        if (request.FromWarehouseId != Guid.Empty && request.FromWarehouseId == request.ToWarehouseId) errors["toWarehouseId"] = ["Kaynak ve hedef depo farklı olmalıdır."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["Transfer 1 ile 100 arasında stok kalemi içermelidir."];
        else
        {
            if (request.Lines.Any(x => x.StockItemId == Guid.Empty)) errors["lines"] = ["Her transfer satırında bir stok kartı seçilmelidir."];
            if (request.Lines.Select(x => x.StockItemId).Distinct().Count() != request.Lines.Count) errors["lines"] = ["Aynı stok kartı transferde birden fazla satırda bulunamaz."];
            if (request.Lines.Any(x => x.Quantity <= 0 || x.Quantity > 99999999999999.9999m || x.Quantity != decimal.Round(x.Quantity, 4)))
                errors["lines"] = ["Transfer miktarları 0'dan büyük olmalı ve en fazla 4 ondalık basamak içermelidir."];
        }
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(InventoryTransferVoidRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (!request.Confirmation) errors["confirmation"] = ["Transfer iptali için açık onay gerekir."];
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 160) errors["reason"] = ["İptal nedeni zorunludur ve en fazla 160 karakter olabilir."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(InventoryReverseRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.Reason) && request.Reason.Trim().Length <= 160) return null;
        return new Dictionary<string, string[]> { ["reason"] = ["Ters kayıt nedeni zorunludur ve en fazla 160 karakter olabilir."] };
    }
}

public static class SalesQuoteValidation
{
    private const decimal MaxAmount = 9999999999999999.99m;
    private const decimal MaxQuantityOrPrice = 99999999999999.9999m;

    public static Dictionary<string, string[]>? Validate(SalesQuoteWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 40) errors["code"] = ["Teklif numarası zorunludur ve en fazla 40 karakter olabilir."];
        if (request.CustomerId == Guid.Empty) errors["customerId"] = ["Müşteri seçilmelidir."];
        if (request.ValidUntil < request.QuoteDate) errors["validUntil"] = ["Geçerlilik tarihi teklif tarihinden önce olamaz."];
        if (string.IsNullOrWhiteSpace(request.CurrencyCode) || request.CurrencyCode.Trim().Length != 3 || request.CurrencyCode.Any(c => !char.IsAsciiLetter(c))) errors["currencyCode"] = ["Döviz kodu 3 harfli ISO kodu olmalıdır."];
        if (request.Notes?.Trim().Length > 1000) errors["notes"] = ["Notlar en fazla 1000 karakter olabilir."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["Teklif 1 ile 100 arasında satır içermelidir."];
        if (request.Lines is not null)
        {
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                var prefix = $"lines[{i}]";
                if (line.StockItemId == Guid.Empty) errors[$"{prefix}.stockItemId"] = ["Stok kartı seçilmelidir."];
                if (line.Quantity <= 0 || line.Quantity > MaxQuantityOrPrice || line.Quantity != decimal.Round(line.Quantity, 4)) errors[$"{prefix}.quantity"] = ["Miktar pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
                if (line.UnitPrice < 0 || line.UnitPrice > MaxQuantityOrPrice || line.UnitPrice != decimal.Round(line.UnitPrice, 4)) errors[$"{prefix}.unitPrice"] = ["Birim fiyat negatif olamaz ve en fazla 4 ondalık basamak içerebilir."];
                if (line.DiscountPercent < 0 || line.DiscountPercent > 100 || line.DiscountPercent != decimal.Round(line.DiscountPercent, 2)) errors[$"{prefix}.discountPercent"] = ["İskonto oranı 0 ile 100 arasında ve en fazla 2 ondalık basamaklı olmalıdır."];
                if (line.VatPercent < 0 || line.VatPercent > 100 || line.VatPercent != decimal.Round(line.VatPercent, 2)) errors[$"{prefix}.vatPercent"] = ["KDV oranı 0 ile 100 arasında ve en fazla 2 ondalık basamaklı olmalıdır."];
                if (line.Quantity > 0 && line.UnitPrice >= 0 && line.Quantity <= MaxQuantityOrPrice && line.UnitPrice <= MaxQuantityOrPrice)
                {
                    try { if (Calculate(line).LineTotal > MaxAmount) errors[$"{prefix}.unitPrice"] = ["Satır toplamı decimal(18,2) sınırını aşıyor."]; }
                    catch (OverflowException) { errors[$"{prefix}.quantity"] = ["Satır toplamı desteklenen decimal sınırını aşıyor."]; }
                }
            }
        }
        return errors.Count == 0 ? null : errors;
    }

    public static SalesQuoteLineAmounts Calculate(SalesQuoteLineWriteRequest line)
    {
        var subtotal = decimal.Round(line.Quantity * line.UnitPrice, 2, MidpointRounding.AwayFromZero);
        var discount = decimal.Round(subtotal * line.DiscountPercent / 100m, 2, MidpointRounding.AwayFromZero);
        var taxable = subtotal - discount;
        var tax = decimal.Round(taxable * line.VatPercent / 100m, 2, MidpointRounding.AwayFromZero);
        return new SalesQuoteLineAmounts(subtotal, discount, tax, taxable + tax);
    }

    public static SalesQuoteTotals Sum(IEnumerable<SalesQuoteLineAmounts> lines)
    {
        var rows = lines.ToArray();
        var subtotal = rows.Sum(x => x.LineSubtotal);
        var discount = rows.Sum(x => x.DiscountAmount);
        var tax = rows.Sum(x => x.TaxAmount);
        var total = rows.Sum(x => x.LineTotal);
        if (subtotal > MaxAmount || discount > MaxAmount || tax > MaxAmount || total > MaxAmount) throw new OverflowException("Teklif toplamı decimal(18,2) sınırını aşıyor.");
        return new SalesQuoteTotals(subtotal, discount, tax, total);
    }
}

public static class SalesQuoteWorkflow
{
    public static bool CanTransition(SalesQuoteStatus current, SalesQuoteStatus target) =>
        (current, target) is (SalesQuoteStatus.Draft, SalesQuoteStatus.Sent)
            or (SalesQuoteStatus.Sent, SalesQuoteStatus.Accepted)
            or (SalesQuoteStatus.Sent, SalesQuoteStatus.Rejected);

    public static bool CanConvertToOrder(SalesQuoteStatus status, bool alreadyConverted) =>
        status == SalesQuoteStatus.Accepted && !alreadyConverted;
}

public static class SalesReturnValidation
{
    public static SalesQuoteLineAmounts CalculateIncrementalAmounts(Guid stockItemId, decimal unitPrice,
        decimal discountPercent, decimal vatPercent, decimal previouslyReturnedQuantity,
        SalesQuoteLineAmounts previouslyReturnedAmounts, decimal quantity)
    {
        var cumulative = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(stockItemId,
            previouslyReturnedQuantity + quantity, unitPrice, discountPercent, vatPercent));
        return new SalesQuoteLineAmounts(cumulative.LineSubtotal - previouslyReturnedAmounts.LineSubtotal,
            cumulative.DiscountAmount - previouslyReturnedAmounts.DiscountAmount,
            cumulative.TaxAmount - previouslyReturnedAmounts.TaxAmount,
            cumulative.LineTotal - previouslyReturnedAmounts.LineTotal);
    }
}

public static class SalesDeliveryValidation
{
    private const decimal MaxQuantity = 99999999999999.9999m;

    public static Dictionary<string, string[]>? Validate(SalesDeliveryWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Sevkiyat istek anahtarı zorunludur."];
        if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["Depo seçilmelidir."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["İrsaliye 1 ile 100 arasında satır içermelidir."];
        if (request.Lines is not null)
        {
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                if (line.OrderLineNumber <= 0) errors[$"lines[{i}].orderLineNumber"] = ["Sipariş satırı seçilmelidir."];
                if (line.Quantity <= 0 || line.Quantity > MaxQuantity || line.Quantity != decimal.Round(line.Quantity, 4)) errors[$"lines[{i}].quantity"] = ["Teslim miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
            }
            if (request.Lines.Select(x => x.OrderLineNumber).Distinct().Count() != request.Lines.Count)
                errors["lines"] = ["Her sipariş satırı irsaliyede yalnızca bir kez bulunabilir."];
        }
        return errors.Count == 0 ? null : errors;
    }
}

public static class SalesOrderReservationValidation
{
    public static Dictionary<string, string[]>? Validate(SalesOrderReservationWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Rezervasyon istek anahtarı zorunludur."];
        if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["Depo seçilmelidir."];
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(SalesOrderReservationReleaseRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 180)
            errors["reason"] = ["Rezervasyon bırakma gerekçesi zorunludur ve en fazla 180 karakter olabilir."];
        if (!request.Confirmation) errors["confirmation"] = ["Rezervasyon bırakma onayı zorunludur."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class PurchaseOrderWorkflow
{
    public static bool CanReceive(PurchaseOrderStatus status) => status is PurchaseOrderStatus.Open or PurchaseOrderStatus.PartiallyReceived;
    public static bool CanEdit(PurchaseOrderStatus status) => status is PurchaseOrderStatus.Open or PurchaseOrderStatus.PartiallyReceived;
    public static bool HasOutstandingOrder(PurchaseOrderStatus status) => status is PurchaseOrderStatus.Open or PurchaseOrderStatus.PartiallyReceived or PurchaseOrderStatus.PendingApproval;

    public static PurchaseOrderStatus GetStatus(IEnumerable<(decimal Ordered, decimal Received)> lineQuantities)
    {
        var lines = lineQuantities.ToArray();
        if (lines.Length > 0 && lines.All(x => x.Received >= x.Ordered) && lines.Any(x => x.Received > 0)) return PurchaseOrderStatus.Received;
        return lines.Any(x => x.Received > 0) ? PurchaseOrderStatus.PartiallyReceived : PurchaseOrderStatus.Open;
    }
}

public static class PurchaseOrderValidation
{
    public static Dictionary<string, string[]>? Validate(PurchaseOrderWriteRequest request)
    {
        var errors = SalesQuoteValidation.Validate(new SalesQuoteWriteRequest(request.Code, request.SupplierId,
            request.OrderDate, request.OrderDate, request.CurrencyCode, request.Notes, request.Lines));
        if (errors is not null)
        {
            if (errors.Remove("customerId")) errors["supplierId"] = ["Tedarikçi seçilmelidir."];
            if (errors.ContainsKey("code")) errors["code"] = ["Satın alma sipariş numarası zorunludur ve en fazla 40 karakter olabilir."];
        }
        return errors;
    }
}

public static class PurchaseRequestValidation
{
    private const decimal MaxQuantity = 99999999999999.9999m;

    public static Dictionary<string, string[]>? Validate(PurchaseRequestWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 40)
            errors["code"] = ["Talep numarası zorunludur ve en fazla 40 karakter olabilir."];
        if (request.RequestDate == default) errors["requestDate"] = ["Talep tarihi zorunludur."];
        if (request.NeededByDate is not null && request.NeededByDate < request.RequestDate)
            errors["neededByDate"] = ["İhtiyaç tarihi talep tarihinden önce olamaz."];
        if (string.IsNullOrWhiteSpace(request.Description) || request.Description.Trim().Length > 1000)
            errors["description"] = ["Talep açıklaması zorunludur ve en fazla 1000 karakter olabilir."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100)
            errors["lines"] = ["Talep 1 ile 100 arasında stok kalemi içermelidir."];
        if (request.Lines is not null)
        {
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                if (line.StockItemId == Guid.Empty) errors[$"lines[{i}].stockItemId"] = ["Stok kartı seçilmelidir."];
                if (line.Quantity <= 0 || line.Quantity > MaxQuantity || line.Quantity != decimal.Round(line.Quantity, 4))
                    errors[$"lines[{i}].quantity"] = ["Talep miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
            }
            if (request.Lines.Select(x => x.StockItemId).Distinct().Count() != request.Lines.Count)
                errors["lines"] = ["Her stok kartı talepte yalnızca bir kez bulunabilir."];
        }
        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? Validate(PurchaseRequestDecisionRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.Note?.Trim().Length > 1000) errors["note"] = ["Karar notu en fazla 1000 karakter olabilir."];
        if (!request.Approved && string.IsNullOrWhiteSpace(request.Note)) errors["note"] = ["Ret kararı için açıklama zorunludur."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class PurchaseRequestOrderValidation
{
    public static Dictionary<string, string[]>? Validate(PurchaseRequestOrderWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 40)
            errors["code"] = ["Satın alma sipariş numarası zorunludur ve en fazla 40 karakter olabilir."];
        if (request.SupplierId == Guid.Empty) errors["supplierId"] = ["Tedarikçi seçilmelidir."];
        if (request.OrderDate == default) errors["orderDate"] = ["Sipariş tarihi zorunludur."];
        if (request.Notes?.Trim().Length > 1000) errors["notes"] = ["Not en fazla 1000 karakter olabilir."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100)
            errors["lines"] = ["Sipariş 1 ile 100 arasında satır içermelidir."];
        if (request.Lines is not null)
        {
            if (request.Lines.Select(x => x.LineNumber).Distinct().Count() != request.Lines.Count)
                errors["lines"] = ["Her talep satırı yalnızca bir kez fiyatlandırılabilir."];
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                if (line.LineNumber < 1) errors[$"lines[{i}].lineNumber"] = ["Satır numarası pozitif olmalıdır."];
                if (line.UnitPrice < 0 || line.UnitPrice > 99999999999999.9999m || line.UnitPrice != decimal.Round(line.UnitPrice, 4))
                    errors[$"lines[{i}].unitPrice"] = ["Birim fiyat 0 ile 99999999999999.9999 arasında ve en fazla 4 ondalık basamaklı olmalıdır."];
                if (line.DiscountPercent is < 0 or > 100 || line.DiscountPercent != decimal.Round(line.DiscountPercent, 2))
                    errors[$"lines[{i}].discountPercent"] = ["İskonto oranı 0 ile 100 arasında ve en fazla 2 ondalık basamaklı olmalıdır."];
                if (line.VatPercent is < 0 or > 100 || line.VatPercent != decimal.Round(line.VatPercent, 2))
                    errors[$"lines[{i}].vatPercent"] = ["KDV oranı 0 ile 100 arasında ve en fazla 2 ondalık basamaklı olmalıdır."];
            }
        }
        return errors.Count == 0 ? null : errors;
    }
}

public static class PurchaseSupplierQuoteValidation
{
    public static Dictionary<string, string[]>? Validate(PurchaseSupplierQuoteWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 64)
            errors["code"] = ["Tedarikçi teklif numarası zorunludur ve en fazla 64 karakter olabilir."];
        if (request.SupplierId == Guid.Empty) errors["supplierId"] = ["Tedarikçi seçilmelidir."];
        if (request.QuoteDate == default) errors["quoteDate"] = ["Teklif tarihi zorunludur."];
        if (request.ValidUntil is not null && request.ValidUntil < request.QuoteDate)
            errors["validUntil"] = ["Geçerlilik tarihi teklif tarihinden önce olamaz."];
        if (request.Notes?.Trim().Length > 1000) errors["notes"] = ["Not en fazla 1000 karakter olabilir."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100)
            errors["lines"] = ["Teklif 1 ile 100 arasında satır içermelidir."];
        if (request.Lines is not null)
        {
            if (request.Lines.Select(x => x.RequestLineNumber).Distinct().Count() != request.Lines.Count)
                errors["lines"] = ["Talep satırı teklif içinde yalnızca bir kez bulunabilir."];
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                if (line.RequestLineNumber < 1) errors[$"lines[{i}].requestLineNumber"] = ["Talep satır numarası pozitif olmalıdır."];
                if (line.UnitPrice < 0 || line.UnitPrice > 99999999999999.9999m || line.UnitPrice != decimal.Round(line.UnitPrice, 4))
                    errors[$"lines[{i}].unitPrice"] = ["Birim fiyat 0 ile 99999999999999.9999 arasında ve en fazla 4 ondalık basamaklı olmalıdır."];
                if (line.DiscountPercent is < 0 or > 100 || line.DiscountPercent != decimal.Round(line.DiscountPercent, 2))
                    errors[$"lines[{i}].discountPercent"] = ["İskonto oranı 0 ile 100 arasında ve en fazla 2 ondalık basamaklı olmalıdır."];
                if (line.VatPercent is < 0 or > 100 || line.VatPercent != decimal.Round(line.VatPercent, 2))
                    errors[$"lines[{i}].vatPercent"] = ["KDV oranı 0 ile 100 arasında ve en fazla 2 ondalık basamaklı olmalıdır."];
            }
        }
        return errors.Count == 0 ? null : errors;
    }
}

public static class PurchaseReceiptValidation
{
    private const decimal MaxQuantity = 99999999999999.9999m;

    public static Dictionary<string, string[]>? Validate(PurchaseReceiptWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Mal kabul istek anahtarı zorunludur."];
        if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["Depo seçilmelidir."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["Mal kabul 1 ile 100 arasında satır içermelidir."];
        if (request.Lines is not null)
        {
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                if (line.OrderLineNumber <= 0) errors[$"lines[{i}].orderLineNumber"] = ["Sipariş satırı seçilmelidir."];
                if (line.Quantity <= 0 || line.Quantity > MaxQuantity || line.Quantity != decimal.Round(line.Quantity, 4))
                    errors[$"lines[{i}].quantity"] = ["Kabul miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
            }
            if (request.Lines.Select(x => x.OrderLineNumber).Distinct().Count() != request.Lines.Count)
                errors["lines"] = ["Her sipariş satırı mal kabulde yalnızca bir kez bulunabilir."];
        }
        return errors.Count == 0 ? null : errors;
    }
}

public static class PurchaseInvoiceValidation
{
    public static Dictionary<string, string[]>? Validate(PurchaseInvoiceCreateRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 64)
            errors["code"] = ["Alış fatura numarası zorunludur ve en fazla 64 karakter olabilir."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class SupplierReturnValidation
{
    private const decimal MaxQuantity = 99999999999999.9999m;

    public static Dictionary<string, string[]>? Validate(SupplierReturnWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
        if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["İade ürünlerinin çıkacağı depo seçilmelidir."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["İade 1 ile 100 arasında fatura satırı içermelidir."];
        if (request.Lines is not null)
        {
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                if (line.PurchaseInvoiceLineId == Guid.Empty) errors[$"lines[{i}].purchaseInvoiceLineId"] = ["Fatura satırı seçilmelidir."];
                if (line.Quantity <= 0 || line.Quantity > MaxQuantity || line.Quantity != decimal.Round(line.Quantity, 4))
                    errors[$"lines[{i}].quantity"] = ["İade miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
            }
            if (request.Lines.Select(x => x.PurchaseInvoiceLineId).Distinct().Count() != request.Lines.Count)
                errors["lines"] = ["Aynı fatura satırı iade talebinde yalnızca bir kez bulunabilir."];
        }
        return errors.Count == 0 ? null : errors;
    }
}

public static class SupplierPaymentValidation
{
    public static Dictionary<string, string[]>? Validate(SupplierPaymentWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
        if (request.Amount <= 0 || request.Amount > 9999999999999999.99m || request.Amount != decimal.Round(request.Amount, 2))
            errors["amount"] = ["Ödeme tutarı pozitif olmalı ve en fazla iki ondalık basamak içermelidir."];
        var method = request.PaymentMethod?.Trim();
        if (method is not ("Cash" or "Bank transfer" or "Card" or "Check"))
            errors["paymentMethod"] = ["Ödeme yöntemi Cash, Bank transfer, Card veya Check olmalıdır."];
        if ((method is "Cash" or "Bank transfer") && request.FinancialAccountId is null)
            errors["financialAccountId"] = ["Nakit veya havale ödemesi için finans hesabı seçilmelidir."];
        if (method is not ("Cash" or "Bank transfer") && request.FinancialAccountId is not null)
            errors["financialAccountId"] = ["Finans hesabı yalnızca nakit veya havale ödemesinde kullanılabilir."];
        if (request.Reference?.Trim().Length > 100) errors["reference"] = ["Referans en fazla 100 karakter olabilir."];
        return errors.Count == 0 ? null : errors;
    }
}

public static class PurchaseInvoiceWorkflow
{
    public static decimal Outstanding(decimal grandTotal, decimal paidAmount, decimal returnedAmount = 0m) => Math.Max(0m, grandTotal - paidAmount - returnedAmount);

    public static SalesQuoteLineAmounts CalculateIncrementalAmounts(Guid stockItemId, decimal unitPrice,
        decimal discountPercent, decimal vatPercent, decimal previouslyInvoicedQuantity,
        SalesQuoteLineAmounts previouslyInvoicedAmounts, decimal quantity)
    {
        var cumulative = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(stockItemId,
            previouslyInvoicedQuantity + quantity, unitPrice, discountPercent, vatPercent));
        return new SalesQuoteLineAmounts(cumulative.LineSubtotal - previouslyInvoicedAmounts.LineSubtotal,
            cumulative.DiscountAmount - previouslyInvoicedAmounts.DiscountAmount,
            cumulative.TaxAmount - previouslyInvoicedAmounts.TaxAmount,
            cumulative.LineTotal - previouslyInvoicedAmounts.LineTotal);
    }
}
