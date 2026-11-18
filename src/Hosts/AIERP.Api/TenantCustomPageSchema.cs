using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Api;

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
    private static readonly HashSet<string> ComponentTypesV2 = new(ComponentTypes, StringComparer.Ordinal) { "label", "input", "formCard", "contextPanel", "filterChips", "facetPanel", "actionBar" };
    private static readonly HashSet<string> RootKeys = new(StringComparer.Ordinal) { "schemaVersion", "components" };
    private static readonly HashSet<string> RootKeysV2 = new(StringComparer.Ordinal) { "schemaVersion", "components", "queries" };
    private static readonly HashSet<string> ComponentKeys = new(StringComparer.Ordinal) { "id", "type", "props", "children" };
    private static readonly HashSet<string> ComponentKeysV2 = new(ComponentKeys, StringComparer.Ordinal) { "name" };
    private static readonly HashSet<string> SafeProps = new(StringComparer.Ordinal)
    { "title", "text", "label", "value", "description", "variant", "size", "icon", "source", "columns", "items", "format", "target", "required", "placeholder", "formCode", "width", "margin", "padding", "backgroundColor", "textColor", "borderRadius", "workflowId", "rowActionsEnabled", "rowActionWorkflowId", "rowActionLabel", "actionType", "css", "javascript" };
    private static readonly HashSet<string> SafePropsV2 = new(SafeProps, StringComparer.Ordinal)
    { "query", "inputType", "defaultValue", "optionsQuery", "optionLabelColumn", "optionValueColumn",
      "queryId", "confirmEnabled", "confirmText", "refreshQueries", "successMessage", "errorMessage",
      "trendQuery", "filterInput", "filterValue", "toneMap", "density", "columnFormats", "totals",
      "inputs", "table", "fields", "relatedQuery", "relatedTitle", "facetCounts",
      "newInputs", "saveQuery", "deleteQuery", "focusInput", "printEnabled", "exportTable", "moreButtons" };
    private static readonly HashSet<string> ActionBarProps = new(StringComparer.Ordinal) { "newInputs", "saveQuery", "deleteQuery", "focusInput", "printEnabled", "exportTable", "moreButtons" };
    private const int MaxMoreButtons = 10;
    private static readonly HashSet<string> MetricIcons = new(StringComparer.Ordinal) { "box", "users", "receipt", "wallet", "chart", "clock", "check", "alert" };
    private const int MaxToneMapItems = 20;
    private const int MaxColumnFormats = 20;
    private const int MaxTotals = 12;
    private const int MaxFilterValueLength = 200;
    private const int MaxLayoutInputs = 12;
    private const int MaxContextFields = 12;
    private const int MaxFacetCounts = 12;
    private const int MaxRelatedTitleLength = 60;
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromMilliseconds(100);
    private static readonly Regex ToneMapItem = new(@"^[^=]{1,60}=(info|success|warning|danger)\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex ColumnFormatItem = new(@"^[^=]{1,128}=(text|code|number|money|date|status)\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex ContextFieldItem = new(@"^[^=]{1,128}=[^=]{1,60}\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex FacetCountItem = new(@"^[^=]{1,64}=[^=]{1,128}\z", RegexOptions.CultureInvariant, RegexTimeout);
    /// <summary>v2 properties whose string value may contain <c>{{PATH}}</c> expressions.</summary>
    private static readonly HashSet<string> BindableProps = new(StringComparer.Ordinal)
    { "text", "title", "description", "label", "value", "placeholder", "defaultValue", "confirmText", "successMessage", "errorMessage" };
    /// <summary>Button query-action messages have tighter limits than other bindable text.</summary>
    private static readonly Dictionary<string, int> MessageLimits = new(StringComparer.Ordinal) { ["confirmText"] = 300, ["successMessage"] = 200, ["errorMessage"] = 200 };
    /// <summary>Props of a button's query action; meaningful only on buttons.</summary>
    private static readonly HashSet<string> ButtonQueryProps = new(StringComparer.Ordinal) { "queryId", "confirmEnabled", "confirmText", "refreshQueries", "successMessage", "errorMessage" };
    private const int MaxRefreshQueries = 10;
    private static readonly HashSet<string> InputTypes = new(StringComparer.Ordinal) { "text", "number", "date", "checkbox", "select" };
    private static readonly HashSet<string> QueryKeys = new(StringComparer.Ordinal) { "id", "name", "kind", "sql", "parameters", "runOn" };
    /// <summary>Keys of a query bound to a named ERP operation: <see cref="QueryKeys"/> with operation instead of sql.</summary>
    private static readonly HashSet<string> OperationQueryKeys = new(StringComparer.Ordinal) { "id", "name", "kind", "operation", "parameters", "runOn" };
    /// <summary>ERP operations map request records with many scalar fields (stock card update has ~33); SQL queries keep 20.</summary>
    private const int MaxOperationQueryParameters = 60;

    internal static string UnknownOperationError(string name) => $"ERP işlemi bulunamadı: {name}";
    internal static string DeprecatedOperationError(string name) => $"ERP işlemi artık kullanılamıyor: {name}";
    private static readonly HashSet<string> ParameterKeys = new(StringComparer.Ordinal) { "name", "binding", "type" };
    private static readonly HashSet<string> ParameterTypes = new(StringComparer.Ordinal) { "text", "int", "decimal", "date", "bool", "guid" };

    private sealed class Context(int version)
    {
        public bool V2 { get; } = version == 2;
        public ErpOperationLookup Lookup { get; init; } = ErpOperationCatalog.TryGet;
        /// <summary>Operation names the page already used before this save; deprecated ones stay accepted.</summary>
        public IReadOnlySet<string> ExistingOperations { get; init; } = new HashSet<string>();
        public HashSet<string> Ids { get; } = new(StringComparer.Ordinal);
        public HashSet<string> Names { get; } = new(StringComparer.OrdinalIgnoreCase);
        /// <summary>Query id to kind (read, insert, update or delete).</summary>
        public Dictionary<string, string> QueryKinds { get; } = new(StringComparer.Ordinal);
        /// <summary>Ids of v2 <c>input</c> components anywhere on the page (an input may be declared after the metric that filters by it).</summary>
        public HashSet<string> InputIds { get; } = new(StringComparer.Ordinal);
        /// <summary>filterInput values seen on metrics; resolved against <see cref="InputIds"/> once every component was visited.</summary>
        public List<string> PendingFilterInputs { get; } = [];
        /// <summary>Component id to type, for every component at any depth.</summary>
        public Dictionary<string, string> ComponentTypesById { get; } = new(StringComparer.Ordinal);
        /// <summary>Ids of named dataTable components bound to a query (valid contextPanel tables).</summary>
        public HashSet<string> NamedQueryTables { get; } = new(StringComparer.Ordinal);
        /// <summary>Ids of select inputs that have an optionsQuery (valid facetPanel inputs).</summary>
        public HashSet<string> SelectInputsWithOptions { get; } = new(StringComparer.Ordinal);
        /// <summary>Layout components' input id lists; resolved once every component was visited.</summary>
        public List<(string OwnerId, string OwnerType, List<string> InputIds)> PendingInputLists { get; } = [];
        /// <summary>contextPanel table references.</summary>
        public List<(string OwnerId, string TableId)> PendingTables { get; } = [];
        /// <summary>Ids of dataTable components bound to a query, named or not (valid actionBar export tables).</summary>
        public HashSet<string> QueryTables { get; } = new(StringComparer.Ordinal);
        public int ActionBarCount { get; set; }
        /// <summary>actionBar references (property, component id) resolved after every component was visited.</summary>
        public List<(string Property, string ComponentId, string ExpectedType)> PendingActionRefs { get; } = [];
        public bool IsReadQuery(string? id) => id is not null && QueryKinds.TryGetValue(id, out var kind) && kind == "read";
    }

    public static bool Validate(string json, out string? error) => Validate(json, out error, null, ErpOperationCatalog.TryGet);

    /// <summary>
    /// <paramref name="existingOperations"/> are the ERP operation names the page's current saved or published definition
    /// already uses: a deprecated operation is rejected only for new use, so a page that already has it stays editable.
    /// </summary>
    internal static bool Validate(string json, out string? error, IReadOnlySet<string>? existingOperations) =>
        Validate(json, out error, existingOperations, ErpOperationCatalog.TryGet);

    /// <summary>Test seam: <paramref name="lookup"/> replaces the production catalog.</summary>
    internal static bool Validate(string json, out string? error, IReadOnlySet<string>? existingOperations, ErpOperationLookup lookup)
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
            var context = new Context(version) { Lookup = lookup, ExistingOperations = existingOperations ?? new HashSet<string>() };
            var queries = new List<PageQuery>();
            if (context.V2 && root.TryGetProperty("queries", out var queryArray) && !ValidateQueries(queryArray, context, queries, out error)) return false;
            foreach (var component in components.EnumerateArray())
                if (!ValidateComponent(component, context, 0, out error)) return false;
            if (context.PendingFilterInputs.FirstOrDefault(x => !context.InputIds.Contains(x)) is { } missingInput)
            { error = $"Göstergenin süzeceği giriş bileşeni sayfada yok: {missingInput}."; return false; }
            if (!ResolveLayoutReferences(context, out error)) return false;
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
        var pendingSources = new List<(string Name, string Operation, string Source)>();
        foreach (var query in queries.EnumerateArray())
        {
            if (query.ValueKind != JsonValueKind.Object)
            { error = "Her sorgu yalnız id, name, kind, sql, parameters ve runOn alanlarını içermelidir."; return false; }
            var isOperation = query.TryGetProperty("operation", out _);
            if (isOperation && query.TryGetProperty("sql", out _))
            { error = "Bir sorgu ya sql ya da operation alanını içerebilir; ikisi birlikte kullanılamaz."; return false; }
            var keys = isOperation ? OperationQueryKeys : QueryKeys;
            if (!OnlyKeys(query, keys) || keys.Any(key => !query.TryGetProperty(key, out _)))
            {
                error = isOperation ? "ERP işlemi sorgusu yalnız id, name, kind, operation, parameters ve runOn alanlarını içermelidir."
                    : "Her sorgu yalnız id, name, kind, sql, parameters ve runOn alanlarını içermelidir.";
                return false;
            }
            var id = StringOf(query, "id");
            if (id is not { Length: >= 1 and <= 64 } || !id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') || !queryIds.Add(id))
            { error = "Sorgu kimlikleri benzersiz, 1–64 karakter ve yalnız harf/rakam/-/_ olmalıdır."; return false; }
            var name = StringOf(query, "name");
            if (!ValidName(name, context, out error)) return false;
            var kind = StringOf(query, "kind");
            if (kind is not ("read" or "insert" or "update" or "delete"))
            { error = $"'{name}' sorgusu: tür read, insert, update veya delete olmalıdır."; return false; }
            var runOn = StringOf(query, "runOn");
            if (runOn is not ("load" or "manual")) { error = $"'{name}' sorgusu: runOn load veya manual olmalıdır."; return false; }
            if (kind != "read" && runOn != "manual")
            { error = $"'{name}' sorgusu veri değiştirdiği için yalnız elle (manual) çalıştırılabilir."; return false; }
            if (isOperation)
            {
                if (!ValidateOperationQuery(query, id, name!, kind, context, result, pendingSources, out error)) return false;
                continue;
            }
            var sql = StringOf(query, "sql");
            if (sql is null) { error = $"'{name}' sorgusu: SQL metni gerekli."; return false; }
            if (sql.Contains("{{", StringComparison.Ordinal) || sql.Contains("}}", StringComparison.Ordinal))
            { error = $"'{name}' sorgusu: SQL içinde {{{{ }}}} ifadesi kullanılamaz; değerleri parametreyle bağlayın."; return false; }
            string? sqlError;
            if (kind == "read" ? !ReportEndpoints.TryValidateReadOnlySql(sql, out sqlError) : !ReportEndpoints.TryValidateWriteSql(sql, kind, out sqlError))
            { error = $"'{name}' sorgusu: {sqlError}"; return false; }

            if (!ReadParameters(query, name!, MaxQueryParameters, out var parameters, out var declared, out error)) return false;
            var used = TenantCustomPageQueries.SqlParameterNames(sql);
            if (used.FirstOrDefault(x => !declared.Contains(x)) is { } undeclared)
            { error = $"'{name}' sorgusu tanımlanmamış bir parametre kullanıyor: @{undeclared}."; return false; }
            if (declared.FirstOrDefault(x => !used.Contains(x)) is { } unused)
            { error = $"'{name}' sorgusundaki '{unused}' parametresi SQL içinde kullanılmıyor."; return false; }
            context.QueryKinds.Add(id, kind);
            result.Add(new PageQuery(id, name!, kind, sql, parameters, runOn));
        }
        // An update that starts from a source record needs that read on the same page.
        foreach (var (name, operation, source) in pendingSources)
            if (!result.Any(x => string.Equals(x.Operation, source, StringComparison.Ordinal)))
            { error = $"'{name}' sorgusu: '{operation}' işlemi için sayfada '{source}' okuma sorgusu olmalıdır."; return false; }
        return true;
    }

    /// <summary>Reads and checks a query's parameter list (names unique case-insensitively, known types, single-path bindings).</summary>
    private static bool ReadParameters(JsonElement query, string name, int maxParameters, out List<PageQueryParameter> parameters,
        out HashSet<string> declared, out string? error)
    {
        error = null;
        parameters = [];
        // SQL Server parameter names are matched case-insensitively.
        declared = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var parametersElement = query.GetProperty("parameters");
        if (parametersElement.ValueKind != JsonValueKind.Array || parametersElement.GetArrayLength() > maxParameters)
        { error = $"'{name}' sorgusu en fazla {maxParameters} parametre içerebilir."; return false; }
        foreach (var parameter in parametersElement.EnumerateArray())
        {
            if (parameter.ValueKind != JsonValueKind.Object || !OnlyKeys(parameter, ParameterKeys) || ParameterKeys.Any(key => !parameter.TryGetProperty(key, out _)))
            { error = $"'{name}' sorgusu: parametreler yalnız name, binding ve type alanlarını içermelidir."; return false; }
            var parameterName = StringOf(parameter, "name");
            if (parameterName is not null && TenantCustomPageQueries.ObjectKeyNames.Contains(parameterName))
            { error = $"'{name}' sorgusu: '{parameterName}' ayrılmış bir addır; başka bir parametre adı seçin."; return false; }
            if (!TenantCustomPageQueries.IsValidName(parameterName) || !declared.Add(parameterName!))
            { error = $"'{name}' sorgusu: parametre adları benzersiz olmalı, harf veya _ ile başlamalı ve harf/rakam/_ içermelidir."; return false; }
            var type = StringOf(parameter, "type");
            if (type is null || !ParameterTypes.Contains(type))
            { error = $"'{name}' sorgusundaki '{parameterName}' parametresinin türü text, int, decimal, date, bool veya guid olmalıdır."; return false; }
            var binding = StringOf(parameter, "binding");
            if (binding is null || !TenantCustomPageQueries.TryParseBindingPath(binding, out _))
            { error = $"'{name}' sorgusundaki '{parameterName}' parametresinin bağlaması tek bir {{{{yol}}}} ifadesi olmalıdır."; return false; }
            parameters.Add(new PageQueryParameter(parameterName, binding, type));
        }
        return true;
    }

    /// <summary>
    /// A query bound to a named ERP operation: the operation must exist and not be deprecated, the kind must equal its
    /// page kind, every parameter must be one of the operation's with the same type, and every required route/body
    /// parameter must be bound (route parameters of an operation with a source read come from that read's record).
    /// </summary>
    private static bool ValidateOperationQuery(JsonElement query, string id, string name, string kind, Context context,
        List<PageQuery> result, List<(string Name, string Operation, string Source)> pendingSources, out string? error)
    {
        var operationName = StringOf(query, "operation");
        if (operationName is null || !context.Lookup(operationName, out var operation))
        { error = UnknownOperationError(operationName ?? ""); return false; }
        if (operation.Deprecated && !context.ExistingOperations.Contains(operationName))
        { error = DeprecatedOperationError(operationName); return false; }
        if (kind != operation.PageKind)
        { error = $"'{name}' sorgusu: '{operationName}' işlemi için tür {operation.PageKind} olmalıdır."; return false; }
        if (!ReadParameters(query, name, MaxOperationQueryParameters, out var parameters, out _, out error)) return false;
        foreach (var parameter in parameters)
        {
            var declared = operation.Parameters.FirstOrDefault(x => string.Equals(x.Name, parameter.Name, StringComparison.Ordinal));
            if (declared is null)
            { error = $"'{name}' sorgusu: '{parameter.Name}' parametresi '{operationName}' işleminde tanımlı değil."; return false; }
            if (declared.Type != parameter.Type)
            { error = $"'{name}' sorgusundaki '{parameter.Name}' parametresinin türü {declared.Type} olmalıdır."; return false; }
        }
        var missing = operation.Parameters.FirstOrDefault(x => x.Required
            && (x.In == "body" || (x.In == "route" && operation.SourceOperation is null))
            && !parameters.Any(p => string.Equals(p.Name, x.Name, StringComparison.Ordinal)));
        if (missing is not null)
        { error = $"'{name}' sorgusu: '{operationName}' işleminin '{missing.Name}' parametresi bağlanmalıdır."; return false; }
        if (operation.SourceOperation is { } source) pendingSources.Add((name, operationName, source));
        context.QueryKinds.Add(id, kind);
        result.Add(new PageQuery(id, name, kind, "", parameters, StringOf(query, "runOn")!, operationName));
        error = null;
        return true;
    }

    private static bool ValidName(string? name, Context context, out string? error)
    {
        error = null;
        if (name is not null && TenantCustomPageQueries.ObjectKeyNames.Contains(name)) { error = $"'{name}' ayrılmış bir addır; başka bir ad seçin."; return false; }
        if (!TenantCustomPageQueries.IsValidName(name))
        { error = "Sorgu ve bileşen adları harf veya _ ile başlamalı, en fazla 64 harf/rakam/_ içermelidir."; return false; }
        if (TenantCustomPageQueries.ReservedNames.Contains(name!)) { error = $"'{name}' ayrılmış bir addır; başka bir ad seçin."; return false; }
        if (!context.Names.Add(name!)) { error = $"'{name}' adı sayfada birden fazla kez kullanılıyor (büyük/küçük harf fark etmez)."; return false; }
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
        context.ComponentTypesById[idText] = typeText;
        if (typeText == "actionBar" && ++context.ActionBarCount > 1)
        { error = "Sayfada en fazla bir İşlem Çubuğu (actionBar) bulunabilir."; return false; }
        if (typeText == "input") context.InputIds.Add(idText);
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
                if (MessageLimits.TryGetValue(prop.Name, out var messageLimit)
                    && (prop.Value.ValueKind != JsonValueKind.String || prop.Value.GetString()!.Length > messageLimit))
                { error = $"'{prop.Name}' en fazla {messageLimit} karakterlik metin olmalıdır."; return false; }
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
            if (props.TryGetProperty("variant", out var variant) && (typeText is "alert" or "badge" || context.V2 && typeText == "metric")
                && (variant.ValueKind != JsonValueKind.String || variant.GetString() is not ("info" or "success" or "warning" or "danger")))
            { error = "Bileşen görünüm türü info, success, warning veya danger olmalıdır."; return false; }
            if (props.TryGetProperty("actionType", out var actionType) && (typeText != "button" || actionType.ValueKind != JsonValueKind.String
                || actionType.GetString() is not ("workflow" or "query") || actionType.GetString() == "query" && !context.V2))
            {
                error = context.V2 ? "Düğme eylem türü iş akışı (workflow) veya sorgu (query) olabilir." : "Düğme eylem türü yalnızca yayımlanmış iş akışı olabilir.";
                return false;
            }
            if (props.TryGetProperty("workflowId", out var workflowId) && (typeText != "button" || workflowId.ValueKind != JsonValueKind.String || !string.IsNullOrEmpty(workflowId.GetString()) && !Guid.TryParse(workflowId.GetString(), out _)))
            { error = "Düğme iş akışı kimliği geçersiz."; return false; }
            if (props.TryGetProperty("rowActionWorkflowId", out var rowActionWorkflowId) && (typeText != "dataTable" || rowActionWorkflowId.ValueKind != JsonValueKind.String || !string.IsNullOrEmpty(rowActionWorkflowId.GetString()) && !Guid.TryParse(rowActionWorkflowId.GetString(), out _)))
            { error = "Satır işlemi iş akışı kimliği geçersiz."; return false; }
            if (props.TryGetProperty("rowActionsEnabled", out var rowActionsEnabled) && (typeText != "dataTable" || rowActionsEnabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False)))
            { error = "Satır işlemleri yalnızca veri listelerinde açılıp kapatılabilir."; return false; }
            if (props.TryGetProperty("rowActionLabel", out var rowActionLabel) && (typeText != "dataTable" || rowActionLabel.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(rowActionLabel.GetString()) || rowActionLabel.GetString()!.Length > 60))
            { error = "Satır işlemi düğme metni 1–60 karakter olmalıdır."; return false; }
            if (context.V2 && !ValidateV2Props(props, typeText, context, out error)) return false;
            if (context.V2 && !ValidateLayoutProps(props, idText, typeText, context, out error)) return false;
            if (typeText == "input" && props.TryGetProperty("inputType", out var selectType) && selectType.ValueKind == JsonValueKind.String && selectType.GetString() == "select"
                && props.TryGetProperty("optionsQuery", out var selectOptions) && selectOptions.ValueKind == JsonValueKind.String)
                context.SelectInputsWithOptions.Add(idText);
            if (context.V2 && !ValidateActionBarProps(props, typeText, context, out error)) return false;
            if (typeText == "dataTable" && props.TryGetProperty("query", out var anyTableQuery) && anyTableQuery.ValueKind == JsonValueKind.String)
                context.QueryTables.Add(idText);
            if (typeText == "dataTable" && component.TryGetProperty("name", out _) && props.TryGetProperty("query", out var tableQuery) && tableQuery.ValueKind == JsonValueKind.String)
                context.NamedQueryTables.Add(idText);
        }
        else if (context.V2 && typeText is "formCard" or "contextPanel" or "filterChips" or "facetPanel")
        { error = $"'{typeText}' bileşeni için props gerekli."; return false; }
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
            && (typeText is not ("dataTable" or "metric") || query.ValueKind != JsonValueKind.String || !context.IsReadQuery(query.GetString())))
        {
            error = typeText is "dataTable" or "metric"
                ? $"Bileşenin sorgusu sayfada tanımlı bir okuma sorgusu değil: {(query.ValueKind == JsonValueKind.String ? query.GetString() : "?")}."
                : "'query' özelliği yalnızca veri listesi ve gösterge bileşenlerinde kullanılabilir.";
            return false;
        }
        if (props.TryGetProperty("inputType", out var inputType)
            && (typeText != "input" || inputType.ValueKind != JsonValueKind.String || !InputTypes.Contains(inputType.GetString()!)))
        { error = "Giriş türü yalnızca giriş bileşeninde text, number, date, checkbox veya select olabilir."; return false; }
        if (props.TryGetProperty("optionsQuery", out var optionsQuery)
            && (typeText != "input" || optionsQuery.ValueKind != JsonValueKind.String || !context.IsReadQuery(optionsQuery.GetString())))
        { error = $"Seçenek sorgusu yalnızca giriş bileşeninde ve sayfada tanımlı bir okuma sorgusu olabilir: {(optionsQuery.ValueKind == JsonValueKind.String ? optionsQuery.GetString() : "?")}."; return false; }
        foreach (var key in new[] { "optionLabelColumn", "optionValueColumn" })
            if (props.TryGetProperty(key, out var column)
                && (typeText != "input" || column.ValueKind != JsonValueKind.String || column.GetString()!.Length is < 1 or > 128))
            { error = $"'{key}' yalnızca giriş bileşeninde 1–128 karakterlik sütun adı olabilir."; return false; }
        return ValidateDesignLanguageProps(props, typeText, context, out error) && ValidateButtonQueryAction(props, typeText, context, out error);
    }

    /// <summary>Metric, badge and dataTable presentation props (design language step 2a).</summary>
    private static bool ValidateDesignLanguageProps(JsonElement props, string typeText, Context context, out string? error)
    {
        error = null;
        if (props.TryGetProperty("icon", out var icon) && typeText == "metric"
            && (icon.ValueKind != JsonValueKind.String || !MetricIcons.Contains(icon.GetString()!)))
        { error = "Gösterge 'icon' değeri box, users, receipt, wallet, chart, clock, check veya alert olmalıdır."; return false; }
        if (props.TryGetProperty("trendQuery", out var trendQuery)
            && (typeText != "metric" || trendQuery.ValueKind != JsonValueKind.String || !context.IsReadQuery(trendQuery.GetString())))
        {
            error = typeText == "metric"
                ? $"Göstergenin 'trendQuery' değeri sayfada tanımlı bir okuma sorgusu olmalıdır: {(trendQuery.ValueKind == JsonValueKind.String ? trendQuery.GetString() : "?")}."
                : "'trendQuery' özelliği yalnızca gösterge bileşeninde kullanılabilir.";
            return false;
        }
        var hasFilterInput = false;
        if (props.TryGetProperty("filterInput", out var filterInput))
        {
            if (typeText != "metric" || filterInput.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(filterInput.GetString()))
            { error = "'filterInput' özelliği yalnızca gösterge bileşeninde ve bir giriş bileşeni kimliğiyle kullanılabilir."; return false; }
            context.PendingFilterInputs.Add(filterInput.GetString()!);
            hasFilterInput = true;
        }
        if (props.TryGetProperty("filterValue", out var filterValue))
        {
            if (typeText != "metric" || filterValue.ValueKind != JsonValueKind.String || filterValue.GetString()!.Length > MaxFilterValueLength)
            { error = $"'filterValue' yalnızca gösterge bileşeninde ve en fazla {MaxFilterValueLength} karakterlik metin olabilir."; return false; }
            if (!hasFilterInput) { error = "'filterValue' için göstergede 'filterInput' (giriş bileşeni) da tanımlı olmalıdır."; return false; }
        }
        if (props.TryGetProperty("toneMap", out var toneMap)
            && !ValidateMapItems("toneMap", toneMap, typeText is "badge" or "dataTable", MaxToneMapItems, ToneMapItem,
                "Ad=info|success|warning|danger", out error)) return false;
        if (props.TryGetProperty("columnFormats", out var columnFormats)
            && !ValidateMapItems("columnFormats", columnFormats, typeText == "dataTable", MaxColumnFormats, ColumnFormatItem,
                "Sütun=text|code|number|money|date|status", out error)) return false;
        if (props.TryGetProperty("density", out var density)
            && (typeText != "dataTable" || density.ValueKind != JsonValueKind.String || density.GetString() is not ("dense" or "comfort")))
        { error = "'density' yalnızca veri listesinde dense veya comfort olabilir."; return false; }
        if (props.TryGetProperty("totals", out var totals))
        {
            if (typeText != "dataTable" || totals.ValueKind != JsonValueKind.Array || totals.GetArrayLength() > MaxTotals
                || totals.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String || x.GetString()!.Length is < 1 or > 128))
            { error = $"'totals' yalnızca veri listesinde en fazla {MaxTotals} adet 1–128 karakterlik sütun adı içerebilir."; return false; }
            if (!props.TryGetProperty("query", out var tableQuery) || tableQuery.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(tableQuery.GetString()))
            { error = "'totals' yalnızca sorguya bağlı (query) veri listesinde kullanılabilir."; return false; }
        }
        return true;
    }

    private static bool AllowedOn(string prop, string typeText) => prop switch
    {
        "inputs" => typeText is "formCard" or "filterChips" or "facetPanel",
        "columns" => true,
        "table" or "fields" or "relatedQuery" or "relatedTitle" => typeText == "contextPanel",
        "facetCounts" => typeText == "facetPanel",
        _ => true
    };

    /// <summary>formCard, contextPanel, filterChips and facetPanel props (design language step 2b); references resolve after the loop.</summary>
    private static bool ValidateLayoutProps(JsonElement props, string id, string typeText, Context context, out string? error)
    {
        error = null;
        foreach (var key in new[] { "inputs", "table", "fields", "relatedQuery", "relatedTitle", "facetCounts" })
            if (props.TryGetProperty(key, out _) && !AllowedOn(key, typeText))
            { error = $"'{key}' özelliği bu bileşen türünde kullanılamaz."; return false; }
        if (props.TryGetProperty("columns", out var columns) && typeText == "formCard"
            && (columns.ValueKind != JsonValueKind.Number || !columns.TryGetInt32(out var columnCount) || columnCount is < 1 or > 3))
        { error = "Form kartının 'columns' değeri 1, 2 veya 3 olmalıdır."; return false; }
        List<string>? inputIds = null;
        if (typeText is "formCard" or "filterChips" or "facetPanel")
        {
            if (!props.TryGetProperty("inputs", out var inputs) || inputs.ValueKind != JsonValueKind.Array
                || inputs.GetArrayLength() is < 1 or > MaxLayoutInputs
                || inputs.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(x.GetString())))
            { error = $"'inputs' 1–{MaxLayoutInputs} adet giriş bileşeni kimliği içeren bir dizi olmalıdır."; return false; }
            inputIds = inputs.EnumerateArray().Select(x => x.GetString()!).ToList();
            context.PendingInputLists.Add((id, typeText, inputIds));
        }
        if (typeText == "facetPanel" && props.TryGetProperty("facetCounts", out var facetCounts))
        {
            if (!ValidateMapItems("facetCounts", facetCounts, true, MaxFacetCounts, FacetCountItem, "girişKimliği=sayıSütunu", out error)) return false;
            if (facetCounts.EnumerateArray().Any(x => !inputIds!.Contains(x.GetString()!.Split('=')[0])))
            { error = "'facetCounts' öğelerindeki giriş kimliği panelin 'inputs' listesinde olmalıdır."; return false; }
        }
        if (typeText == "contextPanel")
        {
            if (!props.TryGetProperty("table", out var table) || table.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(table.GetString()))
            { error = "Bağlam panelinin 'table' değeri sayfadaki bir veri listesi kimliği olmalıdır."; return false; }
            context.PendingTables.Add((id, table.GetString()!));
            if (!props.TryGetProperty("fields", out var fields) || fields.ValueKind != JsonValueKind.Array || fields.GetArrayLength() < 1)
            { error = $"'fields' 1–{MaxContextFields} adet sütun=Etiket öğesi içermelidir."; return false; }
            if (!ValidateMapItems("fields", fields, true, MaxContextFields, ContextFieldItem, "sütun=Etiket", out error)) return false;
            if (props.TryGetProperty("relatedQuery", out var relatedQuery)
                && (relatedQuery.ValueKind != JsonValueKind.String || !context.IsReadQuery(relatedQuery.GetString())))
            { error = $"'relatedQuery' sayfada tanımlı bir okuma sorgusu olmalıdır: {(relatedQuery.ValueKind == JsonValueKind.String ? relatedQuery.GetString() : "?")}."; return false; }
            if (props.TryGetProperty("relatedTitle", out var relatedTitle)
                && (relatedTitle.ValueKind != JsonValueKind.String || relatedTitle.GetString()!.Length > MaxRelatedTitleLength))
            { error = $"'relatedTitle' en fazla {MaxRelatedTitleLength} karakterlik metin olmalıdır."; return false; }
        }
        return true;
    }

    /// <summary>actionBar props (design language step 2c); id references resolve after the loop.</summary>
    private static bool ValidateActionBarProps(JsonElement props, string typeText, Context context, out string? error)
    {
        error = null;
        if (typeText != "actionBar")
        {
            foreach (var key in ActionBarProps)
                if (props.TryGetProperty(key, out _))
                { error = $"'{key}' özelliği yalnızca İşlem Çubuğu (actionBar) bileşeninde kullanılabilir."; return false; }
            return true;
        }
        foreach (var (key, expected) in new[] { ("newInputs", "input"), ("moreButtons", "button") })
        {
            if (!props.TryGetProperty(key, out var list)) continue;
            var max = key == "newInputs" ? MaxLayoutInputs : MaxMoreButtons;
            if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() is < 1 || list.GetArrayLength() > max
                || list.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(x.GetString())))
            { error = $"'{key}' 1–{max} adet bileşen kimliği içeren bir dizi olmalıdır."; return false; }
            var ids = list.EnumerateArray().Select(x => x.GetString()!).ToList();
            if (ids.Distinct(StringComparer.Ordinal).Count() != ids.Count)
            { error = $"'{key}' listesinde aynı kimlik birden fazla kez bulunamaz."; return false; }
            foreach (var id in ids) context.PendingActionRefs.Add((key, id, expected));
        }
        if (props.TryGetProperty("focusInput", out var focus))
        {
            if (focus.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(focus.GetString()))
            { error = "'focusInput' bir giriş bileşeni kimliği olmalıdır."; return false; }
            context.PendingActionRefs.Add(("focusInput", focus.GetString()!, "input"));
        }
        if (props.TryGetProperty("exportTable", out var export))
        {
            if (export.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(export.GetString()))
            { error = "'exportTable' sorguya bağlı bir veri listesi kimliği olmalıdır."; return false; }
            context.PendingActionRefs.Add(("exportTable", export.GetString()!, "queryTable"));
        }
        if (props.TryGetProperty("printEnabled", out var print) && print.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        { error = "'printEnabled' true veya false olmalıdır."; return false; }
        foreach (var (key, kinds) in new[] { ("saveQuery", "insert veya update"), ("deleteQuery", "delete") })
        {
            if (!props.TryGetProperty(key, out var q)) continue;
            var queryId = q.ValueKind == JsonValueKind.String ? q.GetString() : null;
            if (string.IsNullOrEmpty(queryId) || !context.QueryKinds.TryGetValue(queryId, out var kind))
            { error = $"'{key}' sorgusu sayfada yok: {queryId ?? "?"}."; return false; }
            if (key == "saveQuery" ? kind is not ("insert" or "update") : kind != "delete")
            { error = $"'{key}' {kinds} türünde bir sorgu olmalıdır: {queryId}."; return false; }
        }
        return true;
    }

    private static bool ResolveActionBarReferences(Context context, out string? error)
    {
        error = null;
        foreach (var (property, id, expected) in context.PendingActionRefs)
        {
            if (!context.ComponentTypesById.TryGetValue(id, out var type))
            { error = $"İşlem Çubuğu '{property}' özelliğindeki bileşen sayfada yok: {id}."; return false; }
            if (expected == "input" && type != "input")
            { error = $"İşlem Çubuğu '{property}' özelliğindeki '{id}' bir giriş bileşeni değil."; return false; }
            if (expected == "button" && type != "button")
            { error = $"İşlem Çubuğu '{property}' özelliğindeki '{id}' bir düğme bileşeni değil."; return false; }
            if (expected == "queryTable" && !context.QueryTables.Contains(id))
            { error = $"İşlem Çubuğu 'exportTable' özelliği sorguya bağlı bir veri listesi olmalıdır: {id}."; return false; }
        }
        return true;
    }

    private static bool ResolveLayoutReferences(Context context, out string? error)
    {
        error = null;
        if (!ResolveActionBarReferences(context, out error)) return false;
        var owners = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (ownerId, ownerType, inputIds) in context.PendingInputLists)
            foreach (var inputId in inputIds)
            {
                if (!context.ComponentTypesById.TryGetValue(inputId, out var type))
                { error = $"'{ownerId}' bileşeninin 'inputs' listesindeki giriş sayfada yok: {inputId}."; return false; }
                if (type != "input")
                { error = $"'{ownerId}' bileşeninin 'inputs' listesindeki '{inputId}' bir giriş bileşeni değil."; return false; }
                if (ownerType == "facetPanel" && !context.SelectInputsWithOptions.Contains(inputId))
                { error = $"Yan filtre panelinin 'inputs' listesi yalnızca seçenek sorgulu seçim girişleri içerebilir: {inputId}."; return false; }
                if (ownerType is "formCard" or "facetPanel" && !owners.TryAdd(inputId, ownerId))
                { error = $"'{inputId}' girişi birden fazla form kartı veya yan filtre panelinde kullanılamaz."; return false; }
            }
        foreach (var (ownerId, tableId) in context.PendingTables)
            if (!context.NamedQueryTables.Contains(tableId))
            { error = $"'{ownerId}' bağlam panelinin 'table' değeri sayfadaki adlı ve sorguya bağlı bir veri listesi olmalıdır: {tableId}."; return false; }
        return true;
    }

    private static bool ValidateMapItems(string property, JsonElement value, bool allowedOnType, int maxItems, Regex pattern, string format, out string? error)
    {
        error = null;
        if (!allowedOnType) { error = $"'{property}' özelliği bu bileşen türünde kullanılamaz."; return false; }
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > maxItems)
        { error = $"'{property}' en fazla {maxItems} öğeli bir dizi olmalıdır."; return false; }
        foreach (var item in value.EnumerateArray())
        {
            try
            {
                if (item.ValueKind == JsonValueKind.String && pattern.IsMatch(item.GetString()!)) continue;
            }
            catch (RegexMatchTimeoutException) { }
            error = $"'{property}' öğeleri {format} biçiminde olmalıdır.";
            return false;
        }
        return true;
    }

    /// <summary>
    /// A button with actionType "query" runs one page query (queryId) and may re-run read queries afterwards. The
    /// action props are button-only; queryId is required for a query action and must name a query on the page.
    /// </summary>
    private static bool ValidateButtonQueryAction(JsonElement props, string typeText, Context context, out string? error)
    {
        error = null;
        if (typeText != "button")
        {
            var misplaced = props.EnumerateObject().Select(p => p.Name).FirstOrDefault(ButtonQueryProps.Contains);
            if (misplaced is not null) { error = $"'{misplaced}' özelliği yalnızca düğme bileşeninde kullanılabilir."; return false; }
            return true;
        }
        var isQueryAction = props.TryGetProperty("actionType", out var actionType) && actionType.ValueKind == JsonValueKind.String && actionType.GetString() == "query";
        string? queryId = null;
        if (props.TryGetProperty("queryId", out var queryIdElement))
        {
            if (queryIdElement.ValueKind != JsonValueKind.String) { error = "Düğmenin queryId değeri metin olmalıdır."; return false; }
            queryId = queryIdElement.GetString();
        }
        if (isQueryAction && string.IsNullOrEmpty(queryId)) { error = "Sorgu eylemli düğme için queryId gerekli."; return false; }
        if (!string.IsNullOrEmpty(queryId) && !context.QueryKinds.ContainsKey(queryId))
        { error = $"Düğmenin sorgusu sayfada tanımlı değil: {queryId}."; return false; }
        if (props.TryGetProperty("confirmEnabled", out var confirmEnabled) && confirmEnabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        { error = "Düğmenin confirmEnabled değeri true veya false olmalıdır."; return false; }
        if (props.TryGetProperty("refreshQueries", out var refresh))
        {
            if (refresh.ValueKind != JsonValueKind.Array || refresh.GetArrayLength() > MaxRefreshQueries || refresh.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String))
            { error = $"refreshQueries en fazla {MaxRefreshQueries} sorgu kimliği içeren bir dizi olmalıdır."; return false; }
            var invalid = refresh.EnumerateArray().Select(x => x.GetString()).FirstOrDefault(x => !context.IsReadQuery(x));
            if (invalid is not null) { error = $"Yenilenecek sorgu sayfada tanımlı bir okuma sorgusu olmalıdır: {invalid}."; return false; }
        }
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
