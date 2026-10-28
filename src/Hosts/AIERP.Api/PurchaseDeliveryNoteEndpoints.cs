using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

public static class PurchaseDeliveryNoteEndpoints
{
    public static void MapPurchaseDeliveryNoteEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/purchasing/delivery-notes").WithTags("Tedarikçi irsaliyeleri").RequireAuthorization();

        group.MapGet("/search", async (ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            string? q, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            var term = q?.Trim().ToUpperInvariant();
            if (term is null || term.Length is < 2 or > 100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["q"] = ["Tedarikçi irsaliyesi araması 2–100 karakter olmalıdır."] });

            var accessibleOrders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            var orderIds = accessibleOrders.Select(x => x.Id);
            var query = db.PurchaseDeliveryNotes.AsNoTracking().Where(x => x.TenantId == tenantId
                && orderIds.Contains(x.PurchaseOrderId)
                && (x.DocumentNumber.ToUpper().Contains(term) || x.PurchaseOrder.Code.ToUpper().Contains(term)));
            var totalCount = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.DocumentDate).ThenByDescending(x => x.CreatedAt)
                .ThenBy(x => x.DocumentNumber).Take(10)
                .Select(x => new
                {
                    documentNumber = x.DocumentNumber,
                    purchaseOrderCode = x.PurchaseOrder.Code,
                    documentDate = x.DocumentDate,
                    lineCount = x.Lines.Count,
                    linkedToReceipt = x.PurchaseReceiptId.HasValue
                }).ToListAsync(ct);
            return Results.Ok(new { totalCount, returned = items.Count, hasMore = totalCount > items.Count, items });
        });

        // Assistant-facing detail lookup: resolve by the exact document number, enforce the
        // caller's purchase-order scope, and return only bounded operational line facts.
        group.MapGet("/search/details", async (ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            string? documentNumber, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            var term = documentNumber?.Trim();
            if (term is null || term.Length is < 2 or > 80 || term.Any(char.IsControl))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["documentNumber"] = ["Belge numarası 2–80 karakter olmalıdır."] });

            var accessibleOrders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            var orderIds = accessibleOrders.Select(x => x.Id);
            var matches = await db.PurchaseDeliveryNotes.AsNoTracking()
                .Where(x => x.TenantId == tenantId && orderIds.Contains(x.PurchaseOrderId)
                    && x.DocumentNumber.ToUpper() == term.ToUpper())
                .OrderBy(x => x.CreatedAt)
                .Take(2)
                .Select(x => new
                {
                    documentNumber = x.DocumentNumber,
                    purchaseOrderCode = x.PurchaseOrder.Code,
                    documentDate = x.DocumentDate,
                    linkedToReceipt = x.PurchaseReceiptId.HasValue,
                    lineCount = x.Lines.Count,
                    lines = x.Lines.OrderBy(line => line.OrderLineNumber).Take(51)
                        .Select(line => new { lineNumber = line.OrderLineNumber, unitCode = line.UnitCode, quantity = line.Quantity })
                        .ToList()
                })
                .ToListAsync(ct);

            if (matches.Count == 0) return Results.NotFound(new { errorCode = "delivery_note_not_found" });
            if (matches.Count > 1) return Results.Conflict(new { errorCode = "delivery_note_not_unique" });

            var note = matches[0];
            return Results.Ok(new
            {
                note.documentNumber,
                note.purchaseOrderCode,
                documentDate = note.documentDate.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
                note.linkedToReceipt,
                note.lineCount,
                returnedLines = Math.Min(note.lineCount, 50),
                hasMoreLines = note.lineCount > 50,
                lines = note.lines.Take(50)
            });
        });

        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, int page = 1, int pageSize = 50,
            CancellationToken ct = default) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
            var orders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            var orderIds = orders.Select(x => x.Id);
            var query = db.PurchaseDeliveryNotes.AsNoTracking().Where(x => x.TenantId == tenantId && orderIds.Contains(x.PurchaseOrderId));
            var total = await query.CountAsync(ct);
            var notes = await query.OrderByDescending(x => x.DocumentDate).ThenByDescending(x => x.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize).Select(x => new PurchaseDeliveryNoteView(
                    x.Id, x.DocumentNumber, x.DocumentDate, x.PurchaseOrderId, x.PurchaseOrder.Code,
                    x.PurchaseOrder.Supplier.Name, x.PurchaseReceiptId, x.PurchaseReceipt == null ? null : x.PurchaseReceipt.Code,
                    x.Lines.Count, x.CreatedAt)).ToListAsync(ct);
            return Results.Ok(new PurchaseDeliveryNotePage(notes, page, pageSize, total));
        });

        group.MapGet("/orders/{orderId:guid}", async (Guid orderId, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            var accessibleOrders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            var orderExists = await accessibleOrders.AnyAsync(x => x.Id == orderId, ct);
            if (!orderExists) return Results.NotFound();
            var notes = await db.PurchaseDeliveryNotes.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == orderId)
                .OrderByDescending(x => x.DocumentDate).ThenByDescending(x => x.CreatedAt)
                .Select(x => new PurchaseDeliveryNoteView(x.Id, x.DocumentNumber, x.DocumentDate, x.PurchaseOrderId,
                    x.PurchaseOrder.Code, x.PurchaseOrder.Supplier.Name, x.PurchaseReceiptId,
                    x.PurchaseReceipt == null ? null : x.PurchaseReceipt.Code, x.Lines.Count, x.CreatedAt,
                    x.Lines.OrderBy(l => l.OrderLineNumber).Select(l => new PurchaseDeliveryNoteLineView(
                        l.OrderLineNumber, l.PurchaseOrderId == orderId ? l.UnitCode : "", l.Quantity)).ToList()))
                .ToListAsync(ct);
            return Results.Ok(notes);
        });

        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            var note = await db.PurchaseDeliveryNotes.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                .Select(x => new PurchaseDeliveryNoteView(x.Id, x.DocumentNumber, x.DocumentDate, x.PurchaseOrderId,
                    x.PurchaseOrder.Code, x.PurchaseOrder.Supplier.Name, x.PurchaseReceiptId,
                    x.PurchaseReceipt == null ? null : x.PurchaseReceipt.Code, x.Lines.Count, x.CreatedAt,
                    x.Lines.OrderBy(l => l.OrderLineNumber).Select(l => new PurchaseDeliveryNoteLineView(
                        l.OrderLineNumber, l.UnitCode, l.Quantity)).ToList()))
                .SingleOrDefaultAsync(ct);
            if (note is null) return Results.NotFound();
            var accessibleOrders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            if (!await accessibleOrders.AnyAsync(x => x.Id == note.PurchaseOrderId, ct)) return Results.NotFound();
            return Results.Ok(note);
        });

        group.MapPost("/orders/{orderId:guid}", async (Guid orderId, PurchaseDeliveryNoteWriteRequest request,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(request.DocumentNumber) || request.DocumentNumber.Trim().Length > 80
                || request.DocumentDate == default || request.Lines is null || request.Lines.Count is < 1 or > 500
                || request.Lines.Any(x => x.OrderLineNumber <= 0 || x.Quantity <= 0m || x.Quantity > 99999999999999.9999m
                    || x.Quantity != decimal.Round(x.Quantity, 4)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["deliveryNote"] = ["Belge numarası ve en az bir pozitif, en fazla dört ondalık basamaklı miktar içeren satır gereklidir."] });
            if (request.Lines.Select(x => x.OrderLineNumber).Distinct().Count() != request.Lines.Count)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Aynı sipariş satırı irsaliyede bir kez bulunabilir."] });

            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var accessibleOrders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            if (!await accessibleOrders.AnyAsync(x => x.Id == orderId, ct)) return Results.NotFound();
            var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {orderId}").Include(x => x.Supplier)
                .SingleOrDefaultAsync(ct);
            if (order is null) return Results.NotFound();
            if (order.Status is PurchaseOrderStatus.Cancelled or PurchaseOrderStatus.PendingApproval or PurchaseOrderStatus.Rejected)
                return Results.Conflict(new { error = "Bu sipariş durumunda tedarikçi irsaliyesi kaydedilemez." });

            var orderLines = await db.PurchaseOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == orderId)
                .ToDictionaryAsync(x => x.LineNumber, ct);
            if (request.Lines.Any(x => !orderLines.ContainsKey(x.OrderLineNumber)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İrsaliye satırı sipariş satırlarıyla eşleşmiyor."] });
            foreach (var line in request.Lines)
            {
                var unit = string.IsNullOrWhiteSpace(line.UnitCode) ? orderLines[line.OrderLineNumber].UnitCode : line.UnitCode.Trim().ToUpperInvariant();
                if (!string.Equals(unit, orderLines[line.OrderLineNumber].UnitCode, StringComparison.OrdinalIgnoreCase))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{line.OrderLineNumber}].unitCode"] = ["İrsaliye miktarı sipariş satırının temel biriminde girilmelidir."] });
            }
            if (await db.PurchaseDeliveryNotes.AnyAsync(x => x.TenantId == tenantId && x.PurchaseOrderId == orderId
                && x.DocumentNumber == request.DocumentNumber.Trim(), ct))
                return Results.Conflict(new { error = "Bu sipariş için aynı tedarikçi irsaliye numarası zaten kayıtlı." });
            var notedQuantities = await db.PurchaseDeliveryNoteLines.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.PurchaseOrderId == orderId)
                .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) })
                .ToDictionaryAsync(x => x.LineNumber, x => x.Quantity, ct);
            foreach (var input in request.Lines)
            {
                var remaining = orderLines[input.OrderLineNumber].Quantity - notedQuantities.GetValueOrDefault(input.OrderLineNumber);
                if (input.Quantity > remaining)
                    return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} için irsaliye miktarı kalan {remaining} miktarını aşıyor.", orderLineNumber = input.OrderLineNumber, remainingQuantity = remaining });
            }

            var note = new PurchaseDeliveryNote { TenantId = tenantId, PurchaseOrderId = orderId,
                DocumentNumber = request.DocumentNumber.Trim(), DocumentDate = request.DocumentDate };
            foreach (var input in request.Lines)
                note.Lines.Add(new PurchaseDeliveryNoteLine { TenantId = tenantId, PurchaseOrderId = orderId,
                    OrderLineNumber = input.OrderLineNumber, Quantity = input.Quantity, UnitCode = orderLines[input.OrderLineNumber].UnitCode });
            db.PurchaseDeliveryNotes.Add(note);
            if (request.PurchaseReceiptId.HasValue)
            {
                var match = await CheckReceiptMatchAsync(db, tenantId, orderId, request.PurchaseReceiptId.Value,
                    note.Lines.Select(x => (x.OrderLineNumber, x.Quantity)).ToArray(), ct);
                if (match is not null) return Results.Conflict(new { error = match });
                note.PurchaseReceiptId = request.PurchaseReceiptId;
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId,
                UserId = Guid.TryParse(user.FindFirstValue("sub"), out var actor) ? actor : null,
                Action = "purchase-delivery-note.recorded", Resource = note.DocumentNumber });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Bu irsaliye numarası veya mal kabul bağlantısı başka bir işlemde kullanıldı." }); }
            await transaction.CommitAsync(ct);
            return Results.Created($"/api/purchasing/delivery-notes/{note.Id}", new PurchaseDeliveryNoteView(note.Id,
                note.DocumentNumber, note.DocumentDate, order.Id, order.Code, order.Supplier.Name, note.PurchaseReceiptId,
                request.PurchaseReceiptId.HasValue ? await db.PurchaseReceipts.Where(x => x.TenantId == tenantId && x.Id == request.PurchaseReceiptId).Select(x => x.Code).SingleAsync(ct) : null,
                note.Lines.Count, note.CreatedAt, note.Lines.Select(x => new PurchaseDeliveryNoteLineView(x.OrderLineNumber, x.UnitCode, x.Quantity)).ToList()));
        });

        group.MapPost("/{id:guid}/link-receipt", async (Guid id, PurchaseDeliveryNoteLinkReceiptRequest request,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            if (request.PurchaseReceiptId == Guid.Empty) return Results.BadRequest(new { error = "Mal kabul seçilmelidir." });
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var note = await db.PurchaseDeliveryNotes.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseDeliveryNotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
                .SingleOrDefaultAsync(ct);
            if (note is null) return Results.NotFound();
            var accessibleOrders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            if (!await accessibleOrders.AnyAsync(x => x.Id == note.PurchaseOrderId, ct)) return Results.NotFound();
            if (note.PurchaseReceiptId.HasValue) return Results.Conflict(new { error = "İrsaliye başka bir mal kabule bağlanmış; bağlantı değiştirilemez." });
            var lines = await db.PurchaseDeliveryNoteLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.DeliveryNoteId == id)
                .Select(x => new { x.OrderLineNumber, x.Quantity }).ToListAsync(ct);
            var error = await CheckReceiptMatchAsync(db, tenantId, note.PurchaseOrderId, request.PurchaseReceiptId,
                lines.Select(x => (x.OrderLineNumber, x.Quantity)).ToArray(), ct);
            if (error is not null) return Results.Conflict(new { error });
            note.PurchaseReceiptId = request.PurchaseReceiptId;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId,
                UserId = Guid.TryParse(user.FindFirstValue("sub"), out var actor) ? actor : null,
                Action = "purchase-delivery-note.receipt-linked", Resource = note.DocumentNumber });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Mal kabul başka bir irsaliyeye bağlanmış." }); }
            await transaction.CommitAsync(ct);
            return Results.NoContent();
        });

        group.MapPost("/{id:guid}/unlink-receipt", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var note = await db.PurchaseDeliveryNotes.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseDeliveryNotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
                .SingleOrDefaultAsync(ct);
            if (note is null) return Results.NotFound();
            var accessibleOrders = await AccessibleOrdersAsync(user, tenantId, db, platformDb, ct);
            if (!await accessibleOrders.AnyAsync(x => x.Id == note.PurchaseOrderId, ct)) return Results.NotFound();
            if (!note.PurchaseReceiptId.HasValue) return Results.NoContent();
            var priorReceiptId = note.PurchaseReceiptId.Value;
            note.PurchaseReceiptId = null;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId,
                UserId = Guid.TryParse(user.FindFirstValue("sub"), out var actor) ? actor : null,
                Action = "purchase-delivery-note.receipt-unlinked", Resource = $"{note.DocumentNumber} · {priorReceiptId:D}" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.NoContent();
        });
    }

    private static async Task<string?> CheckReceiptMatchAsync(TenantDbContext db, Guid tenantId, Guid orderId,
        Guid receiptId, IReadOnlyCollection<(int OrderLineNumber, decimal Quantity)> noteLines, CancellationToken ct)
    {
        var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {receiptId}")
            .AsNoTracking().Select(x => new { x.PurchaseOrderId, x.Status }).SingleOrDefaultAsync(ct);
        if (receipt is null) return "Mal kabul bu firmada bulunamadı.";
        if (receipt.PurchaseOrderId != orderId) return "Mal kabul ve irsaliye aynı satın alma siparişine bağlı olmalıdır.";
        if (receipt.Status != PurchaseReceiptStatus.Posted) return "Yalnızca işlenmiş mal kabule bağlantı kurulabilir.";
        if (await db.PurchaseDeliveryNotes.AnyAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == receiptId, ct))
            return "Mal kabul başka bir tedarikçi irsaliyesine bağlanmış.";
        var receiptLines = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.ReceiptId == receiptId)
            .Select(x => new { x.OrderLineNumber, x.Quantity }).ToListAsync(ct);
        if (!PurchaseDeliveryNoteReconciliation.IsExactMatch(noteLines,
            receiptLines.Select(x => (x.OrderLineNumber, x.Quantity)).ToArray()))
            return "Mutabakat için irsaliye ve mal kabul satırları aynı sipariş satırlarında ve aynı temel birim miktarlarında olmalıdır.";
        return null;
    }

    private static bool TryTenant(ClaimsPrincipal user, out Guid tenantId) =>
        Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId)
        && Guid.TryParse(user.FindFirstValue("sub"), out _)
        && !string.IsNullOrWhiteSpace(user.FindFirstValue("role"));

    private static async Task<IQueryable<PurchaseOrder>> AccessibleOrdersAsync(ClaimsPrincipal user, Guid tenantId,
        TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        var query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
        if (!Guid.TryParse(user.FindFirstValue("sub"), out var userId)) return query.Where(_ => false);
        return await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.purchase-orders.read", "erp.purchase-orders", query, x => x.Status, null, x => x.SupplierId,
            cancellationToken: ct) ?? query;
    }
}

public sealed record PurchaseDeliveryNotePage(IReadOnlyList<PurchaseDeliveryNoteView> Items, int Page, int PageSize, int TotalCount);
public sealed record PurchaseDeliveryNoteView(Guid Id, string DocumentNumber, DateOnly DocumentDate, Guid PurchaseOrderId,
    string PurchaseOrderCode, string SupplierName, Guid? PurchaseReceiptId, string? PurchaseReceiptCode,
    int LineCount, DateTimeOffset CreatedAt, IReadOnlyList<PurchaseDeliveryNoteLineView>? Lines = null);
public sealed record PurchaseDeliveryNoteLineView(int OrderLineNumber, string UnitCode, decimal Quantity);
public sealed record PurchaseDeliveryNoteWriteLine(int OrderLineNumber, decimal Quantity, string? UnitCode);
public sealed record PurchaseDeliveryNoteWriteRequest(string DocumentNumber, DateOnly DocumentDate,
    List<PurchaseDeliveryNoteWriteLine> Lines, Guid? PurchaseReceiptId = null);
public sealed record PurchaseDeliveryNoteLinkReceiptRequest(Guid PurchaseReceiptId);

public static class PurchaseDeliveryNoteReconciliation
{
    public static bool IsExactMatch(IReadOnlyCollection<(int OrderLineNumber, decimal Quantity)> noteLines,
        IReadOnlyCollection<(int OrderLineNumber, decimal Quantity)> receiptLines) =>
        noteLines.Count > 0 && noteLines.Count == receiptLines.Count
        && noteLines.Select(x => x.OrderLineNumber).Distinct().Count() == noteLines.Count
        && receiptLines.Select(x => x.OrderLineNumber).Distinct().Count() == receiptLines.Count
        && noteLines.All(noteLine => receiptLines.Any(receiptLine =>
            receiptLine.OrderLineNumber == noteLine.OrderLineNumber && receiptLine.Quantity == noteLine.Quantity));
}
