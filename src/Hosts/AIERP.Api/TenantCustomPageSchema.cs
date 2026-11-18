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
    private const int MaxComponentsV1 = 80;
    /// <summary>Faz B: tabs and dialogs own top-level components by id, so v2 pages need more of them.</summary>
    private const int MaxComponentsV2 = 120;
    private const int MaxQueries = 30;
    private const int MaxQueryParameters = 20;
    private static readonly HashSet<string> ComponentTypes = new(StringComparer.Ordinal)
    { "heading", "text", "metric", "card", "section", "divider", "spacer", "button", "dataTable", "form", "code", "alert", "badge", "list", "progress" };
    private static readonly HashSet<string> ComponentTypesV2 = new(ComponentTypes, StringComparer.Ordinal) { "label", "input", "formCard", "contextPanel", "filterChips", "facetPanel", "actionBar", "tabs", "editableGrid", "customFieldsBlock", "dialog", "image" };
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
      "newInputs", "saveQuery", "deleteQuery", "focusInput", "printEnabled", "exportTable", "moreButtons", "hidden",
      // Proje 2 Faz A: conditions, tabs, lookup, server paging and input validation.
      "visibleWhen", "disabledWhen", "disabledReason", "tabs", "defaultTab",
      "optionDescriptionColumn", "minChars", "staticOptions", "allowClear",
      "paging", "pageParam", "pageSizeParam", "pageSize", "searchInput", "footerMeta",
      "upperCase", "min", "max", "step", "maxLength", "pattern", "patternMessage",
      // Proje 2 Faz B: save sequences, row actions, editable grids, custom fields, dialogs, images and change tracking.
      "saveSequence", "stopOnError", "sequenceWhen", "rowActions", "emptyText", "limit", "promptLabel", "promptRequired", "dialogId",
      "gridMode", "sourceQuery", "rowKey", "gridColumns", "maxRows", "addLabel", "fixedRowLabel", "matrixCode", "matrixName",
      "definitionsQuery", "valuesQuery", "contains", "presentation", "saveLabel", "closeOnSave", "resetOnOpen", "height", "fit",
      "recordKey", "trackChanges",
      // Proje 4: the actionBar's record dialog (Yeni / Aç).
      "formDialog",
      // Proje 4: conditional required input (e.g. only while an existing record is edited).
      "requiredWhen",
      // Proje 4: compact one-row formCard (e.g. the filter row above a list), conditional width and per-value cell labels.
      "layout", "widthWhen", "valueLabels", "columnLabels", "columnUnits",
      // Navigation actions (link, erpPage, page): they never write data.
      "href", "pageKey", "pageCode", "params", "queryText",
      // actionBar Yeni / Aç / after-save run a page button (e.g. open the record screen) instead of a record dialog.
      "newButton", "openButton", "afterSaveButton",
      // A heading that replaces the page header title while it is visible (e.g. "Stok kartı {{kart.rows[0].code}}").
      "pageTitle" };
    private const int MaxPropsV1 = 30;
    private const int MaxPropsV2 = 40;
    private static readonly HashSet<string> ActionBarProps = new(StringComparer.Ordinal) { "newInputs", "saveQuery", "deleteQuery", "focusInput", "printEnabled", "exportTable", "moreButtons", "formDialog", "newButton", "openButton", "afterSaveButton" };
    private const string FormDialogTypeText = "'formDialog' yalnız İşlem Çubuğu'nda kullanılabilir.";
    private const string FormDialogTargetText = "'formDialog' sayfadaki bir pencere kimliği olmalıdır: ";
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
    { "text", "title", "description", "label", "value", "placeholder", "defaultValue", "confirmText", "successMessage", "errorMessage", "disabledReason",
      "promptLabel", "fixedRowLabel", "matrixCode", "matrixName", "recordKey", "href", "queryText" };
    /// <summary>Button query-action messages have tighter limits than other bindable text.</summary>
    private static readonly Dictionary<string, int> MessageLimits = new(StringComparer.Ordinal) { ["confirmText"] = 300, ["successMessage"] = 200, ["errorMessage"] = 200, ["disabledReason"] = 200,
        ["promptLabel"] = 60, ["fixedRowLabel"] = 200, ["matrixCode"] = 200, ["matrixName"] = 200, ["recordKey"] = 200,
        ["href"] = 1000, ["queryText"] = 200 };
    /// <summary>Props of a button's query action; meaningful only on buttons.</summary>
    private static readonly HashSet<string> ButtonQueryProps = new(StringComparer.Ordinal) { "queryId", "confirmEnabled", "confirmText", "refreshQueries", "successMessage", "errorMessage" };
    private const int MaxRefreshQueries = 10;
    private static readonly HashSet<string> InputTypes = new(StringComparer.Ordinal) { "text", "number", "date", "checkbox", "select", "lookup" };
    private static readonly HashSet<string> QueryKeys = new(StringComparer.Ordinal) { "id", "name", "kind", "sql", "parameters", "runOn" };
    /// <summary>Keys of a query bound to a named ERP operation: <see cref="QueryKeys"/> with operation instead of sql.</summary>
    private static readonly HashSet<string> OperationQueryKeys = new(StringComparer.Ordinal) { "id", "name", "kind", "operation", "parameters", "runOn" };
    /// <summary>ERP operations map request records with many scalar fields (stock card update has ~33); SQL queries keep 20.</summary>
    private const int MaxOperationQueryParameters = 60;

    internal static string UnknownOperationError(string name) => $"ERP işlemi bulunamadı: {name}";
    internal static string DeprecatedOperationError(string name) => $"ERP işlemi artık kullanılamıyor: {name}";
    private static readonly HashSet<string> ParameterKeys = new(StringComparer.Ordinal) { "name", "binding", "type" };
    private static readonly HashSet<string> ParameterTypes = new(StringComparer.Ordinal) { "text", "int", "decimal", "date", "bool", "guid" };
    /// <summary>Collection types: only ERP operation queries accept them (bound to a grid's rows or a custom-fields block's values).</summary>
    private static readonly HashSet<string> CollectionParameterTypes = new(StringComparer.Ordinal) { "list", "map" };
    /// <summary>
    /// Names reserved for the page runtime beyond <see cref="TenantCustomPageQueries.ReservedNames"/>: <c>onceki</c> is the
    /// previous save-sequence step's result. Not added to ReservedNames, which also overwrites SQL parameter values.
    /// </summary>
    private static readonly HashSet<string> RuntimeReservedNames = new(StringComparer.OrdinalIgnoreCase) { "onceki", PageRoot };
    /// <summary><c>{{sayfa.parametre.x}}</c>: the parameters a "page" (Sayfa aç) action opened this page with.</summary>
    private const string PageRoot = "sayfa";

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
        /// <summary>Ids of components in the root <c>components</c> array (the only ones a tab may own).</summary>
        public HashSet<string> TopLevelIds { get; } = new(StringComparer.Ordinal);
        /// <summary>Component and query names exactly as written (condition roots are matched ordinally).</summary>
        public HashSet<string> ExactNames { get; } = new(StringComparer.Ordinal);
        /// <summary>v2 input id to its inputType ("text" when omitted).</summary>
        public Dictionary<string, string> InputTypesById { get; } = new(StringComparer.Ordinal);
        /// <summary>tabs components' owned component ids; resolved after the loop.</summary>
        public List<(string TabsId, List<string> Ids)> PendingTabRefs { get; } = [];
        /// <summary>Condition props and their path roots; resolved after the loop against the page names.</summary>
        public List<(string Property, IReadOnlyList<string> Roots)> PendingConditionRoots { get; } = [];
        /// <summary>Server-paged dataTables; resolved after the loop against their query and operation.</summary>
        public List<PagedTable> PendingPagedTables { get; } = [];
        /// <summary>Page queries by id, from <see cref="ValidateQueries"/>' result list.</summary>
        public Dictionary<string, PageQuery> QueryById { get; } = new(StringComparer.Ordinal);
        /// <summary>
        /// list/map operation parameters and their binding (<c>{{root.satirlar}}</c> / <c>{{root.degerler}}</c>); Path is the
        /// binding path without braces. The roots are resolved against the page components after the component loop.
        /// </summary>
        public List<(string Query, string Parameter, string Kind /* list|map */, string Root, string Path)> PendingCollectionBindings { get; } = [];
        // ---- Proje 2 Faz B ----
        /// <summary>Component name (exact) to id; binding roots are matched ordinally.</summary>
        public Dictionary<string, string> ComponentIdsByName { get; } = new(StringComparer.Ordinal);
        /// <summary>Button id to its actionType ("" when omitted).</summary>
        public Dictionary<string, string> ButtonActionTypes { get; } = new(StringComparer.Ordinal);
        /// <summary>dialogId values of openDialog buttons.</summary>
        public List<string> PendingDialogRefs { get; } = [];
        /// <summary>dialog <c>contains</c> lists; resolved after the tabs.</summary>
        public List<(string DialogId, List<string> Ids)> PendingDialogContains { get; } = [];
        /// <summary>dataTable <c>rowActions</c> lists; resolved after the dialogs.</summary>
        public List<(string TableId, List<string> Ids)> PendingRowActions { get; } = [];
        /// <summary>saveSequence lists by owner component id.</summary>
        public List<(string OwnerId, List<string> Steps)> PendingSequences { get; } = [];
        /// <summary>editableGrid components by name.</summary>
        public Dictionary<string, GridInfo> GridModesByName { get; } = new(StringComparer.Ordinal);
        /// <summary>Names of customFieldsBlock components.</summary>
        /// <summary>Custom fields block name → its <c>valuesQuery</c> id (null when the block has none).</summary>
        public Dictionary<string, string?> CustomFieldBlocks { get; } = new(StringComparer.Ordinal);
        /// <summary>Query ids run on their own (actionBar/dialog saveQuery, deleteQuery, button queryId): never grid-iterating.</summary>
        public HashSet<string> DirectWriteQueries { get; } = new(StringComparer.Ordinal);
        public bool IsReadQuery(string? id) => id is not null && QueryKinds.TryGetValue(id, out var kind) && kind == "read";
    }

    private sealed record GridInfo(string Id, string Name, string Mode, IReadOnlyList<string> Columns, string? SourceQuery);

    private sealed record PagedTable(string Id, string? Name, string? QueryId, string PageParam, string PageSizeParam, string? SearchInput, List<string> FooterMetaKeys);

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
                || !root.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array
                || components.GetArrayLength() > (version == 2 ? MaxComponentsV2 : MaxComponentsV1))
            { error = "Tanım schemaVersion 1 veya 2 ve en fazla 80 bileşenli (sürüm 2: 120) components dizisi içermelidir."; return false; }
            var context = new Context(version) { Lookup = lookup, ExistingOperations = existingOperations ?? new HashSet<string>() };
            var queries = new List<PageQuery>();
            if (context.V2 && root.TryGetProperty("queries", out var queryArray) && !ValidateQueries(queryArray, context, queries, out error)) return false;
            foreach (var pageQuery in queries) { context.QueryById[pageQuery.Id] = pageQuery; context.ExactNames.Add(pageQuery.Name); }
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
        var pendingSources = new List<(string Name, string Operation, string Source, IReadOnlyList<string>? BodyMapRoute)>();
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

            if (!ReadParameters(query, name!, MaxQueryParameters, allowCollections: false, out var parameters, out var declared, out error)) return false;
            var used = TenantCustomPageQueries.SqlParameterNames(sql);
            if (used.FirstOrDefault(x => !declared.Contains(x)) is { } undeclared)
            { error = $"'{name}' sorgusu tanımlanmamış bir parametre kullanıyor: @{undeclared}."; return false; }
            if (declared.FirstOrDefault(x => !used.Contains(x)) is { } unused)
            { error = $"'{name}' sorgusundaki '{unused}' parametresi SQL içinde kullanılmıyor."; return false; }
            context.QueryKinds.Add(id, kind);
            result.Add(new PageQuery(id, name!, kind, sql, parameters, runOn));
        }
        // An update that starts from a source record (or a body map built from a source read) needs that read on the same page.
        foreach (var (name, operation, source, bodyMapRoute) in pendingSources)
        {
            if (!result.Any(x => string.Equals(x.Operation, source, StringComparison.Ordinal)))
            { error = $"'{name}' sorgusu: '{operation}' işlemi için sayfada '{source}' okuma sorgusu olmalıdır."; return false; }
            if (bodyMapRoute is not null && BodyMapBindingError(name, source, bodyMapRoute, result) is { } bindingError)
            { error = bindingError; return false; }
        }
        return true;
    }

    /// <summary>Reads and checks a query's parameter list (names unique case-insensitively, known types, single-path bindings).</summary>
    private static bool ReadParameters(JsonElement query, string name, int maxParameters, bool allowCollections, out List<PageQueryParameter> parameters,
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
            if (type is null || !(ParameterTypes.Contains(type) || (allowCollections && CollectionParameterTypes.Contains(type))))
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
        List<PageQuery> result, List<(string Name, string Operation, string Source, IReadOnlyList<string>? BodyMapRoute)> pendingSources, out string? error)
    {
        var operationName = StringOf(query, "operation");
        if (operationName is null || !context.Lookup(operationName, out var operation))
        { error = UnknownOperationError(operationName ?? ""); return false; }
        if (operation.Deprecated && !context.ExistingOperations.Contains(operationName))
        { error = DeprecatedOperationError(operationName); return false; }
        if (kind != operation.PageKind)
        { error = $"'{name}' sorgusu: '{operationName}' işlemi için tür {operation.PageKind} olmalıdır."; return false; }
        if (!ReadParameters(query, name, MaxOperationQueryParameters, allowCollections: true, out var parameters, out _, out error)) return false;
        foreach (var parameter in parameters)
        {
            var declared = operation.Parameters.FirstOrDefault(x => string.Equals(x.Name, parameter.Name, StringComparison.Ordinal));
            if (declared is null)
            {
                // A body-map operation also takes map values by custom field code; anything else stays undeclared.
                if (!IsBodyMapParameter(operation, parameter.Name))
                { error = $"'{name}' sorgusu: '{parameter.Name}' parametresi '{operationName}' işleminde tanımlı değil."; return false; }
                if (parameter.Type != "text")
                { error = $"'{name}' sorgusundaki '{parameter.Name}' parametresinin türü text olmalıdır."; return false; }
                continue;
            }
            if (declared.Type != parameter.Type)
            { error = $"'{name}' sorgusundaki '{parameter.Name}' parametresinin türü {declared.Type} olmalıdır."; return false; }
            if (CollectionParameterTypes.Contains(declared.Type) && !RecordCollectionBinding(name, parameter, context, out error)) return false;
        }
        var missing = operation.Parameters.FirstOrDefault(x => x.Required
            && (x.In == "body" || (x.In == "route" && operation.SourceOperation is null))
            && !parameters.Any(p => string.Equals(p.Name, x.Name, StringComparison.Ordinal)));
        if (missing is not null)
        { error = $"'{name}' sorgusu: '{operationName}' işleminin '{missing.Name}' parametresi bağlanmalıdır."; return false; }
        if (operation.SourceOperation is { } source) pendingSources.Add((name, operationName, source, null));
        // The map starts from the source read's rows, so that read must be on the page and read the same record.
        if (operation.BodyMap is { } bodyMap)
        {
            var sourceRoute = context.Lookup(bodyMap.SourceOperation, out var sourceOperation)
                ? sourceOperation.Parameters.Where(x => x.In == "route").Select(x => x.Name).ToHashSet(StringComparer.Ordinal) : [];
            pendingSources.Add((name, operationName, bodyMap.SourceOperation,
                operation.Parameters.Where(x => x.In == "route" && sourceRoute.Contains(x.Name)).Select(x => x.Name).ToArray()));
        }
        context.QueryKinds.Add(id, kind);
        result.Add(new PageQuery(id, name, kind, "", parameters, StringOf(query, "runOn")!, operationName));
        error = null;
        return true;
    }

    private static readonly Regex CollectionBindingPath = new(@"^([A-Za-z_][A-Za-z0-9_]{0,63})\.(satirlar|degerler)$", RegexOptions.CultureInvariant);

    /// <summary>
    /// A list parameter binds exactly <c>{{grid.satirlar}}</c> and a map parameter exactly <c>{{blok.degerler}}</c>;
    /// the pair is kept for the component rules, which check the root's component type.
    /// </summary>
    private static bool RecordCollectionBinding(string name, PageQueryParameter parameter, Context context, out string? error)
    {
        var segment = parameter.Type == "list" ? "satirlar" : "degerler";
        var match = TenantCustomPageQueries.TryParseBinding(parameter.Binding, out var path) ? CollectionBindingPath.Match(path) : Match.Empty;
        if (!match.Success || match.Groups[2].Value != segment || !TenantCustomPageQueries.IsValidName(match.Groups[1].Value))
        {
            error = parameter.Type == "list"
                ? $"'{name}' sorgusundaki '{parameter.Name}' parametresi {{{{<ızgara>.satirlar}}}} biçiminde bağlanmalıdır."
                : $"'{name}' sorgusundaki '{parameter.Name}' parametresi {{{{<blok>.degerler}}}} biçiminde bağlanmalıdır.";
            return false;
        }
        context.PendingCollectionBindings.Add((name, parameter.Name, parameter.Type, match.Groups[1].Value, path));
        error = null;
        return true;
    }

    private static readonly Regex BodyMapParameterName = new("^[A-Z][A-Z0-9_]{0,39}$", RegexOptions.CultureInvariant);

    /// <summary>
    /// An undeclared parameter of a body-map operation: a custom field code (<c>^[A-Z][A-Z0-9_]{0,39}$</c>) that does not
    /// collide case-insensitively with a declared parameter.
    /// </summary>
    private static bool IsBodyMapParameter(ErpOperation operation, string parameterName) =>
        operation.BodyMap is not null && BodyMapParameterName.IsMatch(parameterName)
        && !operation.Parameters.Any(x => string.Equals(x.Name, parameterName, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Every read query of <paramref name="source"/> must bind each shared route parameter exactly as the write does:
    /// otherwise the map could be built from another record's values (fails closed when several reads exist).
    /// </summary>
    private static string? BodyMapBindingError(string name, string source, IReadOnlyList<string> sharedRouteParameters, List<PageQuery> queries)
    {
        var write = queries.First(x => x.Name == name);
        foreach (var read in queries.Where(x => string.Equals(x.Operation, source, StringComparison.Ordinal)))
            foreach (var parameter in sharedRouteParameters)
            {
                var writeBinding = write.Parameters.FirstOrDefault(x => x.Name == parameter)?.Binding;
                var readBinding = read.Parameters.FirstOrDefault(x => x.Name == parameter)?.Binding;
                if (writeBinding is null || !string.Equals(writeBinding, readBinding, StringComparison.Ordinal))
                    return $"'{name}' sorgusu: '{parameter}' bağlaması '{source}' sorgusununkiyle aynı olmalıdır.";
            }
        return null;
    }

    private static bool ValidName(string? name, Context context, out string? error)
    {
        error = null;
        if (name is not null && TenantCustomPageQueries.ObjectKeyNames.Contains(name)) { error = $"'{name}' ayrılmış bir addır; başka bir ad seçin."; return false; }
        if (!TenantCustomPageQueries.IsValidName(name))
        { error = "Sorgu ve bileşen adları harf veya _ ile başlamalı, en fazla 64 harf/rakam/_ içermelidir."; return false; }
        if (TenantCustomPageQueries.ReservedNames.Contains(name!) || RuntimeReservedNames.Contains(name!)) { error = $"'{name}' ayrılmış bir addır; başka bir ad seçin."; return false; }
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
        if (depth == 0) context.TopLevelIds.Add(idText);
        if (typeText == "actionBar" && ++context.ActionBarCount > 1)
        { error = "Sayfada en fazla bir İşlem Çubuğu (actionBar) bulunabilir."; return false; }
        if (typeText == "input") context.InputIds.Add(idText);
        if (component.TryGetProperty("name", out var nameElement)
            && (nameElement.ValueKind != JsonValueKind.String || !ValidName(nameElement.GetString(), context, out error)))
        { error ??= "Bileşen adı metin olmalıdır."; return false; }
        var componentName = component.TryGetProperty("name", out var validName) ? validName.GetString() : null;
        if (componentName is not null) { context.ExactNames.Add(componentName); context.ComponentIdsByName[componentName] = idText; }
        if (component.TryGetProperty("props", out var props))
        {
            if (context.V2 && props.ValueKind == JsonValueKind.Object && props.EnumerateObject().Count() > MaxPropsV2)
            { error = $"Bileşen en fazla {MaxPropsV2} özellik içerebilir."; return false; }
            if (props.ValueKind != JsonValueKind.Object || props.EnumerateObject().Count() > MaxPropsV1 && !context.V2 || !OnlyKeys(props, context.V2 ? SafePropsV2 : SafeProps))
            { error = "Bileşen özellikleri izin verilen statik alanlarla sınırlıdır."; return false; }
            foreach (var prop in props.EnumerateObject())
            {
                if (prop.Name == "params")
                {
                    if (!context.V2 || !ValidatePageParams(prop.Value, typeText, out error)) { error ??= "'params' geçersiz."; return false; }
                    continue;
                }
                if (prop.Name is "css" or "javascript")
                {
                    var maxCodeLength = prop.Name == "javascript" && context.V2 ? 20000 : 4000;
                    if (typeText != "code" || prop.Value.ValueKind != JsonValueKind.String || (prop.Value.GetString()?.Length ?? 0) > maxCodeLength
                        || prop.Name == "css" && HasExternalCss(prop.Value.GetString() ?? ""))
                    { error = $"'{prop.Name}' yalnızca yalıtılmış kod bileşeninde, {(maxCodeLength == 20000 ? "20000" : "4000")} karakter sınırında kullanılabilir."; return false; }
                    continue;
                }
                if (prop.Name == "hidden")
                {
                    if (typeText != "code" || prop.Value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    { error = "'hidden' yalnızca kod bileşeninde ve doğru/yanlış değeriyle kullanılabilir."; return false; }
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
                || actionType.GetString() is not ("workflow" or "query" or "sequence" or "openDialog" or "link" or "erpPage" or "page") || actionType.GetString() != "workflow" && !context.V2))
            {
                error = context.V2 ? "Düğme eylem türü iş akışı (workflow), sorgu (query), kayıt dizisi (sequence), pencere (openDialog), bağlantı (link), ERP ekranı (erpPage) veya sayfa (page) olabilir." : "Düğme eylem türü yalnızca yayımlanmış iş akışı olabilir.";
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
            if (context.V2 && !ValidateFazAProps(props, idText, componentName, typeText, context, out error)) return false;
            if (context.V2 && !ValidateV2Props(props, typeText, context, out error)) return false;
            if (context.V2 && !ValidateLayoutProps(props, idText, typeText, context, out error)) return false;
            if (typeText == "input" && props.TryGetProperty("inputType", out var selectType) && selectType.ValueKind == JsonValueKind.String && selectType.GetString() == "select"
                && props.TryGetProperty("optionsQuery", out var selectOptions) && selectOptions.ValueKind == JsonValueKind.String)
                context.SelectInputsWithOptions.Add(idText);
            if (context.V2 && !ValidateActionBarProps(props, typeText, context, out error)) return false;
            if (context.V2 && !ValidateFazBProps(props, idText, componentName, typeText, context, out error)) return false;
            if (typeText == "dataTable" && props.TryGetProperty("query", out var anyTableQuery) && anyTableQuery.ValueKind == JsonValueKind.String)
                context.QueryTables.Add(idText);
            if (typeText == "dataTable" && component.TryGetProperty("name", out _) && props.TryGetProperty("query", out var tableQuery) && tableQuery.ValueKind == JsonValueKind.String)
                context.NamedQueryTables.Add(idText);
        }
        else if (context.V2 && typeText is "formCard" or "contextPanel" or "filterChips" or "facetPanel" or "tabs" or "editableGrid" or "customFieldsBlock" or "dialog")
        { error = $"'{typeText}' bileşeni için props gerekli."; return false; }
        if (component.TryGetProperty("children", out var children))
        {
            if (typeText is not ("section" or "card") || children.ValueKind != JsonValueKind.Array
                || children.GetArrayLength() > (context.V2 ? MaxComponentsV2 : MaxComponentsV1))
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
        { error = "Giriş türü yalnızca giriş bileşeninde text, number, date, checkbox, select veya lookup olabilir."; return false; }
        if (props.TryGetProperty("optionsQuery", out var optionsQuery)
            && (typeText != "input" || optionsQuery.ValueKind != JsonValueKind.String || !context.IsReadQuery(optionsQuery.GetString())))
        { error = $"Seçenek sorgusu yalnızca giriş bileşeninde ve sayfada tanımlı bir okuma sorgusu olabilir: {(optionsQuery.ValueKind == JsonValueKind.String ? optionsQuery.GetString() : "?")}."; return false; }
        foreach (var key in new[] { "optionLabelColumn", "optionValueColumn" })
            if (props.TryGetProperty(key, out var column)
                && (typeText != "input" || column.ValueKind != JsonValueKind.String || column.GetString()!.Length is < 1 or > 128))
            { error = $"'{key}' yalnızca giriş bileşeninde 1–128 karakterlik sütun adı olabilir."; return false; }
        return ValidateDesignLanguageProps(props, typeText, context, out error) && ValidateButtonQueryAction(props, typeText, context, out error)
            && ValidateNavigationAction(props, typeText, out error);
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
        if (props.TryGetProperty("columns", out var columns) && typeText is "formCard" or "customFieldsBlock"
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
            // Faz B: a dialog has its own save query.
            foreach (var key in ActionBarProps)
                if (props.TryGetProperty(key, out _) && !(key == "saveQuery" && typeText == "dialog"))
                {
                    error = key == "formDialog" ? FormDialogTypeText : $"'{key}' özelliği yalnızca İşlem Çubuğu (actionBar) bileşeninde kullanılabilir.";
                    return false;
                }
            return typeText != "dialog" || ValidateSaveQueries(props, context, out error);
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
        // Proje 4: the record dialog that Yeni and Aç open. It does not own the dialog (buttons may open it too).
        if (props.TryGetProperty("formDialog", out var formDialog))
        {
            if (formDialog.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(formDialog.GetString()))
            { error = FormDialogTargetText + "?"; return false; }
            context.PendingActionRefs.Add(("formDialog", formDialog.GetString()!, "dialog"));
        }
        // Yeni / Aç / kayıttan sonra: sayfadaki bir düğmenin eylemini çalıştırır (ör. kayıt ekranını aç). Aç ve Yeni, kayıt penceresiyle birlikte kullanılamaz.
        foreach (var key in new[] { "newButton", "openButton", "afterSaveButton" })
        {
            if (!props.TryGetProperty(key, out var button)) continue;
            if (button.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(button.GetString()))
            { error = $"'{key}' bir düğme bileşeni kimliği olmalıdır."; return false; }
            if (key != "afterSaveButton" && props.TryGetProperty("formDialog", out _))
            { error = $"'{key}' ve 'formDialog' birlikte kullanılamaz."; return false; }
            context.PendingActionRefs.Add((key, button.GetString()!, "actionButton"));
        }
        if (props.TryGetProperty("printEnabled", out var print) && print.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        { error = "'printEnabled' true veya false olmalıdır."; return false; }
        return ValidateSaveQueries(props, context, out error);
    }

    /// <summary>saveQuery (actionBar, dialog) and deleteQuery (actionBar): kinds; the ids are kept for the Faz B grid-iteration rule.</summary>
    private static bool ValidateSaveQueries(JsonElement props, Context context, out string? error)
    {
        error = null;
        foreach (var (key, kinds) in new[] { ("saveQuery", "insert veya update"), ("deleteQuery", "delete") })
        {
            if (!props.TryGetProperty(key, out var q)) continue;
            var queryId = q.ValueKind == JsonValueKind.String ? q.GetString() : null;
            if (string.IsNullOrEmpty(queryId) || !context.QueryKinds.TryGetValue(queryId, out var kind))
            { error = $"'{key}' sorgusu sayfada yok: {queryId ?? "?"}."; return false; }
            if (key == "saveQuery" ? kind is not ("insert" or "update") : kind != "delete")
            { error = $"'{key}' {kinds} türünde bir sorgu olmalıdır: {queryId}."; return false; }
            context.DirectWriteQueries.Add(queryId);
        }
        return true;
    }

    private static bool ResolveActionBarReferences(Context context, out string? error)
    {
        error = null;
        foreach (var (property, id, expected) in context.PendingActionRefs)
        {
            if (expected == "dialog")
            {
                if (!context.ComponentTypesById.TryGetValue(id, out var dialogType) || dialogType != "dialog")
                { error = FormDialogTargetText + id; return false; }
                continue;
            }
            if (!context.ComponentTypesById.TryGetValue(id, out var type))
            { error = $"İşlem Çubuğu '{property}' özelliğindeki bileşen sayfada yok: {id}."; return false; }
            if (expected == "input" && type != "input")
            { error = $"İşlem Çubuğu '{property}' özelliğindeki '{id}' bir giriş bileşeni değil."; return false; }
            if (expected is "button" or "actionButton" && type != "button")
            { error = $"İşlem Çubuğu '{property}' özelliğindeki '{id}' bir düğme bileşeni değil."; return false; }
            if (expected == "actionButton" && !(context.ButtonActionTypes.TryGetValue(id, out var buttonAction)
                && buttonAction is "query" or "sequence" or "openDialog" or "workflow" or "link" or "erpPage" or "page"))
            { error = $"İşlem Çubuğu '{property}' özelliğindeki '{id}' düğmesinin bir eylemi olmalıdır."; return false; }
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
        return ResolveFazAReferences(context, owners, out error) && ResolveFazBReferences(context, owners, out error);
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
            // Faz B: a dialog re-runs read queries after its save, like a button.
            var misplaced = props.EnumerateObject().Select(p => p.Name)
                .FirstOrDefault(x => ButtonQueryProps.Contains(x) && !(x == "refreshQueries" && typeText == "dialog"));
            if (misplaced is not null) { error = $"'{misplaced}' özelliği yalnızca düğme bileşeninde kullanılabilir."; return false; }
            return typeText != "dialog" || ValidateRefreshQueries(props, context, out error);
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
        if (!string.IsNullOrEmpty(queryId)) context.DirectWriteQueries.Add(queryId);
        if (props.TryGetProperty("confirmEnabled", out var confirmEnabled) && confirmEnabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        { error = "Düğmenin confirmEnabled değeri true veya false olmalıdır."; return false; }
        return ValidateRefreshQueries(props, context, out error);
    }

    private static bool ValidateRefreshQueries(JsonElement props, Context context, out string? error)
    {
        error = null;
        if (props.TryGetProperty("refreshQueries", out var refresh))
        {
            if (refresh.ValueKind != JsonValueKind.Array || refresh.GetArrayLength() > MaxRefreshQueries || refresh.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String))
            { error = $"refreshQueries en fazla {MaxRefreshQueries} sorgu kimliği içeren bir dizi olmalıdır."; return false; }
            var invalid = refresh.EnumerateArray().Select(x => x.GetString()).FirstOrDefault(x => !context.IsReadQuery(x));
            if (invalid is not null) { error = $"Yenilenecek sorgu sayfada tanımlı bir okuma sorgusu olmalıdır: {invalid}."; return false; }
        }
        return true;
    }

    // ---- Navigation actions: link (Bağlantıya git), erpPage (ERP ekranı aç), page (Sayfa aç) ----

    private const int MaxPageParams = 6;
    private static readonly string[] NavigationProps = ["href", "pageKey", "queryText", "pageCode", "params"];
    private static readonly Regex PageParamItem = new(@"^([a-z][a-zA-Z0-9]{0,31})=(.{0,200})\z", RegexOptions.CultureInvariant, RegexTimeout);
    /// <summary>
    /// The literal start of a link: http(s), a host of DNS labels and an optional port, then the end of the text or one of
    /// <c>/ ? #</c>. No user info, backslash or bound host is possible, so interpolated values can never change the target host.
    /// </summary>
    private static readonly Regex LinkPrefix = new(
        @"^https?://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?::[0-9]{1,5})?(?<end>[/?#]|\z)",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase, RegexTimeout);

    private static string? NavigationTypeOf(string prop) => prop switch
    {
        "href" => "link",
        "pageKey" or "queryText" => "erpPage",
        "pageCode" or "params" => "page",
        _ => null
    };

    private static string NavigationLabel(string? actionType) => actionType switch
    {
        "link" => "bağlantı (link)",
        "erpPage" => "ERP ekranı (erpPage)",
        _ => "sayfa açan (page)"
    };

    /// <summary>
    /// A link template is safe when its literal prefix (up to the first <c>{{</c>) is an absolute http/https address with a
    /// complete host, and its literal text has no whitespace, control character or backslash. The runtime re-checks the
    /// interpolated address and encodes every bound value.
    /// </summary>
    internal static bool SafeLinkTemplate(string href)
    {
        var first = href.IndexOf("{{", StringComparison.Ordinal);
        var prefix = first < 0 ? href : href[..first];
        Match match;
        try { match = LinkPrefix.Match(prefix); }
        catch (RegexMatchTimeoutException) { return false; }
        if (!match.Success || first >= 0 && match.Groups["end"].Length == 0) return false;
        var literal = TenantCustomPageQueries.EmbeddedBinding().Replace(href, "");
        return !literal.Any(c => char.IsWhiteSpace(c) || char.IsControl(c) || c == '\\');
    }

    /// <summary><c>params</c> of a page action: up to 6 unique <c>ad=değer</c> items whose value may contain bindings.</summary>
    private static bool ValidatePageParams(JsonElement value, string typeText, out string? error)
    {
        error = null;
        const string format = "'params' en fazla 6 adet ad=değer öğesi içermelidir; ad küçük harfle başlar, en fazla 32 harf/rakamdır ve benzersizdir.";
        if (typeText != "button") return Fail("'params' yalnız sayfa açan (page) eylemli düğmede kullanılabilir.", out error);
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > MaxPageParams) return Fail(format, out error);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in value.EnumerateArray())
        {
            Match match;
            try { match = item.ValueKind == JsonValueKind.String ? PageParamItem.Match(item.GetString()!) : Match.Empty; }
            catch (RegexMatchTimeoutException) { match = Match.Empty; }
            if (!match.Success || !seen.Add(match.Groups[1].Value) || !SafeBindableText(match.Groups[2].Value)) return Fail(format, out error);
        }
        return true;
    }

    /// <summary>
    /// Navigation buttons open an address, an ERP screen or a page; they never write data, so the write-only props are refused.
    /// Each navigation prop belongs to exactly one action type.
    /// </summary>
    private static bool ValidateNavigationAction(JsonElement props, string typeText, out string? error)
    {
        error = null;
        var actionType = typeText == "button" ? StringOf(props, "actionType") : null;
        foreach (var key in NavigationProps)
            if (props.TryGetProperty(key, out _) && NavigationTypeOf(key) != actionType)
                return Fail($"'{key}' yalnız {NavigationLabel(NavigationTypeOf(key))} eylemli düğmede kullanılabilir.", out error);
        if (actionType is not ("link" or "erpPage" or "page")) return true;
        foreach (var key in new[] { "queryId", "refreshQueries" })
            if (props.TryGetProperty(key, out _)) return Fail($"'{key}' gezinme eylemli düğmede kullanılamaz; bu eylemler veri yazmaz.", out error);
        if (props.TryGetProperty("target", out _) && StringOf(props, "target") is not ("newTab" or "sameTab"))
            return Fail("'target' newTab veya sameTab olmalıdır.", out error);
        switch (actionType)
        {
            case "link":
                var href = StringOf(props, "href");
                if (string.IsNullOrEmpty(href)) return Fail("Bağlantı düğmesi için 'href' gerekli.", out error);
                if (!SafeLinkTemplate(href))
                    return Fail("'href' http:// veya https:// ile başlayan, sunucu adı sabit yazılmış bir adres olmalıdır; {{…}} ifadeleri yalnız sunucu adından sonra (/, ? veya # ardından) kullanılabilir.", out error);
                break;
            case "erpPage":
                var pageKey = StringOf(props, "pageKey");
                if (string.IsNullOrEmpty(pageKey)) return Fail("ERP ekranı düğmesi için 'pageKey' gerekli.", out error);
                if (!StandardMenuEndpoints.PageKeys.Contains(pageKey)) return Fail($"ERP ekranı bulunamadı: {pageKey}", out error);
                break;
            default:
                var pageCode = StringOf(props, "pageCode");
                if (string.IsNullOrEmpty(pageCode)) return Fail("Sayfa düğmesi için 'pageCode' gerekli.", out error);
                var known = TenantCustomPageEndpoints.ValidCode(pageCode)
                    || SystemPageCodes.ScreenKeyOf(pageCode) is { } screenKey && StandardMenuEndpoints.PageKeys.Contains(screenKey);
                if (!known) return Fail($"'pageCode' bir özel sayfa kodu ya da @ekran-anahtarı olmalıdır: {pageCode}", out error);
                break;
        }
        return true;
    }

    // ---- Proje 2 Faz A: conditions, tabs, lookup, server paging and input validation ----

    private const int MaxTabs = 8;
    private const int MaxStaticOptions = 20;
    private const int MaxFooterMeta = 6;
    private const int MaxPatternLength = 200;
    private const int MaxPatternMessageLength = 120;
    private static readonly Regex TabItem = new(@"^[^=,]{1,40}=([A-Za-z0-9_-]{1,64}(,[A-Za-z0-9_-]{1,64}){0,19})?\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex StaticOptionItem = new(@"^[^=]{0,128}=[^=]{1,60}\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex FooterMetaItem = new(@"^[A-Za-z_][A-Za-z0-9_]{0,63}=[^=]{1,60}\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex IsoDate = new(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly string[] LookupProps = ["optionDescriptionColumn", "minChars", "staticOptions", "allowClear"];
    private static readonly string[] PagingProps = ["pageParam", "pageSizeParam", "pageSize", "searchInput", "footerMeta"];
    private static readonly HashSet<string> ConditionRoots = new(TenantCustomPageQueries.ReservedNames, StringComparer.Ordinal) { PageRoot };

    private static bool IsBool(JsonElement value) => value.ValueKind is JsonValueKind.True or JsonValueKind.False;
    private static bool IsIntIn(JsonElement value, int min, int max) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= min && number <= max;

    /// <summary>
    /// v2 props added in Proje 2 Faz A. References (condition roots, tab-owned ids, paged-table queries and search inputs)
    /// are collected here and resolved after every component was visited.
    /// </summary>
    private static bool ValidateFazAProps(JsonElement props, string id, string? name, string typeText, Context context, out string? error)
    {
        error = null;
        var inputType = typeText == "input" ? StringOf(props, "inputType") ?? "text" : null;
        if (inputType is not null) context.InputTypesById[id] = inputType;
        return ValidateConditionProps(props, typeText, context, out error)
            && ValidateTabsProps(props, id, typeText, context, out error)
            && ValidateLookupProps(props, typeText, inputType, out error)
            && ValidatePagingProps(props, id, name, typeText, context, out error)
            && ValidateInputRules(props, typeText, inputType, out error);
    }

    private static bool ValidateConditionProps(JsonElement props, string typeText, Context context, out string? error)
    {
        error = null;
        foreach (var key in new[] { "visibleWhen", "disabledWhen", "requiredWhen" })
        {
            if (!props.TryGetProperty(key, out var condition)) continue;
            if (key == "disabledWhen" && typeText is not ("button" or "input" or "editableGrid" or "customFieldsBlock"))
            { error = "'disabledWhen' yalnız düğme ve giriş bileşenlerinde kullanılabilir."; return false; }
            if (key == "requiredWhen" && typeText != "input")
            { error = "'requiredWhen' yalnız giriş bileşeninde kullanılabilir."; return false; }
            if (condition.ValueKind != JsonValueKind.String)
            { error = $"'{key}' koşulu geçersiz: ifade metin olmalı"; return false; }
            if (!PageConditionExpression.TryParse(condition.GetString()!, out var roots, out var reason))
            { error = $"'{key}' koşulu geçersiz: {reason}"; return false; }
            context.PendingConditionRoots.Add((key, roots));
        }
        if (props.TryGetProperty("widthWhen", out var widthWhen))
        {
            if (!MatchesSafely(WidthWhenItem, widthWhen))
            { error = "'widthWhen' genişlik=koşul biçiminde olmalıdır (genişlik 1–12)."; return false; }
            if (!PageConditionExpression.TryParse(widthWhen.GetString()!.Split('=', 2)[1], out var widthRoots, out var widthReason))
            { error = $"'widthWhen' koşulu geçersiz: {widthReason}"; return false; }
            context.PendingConditionRoots.Add(("widthWhen", widthRoots));
        }
        if (props.TryGetProperty("disabledReason", out _))
        {
            if (typeText is not ("button" or "input" or "editableGrid" or "customFieldsBlock"))
            { error = "'disabledReason' yalnız düğme ve giriş bileşenlerinde kullanılabilir."; return false; }
            if (!props.TryGetProperty("disabledWhen", out _))
            { error = "'disabledReason' için 'disabledWhen' de tanımlı olmalıdır."; return false; }
        }
        return true;
    }

    private static bool ValidateTabsProps(JsonElement props, string id, string typeText, Context context, out string? error)
    {
        error = null;
        foreach (var key in new[] { "tabs", "defaultTab" })
            if (typeText != "tabs" && props.TryGetProperty(key, out _))
            { error = $"'{key}' özelliği yalnız sekme (tabs) bileşeninde kullanılabilir."; return false; }
        if (typeText != "tabs") return true;
        const string tabsError = "'tabs' 1–8 adet Etiket=kimlik,kimlik öğesi içermelidir.";
        if (!props.TryGetProperty("tabs", out var tabs) || tabs.ValueKind != JsonValueKind.Array || tabs.GetArrayLength() is < 1 or > MaxTabs)
        { error = tabsError; return false; }
        var owned = new List<string>();
        foreach (var item in tabs.EnumerateArray())
        {
            if (!MatchesSafely(TabItem, item)) { error = tabsError; return false; }
            var ids = item.GetString()!.Split('=', 2)[1];
            if (ids.Length > 0) owned.AddRange(ids.Split(','));
        }
        if (props.TryGetProperty("defaultTab", out var defaultTab) && !IsIntIn(defaultTab, 0, tabs.GetArrayLength() - 1))
        { error = "'defaultTab' sekme sırası (0'dan başlar) olmalıdır."; return false; }
        context.PendingTabRefs.Add((id, owned));
        return true;
    }

    private static bool ValidStaticOptions(JsonElement value) => value.ValueKind == JsonValueKind.Array && value.GetArrayLength() <= MaxStaticOptions
        && value.EnumerateArray().All(x => MatchesSafely(StaticOptionItem, x));

    private static bool ValidateLookupProps(JsonElement props, string typeText, string? inputType, out string? error)
    {
        error = null;
        var isLookup = inputType == "lookup";
        // Sabit seçenekler açılır listede (select) de kullanılabilir; diğer arama kutusu özellikleri yalnız lookup'ta.
        foreach (var key in LookupProps)
            if (!isLookup && !(key == "staticOptions" && inputType == "select") && props.TryGetProperty(key, out _))
            { error = $"'{key}' yalnız arama kutusu (inputType: lookup) girişinde kullanılabilir."; return false; }
        if (inputType == "select" && props.TryGetProperty("staticOptions", out var selectStatic) && !ValidStaticOptions(selectStatic))
        { error = "'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır."; return false; }
        if (!isLookup) return true;
        if (props.TryGetProperty("optionDescriptionColumn", out var description)
            && (description.ValueKind != JsonValueKind.String || description.GetString()!.Length is < 1 or > 128))
        { error = "'optionDescriptionColumn' 1–128 karakterlik sütun adı olmalıdır."; return false; }
        if (props.TryGetProperty("minChars", out var minChars) && !IsIntIn(minChars, 0, 5))
        { error = "'minChars' 0 ile 5 arasında bir tam sayı olmalıdır."; return false; }
        if (props.TryGetProperty("allowClear", out var allowClear) && !IsBool(allowClear))
        { error = "'allowClear' true veya false olmalıdır."; return false; }
        var hasStatic = props.TryGetProperty("staticOptions", out var staticOptions);
        if (hasStatic && !ValidStaticOptions(staticOptions))
        { error = "'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır."; return false; }
        if (!hasStatic && !props.TryGetProperty("optionsQuery", out _))
        { error = "Arama kutusu için seçenek sorgusu veya sabit seçenek gerekli."; return false; }
        return true;
    }

    private static bool ValidatePagingProps(JsonElement props, string id, string? name, string typeText, Context context, out string? error)
    {
        error = null;
        var paged = false;
        if (props.TryGetProperty("paging", out var paging))
        {
            if (typeText != "dataTable" || paging.ValueKind != JsonValueKind.String || paging.GetString() != "server")
            { error = "'paging' yalnız veri listesinde \"server\" olabilir."; return false; }
            paged = true;
        }
        foreach (var key in PagingProps)
            if (!paged && props.TryGetProperty(key, out _))
            { error = $"'{key}' yalnız sunucu sayfalı (paging: server) veri listesinde kullanılabilir."; return false; }
        if (!paged) return true;
        var parameterNames = new string[2];
        foreach (var (index, key, fallback) in new[] { (0, "pageParam", "page"), (1, "pageSizeParam", "pageSize") })
        {
            parameterNames[index] = fallback;
            if (!props.TryGetProperty(key, out var parameter)) continue;
            if (parameter.ValueKind != JsonValueKind.String || !TenantCustomPageQueries.IsValidName(parameter.GetString()))
            { error = $"'{key}' geçerli bir parametre adı olmalıdır."; return false; }
            parameterNames[index] = parameter.GetString()!;
        }
        if (props.TryGetProperty("pageSize", out var pageSize) && !IsIntIn(pageSize, 5, 100))
        { error = "'pageSize' 5 ile 100 arasında bir tam sayı olmalıdır."; return false; }
        string? searchInput = null;
        if (props.TryGetProperty("searchInput", out var search))
        {
            if (search.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(search.GetString()))
            { error = "'searchInput' sayfadaki bir metin girişinin kimliği olmalıdır."; return false; }
            searchInput = search.GetString();
        }
        var footerKeys = new List<string>();
        if (props.TryGetProperty("footerMeta", out var footerMeta))
        {
            if (!ValidateMapItems("footerMeta", footerMeta, true, MaxFooterMeta, FooterMetaItem, "anahtar=Etiket", out error)) return false;
            footerKeys.AddRange(footerMeta.EnumerateArray().Select(x => x.GetString()!.Split('=')[0]));
        }
        var queryId = StringOf(props, "query");
        context.PendingPagedTables.Add(new PagedTable(id, name, queryId, parameterNames[0], parameterNames[1], searchInput, footerKeys));
        return true;
    }

    private static bool ValidateInputRules(JsonElement props, string typeText, string? inputType, out string? error)
    {
        error = null;
        if (props.TryGetProperty("upperCase", out var upperCase) && (typeText != "input" || inputType != "text" || !IsBool(upperCase)))
        { error = "'upperCase' yalnız metin girişinde true veya false olabilir."; return false; }
        if (typeText != "input")
        {
            // 'required' predates Faz A on other component types and stays unchecked there (v1 behaviour).
            var misplaced = new[] { "min", "max", "step", "maxLength", "pattern", "patternMessage" }.FirstOrDefault(key => props.TryGetProperty(key, out _));
            if (misplaced is not null) { error = $"'{misplaced}' özelliği yalnız giriş bileşeninde kullanılabilir."; return false; }
            return true;
        }
        if (props.TryGetProperty("required", out var required) && !IsBool(required))
        { error = "'required' true veya false olmalıdır."; return false; }
        JsonElement? min = null, max = null;
        foreach (var key in new[] { "min", "max" })
        {
            if (!props.TryGetProperty(key, out var bound)) continue;
            var valid = inputType switch
            {
                "number" => bound.ValueKind == JsonValueKind.Number && bound.TryGetDouble(out var number) && double.IsFinite(number),
                "date" => bound.ValueKind == JsonValueKind.String && MatchesSafely(IsoDate, bound)
                    && DateOnly.TryParseExact(bound.GetString(), "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _),
                _ => false
            };
            if (!valid) { error = $"'{key}' yalnız sayı veya tarih girişinde kullanılabilir."; return false; }
            if (key == "min") min = bound; else max = bound;
        }
        if (min is { } low && max is { } high && (inputType == "number"
            ? low.GetDouble() > high.GetDouble()
            : string.CompareOrdinal(low.GetString(), high.GetString()) > 0))
        { error = "'min' değeri 'max' değerinden büyük olamaz."; return false; }
        if (props.TryGetProperty("step", out var step)
            && (inputType != "number" || step.ValueKind != JsonValueKind.Number || !step.TryGetDouble(out var stepValue) || stepValue is <= 0 or > 1_000_000))
        { error = "'step' yalnız sayı girişinde 0'dan büyük ve en fazla 1000000 olabilir."; return false; }
        if (props.TryGetProperty("maxLength", out var maxLength) && (inputType != "text" || !IsIntIn(maxLength, 1, 4000)))
        { error = "'maxLength' yalnız metin girişinde 1–4000 arasında bir tam sayı olabilir."; return false; }
        var hasPattern = props.TryGetProperty("pattern", out var pattern);
        if (hasPattern)
        {
            if (inputType != "text" || pattern.ValueKind != JsonValueKind.String || pattern.GetString()!.Length > MaxPatternLength || !CompilesAsRegex(pattern.GetString()!))
            { error = "'pattern' geçerli bir düzenli ifade değil."; return false; }
            if (EcmaUnsupportedPattern.IsMatch(pattern.GetString()!))
            { error = "Desen tarayıcıda desteklenmeyen bir yapı içeriyor."; return false; }
        }
        if (props.TryGetProperty("patternMessage", out var patternMessage)
            && (!hasPattern || patternMessage.ValueKind != JsonValueKind.String || patternMessage.GetString()!.Length > MaxPatternMessageLength))
        { error = $"'patternMessage' yalnız 'pattern' tanımlı girişte en fazla {MaxPatternMessageLength} karakterlik metin olabilir."; return false; }
        return true;
    }

    /// <summary>
    /// .NET'in kabul edip ECMAScript'in ("u" bayraksız) farklı yorumladığı ya da reddettiği yapılar: satır içi seçenekler
    /// <c>(?i)</c>, <c>(?m:...)</c> ve <c>\A</c>, <c>\Z</c>, <c>\z</c> çapaları (önünde çift sayıda ters bölü varken). Adlı grup
    /// <c>(?&lt;ad&gt;</c> zaten <c>&lt;</c> kuralıyla engellidir.
    /// </summary>
    private static readonly Regex EcmaUnsupportedPattern = new(@"\(\?[imnsx-]+[):]|(?:^|[^\\])(?:\\\\)*\\[AZz]", RegexOptions.CultureInvariant, RegexTimeout);

    private static bool CompilesAsRegex(string pattern)
    {
        try
        {
            _ = new Regex(pattern, RegexOptions.None, RegexTimeout);
            return true;
        }
        catch (ArgumentException) { return false; }
    }

    private static bool MatchesSafely(Regex pattern, JsonElement value)
    {
        try { return value.ValueKind == JsonValueKind.String && pattern.IsMatch(value.GetString()!); }
        catch (RegexMatchTimeoutException) { return false; }
    }

    /// <summary>
    /// Post-loop checks of Faz A references. <paramref name="owners"/> already holds the formCard/facetPanel inputs; a
    /// paged table's searchInput and every tab-owned id are added to it, so one component has at most one owner.
    /// </summary>
    private static bool ResolveFazAReferences(Context context, Dictionary<string, string> owners, out string? error)
    {
        error = null;
        foreach (var (property, roots) in context.PendingConditionRoots)
            if (roots.FirstOrDefault(root => !context.ExactNames.Contains(root) && !ConditionRoots.Contains(root)) is { } unknown)
            { error = $"'{property}' koşulu sayfada olmayan bir ada başvuruyor: {unknown}"; return false; }
        foreach (var table in context.PendingPagedTables)
            if (!ResolvePagedTable(table, context, owners, out error)) return false;
        foreach (var (tabsId, ids) in context.PendingTabRefs)
            foreach (var ownedId in ids)
            {
                if (!context.ComponentTypesById.TryGetValue(ownedId, out var type))
                { error = $"Sekmenin bileşeni sayfada yok: {ownedId}"; return false; }
                if (!context.TopLevelIds.Contains(ownedId))
                { error = $"Sekmeler yalnız üst düzey bileşenleri içerebilir: {ownedId}"; return false; }
                if (type is "tabs" or "actionBar")
                { error = $"Sekmeler sekme veya İşlem Çubuğu bileşeni içeremez: {ownedId}"; return false; }
                if (type == "dialog")
                { error = $"Sekmeler pencere bileşeni içeremez: {ownedId}"; return false; }
                if (!owners.TryAdd(ownedId, tabsId))
                { error = $"'{ownedId}' birden fazla sekmede veya yerleşimde kullanılamaz."; return false; }
            }
        return true;
    }

    private static bool ResolvePagedTable(PagedTable table, Context context, Dictionary<string, string> owners, out string? error)
    {
        error = null;
        ErpOperation? operation = null;
        if (table.Name is null || table.QueryId is null || !context.QueryById.TryGetValue(table.QueryId, out var query)
            || query.Operation is null || !context.Lookup(query.Operation, out var found))
        { error = $"Sunucu sayfalı liste adlı ve ERP işlemine bağlı olmalıdır: {table.Id}"; return false; }
        operation = found;
        // Sayfa/boyut değişince yalnız sayfa açılınca çalışan sorgu yeniden çalışır; elle çalışan sorgu hiç sayfalanmaz.
        if (query.RunOn != "load")
        { error = "Sayfalı listenin sorgusu sayfa açılınca çalışmalı (runOn: load)."; return false; }
        foreach (var (parameterName, suffix) in new[] { (table.PageParam, "sayfa"), (table.PageSizeParam, "sayfaBoyutu") })
        {
            if (!operation.Parameters.Any(x => x.In == "query" && x.Type == "int" && string.Equals(x.Name, parameterName, StringComparison.Ordinal)))
            { error = $"'{table.Name}' listesinin işlemi '{parameterName}' adlı tam sayı sorgu parametresini tanımlamıyor."; return false; }
            var expected = $"{table.Name}.{suffix}";
            var bound = query.Parameters.FirstOrDefault(x => string.Equals(x.Name, parameterName, StringComparison.Ordinal));
            if (bound is null || !TenantCustomPageQueries.TryParseBinding(bound.Binding, out var path) || !string.Equals(path, expected, StringComparison.Ordinal))
            { error = $"'{table.Name}' listesinin '{parameterName}' parametresi {{{{{expected}}}}} ile bağlanmalıdır."; return false; }
        }
        if (table.FooterMetaKeys.FirstOrDefault(key => !operation.Result.MetaPaths.Contains(key, StringComparer.Ordinal)) is { } missingMeta)
        { error = $"'footerMeta' anahtarı işlemin üst bilgileri arasında yok: {missingMeta}"; return false; }
        if (table.SearchInput is { } searchInput)
        {
            if (!context.InputTypesById.TryGetValue(searchInput, out var inputType) || inputType != "text")
            { error = $"'searchInput' sayfadaki bir metin girişi olmalıdır: {searchInput}"; return false; }
            if (!owners.TryAdd(searchInput, table.Id))
            { error = $"'{searchInput}' birden fazla sekmede veya yerleşimde kullanılamaz."; return false; }
        }
        return true;
    }

    // ---- Proje 2 Faz B: save sequences, row actions, editable grids, custom fields, dialogs, images and change tracking ----

    private const int MaxSequenceSteps = 8;
    private const int MaxSequenceWhen = 8;
    private const int MaxRowActions = 4;
    private const int MaxGridColumns = 12;
    private const int MaxDialogContains = 20;
    private static readonly Regex SequenceWhenItem = new(@"^([A-Za-z0-9_-]{1,64})=(.+)\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex IterationBindingPath = new(@"^([A-Za-z_][A-Za-z0-9_]*)\.(eklenenSatir|silinenSatir)\.(.+)\z", RegexOptions.CultureInvariant, RegexTimeout);

    /// <summary>The component types each Faz B prop is allowed on.</summary>
    private static readonly Dictionary<string, string[]> FazBPropTypes = new(StringComparer.Ordinal)
    {
        ["saveSequence"] = ["actionBar", "dialog", "button"], ["stopOnError"] = ["actionBar", "dialog", "button"],
        ["sequenceWhen"] = ["actionBar", "dialog", "button"],
        ["rowActions"] = ["dataTable"], ["emptyText"] = ["dataTable"], ["limit"] = ["dataTable"],
        ["promptLabel"] = ["button"], ["promptRequired"] = ["button"], ["dialogId"] = ["button"],
        ["gridMode"] = ["editableGrid"], ["sourceQuery"] = ["editableGrid"], ["rowKey"] = ["editableGrid"], ["gridColumns"] = ["editableGrid"],
        ["maxRows"] = ["editableGrid"], ["addLabel"] = ["editableGrid"], ["fixedRowLabel"] = ["editableGrid"],
        ["matrixCode"] = ["editableGrid"], ["matrixName"] = ["editableGrid"],
        ["definitionsQuery"] = ["customFieldsBlock"], ["valuesQuery"] = ["customFieldsBlock"],
        ["contains"] = ["dialog"], ["presentation"] = ["dialog"], ["saveLabel"] = ["dialog"], ["closeOnSave"] = ["dialog"], ["resetOnOpen"] = ["dialog"],
        ["height"] = ["image"], ["fit"] = ["image"],
        ["recordKey"] = ["formCard"], ["trackChanges"] = ["formCard"], ["layout"] = ["formCard"], ["valueLabels"] = ["dataTable"],
        ["columnLabels"] = ["dataTable"], ["columnUnits"] = ["dataTable"], ["pageTitle"] = ["heading"]
    };
    private const int MaxColumnMaps = 20;
    private static readonly Regex ColumnLabelItem = new(@"^[^=]{1,128}=[^=]{1,60}\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex ColumnUnitItem = new(@"^[^=]{1,128}=[^=]{1,128}\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static bool ValidItems(JsonElement props, string key, Regex item, int max) => !props.TryGetProperty(key, out var value)
        || value.ValueKind == JsonValueKind.Array && value.GetArrayLength() is >= 1 && value.GetArrayLength() <= max && value.EnumerateArray().All(x => MatchesSafely(item, x));
    private const int MaxValueLabels = 40;
    /// <summary>"kolon:değer=Etiket" (değer boş olabilir); hücrede ve bağlam panelinde ham değer yerine etiket yazılır.</summary>
    private static readonly Regex ValueLabelItem = new(@"^[^=:]{1,128}:[^=]{0,60}=[^=]{1,60}\z", RegexOptions.CultureInvariant, RegexTimeout);
    /// <summary>"genişlik=koşul": koşul tutunca bileşenin sütun genişliği (1–12) bu değer olur.</summary>
    private static readonly Regex WidthWhenItem = new(@"^([1-9]|1[0-2])=(.+)\z", RegexOptions.CultureInvariant | RegexOptions.Singleline, RegexTimeout);

    private static bool IsStaticTextUpTo(JsonElement value, int max) => value.ValueKind == JsonValueKind.String && value.GetString()!.Length <= max;

    /// <summary>A non-empty array of 1–<paramref name="max"/> distinct non-empty strings.</summary>
    private static bool TryReadIds(JsonElement value, int max, out List<string> ids)
    {
        ids = [];
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() is < 1 || value.GetArrayLength() > max) return false;
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(item.GetString())) return false;
            ids.Add(item.GetString()!);
        }
        return ids.Distinct(StringComparer.Ordinal).Count() == ids.Count;
    }

    /// <summary>Result column codes of an operation query; null for SQL queries (not checked).</summary>
    private static IReadOnlyList<string>? OperationColumns(string queryId, Context context) =>
        context.QueryById.TryGetValue(queryId, out var query) && query.Operation is { } operation && context.Lookup(operation, out var found)
            ? found.Result.Columns.Select(x => x.Code).ToArray() : null;

    /// <summary>v2 props added in Proje 2 Faz B; id references are collected here and resolved after the component loop.</summary>
    private static bool ValidateFazBProps(JsonElement props, string id, string? name, string typeText, Context context, out string? error)
    {
        error = null;
        foreach (var prop in props.EnumerateObject())
            if (FazBPropTypes.TryGetValue(prop.Name, out var types) && !types.Contains(typeText, StringComparer.Ordinal))
            { error = $"'{prop.Name}' özelliği bu bileşen türünde kullanılamaz."; return false; }
        return typeText switch
        {
            "actionBar" or "dialog" or "button" when !ValidateSequenceProps(props, id, typeText, context, out error) => false,
            "button" => ValidateButtonFazBProps(props, id, name, context, out error),
            "dataTable" when props.TryGetProperty("valueLabels", out var valueLabels) && !(valueLabels.ValueKind == JsonValueKind.Array
                && valueLabels.GetArrayLength() is >= 1 and <= MaxValueLabels && valueLabels.EnumerateArray().All(x => MatchesSafely(ValueLabelItem, x))) =>
                Fail($"'valueLabels' 1–{MaxValueLabels} adet kolon:değer=Etiket öğesi içermelidir.", out error),
            "dataTable" when !ValidItems(props, "columnLabels", ColumnLabelItem, MaxColumnMaps) =>
                Fail($"'columnLabels' 1–{MaxColumnMaps} adet kolon=Başlık öğesi içermelidir.", out error),
            "dataTable" when !ValidItems(props, "columnUnits", ColumnUnitItem, MaxColumnMaps) =>
                Fail($"'columnUnits' 1–{MaxColumnMaps} adet kolon=birimKolonu öğesi içermelidir.", out error),
            "dataTable" => ValidateTableFazBProps(props, id, name, context, out error),
            "editableGrid" => ValidateGridProps(props, id, name, context, out error),
            "customFieldsBlock" => ValidateCustomFieldsBlock(props, id, name, context, out error),
            "dialog" => ValidateDialogProps(props, id, context, out error),
            "image" => ValidateImageProps(props, out error),
            "heading" when props.TryGetProperty("pageTitle", out var pageTitle) && !IsBool(pageTitle) =>
                Fail("'pageTitle' true veya false olmalıdır.", out error),
            "formCard" when props.TryGetProperty("trackChanges", out var track) && !IsBool(track) =>
                Fail("'trackChanges' true veya false olmalıdır.", out error),
            "formCard" when props.TryGetProperty("layout", out var layout) && !(layout.ValueKind == JsonValueKind.String && layout.GetString() is "grid" or "inline") =>
                Fail("Form kartının 'layout' değeri \"grid\" veya \"inline\" olmalıdır.", out error),
            _ => true
        };
    }

    private static bool Fail(string message, out string? error) { error = message; return false; }

    private static bool ValidateSequenceProps(JsonElement props, string id, string typeText, Context context, out string? error)
    {
        error = null;
        var hasSequence = props.TryGetProperty("saveSequence", out var sequence);
        if (typeText == "button")
        {
            var isSequenceButton = StringOf(props, "actionType") == "sequence";
            if (!isSequenceButton)
            {
                if (hasSequence) return Fail("'saveSequence' yalnız İşlem Çubuğu, pencere ve kayıt dizisi (sequence) düğmesinde kullanılabilir.", out error);
            }
            else
            {
                if (props.TryGetProperty("queryId", out _)) return Fail("Kayıt dizisi düğmesinde 'queryId' kullanılamaz.", out error);
                if (!hasSequence) return Fail("Kayıt dizisi düğmesi için 'saveSequence' gerekli.", out error);
            }
        }
        foreach (var key in new[] { "stopOnError", "sequenceWhen" })
            if (!hasSequence && props.TryGetProperty(key, out _))
            { error = $"'{key}' yalnız 'saveSequence' ile kullanılabilir."; return false; }
        if (!hasSequence) return true;
        if (props.TryGetProperty("saveQuery", out _)) return Fail("'saveSequence' ve 'saveQuery' birlikte kullanılamaz.", out error);
        if (!TryReadIds(sequence, MaxSequenceSteps, out var steps)
            || steps.Any(step => !context.QueryKinds.TryGetValue(step, out var kind) || kind == "read"))
            return Fail("'saveSequence' 1–8 adet farklı yazma sorgusu kimliği içermelidir.", out error);
        if (props.TryGetProperty("stopOnError", out var stopOnError) && !IsBool(stopOnError))
            return Fail("'stopOnError' true veya false olmalıdır.", out error);
        if (props.TryGetProperty("sequenceWhen", out var when))
        {
            if (when.ValueKind != JsonValueKind.Array || when.GetArrayLength() > MaxSequenceWhen)
                return Fail($"'sequenceWhen' en fazla {MaxSequenceWhen} adet sorguKimliği=koşul öğesi içermelidir.", out error);
            foreach (var item in when.EnumerateArray())
            {
                Match match;
                try { match = item.ValueKind == JsonValueKind.String ? SequenceWhenItem.Match(item.GetString()!) : Match.Empty; }
                catch (RegexMatchTimeoutException) { match = Match.Empty; }
                if (!match.Success) return Fail("'sequenceWhen' öğeleri sorguKimliği=koşul biçiminde olmalıdır.", out error);
                var step = match.Groups[1].Value;
                if (!steps.Contains(step, StringComparer.Ordinal)) return Fail($"'sequenceWhen' adımı dizide yok: {step}", out error);
                if (!PageConditionExpression.TryParse(match.Groups[2].Value, out var roots, out var reason))
                    return Fail($"'sequenceWhen' koşulu geçersiz: {reason}", out error);
                // Conditions are evaluated once, before the first step: there is no previous step result yet.
                if (roots.Any(root => string.Equals(root, "onceki", StringComparison.OrdinalIgnoreCase)))
                    return Fail("'sequenceWhen' koşulu 'onceki' kullanamaz; adımlar başlamadan değerlendirilir.", out error);
                context.PendingConditionRoots.Add(("sequenceWhen", roots));
            }
        }
        context.PendingSequences.Add((id, steps));
        return true;
    }

    private static bool ValidateButtonFazBProps(JsonElement props, string id, string? name, Context context, out string? error)
    {
        error = null;
        var actionType = StringOf(props, "actionType") ?? "";
        context.ButtonActionTypes[id] = actionType;
        var hasPrompt = props.TryGetProperty("promptLabel", out _);
        if (hasPrompt)
        {
            if (actionType is not ("query" or "sequence"))
                return Fail("'promptLabel' yalnız sorgu (query) veya kayıt dizisi (sequence) düğmesinde kullanılabilir.", out error);
            if (name is null) return Fail($"Gerekçe soran düğmenin adı olmalıdır: {id}", out error);
        }
        if (props.TryGetProperty("promptRequired", out var promptRequired))
        {
            if (!hasPrompt) return Fail("'promptRequired' için 'promptLabel' de tanımlı olmalıdır.", out error);
            if (!IsBool(promptRequired)) return Fail("'promptRequired' true veya false olmalıdır.", out error);
        }
        var hasDialog = props.TryGetProperty("dialogId", out var dialogId);
        if (actionType == "openDialog")
        {
            if (!hasDialog || dialogId.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(dialogId.GetString()))
                return Fail("Pencere açan düğme için 'dialogId' gerekli.", out error);
            context.PendingDialogRefs.Add(dialogId.GetString()!);
        }
        else if (hasDialog) return Fail("'dialogId' yalnız pencere açan (openDialog) düğmede kullanılabilir.", out error);
        return true;
    }

    private static bool ValidateTableFazBProps(JsonElement props, string id, string? name, Context context, out string? error)
    {
        error = null;
        var hasQuery = props.TryGetProperty("query", out var query) && query.ValueKind == JsonValueKind.String;
        if (props.TryGetProperty("rowActions", out var rowActions))
        {
            if (!TryReadIds(rowActions, MaxRowActions, out var ids))
                return Fail("'rowActions' 1–4 adet sorgu, kayıt dizisi, pencere, bağlantı, ERP ekranı veya sayfa düğmesi içermelidir.", out error);
            if (name is null) return Fail($"Satır işlemleri için veri listesinin adı olmalıdır: {id}", out error);
            if (!hasQuery) return Fail($"Satır işlemleri yalnız sorguya bağlı veri listesinde kullanılabilir: {id}", out error);
            context.PendingRowActions.Add((id, ids));
        }
        if (props.TryGetProperty("emptyText", out var emptyText) && !IsStaticTextUpTo(emptyText, 120))
            return Fail("'emptyText' en fazla 120 karakterlik metin olmalıdır.", out error);
        if (props.TryGetProperty("limit", out var limit))
        {
            if (props.TryGetProperty("paging", out _)) return Fail("'limit' sunucu sayfalı listede kullanılamaz.", out error);
            if (!hasQuery || !IsIntIn(limit, 1, 100))
                return Fail("'limit' yalnız sorguya bağlı veri listesinde 1–100 arasında bir tam sayı olabilir.", out error);
        }
        return true;
    }

    private static bool ValidateGridProps(JsonElement props, string id, string? name, Context context, out string? error)
    {
        error = null;
        var mode = StringOf(props, "gridMode");
        if (mode is not ("stage" or "list" or "matrix")) return Fail("'gridMode' stage, list veya matrix olmalıdır.", out error);
        if (name is null) return Fail($"Düzenlenebilir tablonun adı olmalıdır: {id}", out error);
        var stage = mode == "stage";
        var matrix = mode == "matrix";
        string? sourceQuery = null;
        var hasSource = props.TryGetProperty("sourceQuery", out var source);
        if (stage != hasSource || hasSource && (source.ValueKind != JsonValueKind.String || !context.IsReadQuery(source.GetString())))
            return Fail("'sourceQuery' yalnız stage kipinde ve sayfadaki bir okuma sorgusu olabilir.", out error);
        if (hasSource) sourceQuery = source.GetString();
        if (props.TryGetProperty("rowKey", out var rowKey))
        {
            if (!stage) return Fail("'rowKey' yalnız stage kipinde kullanılabilir.", out error);
            if (rowKey.ValueKind != JsonValueKind.String || rowKey.GetString()!.Length is < 1 or > 128)
                return Fail("'rowKey' 1–128 karakterlik sütun adı olmalıdır.", out error);
            if (OperationColumns(sourceQuery!, context) is { } sourceColumns && !sourceColumns.Contains(rowKey.GetString(), StringComparer.Ordinal))
                return Fail($"'rowKey' kaynak sorgunun sütunu olmalıdır: {rowKey.GetString()}", out error);
        }
        var columns = new List<string>();
        var hasColumns = props.TryGetProperty("gridColumns", out var gridColumns);
        if (matrix)
        {
            foreach (var key in new[] { "gridColumns", "maxRows", "fixedRowLabel" })
                if (props.TryGetProperty(key, out _)) { error = $"'{key}' varyant (matrix) kipinde kullanılamaz."; return false; }
            if (!props.TryGetProperty("matrixCode", out _) || !props.TryGetProperty("matrixName", out _))
                return Fail("Varyant tablosu için 'matrixCode' ve 'matrixName' gerekli.", out error);
        }
        else
        {
            foreach (var key in new[] { "matrixCode", "matrixName" })
                if (props.TryGetProperty(key, out _)) { error = $"'{key}' yalnız varyant (matrix) kipinde kullanılabilir."; return false; }
            if (!hasColumns || gridColumns.ValueKind != JsonValueKind.Array || gridColumns.GetArrayLength() is < 1 or > MaxGridColumns)
                return Fail($"'gridColumns' 1–{MaxGridColumns} adet sütun tanımı içermelidir.", out error);
            foreach (var item in gridColumns.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.String) return Fail("'gridColumns' öğesi geçersiz: metin değil", out error);
                if (!GridColumnSpec.TryParse(item.GetString()!, out var code, out _, out var reason))
                    return Fail($"'gridColumns' öğesi geçersiz: {reason} ({item.GetString()})", out error);
                if (columns.Contains(code, StringComparer.Ordinal)) return Fail($"'gridColumns' sütun kodları benzersiz olmalıdır: {code}", out error);
                columns.Add(code);
            }
            if (props.TryGetProperty("maxRows", out var maxRows) && !IsIntIn(maxRows, 1, 200))
                return Fail("'maxRows' 1 ile 200 arasında bir tam sayı olmalıdır.", out error);
        }
        if (props.TryGetProperty("addLabel", out var addLabel) && !IsStaticTextUpTo(addLabel, 40))
            return Fail("'addLabel' en fazla 40 karakterlik metin olmalıdır.", out error);
        context.GridModesByName[name] = new GridInfo(id, name, mode, columns, sourceQuery);
        return true;
    }

    private static bool ValidateCustomFieldsBlock(JsonElement props, string id, string? name, Context context, out string? error)
    {
        error = null;
        if (name is null) return Fail($"Özel alanlar bloğunun adı olmalıdır: {id}", out error);
        foreach (var (key, required, columns, message) in new[]
        {
            ("definitionsQuery", true, new[] { "code", "label", "dataType" }, "'definitionsQuery' sorgusunun sonucu code, label ve dataType sütunlarını içermelidir."),
            ("valuesQuery", false, new[] { "code", "value" }, "'valuesQuery' sorgusunun sonucu code ve value sütunlarını içermelidir.")
        })
        {
            if (!props.TryGetProperty(key, out var query))
            {
                if (required) { error = $"'{key}' sayfadaki bir okuma sorgusu olmalıdır."; return false; }
                continue;
            }
            if (query.ValueKind != JsonValueKind.String || !context.IsReadQuery(query.GetString()))
            { error = $"'{key}' sayfadaki bir okuma sorgusu olmalıdır: {(query.ValueKind == JsonValueKind.String ? query.GetString() : "?")}"; return false; }
            if (OperationColumns(query.GetString()!, context) is { } resultColumns && columns.Any(x => !resultColumns.Contains(x, StringComparer.Ordinal)))
            { error = message; return false; }
        }
        context.CustomFieldBlocks[name] = props.TryGetProperty("valuesQuery", out var valuesQuery) ? valuesQuery.GetString() : null;
        return true;
    }

    private static bool ValidateDialogProps(JsonElement props, string id, Context context, out string? error)
    {
        error = null;
        if (!props.TryGetProperty("contains", out var contains) || !TryReadIds(contains, MaxDialogContains, out var ids))
            return Fail($"'contains' 1–{MaxDialogContains} adet farklı bileşen kimliği içermelidir.", out error);
        if (props.TryGetProperty("presentation", out _) && StringOf(props, "presentation") is not ("dialog" or "drawer"))
            return Fail("'presentation' dialog veya drawer olmalıdır.", out error);
        if (props.TryGetProperty("saveLabel", out var saveLabel) && !IsStaticTextUpTo(saveLabel, 40))
            return Fail("'saveLabel' en fazla 40 karakterlik metin olmalıdır.", out error);
        foreach (var key in new[] { "closeOnSave", "resetOnOpen" })
            if (props.TryGetProperty(key, out var flag) && !IsBool(flag)) { error = $"'{key}' true veya false olmalıdır."; return false; }
        context.PendingDialogContains.Add((id, ids));
        return true;
    }

    private static bool ValidateImageProps(JsonElement props, out string? error)
    {
        error = null;
        if (props.TryGetProperty("height", out var height) && !IsIntIn(height, 40, 400))
            return Fail("'height' 40 ile 400 arasında bir tam sayı olmalıdır.", out error);
        if (props.TryGetProperty("fit", out _) && StringOf(props, "fit") is not ("contain" or "cover"))
            return Fail("'fit' contain veya cover olmalıdır.", out error);
        return true;
    }

    /// <summary>
    /// Post-loop checks of Faz B references, after <see cref="ResolveFazAReferences"/> and sharing its <paramref name="owners"/>:
    /// dialog contents then row actions are owned by id, collection bindings resolve to grids and blocks, and grid-iterating
    /// queries and save sequences are checked.
    /// </summary>
    private static bool ResolveFazBReferences(Context context, Dictionary<string, string> owners, out string? error)
    {
        error = null;
        foreach (var dialogId in context.PendingDialogRefs)
            if (!context.ComponentTypesById.TryGetValue(dialogId, out var type) || type != "dialog")
                return Fail($"Açılacak pencere sayfada yok: {dialogId}", out error);
        foreach (var (dialogId, ids) in context.PendingDialogContains)
            foreach (var ownedId in ids)
            {
                if (!context.ComponentTypesById.TryGetValue(ownedId, out var type)) return Fail($"Pencerenin bileşeni sayfada yok: {ownedId}", out error);
                if (!context.TopLevelIds.Contains(ownedId)) return Fail($"Pencereler yalnız üst düzey bileşenleri içerebilir: {ownedId}", out error);
                if (type is "dialog" or "actionBar") return Fail($"Pencere pencere veya İşlem Çubuğu içeremez: {ownedId}", out error);
                if (!owners.TryAdd(ownedId, dialogId)) return Fail($"'{ownedId}' birden fazla sekmede veya yerleşimde kullanılamaz.", out error);
            }
        var menuButtons = context.PendingActionRefs.Where(x => x.Property == "moreButtons").Select(x => x.ComponentId).ToHashSet(StringComparer.Ordinal);
        foreach (var (tableId, ids) in context.PendingRowActions)
            foreach (var buttonId in ids)
            {
                if (!context.ButtonActionTypes.TryGetValue(buttonId, out var actionType) || actionType is not ("query" or "sequence" or "openDialog" or "link" or "erpPage" or "page"))
                    return Fail("'rowActions' 1–4 adet sorgu, kayıt dizisi, pencere, bağlantı, ERP ekranı veya sayfa düğmesi içermelidir.", out error);
                if (menuButtons.Contains(buttonId)) return Fail($"Satır işlemi düğmesi İşlem Çubuğu menüsünde kullanılamaz: {buttonId}", out error);
                if (!owners.TryAdd(buttonId, tableId)) return Fail($"'{buttonId}' birden fazla sekmede veya yerleşimde kullanılamaz.", out error);
            }
        return ResolveCollectionBindings(context, out error) && ResolveGridIteration(context, out error) && ResolveSequences(context, out error);
    }

    private static bool ResolveCollectionBindings(Context context, out string? error)
    {
        error = null;
        foreach (var (queryName, parameterName, kind, root, _) in context.PendingCollectionBindings)
        {
            if (kind == "map")
            {
                if (!context.CustomFieldBlocks.TryGetValue(root, out var valuesQueryId))
                    return Fail($"'{queryName}' sorgusundaki '{parameterName}' parametresi bir özel alanlar bloğuna bağlanmalıdır.", out error);
                // The body map is the operation's whole value set: the block must show the very source read it is merged over,
                // otherwise untouched codes would be sent as "" and wipe the stored values.
                var mapQuery = context.QueryById.Values.First(x => x.Name == queryName);
                if (mapQuery.Operation is { } mapOperationName && context.Lookup(mapOperationName, out var mapOperation)
                    && mapOperation.BodyMap is { } bodyMap && string.Equals(bodyMap.Property, parameterName, StringComparison.Ordinal)
                    && (valuesQueryId is null || !context.QueryById.TryGetValue(valuesQueryId, out var valuesRead)
                        || !string.Equals(valuesRead.Operation, bodyMap.SourceOperation, StringComparison.Ordinal)))
                    return Fail($"'{queryName}' sorgusundaki '{parameterName}' parametresi: '{root}' bloğunun 'valuesQuery' sorgusu '{bodyMap.SourceOperation}' okuma sorgusu olmalıdır; aksi halde kayıtlı özel alan değerleri silinebilir.", out error);
                continue;
            }
            if (!context.GridModesByName.TryGetValue(root, out var grid) || grid.Mode is not ("list" or "matrix"))
                return Fail($"'{queryName}' sorgusundaki '{parameterName}' parametresi listeli veya varyant kipinde bir düzenlenebilir tabloya bağlanmalıdır.", out error);
            var query = context.QueryById.Values.First(x => x.Name == queryName);
            var items = query.Operation is { } operationName && context.Lookup(operationName, out var operation)
                ? operation.Parameters.FirstOrDefault(x => x.Name == parameterName)?.Items ?? [] : [];
            if (grid.Mode == "matrix")
            {
                if (new[] { "code", "name", "attributes" }.Any(code => !items.Any(x => x.Code == code)))
                    return Fail($"'{queryName}' sorgusundaki '{parameterName}' parametresinin alanları varyant tablosu için code, name ve attributes içermelidir.", out error);
                continue;
            }
            foreach (var code in grid.Columns)
            {
                var item = items.FirstOrDefault(x => x.Code == GridColumnSpec.RootOf(code));
                // A dotted column writes into a map item; a plain column into a scalar item.
                if (item is null || code.Contains('.') != (item.DataType == "map"))
                    return Fail($"'{grid.Name}' tablosunun '{code}' sütunu '{parameterName}' parametresinin alanlarında yok.", out error);
            }
        }
        return true;
    }

    /// <summary>
    /// A parameter bound to <c>{{grid.eklenenSatir.x}}</c> / <c>{{grid.silinenSatir.x}}</c> makes its query run once per staged row
    /// of a stage grid. Such a query iterates one (grid, list) pair and runs only as a save-sequence step.
    /// </summary>
    private static bool ResolveGridIteration(Context context, out string? error)
    {
        error = null;
        foreach (var query in context.QueryById.Values)
        {
            var pairs = new HashSet<(string, string)>();
            foreach (var parameter in query.Parameters)
            {
                Match match;
                try { match = TenantCustomPageQueries.TryParseBinding(parameter.Binding, out var path) ? IterationBindingPath.Match(path) : Match.Empty; }
                catch (RegexMatchTimeoutException) { match = Match.Empty; }
                if (!match.Success) continue;
                var (root, list, column) = (match.Groups[1].Value, match.Groups[2].Value, match.Groups[3].Value);
                if (!context.GridModesByName.TryGetValue(root, out var grid) || grid.Mode != "stage")
                    return Fail($"'{query.Name}' sorgusundaki '{parameter.Name}' parametresi stage kipinde bir düzenlenebilir tabloya bağlanmalıdır.", out error);
                pairs.Add((root, list));
                if (pairs.Count > 1) return Fail($"'{query.Name}' adımı en fazla bir ızgara listesini dolaşabilir.", out error);
                // Removed rows are source rows: any source column (unchecked for SQL sources); added rows carry the grid columns.
                var known = grid.Columns.Contains(column, StringComparer.Ordinal)
                    || list == "silinenSatir" && (OperationColumns(grid.SourceQuery!, context) is not { } sourceColumns || sourceColumns.Contains(column, StringComparer.Ordinal));
                if (!known)
                    return Fail($"'{query.Name}' sorgusundaki '{parameter.Name}' parametresi '{grid.Name}' tablosunda olmayan bir sütuna bağlı: {column}", out error);
            }
            if (pairs.Count > 0 && context.DirectWriteQueries.Contains(query.Id))
                return Fail($"'{query.Name}' sorgusu ızgara satırlarına bağlı; yalnız kayıt dizisinde kullanılabilir.", out error);
        }
        return true;
    }

    /// <summary>
    /// A second step that starts from the source record would send the pre-sequence rowVersion and fail with a conflict.
    /// </summary>
    private static bool ResolveSequences(Context context, out string? error)
    {
        error = null;
        foreach (var (_, steps) in context.PendingSequences)
        {
            var sourceBacked = steps.Count(step => context.QueryById.TryGetValue(step, out var query) && query.Operation is { } operationName
                && context.Lookup(operationName, out var operation) && operation.SourceOperation is not null);
            if (sourceBacked > 1) return Fail("Bir kayıt dizisinde kaynak kayıttan başlayan en fazla bir adım olabilir.", out error);
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
