using System.Text.Json;
using System.Text.RegularExpressions;

/// <summary>
/// Generic engine props of a <c>list</c> editable grid (runtime: <c>frontend/erp-web/src/custom-page/gridFill.ts</c>):
/// <list type="bullet">
/// <item><c>fillQuery</c> (a read query of the page), <c>fillColumns</c> <c>{ gridCol: queryCol }</c> and <c>skipWhenZero</c> (a number column);</item>
/// <item><c>lookupFills</c> <c>{ lookupCol: { gridCol: optionCol } }</c>;</item>
/// <item><c>formulas</c> <c>{ numberCol: expr }</c> (see <see cref="GridFormula"/>; formulas may reference each other without cycles);</item>
/// <item><c>rowNumberColumn</c>: a number column that gets 1..n on the sent rows (not a formula, fill target or formula operand).</item>
/// </list>
/// The object-valued ones skip the generic prop check (<see cref="GridEngineObjectProps"/>) and are fully checked here.
/// </summary>
internal static partial class TenantCustomPageSchema
{
    private static readonly string[] GridEngineProps = ["fillQuery", "fillColumns", "skipWhenZero", "lookupFills", "formulas", "rowNumberColumn"];
    /// <summary>Object-valued grid props; the generic <c>SafeValue</c> check rejects objects, so they are validated here.</summary>
    private static readonly HashSet<string> GridEngineObjectProps = new(StringComparer.Ordinal) { "fillColumns", "lookupFills", "formulas" };
    private static readonly Regex EngineSourceColumn = new(@"^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[A-Za-z_][A-Za-z0-9_]{0,63})*\z", RegexOptions.CultureInvariant, RegexTimeout);

    /// <summary>Validates the engine props; <paramref name="formulas"/> are the grid's formula column codes.</summary>
    private static bool ValidateGridEngineProps(JsonElement props, string mode, IReadOnlyList<string> columns, IReadOnlySet<string> numberColumns,
        IReadOnlyDictionary<string, GridColumnSpec.Lookup> lookups, Context context, out HashSet<string> formulas, out string? error)
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
        }
        if (props.TryGetProperty("fillColumns", out var fillColumns))
        {
            if (fillQuery is null) return Fail("'fillColumns' yalnız 'fillQuery' ile kullanılabilir.", out error);
            if (!TryReadStringMap(fillColumns, out var entries))
                return Fail($"'fillColumns' 1–{MaxGridColumns} adet \"tabloSütunu\": \"sorguSütunu\" öğesi içeren bir nesne olmalıdır.", out error);
            var resultColumns = OperationColumns(fillQuery, context);
            foreach (var (code, source) in entries)
            {
                if (!columnSet.Contains(code)) return Fail($"'fillColumns' sütunu ızgarada yok: {code}", out error);
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
