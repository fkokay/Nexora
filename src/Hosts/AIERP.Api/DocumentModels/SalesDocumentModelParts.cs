using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// What the sales document models (<c>satis.siparis</c>, <c>satis.teklif</c>) share: the entered and calculated line columns, the
/// "stok seçilince" fill and its route handler, the sample amounts of the Studio canvas and the permission check of the transition
/// buttons. A model adds only what is its own (dates, states, transitions, extra columns).
/// </summary>
internal static class SalesDocumentModelParts
{
    /// <summary>The line columns of a sales document, in page order; a model appends its own (e.g. the order's delivered quantity).</summary>
    internal static DocumentLineColumnView[] LineColumns() =>
    [
        new("stockItemId", "Stok", "lookup", true, false, "stok.kart.listele"),
        new("quantity", "Miktar", "number", true, false, null),
        new("unitCode", "Birim", "lookup", false, false, "stok.kart.birimleri"),
        new("unitPrice", "Birim fiyat", "number", true, false, null),
        new("currencyCode", "Döviz", "text", false, false, null),
        new("discountPercent", "İsk. %", "number", false, false, null),
        new("vatPercent", "KDV %", "number", false, false, null),
        new("isVatIncluded", "KDV dâhil", "checkbox", false, false, null),
        new("availableQuantity", "Kullanılabilir", "number", false, true, null),
        new("lineSubtotal", "Ara toplam", "money", false, true, null),
        new("discountAmount", "İskonto", "money", false, true, null),
        new("taxAmount", "KDV", "money", false, true, null),
        new("lineTotal", "Tutar", "money", false, true, null)
    ];

    /// <summary>"Alan değişince": choosing a stock card fills these line cells.</summary>
    internal static IReadOnlyDictionary<string, IReadOnlyList<string>> StockFills() => new Dictionary<string, IReadOnlyList<string>>
    {
        ["stockItemId"] = ["unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity"]
    };

    /// <summary>
    /// <c>POST /api/document-models/{code}/fill</c> of the sales documents: the stock card's unit, list price, VAT, discount, currency and
    /// the free quantity. Read-only; each model maps this on its own literal route (the ERP operation catalog matches routes literally).
    /// </summary>
    internal static async Task<IResult> FillAsync(DocumentFillRequest request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
        if (request.Field != "stockItemId") return Results.Ok(new DocumentFillResult(new Dictionary<string, object?>()));
        if (!Guid.TryParse(request.Value, out var stockItemId)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["value"] = ["Stok kartı seçin."] });
        var item = await db.StockItems.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == stockItemId && x.IsActive, ct);
        if (item is null) return Results.NotFound();
        var available = await StockAvailability.AvailableAsync(db, tenantId, [item.Id], ct);
        return Results.Ok(new DocumentFillResult(new Dictionary<string, object?>
        {
            ["unitCode"] = item.UnitCode,
            ["unitPrice"] = item.SalesListPrice,
            ["vatPercent"] = item.SalesVatPercent,
            ["discountPercent"] = item.SalesDiscountPercent,
            ["currencyCode"] = item.PriceCurrencyCode,
            ["availableQuantity"] = available.GetValueOrDefault(item.Id)
        }));
    }

    /// <summary>A sample line's amounts, worked out the way the line math does (Studio canvas only; nothing is read or written).</summary>
    internal static (decimal Subtotal, decimal Discount, decimal Tax, decimal Total) SampleAmounts(decimal quantity, decimal price, decimal discountPercent,
        decimal vatPercent)
    {
        var subtotal = Math.Round(quantity * price, 2);
        var discount = Math.Round(subtotal * discountPercent / 100m, 2);
        var tax = Math.Round((subtotal - discount) * vatPercent / 100m, 2);
        return (subtotal, discount, tax, subtotal - discount + tax);
    }

    /// <summary>The VAT breakdown by rate of already-calculated lines.</summary>
    internal static List<DocumentVatRow> VatRows(IEnumerable<(decimal Rate, decimal Subtotal, decimal Discount, decimal Tax)> lines) =>
        lines.GroupBy(x => x.Rate).OrderBy(g => g.Key).Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.Subtotal - x.Discount), g.Sum(x => x.Tax))).ToList();

    /// <summary>
    /// Keeps the transitions the user may run: the document's own <paramref name="candidates"/> (decided by its state chain) pass only when the
    /// tenant's permission rules allow <c>execute</c> on <paramref name="resourceType"/> for this record (status, customer).
    /// </summary>
    internal static async Task<IReadOnlyList<string>> ExecutableAsync(IPlatformPermissionAuthorizer authorizer, ClaimsPrincipal principal, Guid tenantId,
        string resourceType, Guid recordId, string status, Guid? customerId, List<string> candidates, CancellationToken ct)
    {
        if (candidates.Count == 0) return candidates;
        var role = principal.FindFirstValue("role") ?? "";
        if (!Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return [];
        var execute = PlatformPermissionCatalog.Definitions.Single(x => x.ResourceType == resourceType && x.Action == "execute");
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role,
            ["resource.type"] = execute.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"),
            ["resource.route.id"] = recordId.ToString("D"), ["resource.status"] = status,
            ["request.method"] = "POST", ["request.action"] = "execute"
        };
        if (customerId is { } customer) attributes["resource.customerId"] = customer.ToString("D");
        return await authorizer.IsAllowedAsync(tenantId, userId, role, new ResolvedPlatformPermission(execute, attributes), ct) ? candidates : [];
    }
}
