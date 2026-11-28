using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// The depolar arası transfer model (<c>stok.transfer</c>). A transfer is posted in one step (no draft): "Transferi kaydet" is the
/// model's create operation (<c>depo.transfer.olustur</c>, retry-safe with a request id the page makes once per new document); the only
/// transition is İptal et (<c>depo.transfer.iptal</c>: linked reversal movements in both warehouses). A saved transfer is read-only.
/// </summary>
internal static class InventoryTransferDocumentModel
{
    internal const string Code = DocumentActivityLog.InventoryTransfer;
    internal const string Void = "iptal";

    internal static string Label(InventoryTransferStatus status) => status switch
    {
        InventoryTransferStatus.Posted => "Kaydedildi",
        InventoryTransferStatus.Voided => "İptal edildi",
        _ => status.ToString()
    };

    internal static readonly DocumentModelView Model = new(Code, "Depolar arası transfer",
        [
            new("code", "Transfer no", "text", false, null, ReadOnly: true),
            new("transferDate", "Tarih", "date", true, null),
            new("fromWarehouseId", "Kaynak depo", "lookup", true, "depo.listele"),
            new("toWarehouseId", "Hedef depo", "lookup", true, "depo.listele")
        ],
        [
            new("stockItemId", "Stok", "lookup", true, false, "stok.kart.listele"),
            new("unitCode", "Birim", "text", false, false, null),
            new("quantity", "Miktar", "number", true, false, null)
        ],
        // Kaydedildi closes the chain; İptal edildi sits beside it.
        [new(nameof(InventoryTransferStatus.Posted), Label(InventoryTransferStatus.Posted), false),
            new(nameof(InventoryTransferStatus.Voided), Label(InventoryTransferStatus.Voided), true)],
        [new(Void, "İptal et", [nameof(InventoryTransferStatus.Posted)], nameof(InventoryTransferStatus.Voided), "depo.transfer.iptal", true)],
        "depo.transfer.belge", "", "depo.transfer.doldur",
        new Dictionary<string, IReadOnlyList<string>> { ["stockItemId"] = ["unitCode"] },
        "depo.transfer.olustur", "");

    /// <summary>The transitions the state chain allows (yetki denetimi öncesi).</summary>
    internal static List<string> Candidates(InventoryTransferStatus status) => status == InventoryTransferStatus.Posted ? [Void] : [];

    /// <summary>
    /// <c>POST /api/document-models/stok.transfer/fill</c>: choosing a stock card fills the line's unit with the card's base unit.
    /// Read-only; the card must belong to the tenant and be active.
    /// </summary>
    internal static async Task<IResult> FillAsync(DocumentFillRequest request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
        if (request.Field != "stockItemId") return Results.Ok(new DocumentFillResult(new Dictionary<string, object?>()));
        if (!Guid.TryParse(request.Value, out var stockItemId)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["value"] = ["Stok kartı seçin."] });
        var item = await db.StockItems.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == stockItemId && x.IsActive, ct);
        if (item is null) return Results.NotFound();
        return Results.Ok(new DocumentFillResult(new Dictionary<string, object?> { ["unitCode"] = item.UnitCode }));
    }

    internal static InventoryTransferDocumentView View(InventoryTransferDetailView detail, IReadOnlyList<string> allowed,
        IReadOnlyList<DocumentActivityView> activity) =>
        new(detail, new InventoryTransferTotals(detail.Lines.Count, detail.Lines.Sum(x => x.Quantity)), allowed, activity, activity.Count == 0);

    /// <summary>The Studio canvas' sample transfer in <paramref name="state"/>: fixed values, nothing read or written.</summary>
    internal static InventoryTransferDocumentView Sample(InventoryTransferStatus state)
    {
        IReadOnlyList<InventoryTransferLineView> lines =
        [
            new(Guid.Empty, "ZYT-01", "Sızma zeytinyağı 5 L", "KOLİ", 40m, 40m, "KOLİ", Guid.Empty, "A-01", "Raf A-01", Guid.Empty, "B-02", "Raf B-02"),
            new(Guid.Empty, "BAL-03", "Çiçek balı 850 g", "ADET", 120m, 10m, "KOLİ", null, null, null, null, null, null)
        ];
        var summary = new InventoryTransferSummary(Guid.Empty, "TRF-ORNEK-0001", Guid.Empty, "Merkez depo", Guid.Empty, "Şube deposu",
            new DateOnly(2026, 11, 26), state, lines.Count, new DateTimeOffset(2026, 11, 26, 9, 0, 0, TimeSpan.Zero));
        var at = new DateTimeOffset(2026, 11, 26, 9, 5, 0, TimeSpan.Zero);
        List<DocumentActivityView> activity = [new("kaydet", "Transfer kaydedildi", "core", "done", null, null, at)];
        if (state == InventoryTransferStatus.Voided) activity.Add(new("iptal", "Transfer iptal edildi", "core", "done", "Hatalı depo seçimi", null, at.AddHours(1)));
        return View(new InventoryTransferDetailView(summary, lines), Candidates(state), activity);
    }
}
