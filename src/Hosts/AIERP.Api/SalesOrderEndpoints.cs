using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class SalesOrderEndpoints
{
    public static void MapSalesOrderEndpoints(this WebApplication app)
    {
        var orders = app.MapGroup("/api/sales/orders").WithTags("Satış Siparişleri").RequireAuthorization();
        orders.MapPost("/", async (SalesOrderWriteRequest request, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var userId = Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedUserId)
                ? parsedUserId : (Guid?)null;
            var code = request.Code?.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(code) || code.Length > 40 || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z0-9][A-Z0-9._/-]{0,39}$"))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["code"] = ["Sipariş numarası 1–40 karakter olmalı; harf, sayı, nokta, kısa çizgi ve / içerebilir."] });
            if (request.Lines is null || request.Lines.Count is < 1 or > 200)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Sipariş 1–200 stok satırı içermelidir."] });
            if (request.RequestedDeliveryDate is { } deliveryDate && deliveryDate < request.OrderDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["requestedDeliveryDate"] = ["İstenen teslim tarihi sipariş tarihinden önce olamaz."] });
            if (await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu satış siparişi numarası bu firmada zaten kullanılıyor." });
            var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive, ct);
            if (customer is null || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Aktif müşteri türünde bir cari seçilmelidir."] });
            var currencyCode = request.CurrencyCode?.Trim().ToUpperInvariant();
            if (currencyCode != customer.CurrencyCode)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Sipariş dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });

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
            var normalizedLines = new List<SalesQuoteLineWriteRequest>();
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var input = request.Lines[i]; var item = items[input.StockItemId];
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
                    var quantity = checked(input.Quantity * factor); var price = input.UnitPrice / factor;
                    if (input.Quantity <= 0 || quantity > 99999999999999.9999m || quantity != decimal.Round(quantity, 4) || input.UnitPrice < 0 || price > 99999999999999.9999m || input.DiscountPercent is < 0 or > 100 || input.VatPercent is < 0 or > 100)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Miktar, fiyat, iskonto veya KDV değeri geçerli değil."] });
                    normalizedLines.Add(input with { Quantity = quantity, UnitPrice = price, UnitCode = item.UnitCode });
                }
                catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü desteklenen miktar veya fiyat sınırını aşıyor."] }); }
            }
            SalesQuoteTotals totals;
            try { totals = SalesQuoteValidation.Sum(normalizedLines.Select(SalesQuoteValidation.Calculate)); }
            catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Sipariş toplamı desteklenen decimal(18,2) sınırını aşıyor."] }); }

            var order = new SalesOrder { TenantId = tenantId, QuoteId = null, CustomerId = customer.Id, Code = code,
                OrderDate = request.OrderDate, RequestedDeliveryDate = request.RequestedDeliveryDate, CurrencyCode = currencyCode!,
                Status = SalesOrderStatus.Open, Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
            for (var i = 0; i < normalizedLines.Count; i++)
            {
                var source = normalizedLines[i]; var item = items[source.StockItemId]; var amounts = SalesQuoteValidation.Calculate(source);
                order.Lines.Add(new SalesOrderLine { TenantId = tenantId, Order = order, LineNumber = i + 1, StockItemId = item.Id,
                    StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = source.Quantity, UnitPrice = source.UnitPrice,
                    DiscountPercent = source.DiscountPercent, VatPercent = source.VatPercent, LineSubtotal = amounts.LineSubtotal,
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
            catch (DbUpdateException) { return Results.Conflict(new { error = "Sipariş kaydedilemedi. Sipariş numarasının benzersiz olduğunu kontrol edin." }); }
            return Results.Created($"/api/sales/orders/{order.Id}", new SalesOrderSummary(order.Id, order.Code, null, "Bağımsız", customer.Id,
                customer.Name, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt, order.RequestedDeliveryDate));
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
                order.CreatedAt, order.RequestedDeliveryDate));
        });
    }
}
