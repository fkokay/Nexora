using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Talepten hazırlanan tekliflerin hangi talep satırlarını kapsadığı. Teklif satırı, karşılık geldiği talep satırını
/// <see cref="SalesQuoteLine.SourceSalesRequestLineNumber"/> ile taşır. Talebin durumu bu bağlantılardan türetilir:
/// hiçbir satıra teklif verilmediyse Open, bir kısmına verildiyse PartiallyQuoted, tümüne verildiyse Quoted.
/// Teklifin durumu (revizyon, red, süresi dolmuş) fark etmez; her teklif satırı kapsar.
/// </summary>
public static class SalesRequestQuoteCoverage
{
    /// <summary>Teklif satırlarının talep bağlantılarını doğrular; hata yoksa null döner.</summary>
    public static async Task<Dictionary<string, string[]>?> ValidateAsync(TenantDbContext db, Guid tenantId, Guid? salesRequestId,
        IReadOnlyList<SalesQuoteLineWriteRequest> lines, CancellationToken ct = default)
    {
        if (!lines.Any(x => x.SalesRequestLineNumber is not null)) return null;
        if (salesRequestId is null)
            return new() { ["lines"] = ["Talep satırı bağlantısı yalnızca satış talebinden hazırlanan tekliflerde kullanılabilir."] };
        var requestLines = await db.SalesRequestLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SalesRequestId == salesRequestId.Value)
            .ToDictionaryAsync(x => x.LineNumber, x => x.StockItemId, ct);
        var seen = new HashSet<int>();
        for (var i = 0; i < lines.Count; i++)
        {
            if (lines[i].SalesRequestLineNumber is not { } lineNumber) continue;
            if (!requestLines.TryGetValue(lineNumber, out var stockItemId))
                return new() { [$"lines[{i}].salesRequestLineNumber"] = ["Talep satırı bulunamadı."] };
            if (stockItemId != lines[i].StockItemId)
                return new() { [$"lines[{i}].salesRequestLineNumber"] = ["Teklif satırının stok kartı, bağlı talep satırının stok kartıyla aynı olmalıdır."] };
            if (!seen.Add(lineNumber))
                return new() { [$"lines[{i}].salesRequestLineNumber"] = ["Bir talep satırı teklifte yalnızca bir kez yer alabilir."] };
        }
        return null;
    }

    /// <summary>
    /// Talebin durumunu teklif satırlarının kapsamından yeniden hesaplar. Kayıtlı teklif satırlarını okuduğu için
    /// teklif değişiklikleri kaydedildikten sonra, aynı işlem içinde çağrılır. İptal edilmiş talebe dokunmaz.
    /// </summary>
    public static async Task RefreshStatusAsync(TenantDbContext db, Guid tenantId, Guid salesRequestId, CancellationToken ct = default)
    {
        var request = await db.SalesRequests.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == salesRequestId, ct);
        if (request is null || request.Status == SalesRequestStatus.Cancelled) return;
        var lineNumbers = await db.SalesRequestLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SalesRequestId == salesRequestId).Select(x => x.LineNumber).ToListAsync(ct);
        var covered = await db.SalesQuoteLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.Quote!.SourceSalesRequestId == salesRequestId && x.SourceSalesRequestLineNumber != null)
            .Select(x => x.SourceSalesRequestLineNumber!.Value).Distinct().ToListAsync(ct);
        var status = covered.Count == 0 ? SalesRequestStatus.Open
            : lineNumbers.All(covered.Contains) ? SalesRequestStatus.Quoted
            : SalesRequestStatus.PartiallyQuoted;
        if (request.Status == status) return;
        request.Status = status;
        await db.SaveChangesAsync(ct);
    }
}
