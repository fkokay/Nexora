using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

/// <summary>A property the update sets to the standard's current value when the copy still holds one of <c>From</c>.</summary>
internal sealed record SystemPageUpdateSet(string Component, string Prop, IReadOnlyList<JsonNode?> From);
/// <summary>Values added (when missing) to a string-list property, in the standard's order.</summary>
internal sealed record SystemPageUpdateAppend(string Component, string Prop, IReadOnlyList<string> Values);
/// <summary>Child components of <c>Parent</c> taken from the standard and added when missing.</summary>
internal sealed record SystemPageUpdateChildren(string Parent, IReadOnlyList<string> Ids);

/// <summary>
/// A required standard update: applied once to a firm copy whose base version is below <c>Below</c>. Every <c>set</c> part
/// must still hold an old value (or already the new one, with at least one old) — otherwise the firm changed that part by
/// hand and the whole update is skipped. Added items and children come from the standard definition; an item already in
/// the copy is left as it is. After applying, no <c>set</c> part holds an old value any more, so it never applies twice and
/// an added item the firm later deletes stays deleted.
/// </summary>
internal sealed record SystemPageUpdate(string Id, string Label, int Below, IReadOnlyList<string> Add, IReadOnlyList<SystemPageUpdateSet> Set,
    IReadOnlyList<SystemPageUpdateAppend> Append, IReadOnlyList<SystemPageUpdateChildren> Children)
{
    /// <summary>Revision change kind (≤ 24 characters) written when the update is applied.</summary>
    public string ChangeKind => "Update:" + Id;
}

internal static class SystemPageUpdates
{
    private static readonly Regex IdPattern = new("^[a-z0-9-]{1,16}$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly HashSet<string> UpdateKeys = new(StringComparer.Ordinal) { "id", "label", "below", "add", "set", "append", "children" };
    private static readonly HashSet<string> SetKeys = new(StringComparer.Ordinal) { "component", "prop", "from" };
    private static readonly HashSet<string> AppendKeys = new(StringComparer.Ordinal) { "component", "prop", "values" };
    private static readonly HashSet<string> ChildrenKeys = new(StringComparer.Ordinal) { "parent", "ids" };

    /// <summary>
    /// <c>updates</c>: 0–8 entries. <c>below</c> is 2..version; <c>add</c> lists item keys with <c>since ≥ below</c> (so an
    /// item the firm deleted from a copy at or above its version is never brought back); at least one <c>set</c>, whose
    /// <c>from</c> values never include the standard's current value.
    /// </summary>
    internal static IReadOnlyList<SystemPageUpdate> Parse(string file, JsonElement root, int version, IReadOnlyCollection<SystemPageItem> items,
        JsonNode definition, List<string> errors)
    {
        var updates = new List<SystemPageUpdate>();
        if (!root.TryGetProperty("updates", out var element)) return updates;
        if (element.ValueKind != JsonValueKind.Array || element.GetArrayLength() > 8)
        { errors.Add($"{file}: updates en fazla 8 öğeli bir dizi olmalıdır."); return updates; }
        var itemsByKey = items.ToDictionary(x => x.Key, StringComparer.Ordinal);
        foreach (var entry in element.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object) { errors.Add($"{file}: updates öğeleri nesne olmalıdır."); continue; }
            var id = Text(entry, "id");
            var where = $"{file}: '{id}' güncellemesi";
            var count = errors.Count;
            foreach (var unknown in entry.EnumerateObject().Where(x => !UpdateKeys.Contains(x.Name)))
                errors.Add($"{where}: bilinmeyen alan '{unknown.Name}'.");
            if (id is null || !IdPattern.IsMatch(id)) errors.Add($"{file}: güncelleme kimliği '{id}' ^[a-z0-9-]{{1,16}}$ biçiminde olmalıdır.");
            else if (updates.Any(x => x.Id == id)) errors.Add($"{where} birden fazla kez geçiyor.");
            var label = Text(entry, "label");
            if (label is not { Length: >= 1 and <= 80 }) errors.Add($"{where}: label 1–80 karakter olmalıdır.");
            var below = entry.TryGetProperty("below", out var belowElement) && belowElement.ValueKind == JsonValueKind.Number
                && belowElement.TryGetInt32(out var number) ? number : 0;
            if (below < 2 || below > version) errors.Add($"{where}: below 2 ile version ({version}) arasında olmalıdır.");

            var add = Strings(entry, "add", where, errors);
            foreach (var key in add)
                if (!itemsByKey.TryGetValue(key, out var item)) errors.Add($"{where}: eklenen '{key}' öğesi items içinde yok.");
                else if (item.Since < below) errors.Add($"{where}: eklenen '{key}' öğesinin since değeri below ({below}) değerinden küçük.");

            var sets = new List<SystemPageUpdateSet>();
            foreach (var set in Objects(entry, "set", SetKeys, where, errors))
            {
                var component = Text(set, "component");
                var prop = Text(set, "prop");
                var target = component is null ? null : Find(definition, component);
                if (target is null || prop is null) { errors.Add($"{where}: set bileşeni '{component}' tanımda yok ya da prop eksik."); continue; }
                if (!set.TryGetProperty("from", out var fromElement) || fromElement.ValueKind != JsonValueKind.Array || fromElement.GetArrayLength() is < 1 or > 4)
                { errors.Add($"{where}: '{component}.{prop}' için from 1–4 öğeli bir dizi olmalıdır."); continue; }
                var from = fromElement.EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Null ? null : JsonNode.Parse(x.GetRawText())).ToArray();
                var current = target["props"]?[prop];
                if (from.Any(x => JsonNode.DeepEquals(x, current)))
                { errors.Add($"{where}: '{component}.{prop}' için from standardın güncel değerini içeriyor."); continue; }
                sets.Add(new SystemPageUpdateSet(component, prop, from));
            }
            if (sets.Count == 0) errors.Add($"{where}: en az bir set gerekli.");

            var appends = new List<SystemPageUpdateAppend>();
            foreach (var append in Objects(entry, "append", AppendKeys, where, errors))
            {
                var component = Text(append, "component");
                var prop = Text(append, "prop");
                var values = Strings(append, "values", where, errors);
                var list = component is null || prop is null ? null : Find(definition, component)?["props"]?[prop] as JsonArray;
                var standardValues = list?.Select(x => x is JsonValue v && v.TryGetValue<string>(out var s) ? s : null).ToHashSet(StringComparer.Ordinal);
                if (standardValues is null || values.Count == 0 || values.Any(x => !standardValues.Contains(x)))
                { errors.Add($"{where}: append '{component}.{prop}' standartta bu değerleri içeren bir liste olmalıdır."); continue; }
                appends.Add(new SystemPageUpdateAppend(component!, prop!, values));
            }

            var children = new List<SystemPageUpdateChildren>();
            foreach (var group in Objects(entry, "children", ChildrenKeys, where, errors))
            {
                var parent = Text(group, "parent");
                var ids = Strings(group, "ids", where, errors);
                var standardChildren = parent is null ? null : (Find(definition, parent)?["children"] as JsonArray)?.OfType<JsonObject>().Select(IdOf).ToHashSet(StringComparer.Ordinal);
                if (standardChildren is null || ids.Count == 0 || ids.Any(x => !standardChildren.Contains(x)))
                { errors.Add($"{where}: children '{parent}' standartta bu alt bileşenleri içermelidir."); continue; }
                children.Add(new SystemPageUpdateChildren(parent!, ids));
            }

            if (errors.Count == count)
                updates.Add(new SystemPageUpdate(id!, label!, below, add, sets, appends, children));
        }
        return updates;
    }

    /// <summary>
    /// Applies <paramref name="update"/> to <paramref name="copy"/> (mutated) when the copy qualifies. Returns false and
    /// leaves the copy unchanged otherwise.
    /// </summary>
    internal static bool TryApply(SystemPageUpdate update, JsonNode standardDefinition, JsonObject copy)
    {
        var pending = false;
        foreach (var set in update.Set)
        {
            var current = Find(copy, set.Component)?["props"]?[set.Prop];
            var target = Find(standardDefinition, set.Component)?["props"]?[set.Prop];
            if (Find(copy, set.Component)?["props"] is not JsonObject) return false;
            if (set.From.Any(x => JsonNode.DeepEquals(x, current))) pending = true;
            else if (!JsonNode.DeepEquals(target, current)) return false;
        }
        if (!pending) return false;

        foreach (var set in update.Set)
        {
            var props = (JsonObject)Find(copy, set.Component)!["props"]!;
            var target = Find(standardDefinition, set.Component)?["props"]?[set.Prop];
            if (target is null) props.Remove(set.Prop);
            else props[set.Prop] = target.DeepClone();
        }
        foreach (var key in update.Add)
        {
            var separator = key.IndexOf(':');
            var (kind, id) = (key[..separator], key[(separator + 1)..]);
            var arrayName = kind == "query" ? "queries" : "components";
            if (copy[arrayName] is not JsonArray copyArray) copy[arrayName] = copyArray = [];
            if (standardDefinition[arrayName] is not JsonArray standardArray) continue;
            if (kind == "component" ? Find(copy, id) is not null : copyArray.OfType<JsonObject>().Any(x => IdOf(x) == id)) continue;
            InsertLike(standardArray, copyArray, id);
        }
        foreach (var group in update.Children)
        {
            if (Find(copy, group.Parent) is not JsonObject parent || Find(standardDefinition, group.Parent)?["children"] is not JsonArray standardChildren) continue;
            if (parent["children"] is not JsonArray copyChildren) parent["children"] = copyChildren = [];
            foreach (var id in group.Ids.Where(x => Find(copy, x) is null)) InsertLike(standardChildren, copyChildren, id);
        }
        foreach (var append in update.Append)
        {
            if (Find(copy, append.Component)?["props"] is not JsonObject props) continue;
            if (props[append.Prop] is not JsonArray list) props[append.Prop] = list = [];
            var present = list.Select(x => x is JsonValue v && v.TryGetValue<string>(out var s) ? s : null).ToHashSet(StringComparer.Ordinal);
            foreach (var value in append.Values.Where(x => !present.Contains(x))) list.Add(value);
        }
        return true;
    }

    /// <summary>Inserts a clone of the standard's <paramref name="id"/> node after its nearest preceding standard sibling present in the copy.</summary>
    private static void InsertLike(JsonArray standard, JsonArray copy, string id)
    {
        var nodes = standard.OfType<JsonObject>().ToList();
        var index = nodes.FindIndex(x => IdOf(x) == id);
        if (index < 0) return;
        var position = 0;
        for (var i = index - 1; i >= 0; i--)
        {
            var previous = IdOf(nodes[i]);
            var at = copy.Select((x, n) => (x, n)).FirstOrDefault(x => x.x is JsonObject o && IdOf(o) == previous);
            if (at.x is not null) { position = at.n + 1; break; }
        }
        copy.Insert(position, nodes[index].DeepClone());
    }

    internal static JsonObject? Find(JsonNode? definition, string id) => FindIn(definition?["components"] as JsonArray, id);

    private static JsonObject? FindIn(JsonArray? components, string id)
    {
        foreach (var component in components?.OfType<JsonObject>() ?? [])
        {
            if (IdOf(component) == id) return component;
            if (FindIn(component["children"] as JsonArray, id) is { } child) return child;
        }
        return null;
    }

    private static string IdOf(JsonObject node) => node["id"] is JsonValue value && value.TryGetValue<string>(out var id) ? id : "";

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static List<string> Strings(JsonElement element, string property, string where, List<string> errors)
    {
        if (!element.TryGetProperty(property, out var value)) return [];
        if (value.ValueKind != JsonValueKind.Array || value.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String))
        { errors.Add($"{where}: {property} metin dizisi olmalıdır."); return []; }
        return value.EnumerateArray().Select(x => x.GetString()!).ToList();
    }

    private static IEnumerable<JsonElement> Objects(JsonElement element, string property, HashSet<string> keys, string where, List<string> errors)
    {
        if (!element.TryGetProperty(property, out var value)) yield break;
        if (value.ValueKind != JsonValueKind.Array) { errors.Add($"{where}: {property} bir dizi olmalıdır."); yield break; }
        foreach (var entry in value.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object || entry.EnumerateObject().Any(x => !keys.Contains(x.Name)))
            { errors.Add($"{where}: {property} öğeleri yalnız {string.Join(", ", keys)} alanlarını içeren nesneler olmalıdır."); continue; }
            yield return entry;
        }
    }
}
