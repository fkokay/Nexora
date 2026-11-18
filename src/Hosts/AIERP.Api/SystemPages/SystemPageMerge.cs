using System.Text.Json;
using System.Text.Json.Nodes;

/// <summary>One field of a published "Görünümü düzenle" view: its catalog label, visibility and whether label, position,
/// width or section differ from the catalog default.</summary>
internal sealed record ScreenViewFieldState(string Key, string Label, bool Visible, bool DiffersFromDefault);
internal sealed record SystemPageImportResult(string DefinitionJson, IReadOnlyList<string> Notes);
internal sealed record SystemPageNewItem(string Key, string Kind, string Label, int Since, JsonElement Definition, IReadOnlyList<string> Requires);

/// <summary>
/// Pure system-page merge logic: the one-time screen-view import (visibility only) into a standard's tables, and the "Yeni"
/// items a firm design lacks. Never mutates the standard; every result is built from a fresh copy of its JSON.
/// </summary>
internal static class SystemPageMerge
{
    internal const string LayoutNotImportedNote = "Sütun sırası, etiketleri ve genişlikleri aktarılmaz; tasarımcıda düzenleyin.";
    internal const string AllHiddenNote = "Tüm sütunlar gizli olduğu için görünüm ayarı aktarılmadı.";

    internal static string UnmappedFieldNote(string label) => $"“{label}” alanının yeni tasarımda karşılığı yok; aktarılmadı.";

    /// <param name="screenViews">Screen-view key → published field states; an absent key means no published view.</param>
    public static SystemPageImportResult ImportScreenViews(SystemPageStandard standard,
        IReadOnlyDictionary<string, IReadOnlyList<ScreenViewFieldState>> screenViews)
    {
        var definition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        var notes = new List<string>();
        foreach (var view in standard.ScreenViews)
        {
            if (!screenViews.TryGetValue(view.Key, out var fields)) continue;
            var props = TopLevelComponent(definition, view.Component)?["props"] as JsonObject;
            var columns = props?["columns"] as JsonArray;

            var hiddenColumns = new HashSet<string>(StringComparer.Ordinal);
            foreach (var field in fields)
            {
                if (!view.Fields.TryGetValue(field.Key, out var column))
                {
                    // An unmapped field left at its catalog default lost nothing; only a hidden or changed one is reported.
                    if (!field.Visible || field.DiffersFromDefault) AddOnce(notes, UnmappedFieldNote(field.Label));
                }
                else if (!field.Visible) hiddenColumns.Add(column);
            }
            if (fields.Any(x => x.DiffersFromDefault)) AddOnce(notes, LayoutNotImportedNote);
            if (props is null || columns is null || hiddenColumns.Count == 0) continue;

            var remaining = Filter(columns, x => !hiddenColumns.Contains(x));
            if (remaining.Count == 0) { AddOnce(notes, AllHiddenNote); continue; }
            props["columns"] = remaining;
            // Keep per-column settings consistent with the visible columns.
            if (props["columnFormats"] is JsonArray formats)
                props["columnFormats"] = Filter(formats, x => !hiddenColumns.Contains(x.Split('=', 2)[0]));
            if (props["totals"] is JsonArray totals)
                props["totals"] = Filter(totals, x => !hiddenColumns.Contains(x));
        }
        return new SystemPageImportResult(definition.ToJsonString(), notes);
    }

    /// <summary>
    /// Items with <c>since &gt; baseVersion</c> whose id is absent from <paramref name="designJson"/> (top-level component ids,
    /// query ids), in the standard's item order. <c>Requires</c> lists only the direct requirements that are also absent.
    /// </summary>
    public static IReadOnlyList<SystemPageNewItem> NewItems(SystemPageStandard standard, string designJson, int baseVersion)
    {
        var present = PresentKeys(designJson);
        var standardDefinition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        var result = new List<SystemPageNewItem>();
        foreach (var item in standard.Items)
        {
            if (item.Since <= baseVersion || present.Contains(item.Key)) continue;
            var node = item.Kind == "component"
                ? TopLevelComponent(standardDefinition, item.Id)
                : (standardDefinition["queries"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(x => IdOf(x) == item.Id);
            if (node is null) continue;
            var definition = JsonSerializer.Deserialize<JsonElement>(node.ToJsonString());
            result.Add(new SystemPageNewItem(item.Key, item.Kind, item.Label, item.Since, definition,
                item.Requires.Where(x => !present.Contains(x)).ToArray()));
        }
        return result;
    }

    private static HashSet<string> PresentKeys(string designJson)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        if (JsonNode.Parse(designJson) is not JsonObject design) return keys;
        if (design["components"] is JsonArray components)
            foreach (var component in components.OfType<JsonObject>()) keys.Add("component:" + IdOf(component));
        if (design["queries"] is JsonArray queries)
            foreach (var query in queries.OfType<JsonObject>()) keys.Add("query:" + IdOf(query));
        return keys;
    }

    private static JsonObject? TopLevelComponent(JsonObject definition, string id)
        => (definition["components"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(x => IdOf(x) == id);

    private static string IdOf(JsonObject node) => node["id"] is JsonValue value && value.TryGetValue<string>(out var id) ? id : "";

    private static JsonArray Filter(JsonArray source, Func<string, bool> keep)
        => new(source.Where(x => x is JsonValue v && v.TryGetValue<string>(out var s) && keep(s))
            .Select(x => (JsonNode)JsonValue.Create(x!.GetValue<string>())).ToArray());

    private static void AddOnce(List<string> notes, string note)
    {
        if (!notes.Contains(note)) notes.Add(note);
    }
}
