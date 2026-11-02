# Firma oluşturma ve ayrı veritabanı sağlama

Yeni firma kaydı, SQL üzerinde veritabanı yaratma yetkisi gerektirdiği için web isteğinden çalıştırılmaz. Platform Admin veya veritabanı operatörü, Platform API'nin bakım komutunu tek seferlik çalıştırır. Çalışan servislerde `Database:SeparationEnabled=true` zorunludur; ortak firma veritabanı çalışma modu desteklenmez. Eski ortak veritabanı yalnızca bakım penceresinde alınmış ve doğrulanmış yedekten firma veritabanlarına veri kopyalama işleminde kaynak olabilir; ayar değişikliği tek başına veri taşımaz. Yeni firma provision işlemi için `Database:SeparationEnabled=true` olmalı; mevcut bir Platform veritabanından veri kopyalanıyorsa kaynak veritabanı yedeği doğrulanmalı ve `Database:SeparationBackupPath` ayarlı olmalıdır. Platform veritabanı aynı ilk kurulum çalıştırmasında oluşturuluyorsa henüz önceki veri bulunmadığından ilk otomatik provision yedek şartından muaftır. Var olan veritabanları bu istisnadan yararlanmaz.

## Veritabanı sınırları ve firma ayarları

Her firma için `AIERPTenant_<tenant-guid>` adında ayrı bir SQL veritabanı vardır; firma kapsamındaki ERP işlemleri seçili firmanın bu veritabanına yönlendirilir. `AIERPPlatform` kullanıcı, üyelik, firma kataloğu ve veritabanı kataloğu gibi platform kayıtlarını tutar. `AIERPStudio` geliştirme stüdyosu verilerini ayrı veritabanında tutar; bu veriler tenant kimliğiyle kapsamlanır ve firma ERP işlem veritabanı değildir. Dolayısıyla “firma başına ayrı veritabanı” kuralı ERP operasyon verileri için geçerlidir; platform kimlik/katalog verisi ve Studio saklama topolojisi farklıdır.

Firma ayarları ekranında negatif stok politikası, baz para birimi, denetim kaydı saklama süresi, lisans yönetimi ve firma profili bulunur. Firma profilini yalnızca `TenantAdmin` güncelleyebilir; diğer aktif firma üyeleri vergi numarasını maskeli (yalnızca son dört hane) görür. API yanıtları hassas firma profili verisi için `Cache-Control: no-store` döndürür; denetim kaydı vergi numarasını içermez. Negatif stok tercihi bile seri/lot takibi, depo konumu ve aktif rezervasyon gibi kontrolleri kaldırmaz. Yeni firma oluşturma ve ayrı veritabanı sağlama web ekranından değil aşağıdaki operatör komutundan yapılır. Diğer parametrelerin firma ayarı haline getirilmesi için her parametrenin etki alanı, varsayılanı, geçiş davranışı ve yetki sahibi belirlenmelidir; henüz tanımlanmamış parametreler için genel bir ayar deposu varsayılmamalıdır.

Komut Platform veritabanına şirket adını, slug'ını ve para birimini kaydeder; seçilen kullanıcıya `TenantAdmin` üyeliği verir; sonra var olan tenant veritabanı provisioner'ıyla `AIERPTenant_<tenant-guid>` veritabanını oluşturur, tenant migration'larını uygular, tenant kayıtlarını sınırlar, runtime SQL erişimini verir ve izolasyonu doğrular. Aynı slug ve aynı şirket bilgileriyle tekrar çalıştırmak provisioning başarısız olduğunda güvenli yeniden deneme sağlar. Var olan kullanıcı seçilirse şifresi değişmez. Yeni kullanıcı için parola yalnızca bir secret environment variable üzerinden verilir; komut satırı argümanına koymayın.

## Docker Compose

Önce gerekli ortam değişkenlerini mevcut secret yöneticisine veya geçici shell ortamına ekleyin:

- `TENANT_PROVISIONING_NAME`: görünen firma adı.
- `TENANT_PROVISIONING_SLUG`: küçük harfli, rakam ve tirelerden oluşan benzersiz slug.
- `TENANT_PROVISIONING_BASE_CURRENCY_CODE`: ISO 4217 üç harfli para birimi kodu; varsayılan `TRY`.
- `TENANT_PROVISIONING_ADMIN_EMAIL`: ilk firma yöneticisinin e-posta adresi.
- `TENANT_PROVISIONING_ADMIN_DISPLAY_NAME`: ilk firma yöneticisinin adı.
- `TENANT_PROVISIONING_ADMIN_PASSWORD`: yalnızca bu e-posta Platform'da yeni kullanıcıysa gerekli, 12–256 karakter.

Compose env var isimlerini API'nin .NET configuration adlarına bağlayarak komutu çalıştırın:

```powershell
$env:TENANT_PROVISIONING_NAME = 'Örnek A.Ş.'
$env:TENANT_PROVISIONING_SLUG = 'ornek-as'
$env:TENANT_PROVISIONING_BASE_CURRENCY_CODE = 'TRY'
$env:TENANT_PROVISIONING_ADMIN_EMAIL = 'yonetici@example.com'
$env:TENANT_PROVISIONING_ADMIN_DISPLAY_NAME = 'Firma Yöneticisi'
# Yalnızca yeni kullanıcı oluşturulacaksa parolayı güvenli biçimde sağlayın.
$env:TENANT_PROVISIONING_ADMIN_PASSWORD = '<secret>'
docker compose -f deploy/docker/docker-compose.yml run --rm `
  -e TenantProvisioning__Name=$env:TENANT_PROVISIONING_NAME `
  -e TenantProvisioning__Slug=$env:TENANT_PROVISIONING_SLUG `
  -e TenantProvisioning__BaseCurrencyCode=$env:TENANT_PROVISIONING_BASE_CURRENCY_CODE `
  -e TenantProvisioning__AdminEmail=$env:TENANT_PROVISIONING_ADMIN_EMAIL `
  -e TenantProvisioning__AdminDisplayName=$env:TENANT_PROVISIONING_ADMIN_DISPLAY_NAME `
  -e TenantProvisioning__AdminPassword=$env:TENANT_PROVISIONING_ADMIN_PASSWORD `
  platform-api --create-company
```

Komut başarılıysa tenant GUID'ini ve oluşturulan DB adını bildirir. İlk girişte yönetici, verilen e-posta/şifreyle oturum açıp yeni firmayı seçer. Yeniden çalıştırmada aynı slug kullanılmalıdır. Başarısız DB provisioning'i `TenantDatabaseCatalog`'da `Failed` durumunda kalır; aynı komut tekrar çalıştırılarak provisioner yeniden denenebilir. Kaynak veritabanı yedeği şartı sağlanmazsa komut tenant veritabanı oluşturmaz.

## Eski ortak veritabanından kesim

`--migrate-only` tenant/Studio kopyalarını Ready yapar, ancak eski Platform veritabanındaki şirket işlem satırlarını silmez. Kesimi tamamlamak için servis yazıcıları kapalıyken son kopya doğrulamasından sonra yeni, checksum korumalı bir Platform tam yedeği alın. `Database:SeparationBackupPath` bu dosyayı göstermelidir ve SQL Server `RESTORE VERIFYONLY WITH CHECKSUM` kontrolünden geçmelidir. Önce `--legacy-tenant-data-purge-preview` ile yalnızca tablo ve satır adetlerini inceleyin. Daha sonra `--purge-legacy-tenant-data --confirm-legacy-tenant-data-purge=I_HAVE_VERIFIED_BACKUP_AND_COPIES` komutunu operatör olarak çalıştırın. Araç bütün şirket DB'lerinin ve AIERPStudio'nun Ready olduğunu, her şirket için her karşılaştırılabilir sütunun kaynak/hedef değerlerinin iki yönlü eşleştiğini tekrar kontrol eder. Bu karşılaştırma ile purge arasında kaynak ve hedef tablolar kilitli tutulur. Araç yalnızca TenantDbContext ile eşlenen, kayıtlı TenantId'lere ait işlem satırlarını tek transaction'da siler; audit tablosu da aynı SQL oturumundaki retention context'i geçici olarak kullanır. Platform firma, kullanıcı, üyelik ve DB kataloğu kayıtlarını korur ve transaction'ı ancak operasyon tabloları boş, kısıtlar güvenilir kaldığında commit eder. Yedek eski satırları kurtarma amacıyla içerir; aktif çalışma veritabanı olarak kullanılmaz. Bu komut normal servis başlangıcında veya migration sırasında çağrılmaz.

SQL kabul testi varsayılan olarak atlanır. Yalnızca özel, disposable SQL Server örneği için `AIERP_LEGACY_PURGE_ACCEPTANCE_SQL_CONNECTION_STRING` ve `AIERP_LEGACY_PURGE_ACCEPTANCE_DISPOSABLE_INSTANCE=YES_CREATE_AND_DROP_ISOLATED_DATABASES` ayarlayın. Test her çalıştırmada benzersiz Platform, tenant ve Studio veritabanları oluşturur; canonical `AIERPStudio` veritabanına bağlanmaz ve sadece kendisinin oluşturduğu test veritabanlarını siler.

## Şu an kapsam dışı

Tenant şeması firma adı, slug ve temel para birimini destekler. Ticari unvan, vergi dairesi ve firma VKN'si ayrı `AIERPPlatform` profil kaydında tutulur; bu değerler tenant ERP veritabanına kopyalanmaz. Resmî adres ve yetkili iletişim bilgileri henüz desteklenmez. Provisioning komutu tenant ve ayrı ERP veritabanı oluşturur; firma profili daha sonra Firma ayarları ekranında girilir.
