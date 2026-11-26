using AIERP.Platform.Domain;

namespace AIERP.Platform.Application;

/// <summary>
/// The sales order's state chain (belge kuralları, alt proje 6): Taslak → (Onay bekliyor) → Onaylı → Sevk edildi → Faturalandı,
/// with İptal off the chain. Open keeps its name and number and means "approved"; Fulfilled means "shipped".
/// </summary>
public static class SalesOrderLifecycle
{
    public static bool CanEdit(SalesOrderStatus status) => status == SalesOrderStatus.Draft;

    public static bool CanApprove(SalesOrderStatus status) => status == SalesOrderStatus.Draft;

    public static bool CanEditDeliveryDateOrCustomFields(SalesOrderStatus status) =>
        status is SalesOrderStatus.Draft or SalesOrderStatus.Open;

    public static bool CanUnapprove(SalesOrderStatus status, bool hasDeliveries, bool hasInvoices, bool hasReservations) =>
        status == SalesOrderStatus.Open && !hasDeliveries && !hasInvoices && !hasReservations;

    public static bool CanCancel(SalesOrderStatus status, bool hasDeliveries) =>
        status == SalesOrderStatus.Draft || status == SalesOrderStatus.Open && !hasDeliveries;

    /// <summary>The <see cref="IsCommitted"/> statuses, for queries (<c>CommittedStatuses.Contains(x.Status)</c> translates to SQL).</summary>
    public static readonly SalesOrderStatus[] CommittedStatuses = [SalesOrderStatus.Open, SalesOrderStatus.Fulfilled, SalesOrderStatus.Invoiced];

    /// <summary>Approved, shipped or invoiced: the order is a commitment (planning, backlog, foreign trade links).</summary>
    public static bool IsCommitted(SalesOrderStatus status) =>
        status is SalesOrderStatus.Open or SalesOrderStatus.Fulfilled or SalesOrderStatus.Invoiced;

    /// <summary>The status after a delivery or invoice change; drafts, pending and cancelled orders are not re-derived.</summary>
    public static SalesOrderStatus Derive(SalesOrderStatus current, bool fullyDelivered, bool allPostedDeliveriesInvoiced, bool hasPostedDelivery)
    {
        if (current is SalesOrderStatus.Draft or SalesOrderStatus.PendingApproval or SalesOrderStatus.Cancelled) return current;
        if (!fullyDelivered) return SalesOrderStatus.Open;
        return hasPostedDelivery && allPostedDeliveriesInvoiced ? SalesOrderStatus.Invoiced : SalesOrderStatus.Fulfilled;
    }

    public static string Label(SalesOrderStatus status) => status switch
    {
        SalesOrderStatus.Draft => "Taslak",
        SalesOrderStatus.PendingApproval => "Onay bekliyor",
        SalesOrderStatus.Open => "Onaylı",
        SalesOrderStatus.Fulfilled => "Sevk edildi",
        SalesOrderStatus.Invoiced => "Faturalandı",
        SalesOrderStatus.Cancelled => "İptal",
        _ => status.ToString()
    };
}
