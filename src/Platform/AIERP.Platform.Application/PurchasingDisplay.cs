using System.Text.Json;
using AIERP.Platform.Domain;

namespace AIERP.Platform.Application;

/// <summary>
/// Display values the purchasing screens used to compute in the browser (taslak 21): invoice payment state and days past due,
/// order receiving progress and delay, request need-by days. The view records expose them as members outside their
/// constructors, so ERP catalog operations declared before them keep their columns. "Today" is the UTC date, like the
/// server's other document dates (reversal dates, fiscal checks).
/// </summary>
public static class PurchasingDisplay
{
    public static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    /// <summary>
    /// Voided → Voided; nothing outstanding → Paid when something was paid, else Posted (fully returned); outstanding and past
    /// due → Overdue; outstanding with a payment → Partial; otherwise Posted. Same order as the legacy list tag.
    /// </summary>
    public static string PaymentState(PurchaseInvoiceStatus status, DateOnly dueDate, decimal paidAmount, decimal outstandingAmount, DateOnly today)
    {
        if (status != PurchaseInvoiceStatus.Posted) return "Voided";
        if (outstandingAmount <= 0) return paidAmount > 0 ? "Paid" : "Posted";
        if (OverdueDays(status, dueDate, outstandingAmount, today) > 0) return "Overdue";
        return paidAmount > 0 ? "Partial" : "Posted";
    }

    /// <summary>Days past the due date of a posted invoice with an outstanding amount; 0 otherwise.</summary>
    public static int OverdueDays(PurchaseInvoiceStatus status, DateOnly dueDate, decimal outstandingAmount, DateOnly today) =>
        status == PurchaseInvoiceStatus.Posted && outstandingAmount > 0 ? Math.Max(0, today.DayNumber - dueDate.DayNumber) : 0;

    /// <summary>The outstanding amount, or null for a voided invoice (the list still returns its total as outstanding).</summary>
    public static decimal? DisplayOutstanding(PurchaseInvoiceStatus status, decimal outstandingAmount) =>
        status == PurchaseInvoiceStatus.Posted ? outstandingAmount : null;

    /// <summary>An order still waiting for goods (open or partially received) whose expected receipt date has passed.</summary>
    public static bool IsOrderOverdue(PurchaseOrderStatus status, DateOnly? expectedReceiptDate, DateOnly today) =>
        status is PurchaseOrderStatus.Open or PurchaseOrderStatus.PartiallyReceived && expectedReceiptDate is { } expected && expected < today;

    /// <summary>Days since the expected receipt date of an overdue order; 0 otherwise.</summary>
    public static int OrderDelayDays(PurchaseOrderStatus status, DateOnly? expectedReceiptDate, DateOnly today) =>
        IsOrderOverdue(status, expectedReceiptDate, today) ? today.DayNumber - expectedReceiptDate!.Value.DayNumber : 0;

    /// <summary>Received share of the ordered quantity, 0–100 with two decimals; null without quantities.</summary>
    public static decimal? ReceivedPercent(decimal? ordered, decimal? received) =>
        ordered is > 0 && received is { } value ? Math.Min(100m, decimal.Round(value * 100m / ordered.Value, 2, MidpointRounding.AwayFromZero)) : null;

    /// <summary>Days until the need date (negative once past) while the request is open (submitted or approved); null otherwise.</summary>
    public static int? NeededByDays(PurchaseRequestStatus status, DateOnly? neededByDate, DateOnly today) =>
        status is PurchaseRequestStatus.Submitted or PurchaseRequestStatus.Approved && neededByDate is { } date ? date.DayNumber - today.DayNumber : null;

    /// <summary>The profile has a non-empty <c>taxRules</c> array (same reading as the document profile resolution).</summary>
    public static bool HasTaxRules(string parametersJson) =>
        ReadParameters(parametersJson, root => root.TryGetProperty("taxRules", out var rules) && rules.ValueKind == JsonValueKind.Array && rules.GetArrayLength() > 0);

    /// <summary>The profile is marked <c>defaultForDocuments: true</c>.</summary>
    public static bool IsDefaultForDocuments(string parametersJson) =>
        ReadParameters(parametersJson, root => root.TryGetProperty("defaultForDocuments", out var value) && value.ValueKind == JsonValueKind.True);

    private static bool ReadParameters(string parametersJson, Func<JsonElement, bool> read)
    {
        try
        {
            using var document = JsonDocument.Parse(parametersJson);
            return document.RootElement.ValueKind == JsonValueKind.Object && read(document.RootElement);
        }
        catch (JsonException) { return false; }
    }
}
