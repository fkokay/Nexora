using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Api;

/// <summary>
/// Sınıflandırma sonucu. <see cref="ConvertedJson"/> yalnız dönüşüm şema + kalıp doğrulamasından ve
/// <see cref="BehaviorEquivalence"/> denetiminden geçtiyse doludur; o zaman <see cref="Target"/> "list" ya da "free" ve
/// <see cref="Reasons"/> boştur. Tüketiciler yazmadan önce <c>ConvertedJson != null</c> denetler.
/// </summary>
internal sealed record MigrationResult(string? Target, IReadOnlyList<string> Reasons, string? ConvertedJson, string? EquivalenceFailure, int LayoutChanges);

/// <summary>
/// Toplu kalıp geçişi (5b-1): eski (kalıpsız, şema 2) bir sayfa tanımının davranış değişmeden Liste ya da Serbest gövde kalıbına
/// taşınıp taşınamayacağına karar verir ve dönüştürülmüş tanımı üretir. Hiçbir yere yazmaz. Emin olmadığı her durumda hedef
/// vermez ve Türkçe nedenini yazar (bir sayfa birden çok neden taşıyabilir).
/// <para>Kararlar: Liste (Karar 2) önce denenir (Karar 4), olmazsa Serbest gövde (Karar 3). Dönüştürülen tanım
/// <see cref="TenantCustomPageSchema.Validate(string, out string?, IReadOnlySet{string}?)"/> (kalıp kuralları dahil) ve
/// <see cref="BehaviorEquivalence.Check"/> (Karar 5) denetiminden geçmezse dönüştürülmez; neden "Dönüştürülen tanım
/// doğrulanamadı: …" ya da "Eşdeğerlik denetimi başarısız: …" olarak yazılır.</para>
/// </summary>
internal static class PageTemplateMigration
{
    // ---- Global Constraints tablosundaki neden metinleri ----
    internal const string ActionBarReason = "İşlem çubuğu kalıplarda yok.";
    internal const string DialogReason = "Pencere kalıplarda yok.";
    internal const string StepsReason = "Sihirbaz adımları kalıplarda yok.";
    internal const string EditableGridReason = "Düzenlenebilir satır tablosu (Belge kalıbı bekleniyor).";
    internal const string FormReason = "Form alanları (Kayıt kartı adayı).";
    internal const string TabsReason = "Sekmeler bileşenlere göre bölünemiyor.";
    internal const string InlineCodeReason = "Satır içi kod alanı kalıplarda yok.";
    internal const string WidthWhenReason = "Koşula bağlı genişlik kalıplarda yok.";
    internal const string OpenDraftReason = "Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli.";
    internal const string SchemaV1Reason = "Eski şema (sürüm 1); önce tasarımcıda kaydedilmeli.";
    internal static string MissingPart(string type) => $"{type} bu kalıpta yok.";
    internal static string MissingSetting(string prop) => $"{prop} ayarı kalıplarda yok.";

    // ---- Tabloda olmayan durumlar (dönüştürücünün kendi nedenleri) ----
    internal const string UnreadableReason = "Sayfa tanımı okunamadı.";
    internal const string UnknownVersionReason = "Sayfa tanımının şema sürümü bilinmiyor.";
    internal const string AlreadyTemplatedReason = "Sayfa zaten bir kalıp kullanıyor.";
    internal const string NoComponentsReason = "Sayfada bileşen yok.";
    internal const string NestedReason = "İç içe bileşenler (children) kalıplarda yok.";
    internal const string ListNeedsOneTableReason = "Liste kalıbı tam bir veri listesi (dataTable) ister.";
    internal const string ListTooManyPanelsReason = "Liste kalıbında en fazla bir süzgeç alanı ve bir detay paneli olabilir.";
    internal const string NoReadTableReason = "Veri listesi okuma (read) sorgusuna bağlı değil.";
    internal const string GridToolsReason = "Veri listesinin tablo araçları (arama, süzgeç, dışa aktarma…) serbest gövdede yok.";
    internal const string FreeRowActionsReason = "Veri listesinin satır eylemleri serbest gövdede yok.";
    internal const string PanelCardReason = "Panel görünümlü bilgi kartı serbest gövdede yok.";
    internal const string FreeNoBlockReason = "Serbest gövdeye konacak bileşen yok.";
    internal const string FreeTooManyActionsReason = "Serbest gövdede en fazla 8 düğme olabilir.";
    internal const string FreeTooManyBlocksReason = "Serbest gövdede en fazla 20 bölüm olabilir.";
    internal static string SectionSettingReason(string prop) => $"Bölüm başlığının {prop} ayarı serbest gövdede yok.";
    internal static string ValidationFailedReason(string error) => $"Dönüştürülen tanım doğrulanamadı: {error}";
    internal static string EquivalenceFailedReason(string detail) => $"Eşdeğerlik denetimi başarısız: {detail}";

    /// <summary>Izgara motoru ve işlem çubuğu ayarları ("gridFormula", "barCommands"): taşıyan sayfa dönüştürülmez.</summary>
    private static readonly string[] BlockedSettings =
        ["formulas", "fillQuery", "fillColumns", "lookupFills", "lockColumnsWhen", "skipWhenZero", "rowNumberColumn", "commandWhen", "hiddenCommands", "barLook"];
    private static readonly HashSet<string> ListTypes = new(StringComparer.Ordinal)
    { "dataTable", "filterBar", "metric", "button", "contextPanel", "heading", "text", "alert" };
    private static readonly HashSet<string> FreeItemTypes = new(StringComparer.Ordinal)
    { "heading", "text", "label", "alert", "card", "list", "metric", "progress", "badge", "image", "dataTable", "code" };
    private static readonly HashSet<string> SectionHeaderProps = new(StringComparer.Ordinal) { "title", "width", "margin", "padding", "slot" };
    private static readonly HashSet<string> TabsProps = new(StringComparer.Ordinal) { "tabs", "defaultTab", "tabParam", "width", "margin", "padding", "slot" };
    private static readonly string[] GridToolFlags = ["showGridSearch", "showColumnFilters", "showColumnChooser", "showExport", "showPivot", "showCsv", "showSelectedExport"];
    private static readonly string[] RowFeatures = ["rowActions", "rowOpenAction", "bulkDeleteQuery", "detailToggleInput"];
    private static readonly HashSet<string> FullWidthTypes = new(StringComparer.Ordinal)
    { "heading", "text", "label", "divider", "spacer", "formCard", "tabs", "filterChips", "actionBar", "editableGrid", "customFieldsBlock", "filterBar", "steps", "recordHeader" };
    private const int MaxBlockMembers = 12;
    private const int MaxBlocks = 20;
    private const int MaxActions = 8;
    private static readonly JsonSerializerOptions Output = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private sealed record Attempt(string? Json, string? Reason);

    /// <param name="catalog">Firmanın etkin kataloğu: <c>dataSource</c> / <c>action</c> sorguları buna göre doğrulanır (yayın
    /// kapısıyla aynı); null iken böyle bir sorgu taşıyan sayfa dönüştürülmez (standartlar kataloğa bağlı değildir).</param>
    /// <param name="lookup">ERP işlem kataloğu; null iken <see cref="ErpOperationCatalog.TryGet"/> (test dikişi).</param>
    public static MigrationResult Classify(string definitionJson, bool hasOpenDraft, CatalogBundle? catalog = null, ErpOperationLookup? lookup = null)
    {
        JsonObject root;
        try
        {
            if (JsonNode.Parse(definitionJson) is not JsonObject parsed) return Refused(UnreadableReason);
            root = parsed;
        }
        catch (JsonException) { return Refused(UnreadableReason); }

        var version = root["schemaVersion"] is JsonValue v && v.TryGetValue<int>(out var number) ? number : 0;
        if (version == 1) return Refused(SchemaV1Reason);
        if (version != 2) return Refused(UnknownVersionReason);
        if (root.ContainsKey("template")) return Refused(AlreadyTemplatedReason);
        if (root["components"] is not JsonArray components || components.Count == 0) return Refused(NoComponentsReason);
        if (components.Any(x => x is not JsonObject)) return Refused(UnreadableReason);

        var reasons = new List<string>();
        if (hasOpenDraft) reasons.Add(OpenDraftReason);
        foreach (var component in components.OfType<JsonObject>()) Scan(component, reasons);
        if (reasons.Any(x => x != OpenDraftReason)) return Refused([.. reasons.Distinct()]);

        string? equivalenceFailure = null;
        foreach (var (target, build) in new (string, Func<JsonObject, Attempt>)[] { ("list", BuildList), ("free", BuildFree) })
        {
            var attempt = build((JsonObject)root.DeepClone());
            if (attempt.Json is null) { reasons.Add(attempt.Reason!); continue; }
            if (!TenantCustomPageSchema.Validate(attempt.Json, out var error, TenantCustomPageQueries.OperationNames(definitionJson), lookup ?? ErpOperationCatalog.TryGet, catalog))
            { reasons.Add(ValidationFailedReason(error ?? "?")); continue; }
            if (BehaviorEquivalence.Check(definitionJson, attempt.Json) is { } difference)
            { equivalenceFailure ??= difference; reasons.Add(EquivalenceFailedReason(difference)); continue; }
            if (hasOpenDraft) return Refused(OpenDraftReason);
            return new MigrationResult(target, [], attempt.Json, null, BehaviorEquivalence.LayoutChanges(definitionJson, attempt.Json));
        }
        return new MigrationResult(null, [.. reasons.Distinct()], null, equivalenceFailure, 0);
    }

    private static MigrationResult Refused(params string[] reasons) => new(null, reasons, null, null, 0);

    private static bool HasProp(JsonObject? props, string key) => props is not null && props.ContainsKey(key);

    /// <summary>İki kalıbın da taşıyamadığı şeyler, bileşen ağacının her yerinde.</summary>
    private static void Scan(JsonObject component, List<string> reasons)
    {
        var type = TypeOf(component);
        var props = component["props"] as JsonObject;
        switch (type)
        {
            case "actionBar": reasons.Add(ActionBarReason); break;
            case "dialog": reasons.Add(DialogReason); break;
            case "steps": reasons.Add(StepsReason); break;
            case "editableGrid": reasons.Add(EditableGridReason); break;
            case "input" or "formCard" or "customFieldsBlock" or "form": reasons.Add(FormReason); break;
            case "code" when !HasProp(props, "catalogComponent"): reasons.Add(InlineCodeReason); break;
            case "filterChips" or "facetPanel" or "recordHeader" or "spacer" or "divider": reasons.Add(MissingPart(type)); break;
        }
        if (props is not null)
        {
            if (props.ContainsKey("widthWhen")) reasons.Add(WidthWhenReason);
            foreach (var setting in BlockedSettings) if (props.ContainsKey(setting)) reasons.Add(MissingSetting(setting));
        }
        if (component["children"] is JsonArray children && children.Count > 0)
        {
            reasons.Add(NestedReason);
            foreach (var child in children.OfType<JsonObject>()) Scan(child, reasons);
        }
    }

    // ---------- Liste (Karar 2) ----------

    private static Attempt BuildList(JsonObject root)
    {
        var components = root["components"]!.AsArray().OfType<JsonObject>().ToList();
        if (components.FirstOrDefault(x => !ListTypes.Contains(TypeOf(x))) is { } foreign) return new(null, MissingPart(TypeOf(foreign)));
        var tables = components.Where(x => TypeOf(x) == "dataTable").ToList();
        if (tables.Count != 1) return new(null, ListNeedsOneTableReason);
        if (!IsReadTable(tables[0], root)) return new(null, NoReadTableReason);
        if (components.Count(x => TypeOf(x) == "filterBar") > 1 || components.Count(x => TypeOf(x) == "contextPanel") > 1)
            return new(null, ListTooManyPanelsReason);

        var tableIndex = components.IndexOf(tables[0]);
        var rowOwned = RowOwnedButtons(tables);
        for (var i = 0; i < components.Count; i++)
        {
            var component = components[i];
            var slot = TypeOf(component) switch
            {
                "metric" => "indicators",
                "filterBar" => "filters",
                "dataTable" => "list",
                "contextPanel" => "detail",
                "button" => rowOwned.Contains(IdOf(component)) ? "rowActions" : "actions",
                _ => i < tableIndex ? "above" : "below"
            };
            Place(component, slot);
        }
        root["template"] = new JsonObject { ["name"] = "list" };
        return new(root.ToJsonString(Output), null);
    }

    // ---------- Serbest gövde (Karar 3) ----------

    private sealed class Group(JsonObject? header)
    {
        public JsonObject? Header { get; } = header;
        public List<JsonObject> Members { get; } = [];
        public string Id { get; set; } = "";
    }

    private static Attempt BuildFree(JsonObject root)
    {
        var array = root["components"]!.AsArray();
        var components = array.OfType<JsonObject>().ToList();
        var buttons = new List<JsonObject>();
        JsonObject? tabs = null;
        foreach (var component in components)
        {
            var type = TypeOf(component);
            var props = component["props"] as JsonObject;
            switch (type)
            {
                case "button": buttons.Add(component); continue;
                case "tabs":
                    if (tabs is not null || props?.FirstOrDefault(x => !TabsProps.Contains(x.Key)) is { Key: not null }) return new(null, TabsReason);
                    tabs = component;
                    continue;
                case "section":
                    if (props?.FirstOrDefault(x => !SectionHeaderProps.Contains(x.Key)) is { Key: { } extra }) return new(null, SectionSettingReason(extra));
                    continue;
            }
            if (!FreeItemTypes.Contains(type)) return new(null, MissingPart(type));
            if (type == "card" && (string?)props?["variant"] == "panel") return new(null, PanelCardReason);
            if (type == "dataTable")
            {
                if (!IsReadTable(component, root)) return new(null, NoReadTableReason);
                if (RowFeatures.Any(x => props?.ContainsKey(x) == true)) return new(null, FreeRowActionsReason);
                if (GridToolFlags.Any(x => props?[x] is not JsonValue flag || !flag.TryGetValue<bool>(out var on) || on)) return new(null, GridToolsReason);
            }
        }
        if (buttons.Count > MaxActions) return new(null, FreeTooManyActionsReason);

        var isContent = (JsonObject x) => TypeOf(x) is not ("button" or "tabs");
        var content = components.Where(isContent).ToList();
        List<(string Label, List<Group> Groups)>? tabGroups = null;
        var groups = new List<Group>();
        if (tabs is null) groups = Grouped(content);
        else
        {
            if (TabEntries(tabs) is not { } entries) return new(null, TabsReason);
            var byId = components.ToDictionary(IdOf, StringComparer.Ordinal);
            var owned = entries.SelectMany(x => x.Ids).ToList();
            if (owned.Any(id => !byId.TryGetValue(id, out var item) || !isContent(item))) return new(null, TabsReason);
            if (content.Any(x => owned.Count(id => id == IdOf(x)) != 1) || entries.Any(x => x.Ids.Count == 0)) return new(null, TabsReason);
            tabGroups = entries.Select(x => (x.Label, Grouped(x.Ids.Select(id => byId[id]).ToList()))).ToList();
            groups = tabGroups.SelectMany(x => x.Groups).ToList();
        }
        if (groups.Count == 0) return new(null, FreeNoBlockReason);
        if (groups.Count > MaxBlocks) return new(null, FreeTooManyBlocksReason);

        var taken = new HashSet<string>(components.Select(IdOf), StringComparer.OrdinalIgnoreCase);
        if (root["queries"] is JsonArray queries)
            foreach (var query in queries.OfType<JsonObject>()) if ((string?)query["id"] is { } queryId) taken.Add(queryId);
        foreach (var group in groups)
        {
            if (group.Header is not null) { group.Id = IdOf(group.Header); continue; }
            var candidate = "bolum";
            for (var n = 2; taken.Contains(candidate); n++) candidate = $"bolum-{n}";
            taken.Add(candidate);
            group.Id = candidate;
        }

        foreach (var component in components)
            switch (TypeOf(component))
            {
                case "button": Place(component, "actions"); break;
                case "tabs": Place(component, "tabs"); break;
                case "section": break;
                default: Place(component, "item"); break;
            }
        foreach (var group in groups)
        {
            var members = new JsonArray(group.Members.Select(x => (JsonNode)JsonValue.Create(IdOf(x))!).ToArray());
            if (group.Header is { } header)
            {
                Place(header, "block");
                var props = (JsonObject)header["props"]!;
                props["columns"] = Columns(group.Members);
                props["members"] = members;
                continue;
            }
            var block = new JsonObject
            {
                ["id"] = group.Id, ["type"] = "section",
                ["props"] = new JsonObject { ["slot"] = "block", ["columns"] = Columns(group.Members), ["members"] = members }
            };
            array.Insert(array.IndexOf(group.Members[0]), block);
        }
        if (tabs is not null)
            tabs["props"]!["tabs"] = new JsonArray(tabGroups!.Select(x => (JsonNode)JsonValue.Create($"{x.Label}={string.Join(",", x.Groups.Select(g => g.Id))}")!).ToArray());
        root["template"] = new JsonObject { ["name"] = "free" };
        return new(root.ToJsonString(Output), null);
    }

    /// <summary>
    /// Sıralı içerik bölümlere: eski bölüm başlığı (section) yeni bir bölüm açar; ilk başlıktan önceki bileşenler başlıksız yeni bir
    /// bölüme düşer; 12'den çok üyeli bölüm başlıksız devam bölümleriyle sürer.
    /// </summary>
    private static List<Group> Grouped(List<JsonObject> content)
    {
        var groups = new List<Group>();
        Group? current = null;
        foreach (var component in content)
        {
            if (TypeOf(component) == "section") { current = new Group(component); groups.Add(current); continue; }
            if (current is null || current.Members.Count >= MaxBlockMembers) { current = new Group(null); groups.Add(current); }
            current.Members.Add(component);
        }
        return groups;
    }

    /// <summary>
    /// Bölüm kolon sayısı: üyeler eski 12'lik ızgaraya (ERP <c>visualStyle</c> varsayılan genişlikleriyle) dizildiğinde bir satırda
    /// yan yana duran en çok bileşen sayısı, 1–3.
    /// </summary>
    private static int Columns(List<JsonObject> members)
    {
        int best = 0, row = 0, count = 0;
        foreach (var member in members)
        {
            var span = Span(member);
            if (count > 0 && row + span > 12) { best = Math.Max(best, count); row = 0; count = 0; }
            row += span;
            count++;
        }
        return Math.Clamp(Math.Max(best, count), 1, 3);
    }

    private static int Span(JsonObject component)
    {
        var type = TypeOf(component);
        var fallback = type == "metric" ? 3 : FullWidthTypes.Contains(type) ? 12 : type == "facetPanel" ? 3 : type == "contextPanel" ? 4 : 6;
        var width = component["props"]?["width"];
        double? value = width is JsonValue raw
            ? raw.TryGetValue<double>(out var d) ? d
            : raw.TryGetValue<string>(out var s) && double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var parsed) ? parsed : null
            : null;
        return value is { } v && double.IsFinite(v) ? (int)Math.Clamp(v, 1, 12) : fallback;
    }

    private static List<(string Label, List<string> Ids)>? TabEntries(JsonObject tabs)
    {
        if (tabs["props"]?["tabs"] is not JsonArray items || items.Count == 0) return null;
        var result = new List<(string, List<string>)>();
        foreach (var item in items)
        {
            if (item is not JsonValue value || !value.TryGetValue<string>(out var text)) return null;
            var at = text.IndexOf('=');
            if (at < 0) return null;
            var ids = text[(at + 1)..];
            result.Add((text[..at], ids.Length == 0 ? [] : ids.Split(',').ToList()));
        }
        return result;
    }

    // ---------- ortak ----------

    private static void Place(JsonObject component, string slot)
    {
        if (component["props"] is not JsonObject props) { props = []; component["props"] = props; }
        props.Remove("width");
        props["slot"] = slot;
    }

    private static HashSet<string> RowOwnedButtons(IEnumerable<JsonObject> tables)
    {
        var owned = new HashSet<string>(StringComparer.Ordinal);
        foreach (var table in tables)
        {
            if (table["props"]?["rowActions"] is JsonArray rowActions)
                foreach (var id in rowActions.OfType<JsonValue>()) if (id.TryGetValue<string>(out var text)) owned.Add(text);
            if (table["props"]?["rowOpenAction"] is JsonValue open && open.TryGetValue<string>(out var openId)) owned.Add(openId);
        }
        return owned;
    }

    private static bool IsReadTable(JsonObject table, JsonObject root)
    {
        var queryId = table["props"]?["query"] is JsonValue q && q.TryGetValue<string>(out var text) ? text : null;
        return queryId is not null && root["queries"] is JsonArray queries
            && queries.OfType<JsonObject>().Any(x => (string?)x["id"] == queryId && (string?)x["kind"] == "read");
    }

    private static string TypeOf(JsonObject component) =>
        component["type"] is JsonValue value && value.TryGetValue<string>(out var type) ? type : "";

    private static string IdOf(JsonObject component) =>
        component["id"] is JsonValue value && value.TryGetValue<string>(out var id) ? id : "";
}
