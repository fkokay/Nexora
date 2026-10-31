# Remote UI hızlı güncelleme

## Günlük geliştirme: Docker build olmadan

Arayüz üzerinde çalışırken Vite HMR kullanın. Kaydettiğiniz TSX/CSS değişiklikleri tarayıcıya saniyeler içinde gelir; Docker imajı build edilmez ve container yeniden başlamaz. Vite proxy ayarları remote API/Studio adreslerini destekler.

API istekleri Vite sunucusundan HTTPS üzerinden uzak servislere iletilir; tarayıcı doğrudan uzak API'ye bağlanmadığı için yerel geliştirme CORS ayarına ihtiyaç duymaz. API ve Studio hedef URL'leri gizli bilgi değildir; API anahtarı veya parola bu değişkenlere yazılmamalıdır.

ERP web için PowerShell'de:

```powershell
cd D:\CProjeler\Nexora\frontend\erp-web
$env:NEXORA_API_PROXY_TARGET = 'https://nexoraerp.ozgurteknolojiyazilim.com'
$env:NEXORA_STUDIO_PROXY_TARGET = 'https://nexorastudio.ozgurteknolojiyazilim.com'
$env:VITE_STUDIO_URL = 'https://nexorastudio.ozgurteknolojiyazilim.com/?app=studio'
npm.cmd run dev
```

Tarayıcıda `http://localhost:5173` adresini açın. Bu modda ERP arayüzü yerelden, API ve Studio arayüzü uzaktaki sunuculardan gelir.

Studio arayüzünü de Docker kullanmadan yerelde düzenlemek için ikinci bir PowerShell penceresinde:

```powershell
cd D:\CProjeler\Nexora\frontend\development-studio
$env:NEXORA_API_PROXY_TARGET = 'https://nexoraerp.ozgurteknolojiyazilim.com'
$env:NEXORA_STUDIO_PROXY_TARGET = 'https://nexorastudio.ozgurteknolojiyazilim.com'
npm.cmd run dev
```

Vite Studio `http://localhost:5175` adresinde açılır. Yerel ERP penceresindeki **Geliştirici modu** bağlantısının da bu yerel Studio'yu açması için ERP Vite terminalinde şu değişkeni ayarlayın ve ERP Vite'ı yeniden başlatın:

```powershell
$env:VITE_STUDIO_URL = 'http://localhost:5175/?app=studio'
```

Sonra ERP'yi `http://localhost:5173`, Studio'yu `http://localhost:5175` adresinden kullanın. İki Vite sunucusu ayrı PowerShell pencerelerinde çalışmalıdır. Terminali `Ctrl+C` ile kapatırsanız ilgili geliştirme sunucusu durur.

PowerShell'de proje klasörünü ve ortam değişkenlerini ayarladıktan sonra `npm.cmd run dev` çalıştırın; mevcut sistem ilkesinde `npm run` komutu engelleniyorsa `npm.ps1` yerine bu çağrıyı kullanın. Vite ortam değişkenleri sunucu başlarken okunur; değişkenleri değiştirdiğinizde ilgili dev sunucusunu `Ctrl+C` ile durdurup yeniden başlatın. HMR yalnız frontend kaynaklarını günceller. Değişiklik API/Worker davranışını, veritabanı şemasını veya Compose yapılandırmasını etkiliyorsa ilgili servisin ve migration'ların ayrıca dağıtılması gerekir. Uzak API'ye bağlanıldığında yaptığınız veri değiştiren işlemler uzak firmaya yazılır.

## Remote Docker'a yayınlama

Değişikliği remote imaja almak istediğinizde tüm ERP Compose projesini yeniden build/recreate etmek yerine yalnız değişen web servisini güncelleyin:

```powershell
.\scripts\Update-NexoraRemoteUi.ps1 -Service erp-web
```

Development Studio değişikliği için:

```powershell
.\scripts\Update-NexoraRemoteUi.ps1 -Service development-studio
```

Komut `nexora-remote` Docker context'ini ve mevcut `nexora` Compose projesini kullanır. `--no-deps` bağımlı API, SQL ve diğer servislerin yeniden oluşturulmasını önler. Compose bütün servislerin ortamını parse ettiği için UI güncelleme betiği, yerel `AIERP_PLATFORM_RUNTIME_PASSWORD` değişkeni yoksa sadece bu parse aşamasında bir yer tutucu kullanır; yalnız UI servisleri seçilebilir ve backend bağımlılıkları başlatılmaz. Dockerfile'daki `npm ci` katmanı lock dosyaları değişmediği sürece cache'den kullanılır; yalnız kaynak dosyalarındaki değişiklikler Vite derlemesini tetikler.

Üretim API'si veya veritabanı şemasıyla uyumluluğu etkileyen bir değişiklik UI-only güncellemesi değildir. O durumda ilgili API/Worker servisi ve migration planı ayrıca birlikte yayımlanmalı; `--no-deps` script'ini kullanarak API değişikliğini atlamayın.
