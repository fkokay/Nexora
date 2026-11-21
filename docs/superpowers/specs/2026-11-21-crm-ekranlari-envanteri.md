# CRM Fırsatları ve Yeni Fırsat: eşdeğerlik envanteri

Bu belge, CRM modülünün yerleşik ekranlarını sistem sayfasına (standart tanım) taşımak için girdidir. Bilgiler kod
okunarak çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Biçim ve terimler `2026-11-19-stok-depo-ekranlari-envanteri.md`
ve `2026-11-21-cari-ekranlari-envanteri.md` (cari oturumunun dalında) ile aynıdır. Zarf ve yönlendirme kuralları
`2026-11-18-sistem-sayfalari-design.md` belgesindedir. `fark` kabul edilmiş davranış farkı, `eksik` taşımadan önce
kapatılması gereken boşluk anlamına gelir. Her eksiğin sonunda **nerede çözüleceği** yazılıdır:
`[standart]` yalnız JSON tanımı, `[CRM API]` yalnız `CrmEndpoints.cs`, `[ortak]` sayfa motoru ya da her modülün
dokunduğu katalog dosyası (sıralama gerekir).

## Kapsam: CRM bugün yalnız fırsatlardan oluşur

Kodda aktivite, görüşme, kampanya, aday (lead) ya da kişi ekranı **yok**. Taranan yerler: `shell/moduleMenus.ts`,
`workspace-navigation.ts`, `WorkspacePageRouter.tsx`, `StandardMenuEndpoints.cs`, `src/Hosts/AIERP.Api/*Crm*.cs`,
`src/**/*crm*`. "Kampanya" yalnız Satış modülünde geçer (`SalesPromotionCampaigns`, `SalesPlanningInquiryEndpoints.cs:85`,
kampanya performans raporu) ve Satış oturumunun kapsamındadır. Fırsat kaydındaki "Sonraki takip" (`nextActivityAt`)
tek bir tarih alanıdır; ayrı bir aktivite tablosu yoktur.

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `crm-opportunities` | CRM Fırsatları (liste + detay paneli; düzenleme formu aynı ekranda) | `CrmOpportunitiesPage.tsx` + `crm-opportunities/components/{CrmOpportunityHeader,CrmOpportunityFilters,CrmOpportunityGrid,CrmOpportunityDetail}.tsx` |
| `crm-opportunity-create` | Yeni fırsat | `CrmOpportunitiesPage.tsx` (`initialCreate`) + `crm-opportunities/components/CrmOpportunityCreateForm.tsx` |

Yönlendirici: `WorkspacePageRouter.tsx:33, 277-284` (iki anahtar aynı bileşeni açar). Frontend yolları
`frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir. Dosya adı yazılmayan satır
numaraları `CrmOpportunitiesPage.tsx` (frontend) ya da `CrmEndpoints.cs` (sunucu) içindir.

Kapsam dışı ama aynı API'yi kullanan tüketiciler (taşımadan etkilenmez): AI asistanı (`CrmAssistantEndpoints.cs`,
`src/AI/AIERP.AIService/AI/ERPAssistantCrmOpportunityTools.cs`), rapor kaynağı `crmOpportunities`
(`ReportEndpoints.cs:310, 373, 834`; katalogda `rapor.crmOpportunities`).

## 0. Ortak bilgiler

### Menü ve anahtarlar

- İki anahtar da standart menü kataloğunda **var**: `new("crm-opportunities", "CRM Fırsatları", "Satış & cari")`,
  `new("crm-opportunity-create", "Yeni fırsat", "Satış & cari")` (`StandardMenuEndpoints.cs:16`). Stok'taki menü anahtarı
  sorunu (G-M7) burada yoktur.
- Modül menüsünde **Cari Hesaplar** rayının altındadırlar (`shell/moduleMenus.ts:16, 62`; `crm-opportunity-create` →
  `crm-opportunities` eşlemesi). Hızlı arama ve kısayol listesi: `App.tsx:338-345, 627`. Liste sayfaları kümesi:
  `WorkspaceShellPage.tsx:39`.
- Henüz standart dosyası yok (`SystemPages/Standards/` altında yalnız 8 `inventory-*` var; `system-pages/systemPageKeys.ts:6`).
  Yeni standartlar sürüm 1 ve `preview` ile başlar.
- Sistem sayfasına yönlendirici bağlamı geçmez (`WorkspacePageRouter.tsx:185-192`). Eski ekrana verilen `onNavigate`
  (`:282`) yalnız "Yeni fırsat kaydedilince/vazgeçilince listeye dön" için kullanılır (`:333-336, 600-604`). Sistem
  sayfasında bunun karşılığı `page @crm-opportunities` eylemidir (bkz. G-R7).

### Yetki modeli

- `/api/crm/opportunities…` → `erp.crm-opportunities` (`PlatformPermissionCatalog.cs:40`). Eylem yoldan çıkar:
  GET → `read`, PUT → `update`, DELETE → `delete`, `POST /` → `create`. `POST /{id}/stage` → **`execute`**, çünkü
  `stage` `IsExecutionRoute` listesindedir (`PlatformPermissionCatalog.cs:387-397`).
- **TenantAdmin** katalogu atlar; TenantUser ve TenantDeveloper için varsayılan **ret**tir, Allow kuralı gerekir, Deny kazanır.
- **Rol denetimi olan işleyici yok.** Oluşturma, güncelleme, aşama, silme yalnız izin kurallarına bağlıdır. Silme
  (`:136-145`) kapanmış (Won/Lost) fırsatı da siler.
- **Satır düzeyi süzgeç yok.** CRM için koleksiyon süzgeci ya da satır öznitelikli kural işleyicisi yok
  (`PermissionAuthorizationHandler` CRM'e özgü öznitelik eklemez). Bu yüzden cari'deki G-C3 (`allowed` yanlış negatif)
  CRM'de **beklenmez**; satır öznitelikli bir kural yazılırsa yine geçerli olur.
- Müşteri seçici `/api/customers` okur. Bu `erp.customers.read` ister ve **cari satır süzgecinden** geçer: kullanıcı
  göremediği cariyi seçemez. Ama fırsat listesindeki `customerName` CRM sorgusunda doğrudan `Customer.Name`'den gelir
  (`:41`); cari okuma izni olmayan kullanıcı da listede müşteri adını görür. Bugünkü davranıştır.
- AI asistanı okuma iznini ayrıca `erp.crm-opportunities.read` ile doğrular (`CrmAssistantEndpoints.cs:20-26`).

### İdempotency ve eşzamanlılık

- Hiçbir yazma idempotency anahtarı almaz. `POST /` çift gönderimde ikinci istek kod benzersizliğine takılır (409 "Bu tenant
  için fırsat kodu zaten kullanılıyor.", `:52-53`; benzersiz dizin `PlatformDbContext.cs:1188`).
- **Eşzamanlılık denetimi fiilen yok.** Varlıkta `RowVersion` `IsRowVersion()` olarak tanımlı (`PlatformDbContext.cs:1198`)
  ve görünüm onu döndürür (`:43`). Ama `CrmOpportunityWriteRequest` rowVersion **taşımaz** (`:192-193`); PUT, stage ve
  DELETE kaydı aynı istekte taze okuyup yazar. Sonuç: **son yazan kazanır**. Taşıma bunu değiştirmez; düzeltmek yeni
  bir işlem adı ister (bkz. G-R9).
- Aşama geçişi sunucuda kurala bağlıdır (`CanTransition`, `:179-186`); iki oturum aynı fırsatı aynı anda ilerletirse
  ikincisi 409 "Fırsat bu aşamaya geçirilemez." alır. Bu doğal koruma yeterlidir.

### Çalışma zamanı ve tasarımcı, bugün (yalnız CRM'i etkileyenler)

Cari envanterinin "Çalışma zamanı ve tasarımcı" bölümündeki bulgular burada da geçerlidir ve yeniden türetilmedi:
sayaç sorguları (cari G-C4), yalnız görünen sayfanın dışa aktarımı (cari G-C5), bağlamalarda aritmetik yok (cari G-C7),
ızgara klavyesi ve Ctrl+. (cari G-C19), tek dil (G-M6 / cari G-C25). CRM'e özgü yeni bulgular:

- **Sayfalı listenin toplamı `totalCount` adıyla okunur.** `erpOperations.ts:238-239` `rowCount`'u yalnız yanıtın üst
  düzeyindeki `totalCount`'tan alır; yoksa satır sayısını kullanır. CRM listesi toplamı **`total`** adıyla döndürür
  (`CrmOpportunityPage(Items, Page, PageSize, Total)`, `:196`). Bkz. **G-R1**.
- **Tarih-saat girişi yok.** Katalog `DateTimeOffset`'i `date` türüne çevirir (`ErpOperationCatalog.cs` `DataType`);
  sayfa motorundaki giriş türleri `text`, `number`, `date`, `checkbox`, `select`, `lookup`'tır (`TenantCustomPage.tsx:814, 838`).
  `nextActivityAt` saatini kaybeder. Bkz. **G-R4**.
- **Koşul dilinde "şimdi/bugün" yok** (`custom-page/conditions.ts`; stok G-T1 ile aynı kısıt). "Takibi geçmiş" sayılamaz.
  Bkz. **G-R3**.
- **`steps` bileşeni önceki adımları her zaman "tamamlandı" çizer** (`custom-page/StepsIndicator.tsx:14-33`; etkin adım
  `activeWhen` koşullarından tutan sonuncusudur). Kaybedilen fırsat için bu yanlıştır. Bkz. **G-R6**.

### Testler (bugün)

- Frontend: `crm-opportunities/crmOpportunities.test.tsx` (8 test): liste türü (kartlar, aşama etiketi, sayılar, İşlem
  sütunu yok), seçim ve Aç / çift tık, kapanmış fırsatın açılamaması, İşlemler'deki aşama komutları, Sil onayı, İngilizce
  metinler, kaybedilen fırsatın aşama akışı, Ctrl+Del.
- Sunucu: `tests/IntegrationTests/CrmOpportunityIntegrationTests.cs` (2 test: firma kapsamı + doğrulama + kazanma hattı;
  kazanmada müşteri zorunluluğu + atlanan/son aşama reddi), `CrmAssistantEndpointsIntegrationTests.cs`.

---

## 1. CRM Fırsatları (`crm-opportunities`)

### 1.1 Yerleşim

- **Başlık:** "CRM fırsatları", açıklama "Açık fırsatları aşamaları, tahmini kapanışları ve takip adımlarıyla yönetin.",
  sayaç = sunucudaki toplam (arama + aşama uygulanmış) (`CrmOpportunityHeader.tsx`, `:653`). Kiracı `pageSettings`'i
  **kullanılmaz** (yalnız alan listesi okunur, `:203-215`); cari'deki G-C15 burada yoktur.
- **Özet kartları** (`:522-563`; kartlar süzmez):

| Kart | Değer | Kaynak |
|---|---|---|
| Açık fırsat | İlk temas + Nitelikli + Teklif + Müzakere sayılarının toplamı; ipucu "tüm kayıtlar / aramayla eşleşen" | sunucu sayaçları (arama uygulanmış, aşama uygulanmamış) |
| Kazanıldı | Won sayısı; ton `ok` | sunucu sayacı |
| Açık fırsat değeri | yüklenen sayfadaki açık ve değerli fırsatların toplamı; birden çok döviz varsa `—`; ipucu `pageAmountHint` | **bu sayfa** |
| Takibi geçmiş | yüklenen sayfada `nextActivityAt < şimdi` olan açık fırsat sayısı; ton `warn`; ipucu "bu sayfa" | **bu sayfa**, istemci saati |

  Sunucu sayaçları **yedi** ayrı `GET /api/crm/opportunities/?page=1&pageSize=1[&q][&stage]` çağrısıyla alınır: toplam +
  altı aşama (`:153-185`). Hata olursa sessizce `—`. Sayaçlar yalnız arama değişince ve her yazmadan sonra yenilenir.
- **Uyarı / bildirim:** hata şeridi kapatılabilir (`:576-587`); bildirim (`role=status`) "Fırsat kaydedildi / güncellendi /
  silindi", "<ad>: <aşama> aşamasına taşındı." (`:588-592`).
- **İşlem çubuğu** (`:471-505`; ortak kısayollar `commands/shortcuts.ts`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | Aynı sayfada boş formu açar (`setCreateOpen(true)`); sekme değişmez. |
| Aç | Enter | Odaklı satır, yoksa seçili satır, yoksa tek işaretli satır. Yoksa "Önce bir kayıt seçin"; kapanmışsa "Kapanmış fırsat düzenlenemez" (`stageTone.ts:12`); meşgulse "İşlem sürüyor…". Düzenleme formunu **aynı sayfada** açar (`edit`, `:283-299`). |
| Sil | Ctrl+Delete | Aynı hedef; kapanmış fırsat da silinebilir. Kalıcı silme onay penceresini açar. |
| İşlemler ▾ | Alt+İ | Seçili (current) fırsat açıksa: "Aşamayı ilerlet: <sonraki>" (Müzakere'de "Kazanıldı") ve "Kaybedildi olarak işaretle". Her zaman: CSV dışa aktar. |

  Aşama komutları yalnız **current** satıra bakar (işaretli satıra değil, `:491-501`); Aç/Sil ise işaretli tek satıra da düşer.
- **Liste araç çubuğu** (`CrmOpportunityFilters.tsx`): arama kutusu ("Kod, fırsat veya müşteri ara"; Enter/uygula ile
  `query` olur, 200 ms gecikmeli yükleme `:217-220`), aşama çipleri (Tümü + 6 aşama, her birinde sunucu sayacı), Yenile,
  ızgara araçları yuvası (sütunlar, dışa aktar), detay paneli düğmesi. Arama ve çip değişince sayfa 1'e döner.
- **Izgara** (`CrmOpportunityGrid.tsx`; `SalesDocumentGrid`, `gridId: crm-opportunities-v2`): onay kutusu sütunu, current
  satır, çift tık / Enter açar, sütun genişlikleri sabit tablo (`:76-85`), sayı sütunları `estimatedValue`,
  `probabilityPercent`; kod sütunu `code`. Sayfa boyutu **50** (`:134`); alt bilgi `SalesListFooter` (işaretli / görünen /
  toplam, sayfalama). Toplu eylem: "Excel (seçilenler)".
- **Sütun biçimleri** (`renderField`, `:405-461`):

| Sütun | Gösterim |
|---|---|
| `code` | mono; **ad sütunu görünürse ayrı sütun olarak gösterilmez**, kod adın altına küçük yazılır |
| `name` | ad + altında kod |
| `customerName` | yoksa soluk "Bağlanmadı" |
| `stage` | `StatusTag`: İlk temas/Nitelikli `info`, Teklif/Müzakere `warn`, Kazanıldı `ok`, Kaybedildi `off` (`stageTone.ts`) |
| `estimatedValue` | yoksa "—"; para birimiyle `Intl` biçimi, 2 ondalık |
| `probabilityPercent` | `%NN` |
| `expectedCloseDate` | tr-TR tarih; yoksa soluk "Tarih yok" |
| `nextActivityAt` | tr-TR kısa tarih + saat; yoksa "Takip planlanmadı" |
| `actions` | görünümde sabit alan ama **gösterilmez** (eylemler panelde ve çubukta) |

- **Boş ve hata durumları:** yükleme hatası → "Fırsatlar yüklenemedi" + mesaj + "Yeniden dene"; boş hat → açıklamalı
  "Satış hattınız henüz boş" + "İlk fırsatı oluştur"; süzgeçli boş sonuç → etkin süzgeç etiketleri + "Aramayı ve
  filtreleri temizle" (`CrmOpportunityGrid.tsx:28-74, 109-121`).
- **Detay paneli** (`CrmOpportunityDetail.tsx`; `SalesListDetailPanel`, Ctrl+. ile aç/kapa): kod + Aç düğmesi (kapanmışsa
  pasif), ad, aşama etiketi + kapanmışsa "Kapandı" etiketi. Sekmeler: **Özet** ve yalnız not varsa **Not**. Özet: dört
  gösterge (Tahmini değer, Kazanma olasılığı, Beklenen kapanış / "Belirtilmedi", Sonraki takip / "Planlanmadı"), Müşteri
  satırı ("Müşteri bağlanmadı"), **Aşama akışı** listesi: açık/kazanılmış fırsatta İlk temas → … → Kazanıldı, önceki
  adımlar tamamlandı; kaybedilmişte Kazanıldı yerine Kaybedildi ve **yalnız** Kaybedildi işaretli (aşama geçmişi tutulmuyor,
  `:31-35`). Seçim yoksa "Özetini görmek için listeden bir fırsat seçin."
- **Silme onayı** (`:607-648`): `alertdialog`, başlık "Fırsat silinsin mi?", "KALICI SİLME", "Bu fırsat satış hattından
  kaldırılacak. Silme işlemi geri alınamaz.", ad + kod kutusu, Vazgeç (varsayılan odak) / "Fırsatı sil". Esc ve arka plan
  tıklaması kapatır (meşgul değilse).
- **Düzenleme formu:** `CrmOpportunityCreateForm` `mode="edit"`; başlık fırsat adı, alt başlık kod + aşama etiketi +
  müşteri; kaydet "Değişiklikleri kaydet". Form açıkken liste, başlık ve işlem çubuğu yuvası gizlenir; form kendi yuvasını
  alır (`:572-575`). Alanlar 2. bölümdedir.

### 1.2 API çağrıları

| Çağrı | Ne zaman | Not |
|---|---|---|
| `GET /api/crm/opportunities/?page&pageSize=50[&q][&stage]` | açılış, arama/çip/sayfa değişimi, her yazmadan sonra | yanıt `{items, page, pageSize, total}`; geç dönen yanıt `requestId` ile yok sayılır |
| `GET /api/crm/opportunities/?page=1&pageSize=1[&q][&stage]` × 7 | açılış, arama değişimi, yazmalardan sonra | çip ve kart sayaçları |
| `GET /api/screen-views/crm-opportunities/active` | açılış | alan görünürlüğü/sırası; hata sessiz |
| `PUT /api/crm/opportunities/{id}` | düzenleme kaydı | tam yer değiştirme (her alan yazılır) |
| `POST /api/crm/opportunities/{id}/stage` `{stage}` | İşlemler → ilerlet / kaybedildi | onay sorulmaz |
| `DELETE /api/crm/opportunities/{id}` | silme onayı | 204 |
| `GET /api/customers/?page=1&pageSize=50[&q]` | form açıkken, müşteri araması (200 ms) | istemci `isActive && (Customer || Both)` süzer |

Kullanılmayan uç: `GET /api/crm/opportunities/{id}` (tek kayıt; eski ekran düzenlemede listedeki satırı kullanır). Liste
sunucusu ayrıca `closeFrom`, `closeTo`, `valueFrom`, `valueTo` süzgeçlerini kabul eder (`:14-23`); eski ekran bunları
**sunmaz**.

### 1.3 Kurallar

- **Aşama makinesi** (sunucu, `:179-186`): İlk temas → Nitelikli → Teklif → Müzakere → Kazanıldı; her açık aşamadan
  Kaybedildi. Atlama ve geri dönüş yok; Kazanıldı/Kaybedildi son aşamadır. İstemcideki `nextStage` haritası bunun kopyasıdır
  (`crm-opportunities/types.ts`).
- **Kazanmada müşteri zorunlu:** müşterisi bağlanmamış fırsat Kazanıldı yapılamaz (409 "Kazanılan fırsat için önce bir
  müşteri carisi bağlayın.", `:115-116`).
- **Olasılık aşamayla zorlanır:** Kazanıldı → 100, Kaybedildi → 0, diğer geçişlerde 1–99 arasına kıstırılır (`:118-123`).
  Yazmalarda olasılık 0–99 olmalıdır (`:168`).
- **Kapanmış fırsat güncellenemez** (409 "Kapanmış fırsatlar güncellenemez.", `:90-91`) ama **silinebilir**.
- **Doğrulama** (`ValidateWrite`, `:158-173`): kod büyük harfle başlar, en çok 40, `A-Z 0-9 - _` (sunucu kırpıp büyük harfe
  çevirir; istemci çevirmez); ad 1–160; para birimi 3 büyük harf (istemci yazarken büyütür); tahmini değer ≥ 0 ve 18,2;
  not ≤ 2000. Müşteri seçilmişse firmada **aktif** ve Customer/Both türünde olmalı (`:150-152`), yoksa 400 `customerId`.
- **Arama** kod, ad ve müşteri adında `Contains`. Aşama süzgeci bilinmeyen değeri 400 ile reddeder. Sıralama: kapanış
  tarihi olanlar önce (artan), sonra `updatedAt` azalan (`:37-38`). Sayfa boyutu en çok 100.
- **Denetim kaydı:** `erp.crm-opportunity.created/updated/stage-changed/deleted` (`:63, 102, 125, 142`).

### 1.4 Roller

- **TenantAdmin:** her şey.
- **TenantUser / TenantDeveloper:** her işlem yalnız `erp.crm-opportunities.{read,create,update,execute,delete}` Allow
  kurallarına bağlı. Aşama değiştirmek **`execute`** ister; yalnız `update` hakkı olan kullanıcı düzenleyebilir ama aşama
  ilerletemez. Müşteri seçici ayrıca `erp.customers.read` ister; yoksa form "Müşteri listesi yüklenemedi: …" uyarısıyla
  açılır ve fırsat müşterisiz kaydedilebilir.
- Eski ekran izin yokken düğmeleri gizlemez ya da pasifleştirmez; sunucu 403 döner ve hata şeridinde görünür. Sistem
  sayfasında katalog `allowed` bayrağı düğmeleri **nedenli pasif** gösterir (iyileştirme, `fark`).

### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `crm.*` işlemi yok**. Yalnız rapor işlemi `rapor.crmOpportunities` var (`names.txt:22`); liste ekranının
yerini tutmaz (rapor sözleşmesi, en çok 12 sütun, ayrı sayfalama).

Yeni (önerilen; modül sabiti `"CRM"` eklenmeli; adlar kalıcıdır):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `crm.firsat.listele` | GET `/api/crm/opportunities` | query `q`, `stage`, `closeFrom`, `closeTo`, `valueFrom`, `valueTo`, `page`, `pageSize` | list `CrmOpportunityView`, `rowsPath: "items"`, `metaPaths ["page","pageSize","total"]` | **G-R1** (`total`) çözülmeden sayfalama ve başlık sayacı yanlış |
| `crm.firsat.getir` | GET `/api/crm/opportunities/{id}` | route `id` | record `CrmOpportunityView` | düzenleme formunun ve kaynaklı yazmaların kaynağı |
| `crm.firsat.ozet` | GET `/api/crm/opportunities/summary` (**yeni uç**) | query `q` | record: `total`, `prospecting`, `qualified`, `proposal`, `negotiation`, `won`, `lost`, `openCount`, `overdueCount`, `openValueByCurrency` (bkz. G-R2/G-R3) | yedi sayım isteğinin yerini alır; "bu sayfa" kartlarını tüm sonuca çevirir |
| `crm.firsat.olustur` | POST `/api/crm/opportunities` | body `CrmOpportunityWriteRequest` skalerleri: `code`*, `name`*, `customerId`, `estimatedValue`, `currencyCode`*, `probabilityPercent`* (int, varsayılansız → zorunlu), `expectedCloseDate`, `nextActivityAt`, `notes` | record `CrmOpportunityView` | `currencyCode` için varsayılan `TRY`, `probabilityPercent` için `10` sayfada verilir |
| `crm.firsat.guncelle` | PUT `/api/crm/opportunities/{id}` | route `id`; aynı skalerler, `sourceBacked` | record `CrmOpportunityView` | kaynak `crm.firsat.getir`; tam yer değiştirme olduğu için kaynaklı olması şart (bağlanmayan alan `null` olmasın) |
| `crm.firsat.asamaDegistir` | POST `/api/crm/opportunities/{id}/stage` | route `id`; body `stage` (text) | record `CrmOpportunityView` | `execute` izni. "İlerlet" için sayfada dört düğme, her biri `visibleWhen stage == X` ve `stage` değeri sabit bağlanır (bağlamada sabit değer verilebildiği **doğrulanmalı**; olmazsa aşağıdaki sabit gövdeli adlar) |
| `crm.firsat.kaybedildi` | POST aynı yol | route `id` | record `CrmOpportunityView` | `fixedBody {stage:"Lost"}`; onaylı düğme için ayrı ad, yanlış aşama bağlanma riskini kaldırır |
| `crm.firsat.sil` | DELETE `/api/crm/opportunities/{id}` | route `id` | none | `confirmEnabled` ile mevcut onay metni |

`asamaDegistir` + sabit bağlama doğrulanamazsa yedek ad seti: `crm.firsat.nitelikliYap`, `crm.firsat.teklifeGecir`,
`crm.firsat.muzakereyeGecir`, `crm.firsat.kazanildi` (her biri `fixedBody {stage:…}`). Karar 1. sürümden önce verilmeli;
adlar sonradan geri alınamaz.

Müşteri seçeneği için **yeni `crm.*` işlemi açılmaz**: cari oturumunun önerdiği `cari.listele` (GET `/api/customers`,
`q`, `type`, `status`) kullanılır. Bu, cari standart PR'ının **önce** birleşmesini gerektirir (bkz. G-R5).

Gereken yeni `Labels` kodları (bugün yok; `Label()` açılışta hata verir, `ErpOperationCatalog.cs:494-495`): `customerId`,
`customerName`, `stage`, `estimatedValue`, `currencyCode`, `probabilityPercent`, `expectedCloseDate`, `nextActivityAt`,
`notes`, `total`, `closeFrom`, `closeTo`, `valueFrom`, `valueTo` ve özet alanları (`prospecting` … `openValueByCurrency`).
`currencyCode` cari oturumunun listesinde de var (Satış/Finans oturumları da `customerId`, `customerName` önerebilir):
**aynı satırlara birden çok oturum ekleme yapacak**. İndeksleyici başlatıcısı (`["kod"] = …`) yinelenen kodda hata vermez,
sonraki değer öncekini ezer; asıl risk birleştirme çakışması ve iki farklı etiket metnidir. Var olanlar:
`id`, `code`, `name`, `createdAt`, `updatedAt`, `rowVersion`, `q`, `page`, `pageSize`. Ayrıca güncellenecek kayıtlar:
`tests/IntegrationTests/ErpOperationCatalog.names.txt`, yeni `system-pages/crmOpportunityOperations.fixture.json`,
`SystemPageStandards.versions.txt`, `system-pages/systemPageKeys.ts`.

### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → `page @crm-opportunity-create`; Aç → `page @crm-opportunity-create` + `openParams id=…`,
`disabledWhen stage in [Won, Lost]` + neden "Kapanmış fırsat düzenlenemez"; Sil → `crm.firsat.sil` + `confirmEnabled`;
`moreButtons`: dört "ilerlet" düğmesi `visibleWhen`'li, "Kaybedildi olarak işaretle", CSV; `titleCount`), `metric` (dört
kart), `filterBar` (`searchParam q`, `stage` çipleri), `dataTable` (sunucu sayfalama 50, `valueLabels` aşama Türkçe
adları, `toneMap` aşama tonları, `money`/`date` biçimleri, boş metin), `contextPanel` + `tabs` (Özet / Not), `steps`
(aşama akışı), `alert` (hata), `dialog` (onay).

Eksikler:

- **G-R1 `total` / `totalCount`.** `rowCount` yalnız `totalCount`'tan okunur (`erpOperations.ts:238`); CRM `total` döndürür.
  Sayfalama alt bilgisi, başlık sayacı ve sayaç sorguları yanlış (yalnız sayfa satırı sayılır). Seçenekler: (a) CRM yanıtına
  ek alan `totalCount` (aynı değer; eski alan kalır, asistan ve eski ekran etkilenmez) **[CRM API]**; (b) katalog sonucuna
  `totalPath` **[ortak]**. Öneri (a): tek dosya, diğer modüllere dokunmaz. `total` kullanan başka liste uçları varsa (Satış/
  Finans oturumları da görebilir) (b) ortak çözüm olarak sonra eklenebilir.
- **G-R2 Sunucu sayaçları ve "bu sayfa" kartları.** Çip sayaçları 7 istek; "Açık fırsat değeri" yalnız yüklenen sayfa ve tek
  döviz. Sayfa motorunda sayaç `filterBar` çiplerine bağlanabiliyor mu cari G-C4'te açık. Öneri: yeni uç `GET
  /api/crm/opportunities/summary?q=` + `crm.firsat.ozet` (tek istek; açık değer döviz bazında liste) **[CRM API]**. Çip sayacı
  bağlanamazsa `fark`: sayaçlar yalnız kartlarda.
- **G-R3 "Takibi geçmiş" sayımı.** Koşul dilinde "şimdi" yok (stok G-T1 ile aynı). Bugün de yalnız sayfayı ve istemci saatini
  sayar. Öneri: `overdueCount` özet ucunda sunucu saatiyle (`NextActivityAt < UtcNow`, açık aşamalar) **[CRM API]**. Satır
  vurgusu istenirse görünüme `isFollowUpOverdue` eklenir; bu yeni işlem adı gerektirmez çünkü `crm.firsat.listele` henüz
  yayımlanmadı (ilk sürümde birlikte girer).
- **G-R4 "Sonraki takip" tarih + saat.** `nextActivityAt` `DateTimeOffset`, ama motorda `datetime` girişi yok; katalog `date`
  yapar. Kaydedilince saat 00:00'a düşer. Seçenekler: (a) motora `inputType: "datetime"` (yerel saat ↔ ISO çevirisi)
  **[ortak]**; (b) `fark`: yalnız tarih. Öneri (a); başka modüllerde de tarih-saat alanı var (ör. aktivite, randevu). Aynı
  alanda **eski ekranda bir hata** var: düzenleme açılırken değer `toISOString().slice(0,16)` (UTC) ile doldurulur, kaydederken
  yerel saat sayılır (`:292` doldurma, `:312` kaydetme). Türkiye'de (UTC+3) her düzenleme kaydı takip saatini **3 saat geri** kaydırır. Bu
  korunacak davranış değil, düzeltilecek kusurdur; (a) doğru çeviriyle bunu kendiliğinden giderir.
- **G-R5 Müşteri seçici seçenekleri.** Seçenekler aktif ve `Customer`/`Both` türünde olmalı. `cari.listele` tek `type` değeri
  alır; "Customer veya Both" tek sorguyla ifade edilemez; eski ekran ilk 50 satırı istemcide süzer. Seçenekler: (a) `/api/customers`
  için çoklu `type` (`type=Customer,Both`) ya da `role=customer` parametresi **[Cari API, cari oturumu]**; (b) `lookup` yalnız
  `status=Active` ile, tedarikçiler de görünür, sunucu yanlış seçimi 400 ile reddeder (`fark`). Öneri (a), cari PR'ı ile
  birlikte; olmazsa (b) geçici. Bağımlılık: **cari standart PR'ı önce birleşir** (`cari.listele` adı oradan gelir).
- **G-R6 Aşama akışında kaybedilen fırsat.** `steps` önceki adımları tamamlandı çizer; eski panel kaybedilende yalnız Kaybedildi'yi
  işaretler (aşama geçmişi yok). Öneri: iki bileşen — açık/kazanılmış için 5 adımlı `steps` (`visibleWhen stage != Lost`),
  kaybedilmiş için `alert`/`text` "Kaybedildi · aşama geçmişi tutulmuyor" (`visibleWhen stage == Lost`) **[standart]**. `fark`
  (küçük): kaybedilmişte akış listesi görünmez.
- **G-R7 Yeni ve düzenleme formu yeri.** Eski ekran Yeni (F2) ve Aç'ı **aynı sekmede** formla değiştirir; `crm-opportunity-create`
  anahtarı ise ayrı sekmede açılır ve kayıttan/vazgeçten sonra listeye döner. Öneri: tek standart `crm-opportunity-create`
  (yeni + düzenleme; `id` sayfa parametresi doluysa düzenleme), stok kartı (`inventory-stock` → `@inventory-stock-create`
  `openParams id`) ile aynı kalıp **[standart]**. `fark`: liste sekmesinden Yeni/Aç artık form sekmesine geçer (bugün aynı
  sekmede açılıyor). Kayıttan sonra listenin yenilenmesi sekme dönüşünde olur; doğrulanmalı.
- **G-R8 Hesaplanan form değerleri.** "Ağırlıklı değer = tutar × olasılık / 100" (form yan kutusu) aritmetik ister (cari G-C7).
  Öneri: `fark` — yan kutu kalkar, yerine sabit ipucu metni; ya da görünüme `weightedValue` alanı (yalnız kayıtlı fırsatta,
  düzenlemede) **[CRM API]**. Öneri: `fark` (bilgi amaçlı, kayıt etkilemiyor).
- **G-R9 Eşzamanlılık.** Bugün son yazan kazanır (0. bölüm). Taşıma değiştirmez. İstenirse ayrı iş: istek gövdesine `rowVersion`
  + yeni işlem adı `crm.firsat.guncelleSurumlu`. 1. sürüm dışı önerilir.
- **G-R10 Olasılık hazır düğmeleri.** %10 / 25 / 50 / 75 / 90 düğmeleri olasılık alanını doldurur. Bir düğmenin form alanına
  değer yazabildiği **doğrulanmalı**; yoksa `fark`: alan `select` + serbest sayı yerine yalnız sayı girişi ve ipucu "0–99".
- **G-R11 Kod sütununun ad altına taşınması.** Ad sütunu görünürken kod ayrı sütunda gösterilmez, adın altına yazılır.
  `dataTable`'da iki satırlı hücre (alt metin) yok (stok G-T2 ile aynı kısıt). `fark`: kod ayrı sütun.
- **G-R12 Açıklamalı boş durumlar.** Süzgeçsiz boş hat için uzun açıklama + "İlk fırsatı oluştur" düğmesi; süzgeçli boşta etkin
  süzgeç etiketleri + "Aramayı ve filtreleri temizle". `dataTable` boş metni tek satır; boş durum düğmesi ve süzgeç temizleme
  (stok G-T3) **doğrulanmalı**; yoksa `fark`: tek satırlık boş metin, temizleme filterBar'ın kendi düğmesiyle.
- **G-R13 Aşama komutlarının hedefi.** Eski ekranda İlerlet/Kaybedildi yalnız **current** satıra uygulanır. Sistem sayfasında
  `liste.seciliSatir` kullanılmalı; işaretli çoklu satıra toplu aşama değişikliği **eklenmemeli** **[standart]**.
- **G-R14 Görünüm eşlemesi.** `crm-opportunities` görünümünün alanları (`TenantScreenViewEndpoints.cs:429-435, 1286-1289`):
  `code`, `name`, `customerName`, `stage`, `estimatedValue`, `probabilityPercent`, `expectedCloseDate`, `nextActivityAt`,
  `actions` (sabit). Eşleme bire birdir; `actions` aktarılmaz. `pageSettings` yok **[standart]**.

---

## 2. Yeni fırsat (`crm-opportunity-create`; önerilen: yeni + düzenleme tek tanım)

### 2.1 Yerleşim

`RecordFormPage` (kayıt formu v3; `sales-record-forms.css`):

- **Başlık:** yeni → "Yeni fırsat"; düzenleme → fırsat adı, alt başlık kod + aşama etiketi + müşteri adı. Kaydet: "Fırsat
  oluştur" / "Değişiklikleri kaydet". Vazgeç. Form kimliği `crm-opportunity-form`.
- **Hata şeridi:** müşteri listesi yüklenemezse "Müşteri listesi yüklenemedi: <mesaj>".
- **Bölüm "Fırsat"** (ipucu "* zorunlu alan"): Fırsat adı* (2 sütun, en çok 160, yer tutucu "ERP yenileme projesi"),
  Fırsat kodu* (mono, en çok 40, "FRS-2026-001"), Müşteri (2 sütun, `SearchableRecordPicker`: "Müşteri seçin",
  "Henüz bağlanmadı", "Müşteri kodu veya unvanıyla ara", seçenek etiketi "KOD · Ünvan"; boşken "Müşteriler aranıyor…" ya da
  "Aramanızla eşleşen aktif müşteri bulunamadı.").
- **Bölüm "Tahmin ve takip":** Tahmini tutar (sayı, ≥ 0, 0,01 adım) + para birimi (3 harf, yazarken büyük harf; varsayılan
  TRY), Beklenen kapanış (tarih), Sonraki takip (tarih + saat), Kazanma olasılığı % (0–99; varsayılan 10), hazır değer
  düğmeleri %10/25/50/75/90 + "Ya da 0–99 arası değer yazın".
- **Bölüm "Not":** çok satırlı, en çok 2000, "Görüşme özeti veya sonraki adım".
- **Yan kutu:** "Ağırlıklı değer" (tutar × olasılık, canlı) ve ipucu "Fırsatı müşteri carisine bağlayın; kapanış ve sonraki
  takip tarihini planlayın."

### 2.2 API çağrıları

| Çağrı | Ne zaman |
|---|---|
| `GET /api/customers/?page=1&pageSize=50[&q]` | form açılınca ve müşteri aramasında (200 ms) |
| `POST /api/crm/opportunities/` | yeni kayıt |
| `PUT /api/crm/opportunities/{id}` | düzenleme kaydı |

Önerilen sistem sayfasında ek olarak `crm.firsat.getir` (düzenlemede kaynak) çağrılır.

### 2.3 Kurallar

- 1.3'teki doğrulamalar. Kaydet düğmesi istemcide yalnız `required` alanları ve sayı sınırlarını denetler; kod biçimi ve döviz
  sunucuda denetlenir. Sunucu doğrulama hataları tek metinde birleşir (cari bölüm 0); alan vurgusu yok (`fark`, eskisi de
  alan vurgulamıyor).
- Yeni kayıtta aşama her zaman İlk temas'tır (formda aşama alanı yok); aşama yalnız İşlemler'den değişir.
- Düzenlemede müşteri temizlenirse `customerId: null` gönderilir ve bağ kopar (geçerli).
- Kayıttan sonra yeni formda alanlar temizlenir ama **para birimi ve olasılık korunur** (`:263-270`); `initialCreate` ise listeye
  döner. Sistem sayfasında form sekmesi kayıttan sonra listeye döner (G-R7).
- Boş tutar `null`, boş tarih `null`, boş not `null` gönderilir.

### 2.4 Roller

- Yeni: `erp.crm-opportunities.create` (+ seçici için `erp.customers.read`). Düzenleme: `update` ve kaynak okuma için `read`.

### 2.5 ERP işlem kataloğu

`crm.firsat.olustur`, `crm.firsat.guncelle`, `crm.firsat.getir` (1.5) ve müşteri seçeneği için `cari.listele` (cari oturumu).

### 2.6 Bileşen eşlemesi ve eksikler

Var: `recordHeader` (yeni/düzenleme başlığı `visibleWhen` ile iki bileşen), `formCard` + `section` (üç bölüm), `text` girişleri,
`number`, `date`, `lookup` (müşteri), `select` ya da metin (para birimi), çok satırlı metin, `alert` (seçici hatası),
`actionBar` (Kaydet / Vazgeç; Ctrl+S).

Eksikler: G-R4 (tarih-saat), G-R5 (müşteri seçenekleri), G-R8 (ağırlıklı değer), G-R10 (hazır düğmeler). Ek olarak:

- **G-R15 Kod ve para biriminin büyük harfe çevrilmesi.** Eski form para birimini yazarken büyütür. Sunucu kodu da para
  birimini de kırpıp büyütür (`:161-162`), yani küçük harf kabul edilir. `fark` yalnız görseldir (yazarken küçük görünür).
- **G-R16 Kaydet ve Yeni / kaydedilmemiş değişiklik** cari G-C17/G-C18 ile aynı; eski CRM formunda da "Kaydet ve Yeni" yok.
  `fark` yok.

---

## 3. Kaybolması kolay eski davranışlar (denetim listesi)

1. Aç ve Sil'in hedef sırası: odaklı satır → current satır → tek işaretli satır; Ctrl+Del odaklı satırı siler
   (`crmOpportunities.test.tsx` "Ctrl+Del on a focused row").
2. Kapanmış fırsatta Aç'ın nedenli pasif olması ("Kapanmış fırsat düzenlenemez"), panelde de Aç pasif; ama Sil açık.
3. İşlemler'deki "Aşamayı ilerlet: <sonraki aşama adı>" — düğme metni sonraki aşamanın adını taşır.
4. Bildirim metni "<ad>: <aşama> aşamasına taşındı."
5. Kazanmada müşteri yoksa sunucunun 409 metni hata şeridinde görünür (kayıt değişmez).
6. Panelde Not sekmesinin yalnız not varken görünmesi.
7. Kaybedilen fırsatın akışında yalnız Kaybedildi'nin işaretli olması (G-R6).
8. Para birimi birden çoksa "Açık fırsat değeri" kartının "—" göstermesi (yanlış toplam vermemesi).
9. Silme onayında varsayılan odağın Vazgeç olması; Esc/arka plan ile kapanma.
10. Yeni kayıttan sonra para birimi ve olasılığın korunması (2.3).
11. Arama/süzgeç değişince sayfanın 1'e dönmesi; geç dönen yanıtların yok sayılması.
12. Boş hat ile süzgeçli boş sonucun farklı metin ve düğmeleri (G-R12).
13. Görünümde gizlenen ad sütununda kod sütununun yine görünmesi (G-R11 kuralı: "ad gizliyse kod kalır").
14. Müşterisi olmayan satırda "Bağlanmadı", tarihi olmayanda "Tarih yok", takibi olmayanda "Takip planlanmadı".
15. İngilizce arayüz metinleri (G-M6; testte doğrulanıyor).

## 4. Özet tablo

| Ekran | Var olan işlemler | Yeni işlem (v1) | Sonraya kalan | Başlıca eksikler |
|---|---|---|---|---|
| CRM Fırsatları | 0 (`rapor.crmOpportunities` yerini tutmaz) | 6 (`listele`, `getir`, `ozet`, `asamaDegistir`, `kaybedildi`, `sil`) | `guncelleSurumlu` (G-R9) | **G-R1 `total`**, G-R2/G-R3 özet ucu, G-R6 akış, G-R7 form sekmesi |
| Yeni fırsat (yeni + düzenleme) | — | 2 (`olustur`, `guncelle`) + `cari.listele` | — | **G-R4 tarih-saat (+ eski 3 saat kayması)**, G-R5 müşteri seçenekleri, G-R8, G-R10 |

Eksik kimlikleri (tek liste): G-R1 `total`/`totalCount` · G-R2 sunucu sayaçları ve "bu sayfa" kartları · G-R3 takibi geçmiş ·
G-R4 tarih-saat girişi · G-R5 müşteri seçenekleri (cari bağımlılığı) · G-R6 kaybedilen fırsatın akışı · G-R7 form yeri (tek
tanım, ayrı sekme) · G-R8 ağırlıklı değer · G-R9 eşzamanlılık · G-R10 olasılık hazır düğmeleri · G-R11 kod alt satırı ·
G-R12 açıklamalı boş durumlar · G-R13 aşama komutunun hedefi · G-R14 görünüm eşlemesi · G-R15 büyük harf · G-R16 Kaydet ve Yeni.

Nerede çözülür: **[CRM API]** G-R1(a), G-R2, G-R3 (yalnız `CrmEndpoints.cs`, CRM oturumunun dosyası). **[ortak]** G-R4(a)
(sayfa motoru), katalog `Labels` + modül sabiti + `names.txt` + `systemPageKeys.ts` + `versions.txt`. **[Cari API]** G-R5(a).
**[standart]** G-R6, G-R7, G-R11–G-R14.

## 5. Önerilen sıra ve riskler

Önerilen sıra: (1) cari standart PR'ı birleşir (`cari.listele`, ortak `Labels` kodları) → (2) CRM API eklemeleri
(`totalCount`, `/summary`) + `crm.*` katalog girdileri + iki standart (`preview`, varsayılan yine eski ekran) tek PR → (3) G-R4
tarih-saat girişi ortak motor sırası geldiğinde ayrı PR; o gelene kadar standart "Sonraki takip"i yalnız tarih olarak taşır ya da
ekran `preview`'da kalır.

Riskler:

- **Ortak dosya çakışması.** `ErpOperationCatalog.cs` (`Labels`, modül sabitleri), `names.txt`, `systemPageKeys.ts`,
  `SystemPageStandards.versions.txt` Cari, Satış, Satınalma, Finans ve CRM oturumlarının hepsinin ekleme yaptığı dosyalar.
  `currencyCode`, `customerId`, `customerName` gibi etiketler birden çok oturumda önerilir; yinelenen kod sessizce ezilir
  ve etiket metni son birleşene göre değişir. Birleştirme sırası ve "etiket önce var mı" denetimi şart.
- **Saat kayması kusuru (G-R4).** Eski ekran düzenlemede takip saatini kaydırıyor. Taşıma yalnız tarih alanıyla yapılırsa
  saat bilgisi **tamamen** kaybolur (00:00). İki kötü seçenek arasında kalmamak için tarih-saat girişi önce gelmeli.
- **`total` adı (G-R1)** düzeltilmeden yayımlanırsa sayfalama yalnız ilk 50 kaydı gösterir, başlık "50 kayıt" der.
- **Aşama işlem adları kalıcı.** `asamaDegistir` + sabit bağlama doğrulanmadan ad açılırsa, sonradan sabit gövdeli adlara geçmek
  eski adı `deprecated` bırakır. 1. sürümden önce doğrulanmalı.
- **Son yazan kazanır** (G-R9) eski ve yeni ekranda aynı; iki satış temsilcisi aynı fırsatı düzenlerse biri sessizce ezilir.
- **Kapanmış fırsat silinebilir** ve kalıcıdır; bugünkü kural. Sistem sayfasında onay metni korunmalı.
- **İzin farkı:** aşama `execute` ister. Eski ekran 403'ü hata olarak gösterir; sistem sayfası düğmeyi nedenli pasif
  gösterir. Kullanıcıya görünen fark olumludur ama QA'da yalnız `update` hakkı olan TenantUser ile denenmeli.
