using System.Text.Json;

/// <summary>
/// Rules of a page that carries a root <c>template</c> (sub-project 3). Today the only template is <c>list</c>: every top-level
/// component names its place with <c>props.slot</c>. Pages without <c>template</c> never reach this class.
/// </summary>
internal static class PageTemplateRules
{
    internal static readonly IReadOnlySet<string> Slots = new HashSet<string>(StringComparer.Ordinal)
    { "indicators", "filters", "list", "actions", "rowActions", "detail", "above", "below" };

    private static readonly Dictionary<string, string> SlotTypes = new(StringComparer.Ordinal)
    {
        ["indicators"] = "metric", ["filters"] = "filterBar", ["list"] = "dataTable", ["actions"] = "button",
        ["rowActions"] = "button", ["detail"] = "contextPanel"
    };

    private const string UnknownTemplate = "Kalıp yalnız \"list\" olabilir.";
    private const string MissingSlot = "Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.";
    private const string NeedList = "Liste kalıbında tam bir liste (dataTable) olmalı.";
    private const string NoWidth = "Kalıplı sayfada genişlik ayarı kullanılmaz.";
    private const string NoActionBar = "Kalıplı sayfada işlem çubuğu bileşeni kullanılmaz; düğmeler 'actions' yerine konur.";
    private const string NoSpacer = "Kalıplı sayfada boşluk ve ayırıcı bileşenleri kullanılmaz.";

    /// <summary>The error text, or null when the template page is valid. <paramref name="queries"/> may be undefined.</summary>
    internal static string? ValidateTemplate(JsonElement root, JsonElement components, JsonElement queries)
    {
        if (!root.TryGetProperty("template", out var template) || template.ValueKind != JsonValueKind.Object
            || template.EnumerateObject().Count() != 1
            || !template.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String || name.GetString() != "list")
            return UnknownTemplate;
        if (components.ValueKind != JsonValueKind.Array) return NeedList;

        var placed = new List<(JsonElement Component, string Slot, string Type)>();
        foreach (var component in components.EnumerateArray())
        {
            if (component.ValueKind != JsonValueKind.Object) return MissingSlot;
            var slot = component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
                && props.TryGetProperty("slot", out var slotValue) && slotValue.ValueKind == JsonValueKind.String ? slotValue.GetString() : null;
            if (slot is null || !Slots.Contains(slot)) return MissingSlot;
            var type = component.TryGetProperty("type", out var typeValue) && typeValue.ValueKind == JsonValueKind.String ? typeValue.GetString() ?? "" : "";
            placed.Add((component, slot, type));
        }

        foreach (var (component, _, _) in placed)
            if (Scan(component) is { } scanError) return scanError;

        foreach (var (_, slot, type) in placed)
            if (SlotTypes.TryGetValue(slot, out var expected) && type != expected)
                return $"'{slot}' yerine '{type}' bileşeni konamaz; bu yere yalnız '{expected}' konabilir.";
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
