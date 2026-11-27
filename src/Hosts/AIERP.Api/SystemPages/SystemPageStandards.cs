using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AIERP.Api;

internal sealed record SystemPageItem(string Key, string Kind, string Id, int Since, string Label, IReadOnlyList<string> Requires);
internal sealed record SystemPageScreenView(string Key, string Component, IReadOnlyDictionary<string, string> Fields);
/// <summary>Another screen key served by a standard: it opens the standard with the record id as page parameter <c>Param</c>.</summary>
internal sealed record SystemPageAlias(string Key, string Param);
internal sealed record SystemPageStandard(string ScreenKey, string Title, string? Description, string Module, int Version, string Stage,
    IReadOnlyList<SystemPageItem> Items, IReadOnlyList<SystemPageScreenView> ScreenViews, string DefinitionJson)
{
    /// <summary>Screen keys routed to this standard (e.g. <c>customer-edit</c> → <c>customer-create</c> with <c>customerId</c>).</summary>
    public IReadOnlyList<SystemPageAlias> Aliases { get; init; } = [];

    /// <summary>Required updates applied once to older firm copies (<see cref="SystemPageUpdates"/>).</summary>
    public IReadOnlyList<SystemPageUpdate> Updates { get; init; } = [];
}

/// <summary>DI singleton the endpoints read; defaults to <see cref="SystemPageStandards.All"/>. Integration tests replace it
/// through WithWebHostBuilder(ConfigureServices) instead of mutating static state, so parallel xUnit classes never interfere.</summary>
internal interface ISystemPageStandardSet
{
    bool TryGet(string screenKey, out SystemPageStandard standard);
    IReadOnlyCollection<SystemPageStandard> All { get; }
}

internal sealed class EmbeddedSystemPageStandardSet : ISystemPageStandardSet
{
    public bool TryGet(string screenKey, out SystemPageStandard standard) => SystemPageStandards.TryGet(screenKey, out standard);
    public IReadOnlyCollection<SystemPageStandard> All => SystemPageStandards.All.Values.ToArray();
}

/// <summary>
/// Standard definitions of system screens (data, not logic): one embedded envelope per screen under
/// <c>SystemPages/Standards/&lt;screenKey&gt;.json</c>. An envelope carries no SQL and no code component; every top-level
/// component and query is a versioned item, and every restricted version must validate on its own so a later item can be
/// offered to an older firm design by itself.
/// </summary>
internal static class SystemPageStandards
{
    private const string ResourceMarker = ".SystemPages.Standards.";
    private const string SyntheticIdPrefix = "nexora-system-page:";
    private static readonly Regex ScreenKeyPattern = new("^[a-z0-9-]{1,39}$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly HashSet<string> EnvelopeKeys = new(StringComparer.Ordinal)
    { "screenKey", "title", "description", "module", "version", "stage", "items", "screenViews", "aliases", "updates", "definition" };
    private static readonly HashSet<string> AliasKeys = new(StringComparer.Ordinal) { "key", "param" };
    private static readonly Regex AliasParamPattern = new("^[a-z][a-zA-Z0-9]{0,31}$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly HashSet<string> ItemKeys = new(StringComparer.Ordinal) { "since", "label", "requires" };
    private static readonly HashSet<string> ScreenViewKeys = new(StringComparer.Ordinal) { "key", "component", "fields" };
    private static readonly Lazy<IReadOnlyDictionary<string, SystemPageStandard>> Loaded = new(() => Load(EmbeddedFiles()));

    public static IReadOnlyDictionary<string, SystemPageStandard> All => Loaded.Value;

    public static bool TryGet(string screenKey, out SystemPageStandard standard) => All.TryGetValue(screenKey, out standard!);

    /// <summary>Deterministic name-based GUID (SHA-1 of "nexora-system-page:" + key, version-5 layout).</summary>
    public static Guid SyntheticId(string screenKey)
    {
        var hash = SHA1.HashData(Encoding.UTF8.GetBytes(SyntheticIdPrefix + screenKey));
        var bytes = hash.AsSpan(0, 16).ToArray();
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x50);
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);
        return new Guid(bytes, bigEndian: true);
    }

    /// <summary>
    /// The definition JSON holding only the items with <c>since ≤ version</c> plus their transitive <c>requires</c>. Removed
    /// components (with their children) and queries are also removed from the remaining components' tabs, actionBar and
    /// formCard/filterChips/facetPanel id lists; any other dangling reference is left for validation to reject.
    /// </summary>
    public static string Restrict(SystemPageStandard standard, int version)
    {
        var byKey = standard.Items.ToDictionary(x => x.Key, StringComparer.Ordinal);
        var included = new HashSet<string>(StringComparer.Ordinal);
        var pending = new Stack<string>(standard.Items.Where(x => x.Since <= version).Select(x => x.Key));
        while (pending.Count > 0)
        {
            var key = pending.Pop();
            if (!included.Add(key) || !byKey.TryGetValue(key, out var item)) continue;
            foreach (var required in item.Requires) pending.Push(required);
        }
        var definition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        var removedIds = new HashSet<string>(StringComparer.Ordinal);
        if (definition["components"] is JsonArray components)
            foreach (var component in components.ToArray())
            {
                if (component is not JsonObject obj || included.Contains("component:" + IdOf(obj))) continue;
                CollectIds(obj, removedIds);
                components.Remove(component);
            }
        if (definition["queries"] is JsonArray queries)
            foreach (var query in queries.ToArray())
            {
                if (query is not JsonObject obj || included.Contains("query:" + IdOf(obj))) continue;
                removedIds.Add(IdOf(obj));
                queries.Remove(query);
            }
        if (removedIds.Count > 0 && definition["components"] is JsonArray remaining)
            foreach (var component in remaining.OfType<JsonObject>()) StripReferences(component, removedIds);
        return definition.ToJsonString();
    }

    /// <summary>Every envelope error across <paramref name="files"/>; empty when all are valid.</summary>
    internal static IReadOnlyList<string> Validate(IEnumerable<(string FileName, string Json)> files)
    {
        var errors = new List<string>();
        Parse(files, errors);
        return errors;
    }

    /// <summary>Parses and validates; throws <see cref="InvalidOperationException"/> listing every error.</summary>
    internal static IReadOnlyDictionary<string, SystemPageStandard> Load(IEnumerable<(string FileName, string Json)> files)
    {
        var errors = new List<string>();
        var result = Parse(files, errors);
        if (errors.Count > 0)
            throw new InvalidOperationException("Sistem sayfası standart tanımları geçersiz:" + Environment.NewLine + string.Join(Environment.NewLine, errors));
        return result;
    }

    internal static IReadOnlyList<(string FileName, string Json)> EmbeddedFiles()
    {
        var assembly = typeof(SystemPageStandards).Assembly;
        var files = new List<(string, string)>();
        foreach (var name in assembly.GetManifestResourceNames().Where(x => x.Contains(ResourceMarker, StringComparison.Ordinal)
                     && x.EndsWith(".json", StringComparison.Ordinal)).Order(StringComparer.Ordinal))
        {
            using var stream = assembly.GetManifestResourceStream(name)!;
            using var reader = new StreamReader(stream, Encoding.UTF8);
            files.Add((name[(name.IndexOf(ResourceMarker, StringComparison.Ordinal) + ResourceMarker.Length)..], reader.ReadToEnd()));
        }
        return files;
    }

    private static Dictionary<string, SystemPageStandard> Parse(IEnumerable<(string FileName, string Json)> files, List<string> errors)
    {
        var result = new Dictionary<string, SystemPageStandard>(StringComparer.Ordinal);
        foreach (var (fileName, json) in files)
        {
            var fileErrors = new List<string>();
            var standard = ParseOne(fileName, json, fileErrors);
            if (standard is not null && result.ContainsKey(standard.ScreenKey))
                fileErrors.Add($"{fileName}: '{standard.ScreenKey}' ekranı için birden fazla standart tanım var.");
            if (standard is not null && fileErrors.Count == 0) result.Add(standard.ScreenKey, standard);
            errors.AddRange(fileErrors);
        }
        // An alias key belongs to one standard and is never a standard's own screen key.
        var aliasOwners = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var standard in result.Values.OrderBy(x => x.ScreenKey, StringComparer.Ordinal))
            foreach (var alias in standard.Aliases)
            {
                if (result.ContainsKey(alias.Key))
                    errors.Add($"{standard.ScreenKey}: takma ad '{alias.Key}' başka bir standardın ekran anahtarı.");
                else if (!aliasOwners.TryAdd(alias.Key, standard.ScreenKey))
                    errors.Add($"{standard.ScreenKey}: takma ad '{alias.Key}' '{aliasOwners[alias.Key]}' standardında da tanımlı.");
            }
        return result;
    }

    /// <summary>
    /// <c>aliases</c>: 0–4 <c>{ key, param }</c> entries. The key is another screen key (not this one); the param is the page
    /// parameter that carries the record id, and the definition must read it (<c>sayfa.parametre.&lt;param&gt;</c>).
    /// </summary>
    private static IReadOnlyList<SystemPageAlias> ParseAliases(string file, JsonElement root, string screenKey, string definitionJson, List<string> errors)
    {
        var aliases = new List<SystemPageAlias>();
        if (!root.TryGetProperty("aliases", out var element)) return aliases;
        if (element.ValueKind != JsonValueKind.Array || element.GetArrayLength() > 4)
        { errors.Add($"{file}: aliases en fazla 4 öğeli bir dizi olmalıdır."); return aliases; }
        foreach (var entry in element.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object || entry.EnumerateObject().Any(x => !AliasKeys.Contains(x.Name)))
            { errors.Add($"{file}: aliases öğeleri yalnız key ve param alanlarını içeren nesneler olmalıdır."); continue; }
            var key = StringOf(entry, "key");
            var param = StringOf(entry, "param");
            if (key is null || !ScreenKeyPattern.IsMatch(key) || key == screenKey)
            { errors.Add($"{file}: takma ad anahtarı '{key}' bu standarttan farklı ^[a-z0-9-]{{1,39}}$ biçiminde bir ekran anahtarı olmalıdır."); continue; }
            if (param is null || !AliasParamPattern.IsMatch(param))
            { errors.Add($"{file}: takma ad '{key}' için param küçük harfle başlayan en fazla 32 harf/rakamlık bir sayfa parametresi adı olmalıdır."); continue; }
            if (!definitionJson.Contains("sayfa.parametre." + param, StringComparison.Ordinal))
            { errors.Add($"{file}: takma ad '{key}' sayfa parametresi '{param}' tanımda okunmuyor ({{{{sayfa.parametre.{param}}}}})."); continue; }
            if (aliases.Any(x => x.Key == key)) { errors.Add($"{file}: takma ad '{key}' birden fazla kez geçiyor."); continue; }
            aliases.Add(new SystemPageAlias(key, param));
        }
        return aliases;
    }

    private static SystemPageStandard? ParseOne(string file, string json, List<string> errors)
    {
        JsonDocument document;
        try { document = JsonDocument.Parse(json); }
        catch (JsonException) { errors.Add($"{file}: geçerli JSON değil."); return null; }
        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) { errors.Add($"{file}: kök bir JSON nesnesi olmalıdır."); return null; }
            foreach (var property in root.EnumerateObject().Where(x => !EnvelopeKeys.Contains(x.Name)))
                errors.Add($"{file}: bilinmeyen alan '{property.Name}'.");

            var screenKey = StringOf(root, "screenKey");
            if (screenKey is null || !ScreenKeyPattern.IsMatch(screenKey))
            { errors.Add($"{file}: screenKey '{screenKey}' ^[a-z0-9-]{{1,39}}$ biçiminde olmalıdır."); return null; }
            // Menu pages plus the screens reached only by navigation (sales quote / order / delivery entry cards).
            if (!StandardMenuEndpoints.NavigablePageKeys.Contains(screenKey))
                errors.Add($"{file}: screenKey '{screenKey}' standart menüde ya da gezinmeyle açılan bir sayfa değil.");
            if (!string.Equals(Path.GetFileNameWithoutExtension(file), screenKey, StringComparison.Ordinal))
                errors.Add($"{file}: dosya adı screenKey '{screenKey}' ile aynı olmalıdır.");

            var title = StringOf(root, "title");
            if (title is not { Length: >= 1 and <= 120 }) errors.Add($"{file}: title 1–120 karakter olmalıdır.");
            var module = StringOf(root, "module");
            if (module is not { Length: >= 1 and <= 60 }) errors.Add($"{file}: module 1–60 karakter olmalıdır.");
            string? description = null;
            if (root.TryGetProperty("description", out var descriptionElement) && descriptionElement.ValueKind != JsonValueKind.Null)
            {
                description = descriptionElement.ValueKind == JsonValueKind.String ? descriptionElement.GetString() : null;
                if (description is not { Length: <= 500 }) errors.Add($"{file}: description en fazla 500 karakterlik metin olmalıdır.");
            }
            var version = root.TryGetProperty("version", out var versionElement) && versionElement.ValueKind == JsonValueKind.Number
                && versionElement.TryGetInt32(out var number) ? number : 0;
            if (version < 1) errors.Add($"{file}: version 1 veya daha büyük bir tamsayı olmalıdır.");
            var stage = StringOf(root, "stage");
            if (stage is not ("preview" or "ready")) errors.Add($"{file}: stage '{stage}' preview veya ready olmalıdır.");

            var items = ParseItems(file, root, version, errors);
            if (!root.TryGetProperty("definition", out var definition) || definition.ValueKind != JsonValueKind.Object)
            { errors.Add($"{file}: definition nesnesi gerekli."); return null; }
            var definitionJson = definition.GetRawText();
            var shape = InspectDefinition(file, definition, errors);
            if (shape is null) return null;

            var expected = shape.TopComponents.Keys.Select(x => "component:" + x).Concat(shape.Queries.Keys.Select(x => "query:" + x)).ToHashSet(StringComparer.Ordinal);
            foreach (var missing in expected.Where(x => !items.ContainsKey(x)).Order(StringComparer.Ordinal))
                errors.Add($"{file}: '{missing}' için items içinde öğe yok.");
            foreach (var extra in items.Keys.Where(x => !expected.Contains(x)).Order(StringComparer.Ordinal))
                errors.Add($"{file}: '{extra}' öğesinin tanımda karşılığı yok.");

            var screenViews = ParseScreenViews(file, root, shape, errors);
            var aliases = ParseAliases(file, root, screenKey, definitionJson, errors);
            var updates = SystemPageUpdates.Parse(file, root, version, items.Values, JsonNode.Parse(definitionJson)!, errors);
            var standard = new SystemPageStandard(screenKey, title ?? "", description, module ?? "", version, stage ?? "",
                items.Values.ToArray(), screenViews, definitionJson) { Aliases = aliases, Updates = updates };

            if (errors.Count == 0)
            {
                if (!TenantCustomPageSchema.Validate(definitionJson, out var schemaError))
                    errors.Add($"{file}: tanım şemadan geçmedi: {schemaError}");
                else
                    for (var k = 1; k < version; k++)
                        if (!TenantCustomPageSchema.Validate(Restrict(standard, k), out var restrictedError))
                            errors.Add($"{file}: v{k} kısıtlı tanımı şemadan geçmedi (eksik requires?): {restrictedError}");
            }
            return standard;
        }
    }

    private static Dictionary<string, SystemPageItem> ParseItems(string file, JsonElement root, int version, List<string> errors)
    {
        var items = new Dictionary<string, SystemPageItem>(StringComparer.Ordinal);
        if (!root.TryGetProperty("items", out var element) || element.ValueKind != JsonValueKind.Object)
        { errors.Add($"{file}: items nesnesi gerekli."); return items; }
        foreach (var property in element.EnumerateObject())
        {
            var key = property.Name;
            var separator = key.IndexOf(':');
            var kind = separator > 0 ? key[..separator] : "";
            var id = separator > 0 ? key[(separator + 1)..] : "";
            if (kind is not ("component" or "query") || id.Length == 0)
            { errors.Add($"{file}: öğe anahtarı '{key}' component:<id> veya query:<id> olmalıdır."); continue; }
            var value = property.Value;
            if (value.ValueKind != JsonValueKind.Object)
            { errors.Add($"{file}: '{key}' öğesi bir nesne olmalıdır."); continue; }
            foreach (var unknown in value.EnumerateObject().Where(x => !ItemKeys.Contains(x.Name)))
                errors.Add($"{file}: '{key}' öğesinde bilinmeyen alan '{unknown.Name}'.");
            var since = value.TryGetProperty("since", out var sinceElement) && sinceElement.ValueKind == JsonValueKind.Number
                && sinceElement.TryGetInt32(out var sinceNumber) ? sinceNumber : 0;
            if (since < 1 || since > version) errors.Add($"{file}: '{key}' öğesinin since değeri 1 ile version ({version}) arasında olmalıdır.");
            var label = StringOf(value, "label");
            if (label is not { Length: >= 1 and <= 80 }) errors.Add($"{file}: '{key}' öğesinin label değeri 1–80 karakter olmalıdır.");
            var requires = new List<string>();
            if (value.TryGetProperty("requires", out var requiresElement))
            {
                if (requiresElement.ValueKind != JsonValueKind.Array || requiresElement.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String))
                    errors.Add($"{file}: '{key}' öğesinin requires değeri öğe anahtarları dizisi olmalıdır.");
                else requires.AddRange(requiresElement.EnumerateArray().Select(x => x.GetString()!));
            }
            items[key] = new SystemPageItem(key, kind, id, since, label ?? "", requires);
        }
        foreach (var item in items.Values)
            foreach (var required in item.Requires.Where(x => !items.ContainsKey(x)))
                errors.Add($"{file}: '{item.Key}' öğesi bilinmeyen '{required}' öğesini gerektiriyor.");
        return items;
    }

    private sealed record DefinitionShape(Dictionary<string, JsonElement> TopComponents, Dictionary<string, JsonElement> Queries);

    private static DefinitionShape? InspectDefinition(string file, JsonElement definition, List<string> errors)
    {
        if (!definition.TryGetProperty("schemaVersion", out var schemaVersion) || schemaVersion.ValueKind != JsonValueKind.Number
            || !schemaVersion.TryGetInt32(out var schema) || schema != 2)
        { errors.Add($"{file}: definition schemaVersion 2 olmalıdır."); return null; }
        var top = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var queries = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (definition.TryGetProperty("components", out var components) && components.ValueKind == JsonValueKind.Array)
            foreach (var component in components.EnumerateArray())
            {
                if (component.ValueKind != JsonValueKind.Object) continue;
                if (StringOf(component, "id") is { } id) top.TryAdd(id, component);
                CheckNoCode(file, component, errors);
            }
        if (definition.TryGetProperty("queries", out var queryArray) && queryArray.ValueKind == JsonValueKind.Array)
            foreach (var query in queryArray.EnumerateArray())
            {
                if (query.ValueKind != JsonValueKind.Object) continue;
                var id = StringOf(query, "id");
                if (id is not null) queries.TryAdd(id, query);
                if (query.TryGetProperty("sql", out _))
                    errors.Add($"{file}: '{id}' sorgusu SQL içeriyor; standart tanım yalnız ERP işlemi sorgusu kullanabilir.");
                else if (!query.TryGetProperty("operation", out _))
                    errors.Add($"{file}: '{id}' sorgusu bir ERP işlemine bağlı olmalıdır.");
            }
        return new DefinitionShape(top, queries);
    }

    private static void CheckNoCode(string file, JsonElement component, List<string> errors)
    {
        var id = StringOf(component, "id");
        if (StringOf(component, "type") == "code")
            errors.Add($"{file}: '{id}' kod bileşeni; standart tanımda kod bileşeni kullanılamaz.");
        if (component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
            && (props.TryGetProperty("css", out _) || props.TryGetProperty("javascript", out _)))
            errors.Add($"{file}: '{id}' bileşeni css/javascript içeriyor; standart tanımda kod kullanılamaz.");
        if (component.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            foreach (var child in children.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Object))
                CheckNoCode(file, child, errors);
    }

    private static IReadOnlyList<SystemPageScreenView> ParseScreenViews(string file, JsonElement root, DefinitionShape shape, List<string> errors)
    {
        var views = new List<SystemPageScreenView>();
        if (!root.TryGetProperty("screenViews", out var element)) return views;
        if (element.ValueKind != JsonValueKind.Array) { errors.Add($"{file}: screenViews bir dizi olmalıdır."); return views; }
        foreach (var view in element.EnumerateArray())
        {
            if (view.ValueKind != JsonValueKind.Object) { errors.Add($"{file}: screenViews öğeleri nesne olmalıdır."); continue; }
            foreach (var unknown in view.EnumerateObject().Where(x => !ScreenViewKeys.Contains(x.Name)))
                errors.Add($"{file}: screenViews öğesinde bilinmeyen alan '{unknown.Name}'.");
            var key = StringOf(view, "key");
            var component = StringOf(view, "component");
            IReadOnlyList<(string Key, string Label, bool DefaultVisible)> catalogFields = [];
            if (key is null || !TenantScreenViewEndpoints.TryGetCatalogFields(key, out catalogFields))
                errors.Add($"{file}: screenViews anahtarı '{key}' ekran görünümü kataloğunda yok.");
            IReadOnlySet<string>? columns = null;
            if (component is null || !shape.TopComponents.TryGetValue(component, out var table) || StringOf(table, "type") != "dataTable"
                || !table.TryGetProperty("props", out var props) || props.ValueKind != JsonValueKind.Object || StringOf(props, "query") is not { } queryId)
                errors.Add($"{file}: screenViews bileşeni '{component}' sorguya bağlı üst düzey bir dataTable olmalıdır.");
            else if (!shape.Queries.TryGetValue(queryId, out var query) || StringOf(query, "operation") is not { } operationName
                     || !ErpOperationCatalog.TryGet(operationName, out var operation))
                errors.Add($"{file}: screenViews bileşeni '{component}' bilinen bir ERP işlemi sorgusuna bağlı olmalıdır.");
            else columns = operation.Result.Columns.Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
            var fields = new Dictionary<string, string>(StringComparer.Ordinal);
            if (!view.TryGetProperty("fields", out var fieldsElement) || fieldsElement.ValueKind != JsonValueKind.Object)
                errors.Add($"{file}: screenViews '{key}' için fields nesnesi gerekli.");
            else
                foreach (var field in fieldsElement.EnumerateObject())
                {
                    var column = field.Value.ValueKind == JsonValueKind.String ? field.Value.GetString()! : "";
                    if (catalogFields.Count > 0 && !catalogFields.Any(x => x.Key == field.Name))
                        errors.Add($"{file}: screenViews '{key}' alanı '{field.Name}' ekran görünümü kataloğunda yok.");
                    if (columns is not null && !columns.Contains(column))
                        errors.Add($"{file}: screenViews '{key}' alanı '{field.Name}' için '{column}' sütunu işlem sonucunda yok.");
                    fields[field.Name] = column;
                }
            views.Add(new SystemPageScreenView(key ?? "", component ?? "", fields));
        }
        return views;
    }

    private static string IdOf(JsonObject node) => node["id"] is JsonValue value && value.TryGetValue<string>(out var id) ? id : "";

    private static void CollectIds(JsonObject component, HashSet<string> ids)
    {
        ids.Add(IdOf(component));
        if (component["children"] is JsonArray children)
            foreach (var child in children.OfType<JsonObject>()) CollectIds(child, ids);
    }

    private static void StripReferences(JsonObject component, HashSet<string> removed)
    {
        if (component["props"] is JsonObject props)
        {
            var type = component["type"] is JsonValue typeValue && typeValue.TryGetValue<string>(out var text) ? text : "";
            if (type == "tabs" && props["tabs"] is JsonArray tabs)
                for (var i = tabs.Count - 1; i >= 0; i--)
                {
                    if (tabs[i] is not JsonValue tab || !tab.TryGetValue<string>(out var item) || item.Split('=', 2) is not [var label, var ids]) continue;
                    var kept = ids.Split(',', StringSplitOptions.RemoveEmptyEntries).Where(x => !removed.Contains(x)).ToArray();
                    // A tab whose every block was added in a later version (e.g. "Özel alanlar") goes away with them.
                    if (kept.Length == 0 && ids.Length > 0) tabs.RemoveAt(i);
                    else tabs[i] = label + "=" + string.Join(",", kept);
                }
            if (type == "actionBar")
            {
                foreach (var key in new[] { "newInputs", "moreButtons" }) StripList(props, key, removed, dropWhenEmpty: true);
                // Save steps added in a later version leave the older sequence (with their "step=condition" entries).
                StripList(props, "saveSequence", removed, dropWhenEmpty: true);
                if (props["sequenceWhen"] is JsonArray whens)
                {
                    foreach (var entry in whens.ToArray())
                        if (entry is JsonValue value && value.TryGetValue<string>(out var when) && removed.Contains(when.Split('=', 2)[0])) whens.Remove(entry);
                    if (whens.Count == 0) props.Remove("sequenceWhen");
                }
                foreach (var key in new[] { "focusInput", "exportTable", "saveQuery", "deleteQuery", "formDialog", "newButton", "openButton", "afterSaveButton" })
                    if (props[key] is JsonValue value && value.TryGetValue<string>(out var id) && removed.Contains(id)) props.Remove(key);
                // Flat Yeni / Aç commands lose their choice with the component they use (Aç's list takes its page group along).
                if (props["openTable"] is JsonValue table && table.TryGetValue<string>(out var tableId) && removed.Contains(tableId))
                    foreach (var key in new[] { "openAction", "openPageCode", "openTarget", "openTable", "openParams" }) props.Remove(key);
                foreach (var key in new[] { "newAction", "openAction" })
                    if (props[key] is JsonValue action && action.TryGetValue<string>(out var choice)
                        && (choice == "clear" && props["newInputs"] is null || choice == "dialog" && props["formDialog"] is null)) props.Remove(key);
            }
            if (type is "formCard" or "filterChips" or "facetPanel") StripList(props, "inputs", removed, dropWhenEmpty: false);
            if (type == "dataTable" && props["bulkDeleteQuery"] is JsonValue bulkDelete && bulkDelete.TryGetValue<string>(out var bulkDeleteId)
                && removed.Contains(bulkDeleteId)) props.Remove("bulkDeleteQuery");
            if (type == "dataTable" && props["detailToggleInput"] is JsonValue detailToggle && detailToggle.TryGetValue<string>(out var detailToggleId)
                && removed.Contains(detailToggleId)) props.Remove("detailToggleInput");
            // Row buttons added in a later version (e.g. customer-ledger v2 "Belgeye git ›") leave the older table's row actions.
            if (type == "dataTable")
            {
                StripList(props, "rowActions", removed, dropWhenEmpty: true);
                if (props["rowOpenAction"] is JsonValue rowOpen && rowOpen.TryGetValue<string>(out var rowOpenId) && removed.Contains(rowOpenId))
                    props.Remove("rowOpenAction");
            }
        }
        if (component["children"] is JsonArray children)
            foreach (var child in children.OfType<JsonObject>()) StripReferences(child, removed);
    }

    private static void StripList(JsonObject props, string key, HashSet<string> removed, bool dropWhenEmpty)
    {
        if (props[key] is not JsonArray list) return;
        foreach (var entry in list.ToArray())
            if (entry is JsonValue value && value.TryGetValue<string>(out var id) && removed.Contains(id)) list.Remove(entry);
        if (dropWhenEmpty && list.Count == 0) props.Remove(key);
    }

    private static string? StringOf(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
