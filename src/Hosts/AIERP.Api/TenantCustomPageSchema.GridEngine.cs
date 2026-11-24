using System.Text.Json;
using System.Text.RegularExpressions;

/// <summary>
/// Generic engine props of a <c>list</c> editable grid (runtime: <c>frontend/erp-web/src/custom-page/gridFill.ts</c>):
/// <list type="bullet">
/// <item><c>fillQuery</c> (a read query of the page returning a list), <c>fillColumns</c> <c>{ gridCol: queryCol }</c> (a
/// <c>"lookupCol@label"</c> key names the shown label of a filled picker cell) and <c>skipWhenZero</c> (a number column);</item>
/// <item><c>lookupFills</c> <c>{ lookupCol: { gridCol: optionCol } }</c>;</item>
/// <item><c>formulas</c> <c>{ numberCol: expr }</c> (see <see cref="GridFormula"/>; formulas may reference each other without cycles);</item>
/// <item><c>rowNumberColumn</c>: a number column that gets 1..n on the sent rows (not a formula, fill target or formula operand);</item>
/// <item><c>lockColumnsWhen</c> <c>["col1,col2=condition"]</c>: while the row condition holds (<c>satir</c> is the grid row) the
/// columns are read-only, empty and left out of the row (e.g. the price cells of a free-of-charge line); see
/// <see cref="ValidateLockColumns"/>.</item>
/// </list>
/// Computed (<c>calc</c>) columns are never a fill target. The object-valued ones skip the generic prop check
/// (<see cref="GridEngineObjectProps"/>) and are fully checked here.
/// </summary>
internal static partial class TenantCustomPageSchema
{
    private static readonly string[] GridEngineProps = ["fillQuery", "fillColumns", "skipWhenZero", "lookupFills", "formulas", "rowNumberColumn", "lockColumnsWhen"];
    /// <summary>Most <c>lockColumnsWhen</c> rules of a grid.</summary>
    internal const int MaxLockRules = 8;
    /// <summary>The grid-row overlay of a <c>lockColumnsWhen</c> condition; its only root.</summary>
    private const string LockRowRoot = "satir";
    private static readonly Regex QuotedLiteral = new(@"'[^']*'|""[^""]*""", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex RowPath = new(@"\bsatir((?:\.[A-Za-z_][A-Za-z0-9_]*)+)", RegexOptions.CultureInvariant, RegexTimeout);
    /// <summary>Object-valued grid props; the generic <c>SafeValue</c> check rejects objects, so they are validated here.</summary>
    private static readonly HashSet<string> GridEngineObjectProps = new(StringComparer.Ordinal) { "fillColumns", "lookupFills", "formulas" };
    private static readonly Regex EngineSourceColumn = new(@"^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[A-Za-z_][A-Za-z0-9_]{0,63})*\z", RegexOptions.CultureInvariant, RegexTimeout);

    /// <summary>Validates the engine props; <paramref name="formulas"/> are the grid's formula column codes.</summary>
    private static bool ValidateGridEngineProps(JsonElement props, string mode, IReadOnlyList<string> columns, IReadOnlySet<string> numberColumns,
        IReadOnlySet<string> calcColumns, IReadOnlyDictionary<string, GridColumnSpec.Lookup> lookups, Context context, out HashSet<string> formulas,
        out string? error)
    {
        var formulaCodes = new HashSet<string>(StringComparer.Ordinal);
        formulas = formulaCodes;
        error = null;
        if (mode != "list")
        {
            foreach (var key in GridEngineProps)
                if (props.TryGetProperty(key, out _)) return Fail($"'{key}' yalnız listeli (list) kipte kullanılabilir.", out error);
            return true;
        }
        var columnSet = columns.ToHashSet(StringComparer.Ordinal);
        string? rowNumber = null;
        if (props.TryGetProperty("rowNumberColumn", out var rowNumberColumn))
        {
            if (rowNumberColumn.ValueKind != JsonValueKind.String || !numberColumns.Contains(rowNumberColumn.GetString()!))
                return Fail("'rowNumberColumn' ızgaranın sayı (number) sütunu olmalıdır.", out error);
            rowNumber = rowNumberColumn.GetString();
        }

        if (props.TryGetProperty("formulas", out var formulaMap))
        {
            if (!TryReadStringMap(formulaMap, out var entries))
                return Fail($"'formulas' 1–{MaxGridColumns} adet \"sütun\": \"ifade\" öğesi içeren bir nesne olmalıdır.", out error);
            foreach (var (code, _) in entries)
            {
                if (!numberColumns.Contains(code)) return Fail($"'formulas' sütunu ızgaranın sayı (number) sütunu olmalıdır: {code}", out error);
                if (code == rowNumber) return Fail($"'rowNumberColumn' formül sütunu olamaz: {code}", out error);
                formulaCodes.Add(code);
            }
            // A formula may reference any other number column of the grid except the row number; the graph must be acyclic.
            var graph = new List<(string Code, IReadOnlyList<string> Refs)>();
            foreach (var (code, text) in entries)
            {
                var operands = numberColumns.Where(x => x != code && x != rowNumber).ToHashSet(StringComparer.Ordinal);
                if (!GridFormula.TryParse(text, operands, out var refs, out var reason))
                    return Fail($"'formulas' '{code}' sütunu: {reason}", out error);
                graph.Add((code, refs));
            }
            GridFormula.Order(graph, out var cyclic);
            if (cyclic.Count > 0) return Fail($"'formulas' döngüsel başvuru içeriyor: {string.Join(", ", cyclic)}", out error);
        }

        string? fillQuery = null;
        if (props.TryGetProperty("fillQuery", out var fill))
        {
            if (fill.ValueKind != JsonValueKind.String || !context.IsReadQuery(fill.GetString()))
                return Fail("'fillQuery' sayfadaki bir okuma sorgusu olmalıdır.", out error);
            fillQuery = fill.GetString();
            if (context.QueryById.TryGetValue(fillQuery!, out var query) && query.Operation is { } operationName
                && context.Lookup(operationName, out var operation) && operation.Result.Shape != "list")
                return Fail($"'fillQuery' liste döndüren bir sorgu olmalıdır: {fillQuery}", out error);
        }
        if (props.TryGetProperty("fillColumns", out var fillColumns))
        {
            if (fillQuery is null) return Fail("'fillColumns' yalnız 'fillQuery' ile kullanılabilir.", out error);
            if (!TryReadStringMap(fillColumns, out var entries))
                return Fail($"'fillColumns' 1–{MaxGridColumns} adet \"tabloSütunu\": \"sorguSütunu\" öğesi içeren bir nesne olmalıdır.", out error);
            var resultColumns = OperationColumns(fillQuery, context);
            foreach (var (code, source) in entries)
            {
                // "<lookupCol>@label": the shown label of a filled picker cell (otherwise the raw id is shown).
                if (code.EndsWith("@label", StringComparison.Ordinal))
                {
                    if (!lookups.ContainsKey(code[..^"@label".Length]))
                        return Fail($"'fillColumns' @label yalnız ızgaranın bir seçim (lookup) sütununda kullanılabilir: {code}", out error);
                }
                else if (!columnSet.Contains(code)) return Fail($"'fillColumns' sütunu ızgarada yok: {code}", out error);
                // A computed (calc) column comes from a preview: never a fill target.
                else if (calcColumns.Contains(code)) return Fail($"'fillColumns' hesaplanan (calc) sütunu dolduramaz: {code}", out error);
                if (formulas.Contains(code)) return Fail($"'fillColumns' formül sütununu dolduramaz: {code}", out error);
                if (code == rowNumber) return Fail($"'fillColumns' sıra numarası sütununu dolduramaz: {code}", out error);
                if (!MatchesText(EngineSourceColumn, source)) return Fail($"'fillColumns' '{code}' sütununun sorgu sütunu geçersiz: {source}", out error);
                if (resultColumns is not null && !resultColumns.Contains(source, StringComparer.Ordinal))
                    return Fail($"'fillColumns' '{code}' sütununun '{source}' sütunu '{fillQuery}' sorgusunun sonucunda yok.", out error);
            }
        }
        if (props.TryGetProperty("skipWhenZero", out var skip)
            && (skip.ValueKind != JsonValueKind.String || !numberColumns.Contains(skip.GetString()!)))
            return Fail("'skipWhenZero' ızgaranın sayı (number) sütunu olmalıdır.", out error);
        if (rowNumber is not null && skip.ValueKind == JsonValueKind.String && skip.GetString() == rowNumber)
            return Fail("'rowNumberColumn' ve 'skipWhenZero' aynı sütun olamaz.", out error);
        if (props.TryGetProperty("lockColumnsWhen", out var locks)
            && !ValidateLockColumns(locks, columnSet, calcColumns, rowNumber, skip.ValueKind == JsonValueKind.String ? skip.GetString() : null, out error))
            return false;

        if (props.TryGetProperty("lookupFills", out var lookupFills))
        {
            if (lookupFills.ValueKind != JsonValueKind.Object || lookupFills.EnumerateObject().Count() is < 1 or > MaxGridColumns
                || lookupFills.EnumerateObject().Select(x => x.Name).Distinct(StringComparer.Ordinal).Count() != lookupFills.EnumerateObject().Count())
                return Fail($"'lookupFills' 1–{MaxGridColumns} adet seçim sütunu içeren bir nesne olmalıdır.", out error);
            foreach (var entry in lookupFills.EnumerateObject())
            {
                if (!lookups.TryGetValue(entry.Name, out var lookup))
                    return Fail($"'lookupFills' anahtarı ızgaranın bir seçim (lookup) sütunu olmalıdır: {entry.Name}", out error);
                if (!TryReadStringMap(entry.Value, out var targets))
                    return Fail($"'lookupFills' '{entry.Name}' değeri 1–{MaxGridColumns} adet \"tabloSütunu\": \"seçenekSütunu\" öğesi içeren bir nesne olmalıdır.", out error);
                var optionColumns = OperationColumns(lookup.QueryId, context);
                foreach (var (target, source) in targets)
                {
                    if (!columnSet.Contains(target) || target == entry.Name)
                        return Fail($"'lookupFills' '{entry.Name}' hedefi ızgaranın başka bir sütunu olmalıdır: {target}", out error);
                    if (calcColumns.Contains(target))
                        return Fail($"'lookupFills' '{entry.Name}' hedefi hesaplanan (calc) sütun olamaz: {target}", out error);
                    if (formulas.Contains(target)) return Fail($"'lookupFills' formül sütununu dolduramaz: {target}", out error);
                    if (target == rowNumber) return Fail($"'lookupFills' sıra numarası sütununu dolduramaz: {target}", out error);
                    if (!MatchesText(EngineSourceColumn, source))
                        return Fail($"'lookupFills' '{entry.Name}' seçenek sütunu geçersiz: {source}", out error);
                    if (optionColumns is not null && !optionColumns.Contains(source, StringComparer.Ordinal))
                        return Fail($"'lookupFills' '{entry.Name}' seçim sütununun '{source}' sütunu '{lookup.QueryId}' sorgusunun sonucunda yok.", out error);
                }
            }
        }
        return true;
    }

    /// <summary>
    /// <c>lockColumnsWhen</c>: 1–<see cref="MaxLockRules"/> items "col1,col2=condition" (split on the first "="). The columns are
    /// distinct grid columns that are not computed (calc), the row number or the skipWhenZero column; formula and fill targets may
    /// be locked (the runtime clears them while locked and restores the fill value when the condition stops holding). The condition
    /// only reads the grid row (<c>satir.&lt;column&gt;</c>), never a column of its own rule.
    /// </summary>
    private static bool ValidateLockColumns(JsonElement locks, IReadOnlySet<string> columnSet, IReadOnlySet<string> calcColumns, string? rowNumber,
        string? skipWhenZero, out string? error)
    {
        error = null;
        const string format = "\"sütun1,sütun2=koşul\"";
        if (locks.ValueKind != JsonValueKind.Array || locks.GetArrayLength() is < 1 or > MaxLockRules)
            return Fail($"'lockColumnsWhen' 1–{MaxLockRules} adet {format} öğesi içermelidir.", out error);
        var roots = columnSet.Select(GridColumnRoot).ToHashSet(StringComparer.Ordinal);
        foreach (var item in locks.EnumerateArray())
        {
            var text = item.ValueKind == JsonValueKind.String ? item.GetString()! : "";
            var at = text.IndexOf('=');
            if (at <= 0 || at == text.Length - 1) return Fail($"'lockColumnsWhen' öğeleri {format} biçiminde olmalıdır.", out error);
            var codes = text[..at].Split(',');
            var condition = text[(at + 1)..];
            if (codes.Length > MaxGridColumns || codes.Distinct(StringComparer.Ordinal).Count() != codes.Length)
                return Fail($"'lockColumnsWhen' sütunları 1–{MaxGridColumns} adet farklı sütun kodu olmalıdır: {text[..at]}", out error);
            foreach (var code in codes)
            {
                if (!columnSet.Contains(code)) return Fail($"'lockColumnsWhen' sütunu ızgarada yok: {code}", out error);
                if (calcColumns.Contains(code)) return Fail($"'lockColumnsWhen' hesaplanan (calc) sütunu kilitleyemez: {code}", out error);
                if (code == rowNumber) return Fail($"'lockColumnsWhen' sıra numarası sütununu kilitleyemez: {code}", out error);
                if (code == skipWhenZero) return Fail($"'lockColumnsWhen' 'skipWhenZero' sütununu kilitleyemez: {code}", out error);
            }
            if (!PageConditionExpression.TryParse(condition, out var conditionRoots, out var reason))
                return Fail($"'lockColumnsWhen' koşulu geçersiz: {reason}", out error);
            if (conditionRoots.FirstOrDefault(x => x != LockRowRoot) is { } other)
                return Fail($"'lockColumnsWhen' koşulu yalnız satırın sütunlarına (satir.<sütun>) başvurabilir: {other}", out error);
            // The row paths outside quoted literals: a grid column (or a map column's root), never one the rule locks.
            foreach (Match match in RowPath.Matches(QuotedLiteral.Replace(condition, "''")))
            {
                var path = match.Groups[1].Value[1..];
                var root = path.Split('.')[0];
                if (!columnSet.Contains(path) && !roots.Contains(root))
                    return Fail($"'lockColumnsWhen' koşulu ızgarada olmayan bir sütuna başvuruyor: {path}", out error);
                if (calcColumns.Contains(path)) return Fail($"'lockColumnsWhen' koşulu hesaplanan (calc) sütuna başvuramaz: {path}", out error);
                if (codes.Any(code => code == path || GridColumnRoot(code) == root))
                    return Fail($"'lockColumnsWhen' koşulu kilitlediği sütuna başvuramaz: {path}", out error);
            }
        }
        return true;
    }

    private static string GridColumnRoot(string code) => code.IndexOf('.') is var dot and >= 0 ? code[..dot] : code;

    /// <summary>A JSON object of 1–<see cref="MaxGridColumns"/> distinct keys with string values (1–<see cref="GridFormula.MaxLength"/> characters).</summary>
    private static bool TryReadStringMap(JsonElement value, out List<(string Key, string Value)> entries)
    {
        entries = [];
        if (value.ValueKind != JsonValueKind.Object) return false;
        foreach (var property in value.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.String || property.Value.GetString()!.Length is < 1 or > GridFormula.MaxLength) return false;
            if (entries.Any(x => x.Key == property.Name)) return false;
            entries.Add((property.Name, property.Value.GetString()!));
        }
        return entries.Count is >= 1 and <= MaxGridColumns;
    }
}
