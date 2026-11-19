using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Talep olmadan doğrudan girilen tedarikçi teklifi. Talepli teklif (`/api/purchasing/requests/{id}/supplier-quotes`)
/// ile aynı tedarikçi, para birimi, toplam, özel alan ve denetim kurallarını uygular; satırlar stok kartından gelir.
/// Yetki, rota önekinden çözülen `erp.supplier-quotes.create` izniyle ve TenantAdmin rolüyle denetlenir.
/// </summary>
public static class PurchaseSupplierQuoteEndpoints
{
    public static void MapPurchaseSupplierQuoteEndpoints(this WebApplication app)
    {
        var supplierQuotes = app.MapGroup("/api/purchasing/supplier-quotes").WithTags("Tedarikçi Teklifleri").RequireAuthorization();
        supplierQuotes.MapPost("/", async (PurchaseSupplierQuoteStandaloneWriteRequest input, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var errors = PurchaseSupplierQuoteValidation.Validate(input);
            if (errors is not null) return Results.ValidationProblem(errors);
            var userId = GetUserId(principal);
            if (userId is null) return Results.Forbid();

            var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == input.SupplierId, ct);
            if (supplier is null) return Results.NotFound();
            if (!supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
                return Results.Conflict(new { error = "Aktif bir tedarikçi seçilmelidir." });

            var stockIds = input.Lines.Select(x => x.StockItemId).Distinct().ToArray();
            var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (items.Count != stockIds.Length || items.Values.Any(x => !x.IsActive))
                return Results.Conflict(new { error = "Teklif satırlarından en az birinin stok kartı bulunamadı veya pasif." });

            var pricedLines = input.Lines.Select(x => new SalesQuoteLineWriteRequest(x.StockItemId, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent)).ToArray();
            SalesQuoteLineAmounts[] amounts;
            SalesQuoteTotals totals;
            try
            {
                amounts = pricedLines.Select(SalesQuoteValidation.Calculate).ToArray();
                totals = SalesQuoteValidation.Sum(amounts);
            }
            catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }

            // SQL Server'da özel alan tanımları talepli teklifteki gibi kilitlenir; zorunlu alan aynı anda açılırsa kayıt bekler.
            // InMemory sağlayıcısı (entegrasyon testleri) ham SQL ve işlem desteklemediği için aynı sorgu LINQ ile okunur.
            var relational = db.Database.IsRelational();
            await using var transaction = relational ? await db.Database.BeginTransactionAsync(ct) : null;
            var customFieldDefinitions = relational
                ? await db.PurchaseSupplierQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync(ct)
                : await db.PurchaseSupplierQuoteCustomFieldDefinitions.Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(ct);
            var customFieldErrors = new Dictionary<string, string[]>();
            var customFieldValues = new Dictionary<Guid, string>();
            foreach (var field in customFieldDefinitions)
            {
                string? rawValue = null;
                input.CustomFields?.TryGetValue(field.Code, out rawValue);
                if (!StockCustomFieldValidation.TryNormalize(field.DataType, field.MaxLength, rawValue, out var normalized))
                { customFieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı geçersiz."]; continue; }
                if (normalized.Length > 0) customFieldValues[field.Id] = normalized;
                else if (field.IsRequired) customFieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı zorunludur."];
            }
            if (customFieldErrors.Count > 0) return Results.ValidationProblem(customFieldErrors);

            var quote = new PurchaseSupplierQuote
            {
                TenantId = tenantId, PurchaseRequestId = null, SupplierId = supplier.Id, Code = input.Code.Trim(), QuoteDate = input.QuoteDate,
                ValidUntil = input.ValidUntil, CurrencyCode = supplier.CurrencyCode, Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(),
                Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal
            };
            for (var i = 0; i < input.Lines.Count; i++)
            {
                var line = input.Lines[i];
                var item = items[line.StockItemId];
                quote.Lines.Add(new PurchaseSupplierQuoteLine
                {
                    TenantId = tenantId, Quote = quote, PurchaseRequestId = null, RequestLineNumber = i + 1, StockItemId = item.Id,
                    StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = line.Quantity, UnitPrice = line.UnitPrice,
                    DiscountPercent = line.DiscountPercent, VatPercent = line.VatPercent, LineSubtotal = amounts[i].LineSubtotal,
                    DiscountAmount = amounts[i].DiscountAmount, TaxAmount = amounts[i].TaxAmount, LineTotal = amounts[i].LineTotal
                });
            }
            foreach (var (definitionId, value) in customFieldValues)
            {
                var field = customFieldDefinitions.Single(x => x.Id == definitionId);
                quote.CustomFieldValues.Add(new PurchaseSupplierQuoteCustomFieldValue { TenantId = tenantId, Quote = quote, DefinitionId = definitionId, Value = value, DefinitionVersion = field.Version });
                quote.CustomFieldValueRevisions.Add(new PurchaseSupplierQuoteCustomFieldValueRevision { TenantId = tenantId, Quote = quote, DefinitionId = definitionId, NewValue = value, DefinitionVersion = field.Version, ChangedByUserId = userId });
            }
            db.PurchaseSupplierQuotes.Add(quote);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.created", Resource = $"{quote.Code}:-:{supplier.Name}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            { return Results.Conflict(new { error = "Bu tedarikçi teklif numarası bu tedarikçi için daha önce kullanılmış." }); }
            if (transaction is not null) await transaction.CommitAsync(ct);

            return Results.Created($"/api/purchasing/supplier-quotes/{quote.Id}", new PurchaseSupplierQuoteView(quote.Id, null, null, quote.Code,
                supplier.Id, supplier.Name, quote.QuoteDate, quote.ValidUntil, quote.CurrencyCode, quote.Status, quote.Subtotal, quote.DiscountTotal,
                quote.TaxTotal, quote.GrandTotal, quote.Notes, quote.CreatedAt,
                quote.Lines.OrderBy(x => x.RequestLineNumber).Select(x => new PurchaseSupplierQuoteLineView(x.RequestLineNumber, x.StockCode, x.StockName,
                    x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList(),
                CustomFields: customFieldDefinitions.Select(field => new PurchaseSupplierQuoteCustomFieldValueView(field.Id, field.Code, field.Label,
                    field.DataType, field.MaxLength, field.Version, field.IsRequired, customFieldValues.GetValueOrDefault(field.Id) ?? "")).ToList()));
        });
    }

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) => Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);

    private static Guid? GetUserId(ClaimsPrincipal principal) => Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;

    private static bool IsUniqueViolation(DbUpdateException exception) => exception.InnerException is SqlException { Number: 2601 or 2627 };
}
