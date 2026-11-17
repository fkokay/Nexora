# Parça 3 — Okuma sorguları ve bağlama: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetici sayfaya adlandırılmış okuma sorguları ekler. Etiket, giriş kutusu, ızgara ve gösterge bileşenleri `{{…}}` ifadeleriyle sorgu sonuçlarına ve girişlere bağlanır. ERP, sorguları yetkili kullanıcı için okuma kullanıcısıyla çalıştırır.

**Architecture:**
- Sayfa tanımına `schemaVersion: 2` gelir: `queries` listesi, bileşen `name` alanı ve `label`/`input` bileşenleri eklenir. Sunucu 1. ve 2. sürümü kabul eder.
- Sorgular yalnız sunucuda tanımdan alınarak çalışır. İstemci yalnız parametre değerlerini gönderir.
- Bağlama ifadeleri istemcide saf bir modülle çözülür.
- Çalıştırıcı, 1. parçanın `CustomSqlReportRunner` sınırlarını yeniden kullanır; ona parametre desteği eklenir.
- Yetki 2. parçanın `CustomPageAccess.GetRightsAsync` fonksiyonundan gelir.

**Tech Stack:** .NET 10 minimal API, `Microsoft.Data.SqlClient` (`SqlParameter`), React + TypeScript (erp-web, development-studio), Monaco (`@monaco-editor/react`, Studio'da kurulu), xUnit.

**Spec:** `docs/superpowers/specs/2026-11-16-salt-okunur-sql-raporlari-design.md` (bölüm 2, 3, 6, 8, 9). Onaylanan arayüz taslağı Task 5'te tarif edilir. Bu parça yazma sorgularını (`insert`/`update`/`delete`) ve butonları **kapsamaz**; onlar 4. parçadadır.

## Global Constraints

- **Sorgu (`queries[]`):** en fazla **20** sorgu.
  - Alanlar: `{ id, name, kind: "read", sql, parameters, runOn: "load" | "manual" }`.
  - `sql` 1–10.000 karakter olur ve mevcut `TryValidateReadOnlySql` kontrolünden geçmelidir. `{{` ya da `}}` içeremez.
- **Parametre:** sorgu başına en fazla 20 parametre.
  - Alanlar: `{ name, binding, type }`.
  - `name` şu kalıba uymalı: `^[A-Za-z_][A-Za-z0-9_]{0,63}$`.
  - `type` şunlardan biri olmalı: `text|int|decimal|date|bool|guid`.
  - `binding` tek bir ifadedir: `^\{\{\s*PATH\s*\}\}$`. Burada `PATH = [A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*`.
  - SQL'de geçen her `@ad` (önünde ikinci bir `@` olmayan) tanımlı bir parametre olmalı. Tanımlı her parametre de SQL'de geçmeli.
- **Adlar:** sorgu ve bileşen `name` değerleri sayfa içinde benzersiz olmalı (büyük/küçük harf duyarsız), `^[A-Za-z_][A-Za-z0-9_]{0,63}$` kalıbına uymalı ve şu ayrılmış adlardan biri olmamalı: `kullanici`, `bugun`.
- **Bağımlılık döngüsü:** Parametre bağlamaları başka bir sorguya dayanabilir (ör. `{{q1.rows[0].Id}}`). Bu bağımlılıklarda döngü varsa tanım reddedilir: "Sorgular arasında döngüsel bağımlılık var: {ad zinciri}."
- **Bağlanabilir alanlar (yalnız v2):** `text`, `title`, `description`, `label`, `value`, `placeholder`, `defaultValue`. Bu alanlarda `{{PATH}}` ifadeleri geçebilir. Diğer alanlarda ve tüm v1 tanımlarında `{{` yasak kalır.
- **Yeni bileşenler:**
  - `label`: `text` alanı bağlanabilir.
  - `input`: `inputType` alanı `text|number|date|checkbox|select` değerlerinden biridir. Diğer alanlar: `defaultValue`, `placeholder`, `label`, ve select için `optionsQuery` (sorgu id), `optionLabelColumn`, `optionValueColumn`.
  - `dataTable` ve `metric` yeni `query` alanını (sorgu id) alır. `query` varsa `source` yok sayılır.
- **Boyut:** v2 tanımlarında en büyük boyut **128 KiB**; v1'de 64 KiB kalır.
- **Çalıştırma uç noktası:** `POST /api/custom-pages/{code}/queries/{queryId}/run`, gövde `{ parameters: { ad: değer } }`. Kurallar:
  - Yanıt: `{ columns, rows, rowCount, truncated }`.
  - Yayınlanmış tanım kullanılır.
  - Kullanıcının `View` hakkı gerekir.
  - Gelen parametre adları tanımdakilerle birebir aynı olmalı. Her değer tanımlı türe çevrilir; çevrilemezse 400 döner.
  - `SqlParameter` türleri: `NVarChar(4000)`, `Int`, `Decimal(38,10)`, `Date`, `Bit`, `UniqueIdentifier`.
  - `null` değer `DBNull` olarak gönderilir.
- **Önizleme:** `POST /api/custom-pages/{id:guid}/preview/queries/{queryId}/run`, yalnız TenantAdmin için ve taslak tanımla çalışır.
- **Çalıştırma sınırları:** 1. parçayla aynı: 30 sn komut zaman aşımı, 5.000 satır, hücre başına 4.000 karakter, yanıt başına 10.000.000 karakter. Okuma bağlantısı `TenantQueryAccess.Read` ile, yalnız çağıranın kiracısında açılır.
- **Denetim:** Platform `AuditEvents`'e kayıt yazılır.
  - Action: `custom-page.query.run` (önizlemede `custom-page.query.preview`).
  - Resource: `{code}:{queryName}:rows={n}:params={adlar virgüllü}`, 240 karakterde kesilir. Okuma sorgularında parametre değerleri yazılmaz (bkz. Ruling).
- **Hız sınırı:** çalışma zamanı sorgu çalıştırmaya kullanıcı başına dakikada **300** istek (sabit pencere, `custom-page-query` politikası); Studio önizleme çalıştırmasına ayrı olarak kullanıcı başına dakikada **120** istek (`custom-page-query-preview` politikası).
- **Sorgulu sayfa kuralları** (tanımda boş olmayan `queries` varsa):
  - Taslak oluşturma, güncelleme, yayımlama, silme ve geri yükleme yalnız TenantAdmin'e açıktır; diğer kullanıcılar 403 alır. Kontrol hem gelen/geri yüklenen tanıma hem de aynı koddaki saklı tanımlara (yayımlanmış sürüm, açık taslak, silinen veya geri yüklenen satır) bakar.
  - Erişim kaydı yoksa yayın 409 döner: "Bu sayfa SQL sorgusu içeriyor; yayımlamadan önce erişimi açıkça seçin."
  - `CustomPageAccessRules.Evaluate`: kayıt yoksa ve sayfanın yayınlanmış tanımında sorgu varsa sonuç `AdminsOnly` olur; kayıt yoksa ve sorgu yoksa bugünkü gibi `AllUsers` + `View`.
- **İstemci:**
  - Okuma sorguları `runOn: "load"` ise sayfa açılınca çalışır.
  - Parametrelerinin çözülmüş değerleri değişince **300 ms** bekleyip yeniden çalışır.
  - Sorgular bağımlılık sırasıyla çalışır.
  - `{{…}}` yolu çözülemezse metinde boş dize, parametrede `null` kullanılır.
- **Oturum değişkenleri:**
  - `{{kullanici.id}}`, `{{kullanici.ad}}`
  - `{{bugun}}`: yerel tarih, `YYYY-MM-DD` biçiminde.
  - Izgara seçili satırı: `{{izgaraAdi.seciliSatir.Sutun}}`.
- **Metinler:** Kullanıcıya görünen metinler Türkçedir; tasarım onaylanan taslağa uyar.

## Review Focus

1. **Enjeksiyon.** Parametre değeri SQL metnine eklenmemeli. `'; DROP TABLE x--` değeri `@p` parametresi olarak gitmeli ve sorgu metni değişmemeli. Test: Task 3 `Parameters_are_sent_as_typed_sql_parameters`.
2. **Tanımda olmayan sorgu.** İstemci yayınlanmış tanımda bulunmayan bir `queryId` ya da taslaktaki bir sorgunun id'sini gönderirse 404 dönmeli. Test: Task 3 `Run_unknown_or_draft_only_query_returns_404`.
3. **Yetkisiz kullanıcı.** `View` hakkı olmayan kullanıcı sorguyu çalıştıramamalı ve fabrika hiç çağrılmamalı. Test: Task 3 `Run_without_view_right_is_forbidden_and_factory_not_called`.
4. **Döngüsel bağımlılık.** Döngüsel bağımlılık ve eşleşmeyen `@parametre` tanımları kayıtta reddedilmeli. Test: Task 1 `Rejects_cyclic_query_dependencies`, `Rejects_undeclared_or_unused_sql_parameters`.
5. **Sorgusuz kalan sayfa.** Bir sayfadan tüm sorgular kaldırılırsa sayfa yine yönetici dışındakilere açılabilmeli. Erişim kaydı varsa kayıttaki mod geçerlidir. Test: Task 2 `Access_rule_uses_queries_only_when_no_access_row`.

## Rulings (tasarımcı kararları)

- **Parametre değerleri denetime yazılmaz.** Okuma sorgularında denetim kaydına parametre değerleri yazılmaz, yalnız adları yazılır. Değerler kişisel veri içerebilir ve 240 karakter sınırına sığmaz. Yazma sorgularında (4. parça) değerler tam yazılacak.
- **Studio tasarımcısı her zaman v2 kaydeder.** Studio, kaydedilen tanımı her zaman `schemaVersion: 2` olarak gönderir. Sunucu v1'i okumaya ve kaydetmeye devam eder.

---

### Task 1: Şema v2 doğrulaması

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`
- Create: `src/Hosts/AIERP.Api/TenantCustomPageQueries.cs`. Saf yardımcılar:
  - tanımdan sorguları okuma (`ReadQueries`),
  - bağlama yolu ayrıştırma,
  - SQL içindeki `@parametre` adlarını çıkarma (string ve köşeli parantez içleri hariç),
  - döngü tespiti.
- Test: `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs`. Projede Api'ye erişen birim testleri bu projede duruyor; bkz. `CustomSqlReportRunnerTests`.

**Interfaces:**
- Produces:
```csharp
internal sealed record PageQueryParameter(string Name, string Binding, string Type);
internal sealed record PageQuery(string Id, string Name, string Kind, string Sql, IReadOnlyList<PageQueryParameter> Parameters, string RunOn);
internal static class TenantCustomPageQueries
{
    internal static IReadOnlyList<PageQuery> ReadQueries(string definitionJson);          // v1 → boş liste
    internal static bool HasQueries(string definitionJson);
    internal static IReadOnlySet<string> SqlParameterNames(string sql);                   // "@a ... @@ROWCOUNT ... '@b'" → {a}
    internal static bool TryParseBindingPath(string expression, out string root);         // "{{q1.rows[0].Id}}" → root "q1"
    internal static string? FindCycle(IReadOnlyList<PageQuery> queries);                   // null ya da "a → b → a"
}
```
- `TenantCustomPageSchema.Validate(json, out error)` aynı imzayla v1/v2 kabul eder. v2 doğrulamaları Global Constraints'teki şema kurallarının tamamıdır. Sorgu SQL'i `ReportEndpoints` içindeki mevcut `TryValidateReadOnlySql` ile doğrulanır; fonksiyon `internal` yapılır ya da paylaşılan bir yere taşınır, davranışı değişmez.

- [ ] **Step 1: Write the failing tests**
```csharp
[Fact] public void Accepts_v1_definition_unchanged()
[Fact] public void Accepts_v2_with_query_label_input_and_bindings()
[Fact] public void Rejects_bindings_in_v1()
[Fact] public void Rejects_binding_in_non_bindable_prop()                 // ör. "width" ya da "source"
[Fact] public void Rejects_non_select_or_invalid_sql()                     // "DELETE FROM X" → TryValidateReadOnlySql hatası
[Fact] public void Rejects_undeclared_or_unused_sql_parameters()
[Fact] public void Rejects_duplicate_or_reserved_names()                  // "kullanici", büyük/küçük harf çakışması
[Fact] public void Rejects_cyclic_query_dependencies()                    // hata metni "a → b → a" içerir
[Fact] public void Rejects_unknown_query_reference_in_dataTable_query_prop()
[Fact] public void SqlParameterNames_ignores_strings_brackets_and_system_variables()
[Fact] public void Enforces_128KiB_for_v2_and_64KiB_for_v1()
```
- [ ] **Step 2:** Run `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchemaV2Tests"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run aynı filtre + `FullyQualifiedName~TenantCustomPage`. Expected: PASS; mevcut sayfa testleri de geçer.
- [ ] **Step 5: Commit** — `git commit -m "Sayfa şeması v2: sorgular, bağlama ve etiket/giriş bileşenleri"`

---

### Task 2: Sorgulu sayfa kuralları

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/CustomPageAccessRules.cs` (`Evaluate`'e `bool pageHasQueries` parametresi)
- Modify: `src/Hosts/AIERP.Api/CustomPageAccessEndpoints.cs` (`GetRightsAsync` ve toplu sürüm: sayfanın **yayınlanmış** tanımındaki sorgu varlığını hesaba katar; taslak için önizlemede taslak tanım kullanılır)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (drafts/PUT/publish/restore kuralları)
- Test: mevcut `tests/UnitTests/AIERP.Platform.UnitTests/CustomPageAccessRulesTests.cs` ve `tests/IntegrationTests/CustomPageAccessEnforcementIntegrationTests.cs` dosyalarına eklemeler; yeni `tests/IntegrationTests/CustomPageQueryRulesIntegrationTests.cs`

**Interfaces:**
- Consumes: Task 1 `TenantCustomPageQueries.HasQueries`.
- Produces: `CustomPageAccessRules.Evaluate(TenantCustomPageAccess? access, Guid userId, bool isTenantAdmin, bool isMember, bool pageHasQueries)`. Mevcut tüm çağrılar güncellenir.

- [ ] **Step 1: Write the failing tests**
```csharp
[Fact] public void Evaluate_without_row_and_with_queries_is_admins_only()
[Fact] public void Access_rule_uses_queries_only_when_no_access_row()                 // satır varsa mod geçerli
[Fact] public async Task Tenant_user_cannot_create_update_publish_or_restore_page_with_queries() // 403 ×4
[Fact] public async Task Publish_with_queries_requires_saved_access_row()             // 409 + Türkçe metin; kayıt sonrası 200
[Fact] public async Task Published_page_with_queries_and_no_row_is_hidden_from_tenant_user()
```
- [ ] **Step 2–4:** Testler önce FAIL vermeli, sonra PASS. Run: `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~CustomPageAccessRules"` ve `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~CustomMenu"`.
- [ ] **Step 5: Commit** — `git commit -m "Sorgulu sayfalar: yönetici kuralı, yayın erişim şartı ve varsayılan yalnız yönetici"`

---

### Task 3: Sorgu çalıştırma uç noktaları

**Files:**
- Modify: `src/Hosts/AIERP.Api/CustomSqlReportRunner.cs`. Tek kiracılı ve parametreli bir çalıştırma eklenir; mevcut davranış değişmez.
- Create: `src/Hosts/AIERP.Api/CustomPageQueryEndpoints.cs`
- Modify: `src/Hosts/AIERP.Api/Program.cs`: map çağrısı ve `custom-page-query` rate limit politikası (mevcut `AddRateLimiter` bloğunda).
- Test: `tests/IntegrationTests/CustomPageQueryEndpointsIntegrationTests.cs` (sahte fabrika), `tests/IntegrationTests/CustomPageQueryParameterTests.cs` (saf dönüşüm), `tests/IntegrationTests/CustomPageQuerySqlAcceptanceTests.cs` (`[SqlServerAcceptanceFact]`)

**Interfaces:**
- Consumes: Task 1 `PageQuery`/`ReadQueries`; Task 2 `GetRightsAsync`; Part 1 `ITenantQueryConnectionFactory`, `CustomSqlReportRunner` sınırları ve `MapError`.
- Produces:
```csharp
internal static class CustomPageQueryParameters
{
    /// Gelen değerleri tanımlı türlere çevirir; ad kümesi birebir eşleşmeli. Hata: (null, "Türkçe mesaj").
    internal static (IReadOnlyList<SqlParameter>? Parameters, string? Error) Build(IReadOnlyList<PageQueryParameter> declared, IReadOnlyDictionary<string, JsonElement>? supplied);
}
internal static partial class CustomSqlReportRunner
{
    internal static Task<CustomSqlResult> ExecuteSingleAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenantId, ITenantQueryConnectionFactory factory, CancellationToken ct);
}
public sealed record CustomPageQueryRunRequest(Dictionary<string, JsonElement>? Parameters);
public sealed record CustomPageQueryRunResult(IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, int RowCount, bool Truncated);
```
- **Değer dönüşümü:**
  - `text`: string ya da null.
  - `int`: tam sayı ya da sayısal string.
  - `decimal`: sayı ya da invariant-culture string.
  - `date`: `yyyy-MM-dd`.
  - `bool`: true/false.
  - `guid`: Guid.
  - Diğer her şey 400 döner: `"'{ad}' parametresi {tür} olmalı."`.
- **Kontrol sırası:** önce rol/hak kontrolü, sonra tanım ve sorgu bulma, sonra parametre doğrulama, en son bağlantı.

- [ ] **Step 1: Write the failing tests**
```csharp
[Fact] public async Task Run_without_view_right_is_forbidden_and_factory_not_called()
[Fact] public async Task Run_unknown_or_draft_only_query_returns_404()
[Fact] public async Task Run_with_missing_extra_or_mistyped_parameter_returns_400()
[Fact] public async Task Run_returns_503_when_query_connection_unavailable()
[Fact] public async Task Preview_run_is_admin_only_and_uses_draft_definition()
[Fact] public void Build_converts_each_type_and_rejects_bad_values()
[SqlServerAcceptanceFact] public async Task Parameters_are_sent_as_typed_sql_parameters()   // enjeksiyon dizesi satır döndürmez/hata vermez, tablo yerinde
[SqlServerAcceptanceFact] public async Task Run_returns_rows_for_parameterized_query()
```
- [ ] **Step 2–4:** Testler önce FAIL vermeli, sonra PASS. Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPageQuery"`. SQL testleri ortam yoksa SKIP olur; raporda belirtilir.
- [ ] **Step 5: Commit** — `git commit -m "API: özel sayfa okuma sorgularını parametreli çalıştırma"`

---

### Task 4: ERP çalışma zamanı — sorgular, değişkenler, etiket ve giriş

**Files:**
- Create: `frontend/erp-web/src/custom-page/pageBindings.ts` (saf modül)
- Create: `frontend/erp-web/src/custom-page/usePageQueries.ts` (hook)
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`: v2 kabulü; `label`, `input`; `dataTable`/`metric` için `query`; ızgara satır seçimi.
- Modify: `frontend/erp-web/src/tenant-custom-page.css` (gerekli küçük stiller)

**Interfaces:**
- Consumes: Task 3 uç noktası ve yanıt şekli (camelCase: `columns[{code,label,dataType}]`, `rows`, `rowCount`, `truncated`). Önizlemede `previewId` varsa önizleme uç noktası kullanılır.
- Produces (`pageBindings.ts`):
```ts
export type PageScope = Record<string, unknown>;
export function resolvePath(scope: PageScope, path: string): unknown;               // "q.rows[0].Ad"
export function interpolate(template: string, scope: PageScope): string;            // "{{a}} ve {{b.c}}" → çözülmüş; çözülemeyen → ""
export function bindingPath(expression: string): string | null;                     // "{{ x.y }}" → "x.y"
export function queryOrder(queries: { name: string; parameters: { binding: string }[] }[]): string[]; // bağımlılık sırası
```
- **Kapsam (scope):**
  - `{ [inputName]: { value }, [queryName]: { rows, rowCount, columns, truncated, loading, error }, [tableName]: { seciliSatir }, kullanici: { id, ad }, bugun }`.
  - `kullanici` bilgisi oturumdaki kullanıcıdan gelir; erp-web'de nerede tutulduğuna bakılır.
- **Davranış:** Global Constraints'teki istemci kuralları uygulanır.
  - Bir sorgu yüklenirken bağlı bileşen "Yükleniyor…" gösterir.
  - Hata, bileşenin yerinde `tenant-custom-page-error` stiliyle gösterilir.
  - `truncated` ise ızgara altında şu not çıkar: "İlk 5.000 satır gösteriliyor."

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `cd frontend/erp-web && npm run build`. Expected: exit 0.
- [ ] **Step 3:** Commit — `git commit -m "ERP: özel sayfada sorgular, değişken bağlama, etiket ve giriş bileşenleri"`

---

### Task 5: Studio tasarımcısı — Sorgular sekmesi ve bağlama

**Files:**
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/QueriesPanel.tsx`
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/SqlQueryEditor.tsx` (Monaco, `sql` dili, `GET /api/reports/sql-schema` ile tablo/sütun tamamlama)
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/BindingInput.tsx` (`{{` yazınca değişken önerileri)
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/pageBindings.ts` (erp-web'deki modülün kopyası; kopya ERP sayfaları düzeniyle uyumlu)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - "Sorgular" sekmesi;
  - palete "Etiket" ve "Giriş kutusu";
  - bileşen `name` alanı;
  - bağlanabilir alanlarda `BindingInput`;
  - `dataTable`/`metric` için "Veri kaynağı: Sorgu" seçimi;
  - kaydederken `schemaVersion: 2`;
  - `CustomPageAccessPanel`'e `hasQueries`.
- Modify: `frontend/development-studio/src/platform-tools/erp-src/custom-pages.css` (yalnız `pd-query-*`, `pd-binding-*`)

**Interfaces:**
- Consumes:
  - Task 1 şeması.
  - Task 3 önizleme uç noktası. Önizlemeden önce kaydedilmemiş taslak varsa mevcut `saveDraft` çağrılır.
  - `GET /api/reports/sql-schema` → `[{ schema, name, columns:[{name,dataType}] }]`.
- **Onaylanan taslak:**
  - Sol panelde üçüncü sekme "Sorgular", sekmede sorgu sayısı rozeti.
  - Her sorgu kartında ad, "Okuma" rozeti ve "Açılışta + değişince" ya da "Elle" bilgisi. Son önizlemede satır sayısı da görünür.
  - Kart listesinin altında "Sorgu ekle" düğmesi.
  - Seçili sorgu için ad, çalışma zamanı seçimi, SQL editörü, Parametreler tablosu (ad salt okunur ve SQL'den otomatik gelir; bağlama `BindingInput`; tür seçimi) ve "Çalıştır ve önizle" düğmesi. Sonuç, panel altında ilk 20 satırlık küçük bir tabloda gösterilir.
  - Sağ panelde bağlanabilir alanlar monospace yazılır, `{{` yazınca öneri listesi açılır.
    - Öneriler: sorgu adları ve `.rows`, `.rowCount`, `.rows[0].<sütun>` (son önizleme sütunlarından); giriş adları ve `.value`; ızgara adları ve `.seciliSatir.<sütun>`; `kullanici.id`, `kullanici.ad`, `bugun`.
  - Altta not: "Değerler SQL'e her zaman parametre olarak gider."
- **Kurallar:**
  - Sorgu eklemek, SQL düzenlemek ve önizlemek yalnız `role === "TenantAdmin"` için etkindir. Diğer roller sekmeyi salt okunur görür.
  - Sunucunun döngü ve parametre hataları kayıtta mevcut hata mesajı alanında gösterilir.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `cd frontend/development-studio && npm run build`. Expected: exit 0.
- [ ] **Step 3:** Sahte API ile tarayıcıda görsel kontrol yapılır. Sahte sunucu: `C:/Users/FATIH/AppData/Local/Temp/claude/a6482446cdd1d12c/3e9727ed-d073-4da2-a618-5136c47a3d1f/scratchpad/mock/vite.mock.config.ts`; `sql-schema` ve önizleme çalıştırma uç noktaları eklenir. Sekme, editör, öneri listesi ve önizleme tablosu kontrol edilir; yapılamazsa açıkça belirtilir.
- [ ] **Step 4:** Commit — `git commit -m "Studio: sayfa tasarımcısında Sorgular sekmesi ve değişken bağlama"`
