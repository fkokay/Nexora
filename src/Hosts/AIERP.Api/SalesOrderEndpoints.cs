using System.Security.Claims;
using AIERP.Api;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class SalesOrderEndpoints
{
    public static void MapSalesOrderEndpoints(this WebApplication app)
    {
        var orders = app.MapGroup("/api/sales/orders").WithTags("Satış Siparişleri").RequireAuthorization();
        orders.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var order = await db.SalesOrders.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != SalesOrderStatus.Open ||
                await db.SalesDeliveries.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id, ct) ||
                await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id, ct) ||
                await db.SalesOrderReservations.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id, ct))
                return Results.Conflict(new { error = "Yalnızca irsaliye, fatura veya rezervasyon kaydı bulunmayan açık siparişler silinebilir." });

            var revisions = await db.SalesOrderCustomFieldValueRevisions.Where(x => x.TenantId == tenantId && x.OrderId == id).ToListAsync(ct);
            var values = await db.SalesOrderCustomFieldValues.Where(x => x.TenantId == tenantId && x.OrderId == id).ToListAsync(ct);
            db.SalesOrderCustomFieldValueRevisions.RemoveRange(revisions);
            db.SalesOrderCustomFieldValues.RemoveRange(values);
            db.SalesOrders.Remove(order);
            var userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedUserId) ? parsedUserId : (Guid?)null;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.deleted", Resource = order.Code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Sipariş ilişkili bir kayıt nedeniyle silinemedi. Sayfayı yenileyip ilişkili işlemleri kontrol edin." }); }
            return Results.NoContent();
        });
        orders.MapPost("/", async (SalesOrderWriteRequest request, ClaimsPrincipal principal, TenantDbContext db,
            ILogger<Program> logger, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedUserId)
                ? parsedUserId : (Guid?)null;
            var code = request.Code?.Trim().ToUpperInvariant() ?? "";
            if (code.Length > 40 || (code.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z0-9][A-Z0-9._/-]{0,39}$")))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["code"] = ["Sipariş numarası en fazla 40 karakter olmalı; harf, sayı, nokta, kısa çizgi ve / içerebilir."] });
            if (request.Lines is null || request.Lines.Count is < 1 or > 200)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Sipariş 1–200 stok satırı içermelidir."] });
            if (request.RequestedDeliveryDate is { } deliveryDate && deliveryDate < request.OrderDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["requestedDeliveryDate"] = ["İstenen teslim tarihi sipariş tarihinden önce olamaz."] });
            if (!string.IsNullOrWhiteSpace(code) && await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu satış siparişi numarası bu firmada zaten kullanılıyor." });
            var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive, ct);
            if (customer is null || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both or CounterpartyType.Dealer))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Aktif müşteri türünde bir cari seçilmelidir."] });
            var currencyCode = request.CurrencyCode?.Trim().ToUpperInvariant();
            if (currencyCode != customer.CurrencyCode)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Sipariş dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });
            if (request.SalespersonEmployeeId is { } salespersonId && !await db.EmployeeRecords.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == salespersonId && x.Status == EmployeeEmploymentStatus.Active, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["salespersonEmployeeId"] = ["Aktif bir plasiyer seçilmelidir."] });

            var definitions = await db.SalesOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync(ct);
            var normalizedFields = new Dictionary<Guid, (SalesOrderCustomFieldDefinition Definition, string Value)>();
            var fieldErrors = new Dictionary<string, string[]>();
            if (request.CustomFields is { Count: > 40 }) fieldErrors["customFields"] = ["En fazla 40 özel alan gönderilebilir."];
            if (request.CustomFields is not null) foreach (var pair in request.CustomFields)
            {
                var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
                if (definition is null) { fieldErrors[$"customFields.{pair.Key}"] = ["Alan kodu bu tenant içinde etkin değil."]; continue; }
                if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { fieldErrors[$"customFields.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
                if (value.Length > 0) normalizedFields[definition.Id] = (definition, value);
            }
            var missingField = definitions.FirstOrDefault(x => x.IsRequired && !normalizedFields.ContainsKey(x.Id));
            if (missingField is not null) fieldErrors[$"customFields.{missingField.Code}"] = [$"'{missingField.Label}' alanı zorunludur."];
            if (fieldErrors.Count > 0) return Results.ValidationProblem(fieldErrors);

            var itemIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
            var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (items.Count != itemIds.Length) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satırlardaki stok kartlarından biri bulunamadı veya pasif."] });
            var lineCurrencies = request.Lines.Select(x => SalesQuoteCurrencyConversion.NormalizeCurrency(x.CurrencyCode, currencyCode!)).Distinct().ToArray();
            if (lineCurrencies.Any(x => !SalesQuoteCurrencyConversion.IsCurrencyCode(x)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satır para birimi üç büyük harfli ISO kodu olmalıdır."] });
            var fx = await SalesQuoteCurrencyConversion.LoadAsync(db, tenantId, request.OrderDate, lineCurrencies.Append(currencyCode!));
            var normalizedLines = new List<(SalesQuoteLineWriteRequest Input, SalesQuoteLineWriteRequest Base, decimal Rate)>();
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var input = request.Lines[i]; var item = items[input.StockItemId];
                var enteredCurrency = SalesQuoteCurrencyConversion.NormalizeCurrency(input.CurrencyCode, currencyCode!);
                if (!SalesQuoteCurrencyConversion.TryGetConversion(fx, enteredCurrency, currencyCode!, out var rate))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].currencyCode"] = [$"{enteredCurrency} para biriminden {currencyCode} para birimine sipariş tarihli kur bulunamadı."] });
                var unitCode = string.IsNullOrWhiteSpace(input.UnitCode) ? item.UnitCode : input.UnitCode.Trim().ToUpperInvariant();
                decimal factor = 1m;
                if (!string.Equals(unitCode, item.UnitCode, StringComparison.OrdinalIgnoreCase))
                {
                    var conversion = await db.StockItemUnitConversions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.IsActive && x.UnitCode == unitCode).Select(x => (decimal?)x.FactorToBase).SingleOrDefaultAsync(ct);
                    if (conversion is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için bu birim etkin değil."] });
                    factor = conversion.Value;
                }
                try
                {
                    var quantity = checked(input.Quantity * factor); var price = checked(input.UnitPrice * rate / factor);
                    if (input.Quantity <= 0 || quantity > 99999999999999.9999m || quantity != decimal.Round(quantity, 4) || input.UnitPrice < 0 || price > 99999999999999.9999m || input.DiscountPercent is < 0 or > 100 || input.VatPercent is < 0 or > 100)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Miktar, fiyat, iskonto veya KDV değeri geçerli değil."] });
                    normalizedLines.Add((input, input with { Quantity = quantity, UnitPrice = price, UnitCode = item.UnitCode, CurrencyCode = currencyCode }, rate));
                }
                catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü desteklenen miktar veya fiyat sınırını aşıyor."] }); }
            }
            SalesQuoteTotals totals;
            try { totals = SalesQuoteValidation.Sum(normalizedLines.Select(x => SalesQuoteValidation.Calculate(x.Base))); }
            catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Sipariş toplamı desteklenen decimal(18,2) sınırını aşıyor."] }); }

            if (string.IsNullOrWhiteSpace(code)) code = await TenantDocumentNumbering.NextAsync(db, tenantId, "SalesOrder", null, request.OrderDate, ct);
            if (await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu satış siparişi numarası bu firmada zaten kullanılıyor." });

            var order = new SalesOrder { TenantId = tenantId, QuoteId = null, CustomerId = customer.Id, Code = code,
                SalespersonEmployeeId = request.SalespersonEmployeeId,
                OrderDate = request.OrderDate, RequestedDeliveryDate = request.RequestedDeliveryDate, CurrencyCode = currencyCode!,
                Status = SalesOrderStatus.Open, Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
            for (var i = 0; i < normalizedLines.Count; i++)
            {
                var normalized = normalizedLines[i]; var source = normalized.Base; var input = normalized.Input;
                var item = items[source.StockItemId]; var amounts = SalesQuoteValidation.Calculate(source);
                order.Lines.Add(new SalesOrderLine { TenantId = tenantId, Order = order, LineNumber = i + 1, StockItemId = item.Id,
                    StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
                    EnteredCurrencyCode = SalesQuoteCurrencyConversion.NormalizeCurrency(input.CurrencyCode, currencyCode!),
                    EnteredUnitPrice = input.UnitPrice, EnteredUnitCode = string.IsNullOrWhiteSpace(input.UnitCode) ? item.UnitCode : input.UnitCode.Trim().ToUpperInvariant(),
                    ExchangeRateToOrderCurrency = normalized.Rate, Quantity = source.Quantity, UnitPrice = source.UnitPrice,
                    DiscountPercent = source.DiscountPercent, VatPercent = source.VatPercent, IsVatIncluded = source.IsVatIncluded, LineSubtotal = amounts.LineSubtotal,
                    DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
            }
            db.SalesOrders.Add(order);
            foreach (var field in normalizedFields.Values)
            {
                db.SalesOrderCustomFieldValues.Add(new SalesOrderCustomFieldValue { TenantId = tenantId, OrderId = order.Id, DefinitionId = field.Definition.Id, Value = field.Value, DefinitionVersion = field.Definition.Version });
                db.SalesOrderCustomFieldValueRevisions.Add(new SalesOrderCustomFieldValueRevision { TenantId = tenantId, OrderId = order.Id, DefinitionId = field.Definition.Id, NewValue = field.Value, DefinitionVersion = field.Definition.Version, ChangedByUserId = userId });
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.created-direct", Resource = code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                logger.LogWarning(ex, "Sales order code conflict for tenant {TenantId} and order {OrderCode}.", tenantId, SanitizeForLog(code));
                return Results.Conflict(new { error = "Bu satış siparişi numarası bu firmada zaten kullanılıyor.", code = "sales_order.code_conflict" });
            }
            catch (DbUpdateException ex)
            {
                logger.LogError(ex, "Could not persist sales order for tenant {TenantId} and order {OrderCode}.", tenantId, SanitizeForLog(code));
                return Results.Json(new
                {
                    error = "Sipariş kaydedilemedi. Veritabanında bir kayıt kısıtı oluştu; sistem günlüğünde ayrıntı kaydedildi.",
                    code = "sales_order.persistence_failed"
                }, statusCode: StatusCodes.Status500InternalServerError);
            }
            return Results.Created($"/api/sales/orders/{order.Id}", new SalesOrderSummary(order.Id, order.Code, null, "Bağımsız", customer.Id,
                customer.Name, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt, order.RequestedDeliveryDate, order.SalespersonEmployeeId));
        });
        orders.MapPut("/{id:guid}", async (Guid id, SalesOrderWriteRequest request, ClaimsPrincipal principal,
            TenantDbContext db, ILogger<Program> logger, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedUserId)
                ? parsedUserId : (Guid?)null;
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var order = await db.SalesOrders.Include(x => x.Quote).Include(x => x.Customer).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != SalesOrderStatus.Open ||
                await db.SalesDeliveries.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id, ct) ||
                await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id, ct) ||
                await db.SalesOrderReservations.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id, ct))
                return Results.Conflict(new { error = "Yalnızca sevkiyat, fatura veya rezervasyonu olmayan açık siparişler düzenlenebilir." });

            var code = request.Code?.Trim().ToUpperInvariant() ?? "";
            if (code.Length is < 1 or > 40 || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z0-9][A-Z0-9._/-]{0,39}$"))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["code"] = ["Sipariş numarası 1–40 karakter olmalı; harf, sayı, nokta, kısa çizgi ve / içerebilir."] });
            if (await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu satış siparişi numarası bu firmada zaten kullanılıyor." });
            if (request.Lines is null || request.Lines.Count is < 1 or > 200)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Sipariş 1–200 stok satırı içermelidir."] });
            if (request.RequestedDeliveryDate is { } deliveryDate && deliveryDate < request.OrderDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["requestedDeliveryDate"] = ["İstenen teslim tarihi sipariş tarihinden önce olamaz."] });

            var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive, ct);
            if (customer is null || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both or CounterpartyType.Dealer))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Aktif müşteri türünde bir cari seçilmelidir."] });
            var currencyCode = request.CurrencyCode?.Trim().ToUpperInvariant();
            if (currencyCode != customer.CurrencyCode)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Sipariş dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });
            if (request.SalespersonEmployeeId is { } salespersonId && !await db.EmployeeRecords.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == salespersonId && x.Status == EmployeeEmploymentStatus.Active, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["salespersonEmployeeId"] = ["Aktif bir plasiyer seçilmelidir."] });

            var definitions = await db.SalesOrderCustomFieldDefinitions.Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(ct);
            var normalizedFields = new Dictionary<Guid, (SalesOrderCustomFieldDefinition Definition, string Value)>();
            var fieldErrors = new Dictionary<string, string[]>();
            if (request.CustomFields is { Count: > 40 }) fieldErrors["customFields"] = ["En fazla 40 özel alan gönderilebilir."];
            if (request.CustomFields is not null) foreach (var pair in request.CustomFields)
            {
                var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
                if (definition is null) { fieldErrors[$"customFields.{pair.Key}"] = ["Alan kodu bu tenant içinde etkin değil."]; continue; }
                if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { fieldErrors[$"customFields.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
                if (value.Length > 0) normalizedFields[definition.Id] = (definition, value);
            }
            var missingField = definitions.FirstOrDefault(x => x.IsRequired && !normalizedFields.ContainsKey(x.Id));
            if (missingField is not null) fieldErrors[$"customFields.{missingField.Code}"] = [$"'{missingField.Label}' alanı zorunludur."];
            if (fieldErrors.Count > 0) return Results.ValidationProblem(fieldErrors);

            var itemIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
            var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (items.Count != itemIds.Length) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satırlardaki stok kartlarından biri bulunamadı veya pasif."] });
            var lineCurrencies = request.Lines.Select(x => SalesQuoteCurrencyConversion.NormalizeCurrency(x.CurrencyCode, currencyCode!)).Distinct().ToArray();
            if (lineCurrencies.Any(x => !SalesQuoteCurrencyConversion.IsCurrencyCode(x)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satır para birimi üç büyük harfli ISO kodu olmalıdır."] });
            var fx = await SalesQuoteCurrencyConversion.LoadAsync(db, tenantId, request.OrderDate, lineCurrencies.Append(currencyCode!));
            var normalizedLines = new List<(SalesQuoteLineWriteRequest Input, SalesQuoteLineWriteRequest Base, decimal Rate)>();
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var input = request.Lines[i]; var item = items[input.StockItemId];
                var enteredCurrency = SalesQuoteCurrencyConversion.NormalizeCurrency(input.CurrencyCode, currencyCode!);
                if (!SalesQuoteCurrencyConversion.TryGetConversion(fx, enteredCurrency, currencyCode!, out var rate))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].currencyCode"] = [$"{enteredCurrency} para biriminden {currencyCode} para birimine sipariş tarihli kur bulunamadı."] });
                var unitCode = string.IsNullOrWhiteSpace(input.UnitCode) ? item.UnitCode : input.UnitCode.Trim().ToUpperInvariant();
                decimal factor = 1m;
                if (!string.Equals(unitCode, item.UnitCode, StringComparison.OrdinalIgnoreCase))
                {
                    var conversion = await db.StockItemUnitConversions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.IsActive && x.UnitCode == unitCode).Select(x => (decimal?)x.FactorToBase).SingleOrDefaultAsync(ct);
                    if (conversion is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için bu birim etkin değil."] });
                    factor = conversion.Value;
                }
                try
                {
                    var quantity = checked(input.Quantity * factor); var price = checked(input.UnitPrice * rate / factor);
                    if (input.Quantity <= 0 || quantity > 99999999999999.9999m || quantity != decimal.Round(quantity, 4) || input.UnitPrice < 0 || price > 99999999999999.9999m || input.DiscountPercent is < 0 or > 100 || input.VatPercent is < 0 or > 100)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Miktar, fiyat, iskonto veya KDV değeri geçerli değil."] });
                    normalizedLines.Add((input, input with { Quantity = quantity, UnitPrice = price, UnitCode = item.UnitCode, CurrencyCode = currencyCode }, rate));
                }
                catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü desteklenen miktar veya fiyat sınırını aşıyor."] }); }
            }
            SalesQuoteTotals totals;
            try { totals = SalesQuoteValidation.Sum(normalizedLines.Select(x => SalesQuoteValidation.Calculate(x.Base))); }
            catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Sipariş toplamı desteklenen decimal(18,2) sınırını aşıyor."] }); }

            order.Code = code; order.CustomerId = customer.Id; order.Customer = customer; order.OrderDate = request.OrderDate;
            order.SalespersonEmployeeId = request.SalespersonEmployeeId;
            order.RequestedDeliveryDate = request.RequestedDeliveryDate; order.CurrencyCode = currencyCode!;
            order.Subtotal = totals.Subtotal; order.DiscountTotal = totals.DiscountTotal; order.TaxTotal = totals.TaxTotal; order.GrandTotal = totals.GrandTotal;
            db.SalesOrderLines.RemoveRange(order.Lines);
            order.Lines.Clear();
            for (var i = 0; i < normalizedLines.Count; i++)
            {
                var normalized = normalizedLines[i]; var source = normalized.Base; var input = normalized.Input; var item = items[source.StockItemId];
                var amounts = SalesQuoteValidation.Calculate(source);
                order.Lines.Add(new SalesOrderLine { TenantId = tenantId, Order = order, LineNumber = i + 1, StockItemId = item.Id,
                    StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
                    EnteredCurrencyCode = SalesQuoteCurrencyConversion.NormalizeCurrency(input.CurrencyCode, currencyCode!), EnteredUnitPrice = input.UnitPrice,
                    EnteredUnitCode = string.IsNullOrWhiteSpace(input.UnitCode) ? item.UnitCode : input.UnitCode.Trim().ToUpperInvariant(), ExchangeRateToOrderCurrency = normalized.Rate,
                    Quantity = source.Quantity, UnitPrice = source.UnitPrice, DiscountPercent = source.DiscountPercent, VatPercent = source.VatPercent, IsVatIncluded = source.IsVatIncluded,
                    LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
            }
            var currentValues = await db.SalesOrderCustomFieldValues.Where(x => x.TenantId == tenantId && x.OrderId == id).ToListAsync(ct);
            foreach (var field in normalizedFields.Values)
            {
                var existing = currentValues.FirstOrDefault(x => x.DefinitionId == field.Definition.Id);
                var previous = existing?.Value;
                if (existing is null) db.SalesOrderCustomFieldValues.Add(new SalesOrderCustomFieldValue { TenantId = tenantId, OrderId = id, DefinitionId = field.Definition.Id, Value = field.Value, DefinitionVersion = field.Definition.Version });
                else { existing.Value = field.Value; existing.DefinitionVersion = field.Definition.Version; }
                if (!string.Equals(previous, field.Value, StringComparison.Ordinal)) db.SalesOrderCustomFieldValueRevisions.Add(new SalesOrderCustomFieldValueRevision { TenantId = tenantId, OrderId = id, DefinitionId = field.Definition.Id, PreviousValue = previous, NewValue = field.Value, DefinitionVersion = field.Definition.Version, ChangedByUserId = userId });
            }
            var removed = currentValues.Where(x => !normalizedFields.ContainsKey(x.DefinitionId)).ToList();
            foreach (var value in removed)
            {
                db.SalesOrderCustomFieldValues.Remove(value);
                db.SalesOrderCustomFieldValueRevisions.Add(new SalesOrderCustomFieldValueRevision { TenantId = tenantId, OrderId = id, DefinitionId = value.DefinitionId, PreviousValue = value.Value, NewValue = null, DefinitionVersion = value.DefinitionVersion, ChangedByUserId = userId });
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.updated", Resource = code });
            try { await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                logger.LogWarning(ex, "Sales order code conflict for tenant {TenantId} and order {OrderCode}.", tenantId, SanitizeForLog(code));
                return Results.Conflict(new { error = "Bu satış siparişi numarası bu firmada zaten kullanılıyor.", code = "sales_order.code_conflict" });
            }
            catch (DbUpdateException ex)
            {
                logger.LogError(ex, "Could not update sales order for tenant {TenantId} and order {OrderCode}.", tenantId, SanitizeForLog(code));
                return Results.Json(new { error = "Sipariş güncellenemedi. Veritabanı kısıtı oluştu.", code = "sales_order.update_failed" }, statusCode: StatusCodes.Status500InternalServerError);
            }
            return Results.Ok(new SalesOrderSummary(order.Id, order.Code, order.QuoteId, order.Quote?.Code ?? "Bağımsız", customer.Id,
                customer.Name, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt, order.RequestedDeliveryDate, order.SalespersonEmployeeId));
        });
        orders.MapPut("/{id:guid}/delivery-date", async (Guid id, SalesOrderDeliveryDateWriteRequest request,
            ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedUserId)
                ? parsedUserId : (Guid?)null;
            var order = await db.SalesOrders.Include(x => x.Quote).Include(x => x.Customer).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != SalesOrderStatus.Open)
                return Results.Conflict(new { error = "Yalnızca açık satış siparişlerinin teslim tarihi düzenlenebilir." });
            if (request.RequestedDeliveryDate is { } date && date < order.OrderDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["requestedDeliveryDate"] = ["İstenen teslim tarihi sipariş tarihinden önce olamaz."] });

            var previous = order.RequestedDeliveryDate;
            order.RequestedDeliveryDate = request.RequestedDeliveryDate;
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId, UserId = userId, Action = "sales-order.delivery-date-updated",
                Resource = $"{order.Code}:{previous?.ToString("yyyy-MM-dd") ?? "unspecified"}->{request.RequestedDeliveryDate?.ToString("yyyy-MM-dd") ?? "unspecified"}"
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new SalesOrderSummary(order.Id, order.Code, order.QuoteId, order.Quote?.Code ?? "Bağımsız", order.CustomerId,
                order.Customer.Name, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count,
                order.CreatedAt, order.RequestedDeliveryDate, order.SalespersonEmployeeId));
        });
    }

    private static string SanitizeForLog(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value
            .Replace("\r", string.Empty)
            .Replace("\n", string.Empty);
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.GetBaseException() is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };
}
