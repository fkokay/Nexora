using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// Read-only document model routes (belge kuralları): the model, a sales order or quote as a document, and "alan değişince" fills.
/// The model routes resolve as the model's own document permission (<c>erp.sales-orders.read</c> / <c>erp.sales-quotes.read</c>); nothing is written.
/// </summary>
internal static class DocumentModelEndpoints
{
    internal static void MapDocumentModelEndpoints(this WebApplication app)
    {
        var models = app.MapGroup("/api/document-models").WithTags("Belge modelleri").RequireAuthorization();
        models.MapGet("/{code}", (string code) =>
            DocumentModelRegistry.Find(code) is { } model ? Results.Ok(model) : Results.NotFound());
        // One literal route per model (the ERP operation catalog matches routes literally).
        models.MapGet("/" + SalesOrderDocumentModel.Code + "/sample", (string? state) => Sample(state, SalesOrderStatus.Draft, SalesOrderDocumentModel.Sample));
        models.MapGet("/" + SalesQuoteDocumentModel.Code + "/sample", (string? state) => Sample(state, SalesQuoteStatus.Draft, SalesQuoteDocumentModel.Sample));
        models.MapPost("/" + SalesOrderDocumentModel.Code + "/fill", SalesDocumentModelParts.FillAsync);
        models.MapPost("/" + SalesQuoteDocumentModel.Code + "/fill", SalesDocumentModelParts.FillAsync);
        models.MapGet("/" + PurchaseOrderDocumentModel.Code + "/sample", () => Results.Ok(new { order = new { code = "", supplierName = "Örnek Tedarikçi", targetWarehouseId = (Guid?)null, currencyCode = "TRY", status = "Draft", lines = Array.Empty<object>() }, amounts = new DocumentAmounts("TRY", 0, 0, 0, 0, []) }));
        models.MapGet("/" + PurchaseInvoiceDocumentModel.Code + "/sample", () => Results.Ok(new { invoice = new { invoiceNumber = "", supplierName = "Örnek Tedarikçi", receiptCode = "", currencyCode = "TRY", status = "Draft", lines = Array.Empty<object>() }, amounts = new DocumentAmounts("TRY", 0, 0, 0, 0, []) }));
        models.MapPost("/" + PurchaseOrderDocumentModel.Code + "/fill", () => Results.Ok(new DocumentFillResult(new Dictionary<string, object?>())));
        models.MapPost("/" + PurchaseInvoiceDocumentModel.Code + "/fill", () => Results.Ok(new DocumentFillResult(new Dictionary<string, object?>())));
        models.MapPost("/" + PurchaseOrderDocumentModel.Code + "/calculate", (PurchaseDocumentCalculationRequest request) => Results.Ok(Calculate(request)));
        models.MapPost("/" + PurchaseInvoiceDocumentModel.Code + "/calculate", (PurchaseDocumentCalculationRequest request) => Results.Ok(Calculate(request)));

        app.MapGroup("/api/sales/quotes").WithTags("Satış Teklifleri").RequireAuthorization()
            .MapGet("/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, IPlatformPermissionAuthorizer authorizer,
                CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                if (await SalesQuoteReads.ViewAsync(db, tenantId, id, ct) is not { } quote) return Results.NotFound();
                var vat = await db.SalesQuoteLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id)
                    .GroupBy(x => x.VatPercent)
                    .Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount)))
                    .ToListAsync(ct);
                var activity = await DocumentActivityLog.ReadAsync(db, tenantId, SalesQuoteDocumentModel.Code, id, ct);
                var allowed = await SalesDocumentModelParts.ExecutableAsync(authorizer, principal, tenantId, "erp.sales-quotes", id, quote.Status.ToString(),
                    quote.CustomerId, SalesQuoteDocumentModel.Candidates(quote.Status, quote.HasSalesOrder), ct);
                return Results.Ok(new SalesQuoteDocumentView(quote,
                    new DocumentAmounts(quote.CurrencyCode, quote.Subtotal, quote.DiscountTotal, quote.TaxTotal, quote.GrandTotal, vat.OrderBy(x => x.Rate).ToList()),
                    allowed, activity, activity.Count == 0 && quote.Status != SalesQuoteStatus.Draft));
            });

        app.MapGroup("/api/sales/orders").WithTags("Satış Siparişleri").RequireAuthorization()
            .MapGet("/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platform,
                IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                if (await SalesOrderReads.ViewAsync(db, tenantId, id, ct) is not { } order) return Results.NotFound();
                var vat = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id)
                    .GroupBy(x => x.VatPercent)
                    .Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount)))
                    .ToListAsync(ct);
                var activity = await DocumentActivityLog.ReadAsync(db, tenantId, SalesOrderDocumentModel.Code, id, ct);
                return Results.Ok(new SalesOrderDocumentView(order,
                    new DocumentAmounts(order.CurrencyCode, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, vat.OrderBy(x => x.Rate).ToList()),
                    await AllowedTransitionsAsync(db, authorizer, principal, tenantId, order, ct), activity,
                    activity.Count == 0 && order.Status != SalesOrderStatus.Draft,
                    order.Status == SalesOrderStatus.PendingApproval ? await ApprovalAsync(db, platform, principal, tenantId, id, ct) : null));
            });

        var purchaseOrders = app.MapGroup("/api/purchasing/orders").RequireAuthorization();
        purchaseOrders.MapGet("/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var order = await db.PurchaseOrders.AsNoTracking().Include(x => x.Supplier).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (order is null) return Results.NotFound();
            var vat = order.Lines.GroupBy(x => x.VatPercent).Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount))).ToArray();
            var view = new { id = order.Id, code = order.Code, supplierId = order.SupplierId, supplierName = order.Supplier.Name,
                currencyCode = order.CurrencyCode, status = order.Status.ToString(), orderDate = order.OrderDate, expectedReceiptDate = order.ExpectedReceiptDate,
                targetWarehouseId = order.TargetWarehouseId,
                notes = order.Notes, lines = order.Lines.OrderBy(x => x.LineNumber).Select(x => new { x.LineNumber, x.StockItemId, x.StockCode, x.StockName,
                    x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal }).ToArray() };
            var amounts = new DocumentAmounts(order.CurrencyCode, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, vat);
            return Results.Ok(new { order = view, amounts, allowedTransitions = Array.Empty<string>(), activity = Array.Empty<object>(), activityStartedLate = false });
        });

        var purchaseInvoices = app.MapGroup("/api/purchasing").RequireAuthorization();
        purchaseInvoices.MapGet("/standalone-invoices/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var draft = await db.PurchaseInvoiceDrafts.AsNoTracking().Include(x => x.Supplier).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (draft is null) return Results.NotFound();
            var invoice = new { id = draft.Id, code = draft.InvoiceNumber, invoiceNumber = draft.InvoiceNumber, supplierId = draft.SupplierId,
                supplierName = draft.Supplier.Name, currencyCode = draft.CurrencyCode, status = draft.Status.ToString(), invoiceDate = draft.InvoiceDate,
                dueDate = draft.DueDate, notes = draft.Notes, rowVersion = Convert.ToBase64String(draft.RowVersion),
                lines = draft.Lines.OrderBy(x => x.LineNumber).Select(x => new { x.LineNumber,
                    x.Description, x.Quantity, x.UnitCode, x.UnitPrice, x.Subtotal, DiscountAmount = x.DiscountAmount, TaxAmount = x.TaxAmount,
                    Total = x.Total, x.ExpenseAccountId, x.VatRate, x.StandalonePurchaseReceiptLineId }).ToArray() };
            var vat = draft.Lines.GroupBy(x => x.VatRate ?? 0m).Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.Subtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount))).ToArray();
            var activity = await DocumentActivityLog.ReadAsync(db, tenantId, PurchaseInvoiceDocumentModel.Code, draft.Id, ct);
            return Results.Ok(new { invoice, amounts = new DocumentAmounts(draft.CurrencyCode, draft.Subtotal, draft.DiscountTotal, draft.TaxTotal, draft.GrandTotal, vat),
                allowedTransitions = draft.Status == PurchaseInvoiceDraftStatus.Draft ? new[] { "muhasebelestir" } : Array.Empty<string>(),
                activity, activityStartedLate = activity.Count == 0 && draft.Status == PurchaseInvoiceDraftStatus.Posted });
        });
        purchaseInvoices.MapGet("/invoices/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var invoice = await db.PurchaseInvoices.AsNoTracking().Include(x => x.Supplier).Include(x => x.PurchaseReceipt).Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (invoice is null) return Results.NotFound();
            var value = new { id = invoice.Id, code = invoice.Code, invoiceNumber = invoice.Code, supplierId = invoice.SupplierId, supplierName = invoice.Supplier.Name,
                currencyCode = invoice.CurrencyCode, status = invoice.Status.ToString(), invoiceDate = invoice.InvoiceDate, dueDate = invoice.DueDate,
                receiptCode = invoice.PurchaseReceipt.Code,
                lines = invoice.Lines.OrderBy(x => x.LineNumber).Select(x => new { x.LineNumber, Description = x.StockName, x.Quantity, x.UnitCode, x.UnitPrice,
                    Subtotal = x.LineSubtotal, x.DiscountAmount, x.TaxAmount, Total = x.LineTotal, ExpenseAccountId = (Guid?)null, VatRate = (decimal?)x.VatPercent }).ToArray() };
            var vat = invoice.Lines.GroupBy(x => x.VatPercent).Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount))).ToArray();
            return Results.Ok(new { invoice = value, amounts = new DocumentAmounts(invoice.CurrencyCode, invoice.Subtotal, invoice.DiscountTotal, invoice.TaxTotal, invoice.GrandTotal, vat),
                allowedTransitions = invoice.Status == PurchaseInvoiceStatus.Posted ? new[] { "iptal" } : Array.Empty<string>(),
                activity = Array.Empty<object>(), activityStartedLate = false });
        });
    }

    private static DocumentAmounts Calculate(PurchaseDocumentCalculationRequest request)
    {
        var lines = request.Lines ?? [];
        var subtotal = lines.Sum(x => x.Quantity * x.UnitPrice);
        var discount = lines.Sum(x => x.Quantity * x.UnitPrice * x.DiscountPercent / 100m);
        var tax = lines.Sum(x => (x.Quantity * x.UnitPrice - x.Quantity * x.UnitPrice * x.DiscountPercent / 100m) * x.VatPercent / 100m);
        var vat = lines.GroupBy(x => x.VatPercent).Select(g => new DocumentVatRow(g.Key,
            g.Sum(x => x.Quantity * x.UnitPrice * (1m - x.DiscountPercent / 100m)),
            g.Sum(x => x.Quantity * x.UnitPrice * (1m - x.DiscountPercent / 100m) * x.VatPercent / 100m))).ToArray();
        return new DocumentAmounts(request.CurrencyCode ?? "TRY", subtotal, discount, tax, subtotal - discount + tax, vat);
    }

    public sealed record PurchaseDocumentCalculationRequest(string? CurrencyCode, IReadOnlyList<PurchaseDocumentCalculationLine>? Lines);
    public sealed record PurchaseDocumentCalculationLine(decimal Quantity, decimal UnitPrice, decimal DiscountPercent, decimal VatPercent);

    /// <summary>The sample document of a model in <paramref name="state"/> (a status name of that model); no state means the first one.</summary>
    private static IResult Sample<TStatus>(string? state, TStatus first, Func<TStatus, object> sample) where TStatus : struct, Enum =>
        string.IsNullOrEmpty(state) ? Results.Ok(sample(first))
        : Enum.TryParse<TStatus>(state, ignoreCase: false, out var parsed) && Enum.IsDefined(parsed) && !int.TryParse(state, out _)
            ? Results.Ok(sample(parsed))
            : Results.ValidationProblem(new Dictionary<string, string[]> { ["state"] = ["Bilinmeyen belge durumu."] });

    private static async Task<DocumentApprovalView?> ApprovalAsync(TenantDbContext db, PlatformDbContext platform, ClaimsPrincipal principal,
        Guid tenantId, Guid orderId, CancellationToken ct)
    {
        var instance = await db.TenantWorkflowInstances.AsNoTracking().Where(x => x.TenantId == tenantId && x.SubjectType == AIERP.Api.DocumentRules.SalesOrderApprovalWorkflow.SubjectType
            && x.DefinitionCode == AIERP.Api.DocumentRules.SalesOrderApprovalWorkflow.DefinitionCode
            && x.SubjectId == orderId && x.Status == "Pending").OrderByDescending(x => x.StartedAt).FirstOrDefaultAsync(ct);
        if (instance is null) return null;
        var steps = System.Text.Json.JsonSerializer.Deserialize<List<TenantWorkflowStep>>(instance.StepsJsonSnapshot,
            new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)) ?? [];
        if (instance.CurrentStepIndex < 0 || instance.CurrentStepIndex >= steps.Count) return null;
        var step = steps[instance.CurrentStepIndex];
        var people = (step.ApproverUserIds ?? []).Where(x => x != instance.StartedByUserId).ToArray();
        var names = await platform.Users.AsNoTracking().Where(x => people.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);
        Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId);
        return new DocumentApprovalView(instance.Id, step.Name, people.Select(x => names.GetValueOrDefault(x) ?? x.ToString("D")).ToList(), people.Contains(userId));
    }

    private static async Task<IReadOnlyList<string>> AllowedTransitionsAsync(TenantDbContext db, IPlatformPermissionAuthorizer authorizer,
        ClaimsPrincipal principal, Guid tenantId, SalesOrderView order, CancellationToken ct)
    {
        var hasDeliveries = await db.SalesDeliveries.AnyAsync(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Status == SalesDeliveryStatus.Posted, ct);
        var hasInvoices = await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Status == SalesInvoiceStatus.Posted, ct);
        var hasReservations = await db.SalesOrderReservations.AnyAsync(x => x.TenantId == tenantId && x.OrderId == order.Id, ct);
        var candidates = new List<string>();
        if (SalesOrderLifecycle.CanApprove(order.Status)) candidates.Add(SalesOrderTransitionEndpoints.Approve);
        if (SalesOrderLifecycle.CanUnapprove(order.Status, hasDeliveries, hasInvoices, hasReservations)) candidates.Add(SalesOrderTransitionEndpoints.Unapprove);
        if (SalesOrderLifecycle.CanCancel(order.Status, hasDeliveries || hasInvoices)) candidates.Add(SalesOrderTransitionEndpoints.Cancel);
        return await SalesDocumentModelParts.ExecutableAsync(authorizer, principal, tenantId, "erp.sales-orders", order.Id, order.Status.ToString(),
            order.CustomerId, candidates, ct);
    }
}
