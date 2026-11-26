# Belge kuralları 1: Satış siparişinin durum zinciri ve belge modeli — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satış siparişine Taslak → Onay bekliyor → Onaylı → Sevk edildi → Faturalandı (+ İptal) durum zincirini, geçiş uçlarını, işlem günlüğünü ve sunucudaki belge modelini (`satis.siparis`) eklemek; eski sipariş ekranlarının yeni zincirle çalışmasını sağlamak.

**Architecture:** Durum kuralları saf bir sınıfta (`SalesOrderLifecycle`, Application) toplanır; uçlar ve türetme (`SalesOrderStatusDeriver`) onu kullanır. Belge modeli kodda tanımlıdır (`DocumentModels/`) ve yalnız okuma uçlarıyla sunulur; hesaplama bugünkü `SalesDocumentCalculator`/`/api/sales/orders/preview` ile kalır. İşlem günlüğü yalnız eklenen yeni bir tablodur. Danışman kuralları ve onay akışı bağlantısı bu planda **yok** (plan 3); "Onayla" bu PR'da kural olmadan doğrudan Onaylı yapar.

**Tech Stack:** .NET 10, ASP.NET Core minimal API, EF Core (SQL Server + InMemory testler), xUnit; React + TypeScript + Vitest (`frontend/erp-web`).

**Spec:** `docs/superpowers/specs/2026-11-25-belge-kurallari-design.md` (§3, §5.1, §5.2, §5.3, §6 PR 1, §7). Üst belge: `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md`.

Bu plan tasarımın **1. PR**'ıdır. 2. PR (ERP Belge kalıbı + Studio Belge paneli, G-S7/8/9) ve 3. PR (Kurallar) ayrı planlarla yazılır; 2. PR'ın Studio paneli taslağı kodlamadan önce kullanıcıya gösterilir.

## Global Constraints

- Enum adları ve sayıları korunur: `Open = 1` (etiket **Onaylı**), `Fulfilled = 2` (**Sevk edildi**), `Cancelled = 3` (**İptal**); yeniler `Draft = 4` (**Taslak**), `PendingApproval = 5` (**Onay bekliyor**), `Invoiced = 6` (**Faturalandı**).
- `SalesOrder.Status` varlık varsayılanı `Open` olarak **kalır** (doğrudan varlık tohumlayan ~52 test ve eski veri yolu için); yeni siparişi Taslak yapan uçlardır.
- Düzenleme (PUT) ve silme yalnız `Draft` + sevk/fatura/rezervasyon yok. Teslim tarihi ve özel alan değerleri `Draft` ya da `Open`. Rezervasyon ve sevk yalnız `Open`.
- İptal: `Draft` ya da sevk kaydı olmayan `Open`; gerekçe 1–500 karakter; aktif rezervasyonlar bırakılır. `PendingApproval`'dan iptal yok.
- Onayı geri al: yalnız `Open` + sevk, fatura, rezervasyon kaydı yok (iptal edilmiş/bırakılmış dahil — bugünkü düzenleme ön koşuluyla aynı).
- Onayla: `Draft` → `Open`. Ön kontroller: yazma doğrulamaları (aktif müşteri, döviz = cari dövizi, aktif stoklar, birim, kur) tutarları yeniden hesaplayarak; risk limiti (`borç − alacak + sipariş genel toplamı > RiskLimit` ise 409, fatura ile aynı kural ve aynı alanlar `currentBalance`, `projectedBalance`, `riskLimit`). Stok yetersizliği **uyarıdır**, engellemez.
- `Invoiced`: siparişin `Posted` her irsaliyesi `Posted` bir faturaya bağlıysa ve sipariş tam sevk edilmişse. Fatura iptali ve irsaliye iptali yeniden türetir.
- İşlem günlüğü yalnız eklenir; güncellenmez, silinmez.
- Hata ve etiket metinleri Türkçe. Denetim (`AuditEvents`) eylem adları: `sales-order.approved`, `sales-order.unapproved`, `sales-order.cancelled`.
- Migration: Platform **ve** Tenant için; yalnız yeni tablo + `Invoiced` veri düzeltmesi. ADD COLUMN ile backfill aynı batch'te olmaz (burada kolon eklenmiyor). Canlıya yedek, prova ve CHECKDB ile uygulanır (bu planın işi değil; `docs/release-migrations.md` notu yazılır).
- Tenant kapsamı yalnız `tenant_id` claim'inden; her sorgu tenant'a süzülür.

## Review Focus

1. **Çift tıklama / eşzamanlı geçiş:** aynı siparişe iki "Onayla" ya da Onayla + Düzenle aynı anda gelir → biri kazanır, öbürü 409 alır; durum ve günlük tutarlı kalır (ilişkisel sağlayıcıda `UPDLOCK, HOLDLOCK` ile satır kilidi). Test: Görev 4 `Approve_twice_with_same_request_id_returns_current_order_once_logged`.
2. **Taslak beklerken veri değişir:** müşteri pasife alınmış, stok kartı pasif ya da kur silinmiş Taslak sipariş onaylanır → 400/409 alan hatası, durum Taslak kalır. Test: Görev 4 `Approve_rejects_when_stock_item_became_inactive`.
3. **İptal sırası:** irsaliye faturalı iken irsaliye iptali reddedilir (bugünkü kural); fatura iptali sonra irsaliye iptali → `Invoiced → Fulfilled → Open` sırayla türetilir. Test: Görev 5 `Invoice_void_then_delivery_void_steps_back_to_approved`.
4. **Satır koşullu izin kuralı olan kullanıcı:** `resource.status` ile "Open"a izin veren kuralı olan kullanıcı listede Taslak siparişleri görmez ama `Open` siparişleri görmeye devam eder; bilinmeyen değer hata vermez. Test: Görev 3 `Status_rule_on_open_still_lists_approved_orders_and_hides_drafts`.
5. **Tekliften dönüşen sipariş iptal edilir:** teklif–sipariş bağı (`QuoteId` benzersiz) kalır, teklif yeniden dönüştürülemez; mesaj anlaşılır. Test: Görev 4 `Cancelled_order_from_quote_keeps_quote_link`.

---

### Task 1: Durum kuralları (saf) ve enum

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs:2310` (`SalesOrderStatus`)
- Create: `src/Platform/AIERP.Platform.Application/SalesOrderLifecycle.cs`
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/SalesOrderLifecycleTests.cs`

**Interfaces:**
- Produces:
  - `public enum SalesOrderStatus { Open = 1, Fulfilled = 2, Cancelled = 3, Draft = 4, PendingApproval = 5, Invoiced = 6 }`
  - `public static class SalesOrderLifecycle` içinde:
    - `bool CanEdit(SalesOrderStatus s)` → yalnız Draft
    - `bool CanEditDeliveryDateOrCustomFields(SalesOrderStatus s)` → Draft, Open
    - `bool CanApprove(SalesOrderStatus s)` → Draft
    - `bool CanUnapprove(SalesOrderStatus s, bool hasDeliveries, bool hasInvoices, bool hasReservations)`
    - `bool CanCancel(SalesOrderStatus s, bool hasDeliveries)` → Draft; Open ve !hasDeliveries
    - `bool IsCommitted(SalesOrderStatus s)` → Open, Fulfilled, Invoiced
    - `SalesOrderStatus Derive(SalesOrderStatus current, bool fullyDelivered, bool allPostedDeliveriesInvoiced, bool hasPostedDelivery)` → current ∈ {Draft, PendingApproval, Cancelled} ise current; değilse fullyDelivered && hasPostedDelivery && allPostedDeliveriesInvoiced ? Invoiced : fullyDelivered ? Fulfilled : Open
    - `string Label(SalesOrderStatus s)` → Taslak, Onay bekliyor, Onaylı, Sevk edildi, Faturalandı, İptal

- [ ] **Step 1: Write the failing tests** — `[Theory]` tabloları:
  - `CanEdit`: Draft→true; Open, PendingApproval, Fulfilled, Invoiced, Cancelled→false
  - `CanUnapprove(Open,false,false,false)`→true; herhangi bir bayrak true→false; Draft→false
  - `CanCancel(Draft,false)`→true, `(Open,false)`→true, `(Open,true)`→false, `(PendingApproval,false)`→false, `(Fulfilled,false)`→false
  - `IsCommitted`: Open/Fulfilled/Invoiced true; Draft/PendingApproval/Cancelled false
  - `Derive(Open,true,true,true)`→Invoiced; `(Open,true,false,true)`→Fulfilled; `(Invoiced,true,false,true)`→Fulfilled; `(Fulfilled,false,false,true)`→Open; `(Cancelled,true,true,true)`→Cancelled; `(Draft,…)`→Draft
  - `Label(SalesOrderStatus.Open)` == "Onaylı"
  - `Enum_values_keep_existing_numbers`: `(int)Open==1`, `(int)Fulfilled==2`, `(int)Cancelled==3`, `(int)Draft==4`, `(int)PendingApproval==5`, `(int)Invoiced==6`

- [ ] **Step 2: Run** `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~SalesOrderLifecycleTests"` → derleme hatası / FAIL.
- [ ] **Step 3: Implement** enum değerlerini ve `SalesOrderLifecycle`'ı.
- [ ] **Step 4: Run** aynı komut → PASS. Ayrıca `dotnet build AIERP.slnx` (switch'lerde eksik durum uyarısı varsa düzelt).
- [ ] **Step 5: Commit** `feat(satis): sipariş durum zinciri kuralları`

### Task 2: İşlem günlüğü tablosu ve migration'lar

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs` (yeni `TenantDocumentActivity`)
- Create: `src/Platform/AIERP.Platform.Infrastructure/DocumentActivityEntityConfiguration.cs`
- Modify: `src/Platform/AIERP.Platform.Infrastructure/PlatformDbContext.cs` (DbSet + yapılandırmayı uygula; diğer `*EntityConfiguration` nasıl bağlanıyorsa öyle)
- Create: `src/Hosts/AIERP.Api/DocumentActivityLog.cs`
- Create (araçla): `Migrations/Platform/<ts>_AddDocumentActivities`, `Migrations/Tenant/<ts>_AddTenantDocumentActivities`, `Migrations/Platform/<ts>_BackfillInvoicedSalesOrders`, `Migrations/Tenant/<ts>_BackfillTenantInvoicedSalesOrders`
- Modify: `docs/release-migrations.md` (yayın notu)
- Test: `tests/IntegrationTests/DocumentActivityLogTests.cs`

**Interfaces:**
- Produces:
  - Varlık `TenantDocumentActivity { Guid Id; Guid TenantId; string DocumentType /*≤40, "satis.siparis"*/; Guid DocumentId; string Transition /*≤40*/; string Step /*≤200*/; string Source /*"core"|"rule"|"extension"*/; string Outcome /*"done"|"waiting"|"blocked"|"warned"|"retry"*/; string? Message /*≤500*/; Guid? ActorUserId; Guid? RequestId; DateTimeOffset CreatedAt }`; indeks `(TenantId, DocumentType, DocumentId, CreatedAt)`; `DbSet<TenantDocumentActivity> TenantDocumentActivities`.
  - `internal static class DocumentActivityLog { static void Add(TenantDbContext db, Guid tenantId, string documentType, Guid documentId, string transition, string step, string source, string outcome, string? message, Guid? actorUserId, Guid? requestId = null); static Task<IReadOnlyList<DocumentActivityView>> ReadAsync(TenantDbContext db, Guid tenantId, string documentType, Guid documentId, CancellationToken ct); }`
  - `public sealed record DocumentActivityView(string Transition, string Step, string Source, string Outcome, string? Message, Guid? ActorUserId, DateTimeOffset CreatedAt)` (Application/PlatformContracts.cs).
  - Metinler `AuditResourceSanitizer` ile temizlenir.

- [ ] **Step 1: Failing test** `DocumentActivityLogTests.Add_then_read_returns_rows_oldest_first_and_tenant_scoped`: iki tenant için satır ekle; `ReadAsync` yalnız kendi tenant'ının satırlarını `CreatedAt` artan sırada döndürür; 600 karakterlik mesaj 500'e kısaltılır.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~DocumentActivityLogTests"` → FAIL.
- [ ] **Step 3: Implement** varlık, yapılandırma, `DocumentActivityLog`.
- [ ] **Step 4: Migration'lar.** `dotnet tool restore`; sonra
  `dotnet ef migrations add AddDocumentActivities --project src/Platform/AIERP.Platform.Infrastructure --context PlatformDbContext --output-dir Migrations/Platform` ve
  `dotnet ef migrations add AddTenantDocumentActivities --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext --output-dir Migrations/Tenant`.
  Boş iki veri migration'ı ekle (`BackfillInvoicedSalesOrders` / `BackfillTenantInvoicedSalesOrders`), `Up` içinde `20261124204810_BackfillTenantInvoicedDeliveryLinePrices` biçiminde `EXEC(N'…')` ile idempotent:
  `UPDATE o SET o.[Status] = 6 FROM [dbo].[SalesOrders] o WHERE o.[Status] = 2 AND EXISTS (posted irsaliye) AND NOT EXISTS (Posted [SalesDeliveries] d WHERE d.OrderId=o.Id AND NOT EXISTS (Posted [SalesInvoices] i WHERE i.DeliveryId=d.Id))`. `Down` boş (yorumla: geri dönüş 6→2).
  `SalesDeliveryStatus`/`SalesInvoiceStatus` sayılarını `Entities.cs`'ten doğrula (`Posted = 1`).
- [ ] **Step 5: Run** testi → PASS; `dotnet ef migrations has-pending-model-changes … --context TenantDbContext` ve `--context PlatformDbContext` → değişiklik yok; `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~MigrationDataSafetyTests"` → PASS.
- [ ] **Step 6:** `docs/release-migrations.md`'ye kısa not: yeni tablo + `Invoiced` düzeltmesi, prova sırasında `resource.status = Fulfilled` geçen satır koşullu kuralları listeleme sorgusu.
- [ ] **Step 7: Commit** `feat(satis): belge işlem günlüğü tablosu ve Faturalandı düzeltmesi`

### Task 3: Mevcut uçlarda durum kapıları ve "taahhüt" süzgeçleri

**Files:**
- Modify: `src/Hosts/AIERP.Api/SalesOrderEndpoints.cs:13-28` (DELETE), `:35-127` (POST → `Draft`), `:130-237` (PUT), `:240-260` (teslim tarihi)
- Modify: `src/Hosts/AIERP.Api/Program.cs:3846-3903` (convert-to-order → `Draft`), `:3983-4035` (özel alan değerleri), `:3922,3943,3970` (zorunlu özel alan kontrolleri: `Open` → `Draft || Open`), `:4060`, `:4153` (değişmez, Open)
- Modify (`!= Cancelled` → `IsCommitted`): `ForeignTradeEndpoints.cs:53,120`, `SalesPlanningInquiryEndpoints.cs:119`, `PlatformContracts.cs:361`, `ReportEndpoints.cs:2088-2089` (Draft/PendingApproval satırları açık/kalan miktara katılmaz)
- Test: `tests/IntegrationTests/SalesOrderLifecycleIntegrationTests.cs` (yeni; `SalesDocumentPreviewEndpointTests`'teki `WebApplicationFactory<ApiEntryPointMarker>` + InMemory tohumlama düzenini kopyala)
- Modify (kırılan testler): `SalesDocumentPreviewSqlAcceptanceTests.cs:90` ve POST ile sipariş yazıp sevk eden diğer testler — POST'tan sonra `POST /{id}/approve` çağır (Task 4 ucu; bu görevde test yardımcı metodu `ApproveAsync` olarak ekle, Task 4'te ucu yaz — sıra: Task 3 testleri Task 4'ten önce kırmızı kalabilir, bu yüzden Task 3 ve 4 aynı dalda art arda commit edilir).

**Interfaces:**
- Consumes: `SalesOrderLifecycle.*` (Task 1).
- Produces: davranış: POST ve dönüşüm `Status = Draft` döndürür; PUT/DELETE `Open`'da 409 `"Yalnızca taslak siparişler düzenlenebilir."` / `"Yalnızca taslak siparişler silinebilir."` (sevk/fatura/rezervasyon koşulu metni korunur, başına eklenir).

- [ ] **Step 1: Failing tests** (`SalesOrderLifecycleIntegrationTests`):
  - `Create_writes_draft`: POST → 201, `status == "Draft"`.
  - `Convert_quote_writes_draft`: kabul edilmiş teklif → `convert-to-order` → sipariş `Draft`.
  - `Put_on_open_order_conflicts` (varlıkla `Open` tohumla) → 409; `Put_on_draft_succeeds` → 200.
  - `Delete_on_open_order_conflicts` → 409.
  - `Delivery_date_allowed_on_draft_and_open`; `Delivery_date_rejected_on_fulfilled` → 409.
  - `Deliver_rejected_on_draft` → 409 "Yalnızca açık satış siparişi sevk edilebilir." (mevcut metin; Global Constraints'e göre `Open` = Onaylı) — metni "Yalnızca onaylı satış siparişi sevk edilebilir." yap ve testte bunu bekle.
  - `Planning_inquiry_ignores_draft_orders`: Draft + Open tohumla; `SalesPlanningInquiryEndpoints` sonucunda yalnız Open görünür.
  - `Status_rule_on_open_still_lists_approved_orders_and_hides_drafts` (Review Focus 4): `resource.status == Open` Allow kuralı olan TenantUser `GET /api/sales/orders` → Open görünür, Draft görünmez, 200.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SalesOrderLifecycleIntegrationTests"` → FAIL.
- [ ] **Step 3: Implement** kapıları ve süzgeçleri; tüm `SalesOrderStatus.` kullanımlarını (`grep -rn "SalesOrderStatus\." src`) gözden geçir, her birini Global Constraints'e göre karara bağla; `== Open` kalanlar (MRP, gösterge, stok kartı silme) değişmez.
- [ ] **Step 4: Run** filtre → PASS (onay yardımcısı gerektirenler hariç; Task 4 sonrası tekrar).
- [ ] **Step 5: Commit** `feat(satis): yeni sipariş taslak olarak yazılır, durum kapıları`

### Task 4: Geçiş uçları — Onayla, Onayı geri al, İptal et

**Files:**
- Create: `src/Hosts/AIERP.Api/SalesOrderTransitionEndpoints.cs` (`MapSalesOrderTransitionEndpoints`; `Program.cs`'te `MapSalesOrderEndpoints` yanında çağır)
- Modify: `src/Platform/AIERP.Platform.Application/PlatformContracts.cs` (istek/yanıt kayıtları)
- Modify: `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs:406` (`"unapprove"` işlem segmentine eklenir; `approve`, `cancel` zaten var → `erp.sales-orders.execute`)
- Modify: `src/Hosts/AIERP.Api/ErpOperationCatalog.SalesCards.cs` (`satis.siparis.onayla`, `satis.siparis.onayiGeriAl`, `satis.siparis.iptal`; tür "update", POST, `orderRoute + "/approve"` …; etiketleri `names.txt`/Labels düzenine göre ekle)
- Test: `tests/IntegrationTests/SalesOrderTransitionEndpointsTests.cs`, `tests/UnitTests/AIERP.Platform.UnitTests/SalesOrderTransitionPermissionRoutingTests.cs` (`SalesPromotionPermissionRoutingTests` düzeni)

**Interfaces:**
- Consumes: `SalesOrderLifecycle`, `DocumentActivityLog.Add`, `SalesDocumentCalculator.NormalizeOrderLinesAsync`.
- Produces:
  - `public sealed record SalesOrderTransitionRequest(Guid? RequestId, string? Reason);`
  - `public sealed record SalesOrderTransitionResult(SalesOrderView Order, IReadOnlyList<string> Warnings);`
  - `POST /api/sales/orders/{id}/approve` → 200 `SalesOrderTransitionResult`; `/unapprove` → 200; `/cancel` (Reason zorunlu) → 200.
  - Günlük satırları (`DocumentType = "satis.siparis"`): approve → `("onayla","Kontroller","core","done")`, varsa uyarı için `("onayla","Stok yeterliliği","core","warned", "<stok kodu>: kullanılabilir X, istenen Y")`, sonra `("onayla","Onaylandı","core","done")`; unapprove → `("onayiGeriAl","Taslağa alındı","core","done")`; cancel → `("iptal","İptal edildi","core","done", reason)`.

- [ ] **Step 1: Failing tests** (`SalesOrderTransitionEndpointsTests`):
  - `Approve_draft_moves_to_approved_and_logs`: 200; durum `Open`; günlükte "Onaylandı"; denetimde `sales-order.approved`.
  - `Approve_twice_with_same_request_id_returns_current_order_once_logged` (RF 1): aynı `RequestId` ile ikinci çağrı 200, günlükte tek "Onaylandı".
  - `Approve_non_draft_conflicts`: `Open` → 409.
  - `Approve_rejects_when_stock_item_became_inactive` (RF 2): 400 ValidationProblem `lines`, durum Draft.
  - `Approve_blocks_over_risk_limit`: `RiskLimit = 1000`, açık borç 900, sipariş 200 → 409 `projectedBalance == 1100`.
  - `Approve_warns_but_succeeds_when_stock_short`: 200, `Warnings` bir eleman, günlükte "warned".
  - `Unapprove_clean_open_order_returns_to_draft`; `Unapprove_with_reservation_conflicts` → 409.
  - `Cancel_draft_with_reason`: 200 `Cancelled`, günlük mesajı gerekçe; `Cancel_without_reason_is_validation_error` → 400; `Cancel_open_with_delivery_conflicts` → 409; `Cancel_releases_active_reservations`: rezervasyon `Released` olur.
  - `Cancel_pending_approval_conflicts` → 409.
  - `Cancelled_order_from_quote_keeps_quote_link` (RF 5): teklif `convert-to-order` tekrar → 409.
  - `TenantUser_without_execute_cannot_approve`: `erp.sales-orders.execute` Deny kuralı → 403.
  - Routing unit test: `POST /api/sales/orders/{id:guid}/approve|unapprove|cancel` → `erp.sales-orders` + `execute`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SalesOrderTransitionEndpointsTests|FullyQualifiedName~SalesOrderLifecycleIntegrationTests"` ve unit routing filtresi → FAIL.
- [ ] **Step 3: Implement.** Her uç: tenant/sub claim'i; işlem (transaction); ilişkiselse `FromSqlInterpolated(... WITH (UPDLOCK, HOLDLOCK) ...)` ile sipariş satırını kilitle (WorkflowEndpoints'teki satış teklifi deseni); `RequestId` daha önce bu sipariş + geçiş için günlükte varsa mevcut durumu 200 döndür; `SalesOrderLifecycle` kontrolü; approve'da POST/PUT ile **aynı** doğrulama ve normalizasyonu çalıştırıp tutarları güncelle (yazma uçlarındaki kodu tekrar etme — ortak bir `SalesOrderWriteValidation` yardımcı metoduna çıkar ve POST/PUT da onu çağırsın); risk limiti `Program.cs:4553-4558` ile aynı hesap (ortak yardımcıya çıkar, fatura da onu çağırsın); stok uyarısı: satır başına temel birimde istenen miktar > (aktif depoların bakiyesi − aktif rezervasyonlar).
- [ ] **Step 4: Run** → PASS; Task 3'te kırmızı kalan, onay gerektiren mevcut testleri `approve` çağrısıyla düzelt ve tüm satış testlerini çalıştır: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~Sales"` → PASS (zaman aşımına düşen sınıfı tek başına yeniden çalıştır).
- [ ] **Step 5: Commit** `feat(satis): siparişi onayla, onayı geri al, iptal et`

### Task 5: Sevk ve fatura ile durum türetme

**Files:**
- Create: `src/Hosts/AIERP.Api/SalesOrderStatusDeriver.cs`
- Modify: `src/Hosts/AIERP.Api/Program.cs:4264` (sevk sonrası), `:4436-4441` (irsaliye iptali), `:4448-` (irsaliyeden fatura, kayıttan önce), `:5344-5380` (fatura iptali; `invoice.OrderId` ya da irsaliyesinin `OrderId`'si varsa)
- Test: `tests/IntegrationTests/SalesOrderStatusDerivationTests.cs`

**Interfaces:**
- Produces: `internal static class SalesOrderStatusDeriver { static Task RecomputeAsync(TenantDbContext db, SalesOrder order, CancellationToken ct); }` — siparişin satırlarına göre teslim (Posted irsaliye satırları) ve Posted irsaliyelerin Posted faturalarını okur, `SalesOrderLifecycle.Derive` ile `order.Status`'u ayarlar; değiştiyse günlüğe `("sevk"|"fatura", "Sevk edildi"|"Faturalandı"|"Onaylıya döndü", "core","done")` yazar. Çağıran `SaveChangesAsync` yapar.

- [ ] **Step 1: Failing tests:**
  - `Partial_delivery_keeps_approved`; `Full_delivery_moves_to_shipped` (`Fulfilled`).
  - `Invoicing_last_delivery_moves_to_invoiced`; iki irsaliyeden yalnız biri faturalıysa `Fulfilled`.
  - `Invoice_void_then_delivery_void_steps_back_to_approved` (RF 3): `Invoiced` → fatura iptali → `Fulfilled` → irsaliye iptali → `Open`.
  - `Cancelled_order_is_not_rederived`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SalesOrderStatusDerivationTests"` → FAIL.
- [ ] **Step 3: Implement** `RecomputeAsync` ve dört çağrı yeri (mevcut iki satır içi türetmeyi bununla değiştir).
- [ ] **Step 4: Run** → PASS; `--filter "FullyQualifiedName~SalesDelivery|FullyQualifiedName~SalesInvoice"` → PASS.
- [ ] **Step 5: Commit** `feat(satis): sevk ve faturadan sipariş durumu türetilir`

### Task 6: Belge modeli ve belge uçları

**Files:**
- Create: `src/Hosts/AIERP.Api/DocumentModels/DocumentModel.cs` (kayıtlar), `src/Hosts/AIERP.Api/DocumentModels/SalesOrderDocumentModel.cs`, `src/Hosts/AIERP.Api/DocumentModels/DocumentModelEndpoints.cs`
- Modify: `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs` (`/api/document-models/satis.siparis` → `erp.sales-orders`; GET ve `fill` POST'u `read`)
- Modify: `src/Hosts/AIERP.Api/ErpOperationCatalog.SalesCards.cs` (`satis.siparis.belge` okuma işlemi; `satis.siparis.doldur` POST okuma)
- Test: `tests/IntegrationTests/SalesOrderDocumentModelTests.cs`

**Interfaces:**
- Produces (JSON alan adları camelCase; 2. PR'ın ERP kalıbı bunları tüketir):
  - `public sealed record DocumentModelView(string Code, string Label, IReadOnlyList<DocumentFieldView> Fields, IReadOnlyList<DocumentLineColumnView> LineColumns, IReadOnlyList<DocumentStateView> States, IReadOnlyList<DocumentTransitionView> Transitions, string CalculateOperation, string FillOperation, string LoadOperation);`
  - `DocumentFieldView(string Code, string Label, string Type, bool Required, string? OptionsOperation)` — sipariş için: `code`, `customerId`, `orderDate`, `requestedDeliveryDate`, `salespersonEmployeeId`.
  - `DocumentLineColumnView(string Code, string Label, string Type, bool Required, bool Calculated, string? OptionsOperation)` — `stockItemId`, `quantity`, `unitCode`, `unitPrice`, `currencyCode`, `discountPercent`, `vatPercent`, `isVatIncluded` (girilen); `availableQuantity`, `lineSubtotal`, `discountAmount`, `taxAmount`, `lineTotal`, `deliveredQuantity` (hesaplanan).
  - `DocumentStateView(string Code, string Label, bool Terminal)` — Draft, PendingApproval, Open, Fulfilled, Invoiced, Cancelled(terminal); etiketler `SalesOrderLifecycle.Label`.
  - `DocumentTransitionView(string Code, string Label, IReadOnlyList<string> From, string To, string Operation, bool RequiresReason)` — `onayla`, `onayiGeriAl`, `iptal`.
  - `GET /api/document-models/satis.siparis` → `DocumentModelView` (bilinmeyen kod → 404).
  - `GET /api/sales/orders/{id}/document` → `public sealed record SalesOrderDocumentView(SalesOrderView Order, IReadOnlyList<SalesOrderDocumentLine> Lines, SalesDocumentPreview Amounts, IReadOnlyList<string> AllowedTransitions, IReadOnlyList<DocumentActivityView> Activity, bool ActivityStartedLate)`; `Lines` girilen birim/fiyat/döviz ile (`Entered*`) ve `deliveredQuantity`; `AllowedTransitions` durum + `SalesOrderLifecycle` + kullanıcının `erp.sales-orders.execute` izni (`IPlatformPermissionAuthorizer`); `ActivityStartedLate = Activity.Count == 0 && Status != Draft`.
  - `POST /api/document-models/satis.siparis/fill` gövde `DocumentFillRequest(string Field, string? Value, Guid? CustomerId, DateOnly? OrderDate)` → `DocumentFillResult(IReadOnlyDictionary<string, object?> Values)`; `stockItemId` için `unitCode`, `unitPrice` (=`salesListPrice`), `vatPercent` (`salesVatPercent`), `discountPercent` (`salesDiscountPercent`), `currencyCode` (`priceCurrencyCode`), `availableQuantity` (aktif depoların bakiyesi − aktif rezervasyonlar, temel birim). Başka alan → boş sözlük. Pasif/başka tenant stok → 404.

- [ ] **Step 1: Failing tests:**
  - `Model_lists_states_and_transitions_in_order`: `States` kodları `[Draft, PendingApproval, Open, Fulfilled, Invoiced, Cancelled]`, `Open` etiketi "Onaylı"; `CalculateOperation == "satis.siparis.hesapla"`.
  - `Document_returns_lines_with_entered_values_and_amounts` (G-S7'nin sunucu yarısı): EUR satırlı sipariş → `Lines[0].unitPrice` girilen EUR fiyatı, `Amounts.GrandTotal` sipariş toplamına eşit.
  - `Allowed_transitions_follow_state_and_permission`: Draft → `[onayla, iptal]`; Open temiz → `[onayiGeriAl, iptal]`; execute Deny → `[]`.
  - `Document_of_legacy_open_order_flags_activity_started_late`.
  - `Fill_stock_returns_price_vat_discount_currency_unit_and_available` (G-S9'un sunucu yarısı): bakiye 100, aktif rezervasyon 30 → `availableQuantity == 70`.
  - `Fill_other_tenant_stock_is_not_found` → 404.
  - `Document_of_other_tenant_order_is_not_found` → 404.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SalesOrderDocumentModelTests"` → FAIL.
- [ ] **Step 3: Implement**; `Amounts` için `SalesDocumentPreviewEndpoints`'teki sipariş önizleme mantığını yeniden kullan (ortak metoda çıkar, uç onu çağırsın).
- [ ] **Step 4: Run** → PASS; `--filter "FullyQualifiedName~ErpOperationCatalog|FullyQualifiedName~SalesCardStandardsTests"` → PASS (etiket eksikliği açılışta hata verir, `ErpOperationCatalog.cs:494`).
- [ ] **Step 5: Commit** `feat(satis): satış siparişi belge modeli ve belge uçları`

### Task 7: Eski ERP ekranları

**Files:**
- Modify: `frontend/erp-web/src/document-page/documentStatus.ts:35-36` (sipariş etiketleri: Draft "Taslak" neutral, PendingApproval "Onay bekliyor" warning, Open "Onaylı" info/success, Fulfilled "Sevk edildi", Invoiced "Faturalandı", Cancelled "İptal")
- Modify: `frontend/erp-web/src/erp-types.ts:61` (`status` birleşimi)
- Modify: `frontend/erp-web/src/sales/salesDocumentDetail.tsx:50` (adımlar: Draft, PendingApproval, Open, Fulfilled, Invoiced; terminal Cancelled)
- Modify: `frontend/erp-web/src/SalesPage.tsx` — sipariş penceresi komutları (`:10207-10230` çevresi): Draft'ta "Onayla" (ana), Open+temizse "Onayı geri al", Draft/Open sevksizse "İptal et" (gerekçe penceresi, 1–500); liste satır menüsü Düzenle `status === "Draft"` (`:2028`); "Sevk bekleyen" sayaçları `Open` kalır; `:8087`, `:8155`, `:10315-10731` dallarını Global Constraints'e göre gözden geçir.
- Modify: `frontend/erp-web/src/sales/components/SalesInvoiceFromDeliveryDialog.tsx:824` (değişmez; `Open` doğru — yorumla doğrula)
- Test: `frontend/erp-web/src/sales/salesOrderTransitions.test.tsx` (yeni), `frontend/erp-web/src/document-page/documentKit.test.tsx` (etiket)

**Interfaces:**
- Consumes: Task 4 uçları; yanıttaki `warnings` bir bildirimle gösterilir.

- [ ] **Step 1: Failing tests:** `Draft order shows Onayla and posts approve`; `Open order without deliveries shows Onayı geri al and İptal et`; `Cancel asks for a reason and sends it`; `Approve warnings are shown`; `salesOrderStatus("Open").label === "Onaylı"`.
- [ ] **Step 2: Run** `cd frontend/erp-web; npx vitest run src/sales/salesOrderTransitions src/document-page` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** aynı + `npm run build` → PASS; `npx vitest run src/sales src/system-pages` → PASS.
- [ ] **Step 5: Commit** `feat(erp): eski sipariş ekranlarında onay, geri alma ve iptal`

### Task 8: Sistem standartları (`sales-orders`, `sales-order-create`)

**Files:**
- Modify: `src/Hosts/AIERP.Api/SystemPages/Standards/sales-orders.json` (sürüm +1; yeni öğeler `component:onaylaButonu`, `component:onayiGeriAlButonu`, `component:iptalButonu` ve sorguları `satis.siparis.onayla|onayiGeriAl|iptal`, `since` = yeni sürüm; Düzenle `visibleWhen` → `status == 'Draft'`; iptal gerekçesi için bugünkü diyalog/girdi bileşeni)
- Modify: `src/Hosts/AIERP.Api/SystemPages/Standards/sales-order-create.json` (sürüm +1; `commandWhen save` ve `disabledWhen`/`duzenlemeUyarisi` koşulları `'Open'` → `'Draft'`, uyarı metni "Yalnızca taslak siparişler düzenlenebilir.")
- Modify: `SystemPageStandards.versions.txt` ve ilgili fixture'lar (`system-pages/sales*Operations.fixture.json`) — mevcut sürüm yükseltme düzenine göre
- Test: `tests/IntegrationTests/SalesSystemPagesTests.cs`, `tests/IntegrationTests/SalesCardStandardsTests.cs`, `frontend/erp-web/src/system-pages/salesOrdersStandard.test.tsx`

- [ ] **Step 1: Failing tests:** `Sales_orders_standard_offers_approve_on_draft_rows` (yeni öğeler tanımda ve `requires` tutarlı); `Tenant_copy_merge_adds_transition_buttons` (eski sürümün kopyası → birleştirme sonrası üç yeni bileşen var; `SystemPageEndpoints.cs:41-53` birleştirme yolu); Vitest: Draft seçili satırda "Onayla" görünür, Open'da "Onayı geri al".
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SalesSystemPagesTests|FullyQualifiedName~SalesCardStandardsTests"` ve `npx vitest run src/system-pages/salesOrdersStandard` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(satis): sipariş standartlarında durum zinciri`

### Task 9: Belgeler ve tam doğrulama

**Files:**
- Modify: `docs/phase-status.md` (alt proje 6, PR 1: doğrulanan / doğrulanmayan — canlı migration uygulanmadı)
- Modify: `docs/superpowers/specs/2026-11-21-satis-ekranlari-envanteri.md` (G-SO27 kapandı notu; 2.3 durum makinesi paragrafına yeni zincir notu)

- [ ] **Step 1:** `dotnet build AIERP.slnx` → 0 hata.
- [ ] **Step 2:** `dotnet test AIERP.slnx -m:1` (arka planda) → hepsi PASS; zaman aşımına düşen sınıfları tek başına yeniden çalıştır ve çıktıyı kaydet.
- [ ] **Step 3:** `cd frontend/erp-web; npm test; npm run build` → PASS.
- [ ] **Step 4:** Belgeleri güncelle.
- [ ] **Step 5: Commit** `docs: belge kuralları PR 1 durumu`
