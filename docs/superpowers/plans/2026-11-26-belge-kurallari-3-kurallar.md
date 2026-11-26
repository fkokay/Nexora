# Belge kuralları PR 3: Danışman kuralları ve Kurallar ekranı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Danışman, satış siparişinin **Onayla** geçişine cümle kurallar bağlar: *Eğer [alan] [işleç] [değer] ise [Onay iste / Uyar ama devam et / Engelle]* ya da *Her zaman […]*.
- Kurallar taslakta durur, Yayınla ile geçerli olur, sürüm geçmişi tutulur. Studio'da Dene ile hiçbir kayıt değişmeden denenir.
- Onay isteyen kural siparişi **Onay bekliyor**'a alır. Kuraldaki kişilerden biri onaylar ya da gerekçeyle reddeder.

**Architecture:**
- Kurallar tenant veritabanında, sürümlü bir kural kümesi satırında durur: `TenantDocumentRuleSets`.
- Saf bir değerlendirici (Application) olguları kurallara uygular.
- Onay için bugünkü iş akışı motoru kullanılır (yaklaşım A):
  - adım kişi listesi taşır;
  - sistemin yönettiği tek bir tanım vardır;
  - karar uç noktasında bir `SalesOrder` dalı olur;
  - elle başlatma engellenir.
- Studio'da Kurallar bölümüne "Belge kuralları" sekmesi eklenir (taslak 10).

**Tech Stack:** .NET 10, EF Core (Platform + Tenant migration), xUnit; React + Vitest (erp-web, development-studio).

**Spec:** `docs/superpowers/specs/2026-11-25-belge-kurallari-design.md` (§3 karar 2 ve 5, §5.5 Kurallar ekranı, §5.2 model sırası, §7). Onaylı taslak: `docs/design-proposals/studio-sadelestirme/10-kurallar-ekrani.html`.

**Dal:** `claude/belge-kurallari-3-kurallar`. PR 2'nin (#182) üstündedir; PR, #182 dalına karşı açılır.

## Global Constraints

- Tenant kapsamı yalnız `tenant_id` talebinden gelir. Yeni her uç izin kataloğuna girer. API yazıları denetime (audit) yazılır.
- Migration: Platform ve Tenant ayrı ayrı. Yalnız yeni tablo eklenir, mevcut kolonlar değişmez. Canlıya yedek, prova ve CHECKDB ile uygulanır.
- İşlem günlüğü (`TenantDocumentActivities`) yalnız eklenir. Kural sonuçları `Source = "rule"` ile yazılır.
- Kural yoksa ya da hiçbiri onay istemezse davranış PR 1'deki gibidir: kaydeden onaylar.
- Kendi kaydını onaylama engeli: Onayla'ya basan kişi listede olsa ve rolü eşleşse bile karar veremez. TenantAdmin'in rol atlatması bu akışta geçmez.
- Paralel .NET testleri zaman aşımına düşebilir; düşen sınıflar tek başına yeniden koşulur.

## Kararlar (plan onayıyla kesinleşir)

1. **Saklama: kural kümesi.**
   - Spec §5.5 "her kuralın kodu, belgesi, geçişi, sırası… sürüm ve taslak/yayın" der.
   - Kurallar birlikte yayımlandığı için sürüm, kural başına değil **küme** başınadır.
   - Tablo: `TenantDocumentRuleSets(Id, TenantId, Document, Transition, Version, Status Draft|Published|Archived, RulesJson, CreatedByUserId, CreatedAt, PublishedByUserId?, PublishedAt?, RowVersion)`.
   - `(TenantId, Document, Transition)` başına tek Published ve tek Draft olur (filtreli benzersiz indeks).
   - Bu düzen bugünkü iş akışı ve iş kuralı sürümlemesinin aynısıdır.
   - Her kural JSON'da şunları taşır: `code`, `order`, `enabled`, `always`, `field`, `op`, `value`, `action`, `approverUserIds`, `message`.
2. **Alanlar ve işleçler.**
   - Alanlar §5.5'teki 11 alandır: `grandTotal`, `subtotal`, `discountTotal`, `lineCount`, `maxLineDiscount`, `customer`, `customerGroup`, `currency`, `salesperson`, `orderDate`, `deliveryDate`.
   - İşleçler bugünkü iş kuralı motorununkilerdir. Alan türüne uymayan işleç reddedilir.
   - Kümede en çok 20 kural olur. Onay kuralında 1–5 kişi seçilir; Uyar ve Engelle'de mesaj 1–200 karakterdir.
3. **Onay iş akışı.**
   - `TenantWorkflowStep`'e isteğe bağlı `ApproverUserIds` eklenir.
   - Kişi listeli adımda kararı yalnız listedeki, başlatan dışındaki kişi verir. Rol ve admin atlatması uygulanmaz.
   - Tutan her onay kuralı bir adım olur, kural sırasıyla. Tek akışta birleşirler.
   - Tanım: tenant başına, ilk gerektiğinde oluşturulan `sys.satis-siparisi-onayi` (Published). `sys.` önekli tanımlar düzenlenemez, taslağa alınamaz ve elle başlatılamaz.
   - `SubjectType "SalesOrder"` elle başlatılamaz (`CustomFormSubmission` emsali).
4. **Onayla'nın sırası** (§5.2):
   - çekirdek kontroller → yayımlı kurallar → (Engelle varsa 409 + nedeni)
   - → (Uyar varsa ve istekte `acknowledgeWarnings` yoksa 409 `needsConfirmation` + uyarılar)
   - → onay kuralı varsa `PendingApproval` + iş akışı örneği; yoksa `Open`
   - Her adım işlem günlüğüne yazılır: `rule/blocked|warned|waiting`.
5. **Karar.**
   - `POST /api/workflows/instances/{id}/decision` içinde `SalesOrder` dalı vardır: sipariş UPDLOCK ile kilitlenir ve `PendingApproval` olmalıdır.
   - Son adım onaylanınca sipariş `Open` olur. Reddedilince gerekçeyle `Draft`'a döner.
   - İkisi de işlem günlüğüne ve denetime yazılır.
6. **İptal.** `PendingApproval` sipariş de iptal edilebilir. İptalde bekleyen örnek `Cancelled` olur.
7. **Dene.**
   - Uç: `POST /api/document-rules/satis.siparis/onayla/try`.
   - Gövde: `{ orderId? , facts? , actorUserId? }`.
   - Çekirdek kontrolleri ve **taslak** kümeyi yazmadan çalıştırır, adımları ve sonucu döndürür. Hiçbir tabloya satır eklenmez (test edilir).
8. **Yetki.**
   - Yeni izin kaynağı `erp.document-rules`:
     - okuma: `read`
     - taslak yazma ve yayın: `update`
     - Dene: `execute`
   - TenantAdmin her zaman yazar. TenantDeveloper için temel Allow kuralları eklenir (PR #169'daki temel kural düzeneği).
   - Danışman (TenantUser) yöneticinin Allow kuralıyla yazar.
   - Spec "Danışman ve Yazılımcı rollerine açık" der. Ancak ERP API Studio rolünü görmez, katalog yolunda da aynı sınır kabul edilmişti. Bu yüzden danışman için açık izin gerekir. **Bu sizin onayınızı isteyen tek sapmadır.**
9. **Kişi seçici.** `GET /api/document-rules/people`, `erp.document-rules.read` iznine açıktır ve tenant'ın aktif üyelerini döner: `id`, `displayName`, `email`, `role`. Kuraldaki kişiler kayıtta üyelikle doğrulanır.
10. **ERP ekranları.**
    - Belge kalıbı ve eski sipariş ekranı "Onay bekliyor · karar: X veya Y" gösterir.
    - Kuraldaki kişiye **Onayla** ve **Reddet** düğmeleri görünür. Belge görünümüne `approval { instanceId, approvers, canDecide }` eklenir.
    - Uyarı gelirse onay penceresi açılır, onaylanırsa istek `acknowledgeWarnings: true` ile yinelenir.

## Review Focus

1. Liste dışı kişinin ya da kaydedenin karar vermesi (rolü TenantAdmin olsa da) reddedilir.
2. Yayımlanmamış (taslak) kurallar Onayla'yı etkilemez; Dene yalnız taslağı kullanır ve hiçbir şey yazmaz.
3. Elle "SalesOrder" iş akışı ve `sys.` tanımının düzenlenmesi reddedilir.
4. Red sonrası Taslak; iptalde bekleyen akış kapanır; aynı `requestId` ikinci Onayla'yı yinelemez.
5. Başka tenant'ın kuralları, kişileri ve siparişleri görünmez. Kuraldaki kişi başka tenant'ın kullanıcısı olamaz.

---

### Task 1: Kural kümesi tablosu ve şeması

**Files:**
- Domain: `Entities.cs` (`TenantDocumentRuleSet`)
- Infrastructure: `DocumentRuleSetEntityConfiguration.cs`; base DbSet; migration `AddDocumentRuleSets` (Platform + Tenant)
- Application: `DocumentRuleSchema.cs`
  - `DocumentRule` record
  - `Validate(json, out error)`
  - `FieldsOf("satis.siparis.onayla")`
- Test: `tests/UnitTests/.../DocumentRuleSchemaTests.cs`

- [ ] Testler:
  - geçerli küme kabul edilir
  - bilinmeyen alan reddedilir
  - türe uymayan işleç reddedilir
  - kişisiz onay reddedilir
  - 6 kişi reddedilir
  - boş ya da 201 karakterlik mesaj reddedilir
  - 21 kural reddedilir
  - yinelenen kod reddedilir
- [ ] `has-pending-model-changes` iki bağlamda temiz.
- [ ] Commit: `feat(satis): belge kuralı kümesi tablosu ve şeması`

### Task 2: Değerlendirici ve olgular

**Files:**
- Application: `DocumentRuleEvaluator.cs`
  - `Evaluate(IReadOnlyList<DocumentRule> rules, IReadOnlyDictionary<string, object?> facts)` → `DocumentRuleOutcome(Blocks, Approvals, Warnings)`. Her biri kural sırasıyla, yalnız `enabled` kurallar.
- API: `SalesOrderRuleFacts.cs` → `BuildAsync(db, tenantId, order, ct)`
- Test:
  - `DocumentRuleEvaluatorTests` (birim)
  - `SalesOrderRuleFactsTests` (entegrasyon: en yüksek satır iskontosu, cari grubu adı, satır sayısı)

- [ ] Testler:
  - her işleç
  - Her zaman
  - kapalı kural yok sayılır
  - Engelle/Onay/Uyar ayrımı ve sıra
  - eksik olgu eşleşmez
- [ ] Commit: `feat(satis): belge kuralı değerlendiricisi`

### Task 3: Kural uçları

**Files:** `DocumentRules/DocumentRuleEndpoints.cs`, `PlatformPermissionCatalog.cs` (`erp.document-rules`, TenantDeveloper temel kuralları), `ErpOperationCatalog` gerekmez.

- **Uçlar** (`/api/document-rules/satis.siparis/onayla`):
  - `GET`: yayımlı küme, taslak ve geçmiş özeti
  - `PUT /draft`: taslak yoksa oluşturur; `expectedVersion` ister
  - `POST /publish`: önceki yayımlıyı arşivler, serileştirilebilir işlemde
  - `GET /history`
  - `POST /try`
- **Kişi listesi:** `GET /api/document-rules/people`
- **Test:** `DocumentRuleEndpointsTests`
  - taslak → yayın → geçmiş
  - eşzamanlı yayında tek Published
  - TenantUser'a izinsiz 403, Allow ile 200
  - başka tenant'ın kişisi reddedilir
  - Dene hiçbir tabloya yazmaz (öncesi/sonrası satır sayıları)
  - Dene taslağı kullanır, yayımlıyı değil
- [ ] Commit: `feat(satis): belge kuralı uçları ve Dene`

### Task 4: Onayla'ya kurallar ve onay iş akışı

**Files:**
- `TenantWorkflowSchema.cs`: `TenantWorkflowStep(Name, ApproverRole, IReadOnlyList<Guid>? ApproverUserIds = null)`; `Decide` kişi listesini uygular.
- `WorkflowEndpoints.cs`:
  - başlatma koruması
  - `sys.` koruması
  - `SalesOrder` karar dalı
  - kendi kaydını onaylama
- `SalesOrderTransitionEndpoints.cs`:
  - kural adımı
  - `acknowledgeWarnings`
  - `PendingApproval` iptali
- `SalesOrderLifecycle`: `CanCancel` `PendingApproval`'ı içerir.
- Test:
  - `SalesOrderRuleApprovalTests` (entegrasyon)
  - `SalesOrderRuleApprovalSqlAcceptanceTests`

- [ ] Testler (§7):
  - kural yokken kaydeden onaylar
  - tutar kuralı → `PendingApproval`, örnek ve adım kişileri doğru
  - Onayla'ya basan kişi listede ve rolü eşleşse de karar veremez (403/409)
  - liste dışı kişi karar veremez, TenantAdmin dahil
  - listedeki kişi onaylar → `Open`; iki onay kuralı → iki adım, sırayla
  - red (gerekçe zorunlu) → `Draft` ve günlük
  - Engelle → 409, nedeni ve `blocked` günlüğü; sipariş Taslak kalır
  - Uyar → 409 `needsConfirmation`; `acknowledgeWarnings` ile `Open`
  - elle "SalesOrder" başlatma reddedilir; `sys.` tanımı PUT/draft reddedilir
  - `PendingApproval` iptali akışı kapatır
  - taslak (yayımlanmamış) kural Onayla'yı etkilemez
  - SQL kabul: kilitli yol ve karar
- [ ] Commit: `feat(satis): onay kuralları ve sipariş onay akışı`

### Task 5: ERP ekranları

**Files:**
- `DocumentModelEndpoints.cs`: belge görünümüne `approval`
- `DocumentTemplate.tsx`, `documentApi.ts`
- `SalesPage.tsx`: durum metni, Onayla/Reddet, uyarı onayı
- Testler: `DocumentTemplate.test.tsx`, `salesDocuments.test.tsx`

- [ ] Testler:
  - Onay bekliyor rozeti ve "karar: X veya Y"
  - karar verebilen kişiye Onayla/Reddet; Reddet gerekçe ister
  - uyarı yanıtında pencere açılır, onaylanınca `acknowledgeWarnings` ile yinelenir
  - Engelle mesajı görünür
- [ ] Commit: `feat(erp): onay bekleyen sipariş ve kural uyarıları`

### Task 6: Studio Kurallar ekranı (taslak 10)

**Files:**
- `shell/shellRoute.ts`: `rules` sekmelerine `{ id: "document-rules", toolId: "document-rules" }`, etiket "Belge kuralları"
- `NativePlatformTool.tsx`
- yeni `platform-tools/document-rules/`:
  - `documentRulesClient.ts`
  - `documentRulesModel.ts` (saf: ekle, düzenle, sil, aç/kapat, sırala, cümle metni)
  - `DocumentRulesPage.tsx`: geçiş çizgisi, gri adımlar, kural satırları, cümle kurucu, kişi seçici, Dene paneli, Yayınla, Geçmiş
- Testler: `documentRulesModel.test.ts`, `DocumentRulesPage.test.tsx`, sunucu ortak fikstürü (`Fixtures/DocumentRules/`, C# doğrulaması)

- [ ] Testler:
  - kural cümlesi kurulur ve taslağa yazılır
  - kişisiz onay kaydedilmez
  - Yayınla çağrılır
  - Dene sonucu gösterilir
  - öteki geçişlerde yalnız gri adımlar
  - izin yoksa salt okunur
- [ ] Commit: `feat(studio): Kurallar ekranı`

### Task 7: Belgeler, doğrulama, inceleme, PR

- [ ] Spec §5.5'e kararlar 1, 3, 8.
- [ ] `docs/phase-status.md` ve `docs/release-migrations.md` girdileri.
- [ ] Gruplar hâlinde .NET testleri, iki ön yüz için vitest ve build, SQL kabul.
- [ ] Son inceleme (opus), düzeltme turu, PR (taban `claude/belge-kurallari-2-belge-kalibi`).
