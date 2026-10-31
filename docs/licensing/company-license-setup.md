# Firma lisanslarını hazırlama

Her lisans tek bir `TenantId` değerine, Small/Medium/Large paketine ve son kullanma tarihine bağlanır. Lisans kodu RSA-SHA256 ile imzalanır. Uygulama yalnız açık anahtarı kullanır; özel anahtar lisans veren tarafta çevrimdışı tutulmalıdır.

## Anahtar çifti

PowerShell 7 ve .NET 8 ile, depo dışındaki güvenli bir klasörde çalıştırın:

```powershell
pwsh ./scripts/New-NexoraLicenseKeyPair.ps1 `
  -PrivateKeyPath D:/Nexora-License-Secrets/issuer-private.pem `
  -PublicKeyPath D:/Nexora-License-Secrets/issuer-public.pem
```

Özel anahtarı depoya eklemeyin veya tarayıcıya göndermeyin. Platform Admin lisans oluşturma uç noktası imzalama yapabilsin diye özel anahtarı yalnız API sunucusunun erişebildiği, erişimi kısıtlı secret store içinde saklayın. Platform Admin dışındaki istemciler özel anahtara erişemez.

API için `Licensing:IssuerKeyId`, `Licensing:SigningKeys:<keyId>` ve `Licensing:PublicKeys:<keyId>` ayarlarını yapılandırın. Örneğin `issuer-2026` kimliği için:

```text
Licensing__IssuerKeyId=issuer-2026
Licensing__SigningKeys__issuer-2026=<issuer-private.pem dosyasının içeriği>
Licensing__PublicKeys__issuer-2026=<issuer-public.pem dosyasının içeriği>
```

Özel anahtarı secret store/deployment secret olarak sağlayın; `appsettings.json` veya depoya koymayın. Açık anahtar da secret store veya deployment ayarı üzerinden verilebilir.

## Lisans kodu üretme

Firma kimliğini yetkili yönetim ekranındaki tenant kimliğinden alın. Her firma için ayrı kod üretin:

```powershell
$grant = ./scripts/New-NexoraLicenseGrant.ps1 `
  -PrivateKeyPath D:/Nexora-License-Secrets/issuer-private.pem `
  -KeyId issuer-2026 `
  -TenantId 00000000-0000-0000-0000-000000000000 `
  -Tier Medium `
  -ExpiresAt '2027-10-21T00:00:00Z'
$grant | Set-Clipboard
```

Üretim komutu komut satırından lisans kodu oluşturur. Alternatif olarak Platform Admin içindeki `Lisanslar` bölümünden hazır firmayı, paketi ve bitiş tarihini seçerek kod üretebilirsiniz. Panel imzayı API sunucusundaki yapılandırılmış özel anahtarla atar ve yalnız PlatformSuperAdmin erişimine açıktır. Üretilen kodu müşteriye güvenli kanaldan iletin; firma yöneticisi `Firma ayarları → Firma lisansı` ekranında etkinleştirir. Kod üretimi lisansı otomatik etkinleştirmez. Sunucu imzayı, firma kimliğini, paket adını ve süreyi doğrular. Aynı lisans kimliği başka firmada etkinleştirilemez.

## Paket sınırları

Small: 10 kullanıcı, 3 özel modül ve 10 GB; Medium: 50 kullanıcı, 15 özel modül, 100 GB, gelişmiş iş akışları ve özel modül kaynak kodu; Large: kullanıcı/modül sayaçlarında ve depolama sınırında fiilen sınırsız profil, gelişmiş iş akışları ve özel modül kaynak kodu. Depolama, her firmanın ayrı SQL veritabanındaki ayrılmış `ROWS` data page kullanımı üzerinden denetlenir. Lisans GB sınırına ulaşan firmada data page tahsisini artıran mutasyonlar reddedilir; okumalar sürer ve mutasyonlar yalnızca tahsisi artırmadığında kabul edilir. Silmeler genel olarak muaf değildir; silme ve audit kaydı page tahsisini artırabilir. Ölçüm doğrulanamazsa yazma güvenli biçimde reddedilir. SQL transaction logları ve dış dosya deposu bu sayaca dahil değildir. Large paketindeki HA alanı yalnızca lisans metadata işaretidir; yüksek erişilebilirlik topolojisi veya SLA sağlamaz. Bu değerler imzalı v1 `tier` claim’inin katalogdaki profil karşılığıdır; GB paketlerinin ticari taahhüt olarak sunulmasından önce ürün sahibi sınırları ratifiye etmelidir. Fiyat veya müşteri sözleşmesi uygulamada tanımlanmaz.

Gelişmiş iş akışı lisans kapısı sunucuda iş akışı tanımı oluşturma, düzenleme, yayımlama ve yayımlanmış tanımdan yeni taslak oluşturma işlemlerini denetler. Lisanssız firmalar Small kabul edilir; bu işlemler için Medium veya Large gerekir. Lisans süresi dolmuş ya da metadata tutarsızsa yazma reddedilir. Saklanan tier ve sayaçların profil kataloğuyla eşleşmesi, grant özeti biçimiyle birlikte denetlenir; tutarsız kayıt üye değişikliği, yeni/çalıştırılan özel modül ve kaynak-kod erişimi için geçerli lisans sayılmaz. Daha önce yayımlanmış iş akışlarının çalıştırılması ve karar verilmesi lisans yenileme sürecinde mevcut operasyonların kesilmemesi için bu kapının dışında kalır.

Etkin lisans yönetim ekranı tenant kullanıcı ve etkin özel modül adetlerini gösterir. Sunucu lisans etkinleştirilirken mevcut üye sayısının paketin kullanıcı sınırını aşmasını reddeder; özel modül sayısı yeni aktivasyonda, lisans süresi de yeni aktivasyon ve modül çalıştırma sırasında uygulanır. `GET /api/access-control/members/candidate?email=...` tek, tam e-posta adresine göre etkin üye adayını arar; kısmi arama/listeme yapmaz, tenant'ta zaten üye olan hesabı göstermeyerek bu durumu bulunamayan adresle aynı 404 yanıtında birleştirir ve 10 istek/dakika login hız sınırına tabidir. `POST /api/access-control/members` mevcut etkin platform kullanıcısını tenant'a ekler; `PUT /api/access-control/members/{userId}` rolünü değiştirir; `DELETE /api/access-control/members/{userId}` tenant üyeliğini devre dışı bırakmak için kaydı kaldırır. Ekleme ve rol değiştirme, geçerli etkin imzalı lisans olmadan reddedilir ve paketin kullanıcı sınırı transaction içinde yeniden denetlenir. Süresi geçmiş veya bozuk lisansla üye silmeye izin verilir; böylece erişim ve koltuk kullanımı azaltılabilir. Kullanıcı hesabı, parola ve kimlik doğrulama provision'ı bu API'nin kapsamı dışındadır. Tenant en az bir `TenantAdmin` tutar; son yöneticinin rolünü düşürme veya üyeliğini silme reddedilir. Her başarılı değişiklik tenant audit kaydı oluşturur.

Firma lisans ekranı SQL data page kullanımını ve kota sınırını gösterir. Bu, ayrılmış SQL database için uygulanır; dosya deposu ve transaction logları dahil değildir. Silme, SQL Server data page tahsisini düşürmeyebilir; kota da anında boşalmayabilir. Büyük veri temizliği sonrası kullanımın tekrar ölçülmesini bekleyin. Yüksek erişilebilirlik lisans metadata işaretidir ve deployment altyapısı gerektirir; HA topolojisi, hata hedefleri veya SLA bu paketin parçası olarak uygulanmış değildir. Ürün kararı bekleyen kapsam için [depolama ve HA ürün karar notuna](storage-ha-product-decisions.md) bakın.

## Kota denetimi ve repository sınırları

- Üyelik şeması [`TenantMembership`](../../src/Platform/AIERP.Platform.Domain/Entities.cs) ve `PlatformDbContext.TenantMemberships` içindedir. `GET /api/access-control/members` listeleme; tenant yöneticisine özel POST/PUT/DELETE rotaları ise yalnızca önceden var olan etkin platform hesaplarını tenant'a ekleme, rol güncelleme ve üyeliği kaldırma işlemlerini sağlar. Bu rotalar hesap/parola oluşturmaz. Ekleme ve rol değiştirme geçerli lisans zorunludur; üye sayısı SQL yazma transaction'ı içinde yeniden denetlenir ve lisans üst sınırında ekleme reddedilir. Üyelik değişiklikleri audit edilir ve son tenant yöneticisi silinemez ya da TenantUser'a düşürülemez. Demo başlangıç verisi seed akışı bu API'den ayrı kalır.
- Lisans etkinleştirme, `TenantMemberships` içindeki mevcut sayıyı Small/Medium/Large katalog sınırıyla karşılaştırır. Etkin modül sayısı da lisans değiştirilirken paketin sınırına karşı kontrol edilir; böylece daha düşük pakete geçiş mevcut kullanımı aşarsa reddedilir. Modül ekleme akışı ayrıca kendi lisans kotasını denetler.
- [`TenantStorageQuotaInterceptor`](../../src/Hosts/AIERP.Api/TenantStorageQuotaInterceptor.cs) tenant database-içinde SQL application lock alır, yazı öncesi ve transaction commit öncesi ayrılmış `ROWS` page kullanımını kontrol eder; lisans değişikliğiyle ve diğer yazılarla yarışmayı engeller. Kota aşılıysa değişiklik rollback edilir. Bu kapsam tenant SQL data page kullanımını ölçer; transaction logu veya dosya deposu byte’larını ölçmez.
- [`ModulePackageStoragePath`](../../src/Hosts/AIERP.Api/Program.cs) platform kataloğundaki modül paketlerini SHA-256 anahtarıyla saklar; firma dosyası değildir ve tenant SQL kotasına dahil edilmez. Dosya ekleri veya dış dosya deposu eklenirse ayrı ölçüm/kota kararı gerekir.

`20261020215245_AddTenantLicenses` platform migration’ı imzalı lisans metadata tablosunu oluşturur. Grant metni tutulmaz; yalnız SHA-256 özeti ve doğrulanmış metadata saklanır. Bu repository offline PowerShell imzalama araçları ve Platform Admin lisans oluşturma bölümü içerir. Panelin lisans üretmesi için `Licensing:IssuerKeyId`, eşleşen `Licensing:SigningKeys:<keyId>` ve `Licensing:PublicKeys:<keyId>` API secret yapılandırması zorunludur; gerçek müşteriye lisans dağıtımı yine güvenli operasyonel kanaldan yapılmalıdır.
