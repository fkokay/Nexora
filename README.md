# Nexora — Yapay Zekâ Destekli ERP Platformu

Nexora; birden fazla şirketin (kiracının) aynı platformu, birbirinden yalıtılmış verilerle kullanmasını sağlayan bir ERP altyapısıdır. ERP uygulamasına ek olarak ayrı bir yapay zekâ geliştirme servisi ve Geliştirme Stüdyosu içerir.

Mevcut uygulamada oturum açma, şirket seçimi ve gösterge panelinin yanı sıra cari hesap, stok ve depo, satış, satın alma, finans, insan kaynakları ve AI Geliştirme Stüdyosu iş akışları bulunur. Uygulamanın doğrulanmış kapsamı ve devam eden işler için [faz durumuna](docs/phase-status.md), kod tabanında gezinmek için [proje haritasına](docs/project-map.md) bakın.

## Yerel ortamda çalıştırma

### Gerekenler

- Docker ve Docker Compose
- Web arayüzünü ayrı çalıştıracaksanız Node.js ve npm

### ERP ve Geliştirme Stüdyosu'nu başlatma

1. Örnek ayar dosyasını kopyalayın:

   ```powershell
   Copy-Item .env.example deploy/docker/.env
   ```

2. `deploy/docker/.env` içindeki örnek değerleri kendi yerel ortamınıza göre düzenleyin.
3. Uygulama servislerini başlatın:

   ```powershell
   docker compose --env-file deploy/docker/.env -f deploy/docker/docker-compose.yml up --build -d
   ```

   Bu komut SQL Server'ı, arka uç servislerini, ERP Web'i ve AI Geliştirme Stüdyosu'nu başlatır. ERP Web `5173`, Stüdyo ise `5174` portunda açılır.

4. Tarayıcıda [http://localhost:5173](http://localhost:5173) adresine gidin. İlk kullanıcı için `.env` dosyasında tanımlanan başlangıç (bootstrap) bilgilerini kullanın.

Yerel Compose kurulumu ilk kullanıcıyı oluşturur ve sürümlenmiş veritabanı geçişlerini uygular. Geçiş başlangıç noktası mevcut şemayı benimser; verileri silmez.

### ERP arayüzünde canlı geliştirme

ERP Web'i Docker dışında, kod değişikliklerini anında görmek için çalıştırabilirsiniz. Önce Compose içindeki `erp-web` servisini durdurun. Ardından:

```powershell
cd frontend/erp-web
npm ci
npm run dev -- --port 5175
```

Yerel API, bu geliştirme adresinden gelen istekleri kabul edecek şekilde yapılandırılmıştır.

## Uygulamadaki temel alanlar

- **Cari hesaplar:** Şirkete özel müşteri ve tedarikçi kartları, adres ve gruplar, para birimi, risk limiti, ödeme vadesi, borç/alacak hareketleri ve bakiye takibi.
- **Stok ve depo:** Stok kartları ve depolar, eldeki/rezerve/kullanılabilir miktarlar, giriş-çıkış ve depo transferleri, lot/seri takibi, alternatif birimler ve asgari stok göstergeleri. Stok hareketleri ve maliyet kayıtları izlenebilir; stok eksiye düşmesi engellenir.
- **Satış:** Teklif hazırlama ve onaylama, siparişe dönüştürme, stok rezervasyonu, kısmi sevkiyat, fatura, tahsilat ve iade süreçleri.
- **Satın alma:** İç stok talepleri ve onayları, tedarikçi tekliflerini karşılaştırma, sipariş, kısmi mal kabul, alış faturası ve tedarikçi ödemesi.
- **Finans ve muhasebe:** Döviz kurları, vade ve açık fatura raporları, hesap planı, yevmiye kayıtları, mizan ve CSV dışa aktarımı. Uygun fatura, tahsilat, ödeme ve stok maliyeti hareketleri muhasebe kayıtlarına aktarılabilir.
- **İnsan kaynakları:** Yetkili yöneticiler çalışan, devam ve izin verilerinin dönemsel özetini inceleyip dışa aktarabilir. Ayrıntılar için [İK operasyonları belgesine](docs/human-resources-operations.md) bakın.
- **İşlem kayıtları:** Yetkili yöneticiler, şirket kapsamındaki denetim kayıtlarını tarih, işlem ve kaynak türüne göre inceleyebilir.

Kayıtlar kiracı/şirket bazında ayrılır. Cari hesaplar, stoklar, özel alanlar ve diğer iş verileri ilgili şirketin kapsamındadır. Mimari, güvenlik sınırları ve bilinen kısıtlar [mimari belgesinde](docs/architecture.md) açıklanır.

## AI Geliştirme Stüdyosu

Stüdyo, ERP'den ayrı bir web arayüzü ve ayrı bir servis olarak çalışır. Yerel ortamda [http://localhost:5174](http://localhost:5174) adresinden açılır; ERP ile aynı Platform API üzerinde oturum açar.

Stüdyo; projelere erişim rolleri vermeyi, geliştirme taleplerini projelere bağlamayı ve yetkili kullanıcıların ayrı bir çalışma alanı istemesini destekler. Onaylanan çalışma alanı, ayrı bir çalıştırıcıda sınırlı bir Git deposu kopyası olarak hazırlanır. Dosya inceleme, yapay zekâ önerisi, kaynak dosyası değişikliği ve geri alma işlemleri onay ve denetim kayıtlarına tabidir. Kod önerileri uygulanırken kendiliğinden çalıştırılmaz; desteklenen testler ayrıca, ağ erişimi olmayan korumalı ortamda çalıştırılır.

### Yapay zekâ sağlayıcısını ayarlama

- `.env.example` içindeki `OPENAI_API_KEY` isteğe bağlıdır. AI özelliklerini etkinleştirmek için anahtarı `deploy/docker/.env` dosyasına ekleyin. Anahtar yalnızca AI Service kapsayıcısına iletilir; tarayıcıda saklanmaz.
- Stüdyo sohbet sağlayıcısı ve OpenAI/NVIDIA NIM anahtarları **Ayarlar → AI sağlayıcı ayarları** bölümünden yönetilebilir. Anahtarları kaydetmeden önce `AI_SETTINGS_ENCRYPTION_KEY` ayarını rastgele, 256 bitlik Base64 bir değerle yapılandırın. Bu anahtarlar veritabanında şifreli tutulur ve tarayıcıya geri gönderilmez.
- Stüdyo sohbet sağlayıcısı seçimi yalnızca Stüdyo sohbetini etkiler. Diğer yapılandırılmış AI iş akışları sunucu tarafındaki OpenAI ayarını kullanır.

### GitHub bağlantısı

Özel GitHub depolarını Stüdyo'da kullanmak için GitHub App değerlerini (`GITHUB_APP_ID`, `GITHUB_APP_SLUG` ve `GITHUB_APP_PRIVATE_KEY_PEM`) `.env` dosyasında bir kez yapılandırın. Yerel Compose ortamında App Setup URL'si `http://localhost:5081/studio/github/setup-callback` olmalıdır. Sonra proje Maintainer'ı veya TenantAdmin, Stüdyo'daki **GitHub ile yetkilendir** adımını tamamlayabilir. Depo kopyalama için depoya özel, kısa ömürlü ve yalnızca okuma yetkili bir belirteç kullanılır. PR yayımlama ayrı yazma yetkisi ve açık onay gerektirir.

## İzleme

İsteğe bağlı Prometheus servisini başlatın:

```powershell
docker compose --profile monitoring --env-file deploy/docker/.env -f deploy/docker/docker-compose.yml up -d prometheus
```

Arayüz [http://localhost:9090](http://localhost:9090) adresindedir ve yalnızca bu bilgisayardan erişilebilir. En fazla 15 gün veya 2 GB metrik saklanır. Uyarılar yerel olarak değerlendirilir; e-posta ya da başka bir kanala bildirim gönderimi yapılandırılmamıştır.

## Sürüm hazırlama ve üretim sınırları

Geliştirme Stüdyosu, ayrıca onaylanmış bir sürüm paketini proje kapsamındaki Docker Compose test ortamına dağıtabilir. Test ortamındaki veritabanı ve kalıcı alanlar kendi içindedir. Üretime geçiş için farklı bir TenantAdmin onayı ve ayrıca yönetici dağıtım onayı gerekir.

Bu dağıtım modeli tek makinede kalıcı servisler, yerel kapsayıcı yeniden başlatma, doğrulanmış veritabanı geri yükleme ve isteğe bağlı şifreli uzak yedekleme sağlar. Otomatik sunucu/veritabanı devralma, birden fazla sunucuya trafik dağıtımı veya çok sunuculu eşgüdümlü dağıtım sağlamaz. Üretim yapısını seçmeden önce [erişilebilirlik ve dağıtım sınırlarını](docs/architecture.md#availability-deployment-and-recovery-boundary) inceleyin.

Üretim SQL veritabanları her gün saat 02.00 UTC'de yedeklenir. SQL dışındaki kalıcı alanların Windows'ta anlık yedeği için:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/docker/Backup-PersistentVolumes.ps1
```

Yedekler kullanıcı kaynak kodu, dağıtım ayarları ve sertifikalar içerebilir; güvenli saklayın. `.env` dosyasını ve şifreleme anahtarlarını yedekten ayrı, güvenli bir sır yöneticisinde tutun. Geri yükleme, uzak yedekleme ve güvenli yapılandırma kontrolü adımları için betiğin yardımını ve dağıtım belgelerini inceleyin. Yedek geri yükleme sürecini düzenli olarak deneme ortamında doğrulayın.

İsteğe bağlı dış HTTPS erişimi yalnızca Geliştirme Stüdyosu için açılabilir. Bunun için DNS, HTTPS ve `public-ingress` profilinin ayrıca yapılandırılması gerekir. Üretilen üretim yığınları ve ERP Web bu giriş üzerinden yayımlanmaz.

## Daha fazla bilgi

- [Mimari, kiracı güvenliği ve kısıtlar](docs/architecture.md)
- [Fazlara göre uygulama durumu](docs/phase-status.md)
- [Servis ve proje haritası](docs/project-map.md)
- [İnsan kaynakları operasyonları](docs/human-resources-operations.md)
