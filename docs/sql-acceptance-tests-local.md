# Yerel SQL Server kabul testleri

Bu rehber, SQL Server gerektiren IntegrationTests kabul testlerini yerel ve izole bir Docker SQL Server üzerinde çalıştırmak içindir. Bu testler için harici/uzak bir SQL Server erişiminin hazır olduğu varsayılmaz.

## İzolasyon ve veri güvenliği

- Yalnızca sentetik test verisi kullanın. Geliştirme, staging veya üretim veritabanının bağlantı bilgisini bu değişkenlere vermeyin.
- SQL kabul fikstürleri `AIERP_REPORT_TEST_SQL_CONNECTION_STRING` ile etkinleşir. Testler bağlantı dizesindeki katalog adını her çalıştırmada benzersiz GUID'li test veritabanlarıyla değiştirir. Veritabanı oluşturma yetkisi gerekir.
- Bu testler oluşturdukları veritabanlarını, yalnızca `EnsureCreated` işlemi veritabanını gerçekten kendileri oluşturduysa temizler. Beklenmedik hata veya işlem kesintisi sonrasında Docker örneğini ve geçici veritabanlarını ayrıca kontrol edin.
- `LegacyTenantDataPurgerAcceptanceTests` özel olarak farklı bir bağlantı değişkeni kullanır ve Platform, tenant ve Studio için benzersiz test veritabanları oluşturup siler. `AIERPStudio` gibi gerçek/kullanılan kataloglara bağlanmaz.
- Bağlantı değişkeni SQL testlerini açar; genel entegrasyon testleri de komut kapsamındaysa onlar da çalışır. Legacy purger testi için ek onayı ayrıca vermediğiniz sürece o test atlanır.

## Geçici Docker SQL Server

PowerShell'de yalnızca yerel testler için güçlü bir parola belirleyin. Komutu üretim ortamında veya hassas verinin bulunduğu Docker hostunda çalıştırmayın. Aşağıdaki örnek host klasörü/volume bağlamaz; container'ı testler bitince durdurduğunuzda otomatik kaldırılır.

```powershell
$securePassword = Read-Host 'Yalnızca yerel SQL container için güçlü parola' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $env:NEXORA_SQL_SA_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
docker run --detach --rm --name nexora-sql-acceptance `
  --env ACCEPT_EULA=Y `
  --env MSSQL_SA_PASSWORD=$env:NEXORA_SQL_SA_PASSWORD `
  --publish 1433:1433 `
  mcr.microsoft.com/mssql/server:2022-latest

$env:AIERP_REPORT_TEST_SQL_CONNECTION_STRING = "Server=localhost,1433;Database=master;User Id=sa;Password=$env:NEXORA_SQL_SA_PASSWORD;Encrypt=True;TrustServerCertificate=True;Connect Timeout=15"
```

SQL Server'ın hazır olmasını bekleyin; ardından önce tek bir kabul testi çalıştırın. Örnek:

```powershell
dotnet test tests/IntegrationTests/AIERP.Api.IntegrationTests.csproj -c Release `
  --filter "FullyQualifiedName~SqlServerBankStatementLineReportAcceptanceTests"
```

SQL değişkeni ayarlı ve filtresiz çalıştırma, IntegrationTests projesinin tamamını ve SQL değişkenine bağlı kabul testlerini çalıştırır:

```powershell
dotnet test tests/IntegrationTests/AIERP.Api.IntegrationTests.csproj -c Release
```

İşiniz bitince Docker container'ını durdurun; `--rm` nedeniyle container ve içindeki geçici SQL verisi kaldırılır:

```powershell
docker stop nexora-sql-acceptance
Remove-Item Env:AIERP_REPORT_TEST_SQL_CONNECTION_STRING
Remove-Item Env:NEXORA_SQL_SA_PASSWORD
```

## Legacy purge kabul testi için ek kapı

Bu test yalnızca özel, disposable SQL Server üzerinde ve iki değişken de mevcutsa çalışır. `AIERP_REPORT_TEST_SQL_CONNECTION_STRING` bu test için kullanılmaz:

```powershell
$env:AIERP_LEGACY_PURGE_ACCEPTANCE_SQL_CONNECTION_STRING = "Server=localhost,1433;Database=master;User Id=sa;Password=$env:NEXORA_SQL_SA_PASSWORD;Encrypt=True;TrustServerCertificate=True;Connect Timeout=15"
$env:AIERP_LEGACY_PURGE_ACCEPTANCE_DISPOSABLE_INSTANCE = 'YES_CREATE_AND_DROP_ISOLATED_DATABASES'

dotnet test tests/IntegrationTests/AIERP.Api.IntegrationTests.csproj -c Release `
  --filter "FullyQualifiedName~LegacyTenantDataPurgerAcceptanceTests"
```

Bu açık onay değişkenini yalnızca geçici, ayrılmış SQL Server container'ını doğruladıktan sonra ayarlayın. Tamamlanınca legacy değişkenlerini de kaldırın:

```powershell
Remove-Item Env:AIERP_LEGACY_PURGE_ACCEPTANCE_SQL_CONNECTION_STRING
Remove-Item Env:AIERP_LEGACY_PURGE_ACCEPTANCE_DISPOSABLE_INSTANCE
```

## Güvenlik kontrol listesi

- Bağlantı `localhost,1433` üzerindeki, yalnızca bu iş için başlattığınız container'ı hedefliyor.
- Bağlantı dizesi yalnızca süreç ortam değişkeninde; repoya, `.env` dosyasına veya komut geçmişine parola kaydetmeyin.
- Teste başlamadan önce Docker container adını ve hedefi doğrulayın; var olan SQL servisleri için portu veya bağlantıyı değiştirmeyin.
- Test çalışırken container'ı veya Docker data volume'larını temizlemeyin. Bu örnekte volume bağlanmaz; testler sadece kendi benzersiz kabul veritabanlarını silmek üzere tasarlanmıştır.
- SQL Server dışı kimlik doğrulama/bağlantı sorunlarında parola veya bağlantı dizesini rapora yapıştırmayın.
