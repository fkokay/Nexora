# Toplu kalıp geçişi: prova ve geri dönüş yordamı

Bu belge, firmaların özel sayfalarını (`TenantCustomPages`) Liste ya da Serbest kalıba toplu taşıyan komutların nasıl denenip canlıda çalıştırılacağını anlatır. Plan: "Toplu kalıp geçişi (5b-1)". Sayfa davranışı değişmez; yalnız yerleşim özellikleri değişir.

Bu belge canlıda çalıştırmayı **kendi başına yetkilendirmez**. Canlıda taşıma ancak prova raporu kullanıcıya gösterilip ayrı onay alındıktan sonra yapılır (adım 7).

## Ön bilgiler

- Canlı yığın uzak bir Windows ana makinesinde çalışır. Geliştirme makinesinden `docker --context nexora-remote` ile erişilir.
- SSH, önce `212.18.121.23:5787` adresine TCP vuruşu yapılınca `212.18.121.24:22` üzerinde açılır. SSH kopabilir; uzak adımları **tek bir PowerShell çağrısında** topla.
- Canlı API kapsayıcısı `nexora-platform-api-1`'dir (bir dağıtımda doğrulandı). SQL kapsayıcısının adı bu belgede `nexora-sqlserver-1` diye geçer; bu ad **doğrulanmadı**, `docker --context nexora-remote ps` ile kontrol edin ve farklıysa komutlarda düzeltin.
- SQL işleri SQL kapsayıcısının içinde `sqlcmd -I -b -P "$MSSQL_SA_PASSWORD"` ile yapılır. Parola kapsayıcıdan dışarı çıkmaz, komut satırına yazılmaz.
- `.sql` ve `.sh` dosyaları kapsayıcıya `docker cp` ile kopyalanır. PowerShell 5.1'de boru (`|`) ile dosya akıtılmaz.
- Firma veritabanları `AIERPTenant_<guid:N>` adını taşır. `<guid:N>` firma kimliğinin **tiresiz, 32 küçük onaltılık karakterli** yazımıdır (`TenantSqlCredentialPath.DatabaseName`: `$"AIERPTenant_{tenantId:N}"`). Örnek: `207af7e7-d83f-41c2-88d7-cba5856f1109` → `AIERPTenant_207af7e7d83f41c288d7cba5856f1109`. PowerShell'de: `([guid]'<guid>').ToString('N')`.
- Canlıda 4 firma veritabanı vardır. Bir de eski `AIERPTenant_R9Rehearsal` vardır. **Bu veritabanı hiçbir zaman hedef olmaz**; komut da onu reddeder.
- Taşıma komutları canlı API kapsayıcısında (`AIERP.Api.dll`) çalışır; canlı API ile aynı ortam değişkenlerini (Vault destekli firma yönlendirmesi) kullanır. Ayrı bir kapsayıcı ya da yönlendirme değişikliği gerekmez.
- Komut her firma veritabanına o firmanın **ERP çalışma kimliğiyle** bağlanır (Vault'taki ERP kimlik bilgisi; SQL oturumu `aierp_t_<guid:N>`). Prova kopyası aynı SQL sunucusunda olmalı ve bu oturum kopyada eşlenmiş olmalıdır (adım 4a).
- Sunucu yeniden başladıysa Vault mühürlü olabilir. Başlamadan önce `vault status` bak. Mühür açmak kullanıcının işidir; sen açma.

## Komutlar

Hepsi `dotnet AIERP.Api.dll` ile çalışır. Değerler her zaman `--bayrak=değer` biçiminde, boşluksuz verilir. `--page-template-migration` ile başlayan her argüman geçiş kipine girer; tanınmayan bir argüman (yazım hatası, boşlukla ayrılmış değer, `--pages=` gibi) web sunucusunu başlatmaz, iletiyle durur.

| Amaç | Komut | Yazar mı? |
|---|---|---|
| Rapor | `--page-template-migration-report [--tenants=<id,…>] --out=<dizin>` | Hayır (salt okunur) |
| Taşıma | `--page-template-migration-run=<batch> --tenants=<id,…> --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP [--expect-databases=<ad,…>] [--out=<dizin>]` | Evet |
| Geri dönüş | `--page-template-migration-rollback=<batch> --tenants=<id,…> [--page=<kod>] --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP [--expect-databases=<ad,…>]` | Evet |
| Doğrulama | `--page-template-migration-verify=<batch> [--tenants=<id,…>] [--expect-databases=<ad,…>] [--out=<dizin>]` | Hayır (salt okunur) |

Prova kopyasına yöneltmek için her komuta, `--tenants` içindeki **her** firma için bir `--rehearsal-database=<guid>=AIERPTenant_<guid:N>_TplRehearsal` ve `--expect-databases=<kopya adları>` eklenir (adım 4b). Kurallar:

- Taşıma ve geri dönüşte `--tenants` zorunludur; varsayılan hedef yoktur.
- `--rehearsal-database` verildiyse `--tenants` zorunludur, listedeki her firma için bir tane olmalıdır ve adı tam olarak `AIERPTenant_<guid:N>_TplRehearsal` olmalıdır (başka firmanın kopyası, `AIERPTenant_R9Rehearsal` ya da başka bir `*_TplRehearsal` reddedilir). Böylece bir firma sessizce canlı veritabanına düşmez.
- Provada `--expect-databases` zorunludur. Verildiğinde (canlıda da verilmesi önerilir) çözülen hedef adları bu listeyle **birebir** aynı değilse komut hiçbir veritabanını açmadan durur.
- Komut önce hedef veritabanı adlarını `[PROVA KOPYASI]` ya da `[CANLI]` etiketiyle ekrana yazar; listeyi oku ve beklediğin adlarla karşılaştır.
- Çıkış kodu: `0` bitti; `1` bir sayfada yazma hatası oldu (taşıma/geri dönüş) ya da doğrulama başarısız / batch'te kayıt yok (doğrulama); `2` argüman ya da hedef hatası, hiçbir şey yazılmadı (yalnız ileti, yığın izi yok).

Kullanılacak değişkenler (değerleri kendi oturumunda doldur):

```powershell
$ctx     = 'nexora-remote'
$api     = 'nexora-platform-api-1'
$sql     = 'nexora-sqlserver-1'                 # doğrulanmadı: docker --context $ctx ps ile kontrol et
$batch   = 'tpl-20261126-1'                     # her deneme için yeni, benzersiz ad
$ids     = @('<guid1>', '<guid2>')              # yalnız onaylanan firmalar; R9Rehearsal ASLA
$stamp   = Get-Date -Format 'yyyyMMdd-HHmm'
$tenants = $ids -join ','
$live    = ($ids | ForEach-Object { 'AIERPTenant_' + ([guid]$_).ToString('N') }) -join ','
$copies  = ($ids | ForEach-Object { 'AIERPTenant_' + ([guid]$_).ToString('N') + '_TplRehearsal' }) -join ','
$rehearsal = ($ids | ForEach-Object { "--rehearsal-database=$_=AIERPTenant_$(([guid]$_).ToString('N'))_TplRehearsal" }) -join ' '
```

---

## Adım 0: Şema geçişi (MigrationBatch kolonu)

**Amaç:** Komutların yazdığı `TenantCustomPageRevisions.MigrationBatch` kolonunun canlı şemada olması.

Bu sürüm iki EF Core geçişi getirir: firma veritabanları için `20261126201231_AddTenantCustomPageRevisionMigrationBatch` (Tenant) ve PlatformDB eşi `20261126201426_AddCustomPageRevisionMigrationBatch` (Platform). İkisi de yalnız nullable bir kolon ekler (expand). Bunlar komutla **uygulanmaz**; `docs/release-migrations.md`'deki olağan denetimli sürüm adımıyla (yedek, kopyada prova, `sqlcmd -I -b` ile betik, sonra canlı) bütün firma veritabanlarına ve PlatformDB'ye uygulanır.

**Başarı:** Her hedef firma veritabanında `SELECT COL_LENGTH('dbo.TenantCustomPageRevisions', 'MigrationBatch')` boş olmayan bir değer döner ve `__EFMigrationsHistory` içinde `20261126201231_AddTenantCustomPageRevisionMigrationBatch` vardır.

**Hata olursa:** Kolon yoksa dur; adım 3'ten (yedek) önce şema geçişini tamamla. Yedek bu adımdan **sonra** alınmalıdır, yoksa prova kopyasında kolon olmaz.

## Adım 1: Canlıda salt okunur rapor

**Amaç:** Hangi sayfaların taşınabildiğini, hangilerinin neden taşınmadığını görmek. Veri yazılmaz.

**Önce:** TCP vuruşunu yap. `docker --context $ctx ps` ile yığının ayakta olduğunu, `vault status` çıktısında `Sealed false` yazdığını doğrula.

**Komut (tek PowerShell çağrısı):**

```powershell
docker --context $ctx exec $api sh -c "mkdir -p /tmp/tpl-report-$stamp && cd /app && dotnet AIERP.Api.dll --page-template-migration-report --out=/tmp/tpl-report-$stamp"
docker --context $ctx cp ${api}:/tmp/tpl-report-$stamp ./tpl-report-$stamp
```

`--tenants=` verilmezse rapor bütün etkin firmaları tarar; rapor salt okunur olduğu için buna izin verilir. Rapor, taşımanın kurallarını uygular: sistem sayfaları ("Sistem sayfası; standartlar ayrı geçirilir.") ve taslak satırları hedefsizdir, açık taslağı olan yayın da taşınabilir sayılmaz; firmanın etkin kataloğu (`dataSource` / `action` sorguları) hesaba katılır. Bu yüzden rapordaki "Liste + Serbest" toplamı, taşımanın taşıyacağı sayfa sayısıdır.

**Başarı:** Komut 0 koduyla biter. `tpl-report-<damga>` içinde `rapor.json` ve `rapor.md` vardır. Özette firma başına ve toplam sayılar ile en sık 10 neden görünür. Rapor sorgu sonucu, SQL metni ya da kullanıcı verisi içermez.

**Hata olursa:** Dur. Çıktıyı sakla. Vault mühürlüyse kullanıcıya haber ver. Hiçbir şey yazılmadığı için geri dönüş gerekmez.

## Adım 2: Raporu kullanıcıya göster

**Amaç:** Kullanıcının neyin taşınacağını, neyin taşınmayacağını görmesi.

**Neden metinleri (5b-2 adım 1, 2026-11-27):** "Form alanları (Kayıt kartı adayı)." ve çubuğun ayarlarını tek tek reddeden "… ayarı kalıplarda yok." (`hiddenCommands`, `commandWhen`…) nedenleri kalktı: üst düzey işlem çubuğu artık kalıbın `commands` yerine taşınır ve form sayfaları Kayıt kartına denenir. Eklenenler: "İşlem çubuğunun <ayar> ayarının kalıpta karşılığı yok." (`barLook`, `formDialog`, `exportCsv`, `visibleWhen`, `disabledWhen`, `margin`, Yeni/Aç penceresi…); "Yazdır görünür ama bağlı değil; kalıpta görünen Yazdır yazdırır."; Kayıt kartı için "Kayıt kartı tam bir kayıt özeti (recordHeader) ister.", "Kayıt kartının bölümleri sayfa parametresiyle okunan bir kayda bağlı değil.", "Kayıt kartında her alan bir bölümde olmalı: <id>.", "Kayıt kartında bölümlerin arasına yalnız açıklama (text) konabilir: <id>.", "Kayıt kartında başlıkta kayıt sayısı yok.", "Veri listesinin satır eylemleri kayıt kartında yok.", "Kayıt kartının kayıt/silme sonrası kuralı eski sayfadaki davranışı değiştirir."; taşımada "Kayıt kartına taşıma henüz açık değil.". "İşlem çubuğu kalıplarda yok." yalnız iç içe ya da ikinci bir çubuk için kalır.

**Neden metinleri (5b-2 adım 2, pencere ve grup):** "Pencere kalıplarda yok." ve "İç içe bileşenler (children) kalıplarda yok." nedenleri kalktı: pencere kalıbın `dialogs` yerine, içeriği (`contains`, penceredeki sekmelerin gösterdikleri ve bunlardaki form kartlarının girişleri) `dialog` yerine taşınır; tek katlı gruplar (`section`/`card` + `children`) olduğu gibi kalır, genişlikleri silinir; Liste'de seçili satıra bağlı ya da detay paneli içeren kart grubu `detail` yerine gider. Yerlerine gelen somut nedenler:

| Neden | Ne zaman |
|---|---|
| "Pencerenin sunumu ya da boyutu kalıplarda yok." | Pencere `dialog` dışında bir sunumla (ör. `drawer`) ya da `sm`/`md`/`lg`/`xl` dışında bir boyutla (ör. `full`). |
| "<tür> pencerenin içinde kalıplarda yok." | Pencerenin içeriğinde izinsiz bir tür (izinliler: `recordHeader`, `section`, `card`, `formCard`, `input`, `text`, `alert`, `metric`, `button`, `dataTable`, `tabs`). Pencere içindeki `editableGrid` ve `steps` kendi nedenleriyle ("Düzenlenebilir satır tablosu (Belge kalıbı bekleniyor).", "Sihirbaz adımları kalıplarda yok.") kalır. |
| "Grubun içinde grup kalıplarda yok." | Grubun çocuğu bölüm, kart, pencere ya da kendi çocukları olan bir bileşen. |
| "<tür> grubun içinde kalıplarda yok." | Grubun çocuğunda izinsiz bir tür (izinliler: `badge`, `heading`, `text`, `metric`, `alert`, `button`, `formCard`, `dataTable`, `contextPanel`, `tabs`). |

Liste'de hiçbir form kartına, sekmeye ya da pencereye ait olmayan gizli giriş (`hidden: true`, yalnız sayfa durumu) `above` yerine gider; görünür sahipsiz giriş yine "input bu kalıpta yok." ile kalır. `finance-ledger-chart` bu adımda taşınmaz: detay kartının sekmesi üst düzey form kartlarını, girişlerini ve ikinci bir detay panelini gösterir, bunların Liste'de tanımlı yeri yok (raporda ilk neden "formCard bu kalıpta yok.").

Pencere içeriği ve grubun yeri ayrıca kalıp doğrulamasından geçer; geçmezse neden "Dönüştürülen tanım doğrulanamadı: …" olarak yazılır (ör. grup Liste detayı ya da pencere dışında).

**Yapılacak:** Markdown raporu kullanıcıya göster. Şunları ayrıca belirt: kaç sayfa taşınabilir, en sık nedenler, "eşdeğerlik denetimi başarısız" satırları.

**Başarı:** Kullanıcı hedef firmaları ve sayfa sayılarını gördüğünü söyler. Bu adım canlıda yazma izni **vermez**.

**Hata olursa:** Rapor beklenmedik görünüyorsa (ör. çok az taşınabilir sayfa) dur ve kullanıcıya sor.

## Adım 3: Yedek ve doğrulama

**Amaç:** Hedef firma veritabanlarının doğrulanmış yedeğini almak. Bu yedek, geri yükleme provasının da kaynağıdır. Adım 0 tamamlanmış olmalıdır.

Hedefleri açıkça yaz; `R9Rehearsal` listede olmaz. Her hedef veritabanı için `backup.sql` dosyasını hazırla:

```sql
BACKUP DATABASE [AIERPTenant_<guid1:N>]
  TO DISK = N'/var/opt/mssql/backups/pretpl-<damga>-AIERPTenant_<guid1:N>.bak'
  WITH COPY_ONLY, CHECKSUM, COMPRESSION, STATS = 10;
RESTORE VERIFYONLY
  FROM DISK = N'/var/opt/mssql/backups/pretpl-<damga>-AIERPTenant_<guid1:N>.bak'
  WITH CHECKSUM;
```

Kapsayıcıya kopyala ve kapsayıcının içinde çalıştır:

```powershell
docker --context $ctx cp .\backup.sql ${sql}:/tmp/backup.sql
docker --context $ctx exec $sql sh -c '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -I -b -i /tmp/backup.sql'
```

`sqlcmd` yolu imaja göre `/opt/mssql-tools/bin/sqlcmd` olabilir. Tek tırnak sayesinde `$MSSQL_SA_PASSWORD` kapsayıcının içinde açılır; parola dışarı çıkmaz.

**Başarı:** Her veritabanı için "BACKUP DATABASE successfully processed" ve "The backup set on file 1 is valid." satırları görünür. `sqlcmd` 0 koduyla biter (`-b` hata olursa durdurur).

**Hata olursa:** Dur. Yedeği alınamayan ya da doğrulanamayan veritabanı için sonraki adımlara geçme. Disk alanını ve izinleri kontrol et.

## Adım 4: Geri yüklenmiş kopyada taşıma (prova)

**Amaç:** Taşımayı canlı veriye dokunmadan gerçek veriyle denemek.

**4a. Kopyayı geri yükle ve çalışma oturumunu doğrula.** Ad kuralı tam olarak `AIERPTenant_<guid:N>_TplRehearsal`'dır (komut başka adı kabul etmez). Kopya, canlı veritabanıyla **aynı SQL sunucusuna** geri yüklenir (komut, canlı yönlendirmenin sunucusunu ve kimlik bilgisini kullanır; yalnız veritabanı adını değiştirir). Her hedef için:

```sql
RESTORE DATABASE [AIERPTenant_<guid1:N>_TplRehearsal]
  FROM DISK = N'/var/opt/mssql/backups/pretpl-<damga>-AIERPTenant_<guid1:N>.bak'
  WITH MOVE N'<mantiksal-veri-adi>' TO N'/var/opt/mssql/data/AIERPTenant_<guid1:N>_TplRehearsal.mdf',
       MOVE N'<mantiksal-log-adi>'  TO N'/var/opt/mssql/data/AIERPTenant_<guid1:N>_TplRehearsal_log.ldf',
       CHECKSUM, STATS = 10;
DBCC CHECKDB ([AIERPTenant_<guid1:N>_TplRehearsal]) WITH NO_INFOMSGS;
```

Mantıksal adları `RESTORE FILELISTONLY FROM DISK = N'…'` ile öğren. `DBCC CHECKDB` hatasız bitmelidir.

Firmanın ERP çalışma oturumu (`aierp_t_<guid:N>`) kopyada eşlenmiş olmalıdır. Sağlama işçisi bu kullanıcıyı `CREATE USER … FOR LOGIN …` ile sunucu oturumuna bağlar; aynı sunucuya geri yüklenen kopyada kullanıcı aynı SID ile gelir ve eşleme kendiliğinden korunur. Doğrula:

```sql
USE [AIERPTenant_<guid1:N>_TplRehearsal];
SELECT dp.name AS db_user, sp.name AS server_login
FROM sys.database_principals AS dp
LEFT JOIN sys.server_principals AS sp ON sp.sid = dp.sid
WHERE dp.name = N'aierp_t_<guid1:N>';
```

`server_login` sütunu `aierp_t_<guid1:N>` olmalıdır. Boşsa (yetim kullanıcı; ör. başka sunucuya geri yükleme) eşle: `ALTER USER [aierp_t_<guid1:N>] WITH LOGIN = [aierp_t_<guid1:N>];` ve sorguyu tekrarla. Kullanıcı `db_datareader` ve `db_datawriter` rollerinde kalır; ek yetki verilmez.

**4b. Taşımayı kopyaya yönelt.** Canlı API kapsayıcısında, **her** firma için `--rehearsal-database` ve kopya adlarıyla `--expect-databases` vererek çalıştır:

```powershell
docker --context $ctx exec $api sh -c "mkdir -p /tmp/tpl-run-$stamp && cd /app && dotnet AIERP.Api.dll --page-template-migration-run=$batch --tenants=$tenants $rehearsal --expect-databases=$copies --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP --out=/tmp/tpl-run-$stamp"
docker --context $ctx cp ${api}:/tmp/tpl-run-$stamp ./tpl-run-$stamp
```

Komut hedefleri yazar ve yalnız hepsi `[PROVA KOPYASI]` ise ve `--expect-databases` ile birebir aynıysa devam eder. **Ekrana yazılan adlar `_TplRehearsal` ile bitmiyorsa ya da komut 2 koduyla durduysa DUR.**

**Başarı:** Ekrana yazılan hedef adları yalnız `AIERPTenant_<guid:N>_TplRehearsal` kopyalarıdır ve "Hedefler --expect-databases ile aynı." satırı görünür. Taşınan sayfa sayısı rapordaki "Liste + Serbest" toplamıyla uyuşur; raporun "Kayıt kartı" sütunundaki sayfalar taşınmaz, "Kayıt kartına taşıma henüz açık değil." nedeniyle atlanır (hata sayılmaz, çıkış kodunu değiştirmez). Atlanan sayfalar nedenleriyle listelenir. Kopyada her taşınan sayfa için iki sürüm oluşur: `BeforeTemplateMigration` ve `TemplateMigrated` (aynı `MigrationBatch`). Çıkış kodu 0'dır.

**Hata olursa:** Dur. Canlı veriye hiç dokunulmadı; kopyayı silip yeniden geri yüklemek serbesttir (adım 8). Hata ayrıntısını sakla ve kullanıcıya göster.

## Adım 5: Davranış denetimi

**Amaç:** Taşınan sayfaların aynı davrandığını göstermek.

1. **Saklı çiftlerin yeniden denetimi (kopyada, otomatik).** Doğrulama komutu batch'teki her sayfanın saklı `BeforeTemplateMigration` ve `TemplateMigrated` sürümlerini eşler (taşınmış sürüm = öncesi + 1), taşınmış tanımın Liste ya da Serbest kalıbını taşıdığını denetler ve `BehaviorEquivalence` denetimini bu gerçek çiftler üzerinde yeniden çalıştırır. Hiçbir şey yazmaz:

   ```powershell
   docker --context $ctx exec $api sh -c "mkdir -p /tmp/tpl-verify-$stamp && cd /app && dotnet AIERP.Api.dll --page-template-migration-verify=$batch --tenants=$tenants $rehearsal --expect-databases=$copies --out=/tmp/tpl-verify-$stamp"
   ```

   İstersen çiftleri SQL ile de listele (tanım içeriğini göstermez):

   ```sql
   USE [AIERPTenant_<guid1:N>_TplRehearsal];
   SELECT b.Code, b.Revision AS before_rev, m.Revision AS migrated_rev,
          LEN(b.DefinitionJson) AS before_len, LEN(m.DefinitionJson) AS migrated_len
   FROM dbo.TenantCustomPageRevisions AS b
   LEFT JOIN dbo.TenantCustomPageRevisions AS m
     ON m.CustomPageId = b.CustomPageId AND m.MigrationBatch = b.MigrationBatch
    AND m.ChangeKind = N'TemplateMigrated' AND m.Revision = b.Revision + 1
   WHERE b.MigrationBatch = N'<batch>' AND b.ChangeKind = N'BeforeTemplateMigration'
   ORDER BY b.Code;
   ```

   `migrated_rev` hiçbir satırda boş olmamalı ve satır sayısı adım 4b'deki taşınan sayfa sayısına eşit olmalıdır.

2. **Ekran karşılaştırması (canlı taşımadan sonra).** Arayüz (ERP Web) yalnız firmanın canlı veritabanına yönlendirilir; prova kopyasını arayüzde açmanın bir yolu **yoktur**. Bu yüzden görsel karşılaştırma provada yapılamaz. Adım 7'deki canlı taşımadan hemen sonra birkaç taşınan sayfayı (her kalıptan en az biri) **üç genişlikte** (masaüstü ≈1440, tablet ≈768, telefon ≈375) aç. "Önce" için Studio'daki sayfa geçmişinde `BeforeTemplateMigration` sürümüne bak. Bakılacaklar: bileşenler yerinde mi, hiçbiri kaybolmadı mı, düğmeler ve filtreler çalışıyor mu, tablo aynı satırları gösteriyor mu. Bu sırada geri dönüş komutu hazır olsun (adım 7 ve "Geri dönüş").

**Başarı:** Doğrulama komutu 0 koduyla biter, her çift "doğrulandı" görünür ve SQL listesi eksiksizdir. Görsel denetimin canlı taşımadan sonra yapılacağı kullanıcıya açıkça söylenir.

**Hata olursa:** Doğrulama bir çifti reddederse (kod 1) dur. O sayfayı adım 6'daki `--page=<kod>` ile kopyada geri al ve nedenini not et. Canlıya geçme.

## Adım 6: Kopyada geri dönüş denemesi

**Amaç:** Geri dönüşün çalıştığını canlıdan önce görmek.

```powershell
docker --context $ctx exec $api sh -c "cd /app && dotnet AIERP.Api.dll --page-template-migration-rollback=$batch --tenants=$tenants $rehearsal --expect-databases=$copies --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP"
```

Tek sayfayı denemek için `--page=<kod>` ekle.

**Başarı:** Hedefler yalnız `_TplRehearsal` kopyalarıdır. Her sayfa için `BeforeTemplateMigration` tanımı yayın olarak geri yazılır (`ChangeKind = "TemplateMigrationRolledBack"`) ve sayfa tanımı geçiş öncesiyle aynıdır. Bu arada değiştirilmiş ya da geçişten sonra açık taslağı olan sayfalar atlanır ve raporlanır.

**Hata olursa:** Dur. Geri dönüş kopyada bile çalışmıyorsa canlıda taşıma yapma. Düzeltme yeni bir PR ile gelir.

Sonra adım 4b'yi **yeni bir batch adıyla** ve aynı `$rehearsal` / `--expect-databases=$copies` argümanlarıyla canlı API kapsayıcısında tekrar çalıştır; canlıda kullanılacak durum kopyada son kez denenmiş olsun. Ardından adım 5.1'i bu batch için tekrarla.

## Adım 7: Kullanıcı onayıyla canlıda taşıma

**Önkoşullar (hepsi sağlanmadan başlama):**

- Kullanıcı prova raporunu ve adım 5–6 sonuçlarını gördü ve **canlıda taşımayı açıkça onayladı**.
- Adım 3'teki yedekler taze (aynı gün) ve `RESTORE VERIFYONLY` geçti.
- `vault status` çıktısında `Sealed false` yazıyor.
- `--tenants` yalnız onaylanan canlı firma kimliklerini içerir. `--rehearsal-database` **verilmez**; `--expect-databases` canlı adları (`$live`) listeler.

**Komut (tek PowerShell çağrısı):**

```powershell
docker --context $ctx exec $api sh -c "mkdir -p /tmp/tpl-run-$stamp && cd /app && dotnet AIERP.Api.dll --page-template-migration-run=$batch --tenants=$tenants --expect-databases=$live --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP --out=/tmp/tpl-run-$stamp"
docker --context $ctx cp ${api}:/tmp/tpl-run-$stamp ./tpl-run-$stamp
```

**Başarı:** Ekrana yazılan veritabanı adları onaylanan canlı `AIERPTenant_<guid:N>` adlarıdır (`[CANLI]`). Taşınan ve atlanan sayfa sayıları prova ile uyuşur. Çıkış kodu 0'dır. Sonra doğrulama komutunu canlıda çalıştır (`--page-template-migration-verify=$batch --tenants=$tenants --expect-databases=$live`) ve adım 5.2'deki görsel denetimi yap.

**Hata olursa:** Dur. Sayfa başına işlem yapıldığı için kısmi taşıma olabilir; bu beklenen davranıştır. Çıkış kodu 1 ise en az bir sayfada yazma hatası olmuştur. Aşağıdaki "Geri dönüş" bölümünü uygula. Batch adını sakla.

## Adım 8: Kopyaların silinmesi

**Amaç:** Prova kopyalarını temizlemek.

```sql
DROP DATABASE [AIERPTenant_<guid1:N>_TplRehearsal];
```

Yalnız adı `_TplRehearsal` ile biten ve bu yordamda **senin** oluşturduğun kopyaları sil. `.bak` yedeklerini canlı taşıma doğrulanana kadar sakla.

**Başarı:** `SELECT name FROM sys.databases WHERE name LIKE '%[_]TplRehearsal'` boş döner.

**Hata olursa:** Ad listesini bir kez daha oku; emin olmadığın veritabanını silme.

---

## Geri dönüş

- Canlıda bir batch'i geri almak için:

  ```powershell
  docker --context $ctx exec $api sh -c "cd /app && dotnet AIERP.Api.dll --page-template-migration-rollback=$batch --tenants=$tenants --expect-databases=$live --confirm-page-template-migration=I_HAVE_A_VERIFIED_BACKUP"
  ```

  Kopyada geri almak için adım 6'daki komutu kullan (`$rehearsal` ve `--expect-databases=$copies` ile).

- Tek sayfa için `--page=<kod>` ekle.
- Her sayfanın `BeforeTemplateMigration` sürümü yayın olarak geri yazılır (`TemplateMigrationRolledBack`).
- Sayfa taşımadan sonra yeniden değiştirildiyse (son sürüm `TemplateMigrated` değilse) ya da geçişten sonra açılmış bir taslağı varsa o sayfa **atlanır** ve raporlanır. `--force` yoktur. Atlanan sayfayı elle ele al.
- Komut başarısız olur ya da sonuç şüpheliyse son çare, adım 3'teki doğrulanmış yedekten geri yüklemedir. Bu, yedekten sonra yazılan firma verisini de geri alır; yalnız kullanıcı onayıyla yapılır.
- Şema tarafı expand-only'dir (`MigrationBatch` nullable kolon); API'yi eski sürüme almak güvenlidir, eski kod kolonu yok sayar.

## Yapılmayacaklar

- `--force` ya da benzeri bir koruma atlatma yok.
- `--tenants` vermeden taşıma ya da geri dönüş çalıştırma.
- Provada bir firmayı `--rehearsal-database` olmadan bırakma ya da `--expect-databases` vermeden çalıştırma (komut zaten reddeder).
- `AIERPTenant_R9Rehearsal` veritabanını hiçbir zaman hedef alma.
- `_TplRehearsal` kopyalarını canlı `--expect-databases` listesine koyma.
- Sayfa sürümlerini (revizyonları) silme ya da düzenleme; geri dönüş yalnız yeni sürüm yazar.
- Onay bayrağını doğrulanmış yedek olmadan yazma.
- Kullanıcı onayı olmadan canlıda taşıma ya da geri dönüş çalıştırma; Vault mührünü kendin açma.
