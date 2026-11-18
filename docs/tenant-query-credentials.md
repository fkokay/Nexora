# Kiracı sorgu SQL kullanıcıları — runbook

Her kiracının ERP veritabanı (`AIERPTenant_<N>`) için, sayfa tasarımcısındaki SQL sorguları ve SQL raporları iki ayrı SQL login kullanır:

| Bileşen | Login | Vault yolu | Veritabanı yetkisi |
| --- | --- | --- | --- |
| `ErpQueryRead` (kod 3) | `aierp_tr_<N>` | `secret/data/tenants/<tenant-guid>/sql/erp-query-read` | yalnız `db_datareader` (varsa `db_datawriter` üyeliği kaldırılır; başka rol üyeliği `51002`, `CONNECT` dışında açık yetki `51003` ile durdurur) |
| `ErpQueryWrite` (kod 4) | `aierp_tw_<N>` | `secret/data/tenants/<tenant-guid>/sql/erp-query-write` | `db_datareader` + `db_datawriter`, `EXECUTE` yetkisi yok |

`<N>` kiracı GUID'inin tiresiz 32 haneli (`N`) biçimidir.

## Koruma katmanları

SQL raporlarında tek başına yeterli bir sınır yoktur; üç katman birlikte uygulanır:

1. **Metin doğrulayıcı** (API): yalnız tek bir `SELECT`/`WITH` kabul eder; yazma, kilit, dış kaynak, üç parçalı adlar ve sunucu meta verisini listeleyen adlar (`sys.sysdatabases`, `sys.master_files`, `DB_NAME`, `DB_ID`, `HAS_DBACCESS`, `SUSER_*`, `dm_*`, `xp_*` ...) reddedilir.
2. **Veritabanı yetkileri:** okuma login'i yalnız kendi kiracı veritabanında `db_datareader` üyesidir; diğer kiracı veritabanlarına ve PlatformDB'ye erişemez.
3. **Sunucu düzeyi DENY (otomatik):** veritabanı yetkileri sunucu meta verisini gizlemez. `DENY VIEW ANY DATABASE` olmadan login `sys.databases` / `DB_NAME()` ile diğer kiracı veritabanlarının adlarını (dolayısıyla kiracı GUID'lerini) görebilir; `master` içindeki `xp_dirtree`, `xp_fileexist`, `xp_subdirs` ise `public`'e açıktır. Sınır betiği bu DENY'leri DBA'nın sahip olduğu iki role koyar: sunucu rolü `NexoraTenantQueryLogins` (`DENY VIEW ANY DATABASE`) ve `master` rolü `NexoraTenantQueryUsers` (üç `xp_*` için `DENY EXECUTE`). İmzalı `master..NexoraEnsureTenantSqlLogin`, `@Component = 3/4` için her oluşturma ve parola yenilemede login'i sunucu rolüne ekler, `master` kullanıcısını oluşturur ve `master` rolüne ekler. İmzalayan sertifikaya yalnız bu iki rol üzerinde `ALTER` ve `master` içinde `ALTER ANY USER` verilir; sunucu genelinde DENY yetkisi verilmez. `deploy/sql/Grant-TenantQueryPrincipals.sql` aynı DENY'leri doğrudan da uygular (derinlemesine savunma).

## 1. ZORUNLU dağıtım öncesi adım: provisioning sınırını yeniden kur

Sorgu login'lerini oluşturan Worker sürümünü dağıtmadan **önce** `deploy/sql/Install-TenantProvisioningBoundary.sql` betiğini güncel sürümüyle yeniden çalıştırın (bkz. `deploy/sql/Tenant-provisioning-boundary.md`). Yeni Worker, her yeni kiracı provisioning'inde ve her migration-only yeniden denemede `@Component = 3/4` ile `master..NexoraEnsureTenantSqlLogin` çağırır; eski sınır kuruluysa bu işlerin tamamı `51020` (`Invalid tenant SQL credential request.`) ile başarısız olur.

```bash
sqlcmd -S <server> -d master -v TenantProvisioningLoginName=<worker-login> -i deploy/sql/Install-TenantProvisioningBoundary.sql
```

## Yeni kiracılar

Tenant Provisioning Worker, ERP kimlik bilgisini oluşturup doğruladıktan sonra iki sorgu login'ini de oluşturur, Vault'a yazar, geri okuyarak doğrular, veritabanı kullanıcısını ve rol üyeliklerini kurar, login'lerin diğer kiracı veritabanlarını ve PlatformDB'yi okuyamadığını doğrular ve okuma login'iyle kendi veritabanına bağlanıp `db_datawriter`, `db_owner`, `db_ddladmin` (ve `sysadmin`) üyesi olmadığını doğrular. Sunucu düzeyi DENY'ler login oluşturulurken imzalı yordam tarafından rol üyeliğiyle uygulanır; **yeni kiracı için DBA adımı gerekmez.**

## Mevcut (Ready) kiracılar

Provisioning principal'ı bilinçli olarak mevcut kiracı veritabanlarına erişemez. Bu yüzden login'ler (ve sunucu DENY rol üyelikleri) Worker ile, veritabanı kullanıcıları ve rol üyelikleri DBA/migrator tarafından ayrı bir betikle kurulur. Sıra: adım 1, sonra:

## 2. Worker'ı tek seferlik komutla çalıştır

```bash
dotnet AIERP.TenantProvisioningWorker.dll --provision-tenant-query-credentials
```

Argüman tek başına verilmelidir. Komut, aktif ve ERP kataloğu `Ready` olan her kiracı için iki login'i oluşturur (varsa parolasını yeniler), Vault'a yazar ve geri okuyarak doğrular; veritabanına dokunmaz. Bir kiracıdaki hata diğerlerini durdurmaz; hatanın türü ve SQL hata numarası Worker günlüğüne yazılır (kimlik bilgisi yazılmaz). Çıktı `tenants=<n>; failed=<m>` özetini ve başarısız kiracı kimliklerini verir; başarısız kiracı varsa çıkış kodu `1` olur. Komut idempotenttir; başarısız kiracılar için yeniden çalıştırılabilir (başarılı olanların parolası da yenilenir, Vault güncel kalır).

**Döndürme penceresi:** Parola yenilemede önce `ALTER LOGIN` (SQL), sonra Vault yazımı yapılır. Bu iki adım arasında API eski parolayı okuyabildiği için kısa süreli `503` ("Sorgu veritabanı erişimi bu firma için hazır değil.") yanıtları beklenir; komutu düşük trafik saatinde çalıştırın. `--migrate-existing-erp-tenant <tenant-guid>` komutu da migration-only yolunda sorgu kimlik bilgilerini aynı şekilde yeniler. Login `ALTER LOGIN` ile yenilendiği için sunucu DENY'leri korunur; yenileme ayrıca eksik rol üyeliklerini tamamlar (eski sınırla oluşturulmuş login'ler bu yolla geriye dönük sertleşir).

## 3. Mevcut kiracılar için yetki betiğini çalıştır

Yalnız mevcut kiracılar için (yeni kiracılarda Worker veritabanı eşlemesini kendisi yapar), ilgili login'ler oluşturulduktan sonra DBA/migrator yetkisiyle (sunucu düzeyinde `DENY` verebilen bir principal ile):

```bash
sqlcmd -S <server> -v TenantId=<tenant-guid-N> -i deploy/sql/Grant-TenantQueryPrincipals.sql
```

Betik önce `master` içinde sunucu sertleştirmesini doğrudan da uygular (rol üyeliğine ek olarak):

```sql
USE [master];
DENY VIEW ANY DATABASE TO [aierp_tr_<N>];
DENY VIEW ANY DATABASE TO [aierp_tw_<N>];
-- xp_* DENY'leri master içinde bir kullanıcı gerektirir.
IF DATABASE_PRINCIPAL_ID(N'aierp_tr_<N>') IS NULL CREATE USER [aierp_tr_<N>] FOR LOGIN [aierp_tr_<N>];
IF DATABASE_PRINCIPAL_ID(N'aierp_tw_<N>') IS NULL CREATE USER [aierp_tw_<N>] FOR LOGIN [aierp_tw_<N>];
DENY EXECUTE ON OBJECT::[sys].[xp_dirtree]   TO [aierp_tr_<N>], [aierp_tw_<N>];
DENY EXECUTE ON OBJECT::[sys].[xp_fileexist] TO [aierp_tr_<N>], [aierp_tw_<N>];
DENY EXECUTE ON OBJECT::[sys].[xp_subdirs]   TO [aierp_tr_<N>], [aierp_tw_<N>];
```

Ardından kiracı veritabanında `TenantDatabaseProvisioner.BuildDatabaseAccessSql`'in iki sorgu bileşeni için ürettiği SQL ile aynı ifadeleri çalıştırır (bir birim testi farklılaşmayı engeller). Kullanıcı varsa login eşlemesini doğrular, eşleşme yanlışsa `51001`; okuma kullanıcısı `db_datareader` dışında bir rolde kalırsa `51002`, `CONNECT` dışında açık yetkisi varsa `51003` ile durur. İdempotenttir.

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

Sunucu düzeyinde (betik bu sorguyu da çalıştırır):

```sql
SELECT [grantee].[name], [permission].[permission_name], [permission].[state_desc]
FROM sys.server_permissions AS [permission]
INNER JOIN sys.server_principals AS [grantee] ON [grantee].[principal_id] = [permission].[grantee_principal_id]
WHERE [grantee].[name] IN (N'aierp_tr_<N>', N'aierp_tw_<N>') AND [permission].[permission_name] = N'VIEW ANY DATABASE';
-- Beklenen: iki satır, state_desc = DENY.
```

Rol üyelikleri (her sorgu login'i için iki satır beklenir):

```sql
SELECT N'server' AS [Scope], SUSER_NAME([member_principal_id]) AS [Member]
FROM sys.server_role_members WHERE [role_principal_id] = SUSER_ID(N'NexoraTenantQueryLogins')
UNION ALL
SELECT N'master', USER_NAME([member_principal_id])
FROM master.sys.database_role_members WHERE [role_principal_id] = DATABASE_PRINCIPAL_ID(N'NexoraTenantQueryUsers');
```

Rol tabanlı sertleştirme `TenantProvisioningSqlBoundaryAcceptanceTests` ile disposable SQL Server 2022 üzerinde doğrulanır: sorgu login'i kendi veritabanına bağlanır, diğer kiracı veritabanlarını göremez (`sys.databases`, `DB_ID`), `xp_dirtree`/`xp_fileexist`/`xp_subdirs` `229` ile reddedilir, Worker rolleri doğrudan değiştiremez ve sınır betiği iki kez üst üste çalışır.
