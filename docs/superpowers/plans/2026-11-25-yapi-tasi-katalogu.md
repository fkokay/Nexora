# Yapı taşı kataloğu (alt proje 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firma başına sürümlü bir yapı taşı kataloğu (veri kaynakları + eylemler) sunucuda saklanır, etkinleştirilir. Sayfalar SQL ya da işlem gömmek yerine katalogdaki koda (`dataSource` / `action`) başvurur ve ERP bu başvuruyu çalışma anında çözer.

**Architecture:** Katalog, firma veritabanında (`TenantDbContext`) eklemeli `TenantCatalogRelease` satırları olarak durur. Sürüm başına tek bir JSON paketi tutulur. Bir anda en fazla bir sürüm `Active` olur. Sayfa sorgusu yeni bir anahtar biçimi alır: `{"id","name","kind","dataSource"|"action","parameters","runOn"}`.

Çözümleme sunucuda yapılır:
- **Sayfa getirilirken:** ERP işlemine dayanan katalog öğesi, sorguda `operation: <işlem adı>` olarak yeniden yazılır. erp-web bugünkü işlem yolundan çağırır.
- **SQL'e dayanan öğe:** mevcut sorgu çalıştırma uçları kullanılır. SQL istekten değil, etkin katalog sürümünden alınır.

Studio'dan yayınlama ve yazılımcı formları bu planda **yok** (bkz. Kapsam).

**Tech Stack:** .NET 10 minimal API, EF Core (SQL Server + InMemory testler), xUnit; erp-web / development-studio React+TS (Vitest).

**Spec:** `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` (§6.7, §10, §11; alt proje 2). Taban dal: `claude/adoring-turing-618c3d` (PR fkokay/Nexora#168). Tasarım belgesi yalnızca bu dalda.

## Kapsam (bu planın bölünmesi, kurucunun kararı, kullanıcı onayı bekliyor)

§7 madde 2 aslında dört ayrı alt sistem. Modül taraması bir Studio çalışma alanından firma kurulumuna giden **hiçbir yolun bugün var olmadığını** gösterdi. `/api/platform/modules/releases` dışarıda imzalanmış WASM ZIP'i alıyor, Studio'nun sürüm penceresi ise kaynağı paketleyip deploy ediyor. Bu yüzden iş üçe bölünür:

- **2a (bu plan):**
  - dosya ve paket formatı, doğrulama
  - firma katalog deposu (taslak → etkin → önceki sürüme dönüş)
  - kurulum ve etkinleştirme uçları
  - sayfaların başvuruları ve ERP'nin çözümlemesi
  - Studio'nun bu başvuruları bozmadan kaydetmesi

  Tamamı entegrasyon testleriyle doğrulanır.
- **2c (sonraki plan):**
  - yazılımcı ekranı formları: veri kaynağı formu, **Önizle** (en fazla 50 satır), sorgudan kolon algılama
  - çalışma alanındaki `modules/<firma>/` dosyalarından paketi kurup "Sürüm yayınla" ile 2a uçlarına gönderme
  - tasarımcıda katalog seçici ve **"Kataloğa taşı"**
- **Dışarıda:** uzantılar (`uzantilar`, alt proje 6 belge kurallarıyla birlikte), yazılımcı bileşenleri ve `run: { module }` eylemleri (WASM derleme yolu bağlı değil).

## Güven yolu (güvenlik sınırı, kurucunun kararı, kullanıcı onayı bekliyor)

- **Kim çağırır:** paketi Platform API'ye kullanıcının kendi Platform belirteci gönderir. Studio bugün `/api/tenant/modules/activate` uçlarını da böyle çağırıyor (`frontend/development-studio/src/App.tsx:596`). 2a'da çağrıyı testler yapar, 2c'de Studio yapacak.
- **Kapı:** paket oluşturma ve etkinleştirme **doğrulanmış TenantAdmin** ister. Sayfaya SQL kaydetmenin kapısı da budur: `CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync`, `TenantCustomPageEndpoints.QueryPageWriteAllowedAsync` ile aynı denetim.
  - 2b'deki *Yazılımcı* rolü gelince kapı o role daraltılır. Bu kapıdan daha gevşek bir kapı hiçbir zaman kullanılmaz.
- **Köken bilgisi:** paketle gelen `sourceRepository`, `sourceCommit`, `sourcePath` **yalnızca kaydedilir, sunucuda doğrulanmaz**. Api'ye GitHub ya da ağ erişimi verilmez (CLAUDE.md sınırı).
- **SQL ne zaman doğrulanır:**
  - pakette saklanır
  - kurulumda `ReportEndpoints.TryValidateReadOnlySql` / `TryValidateWriteSql` ile doğrulanır
  - her çalıştırmada yeniden doğrulanır
  - istekten hiçbir zaman alınmaz
- **SQL'in görünürlüğü:** katalog listeleme yanıtında SQL yalnızca doğrulanmış TenantAdmin'e gösterilir. Diğer kullanıcılar `sql` alanı olmadan alır.
- **Çalıştırma kanalı:** SQL'e dayanan öğeler yalnızca mevcut uçlardan çalışır: `POST /api/custom-pages/{code}/queries/{queryId}/run` ve önizleme eşi. Böylece şunlar aynen geçerli kalır:
  - `Allows` hak denetimi
  - hız sınırları
  - denetim kaydı
  - `RunWriteAsync`'in kapalı başarısız olan yazma denetimi
- **Eylem `permission` alanı:** 2a'da **yok**, paket doğrulaması bu alanı reddeder. ERP işlemi eylemlerinde istemci gerçek ucu çağırdığı için sunucu bu alanı zorlayamaz. §10 yalnızca arayüzde uygulanan yetki denetimini yasaklıyor. Yetkiyi şunlar sağlar:
  - ERP işlemi eylemlerinde hedef ucun kendi yetkisi
  - SQL eylemlerinde sayfanın Insert/Update/Delete hakkı

## Global Constraints

- Paket formatı yalnızca eklemeli genişler. `schemaVersion: 1`, bilinmeyen anahtar reddedilir.
- Kod kuralı `^[A-Za-z_][A-Za-z0-9_]{0,63}$` (`TenantCustomPageQueries.IsValidName`). Kodlar paket içinde benzersizdir ve veri kaynakları ile eylemler arasında çakışamaz.
- Parametre tipleri SQL sorgularıyla aynıdır: `text, int, decimal, date, bool, guid` (`TenantCustomPageSchema.ParameterTypes`). Bir öğede en fazla 20 parametre olabilir.
- Sınırlar: paket JSON'u ≤ 512 KiB, ≤ 200 veri kaynağı, ≤ 200 eylem, öğe başına ≤ 64 kolon.
- Sayfa getirilirken yanıtta SQL hiçbir zaman bulunmaz (`WithoutQuerySql` sözleşmesi). Bu, katalogdan gelen SQL için de geçerlidir.
- Tenant kapsamı yalnızca `tenant_id` claim'inden gelir. Her katalog sorgusu `TenantId == tenant` ile süzülür.
- Ledger kuralı: `TenantCatalogRelease` satırları silinmez ve paketleri değişmez. Durum geçişleri yalnızca şunlardır:
  - `Draft → Active`
  - `Active → Superseded`
  - `Superseded → Active` (önceki sürüme dönüş)

  Her geçiş `AuditEvent` yazar.
- Migrationlar expand-only (`docs/release-migrations.md`).
- Yeni hata metinleri Türkçe ve kullanıcıya dönüktür.
- `dataSource` / `action` taşımayan sayfaların davranışı ve çıktısı birebir aynı kalır.

## Review Focus

1. **Eski sürümden geri yüklenen sayfa** (`POST /{id}/restore/{revisionId}`), etkin katalogda artık bulunmayan bir koda başvurabilir. Sayfa açılmalı, yalnızca o blok "Katalogda bulunamadı: X" hatası göstermeli. 500 dönmemeli, sayfa çökmemeli. Test: Görev 5.
2. **Katalogda saklı bir SQL'i bugünkü doğrulayıcı reddedebilir** (kurallar sonradan sıkılaştı). Çalıştırma 400 `InvalidStoredSqlError` dönmeli ve firma veritabanına hiç bağlanmamalı. Test: Görev 5.
3. **Danışman (TenantAdmin olmayan kullanıcı) katalog listesini ya da yayımlanmış sayfayı okuyor.** Yanıtta `sql` olmamalı. Test: Görev 4 ve 5.
4. **Kullanımdaki bir kodu kaldıran ya da değiştiren sürüm etkinleştiriliyor.** Bu durumlar sayılır: kod kaldırılmış, türü değişmiş (okuma ↔ yazma), parametre adı/tipi değişmiş ya da kaynak türü değişmiş (sql ↔ erpOperation). Etkinleştirme 409 dönmeli ve etkilenen yayımlanmış sayfaları listelemeli. Etkin sürüm değişmemeli. Test: Görev 4.
5. **Aynı firmada aynı anda iki etkinleştirme isteği gelir.** Etkin sürüm en fazla bir tane kalmalı (filtrelenmiş benzersiz indeks ve tek işlem). Test: Görev 2'de indeks, Görev 4'te ardışık iki istek.

---

### Task 1: Katalog paketi formatı ve doğrulayıcı

**Files:**
- Create: `src/Hosts/AIERP.Api/Catalog/TenantCatalogSchema.cs`
- Test: `tests/IntegrationTests/TenantCatalogSchemaTests.cs`

**Interfaces:**
- Produces:
  - `internal sealed record CatalogParameter(string Name, string Type);`
  - `internal sealed record CatalogColumn(string Code, string Label, string Type, bool Key);`
  - `internal sealed record CatalogItem(string Code, string Label, string ItemKind /* "dataSource"|"action" */, string QueryKind /* read|insert|update|delete */, string? Sql, string? ErpOperation, IReadOnlyList<CatalogParameter> Parameters, IReadOnlyList<CatalogColumn> Columns, string? Opens, string? Target /* "row"|"page"|"bulk", yalnız eylem */, string? ConfirmText);`
  - `internal sealed record CatalogBundle(IReadOnlyList<CatalogItem> Items) { CatalogItem? Find(string code); }`
  - `internal static class TenantCatalogSchema { static bool TryParse(string json, ErpOperationLookup lookup, out CatalogBundle? bundle, out string? error); }`. `ErpOperationLookup`, `TenantCustomPageSchema.Validate`'in aldığı tiptir.

**Paket JSON'u:**

```json
{ "schemaVersion": 1,
  "dataSources": [ { "code": "cariler", "label": "Cari hesaplar",
      "source": { "sql": "SELECT Kod, Unvan FROM Cari WHERE Unvan LIKE @q" },
      "parameters": [ { "name": "q", "type": "text" } ],
      "columns": [ { "code": "Kod", "label": "Cari kodu", "type": "text", "key": true } ],
      "opens": "cariKarti" } ],
  "actions": [ { "code": "pasifeAl", "label": "Pasife al", "target": "row", "kind": "update",
      "run": { "erpOperation": "cari.pasifeAl" }, "confirm": { "text": "Cari pasife alınsın mı?" } } ] }
```

**Kurallar:**
- `source` ve `run` içinde `sql` ya da `erpOperation`'dan tam olarak biri bulunur.
- Veri kaynakları her zaman `read` türündedir. Eylemin `kind` alanı `insert|update|delete` olmalıdır.
- **SQL'e dayanan öğe:**
  - SQL, `TryValidateReadOnlySql` (veri kaynağı) ya da `TryValidateWriteSql(sql, kind)` (eylem) ile doğrulanır.
  - SQL içindeki `@ad` adları bildirilen parametrelerle birebir aynı küme olmalıdır. Mevcut SQL parametre adı çıkarıcısı kullanılır: `TenantCustomPageQueries` içinde SQL sorgu doğrulamasının kullandığı fonksiyon.
- **ERP işlemine dayanan öğe:**
  - İşlem `lookup` içinde bulunmalı ve `deprecated` olmamalıdır.
  - İşlemin `pageKind` alanı öğenin türüne eşit olmalıdır.
  - `sourceOperation` ya da `bodyMap` taşıyan işlemler reddedilir. Bu sınırlama 2a'ya özgüdür; bu işlemler aynı sayfada bir kaynak sorgu gerektirir.
  - `parameters` alanı verilmez. İşlemin parametreleri kullanılır, `CatalogItem.Parameters` boş kalır.
- Kolon tipleri: `text|int|decimal|date|bool|guid`.
- `opens`: `^[a-z0-9-]{1,40}$` ya da `@` ile başlayan sistem kodu (`SystemPageCodes` deseni). Yalnızca saklanır, 2a'da kullanılmaz.
- `confirm`: `null` ya da `{ "text": 1–200 karakter }`.
- Bilinmeyen anahtar ve `permission` alanı reddedilir.
- Global Constraints'teki sınırlar uygulanır.
- Hata metni, sorunun yerini gösterir. Örnek: `"dataSources[0] (cariler): SQL parametreleri bildirilenlerle aynı değil."`

- [ ] **Step 1: Write the failing tests**

`TenantCatalogSchemaTests` içinde, `ErpOperationCatalog` kaynaklı gerçek `lookup` ile:
- `Valid_bundle_parses_items_in_order` (yukarıdaki örnek, 2 öğe; `Find("cariler")!.Sql` dolu, `Find("pasifeAl")!.ErpOperation == "cari.pasifeAl"`)
- `Rejects_unknown_key`
- `Rejects_permission_on_action`
- `Rejects_both_sql_and_operation`
- `Rejects_write_sql_in_data_source`
- `Rejects_read_kind_action`
- `Rejects_sql_parameter_mismatch` (`@q` var, parametre listesi boş)
- `Rejects_duplicate_code_across_kinds`
- `Rejects_unknown_operation`
- `Rejects_operation_with_kind_mismatch` (`cari.listele` olan bir eylem)
- `Rejects_operation_with_source_operation`. Katalogda `sourceOperation` taşıyan gerçek bir işlem seçin ve adını teste sabitleyin.
- `Rejects_oversized_bundle` (512 KiB + 1)
- `Rejects_invalid_code`

Her red testi `error` metninin öğe yerini içerdiğini doğrular.

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCatalogSchemaTests"`
Expected: derleme hatası (`TenantCatalogSchema` yok)

- [ ] **Step 3: Implement `TenantCatalogSchema.TryParse` and the records**

`JsonDocument` (MaxDepth 16) ve `TenantCustomPageSchema` içindekiyle aynı yaklaşım kullanılır: `OnlyKeys` ile katı anahtar kümeleri. Aynı yardımcı uygunsa `internal` yapılarak paylaşılır, kopyalanmaz.

- [ ] **Step 4: Run tests to verify they pass**

Run: same as Step 2. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Hosts/AIERP.Api/Catalog tests/IntegrationTests/TenantCatalogSchemaTests.cs
git commit -m "feat(katalog): yapı taşı paketi formatı ve doğrulayıcı"
```

---

### Task 2: Katalog sürümü kaydı ve migrationlar

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs` (`TenantCustomPage` yakınında)
- Modify: `src/Platform/AIERP.Platform.Infrastructure/TenantDbContext.cs` (yaklaşık `:126-160`, `TenantCustomPage` eşlemesinin yanına)
- Modify: `src/Platform/AIERP.Platform.Infrastructure/PlatformDbContext.cs`. Yalnızca `TenantCustomPage` orada da eşleniyorsa ve aynı desen gerekiyorsa değiştirilir (`:35-36`, `:2794`). Önce iki bağlamın bugün bu tabloyu neden ikisinde de tuttuğunu doğrulayın, aynı gerekçe geçerliyse ikisine de ekleyin.
- Create: migrationlar `AddTenantCatalogReleases`. Tenant için `--context TenantDbContext --output-dir Migrations/Tenant`, gerekiyorsa Platform için de.
- Test: `tests/IntegrationTests/TenantCatalogReleaseModelTests.cs`

**Interfaces:**
- Produces:

```csharp
public sealed class TenantCatalogRelease
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Version { get; set; } = "";            // SemVer, ≤ 32
    public string Status { get; set; } = "Draft";        // Draft | Active | Superseded
    public string BundleJson { get; set; } = "";         // nvarchar(max), değişmez
    public string BundleSha256 { get; set; } = "";       // 64 hex
    public string? SourceRepository { get; set; }        // ≤ 400, yalnız kayıt
    public string? SourceCommit { get; set; }            // ≤ 64
    public string? SourcePath { get; set; }              // ≤ 200
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? ActivatedByUserId { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];         // rowversion
}
```

**İndeksler:**
- benzersiz `(TenantId, Version)`
- filtrelenmiş benzersiz `IX_TenantCatalogReleases_Active`: `(TenantId)`, koşul `[Status] = 'Active'`. Filtre sözdizimi `IX_TenantCustomPages_Published` ile aynı olmalı.

- [ ] **Step 1: Write the failing test**

`Model_maps_catalog_release_with_active_filter_index`: `TenantDbContext` modelinden entity tipini alıp şunları doğrular:
- benzersiz `(TenantId, Version)` indeksi
- `IX_TenantCatalogReleases_Active` filtresi `[Status] = 'Active'`
- `RowVersion` alanının concurrency token olması

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCatalogReleaseModelTests"`
Expected: derleme hatası

- [ ] **Step 3: Add entity, mappings and migrations**

```bash
dotnet tool restore
dotnet ef migrations add AddTenantCatalogReleases --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext --output-dir Migrations/Tenant
```

Platform bağlamı gerekiyorsa aynı adla bir migration da onun için oluşturulur. Ardından iki bağlam için `has-pending-model-changes` çalıştırılır.

- [ ] **Step 4: Run test and the pending-model check**

Run: Step 2 komutu, ardından `dotnet ef migrations has-pending-model-changes --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext`
Expected: PASS; "No changes"

- [ ] **Step 5: Commit**

```bash
git add src/Platform tests/IntegrationTests/TenantCatalogReleaseModelTests.cs
git commit -m "feat(katalog): firma katalog sürümü kaydı ve migrationlar"
```

---

### Task 3: Sayfa sorgusunda katalog başvurusu (okuma, doğrulama, kayıt kapıları)

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageQueries.cs:5-60`. `PageQuery` iki isteğe bağlı alan alır, `ReadQueries` bunları okur. Ayrıca `HasCatalogReferences` ve `CatalogReferences` eklenir.
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` (yaklaşık `:154-158` anahtar kümeleri, `:303-400` `Validate`/`ValidateQueries`)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (`Validate` çağrıları, `:323` `QueryPageWriteAllowedAsync`, `:145` yayımlamadaki "sorgulu sayfa erişim satırı ister" denetimi)
- Create: `src/Hosts/AIERP.Api/Catalog/TenantCatalogStore.cs`
- Test: `tests/IntegrationTests/CustomPageCatalogReferenceSchemaTests.cs`, `tests/IntegrationTests/CustomPageCatalogReferenceEndpointsIntegrationTests.cs`

**Interfaces:**
- Consumes: Task 1 `CatalogBundle`, `CatalogItem`, `TenantCatalogSchema.TryParse`; Task 2 `TenantCatalogRelease`.
- Produces:
  - `PageQuery(..., string? Operation = null, string? DataSource = null, string? Action = null)`
  - `TenantCustomPageQueries.CatalogReferences(string definitionJson) -> IReadOnlyList<(string QueryId, string Code, string Kind)>`
  - `TenantCustomPageSchema.Validate(string json, out string? error, IReadOnlySet<string>? existingOperations, ErpOperationLookup lookup, CatalogBundle? catalog)`. Eski aşırı yüklemeler `catalog: null` ile çağrılır.
  - `TenantCatalogStore.ActiveAsync(TenantDbContext db, Guid tenant, ErpOperationLookup lookup, CancellationToken ct) -> Task<CatalogBundle?>`. Etkin sürümü okur ve `TryParse` ile çözer. Saklı paket bugün geçersizse `null` döner ve uyarı loglanır.

**Kurallar:**
- **Anahtar kümeleri:**
  - Yeni `CatalogQueryKeys` = `{ id, name, kind, dataSource, parameters, runOn, runDebounceMs }`.
  - Yeni `CatalogActionQueryKeys` = `action` ile aynı küme.
  - `sql`, `operation`, `dataSource`, `action` anahtarlarından en fazla biri bulunabilir.
- **Başvuru doğrulaması** (`catalog` verildiğinde):
  - Kod katalogda bulunmalıdır. `dataSource` bir veri kaynağını, `action` bir eylemi göstermelidir.
  - Sorgunun `kind` alanı öğenin türüne eşit olmalıdır.
  - **SQL'e dayanan öğede:** sayfanın `parameters` listesi öğenin parametreleriyle aynı adları ve tipleri taşımalıdır. Bağlama değerleri bugünkü kurallarla doğrulanır (ayrılmış adlar, desen).
  - **ERP işlemine dayanan öğede:** parametreler bugünkü `ValidateOperationQuery` parametre kurallarıyla doğrulanır. Mevcut kod kopyalanmaz; doğrulama, işlem adı yerine geçirilerek çalıştırılır.
- **`catalog == null` ise** (etkin sürüm yok), başvuru taşıyan tanım `"Sayfa katalog öğesine başvuruyor ama etkin katalog sürümü yok."` hatasıyla reddedilir.
- **Kayıt kapısı:**
  - `dataSource` başvuruları TenantAdmin **istemez**, çünkü SQL sayfada değildir.
  - `action` başvuruları yazma işlemidir. `HasWriteOperationQueries` ile aynı kapıya, yani doğrulanmış TenantAdmin'e tabidir.
- **Yayımlama kapısı:** başvuru taşıyan sayfa "sorgulu sayfa" sayılır. Bugünkü kural uygulanır: önce `TenantCustomPageAccesses` satırı gerekir, yoksa 409.
- **Saklı tanımlar:** `ReadQueries` yeni alanları okur. Uç noktaların kayıt ve yayımlama sırasında kullandığı `Validate` çağrılarına `await TenantCatalogStore.ActiveAsync(...)` geçirilir.

- [ ] **Step 1: Write the failing tests**

Şema testleri (bellek içi `CatalogBundle` ile):
- `Accepts_data_source_reference_with_matching_parameters`
- `Rejects_unknown_catalog_code`
- `Rejects_data_source_code_used_as_action`
- `Rejects_kind_mismatch`
- `Rejects_parameter_type_mismatch`
- `Rejects_sql_and_data_source_together`
- `Rejects_reference_without_active_catalog`
- `Definition_without_references_validates_as_before`. Mevcut bir standart (`SystemPages/Standards/customers.json` tanımı) `catalog: null` ile geçerli kalmalı.

Uç nokta testleri (in-process API, mevcut `CustomPageQueryEndpointsIntegrationTests` kurulum yardımcıları ile):
- `Non_admin_can_save_page_with_data_source_reference`
- `Non_admin_cannot_save_page_with_action_reference` (403)
- `Publish_with_reference_requires_access_row` (409)

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPageCatalogReference"`
Expected: FAIL / derleme hatası

- [ ] **Step 3: Implement the record fields, key sets, validation and gates**

- [ ] **Step 4: Run new tests plus the existing page suites**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~TenantCustomPage|FullyQualifiedName~SystemPage"`
Expected: PASS (mevcut testler değişmeden geçer)

- [ ] **Step 5: Commit**

```bash
git add src/Hosts/AIERP.Api tests/IntegrationTests
git commit -m "feat(katalog): sayfa sorgusu katalog veri kaynağına ve eylemine başvurabilir"
```

---

### Task 4: Katalog sürüm uçları (oluştur, listele, etkin katalog, etkinleştir)

**Files:**
- Create: `src/Hosts/AIERP.Api/Catalog/TenantCatalogEndpoints.cs` (`MapTenantCatalogEndpoints`)
- Modify: `src/Hosts/AIERP.Api/Program.cs:251` yakınında `app.MapTenantCatalogEndpoints();`
- Modify: `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs:302-318`, yalnızca gerekirse. Rota `/api/custom-pages/catalog…` olduğu için `erp.tenant-customizations` dalına düşmesi beklenir. Bunu testle sabitleyin.
- Test: `tests/IntegrationTests/TenantCatalogEndpointsIntegrationTests.cs`

**Interfaces:**
- Consumes: Task 1 `TryParse`; Task 2 entity; Task 3 `TenantCustomPageQueries.CatalogReferences`, `TenantCatalogStore.ActiveAsync`.
- Produces (rotalar `/api/custom-pages/catalog` altında):
  - `POST /releases`
    - İstek: `{ version, bundle (JSON nesnesi), sourceRepository?, sourceCommit?, sourcePath? }`
    - Yanıt: 201 `{ id, version, status:"Draft", bundleSha256 }`
    - Doğrulanmış TenantAdmin ister, değilse 403.
    - Geçersiz paket 400 `{ error }`. `version` SemVer değilse (`major.minor.patch`, ≤ 32 karakter) 400. Aynı sürüm 409.
  - `GET /releases`
    - Yanıt: `[{ id, version, status, bundleSha256, sourceRepository, sourceCommit, createdAt, activatedAt }]`, en yeni üstte. Paket gövdesi dönmez.
  - `GET /`
    - Etkin katalog: `{ releaseId, version, dataSources:[{code,label,source:"sql"|"erpOperation",erpOperation?,sql?,parameters,columns,opens}], actions:[{code,label,kind,target,source,erpOperation?,sql?,parameters,confirm}] }`
    - `sql` alanı yalnızca doğrulanmış TenantAdmin'e döner.
    - Etkin sürüm yoksa 200 ve boş listeler, `releaseId: null`.
  - `POST /releases/{id:guid}/activate`
    - İstek: `{ expectedActiveReleaseId: Guid? }`
    - Yanıt: 200 `{ id, version, status:"Active" }`
    - Doğrulanmış TenantAdmin ister.
    - Hedef satır `Draft` ya da `Superseded` olmalıdır, değilse 409.
    - `expectedActiveReleaseId` bugünkü etkin sürüme eşit değilse 409 `"Katalog başka bir kullanıcı tarafından değiştirildi."`
    - Saklı paket bugün `TryParse`'tan geçmelidir, geçmezse 409.
    - **Kırılma denetimi:** yayımlanmış, arşivlenmemiş her `TenantCustomPage` için `CatalogReferences` okunur. Her başvuru için yeni pakette şu koşullar aranır:
      - kod mevcut
      - aynı öğe türü ve `QueryKind`
      - aynı kaynak türü (sql ↔ erpOperation)
      - SQL öğelerinde aynı parametre adları ve tipleri

      Uymayan varsa 409 `{ error:"Bu sürüm yayımlanmış sayfaların kullandığı yapı taşlarını bozuyor.", pages:[{ code, name, references:[code] }] }`.
    - Başarılı etkinleştirmede tek bir `SaveChanges`/işlem içinde eski etkin sürüm `Superseded` olur, hedef sürüm `Active` olur. `ActivatedBy` ve `ActivatedAt` doldurulur.
- **Denetim kaydı:** `AuditEvent` satırları `catalog.release.created` ve `catalog.release.activated`. Resource biçimi: `"{version}:{sha256[..12]}"`. Değer `AuditResourceSanitizer` ile temizlenir.

- [ ] **Step 1: Write the failing tests**

- `Admin_creates_draft_release_and_sha_is_recorded`
- `Non_admin_cannot_create_or_activate` (403 / 403)
- `Invalid_bundle_returns_400_with_location`
- `Duplicate_version_returns_409`
- `Activate_makes_single_active_and_supersedes_previous`
- `Rollback_reactivates_superseded_release`
- `Activate_with_stale_expected_id_returns_409_and_keeps_active` (Review Focus 5: ilk istek başarılı, aynı `expectedActiveReleaseId` ile ikinci istek 409)
- `Activate_blocked_when_published_page_uses_removed_code` (Review Focus 4; `pages[0].code` ve `references` doğrulanır; etkin sürüm değişmez)
- `Activate_blocked_when_parameter_type_changes`
- `Draft_page_reference_does_not_block_activation`
- `Catalog_list_hides_sql_for_non_admin` (Review Focus 3: yanıt metninde `"sql"` yok, `source == "sql"` var)
- `Catalog_routes_resolve_to_tenant_customizations_permission` (`PlatformPermissionCatalog.TryResolve` ile)
- `Other_tenant_release_is_not_visible_or_activatable` (404)

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCatalogEndpointsIntegrationTests"`
Expected: FAIL

- [ ] **Step 3: Implement `MapTenantCatalogEndpoints`**

Kimlik ve kapı yardımcıları `TenantCustomPageEndpoints` ile aynıdır: tenant claim, `Allowed(...)`, `CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync`. SHA-256, istekteki `bundle` nesnesinin `GetRawText()` UTF-8 baytları üzerinden hesaplanır ve saklanan `BundleJson` tam olarak bu metindir.

- [ ] **Step 4: Run to verify they pass**

Run: Step 2 komutu. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Hosts/AIERP.Api src/Platform tests/IntegrationTests
git commit -m "feat(katalog): katalog sürümü oluşturma, listeleme ve kırılma denetimli etkinleştirme"
```

---

### Task 5: Çalışma anında çözümleme (sayfa getirme ve sorgu çalıştırma)

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageQueries.cs`. `WithoutQuerySql` yanına `ResolveCatalogReferences(string definitionJson, CatalogBundle? catalog) -> string` eklenir.
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (`GET /{code}/published` yaklaşık `:57`, `GET /{id}/preview` yaklaşık `:40`)
- Modify: `src/Hosts/AIERP.Api/SystemPageEndpoints.cs` (`GET /runtime`, `GET /{screenKey}/published`). Bu uçlar sayfa tanımını çalışma anında döndürür, aynı çözümleme uygulanır.
- Modify: `src/Hosts/AIERP.Api/CustomPageQueryEndpoints.cs:242-275` (`RunAsync`, `RunWriteAsync`)
- Test: `tests/IntegrationTests/CustomPageCatalogRuntimeIntegrationTests.cs`

**Interfaces:**
- Consumes: Task 3 `PageQuery.DataSource/Action`, `TenantCatalogStore.ActiveAsync`; Task 1 `CatalogItem`.
- Produces:
  - `ResolveCatalogReferences`. Her başvurulu sorgu için:
    - **Öğe ERP işlemine dayanıyorsa:** `dataSource`/`action` anahtarı kaldırılır, `"operation": item.ErpOperation` yazılır. erp-web bunu bugünkü işlem yolundan çağırır.
    - **Öğe SQL'e dayanıyorsa:** anahtar kaldırılır ve sorgu SQL'siz sıradan bir sorgu olarak kalır. erp-web onu bugünkü gibi `/queries/{id}/run` ile çalıştırır.
    - **Öğe yoksa ya da artık uymuyorsa:** anahtar kaldırılır ve `"catalogError": "Katalogda bulunamadı: <kod>"` yazılır.

    Ardından `WithoutQuerySql` uygulanır.
- `RunAsync` sırası:
  1. sorgu aranır
  2. hak denetimi
  3. **başvuru varsa** `TenantCatalogStore.ActiveAsync` çağrılır. Öğe yoksa 404 `"Katalogda bulunamadı: <kod>"`. Öğe ERP işlemine dayanıyorsa 400 `OperationQueryRunError`. Tür ya da parametre uyuşmuyorsa 409 `"Yapı taşı değişti; sayfayı yeniden yükleyin."`. Sorun yoksa `sql = item.Sql`.
  4. parametreler
  5. yazma onayı
  6. SQL yeniden doğrulanır (`InvalidStoredSqlError`)
  7. bağlantı açılır

  `RunWriteAsync`, katalogdan gelen SQL'i alır. Denetim kaynağına `catalog=<kod>@<sürüm>` eklenir.
- erp-web: `catalogError` taşıyan sorgu hiç çalıştırılmaz. Sorgu durumu `error = catalogError` olur ve blok bugünkü sorgu hatası görünümünü gösterir. Bu Task 6'da yapılır. Sunucu tarafı burada biter.

- [ ] **Step 1: Write the failing tests**

- `Published_page_resolves_operation_backed_source_to_operation` (yanıttaki sorguda `operation == "cari.listele"`, `dataSource` yok)
- `Published_page_never_contains_catalog_sql` (Review Focus 3; yanıt metninde katalogdaki SQL'in benzersiz bir parçası yok)
- `Run_sql_backed_data_source_uses_catalog_sql`. Mevcut testlerdeki sahte `ITenantQueryConnectionFactory`/çalıştırıcı deseniyle çalışan SQL'in katalogdaki metin olduğu doğrulanır.
- `Run_reference_to_missing_code_returns_404_and_page_still_loads` (Review Focus 1: sayfa önce başvurulu yayımlanır, sonra kodu içermeyen bir sürüm doğrudan veritabanında `Active` yapılır; `GET published` 200 ve `catalogError`; run 404)
- `Run_rejects_catalog_sql_that_todays_validator_rejects_without_opening_connection` (Review Focus 2; paket doğrudan veritabanına yazılır ve içinde reddedilen SQL bulunur; bağlantı fabrikası çağrılmaz)
- `Run_after_parameter_change_returns_409`
- `Catalog_sql_action_write_is_audited_with_catalog_code` (`TenantCustomPageWriteAudits` satırı)
- `System_page_runtime_resolves_references`

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPageCatalogRuntimeIntegrationTests"`
Expected: FAIL

- [ ] **Step 3: Implement `ResolveCatalogReferences` and the run-path resolution**

- [ ] **Step 4: Run new tests plus all custom-page and system-page suites**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~SystemPage|FullyQualifiedName~TenantCatalog"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Hosts/AIERP.Api tests/IntegrationTests
git commit -m "feat(katalog): ERP sayfa getirirken ve sorgu çalıştırırken katalog başvurularını çözer"
```

---

### Task 6: İstemciler (erp-web `catalogError`, Studio başvuruları korur) ve belgeler

**Files:**
- Modify: `frontend/erp-web/src/custom-page/usePageQueries.ts:8-60` (`PageQueryDefinition.catalogError?`, `readPageQueries`) ve çalıştırma döngüsü. `catalogError` taşıyan sorgu çalıştırılmaz, durum hata olur.
- Test: `frontend/erp-web/src/custom-page/usePageQueries.test.ts` (mevcutsa genişletin, değilse yanına yeni dosya açın)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/QueriesPanel.tsx:14-22` (`PageQuery.dataSource?`, `action?`)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`. Değişecek yerler: `wireDefinition` (yaklaşık `:859`) ve kayıttaki sorgu doğrulaması (yaklaşık `:2230-2245`). Başvurulu sorgular korunur, "SQL ya da işlem yok" diye reddedilmez ya da atılmaz. Sorgu listesinde salt okunur "Katalog: <kod>" satırı gösterilir.
- Test: ilgili Studio Vitest dosyası (`CustomPagesPage` / `QueriesPanel` testlerinin bulunduğu yer)
- Modify: `docs/architecture.md` (katalog deposu, güven yolu, SQL'in görünürlüğü), `docs/phase-status.md` (2a: doğrulanan / doğrulanmayan)

**Interfaces:**
- Consumes: Task 5 yanıt biçimi (`operation` / SQL'siz sorgu / `catalogError`).

- [ ] **Step 1: Write the failing tests**

- erp-web `catalog_error_query_is_not_run_and_reports_error`. `api` sahte. Çağrı yapılmaz, durum `error === "Katalogda bulunamadı: cariler"` olur.
- Studio `wireDefinition_keeps_data_source_reference`. Başvurulu sorgu kaydedilen JSON'da `dataSource` ile kalır, `sql`/`operation` eklenmez.
- Studio `save_validation_accepts_catalog_reference_query`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/custom-page` (erp-web) ve Studio'da ilgili dosya için `npx vitest run <yol>`
Expected: FAIL

- [ ] **Step 3: Implement**

Studio tarafında katalog seçici **yok** (2c). Yalnızca mevcut başvuruların gösterilmesi ve korunması yapılır.

- [ ] **Step 4: Run the full frontend checks**

Run: her iki uygulamada `npm test` ve `npm run build`
Expected: hepsi geçer, tip hatası yok

- [ ] **Step 5: Update docs and commit**

`docs/phase-status.md` içinde açıkça yazılacaklar:
- 2a InMemory entegrasyon testleriyle doğrulandı.
- SQL Server kabul testi ve canlı firma ile deneme yapılmadı.
- Studio'dan yayınlama 2c'ye kaldı.

```bash
git add frontend docs/architecture.md docs/phase-status.md
git commit -m "feat(katalog): ERP katalog hatasını gösterir, Studio başvuruları korur; belgeler"
```
