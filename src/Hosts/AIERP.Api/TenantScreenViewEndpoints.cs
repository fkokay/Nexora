using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class TenantScreenViewEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly ScreenViewField[] CustomerFields =
    [
        new("code", "Cari kodu", true), new("name", "Ünvan", true), new("groupName", "Cari grubu", true),
        new("type", "Tür", true), new("currencyCode", "Döviz", true), new("paymentTermDays", "Vade", true),
        new("taxNumber", "Vergi no", true), new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrEmployeeFields =
    [
        new("personnelCode", "Personel kodu", true), new("fullName", "Ad soyad", true),
        new("department", "Departman", true), new("jobTitle", "Görev", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] StockItemFields =
    [
        new("code", "Stok kodu", true), new("name", "Stok adı", true), new("category", "Kategori", true),
        new("quantityOnHand", "Depo bakiyesi", true), new("reservedQuantity", "Rezerve", true),
        new("availableQuantity", "Kullanılabilir", true), new("minimumStock", "Minimum", true),
        new("valuationAmountBase", "Stok değeri", true), new("unvaluedQuantity", "Maliyetsiz miktar", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] ExchangeRateFields =
    [
        new("rateDate", "Tarih", true), new("currencyCode", "Döviz", true),
        new("rate", "Kur", true), new("revision", "Revizyon", true), new("source", "Kaynak", true)
    ];
    private static readonly ScreenViewField[] WarehouseLocationBalanceFields =
    [
        new("stockItemCode", "Stok kodu", true), new("stockItemName", "Stok adı", true),
        new("quantity", "Konum miktarı", true), new("unitCode", "Birim", true)
    ];
    private static readonly ScreenViewField[] SalesOrderFields =
    [
        new("code", "Sipariş no", true), new("quoteCode", "Kaynak teklif", true), new("customerName", "Müşteri", true),
        new("orderDate", "Sipariş tarihi", true), new("lineCount", "Satır", true), new("grandTotal", "Genel toplam", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesDeliveryFields =
    [
        new("code", "İrsaliye no", true), new("orderCode", "Sipariş no", true),
        new("deliveryDate", "Sevk tarihi", true), new("warehouseName", "Depo", true),
        new("lineCount", "Satır", true), new("status", "Durum", true),
        new("invoiceStatus", "Fatura", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesInvoiceFields =
    [
        new("code", "Fatura no", true), new("deliveryCode", "İrsaliye", true), new("orderCode", "Sipariş", true),
        new("customerName", "Müşteri", true), new("invoiceDate", "Fatura tarihi", true),
        new("lineCount", "Satır", true), new("grandTotal", "Genel toplam", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseInvoiceFields =
    [
        new("code", "Fatura no", true), new("supplierName", "Tedarikçi", true),
        new("receiptCode", "Mal kabul", true), new("purchaseOrderCode", "Sipariş no", true),
        new("invoiceDate", "Fatura tarihi", true), new("dueDate", "Vade tarihi", true),
        new("currencyCode", "Döviz", true), new("grandTotal", "Toplam", true),
        new("paidAmount", "Ödenen", true), new("outstandingAmount", "Ödenmemiş", true),
        new("lineCount", "Satır", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] StandalonePurchaseInvoiceDraftFields =
    [
        new("invoiceNumber", "Fatura no", true), new("supplierName", "Tedarikçi", true),
        new("invoiceDate", "Fatura tarihi", true), new("dueDate", "Vade tarihi", true),
        new("currencyCode", "Döviz", true), new("grandTotal", "Genel toplam", true),
        new("lineCount", "Satır", true), new("createdAt", "Kaydedilme", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseOrderFields =
    [
        new("code", "Sipariş no", true), new("supplierName", "Tedarikçi", true),
        new("orderDate", "Sipariş tarihi", true), new("expectedReceiptDate", "Beklenen teslim", true),
        new("targetWarehouseCode", "Hedef depo", true), new("lineCount", "Satır", true),
        new("grandTotal", "Genel toplam", true), new("currencyCode", "Döviz", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] FixedAssetFields =
    [
        new("assetCode", "Kıymet kodu", true), new("name", "Kıymet", true), new("category", "Kategori", true),
        new("acquisitionDate", "Edinim tarihi", true), new("inServiceDate", "Kullanıma giriş", true),
        new("acquisitionCostBase", "Edinim maliyeti", true), new("residualValueBase", "Kalıntı değer", true),
        new("usefulLifeMonths", "Faydalı ömür (ay)", true), new("accumulatedDepreciationBase", "Birikmiş amortisman", true),
        new("remainingBookValueBase", "Kalan defter değeri", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CrmOpportunityFields =
    [
        new("code", "Fırsat kodu", true), new("name", "Fırsat", true), new("customerName", "Müşteri", true),
        new("stage", "Aşama", true), new("estimatedValue", "Tahmini değer", true),
        new("probabilityPercent", "Olasılık", true), new("expectedCloseDate", "Beklenen kapanış", true),
        new("nextActivityAt", "Sonraki takip", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PaymentInstrumentFields =
    [
        new("instrumentNumber", "Çek/senet no", true), new("code", "Portföy kodu", true),
        new("type", "Tür", true), new("direction", "Yön", true),
        new("counterpartyName", "Cari", true), new("bankName", "Banka", true),
        new("dueDate", "Vade tarihi", true), new("amount", "Tutar", true),
        new("currencyCode", "Döviz", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CommercialContractFields =
    [
        new("code", "Sözleşme kodu", true), new("type", "Tür", true),
        new("counterpartyName", "Cari hesap", true), new("effectiveFrom", "Başlangıç", true),
        new("effectiveThrough", "Bitiş", true), new("currencyCode", "Döviz", true),
        new("status", "Durum", true), new("revision", "Sürüm", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] OperationalProjectFields =
    [
        new("code", "Proje kodu", true), new("name", "Proje adı", true), new("status", "Durum", true),
        new("startDate", "Başlangıç", true), new("endDate", "Bitiş", true), new("budgetAmount", "Bütçe", true),
        new("currencyCode", "Döviz", true), new("taskCount", "Görev", true),
        new("completedTaskCount", "Tamamlanan görev", true), new("overdueTaskCount", "Geciken görev", true),
        new("actualHours", "Gerçekleşen saat", true), new("nextTaskDate", "Sıradaki görev", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];

    public static void MapTenantScreenViewEndpoints(this WebApplication app)
    {
        var views = app.MapGroup("/api/screen-views").WithTags("Tenant Screen Views").RequireAuthorization();

        views.MapGet("/catalog", () => Results.Ok(new[]
        {
            new ScreenViewCatalog("hr-employees", "Personel listesi", HrEmployeeFields),
            new ScreenViewCatalog("customers", "Cari listesi", CustomerFields),
            new ScreenViewCatalog("inventory-stock", "Stok kartları", StockItemFields),
            new ScreenViewCatalog("exchange-rates", "Döviz kurları", ExchangeRateFields),
            new ScreenViewCatalog("warehouse-location-balances", "Depo konum bakiyeleri", WarehouseLocationBalanceFields),
            new ScreenViewCatalog("sales-orders", "Satış siparişleri", SalesOrderFields),
            new ScreenViewCatalog("sales-deliveries", "Satış irsaliyeleri", SalesDeliveryFields),
            new ScreenViewCatalog("sales-invoices", "Satış faturaları", SalesInvoiceFields),
            new ScreenViewCatalog("purchase-invoices", "Alış faturaları", PurchaseInvoiceFields),
            new ScreenViewCatalog("standalone-invoice-drafts", "Bağımsız alış faturası taslakları", StandalonePurchaseInvoiceDraftFields),
            new ScreenViewCatalog("purchase-orders", "Satın alma siparişleri", PurchaseOrderFields),
            new ScreenViewCatalog("fixed-assets", "Sabit kıymetler", FixedAssetFields),
            new ScreenViewCatalog("crm-opportunities", "CRM fırsatları", CrmOpportunityFields),
            new ScreenViewCatalog("payment-instruments", "Çek/senet portföyü", PaymentInstrumentFields),
            new ScreenViewCatalog("commercial-contracts", "Ticari sözleşmeler", CommercialContractFields),
            new ScreenViewCatalog("operational-projects", "Proje listesi", OperationalProjectFields)
        }));

        views.MapGet("/{screenKey}/active", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out _)) return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            var view = await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.IsPublished, ct);
            return Results.Ok(view is null ? DefaultView(catalog) : ToView(view));
        });

        views.MapGet("/{screenKey}/draft", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            var draft = await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && !x.IsPublished &&
                    !db.TenantScreenViewRevisions.Any(revision => revision.TenantId == tenantId && revision.ScreenViewId == x.Id &&
                        (revision.ChangeKind == "Published" || revision.ChangeKind == "Superseded")), ct);
            var active = await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.IsPublished, ct);
            return Results.Ok(new ScreenViewEditorState(catalog, active is null ? DefaultView(catalog) : ToView(active), draft is null ? null : ToView(draft)));
        });

        views.MapPost("/{screenKey}/draft", async (string screenKey, ScreenViewDraftCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            if (await db.TenantScreenViews.AnyAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && !x.IsPublished &&
                !db.TenantScreenViewRevisions.Any(revision => revision.TenantId == tenantId && revision.ScreenViewId == x.Id &&
                    (revision.ChangeKind == "Published" || revision.ChangeKind == "Superseded")), ct))
                return Results.Conflict(new { error = "Bu ekran için düzenlenmekte olan bir taslak zaten var." });
            var active = await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.IsPublished, ct);
            var name = NormalizeName(request.Name, catalog.Label);
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantScreenView
            {
                TenantId = tenantId, ScreenKey = catalog.Key, Name = name,
                LayoutJson = active?.LayoutJson ?? JsonSerializer.Serialize(DefaultView(catalog).Fields, JsonOptions),
                Revision = 1, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantScreenViews.Add(draft);
            db.TenantScreenViewRevisions.Add(RevisionOf(draft, userId, "DraftCreated"));
            AddAudit(db, tenantId, userId, "screen-view.draft-created", catalog.Key);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/screen-views/{catalog.Key}/draft", ToView(draft));
        });

        views.MapPut("/{viewId:guid}", async (Guid viewId, ScreenViewUpdateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var view = await db.TenantScreenViews.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == viewId, ct);
            if (view is null) return Results.NotFound();
            if (view.IsPublished) return Results.Conflict(new { error = "Yayımlanmış görünüm doğrudan değiştirilemez; yeni taslak oluşturun." });
            if (request.ExpectedRevision != view.Revision) return Results.Conflict(new { error = "Taslak başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin." });
            if (!TryGetCatalog(view.ScreenKey, out var catalog)) return Results.NotFound();
            if (!TryNormalizeFields(request.Fields, catalog, out var fields, out var errors)) return Results.ValidationProblem(errors!);
            var name = NormalizeName(request.Name, catalog.Label);
            db.TenantScreenViewRevisions.Add(RevisionOf(view, userId, "Updated"));
            view.Name = name; view.LayoutJson = JsonSerializer.Serialize(fields, JsonOptions);
            view.Revision++; view.UpdatedByUserId = userId; view.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(db, tenantId, userId, "screen-view.draft-updated", $"{view.ScreenKey}@{view.Revision}");
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Taslak eşzamanlı değiştirildi. Yenileyip tekrar deneyin." }); }
            return Results.Ok(ToView(view));
        });

        views.MapPost("/{viewId:guid}/publish", async (Guid viewId, ScreenViewPublishRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var draft = await db.TenantScreenViews.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == viewId, ct);
            if (draft is null) return Results.NotFound();
            if (draft.IsPublished) return Results.Conflict(new { error = "Görünüm zaten yayımlanmış." });
            if (request.ExpectedRevision != draft.Revision) return Results.Conflict(new { error = "Taslak başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin." });
            if (!TryGetCatalog(draft.ScreenKey, out var catalog)) return Results.NotFound();
            if (!TryNormalizeFields(ReadFields(draft.LayoutJson), catalog, out _, out var errors))
                return Results.Conflict(new { error = "Görünüm tanımı artık geçerli değil.", details = errors });
            var previous = await db.TenantScreenViews.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == draft.ScreenKey && x.IsPublished, ct);
            if (previous is not null)
            {
                db.TenantScreenViewRevisions.Add(RevisionOf(previous, userId, "Superseded"));
                previous.IsPublished = false; previous.Revision++; previous.UpdatedByUserId = userId; previous.UpdatedAt = DateTimeOffset.UtcNow;
            }
            db.TenantScreenViewRevisions.Add(RevisionOf(draft, userId, "Published"));
            draft.IsPublished = true; draft.Revision++; draft.UpdatedByUserId = userId; draft.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(db, tenantId, userId, "screen-view.published", $"{draft.ScreenKey}@{draft.Revision}");
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Görünüm eşzamanlı değiştirildi. Yenileyip tekrar deneyin." }); }
            return Results.Ok(ToView(draft));
        });

        views.MapGet("/{screenKey}/history", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            var items = await db.TenantScreenViewRevisions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key)
                .OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct);
            return Results.Ok(items.Select(ToRevisionView));
        });

        views.MapPost("/{screenKey}/draft-from-revision/{revisionId:guid}", async (string screenKey, Guid revisionId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            if (await db.TenantScreenViews.AnyAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && !x.IsPublished &&
                !db.TenantScreenViewRevisions.Any(revision => revision.TenantId == tenantId && revision.ScreenViewId == x.Id &&
                    (revision.ChangeKind == "Published" || revision.ChangeKind == "Superseded")), ct))
                return Results.Conflict(new { error = "Önce mevcut taslağı yayımlayın veya düzenlemeyi tamamlayın." });
            var old = await db.TenantScreenViewRevisions.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.Id == revisionId, ct);
            if (old is null) return Results.NotFound();
            if (!TryNormalizeFields(ReadFields(old.LayoutJson), catalog, out var fields, out var errors))
                return Results.Conflict(new { error = "Geçmiş görünüm artık geçerli değil.", details = errors });
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantScreenView
            {
                TenantId = tenantId, ScreenKey = catalog.Key, Name = old.Name,
                LayoutJson = JsonSerializer.Serialize(fields, JsonOptions), Revision = 1,
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantScreenViews.Add(draft);
            db.TenantScreenViewRevisions.Add(RevisionOf(draft, userId, $"RestoredDraft:{old.Revision}"));
            AddAudit(db, tenantId, userId, "screen-view.restore-draft-created", $"{catalog.Key}:revision:{old.Revision}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/screen-views/{catalog.Key}/draft", ToView(draft));
        });
    }

    private static bool TryTenantContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = Guid.Empty; userId = Guid.Empty; role = "";
        if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId) || !Guid.TryParse(user.FindFirstValue("sub"), out userId)) return false;
        role = user.FindFirstValue("role") ?? "";
        return true;
    }

    private static bool TryGetCatalog(string key, out ScreenViewCatalog catalog)
    {
        if (string.Equals(key, "hr-employees", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-employees", "Personel listesi", HrEmployeeFields);
            return true;
        }
        if (string.Equals(key, "customers", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customers", "Cari listesi", CustomerFields);
            return true;
        }
        if (string.Equals(key, "inventory-stock", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-stock", "Stok kartları", StockItemFields);
            return true;
        }
        if (string.Equals(key, "exchange-rates", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("exchange-rates", "Döviz kurları", ExchangeRateFields);
            return true;
        }
        if (string.Equals(key, "warehouse-location-balances", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("warehouse-location-balances", "Depo konum bakiyeleri", WarehouseLocationBalanceFields);
            return true;
        }
        if (string.Equals(key, "sales-orders", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-orders", "Satış siparişleri", SalesOrderFields);
            return true;
        }
        if (string.Equals(key, "sales-deliveries", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-deliveries", "Satış irsaliyeleri", SalesDeliveryFields);
            return true;
        }
        if (string.Equals(key, "sales-invoices", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-invoices", "Satış faturaları", SalesInvoiceFields);
            return true;
        }
        if (string.Equals(key, "purchase-invoices", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-invoices", "Alış faturaları", PurchaseInvoiceFields);
            return true;
        }
        if (string.Equals(key, "standalone-invoice-drafts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("standalone-invoice-drafts", "Bağımsız alış faturası taslakları", StandalonePurchaseInvoiceDraftFields);
            return true;
        }
        if (string.Equals(key, "purchase-orders", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-orders", "Satın alma siparişleri", PurchaseOrderFields);
            return true;
        }
        if (string.Equals(key, "fixed-assets", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("fixed-assets", "Sabit kıymetler", FixedAssetFields);
            return true;
        }
        if (string.Equals(key, "crm-opportunities", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("crm-opportunities", "CRM fırsatları", CrmOpportunityFields);
            return true;
        }
        if (string.Equals(key, "payment-instruments", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("payment-instruments", "Çek/senet portföyü", PaymentInstrumentFields);
            return true;
        }
        if (string.Equals(key, "commercial-contracts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("commercial-contracts", "Ticari sözleşmeler", CommercialContractFields);
            return true;
        }
        if (string.Equals(key, "operational-projects", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("operational-projects", "Proje listesi", OperationalProjectFields);
            return true;
        }
        catalog = null!;
        return false;
    }

    private static ScreenViewRecord DefaultView(ScreenViewCatalog catalog) => new(null, catalog.Key, catalog.Label, "Varsayılan", false, 0, catalog.Fields.Select((x, i) => new ScreenViewFieldLayout(x.Key, x.Label, x.DefaultVisible, i, x.Fixed)).ToArray());
    private static IReadOnlyList<ScreenViewFieldLayout> ReadFields(string json) => JsonSerializer.Deserialize<IReadOnlyList<ScreenViewFieldLayout>>(json, JsonOptions) ?? [];
    private static string NormalizeName(string? name, string fallback) => string.IsNullOrWhiteSpace(name) ? fallback : name.Trim()[..Math.Min(name.Trim().Length, 120)];
    private static ScreenViewRecord ToView(TenantScreenView x) => new(x.Id, x.ScreenKey,
        TryGetCatalog(x.ScreenKey, out var catalog) ? catalog.Label : x.ScreenKey, x.Name, x.IsPublished, x.Revision, WithFixedFields(x.ScreenKey, ReadFields(x.LayoutJson)));
    private static ScreenViewRevisionView ToRevisionView(TenantScreenViewRevision x) => new(x.Id, x.Revision, x.Name, WithFixedFields(x.ScreenKey, x.LayoutJson is null ? [] : ReadFields(x.LayoutJson)), x.ChangeKind, x.ChangedByUserId, x.CreatedAt);
    private static IReadOnlyList<ScreenViewFieldLayout> WithFixedFields(string screenKey, IReadOnlyList<ScreenViewFieldLayout> fields) =>
        TryGetCatalog(screenKey, out var catalog) ? fields.Select(field => field with { Fixed = catalog.Fields.SingleOrDefault(x => x.Key == field.Key)?.Fixed ?? false }).ToArray() : fields;
    private static TenantScreenViewRevision RevisionOf(TenantScreenView x, Guid userId, string changeKind) => new()
    {
        TenantId = x.TenantId, ScreenViewId = x.Id, Revision = x.Revision, ScreenKey = x.ScreenKey, Name = x.Name,
        LayoutJson = x.LayoutJson, ChangeKind = changeKind, ChangedByUserId = userId, CreatedAt = DateTimeOffset.UtcNow
    };

    private static bool TryNormalizeFields(IReadOnlyList<ScreenViewFieldLayout>? requested, ScreenViewCatalog catalog,
        out IReadOnlyList<ScreenViewFieldLayout> normalized, out Dictionary<string, string[]>? errors)
    {
        normalized = [];
        errors = null;
        if (requested is null || requested.Count != catalog.Fields.Count)
        {
            errors = new Dictionary<string, string[]> { ["fields"] = ["Katalogdaki tüm alanlar bir kez gönderilmelidir."] };
            return false;
        }
        var available = catalog.Fields.ToDictionary(x => x.Key, StringComparer.Ordinal);
        var result = new List<ScreenViewFieldLayout>(requested.Count);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (field, requestedIndex) in requested.OrderBy(x => x.Position).Select((field, index) => (field, index)))
        {
            if (field is null || !available.TryGetValue(field.Key ?? "", out var metadata) || !seen.Add(field.Key!))
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Alanlar katalogda bulunmalı ve yinelenmemelidir."] };
                return false;
            }
            var label = field.Label?.Trim();
            if (string.IsNullOrWhiteSpace(label) || label.Length > 80)
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Alan etiketleri 1–80 karakter olmalıdır."] };
                return false;
            }
            if (metadata.Fixed && !field.Visible)
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["İşlemler alanı gizlenemez."] };
                return false;
            }
            if (metadata.Fixed && requestedIndex != requested.Count - 1)
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Sabit alanlar listenin sonunda tutulmalıdır."] };
                return false;
            }
            var section = field.Section?.Trim();
            if (section is { Length: > 40 } || section?.Any(char.IsControl) == true || metadata.Fixed && !string.IsNullOrEmpty(section))
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Alan bölümü en fazla 40 karakter olabilir; sabit sistem alanları bölümlendirilemez."] };
                return false;
            }
            result.Add(new ScreenViewFieldLayout(metadata.Key, label, field.Visible, result.Count, metadata.Fixed, string.IsNullOrWhiteSpace(section) ? null : section));
        }
        if (seen.Count != available.Count)
        {
            errors = new Dictionary<string, string[]> { ["fields"] = ["Katalogdaki alanlar eksik."] };
            return false;
        }
        normalized = result;
        return true;
    }

    private static void AddAudit(TenantDbContext db, Guid tenantId, Guid userId, string action, string resource) =>
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = action, Resource = resource });

    private sealed record ScreenViewDraftCreateRequest(string? Name);
    private sealed record ScreenViewUpdateRequest(int ExpectedRevision, string? Name, IReadOnlyList<ScreenViewFieldLayout>? Fields);
    private sealed record ScreenViewPublishRequest(int ExpectedRevision);
    private sealed record ScreenViewCatalog(string Key, string Label, IReadOnlyList<ScreenViewField> Fields);
    private sealed record ScreenViewField(string Key, string Label, bool DefaultVisible, bool Fixed = false);
    internal sealed record ScreenViewFieldLayout(string Key, string Label, bool Visible, int Position, bool Fixed = false, string? Section = null);
    private sealed record ScreenViewRecord(Guid? Id, string ScreenKey, string ScreenLabel, string Name, bool IsPublished, int Revision, IReadOnlyList<ScreenViewFieldLayout> Fields);
    private sealed record ScreenViewEditorState(ScreenViewCatalog Catalog, ScreenViewRecord Active, ScreenViewRecord? Draft);
    private sealed record ScreenViewRevisionView(Guid Id, int Revision, string Name, IReadOnlyList<ScreenViewFieldLayout> Fields, string ChangeKind, Guid ChangedByUserId, DateTimeOffset CreatedAt);
}
