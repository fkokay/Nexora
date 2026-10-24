# Firma lisanslarını hazırlama

Her lisans tek bir `TenantId` değerine, Small/Medium/Large paketine ve son kullanma tarihine bağlanır. Lisans kodu RSA-SHA256 ile imzalanır. Uygulama yalnız açık anahtarı kullanır; özel anahtar lisans veren tarafta çevrimdışı tutulmalıdır.

## Anahtar çifti

PowerShell 7 ve .NET 8 ile, depo dışındaki güvenli bir klasörde çalıştırın:

```powershell
pwsh ./scripts/New-NexoraLicenseKeyPair.ps1 `
  -PrivateKeyPath D:/Nexora-License-Secrets/issuer-private.pem `
  -PublicKeyPath D:/Nexora-License-Secrets/issuer-public.pem
```

Özel anahtarı yedekli, erişimi kısıtlı çevrimdışı kasada saklayın. Depoya eklemeyin; API sunucusuna da kopyalamayın.

API sunucusuna yalnız açık anahtarı ve seçtiğiniz kimliği `Licensing:PublicKeys:<keyId>` ayarı olarak verin. Örneğin `issuer-2026` kimliği için ortam değişkeni:

```text
Licensing__PublicKeys__issuer-2026=<issuer-public.pem dosyasının içeriği>
```

Gizli yapılandırma deposu veya deployment secret kullanın; açık anahtarı `appsettings.json` içine koymak da mümkündür.

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

Üretilen kodu müşteriye güvenli kanaldan iletin. Firma yöneticisi `Firma ayarları → Firma lisansı` ekranına yapıştırıp etkinleştirir. Sunucu imzayı, firma kimliğini, paket adını ve süreyi doğrular. Aynı lisans kimliği başka firmada etkinleştirilemez.

## Paket sınırları

Small: 10 kullanıcı, 3 özel modül ve 10 GB paket bilgisi. Medium: 50 kullanıcı, 15 özel modül, 100 GB paket bilgisi, gelişmiş iş akışları ve özel modül kaynak kodu. Large: uygulamadaki kullanıcı/modül sayaçlarında sınırsız değer, gelişmiş iş akışları ve özel modül kaynak kodu. Kullanıcı ve özel modül sınırları uygulanır; GB değerleri tenant dosya deposu ve byte sayacı bulunmadığı için yalnız paket bilgisidir, kota olarak uygulanmaz. Large paketindeki HA alanı yalnızca lisans metadata işaretidir; yüksek erişilebilirlik topolojisi veya SLA sağlamaz. Bu değerler imzalı v1 `tier` claim’inin katalogdaki profil karşılığıdır; fiyat veya müşteri sözleşmesi uygulamada tanımlanmaz.

Gelişmiş iş akışı lisans kapısı sunucuda iş akışı tanımı oluşturma, düzenleme, yayımlama ve yayımlanmış tanımdan yeni taslak oluşturma işlemlerini denetler. Lisanssız firmalar Small kabul edilir; bu işlemler için Medium veya Large gerekir. Lisans süresi dolmuş ya da metadata tutarsızsa yazma reddedilir. Saklanan tier ve sayaçların profil kataloğuyla eşleşmesi, grant özeti biçimiyle birlikte denetlenir; tutarsız kayıt üye değişikliği, yeni/çalıştırılan özel modül ve kaynak-kod erişimi için geçerli lisans sayılmaz. Daha önce yayımlanmış iş akışlarının çalıştırılması ve karar verilmesi lisans yenileme sürecinde mevcut operasyonların kesilmemesi için bu kapının dışında kalır.

Etkin lisans yönetim ekranı tenant kullanıcı ve etkin özel modül adetlerini gösterir. Sunucu lisans etkinleştirilirken mevcut üye sayısının paketin kullanıcı sınırını aşmasını reddeder; özel modül sayısı yeni aktivasyonda, lisans süresi de yeni aktivasyon ve modül çalıştırma sırasında uygulanır. `GET /api/access-control/members/candidate?email=...` tek, tam e-posta adresine göre etkin üye adayını arar; kısmi arama/listeme yapmaz, tenant'ta zaten üye olan hesabı göstermeyerek bu durumu bulunamayan adresle aynı 404 yanıtında birleştirir ve 10 istek/dakika login hız sınırına tabidir. `POST /api/access-control/members` mevcut etkin platform kullanıcısını tenant'a ekler; `PUT /api/access-control/members/{userId}` rolünü değiştirir; `DELETE /api/access-control/members/{userId}` tenant üyeliğini devre dışı bırakmak için kaydı kaldırır. Ekleme ve rol değiştirme, geçerli etkin imzalı lisans olmadan reddedilir ve paketin kullanıcı sınırı transaction içinde yeniden denetlenir. Süresi geçmiş veya bozuk lisansla üye silmeye izin verilir; böylece erişim ve koltuk kullanımı azaltılabilir. Kullanıcı hesabı, parola ve kimlik doğrulama provision'ı bu API'nin kapsamı dışındadır. Tenant en az bir `TenantAdmin` tutar; son yöneticinin rolünü düşürme veya üyeliğini silme reddedilir. Her başarılı değişiklik tenant audit kaydı oluşturur.

Depolama kotası şu an uygulanmaz. Uygulamada tenant’a ait dosya deposu veya tenant başına fiziksel SQL alanı ölçümü bulunmuyor; SQL Server’daki ortak tenant verisini yalnız lisans kotasıyla güvenilir biçimde ölçmek mümkün değildir. Ekran bu değeri “paket bilgisi · kota uygulanmıyor” olarak gösterir. Gerçek GB kotası için tenant-kapsamlı blob/dosya deposu ve kullanım sayacı entegrasyonu gerekir. Yüksek erişilebilirlik de lisans işaretinden ibarettir ve deployment altyapısı gerektirir; HA topolojisi, hata hedefleri veya SLA bu paketin parçası olarak uygulanmış değildir. Karar bekleyen ürün kapsamı için [depolama ve HA ürün karar notuna](storage-ha-product-decisions.md) bakın.

## Kota denetimi ve repository sınırları

- Üyelik şeması [`TenantMembership`](../../src/Platform/AIERP.Platform.Domain/Entities.cs) ve `PlatformDbContext.TenantMemberships` içindedir. `GET /api/access-control/members` listeleme; tenant yöneticisine özel POST/PUT/DELETE rotaları ise yalnızca önceden var olan etkin platform hesaplarını tenant'a ekleme, rol güncelleme ve üyeliği kaldırma işlemlerini sağlar. Bu rotalar hesap/parola oluşturmaz. Ekleme ve rol değiştirme geçerli lisans zorunludur; üye sayısı SQL yazma transaction'ı içinde yeniden denetlenir ve lisans üst sınırında ekleme reddedilir. Üyelik değişiklikleri audit edilir ve son tenant yöneticisi silinemez ya da TenantUser'a düşürülemez. Demo başlangıç verisi seed akışı bu API'den ayrı kalır.
- Lisans etkinleştirme, `TenantMemberships` içindeki mevcut sayıyı Small/Medium/Large katalog sınırıyla karşılaştırır. Etkin modül sayısı da lisans değiştirilirken paketin sınırına karşı kontrol edilir; böylece daha düşük pakete geçiş mevcut kullanımı aşarsa reddedilir. Modül ekleme akışı ayrıca kendi lisans kotasını denetler.
- Depolama için lisans kaydında yalnızca `MaxStorageGb` paketi bulunur; tenant’a ait dosya yükleme/depolama API’si ve tenant başına saklanan byte sayacı yoktur. [`ModulePackageStoragePath`](../../src/Hosts/AIERP.Api/Program.cs) yalnız platform kataloğundaki modül paketlerini SHA-256 anahtarıyla saklar; bu, firma dosyaları değildir ve tenant GB kotasına dahil edilmemelidir. Tenant SQL bağlantıları da dosya deposu sayacı sağlamaz. Bu yüzden depolama sınırı bugün kabul/yükleme aşamasında enforce edilemez.
- Üyelik ve tenant dosya deposu için gerçek akışlar eklendiğinde kapasite kontrolü tek bir ortak servis üzerinden yazma transaction’ına bağlanmalı; yalnız ekrandaki sayaca güvenilmemelidir. Dosya kotası için dosya metadata’sı ve boyut sayaçları, kota eşzamanlı yazımlarda aşılmasın diye atomik güncellenmelidir.

`20261020215245_AddTenantLicenses` platform migration’ı imzalı lisans metadata tablosunu oluşturur. Grant metni tutulmaz; yalnız SHA-256 özeti ve doğrulanmış metadata saklanır. Bu repository imza kodu üretmek için offline PowerShell araçları içerir, ancak üretim lisans veren servisi, özel anahtar kasası ve gerçek müşteriye lisans dağıtımı harici operasyonlardır. Yerel imzalama testleri gerçek dış servis gerektirmez.
