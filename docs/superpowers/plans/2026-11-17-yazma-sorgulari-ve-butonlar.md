# Parça 4 — Yazma sorguları ve butonlar: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetici sayfaya `INSERT`, `UPDATE` ve `DELETE` sorguları ekler. Eylem düğmeleri bu sorguları, ya da elle çalışan okuma sorgularını, onay penceresiyle tetikler. Sunucu yazma işlemini kullanıcının sayfa hakkına göre yazma kullanıcısıyla, tek bir transaction içinde çalıştırır ve tam ayrıntıyla denetler.

**Architecture:**
- Şema v2'de `kind` alanı `read|insert|update|delete` değerlerini alır.
- 3. parçanın çalıştırma uç noktası yazma türlerini de kabul eder: hak kontrolü sorgu türüne göre yapılır, bağlantı `TenantQueryAccess.Write` ile açılır, sorgu transaction içinde çalışır ve `affectedRows` döner.
- Yazma denetimi yeni bir Platform tablosuna yazılır.
- Yayınlanmış sayfa yanıtı kullanıcının haklarını taşır; ERP düğmeleri bu haklara göre gösterir veya gizler.
- Bir yan düzeltme: `GET /{id}` ve geçmiş yanıtlarında SQL yalnız TenantAdmin'e gösterilir.

**Tech Stack:** .NET 10, EF Core (Platform migration), `Microsoft.Data.SqlClient`, React + TypeScript (erp-web, development-studio), xUnit.

**Spec:** `docs/superpowers/specs/2026-11-16-salt-okunur-sql-raporlari-design.md` (bölüm 2, 4, 6, 9; "Teslim sırası" 4. madde). Onaylanan arayüz taslağı Task 4–5'te tarif edilir.

## Global Constraints

- **Yazma SQL doğrulaması** (yeni `TryValidateWriteSql(sql, kind, out error)`):
  - Uzunluk 1–10.000 karakter.
  - Tek ifade olmalı; noktalı virgülle ikinci bir ifade eklenemez.
  - İlk anahtar kelime türle eşleşmeli: `insert` → `INSERT`, `update` → `UPDATE`, `delete` → `DELETE`. `WITH` ile başlayan CTE'ye izin verilmez.
  - Şunları içeremez: `EXEC`/`EXECUTE`, `xp_`/`sp_`, DDL (`CREATE`/`ALTER`/`DROP`/`TRUNCATE`), `GRANT`/`DENY`/`REVOKE`, `OPENROWSET`/`OPENQUERY`/`OPENDATASOURCE`, `INTO` ile yeni tablo (`SELECT … INTO`), `MERGE`, `BULK`, yorum (`--` ve `/* */`), `{{` ya da `}}`.
  - 1. parçada okuma için yasaklanan veritabanı listeleme tanımlayıcıları burada da yasaktır.
  - Tamamı Türkçe hata mesajıyla reddedilir. Metin doğrulayıcısı erken uyarı içindir; asıl sınır veritabanı yetkisidir.
- **Yazma sorgusu ve tetikleme:** Yazma sorgularında `runOn` her zaman `manual` olmalıdır, aksi halde şema reddeder.
- **Tür ve hak eşlemesi:** `read` → `View`, `insert` → `Insert`, `update` → `Update`, `delete` → `Delete`.
- **Yazma çalıştırma:**
  - Bağlantı `TenantQueryAccess.Write` ile açılır.
  - `BeginTransaction` (ReadCommitted) içinde, `CommandTimeout = 30` ile çalışır.
  - Başarıda commit edilir. Herhangi bir hatada rollback yapılır ve 400/503 döner (mevcut `MapError` eşlemeleriyle).
  - Yanıt: `{ affectedRows }`.
- **Uç noktalar:**
  - `POST /api/custom-pages/{code}/queries/{queryId}/run` aynı kalır.
  - `POST /api/custom-pages/{id}/preview/queries/{queryId}/run`: yazma türü için gövdede `confirmWrite: true` zorunludur, yoksa 400: "Önizlemede yazan sorgu yalnız açık onayla çalışır."
- **Yazma denetimi:**
  - Yeni Platform tablosu `TenantCustomPageWriteAudits`.
  - Alanlar: `Id`, `TenantId`, `UserId`, `PageCode`, `QueryName`, `Kind`, `ParametersJson`, `AffectedRows`, `Succeeded`, `ErrorNumber` (int?), `IsPreview`, `OccurredAt`.
  - `ParametersJson` parametre değerlerinin tamamını içerir, 16 KiB'ta kesilir.
  - Hem başarılı hem başarısız yazma denemesi kaydedilir.
  - Okuma sorgularının mevcut `AuditEvents` kaydı değişmez.
- **Haklar yanıtta:**
  - `GET /{code}/published` ve `GET /{id}/preview` yanıtına `rights: { view, insert, update, delete }` alanı eklenir.
  - Önizlemede bu alan yöneticinin haklarıdır; yani hepsi true.
- **Düğme eylemi (şema):** `button` bileşeninde `actionType` değeri `workflow` ya da `query` olabilir. `query` için ek alanlar:
  - `queryId` (zorunlu, mevcut bir sorgu)
  - `confirmEnabled` (bool)
  - `confirmText` (bağlanabilir, ≤300 karakter)
  - `refreshQueries` (okuma sorgusu id dizisi, ≤10)
  - `successMessage`, `errorMessage` (bağlanabilir, ≤200 karakter)
- **Onay varsayılanı:** `update` ve `delete` sorgusuna bağlanan düğmede Studio `confirmEnabled`'ı varsayılan olarak `true` yapar.
- **SQL görünürlüğü:** `GET /api/custom-pages/{id}` ve `GET /{id}/history` yanıtlarında TenantAdmin olmayan kullanıcılar için `queries[].sql` çıkarılır. Bunun için 3. parçadaki `WithoutQuerySql` kullanılır.
- **ERP davranışı:**
  - Düğme, kullanıcının sorgu türüne karşılık gelen hakkı yoksa gizlenir.
  - Yazma sırasında düğme pasif olur ve "Çalışıyor…" yazar.
  - Başarıda `successMessage` gösterilir; boşsa "İşlem tamamlandı." Mesajın sonuna " ({affectedRows} kayıt)" eklenir. Ardından `refreshQueries` yeniden çalıştırılır.
  - Hatada `errorMessage` gösterilir; boşsa sunucunun mesajı.
  - Okuma sorgusuna bağlı düğme o sorguyu yeniden çalıştırır; elle çalışan okuma sorguları da böylece çalışır.
  - Onay penceresi başlığı "Emin misiniz?", düğmeleri "Vazgeç" ve "Onayla"; sil ve güncelle türünde onay düğmesi tehlike (kırmızı) stilindedir.
- **Metinler:** Kullanıcıya görünen metinler Türkçedir; tasarım onaylanan taslağa uyar.

## Review Focus

1. **Yetkisiz yazma.** `Update` hakkı olmayan kullanıcı uç noktayı doğrudan çağırırsa 403 almalı ve yazma bağlantısı hiç açılmamalı. Test: Task 2 `Write_without_matching_right_is_forbidden_and_factory_not_called`.
2. **Hata sonrası geri alma.** Hata alan yazma işlemi geri alınmalı, başarısız deneme yine de denetime yazılmalı. Test: Task 2 `Failed_write_rolls_back_and_is_audited` (SQL kabul testi) ve `Failed_write_attempt_is_audited` (sahte fabrika).
3. **İkinci ifade sızdırma.** `UPDATE … ; DROP TABLE x` gibi ikinci ifade ya da `UPDATE` olarak işaretlenmiş bir `DELETE` kayıtta reddedilmeli. Test: Task 1 `Rejects_multi_statement_or_kind_mismatch_write_sql`.
4. **Önizlemede kazara yazma.** Önizlemede yazan sorgu `confirmWrite` olmadan çalışmamalı. Test: Task 2 `Preview_write_requires_explicit_confirmation`.
5. **SQL sızıntısı.** Yönetici olmayan kullanıcı `GET /{id}` ve geçmiş yanıtlarında SQL görmemeli. Test: Task 3 `Non_admin_get_and_history_hide_query_sql`.

---

### Task 1: Şema — yazma türleri ve düğme sorgu eylemi

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`, `src/Hosts/AIERP.Api/TenantCustomPageQueries.cs`
- Modify: `src/Hosts/AIERP.Api/ReportEndpoints.cs`: `TryValidateWriteSql` buraya, `TryValidateReadOnlySql`'in yanına eklenir ve onun ayrıştırma yardımcılarını paylaşır. Okuma doğrulayıcısının davranışı değişmez.
- Test: `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs` (ekleme), `tests/IntegrationTests/WriteSqlValidatorTests.cs`

**Interfaces:**
- Produces:
  - `internal static bool ReportEndpoints.TryValidateWriteSql(string? sql, string kind, out string? error)`.
  - `PageQuery.Kind` dört değeri alabilir.
  - Düğme sorgu alanları şemada doğrulanır: `queryId` var olmalı; `refreshQueries` yalnız okuma sorgularına işaret edebilir.

- [ ] **Step 1: Write the failing tests**
```csharp
[Theory] [InlineData("insert","INSERT INTO T(a) VALUES(@a)")] [InlineData("update","UPDATE T SET a=@a WHERE id=@id")] [InlineData("delete","DELETE FROM T WHERE id=@id")]
public void Accepts_single_statement_write_sql_matching_kind(string kind, string sql)
[Fact] public void Rejects_multi_statement_or_kind_mismatch_write_sql()     // "UPDATE ...; DROP TABLE x", kind=update + "DELETE ..."
[Fact] public void Rejects_exec_ddl_merge_into_openrowset_comments_in_write_sql()
[Fact] public void Rejects_write_query_with_runOn_load()
[Fact] public void Accepts_button_query_action_and_rejects_unknown_query_or_write_refresh_target()
[Fact] public void Read_validator_behaviour_unchanged()                      // mevcut okuma testleri yeşil kalır
```
- [ ] **Step 2–4:** Testler önce FAIL vermeli, sonra PASS. Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchema|FullyQualifiedName~WriteSqlValidator|FullyQualifiedName~ReportEndpoints|FullyQualifiedName~CustomSqlReport"`.
- [ ] **Step 5: Commit** — `git commit -m "Sayfa şeması: yazma sorgu türleri ve düğme sorgu eylemi"`

---

### Task 2: Yazma çalıştırma, haklar ve yazma denetimi

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs` (`TenantCustomPageWriteAudit`)
- Modify: `src/Platform/AIERP.Platform.Infrastructure/PlatformDbContext.cs`. Yalnız Platform'a eşlenir, 2. parçadaki erişim tablolarıyla aynı yöntemle.
- Create: Platform migration `AddCustomPageWriteAudit`
- Modify: `src/Hosts/AIERP.Api/CustomPageQueryEndpoints.cs`, `src/Hosts/AIERP.Api/CustomSqlReportRunner.cs` (yazma çalıştırıcısı)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (yanıtlara `rights` alanı)
- Test: `tests/IntegrationTests/CustomPageWriteQueryIntegrationTests.cs` (sahte fabrika), `tests/IntegrationTests/CustomPageWriteQuerySqlAcceptanceTests.cs` (`[SqlServerAcceptanceFact]`)

**Interfaces:**
- Consumes: Task 1; Part 1 `ITenantQueryConnectionFactory` (`TenantQueryAccess.Write`); Part 2 `GetRightsAsync`; Part 3 `CustomPageQueryParameters.Build`.
- Produces:
  - `internal static Task<int> CustomSqlReportRunner.ExecuteWriteAsync(string sql, IReadOnlyList<SqlParameter> parameters, Guid tenantId, ITenantQueryConnectionFactory factory, CancellationToken ct)`. Transaction içinde çalışır, commit ya da rollback yapar, etkilenen satır sayısını döner.
  - Yazma yanıtı: `CustomPageWriteResult(int AffectedRows)`.
  - Önizleme isteğine `bool ConfirmWrite` alanı eklenir.
  - Sayfa yanıtına `rights`: `CustomPageRightsView(bool View, bool Insert, bool Update, bool Delete)`.
  - Kontrol sırası: hak → sorgu → parametre → (önizlemede) onay → SQL'in yeniden doğrulanması (`TryValidateWriteSql`) → bağlantı.

- [ ] **Step 1: Write the failing tests**
```csharp
[Fact] public async Task Write_without_matching_right_is_forbidden_and_factory_not_called()   // Insert hakkı var, update sorgusu → 403
[Fact] public async Task Write_uses_write_connection_access()                                  // sahte fabrika Write erişimi aldı
[Fact] public async Task Failed_write_attempt_is_audited()                                     // fabrika SqlException fırlatır → audit Succeeded=false
[Fact] public async Task Preview_write_requires_explicit_confirmation()
[Fact] public async Task Published_response_includes_user_rights()
[SqlServerAcceptanceFact] public async Task Write_commits_and_returns_affected_rows()
[SqlServerAcceptanceFact] public async Task Failed_write_rolls_back_and_is_audited()
```
- [ ] **Step 2–4:** Testler önce FAIL vermeli, sonra PASS. Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage"` ve `dotnet test tests/UnitTests/AIERP.Platform.UnitTests`. `has-pending-model-changes` Platform ve Tenant için temiz olmalı.
- [ ] **Step 5: Commit** — `git commit -m "API: sayfa yazma sorguları, hak kontrolü ve yazma denetimi"`

---

### Task 3: Tasarımcı uç noktalarında SQL'i gizleme

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (`GET /{id}`, `GET /{id}/history`)
- Test: `tests/IntegrationTests/CustomPageQueryRulesIntegrationTests.cs` (ekleme)

**Interfaces:** Yanıt şekli aynı kalır. Yönetici olmayan kullanıcı için `definitionJson` alanı `TenantCustomPageQueries.WithoutQuerySql` uygulanmış hâliyle döner. Yöneticilik membership kaydından yeniden doğrulanır.

- [ ] **Step 1: Test:** `Non_admin_get_and_history_hide_query_sql`, `Admin_get_and_history_include_query_sql`
- [ ] **Step 2–4:** Testler önce FAIL vermeli, sonra PASS (aynı filtre).
- [ ] **Step 5: Commit** — `git commit -m "API: tasarımcı uç noktalarında sorgu SQL'i yalnız yöneticiye"`

---

### Task 4: ERP — sorgu eylemli düğmeler

**Files:**
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`, `frontend/erp-web/src/custom-page/usePageQueries.ts` (yeniden çalıştırma ve yazma çağrısı)
- Create: `frontend/erp-web/src/custom-page/ConfirmDialog.tsx`. Erp-web'de paylaşılan bir onay penceresi varsa o kullanılır; önce aranmalı.
- Modify: `frontend/erp-web/src/tenant-custom-page.css`

**Interfaces:**
- Consumes: Task 2 yanıtları (`rights`, `affectedRows`).
- **Davranış:** Global Constraints'teki "ERP davranışı" maddesinin tamamı.
  - Onay metni ve mesajlar mevcut `interpolate` ile çözülür.
  - Yazma çağrısının parametreleri okuma sorgularıyla aynı yoldan çözülür.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `cd frontend/erp-web && npm run build`. Expected: exit 0.
- [ ] **Step 3:** Commit — `git commit -m "ERP: özel sayfada sorgu eylemli düğmeler ve onay penceresi"`

---

### Task 5: Studio — yazma türleri ve düğme sorgu eylemi

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/QueriesPanel.tsx`, `CustomPagesPage.tsx` (düğme özellikleri), `custom-pages.css`

**Interfaces:**
- Consumes: Task 1 şeması, Task 2 önizleme `confirmWrite` alanı.
- **Onaylanan taslak — Sorgular paneli:**
  - "Tür" dörtlü seçicisi: Okuma / Ekle / Güncelle / Sil.
  - Kartlardaki rozetler: Okuma yeşil; Ekle, Güncelle ve Sil uyarı renginde.
  - Yazma türünde "Çalışma" seçimi gizlenir ve yerine "Yalnız düğmeyle çalışır." notu çıkar.
  - Önizleme düğmesi yazma türünde "Gerçekten çalıştır…" olur. Tıklanınca onay sorulur ("Bu sorgu verileri değiştirecek. Devam edilsin mi?"), sonra `confirmWrite: true` gönderilir. Sonuç "{n} kayıt etkilendi." olarak gösterilir.
- **Onaylanan taslak — Eylem düğmesi özellikleri:**
  - "Eylem türü" ikili seçici: İş akışı / Sorgu.
  - "Sorgu" seçilince:
    - "Çalıştırılacak sorgu" açılır listesi; her seçenek "ad (Tür)" biçiminde.
    - "Onay iste" onay kutusu; açıkken bağlanabilir onay metni (BindingInput).
    - "Sonra yenile" alanı: okuma sorgularından çoklu seçim, seçilenler çip olarak.
    - "Başarı mesajı" ve "Hata mesajı" alanları (BindingInput).
  - `update`/`delete` sorgusu seçilince "Onay iste" otomatik açılır.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `cd frontend/development-studio && npm run build`. Expected: exit 0.
- [ ] **Step 3:** Sahte API ile tarayıcıda görsel kontrol: tür seçici, düğme özellikleri, "Gerçekten çalıştır…" akışı. Sahte sunucu: `C:/Users/FATIH/AppData/Local/Temp/claude/a6482446cdd1d12c/3e9727ed-d073-4da2-a618-5136c47a3d1f/scratchpad/mock/vite.mock.config.ts`. Yapılamazsa açıkça belirtilir.
- [ ] **Step 4:** Commit — `git commit -m "Studio: yazma sorgu türleri ve düğme sorgu eylemi"`
