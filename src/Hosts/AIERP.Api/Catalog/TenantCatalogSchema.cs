using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AIERP.Api;

internal sealed record CatalogParameter(string Name, string Type);
internal sealed record CatalogColumn(string Code, string Label, string Type, bool Key, bool LongText = false, bool Required = false, int? MaxLength = null);

/// <summary>One data source or action of a tenant catalog bundle; exactly one of <see cref="Sql"/> / <see cref="ErpOperation"/> is set.</summary>
internal sealed record CatalogItem(string Code, string Label, string ItemKind, string QueryKind, string? Sql, string? ErpOperation,
    IReadOnlyList<CatalogParameter> Parameters, IReadOnlyList<CatalogColumn> Columns, string? Opens, string? Target, string? ConfirmText);

/// <summary>A setting a developer component declares; <see cref="Options"/> is set only for <c>choice</c>.</summary>
internal sealed record CatalogComponentSetting(string Name, string Label, string Type, IReadOnlyList<string> Options, JsonElement? Default);

/// <summary>
/// A developer component (yazılımcı bileşeni): code that a page's <c>code</c> component references by <see cref="Code"/>;
/// its CSS and JavaScript are resolved into the page when it is read, never copied into it.
/// </summary>
internal sealed record CatalogComponent(string Code, string Label, string? Description, string Css, string JavaScript, int Height,
    IReadOnlyList<CatalogComponentSetting> Settings);

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
    /// <summary>Developer components (yazılımcı bileşenleri) valid under today's rules; pages reference them by code.</summary>
    public IReadOnlyList<CatalogComponent> Components { get; init; } = [];

    public CatalogItem? Find(string code) => Items.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.Ordinal));

    public CatalogComponent? FindComponent(string code) => Components.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.Ordinal));

    /// <summary><see cref="Find"/>, falling back to an item kept only for its rejected SQL (run endpoint only: it re-validates the SQL).</summary>
    public CatalogItem? FindForRun(string code) =>
        Find(code) ?? RejectedSqlItems.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.Ordinal));
}

/// <summary>
/// Parses and validates a tenant catalog bundle (schemaVersion 1): named declarative data sources (read), actions and developer components
/// (insert/update/delete actions; components carry CSS/JavaScript) that custom pages reference by code. Unknown keys are rejected; nothing is executed here.
/// </summary>
internal static class TenantCatalogSchema
{
    internal const int MaxBundleBytes = 512 * 1024;
    internal const int MaxDataSources = 200;
    internal const int MaxActions = 200;
    internal const int MaxColumns = 64;
    internal const int MaxParameters = 20;

    internal const int MaxComponents = 100;
    internal const int MaxComponentSettings = 10;
    internal const int MaxComponentCss = 4000;
    internal const int MaxComponentJavaScript = 20000;
    internal const int DefaultComponentHeight = 240;
    internal const string ComponentCodeError = "Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.";
    internal const string ComponentScriptError = "Katalog bileşeninin kodu ve JavaScript'i olmalı.";
    internal const string ComponentSettingsLimitError = "Katalog bileşeni en fazla 10 ayar tanımlayabilir.";
    internal static readonly Regex ComponentCodePattern = new(@"^[a-z][a-zA-Z0-9]{0,39}\z", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    internal static readonly Regex SettingNamePattern = new(@"^[a-z][a-zA-Z0-9]{0,31}\z", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    internal static readonly HashSet<string> SettingTypes = new(StringComparer.Ordinal) { "text", "number", "bool", "choice" };
    private static readonly HashSet<string> RootKeys = new(StringComparer.Ordinal) { "schemaVersion", "dataSources", "actions", "components" };
    private static readonly HashSet<string> ComponentKeys = new(StringComparer.Ordinal) { "code", "label", "description", "css", "javascript", "height", "settings" };
    private static readonly HashSet<string> SettingKeys = new(StringComparer.Ordinal) { "name", "label", "type", "options", "default" };
    private static readonly HashSet<string> DataSourceKeys = new(StringComparer.Ordinal) { "code", "label", "source", "parameters", "columns", "opens" };
    private static readonly HashSet<string> ActionKeys = new(StringComparer.Ordinal) { "code", "label", "target", "kind", "run", "parameters", "columns", "opens", "confirm" };
    private static readonly HashSet<string> SqlOrOperationKeys = new(StringComparer.Ordinal) { "sql", "erpOperation" };
    private static readonly HashSet<string> ParameterKeys = new(StringComparer.Ordinal) { "name", "type" };
    private const int MaxColumnTextLength = 4000;
    private static readonly HashSet<string> ColumnKeys = new(StringComparer.Ordinal) { "code", "label", "type", "key", "longText", "required", "maxLength" };
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
            var components = new List<CatalogComponent>();
            if (!ReadComponents(root, codes, components, lenient ? invalid : null, out error)) return false;
            bundle = new CatalogBundle(items) { RejectedSqlItems = invalid.RejectedSql, InvalidCodes = invalid.Codes, Components = components };
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

    /// <summary>
    /// Reads the <c>components</c> list. Codes share <paramref name="codes"/> with data sources and actions. In lenient mode an
    /// invalid component is set aside (its code in <see cref="Invalid.Codes"/>) instead of failing the bundle.
    /// </summary>
    private static bool ReadComponents(JsonElement root, HashSet<string> codes, List<CatalogComponent> components, Invalid? lenient, out string? error)
    {
        error = null;
        if (!root.TryGetProperty("components", out var list)) return true;
        if (list.ValueKind != JsonValueKind.Array) return Fail(out error, "components: dizi olmalıdır.");
        if (list.GetArrayLength() > MaxComponents) return Fail(out error, $"components: en fazla {MaxComponents} öğe olabilir.");
        var index = 0;
        foreach (var element in list.EnumerateArray())
        {
            var place = $"components[{index++}]";
            if (ReadComponent(element, place, codes, out var component, out error))
            {
                components.Add(component!);
                continue;
            }
            if (lenient is null) return false;
            lenient.Codes.Add((element.ValueKind == JsonValueKind.Object ? Text(element, "code") : null) ?? place);
            lenient.Problems.Add(error!);
            error = null;
        }
        return true;
    }

    private static bool ReadComponent(JsonElement element, string place, HashSet<string> codes, out CatalogComponent? component, out string? error)
    {
        component = null;
        if (element.ValueKind != JsonValueKind.Object) return Fail(out error, $"{place}: nesne olmalıdır.");
        var code = Text(element, "code");
        var javaScript = Text(element, "javascript");
        if (code is null || string.IsNullOrWhiteSpace(javaScript)) return Fail(out error, $"{place}: {ComponentScriptError}");
        if (!ComponentCodePattern.IsMatch(code)) return Fail(out error, $"{place}: {ComponentCodeError}");
        place += $" ({code})";
        if (!TenantCustomPageSchema.OnlyKeys(element, ComponentKeys)) return Fail(out error, $"{place}: bilinmeyen ya da izin verilmeyen anahtar var.");
        if (!codes.Add(code)) return Fail(out error, $"{place}: kod başka bir öğede de kullanılmış.");
        var label = Text(element, "label");
        if (string.IsNullOrWhiteSpace(label) || label.Length > 80) return Fail(out error, $"{place}: etiket 1-80 karakter olmalıdır.");

        string? description = null;
        if (element.TryGetProperty("description", out var descriptionElement) && descriptionElement.ValueKind != JsonValueKind.Null)
        {
            description = descriptionElement.ValueKind == JsonValueKind.String ? descriptionElement.GetString() : null;
            if (description is null || description.Length > 200) return Fail(out error, $"{place}: açıklama en fazla 200 karakterlik metin olmalıdır.");
        }

        string? css = "";
        if (element.TryGetProperty("css", out var cssElement))
        {
            css = cssElement.ValueKind == JsonValueKind.String ? cssElement.GetString() : null;
            if (css is null || css.Length > MaxComponentCss || TenantCustomPageSchema.HasExternalCss(css))
                return Fail(out error, $"{place}: css en fazla {MaxComponentCss} karakter olmalı ve harici kaynak (@import, url(), expression()) içermemelidir.");
        }
        if (javaScript.Length > MaxComponentJavaScript) return Fail(out error, $"{place}: javascript en fazla {MaxComponentJavaScript} karakter olabilir.");

        var height = DefaultComponentHeight;
        if (element.TryGetProperty("height", out var heightElement)
            && (heightElement.ValueKind != JsonValueKind.Number || !heightElement.TryGetInt32(out height) || height is < 80 or > 1200))
            return Fail(out error, $"{place}: height 80 ile 1200 arasında tam sayı olmalıdır.");

        var settings = new List<CatalogComponentSetting>();
        if (element.TryGetProperty("settings", out var settingList))
        {
            if (settingList.ValueKind != JsonValueKind.Array) return Fail(out error, $"{place}: ayarlar dizi olmalıdır.");
            if (settingList.GetArrayLength() > MaxComponentSettings) return Fail(out error, $"{place}: {ComponentSettingsLimitError}");
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var setting in settingList.EnumerateArray())
            {
                if (!ReadSetting(setting, out var parsed, out var problem) || !names.Add(parsed!.Name))
                    return Fail(out error, $"{place}: ayar geçersiz ya da yinelenmiş. {problem}".TrimEnd());
                settings.Add(parsed);
            }
        }

        component = new CatalogComponent(code, label, description, css, javaScript, height, settings);
        error = null;
        return true;
    }

    private static bool ReadSetting(JsonElement setting, out CatalogComponentSetting? parsed, out string? problem)
    {
        parsed = null;
        problem = null;
        if (setting.ValueKind != JsonValueKind.Object || !TenantCustomPageSchema.OnlyKeys(setting, SettingKeys)) return false;
        var name = Text(setting, "name");
        var label = Text(setting, "label");
        var type = Text(setting, "type");
        if (name is null || !SettingNamePattern.IsMatch(name)) return Fail(out problem, "Ayar adı küçük harfle başlamalı, en fazla 32 harf/rakam olmalıdır.");
        if (string.IsNullOrWhiteSpace(label) || label.Length > 60) return Fail(out problem, $"'{name}' ayarının etiketi 1-60 karakter olmalıdır.");
        if (type is null || !SettingTypes.Contains(type)) return Fail(out problem, $"'{name}' ayarının türü text, number, bool ya da choice olmalıdır.");

        var options = new List<string>();
        var hasOptions = setting.TryGetProperty("options", out var optionList);
        if (type == "choice")
        {
            if (!hasOptions || optionList.ValueKind != JsonValueKind.Array || optionList.GetArrayLength() is < 1 or > 20)
                return Fail(out problem, $"'{name}' seçim ayarı 1-20 seçenek içermelidir.");
            foreach (var option in optionList.EnumerateArray())
            {
                var text = option.ValueKind == JsonValueKind.String ? option.GetString() : null;
                if (string.IsNullOrWhiteSpace(text) || text.Length > 80 || options.Contains(text, StringComparer.Ordinal))
                    return Fail(out problem, $"'{name}' ayarının seçenekleri 1-80 karakterlik, birbirinden farklı metinler olmalıdır.");
                options.Add(text);
            }
        }
        else if (hasOptions) return Fail(out problem, $"'{name}' ayarında seçenek yalnız choice türünde kullanılabilir.");

        JsonElement? defaultValue = null;
        if (setting.TryGetProperty("default", out var defaultElement))
        {
            if (!SettingValueFits(type, options, defaultElement)) return Fail(out problem, $"'{name}' ayarının varsayılanı türüne uygun değil.");
            defaultValue = defaultElement.Clone();
        }
        parsed = new CatalogComponentSetting(name, label, type, options, defaultValue);
        return true;
    }

    /// <summary>Whether <paramref name="value"/> fits a setting of <paramref name="type"/> (choice: one of <paramref name="options"/>).</summary>
    internal static bool SettingValueFits(string type, IReadOnlyList<string> options, JsonElement value) => type switch
    {
        "text" => value.ValueKind == JsonValueKind.String && value.GetString()!.Length <= MaxSettingTextLength,
        "number" => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number),
        "bool" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
        "choice" => value.ValueKind == JsonValueKind.String && options.Contains(value.GetString()!, StringComparer.Ordinal),
        _ => false,
    };

    internal const int MaxSettingTextLength = 2000;

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
            var longText = false;
            var required = false;
            int? maxLength = null;
            if (isObject)
            {
                if (!TryFlag(column, "longText", out longText) || !TryFlag(column, "required", out required)) return Fail(out error, $"{place}: kolon geçersiz.");
                if (column.TryGetProperty("maxLength", out var maxElement))
                {
                    if (maxElement.ValueKind != JsonValueKind.Number || !maxElement.TryGetInt32(out var parsedLength) || parsedLength is < 1 or > MaxColumnTextLength)
                        return Fail(out error, $"{place}: kolon maxLength 1 ile {MaxColumnTextLength} arasında tam sayı olmalıdır.");
                    maxLength = parsedLength;
                }
                if (type is not null && type != "text" && (longText || maxLength is not null))
                    return Fail(out error, $"{place}: longText ve maxLength yalnız text tipli kolonda kullanılabilir.");
            }
            if (!isObject || !TenantCustomPageSchema.OnlyKeys(column, ColumnKeys) || string.IsNullOrWhiteSpace(code) || code.Length > 64
                || string.IsNullOrWhiteSpace(label) || label.Length > 100 || type is null || !ValueTypes.Contains(type) || !codes.Add(code))
                return Fail(out error, $"{place}: kolon geçersiz ya da yinelenmiş.");
            columns.Add(new CatalogColumn(code, label, type, key, longText, required, maxLength));
        }
        return true;
    }

    private static bool TryFlag(JsonElement element, string property, out bool value)
    {
        value = false;
        if (!element.TryGetProperty(property, out var flag)) return true;
        if (flag.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
        value = flag.GetBoolean();
        return true;
    }

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
