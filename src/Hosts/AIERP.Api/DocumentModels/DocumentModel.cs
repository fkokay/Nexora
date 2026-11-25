namespace AIERP.Api.DocumentModels;

/// <summary>
/// A document model (belge kuralları, modül çekirdeği): what a Belge page shows and does without page settings — header fields,
/// line columns (entered or calculated), states and transitions, and the operations that load, calculate and fill it.
/// </summary>
public sealed record DocumentModelView(string Code, string Label, IReadOnlyList<DocumentFieldView> Fields,
    IReadOnlyList<DocumentLineColumnView> LineColumns, IReadOnlyList<DocumentStateView> States, IReadOnlyList<DocumentTransitionView> Transitions,
    string LoadOperation, string CalculateOperation, string FillOperation);

public sealed record DocumentFieldView(string Code, string Label, string Type, bool Required, string? OptionsOperation);

public sealed record DocumentLineColumnView(string Code, string Label, string Type, bool Required, bool Calculated, string? OptionsOperation);

public sealed record DocumentStateView(string Code, string Label, bool Terminal);

public sealed record DocumentTransitionView(string Code, string Label, IReadOnlyList<string> From, string To, string Operation, bool RequiresReason);

/// <summary>"Alan değişince" request: the changed field and its value; the answer is the cells the model fills.</summary>
public sealed record DocumentFillRequest(string? Field, string? Value, Guid? CustomerId = null, DateOnly? OrderDate = null);

public sealed record DocumentFillResult(IReadOnlyDictionary<string, object?> Values);

public sealed record DocumentVatRow(decimal Rate, decimal TaxableAmount, decimal Amount);

/// <summary>The saved amounts of a document: totals and the VAT breakdown by rate.</summary>
public sealed record DocumentAmounts(string CurrencyCode, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal,
    IReadOnlyList<DocumentVatRow> Vat);

/// <summary>A sales order as its Belge page needs it: the order, amounts, what this user may do now and the işlem günlüğü.</summary>
public sealed record SalesOrderDocumentView(AIERP.Platform.Application.SalesOrderView Order, DocumentAmounts Amounts,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<AIERP.Platform.Application.DocumentActivityView> Activity, bool ActivityStartedLate);
