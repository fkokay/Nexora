using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class StandardMenuEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly StandardMenuDefinition[] Catalog =
    [
        new("dashboard", "Genel Bakış", "Platform"),
        new("customers", "Cari Yönetimi", "Satış & cari"), new("customer-create", "Yeni Cari Kart", "Satış & cari"),
        new("sales-invoice-create", "İrsaliyesiz satış faturası girişi", "Satış & cari"), new("finance-account-create", "Yeni Kasa Tanımla", "Satış & cari"),
        new("crm-opportunities", "CRM Fırsatları", "Satış & cari"), new("crm-opportunity-create", "Yeni fırsat", "Satış & cari"),
        new("inventory-stock", "Stok Kartları", "Stok & Depo"), new("inventory-stock-create", "Yeni stok kartı", "Stok & Depo"), new("inventory-cost", "Stok Değerleme", "Stok & Depo"), new("inventory-warehouses", "Depo Yönetimi", "Stok & Depo"), new("inventory-transfers", "Depolar arası transferler", "Stok & Depo"), new("inventory-locations", "Raf ve Konumlar", "Stok & Depo"), new("inventory-tracking", "Lot / Seri İzleme", "Stok & Depo"),
        new("sales-quotes", "Teklifler", "Satış"), new("sales-orders", "Satış Siparişleri", "Satış"), new("sales-deliveries", "İrsaliyeler", "Satış"), new("sales-invoices", "Satış Faturaları", "Satış"), new("sales-distribution", "Dağıtım planı", "Satış"), new("sales-promotions", "Kampanyalar", "Satış"),
        new("sales-requests", "Satınalma Talepleri", "Satın Alma"), new("sales-purchase-quotes", "Satınalma Teklifleri", "Satın Alma"), new("sales-purchasing", "Tedarikçi Siparişleri", "Satın Alma"), new("sales-purchase-delivery-notes", "İrsaliyeler", "Satın Alma"), new("sales-purchase-receipts", "Mal kabulleri", "Satın Alma"), new("sales-purchase-invoices", "Satın Alma Faturaları", "Satın Alma"), new("sales-purchase-invoice-entry", "Mal kabul faturası girişi", "Satın Alma"), new("sales-purchase-invoice-drafts", "Bağımsız fatura taslakları", "Satın Alma"), new("commercial-contracts", "Ticari sözleşmeler", "Satın Alma"),
        new("finance-accounts", "Kasalar", "Finans"), new("finance-banks", "Bankalar", "Finans"), new("finance-statements", "Banka Ekstreleri", "Finans"), new("finance-cash-flow", "Nakit Akışı", "Finans"), new("finance-fx", "Kur & Değerleme", "Finans"), new("finance-ledger", "Genel Muhasebe", "Genel Muhasebe"), new("finance-ledger-chart", "Hesap Planı", "Genel Muhasebe"), new("finance-ledger-mappings", "Hesap Eşleştirmeleri", "Genel Muhasebe"), new("finance-journal-vouchers", "Yevmiye Fişi", "Genel Muhasebe"), new("finance-trial-balance", "Mizan", "Finans"), new("finance-balance-sheet", "Bilanço", "Genel Muhasebe"), new("finance-journal-ledger", "Yevmiye Defterleri", "Genel Muhasebe"), new("finance-budget", "Bütçe Planlama", "Finans"), new("finance-cash-budget", "Doğrudan nakit bütçesi", "Finans"), new("finance-exposure", "Döviz Pozisyonu", "Finans"), new("finance-maturities", "Vade Takibi", "Finans"), new("finance-instruments", "Çek ve Senet", "Finans"), new("finance-credit-facilities", "Krediler & Finansman", "Finans"), new("finance-credit-facility-create", "Yeni kredi / limit", "Finans"), new("finance-credit-schedule-create", "Taksit planla", "Finans"), new("finance-credit-movement-create", "Kredi kullandırımı", "Finans"), new("finance-credit-repayment-create", "Kredi geri ödemesi", "Finans"), new("finance-credit-security-create", "Teminat kaydı", "Finans"),
        new("manufacturing-recipes", "Tanımlı reçeteler", "Üretim"), new("manufacturing-recipe-create", "Reçete oluştur", "Üretim"), new("manufacturing-work-centers", "İş merkezleri", "Üretim"), new("manufacturing-work-center-create", "İş merkezi tanımla", "Üretim"), new("manufacturing-orders", "Üretim emirleri", "Üretim"), new("manufacturing-mrp", "Malzeme planlama", "Üretim"), new("manufacturing-cost-variance", "Maliyet analizi", "Üretim"),
        new("reports", "Rapor oluşturucu", "Platform Uyarlama"), new("ai-settings", "AI sağlayıcı ayarları", "Platform Uyarlama"), new("audit", "İşlem kayıtları", "Yönetim"), new("access", "İzin politikaları", "Yönetim"), new("settings", "Ayarlar", "Yönetim")
    ];
    public static void MapStandardMenuEndpoints(this WebApplication app)
    {
        var menus = app.MapGroup("/api/custom-menus/standard").RequireAuthorization();
        menus.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenant, out _, out _)) return Results.Forbid();
            var saved = await db.TenantStandardMenuLayouts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant, ct);
            var stored = saved is null ? [] : JsonSerializer.Deserialize<StandardMenuItem[]>(saved.LayoutJson, JsonOptions) ?? [];
            var byPage = stored.ToDictionary(x => x.Page, StringComparer.Ordinal);
            var groups = Catalog.Select(x => x.Group).Distinct(StringComparer.Ordinal).ToArray();
            var ordered = Catalog.Select((item, index) => new { item, index })
                .OrderBy(x => Array.IndexOf(groups, x.item.Group))
                .ThenBy(x => Array.FindIndex(stored, y => y.Page == x.item.Page) is var rank && rank >= 0 ? rank : stored.Length + x.index)
                .Select(x => new StandardMenuView(x.item.Page, x.item.Label, x.item.Group, byPage.GetValueOrDefault(x.item.Page)?.Label)).ToArray();
            return Results.Ok(new StandardMenuLayoutView(saved?.Revision ?? 0, ordered));
        });
        menus.MapPut("/", async (StandardMenuUpdate request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenant, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var allowed = Catalog.Select(x => x.Page).ToHashSet(StringComparer.Ordinal);
            if (request.Items is null || request.Items.Count != allowed.Count || request.Items.Any(x => x is null || !allowed.Contains(x.Page ?? "") || x.Label?.Length > 80 || x.Label?.Any(char.IsControl) == true) || request.Items.Select(x => x.Page).Distinct(StringComparer.Ordinal).Count() != allowed.Count)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["items"] = ["Menü öğeleri geçerli, benzersiz ve eksiksiz olmalı; adlar en fazla 80 karakter içermelidir."] });
            var saved = await db.TenantStandardMenuLayouts.SingleOrDefaultAsync(x => x.TenantId == tenant, ct);
            if ((saved?.Revision ?? 0) != request.ExpectedRevision) return Results.Conflict(new { error = "Menü başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin." });
            if (saved is null) { saved = new TenantStandardMenuLayout { TenantId = tenant }; db.TenantStandardMenuLayouts.Add(saved); }
            saved.LayoutJson = JsonSerializer.Serialize(request.Items.Select(x => new StandardMenuItem(x.Page, string.IsNullOrWhiteSpace(x.Label) ? null : x.Label.Trim())), JsonOptions);
            saved.Revision++; saved.UpdatedByUserId = userId; saved.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = userId, Action = "erp.standard-menu.updated", Resource = $"revision={saved.Revision}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Menü eşzamanlı değiştirildi. Yenileyip tekrar deneyin." }); }
            catch (DbUpdateException) when (request.ExpectedRevision == 0) { return Results.Conflict(new { error = "Menü eşzamanlı oluşturuldu. Yenileyip tekrar deneyin." }); }
            return Results.Ok(new { revision = saved.Revision });
        });
    }
    private static bool TryTenant(ClaimsPrincipal user, out Guid tenant, out Guid userId, out string role)
    {
        role = user.FindFirstValue("role") ?? ""; userId = Guid.Empty;
        return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenant) && Guid.TryParse(user.FindFirstValue("sub"), out userId);
    }
    private sealed record StandardMenuDefinition(string Page, string Label, string Group);
    private sealed record StandardMenuItem(string Page, string? Label);
    private sealed record StandardMenuView(string Page, string DefaultLabel, string Group, string? Label);
    private sealed record StandardMenuLayoutView(int Revision, IReadOnlyList<StandardMenuView> Items);
    private sealed record StandardMenuUpdate(int ExpectedRevision, IReadOnlyList<StandardMenuItem>? Items);
}
