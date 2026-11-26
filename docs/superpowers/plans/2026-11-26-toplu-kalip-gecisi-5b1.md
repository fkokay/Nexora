# Toplu kalıp geçişi, birinci kısım (5b-1): envanter, araçlar ve temiz eşlenen sayfalar — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlıdaki bütün sayfaların (firma sayfaları ve sistem standartları) kalıba geçip geçemeyeceğini **davranışı değiştirmeden** belirleyen bir sınıflandırıcı ve kuru çalıştırma raporu; geçebilen sayfaları geri alınabilir biçimde taşıyan bir araç; prova ve geri dönüş yordamı. Eşlenemeyen sayfalar bugünkü gibi çalışmaya devam eder ve raporda nedenleriyle listelenir.

**Architecture:**
- **Sunucuda saf bir sınıflandırıcı/dönüştürücü** (`PageTemplateMigration`): bir sayfa tanımını alır, hedef kalıbı (`list`, `free` ya da yok) ve nedenleri verir; dönüştürülebiliyorsa yeni tanımı ve **davranış eşdeğerliği** denetiminin sonucunu üretir. Bu sınıf hiçbir şey yazmaz.
- **Komut satırı aracı** (`AIERP.Api` ile aynı kalıp: `--legacy-tenant-data-purge-preview` / onay bayrağı): `--page-template-migration-report` (salt okunur, bütün firmalar ve standartlar), `--page-template-migration-run=<batch>` (yalnız açıkça onay bayrağıyla, firma başına), `--page-template-migration-rollback=<batch>` (bütün sayfalar ya da `--page=<kod>` tek sayfa).
- **Geri dönüş bugünkü sürüm geçmişinden gelir:** her taşınan sayfa için önce geçiş öncesi tanım bir sürüm olarak saklanır; taşıma yeni bir yayın sürümüdür. Geri dönüş, o sürümü yeniden yayınlamaktır. Sürümler hangi geçişe ait olduklarını yeni bir `MigrationBatch` alanıyla taşır.

**Tech Stack:** .NET 10 (EF Core, TenantDbContext), xUnit; frontend değişikliği yok.

**Spec:**
- `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` §7 madde 5b (dönüştürücü, kuru çalıştırma raporu, prova, geri dönüş, geçişten sonra eski dalın kaldırılması), §3 anti-hedef ("davranış değişmez, görünüş değişebilir"), §10.
- `docs/release-migrations.md` (expand → migrate → contract; yedek, prova, CHECKDB).

## Kullanıcının kararı (2026-11-26)

Araştırma, 50 sistem standardının çoğunun kalıpların desteklemediği özellikleri kullandığını gösterdi (50'sinde işlem çubuğu, 26'sında pencere, 8'inde sihirbaz adımları, 15'inde formüllü satır tablosu); serbest gövde de bunları kabul etmiyor. Kullanıcı **"Önce envanter, sonra parça parça"** yolunu seçti: bu plan envanteri, araçları ve yalnız temiz eşlenen sayfaları kapsar; kalanlar raporda listelenir, eski çizim dalı ancak hiç eski sayfa kalmayınca silinir.

## Kapsam

- **Bu planda:**
  - Sınıflandırıcı ve dönüştürücü: hedef `list` ve `free` (Kararlar 2–4).
  - Davranış eşdeğerliği denetimi (Karar 5).
  - Kuru çalıştırma raporu (JSON + Markdown), bütün firmalar ve 50 standart için, salt okunur.
  - Firma başına taşıma ve geri dönüş komutları; `MigrationBatch` sürüm alanı (expand migration).
  - Prova yordamı (runbook): yedek, geri yüklenmiş kopyada çalıştırma, davranış denetimi, geri dönüş denemesi.
- **Bu planda yok:**
  - **Canlıda çalıştırma.** Rapor canlıda salt okunur çalıştırılabilir; taşıma ve geri dönüş canlıda ancak prova raporu kullanıcıya gösterilip **ayrı onay** alındıktan sonra yapılır.
  - **Sistem standartlarının dönüştürülmesi:** standartlar repodaki JSON dosyalarıdır; rapor onları da sınıflandırır, ama dönüştürme modül modül ayrı PR'larla (standart sürümü artırılarak) yapılır.
  - **Kayıt kartı ve Belge kalıbına dönüştürme:** Kayıt kartı katalog kaynağına bağlı kayıt sorgusu ister (eski sayfalar satır içi sorgu kullanır), Belge kalıbı alt proje 6'nın modeline bağlı. Bu sayfalar raporda "kayıt kartı adayı" / "belge adayı" olarak işaretlenir.
  - **Eski çizim dalının ve eski Studio tuvalinin silinmesi:** hiç eski sayfa kalmayınca ayrı plan.
  - **Studio arayüzü:** rapor Nexora ekibi içindir; ekran değişikliği yok.

## Taban dal

- Dal: `claude/toplu-kalip-gecisi`, güncel `origin/master`'dan (`5ccca1fd`, #180 birleşik).
- Migration: Tenant (ve Platform eşi, eski DbSet nedeniyle) `TenantCustomPageRevisions.MigrationBatch` — expand, nullable, varsayılansız.

## Global Constraints

- **Davranış değişmez (§3).** Dönüştürülen bir sayfada:
  - `queries` dizisi birebir aynı kalır (derin eşitlik).
  - Bileşen kimlikleri ve adları aynı kalır; hiçbir bileşen silinmez, yalnız `layout` niteliğindeki özellikler değişir (Karar 5'teki izinli liste).
  - Bağlamalar (`{{…}}`), `visibleWhen`, `disabledWhen`, düğme eylemleri (`actionType`, `queryId`, `confirmText`, `refreshQueries`…), satır eylemleri ve yetkiler aynen kalır.
  - Denetim başarısızsa sayfa **dönüştürülmez**, raporda "eşdeğerlik denetimi başarısız: <ayrıntı>" olarak görünür.
- **Dönüştürülmeyecek durumlar** (her biri raporda Türkçe nedenle; bir sayfa birden çok neden taşıyabilir):

  | Durum | Neden metni |
  |---|---|
  | `actionBar` | `İşlem çubuğu kalıplarda yok.` |
  | `dialog` | `Pencere kalıplarda yok.` |
  | `steps` ya da `wizardParts` | `Sihirbaz adımları kalıplarda yok.` |
  | `editableGrid` | `Düzenlenebilir satır tablosu (Belge kalıbı bekleniyor).` |
  | `input`, `formCard`, `customFieldsBlock`, `form` | `Form alanları (Kayıt kartı adayı).` |
  | `tabs` (serbest gövdeye taşınamayan biçimde) | `Sekmeler bileşenlere göre bölünemiyor.` |
  | satır içi `code` (katalog bileşeni değil) | `Satır içi kod alanı kalıplarda yok.` |
  | `filterChips`, `facetPanel`, `recordHeader`, `contextPanel` (Liste dışı) | `<bileşen> bu kalıpta yok.` |
  | `widthWhen` | `Koşula bağlı genişlik kalıplarda yok.` |
  | `gridFormula`, `countWhen` dışı formül ayarları, `conditions`, `barCommands` | `<ayar> ayarı kalıplarda yok.` |
  | açık taslak var | `Sayfanın açık taslağı var; önce yayımlanmalı ya da silinmeli.` |
  | şema v1 | `Eski şema (sürüm 1); önce tasarımcıda kaydedilmeli.` |

- **Rapor:** her satır: firma (ad + kimlik kısaltması), sayfa kodu, ad, yayın/taslak, hedef (`Liste` / `Serbest` / `—`), nedenler, eşdeğerlik sonucu, değişen yerleşim özellikleri sayısı. Özet: firma başına ve toplam sayılar, en sık 10 neden. Rapor veri değeri (sorgu sonucu, SQL metni, kullanıcı verisi) **içermez**; yalnız sayfa kodu, adı ve yapı bilgisi.
- **Taşıma:** yalnız **yayınlanmış ve açık taslağı olmayan** sayfalar. Bir firma içinde tek işlem (Serializable) değil, sayfa başına işlem; her sayfa için: (1) geçiş öncesi tanımı `ChangeKind = "BeforeTemplateMigration"`, `MigrationBatch = <batch>` sürümü olarak yaz, (2) dönüştürülmüş tanımı şema + kalıp doğrulamasından (`TenantCustomPageSchema.Validate`, `PageTemplateRules`) geçir, (3) yayın sürümünü `ChangeKind = "TemplateMigrated"`, aynı batch ile yaz ve sayfayı güncelle, (4) audit (`custom-page.template-migrated`). Doğrulama başarısızsa sayfa atlanır ve raporlanır.
- **Geri dönüş:** batch'teki her sayfanın `BeforeTemplateMigration` sürümü yayın olarak geri yazılır (`ChangeKind = "TemplateMigrationRolledBack"`); sayfa bu arada yeniden değiştirildiyse (son sürüm `TemplateMigrated` değilse) atlanır ve raporlanır, `--force` yoktur.
- **Onay bayrağı:** taşıma ve geri dönüş `--confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP` olmadan çalışmaz; çalıştırmadan önce hedef veritabanlarının adları ekrana yazılır (`AIERPTenant_R9Rehearsal` gibi prova kopyaları açıkça listelenir, varsayılan hedef yoktur: `--tenants=<id,…>` zorunlu).
- **Migration** expand-only: yeni nullable kolon, eski kod onu yok sayar.
- **.NET testleri ortak kilitle sırayla** (CLAUDE.md kuralı).

## Kararlar (benim kararlarım; kullanıcı düzeltebilir)

1. **Önce veri, sonra genişletme.** Bu plan kalıpları genişletmez; raporun en sık nedenleri sonraki adımın sırasını belirler (ör. işlem çubuğu → kabukta komutlar).
2. **Liste hedefi:** tam bir `dataTable` (okuma sorgusuna bağlı); isteğe bağlı `filterBar` (en çok bir), `metric` (göstergeler), `button` (sayfa ya da satır eylemi), `contextPanel` (en çok bir, detay paneli), `heading`/`text`/`alert` (üst/alt ek alan). `actionBar`, `dialog`, `input` yok. Yerleşim: `slot` değerleri bileşen türünden; `width` silinir.
3. **Serbest hedef:** yalnız serbest gövdenin kabul ettiği türler (heading, text, label, section, alert, card, list, metric, progress, badge, image, okuma tablosu, katalog bileşeni) ve sayfa düğmeleri. Bileşenler sayfadaki sıralarıyla tek bölüme ya da (eski `section` başlıkları varsa) başlık başına bir bölüme konur; bölüm kolon sayısı eski 12'lik genişliklerden türetilir (satırdaki en çok yan yana bileşen sayısı, 1–3). `tabs` varsa ve her sekme yalnız bu türleri içeriyorsa sekmeler serbest gövdenin sekmelerine, sekme içeriği bölümlere dönüşür.
4. **İkisi de uyuyorsa** (tek tablo + göstergeler): Liste seçilir.
5. **Davranış eşdeğerliği denetimi** (`BehaviorEquivalence.Check(before, after)`): sorgular derin eşit; bileşen kimlik/ad kümesi eşit; her bileşende yalnız şu özellikler değişebilir ya da eklenebilir: `slot`, `width`, `widthWhen` (yalnız yoksa), `margin`, `padding`, `columns` (yalnız bölümde), `members`, `title` (yalnız yeni bölüm), `tabs` (yalnız sekme bileşeni ve yalnız kimlik listeleri); eklenen bileşenler yalnız `section` (bölüm) ve `tabs` olabilir. Başka her fark denetimi düşürür.
6. **Görüntü karşılaştırması** (§7 5b "üç genişlikte önce/sonra ekran görüntüleri") bu planda prova yordamında elle yapılır (runbook adımı); otomatik ekran görüntüsü sonraya.

## Review Focus

1. **Davranış farkı gizlice girer:** dönüştürücü bir düğmenin `actionType`'ını, bir sorgunun parametresini ya da `visibleWhen`'i değiştirirse eşdeğerlik denetimi sayfayı atlamalı. Test: Görev 2 (bilerek bozulmuş dönüştürme denetimi).
2. **Açık taslaklı sayfa:** kullanıcının yarım taslağı varsa sayfa taşınmaz, taslak değişmez. Test: Görev 4.
3. **Geri dönüş sonrası değişmiş sayfa:** geçişten sonra danışman sayfayı yeniden yayımladıysa geri dönüş onu ezmez, atlar. Test: Görev 4.
4. **Yanlış veritabanı:** `--tenants` verilmeden ya da onay bayrağı olmadan komut hiçbir şey yazmaz; prova kopyası adı açıkça listelenir. Test: Görev 3.
5. **Rapor veri sızdırmaz:** raporda SQL metni, sorgu sonucu ya da kullanıcı adı yoktur. Test: Görev 3.

---

## Görev 1 — migration

### Task 1: `MigrationBatch` sürüm alanı

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs` (`TenantCustomPageRevision.MigrationBatch: string?`, en çok 64)
- Modify: `TenantDbContext.cs` (ve `PlatformDbContext.cs` eşi) eşleme + `(TenantId, MigrationBatch)` dizini
- Create: migration'lar (`--context TenantDbContext --output-dir Migrations/Tenant` ve Platform), `dotnet ef migrations has-pending-model-changes` üçü için temiz
- Test: `tests/IntegrationTests/TenantCustomPageRevisionBatchTests.cs`

- [ ] **Step 1:** Failing test `Revision_stores_migration_batch`.
- [ ] **Step 2:** FAIL (kilitle).
- [ ] **Step 3:** Implement + migration'lar.
- [ ] **Step 4:** PASS; `has-pending-model-changes` üç bağlamda "değişiklik yok".
- [ ] **Step 5: Commit** — `feat(custom-pages): sayfa sürümünde geçiş partisi alanı`

## Görev 2 — sınıflandırıcı ve dönüştürücü

### Task 2: `PageTemplateMigration` ve `BehaviorEquivalence`

**Files:**
- Create: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateMigration.cs`, `BehaviorEquivalence.cs`
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/…` değil, API iç türleri için `tests/IntegrationTests/PageTemplateMigrationTests.cs` (mevcut `InternalsVisibleTo` kalıbı)

**Interfaces:**
- `record MigrationResult(string? Target, IReadOnlyList<string> Reasons, string? ConvertedJson, string? EquivalenceFailure, int LayoutChanges)`
- `PageTemplateMigration.Classify(string definitionJson, bool hasOpenDraft): MigrationResult` — `Target` `"list"`, `"free"` ya da `null`; `ConvertedJson` yalnız `Target` doluysa ve eşdeğerlik + şema + kalıp doğrulaması geçtiyse.
- `BehaviorEquivalence.Check(string before, string after): string?` — `null` eşdeğer, değilse ilk farkın Türkçe açıklaması.

- [ ] **Step 1: Write the failing tests**
  - `Simple_list_page_becomes_list_template_with_same_queries_and_ids`
  - `Dashboard_page_becomes_free_with_one_block_and_column_count_from_widths`
  - `Section_headings_split_into_blocks`
  - `Tabs_with_supported_content_become_free_tabs`
  - `Each_unsupported_feature_reports_its_reason` (tablodaki her satır için bir örnek)
  - `Open_draft_is_not_converted`
  - `Schema_v1_is_not_converted`
  - `Equivalence_rejects_changed_action_type_query_param_and_visibleWhen` (Review Focus 1)
  - `Converted_definition_passes_schema_and_template_validation`
  - `All_50_standards_classify_without_exception` (gömülü standartlar üzerinden; sonuçlar test çıktısında özet)
- [ ] **Step 2:** FAIL (kilitle, `--filter FullyQualifiedName~PageTemplateMigrationTests`).
- [ ] **Step 3:** Implement. Dönüştürücü yalnız Kararlar 2–5'i uygular; emin olmadığı her durumda `Target = null`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): kalıp geçişi sınıflandırıcısı ve davranış eşdeğerliği`

## Görev 3 — rapor

### Task 3: `--page-template-migration-report`

**Files:**
- Create: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateMigrationRunner.cs` (rapor, taşıma ve geri dönüş komutları; veritabanına `TenantDatabaseRouting` ve mevcut tenant bağlantı çözümüyle bağlanır — `LegacyTenantDataPurger` ve `--verify-separation` örnek)
- Modify: `src/Hosts/AIERP.Api/Program.cs` (yeni bayraklar, mevcut CLI dalı kalıbında, sunucu başlatmadan çıkar)
- Test: `tests/IntegrationTests/PageTemplateMigrationReportTests.cs` (InMemory iki firma)

**Interfaces:**
- `--page-template-migration-report [--tenants=<id,…>] --out=<klasör>` → `<klasör>/rapor.json`, `<klasör>/rapor.md`; `--tenants` verilmezse bütün etkin firmalar (salt okunur olduğu için izinli) + 50 standart.
- JSON biçimi: `{ generatedAt, tenants: [{ tenantId, name, pages: [{ code, name, published, target, reasons, equivalence, layoutChanges }] }], standards: [{ screenKey, version, target, reasons }], summary: { byTarget, topReasons } }`.

- [ ] **Step 1: Write the failing tests**
  - `Report_lists_every_page_with_target_and_reasons`
  - `Report_contains_no_sql_query_results_or_user_names` (Review Focus 5)
  - `Report_includes_standards_and_summary`
  - `Report_never_writes` (sayfa ve sürüm sayıları önce/sonra aynı)
- [ ] **Step 2:** FAIL (kilitle).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): kalıp geçişi kuru çalıştırma raporu`

## Görev 4 — taşıma ve geri dönüş

### Task 4: `--page-template-migration-run` ve `--page-template-migration-rollback`

**Files:**
- Modify: `PageTemplateMigrationRunner.cs`, `Program.cs`
- Test: `tests/IntegrationTests/PageTemplateMigrationRunTests.cs`

**Interfaces:**
- `--page-template-migration-run=<batch> --tenants=<id,…> --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP [--out=<klasör>]` — Global Constraints'teki taşıma adımları; çıktı: taşınan/atlanan sayfalar ve nedenleri.
- `--page-template-migration-rollback=<batch> --tenants=<id,…> [--page=<kod>] --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP`.
- `<batch>`: `^[a-z0-9-]{4,64}$`.

- [ ] **Step 1: Write the failing tests**
  - `Run_without_confirm_or_tenants_writes_nothing` (Review Focus 4)
  - `Run_migrates_published_pages_and_keeps_before_revision`
  - `Run_skips_page_with_open_draft_and_leaves_draft_untouched` (Review Focus 2)
  - `Run_is_idempotent_for_same_batch` (ikinci çalıştırma taşınmış sayfayı atlar)
  - `Rollback_restores_before_definition_as_published`
  - `Rollback_single_page`
  - `Rollback_skips_page_changed_after_migration` (Review Focus 3)
  - `Migrated_page_serves_same_queries_through_published_endpoint`
- [ ] **Step 2:** FAIL (kilitle).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): kalıp geçişi taşıma ve geri dönüş komutları`

## Görev 5 — prova yordamı ve belgeler

### Task 5: Runbook, rapor ilk çalıştırma ve belgeler

**Files:**
- Create: `docs/runbooks/page-template-migration.md` — adımlar: (1) canlıda salt okunur rapor (tek SSH çağrısı, API imajı içinde `dotnet AIERP.Api.dll --page-template-migration-report`); (2) raporun kullanıcıya gösterilmesi; (3) hedef firmaların COPY_ONLY+CHECKSUM yedeği ve RESTORE VERIFYONLY; (4) geri yüklenmiş kopyada (`AIERPTenant_<guid>_TplRehearsal`) taşıma; (5) davranış denetimi: taşınan her sayfanın yayın yanıtında sorguların aynı olduğu (Görev 4 testi) + üç genişlikte elle ekran karşılaştırması; (6) kopyada geri dönüş denemesi; (7) kullanıcı onayıyla canlıda taşıma; (8) kopyaların silinmesi.
- Modify: `docs/phase-status.md` (yeni bölüm), spec §7 madde 5b (5b-1 yolu, kullanıcı kararı, eski dalın silinmesinin koşulu).

- [ ] **Step 1:** Runbook'u yaz.
- [ ] **Step 2:** Birleşik dalda testler: `dotnet test AIERP.slnx` (kilitle; yük kaynaklı zaman aşımları tek başına yeniden).
- [ ] **Step 3:** Yerelde, InMemory değil gerçek SQL Server kullanılabiliyorsa yerel geliştirme veritabanında rapor komutunu çalıştır ve özetini belgeye yaz; kullanılamıyorsa "çalıştırılmadı" yaz.
- [ ] **Step 4: Commit** — `docs: kalıp geçişi yordamı ve durum`
