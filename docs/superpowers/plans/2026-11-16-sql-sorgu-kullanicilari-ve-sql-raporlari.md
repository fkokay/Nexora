# Parça 1 — Kiracı sorgu SQL kullanıcıları ve SQL raporları: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her kiracı ERP veritabanı için okuma ve yazma amaçlı iki ayrı SQL kullanıcısı oluşturmak, Vault'ta saklamak ve rapor oluşturucudaki SQL raporlarını yalnız TenantAdmin için okuma kullanıcısıyla çalıştırmak.

**Architecture:** `TenantSqlDatabaseComponent` enum'una `ErpQueryRead` ve `ErpQueryWrite` eklenir. Login'ler mevcut imzalı `master` yordamıyla oluşturulur, kimlik bilgileri mevcut Vault yoluna (`tenants/<id>/sql/...`) yazılır, veritabanı yetkileri bileşene göre verilir. API'de yeni `ITenantQueryConnectionFactory` bu kimlik bilgileriyle bağlantı açar. `CustomSqlReportRunner` `/api/reports/run` ve `/export` içindeki 503 dalının yerini alır. Yazma kullanıcısı bu parçada yalnız oluşturulur; onu kullanan kod 4. parçadadır.

**Tech Stack:** .NET 10, ASP.NET Core minimal API, EF Core, `Microsoft.Data.SqlClient`, SQL Server 2022 (imzalı yordamlar), HashiCorp Vault KV v2, xUnit.

**Spec:** `docs/superpowers/specs/2026-11-16-salt-okunur-sql-raporlari-design.md` (bölüm 1, 7, 9 ve "Teslim sırası" 1. madde).

## Global Constraints

- Okuma kullanıcısı yalnız `db_datareader` üyesidir. Yazma kullanıcısı `db_datareader` + `db_datawriter` üyesidir. İkisine de `EXECUTE`, şema değiştirme, `VIEW SERVER STATE` verilmez.
- Kullanıcı adları: okuma `aierp_tr_<tenantId:N>`, yazma `aierp_tw_<tenantId:N>`. Veritabanı her ikisi için `AIERPTenant_<tenantId:N>`.
- Vault yolları: `tenants/<tenantId:D>/sql/erp-query-read` ve `tenants/<tenantId:D>/sql/erp-query-write`. Mevcut politika `secret/data/tenants/+/sql/*` bunları kapsar.
- İmzalı yordam bileşen kodları: `Erp=1`, `AiStudio=2`, `ErpQueryRead=3`, `ErpQueryWrite=4`.
- SQL raporu sınırları: komut zaman aşımı **30 sn**, en fazla **5.000** satır okunur, sayfa boyutu en fazla **500**.
- SQL raporlarını yalnız TenantAdmin çalıştırır. Çok firmalı raporda kullanıcı seçilen **her** firmada TenantAdmin olmalıdır.
- Başarısız-kapalı: `Database:SeparationEnabled` false ise, kiracı katalog kaydı `Ready` değilse ya da Vault kimlik bilgisi okunamaz/uyuşmazsa SQL raporu 503 döner; paylaşılan bağlantı asla kullanılmaz.
- Kullanıcıya görünen metinler Türkçedir.
- Katman sınırları (`ArchitectureBoundaryTests`) bozulmaz; yeni Infrastructure tipleri `AIERP.Api`'ye referans vermez.

## Review Focus

1. **Bir firmada yetkisiz kullanıcı.** Kullanıcı seçilen firmalardan birinde yalnız TenantUser ise istek bütünüyle 403 döner ve hiçbir firmada sorgu çalışmaz. Test: Task 5 `CustomSql_is_forbidden_when_user_is_not_admin_in_every_selected_company`.
2. **5.000 satırı aşan sorgu.** 5.000 satır okunur, fazlası okunmaz. Yanıtta `truncated: true` döner, bellek sınırlı kalır. Test: Task 5 `Runner_stops_reading_after_max_rows_and_marks_truncated`.
3. **Boş ya da yinelenen sütun adları.** `SELECT 1, 2` ya da `SELECT a, a` sorgularında sütunlar `Sütun 1`, `a`, `a (2)` gibi benzersiz ve kararlı kodlar alır. Test: Task 5 `Runner_names_unnamed_and_duplicate_columns_uniquely`.
4. **Zaman aşımı ve SQL hataları.** 30 sn'yi aşan sorgu "Sorgu 30 saniye içinde tamamlanmadı." mesajıyla 400 döner. Sözdizimi ya da yetki hatası SQL Server mesajıyla 400 döner, 500 dönmez. Test: Task 5 `Runner_maps_sql_errors_to_validation_problem` (SQL kabul testi).
5. **Firmalar arasında farklı sütun kümesi.** Aynı sorgu iki firmada farklı sütunlar döndürürse 400 "Seçilen firmalarda sorgu farklı sütunlar döndürdü." döner. Test: Task 5 `Runner_rejects_mismatched_columns_across_companies`.

---

### Task 1: Sorgu bileşenleri ve adlandırma

**Files:**
- Modify: `src/Platform/AIERP.Platform.Infrastructure/VaultTenantSqlCredentialStore.cs` (enum `TenantSqlDatabaseComponent`, `TenantSqlCredentialPath.ForTenant`, `DatabaseName`, `IsValidUserName`)
- Modify: `src/Platform/AIERP.Platform.Infrastructure/TenantDatabaseProvisioner.cs:202-209` (`CreateTenantRuntimeCredential`), `:455-460` (`ComponentCode`)
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/TenantDatabaseProvisionerTests.cs`, `tests/UnitTests/AIERP.Platform.UnitTests/VaultTenantSqlCredentialStoreTests.cs`, `tests/UnitTests/AIERP.Platform.UnitTests/TenantDatabaseRoutingTests.cs`

**Interfaces:**
- Produces: `TenantSqlDatabaseComponent.ErpQueryRead`, `TenantSqlDatabaseComponent.ErpQueryWrite` (enum sırası: `Erp, AiStudio, ErpQueryRead, ErpQueryWrite`); `TenantDatabaseProvisioner.ComponentCode` → 3 / 4; `TenantSqlCredentialPath.ForTenant` → `.../sql/erp-query-read` / `.../sql/erp-query-write`; `DatabaseName` → `AIERPTenant_<N>`; `IsValidUserName` → `aierp_tr_<N>` / `aierp_tw_<N>`. `TenantDatabaseRouting.BuildComponentConnectionString` değişmeden yeni bileşenlerle çalışır.

- [ ] **Step 1: Write the failing tests**

```csharp
// TenantDatabaseProvisionerTests: mevcut Theory'ye ekle
[InlineData(TenantSqlDatabaseComponent.ErpQueryRead, 3)]
[InlineData(TenantSqlDatabaseComponent.ErpQueryWrite, 4)]

[Theory]
[InlineData(TenantSqlDatabaseComponent.ErpQueryRead, "aierp_tr_")]
[InlineData(TenantSqlDatabaseComponent.ErpQueryWrite, "aierp_tw_")]
public void Query_credentials_target_the_tenant_erp_database_with_dedicated_logins(TenantSqlDatabaseComponent component, string prefix)
{
    var tenantId = Guid.NewGuid();
    var credential = TenantDatabaseProvisioner.CreateTenantRuntimeCredential(tenantId, component);
    Assert.Equal($"AIERPTenant_{tenantId:N}", credential.DatabaseName);
    Assert.Equal($"{prefix}{tenantId:N}", credential.UserName);
    Assert.True(TenantSqlCredentialPath.IsValidUserName(tenantId, component, credential.UserName));
    Assert.False(TenantSqlCredentialPath.IsValidUserName(tenantId, TenantSqlDatabaseComponent.Erp, credential.UserName));
}

// VaultTenantSqlCredentialStoreTests
[Theory]
[InlineData(TenantSqlDatabaseComponent.ErpQueryRead, "erp-query-read")]
[InlineData(TenantSqlDatabaseComponent.ErpQueryWrite, "erp-query-write")]
public void Query_credential_paths_stay_under_the_tenant_sql_policy(TenantSqlDatabaseComponent component, string leaf)
{
    var tenantId = Guid.NewGuid();
    Assert.Equal($"tenants/{tenantId:D}/sql/{leaf}", TenantSqlCredentialPath.ForTenant(tenantId, component));
}

// TenantDatabaseRoutingTests
[Fact]
public void Query_read_connection_uses_read_login_on_tenant_erp_database() { /* BuildComponentConnectionString(template, tenantId, ErpQueryRead, credential) → InitialCatalog AIERPTenant_<N>, UserID aierp_tr_<N>; Erp kullanıcı adlı credential ile InvalidOperationException */ }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~TenantDatabaseProvisionerTests|FullyQualifiedName~VaultTenantSqlCredentialStoreTests|FullyQualifiedName~TenantDatabaseRoutingTests"`
Expected: FAIL. `ErpQueryRead` tanımlı olmadığı için derleme hatası verir.

- [ ] **Step 3: Implement**

Enum'a iki değer eklenir; üç `switch` ve `CreateTenantRuntimeCredential`/`ComponentCode` Interfaces'teki değerlerle genişletilir.

- [ ] **Step 4: Run tests to verify they pass**

Run: aynı komut. Expected: PASS. Ardından `dotnet test tests/UnitTests/AIERP.Platform.UnitTests` tamamen PASS olmalıdır.

- [ ] **Step 5: Commit**

```bash
git add src/Platform/AIERP.Platform.Infrastructure tests/UnitTests/AIERP.Platform.UnitTests
git commit -m "Platform: kiracı sorgu okuma/yazma SQL bileşenleri"
```

---

### Task 2: İmzalı yordam yeni bileşenleri kabul eder

**Files:**
- Modify: `deploy/sql/Install-TenantProvisioningBoundary.sql:115-175` (`dbo.NexoraEnsureTenantSqlLogin`)
- Modify: `deploy/sql/Tenant-provisioning-boundary.md` (bileşen kodları tablosu, yeniden kurulum notu)
- Test: `tests/IntegrationTests/TenantProvisioningSqlBoundaryAcceptanceTests.cs`

**Interfaces:**
- Consumes: Task 1 bileşen kodları 3/4.
- Produces: `NexoraEnsureTenantSqlLogin @Component IN (1,2,3,4)`. 3 → login `aierp_tr_<N>`, 4 → `aierp_tw_<N>`, ikisinin de veritabanı ve `DEFAULT_DATABASE` değeri `AIERPTenant_<N>`. Durum kapıları (aktif/pasif kiracı, katalog `Ready`/`Copying`, kira süresi) bileşen 1 ile **aynıdır**. `NexoraEnsureTenantDatabase` ve `NexoraTenantDatabaseExists` değişmez; bunlar yalnız 1/2 kabul eder.

- [ ] **Step 1: Write the failing acceptance test**

`[TenantProvisioningSqlBoundaryFact] Signed_boundary_creates_query_logins_only_for_a_ready_tenant_erp_database`. Doğrulamalar:
- Ready bir kiracı için bileşen 3 ve 4 login'leri oluşur. `sys.server_principals` içinde `aierp_tr_<N>`/`aierp_tw_<N>` bulunur, `default_database_name = AIERPTenant_<N>` olur.
- ERP kataloğu Ready olmayan aktif kiracı için `THROW 51023` alınır.
- `@Component = 5` için `THROW 51020` alınır.

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~Signed_boundary_creates_query_logins"`. Bu test için mevcut boundary testlerinin ortam değişkeni ayarlı olmalıdır.
Expected: FAIL (51020). Ortam yoksa SKIP olur; bu durum raporda açıkça belirtilir.

- [ ] **Step 3: Implement**

`@Component NOT IN (1,2)` → `NOT IN (1,2,3,4)`. `@DatabaseName` ve `@LoginName` `CASE`'lerine 3/4 eklenir. Dinamik SQL kapısında `@Comp=1` koşulları `@Comp IN (1,3,4)` olur. İmza, yordam her `CREATE OR ALTER` sonrası script'in mevcut imzalama adımıyla yeniden atılır; bu adımın yordamın sonunda çalıştığı doğrulanır.

- [ ] **Step 4: Run to verify it passes**

Run: aynı komut + `--filter "FullyQualifiedName~TenantProvisioningSqlBoundaryAcceptanceTests"`. Expected: PASS (ya da ortam yoksa SKIP).

- [ ] **Step 5: Commit**

```bash
git add deploy/sql tests/IntegrationTests/TenantProvisioningSqlBoundaryAcceptanceTests.cs
git commit -m "SQL sınırı: kiracı sorgu login'leri için bileşen 3/4"
```

---

### Task 3: Provisioning, mevcut kiracı komutu ve veritabanı yetkileri

**Files:**
- Modify: `src/Platform/AIERP.Platform.Infrastructure/TenantDatabaseProvisioner.cs`
  - `EnsureTenantSqlPrincipalAsync`: bileşeni parametre olarak alır.
  - Yetki SQL'i yeni yardımcıya taşınır.
  - Yeni kiracı akışı `:98`, `:166` civarı.
  - Yeni metot eklenir.
- Modify: `src/Hosts/AIERP.TenantProvisioningWorker/Program.cs` (yeni komut satırı argümanı)
- Create: `deploy/sql/Grant-TenantQueryPrincipals.sql`
- Create: `docs/tenant-query-credentials.md` (runbook)
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/TenantDatabaseProvisionerTests.cs`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces:
  - `internal static string TenantDatabaseProvisioner.BuildDatabaseAccessSql(TenantSqlDatabaseComponent component, string userName)`. Kullanıcı yoksa oluşturur, varsa login eşlemesini doğrular (mevcut `THROW 51001` korunur). Rol üyelikleri:
    - `Erp` → reader + writer + `GRANT EXECUTE ON dbo.PurgeExpiredAuditEvents` (bugünkü davranış).
    - `ErpQueryRead` → yalnız `db_datareader`; ayrıca kullanıcı `db_datawriter` üyesiyse `ALTER ROLE [db_datawriter] DROP MEMBER`.
    - `ErpQueryWrite` → reader + writer, `EXECUTE` yok.
  - `public Task<TenantQueryCredentialResult> TenantDatabaseProvisioner.ProvisionQueryCredentialsForReadyTenantsAsync(CancellationToken)`, `public sealed record TenantQueryCredentialResult(int TenantCount, IReadOnlyList<Guid> FailedTenantIds)`.
  - Worker argümanı: `--provision-tenant-query-credentials`.

- [ ] **Step 1: Write the failing tests**

```csharp
[Fact]
public void Query_read_access_sql_grants_only_datareader()
{
    var sql = TenantDatabaseProvisioner.BuildDatabaseAccessSql(TenantSqlDatabaseComponent.ErpQueryRead, "aierp_tr_x");
    Assert.Contains("ALTER ROLE [db_datareader] ADD MEMBER [aierp_tr_x]", sql);
    Assert.DoesNotContain("[db_datawriter] ADD MEMBER", sql);
    Assert.Contains("ALTER ROLE [db_datawriter] DROP MEMBER [aierp_tr_x]", sql);
    Assert.DoesNotContain("GRANT EXECUTE", sql);
}

[Fact]
public void Query_write_access_sql_grants_reader_and_writer_without_execute() { /* reader+writer ADD MEMBER var, GRANT EXECUTE yok */ }

[Fact]
public void Erp_runtime_access_sql_keeps_existing_grants() { /* reader+writer+GRANT EXECUTE ON dbo.PurgeExpiredAuditEvents */ }
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~TenantDatabaseProvisionerTests"`. Expected: FAIL, derleme hatası.

- [ ] **Step 3: Implement**

1. **Yetki SQL'i.** `:254-301` arasındaki yetki SQL'i `BuildDatabaseAccessSql` içine taşınır; `EnsureTenantSqlPrincipalAsync(credential, component, ct, configureDatabaseAccess)` onu kullanır. Bileşen artık veritabanı adından çıkarılmaz.
2. **Yeni kiracı akışı.** Erp kimlik bilgisi oluşturulup doğrulandıktan hemen sonra aynı token'la `ErpQueryRead` ve `ErpQueryWrite` için `EnsureTenantRuntimeCredentialAsync` ve `VerifyTenantCredentialCannotReadOtherDatabasesAsync` çağrılır.
3. **Mevcut kiracılar.** `ProvisionQueryCredentialsForReadyTenantsAsync`, aktif ve ERP kataloğu `Ready` olan her kiracı için iki bileşende `EnsureTenantRuntimeCredentialAsync(..., configureDatabaseAccess: false)` çağırır. Kiracı başına hatayı yakalayıp `FailedTenantIds`'e ekler, diğerlerine devam eder. Vault okuma-geri doğrulaması korunur.
4. **Worker argümanı.** `--provision-tenant-query-credentials` yalnız başına verilir (mevcut argüman kalıplarındaki gibi). Sonucu loglar; başarısız kiracı varsa çıkış kodu 1 olur.
5. **`Grant-TenantQueryPrincipals.sql`.** sqlcmd değişkeni `TenantId` (N biçimi) alır. Hedef `AIERPTenant_$(TenantId)` veritabanında `BuildDatabaseAccessSql`'in iki sorgu bileşeni için ürettiği SQL ile **aynı** içeriği çalıştırır. Mevcut kiracılarda provisioning principal'ının kiracı veritabanına erişimi olmadığı için bu adım DBA/migrator tarafından yürütülür.
6. **Runbook.** `docs/tenant-query-credentials.md` sırayı anlatır: (1) Install-TenantProvisioningBoundary.sql'i yeniden kur, (2) worker'ı `--provision-tenant-query-credentials` ile çalıştır, (3) her kiracı için Grant script'i, (4) doğrulama sorguları (`sys.database_role_members`). `docs/tenant-provisioning-worker-deployment.md`'ye bağlantı eklenir.

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet test tests/UnitTests/AIERP.Platform.UnitTests` ve `dotnet build AIERP.slnx`. Expected: PASS, 0 hata.

- [ ] **Step 5: Commit**

```bash
git add src/Platform src/Hosts/AIERP.TenantProvisioningWorker deploy/sql docs/tenant-query-credentials.md docs/tenant-provisioning-worker-deployment.md tests/UnitTests
git commit -m "Provisioning: kiracı sorgu kullanıcıları, mevcut kiracı komutu ve yetki betiği"
```

---

### Task 4: Kiracı sorgu bağlantı fabrikası

**Files:**
- Create: `src/Platform/AIERP.Platform.Infrastructure/TenantQueryConnectionFactory.cs`
- Modify: `src/Hosts/AIERP.Api/Program.cs` (DI kaydı, `ConnectionStrings:Tenant` şablonu ve `Database:SeparationEnabled` ile)
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/TenantQueryConnectionFactoryTests.cs`

**Interfaces:**
- Consumes: Task 1, mevcut `ITenantSqlCredentialReader`, `PlatformDbContext.TenantDatabaseCatalog`.
- Produces:
```csharp
public enum TenantQueryAccess { Read, Write }
public sealed class TenantQueryUnavailableException(string message) : Exception(message);
public interface ITenantQueryConnectionFactory
{
    /// Açık bir SqlConnection döner; çağıran dispose eder.
    Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken);
}
public sealed class TenantQueryConnectionFactory(string connectionTemplate, bool separationEnabled,
    ITenantSqlCredentialReader credentialReader, Func<PlatformDbContext> platformDbFactory) : ITenantQueryConnectionFactory
{
    internal string BuildConnectionString(Guid tenantId, TenantQueryAccess access, TenantSqlCredential credential);
}
```

`BuildConnectionString`, `TenantDatabaseRouting.BuildComponentConnectionString` üzerine şunları ekler:
- `ApplicationName = "Nexora.TenantQuery.Read"` ya da `"...Write"`
- `ConnectTimeout = 10`
- `Pooling = true`

`OpenAsync` şu durumlarda `TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil.")` fırlatır; Vault ve SQL ayrıntılarını mesaja koymaz:
- ayrım kapalı;
- katalog kaydı yok, `Ready` değil ya da `DatabaseName` uyuşmuyor;
- Vault okuma hatası ya da kullanıcı adı/veritabanı uyuşmazlığı.

- [ ] **Step 1: Write the failing tests**

```csharp
[Fact] public async Task OpenAsync_fails_closed_when_separation_is_disabled()  // TenantQueryUnavailableException, credential reader hiç çağrılmaz
[Fact] public async Task OpenAsync_fails_closed_when_catalog_entry_is_not_ready() // InMemory PlatformDbContext, State=Copying
[Fact] public async Task OpenAsync_fails_closed_when_vault_returns_erp_runtime_login_for_query_read() // UserName aierp_t_<N> → exception
[Fact] public void BuildConnectionString_uses_read_login_and_application_name()
{
    // InitialCatalog AIERPTenant_<N>, UserID aierp_tr_<N>, ApplicationName "Nexora.TenantQuery.Read", IntegratedSecurity false
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~TenantQueryConnectionFactoryTests"`. Expected: FAIL, derleme hatası.

- [ ] **Step 3: Implement**

Read → `ErpQueryRead`, Write → `ErpQueryWrite`. Bağlantı açma hatası (`SqlException`) da `TenantQueryUnavailableException`'a çevrilir.

- [ ] **Step 4: Run to verify they pass**

Run: aynı + `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~ArchitectureBoundaryTests"`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Platform/AIERP.Platform.Infrastructure/TenantQueryConnectionFactory.cs src/Hosts/AIERP.Api/Program.cs tests/UnitTests
git commit -m "Platform: başarısız-kapalı kiracı sorgu bağlantı fabrikası"
```

---

### Task 5: SQL raporlarını çalıştırma

**Files:**
- Create: `src/Hosts/AIERP.Api/CustomSqlReportRunner.cs`
- Modify: `src/Hosts/AIERP.Api/ReportEndpoints.cs`
  - `:349-388` catalog: `customSql` yalnız TenantAdmin'e listelenir.
  - `:680-686` `RunAsync`.
  - `:748-753` `ExportAsync`.
  - `:5934` `ReportResult`'a son opsiyonel parametre `bool Truncated = false`.
- Modify: `docs/architecture.md` ve `docs/phase-status.md` (SQL raporları açıldı; canlı doğrulama yapılmadı notu)
- Test: `tests/IntegrationTests/CustomSqlReportIntegrationTests.cs` (InMemory, sahte fabrika), `tests/IntegrationTests/CustomSqlReportSqlAcceptanceTests.cs` (`[SqlServerAcceptanceFact]`), `tests/UnitTests/AIERP.Platform.UnitTests/CustomSqlReportRunnerTests.cs`

**Interfaces:**
- Consumes: Task 4 `ITenantQueryConnectionFactory`, `TenantQueryAccess.Read`, `TenantQueryUnavailableException`; mevcut `NormalizedReport`, `ReportResult`, `ReportColumn`, `Csv`/`CsvValue`.
- Produces:
```csharp
internal sealed record CustomSqlResult(IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, bool Truncated);
internal static class CustomSqlReportRunner
{
    internal const int CommandTimeoutSeconds = 30;
    internal const int MaxRows = 5000;
    internal const int MaxPageSize = 500;
    /// Yetki: her CompanyId için kullanıcının aktif üyeliği Role=="TenantAdmin" olmalı; değilse null döner (çağıran 403 verir).
    internal static Task<IReadOnlyList<(Guid TenantId, string CompanyName)>?> AuthorizeCompaniesAsync(
        Guid userId, IReadOnlyList<Guid> companyIds, PlatformDbContext platformDb, CancellationToken ct);
    internal static Task<CustomSqlResult> ExecuteAsync(string sql,
        IReadOnlyList<(Guid TenantId, string CompanyName)> companies, ITenantQueryConnectionFactory factory, CancellationToken ct);
    /// DbDataReader'dan en fazla maxRows satır okur; sütun kodlarını benzersizleştirir. Saf, birim test edilebilir.
    internal static Task<CustomSqlResult> ReadAsync(DbDataReader reader, int maxRows, CancellationToken ct);
    internal static IReadOnlyList<ReportColumn> DescribeColumns(DbDataReader reader);
}
```

Kurallar:
- **Sütunlar.**
  - Kod ve etiket SQL'deki addır.
  - Boş ad `Sütun {sıra}` olur.
  - Yinelenen ad `{ad} ({n})` olur; ilk kullanım ekisiz kalır.
  - Tür eşlemesi: sayısal tamsayı → `number`, decimal/float → `decimal`, `DateTime`/`DateTimeOffset`/`DateOnly` → `date`, `bool` → `boolean`, diğerleri → `text`.
  - Birden çok firma seçiliyse başa `new ReportColumn("companyName", "Firma", "text")` eklenir.
- **Değerler.** `DBNull` → `null`; `byte[]` → `"[ikili veri]"`.
- **Satır sınırı.** Toplam okunan satır `MaxRows`'a ulaşınca okuma durur ve `Truncated = true` olur. Çok firmalı raporda sınır firmalar arası toplamdır.
- **Firmalar arasında farklı sütunlar.** Firmalar arasında sütun kodları ya da türleri farklıysa `400` döner: "Seçilen firmalarda sorgu farklı sütunlar döndürdü."
- **Çalıştırma.** Okuma bağlantısında `CommandType.Text`, `CommandTimeout = 30`, `CommandBehavior.SequentialAccess` kullanılır.
- **Hata eşleme.**
  - `SqlException` Number `-2` → `400`, "Sorgu 30 saniye içinde tamamlanmadı."
  - Diğer `SqlException` → `400`, `"SQL hatası: {ex.Message}"`.
  - `TenantQueryUnavailableException` → `503`, aynı mesajla.
- **`RunAsync`.**
  - `role != "TenantAdmin"` → `403`.
  - `AuthorizeCompaniesAsync` null → `403`.
  - Sonuç bellekte sayfalanır (`Page`, `PageSize ≤ 500`).
  - Dönüş: `new ReportResult("customSql", columns, pageRows, page, pageSize, rows.Count, Truncated: truncated)`.
- **`ExportAsync`.**
  - Aynı yetki kuralları uygulanır.
  - Tüm satırlar (≤5.000) mevcut `Csv`/`CsvValue` ile, `protectFormula: true` olarak yazılır.
  - Dosya adı `sql-raporu.csv`.
- **Denetim.** Mevcut rapor denetim kaydı kalıbıyla (`erp.report.executed`, Resource `customSql`) kiracı başına yazılır. Sorgu metni yazılmaz, yalnız uzunluğu (`sqlLength=`) yazılır.

- [ ] **Step 1: Write the failing tests**

```csharp
// CustomSqlReportRunnerTests (DataTable.CreateDataReader ile)
[Fact] public async Task Runner_stops_reading_after_max_rows_and_marks_truncated()   // 7 satır, maxRows 5 → 5 satır, Truncated true
[Fact] public async Task Runner_names_unnamed_and_duplicate_columns_uniquely()        // ["", "a", "a"] → ["Sütun 1", "a", "a (2)"]
[Fact] public async Task Runner_maps_dbnull_and_binary_values()                       // null, "[ikili veri]"
[Fact] public void DescribeColumns_maps_clr_types_to_report_types()                    // int→number, decimal→decimal, DateTime→date, bool→boolean, Guid→text

// CustomSqlReportIntegrationTests (WebApplicationFactory, ITenantQueryConnectionFactory yerine çağrılırsa test başarısız olan sahte)
[Fact] public async Task CustomSql_is_forbidden_for_tenant_user()                       // 403, fabrika çağrılmadı
[Fact] public async Task CustomSql_is_forbidden_when_user_is_not_admin_in_every_selected_company() // 2 firma, birinde TenantUser → 403, fabrika çağrılmadı
[Fact] public async Task CustomSql_returns_503_when_query_connection_is_unavailable()   // fabrika TenantQueryUnavailableException → 503
[Fact] public async Task Catalog_lists_customSql_only_for_tenant_admin()

// CustomSqlReportSqlAcceptanceTests ([SqlServerAcceptanceFact]; izole kiracı DB + okuma kullanıcısı oluşturur)
[SqlServerAcceptanceFact] public async Task Read_login_cannot_write_even_if_validator_is_bypassed() // okuma bağlantısıyla doğrudan "INSERT INTO CustomerAccounts ..." → SqlException 229
[SqlServerAcceptanceFact] public async Task Read_login_cannot_read_platform_or_other_tenant_database() // "SELECT * FROM AIERPPlatform.dbo.Tenants" → SqlException
[SqlServerAcceptanceFact] public async Task Runner_returns_rows_from_tenant_database()
[SqlServerAcceptanceFact] public async Task Runner_maps_sql_errors_to_validation_problem()  // "SELECT * FROM YokTablo" → 400 "SQL hatası: ..."
[SqlServerAcceptanceFact] public async Task Runner_rejects_mismatched_columns_across_companies()
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~CustomSqlReportRunnerTests"` ve `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomSqlReport"`. Expected: FAIL (derleme / 503 beklentisi). SQL kabul testleri ortam yoksa SKIP.

- [ ] **Step 3: Implement**

`CustomSqlReportRunner.cs` Interfaces'teki imzalarla yazılır, `RunAsync`/`ExportAsync` 503 dalları runner çağrısına çevrilir. `TryValidateReadOnlySql` erken hata için yerinde kalır. `docs/architecture.md` rapor bölümüne ve `docs/phase-status.md`'ye kısa not eklenir: "SQL raporları okuma kullanıcısıyla açıldı; canlı ortamda kimlik bilgisi provisioning'i ve kabul testi henüz yapılmadı."

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet build AIERP.slnx` ve `dotnet test AIERP.slnx -m:1`. Ayrıca `cd frontend/erp-web && npm run build` ile `cd frontend/development-studio && npm run build` çalıştırılır; `ReportResult.truncated` eklemesi tip değişikliği gerektirmez, build yine doğrulanır.
Expected: tüm testler PASS (SQL kabul testleri ortam yoksa SKIP, raporda belirtilir), iki build başarılı.

- [ ] **Step 5: Commit**

```bash
git add src/Hosts/AIERP.Api tests docs/architecture.md docs/phase-status.md
git commit -m "Raporlar: SQL raporları yalnız yönetici için okuma kullanıcısıyla çalışır"
```
