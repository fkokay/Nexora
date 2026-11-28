using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Infrastructure;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// A manual journal voucher as its Belge page needs it: the entry, its totals, the transitions (always none) and the işlem günlüğü.
/// <see cref="Difference"/> is debit minus credit; a posted voucher is always balanced.
/// </summary>
public sealed record JournalVoucherDocumentView(JournalEntryView Entry, decimal TotalDebit, decimal TotalCredit, decimal Difference,
    IReadOnlyList<string> AllowedTransitions, IReadOnlyList<DocumentActivityView> Activity, bool ActivityStartedLate);

/// <summary>
/// The yevmiye fişi model (<c>muhasebe.fis</c>). There is no draft: the voucher is created posted (<c>finans.fis.olustur</c>) and never
/// changes (corrections are linked reversals, which create a new voucher and stay with their own operation). So the model has one state,
/// no transitions and no update, calculation or fill operation. It shares nothing with the sales document parts: its lines are an
/// account, a description and a debit or credit amount, and the totals are plain sums.
/// </summary>
internal static class JournalVoucherDocumentModel
{
    internal const string Code = DocumentActivityLog.JournalVoucher;
    internal const string Posted = "Posted";

    internal static readonly DocumentModelView Model = new(Code, "Yevmiye fişi",
        [
            new("code", "Fiş no", "text", false, null, ReadOnly: true),
            new("entryDate", "Fiş tarihi", "date", true, null),
            new("accountingBasis", "Muhasebe standardı", "select", true, null),
            new("description", "Açıklama", "text", true, null)
        ],
        [
            new("accountId", "Hesap", "lookup", true, false, "finans.muhasebe.hesap.listele"),
            new("description", "Satır açıklaması", "text", false, false, null),
            new("debit", "Borç", "money", false, false, null),
            new("credit", "Alacak", "money", false, false, null)
        ],
        [new DocumentStateView(Posted, "Kaydedildi", false)],
        [],
        "finans.fis.belge", null, null, new Dictionary<string, IReadOnlyList<string>>(), "finans.fis.olustur", null);

    /// <summary>The Studio canvas' sample voucher: fixed values, nothing read or written.</summary>
    internal static JournalVoucherDocumentView Sample()
    {
        var at = new DateTimeOffset(2026, 11, 26, 9, 0, 0, TimeSpan.Zero);
        IReadOnlyList<JournalEntryLineView> lines =
        [
            new(1, Guid.Empty, "100", "Kasa", "Nakit tahsilat", 1500m, 0m),
            new(2, Guid.Empty, "600", "Yurt içi satışlar", "Nakit tahsilat", 0m, 1500m)
        ];
        var entry = new JournalEntryView(Guid.Empty, "YEV-ORNEK-0001", new DateOnly(2026, 11, 26), "Örnek nakit tahsilat", "Manual", Guid.Empty, at,
            1500m, 1500m, lines);
        return new JournalVoucherDocumentView(entry, 1500m, 1500m, 0m, [],
            [new("kaydet", "Fiş kaydedildi", "core", "done", null, null, at)], false);
    }

    internal static void MapJournalVoucherDocumentEndpoints(this WebApplication app)
    {
        // Literal route (the ERP operation catalog matches routes literally). The only state is Posted; "Draft" is the Studio canvas' default.
        app.MapGroup("/api/document-models").WithTags("Belge modelleri").RequireAuthorization()
            .MapGet("/" + Code + "/sample", (string? state) => (IResult)(
                string.IsNullOrEmpty(state) || state is Posted or "Draft" ? Results.Ok(Sample())
                : Results.ValidationProblem(new Dictionary<string, string[]> { ["state"] = ["Bilinmeyen belge durumu."] })));

        app.MapGroup("/api/finance/general-ledger").WithTags("Genel Muhasebe").RequireAuthorization()
            .MapGet("/entries/{id:guid}/document", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
            {
                if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
                if (await JournalEntryReads.ViewAsync(db, tenantId, id, ct) is not { } entry) return Results.NotFound();
                var activity = await DocumentActivityLog.ReadAsync(db, tenantId, Code, id, ct);
                return Results.Ok(new JournalVoucherDocumentView(entry, entry.TotalDebit, entry.TotalCredit, entry.TotalDebit - entry.TotalCredit, [], activity,
                    activity.Count == 0 && entry.SourceType == "Manual"));
            });
    }
}
