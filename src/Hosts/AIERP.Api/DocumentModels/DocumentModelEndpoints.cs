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
        app.MapJournalVoucherDocumentEndpoints();
        var models = app.MapGroup("/api/document-models").WithTags("Belge modelleri").RequireAuthorization();
        models.MapGet("/{code}", (string code) =>
            DocumentModelRegistry.Find(code) is { } model ? Results.Ok(model) : Results.NotFound());
        // One literal route per model (the ERP operation catalog matches routes literally).
        models.MapGet("/" + SalesOrderDocumentModel.Code + "/sample", (string? state) => Sample(state, SalesOrderStatus.Draft, SalesOrderDocumentModel.Sample));
        models.MapGet("/" + SalesQuoteDocumentModel.Code + "/sample", (string? state) => Sample(state, SalesQuoteStatus.Draft, SalesQuoteDocumentModel.Sample));
        models.MapGet("/" + SalesInvoiceDocumentModel.Code + "/sample", (string? state) => Sample(state, SalesInvoiceDocumentState.Draft, SalesInvoiceDocumentModel.Sample));
        models.MapPost("/" + SalesInvoiceDocumentModel.Code + "/fill", SalesDocumentModelParts.FillAsync);
        models.MapGet("/" + SalesDeliveryDocumentModel.Code + "/sample", (string? state) => Sample(state, SalesDeliveryDocumentState.Draft, SalesDeliveryDocumentModel.Sample));
        models.MapPost("/" + SalesDeliveryDocumentModel.Code + "/fill", SalesDocumentModelParts.FillAsync);
        models.MapPost("/" + SalesOrderDocumentModel.Code + "/fill", SalesDocumentModelParts.FillAsync);
        models.MapPost("/" + SalesQuoteDocumentModel.Code + "/fill", SalesDocumentModelParts.FillAsync);

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
                var creations = await SalesDocumentModelParts.ExecutableAsync(authorizer, principal, tenantId, "erp.sales-quotes", id, quote.Status.ToString(),
                    quote.CustomerId, SalesQuoteDocumentModel.CreationCandidates(quote.Status, quote.HasSalesOrder), ct);
                return Results.Ok(new SalesQuoteDocumentView(quote,
                    new DocumentAmounts(quote.CurrencyCode, quote.Subtotal, quote.DiscountTotal, quote.TaxTotal, quote.GrandTotal, vat.OrderBy(x => x.Rate).ToList()),
                    allowed, activity, activity.Count == 0 && quote.Status != SalesQuoteStatus.Draft, creations));
            });

        app.MapGroup("/api/sales/invoices").WithTags("Satış Faturaları").RequireAuthorization()
            .MapGet("/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, IPlatformPermissionAuthorizer authorizer,
                CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                if (await SalesInvoiceReads.DocumentAsync(db, tenantId, id, ct) is not { } invoice) return Results.NotFound();
                var totals = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
                    .Select(x => new { x.Subtotal, x.DiscountTotal, x.TaxTotal, x.GrandTotal }).SingleAsync(ct);
                var vat = invoice.Lines.GroupBy(x => x.VatPercent)
                    .Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount))).OrderBy(x => x.Rate).ToList();
                var activity = await DocumentActivityLog.ReadAsync(db, tenantId, SalesInvoiceDocumentModel.Code, id, ct);
                var status = invoice.Status == SalesInvoiceDocumentState.Voided ? SalesInvoiceStatus.Voided : SalesInvoiceStatus.Posted;
                var allowed = await SalesDocumentModelParts.ExecutableAsync(authorizer, principal, tenantId, "erp.sales-invoices", id, status.ToString(),
                    invoice.CustomerId, SalesInvoiceDocumentModel.Candidates(status), ct);
                return Results.Ok(new SalesInvoiceDocumentView(invoice,
                    new DocumentAmounts(invoice.CurrencyCode, totals.Subtotal, totals.DiscountTotal, totals.TaxTotal, totals.GrandTotal, vat),
                    allowed, activity, activity.Count == 0));
            });

        app.MapGroup("/api/sales/deliveries").WithTags("Satış İrsaliyeleri").RequireAuthorization()
            .MapGet("/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, IPlatformPermissionAuthorizer authorizer,
                CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                if (await SalesDeliveryReads.DocumentAsync(db, tenantId, id, ct) is not { } read) return Results.NotFound();
                var delivery = read.Record;
                var vat = delivery.Lines.Where(x => x.UnitPrice is not null).GroupBy(x => x.VatPercent ?? 0m)
                    .Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount))).OrderBy(x => x.Rate).ToList();
                var subtotal = delivery.Lines.Sum(x => x.LineSubtotal);
                var discount = delivery.Lines.Sum(x => x.DiscountAmount);
                var tax = delivery.Lines.Sum(x => x.TaxAmount);
                var activity = await DocumentActivityLog.ReadAsync(db, tenantId, SalesDeliveryDocumentModel.Code, id, ct);
                var allowed = await SalesDocumentModelParts.ExecutableAsync(authorizer, principal, tenantId, "erp.sales-deliveries", id, read.StatusName,
                    delivery.CustomerId, SalesDeliveryDocumentModel.Candidates(delivery.Status, delivery.IsStandalone, read.HasInvoice), ct);
                return Results.Ok(new SalesDeliveryDocumentView(delivery,
                    new DocumentAmounts(delivery.CurrencyCode, subtotal, discount, tax, subtotal - discount + tax, vat), allowed, activity,
                    activity.Count == 0 && delivery.Status != SalesDeliveryDocumentState.Draft));
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
    }

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
