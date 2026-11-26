# Toplu kalıp geçişi: prova ve geri dönüş yordamı

Bu belge, firmaların özel sayfalarını (`TenantCustomPages`) Liste ya da Serbest kalıba toplu taşıyan komutların nasıl denenip canlıda çalıştırılacağını anlatır. Plan: "Toplu kalıp geçişi (5b-1)". Sayfa davranışı değişmez; yalnız yerleşim özellikleri değişir.

Bu belge canlıda çalıştırmayı **kendi başına yetkilendirmez**. Canlıda taşıma ancak prova raporu kullanıcıya gösterilip ayrı onay alındıktan sonra yapılır (adım 7).

## Ön bilgiler

- Canlı yığın uzak bir Windows ana makinesinde çalışır. Geliştirme makinesinden `docker --context nexora-remote` ile erişilir.
- SSH, önce `212.18.121.23:5787` adresine TCP vuruşu yapılınca `212.18.121.24:22` üzerinde açılır. SSH kopabilir; uzak adımları **tek bir PowerShell çağrısında** topla.
- SQL işleri `nexora-sqlserver-1` kapsayıcısının içinde `sqlcmd -I -b -P "$MSSQL_SA_PASSWORD"` ile yapılır. Parola kapsayıcıdan dışarı çıkmaz, komut satırına yazılmaz.
- `.sql` ve `.sh` dosyaları kapsayıcıya `docker cp` ile kopyalanır. PowerShell 5.1'de boru (`|`) ile dosya akıtılmaz.
- Firma veritabanları `AIERPTenant_<guid>` adını taşır; canlıda 4 tane vardır. Bir de eski `AIERPTenant_R9Rehearsal` vardır. **Bu veritabanı hiçbir zaman hedef olmaz.** Hedefleri her zaman açıkça, tek tek yaz.
- Taşıma komutları platform-api imajında (`AIERP.Api.dll`) çalışır. Kapsayıcı, canlı API ile aynı ortam değişkenlerini (Vault destekli firma yönlendirmesi) kullanmalıdır.
- Sunucu yeniden başladıysa Vault mühürlü olabilir. Başlamadan önce `vault status` bak. Mühür açmak kullanıcının işidir; sen açma.

## Komutlar

Hepsi `dotnet AIERP.Api.dll` ile çalışır:

| Amaç | Komut | Yazar mı? |
|---|---|---|
| Rapor | `--page-template-migration-report [--tenants=<id,…>] --out=<dizin>` | Hayır (salt okunur) |
| Taşıma | `--page-template-migration-run=<batch> --tenants=<id,…> --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP [--out=<dizin>]` | Evet |
| Geri dönüş | `--page-template-migration-rollback=<batch> --tenants=<id,…> [--page=<kod>] --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP` | Evet |

Taşıma ve geri dönüşte `--tenants` zorunludur; varsayılan hedef yoktur. Çalıştırmadan önce komut hedef veritabanı adlarını ekrana yazar; listeyi oku ve beklediğin adlarla karşılaştır.

Kullanılacak değişkenler (değerleri kendi oturumunda doldur):

```powershell
$ctx     = 'nexora-remote'
$batch   = 'tpl-20261126-1'                     # her deneme için yeni, benzersiz ad
$tenants = '<guid1>,<guid2>'                    # yalnız onaylanan firmalar; R9Rehearsal ASLA
$stamp   = Get-Date -Format 'yyyyMMdd-HHmm'
```

---

## Adım 1: Canlıda salt okunur rapor

**Amaç:** Hangi sayfaların taşınabildiğini, hangilerinin neden taşınmadığını görmek. Veri yazılmaz.

**Önce:** TCP vuruşunu yap. `docker --context $ctx ps` ile yığının ayakta olduğunu, `vault status` çıktısında `Sealed false` yazdığını doğrula.

**Komut (tek PowerShell çağrısı):**

```powershell
docker --context $ctx exec nexora-platform-api-1 sh -c "mkdir -p /tmp/tpl-report-$stamp && cd /app && dotnet AIERP.Api.dll --page-template-migration-report --out=/tmp/tpl-report-$stamp"
docker --context $ctx cp nexora-platform-api-1:/tmp/tpl-report-$stamp ./tpl-report-$stamp
```

Kapsayıcı adı farklıysa `docker --context $ctx ps` ile bul. `--tenants=` verilmezse rapor bütün firmaları tarar; rapor salt okunur olduğu için buna izin verilir.

**Başarı:** Komut 0 koduyla biter. `tpl-report-<damga>` içinde bir JSON ve bir Markdown dosyası vardır. Özette firma başına ve toplam sayılar ile en sık 10 neden görünür. Rapor sorgu sonucu, SQL metni ya da kullanıcı verisi içermez.

**Hata olursa:** Dur. Çıktıyı sakla. Vault mühürlüyse kullanıcıya haber ver. Hiçbir şey yazılmadığı için geri dönüş gerekmez.

## Adım 2: Raporu kullanıcıya göster

**Amaç:** Kullanıcının neyin taşınacağını, neyin taşınmayacağını görmesi.

**Yapılacak:** Markdown raporu kullanıcıya göster. Şunları ayrıca belirt: kaç sayfa taşınabilir, en sık nedenler, "eşdeğerlik denetimi başarısız" satırları.

**Başarı:** Kullanıcı hedef firmaları ve sayfa sayılarını gördüğünü söyler. Bu adım canlıda yazma izni **vermez**.

**Hata olursa:** Rapor beklenmedik görünüyorsa (ör. çok az taşınabilir sayfa) dur ve kullanıcıya sor.

## Adım 3: Yedek ve doğrulama

**Amaç:** Hedef firma veritabanlarının doğrulanmış yedeğini almak. Bu yedek, geri yükleme provasının da kaynağıdır.

Hedefleri açıkça yaz; `R9Rehearsal` listede olmaz. Her hedef veritabanı için `backup.sql` dosyasını hazırla:

```sql
BACKUP DATABASE [AIERPTenant_<guid1>]
  TO DISK = N'/var/opt/mssql/backups/pretpl-<damga>-AIERPTenant_<guid1>.bak'
  WITH COPY_ONLY, CHECKSUM, COMPRESSION, STATS = 10;
RESTORE VERIFYONLY
  FROM DISK = N'/var/opt/mssql/backups/pretpl-<damga>-AIERPTenant_<guid1>.bak'
  WITH CHECKSUM;
```

Kapsayıcıya kopyala ve kapsayıcının içinde çalıştır:

```powershell
docker --context $ctx cp .\backup.sql nexora-sqlserver-1:/tmp/backup.sql
docker --context $ctx exec nexora-sqlserver-1 sh -c '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -I -b -i /tmp/backup.sql'
```

`sqlcmd` yolu imaja göre `/opt/mssql-tools/bin/sqlcmd` olabilir. Tek tırnak sayesinde `$MSSQL_SA_PASSWORD` kapsayıcının içinde açılır; parola dışarı çıkmaz.

**Başarı:** Her veritabanı için "BACKUP DATABASE successfully processed" ve "The backup set on file 1 is valid." satırları görünür. `sqlcmd` 0 koduyla biter (`-b` hata olursa durdurur).

**Hata olursa:** Dur. Yedeği alınamayan ya da doğrulanamayan veritabanı için sonraki adımlara geçme. Disk alanını ve izinleri kontrol et.

## Adım 4: Geri yüklenmiş kopyada taşıma (prova)

**Amaç:** Taşımayı canlı veriye dokunmadan gerçek veriyle denemek.

**4a. Kopyayı geri yükle.** Ad kuralı: `AIERPTenant_<guid>_TplRehearsal`. Her hedef için:

```sql
RESTORE DATABASE [AIERPTenant_<guid1>_TplRehearsal]
  FROM DISK = N'/var/opt/mssql/backups/pretpl-<damga>-AIERPTenant_<guid1>.bak'
  WITH MOVE N'<mantiksal-veri-adi>' TO N'/var/opt/mssql/data/AIERPTenant_<guid1>_TplRehearsal.mdf',
       MOVE N'<mantiksal-log-adi>'  TO N'/var/opt/mssql/data/AIERPTenant_<guid1>_TplRehearsal_log.ldf',
       CHECKSUM, STATS = 10;
DBCC CHECKDB ([AIERPTenant_<guid1>_TplRehearsal]) WITH NO_INFOMSGS;
```

Mantıksal adları `RESTORE FILELISTONLY FROM DISK = N'…'` ile öğren. `DBCC CHECKDB` hatasız bitmelidir.

**4b. Taşımayı kopyaya yönelt.** Komut firmayı kimlikle çözer ve normalde canlı veritabanına gider. Provayı kopyada çalıştırmak için, firma yönlendirmesi kopya veritabanı adını gösteren **ayrı, geçici bir kapsayıcı** kullan (canlı API kapsayıcısı değiştirilmez). Yönlendirmenin kopyaya nasıl bağlanacağını çalıştırmadan önce `TenantDatabaseRouting` yapılandırmasından ve komutun çıktısından doğrula. **Çalıştırma öncesi ekrana yazılan veritabanı adları `_TplRehearsal` ile bitmiyorsa DUR.**

```powershell
docker --context $ctx exec nexora-platform-api-rehearsal sh -c "cd /app && dotnet AIERP.Api.dll --page-template-migration-run=$batch --tenants=$tenants --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP --out=/tmp/tpl-run-$stamp"
```

**Başarı:** Ekrana yazılan hedef adları yalnız `…_TplRehearsal` kopyalarıdır. Taşınan sayfa sayısı rapordaki "taşınabilir" sayıyla uyuşur. Atlanan sayfalar nedenleriyle listelenir. Kopyada her taşınan sayfa için iki sürüm oluşur: `BeforeTemplateMigration` ve `TemplateMigrated` (aynı `MigrationBatch`).

**Hata olursa:** Dur. Canlı veriye hiç dokunulmadı; kopyayı silip yeniden geri yüklemek serbesttir (adım 8). Hata ayrıntısını sakla ve kullanıcıya göster.

## Adım 5: Davranış denetimi

**Amaç:** Taşınan sayfaların aynı davrandığını göstermek.

1. **Sorgu eşitliği (otomatik).** Görev 4 testi, her taşınan sayfanın yayın yanıtında `queries` dizisinin geçiş öncesiyle aynı olduğunu doğrular. Testi çalıştır ve geçtiğini kaydet:

   ```powershell
   dotnet test tests/IntegrationTests --filter "FullyQualifiedName~PageTemplateMigration"
   ```

   .NET testlerini ortak kilitle sırayla çalıştır; zaman aşımı olursa testi tek başına yeniden dene.

2. **Elle ekran karşılaştırması.** Kopyaya bağlı geçici ortamda her taşınan sayfayı **üç genişlikte** (masaüstü ≈1440, tablet ≈768, telefon ≈375) önce/sonra karşılaştır. "Önce" için `BeforeTemplateMigration` sürümüne bak. Bakılacaklar: bileşenler yerinde mi, hiçbiri kaybolmadı mı, düğmeler ve filtreler çalışıyor mu, tablo aynı satırları gösteriyor mu.

**Başarı:** Test geçer; üç genişlikte fark yalnız yerleşimdir. Karşılaştırma notunu kullanıcıya göster.

**Hata olursa:** Bir sayfa yanlış görünüyorsa dur. O sayfayı adım 6'daki `--page=<kod>` ile kopyada geri al ve nedenini not et. Canlıya geçme.

## Adım 6: Kopyada geri dönüş denemesi

**Amaç:** Geri dönüşün çalıştığını canlıdan önce görmek.

```powershell
docker --context $ctx exec nexora-platform-api-rehearsal sh -c "cd /app && dotnet AIERP.Api.dll --page-template-migration-rollback=$batch --tenants=$tenants --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP"
```

Tek sayfayı denemek için `--page=<kod>` ekle.

**Başarı:** Her sayfa için `BeforeTemplateMigration` tanımı yayın olarak geri yazılır (`ChangeKind = "TemplateMigrationRolledBack"`) ve sayfa tanımı geçiş öncesiyle aynıdır. Bu arada değiştirilmiş sayfalar atlanır ve raporlanır.

**Hata olursa:** Dur. Geri dönüş kopyada bile çalışmıyorsa canlıda taşıma yapma. Düzeltme yeni bir PR ile gelir.

Sonra adım 4b'yi yeni bir batch adıyla tekrar çalıştır; canlıda kullanılacak durum kopyada son kez denenmiş olsun.

## Adım 7: Kullanıcı onayıyla canlıda taşıma

**Önkoşullar (hepsi sağlanmadan başlama):**

- Kullanıcı prova raporunu ve adım 5–6 sonuçlarını gördü ve **canlıda taşımayı açıkça onayladı**.
- Adım 3'teki yedekler taze (aynı gün) ve `RESTORE VERIFYONLY` geçti.
- `vault status` çıktısında `Sealed false` yazıyor.
- `--tenants` yalnız onaylanan canlı firma kimliklerini içerir. `AIERPTenant_R9Rehearsal` ve `_TplRehearsal` kopyaları listede **yok**.

**Komut (tek PowerShell çağrısı):**

```powershell
docker --context $ctx exec nexora-platform-api-1 sh -c "mkdir -p /tmp/tpl-run-$stamp && cd /app && dotnet AIERP.Api.dll --page-template-migration-run=$batch --tenants=$tenants --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP --out=/tmp/tpl-run-$stamp"
docker --context $ctx cp nexora-platform-api-1:/tmp/tpl-run-$stamp ./tpl-run-$stamp
```

**Başarı:** Ekrana yazılan veritabanı adları onaylanan canlı `AIERPTenant_<guid>` adlarıdır. Taşınan ve atlanan sayfa sayıları prova ile uyuşur. Birkaç sayfayı arayüzde açıp kontrol et.

**Hata olursa:** Dur. Sayfa başına işlem yapıldığı için kısmi taşıma olabilir; bu beklenen davranıştır. Aşağıdaki "Geri dönüş" bölümünü uygula. Batch adını sakla.

## Adım 8: Kopyaların silinmesi

**Amaç:** Prova kopyalarını temizlemek.

```sql
DROP DATABASE [AIERPTenant_<guid1>_TplRehearsal];
```

Yalnız adı `_TplRehearsal` ile biten ve bu yordamda **senin** oluşturduğun kopyaları sil. Geçici `nexora-platform-api-rehearsal` kapsayıcısını da kaldır. `.bak` yedeklerini canlı taşıma doğrulanana kadar sakla.

**Başarı:** `SELECT name FROM sys.databases WHERE name LIKE '%[_]TplRehearsal'` boş döner.

**Hata olursa:** Ad listesini bir kez daha oku; emin olmadığın veritabanını silme.

---

## Geri dönüş

- Canlıda ya da kopyada bir batch'i geri almak için:

  ```powershell
  docker --context $ctx exec nexora-platform-api-1 sh -c "cd /app && dotnet AIERP.Api.dll --page-template-migration-rollback=$batch --tenants=$tenants --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP"
  ```

- Tek sayfa için `--page=<kod>` ekle.
- Her sayfanın `BeforeTemplateMigration` sürümü yayın olarak geri yazılır (`TemplateMigrationRolledBack`).
- Sayfa taşımadan sonra yeniden değiştirildiyse (son sürüm `TemplateMigrated` değilse) o sayfa **atlanır** ve raporlanır. `--force` yoktur. Atlanan sayfayı elle ele al.
- Komut başarısız olur ya da sonuç şüpheliyse son çare, adım 3'teki doğrulanmış yedekten geri yüklemedir. Bu, yedekten sonra yazılan firma verisini de geri alır; yalnız kullanıcı onayıyla yapılır.
- Şema tarafı expand-only'dir (`MigrationBatch` nullable kolon); API'yi eski sürüme almak güvenlidir, eski kod kolonu yok sayar.

## Yapılmayacaklar

- `--force` ya da benzeri bir koruma atlatma yok.
- `--tenants` vermeden taşıma ya da geri dönüş çalıştırma.
- `AIERPTenant_R9Rehearsal` veritabanını canlıda hiçbir zaman hedef alma.
- `_TplRehearsal` kopyalarını canlı hedef listesine koyma.
- Sayfa sürümlerini (revizyonları) silme ya da düzenleme; geri dönüş yalnız yeni sürüm yazar.
- Onay bayrağını doğrulanmış yedek olmadan yazma.
- Kullanıcı onayı olmadan canlıda taşıma ya da geri dönüş çalıştırma; Vault mührünü kendin açma.
