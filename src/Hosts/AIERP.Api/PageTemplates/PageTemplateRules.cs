using System.Text.Json;

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

    private const string UnknownTemplate = "Kalıp yalnız \"list\" ya da \"record\" olabilir.";
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
        && template.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String && name.GetString() is "list" or "record"
            ? name.GetString() : null;

    /// <summary>The template name ("list" or "record") when <paramref name="root"/> carries a well-formed template; otherwise null.</summary>
    internal static string? TemplateName(JsonElement root) =>
        DeclaredName(root) is { } name && root.GetProperty("template").EnumerateObject().Count() == 1 ? name : null;

    /// <summary>The error text, or null when the template page is valid. <paramref name="queries"/> may be undefined.</summary>
    internal static string? ValidateTemplate(JsonElement root, JsonElement components, JsonElement queries) => TemplateName(root) switch
    {
        "list" => ValidateList(components, queries),
        "record" => ValidateRecord(components),
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
