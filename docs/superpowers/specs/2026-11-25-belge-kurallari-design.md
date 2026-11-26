# Belge kuralları: satış siparişi (Studio sadeleştirme, alt proje 6)

Tarih: 2026-11-25 · Durum: taslak, onay bekliyor · Üst belge: `2026-11-25-nexora-studio-sadelestirme-design.md` (§5.5, §6.6, §7 madde 6, §9, §10, §11)

Taslaklar:
- `docs/design-proposals/studio-sadelestirme/05-belge-kurallari.html`: Studio'daki Kurallar ekranı
- `docs/design-proposals/studio-sadelestirme/08-erp-belge-ekrani.html`: ERP'de Belge kalıbıyla sipariş. Kullanıcı 2026-11-25'te onayladı.

## 1. Amaç ve neden

Satış siparişinin iş mantığı bugün sayfa tanımına sızmış durumda. `SystemPages/Standards/sales-order-create.json` envanterdeki üç eksiği (`2026-11-21-satis-ekranlari-envanteri.md`) sayfa ayarlarıyla karşılıyor:

| Eksik | Bugünkü sayfa ayarı |
|---|---|
| G-S7: var olan satırların düzenlenebilir yüklenmesi | `fillQuery: kalemKaynak` + `fillColumns` + `satis.siparis.kalemleri` sorgusu |
| G-S8: satır tutarı, KDV dökümü, toplamlar | `calc:onizleme:*` kolonları, `onizleme`/`vergiler` sorguları (`satis.siparis.hesapla`, `hesaplaVergileri`), toplamlar için dört `metric` bağlaması, `dataTable` KDV dökümü |
| G-S9: stok seçilince birim/fiyat/KDV/döviz dolması | `lookupFills.stockItemId` |
| Duruma bağlı davranış | `commandWhen`, `disabledWhen`, `visibleWhen … status != 'Open'` |

Danışman bunları kuramaz. Bu ayarlar §3'ün anti-hedefine de aykırı: panelde teknik terim görünüyor. Bu projenin işleri:
- Bu davranışları sunucudaki bir **belge modeline** taşımak.
- Siparişe gerçek bir **durum zinciri** vermek.
- Danışmanın cümleyle **kural** kurabilmesini sağlamak.

Böylece Belge kalıbını kullanan bir sipariş sayfası tek ayar gerektirmeden çalışır. Yöntem önce satış siparişinde kurulur, sonra öbür belgelere yayılır.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

**Hedefler**
- `template: {name:"belge", document:"satis.siparis"}` olan bir sayfa, aşağıdaki ayarların **hiçbirini** taşımadan şunları yapar:
  - var olan siparişin satırlarını yükler (G-S7)
  - satır tutarlarını, KDV dökümünü ve toplamları sunucudan hesaplatır (G-S8)
  - stok seçilince birim, liste fiyatı, KDV, iskonto, döviz ve kullanılabilir miktarı doldurur (G-S9)
  - durum rozetini, durum çizgisini ve duruma göre butonları gösterir
- Kaldırılan ayarlar: `fillQuery`, `fillColumns`, `lookupFills`, `calc:` kolonları, `gridFormula`, `countWhen`, `conditions`, `wizardParts`, `barCommands`, `commandWhen`, `disabledWhen`, model davranışı için yazılmış sorgular.
- Siparişin durum zinciri: Taslak → Onay bekliyor → Onaylı → Sevk edildi → Faturalandı, ayrıca İptal.
- Danışman sipariş geçişlerine cümle kuralı ekleyebilir: *"Eğer [alan] [işleç] [değer] ise [eylem]"*. Kurallar açılıp kapatılır, taslak → yayın akışından geçer ve "Dene" ile denenir.
- Son kullanıcı belgede **işlem günlüğünü** görür.

**Hedef olmayanlar** (sonraki alt projeler ya da PR'lar)
- Yazılımcı uzantıları (`<geçiş>Önce/Sonra`, `alanDeğişince`) ve alt görev kuyruğu. Bu proje genişletme noktasını hazırlar, uzantıyı çalıştırmaz.
- E-posta, bildirim ve "alan doldur" gibi geçiş sonrası danışman eylemleri. Bunlar kuyruğa bağlı oldukları için kuyrukla birlikte gelir.
- Teklif, fatura, irsaliye ve satınalma belgeleri. Yöntem siparişte oturduktan sonra aynı modelle eklenir.
- Toplu kalıp geçişi (§7, 5b).

**Anti-hedefler**
- Belge sayfasında hesaplamayı ya da durum kuralını istemcide tekrarlamak.
- Eski sipariş ekranlarında bir siparişin takılı kalması, örneğin Taslak'ta kalıp hiçbir ekrandan onaylanamaması.
- Aynı belge türünde iki kural sisteminin aynı anda çalışması (§11). Bugün siparişe bağlı bir iş kuralı olayı yok, bu koşul korunur.
- Bir müşterinin canlıdaki **açık** siparişinin bu değişiklikten sonra sevk edilememesi.

## 3. Kullanıcının kararları (2026-11-25)

1. **Durumlar: tam zincir** (taslak 05).
   - Bilinçli bir davranış değişikliğidir: yeni sipariş artık hemen sevk edilemez, önce onaylanır.
   - Üst belgedeki "canlı davranış değişmez" anti-hedefinin bu belge türü için açık istisnasıdır.
2. **Kural onay istemezse siparişi kaydeden kendisi onaylar.**
   - Taslak'ta tek bir "Onayla" butonu vardır.
   - "Onay bekliyor" yalnız bir danışman kuralı onay istediğinde araya girer. O durumda kendi kaydını onaylama engeli geçerlidir.
3. **Yaklaşım A + X** (bkz. §4).
4. **ERP belge ekranı taslak 08 olarak onaylandı.** Taslağa eklenen üç karar da onaylandı:
   - **Onayı geri al:** Onaylı'dan Taslak'a. Yalnız sevk ve rezervasyon yoksa.
   - **Reddet:** Taslak'a döner, açıklama zorunludur.
   - **İptal et:** Taslak'ta ya da sevk kaydı olmayan Onaylı siparişte, gerekçeyle. G-SO27'yi kapatır.
5. **"Onay iste" kuralında onaylayıcılar belirli kişilerdir.**
   - Danışman kurala bir ya da birkaç kişi seçer, örneğin "Mehmet Demir veya Ayşe Kaya". Listeden biri karar verir.
   - Onayla'ya basan kişi listede olsa bile kendi siparişine karar veremez.
   - Rol seçimi yoktur: bugün yalnız Yönetici, Yazılımcı ve Kullanıcı rolleri var, taslaktaki "Satış müdürü" rolü yok.

## 4. Yaklaşımlar

### 4.1 Sunucu: durum makinesi ve kurallar (§8'in kurucuya bıraktığı karar)

| | Yaklaşım | Ödünleşim |
|---|---|---|
| **A ✓** | **Kodda tanımlı, hafif bir belge motoru.** Her belge türünün modeli Nexora deposunda yazılır: alanlar, satırlar, hesaplama, alan değişince dolanlar, durumlar, geçişler ve her geçişin çekirdek kontrolleri. Danışman kuralları yeni bir tabloda durur. "Onay iste" eylemi mevcut onay motorunu kullanır. | Yeni tablo ve migration gerekir. Eski İş kuralları ve İş akışları ekranları hiç bozulmaz. |
| B | Mevcut iş kuralı motorunu (`TenantBusinessRuleEngine`, `BusinessRuleEndpoints`) genişletmek | Bir olay için tek yayımlı kural, tek eylem (onay akışı başlat), açma/kapama yok. Birden çok kural ve uyar/engelle eylemleri motoru kökten değiştirir, eski ekran ve kayıtlar etkilenir. |
| C | Durumları ve geçişleri veritabanında tanımlanan genel bir motor | Çekirdek zaten Nexora kodu olduğu için gereksiz karmaşıklık. Elendi. |

**Mevcut iş akışı motorunun yeniden kullanımı: karar ve gerekçe**

- **Onay için yeniden kullanılır.** "Onay iste" eylemi bir `TenantWorkflowInstance` açar (`SubjectType = "SalesOrder"`). Mevcut karar ucu ve onay ekranı aynen çalışır: `POST /api/workflows/instances/{id}/decision`. Hazır gelenler: adım sırası, red açıklaması zorunluluğu, denetim kaydı ve mevcut "onay bekleyenler" listesi. Eklemeli değişiklikler:
  - **Kişi listeli adım.** `TenantWorkflowStep`'e isteğe bağlı `ApproverUserIds` eklenir. Bu alan `StepsJson` içinde durduğu için şema değişmez.
    - Listesi olan adımda yalnız listedeki kişiler karar verebilir. Rol eşleşmesi ve `execute` izni istisnaları (`WorkflowEndpoints.cs:204-211`) bu adımlara uygulanmaz.
    - Başlatan kişi listede olsa bile **hiçbir koşulda** karar veremez.
    - Yönetici (TenantAdmin), listedeki kişiler ayrılırsa siparişin takılı kalmaması için karar verebilir, ama yalnız kendi başlatmadığı akışta. *Benim kararım.*
    - Listesi olmayan adımlar bugünkü gibi çalışır.
  - **Sistemin yönettiği tanım.** `TenantWorkflowInstance.DefinitionId` zorunlu olduğu için, yayımlanan her "Onay iste" kuralı için sistem bir iş akışı tanımı tutar. Kodu `belge-kurali-<kural kodu>` olur.
    - Bu tanımlar İş akışları ekranında listelenmez ve oradan düzenlenemez (koda göre süzülür).
    - Birden çok onay kuralı eşleşirse adımlar kural sırasıyla tek bir örnekte (`StepsJsonSnapshot`) birleşir. `DefinitionId` ilk kuralın tanımıdır.
  - **Karar ucuna `SalesOrder` dalı.** Satış teklifi ve satınalma siparişi için yapıldığı gibi:
    - akış tamamlanınca sipariş Onaylı olur
    - akış reddedilince sipariş Taslak'a döner
  - **Başlatma koruması.** `POST /api/workflows/definitions/{id}/instances` artık `SubjectType = "SalesOrder"` kabul etmez. Sipariş onay akışını yalnız belge motoru başlatır. Böylece elle açılmış bir akışla sipariş onaylatılamaz. *Benim kararım.*
- **Koşul değerlendirme için yeniden kullanılmaz.** `TenantBusinessRuleEngine` sabit olay listesine bağlı. Koşulsuz kuralı ("Her zaman") eşleştirmiyor ve sayı/tarih karşılaştırmasını sabit alan adlarına göre yapıyor (`TenantBusinessRuleEngine.cs:61-64, 98, 111, 121`). Bu yüzden belge kurallarının kendi küçük değerlendiricisi olur:
  - alan türleri modelden gelir
  - işleç adları eski motorla aynı tutulur
  - eski motor ve İş kuralları ekranı değişmez

  *Benim kararım.*
- **Durum makinesi için yeniden kullanılmaz.** İş akışı motoru, bir kayda bağlı onay adımlarını yürütür. Belgenin durumlarını, geçişlerin kontrollerini ve geçiş sonrası işleri bilmez. Bunlar belge modelinin işidir.
- **Alt görev kuyruğu için ileride `IntegrationOperationWorker` örnek alınır:**
  - `UPDLOCK, READPAST`
  - `NextAttemptAt`
  - en çok 3 deneme

  Bu PR serisinde kuyruk kurulmaz (§2).

### 4.2 ERP: Belge kalıbı

| | Yaklaşım | Ödünleşim |
|---|---|---|
| **X ✓** | **Kalıp modeli okur.** Sayfada yalnız şunlar saklanır: `template`, görünecek başlık alanları, satır kolonları ve ek eylemler. ERP modeli sunucudan alır; yükleme, hesaplama, doldurma, durum ve butonlar kalıbın içinden gelir. Bugünkü `gridFill`, `gridTotals` ve `document-page` (`DocumentSurface`, `DocumentStatusFlow`) içeriden yeniden kullanılır. | ERP çizicisine yeni bir dal eklenir. |
| Y | Sunucu, sayfa yüklenirken modelden eski ayarları (`fillQuery`, `calc:`, `lookupFills`) üretir | Daha ucuz. Ama §10 bu ayarların belge sayfasında yok sayılmasını istiyor. Durum ve günlük için çiziciye yine dokunmak gerekir. |

## 5. Tasarım

### 5.1 Durumlar ve saklama

`SalesOrderStatus` kolonu `int`. API, enum'ları ad olarak döndürür (`JsonStringEnumConverter`). Bazı yerler durumu adıyla kullanıyor:
- firmaların satır koşullu izin kuralları (`resource.status`)
- sistem standartları (`status == 'Open'`)
- ERP ekranları

Bu yüzden **var olan adlar ve sayılar korunur, anlamları ve Türkçe etiketleri değişir**. Yeni değerler eklenir:

| Değer | Ad | Etiket | Not |
|---|---|---|---|
| 4 | `Draft` | Taslak | yeni |
| 5 | `PendingApproval` | Onay bekliyor | yeni |
| 1 | `Open` | **Onaylı** | bugünkü "Açık" sevk edilebilir siparişti, anlamı aynıdır |
| 2 | `Fulfilled` | **Sevk edildi** | bugünkü türetme aynen: bütün satırlarda teslim ≥ sipariş |
| 6 | `Invoiced` | Faturalandı | yeni; fatura kesilince ve iptal edilince yeniden hesaplanıp **kayda yazılır** |
| 3 | `Cancelled` | İptal | ilk kez yazılır |

Sonuçları:
- **Canlıdaki siparişler için veri geçişi gerekmez.** `Open` olanlar kendiliğinden Onaylı, `Fulfilled` olanlar Sevk edildi olur.
- Mevcut `Status == Open` filtreleri anlamını korur, çünkü onaylı ve açık sipariş demektir. Bu filtreler: MRP/üretim, satış planlama, gösterge paneli, özel alan zorunluluğu, stok kartı silme engeli. Kurucu 28 kullanımı tek tek gözden geçirir.
  - Taslak ve Onay bekliyor siparişler planlamaya girmez. Bu doğru davranıştır.
  - Özel alan zorunluluğu (`Program.cs:3922,3943,3970`) Taslak siparişleri de kapsamalı mı? Kurucunun kararıdır.
- **`!= Cancelled` filtreleri** artık Taslak ve Onay bekliyor siparişleri de içerir. Bunlar Taslak ve Onay bekliyor'u da dışarıda bırakacak biçimde değişir, çünkü henüz verilmiş bir taahhüt değillerdir. *Benim kararım.* Değişen yerler:
  - dış ticaret bağlantısı: `ForeignTradeEndpoints.cs:53,120`
  - satış planlaması: `SalesPlanningInquiryEndpoints.cs:119`
  - sipariş listesi özeti: `PlatformContracts.cs:361`
  - açık sipariş raporu: `ReportEndpoints.cs:2088-2089`

  Sipariş listesi özetindeki sayılar Taslak'ı ayrı gösterebilir; bunu kurucu belirler.
- **Faturalandı için tek seferlik düzeltme.** Bugün bütün irsaliyeleri faturalanmış `Fulfilled` siparişler, yayın adımında bir kez `Invoiced` olarak güncellenir. Bu idempotent bir veri betiğidir: kolon eklenmez, aynı batch kuralı dert olmaz.
  - Prova sırasında, satır koşullu izin kurallarında `resource.status` değeri `Fulfilled` olan firmalar listelenir. Bu kurallar Faturalandı siparişleri artık kapsamaz; yöneticilerine bildirilir.
  - *Benim kararım.*

**Geçişler**

| Geçiş | Kimden | Kime | Çekirdek kontroller | Not |
|---|---|---|---|---|
| Kaydet (oluştur) | – | Taslak | bugünkü POST doğrulamaları | `POST /api/sales/orders` ve tekliften dönüşüm artık Taslak yazar |
| Onayla | Taslak | Onaylı ya da Onay bekliyor | zorunlu alanlar ve en az bir satır; tutarlar yeniden hesaplanır; cari risk limiti (faturadaki `borç − alacak + tutar > limit` kuralı, bu siparişin tutarıyla) | Bir kural onay isterse Onay bekliyor olur ve iş akışı açılır, istemezse doğrudan Onaylı olur. Stok yetersizse **uyarır, engellemez** (taslak 05). |
| Onay kararı: onay | Onay bekliyor | Onaylı | – | iş akışı karar ucundan |
| Onay kararı: red | Onay bekliyor | Taslak | – | açıklama iş akışında zorunlu |
| Onayı geri al | Onaylı | Taslak | sevk, fatura ve rezervasyon kaydı yok | bugünkü düzenleme ön koşuluyla aynı |
| Sevk et | Onaylı | Onaylı ya da Sevk edildi | bugünkü sevk kuralları | kısmi sevkte Onaylı kalır |
| İrsaliye iptali | Sevk edildi / Faturalandı | Onaylı ya da Sevk edildi | bugünkü kurallar | yeniden türetilir |
| Fatura kesildi | Sevk edildi | Faturalandı | – | sevk edilmiş ve iptal edilmemiş bütün irsaliyeler faturalıysa |
| Fatura iptali | Faturalandı | Sevk edildi | – | yeniden türetilir |
| İptal et | Taslak, ya da sevk kaydı olmayan Onaylı | İptal | gerekçe 1–500 karakter; aktif rezervasyonlar bırakılır | Onay bekleyen sipariş önce reddedilir, sonra iptal edilir. İş akışına "iptal" durumu eklenmez. |

**Düzenleme ve silme yalnız Taslak'ta yapılabilir.**
- Bugünkü "sevk, fatura, rezervasyon yok" koşulu da sürer.
- Teslim tarihi değişikliği ve özel alan değerleri bugün `Open` ister. Bunlar **Taslak ve Onaylı**'da açık kalır, çünkü onaylı siparişin teslim tarihi bugün de değiştirilebiliyor.
- Rezervasyon (Stok ayır) bugünkü gibi yalnız Onaylı'da yapılabilir.

**Uçlar**
- Bugünkü uçlar korunur.
- Yeni geçiş uçları: `POST /api/sales/orders/{id}/approve`, `/unapprove`, `/cancel`. Gövdede `reason` ve `requestId` taşınır.
- Bu uçlar `PlatformPermissionCatalog` ve ERP işlem kataloğuna `satis.siparis.onayla`, `onayiGeriAl` ve `iptal` olarak eklenir.
- İzin adları kurucunun kararıdır, ama **onaylamak ayrı bir izin** olur. Yönetici, sipariş yazabilen ama onaylayamayan bir kullanıcı tanımlayabilmelidir.
- Varsayılan: sipariş oluşturma izni olan onaylayabilir. Bu karar 2'nin karşılığıdır.

**Eski ekranlar takılı kalmaz.**
- Eski satış sipariş ekranı (`SalesPage` sipariş penceresi) ve `sales-orders.json` standardı Taslak siparişe **Onayla**, Onaylı siparişe **Onayı geri al** ve **İptal et** işlemlerini alır.
- Standardın bir sonraki sürümünde `status == 'Open'` ile gösterilen Sevk et ve Düzenle gibi eylemler yeni durumlara göre düzeltilir. Düzenle artık Taslak'ta görünür.
- **Standardın kendi kopyasını yayımlamış firmalar.** Bu firmalar sayfanın eski anlık görüntüsünü tutar ve yeni sürümden yalnız yeni öğeleri alır (`SystemPageEndpoints.cs:41-53,231-233`).
  - Onayla, Onayı geri al ve İptal et butonları bu yüzden **yeni öğe** olarak eklenir. Birleştirme bunları kopyalara kendiliğinden eklemez; firma yöneticisine "Yeni" öğe olarak önerir (uygulamada görüldü, PR 1).
  - Kopyadaki Sevk et, `Open` = Onaylı olduğu için doğru çalışmaya devam eder.
  - Kopyadaki Düzenle onaylı siparişte görünmeye devam eder, ama sunucu bunu anlaşılır bir mesajla reddeder.
  - Kopyası olan firma sayısı provada sayılır.
  - *Benim kararım.*
- **`satis.siparis.olustur` kullanan firma sayfaları** artık Taslak sipariş yazar. Bu siparişler, standart sipariş listesinden ve belge ekranından onaylanabilir.

### 5.2 Belge modeli (sunucu, modül çekirdeği)

- Belge modeli koddaki bir kayıt defteridir, örneğin `DocumentModels/SalesOrderDocumentModel.cs`.
- **`GET /api/document-models/{belge}`**, örneğin `satis.siparis`, şunları döndürür:
  - **alanlar:** kod, etiket, tür, zorunlu mu, seçenek kaynağı
  - **satır kolonları:** kod, etiket, tür, zorunlu mu, girilen mi hesaplanan mı
  - **toplamlar** ve KDV dökümünün yeri
  - **alan değişince dolanlar:** stok → birim, liste fiyatı, KDV %, iskonto %, döviz, kullanılabilir miktar
  - **durumlar:** kod ve etiket
  - **geçişler:** kod, etiket, kimden, kime, gerekli izin
  - **ek eylemler kataloğu**
- **`GET /api/sales/orders/{id}/document`** belgeyi tek seferde verir:
  - başlık, satırlar (G-S7) ve hesaplanmış tutarlar
  - bu kullanıcının **şu an** yapabileceği geçişler; izin, durum ve bekleyen iş akışı burada değerlendirilir
  - sevk ilerlemesi
  - işlem günlüğü
- **Hesaplama** bugünkü `POST /api/sales/orders/preview` ucu ve `SalesDocumentCalculator` ile yapılır. Model yalnızca bu ucu adresler; yeni bir hesaplama yazılmaz.
- **Alan değişince**: `POST /api/document-models/satis.siparis/fill`. Gövde `{alan, değer, belge bağlamı}`, yanıt doldurulacak hücrelerdir.
  - Kullanılabilir miktar = bütün aktif depoların bakiyesi − bu depolardaki aktif rezervasyonlar.
  - Siparişin deposu olmadığı için bu bir göstergedir. Rezervasyonun tek depo kuralı aynen kalır.
- **Model sırası.** Çekirdek kontroller, sonra danışman kuralları. Geçiş sonrası çekirdek işler (rezervasyon bırakma, iş akışı iptali) aynı işlem (transaction) içinde çalışır.
- **Uzantı noktası.** `<geçiş>Önce` ve `<geçiş>Sonra` adları modelde tanımlanır ama boştur; uzantılar sonraki PR'da bağlanır.

### 5.3 İşlem günlüğü

- Yeni, **yalnız eklenen** bir tablo: `TenantDocumentActivities`.
  - Kolonlar: `TenantId`, `DocumentType`, `DocumentId`, `Transition`, `Step`, `Source` (çekirdek / kural / uzantı), `Outcome` (tamamlandı / bekliyor / engelledi / uyardı / yeniden denenecek), `Message`, `ActorUserId`, `CreatedAt`.
  - Güncellenmez ve silinmez. Ledger kuralıyla aynıdır.
- Her geçiş, çekirdek kontrolün ve kuralın sonucunu buraya yazar. Denetim kaydı (`AuditEvents`) ayrıca yazılmaya devam eder.
- Eski siparişlerin günlüğü boştur. Belge, "Bu sipariş günlük tutulmaya başlamadan önce oluşturuldu" der; geriye dönük doldurma yapılmaz.

### 5.4 Belge kalıbı (ERP)

- **Sayfa biçimi** (§5.2-C, yalnız eklemeli):
  - Kökte `template: { "name": "belge", "document": "satis.siparis" }` durur.
  - Görünecek başlık alanları ve satır kolonları model kodlarıyla seçilir. Sıraları, etiketleri ve ek eylemler de sayfada saklanır.
  - Kesin JSON biçimi kurucunun kararıdır. Biçim, alt proje 3'ün `slot` yöntemini izler.
  - Belge sayfasında §2'deki ayarlar şemada **reddedilir**. Var olan sayfalar `template` taşımadığı için etkilenmez.
- **ERP çizicisi** `template.name == "belge"` olan sayfalar için yeni bir dal açar. Taslak 08 bu dalın görüntüsüdür:
  - `DocumentSurface` başlığı: belge no, durum rozeti, durum çizgisi
  - butonlar: geçişlerden gelir; ana buton solda, İptal et en sağda
  - başlık alanları ve satır ızgarası
  - sağ altta toplamlar, KDV dökümü ve sağda işlem günlüğü
- **Satır ızgarası:**
  - Bugünkü `EditableGrid` kullanılır, ama kolonlar ve davranış modelden beslenir.
  - Hesaplanan kolonlar salt okunurdur ve sunucu hesabını gösterir. Hesap isteği değişiklikten sonra kısa bir gecikmeyle gönderilir.
  - Yalnız Taslak'ta düzenlenebilir.
  - Onaylı ve sonrasında "Sevk x / y" kolonu görünür.
- **Önizleme (Studio tuvali):**
  - Yazma işlemleri bugünkü gibi engellidir (`blockedInPreview`).
  - Hesaplama ve doldurma uçları yan etkisiz olduğu için tuvalde de çalışır.
- **Sistem standardı.** `sales-order-create` standardının yeni sürümü Belge kalıbını kullanır.
  - Eski sürüm silinmez; bugünkü sürüm yükseltme düzeni izlenir (`SystemPageStandards.versions.txt`).
  - Çıktı, eski sürümle üç genişlikte karşılaştırılır (§10). Görünüş kalıba uyacak şekilde değişebilir. Davranış ise durum zinciri dışında aynı kalır: aynı satırlar, aynı tutarlar, aynı doğrulama mesajları.
- **Çakışma notu.** Alt proje 4 (Kayıt kartı) da `PageTemplateRules.cs`, `pageTemplate.ts` ve `TenantCustomPage.tsx` dosyalarına kalıp ekleyecek. İkisi de yalnız ekleme yaptığı için birleştirme sırasında elle çözülür.

### 5.5 Studio

- **Belge paneli** (danışman). Kurulan bir belge sayfası tuvalde ERP'nin çizimiyle görünür. Panel alt proje 3'ün sekmesiz kabuğunu kullanır:
  - *Hangi belge?*: kalıp seçilirken belirlenir
  - Başlık alanları: işaretle, sırala, etiketi değiştir
  - Satır kolonları: işaretle, sırala, etiketi değiştir; hesaplanan kolonlar etiketlidir
  - Ek eylemler: katalogdan
  - Görünüm

  Formül, sorgu ya da komut ayarı yoktur. **Kodlamadan önce bu panelin taslağı kullanıcıya gösterilir.** Liste paneline (taslak 01) benzer, ama ayrı bir ekran değişikliğidir.
- **Kurallar ekranı** (taslak 05).
  - Studio'nun Kurallar menüsünde açılır ve önce yalnız Satış siparişini listeler.
  - Gri adımlar modelden gelir. Mor adımlar danışman kurallarıdır. Yeşil adımlar yer tutucudur: "Yazılımcı uzantısı yok".
  - Cümle kurucu: *Eğer [alan] [işleç] [değer] ise [eylem]* ya da *Her zaman [eylem]*.
    - Alan listesi, geçişin olgularından gelir: genel toplam, ara toplam, iskonto toplamı, satır sayısı, en yüksek satır iskontosu, cari, cari grubu, döviz, plasiyer, sipariş tarihi, teslim tarihi.
    - İşleçler mevcut motorunkilerdir.
  - Bu seride kurallar yalnız **Onayla** geçişine bağlanır. Bekleme durumu (Onay bekliyor) olan tek geçiş bu. Sevk et ve Faturala geçişlerinin kuralları, sonraki eylemlerle birlikte kuyruk projesinde gelir. *Benim kararım.*
  - Gri adımlar yalnız gerçekten yapılan işleri gösterir. Taslak 05'teki otomatik rezervasyon, onay PDF'i ve ayrı "Onaya gönder" adımı bu belgede yoktur; çelişkide bu belge geçerlidir.
  - Bu PR serisindeki eylemler yalnız geçiş öncesi eylemlerdir:
    - **Onay iste:** onaylayacak kişiler seçilir (karar 5).
    - **Uyar ama devam et:** kullanıcı uyarıyı görür ve onaylarsa geçiş olur.
    - **Engelle:** danışmanın yazdığı metin kullanıcıya gösterilir.
  - **Tablo.** Kurallar `TenantDocumentRules` tablosunda durur. Her kuralın kodu, belgesi, geçişi, sırası, koşulu, eylemi ve parametreleri vardır. Ayrıca açma/kapama düğmesi, sürüm ve taslak/yayın durumu tutulur.
  - **Yayın ve yetki.** Sayfalarla aynı **taslak → yayınla → sürüm geçmişi** akışından geçer (§10). Yazma izni Studio'nun Danışman ve Yazılımcı rollerine açıktır.
  - **Değerlendirme sırası.** Bir geçişte birden çok kural eşleşirse önce *Engelle*, sonra *Onay iste*, sonra *Uyar* değerlendirilir. Birden çok onay kuralı eşleşirse onay adımları kural sırasıyla tek bir akışta birleşir.
- **Dene.**
  - Danışman var olan bir siparişi ya da örnek değerleri seçer ve "Onayla geçişini dene" der.
  - Sunucu kontrolleri ve **taslak** kuralları yazmadan çalıştırır, günlüğü döndürür. Hiçbir kayıt değişmez.
  - Uç: `POST /api/document-rules/satis.siparis/try`.

## 6. PR'lar

1. **Sunucu: durum zinciri ve belge modeli.**
   - Enum değerleri, geçiş uçları ve izinler.
   - `TenantDocumentActivities`: Platform ve Tenant migration'ı. Ayrıca Faturalandı için tek seferlik veri betiği (§5.1).
   - `!= Cancelled` filtrelerinin düzeltilmesi.
   - Model ve belge uçları, doldurma ucu.
   - Eski sipariş ekranı ile `sales-orders` standardında Onayla, Onayı geri al ve İptal et.
2. **ERP Belge kalıbı ve Studio Belge paneli.**
   - Şema, ERP çizici dalı ve `sales-order-create`'in yeni sürümü.
   - Panel taslağı önce onaylanır.
   - G-S7, G-S8 ve G-S9 bu PR'da tasarımcı ayarı olmadan karşılanır.
3. **Danışman kuralları ve Kurallar ekranı.**
   - `TenantDocumentRules` (migration), belge kuralı değerlendiricisi ve kuralların onay iş akışına bağlanması: kişi listeli adım, sistemin yönettiği tanım, `SalesOrder` karar dalı, başlatma koruması.
   - Studio Kurallar ekranı ve Dene.
4. **Sonraki projeler:** yazılımcı uzantıları, alt görev kuyruğu, geçiş sonrası eylemler (e-posta, bildirim, alan doldur), öbür belge türleri.

Migration'lar canlıya yedek, prova ve CHECKDB sürecinden geçerek uygulanır. Bu PR'larda yalnız yeni tablo eklenir, mevcut kolonların değeri değişmez. İdempotent betikte ADD COLUMN ile backfill aynı batch'te olmaz.

## 7. Doğrulama

- **Kabul testi (G-S7/8/9).** Bir entegrasyon testi ve bir Vitest bileşen testi şunu gösterir: §2'deki ayarlardan hiçbirini taşımayan `template: belge` sipariş sayfası
  - var olan siparişin satırlarını yükler
  - miktar değişince sunucu tutarlarını ve KDV dökümünü gösterir
  - stok seçilince birim, fiyat, KDV, iskonto, döviz ve kullanılabilir miktarı doldurur
- **Şema testi.** Belge sayfasında yasak ayarlar reddedilir.
- **Durum zinciri.** Her geçiş için izinli ve yasak kaynak durum testleri yazılır.
  - Kısmi ve tam sevk; irsaliye ve fatura iptaliyle geri türetme.
  - Kural yokken kaydedenin onayı.
  - Kural onay isterken Onayla'ya basanın karar verememesi; listede olsa ve rolü eşleşse bile.
  - Listede olmayan kişinin karar verememesi.
  - Elle başlatılan "SalesOrder" akışının reddedilmesi.
  - Red sonrası Taslak.
  - İptalde rezervasyonun bırakılması.
  - `Open` ve `Fulfilled` adlarıyla yazılmış satır koşullu izin kurallarının çalışmaya devam etmesi.
- **Eski ekranlar.** Taslak siparişin eski ekrandan onaylanıp sevk edilebildiği test edilir.
- **Dene.** Hiçbir tabloya yazmadığı test edilir.
- **Sistem standardı.** Eski ve yeni sürümün üç genişlikte ekran görüntüsü karşılaştırılır. Tutarlar ve mesajlar aynı olmalı.
- **SQL kabul.** Mali dönem kapanış testlerinde (`*FiscalCloseRouteSqlAcceptanceTests`) sipariş yolları etkilenmemeli.

## 8. Kurucuya bırakılanlar

- Belge sayfasının kesin JSON biçimi; model ve belge uçlarının alan adları.
- İzin adları, izin kataloğu girdileri ve ERP işlem kataloğu etiketleri.
- Hesap isteğinin gecikmesi ve iptali.
- Özel alan zorunluluğunun Taslak siparişleri kapsayıp kapsamadığı (§5.1).
- Model kayıt defterinin kod düzeni. İkinci belge türü eklenene kadar genelleştirme yapılmaz.
