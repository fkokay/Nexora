namespace AIERP.Api.DocumentModels;

/// <summary>
/// A document model (belge kuralları, modül çekirdeği): what a Belge page shows and does without page settings — header fields,
/// line columns (entered or calculated), states and transitions, and the operations that load, calculate and fill it.
/// </summary>
public sealed record DocumentModelView(string Code, string Label, IReadOnlyList<DocumentFieldView> Fields,
    IReadOnlyList<DocumentLineColumnView> LineColumns, IReadOnlyList<DocumentStateView> States, IReadOnlyList<DocumentTransitionView> Transitions,
    string LoadOperation, string CalculateOperation, string FillOperation,
    IReadOnlyDictionary<string, IReadOnlyList<string>> Fills, string CreateOperation, string UpdateOperation,
    IReadOnlyList<DocumentCreationView>? Creations = null);

/// <summary>A header field. <see cref="ReadOnly"/> fields (the document number) are shown but never entered.</summary>
public sealed record DocumentFieldView(string Code, string Label, string Type, bool Required, string? OptionsOperation, bool ReadOnly = false,
    IReadOnlyList<DocumentOptionView>? Options = null);

/// <summary>A fixed choice of a <c>select</c> field: the value sent to the server and its label.</summary>
public sealed record DocumentOptionView(string Value, string Label);

/// <summary>A line column. <see cref="VisibleFrom"/> names the first state it is shown in (e.g. the delivered quantity from Onaylı on).</summary>
public sealed record DocumentLineColumnView(string Code, string Label, string Type, bool Required, bool Calculated, string? OptionsOperation,
    string? VisibleFrom = null);

public sealed record DocumentStateView(string Code, string Label, bool Terminal);

public sealed record DocumentTransitionView(string Code, string Label, IReadOnlyList<string> From, string To, string Operation, bool RequiresReason);

/// <summary>
/// "Belgeden belge": an action that creates the next document from this one (teklif → sipariş) by calling an existing ERP operation, then opens it.
/// Not a state transition: the source keeps its state. <see cref="From"/> lists the states it is offered in, <see cref="Target"/> is the
/// document model of the created document (the operation answers a record with its <c>id</c>).
/// </summary>
public sealed record DocumentCreationView(string Code, string Label, IReadOnlyList<string> From, string Operation, string Target);

/// <summary>"Alan değişince" request: the changed field and its value; the answer is the cells the model fills.</summary>
public sealed record DocumentFillRequest(string? Field, string? Value, Guid? CustomerId = null, DateOnly? OrderDate = null);

/// <summary>The optional body of a Belge transition call on an existing endpoint: the page-made request key and the reason the user gave.</summary>
public sealed record DocumentTransitionBody(Guid? RequestId = null, string? Reason = null);

public sealed record DocumentFillResult(IReadOnlyDictionary<string, object?> Values);

public sealed record DocumentVatRow(decimal Rate, decimal TaxableAmount, decimal Amount);

/// <summary>The saved amounts of a document: totals and the VAT breakdown by rate.</summary>
public sealed record DocumentAmounts(string CurrencyCode, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal,
    IReadOnlyList<DocumentVatRow> Vat);

/// <summary>A sales order as its Belge page needs it: the order, amounts, what this user may do now and the işlem günlüğü.</summary>
public sealed record SalesOrderDocumentView(AIERP.Platform.Application.SalesOrderView Order, DocumentAmounts Amounts,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<AIERP.Platform.Application.DocumentActivityView> Activity, bool ActivityStartedLate,
    DocumentApprovalView? Approval = null);

/// <summary>A sales quote as its Belge page needs it: the quote, amounts, what this user may do now and the işlem günlüğü.</summary>
public sealed record SalesQuoteDocumentView(AIERP.Platform.Application.SalesQuoteView Quote, DocumentAmounts Amounts,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<AIERP.Platform.Application.DocumentActivityView> Activity, bool ActivityStartedLate,
    IReadOnlyList<string>? AllowedCreations = null);

/// <summary>The sales invoice states of its Belge: Draft is only an unsaved document (saving cuts the invoice), then the entity's Posted / Voided.</summary>
public enum SalesInvoiceDocumentState { Draft, Posted, Voided }

/// <summary>An invoice line as its Belge shows it (the line number is the stored order line number).</summary>
public sealed record SalesInvoiceDocumentLine(int LineNumber, Guid StockItemId, string StockCode, string StockName, string UnitCode, decimal Quantity,
    decimal UnitPrice, decimal DiscountPercent, decimal VatPercent, decimal LineSubtotal, decimal DiscountAmount, decimal TaxAmount, decimal LineTotal);

/// <summary>A sales invoice as a Belge page needs it (the header fields the page edits or shows; e-Arşiv details stay on the invoice).</summary>
public sealed record SalesInvoiceDocumentRecord(Guid Id, string Code, Guid CustomerId, string CustomerName, DateOnly InvoiceDate, string CurrencyCode,
    SalesInvoiceDocumentState Status, AIERP.Platform.Domain.SalesInvoiceType InvoiceType, string? AccountingProfileCode, string? EDocumentScenario, string? EDocumentTypeCode,
    string? EDocumentRecipientAlias, string? Notes, Guid? WarehouseId, string? WarehouseName, string? DeliveryCode, string? OrderCode,
    IReadOnlyList<SalesInvoiceDocumentLine> Lines, IReadOnlyList<AIERP.Platform.Application.SalesInvoiceCustomFieldValueView> CustomFields);

/// <summary>A sales invoice as its Belge page needs it: the invoice, amounts, what this user may do now and the işlem günlüğü.</summary>
public sealed record SalesInvoiceDocumentView(SalesInvoiceDocumentRecord Invoice, DocumentAmounts Amounts,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<AIERP.Platform.Application.DocumentActivityView> Activity, bool ActivityStartedLate);

/// <summary>The sales delivery states of its Belge: a standalone delivery starts as Draft; order-based ones are Posted or Voided.</summary>
public enum SalesDeliveryDocumentState { Draft, Posted, Voided }

/// <summary>A delivery line as its Belge shows it: entered quantity and unit, optional price (free or unpriced lines have none) and the saved amounts.</summary>
public sealed record SalesDeliveryDocumentLine(int LineNumber, Guid StockItemId, string StockCode, string StockName, string UnitCode, decimal Quantity,
    decimal? UnitPrice, decimal? DiscountPercent, decimal? VatPercent, bool IsFreeOfCharge, string? TrackingCode, DateOnly? ExpiryDate, Guid? StorageLocationId,
    decimal LineSubtotal, decimal DiscountAmount, decimal TaxAmount, decimal LineTotal);

/// <summary>A sales delivery (order-based, invoice-born or standalone) as a Belge page needs it.</summary>
public sealed record SalesDeliveryDocumentRecord(Guid Id, string Code, Guid? CustomerId, string CustomerName, DateOnly DeliveryDate, string CurrencyCode,
    SalesDeliveryDocumentState Status, Guid WarehouseId, string WarehouseName, bool IsStandalone, string? OrderCode, string? InvoiceCode,
    IReadOnlyList<SalesDeliveryDocumentLine> Lines);

/// <summary>A sales delivery as its Belge page needs it: the delivery, amounts, what this user may do now and the işlem günlüğü.</summary>
public sealed record SalesDeliveryDocumentView(SalesDeliveryDocumentRecord Delivery, DocumentAmounts Amounts,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<AIERP.Platform.Application.DocumentActivityView> Activity, bool ActivityStartedLate);

public sealed record PurchaseOrderDocumentView(object Order, DocumentAmounts Amounts,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<AIERP.Platform.Application.DocumentActivityView> Activity, bool ActivityStartedLate);
public sealed record PurchaseInvoiceDocumentView(object Invoice, DocumentAmounts Amounts,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<AIERP.Platform.Application.DocumentActivityView> Activity, bool ActivityStartedLate);

/// <summary>A held order's pending approval (belge kuralı Onay iste): the current step's deciders and whether this user may decide.</summary>
public sealed record DocumentApprovalView(Guid InstanceId, string Step, IReadOnlyList<string> Approvers, bool CanDecide);
