# Uzak sunucuda imaj derleme (hızlı operatör dağıtımı)

`docker --context nexora-remote compose build`, ~140 MB'lık derleme bağlamını SSH
üzerinden sıkıştırmadan gönderir. 18 Kasım 2026 ölçümünde 7 dakikalık Platform API
derlemesinin 207 saniyesi yalnız bu yüklemeydi. Bağlamın büyük kısmı EF migration
Designer dosyalarıdır.

`scripts/Build-NexoraRemoteImages.ps1` bunun yerine şunları yapar:

1. `origin/master` üzerindeki bir commit'in `git archive` çıktısını alır (~12 MB zip;
   `artifacts/` ve `docs/` hariç).
2. Arşivi tek bir `scp` ile `C:/Nexora/build-sources/` klasörüne gönderir.
3. Tek bir `ssh` oturumunda SHA-256 değerini doğrular, arşivi açar ve
   `docker compose build <servisler>` komutunu sunucuda çalıştırır. İmaj etiketi
   `nexora-<servis>:latest` olur; `org.opencontainers.image.revision` commit'i taşır.
4. Son 3 kaynak klasörünü saklar, daha eskilerini siler. Çalışan bir konteynerin
   bağladığı klasörü silmez.

Betik konteynerleri değiştirmez. Geçiş eskisi gibi bu makineden yapılır: rollback
etiketlerini alın, ardından `up --detach --no-deps --no-build <servisler>` çalıştırın.
Yeni kimlik bilgisi oluşturulmaz. Compose değişkenleri sunucudaki mevcut
`C:/Nexora/private/.env` dosyasından okunur.

```powershell
./scripts/Build-NexoraRemoteImages.ps1 -Services platform-api,erp-web -PlanOnly   # yalnız plan, uzak çağrı yok
./scripts/Build-NexoraRemoteImages.ps1 -Services platform-api,erp-web
```

İlk kullanımdan önce sunucuda `C:/Nexora/build-sources` klasörünü yalnız operatörün
yazabileceği izinlerle oluşturun. SSH yalnız Windows OpenSSH ajanıyla çalıştığı için
betik `C:\Windows\System32\OpenSSH` altındaki `ssh.exe`/`scp.exe` dosyalarını kullanır.

## Ortak .NET derleme katmanı

.NET servis Dockerfile'ları (Platform API/migrator, AI Service, Plugin Host,
Integration Host, Tenant Provisioning Worker, Workspace Runner) aynı ön eki paylaşır.
Bu ön ek önce yalnız csproj dosyalarını kopyalayıp restore eder, ardından paylaşılan
kütüphaneleri (Platform, Observability, ModuleSDK, IntegrationSDK) derler. BuildKit
bu adımları aynı commit'te bir kez çalıştırır. Kütüphane kaynakları değişmediyse
sonraki commit'lerde de önbellekten kullanır. Servis adımı
`-p:BuildProjectReferences=false` ile yalnız kendi projesini derler. Ön ekin
aynı kaldığını ve yeni projeleri kapsadığını `ApplicationServiceImpactTests` denetler.
