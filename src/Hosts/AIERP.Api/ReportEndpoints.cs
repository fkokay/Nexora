using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Linq.Expressions;
using System.Reflection;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class ReportEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly IReadOnlyList<ReportColumn> CustomerColumns =
    [
        new("code", "Cari kodu", "text"), new("name", "Cari adı", "text"), new("type", "Tür", "text", ["Customer", "Supplier", "Both"]),
        new("currencyCode", "Para birimi", "text"), new("riskLimit", "Risk limiti", "decimal"),
        new("paymentTermDays", "Vade (gün)", "number"), new("isActive", "Durum", "boolean"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> CustomerAggregates =
    [
        new("count", "Kayıt sayısı"), new("sumRiskLimit", "Risk limiti toplamı"), new("averageRiskLimit", "Ortalama risk limiti"),
        new("sumPaymentTermDays", "Vade günü toplamı"), new("averagePaymentTermDays", "Ortalama vade günü")
    ];
    private static readonly IReadOnlyList<ReportColumn> SalesInvoiceColumns =
    [
        new("code", "Fatura kodu", "text"), new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("invoiceDate", "Fatura tarihi", "date"), new("currencyCode", "Para birimi", "text"), new("status", "Durum", "text", ["Posted", "Voided"]),
        new("subtotal", "Ara toplam", "decimal"), new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> SalesInvoiceAggregates =
    [
        new("count", "Fatura sayısı"), new("sumGrandTotal", "Genel toplamların toplamı"), new("averageGrandTotal", "Ortalama fatura tutarı"),
        new("sumTaxTotal", "Vergi toplamı"), new("averageTaxTotal", "Ortalama vergi")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseOrderColumns =
    [
        new("code", "Sipariş kodu", "text"), new("supplierCode", "Tedarikçi kodu", "text"), new("supplierName", "Tedarikçi adı", "text"),
        new("orderDate", "Sipariş tarihi", "date"), new("currencyCode", "Para birimi", "text"),
        new("status", "Durum", "text", ["Open", "PartiallyReceived", "Received", "Cancelled"]),
        new("subtotal", "Ara toplam", "decimal"), new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> PurchaseOrderAggregates =
    [
        new("count", "Satın alma siparişi sayısı"), new("sumGrandTotal", "Sipariş genel toplamları"), new("averageGrandTotal", "Ortalama sipariş tutarı"),
        new("sumTaxTotal", "Sipariş vergi toplamı"), new("averageTaxTotal", "Ortalama sipariş vergisi")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseRequestColumns =
    [
        new("code", "Talep kodu", "text"), new("requesterUserId", "Talep sahibi kullanıcı kodu", "text"),
        new("requestDate", "Talep tarihi", "date"),
        new("neededByDate", "İhtiyaç tarihi", "date"), new("description", "Açıklama", "text"),
        new("status", "Durum", "text", ["Submitted", "Approved", "Rejected", "Ordered"]),
        new("createdAt", "Oluşturulma", "date"), new("reviewedAt", "İnceleme tarihi", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> PurchaseRequestAggregates =
    [ new("count", "Talep sayısı") ];
    private static readonly IReadOnlyList<ReportColumn> StockItemColumns =
    [
        new("code", "Stok kodu", "text"), new("name", "Stok adı", "text"), new("barcode", "Barkod", "text"),
        new("unitCode", "Birim", "text"), new("category", "Kategori", "text"), new("minimumStock", "Minimum stok", "decimal"),
        new("onHand", "Eldeki miktar", "decimal"), new("reserved", "Rezerve miktar", "decimal"), new("available", "Kullanılabilir miktar", "decimal"),
        new("trackingMode", "Takip türü", "text", ["None", "Lot", "Serial"]), new("isActive", "Durum", "boolean"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> StockItemAggregates =
    [
        new("count", "Stok kartı sayısı"), new("sumMinimumStock", "Minimum stok toplamı"), new("averageMinimumStock", "Ortalama minimum stok"),
        new("sumOnHand", "Eldeki miktar toplamı"), new("averageOnHand", "Ortalama eldeki miktar"),
        new("sumReserved", "Rezerve miktar toplamı"), new("averageReserved", "Ortalama rezerve miktar"),
        new("sumAvailable", "Kullanılabilir miktar toplamı"), new("averageAvailable", "Ortalama kullanılabilir miktar")
    ];

    public static void MapReportEndpoints(this WebApplication app)
    {
        var reports = app.MapGroup("/api/reports").WithTags("Tenant Report Builder").RequireAuthorization();

        reports.MapGet("/catalog", () => Results.Ok(new[]
        {
            new ReportSource("customers", "Cari hesaplar", CustomerColumns, CustomerAggregates),
            new ReportSource("salesInvoices", "Satış faturaları", SalesInvoiceColumns, SalesInvoiceAggregates),
            new ReportSource("purchaseOrders", "Satın alma siparişleri", PurchaseOrderColumns, PurchaseOrderAggregates),
            new ReportSource("purchaseRequests", "Satın alma talepleri", PurchaseRequestColumns, PurchaseRequestAggregates),
            new ReportSource("stockItems", "Stok kartları", StockItemColumns, StockItemAggregates)
        }));

        reports.MapGet("/", async (string? kind, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out _)) return Results.Forbid();
            if (!TrySavedKind(kind, "Report", out var normalizedKind))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["kind"] = ["Tür Report veya List olmalıdır."] });
            var saved = await db.TenantSavedReports.AsNoTracking().Where(x => x.TenantId == tenantId && x.Kind == normalizedKind)
                .OrderBy(x => x.Name).Take(200).ToListAsync(ct);
            return Results.Ok(saved.Select(ToView));
        });

        reports.MapPost("/run", async (ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct) =>
        {
            return await RunAsync(request, user, db, context, ct);
        });

        reports.MapPost("/export", async (ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct) =>
            await ExportAsync(request, user, db, context, ct));

        reports.MapPost("/", async (ReportSaveRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Rapor adı 1-120 karakter olmalıdır."] });
            if (!Validate(request.Definition, out var definition, out var errors)) return Results.ValidationProblem(errors!);
            if (!TrySavedKind(request.Kind, "Report", out var kind))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["kind"] = ["Tür Report veya List olmalıdır."] });
            if (kind == "List" && definition!.GroupByFields.Count > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition.groupByFields"] = ["Dinamik listeler gruplama içeremez."] });
            var name = request.Name.Trim();
            if (await db.TenantSavedReports.AnyAsync(x => x.TenantId == tenantId && x.Name == name, ct))
                return Results.Conflict(new { error = "Bu adla kayıtlı bir rapor zaten var." });
            var now = DateTimeOffset.UtcNow;
            var report = new TenantSavedReport
            {
                TenantId = tenantId, Name = name, Kind = kind, Source = definition!.Source, DefinitionJson = JsonSerializer.Serialize(definition, JsonOptions),
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantSavedReports.Add(report);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(kind, "created"), Resource = report.Name });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/reports/{report.Id}", ToView(report));
        });

        reports.MapPut("/{reportId:guid}", async (Guid reportId, ReportSaveRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var report = await db.TenantSavedReports.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Rapor adı 1-120 karakter olmalıdır."] });
            if (!Validate(request.Definition, out var definition, out var errors)) return Results.ValidationProblem(errors!);
            if (!TrySavedKind(request.Kind, report.Kind, out var kind))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["kind"] = ["Tür Report veya List olmalıdır."] });
            if (kind == "List" && definition!.GroupByFields.Count > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition.groupByFields"] = ["Dinamik listeler gruplama içeremez."] });
            var name = request.Name.Trim();
            if (await db.TenantSavedReports.AnyAsync(x => x.TenantId == tenantId && x.Id != reportId && x.Name == name, ct))
                return Results.Conflict(new { error = "Bu adla kayıtlı bir rapor zaten var." });
            report.Name = name; report.Kind = kind; report.Source = definition!.Source; report.DefinitionJson = JsonSerializer.Serialize(definition, JsonOptions);
            report.UpdatedByUserId = userId; report.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(kind, "updated"), Resource = report.Name });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(report));
        });

        reports.MapDelete("/{reportId:guid}", async (Guid reportId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var report = await db.TenantSavedReports.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            db.TenantSavedReports.Remove(report);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(report.Kind, "deleted"), Resource = report.Name });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        reports.MapPost("/{reportId:guid}/run", async (Guid reportId, ReportPageRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out _)) return Results.Forbid();
            var report = await db.TenantSavedReports.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            var definition = JsonSerializer.Deserialize<ReportRunRequest>(report.DefinitionJson, JsonOptions);
            if (definition is null) return Results.Problem("Kayıtlı rapor tanımı okunamadı.", statusCode: 500);
            return await RunAsync(definition with { Page = Math.Clamp(request.Page, 1, 100000), PageSize = Math.Clamp(request.PageSize, 1, 200) }, user, db, context, ct);
        });
    }

    private static async Task<IResult> RunAsync(ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        if (!Validate(request, out var normalized, out var errors)) return Results.ValidationProblem(errors!);
        if (normalized!.Source == "salesInvoices") return await RunSalesInvoicesAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseRequests") return await RunPurchaseRequestsAsync(normalized, user, db, context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized.Source == "purchaseOrders") return await RunPurchaseOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "stockItems") return await RunStockItemsAsync(normalized, user, db, ct);
        IQueryable<CustomerAccount> query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in normalized!.Filters)
            if (!TryApplyCustomerFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (normalized.GroupByFields.Count > 0)
        {
            var grouped = await AggregateAsync(query, normalized.GroupByFields, normalized.Aggregate!, normalized.Descending,
                (normalized.Page - 1) * normalized.PageSize, normalized.PageSize, ct);
            var groupBy = string.Join(',', normalized.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"customers:group:{groupBy}:{normalized.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult("customers", [], [], normalized.Page, normalized.PageSize, totalCount,
                normalized.GroupByFields.Count == 1 ? normalized.GroupByFields[0] : groupBy, normalized.Aggregate, grouped.Rows, grouped.TotalGroups, normalized.GroupByFields));
        }
        query = ApplySort(query, normalized.SortBy, normalized.Descending);
        var page = await query.Skip((normalized.Page - 1) * normalized.PageSize).Take(normalized.PageSize).ToListAsync(ct);
        var rows = page.Select(customer => (IReadOnlyDictionary<string, object?>)normalized.Columns.ToDictionary(
            code => code, code => ReadCustomerValue(customer, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "customers" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult("customers", normalized.Columns.Select(ColumnByCode).ToArray(), rows,
            normalized.Page, normalized.PageSize, totalCount));
    }

    private static async Task<IResult> ExportAsync(ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        if (!Validate(request, out var normalized, out var errors)) return Results.ValidationProblem(errors!);
        if (normalized!.Source == "salesInvoices") return await ExportSalesInvoicesAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseRequests") return await ExportPurchaseRequestsAsync(normalized, user, db, context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized.Source == "purchaseOrders") return await ExportPurchaseOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "stockItems") return await ExportStockItemsAsync(normalized, user, db, ct);
        IQueryable<CustomerAccount> query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in normalized!.Filters)
            if (!TryApplyCustomerFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        if (normalized.GroupByFields.Count > 0)
        {
            var grouped = await AggregateAsync(query, normalized.GroupByFields, normalized.Aggregate!, normalized.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var groupedCsv = new StringBuilder();
            var headers = normalized.GroupByFields.Select(code => ColumnByCode(code).Label).Append("Kayıt sayısı").ToList();
            if (normalized.Aggregate != "count") headers.Add(AggregateLabel(normalized.Aggregate!));
            groupedCsv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(header => Csv(header))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (normalized.Aggregate != "count") values.Add(CsvValue(row.Value));
                groupedCsv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"customers:group:{string.Join(',', normalized.GroupByFields)}:{grouped.Rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.File(Encoding.UTF8.GetBytes(groupedCsv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
        }
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplySort(query, normalized.SortBy, normalized.Descending).Take(10_000).ToListAsync(ct);
        var builder = new StringBuilder();
        builder.Append('\uFEFF').AppendLine(string.Join(',', normalized.Columns.Select(code => Csv(ColumnByCode(code).Label))));
        foreach (var row in rows)
            builder.AppendLine(string.Join(',', normalized.Columns.Select(code => CsvValue(ReadCustomerValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"customers:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(builder.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunStockItemsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<StockItemReportRow> query = StockItemReportRows(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyStockItemFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateStockItemsAsync(query, report.GroupByFields, report.Aggregate!, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            var joinedFields = string.Join(',', report.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"stockItems:group:{joinedFields}:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : joinedFields, report.Aggregate, grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyStockItemSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(item => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadStockItemValue(item, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "stockItems" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(StockItemColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportStockItemsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<StockItemReportRow> query = StockItemReportRows(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyStockItemFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateStockItemsAsync(query, report.GroupByFields, report.Aggregate!, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => StockItemColumnByCode(code).Label).Append("Stok kartı sayısı").ToList();
            if (report.Aggregate != "count") headers.Add(StockItemAggregateLabel(report.Aggregate!));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(header => Csv(header))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (report.Aggregate != "count") values.Add(CsvValue(row.Value));
                csv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"stockItems:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyStockItemSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(StockItemColumnByCode(code).Label))));
            foreach (var item in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadStockItemValue(item, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"stockItems:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static string CsvValue(object? value) => Csv(value switch
    {
        null => "",
        DateTimeOffset date => date.ToString("O", CultureInfo.InvariantCulture),
        bool boolean => boolean ? "true" : "false",
        IFormattable number => number.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? ""
    }, protectFormula: value is string);

    private static string Csv(string value, bool protectFormula = false)
    {
        if (protectFormula && value.Length > 0 && value[0] is '=' or '+' or '-' or '@' or '\t' or '\r') value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
    }

    private static async Task<IResult> RunPurchaseOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseOrder> query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Supplier);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseOrderFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseOrdersAsync(query, report.GroupByFields, report.Aggregate!, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            var groupBy = string.Join(',', report.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"purchaseOrders:group:{groupBy}:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : groupBy, report.Aggregate, grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyPurchaseOrderSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(order => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadPurchaseOrderValue(order, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseOrders" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseOrderColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportPurchaseOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseOrder> query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Supplier);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseOrderFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseOrdersAsync(query, report.GroupByFields, report.Aggregate!, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => PurchaseOrderColumnByCode(code).Label).Append("Sipariş sayısı").ToList();
            if (report.Aggregate != "count") headers.Add(PurchaseOrderAggregateLabel(report.Aggregate!));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(value => Csv(value))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (report.Aggregate != "count") values.Add(CsvValue(row.Value));
                csv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseOrders:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyPurchaseOrderSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseOrderColumnByCode(code).Label))));
            foreach (var order in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseOrderValue(order, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseOrders:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunPurchaseRequestsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseRequest> query = db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.purchase-requests.read", "erp.purchase-requests", query, x => x.Status, null, null, x => x.RequestedByUserId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseRequestFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseRequestsAsync(query, report.GroupByFields[0], report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"purchaseRequests:group:{report.GroupByFields[0]}:count" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields[0], "count", grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyPurchaseRequestSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(request => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadPurchaseRequestValue(request, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseRequests" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseRequestColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportPurchaseRequestsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseRequest> query = db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.purchase-requests.read", "erp.purchase-requests", query, x => x.Status, null, null, x => x.RequestedByUserId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseRequestFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseRequestsAsync(query, report.GroupByFields[0], report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            csv.Append('\uFEFF').AppendLine($"{Csv(PurchaseRequestColumnByCode(report.GroupByFields[0]).Label)},{Csv("Talep sayısı")}");
            foreach (var row in grouped.Rows) csv.AppendLine($"{CsvValue(row.GroupValue)},{CsvValue(row.RowCount)}");
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseRequests:group:{report.GroupByFields[0]}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyPurchaseRequestSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseRequestColumnByCode(code).Label))));
            foreach (var request in rows)
                csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseRequestValue(request, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseRequests:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<AggregatePage> AggregatePurchaseRequestsAsync(IQueryable<PurchaseRequest> query, string field,
        bool descending, int skip, int take, CancellationToken ct)
    {
        switch (field)
        {
            case "status":
            {
                var groups = query.GroupBy(x => x.Status).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key.ToString(), x.Count, x.Count)).ToArray(), total);
            }
            case "requesterUserId":
            {
                var groups = query.GroupBy(x => x.RequestedByUserId).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key.ToString("D"), x.Count, x.Count)).ToArray(), total);
            }
            case "requestDate":
            {
                var groups = query.GroupBy(x => x.RequestDate).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key, x.Count, x.Count)).ToArray(), total);
            }
            default:
            {
                var groups = query.GroupBy(x => x.Code).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key, x.Count, x.Count)).ToArray(), total);
            }
        }
    }

    private static async Task<IResult> RunSalesInvoicesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesInvoice> query = db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplyInvoiceFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateInvoicesAsync(query, report.GroupByFields, report.Aggregate!, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            var groupBy = string.Join(',', report.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"salesInvoices:group:{groupBy}:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : groupBy, report.Aggregate, grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyInvoiceSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(invoice => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadInvoiceValue(invoice, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "salesInvoices" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(InvoiceColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportSalesInvoicesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesInvoice> query = db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplyInvoiceFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateInvoicesAsync(query, report.GroupByFields, report.Aggregate!, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => InvoiceColumnByCode(code).Label).Append("Fatura sayısı").ToList();
            if (report.Aggregate != "count") headers.Add(AggregateLabel(report.Aggregate!));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(header => Csv(header))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (report.Aggregate != "count") values.Add(CsvValue(row.Value));
                csv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesInvoices:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyInvoiceSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(InvoiceColumnByCode(code).Label))));
            foreach (var invoice in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadInvoiceValue(invoice, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesInvoices:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<AggregatePage> AggregateStockItemsAsync(IQueryable<StockItemReportRow> query, IReadOnlyList<string> groupBy,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregateStockItemSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<StockItemReportRow, string>>)(x => x.Code),
            "name" => (Expression<Func<StockItemReportRow, string>>)(x => x.Name),
            "barcode" => (Expression<Func<StockItemReportRow, string?>>)(x => x.Barcode),
            "unitCode" => (Expression<Func<StockItemReportRow, string>>)(x => x.UnitCode),
            "category" => (Expression<Func<StockItemReportRow, string?>>)(x => x.Category),
            "minimumStock" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.MinimumStock),
            "onHand" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.OnHand),
            "reserved" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Reserved),
            "available" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Available),
            "trackingMode" => (Expression<Func<StockItemReportRow, InventoryTrackingMode>>)(x => x.TrackingMode),
            "isActive" => (Expression<Func<StockItemReportRow, bool>>)(x => x.IsActive),
            "createdAt" => (Expression<Func<StockItemReportRow, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported stock-item grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumMinimumStock" or "averageMinimumStock" => (LambdaExpression)(Expression<Func<StockItemReportRow, decimal>>)(x => x.MinimumStock),
            "sumOnHand" or "averageOnHand" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.OnHand),
            "sumReserved" or "averageReserved" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Reserved),
            "sumAvailable" or "averageAvailable" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Available),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregateStockItemSingleAsync(IQueryable<StockItemReportRow> query, string groupBy,
        string aggregate, bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregateStockItemGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "name" => await AggregateStockItemGroups(query.GroupBy(x => x.Name), aggregate, descending, skip, take, ct),
        "barcode" => await AggregateStockItemGroups(query.GroupBy(x => x.Barcode), aggregate, descending, skip, take, ct),
        "unitCode" => await AggregateStockItemGroups(query.GroupBy(x => x.UnitCode), aggregate, descending, skip, take, ct),
        "category" => await AggregateStockItemGroups(query.GroupBy(x => x.Category), aggregate, descending, skip, take, ct),
        "minimumStock" => await AggregateStockItemGroups(query.GroupBy(x => x.MinimumStock), aggregate, descending, skip, take, ct),
        "onHand" => await AggregateStockItemGroups(query.GroupBy(x => x.OnHand), aggregate, descending, skip, take, ct),
        "reserved" => await AggregateStockItemGroups(query.GroupBy(x => x.Reserved), aggregate, descending, skip, take, ct),
        "available" => await AggregateStockItemGroups(query.GroupBy(x => x.Available), aggregate, descending, skip, take, ct),
        "trackingMode" => await AggregateStockItemGroups(query.GroupBy(x => x.TrackingMode), aggregate, descending, skip, take, ct),
        "isActive" => await AggregateStockItemGroups(query.GroupBy(x => x.IsActive), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregateStockItemGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregateStockItemGroups<TKey>(IQueryable<IGrouping<TKey, StockItemReportRow>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumMinimumStock" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.MinimumStock))).ToListAsync(ct),
            "averageMinimumStock" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.MinimumStock))).ToListAsync(ct),
            "sumOnHand" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.OnHand))).ToListAsync(ct),
            "averageOnHand" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.OnHand))).ToListAsync(ct),
            "sumReserved" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.Reserved))).ToListAsync(ct),
            "averageReserved" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.Reserved))).ToListAsync(ct),
            "sumAvailable" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.Available))).ToListAsync(ct),
            "averageAvailable" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.Available))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(row => row with { GroupValue = row.GroupValue is InventoryTrackingMode mode ? mode.ToString() : row.GroupValue }).ToArray(), total);
    }

    private sealed class StockItemReportRow
    {
        public Guid Id { get; init; }
        public string Code { get; init; } = "";
        public string Name { get; init; } = "";
        public string? Barcode { get; init; }
        public string UnitCode { get; init; } = "";
        public string? Category { get; init; }
        public decimal MinimumStock { get; init; }
        public InventoryTrackingMode TrackingMode { get; init; }
        public bool IsActive { get; init; }
        public DateTimeOffset CreatedAt { get; init; }
        public decimal OnHand { get; init; }
        public decimal Reserved { get; init; }
        public decimal Available { get; init; }
    }

    private static IQueryable<StockItemReportRow> StockItemReportRows(TenantDbContext db, Guid tenantId)
    {
        return from item in db.StockItems.Where(item => item.TenantId == tenantId)
               let onHand = db.InventoryTransactions
                   .Where(move => move.TenantId == tenantId && move.StockItemId == item.Id)
                   .Sum(move => move.Direction == InventoryDirection.Receipt ? move.Quantity : -move.Quantity)
               let reserved = db.SalesOrderReservations
                   .Where(reservation => reservation.TenantId == tenantId && reservation.Status == SalesOrderReservationStatus.Active
                       && reservation.OrderLine.StockItemId == item.Id)
                   .Sum(reservation => reservation.Quantity - reservation.FulfilledQuantity)
               select new StockItemReportRow
               {
                Id = item.Id,
                Code = item.Code,
                Name = item.Name,
                Barcode = item.Barcode,
                UnitCode = item.UnitCode,
                Category = item.Category,
                MinimumStock = item.MinimumStock,
                TrackingMode = item.TrackingMode,
                IsActive = item.IsActive,
                CreatedAt = item.CreatedAt,
                OnHand = onHand,
                Reserved = reserved,
                Available = onHand - reserved
               };
    }

    private static bool TryApplyStockItemFilter(ref IQueryable<StockItemReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Operator == "isNull")
        {
            if (filter.Field == "barcode") { query = query.Where(x => x.Barcode == null); return true; }
            if (filter.Field == "category") { query = query.Where(x => x.Category == null); return true; }
            error = "Bu stok alanı boş değer filtresini desteklemiyor."; return false;
        }
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "name":
                query = filter.Operator == "contains" ? query.Where(x => x.Name.Contains(value)) : query.Where(x => x.Name == value); return true;
            case "barcode":
                query = filter.Operator == "contains" ? query.Where(x => x.Barcode != null && x.Barcode.Contains(value)) : query.Where(x => x.Barcode == value); return true;
            case "unitCode":
                query = filter.Operator == "contains" ? query.Where(x => x.UnitCode.Contains(value)) : query.Where(x => x.UnitCode == value); return true;
            case "category":
                query = filter.Operator == "contains" ? query.Where(x => x.Category != null && x.Category.Contains(value)) : query.Where(x => x.Category == value); return true;
            case "onHand":
            case "reserved":
            case "available":
            case "minimumStock":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var op)) { error = "Stok miktarı veya operatörü geçersiz."; return false; }
                query = (filter.Field, op) switch
                {
                    ("onHand", "gt") => query.Where(x => x.OnHand > amount), ("onHand", "gte") => query.Where(x => x.OnHand >= amount), ("onHand", "lt") => query.Where(x => x.OnHand < amount), ("onHand", "lte") => query.Where(x => x.OnHand <= amount), ("onHand", _) => query.Where(x => x.OnHand == amount),
                    ("reserved", "gt") => query.Where(x => x.Reserved > amount), ("reserved", "gte") => query.Where(x => x.Reserved >= amount), ("reserved", "lt") => query.Where(x => x.Reserved < amount), ("reserved", "lte") => query.Where(x => x.Reserved <= amount), ("reserved", _) => query.Where(x => x.Reserved == amount),
                    ("available", "gt") => query.Where(x => x.Available > amount), ("available", "gte") => query.Where(x => x.Available >= amount), ("available", "lt") => query.Where(x => x.Available < amount), ("available", "lte") => query.Where(x => x.Available <= amount), ("available", _) => query.Where(x => x.Available == amount),
                    (_, "gt") => query.Where(x => x.MinimumStock > amount), (_, "gte") => query.Where(x => x.MinimumStock >= amount), (_, "lt") => query.Where(x => x.MinimumStock < amount), (_, "lte") => query.Where(x => x.MinimumStock <= amount), _ => query.Where(x => x.MinimumStock == amount)
                }; return true;
            case "trackingMode":
                if (!Enum.TryParse<InventoryTrackingMode>(value, true, out var mode)) { error = "Stok takip türü geçersiz."; return false; }
                query = query.Where(x => x.TrackingMode == mode); return true;
            case "isActive":
                if (!bool.TryParse(value, out var active)) { error = "Durum true/false olmalıdır."; return false; }
                query = query.Where(x => x.IsActive == active); return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            default: error = "Stok kartı filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<StockItemReportRow> ApplyStockItemSort(IQueryable<StockItemReportRow> query, string field, bool descending) => (field, descending) switch
    {
        ("name", false) => query.OrderBy(x => x.Name).ThenBy(x => x.Id), ("name", true) => query.OrderByDescending(x => x.Name).ThenBy(x => x.Id),
        ("barcode", false) => query.OrderBy(x => x.Barcode).ThenBy(x => x.Id), ("barcode", true) => query.OrderByDescending(x => x.Barcode).ThenBy(x => x.Id),
        ("unitCode", false) => query.OrderBy(x => x.UnitCode).ThenBy(x => x.Id), ("unitCode", true) => query.OrderByDescending(x => x.UnitCode).ThenBy(x => x.Id),
        ("category", false) => query.OrderBy(x => x.Category).ThenBy(x => x.Id), ("category", true) => query.OrderByDescending(x => x.Category).ThenBy(x => x.Id),
        ("minimumStock", false) => query.OrderBy(x => x.MinimumStock).ThenBy(x => x.Id), ("minimumStock", true) => query.OrderByDescending(x => x.MinimumStock).ThenBy(x => x.Id),
        ("onHand", false) => query.OrderBy(x => x.OnHand).ThenBy(x => x.Id), ("onHand", true) => query.OrderByDescending(x => x.OnHand).ThenBy(x => x.Id),
        ("reserved", false) => query.OrderBy(x => x.Reserved).ThenBy(x => x.Id), ("reserved", true) => query.OrderByDescending(x => x.Reserved).ThenBy(x => x.Id),
        ("available", false) => query.OrderBy(x => x.Available).ThenBy(x => x.Id), ("available", true) => query.OrderByDescending(x => x.Available).ThenBy(x => x.Id),
        ("trackingMode", false) => query.OrderBy(x => x.TrackingMode).ThenBy(x => x.Id), ("trackingMode", true) => query.OrderByDescending(x => x.TrackingMode).ThenBy(x => x.Id),
        ("isActive", false) => query.OrderBy(x => x.IsActive).ThenBy(x => x.Id), ("isActive", true) => query.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadStockItemValue(StockItemReportRow item, string code) => code switch
    {
        "code" => item.Code, "name" => item.Name, "barcode" => item.Barcode, "unitCode" => item.UnitCode,
        "category" => item.Category, "minimumStock" => item.MinimumStock, "onHand" => item.OnHand, "reserved" => item.Reserved, "available" => item.Available, "trackingMode" => item.TrackingMode.ToString(),
        "isActive" => item.IsActive, "createdAt" => item.CreatedAt, _ => null
    };

    private static bool TryApplyPurchaseOrderFilter(ref IQueryable<PurchaseOrder> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "supplierCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Code.Contains(value)) : query.Where(x => x.Supplier.Code == value); return true;
            case "supplierName":
                query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Name.Contains(value)) : query.Where(x => x.Supplier.Name == value); return true;
            case "currencyCode":
                query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<PurchaseOrderStatus>(value, true, out var status)) { error = "Satın alma siparişi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "orderDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var orderDate)) { error = "Sipariş tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.OrderDate > orderDate), "gte" => query.Where(x => x.OrderDate >= orderDate), "lt" => query.Where(x => x.OrderDate < orderDate), _ => query.Where(x => x.OrderDate <= orderDate) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "subtotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Sipariş tutarı filtresi geçersiz."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount),
                    ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount),
                    ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount),
                    (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                }; return true;
            default: error = "Satın alma siparişi filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplyPurchaseRequestFilter(ref IQueryable<PurchaseRequest> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "description":
                query = filter.Operator == "contains" ? query.Where(x => x.Description.Contains(value)) : query.Where(x => x.Description == value); return true;
            case "requesterUserId":
                if (!Guid.TryParse(value, out var requesterId)) { error = "Talep sahibi kullanıcı kodu geçersiz."; return false; }
                query = query.Where(x => x.RequestedByUserId == requesterId); return true;
            case "status":
                if (!Enum.TryParse<PurchaseRequestStatus>(value, true, out var status)) { error = "Satın alma talebi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "neededByDate":
                if (filter.Operator == "isNull") { query = query.Where(x => x.NeededByDate == null); return true; }
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var neededBy)) { error = "İhtiyaç tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.NeededByDate > neededBy), "gte" => query.Where(x => x.NeededByDate >= neededBy), "lt" => query.Where(x => x.NeededByDate < neededBy), _ => query.Where(x => x.NeededByDate <= neededBy) }; return true;
            case "requestDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var requestedOn)) { error = "Talep tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.RequestDate > requestedOn), "gte" => query.Where(x => x.RequestDate >= requestedOn), "lt" => query.Where(x => x.RequestDate < requestedOn), _ => query.Where(x => x.RequestDate <= requestedOn) }; return true;
            case "createdAt": case "reviewedAt":
                if (filter.Field == "reviewedAt" && filter.Operator == "isNull") { query = query.Where(x => x.ReviewedAt == null); return true; }
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var timestamp)) { error = "Tarih filtresi ISO tarih biçiminde olmalıdır."; return false; }
                if (filter.Field == "createdAt")
                    query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > timestamp), "gte" => query.Where(x => x.CreatedAt >= timestamp), "lt" => query.Where(x => x.CreatedAt < timestamp), _ => query.Where(x => x.CreatedAt <= timestamp) };
                else
                    query = filter.Operator switch { "gt" => query.Where(x => x.ReviewedAt > timestamp), "gte" => query.Where(x => x.ReviewedAt >= timestamp), "lt" => query.Where(x => x.ReviewedAt < timestamp), _ => query.Where(x => x.ReviewedAt <= timestamp) };
                return true;
            default: error = "Satın alma talebi filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<PurchaseRequest> ApplyPurchaseRequestSort(IQueryable<PurchaseRequest> query, string field, bool descending) => (field, descending) switch
    {
        ("requesterUserId", false) => query.OrderBy(x => x.RequestedByUserId).ThenBy(x => x.Id), ("requesterUserId", true) => query.OrderByDescending(x => x.RequestedByUserId).ThenBy(x => x.Id),
        ("requestDate", false) => query.OrderBy(x => x.RequestDate).ThenBy(x => x.Id), ("requestDate", true) => query.OrderByDescending(x => x.RequestDate).ThenBy(x => x.Id),
        ("neededByDate", false) => query.OrderBy(x => x.NeededByDate).ThenBy(x => x.Id), ("neededByDate", true) => query.OrderByDescending(x => x.NeededByDate).ThenBy(x => x.Id),
        ("description", false) => query.OrderBy(x => x.Description).ThenBy(x => x.Id), ("description", true) => query.OrderByDescending(x => x.Description).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        ("reviewedAt", false) => query.OrderBy(x => x.ReviewedAt).ThenBy(x => x.Id), ("reviewedAt", true) => query.OrderByDescending(x => x.ReviewedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadPurchaseRequestValue(PurchaseRequest x, string code) => code switch
    {
        "code" => x.Code, "requesterUserId" => x.RequestedByUserId,
        "requestDate" => x.RequestDate, "neededByDate" => x.NeededByDate, "description" => x.Description,
        "status" => x.Status.ToString(), "createdAt" => x.CreatedAt, "reviewedAt" => x.ReviewedAt, _ => null
    };

    private static ReportColumn PurchaseRequestColumnByCode(string code) => PurchaseRequestColumns.First(x => x.Code == code);

    private static IQueryable<PurchaseOrder> ApplyPurchaseOrderSort(IQueryable<PurchaseOrder> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("supplierCode", false) => query.OrderBy(x => x.Supplier.Code).ThenBy(x => x.Id), ("supplierCode", true) => query.OrderByDescending(x => x.Supplier.Code).ThenBy(x => x.Id),
        ("supplierName", false) => query.OrderBy(x => x.Supplier.Name).ThenBy(x => x.Id), ("supplierName", true) => query.OrderByDescending(x => x.Supplier.Name).ThenBy(x => x.Id),
        ("orderDate", false) => query.OrderBy(x => x.OrderDate).ThenBy(x => x.Id), ("orderDate", true) => query.OrderByDescending(x => x.OrderDate).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadPurchaseOrderValue(PurchaseOrder x, string code) => code switch
    {
        "code" => x.Code, "supplierCode" => x.Supplier.Code, "supplierName" => x.Supplier.Name, "orderDate" => x.OrderDate,
        "currencyCode" => x.CurrencyCode, "status" => x.Status.ToString(), "subtotal" => x.Subtotal, "taxTotal" => x.TaxTotal,
        "grandTotal" => x.GrandTotal, "createdAt" => x.CreatedAt, _ => null
    };

    private static bool TryApplyInvoiceFilter(ref IQueryable<SalesInvoice> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "customerCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Code.Contains(value)) : query.Where(x => x.Customer.Code == value); return true;
            case "customerName":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Name.Contains(value)) : query.Where(x => x.Customer.Name == value); return true;
            case "currencyCode":
                query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<SalesInvoiceStatus>(value, true, out var status)) { error = "Fatura durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "invoiceDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var invoiceDate)) { error = "Fatura tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.InvoiceDate > invoiceDate), "gte" => query.Where(x => x.InvoiceDate >= invoiceDate), "lt" => query.Where(x => x.InvoiceDate < invoiceDate), _ => query.Where(x => x.InvoiceDate <= invoiceDate) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "subtotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Tutar filtresi geçersiz."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount),
                    ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount),
                    ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount),
                    (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                }; return true;
            default: error = "Satış faturası filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<SalesInvoice> ApplyInvoiceSort(IQueryable<SalesInvoice> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("customerCode", false) => query.OrderBy(x => x.Customer.Code).ThenBy(x => x.Id), ("customerCode", true) => query.OrderByDescending(x => x.Customer.Code).ThenBy(x => x.Id),
        ("customerName", false) => query.OrderBy(x => x.Customer.Name).ThenBy(x => x.Id), ("customerName", true) => query.OrderByDescending(x => x.Customer.Name).ThenBy(x => x.Id),
        ("invoiceDate", false) => query.OrderBy(x => x.InvoiceDate).ThenBy(x => x.Id), ("invoiceDate", true) => query.OrderByDescending(x => x.InvoiceDate).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadInvoiceValue(SalesInvoice x, string code) => code switch
    {
        "code" => x.Code, "customerCode" => x.Customer.Code, "customerName" => x.Customer.Name, "invoiceDate" => x.InvoiceDate,
        "currencyCode" => x.CurrencyCode, "status" => x.Status.ToString(), "subtotal" => x.Subtotal, "taxTotal" => x.TaxTotal,
        "grandTotal" => x.GrandTotal, "createdAt" => x.CreatedAt, _ => null
    };

    private static async Task<AggregatePage> AggregateInvoicesAsync(IQueryable<SalesInvoice> query, IReadOnlyList<string> groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregateInvoiceSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<SalesInvoice, string>>)(x => x.Code),
            "customerCode" => (Expression<Func<SalesInvoice, string>>)(x => x.Customer.Code),
            "customerName" => (Expression<Func<SalesInvoice, string>>)(x => x.Customer.Name),
            "invoiceDate" => (Expression<Func<SalesInvoice, DateOnly>>)(x => x.InvoiceDate),
            "currencyCode" => (Expression<Func<SalesInvoice, string>>)(x => x.CurrencyCode),
            "status" => (Expression<Func<SalesInvoice, SalesInvoiceStatus>>)(x => x.Status),
            "subtotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.Subtotal),
            "taxTotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.TaxTotal),
            "grandTotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.GrandTotal),
            "createdAt" => (Expression<Func<SalesInvoice, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported invoice grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumGrandTotal" or "averageGrandTotal" => (LambdaExpression)(Expression<Func<SalesInvoice, decimal>>)(x => x.GrandTotal),
            "sumTaxTotal" or "averageTaxTotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.TaxTotal),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregatePurchaseOrdersAsync(IQueryable<PurchaseOrder> query, IReadOnlyList<string> groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregatePurchaseOrderSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<PurchaseOrder, string>>)(x => x.Code),
            "supplierCode" => (Expression<Func<PurchaseOrder, string>>)(x => x.Supplier.Code),
            "supplierName" => (Expression<Func<PurchaseOrder, string>>)(x => x.Supplier.Name),
            "orderDate" => (Expression<Func<PurchaseOrder, DateOnly>>)(x => x.OrderDate),
            "currencyCode" => (Expression<Func<PurchaseOrder, string>>)(x => x.CurrencyCode),
            "status" => (Expression<Func<PurchaseOrder, PurchaseOrderStatus>>)(x => x.Status),
            "subtotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.Subtotal),
            "taxTotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.TaxTotal),
            "grandTotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.GrandTotal),
            "createdAt" => (Expression<Func<PurchaseOrder, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported purchase-order grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumGrandTotal" or "averageGrandTotal" => (LambdaExpression)(Expression<Func<PurchaseOrder, decimal>>)(x => x.GrandTotal),
            "sumTaxTotal" or "averageTaxTotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.TaxTotal),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregatePurchaseOrderSingleAsync(IQueryable<PurchaseOrder> query, string groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "supplierCode" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Supplier.Code), aggregate, descending, skip, take, ct),
        "supplierName" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Supplier.Name), aggregate, descending, skip, take, ct),
        "orderDate" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.OrderDate), aggregate, descending, skip, take, ct),
        "currencyCode" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.CurrencyCode), aggregate, descending, skip, take, ct),
        "status" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Status), aggregate, descending, skip, take, ct),
        "subtotal" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Subtotal), aggregate, descending, skip, take, ct),
        "taxTotal" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.TaxTotal), aggregate, descending, skip, take, ct),
        "grandTotal" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.GrandTotal), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregatePurchaseOrderGroups<TKey>(IQueryable<IGrouping<TKey, PurchaseOrder>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.GrandTotal))).ToListAsync(ct),
            "averageGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.GrandTotal))).ToListAsync(ct),
            "sumTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.TaxTotal))).ToListAsync(ct),
            "averageTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.TaxTotal))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(row => row with { GroupValue = row.GroupValue is PurchaseOrderStatus status ? status.ToString() : row.GroupValue }).ToArray(), total);
    }

    private static async Task<AggregatePage> AggregateInvoiceSingleAsync(IQueryable<SalesInvoice> query, string groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregateInvoiceGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "customerCode" => await AggregateInvoiceGroups(query.GroupBy(x => x.Customer.Code), aggregate, descending, skip, take, ct),
        "customerName" => await AggregateInvoiceGroups(query.GroupBy(x => x.Customer.Name), aggregate, descending, skip, take, ct),
        "invoiceDate" => await AggregateInvoiceGroups(query.GroupBy(x => x.InvoiceDate), aggregate, descending, skip, take, ct),
        "currencyCode" => await AggregateInvoiceGroups(query.GroupBy(x => x.CurrencyCode), aggregate, descending, skip, take, ct),
        "status" => await AggregateInvoiceGroups(query.GroupBy(x => x.Status), aggregate, descending, skip, take, ct),
        "subtotal" => await AggregateInvoiceGroups(query.GroupBy(x => x.Subtotal), aggregate, descending, skip, take, ct),
        "taxTotal" => await AggregateInvoiceGroups(query.GroupBy(x => x.TaxTotal), aggregate, descending, skip, take, ct),
        "grandTotal" => await AggregateInvoiceGroups(query.GroupBy(x => x.GrandTotal), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregateInvoiceGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregateInvoiceGroups<TKey>(IQueryable<IGrouping<TKey, SalesInvoice>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.GrandTotal))).ToListAsync(ct),
            "averageGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.GrandTotal))).ToListAsync(ct),
            "sumTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.TaxTotal))).ToListAsync(ct),
            "averageTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.TaxTotal))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(x => x with { GroupValue = x.GroupValue is SalesInvoiceStatus status ? status.ToString() : x.GroupValue }).ToArray(), total);
    }

    private static bool Validate(ReportRunRequest? request, out NormalizedReport? normalized, out Dictionary<string, string[]>? errors)
    {
        normalized = null; errors = new Dictionary<string, string[]>();
        var columns = request is null ? [] : ColumnsForSource(request.Source);
        var aggregates = request is null ? [] : AggregatesForSource(request.Source);
        if (request is null || columns.Count == 0) errors["source"] = ["Desteklenmeyen rapor kaynağı."];
        if (request?.Columns is not { Count: > 0 and <= 12 } || request.Columns.Distinct(StringComparer.Ordinal).Count() != request.Columns.Count
            || request.Columns.Any(code => !columns.Any(x => x.Code == code)))
            errors["columns"] = ["1-12 benzersiz ve izin verilen sütun seçin."];
        if (request?.Filters is { Count: > 8 }) errors["filters"] = ["En fazla 8 filtre kullanılabilir."];
        if (request?.Filters is not null)
        {
            foreach (var filter in request.Filters)
            {
                if (filter is null || string.IsNullOrWhiteSpace(filter.Field) || !columns.Any(x => x.Code == filter.Field))
                {
                    errors["filters"] = ["Filtrelerde yalnız katalogdaki alanlar kullanılabilir."];
                    break;
                }
                var isNullFilter = filter.Operator == "isNull";
                if ((!isNullFilter && (filter.Value is null || filter.Value.Length is < 1 or > 200)) || (isNullFilter && !string.IsNullOrEmpty(filter.Value)))
                {
                    errors["filters"] = ["Filtre değeri 1-200 karakter olmalı; boş değer filtresi değer almamalıdır."];
                    break;
                }
                var type = columns.First(x => x.Code == filter.Field).DataType;
                var allowed = type switch
                {
                    "text" when filter.Field is "type" or "status" or "trackingMode" or "requesterUserId" => filter.Operator == "equals",
                    "text" when request.Source == "stockItems" && (filter.Field is "barcode" or "category") => filter.Operator is "contains" or "equals" or "isNull",
                    "text" => filter.Operator is "contains" or "equals",
                    "boolean" => filter.Field == "isActive" && filter.Operator == "equals",
                    "decimal" when request.Source == "customers" && filter.Field == "riskLimit" => filter.Operator is "equals" or "gt" or "gte" or "lt" or "lte" or "isNull",
                    "decimal" or "number" => filter.Operator is "equals" or "gt" or "gte" or "lt" or "lte",
                    "date" when request.Source == "purchaseRequests" && (filter.Field is "neededByDate" or "reviewedAt") => filter.Operator is "gt" or "gte" or "lt" or "lte" or "isNull",
                    "date" => filter.Operator is "gt" or "gte" or "lt" or "lte",
                    _ => false
                };
                if (!allowed) { errors["filters"] = [$"{filter.Field} alanı için filtre operatörü geçersiz."]; break; }
            }
        }
        var sortBy = request?.SortBy ?? "code";
        if (!columns.Any(x => x.Code == sortBy)) errors["sortBy"] = ["Sıralama sütunu geçersiz."];
        var requestedGroupFields = request?.GroupByFields is { Count: > 0 }
            ? request.GroupByFields.ToArray()
            : string.IsNullOrWhiteSpace(request?.GroupBy) ? [] : [request!.GroupBy!];
        var groupFields = requestedGroupFields.Where(field => !string.IsNullOrWhiteSpace(field)).ToArray();
        if (requestedGroupFields.Length > 3 || groupFields.Length != requestedGroupFields.Length ||
            groupFields.Length != groupFields.Distinct(StringComparer.Ordinal).Count() ||
            groupFields.Any(field => !columns.Any(x => x.Code == field)))
            errors["groupByFields"] = ["En fazla 3 benzersiz ve katalogda bulunan alanla gruplayın."];
        if (request?.Source == "purchaseRequests" && (groupFields.Length > 1 || groupFields.Any(field => field is not ("code" or "status" or "requesterUserId" or "requestDate"))))
            errors["groupByFields"] = ["Satın alma talepleri kod, durum, talep sahibi kullanıcı kodu veya talep tarihine göre tek alanla gruplanabilir."];
        var aggregate = request?.Aggregate;
        if (!string.IsNullOrWhiteSpace(aggregate) && !aggregates.Any(x => x.Code == aggregate))
            errors["aggregate"] = ["Desteklenmeyen toplama işlemi."];
        if (groupFields.Length == 0 && !string.IsNullOrWhiteSpace(aggregate))
            errors["aggregate"] = ["Toplama işlemi için bir gruplama alanı seçin."];
        if (request?.Source == "purchaseRequests" && groupFields.Length > 0 && aggregate is not (null or "count"))
            errors["aggregate"] = ["Satın alma taleplerinde yalnızca kayıt sayısı kullanılabilir."];
        if (request?.Source == "salesInvoices" && aggregate is "sumGrandTotal" or "averageGrandTotal" or "sumTaxTotal" or "averageTaxTotal")
        {
            var groupedByCurrency = groupFields.Contains("currencyCode", StringComparer.Ordinal);
            var singleCurrencyFilter = request.Filters?.Any(filter => filter.Field == "currencyCode" && filter.Operator == "equals" && !string.IsNullOrWhiteSpace(filter.Value)) == true;
            if (!groupedByCurrency && !singleCurrencyFilter)
                errors["aggregate"] = ["Farklı para birimlerini toplamak önlenmiştir. Para birimine göre gruplayın veya tek bir para birimini eşitlik filtresiyle seçin."];
        }
        if (request?.Source == "purchaseOrders" && aggregate is "sumGrandTotal" or "averageGrandTotal" or "sumTaxTotal" or "averageTaxTotal")
        {
            var groupedByCurrency = groupFields.Contains("currencyCode", StringComparer.Ordinal);
            var singleCurrencyFilter = request.Filters?.Any(filter => filter.Field == "currencyCode" && filter.Operator == "equals" && !string.IsNullOrWhiteSpace(filter.Value)) == true;
            if (!groupedByCurrency && !singleCurrencyFilter)
                errors["aggregate"] = ["Farklı para birimlerindeki satın alma tutarları toplanamaz. Para birimine göre gruplayın veya tek para birimini filtreleyin."];
        }
        if (errors.Count > 0 || request is null) return false;
        normalized = new NormalizedReport(request.Source, request.Columns!.ToArray(), request.Filters?.ToArray() ?? [],
            sortBy, request.Descending, Math.Clamp(request.Page, 1, 100000), Math.Clamp(request.PageSize, 1, 200),
            groupFields.FirstOrDefault(), groupFields.Length == 0 ? null : aggregate ?? "count", groupFields);
        return true;
    }

    private static async Task<AggregatePage> AggregateAsync(IQueryable<CustomerAccount> query, IReadOnlyList<string> groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregateCustomerSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<CustomerAccount, string>>)(x => x.Code),
            "name" => (Expression<Func<CustomerAccount, string>>)(x => x.Name),
            "type" => (Expression<Func<CustomerAccount, CounterpartyType>>)(x => x.Type),
            "currencyCode" => (Expression<Func<CustomerAccount, string>>)(x => x.CurrencyCode),
            "riskLimit" => (Expression<Func<CustomerAccount, decimal?>>)(x => x.RiskLimit),
            "paymentTermDays" => (Expression<Func<CustomerAccount, int>>)(x => x.PaymentTermDays),
            "isActive" => (Expression<Func<CustomerAccount, bool>>)(x => x.IsActive),
            "createdAt" => (Expression<Func<CustomerAccount, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported customer grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumRiskLimit" or "averageRiskLimit" => (LambdaExpression)(Expression<Func<CustomerAccount, decimal?>>)(x => x.RiskLimit),
            "sumPaymentTermDays" or "averagePaymentTermDays" => (Expression<Func<CustomerAccount, decimal>>)(x => x.PaymentTermDays),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregateCustomerSingleAsync(IQueryable<CustomerAccount> query, string groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregateGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "name" => await AggregateGroups(query.GroupBy(x => x.Name), aggregate, descending, skip, take, ct),
        "type" => await AggregateGroups(query.GroupBy(x => x.Type), aggregate, descending, skip, take, ct),
        "currencyCode" => await AggregateGroups(query.GroupBy(x => x.CurrencyCode), aggregate, descending, skip, take, ct),
        "riskLimit" => await AggregateGroups(query.GroupBy(x => x.RiskLimit), aggregate, descending, skip, take, ct),
        "paymentTermDays" => await AggregateGroups(query.GroupBy(x => x.PaymentTermDays), aggregate, descending, skip, take, ct),
        "isActive" => await AggregateGroups(query.GroupBy(x => x.IsActive), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregateGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregateMultipleGroupsAsync<TEntity>(IQueryable<TEntity> query,
        IReadOnlyList<LambdaExpression> selectors, string aggregate, LambdaExpression? aggregateSelector,
        bool descending, int skip, int take, CancellationToken ct)
    {
        var parameter = Expression.Parameter(typeof(TEntity), "row");
        var expressions = selectors.Select(selector => new ParameterReplaceVisitor(selector.Parameters[0], parameter).Visit(selector.Body)!).ToArray();
        var tupleDefinition = expressions.Length switch
        {
            2 => typeof(ValueTuple<,>),
            3 => typeof(ValueTuple<,,>),
            _ => throw new ArgumentOutOfRangeException(nameof(selectors), "Multi-field reports support two or three grouping fields.")
        };
        var keyType = tupleDefinition.MakeGenericType(expressions.Select(expression => expression.Type).ToArray());
        var constructor = keyType.GetConstructors().Single();
        var tupleMembers = Enumerable.Range(1, expressions.Length)
            .Select(index => (MemberInfo)keyType.GetField($"Item{index}")!).ToArray();
        var keyBody = Expression.New(constructor, expressions, tupleMembers);
        var keyLambdaType = typeof(Func<,>).MakeGenericType(typeof(TEntity), keyType);
        var keySelector = Expression.Lambda(keyLambdaType, keyBody, parameter);
        var method = typeof(ReportEndpoints).GetMethod(nameof(AggregateMultipleGroupsTypedAsync), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(typeof(TEntity), keyType);
        var task = (Task<AggregatePage>)method.Invoke(null,
            [query, keySelector, selectors.Count, aggregate, aggregateSelector, descending, skip, take, ct])!;
        return await task;
    }

    private static async Task<AggregatePage> AggregateMultipleGroupsTypedAsync<TEntity, TKey>(IQueryable<TEntity> query,
        LambdaExpression keySelector, int fieldCount, string aggregate, LambdaExpression? aggregateSelector,
        bool descending, int skip, int take, CancellationToken ct)
    {
        var typedSelector = (Expression<Func<TEntity, TKey>>)keySelector;
        var groups = query.GroupBy(typedSelector);
        var total = await groups.CountAsync(ct);
        IQueryable<IGrouping<TKey, TEntity>> ordered = groups;
        for (var index = 1; index <= fieldCount; index++)
        {
            var group = Expression.Parameter(typeof(IGrouping<TKey, TEntity>), "group");
            var key = Expression.Property(group, nameof(IGrouping<TKey, TEntity>.Key));
            var value = Expression.Field(key, $"Item{index}");
            var selector = Expression.Lambda(value, group);
            var methodName = index == 1
                ? descending ? nameof(Queryable.OrderByDescending) : nameof(Queryable.OrderBy)
                : descending ? nameof(Queryable.ThenByDescending) : nameof(Queryable.ThenBy);
            var order = Expression.Call(typeof(Queryable), methodName, [typeof(IGrouping<TKey, TEntity>), value.Type],
                ordered.Expression, Expression.Quote(selector));
            ordered = (IQueryable<IGrouping<TKey, TEntity>>)ordered.Provider.CreateQuery(order);
        }
        var page = ordered.Skip(skip).Take(take);
        var groupParameter = Expression.Parameter(typeof(IGrouping<TKey, TEntity>), "group");
        var keyExpression = Expression.Property(groupParameter, nameof(IGrouping<TKey, TEntity>.Key));
        var values = Enumerable.Range(1, fieldCount)
            .Select(index => Expression.Convert(Expression.Field(keyExpression, $"Item{index}"), typeof(object)));
        var groupValues = Expression.NewArrayInit(typeof(object), values);
        var countMethod = typeof(Enumerable).GetMethods().Single(method => method.Name == nameof(Enumerable.Count) &&
            method.IsGenericMethodDefinition && method.GetParameters().Length == 1).MakeGenericMethod(typeof(TEntity));
        var count = Expression.Call(countMethod, groupParameter);
        Expression valueExpression = Expression.Constant(null, typeof(decimal?));
        if (aggregateSelector is not null)
        {
            var name = aggregate.StartsWith("sum", StringComparison.Ordinal) ? nameof(Enumerable.Sum) : nameof(Enumerable.Average);
            var aggregateType = aggregateSelector.ReturnType;
            var method = typeof(Enumerable).GetMethods().Single(candidate => candidate.Name == name && candidate.IsGenericMethodDefinition &&
                candidate.GetParameters().Length == 2 && candidate.GetParameters()[1].ParameterType.IsGenericType &&
                candidate.GetParameters()[1].ParameterType.GetGenericTypeDefinition() == typeof(Func<,>) &&
                candidate.GetParameters()[1].ParameterType.GetGenericArguments()[1] == aggregateType && candidate.ReturnType == aggregateType).MakeGenericMethod(typeof(TEntity));
            var aggregateParameter = Expression.Parameter(typeof(TEntity), "row");
            var aggregateBody = new ParameterReplaceVisitor(aggregateSelector.Parameters[0], aggregateParameter).Visit(aggregateSelector.Body)!;
            var selector = Expression.Lambda(typeof(Func<,>).MakeGenericType(typeof(TEntity), aggregateType), aggregateBody, aggregateParameter);
            var aggregateValue = Expression.Call(method, groupParameter, selector);
            valueExpression = aggregateValue.Type == typeof(decimal?) ? aggregateValue : Expression.Convert(aggregateValue, typeof(decimal?));
        }
        var rowConstructor = typeof(ReportAggregateRow).GetConstructors().Single();
        var projectionBody = Expression.New(rowConstructor, Expression.Constant(null, typeof(object)), count, valueExpression,
            Expression.Convert(groupValues, typeof(IReadOnlyList<object?>)));
        var projection = Expression.Lambda<Func<IGrouping<TKey, TEntity>, ReportAggregateRow>>(projectionBody, groupParameter);
        var rows = await page.Select(projection).ToListAsync(ct);
        rows = rows.Select(row => row with
        {
            GroupValues = row.GroupValues?.Select(value => value switch
            {
                CounterpartyType type => type.ToString(),
                SalesInvoiceStatus status => status.ToString(),
                PurchaseOrderStatus status => status.ToString(),
                InventoryTrackingMode mode => mode.ToString(),
                _ => value
            }).ToArray()
        }).ToList();
        return new AggregatePage(rows, total);
    }

    private sealed class ParameterReplaceVisitor(ParameterExpression source, ParameterExpression destination) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) => node == source ? destination : base.VisitParameter(node);
    }

    private static async Task<AggregatePage> AggregateGroups<TKey>(IQueryable<IGrouping<TKey, CustomerAccount>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumRiskLimit" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.RiskLimit))).ToListAsync(ct),
            "averageRiskLimit" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.RiskLimit))).ToListAsync(ct),
            "sumPaymentTermDays" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => (decimal)x.PaymentTermDays))).ToListAsync(ct),
            "averagePaymentTermDays" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.PaymentTermDays))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(x => x with { GroupValue = x.GroupValue is CounterpartyType type ? type.ToString() : x.GroupValue }).ToArray(), total);
    }

    private static string AggregateLabel(string aggregate) => aggregate switch
    {
        "sumRiskLimit" => "Risk limiti toplamı", "averageRiskLimit" => "Ortalama risk limiti",
        "sumPaymentTermDays" => "Vade günü toplamı", "averagePaymentTermDays" => "Ortalama vade günü",
        "sumGrandTotal" => "Genel toplamların toplamı", "averageGrandTotal" => "Ortalama fatura tutarı",
        "sumTaxTotal" => "Vergi toplamı", "averageTaxTotal" => "Ortalama vergi", _ => "Kayıt sayısı"
    };

    private static string PurchaseOrderAggregateLabel(string aggregate) => aggregate switch
    {
        "sumGrandTotal" => "Sipariş genel toplamları", "averageGrandTotal" => "Ortalama sipariş tutarı",
        "sumTaxTotal" => "Sipariş vergi toplamı", "averageTaxTotal" => "Ortalama sipariş vergisi", _ => "Satın alma siparişi sayısı"
    };

    private static string StockItemAggregateLabel(string aggregate) => aggregate switch
    {
        "sumMinimumStock" => "Minimum stok toplamı", "averageMinimumStock" => "Ortalama minimum stok",
        "sumOnHand" => "Eldeki miktar toplamı", "averageOnHand" => "Ortalama eldeki miktar",
        "sumReserved" => "Rezerve miktar toplamı", "averageReserved" => "Ortalama rezerve miktar",
        "sumAvailable" => "Kullanılabilir miktar toplamı", "averageAvailable" => "Ortalama kullanılabilir miktar",
        _ => "Stok kartı sayısı"
    };

    private static IReadOnlyList<ReportColumn> ColumnsForSource(string source) => source switch
    {
        "customers" => CustomerColumns, "salesInvoices" => SalesInvoiceColumns, "purchaseOrders" => PurchaseOrderColumns, "purchaseRequests" => PurchaseRequestColumns, "stockItems" => StockItemColumns, _ => []
    };

    private static IReadOnlyList<ReportAggregateOption> AggregatesForSource(string source) => source switch
    {
        "customers" => CustomerAggregates, "salesInvoices" => SalesInvoiceAggregates, "purchaseOrders" => PurchaseOrderAggregates, "purchaseRequests" => PurchaseRequestAggregates, "stockItems" => StockItemAggregates, _ => []
    };

    private static ReportColumn InvoiceColumnByCode(string code) => SalesInvoiceColumns.First(x => x.Code == code);
    private static ReportColumn PurchaseOrderColumnByCode(string code) => PurchaseOrderColumns.First(x => x.Code == code);
    private static ReportColumn StockItemColumnByCode(string code) => StockItemColumns.First(x => x.Code == code);

    private static bool TryApplyCustomerFilter(ref IQueryable<CustomerAccount> query, ReportFilter filter, out string? error)
    {
        error = null;
        var column = ColumnByCode(filter.Field);
        var value = filter.Value?.Trim();
        if (filter.Operator == "isNull" && filter.Field == "riskLimit") { query = query.Where(x => x.RiskLimit == null); return true; }
        if (value is null || value.Length == 0 || value.Length > 200) { error = "Filtre değeri 1-200 karakter olmalıdır."; return false; }
        switch (column.DataType)
        {
            case "text":
                if (filter.Operator is not ("contains" or "equals")) { error = "Metin alanında contains veya equals kullanın."; return false; }
                query = filter.Field switch
                {
                    "code" => filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value),
                    "name" => filter.Operator == "contains" ? query.Where(x => x.Name.Contains(value)) : query.Where(x => x.Name == value),
                    "type" when Enum.TryParse<CounterpartyType>(value, true, out var type) => query.Where(x => x.Type == type),
                    "currencyCode" => filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value),
                    _ => query
                };
                if (filter.Field == "type" && !Enum.TryParse<CounterpartyType>(value, true, out _)) { error = "Cari türü geçersiz."; return false; }
                return true;
            case "boolean":
                if (filter.Field != "isActive" || filter.Operator != "equals" || !bool.TryParse(value, out var active)) { error = "Durum filtresi true/false eşitliği olmalıdır."; return false; }
                query = query.Where(x => x.IsActive == active); return true;
            case "decimal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var decimalOp)) { error = "Sayısal filtre veya operatör geçersiz."; return false; }
                query = decimalOp switch { "gt" => query.Where(x => x.RiskLimit > amount), "gte" => query.Where(x => x.RiskLimit >= amount), "lt" => query.Where(x => x.RiskLimit < amount), "lte" => query.Where(x => x.RiskLimit <= amount), _ => query.Where(x => x.RiskLimit == amount) }; return true;
            case "number":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var days) || !ApplyDecimalOperator(filter.Operator, out var intOp)) { error = "Vade filtresi veya operatör geçersiz."; return false; }
                query = intOp switch { "gt" => query.Where(x => x.PaymentTermDays > days), "gte" => query.Where(x => x.PaymentTermDays >= days), "lt" => query.Where(x => x.PaymentTermDays < days), "lte" => query.Where(x => x.PaymentTermDays <= days), _ => query.Where(x => x.PaymentTermDays == days) }; return true;
            case "date":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) || filter.Operator is not ("gt" or "gte" or "lt" or "lte")) { error = "ISO tarih ve gt/gte/lt/lte operatörü kullanın."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > date), "gte" => query.Where(x => x.CreatedAt >= date), "lt" => query.Where(x => x.CreatedAt < date), _ => query.Where(x => x.CreatedAt <= date) }; return true;
            default: error = "Filtre alanı geçersiz."; return false;
        }
    }

    private static bool ApplyDecimalOperator(string value, out string normalized)
    {
        normalized = value;
        return value is "equals" or "gt" or "gte" or "lt" or "lte";
    }

    private static IQueryable<CustomerAccount> ApplySort(IQueryable<CustomerAccount> query, string field, bool descending) => (field, descending) switch
    {
        ("name", false) => query.OrderBy(x => x.Name).ThenBy(x => x.Id), ("name", true) => query.OrderByDescending(x => x.Name).ThenBy(x => x.Id),
        ("type", false) => query.OrderBy(x => x.Type).ThenBy(x => x.Id), ("type", true) => query.OrderByDescending(x => x.Type).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("riskLimit", false) => query.OrderBy(x => x.RiskLimit).ThenBy(x => x.Id), ("riskLimit", true) => query.OrderByDescending(x => x.RiskLimit).ThenBy(x => x.Id),
        ("paymentTermDays", false) => query.OrderBy(x => x.PaymentTermDays).ThenBy(x => x.Id), ("paymentTermDays", true) => query.OrderByDescending(x => x.PaymentTermDays).ThenBy(x => x.Id),
        ("isActive", false) => query.OrderBy(x => x.IsActive).ThenBy(x => x.Id), ("isActive", true) => query.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadCustomerValue(CustomerAccount x, string code) => code switch
    {
        "code" => x.Code, "name" => x.Name, "type" => x.Type.ToString(), "currencyCode" => x.CurrencyCode,
        "riskLimit" => x.RiskLimit, "paymentTermDays" => x.PaymentTermDays, "isActive" => x.IsActive, "createdAt" => x.CreatedAt,
        _ => null
    };

    private static ReportColumn ColumnByCode(string code) => CustomerColumns.First(x => x.Code == code);
    private static ReportView ToView(TenantSavedReport report) => new(report.Id, report.Name, report.Source,
        JsonSerializer.Deserialize<ReportRunRequest>(report.DefinitionJson, JsonOptions) ?? new ReportRunRequest("customers", ["code", "name"], [], "code", false, 1, 50), report.Kind, report.CreatedAt, report.UpdatedAt);
    private static bool TrySavedKind(string? requested, string? fallback, out string normalized)
    {
        var value = string.IsNullOrWhiteSpace(requested) ? fallback : requested.Trim();
        normalized = string.Equals(value, "List", StringComparison.OrdinalIgnoreCase) ? "List"
            : string.Equals(value, "Report", StringComparison.OrdinalIgnoreCase) ? "Report" : "";
        return normalized.Length > 0;
    }
    private static string SavedAuditAction(string kind, string action) =>
        $"erp.{(kind == "List" ? "list-view" : "report")}.{action}";
    private static bool TryTenantContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = Guid.Empty; userId = Guid.Empty; role = "";
        if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId) || !Guid.TryParse(user.FindFirstValue("sub"), out userId)) return false;
        role = user.FindFirstValue("role") ?? ""; return role.Length > 0;
    }
}

public sealed record ReportColumn(string Code, string Label, string DataType, IReadOnlyList<string>? Options = null);
public sealed record ReportAggregateOption(string Code, string Label);
public sealed record ReportSource(string Code, string Label, IReadOnlyList<ReportColumn> Columns, IReadOnlyList<ReportAggregateOption> Aggregates);
public sealed record ReportFilter(string Field, string Operator, string? Value);
public sealed record ReportRunRequest(string Source, IReadOnlyList<string>? Columns, IReadOnlyList<ReportFilter>? Filters, string? SortBy, bool Descending, int Page = 1, int PageSize = 50, string? GroupBy = null, string? Aggregate = null, IReadOnlyList<string>? GroupByFields = null);
public sealed record ReportPageRequest(int Page = 1, int PageSize = 50);
public sealed record ReportSaveRequest(string? Name, ReportRunRequest? Definition, string? Kind = null);
public sealed record NormalizedReport(string Source, IReadOnlyList<string> Columns, IReadOnlyList<ReportFilter> Filters, string SortBy, bool Descending, int Page, int PageSize, string? GroupBy = null, string? Aggregate = null, IReadOnlyList<string> GroupByFields = null!);
public sealed record ReportAggregateRow(object? GroupValue, int RowCount, decimal? Value, IReadOnlyList<object?>? GroupValues = null);
public sealed record AggregatePage(IReadOnlyList<ReportAggregateRow> Rows, int TotalGroups);
public sealed record ReportResult(string Source, IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, int Page, int PageSize, int TotalCount, string? GroupBy = null, string? Aggregate = null, IReadOnlyList<ReportAggregateRow>? Groups = null, int TotalGroups = 0, IReadOnlyList<string>? GroupByFields = null);
public sealed record ReportView(Guid Id, string Name, string Source, ReportRunRequest Definition, string Kind, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
