# Yazılımcı ekranı ve katalog yayınlama (alt proje 2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yazılımcı Studio'da firma modülünün veri kaynaklarını ve eylemlerini formla yazar, veri kaynağını **Önizle** ile dener ve kataloğu **Sürüm yayınla** ile firmaya kurar. Danışman da tasarımcıda bu yapı taşlarını **Katalog** seçeneğiyle sayfaya bağlar.

**Architecture:** Yapı taşları Git'teki dosyalardır (`modules/<modül>/veri`, `modules/<modül>/eylemler`).

- **Yazma:** Studio dosyaları bugünkü çalışma alanı yazma ucuyla yazar (`apply-code-suggestion`, `manualEdit`).
- **Yayınlama:** yayın yalnızca commit edilmiş hali kullanır. Studio dosyalardan 2a paketini kurar ve Platform API'ye kullanıcının kendi belirteciyle gönderir: `POST /api/custom-pages/catalog/releases` ile oluşturur, ardından `/activate` ile etkinleştirir.
- **Önizle:** sayfa önizlemesindeki iki adımlı deseni izler. Önce doğrulanmış bir önizleme taslağı saklanır, sonra yalnızca kod ve parametre değerleriyle çalıştırılır.
- **Tasarımcı:** sorgu editörüne üçüncü bir kaynak seçeneği eklenir: SQL / ERP işlemi / **Katalog**.

**Tech Stack:** .NET 10 minimal API, EF Core, xUnit; development-studio React + TS (Vitest, jsdom).

**Spec:** `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` (§6.7, §10). Önceki plan: `docs/superpowers/plans/2026-11-25-yapi-tasi-katalogu.md` (2a: paket formatı, uçlar, güven yolu). Taban dal: `claude/yapi-tasi-katalogu-plan` (PR fkokay/Nexora#170).

## Kapsam (kurucunun kararı, kullanıcı onayı bekliyor)

**Bu planda:**
- Önizle ucu
- depo dosya formatı ve paketleyici
- Platform katalog istemcisi
- Sürüm yayınla penceresi (sürüm listesi ve önceki sürüme dönüş dahil)
- yazılımcı ekranındaki "Yapı taşları" görünümü (veri kaynağı formu ve eylem formu)
- tasarımcıda Katalog seçici
- 2a'dan kalan "ERP işlemine dayanan başvuru sayfalı tabloda çalışmıyor" kısıtının giderilmesi

**Dışarıda:**
- "Kataloğa taşı"
- eylem **Dene**
- uzantı ve bileşen formları
- yayın öncesi test ve kod incelemesi kontrolleri
- talebin kapanması ve danışmana bildirim
- talep başına dal açılması (bugünkü çalışma alanı dalı kullanılır)

## Güven yolu ve kararlar (kurucunun kararı, kullanıcı onayı bekliyor)

- **Önizle'nin kuralları:**
  - Çalıştırma isteği yalnızca `{ parameters }` taşır, hiçbir zaman SQL ya da paket içermez (§10).
  - Önce `POST /api/custom-pages/catalog/previews` çağrılır: paket doğrulanır ve `TenantCatalogPreview` satırı olarak saklanır. Bu satırlar eklemelidir ve denetim kaydı yazılır.
  - Sonra `POST /api/custom-pages/catalog/previews/{id}/items/{code}/run` çağrılır.
- **Önizle'nin sınırları:**
  - doğrulanmış TenantAdmin ister
  - firmanın okuma oturumuyla çalışır
  - en fazla **50 satır** döner
  - SQL yeniden doğrulanır
  - kullanıcı başına dakikada 120 istekle sınırlıdır (`custom-page-query` önizleme sınırıyla aynı)
- **Kim kullanabilir:** Önizle ve Sürüm yayınla 2b'deki *Yazılımcı* rolü gelene kadar yalnızca doğrulanmış TenantAdmin içindir. TenantAdmin olmayan bir iş ortağı yazılımcısı formları doldurup commit edebilir, ama önizleyemez ve yayınlayamaz.
- **Yayın kaynağı:**
  - Katalog klasörlerinde (`veri/`, `eylemler/`) commit edilmemiş değişiklik varsa yayın engellenir: "Önce değişiklikleri commit edin."
  - Paket çalışma ağacından okunur. Bu engel sayesinde ağaç, commit edilmiş halle aynıdır.
  - `sourceCommit` çalışma alanının HEAD'idir. Bu commit uzak depoya gönderilmemiş olabilir.
  - `sourceRepository` projenin depo adresidir, `sourcePath` `modules/<modül>` klasörüdür. 2a'daki gibi bunlar yalnızca kaydedilir, sunucuda doğrulanmaz.
- **Katalog kökü:** iki durumda bulunur:
  - Çalışma alanında "Modül kodu:" varsa `modules/<kod>/` kullanılır (bugünkü algılama).
  - Yoksa depoda `veri/` ya da `eylemler/` içeren **tam bir** `modules/<x>/` klasörü aranır.

  Kök yoksa ya da birden fazla aday varsa "Yapı taşları" görünümü açılmaz.
- **Tek katalog:** firmanın tek bir kataloğu vardır. Yayın penceresi, etkin sürüm başka bir `sourcePath`'ten geliyorsa açıkça uyarır: "Etkin katalog `<yol>` klasöründen; bu yayın onun yerini alır."
- **Kolon tipleri:** Önizle'nin döndürdüğü `ReportColumn.DataType` değerleri katalog tiplerine şöyle eşlenir:
  - `number` → `int`
  - `decimal` → `decimal`
  - `date` → `date`
  - `boolean` → `bool`
  - diğerleri → `text`

  `guid` tipi yazılımcı tarafından elle seçilir.

## Global Constraints

- **Ekran tasarımı:** `docs/design-proposals/studio-sadelestirme/06-yazilimci-ekrani.html` (taslak 06).
  - Solda yapı taşı türlerine göre gruplanmış bir ağaç bulunur: Veri kaynakları / Eylemler, her grupta "+ Yeni".
  - Sağda bir form bulunur: görünen ad, kod, SQL editörü, **Önizle**, algılanan kolonlar tablosu (yeni kolon "yeni" etiketiyle) ve sonuç önizlemesi.
  - Üstte "Sürüm yayınla" düğmesi bulunur.
  - Taslakta olmayan öğeler kullanıcı onayı olmadan eklenmez (bkz. Onay listesi).
- **Depo dosya formatı:**
  - Veri kaynağı: `modules/<modül>/veri/<kod>.json`. SQL'e dayanıyorsa `"source": { "sql": "<kod>.sql" }` ve kardeş dosya `veri/<kod>.sql`.
  - Eylem: `modules/<modül>/eylemler/<kod>.json`, SQL'e dayanıyorsa `eylemler/<kod>.sql`.
  - Depodaki `source.sql` / `run.sql` değeri **her zaman** eğik çizgi içermeyen bir kardeş dosya adıdır ve `<kod>.sql` olmak zorundadır. Paketleyici bu dosyanın içeriğini pakete gömer. Değerin biçiminden çıkarım yapılmaz.
  - JSON'un geri kalanı 2a paket öğesiyle birebir aynıdır (`code, label, parameters, columns, opens` / `kind, target, confirm`).
- **Paket:** 2a formatı (`schemaVersion: 1`) değişmez. Doğrulamanın yetkilisi sunucudur. Studio, sunucunun hata metnini olduğu gibi gösterir.
- **Parametre adları** birebir karşılaştırılır (Ordinal, 2a kararı). ERP işlemine dayanan öğeler parametrelerini işlem kataloğundan alır.
- **Görünürlük:** tasarımcıda TenantAdmin olmayan kullanıcıya SQL'e dayanan veri kaynakları ve eylemler "Yalnızca firma yöneticisi bağlayabilir" notuyla pasif gösterilir (2a R10 kapısı). `invalidItems` gösterilmez.
- **Dil:** bütün kullanıcı metinleri Türkçedir. Danışman panelinde teknik terim kullanılmaz (§3 anti-hedef): kod adı yerine görünen ad, "SQL" yerine "Katalog".

## Review Focus

1. **JSON yazılır ama `.sql` yazılamaz** (lisans hatası 409 `license.source_code_required`, ya da eski sha). Form "Kaydedilemedi: …" gösterir ve iki dosyayı da yarım bırakmaz: önce SQL yazılır, JSON ancak SQL yazıldıysa yazılır. Test: Görev 4.
2. **Commit edilmemiş katalog değişikliği varken Sürüm yayınla'ya basılır.** Pencere hiçbir istek göndermeden "Önce değişiklikleri commit edin" der. Test: Görev 3.
3. **Etkinleştirme kırılma raporu döner** (409 `pages`). Pencere sayfa adlarını ve kodları listeler. Taslak sürüm oluşmuş kalır ve "Etkinleştir" yeniden denenebilir. Test: Görev 3.
4. **Önizle'de bağlanmamış bir parametre ya da reddedilen SQL.** Formda sunucunun hata metni görünür, önizleme sonucu ve kolon tablosu değişmez. Test: Görev 1 (sunucu), Görev 4 (form).
5. **Katalogdan seçilen bir kod sonradan katalogdan kalkar.** Tasarımcı sorguyu "Katalogda bulunamadı" uyarısıyla gösterir, sorgunun kaydı yine yapılabilir ve sayfa çökmez. Test: Görev 6.

---

### Task 1: Önizleme taslağı ve 50 satırlık önizleme çalıştırması (sunucu)

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs` (`TenantCatalogRelease` yanında `TenantCatalogPreview`)
- Modify: `src/Platform/AIERP.Platform.Infrastructure/TenantDbContext.cs` (eşleme; `TenantCatalogReleases` eşlemesiyle aynı desen)
- Create: migration `AddTenantCatalogPreviews` (`--context TenantDbContext --output-dir Migrations/Tenant`)
- Modify: `src/Hosts/AIERP.Api/CustomSqlReportRunner.cs:114` (`ExecuteSingleAsync`'e `int maxRows = MaxRows` parametresi)
- Modify: `src/Hosts/AIERP.Api/Catalog/TenantCatalogEndpoints.cs` (iki uç)
- Test: `tests/IntegrationTests/TenantCatalogPreviewIntegrationTests.cs`

**Interfaces:**
- Consumes: 2a `TenantCatalogSchema.TryParse` (katı), `CustomPageQueryParameters.Build`, `ReportEndpoints.TryValidateReadOnlySql`, `CustomSqlReportRunner.ExecuteSingleAsync`, `CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync`.
- Produces:
  - Entity `TenantCatalogPreview { Guid Id; Guid TenantId; Guid CreatedByUserId; DateTimeOffset CreatedAt; string BundleJson; string BundleSha256; }`. Satırlar eklemelidir. Silme ya da temizleme bu planda yok.
  - `POST /api/custom-pages/catalog/previews`
    - İstek: `{ bundle }`
    - Yanıt: 201 `{ id }`. Paket katı doğrulamadan geçmezse 400 `{ error }`.
    - Doğrulanmış TenantAdmin ister, değilse 403.
    - Denetim kaydı: `catalog.preview.created`.
  - `POST /api/custom-pages/catalog/previews/{id:guid}/items/{code}/run`
    - İstek: `{ parameters }`
    - Yanıt: 200 `{ columns:[{ code, label, dataType }], rows, rowCount, truncated }`
    - Doğrulanmış TenantAdmin ister.
    - Önizleme satırı başka bir firmanın ya da başka bir kullanıcınınsa 404.
    - Öğe yoksa ya da bir eylemse 404 `"Önizlenecek veri kaynağı bulunamadı."`
    - ERP işlemine dayanan öğe 400 `"ERP işlemine dayanan veri kaynağı önizlenmez; sonuç kolonları işlem kataloğundan gelir."`
    - Parametre hatası 400. SQL bugünkü kurallarla yeniden doğrulanır, geçmezse 400 `InvalidStoredSqlError`. Bu iki durumda bağlantı açılmaz.
    - `maxRows: 50` ile çalıştırılır.
    - Denetim kaydı: `catalog.preview.run`, resource `"{code}:rows={n}"`.
    - Hız sınırı: `custom-page-query` önizleme sınırı.

- [ ] **Step 1: Write the failing tests**
  - `Admin_stores_preview_and_runs_data_source_with_50_row_cap`. Sahte bağlantı fabrikası 60 satır döndürür; yanıtta `rowCount == 50` ve `truncated == true` beklenir. Fabrika çağrısına geçen `maxRows` değerini test yakalar.
  - `Non_admin_cannot_store_or_run_preview` (403 / 403)
  - `Run_request_carries_only_parameters`. İstek gövdesinde `sql` alanı bulunsa bile yok sayılır; çalışan SQL önizleme satırındakidir.
  - `Run_with_unbound_parameter_returns_400_without_connection`
  - `Run_of_action_or_unknown_code_returns_404`
  - `Run_of_operation_backed_item_returns_400`
  - `Other_users_preview_is_404`
  - `Invalid_bundle_returns_400_with_location`

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCatalogPreviewIntegrationTests"`
Expected: derleme hatası / FAIL

- [ ] **Step 3: Implement entity, migration, `maxRows` parameter and the two endpoints**

- [ ] **Step 4: Run tests, `has-pending-model-changes` and the catalog suites**

Run: Step 2 komutu, `dotnet ef migrations has-pending-model-changes --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext` ve `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCatalog|FullyQualifiedName~CustomPageQuery"`
Expected: PASS; "No changes"

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(katalog): saklanan önizleme taslağından 50 satırlık veri kaynağı önizlemesi"
```

---

### Task 2: Depo dosya formatı, paketleyici ve Platform katalog istemcisi (Studio)

**Files:**
- Create: `frontend/development-studio/src/studio-projects/catalog/catalogFiles.ts`
- Create: `frontend/development-studio/src/studio-projects/catalog/catalogApi.ts`
- Test: `frontend/development-studio/src/studio-projects/catalog/catalogFiles.test.ts`, `catalogApi.test.ts`

**Interfaces:**
- Produces (`catalogFiles.ts`):
  - `type CatalogFile = { path: string; content: string; sha256?: string }`
  - `type CatalogEntry = { kind: "dataSource" | "action"; code: string; jsonPath: string; sqlPath: string | null; json: Record<string, unknown>; sql: string | null }`
  - `findCatalogRoot(moduleCode: string | null, moduleDirs: string[], dirsWithCatalog: string[]) -> string | null`. Dönüş değeri `modules/<x>`. Kural, "Güven yolu" bölümündeki Katalog kökü kuralıdır.
  - `readCatalogEntries(root: string, files: CatalogFile[]) -> { entries: CatalogEntry[]; errors: string[] }`
    - Dosya adı `<kod>.json` ve içindeki `code` aynı olmalı.
    - `source.sql` / `run.sql` değeri `<kod>.sql` olmalı ve dosya bulunmalı.
    - Klasörle tür uyuşmalı (`veri` → dataSource, `eylemler` → action).
    - Hata örneği: `"veri/cariler.json: SQL dosyası bulunamadı (cariler.sql)."`
  - `buildBundle(entries: CatalogEntry[]) -> object`. Çıktı 2a paketi: `{ schemaVersion:1, dataSources, actions }`. SQL içerikleri gömülür. Sıra koda göredir (ordinal).
  - `entryFiles(root: string, entry: CatalogEntry) -> CatalogFile[]`. Yazılacak dosyaları döndürür: önce SQL (varsa), sonra JSON. JSON 2 boşlukla girintilenir ve sonunda satır sonu bulunur.
  - `toCatalogColumnType(dataType: string) -> "text"|"int"|"decimal"|"date"|"bool"`. Eşleme "Güven yolu" bölümündeki tablodur.
- Produces (`catalogApi.ts`; `api()` ile, göreli `/api/...` yolları, `src/api.ts`):
  - `listReleases(token)`
  - `activeCatalog(token)`
  - `createRelease(token, { version, bundle, sourceRepository, sourceCommit, sourcePath })`
  - `activateRelease(token, id, expectedActiveReleaseId)`
  - `storePreview(token, bundle) -> { id }`
  - `runPreview(token, id, code, parameters) -> PreviewResult`
  - Hata tipi `CatalogApiError { status: number; message: string; pages?: { code: string; name: string; references: string[] }[] }`. 409 kırılma yanıtındaki `pages` alanı korunur.

- [ ] **Step 1: Write the failing tests**
  - `findCatalogRoot_prefers_module_code_then_single_candidate_else_null` (iki aday → `null`)
  - `readCatalogEntries_inlines_sibling_sql_and_reports_missing_file`
  - `readCatalogEntries_rejects_code_filename_mismatch_and_sql_path_with_slash`
  - `buildBundle_matches_2a_shape_sorted_by_code`. Beklenen nesne birebir karşılaştırılır.
  - `entryFiles_writes_sql_before_json`
  - `toCatalogColumnType_maps_report_types`
  - `activateRelease_preserves_breaking_pages_on_409` (`api` sahte)
  - `runPreview_sends_only_parameters`

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend/development-studio && npx vitest run src/studio-projects/catalog`
Expected: FAIL (modül yok)

- [ ] **Step 3: Implement both modules**

- [ ] **Step 4: Run to verify they pass**

Run: Step 2 komutu. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/development-studio/src/studio-projects/catalog
git commit -m "feat(studio): katalog dosya formatı, paketleyici ve Platform katalog istemcisi"
```

---

### Task 3: Sürüm yayınla penceresi (sürüm listesi ve önceki sürüme dönüş)

**Files:**
- Create: `frontend/development-studio/src/studio-projects/catalog/CatalogReleaseDialog.tsx`
- Test: `frontend/development-studio/src/studio-projects/catalog/CatalogReleaseDialog.test.tsx` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: Task 2'nin bütün fonksiyonları. `Dialog` (`src/ui/Dialog.tsx`), `confirmDialog`.
- Produces:
  - `CatalogReleaseDialog` bileşeni. Props:
    - `token`, `root`, `files: CatalogFile[]`
    - `hasUncommittedCatalogChanges: boolean`, `headCommitSha: string | null`
    - `repositoryUrl: string | null`, `isTenantAdmin: boolean`
    - `onClose`
  - Akış:
    1. TenantAdmin değilse "Yalnızca firma yöneticisi yayınlayabilir." gösterilir, düğme pasiftir.
    2. Commit edilmemiş değişiklik varsa "Önce değişiklikleri commit edin." gösterilir ve hiçbir istek gönderilmez.
    3. `readCatalogEntries` hata verirse hatalar listelenir.
    4. Sürüm alanında son sürümün yama numarası bir artırılmış olarak gelir (`1.2.3` → `1.2.4`; sürüm yoksa `1.0.0`). Kullanıcı değiştirebilir.
    5. "Taslak oluştur" `createRelease` çağırır. Hata gelirse metni olduğu gibi gösterir.
    6. "Etkinleştir" `activateRelease(id, activeCatalog.releaseId)` çağırır. 409 `pages` gelirse "Bu sayfalar etkilenir" altında `name (code): references` listelenir. Taslak kalır ve yeniden denenebilir.
    7. Etkin katalogun `sourcePath` değeri farklıysa, "Tek katalog" kuralındaki uyarı ilk adımda gösterilir.
  - Alt bölüm "Sürümler": `listReleases` sonucu (sürüm, durum, commit'in ilk 7 karakteri, tarih). `Superseded` satırlarında "Bu sürüme dön" bulunur. `confirmDialog` onayından sonra `activateRelease` çağrılır.

- [ ] **Step 1: Write the failing tests** (`api` modülü `vi.mock` ile)
  - `uncommitted_changes_block_without_requests` (Review Focus 2)
  - `non_admin_sees_notice_and_disabled_publish`
  - `suggests_next_patch_version`
  - `create_then_activate_happy_path`
  - `activation_conflict_lists_affected_pages_and_keeps_draft` (Review Focus 3)
  - `warns_when_active_catalog_comes_from_other_path`
  - `rollback_confirms_then_activates_superseded`

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend/development-studio && npx vitest run src/studio-projects/catalog/CatalogReleaseDialog`
Expected: FAIL

- [ ] **Step 3: Implement the dialog following `ProjectCreateDialog.tsx` patterns**

Desen: `sp-dialog`, `sp-form`, `ns-field`, `ns-btn`, hata için `alert`.

- [ ] **Step 4: Run to verify they pass**

Run: Step 2 komutu. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/development-studio/src/studio-projects/catalog
git commit -m "feat(studio): katalog sürüm yayınla penceresi, sürüm listesi ve önceki sürüme dönüş"
```

---

### Task 4: Yapı taşları görünümü: ağaç, veri kaynağı formu, Önizle, eylem formu

**Files:**
- Create: `frontend/development-studio/src/studio-projects/catalog/CatalogWorkbench.tsx`, `DataSourceForm.tsx`, `ActionForm.tsx`, `catalog-workbench.css`
- Modify: `frontend/development-studio/src/StudioProjects.tsx`. Değişecek yerler:
  - Çalışma alanı dosya görünümünün yanına "Yapı taşları | Dosyalar" geçişi eklenir. Geçiş yalnızca `findCatalogRoot` bir kök döndürürse görünür.
  - Katalog dosyaları `…/files` (`nextOffset` ile sayfalı) ve `…/file-content` ile yüklenir.
  - Commit edilmemiş katalog değişikliği bilgisi `loadWorkspaceChanges` ile alınır.
  - `CatalogReleaseDialog` açılır.
- Test: `frontend/development-studio/src/studio-projects/catalog/CatalogWorkbench.test.tsx`, `DataSourceForm.test.tsx` (jsdom)

**Interfaces:**
- Consumes: Task 2 (`readCatalogEntries`, `entryFiles`, `buildBundle`, `toCatalogColumnType`, `storePreview`, `runPreview`), Task 3 dialog. Dosya yazma: `POST …/apply-code-suggestion` `{ filePath, expectedSha256, proposedContent, approvalConfirmed:true, createNewFile, manualEdit:true }`; StudioProjects `saveManualFile` ile aynı yol ve `confirmDialog` onayı.
- Produces:
  - `CatalogWorkbench`. Props: `{ root, entries, errors, canEdit, isTenantAdmin, token, writeFiles(files: CatalogFile[]) -> Promise<void>, onPublish() }`.
  - **Ağaç (taslak 06):**
    - "Veri kaynakları + Yeni" ve "Eylemler + Yeni" grupları.
    - Altta "Dosyalar" listesi (yollar).
    - Değişmiş öğede turuncu nokta.
  - **`DataSourceForm`:**
    - Alanlar: görünen ad, kod (yalnızca yeni öğede düzenlenebilir), kaynak (SQL / ERP işlemi açılır listesi).
    - SQL seçiliyse SQL editörü (`WorkspaceCodeEditor`). ERP işlemi seçiliyse işlem seçici (`loadErpOperations`).
    - Parametre tablosu (ad, tip) ve kolon tablosu (kod, görünen ad, tip, anahtar).
    - **Önizle:** formun o anki hali paketlenir, `storePreview` ve ardından `runPreview` çağrılır. Parametre değerleri formdaki "Deneme değeri" sütunundan gelir.
    - Önizleme sonucu ilk 50 satırlık bir tabloda gösterilir.
    - Sonuçta olup kolon tablosunda olmayan kolonlar "yeni" etiketiyle eklenir; tipleri `toCatalogColumnType` ile belirlenir.
    - Kaydet: `entryFiles` ile önce SQL, sonra JSON yazılır. SQL yazılamazsa JSON yazılmaz ve "Kaydedilemedi: <sunucu metni>" gösterilir (Review Focus 1).
  - **`ActionForm`:**
    - Alanlar: görünen ad, kod, tür (Ekle/Güncelle/Sil), hedef (Satır / Sayfa), kaynak (SQL / ERP işlemi), parametreler, onay metni.
    - Dene düğmesi **yok** (kapsam dışı).

- [ ] **Step 1: Write the failing tests**
  - `tree_groups_entries_and_shows_files`
  - `new_data_source_save_writes_sql_then_json`
  - `json_not_written_when_sql_write_fails` (Review Focus 1)
  - `preview_detects_new_columns_with_mapped_types`
  - `preview_error_keeps_columns_and_shows_server_message` (Review Focus 4)
  - `non_admin_preview_button_disabled_with_notice`
  - `action_form_has_no_try_button_and_writes_files`

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend/development-studio && npx vitest run src/studio-projects/catalog`
Expected: FAIL

- [ ] **Step 3: Implement components and the StudioProjects wiring**

StudioProjects'e yalnızca bağlantı kodu eklenir; mantık `catalog/` altında durur.

- [ ] **Step 4: Run the Studio checks**

Run: `cd frontend/development-studio && npm test && npm run build`
Expected: PASS, tip hatası yok

- [ ] **Step 5: Commit**

```bash
git add frontend/development-studio/src
git commit -m "feat(studio): yazılımcı ekranında yapı taşları, veri kaynağı ve eylem formları, Önizle"
```

---

### Task 5: ERP işlemine dayanan başvurular işlem kurallarına girer (sunucu, 2a kısıtı)

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`. Değişecek yer: başvuru kaydı (2a'da `Operation = null` yapılan yer, `ValidateCatalogReference` çevresi), ayrıca sayfalı tablo / `OperationColumns` / bodyMap kurallarının `query.Operation` okuduğu yerler.
- Test: `tests/IntegrationTests/CustomPageCatalogReferenceSchemaTests.cs`

**Interfaces:**
- Consumes: 2a `CatalogItem.ErpOperation`.
- Produces: doğrulama bağlamında ERP işlemine dayanan bir başvuru, bileşen kuralları için `Operation = item.ErpOperation` taşır. Bu kurallar sunucu sayfalaması, sonuç kolonu denetimi, bodyMap ve calc kurallarıdır. Başvuru yine de `OperationNames` listesine **girmez** ve başka bir sorgunun kaynak okuma şartını karşılamaz. Bu iki kural 2a'nın güvenlik ve tutarlılık kararıdır.

- [ ] **Step 1: Write the failing tests**
  - `Operation_backed_reference_drives_server_paged_table`. `paging: "server"` olan bir tablo, `cari.listele`'ye dayanan katalog başvurusuyla geçerlidir.
  - `Operation_backed_reference_columns_are_checked_against_operation_result`. Var olmayan bir kolon kodu reddedilir.
  - `Operation_backed_reference_does_not_satisfy_source_read`. 2a davranışı korunur.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPageCatalogReferenceSchemaTests"`
Expected: ilk iki test FAIL

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run catalog, custom-page and system-page suites**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~SystemPage|FullyQualifiedName~TenantCatalog"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Hosts/AIERP.Api tests/IntegrationTests
git commit -m "fix(katalog): ERP işlemine dayanan başvuru sayfalama ve kolon kurallarına girer"
```

---

### Task 6: Tasarımcıda Katalog seçici ve belgeler

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/QueriesPanel.tsx`:
  - kaynak geçişi `:215-221`: üçüncü `pd-segment` "Katalog"
  - `QueryDetailProps`: katalog listesi
  - salt okunur dal `:382`: artık seçici ve parametre bağlamaları gösterir
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx:1315` (`loadErpOperations` yanında `GET /api/custom-pages/catalog`, `request` ile)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/QueryEditorDialog.tsx` (katalog listesini `QueryEditorEnv` ile geçir)
- Test: `frontend/development-studio/src/platform-tools/erp-src/catalogReference.test.ts` (genişlet)
- Modify: `docs/architecture.md` (katalog bölümü: Önizle, yayın akışı), `docs/phase-status.md` (2c: doğrulanan / doğrulanmayan)

**Interfaces:**
- Consumes: 2a `GET /api/custom-pages/catalog` yanıtı (`dataSources`/`actions`, `source`, `erpOperation?`, `parameters`, `columns`, `invalidItems`).
- Produces:
  - **Liste:** "Katalog" seçilince sorgunun türüne uyan öğeler görünen adlarıyla listelenir. Okuma sorgusuna veri kaynakları, yazma sorgusuna eylemler gelir.
  - **Seçim:** öğe seçilince sorgu `{ dataSource|action: code, kind }` alır, `sql`/`operation` silinir. Parametre satırları öğeden gelir:
    - SQL'e dayanan öğede `item.parameters`, bağlama boş
    - ERP işlemine dayanan öğede işlem parametreleri
  - **Bağlama:** var olan bağlama editörüyle yapılır (`BindingInput`).
  - **Pasif öğeler:** TenantAdmin olmayan kullanıcıya SQL'e dayanan öğeler ve eylemler pasif, "Yalnızca firma yöneticisi bağlayabilir" notuyla gösterilir.
  - **Bulunamayan kod:** "Katalogda bulunamadı: <ad ya da kod>" uyarısı gösterilir, sorgu korunur (Review Focus 5).
  - **Kaynak değişimi:** SQL / ERP işlemine dönüldüğünde katalog anahtarı silinir.

- [ ] **Step 1: Write the failing tests**
  - `catalog_segment_lists_items_matching_query_kind`
  - `picking_item_sets_reference_and_parameters_and_clears_sql`
  - `non_admin_sees_sql_backed_items_disabled`
  - `missing_code_shows_warning_and_keeps_query` (Review Focus 5)
  - `switching_back_to_sql_removes_reference`

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend/development-studio && npx vitest run src/platform-tools/erp-src/catalogReference`
Expected: FAIL

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run all Studio checks**

Run: `cd frontend/development-studio && npm test && npm run build`
Expected: PASS

- [ ] **Step 5: Update docs and commit**

`docs/phase-status.md`'de yalnızca gerçekten çalıştırılan testler yazılır. Canlı firmada deneme, SQL Server kabul testi ve Studio ile Platform arasındaki uçtan uca akış (gerçek çalışma alanı + gerçek API) **doğrulanmadı** olarak yazılır.

```bash
git add frontend/development-studio/src docs/architecture.md docs/phase-status.md
git commit -m "feat(studio): tasarımcıda Katalog seçici; belgeler"
```

---

## Onay listesi (yürütmeden önce kullanıcıdan alınacak; ekran tasarımı onayı kuralı)

**Taslak 06'da olmayıp bu planın eklediği öğeler:**
1. Çalışma alanında "Yapı taşları | Dosyalar" geçişi: yapı taşları görünümünün nerede açılacağı.
2. Sürüm yayınla penceresindeki "Sürümler" listesi ve "Bu sürüme dön" düğmesi.
3. Etkinleştirme kırılma raporunun pencerede gösterilişi (etkilenen sayfalar listesi).
4. Veri kaynağı formundaki parametre tablosu ve "Deneme değeri" sütunu.
5. Tasarımcının bugünkü sorgu editöründe üçüncü kaynak seçeneği "Katalog". Yeni panel 3. alt projede gelecek, bu seçenek eski editöre ekleniyor.

**Taslak 06'da olup bu planın çıkardığı öğeler:**
1. Talep şeridi ve "Talebe yanıt yaz"
2. "Deneme ortamında aç"
3. Uzantılar ve Bileşenler grupları
4. Lojistik uzantısı "Dene"
5. Yayın öncesi test, deneme ve kod incelemesi adımları
6. Talebin kapanması ve danışmana bildirim
