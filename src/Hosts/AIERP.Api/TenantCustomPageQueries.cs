using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

internal sealed record PageQueryParameter(string Name, string Binding, string Type);
/// <summary>A page query: either SQL text (<see cref="Sql"/>) or a named ERP operation (<see cref="Operation"/>, Sql is then empty).</summary>
internal sealed record PageQuery(string Id, string Name, string Kind, string Sql, IReadOnlyList<PageQueryParameter> Parameters, string RunOn,
    string? Operation = null);

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
                var operation = query.TryGetProperty("operation", out var op) && op.ValueKind == JsonValueKind.String ? op.GetString() : null;
                result.Add(new PageQuery(Text(query, "id"), Text(query, "name"), Text(query, "kind"), Text(query, "sql"), parameters, Text(query, "runOn"), operation));
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
    /// token. Like <see cref="HasQueries"/> it fails safe: a malformed entry counts as SQL. Never throws on stored JSON.
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
    private static string Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
}
