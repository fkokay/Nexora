using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Api.DocumentModels;

internal sealed record ManufacturingRecipeDocumentView(BomView Recipe, decimal StandardCostTotal,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<DocumentActivityView> Activity, bool ActivityStartedLate);

internal static class ManufacturingRecipeDocumentModel
{
    internal const string Code = DocumentActivityLog.ManufacturingRecipe;
    internal static readonly DocumentModelView Model = new(Code, "Üretim reçetesi",
        [new("code", "Reçete kodu", "text", true, null), new("name", "Ad", "text", true, null),
         new("productStockItemId", "Mamul", "lookup", true, "stok.kart.listele"), new("outputQuantity", "Çıktı miktarı", "number", true, null)],
        [new("componentStockItemId", "Bileşen", "lookup", true, false, "stok.kart.listele"),
         new("quantity", "Miktar", "number", true, false, null), new("scrapPercent", "Fire %", "number", false, false, null),
         new("standardUnitCostBase", "Standart maliyet", "money", false, false, null)],
        [new("Active", "Aktif", false), new("Inactive", "Pasif", true)],
        [new("pasifeAl", "Pasife al", ["Active"], "Inactive", "uretim.recete.pasifeAl", false),
         new("etkinlestir", "Etkinleştir", ["Inactive"], "Active", "uretim.recete.etkinlestir", false)],
        "uretim.recete.belge", "", "", new Dictionary<string, IReadOnlyList<string>>(), "uretim.recete.olustur", "uretim.recete.guncelle",
        LineGroups: [new DocumentLineGroupView("rota", "Rota",
            [new("workCenterId", "İş merkezi", "lookup", true, false, "uretim.isMerkezi.listele"),
             new("setupMinutes", "Kurulum dk", "number", false, false, null), new("runMinutesPerOutputUnit", "Birim çalışma dk", "number", true, false, null),
             new("minimumWaitDaysAfterPrevious", "Bekleme günü", "number", false, false, null), new("setupFamilyCode", "Kurulum ailesi", "text", true, false, null),
             new("plannedEnergyKwhPerOutput", "Enerji", "number", false, false, null), new("plannedEnergyCostPerKwhBase", "Enerji birim maliyeti", "money", false, false, null),
             new("eligibleWorkCenterIds", "Alternatif iş merkezleri", "lookup-list", false, false, "uretim.isMerkezi.tumunuListele")], 50)]);

    internal static ManufacturingRecipeDocumentView Sample(bool active)
    {
        var id = Guid.Empty;
        var line = new BomLineView(id, "KMP-01 · Bileşen", 2m, 1m, 12.5m);
        var operation = new BomOperationView(1, id, "MER-01 · Montaj", 15m, 3m, 0, "GENEL", 1m, 2m, [id]);
        var recipe = new BomView(id, "REC-ORNEK-01", "Örnek ürün reçetesi", id, "Mamul", "None", 1m, active, 0,
            [line], Convert.ToBase64String(new byte[8]), [operation]);
        return new ManufacturingRecipeDocumentView(recipe, 25.25m, [], [], false);
    }
}
