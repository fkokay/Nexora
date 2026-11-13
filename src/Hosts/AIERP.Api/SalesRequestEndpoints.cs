using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Satış talebi: müşteriden gelen ürün talebi. Talepten teklif oluşturma, mevcut teklif oluşturma uç noktasına
/// `salesRequestId` gönderilerek yapılır; ilk teklifle talep "Quoted" durumuna geçer.
/// </summary>
public static class SalesRequestEndpoints
{
    private const int MaxLines = 100;
    private const decimal MaxQuantity = 99999999999999.9999m;

    public static void MapSalesRequestEndpoints(this WebApplication app)
    {
        var requests = app.MapGroup("/api/sales/requests").WithTags("Satış Talepleri").RequireAuthorization();

        requests.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct, string? q = null, int page = 1, int pageSize = 25) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
            var query = db.SalesRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Code.Contains(term) || x.Customer.Name.Contains(term) || x.Customer.Code.Contains(term));
            }
            var total = await query.CountAsync(ct);
            var rows = await query.OrderByDescending(x => x.RequestDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new SalesRequestSummary(x.Id, x.Code, x.CustomerId, x.Customer.Name, x.RequestDate, x.NeededByDate, x.Description,
                    x.Status, x.Lines.Count, x.Quotes.Count, x.CreatedAt))
                .ToListAsync(ct);
            return Results.Ok(new SalesRequestPage(rows, page, pageSize, total));
        });

        requests.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var request = await db.SalesRequests.AsNoTracking().Include(x => x.Customer).Include(x => x.Lines).Include(x => x.Quotes)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            return request is null ? Results.NotFound() : Results.Ok(ToView(request));
        });

        requests.MapPost("/", async (SalesRequestWriteRequest input, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var errors = Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var code = input.Code!.Trim().ToUpperInvariant();
            if (await db.SalesRequests.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu talep numarası bu firmada zaten kullanılıyor." });
            var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == input.CustomerId && x.IsActive, ct);
            if (customer is null || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Aktif müşteri türünde bir cari seçilmelidir."] });

            var lines = input.Lines!;
            var itemIds = lines.Select(x => x.StockItemId).Distinct().ToArray();
            var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (items.Count != itemIds.Length)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satırlardaki stok kartlarından biri bulunamadı veya pasif."] });

            var request = new SalesRequest
            {
                TenantId = tenantId, CustomerId = customer.Id, Code = code, RequestDate = input.RequestDate, NeededByDate = input.NeededByDate,
                Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim(), CreatedByUserId = GetUserId(principal)
            };
            for (var i = 0; i < lines.Count; i++)
            {
                var line = lines[i]; var item = items[line.StockItemId];
                var unitCode = string.IsNullOrWhiteSpace(line.UnitCode) ? item.UnitCode : line.UnitCode.Trim().ToUpperInvariant();
                decimal? factor = 1m;
                if (!string.Equals(unitCode, item.UnitCode, StringComparison.OrdinalIgnoreCase))
                    factor = await db.StockItemUnitConversions.AsNoTracking()
                        .Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.IsActive && x.UnitCode == unitCode)
                        .Select(x => (decimal?)x.FactorToBase).SingleOrDefaultAsync(ct);
                if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için bu birim etkin değil."] });
                decimal baseQuantity;
                try { baseQuantity = checked(line.Quantity * factor.Value); }
                catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü desteklenen miktar sınırını aşıyor."] }); }
                if (baseQuantity <= 0m || baseQuantity > MaxQuantity || baseQuantity != decimal.Round(baseQuantity, 4))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü temel miktar için desteklenen hassasiyet sınırını aşıyor."] });
                var converted = factor.Value != 1m;
                request.Lines.Add(new SalesRequestLine
                {
                    TenantId = tenantId, LineNumber = i + 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
                    Quantity = baseQuantity, EnteredQuantity = converted ? line.Quantity : null, EnteredUnitCode = converted ? unitCode : null
                });
            }
            db.SalesRequests.Add(request);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-request.created", Resource = code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException)
            {
                // Aynı numarayla eşzamanlı kayıt: benzersiz dizin ihlali çakışma olarak döner, diğer hatalar yükseltilir.
                if (!await db.SalesRequests.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Code == code && x.Id != request.Id, ct)) throw;
                return Results.Conflict(new { error = "Bu talep numarası bu firmada zaten kullanılıyor." });
            }
            return Results.Created($"/api/sales/requests/{request.Id}", new SalesRequestSummary(request.Id, request.Code, customer.Id, customer.Name,
                request.RequestDate, request.NeededByDate, request.Description, request.Status, request.Lines.Count, 0, request.CreatedAt));
        });

        requests.MapPost("/{id:guid}/cancel", async (Guid id, SalesRequestCancelRequest input, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var reason = input.Reason?.Trim();
            if (string.IsNullOrEmpty(reason) || reason.Length > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["İptal gerekçesi zorunludur ve en fazla 500 karakter olabilir."] });
            var request = await db.SalesRequests.Include(x => x.Customer).Include(x => x.Lines).Include(x => x.Quotes)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (request is null) return Results.NotFound();
            if (request.Status != SalesRequestStatus.Open)
                return Results.Conflict(new { error = request.Status == SalesRequestStatus.Quoted ? "Teklif verilmiş talep iptal edilemez." : "Talep zaten iptal edilmiş." });
            request.Status = SalesRequestStatus.Cancelled;
            request.CancelReason = reason;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-request.cancelled", Resource = request.Code });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(request));
        });
    }

    private static Dictionary<string, string[]> Validate(SalesRequestWriteRequest input)
    {
        var errors = new Dictionary<string, string[]>();
        var code = input.Code?.Trim();
        if (string.IsNullOrEmpty(code) || code.Length > 40) errors["code"] = ["Talep numarası zorunludur ve en fazla 40 karakter olabilir."];
        if (input.CustomerId == Guid.Empty) errors["customerId"] = ["Müşteri seçilmelidir."];
        if (input.RequestDate == default) errors["requestDate"] = ["Talep tarihi zorunludur."];
        if (input.NeededByDate is { } neededBy && neededBy < input.RequestDate) errors["neededByDate"] = ["İhtiyaç tarihi talep tarihinden önce olamaz."];
        if (input.Description is { Length: > 1000 }) errors["description"] = ["Açıklama en fazla 1000 karakter olabilir."];
        if (input.Lines is null || input.Lines.Count == 0) errors["lines"] = ["En az bir satır girilmelidir."];
        else if (input.Lines.Count > MaxLines) errors["lines"] = [$"En fazla {MaxLines} satır girilebilir."];
        else for (var i = 0; i < input.Lines.Count; i++)
        {
            var line = input.Lines[i];
            if (line.StockItemId == Guid.Empty) errors[$"lines[{i}].stockItemId"] = ["Stok kartı seçilmelidir."];
            if (line.Quantity <= 0m || line.Quantity > MaxQuantity || line.Quantity != decimal.Round(line.Quantity, 4))
                errors[$"lines[{i}].quantity"] = ["Miktar sıfırdan büyük olmalı ve en fazla 4 ondalık basamak içermelidir."];
            if (line.UnitCode is { Length: > 8 }) errors[$"lines[{i}].unitCode"] = ["Birim kodu en fazla 8 karakter olabilir."];
        }
        return errors;
    }

    private static SalesRequestView ToView(SalesRequest request) => new(request.Id, request.Code, request.CustomerId, request.Customer.Name,
        request.Customer.CurrencyCode, request.RequestDate, request.NeededByDate, request.Description, request.Status, request.CancelReason, request.CreatedAt,
        request.Lines.OrderBy(x => x.LineNumber).Select(x => new SalesRequestLineView(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode,
            x.Quantity, x.EnteredQuantity, x.EnteredUnitCode)).ToList(),
        request.Quotes.OrderBy(x => x.CreatedAt).Select(x => new SalesRequestQuoteLink(x.Id, x.Code, x.Status, x.GrandTotal, x.CurrencyCode, x.QuoteDate)).ToList());

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);

    private static Guid? GetUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ? userId : null;
}
