# Kiracı sorgu SQL kullanıcıları — runbook

Her kiracının ERP veritabanı (`AIERPTenant_<N>`) için, sayfa tasarımcısındaki SQL sorguları ve SQL raporları iki ayrı SQL login kullanır:

| Bileşen | Login | Vault yolu | Veritabanı yetkisi |
| --- | --- | --- | --- |
| `ErpQueryRead` (kod 3) | `aierp_tr_<N>` | `secret/data/tenants/<tenant-guid>/sql/erp-query-read` | yalnız `db_datareader` (varsa `db_datawriter` üyeliği kaldırılır) |
| `ErpQueryWrite` (kod 4) | `aierp_tw_<N>` | `secret/data/tenants/<tenant-guid>/sql/erp-query-write` | `db_datareader` + `db_datawriter`, `EXECUTE` yetkisi yok |

`<N>` kiracı GUID'inin tiresiz 32 haneli (`N`) biçimidir.

**Yeni kiracılar:** Tenant Provisioning Worker, ERP kimlik bilgisini oluşturup doğruladıktan sonra iki sorgu login'ini de oluşturur, Vault'a yazar, geri okuyarak doğrular, veritabanı kullanıcısını ve rol üyeliklerini kurar ve login'lerin diğer kiracı veritabanlarını ve PlatformDB'yi okuyamadığını doğrular. Ek işlem gerekmez.

**Mevcut (Ready) kiracılar:** Provisioning principal'ı bilinçli olarak mevcut kiracı veritabanlarına erişemez. Bu yüzden login'ler Worker ile, veritabanı kullanıcıları ve rol üyelikleri DBA/migrator tarafından ayrı bir betikle kurulur. Sıra:

## 1. Provisioning sınırını yeniden kur

`deploy/sql/Install-TenantProvisioningBoundary.sql` betiğini güncel sürümüyle yeniden çalıştırın (bkz. `deploy/sql/Tenant-provisioning-boundary.md`). İmzalı `master..NexoraEnsureTenantSqlLogin` yordamının `@Component = 3/4` değerlerini kabul eden sürümü kurulmadan Worker adımı başarısız olur.

```bash
sqlcmd -S <server> -d master -v TenantProvisioningLoginName=<worker-login> -i deploy/sql/Install-TenantProvisioningBoundary.sql
```

## 2. Worker'ı tek seferlik komutla çalıştır

```bash
dotnet AIERP.TenantProvisioningWorker.dll --provision-tenant-query-credentials
```

Argüman tek başına verilmelidir. Komut, aktif ve ERP kataloğu `Ready` olan her kiracı için iki login'i oluşturur (varsa parolasını yeniler), Vault'a yazar ve geri okuyarak doğrular; veritabanına dokunmaz. Bir kiracıdaki hata diğerlerini durdurmaz. Çıktı `tenants=<n>; failed=<m>` özetini ve başarısız kiracı kimliklerini verir; başarısız kiracı varsa çıkış kodu `1` olur. Komut idempotenttir; başarısız kiracılar için yeniden çalıştırılabilir (başarılı olanların parolası da yenilenir, Vault güncel kalır).

## 3. Her kiracı için yetki betiğini çalıştır

Her kiracı veritabanında, ilgili login'ler oluşturulduktan sonra DBA/migrator yetkisiyle:

```bash
sqlcmd -S <server> -v TenantId=<tenant-guid-N> -i deploy/sql/Grant-TenantQueryPrincipals.sql
```

Betik, `TenantDatabaseProvisioner.BuildDatabaseAccessSql`'in iki sorgu bileşeni için ürettiği SQL ile aynı ifadeleri çalıştırır (bir birim testi farklılaşmayı engeller). Kullanıcı varsa login eşlemesini doğrular, eşleşme yanlışsa `51001` ile durur. İdempotenttir.

## 4. Doğrula

Kiracı veritabanında:

```sql
SELECT [member].[name] AS [MemberName], [role].[name] AS [RoleName]
FROM sys.database_role_members AS [membership]
INNER JOIN sys.database_principals AS [role] ON [role].[principal_id] = [membership].[role_principal_id]
INNER JOIN sys.database_principals AS [member] ON [member].[principal_id] = [membership].[member_principal_id]
WHERE [member].[name] IN (N'aierp_tr_<N>', N'aierp_tw_<N>')
ORDER BY [member].[name], [role].[name];
```

Beklenen satırlar yalnızca: `aierp_tr_<N>` → `db_datareader`; `aierp_tw_<N>` → `db_datareader`, `db_datawriter`. Ayrıca iki kullanıcının da açık `EXECUTE` yetkisi olmamalıdır:

```sql
SELECT [principal].[name], [permission].[permission_name], [permission].[state_desc]
FROM sys.database_permissions AS [permission]
INNER JOIN sys.database_principals AS [principal] ON [principal].[principal_id] = [permission].[grantee_principal_id]
WHERE [principal].[name] IN (N'aierp_tr_<N>', N'aierp_tw_<N>') AND [permission].[permission_name] = N'EXECUTE';
-- Beklenen: satır yok.
```

Bu runbook disposable SQL Server/Vault üzerinde uçtan uca henüz doğrulanmamıştır; ilk canlı uygulama öncesinde disposable ortamda prova edilmelidir.
