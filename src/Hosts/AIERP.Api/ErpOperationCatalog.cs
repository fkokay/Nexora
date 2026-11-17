using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Claims;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;

namespace AIERP.Api;

internal sealed record ErpOperationParameter(string Name, string In, string Type, bool Required);
internal sealed record ErpOperationColumn(string Code, string Label, string DataType);
internal sealed record ErpOperationResult(string Shape, string? RowsPath, IReadOnlyList<ErpOperationColumn> Columns);
internal sealed record ErpOperation(string Name, string Label, string Module, string Kind, string PageKind, string Method, string Route,
    IReadOnlyList<ErpOperationParameter> Parameters, ErpOperationResult Result, string? SourceOperation,
    IReadOnlyDictionary<string, object?>? FixedBody, string Since, bool Deprecated = false);

/// <summary>Wire form of a catalog entry: the operation plus whether the caller may run it.</summary>
internal sealed record ErpOperationView(string Name, string Label, string Module, string Kind, string PageKind, string Method, string Route,
    IReadOnlyList<ErpOperationParameter> Parameters, ErpOperationResult Result, string? SourceOperation,
    IReadOnlyDictionary<string, object?>? FixedBody, string Since, bool Deprecated, bool Allowed);

/// <summary>
/// Named ERP operations that custom pages may bind to instead of SQL. Each entry describes an existing API endpoint; the
/// page runtime calls that endpoint with the user's own token, so no new privilege is created. Names are stable forever:
/// entries are only added or marked deprecated, never removed or renamed (<c>ErpOperationCatalog.names.txt</c> in the
/// integration tests enforces this). If an operation's contract has to change, add a new name.
/// </summary>
internal static class ErpOperationCatalog
{
    private const string Since = "2026-11-18";
    private const string StockModule = "Stok";
    private const string ReportModule = "Raporlar";
    private const string StockItemRoute = "/api/stock/items/{id}";
    private const string StockItemRead = "stok.kart.getir";

    private static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["id"] = "Kimlik", ["code"] = "Kod", ["name"] = "Ad", ["barcode"] = "Barkod", ["unitCode"] = "Birim",
        ["category"] = "Kategori", ["minimumStock"] = "Minimum stok", ["isActive"] = "Etkin", ["createdAt"] = "Oluşturulma",
        ["rowVersion"] = "Satır sürümü", ["trackingMode"] = "İzleme türü", ["procurementLeadTimeDays"] = "Tedarik süresi (gün)",
        ["manufacturingLeadTimeDays"] = "Üretim süresi (gün)", ["purchaseListPrice"] = "Alış liste fiyatı",
        ["salesListPrice"] = "Satış liste fiyatı", ["priceCurrencyCode"] = "Fiyat para birimi", ["purchaseVatPercent"] = "Alış KDV %",
        ["salesVatPercent"] = "Satış KDV %", ["exciseTaxPercent"] = "ÖTV %", ["communicationTaxPercent"] = "ÖİV %",
        ["purchaseDiscountPercent"] = "Alış iskonto %", ["salesDiscountPercent"] = "Satış iskonto %", ["maximumStock"] = "Maksimum stok",
        ["reorderPoint"] = "Yeniden sipariş noktası", ["safetyStock"] = "Emniyet stoku", ["netWeight"] = "Net ağırlık",
        ["grossWeight"] = "Brüt ağırlık", ["length"] = "Uzunluk", ["width"] = "Genişlik", ["height"] = "Yükseklik",
        ["productImageUrl"] = "Ürün görseli", ["purchaseAccountCode"] = "Alış hesap kodu", ["salesAccountCode"] = "Satış hesap kodu",
        ["costAccountCode"] = "Maliyet hesap kodu", ["marketplaceProductId"] = "Pazaryeri ürün kimliği",
        ["parentStockItemId"] = "Ana stok kartı", ["isVariantParent"] = "Varyant ana kartı", ["withholdingTaxPercent"] = "Tevkifat %",
        ["stampTaxPercent"] = "Damga vergisi %",
        ["entryDate"] = "Hareket tarihi", ["direction"] = "Yön", ["quantity"] = "Miktar", ["description"] = "Açıklama",
        ["reversalOfId"] = "Ters kaydı yapılan hareket", ["isReversal"] = "Ters kayıt", ["hasReversal"] = "Ters kaydı var",
        ["unitCostBase"] = "Birim maliyet", ["enteredQuantity"] = "Girilen miktar", ["enteredUnitCode"] = "Girilen birim",
        ["storageLocationId"] = "Konum kimliği", ["storageLocationCode"] = "Konum kodu", ["storageLocationName"] = "Konum adı",
        ["warehouseId"] = "Depo kimliği", ["warehouseCode"] = "Depo kodu", ["warehouseName"] = "Depo adı",
        ["definitionId"] = "Tanım kimliği", ["label"] = "Etiket", ["dataType"] = "Veri türü", ["maxLength"] = "En fazla uzunluk",
        ["definitionVersion"] = "Tanım sürümü", ["isRequired"] = "Zorunlu", ["value"] = "Değer", ["version"] = "Sürüm",
        ["q"] = "Arama", ["page"] = "Sayfa", ["pageSize"] = "Sayfa boyutu"
    };

    // Declared before Operations: static fields initialize in textual order and Build() uses it.
    private static readonly ErpOperationResult None = new("none", null, []);
    private static readonly IReadOnlyList<ErpOperation> Operations = Build();
    private static readonly IReadOnlyDictionary<string, ErpOperation> ByName = Operations.ToDictionary(x => x.Name, StringComparer.Ordinal);

    internal static IReadOnlyList<ErpOperation> All => Operations;

    internal static bool TryGet(string name, out ErpOperation operation)
    {
        if (name is not null && ByName.TryGetValue(name, out var found)) { operation = found; return true; }
        operation = null!;
        return false;
    }

    /// <summary>Route pattern without constraints and trailing slash: <c>/api/stock/items/{id:guid}/</c> → <c>/api/stock/items/{id}</c>.</summary>
    internal static string NormalizeRoutePattern(string? rawText) =>
        Regex.Replace(rawText ?? "", @"\{([^}:=?]+)[^}]*\}", "{$1}").TrimEnd('/');

    private static IReadOnlyList<ErpOperation> Build()
    {
        var stockItemColumns = Columns<StockItemView>();
        var id = Route("id");
        var paging = new[] { Query("page", "int"), Query("pageSize", "int") };
        var stateChangeBody = new Dictionary<string, object?>(StringComparer.Ordinal) { ["confirmation"] = true };
        var operations = new List<ErpOperation>
        {
            Read("stok.kart.listele", "Stok kartlarını listele", "/api/stock/items", [Query("q", "text"), .. paging],
                List(stockItemColumns, "items")),
            Read(StockItemRead, "Stok kartı getir", StockItemRoute, [id], new ErpOperationResult("record", null, stockItemColumns)),
            Write("stok.kart.olustur", "Stok kartı oluştur", "insert", "POST", "/api/stock/items",
                BodyParameters<StockItemWriteRequest>(sourceBacked: false), Record(stockItemColumns), null, null),
            // Update and state changes return the updated StockItemView; unbound body fields come from the source read.
            Write("stok.kart.guncelle", "Stok kartı güncelle", "update", "PUT", StockItemRoute,
                [id, .. BodyParameters<StockItemUpdateRequest>(sourceBacked: true)], Record(stockItemColumns), StockItemRead, null),
            Write("stok.kart.sil", "Stok kartı sil", "delete", "DELETE", StockItemRoute, [id], None, null, null),
            // confirmation is fixed: a page cannot bind it to false, and it is not offered as a parameter.
            Write("stok.kart.pasifeAl", "Stok kartını pasife al", "update", "POST", StockItemRoute + "/deactivate",
                [id, .. BodyParameters<StockItemStateChangeRequest>(sourceBacked: true, exclude: "confirmation")],
                Record(stockItemColumns), StockItemRead, stateChangeBody),
            Write("stok.kart.aktifEt", "Stok kartını etkinleştir", "update", "POST", StockItemRoute + "/activate",
                [id, .. BodyParameters<StockItemStateChangeRequest>(sourceBacked: true, exclude: "confirmation")],
                Record(stockItemColumns), StockItemRead, stateChangeBody),
            Read("stok.kart.hareketleri", "Stok kartı hareketleri", "/api/stock/items/{stockItemId}/transactions",
                [Route("stockItemId"), .. paging], List(Columns<InventoryTransactionView>(), "items")),
            Read("stok.kart.varyantlari", "Stok kartı varyantları", StockItemRoute + "/variants", [id],
                List(Columns<StockItemVariantView>(), null)),
            Read("stok.kart.ozelAlanDegerleri", "Stok kartı özel alan değerleri", StockItemRoute + "/custom-fields", [id],
                List(Columns<StockCustomFieldValueView>(), null)),
            Read("stok.ozelAlanTanimlari", "Stok özel alan tanımları", "/api/stock/items/custom-fields", [],
                List(Columns<StockCustomFieldDefinitionView>(), null)),
            Read("stok.kategoriler", "Stok kategorileri", "/api/stock/categories", [], List(Columns<StockItemCategoryView>(), null)),
        };

        var reportSources = ReportEndpoints.CatalogSources(includeAdminSources: true).ToDictionary(x => x.Code, StringComparer.Ordinal);
        foreach (var source in ReportEndpoints.ReportSourcePermissions.Keys.OrderBy(x => x, StringComparer.Ordinal))
        {
            if (!reportSources.TryGetValue(source, out var report))
                throw new InvalidOperationException($"Rapor kaynağı katalogda yok: {source}");
            operations.Add(new ErpOperation($"rapor.{source}", "Rapor: " + report.Label, ReportModule, "read", "read", "POST", "/api/reports/run",
                [], new ErpOperationResult("list", "rows", report.Columns.Select(x => new ErpOperationColumn(x.Code, x.Label, x.DataType)).ToArray()),
                null, new Dictionary<string, object?>(StringComparer.Ordinal) { ["source"] = source, ["pageSize"] = 100 }, Since));
        }
        return operations;
    }

    private static ErpOperationResult List(IReadOnlyList<ErpOperationColumn> columns, string? rowsPath) => new("list", rowsPath, columns);
    private static ErpOperationResult Record(IReadOnlyList<ErpOperationColumn> columns) => new("record", null, columns);
    private static ErpOperationParameter Route(string name) => new(name, "route", "guid", true);
    private static ErpOperationParameter Query(string name, string type) => new(name, "query", type, false);

    private static ErpOperation Read(string name, string label, string route, IReadOnlyList<ErpOperationParameter> parameters, ErpOperationResult result) =>
        new(name, label, StockModule, "read", "read", "GET", route, parameters, result, null, null, Since);

    private static ErpOperation Write(string name, string label, string pageKind, string method, string route,
        IReadOnlyList<ErpOperationParameter> parameters, ErpOperationResult result, string? sourceOperation, IReadOnlyDictionary<string, object?>? fixedBody) =>
        new(name, label, StockModule, "write", pageKind, method, route, parameters, result, sourceOperation, fixedBody, Since);

    private static IReadOnlyList<ErpOperationColumn> Columns<T>() =>
        ScalarMembers<T>().Select(x => new ErpOperationColumn(x.Name, Label(x.Name), x.Type)).ToArray();

    /// <summary>
    /// Every scalar field of a request record. Required means non-nullable without a default; for an operation whose
    /// body starts from a source read (<paramref name="sourceBacked"/>) nothing is required because unbound fields keep
    /// the source record's values.
    /// </summary>
    private static IReadOnlyList<ErpOperationParameter> BodyParameters<T>(bool sourceBacked, params string[] exclude) =>
        ScalarMembers<T>().Where(x => !exclude.Contains(x.Name, StringComparer.Ordinal))
            .Select(x => new ErpOperationParameter(x.Name, "body", x.Type, !sourceBacked && x.Required)).ToArray();

    private static IEnumerable<(string Name, string Type, bool Required)> ScalarMembers<T>()
    {
        var nullability = new NullabilityInfoContext();
        var constructor = typeof(T).GetConstructors().OrderByDescending(x => x.GetParameters().Length).First();
        foreach (var parameter in constructor.GetParameters())
        {
            var type = DataType(parameter.ParameterType);
            if (type is null) continue;
            var nullable = Nullable.GetUnderlyingType(parameter.ParameterType) is not null
                || (!parameter.ParameterType.IsValueType && nullability.Create(parameter).WriteState == NullabilityState.Nullable);
            yield return (CamelCase(parameter.Name!), type, !nullable && !parameter.HasDefaultValue);
        }
    }

    private static string? DataType(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(Guid)) return "guid";
        if (type == typeof(string) || type == typeof(byte[]) || type.IsEnum) return "text";
        if (type == typeof(decimal) || type == typeof(double) || type == typeof(float)) return "decimal";
        if (type == typeof(int) || type == typeof(long) || type == typeof(short)) return "int";
        if (type == typeof(bool)) return "bool";
        if (type == typeof(DateOnly) || type == typeof(DateTime) || type == typeof(DateTimeOffset)) return "date";
        return null;
    }

    private static string CamelCase(string name) => char.ToLowerInvariant(name[0]) + name[1..];

    private static string Label(string code) => Labels.TryGetValue(code, out var label)
        ? label : throw new InvalidOperationException($"ERP işlem kataloğunda '{code}' alanının etiketi yok.");

    // Endpoint lookup by "METHOD normalized-route" → raw route pattern, built once per endpoint data source.
    private static readonly ConditionalWeakTable<EndpointDataSource, IReadOnlyDictionary<string, string>> RoutePatterns = new();

    internal static void MapErpOperationCatalogEndpoints(this WebApplication app)
    {
        app.MapGroup("/api/custom-pages").WithTags("Tenant Custom Pages").RequireAuthorization()
            .MapGet("/erp-operations", async (ClaimsPrincipal user, HttpContext context, EndpointDataSource endpoints,
                IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
            {
                if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)
                    || !Guid.TryParse(user.FindFirstValue("sub"), out var userId)) return Results.Forbid();
                var role = user.FindFirstValue("role");
                if (string.IsNullOrWhiteSpace(role)) return Results.Forbid();
                var patterns = RoutePatterns.GetValue(endpoints, BuildRoutePatterns);
                var views = new List<ErpOperationView>(Operations.Count);
                foreach (var op in Operations)
                {
                    var allowed = !op.Deprecated && await IsAllowedAsync(op, patterns, tenantId, userId, role, authorizer, context, ct);
                    views.Add(new ErpOperationView(op.Name, op.Label, op.Module, op.Kind, op.PageKind, op.Method, op.Route, op.Parameters,
                        op.Result, op.SourceOperation, op.FixedBody, op.Since, op.Deprecated, allowed));
                }
                return Results.Ok(new { operations = views });
            });
    }

    private static IReadOnlyDictionary<string, string> BuildRoutePatterns(EndpointDataSource source)
    {
        var patterns = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var endpoint in source.Endpoints.OfType<RouteEndpoint>())
        {
            var methods = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods;
            if (methods is null || endpoint.RoutePattern.RawText is not { } raw) continue;
            foreach (var method in methods) patterns.TryAdd($"{method} {NormalizeRoutePattern(raw)}", raw);
        }
        return patterns;
    }

    /// <summary>
    /// Mirrors the route permission check the endpoint itself would run for this user (fails closed when the endpoint or
    /// its permission cannot be resolved). Report operations also need the per-source read check of <c>/api/reports/run</c>.
    /// Handler-internal checks (for example TenantAdmin-only deletes) are not reflected here.
    /// </summary>
    private static async Task<bool> IsAllowedAsync(ErpOperation op, IReadOnlyDictionary<string, string> patterns, Guid tenantId, Guid userId,
        string role, IPlatformPermissionAuthorizer authorizer, HttpContext context, CancellationToken ct)
    {
        if (!patterns.TryGetValue($"{op.Method} {op.Route}", out var rawPattern)) return false;
        var routeValues = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var path = Regex.Replace(op.Route, @"\{([A-Za-z]+)\}", match =>
        {
            var parameter = op.Parameters.First(x => x.In == "route" && x.Name == match.Groups[1].Value);
            var value = parameter.Type == "guid" ? Guid.Empty.ToString("D") : "0";
            routeValues[parameter.Name] = value;
            return value;
        });
        if (!PlatformPermissionCatalog.TryResolve(path, op.Method, rawPattern, routeValues, tenantId, userId, role, out var resolved)
            || resolved is null) return false;
        if (!await authorizer.IsAllowedAsync(tenantId, userId, role, resolved, ct)) return false;
        if (op.Route == "/api/reports/run" && op.FixedBody?["source"] is string source)
        {
            if (source == "workflowInstances" && role != "TenantAdmin") return false;
            return await ReportEndpoints.CanReadReportSourceAsync(source, tenantId, userId, role, context, ct);
        }
        return true;
    }
}
