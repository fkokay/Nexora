namespace AIERP.Platform.Application;

/// <summary>
/// Which journal entries the reverse endpoint (POST /general-ledger/entries/{id}/reverse) accepts. The handler and the
/// <c>canReverse</c> flags of the entry views use this one set, so a page condition can never drift from the server rule.
/// Entries of other sources (ManualReversal, fiscal-year close/opening, payroll, fixed assets, credit facilities, payment
/// instruments) are reversed from their own screens, never here.
/// </summary>
public static class JournalReversalRules
{
    public const string ManualSourceType = "Manual";
    public const string ReversalSourceType = "ManualReversal";

    public static readonly IReadOnlySet<string> ReversibleSourceTypes = new HashSet<string>(StringComparer.Ordinal)
    {
        ManualSourceType, "SalesInvoice", "PurchaseInvoice", "StandaloneInvoiceDraft", "PurchaseReceipt", "SalesDelivery", "SalesReturn",
        "SupplierReturn", "CustomerCollection", "SupplierPayment", "FxRevaluation", "InventoryCostAdjustment"
    };

    private static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [ManualSourceType] = "Manuel", [ReversalSourceType] = "Ters kayıt", ["SalesInvoice"] = "Satış faturası",
        ["PurchaseInvoice"] = "Alış faturası", ["StandaloneInvoiceDraft"] = "Serbest fatura", ["PurchaseReceipt"] = "Mal kabul",
        ["SalesDelivery"] = "Satış irsaliyesi", ["SalesReturn"] = "Satış iadesi", ["SupplierReturn"] = "Alış iadesi",
        ["CustomerCollection"] = "Tahsilat", ["SupplierPayment"] = "Tedarikçi ödemesi", ["FxRevaluation"] = "Kur değerleme",
        ["InventoryCostAdjustment"] = "Stok maliyet düzeltmesi", ["FiscalYearClose"] = "Dönem kapanışı", ["FiscalYearOpening"] = "Dönem açılışı",
        ["PaymentInstrumentEvent"] = "Çek / senet", ["FixedAssetAcquisition"] = "Sabit kıymet edinimi",
        ["FixedAssetDepreciation"] = "Amortisman", ["FixedAssetDisposal"] = "Sabit kıymet çıkışı",
        ["CreditFacilityInterestAccrual"] = "Kredi faiz tahakkuku", ["CreditFacilityMovementReversal"] = "Kredi hareketi ters kaydı"
    };

    public static bool IsReversible(string? sourceType) => sourceType is not null && ReversibleSourceTypes.Contains(sourceType);

    public static bool IsSourced(string? sourceType) => !string.Equals(sourceType, ManualSourceType, StringComparison.Ordinal);

    public static bool IsReversal(string? sourceType) => string.Equals(sourceType, ReversalSourceType, StringComparison.Ordinal);

    /// <summary>The reverse endpoint would accept the entry: a reversible source type that is not reversed yet.</summary>
    public static bool CanReverse(string? sourceType, bool isReversed) => !isReversed && IsReversible(sourceType);

    /// <summary>Turkish display name of a source type; an unknown type is shown as is.</summary>
    public static string SourceLabel(string? sourceType) =>
        sourceType is null ? "" : Labels.TryGetValue(sourceType, out var label) ? label : sourceType;
}

/// <summary>Chart of accounts helpers shared by the ledger account and trial balance reads.</summary>
public static class LedgerAccountRules
{
    /// <summary>Tek Düzen account class: the first character of the code ("" for an empty code).</summary>
    public static string AccountClass(string? code)
    {
        var trimmed = code?.Trim() ?? "";
        return trimmed.Length == 0 ? "" : trimmed[..1];
    }

    /// <summary>
    /// The main (3-digit) account code of a code: the part before the first '.', cut to its first 3 characters
    /// ("100.001" → "100", "1001" → "100", "60" → "60"), as the legacy trial balance aggregates main accounts.
    /// </summary>
    public static string MainAccountCode(string? code)
    {
        var head = (code?.Trim() ?? "").Split('.')[0];
        return head.Length > 3 ? head[..3] : head;
    }
}
