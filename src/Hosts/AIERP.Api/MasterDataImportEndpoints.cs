using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class MasterDataImportEndpoints
{
    private const int MaxRows = 5000;

    public static RouteGroupBuilder MapCustomerBulkImportEndpoint(this RouteGroupBuilder customers)
    {
        customers.MapPost("/bulk-import", async (BulkCustomerImportRequest body, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var rows = body.Items;
            if (rows is null || rows.Count == 0) return Results.BadRequest(new { error = "CSV dosyasında aktarılacak satır bulunamadı." });
            if (rows.Count > MaxRows) return Results.BadRequest(new { error = $"Tek seferde en fazla {MaxRows:N0} cari aktarılabilir." });

            var errors = new List<BulkImportRowError>();
            var normalizedCodes = rows.Select(row => string.IsNullOrWhiteSpace(row.Code) ? "" : row.Code.Trim().ToUpperInvariant()).ToArray();
            AddDuplicateErrors(normalizedCodes, "code", "Dosyada cari kodu tekrarlanıyor.", errors);
            var requiredFields = await db.CustomerCustomFieldDefinitions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.IsActive && x.IsRequired).Select(x => x.Code).ToListAsync(ct);
            if (requiredFields.Count != 0)
                return Results.BadRequest(new { error = $"Zorunlu cari özel alanlar bu CSV aktarımında desteklenmiyor: {string.Join(", ", requiredFields)}. Bu alanları tamamlayıp yeniden deneyin." });

            var requests = new List<CustomerWriteRequest>(rows.Count);
            for (var index = 0; index < rows.Count; index++)
            {
                var row = rows[index];
                if (!Enum.TryParse<CounterpartyType>(row.Type, true, out var type) || !Enum.IsDefined(type))
                {
                    errors.Add(new(index + 2, "type", "Tür Customer, Supplier veya Both olmalıdır."));
                    continue;
                }
                var request = new CustomerWriteRequest(normalizedCodes[index], row.Name ?? "", type, row.TaxNumber,
                    IsActive: row.IsActive, CurrencyCode: string.IsNullOrWhiteSpace(row.CurrencyCode) ? "TRY" : row.CurrencyCode,
                    RiskLimit: row.RiskLimit, PaymentTermDays: row.PaymentTermDays, IdentityNumber: row.IdentityNumber, TaxOffice: row.TaxOffice);
                if (CustomerValidation.Validate(request) is { } validation)
                    errors.AddRange(validation.SelectMany(pair => pair.Value.Select(message => new BulkImportRowError(index + 2, pair.Key, message))));
                if (request.RiskLimit is decimal risk && (risk > 9999999999999999.99m || risk != decimal.Round(risk, 2)))
                    errors.Add(new(index + 2, "riskLimit", "Risk limiti en fazla 2 ondalık basamak içerebilir."));
                requests.Add(request);
            }

            var codes = normalizedCodes.Where(x => x.Length > 0).Distinct(StringComparer.Ordinal).ToArray();
            var existingCodes = await FindExistingCodesAsync(codes,
                chunk => db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && chunk.Contains(x.Code)).Select(x => x.Code).ToListAsync(ct));
            var existingSet = existingCodes.ToHashSet(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < normalizedCodes.Length; i++)
                if (existingSet.Contains(normalizedCodes[i])) errors.Add(new(i + 2, "code", "Bu cari kodu firmada zaten kullanılıyor."));
            if (errors.Count != 0) return Results.BadRequest(new { error = "Aktarım doğrulaması başarısız. Hiçbir kayıt eklenmedi.", rowErrors = errors });

            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var customersToCreate = requests.Select(request => new CustomerAccount
            {
                TenantId = tenantId,
                Code = request.Code,
                Name = request.Name.Trim(),
                Type = request.Type,
                TaxNumber = NormalizeOptional(request.TaxNumber),
                IdentityNumber = NormalizeOptional(request.IdentityNumber),
                TaxOffice = NormalizeOptional(request.TaxOffice),
                CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant(),
                RiskLimit = request.RiskLimit,
                PaymentTermDays = request.PaymentTermDays,
                IsActive = request.IsActive
            }).ToList();
            db.CustomerAccounts.AddRange(customersToCreate);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer.bulk-imported", Resource = $"count={customersToCreate.Count}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                await transaction.RollbackAsync(ct);
                return Results.Conflict(new { error = "Cari kodlarından biri başka bir işlem sırasında eklenmiş. Güncel kayıtları yenileyip CSV'yi tekrar deneyin." });
            }
            await transaction.CommitAsync(ct);
            return Results.Ok(new BulkImportResult(customersToCreate.Count));
        });
        return customers;
    }

    public static RouteGroupBuilder MapStockBulkImportEndpoint(this RouteGroupBuilder stockItems)
    {
        stockItems.MapPost("/bulk-import", async (BulkStockImportRequest body, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var rows = body.Items;
            if (rows is null || rows.Count == 0) return Results.BadRequest(new { error = "CSV dosyasında aktarılacak satır bulunamadı." });
            if (rows.Count > MaxRows) return Results.BadRequest(new { error = $"Tek seferde en fazla {MaxRows:N0} stok kartı aktarılabilir." });

            var errors = new List<BulkImportRowError>();
            var normalizedCodes = rows.Select(row => string.IsNullOrWhiteSpace(row.Code) ? "" : row.Code.Trim().ToUpperInvariant()).ToArray();
            var normalizedBarcodes = rows.Select(row => NormalizeOptional(row.Barcode)).ToArray();
            AddDuplicateErrors(normalizedCodes, "code", "Dosyada stok kodu tekrarlanıyor.", errors);
            AddDuplicateErrors(normalizedBarcodes, "barcode", "Dosyada barkod tekrarlanıyor.", errors, ignoreEmpty: true);
            var requiredFields = await db.StockItemCustomFieldDefinitions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.IsActive && x.IsRequired).Select(x => x.Code).ToListAsync(ct);
            if (requiredFields.Count != 0)
                return Results.BadRequest(new { error = $"Zorunlu stok özel alanlar bu CSV aktarımında desteklenmiyor: {string.Join(", ", requiredFields)}. Bu alanları tamamlayıp yeniden deneyin." });

            var requests = new List<StockItemWriteRequest>(rows.Count);
            for (var index = 0; index < rows.Count; index++)
            {
                var row = rows[index];
                if (!Enum.TryParse<InventoryTrackingMode>(row.TrackingMode, true, out var trackingMode) || !Enum.IsDefined(trackingMode))
                {
                    errors.Add(new(index + 2, "trackingMode", "Takip modu None, Lot veya Serial olmalıdır."));
                    continue;
                }
                var request = new StockItemWriteRequest(normalizedCodes[index], row.Name ?? "", normalizedBarcodes[index],
                    string.IsNullOrWhiteSpace(row.UnitCode) ? "EA" : row.UnitCode, row.Category, row.MinimumStock, row.IsActive,
                    TrackingMode: trackingMode, ProcurementLeadTimeDays: row.ProcurementLeadTimeDays, ManufacturingLeadTimeDays: row.ManufacturingLeadTimeDays);
                if (InventoryValidation.Validate(request) is { } validation)
                    errors.AddRange(validation.SelectMany(pair => pair.Value.Select(message => new BulkImportRowError(index + 2, pair.Key, message))));
                requests.Add(request);
            }

            var codes = normalizedCodes.Where(x => x.Length > 0).Distinct(StringComparer.Ordinal).ToArray();
            var barcodes = normalizedBarcodes.Where(x => x is not null).Cast<string>().Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            var existingCodes = await FindExistingCodesAsync(codes,
                chunk => db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && chunk.Contains(x.Code)).Select(x => x.Code).ToListAsync(ct));
            var existingBarcodes = await FindExistingCodesAsync(barcodes,
                chunk => db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.Barcode != null && chunk.Contains(x.Barcode)).Select(x => x.Barcode!).ToListAsync(ct));
            var existingCodeSet = existingCodes.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var existingBarcodeSet = existingBarcodes.ToHashSet(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < rows.Count; i++)
            {
                if (existingCodeSet.Contains(normalizedCodes[i])) errors.Add(new(i + 2, "code", "Bu stok kodu firmada zaten kullanılıyor."));
                if (normalizedBarcodes[i] is { } barcode && existingBarcodeSet.Contains(barcode)) errors.Add(new(i + 2, "barcode", "Bu barkod firmada zaten kullanılıyor."));
            }
            if (errors.Count != 0) return Results.BadRequest(new { error = "Aktarım doğrulaması başarısız. Hiçbir kayıt eklenmedi.", rowErrors = errors });

            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var itemsToCreate = requests.Select(request => new StockItem
            {
                TenantId = tenantId,
                Code = request.Code,
                Name = request.Name.Trim(),
                Barcode = NormalizeOptional(request.Barcode),
                UnitCode = request.UnitCode.Trim().ToUpperInvariant(),
                Category = NormalizeOptional(request.Category),
                MinimumStock = request.MinimumStock,
                TrackingMode = request.TrackingMode,
                IsActive = request.IsActive,
                ProcurementLeadTimeDays = request.ProcurementLeadTimeDays,
                ManufacturingLeadTimeDays = request.ManufacturingLeadTimeDays
            }).ToList();
            db.StockItems.AddRange(itemsToCreate);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.bulk-imported", Resource = $"count={itemsToCreate.Count}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                await transaction.RollbackAsync(ct);
                return Results.Conflict(new { error = "Stok kodu veya barkod başka bir işlem sırasında eklenmiş. Güncel kayıtları yenileyip CSV'yi tekrar deneyin." });
            }
            await transaction.CommitAsync(ct);
            return Results.Ok(new BulkImportResult(itemsToCreate.Count));
        });
        return stockItems;
    }

    private static void AddDuplicateErrors(string?[] values, string field, string message, ICollection<BulkImportRowError> errors, bool ignoreEmpty = false)
    {
        var duplicates = values.Select((value, index) => (value, index))
            .Where(x => !ignoreEmpty || !string.IsNullOrWhiteSpace(x.value))
            .GroupBy(x => x.value ?? "", StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1).SelectMany(group => group);
        foreach (var duplicate in duplicates) errors.Add(new(duplicate.index + 2, field, message));
    }

    private static async Task<List<string>> FindExistingCodesAsync(string[] values, Func<string[], Task<List<string>>> query)
    {
        var result = new List<string>();
        foreach (var chunk in values.Chunk(1000)) result.AddRange(await query(chunk));
        return result;
    }

    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static Guid? GetUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sub"), out var id) && id != Guid.Empty ? id : null;
    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };
}

public sealed record BulkCustomerImportRequest(IReadOnlyList<BulkCustomerImportRow>? Items);
public sealed record BulkCustomerImportRow(string? Code, string? Name, string? Type = "Customer", string? TaxNumber = null,
    string? IdentityNumber = null, string? TaxOffice = null, string? CurrencyCode = "TRY", decimal? RiskLimit = null,
    int PaymentTermDays = 0, bool IsActive = true);
public sealed record BulkStockImportRequest(IReadOnlyList<BulkStockImportRow>? Items);
public sealed record BulkStockImportRow(string? Code, string? Name, string? Barcode = null, string? UnitCode = "EA",
    string? Category = null, decimal MinimumStock = 0, string? TrackingMode = "None", int ProcurementLeadTimeDays = 0,
    int ManufacturingLeadTimeDays = 0, bool IsActive = true);
public sealed record BulkImportRowError(int RowNumber, string Field, string Message);
public sealed record BulkImportResult(int Imported);
