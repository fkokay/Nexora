using System.Text.Json;

/// <summary>
/// Validates declarative page data. Optional CSS/JavaScript is accepted only by the isolated code component and stays
/// sandboxed at runtime. schemaVersion 1 is the original static format; schemaVersion 2 adds named read queries,
/// component names, label/input components and <c>{{PATH}}</c> bindings in a fixed set of text properties.
/// </summary>
internal static class TenantCustomPageSchema
{
    private const int MaxBytesV1 = 64 * 1024;
    private const int MaxBytesV2 = 128 * 1024;
    private const int MaxComponents = 80;
    private const int MaxQueries = 20;
    private const int MaxQueryParameters = 20;
    private static readonly HashSet<string> ComponentTypes = new(StringComparer.Ordinal)
    { "heading", "text", "metric", "card", "section", "divider", "spacer", "button", "dataTable", "form", "code", "alert", "badge", "list", "progress" };
    private static readonly HashSet<string> ComponentTypesV2 = new(ComponentTypes, StringComparer.Ordinal) { "label", "input" };
    private static readonly HashSet<string> RootKeys = new(StringComparer.Ordinal) { "schemaVersion", "components" };
    private static readonly HashSet<string> RootKeysV2 = new(StringComparer.Ordinal) { "schemaVersion", "components", "queries" };
    private static readonly HashSet<string> ComponentKeys = new(StringComparer.Ordinal) { "id", "type", "props", "children" };
    private static readonly HashSet<string> ComponentKeysV2 = new(ComponentKeys, StringComparer.Ordinal) { "name" };
    private static readonly HashSet<string> SafeProps = new(StringComparer.Ordinal)
    { "title", "text", "label", "value", "description", "variant", "size", "icon", "source", "columns", "items", "format", "target", "required", "placeholder", "formCode", "width", "margin", "padding", "backgroundColor", "textColor", "borderRadius", "workflowId", "rowActionsEnabled", "rowActionWorkflowId", "rowActionLabel", "actionType", "css", "javascript" };
    private static readonly HashSet<string> SafePropsV2 = new(SafeProps, StringComparer.Ordinal)
    { "query", "inputType", "defaultValue", "optionsQuery", "optionLabelColumn", "optionValueColumn" };
    /// <summary>v2 properties whose string value may contain <c>{{PATH}}</c> expressions.</summary>
    private static readonly HashSet<string> BindableProps = new(StringComparer.Ordinal) { "text", "title", "description", "label", "value", "placeholder", "defaultValue" };
    private static readonly HashSet<string> InputTypes = new(StringComparer.Ordinal) { "text", "number", "date", "checkbox", "select" };
    private static readonly HashSet<string> QueryKeys = new(StringComparer.Ordinal) { "id", "name", "kind", "sql", "parameters", "runOn" };
    private static readonly HashSet<string> ParameterKeys = new(StringComparer.Ordinal) { "name", "binding", "type" };
    private static readonly HashSet<string> ParameterTypes = new(StringComparer.Ordinal) { "text", "int", "decimal", "date", "bool", "guid" };

    private sealed class Context(int version)
    {
        public bool V2 { get; } = version == 2;
        public HashSet<string> Ids { get; } = new(StringComparer.Ordinal);
        public HashSet<string> Names { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> QueryIds { get; } = new(StringComparer.Ordinal);
    }

    public static bool Validate(string json, out string? error)
    {
        error = null;
        var bytes = System.Text.Encoding.UTF8.GetByteCount(json);
        if (bytes > MaxBytesV2) { error = "Sayfa tanımı izin verilen boyutu aşıyor (sürüm 1: 64 KiB, sürüm 2: 128 KiB)."; return false; }
        try
        {
            using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 8 });
            var root = doc.RootElement;
            var version = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("schemaVersion", out var versionElement)
                && versionElement.ValueKind == JsonValueKind.Number && versionElement.TryGetInt32(out var number) ? number : 0;
            if (version == 1 && bytes > MaxBytesV1) { error = "Sayfa tanımı 64 KiB sınırını aşıyor."; return false; }
            if (version is not (1 or 2) || !OnlyKeys(root, version == 2 ? RootKeysV2 : RootKeys)
                || !root.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array || components.GetArrayLength() > MaxComponents)
            { error = "Tanım schemaVersion 1 veya 2 ve en fazla 80 bileşenli components dizisi içermelidir."; return false; }
            var context = new Context(version);
            var queries = new List<PageQuery>();
            if (context.V2 && root.TryGetProperty("queries", out var queryArray) && !ValidateQueries(queryArray, context, queries, out error)) return false;
            foreach (var component in components.EnumerateArray())
                if (!ValidateComponent(component, context, 0, out error)) return false;
            if (TenantCustomPageQueries.FindCycle(queries) is { } cycle)
            { error = $"Sorgular arasında döngüsel bağımlılık var: {cycle}."; return false; }
            return true;
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or FormatException)
        { error = "Sayfa tanımı geçerli JSON/schema değil."; return false; }
    }

    private static bool ValidateQueries(JsonElement queries, Context context, List<PageQuery> result, out string? error)
    {
        error = null;
        if (queries.ValueKind != JsonValueKind.Array || queries.GetArrayLength() > MaxQueries)
        { error = $"Sayfada en fazla {MaxQueries} sorgu tanımlanabilir."; return false; }
        // Ids are compared ordinally at runtime but must not differ only by casing.
        var queryIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var query in queries.EnumerateArray())
        {
            if (query.ValueKind != JsonValueKind.Object || !OnlyKeys(query, QueryKeys) || QueryKeys.Any(key => !query.TryGetProperty(key, out _)))
            { error = "Her sorgu yalnız id, name, kind, sql, parameters ve runOn alanlarını içermelidir."; return false; }
            var id = StringOf(query, "id");
            if (id is not { Length: >= 1 and <= 64 } || !id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') || !queryIds.Add(id))
            { error = "Sorgu kimlikleri benzersiz, 1–64 karakter ve yalnız harf/rakam/-/_ olmalıdır."; return false; }
            var name = StringOf(query, "name");
            if (!ValidName(name, context, out error)) return false;
            if (StringOf(query, "kind") != "read") { error = $"'{name}' sorgusu: bu sürümde yalnız okuma (read) sorguları desteklenir."; return false; }
            var runOn = StringOf(query, "runOn");
            if (runOn is not ("load" or "manual")) { error = $"'{name}' sorgusu: runOn load veya manual olmalıdır."; return false; }
            var sql = StringOf(query, "sql");
            if (sql is null) { error = $"'{name}' sorgusu: SQL metni gerekli."; return false; }
            if (sql.Contains("{{", StringComparison.Ordinal) || sql.Contains("}}", StringComparison.Ordinal))
            { error = $"'{name}' sorgusu: SQL içinde {{{{ }}}} ifadesi kullanılamaz; değerleri parametreyle bağlayın."; return false; }
            if (!ReportEndpoints.TryValidateReadOnlySql(sql, out var sqlError)) { error = $"'{name}' sorgusu: {sqlError}"; return false; }

            var parametersElement = query.GetProperty("parameters");
            if (parametersElement.ValueKind != JsonValueKind.Array || parametersElement.GetArrayLength() > MaxQueryParameters)
            { error = $"'{name}' sorgusu en fazla {MaxQueryParameters} parametre içerebilir."; return false; }
            var parameters = new List<PageQueryParameter>();
            // SQL Server parameter names are matched case-insensitively.
            var declared = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var parameter in parametersElement.EnumerateArray())
            {
                if (parameter.ValueKind != JsonValueKind.Object || !OnlyKeys(parameter, ParameterKeys) || ParameterKeys.Any(key => !parameter.TryGetProperty(key, out _)))
                { error = $"'{name}' sorgusu: parametreler yalnız name, binding ve type alanlarını içermelidir."; return false; }
                var parameterName = StringOf(parameter, "name");
                if (parameterName is null || !TenantCustomPageQueries.NamePattern().IsMatch(parameterName) || !declared.Add(parameterName))
                { error = $"'{name}' sorgusu: parametre adları benzersiz olmalı, harf veya _ ile başlamalı ve harf/rakam/_ içermelidir."; return false; }
                var type = StringOf(parameter, "type");
                if (type is null || !ParameterTypes.Contains(type))
                { error = $"'{name}' sorgusundaki '{parameterName}' parametresinin türü text, int, decimal, date, bool veya guid olmalıdır."; return false; }
                var binding = StringOf(parameter, "binding");
                if (binding is null || !TenantCustomPageQueries.TryParseBindingPath(binding, out _))
                { error = $"'{name}' sorgusundaki '{parameterName}' parametresinin bağlaması tek bir {{{{yol}}}} ifadesi olmalıdır."; return false; }
                parameters.Add(new PageQueryParameter(parameterName, binding, type));
            }
            var used = TenantCustomPageQueries.SqlParameterNames(sql);
            if (used.FirstOrDefault(x => !declared.Contains(x)) is { } undeclared)
            { error = $"'{name}' sorgusu tanımlanmamış bir parametre kullanıyor: @{undeclared}."; return false; }
            if (declared.FirstOrDefault(x => !used.Contains(x)) is { } unused)
            { error = $"'{name}' sorgusundaki '{unused}' parametresi SQL içinde kullanılmıyor."; return false; }
            context.QueryIds.Add(id);
            result.Add(new PageQuery(id, name!, "read", sql, parameters, runOn));
        }
        return true;
    }

    private static bool ValidName(string? name, Context context, out string? error)
    {
        error = null;
        if (name is null || !TenantCustomPageQueries.NamePattern().IsMatch(name))
        { error = "Sorgu ve bileşen adları harf veya _ ile başlamalı, en fazla 64 harf/rakam/_ içermelidir."; return false; }
        if (TenantCustomPageQueries.ReservedNames.Contains(name)) { error = $"'{name}' ayrılmış bir addır; başka bir ad seçin."; return false; }
        if (!context.Names.Add(name)) { error = $"'{name}' adı sayfada birden fazla kez kullanılıyor (büyük/küçük harf fark etmez)."; return false; }
        return true;
    }

    private static bool ValidateComponent(JsonElement component, Context context, int depth, out string? error)
    {
        error = null;
        if (depth > 4 || component.ValueKind != JsonValueKind.Object || !OnlyKeys(component, context.V2 ? ComponentKeysV2 : ComponentKeys)
            || !component.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String
            || !component.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String)
        { error = "Bileşen biçimi geçersiz veya iç içe geçme sınırı aşıldı."; return false; }
        var idText = id.GetString()!; var typeText = type.GetString()!;
        if (idText.Length is < 1 or > 64 || !idText.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') || !context.Ids.Add(idText))
        { error = "Bileşen kimlikleri benzersiz, kısa ve yalnızca harf/rakam/-/_ içermelidir."; return false; }
        if (!(context.V2 ? ComponentTypesV2 : ComponentTypes).Contains(typeText)) { error = $"İzin verilmeyen bileşen türü: {typeText}."; return false; }
        if (component.TryGetProperty("name", out var nameElement)
            && (nameElement.ValueKind != JsonValueKind.String || !ValidName(nameElement.GetString(), context, out error)))
        { error ??= "Bileşen adı metin olmalıdır."; return false; }
        if (component.TryGetProperty("props", out var props))
        {
            if (props.ValueKind != JsonValueKind.Object || props.EnumerateObject().Count() > 30 || !OnlyKeys(props, context.V2 ? SafePropsV2 : SafeProps))
            { error = "Bileşen özellikleri izin verilen statik alanlarla sınırlıdır."; return false; }
            foreach (var prop in props.EnumerateObject())
            {
                if (prop.Name is "css" or "javascript")
                {
                    var maxCodeLength = prop.Name == "css" ? 4000 : 4000;
                    if (typeText != "code" || prop.Value.ValueKind != JsonValueKind.String || (prop.Value.GetString()?.Length ?? 0) > maxCodeLength
                        || prop.Name == "css" && HasExternalCss(prop.Value.GetString() ?? ""))
                    { error = $"'{prop.Name}' yalnızca yalıtılmış kod bileşeninde, 4 KiB sınırında kullanılabilir."; return false; }
                    continue;
                }
                var bindable = context.V2 && BindableProps.Contains(prop.Name) && prop.Value.ValueKind == JsonValueKind.String;
                if (bindable ? !SafeBindableText(prop.Value.GetString()!) : !SafeValue(prop.Value, 0))
                {
                    error = bindable
                        ? $"'{prop.Name}' özelliği yalnızca sınırlı metin ve geçerli {{{{yol}}}} ifadeleri içerebilir."
                        : $"'{prop.Name}' özelliği yalnızca sınırlı statik metin/sayı/bool/dizi/değer içerebilir.";
                    return false;
                }
            }
            foreach (var key in new[] { "width", "margin", "padding", "borderRadius" })
                if (props.TryGetProperty(key, out var dimension) && (!dimension.TryGetInt32(out var number) || key == "width" && number is < 1 or > 12 || key != "width" && number is < 0 or > 64 || key == "borderRadius" && number > 32))
                { error = $"'{key}' ölçüsü izin verilen aralığın dışında."; return false; }
            foreach (var key in new[] { "backgroundColor", "textColor" })
                if (props.TryGetProperty(key, out var color) && (color.ValueKind != JsonValueKind.String || !IsHexColor(color.GetString())))
                { error = $"'{key}' yalnızca #RRGGBB renk kodu olabilir."; return false; }
            if (props.TryGetProperty("items", out var items) && (typeText != "list" || items.ValueKind != JsonValueKind.Array
                || items.GetArrayLength() > 40 || items.EnumerateArray().Any(item => item.ValueKind != JsonValueKind.String)))
            { error = "Liste bileşeni en fazla 40 metin öğesi içerebilir."; return false; }
            if (props.TryGetProperty("variant", out var variant) && (typeText is "alert" or "badge")
                && (variant.ValueKind != JsonValueKind.String || variant.GetString() is not ("info" or "success" or "warning" or "danger")))
            { error = "Bileşen görünüm türü info, success, warning veya danger olmalıdır."; return false; }
            if (props.TryGetProperty("actionType", out var actionType) && (typeText != "button" || actionType.ValueKind != JsonValueKind.String || actionType.GetString() != "workflow"))
            { error = "Düğme eylem türü yalnızca yayımlanmış iş akışı olabilir."; return false; }
            if (props.TryGetProperty("workflowId", out var workflowId) && (typeText != "button" || workflowId.ValueKind != JsonValueKind.String || !string.IsNullOrEmpty(workflowId.GetString()) && !Guid.TryParse(workflowId.GetString(), out _)))
            { error = "Düğme iş akışı kimliği geçersiz."; return false; }
            if (props.TryGetProperty("rowActionWorkflowId", out var rowActionWorkflowId) && (typeText != "dataTable" || rowActionWorkflowId.ValueKind != JsonValueKind.String || !string.IsNullOrEmpty(rowActionWorkflowId.GetString()) && !Guid.TryParse(rowActionWorkflowId.GetString(), out _)))
            { error = "Satır işlemi iş akışı kimliği geçersiz."; return false; }
            if (props.TryGetProperty("rowActionsEnabled", out var rowActionsEnabled) && (typeText != "dataTable" || rowActionsEnabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False)))
            { error = "Satır işlemleri yalnızca veri listelerinde açılıp kapatılabilir."; return false; }
            if (props.TryGetProperty("rowActionLabel", out var rowActionLabel) && (typeText != "dataTable" || rowActionLabel.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(rowActionLabel.GetString()) || rowActionLabel.GetString()!.Length > 60))
            { error = "Satır işlemi düğme metni 1–60 karakter olmalıdır."; return false; }
            if (context.V2 && !ValidateV2Props(props, typeText, context, out error)) return false;
        }
        if (component.TryGetProperty("children", out var children))
        {
            if (typeText is not ("section" or "card") || children.ValueKind != JsonValueKind.Array || children.GetArrayLength() > MaxComponents)
            { error = "Yalnızca section/card bileşenleri alt bileşen alabilir."; return false; }
            foreach (var child in children.EnumerateArray()) if (!ValidateComponent(child, context, depth + 1, out error)) return false;
        }
        return true;
    }

    private static bool ValidateV2Props(JsonElement props, string typeText, Context context, out string? error)
    {
        error = null;
        if (props.TryGetProperty("query", out var query)
            && (typeText is not ("dataTable" or "metric") || query.ValueKind != JsonValueKind.String || !context.QueryIds.Contains(query.GetString()!)))
        {
            error = typeText is "dataTable" or "metric"
                ? $"Bileşenin sorgusu sayfada tanımlı değil: {(query.ValueKind == JsonValueKind.String ? query.GetString() : "?")}."
                : "'query' özelliği yalnızca veri listesi ve gösterge bileşenlerinde kullanılabilir.";
            return false;
        }
        if (props.TryGetProperty("inputType", out var inputType)
            && (typeText != "input" || inputType.ValueKind != JsonValueKind.String || !InputTypes.Contains(inputType.GetString()!)))
        { error = "Giriş türü yalnızca giriş bileşeninde text, number, date, checkbox veya select olabilir."; return false; }
        if (props.TryGetProperty("optionsQuery", out var optionsQuery)
            && (typeText != "input" || optionsQuery.ValueKind != JsonValueKind.String || !context.QueryIds.Contains(optionsQuery.GetString()!)))
        { error = $"Seçenek sorgusu yalnızca giriş bileşeninde ve sayfada tanımlı bir sorgu olabilir: {(optionsQuery.ValueKind == JsonValueKind.String ? optionsQuery.GetString() : "?")}."; return false; }
        foreach (var key in new[] { "optionLabelColumn", "optionValueColumn" })
            if (props.TryGetProperty(key, out var column)
                && (typeText != "input" || column.ValueKind != JsonValueKind.String || column.GetString()!.Length is < 1 or > 128))
            { error = $"'{key}' yalnızca giriş bileşeninde 1–128 karakterlik sütun adı olabilir."; return false; }
        return true;
    }

    /// <summary>A bindable v2 string: every <c>{{…}}</c> must be a valid path and the remaining text must be safe.</summary>
    private static bool SafeBindableText(string text)
    {
        if (text.Length > 2000) return false;
        var remainder = TenantCustomPageQueries.EmbeddedBinding().Replace(text, " ");
        return !ContainsExecutableText(remainder);
    }

    private static bool SafeValue(JsonElement element, int depth)
    {
        if (depth > 2) return false;
        return element.ValueKind switch
        {
            JsonValueKind.String => (element.GetString()?.Length ?? 0) <= 2000 && !ContainsExecutableText(element.GetString()!),
            JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null => true,
            JsonValueKind.Array => element.GetArrayLength() <= 40 && element.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String && SafeValue(x, depth + 1)),
            _ => false
        };
    }
    private static bool ContainsExecutableText(string text) => text.Contains("<", StringComparison.Ordinal) || text.Contains(">", StringComparison.Ordinal)
        || text.Contains("javascript:", StringComparison.OrdinalIgnoreCase) || text.Contains("data:", StringComparison.OrdinalIgnoreCase)
        || text.Contains("{{", StringComparison.Ordinal) || text.Contains("}}", StringComparison.Ordinal);
    private static bool HasExternalCss(string css) => css.Contains("@import", StringComparison.OrdinalIgnoreCase)
        || css.Contains("url(", StringComparison.OrdinalIgnoreCase) || css.Contains("expression(", StringComparison.OrdinalIgnoreCase);
    private static bool IsHexColor(string? value) => value is { Length: 7 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit);
    private static bool OnlyKeys(JsonElement element, HashSet<string> allowed) => element.EnumerateObject().All(p => allowed.Contains(p.Name));
    private static string? StringOf(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
