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
public sealed record DocumentFieldView(string Code, string Label, string Type, bool Required, string? OptionsOperation, bool ReadOnly = false);

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

/// <summary>A held order's pending approval (belge kuralı Onay iste): the current step's deciders and whether this user may decide.</summary>
public sealed record DocumentApprovalView(Guid InstanceId, string Step, IReadOnlyList<string> Approvers, bool CanDecide);
