# Studio üzerinden değişen uygulama imajlarını güncelleme

Sürüm ekranında paket oluşturulduktan sonra tenant yöneticisi **Değişen projeleri
güncelle** eylemini kullanır. Onaylı paketin commit'i, çalışan uygulamaların imaj
etiketleriyle GitHub üzerinden karşılaştırılır. Yalnız değişen ve o anda çalışan
servisler derlenip yenilenir. Sağlık denetimi başarısız olursa güncellenen eski
imajlara dönülür.

## Bir defalık sunucu kurulumu

1. AI Service, Release Deployer ve Development Studio imajlarını bu kodla yenileyin.
2. Sunucuda yalnız operatörün yazabildiği özel bir dağıtım dizini oluşturun.
   Çalışan kurulumun asıl Compose dosyasını `docker-compose.yml`, etkin override
   ayarlarını `docker-compose.override.yml` ve gerekli değişkenleri `.env` adıyla
   bu dizine koyun. Özellikle `erp-web` ağ, port ve sağlık kontrolü ayarları çalışan
   kurulumla aynı olmalıdır. Bu dosyaları kaynak depoya eklemeyin.
3. Ana dağıtımın ortam dosyasına `WEB_UPDATE_TENANT_ID`, `WEB_UPDATE_PROJECT_ID`,
   `WEB_UPDATE_COMPOSE_PROJECT`, `WEB_UPDATE_DEPLOYMENT_DIRECTORY` ve
   `PUBLIC_STUDIO_ORIGIN` değerlerini tanımlayın. Proje, ERP web ve Platform API
   kaynaklarını barındıran ve bu sunucunun sahibi olan tenant'ın projesi olmalıdır.
4. Dağıtıma `docker-compose.web-update.yml` override dosyasını ekleyip AI Service
   ve Release Deployer servislerini yenileyin. Özel dizin deployer'a salt okunur
   bağlanır. Ek override dosyaları gerekiyorsa `WebImageUpdate__ComposeFiles__2`
   ve devamındaki ayarlarla sabit sunucu yollarını ekleyin.

## İşlem ve sınırlar

- Tenant yöneticisi, sunucuda izin verilen tek tenant/proje için kullanabilir.
- Bağımsız onaylı, PR durumu geçerli sürüm paketi gerekir. Paket hash'i, manifest
  ve dosyalar yeniden doğrulanır. Servis seçimi sabit dosya-yol eşlemeleriyle yapılır;
  isteğin içinden komut, Dockerfile veya Compose yolu alınmaz.
- Her imaj derlemesi zaman aşımıyla sınırlıdır. İstek tamamlandıktan sonra iş sunucuda
  devam eder; Studio üç saniyede bir durumu sorgular. Çıktı aşama tamamlanınca gelir.
- Değişen projeler arasında self-update güvenli olmadığı için Release Deployer
  servisi yoktur; onun kod değişiklikleri operatör güncellemesi gerektirir.
- Yeni konteyner sağlıklı olmazsa önceki imajla yeniden başlatma denenir; sonuç
  çıktı alanına yazılır. Kaynak paketlerdeki npm derleme komutları çalışacağı için
  yalnız güvenilen ve incelenmiş kod yayımlanmalıdır.
- İş durumu deployer belleğinde tutulur; deployer yeniden başlatılırsa durum
  kaydı kaybolur. Docker'daki çalışan imaj etkilenmez. Başlatma denetim kaydı
  Studio veritabanında saklanır.

Kurulum yapılandırılmadan düğme devre dışı görünür. Ana kurulum farklı bir sunucu
veya Docker daemon kullanıyorsa deployer'ın Docker bağlantısı da o sunucuyu
hedeflemelidir.
