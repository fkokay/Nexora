using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AIERP.Api;

internal sealed record CatalogParameter(string Name, string Type);
internal sealed record CatalogColumn(string Code, string Label, string Type, bool Key);

/// <summary>One data source or action of a tenant catalog bundle; exactly one of <see cref="Sql"/> / <see cref="ErpOperation"/> is set.</summary>
internal sealed record CatalogItem(string Code, string Label, string ItemKind, string QueryKind, string? Sql, string? ErpOperation,
    IReadOnlyList<CatalogParameter> Parameters, IReadOnlyList<CatalogColumn> Columns, string? Opens, string? Target, string? ConfirmText);

/// <summary>
/// A parsed catalog bundle. <see cref="Items"/> are the items valid under today's rules (the only ones pages may reference,
/// listings show and the save gate trusts). A leniently read stored bundle may also carry items that no longer validate:
/// <see cref="InvalidCodes"/> names all of them, and <see cref="RejectedSqlItems"/> keeps those whose only fault is SQL that
/// today's validator rejects, so the run endpoint can still answer with its stored-SQL error instead of "not found".
/// </summary>
internal sealed record CatalogBundle(IReadOnlyList<CatalogItem> Items)
{
    public IReadOnlyList<CatalogItem> RejectedSqlItems { get; init; } = [];
    public IReadOnlyList<string> InvalidCodes { get; init; } = [];

    public CatalogItem? Find(string code) => Items.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.Ordinal));

    /// <summary><see cref="Find"/>, falling back to an item kept only for its rejected SQL (run endpoint only: it re-validates the SQL).</summary>
    public CatalogItem? FindForRun(string code) =>
        Find(code) ?? RejectedSqlItems.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.Ordinal));
}

/// <summary>
/// Parses and validates a tenant catalog bundle (schemaVersion 1): named declarative data sources (read) and actions
/// (insert/update/delete) that custom pages reference by code. Unknown keys are rejected; nothing is executed here.
/// </summary>
internal static class TenantCatalogSchema
{
    internal const int MaxBundleBytes = 512 * 1024;
    internal const int MaxDataSources = 200;
    internal const int MaxActions = 200;
    internal const int MaxColumns = 64;
    internal const int MaxParameters = 20;

    private static readonly HashSet<string> RootKeys = new(StringComparer.Ordinal) { "schemaVersion", "dataSources", "actions" };
    private static readonly HashSet<string> DataSourceKeys = new(StringComparer.Ordinal) { "code", "label", "source", "parameters", "columns", "opens" };
    private static readonly HashSet<string> ActionKeys = new(StringComparer.Ordinal) { "code", "label", "target", "kind", "run", "parameters", "columns", "opens", "confirm" };
    private static readonly HashSet<string> SqlOrOperationKeys = new(StringComparer.Ordinal) { "sql", "erpOperation" };
    private static readonly HashSet<string> ParameterKeys = new(StringComparer.Ordinal) { "name", "type" };
    private static readonly HashSet<string> ColumnKeys = new(StringComparer.Ordinal) { "code", "label", "type", "key" };
    private static readonly HashSet<string> ConfirmKeys = new(StringComparer.Ordinal) { "text" };
    private static readonly HashSet<string> ValueTypes = new(StringComparer.Ordinal) { "text", "int", "decimal", "date", "bool", "guid" };
    private static readonly HashSet<string> WriteKinds = new(StringComparer.Ordinal) { "insert", "update", "delete" };
    private static readonly HashSet<string> Targets = new(StringComparer.Ordinal) { "row", "page", "bulk" };
    private static readonly Regex OpensPattern = new(@"^[a-z0-9-]{1,40}\z", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    /// <summary>Strict parse (release create and activate): any invalid item, a deprecated operation included, rejects the bundle.</summary>
    public static bool TryParse(string json, ErpOperationLookup lookup, out CatalogBundle? bundle, out string? error) =>
        Parse(json, lookup, lenient: false, out bundle, out _, out error);

    /// <summary>
    /// Lenient parse of a stored (already accepted) bundle: the structure must still be valid, but an item that fails today's
    /// item rules is set aside on its own (<paramref name="problems"/> gets its message) instead of failing the bundle, and
    /// an operation deprecated since installation stays accepted (grandfathered). An operation that no longer exists makes
    /// its item invalid.
    /// </summary>
    public static bool TryParseLenient(string json, ErpOperationLookup lookup, out CatalogBundle? bundle, out IReadOnlyList<string> problems, out string? error) =>
        Parse(json, lookup, lenient: true, out bundle, out problems, out error);

    private static bool Parse(string json, ErpOperationLookup lookup, bool lenient, out CatalogBundle? bundle, out IReadOnlyList<string> problems, out string? error)
    {
        var issues = new List<string>();
        problems = issues;
        bundle = null;
        error = null;
        if (json is null || Encoding.UTF8.GetByteCount(json) > MaxBundleBytes)
        {
            error = "Katalog paketi çok büyük (en fazla 512 KiB).";
            return false;
        }
        try
        {
            using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !TenantCustomPageSchema.OnlyKeys(root, RootKeys))
                return Fail(out error, "Paket: bilinmeyen ya da geçersiz anahtar var.");
            if (!root.TryGetProperty("schemaVersion", out var version) || version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var v) || v != 1)
                return Fail(out error, "Paket: schemaVersion 1 olmalıdır.");

            var items = new List<CatalogItem>();
            var invalid = new Invalid([], [], issues);
            var codes = new HashSet<string>(StringComparer.Ordinal);
            if (!ReadList(root, "dataSources", "dataSource", MaxDataSources, lookup, codes, items, lenient ? invalid : null, out error)) return false;
            if (!ReadList(root, "actions", "action", MaxActions, lookup, codes, items, lenient ? invalid : null, out error)) return false;
            bundle = new CatalogBundle(items) { RejectedSqlItems = invalid.RejectedSql, InvalidCodes = invalid.Codes };
            return true;
        }
        catch (JsonException)
        {
            return Fail(out error, "Paket: JSON geçersiz.");
        }
    }

    private static bool Fail(out string? error, string message)
    {
        error = message;
        return false;
    }

    /// <summary>Items a lenient parse set aside: every invalid code, the items kept for their rejected SQL, and the messages.</summary>
    private sealed record Invalid(List<string> Codes, List<CatalogItem> RejectedSql, List<string> Problems);

    private static bool ReadList(JsonElement root, string property, string itemKind, int max, ErpOperationLookup lookup, HashSet<string> codes,
        List<CatalogItem> items, Invalid? lenient, out string? error)
    {
        error = null;
        if (!root.TryGetProperty(property, out var list)) return true;
        if (list.ValueKind != JsonValueKind.Array) return Fail(out error, $"{property}: dizi olmalıdır.");
        if (list.GetArrayLength() > max) return Fail(out error, $"{property}: en fazla {max} öğe olabilir.");
        var index = 0;
        foreach (var element in list.EnumerateArray())
        {
            var place = $"{property}[{index++}]";
            if (!ReadItem(element, itemKind, place, lookup, codes, lenient is not null, out var item, out var sqlRejected, out error))
            {
                if (lenient is null) return false;
                lenient.Codes.Add(Text(element, "code") ?? place);
                lenient.Problems.Add(error!);
                error = null;
                continue;
            }
            if (sqlRejected)
            {
                lenient!.Codes.Add(item!.Code);
                lenient.RejectedSql.Add(item);
                lenient.Problems.Add($"{place} ({item.Code}): SQL bugünkü doğrulayıcıya göre geçersiz.");
                continue;
            }
            items.Add(item!);
        }
        return true;
    }

    /// <summary>
    /// Reads one item. In <paramref name="lenient"/> mode a deprecated operation is accepted, and SQL that today's validator
    /// rejects does not fail the item: it is returned with <paramref name="sqlRejected"/> set (the other rules still apply).
    /// </summary>
    private static bool ReadItem(JsonElement element, string itemKind, string place, ErpOperationLookup lookup, HashSet<string> codes,
        bool lenient, out CatalogItem? item, out bool sqlRejected, out string? error)
    {
        item = null;
        sqlRejected = false;
        var isAction = itemKind == "action";
        if (element.ValueKind != JsonValueKind.Object) return Fail(out error, $"{place}: nesne olmalıdır.");
        var code = Text(element, "code");
        if (!TenantCustomPageQueries.IsValidName(code)) return Fail(out error, $"{place}: kod geçersiz.");
        place += $" ({code})";
        if (!TenantCustomPageSchema.OnlyKeys(element, isAction ? ActionKeys : DataSourceKeys)) return Fail(out error, $"{place}: bilinmeyen ya da izin verilmeyen anahtar var.");
        if (!codes.Add(code!)) return Fail(out error, $"{place}: kod başka bir öğede de kullanılmış.");
        var label = Text(element, "label");
        if (string.IsNullOrWhiteSpace(label) || label.Length > 100) return Fail(out error, $"{place}: etiket 1-100 karakter olmalıdır.");

        var queryKind = "read";
        string? target = null;
        if (isAction)
        {
            queryKind = Text(element, "kind") ?? "";
            if (!WriteKinds.Contains(queryKind)) return Fail(out error, $"{place}: eylem türü insert, update ya da delete olmalıdır.");
            target = element.TryGetProperty("target", out _) ? Text(element, "target") : "row";
            if (target is null || !Targets.Contains(target)) return Fail(out error, $"{place}: hedef row, page ya da bulk olmalıdır.");
        }

        var bodyKey = isAction ? "run" : "source";
        if (!element.TryGetProperty(bodyKey, out var body) || body.ValueKind != JsonValueKind.Object
            || !TenantCustomPageSchema.OnlyKeys(body, SqlOrOperationKeys))
            return Fail(out error, $"{place}: {bodyKey} sql ya da erpOperation içermelidir.");
        var hasSql = body.TryGetProperty("sql", out var sqlElement);
        var hasOperation = body.TryGetProperty("erpOperation", out var operationElement);
        if (hasSql == hasOperation) return Fail(out error, $"{place}: {bodyKey} içinde sql ya da erpOperation'dan tam olarak biri bulunmalıdır.");

        var parameters = new List<CatalogParameter>();
        if (hasOperation && element.TryGetProperty("parameters", out _)) return Fail(out error, $"{place}: ERP işlemine dayanan öğe parametre bildiremez.");
        if (!hasOperation && !ReadParameters(element, place, parameters, out error)) return false;

        string? sql = null, operation = null;
        if (hasSql)
        {
            sql = sqlElement.ValueKind == JsonValueKind.String ? sqlElement.GetString() : null;
            if (string.IsNullOrWhiteSpace(sql)) return Fail(out error, $"{place}: SQL boş olamaz.");
            string? sqlError;
            var valid = isAction ? ReportEndpoints.TryValidateWriteSql(sql, queryKind, out sqlError) : ReportEndpoints.TryValidateReadOnlySql(sql, out sqlError);
            if (!valid && !lenient) return Fail(out error, $"{place}: SQL geçersiz. {sqlError}".TrimEnd());
            sqlRejected = !valid;
            if (!TenantCustomPageQueries.SqlParameterNames(sql).SetEquals(parameters.Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase)))
                return Fail(out error, $"{place}: SQL parametreleri bildirilenlerle aynı değil.");
        }
        else
        {
            operation = operationElement.ValueKind == JsonValueKind.String ? operationElement.GetString() : null;
            if (operation is null || !lookup(operation, out var op)) return Fail(out error, $"{place}: ERP işlemi bulunamadı: {operation}");
            if (op.Deprecated && !lenient) return Fail(out error, $"{place}: ERP işlemi artık kullanılamıyor: {operation}");
            if (!string.Equals(op.PageKind, queryKind, StringComparison.Ordinal))
                return Fail(out error, $"{place}: ERP işleminin türü ({op.PageKind}) öğenin türüyle ({queryKind}) aynı değil.");
            if (op.SourceOperation is not null || op.BodyMap is not null)
                return Fail(out error, $"{place}: kaynak sorgu gerektiren ERP işlemleri katalogda kullanılamaz.");
        }

        var columns = new List<CatalogColumn>();
        if (!ReadColumns(element, place, columns, out error)) return false;

        string? opens = null;
        if (element.TryGetProperty("opens", out var opensElement))
        {
            opens = opensElement.ValueKind == JsonValueKind.String ? opensElement.GetString() : null;
            if (opens is null || !(OpensPattern.IsMatch(opens) || SystemPageCodes.IsSystemCode(opens))) return Fail(out error, $"{place}: opens geçersiz.");
        }

        string? confirmText = null;
        if (element.TryGetProperty("confirm", out var confirm) && confirm.ValueKind != JsonValueKind.Null)
        {
            if (confirm.ValueKind != JsonValueKind.Object || !TenantCustomPageSchema.OnlyKeys(confirm, ConfirmKeys)) return Fail(out error, $"{place}: confirm geçersiz.");
            confirmText = Text(confirm, "text");
            if (string.IsNullOrEmpty(confirmText) || confirmText.Length > 200) return Fail(out error, $"{place}: onay metni 1-200 karakter olmalıdır.");
        }

        item = new CatalogItem(code!, label, itemKind, queryKind, sql, operation, parameters, columns, opens, target, confirmText);
        error = null;
        return true;
    }

    private static bool ReadParameters(JsonElement element, string place, List<CatalogParameter> parameters, out string? error)
    {
        error = null;
        if (!element.TryGetProperty("parameters", out var list)) return true;
        if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() > MaxParameters) return Fail(out error, $"{place}: parametreler en fazla {MaxParameters} öğelik dizi olmalıdır.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in list.EnumerateArray())
        {
            var isObject = parameter.ValueKind == JsonValueKind.Object;
            var name = isObject ? Text(parameter, "name") : null;
            var type = isObject ? Text(parameter, "type") : null;
            if (!isObject || !TenantCustomPageSchema.OnlyKeys(parameter, ParameterKeys) || !TenantCustomPageQueries.IsValidName(name)
                || type is null || !ValueTypes.Contains(type) || !names.Add(name!))
                return Fail(out error, $"{place}: parametre geçersiz ya da yinelenmiş.");
            parameters.Add(new CatalogParameter(name!, type));
        }
        return true;
    }

    private static bool ReadColumns(JsonElement element, string place, List<CatalogColumn> columns, out string? error)
    {
        error = null;
        if (!element.TryGetProperty("columns", out var list)) return true;
        if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() > MaxColumns) return Fail(out error, $"{place}: kolonlar en fazla {MaxColumns} öğelik dizi olmalıdır.");
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var column in list.EnumerateArray())
        {
            var isObject = column.ValueKind == JsonValueKind.Object;
            var code = isObject ? Text(column, "code") : null;
            var label = isObject ? Text(column, "label") : null;
            var type = isObject ? Text(column, "type") : null;
            var key = false;
            if (isObject && column.TryGetProperty("key", out var keyElement))
            {
                if (keyElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return Fail(out error, $"{place}: kolon geçersiz.");
                key = keyElement.GetBoolean();
            }
            if (!isObject || !TenantCustomPageSchema.OnlyKeys(column, ColumnKeys) || string.IsNullOrWhiteSpace(code) || code.Length > 64
                || string.IsNullOrWhiteSpace(label) || label.Length > 100 || type is null || !ValueTypes.Contains(type) || !codes.Add(code))
                return Fail(out error, $"{place}: kolon geçersiz ya da yinelenmiş.");
            columns.Add(new CatalogColumn(code, label, type, key));
        }
        return true;
    }

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
