# Sayfa tasarımcısında SQL sorguları, değişkenler ve sayfa yetkileri — tasarım

Tarih: 2026-11-16 · Durum: taslak (onay bekliyor)

## Amaç ve neden

Sayfa tasarımcısında ("Uyarlama araçları → Sayfa tasarımcısı") ızgara ve gösterge bileşenleri bugün yalnız rapor kataloğundaki sabit veri kaynaklarına (`/api/reports/catalog`) bağlanabiliyor. Her kaynağın sütunları ve filtreleri `src/Hosts/AIERP.Api/ReportEndpoints.cs` içinde elle kodlanmış. "Vadesi geçmiş cari hesaplar" gibi her yeni ihtiyaç kod değişikliği gerektiriyor. Kullanıcı bunu ölçeklenmez buluyor.

Hedef: sayfa tasarımcısını küçük bir uygulama kurucusuna dönüştürmek. Yönetici:
- sayfaya adlandırılmış SQL sorguları ekler (okuyan ve yazan: `SELECT`, `INSERT`, `UPDATE`, `DELETE`);
- sorgu sonuçlarını ve ekrandaki girişleri değişken gibi kullanır;
- etiket, input, ızgara, gösterge ve buton bileşenlerini bu değişkenlere bağlar;
- sayfayı kimin görüp kimin hangi yazma işlemini yapabileceğini kullanıcı bazında seçer.

Yeni ihtiyaçlar kod değişikliği yerine sayfa tanımı olur.

## Kullanıcının kararları

- SQL'i **yönetici** (TenantAdmin) yazar. Diğer kullanıcılar SQL yazmaz, göndermez.
- Sayfa yetkileri **sayfanın üzerinde**, sayfa tasarımcısında yönetilir; yönetici kullanıcı bazında seçer (seçilen yaklaşım 1).
- Butonlar `INSERT`/`UPDATE`/`DELETE` çalıştırabilir. Yönetici kimin hangi işlemi yapabileceğini seçer.
- Sorgu sonuçları ve girişler değişken gibi kullanılır; input, etiket gibi bileşenlerde gösterilir.
- **Yazan sorgular kiracının ERP veritabanındaki tüm tablolarda serbesttir** (seçenek c).
  - Kullanıcı riskler hakkında bilgilendirildi: hareket ve muhasebe tablolarında ters kayıt kuralının atlanması, kapalı döneme yazma, bakiye tutarsızlığı, iş kurallarının ve eşzamanlılık kontrolünün devre dışı kalması.
  - Kullanıcı daha korumalı seçenekleri (a: yalnız ek tablolar, b: ana kayıtlar serbest, hareket tabloları kilitli) bilerek seçmedi.

## Bugünkü durum (keşif)

- **SQL raporu altyapısı yarı hazır.**
  - `ReportEndpoints.cs` içinde `customSql` kaynağı ve `GET /api/reports/sql-schema` var.
  - En fazla 10 firmada çalıştırma seçeneği var (`CompanyIds`).
  - `TryValidateReadOnlySql` yalnız tek bir `SELECT`/`WITH` ifadesine izin veriyor.
  - Kayıtlı raporlar `TenantSavedReport` ve `TenantSavedReportRevision` ile sürümlü saklanıyor.
  - Ancak `RunAsync` `customSql` için 503 dönüyor; salt okunur veritabanı erişimi bekleniyor.
- **Veritabanı bağlantısı.**
  - API kiracı ERP veritabanına (`AIERPTenant_<guid>`) `db_datareader` + `db_datawriter` yetkili çalışma kullanıcısıyla bağlanıyor.
  - Kimlik bilgileri Vault'ta (`VaultTenantSqlCredentialStore`, bileşenler `Erp`, `AiStudio`), yönlendirme `TenantDatabaseRouting` içinde.
  - Kiracı veritabanları ve kullanıcıları `AIERP.TenantProvisioningWorker` tarafından oluşturuluyor.
  - `TenantDatabaseProvisioner.GrantDatabaseRuntimeAccessAsync` bir `readOnly` parametresi alıyor.
- **Sayfa tanımı ve çalıştırma.**
  - `TenantCustomPage` sayfası `DefinitionJson` tutuyor (`schemaVersion: 1`, bileşen listesi). Sürüm geçmişi, taslak/yayın akışı var.
  - Sayfa bazında yetki yok; yayımlanmış sayfayı genel uyarlama okuma iznine sahip herkes görüyor.
  - Roller yalnız `TenantAdmin` ve `TenantUser`. Ayrıca `TenantPermissionRule` ile izin/ret kuralları var.
- **Arayüz.**
  - Tasarımcı: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`; `customSql` kaynağını listeden çıkarıyor.
  - ERP çalışma zamanı: `frontend/erp-web/src/TenantCustomPage.tsx` + `TenantReportWidget.tsx`. Görüntüleyenin token'ıyla `POST /api/reports/run` çağırıyor.
  - Butonlar bugün yalnız iş akışı başlatabiliyor (`actionType: "workflow"`).
- **Mevcut başka yazma araçları.** Özel veri modelleri için kayıt CRUD uç noktaları (`TenantCustomDataEndpoints.cs`), özel formlar ve iş akışları zaten var.

## Hedefler

1. **Sorgular.** Yönetici sayfaya adlandırılmış sorgular ekler: okuma (`SELECT`/`WITH`) ya da yazma (`INSERT`/`UPDATE`/`DELETE`).
   - Okuma sorguları sayfa açılınca ya da bağlı oldukları değişken değişince çalışır.
   - Yazma sorguları yalnız bir buton tarafından çalıştırılır.
2. **Değişkenler ve bağlama.**
   - Bileşenler ve sorgular `{{…}}` ifadeleriyle değişkenlere bağlanır:
     - input değerleri (`{{gunEsigi.value}}`)
     - sorgu sonuçları (`{{vadeliCariler.rows}}`, `{{vadeliCariler.rowCount}}`, `{{vadeliCariler.rows[0].Bakiye}}`)
     - ızgaranın seçili satırı (`{{izgara.seciliSatir.Id}}`)
   - Etiket, input varsayılan değeri, ızgara verisi, gösterge değeri ve buton etiketi bağlanabilir.
3. **Butonlar.** Bir buton:
   - bir yazma sorgusu çalıştırır;
   - isteğe bağlı olarak onay penceresi gösterir;
   - sonra seçilen okuma sorgularını yeniler.
4. **Sayfa yetkileri.** Yönetici her sayfa için kullanıcı bazında **Görüntüle / Ekle / Güncelle / Sil** yetkilerini seçer. Yöneticiler her şeye yetkilidir.
5. **Rapor oluşturucuda SQL raporları açılır.** Yalnız yönetici için, salt okunur bağlantıyla.

## Kapsam dışı

- Yönetici olmayanların SQL yazması.
- Sayfa çalışırken birden çok firmada sorgu çalıştırmak. Sayfa sorguları yalnız aktif kiracının ERP veritabanında çalışır; çok firmalı okuma rapor oluşturucuda kalır.
- Şema değiştirme (`CREATE`/`ALTER`/`DROP`), yordam ya da fonksiyon çalıştırma (`EXEC`), veritabanları arası erişim, çoklu ifade/toplu betik.
- Platform veritabanına ya da AIStudio veritabanına erişim.
- JavaScript gibi serbest betik dili. Bağlama ifadeleri yalnız değişken yoludur (`ad.alan`, `ad.rows[0].alan`); hesaplama yapılmaz.
- Rol/grup bazlı yetki. Yetki kullanıcı bazındadır; yöneticiler her zaman yetkilidir.
- İzin kuralları ekranıyla senkronizasyon (yaklaşım 3).

## Olmaması gerekenler

Teknik olarak çalışsa bile başarısızlık sayılacak durumlar:
- **Kullanıcının SQL göndermesi.** Görüntüleyen kullanıcı tarayıcıdan SQL metni gönderebilir ya da sayfada tanımlı olmayan bir sorguyu çalıştırabilirse.
- **SQL enjeksiyonu.** `{{…}}` değerleri SQL metnine eklenirse. Değerler her zaman `SqlParameter` olarak gönderilmelidir.
- **Yetkisiz yazma.** Yetkisi olmayan kullanıcının bir yazma sorgusunu çalıştırabilmesi; buton gizli olsa bile sunucu reddetmelidir.
- **Kiracı sınırının aşılması.** Bir kiracının sorgusunun başka bir kiracının veritabanına, Platform ya da AIStudio veritabanına erişebilmesi.
- **Yanlışlıkla herkese açılma.** SQL içeren bir sayfanın varsayılan olarak herkese açık yayımlanması.
- **Okumanın yazma yetkisiyle çalışması.** Okuma sorgusunun yazma yetkili bağlantıyla çalışması (okuma ↔ yazma ayrımının uygulama tarafında kalması).
- **İzsiz yazma.** Bir yazma sorgusu çalıştırmasının denetim kaydı olmadan gerçekleşmesi. Bu kayıtlar Platform veritabanında tutulur (bölüm 9).
- **Kendine yetki yazma.** Bir sorgunun sayfa yetkilerini değiştirebilmesi. Yetkiler Platform veritabanında tutulur (bölüm 9).

## Kısıtlar

- Katman sınırları (`ArchitectureBoundaryTests`) ve servis izolasyonu korunur; SQL bağlantılarını yalnız `AIERP.Api` kullanır.
- Kiracı kapsamı yalnız doğrulanmış `tenant_id` claim'inden gelir.
- Yeni uç noktalar `PlatformPermissionCatalog` girdisi ister.
- Migration'lar expand → migrate → contract (`docs/release-migrations.md`).
- Denetim kayıtları DB tetikleyicisiyle korunur. Yazan sorgular bu tetikleyiciyi aşamaz; denetim tablosuna `UPDATE`/`DELETE` veritabanında başarısız olur. Bu beklenen davranıştır.
- Canlı ortamda Tenant Provisioning Worker'ın durumu geçmişte engelliydi (`docs/phase-status.md`, 2026-10-27). Mevcut kiracılar için yeni SQL kullanıcıları kontrollü bir operasyon adımıyla oluşturulur.
- Kullanıcıya görünen metinler Türkçe.
- Ekran tasarımı değişiklikleri önce taslak olarak gösterilip onaylanır (kullanıcı kuralı).

## Değerlendirilen yaklaşımlar

### Sayfa yetkisinin yeri

1. **Sayfanın üzerinde (seçildi).** Tasarımcının "Sayfa ayarları" panelinde yetki tablosu bulunur. Yönetici yetkiyi sayfayı tasarladığı yerde görür. Bunun bedeli, platformun izin kuralları ekranından ayrı ikinci bir yetki yeri olmasıdır.
2. **Mevcut izin kuralları ekranı.** Platformla tutarlı olur, ama yetki tasarımcıdan ayrı bir yerde kalır ve gözden kaçar.
3. **İkisi birlikte, senkron.** En tutarlısı, ama en karmaşığı.

### Yazmanın kapsamı

- **a)** Yalnız yöneticinin tanımladığı ek tablolar.
- **b)** ERP ana kayıtları serbest; hareket, muhasebe ve denetim tabloları veritabanında kilitli.
- **c)** Tüm tablolar serbest (seçildi).

Kullanıcı **c**'yi seçti. Önerilen **b** idi.

## Tasarım

### 1. Veritabanı kullanıcıları (kiracı başına)

Her kiracı ERP veritabanı için iki yeni SQL kullanıcısı oluşturulur:
- **Okuma kullanıcısı.** Yalnız `db_datareader`.
- **Yazma kullanıcısı.** `db_datareader` + `db_datawriter`.
- **Ortak kısıtlar.** İki kullanıcıda da şema değiştirme, `EXECUTE`, `VIEW SERVER STATE`, veritabanları arası erişim yoktur. Login yalnız bu veritabanına eşlenir; Platform ve AIStudio veritabanlarında kullanıcısı yoktur.

Okuma sorguları her zaman okuma kullanıcısıyla, yazma sorguları yazma kullanıcısıyla çalışır.

- **Neden ayrı kullanıcılar:** Okuma ve yazma ayrımı veritabanı yetkisine dayanır. Mevcut API çalışma kullanıcısı paylaşılmaz; böylece yetkiler bağımsız daraltılabilir ve izlenebilir.
- **Saklama:** Kimlik bilgileri Vault'ta mevcut yapının yanında yeni bileşenler olarak saklanır (örn. `ErpQueryRead`, `ErpQueryWrite`).
- **Oluşturma:** Yeni kiracılarda Provisioning Worker oluşturur. Mevcut kiracılar için tekrar çalıştırılabilir bir operasyon adımı ve runbook yazılır.

### 2. Sorgu modeli (sayfa tanımında)

Sayfa tanımına (`DefinitionJson`, yeni `schemaVersion: 2`) bir `queries` listesi eklenir:

```json
{
  "schemaVersion": 2,
  "queries": [
    { "id": "q1", "name": "vadeliCariler", "kind": "read",
      "sql": "SELECT c.Code, c.Name, ... WHERE ... > @gunEsigi",
      "parameters": [{ "name": "gunEsigi", "binding": "{{gunEsigi.value}}", "type": "int" }],
      "runOn": "load" },
    { "id": "q2", "name": "riskLimitiSifirla", "kind": "update",
      "sql": "UPDATE Customers SET RiskLimit = 0 WHERE Id = @id",
      "parameters": [{ "name": "id", "binding": "{{izgara.seciliSatir.Id}}", "type": "guid" }] }
  ],
  "components": [ ... ]
}
```

- **`kind`.** `read` | `insert` | `update` | `delete`. Yönetici seçer; sunucu SQL'in ilk anahtar kelimesiyle uyumunu doğrular.
  - `read`: `SELECT`/`WITH`.
  - `insert`: `INSERT`.
  - `update`: `UPDATE`.
  - `delete`: `DELETE`.
  - Tek ifade şartı ve yasak anahtar kelimeler (`EXEC`, DDL, `INTO` ile yeni tablo, `OPENROWSET` vb.) mevcut doğrulayıcı genişletilerek kontrol edilir.
  - Asıl sınır veritabanı yetkisidir; doğrulayıcı kullanıcıya erken hata göstermek içindir.
- **Parametreler.**
  - SQL içinde `@ad` ile yazılır. Değerleri bağlama ifadesinden çözülür ve her zaman `SqlParameter` olarak, tanımlı türüyle gönderilir: `text`, `int`, `decimal`, `date`, `bool`, `guid`.
  - SQL metninde `{{…}}` kullanılamaz; doğrulayıcı reddeder.
- **Okuma sorgusu sonuçları.** `rows`, `rowCount`, `columns`, `truncated`.
- **Yazma sorgusu sonuçları.** `affectedRows`.
- **Tetikleme (`runOn`).**
  - `load`: sayfa açılınca ve parametreleri değişince çalışır, değişikliklerde 300 ms bekleme uygulanır.
  - `manual`: yalnız buton çalıştırır.
  - Yazma sorguları her zaman `manual`'dır.
- **Sınırlar.**
  - Komut zaman aşımı 30 sn.
  - Okumada en fazla 5.000 satır döner; fazlası kesilir, `truncated: true` olur.
  - Yazmada etkilenen satır sayısına sınır yoktur (kullanıcı kararı c). Ancak etkilenen satır sayısı yanıtta ve denetim kaydında yer alır.

### 3. Değişkenler ve bağlama

- **Değişken kaynakları:**
  - input bileşenleri (`{{inputAdi.value}}`)
  - okuma sorguları (`{{sorguAdi.rows}}`, `.rowCount`, `.rows[n].Sutun`)
  - ızgara seçili satırı (`{{izgaraAdi.seciliSatir.Sutun}}`)
  - oturum bilgisi (`{{kullanici.id}}`, `{{kullanici.ad}}`, `{{bugun}}`)
- **Bileşen adları.** Her bileşen ve sorgu sayfada benzersiz bir ada sahip olur. Adlar bağlamada kullanılır, Türkçe karakter içerebilir ama boşluk içeremez.
- **Bağlanabilen alanlar:**
  - etiket/başlık/açıklama metinleri (metin içinde birden çok `{{…}}`)
  - input varsayılan değeri
  - ızgara veri kaynağı (bir okuma sorgusu)
  - gösterge değeri
  - buton etiketi ve etkinliği (`{{izgara.seciliSatir}}` boşsa pasif)
- **Yeni bileşenler.**
  - **Etiket.** Bağlanabilir metin.
  - **Input.** Türler: metin, sayı, tarih, seçim kutusu, açılır liste. Açılır liste seçenekleri bir okuma sorgusundan gelebilir.
- **Değerlendirme.** Bağlama ifadeleri istemcide yalnız gösterim için çözülür. Sorgu parametreleri için istemci yalnız **ham değerleri** (input değerleri, seçili satırın gerekli alanları) gönderir. Sunucu sorguyu sayfa tanımından alır, parametreleri tanımdaki türlerle doğrular.
- **Bağımlılık sırası.** Döngüsel bağımlılık (sorgu A, B'nin sonucuna; B, A'ya bağlı) tasarımcıda kaydederken hata verir.

### 4. Butonlar

- Buton eylemi, `actionType: "workflow"`'un yanına yeni `actionType: "query"` olarak eklenir:
  - çalıştırılacak yazma sorgusu;
  - isteğe bağlı onay metni ("{{izgara.seciliSatir.Name}} carisinin risk limiti sıfırlanacak. Emin misiniz?");
  - başarı sonrası yenilenecek okuma sorguları;
  - başarı ve hata mesajı.
- Varsayılan: `delete` ve `update` sorgularında onay penceresi **açık** gelir; yönetici kapatabilir.
- Kullanıcının o sorgunun türü için yetkisi yoksa buton görünmez. Sunucu da ayrıca reddeder.

### 5. Sayfa yetkileri

Sayfaya erişim modeli eklenir:
- `AccessMode`: `AdminsOnly` | `AllUsers` | `SelectedUsers`.
- `SelectedUsers` için kullanıcı başına yetki seti: `View`, `Insert`, `Update`, `Delete`. Yetkiler Platform veritabanında, sayfa taslağından ayrı ve kendi revizyonlarıyla tutulur (bölüm 9).
- `AllUsers` modunda yönetici ayrıca tüm kullanıcılara hangi yazma türlerinin açık olduğunu seçer.

Kurallar:
- **Varsayılanlar.**
  - Mevcut sayfalar ve sorgusu olmayan sayfalar `AllUsers` + yalnız `View` olur; bugünkü davranış korunur.
  - Sorgu içeren bir sayfa `AdminsOnly` ile başlar.
- **Kim değiştirebilir.** Yetkileri yalnız TenantAdmin değiştirir. Her değişiklik sayfa revizyonu ve denetim kaydı olarak yazılır.
- **Sunucu kontrolü.** Sunucu yetkiyi şu noktalarda kontrol eder:
  - `GET /api/custom-pages/{code}/published`
  - `GET /api/custom-pages/{id}/preview`
  - özel menülerdeki sayfa bağlantıları
  - sorgu çalıştırma uç noktası (aşağıda)

  TenantAdmin her zaman yetkilidir.
- **Erişimi olmayan kullanıcı.** Erişimi olmayana sayfa menüde gösterilmez. Doğrudan açarsa "Bu sayfayı görüntüleme yetkiniz yok." mesajı görür.

Tasarımcıdaki görünüm (taslak; uygulamadan önce onaylanacak):
```
Erişim
(•) Seçili kullanıcılar   ( ) Tüm kullanıcılar   ( ) Yalnız yöneticiler
                 Görüntüle   Ekle   Güncelle   Sil
Ayşe Y.              ✓         ✓       ✓        –      [×]
Mehmet K.            ✓         –       –        –      [×]
[+ Kullanıcı ekle]
```

### 6. Sorgu çalıştırma uç noktası

`POST /api/custom-pages/{code}/queries/{queryId}/run`
- **Gövde:** `{ parameters: { ad: değer } }`. SQL ya da sorgu metni kabul edilmez.
- **Sunucunun yaptıkları, sırayla:**
  1. Kiracının **yayımlanmış** sayfa tanımını okur ve sorguyu tanımdan alır.
  2. Kullanıcının sayfadaki yetkisini sorgu türüne göre kontrol eder: `read` → `View`, `insert` → `Insert`, `update` → `Update`, `delete` → `Delete`.
  3. Parametreleri tanımdaki ad ve türlere göre doğrular. Fazla ya da eksik parametre hata verir.
  4. Sorguyu ilgili SQL kullanıcısıyla çalıştırır. Yazma sorgusu tek bir transaction içinde çalışır; hata olursa geri alınır.
  5. Sonucu döner.
- **Önizleme.** Tasarımcıdaki önizleme için taslak tanımı kullanan ayrı bir yol yalnız TenantAdmin'e açıktır. Yazma sorgularının önizlemede çalıştırılması ayrı bir "Gerçekten çalıştır" onayı ister; varsayılan önizleme yalnız okuma sorgularını çalıştırır.
- **Denetim.** Her çalıştırma denetim kaydına yazılır: kullanıcı, sayfa, sorgu adı ve türü, parametre değerleri, etkilenen ya da dönen satır sayısı, süre, sonuç.
  - Yazma sorgularında parametre değerleri tam yazılır.
  - Ek olarak etkilenen satırların önceki/sonraki değerleri, `OUTPUT inserted.*, deleted.*` ile ve satır sınırı olmadan yakalanıp ayrı bir denetim kaydına yazılır.
  - Bunun uygulanabilirliği builder'a bırakılmıştır (aşağıya bakın).
- **Hız sınırı.** Uç noktaya kullanıcı başına bir hız sınırı konur.

### 7. Rapor oluşturucuda SQL raporları

- `customSql` için 503 kaldırılır. Sorgu okuma kullanıcısıyla çalışır ve yalnız TenantAdmin içindir.
- Sınırlar sayfa okuma sorgularıyla aynıdır.
- Çok firmalı çalıştırma korunur. Her firmada o firmanın okuma kullanıcısı kullanılır ve yöneticinin o firmaya üyeliği doğrulanır.
- Bu, sayfa sorgularından bağımsız ilk teslim edilebilir parçadır.

### 8. Arayüz

Tüm ekran değişiklikleri uygulamadan önce taslak olarak gösterilip onaylanır.

- **Tasarımcıda yeni "Sorgular" paneli.** Mevcut Bileşenler/Katmanlar/Şablon sekmelerinin yanında yer alır ve şunları sunar:
  - sorgu listesi; her sorgunun adı, türü, SQL'i ve parametreleri;
  - SQL editörü: Monaco, `sql-schema` ile tablo/sütun tamamlama;
  - "Çalıştır" ile sonuç önizlemesi.
- **Bileşen özellikleri.** Bağlanabilen alanlarda `{{…}}` girişi ve değişken önerisi.
- **ERP çalışma zamanı.** `TenantCustomPage.tsx` sorguları, değişkenleri, input/etiket bileşenlerini ve buton eylemlerini çalıştırır. Yetkisiz, boş, kısaltılmış ve hata durumlarını gösterir.
- **Kopya sayfalar.** Studio'daki kopya ERP sayfaları (`platform-tools/erp-src/`) ile `frontend/erp-web` arasındaki ilgili dosyalar birlikte güncellenir.

### 9. Okuyucu kontrolünden sonra netleşen kararlar

Aşağıdakiler tasarımcının (Claude) kararlarıdır; kullanıcı aksini söylemedikçe geçerlidir.

- **Sorgu ya da yetki içeren sayfaların düzenlenmesi.** Tanımında (taslak, yayın ya da geri yüklenen revizyon) `queries` bulunan bir sayfayı kaydetmek, yayımlamak ve geri yüklemek yalnız TenantAdmin'e açıktır. Bu sayfalarda yönetici olmayanlar düzen değişikliği de yapamaz; kısmi düzenleme/birleştirme mantığı kurulmaz.
- **Çok firmalı SQL raporları.** Kullanıcı seçilen **her** firmada TenantAdmin olmalıdır; yalnız üyelik yetmez.
- **Yetkilerin yeri ve etkinleşmesi.**
  - Sayfa yetkileri taslak tanımın parçası değildir.
  - Ayrı bir tabloda tutulur ve kaydedildiği anda yayımlanmış sayfaya uygulanır. Yetkiyi geri almak, yarım kalmış SQL taslağını yayımlamayı gerektirmez.
  - Her değişiklik kendi revizyon kaydıyla ve denetim olayıyla yazılır.
- **Sistem tabloları da yazmaya açıktır (kullanıcı kararı).**
  - Yazma kullanıcısı kiracı ERP veritabanındaki sistem tablolarına da yazabilir: `AuditEvents` (tetikleyici yalnız güncelleme/silmeyi engeller, ekleme serbesttir), `TenantCustomPages`/revizyonları, belge numarası sayaçları, `__EFMigrationsHistory`.
  - Kullanıcı riskleri bilerek seçti: sahte denetim kaydı eklenebilir, sayfa tanımları izsiz değişebilir, migration geçmişi bozulursa sürüm güncellemeleri hata verir.
  - Bu nedenle bütünlüğü korunması gereken iki şey yazma kullanıcısının erişemeyeceği **Platform veritabanında** tutulur (tasarımcı kararı):
    1. **Sayfa yetkileri.** Sayfa kodu ile kiracı anahtarlı ayrı tablo, kendi revizyon kayıtlarıyla. Bir sorgu kendine yetki yazamaz.
    2. **Sorgu çalıştırma denetim kayıtları.** Kullanıcı, sayfa, sorgu, parametreler, etkilenen satır sayısı. Kiracı veritabanındaki `AuditEvents`'e ayrıca yazılmaz; böylece bu kayıtlar yazan sorgularla değiştirilemez ya da taklit edilemez.
  - Sayfa tanımlarının kendisi kiracı veritabanında kalır ve yazan sorgularla değiştirilebilir. Ancak sorgu çalıştırma uç noktası hangi sorgunun çalıştığını denetim kaydına yazar; değişiklik izi bu yolla kalır. Belgedeki "her yazma izlenir" güvencesi buna göre daraltılmıştır: sorgu çalıştırmalar izlenir, sorguların veritabanında yaptığı değişikliklerin içeriği sistem tablolarında ayrıca korunmaz.
- **Mevcut sayfaya ilk sorgunun eklenmesi.**
  - Bir sayfaya ilk sorgu eklendiğinde ve yetki modu `AllUsers` ise yayın reddedilir. Hata metni: "Bu sayfa SQL sorgusu içeriyor; yayımlamadan önce erişimi açıkça seçin."
  - Yönetici erişimi açıkça kaydedene kadar sunucu yayına izin vermez.
- **Kiracı ayrımı.**
  - Canlıda kiracılar ayrı `AIERPTenant_<guid>` veritabanlarında çalışıyor. 2026-11-13 itibarıyla iki kiracı var; `Database:SeparationEnabled` Compose'da açık.
  - Buna rağmen özellik **başarısız-kapalı** çalışır. Ayrım kapalıysa ya da kiracının sorgu kimlik bilgisi Vault'ta yoksa sorgu uç noktaları 503 döner, paylaşılan veritabanında asla SQL çalıştırılmaz.
- **İstemciden gelen değerler.**
  - Seçili satırın `Id`'si gibi parametre değerlerine güvenilir. `Update`/`Delete` yetkisi olan kullanıcı, uç noktayı doğrudan çağırarak sorgunun `WHERE` koşulunun izin verdiği herhangi bir satırı etkileyebilir; bu, kullanıcının yazma kapsamı kararıyla (c) tutarlıdır.
  - Yönetici kapsamı daraltmak isterse sorguya koşul yazar (ör. `AND OwnerUserId = @kullaniciId`, `{{kullanici.id}}` ile). İmzalı satır belirteci kurulmaz.

## Teslim sırası

Her parça ayrı PR olarak teslim edilir ve tek başına çalışır:

1. **Veritabanı kullanıcıları ve SQL raporları.** Okuma/yazma SQL kullanıcıları, Vault, provisioning ve mevcut kiracı adımı. Rapor oluşturucuda SQL raporlarının açılması.
2. **Sayfa yetkileri.** Erişim modeli, sunucu kontrolleri, tasarımcıda Erişim bölümü.
3. **Okuma sorguları ve bağlama.** `queries`, sorgu çalıştırma uç noktası (okuma), değişkenler, etiket ve input bileşenleri, ızgara ve gösterge bağlama.
4. **Yazma sorguları ve butonlar.** `insert`/`update`/`delete`, buton eylemi, onay, denetim.

## Builder'a bırakılanlar

- SQL login adlandırması, Vault yolu ve bileşen enum adları.
- Mevcut kiracılar için operasyon adımının biçimi ve runbook.
- Sayfa tanımı `schemaVersion: 2` geçişi: v1 sayfalar okunmaya devam eder ve ilk kayıtta v2'ye yükseltilir.
- Platform veritabanındaki yetki ve sorgu denetim tablolarının şeması ve migration'ları.
- Sonuç sütun türü eşlemesi ve sayfalama (`OFFSET/FETCH` sarmalama ya da okumada kesme).
- **Önceki/sonraki değer yakalama.** `OUTPUT` ile önceki/sonraki değer yakalamanın, tetikleyicili tablolarda ve `OUTPUT ... INTO` kısıtlarında uygulanabilirliği. Uygulanamazsa parametreler ve etkilenen satır sayısı denetimi yeterlidir; bu, dokümanda not edilir.
- Bağlama ifadesi sözdiziminin kesin dilbilgisi ve değişken öneri arayüzünün ayrıntıları.
- **Testler:**
  - Okuma kullanıcısıyla yazmanın veritabanında reddedildiğini gösteren SQL kabul testi.
  - Başka kiracı/Platform veritabanına erişimin reddedildiğini gösteren SQL kabul testi.
  - Parametrelerin enjeksiyona kapalı olduğunu gösteren test.
  - Yetki kuralları ve sorgu çalıştırma uç noktası entegrasyon testleri.
  - Yazma transaction'ının hata durumunda geri alındığını gösteren test.
