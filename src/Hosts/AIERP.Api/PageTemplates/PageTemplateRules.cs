using System.Text.Json;
using AIERP.Api.DocumentModels;

/// <summary>
/// Rules of a page that carries a root <c>template</c>: <c>list</c> (sub-project 3) or <c>record</c> (Kayıt kartı, sub-project 4).
/// Every top-level component names its place with <c>props.slot</c>. Pages without <c>template</c> never reach this class.
/// </summary>
internal static class PageTemplateRules
{
    internal static readonly IReadOnlySet<string> Slots = new HashSet<string>(StringComparer.Ordinal)
    { "indicators", "filters", "list", "actions", "rowActions", "detail", "above", "below" };

    internal static readonly IReadOnlySet<string> RecordSlots = new HashSet<string>(StringComparer.Ordinal)
    { "summary", "actions", "tabs", "section", "field", "lines", "note", "above", "below" };

    private static readonly Dictionary<string, string> SlotTypes = new(StringComparer.Ordinal)
    {
        ["indicators"] = "metric", ["filters"] = "filterBar", ["list"] = "dataTable", ["actions"] = "button",
        ["rowActions"] = "button", ["detail"] = "contextPanel"
    };

    private static readonly Dictionary<string, string> RecordSlotTypes = new(StringComparer.Ordinal)
    {
        ["summary"] = "recordHeader", ["actions"] = "button", ["tabs"] = "tabs", ["section"] = "formCard",
        ["field"] = "input", ["lines"] = "dataTable", ["note"] = "text"
    };

    internal static readonly IReadOnlySet<string> BelgeSlots = new HashSet<string>(StringComparer.Ordinal)
    { "fields", "lines", "summary", "actions", "above", "below" };

    /// <summary>The Belge parts: each lives only in its own slot, exactly once.</summary>
    internal static readonly IReadOnlyDictionary<string, string> BelgeParts = new Dictionary<string, string>(StringComparer.Ordinal)
    { ["documentFields"] = "fields", ["documentLines"] = "lines", ["documentSummary"] = "summary" };

    private const string UnknownTemplate = "Kalıp yalnız \"list\", \"record\" ya da \"belge\" olabilir.";
    private const string UnknownDocument = "Belge kalıbı bilinen bir belge ister (ör. \"satis.siparis\").";
    private const string MaxLabelLength = "Belge etiketleri en fazla 60 karakter olabilir.";
    private const string MissingSlot = "Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.";
    private const string NeedList = "Liste kalıbında tam bir liste (dataTable) olmalı.";
    private const string NeedSummary = "Kayıt kartında tam bir kayıt özeti (recordHeader) olmalı.";
    private const string NeedTabs = "Kayıt kartında tam bir sekme bileşeni (tabs) olmalı.";
    private const string BlockOutsideTab = "Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı.";
    private const string FieldOutsideSection = "Kayıt kartında her alan tam bir bölüme ait olmalı.";
    private const string NoWidth = "Kalıplı sayfada genişlik ayarı kullanılmaz.";
    private const string NoActionBar = "Kalıplı sayfada işlem çubuğu bileşeni kullanılmaz; düğmeler 'actions' yerine konur.";
    private const string NoSpacer = "Kalıplı sayfada boşluk ve ayırıcı bileşenleri kullanılmaz.";

    /// <summary>
    /// The template's <c>name</c> when it is "list" or "record", ignoring extra keys (those are rejected by
    /// <see cref="ValidateTemplate"/> after the component loop); otherwise null. Used during the component loop.
    /// </summary>
    internal static string? DeclaredName(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("template", out var template) && template.ValueKind == JsonValueKind.Object
        && template.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String && name.GetString() is "list" or "record" or "belge"
            ? name.GetString() : null;

    /// <summary>The template name ("list" or "record") when <paramref name="root"/> carries a well-formed template; otherwise null.</summary>
    internal static string? TemplateName(JsonElement root) =>
        DeclaredName(root) is { } name && root.GetProperty("template").EnumerateObject().All(x => x.Name == "name" || name == "belge" && x.Name == "document")
            ? name : null;

    /// <summary>The Belge page's document code (<c>template.document</c>), or null.</summary>
    internal static string? DocumentCode(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("template", out var template) && template.ValueKind == JsonValueKind.Object
        && template.TryGetProperty("document", out var document) && document.ValueKind == JsonValueKind.String ? document.GetString() : null;

    /// <summary>The error text, or null when the template page is valid. <paramref name="queries"/> may be undefined.</summary>
    internal static string? ValidateTemplate(JsonElement root, JsonElement components, JsonElement queries) => TemplateName(root) switch
    {
        "list" => ValidateList(components, queries),
        "record" => ValidateRecord(components),
        "belge" => ValidateBelge(root, components),
        _ => UnknownTemplate
    };

    private static string? ValidateList(JsonElement components, JsonElement queries)
    {
        if (components.ValueKind != JsonValueKind.Array) return NeedList;
        if (Place(components, Slots, out var placed) is { } placeError) return placeError;

        foreach (var (_, slot, type) in placed)
            if (SlotTypes.TryGetValue(slot, out var expected) && type != expected) return WrongPart(slot, type, expected);
        if (placed.Count(x => x.Slot == "detail") > 1) return "Kalıplı sayfada en fazla bir detay paneli (contextPanel) olabilir.";

        var lists = placed.Where(x => x.Slot == "list").ToArray();
        if (lists.Length != 1) return NeedList;
        var queryId = lists[0].Component.TryGetProperty("props", out var tableProps) && tableProps.TryGetProperty("query", out var q)
            && q.ValueKind == JsonValueKind.String ? q.GetString() : null;
        if (queryId is null || queries.ValueKind != JsonValueKind.Array) return NeedList;
        var bound = queries.EnumerateArray().FirstOrDefault(x => x.ValueKind == JsonValueKind.Object
            && x.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString() == queryId);
        if (bound.ValueKind != JsonValueKind.Object
            || !(bound.TryGetProperty("kind", out var kind) && kind.ValueKind == JsonValueKind.String && kind.GetString() == "read"))
            return NeedList;
        return null;
    }

    /// <summary>
    /// Kayıt kartı: one summary, one tabs component listing every section, lines table and note exactly once, and every field in
    /// exactly one section's <c>inputs</c>. Tab and section ownership themselves are the schema's usual tabs/formCard rules.
    /// </summary>
    private static string? ValidateRecord(JsonElement components)
    {
        if (components.ValueKind != JsonValueKind.Array) return NeedSummary;
        if (Place(components, RecordSlots, out var placed) is { } placeError) return placeError;

        foreach (var (_, slot, type) in placed)
            if (RecordSlotTypes.TryGetValue(slot, out var expected) && type != expected) return WrongPart(slot, type, expected);
        if (placed.Count(x => x.Slot == "summary") != 1) return NeedSummary;
        var tabs = placed.Where(x => x.Slot == "tabs").ToArray();
        if (tabs.Length != 1) return NeedTabs;

        var tabbed = StringArray(tabs[0].Component, "tabs")
            .SelectMany(item => item.Split('=', 2) is [_, var ids] && ids.Length > 0 ? ids.Split(',') : [])
            .ToList();
        foreach (var (component, _, _) in placed.Where(x => x.Slot is "section" or "lines" or "note"))
            if (tabbed.Count(x => x == Id(component)) != 1) return BlockOutsideTab;

        var sectionInputs = placed.Where(x => x.Slot == "section").SelectMany(x => StringArray(x.Component, "inputs")).ToList();
        foreach (var (component, _, _) in placed.Where(x => x.Slot == "field"))
            if (sectionInputs.Count(x => x == Id(component)) != 1) return FieldOutsideSection;
        return null;
    }

    /// <summary>
    /// Belge: a known document; exactly one documentFields, documentLines and documentSummary, each in its own slot; their codes come
    /// from the document model, are unique, and keep every required field and column. No grid, formula or fill settings anywhere:
    /// lines, amounts and fills come from the model.
    /// </summary>
    private static string? ValidateBelge(JsonElement root, JsonElement components)
    {
        if (DocumentModelRegistry.Find(DocumentCode(root)) is not { } model) return UnknownDocument;
        if (components.ValueKind != JsonValueKind.Array) return Need("documentFields");
        if (Place(components, BelgeSlots, out var placed) is { } placeError) return placeError;
        foreach (var (component, slot, type) in placed)
        {
            if (slot == "actions" && type != "button") return WrongPart(slot, type, "button");
            var slotPart = BelgeParts.FirstOrDefault(x => x.Value == slot).Key;
            if (slotPart is not null && type != slotPart) return WrongPart(slot, type, slotPart);
            if (slotPart is null && BelgeParts.ContainsKey(type)) return $"'{type}' yalnız '{BelgeParts[type]}' yerine konabilir.";
            if (ScanBelge(component) is { } scanError) return scanError;
        }
        foreach (var part in BelgeParts.Keys)
            if (placed.Count(x => x.Type == part) != 1) return Need(part);

        var fields = placed.Single(x => x.Type == "documentFields").Component;
        var lines = placed.Single(x => x.Type == "documentLines").Component;
        return Codes(fields, "fields", model.Fields.Select(x => (x.Code, x.Label, x.Required)).ToList(), "alanı")
            ?? Codes(lines, "columns", model.LineColumns.Select(x => (x.Code, x.Label, x.Required)).ToList(), "kolonu");
    }

    private static string Need(string part) => $"Belge kalıbında tam bir '{part}' bileşeni olmalı.";

    private static string? Codes(JsonElement component, string key, IReadOnlyList<(string Code, string Label, bool Required)> known, string kind)
    {
        var chosen = StringArray(component, key).ToList();
        if (chosen.FirstOrDefault(x => known.All(k => k.Code != x)) is { } unknown) return $"'{unknown}' bu belgenin {kind} değil.";
        if (chosen.GroupBy(x => x).FirstOrDefault(g => g.Count() > 1) is { } twice) return $"'{twice.Key}' iki kez seçilmiş.";
        foreach (var required in known.Where(k => k.Required))
            if (!chosen.Contains(required.Code)) return $"'{required.Label}' zorunlu, gizlenemez.";
        if (component.GetProperty("props").TryGetProperty("labels", out var labels) && labels.ValueKind == JsonValueKind.Object)
            foreach (var label in labels.EnumerateObject())
            {
                if (!chosen.Contains(label.Name)) return $"'{label.Name}' etiketi seçili olmayan bir {kind} için.";
                if (label.Value.ValueKind != JsonValueKind.String || label.Value.GetString()!.Trim().Length is 0 or > 60) return MaxLabelLength;
            }
        return null;
    }

    /// <summary>Belge also forbids the grid (and with it every fill, formula and calculated-column setting) anywhere in the tree.</summary>
    private static string? ScanBelge(JsonElement component)
    {
        if (component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "editableGrid")
            return "Belge sayfasında 'editableGrid' kullanılamaz; satırlar ve hesap modelden gelir.";
        if (component.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            foreach (var child in children.EnumerateArray())
                if (ScanBelge(child) is { } error) return error;
        return null;
    }

    /// <summary>
    /// The props a Belge part may carry, checked in the component loop (the codes themselves are checked by <see cref="ValidateBelge"/>).
    /// </summary>
    internal static string? ValidateBelgePartProps(string type, JsonElement props)
    {
        string[] allowed = type switch
        {
            "documentFields" => ["slot", "fields", "labels"],
            "documentLines" => ["slot", "columns", "labels", "density"],
            _ => ["slot", "vatBreakdown", "activity"]
        };
        foreach (var prop in props.EnumerateObject())
        {
            if (!allowed.Contains(prop.Name)) return $"'{type}' bileşeninde '{prop.Name}' kullanılamaz.";
            var ok = prop.Name switch
            {
                "slot" => prop.Value.ValueKind == JsonValueKind.String,
                "fields" or "columns" => prop.Value.ValueKind == JsonValueKind.Array && prop.Value.GetArrayLength() <= 40
                    && prop.Value.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String),
                "labels" => prop.Value.ValueKind == JsonValueKind.Object,
                "density" => prop.Value.ValueKind == JsonValueKind.String && prop.Value.GetString() is "dense" or "normal" or "comfy",
                _ => prop.Value.ValueKind is JsonValueKind.True or JsonValueKind.False
            };
            if (!ok) return $"'{type}' bileşeninin '{prop.Name}' değeri geçersiz.";
        }
        return null;
    }

    /// <summary>Every top-level component's slot (one of <paramref name="slots"/>), then the forbidden-thing scan.</summary>
    private static string? Place(JsonElement components, IReadOnlySet<string> slots, out List<(JsonElement Component, string Slot, string Type)> placed)
    {
        placed = [];
        foreach (var component in components.EnumerateArray())
        {
            if (component.ValueKind != JsonValueKind.Object) return MissingSlot;
            var slot = component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
                && props.TryGetProperty("slot", out var slotValue) && slotValue.ValueKind == JsonValueKind.String ? slotValue.GetString() : null;
            if (slot is null || !slots.Contains(slot)) return MissingSlot;
            var type = component.TryGetProperty("type", out var typeValue) && typeValue.ValueKind == JsonValueKind.String ? typeValue.GetString() ?? "" : "";
            placed.Add((component, slot, type));
        }

        foreach (var (component, _, _) in placed)
            if (Scan(component) is { } scanError) return scanError;
        return null;
    }

    private static string WrongPart(string slot, string type, string expected) =>
        $"'{slot}' yerine '{type}' bileşeni konamaz; bu yere yalnız '{expected}' konabilir.";

    private static string? Id(JsonElement component) =>
        component.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String ? id.GetString() : null;

    private static IEnumerable<string> StringArray(JsonElement component, string key) =>
        component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
        && props.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray()
            : [];

    /// <summary>Forbidden things anywhere in the component tree: width settings and action bar, spacer, divider.</summary>
    private static string? Scan(JsonElement component)
    {
        if (component.ValueKind != JsonValueKind.Object) return null;
        if (component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String)
            switch (type.GetString())
            {
                case "actionBar": return NoActionBar;
                case "spacer" or "divider": return NoSpacer;
            }
        if (component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
            && (props.TryGetProperty("width", out _) || props.TryGetProperty("widthWhen", out _))) return NoWidth;
        if (component.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            foreach (var child in children.EnumerateArray())
                if (Scan(child) is { } error) return error;
        return null;
    }
}
