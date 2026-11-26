using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

internal sealed record PageQueryParameter(string Name, string Binding, string Type);
/// <summary>
/// A page query: SQL text (<see cref="Sql"/>), a named ERP operation (<see cref="Operation"/>), or a reference to a code
/// of the tenant's active catalog (<see cref="DataSource"/> / <see cref="Action"/>). Sql is empty unless the query is SQL.
/// </summary>
internal sealed record PageQuery(string Id, string Name, string Kind, string Sql, IReadOnlyList<PageQueryParameter> Parameters, string RunOn,
    string? Operation = null, string? DataSource = null, string? Action = null);

/// <summary>Pure helpers for schema v2 page queries: reading, binding paths, SQL parameter names and dependency cycles.</summary>
internal static partial class TenantCustomPageQueries
{
    internal const string PathPattern = @"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*";
    internal static readonly IReadOnlySet<string> ReservedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "kullanici", "bugun", "sayilar" };
    /// <summary>Names that collide with JavaScript object internals when used as runtime scope keys.</summary>
    internal static readonly IReadOnlySet<string> ObjectKeyNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "__proto__", "constructor", "prototype" };

    [GeneratedRegex(@"^\{\{\s*(" + PathPattern + @")\s*\}\}$", RegexOptions.CultureInvariant)]
    private static partial Regex SingleBinding();

    [GeneratedRegex(@"\{\{\s*(" + PathPattern + @")\s*\}\}", RegexOptions.CultureInvariant)]
    internal static partial Regex EmbeddedBinding();

    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]{0,63}$", RegexOptions.CultureInvariant)]
    internal static partial Regex NamePattern();

    /// <summary>Query, component and parameter name rule: <see cref="NamePattern"/> and not a JavaScript object key.</summary>
    internal static bool IsValidName(string? name) => name is not null && NamePattern().IsMatch(name) && !ObjectKeyNames.Contains(name);

    /// <summary>
    /// Returns the definition with <c>queries[].sql</c> removed, for runtime consumers that only run queries by id.
    /// <c>queries[].operation</c> is kept: the runtime calls named ERP operations itself.
    /// Definitions without queries are returned unchanged.
    /// </summary>
    internal static string WithoutQuerySql(string definitionJson)
    {
        if (!HasQueries(definitionJson)) return definitionJson;
        if (JsonNode.Parse(definitionJson) is not JsonObject root || root["queries"] is not JsonArray queries) return definitionJson;
        foreach (var query in queries.OfType<JsonObject>()) query.Remove("sql");
        return root.ToJsonString();
    }

    internal const string CatalogMissingPrefix = "Katalogda bulunamadı: ";

    /// <summary>
    /// Resolves the catalog references of a definition for the ERP runtime, all against the same <paramref name="catalog"/>.
    /// Each query with a <c>dataSource</c> / <c>action</c> key loses that key and becomes, when the item still fits
    /// (<see cref="AIERP.Api.TenantCatalogStore.Fits"/>): an ERP operation query (<c>operation</c> = the item's operation), or,
    /// for a SQL item, an ordinary query run by id whose SQL the run endpoint takes from the catalog. A missing or no longer
    /// fitting item yields <c>catalogError</c> = "Katalogda bulunamadı: &lt;kod&gt;". Each <c>code</c> component with a
    /// <c>catalogComponent</c> is resolved by <see cref="ResolveCatalogComponents"/>. Definitions without references are
    /// returned unchanged. The result still carries page SQL; callers apply <see cref="WithoutQuerySql"/> afterwards.
    /// </summary>
    internal static string ResolveCatalogReferences(string definitionJson, AIERP.Api.CatalogBundle? catalog)
    {
        var queryReferences = HasCatalogQueryReferences(definitionJson);
        var componentReferences = HasCatalogComponents(definitionJson);
        if (!queryReferences && !componentReferences) return definitionJson;
        if (JsonNode.Parse(definitionJson) is not JsonObject root) return definitionJson;
        if (queryReferences && root["queries"] is JsonArray queries) ResolveQueryReferences(definitionJson, queries, catalog);
        if (componentReferences) ResolveCatalogComponents(root, catalog);
        return root.ToJsonString();
    }

    private static void ResolveQueryReferences(string definitionJson, JsonArray queries, AIERP.Api.CatalogBundle? catalog)
    {
        // ReadQueries skips non-object entries, so its order matches the object entries here.
        var read = ReadQueries(definitionJson);
        var objects = queries.OfType<JsonObject>().ToArray();
        if (read.Count != objects.Length)
        {
            // Defensive (both reads parse the same JSON): never hand out unresolved references; every one becomes an error.
            foreach (var query in objects.Where(x => x.ContainsKey("dataSource") || x.ContainsKey("action")))
            {
                var key = query.ContainsKey("dataSource") ? "dataSource" : "action";
                var code = query[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : "";
                query.Remove("dataSource");
                query.Remove("action");
                query["catalogError"] = CatalogMissingPrefix + code;
            }
            return;
        }
        for (var i = 0; i < objects.Length; i++)
        {
            var query = objects[i];
            var isDataSource = query.ContainsKey("dataSource");
            if (!isDataSource && !query.ContainsKey("action")) continue;
            var key = isDataSource ? "dataSource" : "action";
            var code = query[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
            query.Remove("dataSource");
            query.Remove("action");
            var item = code is null ? null : catalog?.Find(code);
            if (code is null || !AIERP.Api.TenantCatalogStore.Fits(item, key, read[i]))
            {
                query["catalogError"] = CatalogMissingPrefix + (code ?? "");
                continue;
            }
            if (item!.ErpOperation is not null) query["operation"] = item.ErpOperation;
        }
    }

    /// <summary>
    /// Resolves every <c>code</c> component (at any depth) whose props carry a <c>catalogComponent</c>. Whatever the stored
    /// props say, <c>css</c>, <c>javascript</c>, <c>height</c>, <c>componentDefaults</c> and <c>catalogMissing</c> are written
    /// by the server only. When the active catalog has the component: its CSS, JavaScript and height, <c>componentDefaults</c>
    /// (settings that declare a default; omitted when none does) and <c>componentSettings</c> reduced to the values that still
    /// fit a setting the component defines, so the runtime falls back to the default (the stored page is not changed).
    /// Otherwise <c>catalogMissing: true</c> and the stored <c>componentSettings</c> as they are.
    /// </summary>
    private static void ResolveCatalogComponents(JsonObject root, AIERP.Api.CatalogBundle? catalog)
    {
        foreach (var props in CatalogComponentProps(root).ToArray())
        {
            var code = props["catalogComponent"] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
            foreach (var key in new[] { "css", "javascript", "height", "componentDefaults", "catalogMissing" }) props.Remove(key);
            var component = code is null ? null : catalog?.FindComponent(code);
            if (component is null)
            {
                props["catalogMissing"] = true;
                continue;
            }
            props["css"] = component.Css;
            props["javascript"] = component.JavaScript;
            props["height"] = component.Height;
            var defaults = new JsonObject();
            foreach (var setting in component.Settings.Where(x => x.Default is not null))
                defaults[setting.Name] = JsonNode.Parse(setting.Default!.Value.GetRawText());
            if (defaults.Count > 0) props["componentDefaults"] = defaults;
            if (props["componentSettings"] is JsonObject settings)
                foreach (var name in settings.Select(x => x.Key).ToArray())
                    if (!SettingFits(component, name, settings[name])) settings.Remove(name);
        }
    }

    /// <summary>Whether a page's setting value names a setting of <paramref name="component"/> and fits its type (choice: one of its options).</summary>
    private static bool SettingFits(AIERP.Api.CatalogComponent component, string name, JsonNode? value)
    {
        var setting = component.Settings.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.Ordinal));
        if (setting is null) return false;
        using var stored = JsonDocument.Parse(value?.ToJsonString() ?? "null");
        return AIERP.Api.TenantCatalogSchema.SettingValueFits(setting.Type, setting.Options, stored.RootElement);
    }

    /// <summary>Props objects of every <c>code</c> component (any depth) that has a <c>catalogComponent</c> key.</summary>
    private static IEnumerable<JsonObject> CatalogComponentProps(JsonNode? node)
    {
        if (node is JsonArray array)
        {
            foreach (var found in array.SelectMany(CatalogComponentProps)) yield return found;
            yield break;
        }
        if (node is not JsonObject element) yield break;
        if (element["type"] is JsonValue type && type.TryGetValue<string>(out var typeText) && typeText == "code"
            && element["props"] is JsonObject props && props.ContainsKey("catalogComponent"))
            yield return props;
        foreach (var found in element.Select(x => x.Value).SelectMany(CatalogComponentProps)) yield return found;
    }

    /// <summary>
    /// Structural check: a v2 definition with a <c>code</c> component (any depth) whose props have a <c>catalogComponent</c>
    /// key (any value). Never throws on stored JSON.
    /// </summary>
    internal static bool HasCatalogComponents(string definitionJson) => CatalogComponentReferences(definitionJson).Count > 0;

    /// <summary>The <c>catalogComponent</c> references of a v2 definition: the code (null when not a string) and the settings object.</summary>
    internal static IReadOnlyList<(string? Code, JsonObject? Settings)> CatalogComponentReferences(string definitionJson)
    {
        try
        {
            if (!definitionJson.Contains("catalogComponent", StringComparison.Ordinal)) return [];
            if (JsonNode.Parse(definitionJson, documentOptions: new JsonDocumentOptions { MaxDepth = 64 }) is not JsonObject root
                || !(root["schemaVersion"] is JsonValue version && version.TryGetValue<int>(out var number) && number == 2)) return [];
            return CatalogComponentProps(root).Select(props =>
                (props["catalogComponent"] is JsonValue value && value.TryGetValue<string>(out var code) ? code : null, props["componentSettings"] as JsonObject)).ToArray();
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException) { return []; }
    }

    internal const string MissingComponentError = "Seçilen bileşen etkin katalogda yok.";

    /// <summary>
    /// Save rule for catalog component references (after the schema's format rules): each referenced component exists in
    /// the active <paramref name="catalog"/>, and every setting value names a setting of the component and fits its type
    /// (choice: one of its options). Null when everything fits.
    /// </summary>
    internal static string? CatalogComponentError(string definitionJson, AIERP.Api.CatalogBundle? catalog)
    {
        foreach (var (code, settings) in CatalogComponentReferences(definitionJson))
        {
            var component = code is null ? null : catalog?.FindComponent(code);
            if (component is null) return MissingComponentError;
            if (settings is null) continue;
            foreach (var (name, value) in settings)
            {
                if (!component.Settings.Any(x => string.Equals(x.Name, name, StringComparison.Ordinal)))
                    return $"Bileşen ayarı '{name}' bileşende tanımlı değil.";
                if (!SettingFits(component, name, value)) return $"Bileşen ayarı '{name}' için değer türü uygun değil.";
            }
        }
        return null;
    }

    /// <summary>Reads the queries of a v2 definition. v1, malformed or query-less definitions yield an empty list.</summary>
    internal static IReadOnlyList<PageQuery> ReadQueries(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            if (!IsVersion2(root) || !root.TryGetProperty("queries", out var queries) || queries.ValueKind != JsonValueKind.Array) return [];
            var result = new List<PageQuery>();
            foreach (var query in queries.EnumerateArray())
            {
                if (query.ValueKind != JsonValueKind.Object) continue;
                var parameters = new List<PageQueryParameter>();
                if (query.TryGetProperty("parameters", out var list) && list.ValueKind == JsonValueKind.Array)
                    foreach (var parameter in list.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Object))
                        parameters.Add(new PageQueryParameter(Text(parameter, "name"), Text(parameter, "binding"), Text(parameter, "type")));
                result.Add(new PageQuery(Text(query, "id"), Text(query, "name"), Text(query, "kind"), Text(query, "sql"), parameters, Text(query, "runOn"),
                    OptionalText(query, "operation"), OptionalText(query, "dataSource"), OptionalText(query, "action")));
            }
            return result;
        }
        catch (JsonException) { return []; }
    }

    /// <summary>
    /// Structural check: a v2 definition with a non-empty <c>queries</c> array. Deliberately does not validate the
    /// entries, so a malformed query still counts as a query. Never throws on stored JSON.
    /// </summary>
    internal static bool HasQueries(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            return IsVersion2(root) && root.TryGetProperty("queries", out var queries)
                && queries.ValueKind == JsonValueKind.Array && queries.GetArrayLength() > 0;
        }
        catch (JsonException) { return false; }
    }

    /// <summary>
    /// Structural check: a v2 definition with at least one query that is not a pure ERP operation query. Operation queries
    /// (an <c>operation</c> key and no <c>sql</c> key) carry no SQL and run against their own endpoint with the user's
    /// token. Like <see cref="HasQueries"/> it fails safe: a malformed entry counts as SQL. Catalog references
    /// (<c>dataSource</c> / <c>action</c>) deliberately count too: their catalog item may run SQL on the server, so the
    /// access-row, runtime-rights and SQL-visibility rules that use this check stay unchanged for them. The save gate
    /// (<see cref="HasInlineSqlQueries"/>) is a different, narrower rule: it does not count catalog references. Never throws on stored JSON.
    /// </summary>
    internal static bool HasSqlQueries(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            return IsVersion2(root) && root.TryGetProperty("queries", out var queries) && queries.ValueKind == JsonValueKind.Array
                && queries.EnumerateArray().Any(query => query.ValueKind != JsonValueKind.Object
                    || query.TryGetProperty("sql", out _) || !query.TryGetProperty("operation", out _));
        }
        catch (JsonException) { return false; }
    }

    /// <summary>
    /// The save gate's structural check for inline SQL: like <see cref="HasSqlQueries"/>, but a catalog reference (an object
    /// with a <c>dataSource</c> or <c>action</c> key and neither <c>sql</c> nor <c>operation</c>) does not count. Catalog
    /// references carry only a code: the catalog version is activated by a TenantAdmin and its SQL is re-validated on every
    /// run, so any user with page write permission may save them (Karar 1). Malformed entries and inline SQL count.
    /// Never throws on stored JSON.
    /// </summary>
    internal static bool HasInlineSqlQueries(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            return IsVersion2(root) && root.TryGetProperty("queries", out var queries) && queries.ValueKind == JsonValueKind.Array
                && queries.EnumerateArray().Any(query => query.ValueKind != JsonValueKind.Object
                    || query.TryGetProperty("sql", out _)
                    || (!query.TryGetProperty("operation", out _) && !IsCatalogReference(query)));
        }
        catch (JsonException) { return false; }
    }

    private static bool IsCatalogReference(JsonElement query) => query.TryGetProperty("dataSource", out _) || query.TryGetProperty("action", out _);

    /// <summary>
    /// Structural check: a v2 definition that references the tenant catalog, by a query (<see cref="HasCatalogQueryReferences"/>)
    /// or by a catalog component (<see cref="HasCatalogComponents"/>). Never throws on stored JSON.
    /// </summary>
    internal static bool HasCatalogReferences(string definitionJson) =>
        HasCatalogQueryReferences(definitionJson) || HasCatalogComponents(definitionJson);

    /// <summary>Structural check: a v2 definition with a query that has a <c>dataSource</c> or <c>action</c> key (any value). Never throws on stored JSON.</summary>
    internal static bool HasCatalogQueryReferences(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            return IsVersion2(root) && root.TryGetProperty("queries", out var queries) && queries.ValueKind == JsonValueKind.Array
                && queries.EnumerateArray().Any(query => query.ValueKind == JsonValueKind.Object
                    && (query.TryGetProperty("dataSource", out _) || query.TryGetProperty("action", out _)));
        }
        catch (JsonException) { return false; }
    }

    /// <summary>The catalog codes the definition's queries reference; Kind is <c>dataSource</c> or <c>action</c>.</summary>
    internal static IReadOnlyList<(string QueryId, string Code, string Kind)> CatalogReferences(string definitionJson) =>
        ReadQueries(definitionJson).SelectMany(x => new[] { (x.Id, x.DataSource, Kind: "dataSource"), (x.Id, x.Action, Kind: "action") })
            .Where(x => x.Item2 is not null).Select(x => (x.Id, x.Item2!, x.Kind)).ToArray();

    /// <summary>
    /// Structural check: a v2 definition with an ERP operation query that is not a pure read (query kind other than
    /// <c>read</c>, or a named operation that is unknown or a write). Fails safe like <see cref="HasSqlQueries"/>: an
    /// operation entry that cannot be classified counts as a write. Never throws on stored JSON.
    /// </summary>
    internal static bool HasWriteOperationQueries(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            return IsVersion2(root) && root.TryGetProperty("queries", out var queries) && queries.ValueKind == JsonValueKind.Array
                && queries.EnumerateArray().Any(query => query.ValueKind == JsonValueKind.Object
                    && query.TryGetProperty("operation", out var operation)
                    && !(query.TryGetProperty("kind", out var kind) && kind.ValueKind == JsonValueKind.String && kind.GetString() == "read"
                         && operation.ValueKind == JsonValueKind.String
                         && AIERP.Api.ErpOperationCatalog.TryGet(operation.GetString()!, out var op) && op.Kind == "read"));
        }
        catch (JsonException) { return false; }
    }

    /// <summary>
    /// Structural check (v1 or v2, nested children included): a component of type <c>code</c> whose <c>props.javascript</c>
    /// is a non-blank string. Code components can reach page data and operations, so authoring them needs SQL-level trust.
    /// Never throws on stored JSON.
    /// </summary>
    internal static bool HasCodeScript(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson, new JsonDocumentOptions { MaxDepth = 64 });
            return HasCodeScript(document.RootElement);
        }
        catch (JsonException) { return false; }
    }

    private static bool HasCodeScript(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Array) return element.EnumerateArray().Any(HasCodeScript);
        if (element.ValueKind != JsonValueKind.Object) return false;
        if (element.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "code"
            && element.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
            && props.TryGetProperty("javascript", out var script) && script.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(script.GetString())) return true;
        return element.EnumerateObject().Any(property => HasCodeScript(property.Value));
    }

    /// <summary>ERP operation names used by any of the given stored definitions (malformed ones contribute nothing).</summary>
    internal static IReadOnlySet<string> OperationNames(params string?[] definitions) =>
        definitions.Where(x => x is not null).SelectMany(x => ReadQueries(x!)).Select(x => x.Operation)
            .OfType<string>().ToHashSet(StringComparer.Ordinal);

    /// <summary>
    /// Names of <c>@parameters</c> used in the SQL text (without '@'), compared case-insensitively. String literals,
    /// [bracketed] and "quoted" identifiers, comments and <c>@@system</c> variables are ignored.
    /// </summary>
    internal static IReadOnlySet<string> SqlParameterNames(string sql)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < sql.Length; index++)
        {
            var current = sql[index];
            if (current is '\'' or '[' or '"')
            {
                var closing = current == '[' ? ']' : current;
                index++;
                while (index < sql.Length)
                {
                    if (sql[index] == closing && index + 1 < sql.Length && sql[index + 1] == closing) { index += 2; continue; }
                    if (sql[index] == closing) break;
                    index++;
                }
                continue;
            }
            if (current == '-' && index + 1 < sql.Length && sql[index + 1] == '-')
            {
                while (index < sql.Length && sql[index] != '\n') index++;
                continue;
            }
            if (current == '/' && index + 1 < sql.Length && sql[index + 1] == '*')
            {
                var end = sql.IndexOf("*/", index + 2, StringComparison.Ordinal);
                index = end < 0 ? sql.Length : end + 1;
                continue;
            }
            if (current != '@') continue;
            var start = index + 1;
            if (start < sql.Length && sql[start] == '@')
            {
                // @@ROWCOUNT etc.: skip the whole system variable name.
                index = start;
                while (index + 1 < sql.Length && IsParameterChar(sql[index + 1])) index++;
                continue;
            }
            var stop = start;
            while (stop < sql.Length && IsParameterChar(sql[stop])) stop++;
            if (stop > start) names.Add(sql[start..stop]);
            index = stop - 1;
        }
        return names;
    }

    /// <summary>True when the whole expression is a single <c>{{PATH}}</c>; <paramref name="root"/> is its first segment.</summary>
    internal static bool TryParseBindingPath(string expression, out string root)
    {
        root = "";
        var match = SingleBinding().Match(expression ?? "");
        if (!match.Success) return false;
        root = RootOf(match.Groups[1].Value);
        return true;
    }

    /// <summary>The path of a single <c>{{PATH}}</c> binding expression, without braces and surrounding spaces.</summary>
    internal static bool TryParseBinding(string expression, out string path)
    {
        var match = SingleBinding().Match(expression ?? "");
        path = match.Success ? match.Groups[1].Value : "";
        return match.Success;
    }

    internal static string RootOf(string path)
    {
        var end = path.IndexOfAny(['.', '[']);
        return end < 0 ? path : path[..end];
    }

    /// <summary>
    /// Detects a dependency cycle between queries, where a query depends on every query whose name (case-insensitive)
    /// is the root of one of its parameter bindings. Returns the name chain (e.g. "a → b → a") or null.
    /// </summary>
    internal static string? FindCycle(IReadOnlyList<PageQuery> queries)
    {
        var byName = new Dictionary<string, PageQuery>(StringComparer.OrdinalIgnoreCase);
        foreach (var query in queries) byName.TryAdd(query.Name, query);
        var state = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase); // 1 = visiting, 2 = done
        var stack = new List<string>();

        string? Visit(PageQuery query)
        {
            state[query.Name] = 1;
            stack.Add(query.Name);
            foreach (var parameter in query.Parameters)
            {
                if (!TryParseBindingPath(parameter.Binding, out var root) || !byName.TryGetValue(root, out var dependency)) continue;
                var dependencyState = state.GetValueOrDefault(dependency.Name);
                if (dependencyState == 1)
                {
                    var from = stack.FindIndex(x => string.Equals(x, dependency.Name, StringComparison.OrdinalIgnoreCase));
                    return string.Join(" → ", stack.Skip(from).Append(dependency.Name));
                }
                if (dependencyState == 0 && Visit(dependency) is { } cycle) return cycle;
            }
            stack.RemoveAt(stack.Count - 1);
            state[query.Name] = 2;
            return null;
        }

        foreach (var query in byName.Values)
            if (state.GetValueOrDefault(query.Name) == 0 && Visit(query) is { } cycle) return cycle;
        return null;
    }

    private static bool IsParameterChar(char c) => char.IsAsciiLetterOrDigit(c) || c is '_' or '@' or '#' or '$';
    private static bool IsVersion2(JsonElement root) => root.ValueKind == JsonValueKind.Object
        && root.TryGetProperty("schemaVersion", out var version) && version.ValueKind == JsonValueKind.Number
        && version.TryGetInt32(out var number) && number == 2;
    private static string? OptionalText(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static string Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
}
