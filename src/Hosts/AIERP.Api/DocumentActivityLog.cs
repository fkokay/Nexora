using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>
/// The append-only işlem günlüğü of documents (belge kuralları): every transition writes what its core checks, rules and
/// tasks did. Rows are only added; the caller saves them with its own write so a failed transition leaves no row.
/// </summary>
internal static class DocumentActivityLog
{
    internal const string SalesOrder = "satis.siparis";
    internal const string SalesQuote = "satis.teklif";
    internal const string InventoryTransfer = "stok.transfer";

    internal static void Add(TenantDbContext db, Guid tenantId, string documentType, Guid documentId, string transition, string step,
        string source, string outcome, string? message, Guid? actorUserId, Guid? requestId = null) =>
        db.TenantDocumentActivities.Add(new TenantDocumentActivity
        {
            TenantId = tenantId, DocumentType = documentType, DocumentId = documentId, Transition = transition,
            Step = AuditResourceSanitizer.Sanitize(step, 200), Source = source, Outcome = outcome,
            Message = string.IsNullOrWhiteSpace(message) ? null : AuditResourceSanitizer.Sanitize(message, 500),
            ActorUserId = actorUserId, RequestId = requestId
        });

    internal static async Task<IReadOnlyList<DocumentActivityView>> ReadAsync(TenantDbContext db, Guid tenantId, string documentType,
        Guid documentId, CancellationToken ct) =>
        await db.TenantDocumentActivities.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.DocumentType == documentType && x.DocumentId == documentId)
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Select(x => new DocumentActivityView(x.Transition, x.Step, x.Source, x.Outcome, x.Message, x.ActorUserId, x.CreatedAt))
            .ToListAsync(ct);
}
