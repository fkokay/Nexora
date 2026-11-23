# Dış Ticaret dosyaları: eşdeğerlik envanteri

Bu belge, Dış Ticaret modülünün yerleşik ekranını sistem sayfasına (standart tanım) taşımak için girdidir. Bilgiler kod
okunarak çıkarıldı (2026-11-22, `origin/master` `abd6b027`). Biçim ve terimler `2026-11-21-cari-ekranlari-envanteri.md`,
`2026-11-21-crm-ekranlari-envanteri.md` ve `2026-11-21-finans-ekranlari-envanteri.md` ile aynıdır. `fark` kabul edilmiş
davranış farkı, `eksik` taşımadan önce kapatılması gereken boşluk anlamına gelir. Her eksiğin sonunda **nerede
çözüleceği** yazılıdır: `[standart]` yalnız JSON tanımı, `[DT API]` yalnız `ForeignTradeEndpoints.cs` (Dış Ticaret'in
kendi dosyası), `[ortak]` sayfa motoru ya da her modülün dokunduğu katalog dosyası (sıralama gerekir).

## Kapsam: Dış Ticaret bugün tek bir ekrandan ve tek bir kayıt türünden oluşur

Görevde sayılan **gümrük beyannamesi**, **akreditif** ve **masraf dağıtımı** ekranları kodda **yok**. Taranan yerler:
`shell/moduleMenus.ts:96` (rayda tek sayfa: `foreign-trade`), `shell/railItems.ts:30`, `workspace-navigation.ts:57`,
`WorkspacePageRouter.tsx:62, 257-258`, `App.tsx:416`, `src/Hosts/AIERP.Api/*ForeignTrade*.cs`,
`src/Platform/AIERP.Platform.Domain/ForeignTradeEntities.cs`, ayrıca bütün `src` ve `frontend/erp-web/src` içinde
`LetterOfCredit|akreditif`, `CustomsDeclaration|beyanname`, `LandedCost|landed-cost`, `CostAllocation|masraf dağıt`
aramaları. Sonuç:

- **Akreditif:** hiçbir eşleşme yok.
- **Gümrük beyannamesi:** yalnız bordro e-beyannamesi (`PayrollGib1003AExporter.cs`, `HumanResourcesEndpoints.cs:1350,
  1832`) ve Dış Ticaret panelindeki "resmî gümrük beyannamesi değildir" uyarısı. Dosyada yalnız serbest metin
  **gümrük referansı** (`CustomsReference`, en çok 100) tutulur.
- **Masraf dağıtımı:** Satınalma'da **mal kabul ek maliyeti** olarak var (`POST /api/purchasing/receipts/{id}/landed-costs`,
  katalogda `satinalma.malKabul.ekMaliyetler` / `ekMaliyetDagit` / ters kayıt, `ErpOperationCatalog.cs:439-456`, yalnız
  TenantAdmin). Bu, zaten sistem sayfası olan **Stok Değerleme** (`inventory-cost`) ekranındadır ve dış ticaret dosyasına
  bağlı **değildir**. Bu envanterin kapsamı dışında kalır.

Bu yüzden görevdeki "en sık kullanılan 3–5 ekranı seç" adımı uygulanmaz: taşınacak ekran tektir. Önerilen iki standart:

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `foreign-trade` | İthalat ve ihracat dosyaları (liste + detay paneli + "Stok belgesi seç" penceresi) | `ForeignTradePage.tsx` + `foreign-trade/components/{ForeignTradeFilters,ForeignTradeGrid,ForeignTradeDetail,ForeignTradeDocumentPicker}.tsx`, `foreign-trade/{advance,tradeStatus,types}.ts` |
| `foreign-trade-case` (**yeni anahtar**, önerilen) | Dış ticaret dosyası (yeni + düzenleme tek tanım) | bugün `ForeignTradePage.tsx:708-1056` içindeki kalıcı pencere (`RecordFormPage variant="dialog"`) |

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir. Dosya adı yazılmayan
satır numaraları `ForeignTradePage.tsx` (frontend) ya da `ForeignTradeEndpoints.cs` (sunucu) içindir.

Kapsam dışı ama aynı veriyi kullanan tüketiciler (taşımadan etkilenmez): AI asistanı (`ForeignTradeAssistantEndpoints.cs`
`GET /api/foreign-trade/assistant-cases`, `src/AI/AIERP.AIService/AI/ERPAssistantForeignTradeTools.cs`; kimlik, değer,
HS/gümrük/taşıyıcı referansı döndürmez).

Gelecek alan işi (bu taşımanın parçası değil, ayrı tasarım ister): gümrük beyannamesi kaydı (GTİP satırları, vergi
kalemleri), akreditif (banka, tutar, vade, belge listesi), ithalat masraflarının dosyaya bağlanıp mal kabul ek maliyetine
dağıtılması. Bunlar yeni varlık, uç ve yetki ister.

## 0. Ortak bilgiler

### Menü ve anahtarlar

- **`foreign-trade` standart menü kataloğunda yok** (`StandardMenuEndpoints.cs:11-24`; "Dış Ticaret" grubu da yok). Standart
  yükleyici, menüde olmayan anahtarı reddeder: "screenKey '…' standart menüde bir sayfa değil."
  (`SystemPages/SystemPageStandards.cs:204-205`). Yeni form anahtarı `foreign-trade-case` için de aynısı geçerli. Bkz. **G-D1**.
- Rayda ve modül menüsünde tek sayfa: `{ railId: "foreign-trade", pages: ["foreign-trade"] }` (`shell/moduleMenus.ts:96`).
  Liste sayfaları kümesinde (`WorkspaceShellPage.tsx:52`) ve hızlı aramada (`App.tsx:416`) var.
- Henüz standart dosyası yok (`system-pages/systemPageKeys.ts:6` listesinde `foreign-*` yok). Yeni standartlar sürüm 1 ve
  `preview` ile başlar.
- Kiracı görünümü: `foreign-trade-files` (`TenantScreenViewEndpoints.cs:177-180, 663, 1091-1093`). Bkz. **G-D19**.

### Yetki modeli

- `/api/foreign-trade/*` → `erp.foreign-trade` (`PlatformPermissionCatalog.cs:79`). İki katman birlikte uygulanır:
  1. Genel istek denetimi (`PermissionAuthorizationHandler.cs:50`, `Program.cs:130-132` varsayılan politika): eylem yoldan
     çıkar. GET → `read`, PUT → `update`, POST → kuyruk `IsExecutionRoute` listesindeyse `execute`, değilse `create`
     (`PlatformPermissionCatalog.cs:344-357, 399-410`). `transition` listede → `execute`. **`inventory-document` listede
     yok → `create`**.
  2. İşleyicinin kendi denetimi (`IsAllowedAsync`, `:335-351`): liste/okuma `read`, oluşturma `create`, güncelleme `update`,
     **geçiş ve belge bağlama `execute`** (`:178, 229`).
  Sonuç: belge bağlamak bugün **hem `create` hem `execute`** ister. Bkz. **G-D6**.
- `GET /capabilities` (`:30-44`) üç bayrak döndürür: `canCreate`, `canUpdate`, `canAdvance` (= `execute`). Eski ekran
  bunlarla düğmeleri nedenli pasif yapar ve "Eksik işlem izni" notunu gösterir (`:652-677`). Sistem sayfasında karşılığı
  katalog `allowed` bayrağıdır (ayrı işlem gerekmez).
- **TenantAdmin** katalogu atlar. TenantUser ve TenantDeveloper için varsayılan **ret**: Allow kuralı gerekir, Deny kazanır.
- **Satır düzeyi süzgeç yok**, rol denetimi olan işleyici yok. Kayıtlar yalnız firma (`TenantId`) ile sınırlanır.
- Sipariş seçenekleri (`GET /orders`) satınalma/satış okuma iznine **bakmaz**; `erp.foreign-trade.read` yeter (`:45-56`).
  Satış siparişi göremeyen kullanıcı da sipariş kodunu, cari adını ve genel toplamı görür. Bugünkü davranıştır.

### İdempotency ve eşzamanlılık

- Yazmalar idempotency anahtarı almaz. `POST /cases` çift gönderimde ikinci istek referans benzersizliğine takılır
  (409 "Bu dış ticaret referansı firma içinde zaten kullanılmış.", `:87-88, 114-116`).
- Belge bağlama **idempotent**: aynı belge yeniden gönderilirse 200 (`:186`). Satır kilidi (`UPDLOCK, ROWLOCK`) ve
  serileştirilebilir işlemle yarış korunur (`:180-183`).
- **Sürüm denetimi yok** (`ForeignTradeCase`'te `RowVersion` yok). PUT tam yer değiştirmedir: **son yazan kazanır**. Geçişler
  durum makinesiyle korunur (`CanTransition`, `:307-315`); iki oturum aynı adımı aynı anda atarsa ikincisi 409 alır.

### Para birimi, kur, ters kayıt, iptal sırası (görevin sorduğu kurallar)

- **Para birimi siparişten gelir ve kilitlenir.** Oluştururken `CurrencyCode` bağlı siparişin dövizidir (`:98-100, 109`);
  istekte döviz alanı yoktur. Güncellemede değişmez; sipariş dövizi sonradan değişirse dosya eskisini taşır.
- **Kur yok.** Beyan değeri sipariş dövizinde tutulur; TL karşılığı, kur tarihi ya da değerleme yoktur.
- **Bu modül hiçbir şey kaydetmez.** Stok defterine ya da yevmiyeye yazmaz. Yalnız var olan, kayıtlı (Posted) ve tüm satırları
  etkin stok hareketine sahip mal kabul (ithalat) ya da teslimat (ihracat) belgesini **bağlar** (`:175-224`). Bildirim
  metni: "Standart stok belgesi dış ticaret dosyasına bağlandı; stok defterine ikinci kez kayıt yapılmadı." (`:525`).
- **Ters kayıt sonrası:** "etkin hareket" = ters kaydı olmayan hareket (`HasPostedInventoryMovementsAsync`, `:321-329`).
  Bağlı belge sonradan ters çevrilirse ihracat gümrüğe, ithalat kapanışa geçemez (409 "Bağlı … belgesi artık kayıtlı ve
  etkin stok hareketlerine sahip değil…", `:253, 266`). **Bağı kaldırma ucu yok**, farklı belge bağlamak da 409
  ("farklı bir stok belgesi zaten bağlanmış", `:187`). Dosya bu durumda **kalıcı olarak takılır**. Bkz. **G-D26**.
- **İptal sırası:** dosya yalnız **Taslak** ya da **Planlandı** iken iptal edilebilir (`:309-310`); sevkten sonra iptal yok.
  Dosya iptali siparişi ya da bağlı belgeyi etkilemez. Sipariş sonradan iptal edilirse dosya etkilenmez (PUT siparişi
  yeniden doğrulamaz). Yeni dosya yalnız iptal edilmemiş siparişe açılır (`:92, 95`).
- **Silme yok.** Uç yok; eski ekranda Sil nedenli pasif: "Dosya silinemez; İşlemler'den iptal edin." (`:618-622`).

### Testler (bugün)

- Frontend: `foreign-trade/foreignTradeFrame.test.tsx` (9 test): Yeni/Aç/İptal'in işlem çubuğunda olması ve koşulları,
  sevkteki dosyanın düzenlenememesi, İlerle'nin panel koşullarıyla pasifliği, Sevke geçişte önce PUT sonra geçiş,
  geçiş sürerken çift tıkın formu açmaması, aşama çipleri, "ilk 100 / toplam N" alt bilgisi, durum tonları, belge bağlama gövdesi.
- Sunucu: `tests/IntegrationTests/ForeignTradeEndpointsIntegrationTests.cs` (ithalat yaşam döngüsü: firma kapsamı, doğrulama,
  denetim kaydı, sevkten sonra kilit, belge bağlamada idempotent yeniden deneme `:208-211`),
  `ForeignTradeAssistantEndpointsIntegrationTests.cs`, `ERPAssistantForeignTradeToolsTests.cs`.

---

## 1. İthalat ve ihracat dosyaları (`foreign-trade`)

### 1.1 Yerleşim

- **Başlık** (`ListPageHeader`, `:643-651`): "İthalat ve ihracat dosyaları", açıklama "Satın alma ve satış siparişlerine bağlı
  lojistik, gümrük referansı ve sevkiyat adımlarını izleyin.", sayaç = **yüklenen** dosya sayısı (en çok 100), birim "dosya".
- **Özet kartı yok.**
- **Eksik izin notu** (`:652-677`, `role=note`): eksik `create`/`update`/`execute` kodları ve "…İzin politikaları ekranında…
  tanımlayabilir. Kayıtları görüntülemek için ayrıca `erp.foreign-trade.read` gerekir."
- **Hata şeridi** (`:678-689`): yükleme hatası, kapatılabilir. 403 için izin koduyla açıklayıcı metin (`:184-191`,
  `requiredPermission` `:112-124`). Doğrulama hataları tek metinde birleşir (`:193-198`).
- **İşlem çubuğu** (`:598-624`; form açıkken gizlenir `:627`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | Yön süzgeci İthalat ise **İthalat**, değilse (Tümü dahil) **İhracat** dosyası formu (`:602`). `create` yoksa nedenli pasif. |
| Aç | Enter | Seçili dosya; yoksa "Önce bir kayıt seçin"; Taslak/Planlandı değilse "Yalnız Taslak ve Planlandı dosyalar düzenlenebilir"; `update` yoksa izin metni; meşgulse "İşlem sürüyor…". |
| Sil | Ctrl+Delete | Her zaman pasif: "Dosya silinemez; İşlemler'den iptal edin." |
| İşlemler ▾ | Alt+İ | "İthalat dosyası", "İhracat dosyası" (yeni form, yön sabit); seçili dosyada: "<sonraki aşama> aşamasına geçir" (`advanceCheck` nedeniyle pasif olabilir), "Stok belgesi bağla…" (koşullu), "İptal et" (Taslak/Planlandı; onaylı); her zaman CSV dışa aktar. |

- **Liste araç çubuğu** (`ForeignTradeFilters.tsx`): arama ("Referans ara…"; **istemcide**, referans + gümrük referansı +
  taşıyıcı referansında `includes`, `:276-286`), **yön çipleri** (Tüm yönler / İthalat / İhracat, sayılar yüklenen sayfadan),
  **aşama çipleri** (Taslak … Kapandı + İptal, temizlenebilir, **sayısız**: "the page loads one page of cases, so a count would
  not be the real total"), Yenile, ızgara araçları yuvası.
- **Izgara** (`ForeignTradeGrid.tsx`; `SalesDocumentGrid`, `gridId: foreign-trade-files-v2`): tek tık seçer, çift tık /
  Enter açar (`openCase`, `:306-313`: düzenlenebilir ve `update` varsa formu açar, değilse odağı panele taşır). Esc seçimi
  kaldırır (`:314-326`). Sayfalama yok; alt bilgi "Gösterilen N / M" ve 100'e ulaşınca "ilk 100 / toplam T" (`:1076-1094`).
- **Sütunlar** (`defaultForeignTradeFields`, `renderCell`):

| Anahtar | Başlık | Gösterim |
|---|---|---|
| `reference` | Dosya | mono referans + soluk "· İthalat/İhracat" |
| `direction` | Yön | varsayılan gizli |
| `linkedOrder` | Sipariş / cari | mono sipariş kodu + soluk "· cari adı"; **istemcide** `/orders` listesinden eşlenir, bulunamazsa "—" |
| `countries` | Rota | "TR → DE" + soluk "· Incoterms · taşıma" |
| `dates` | Sevk → varış | `gerçek ?? planlanan` kısa tarih "15.11 → 02.12"; ipucunda dört tarih; ikisi de yoksa "—". **Yalnız ön yüzde** (kiracı görünümünde yok, `withFrontendForeignTradeFields` ekler) |
| `status` | Durum | `StatusTag`: Taslak `info`, Kapandı `ok`, İptal `off`, diğerleri `warn` (`tradeStatus.ts`) |
| `transportMode` | Taşıma şekli | varsayılan gizli; Kara/Deniz/Hava/Demir yolu/Çok modlu |
| `actions` | İşlem | sabit alan ama **çizilmez** |

- **Boş durumlar:** hiç dosya yoksa ve süzgeçli boşta farklı metin ("Eşleşen dosya bulunamadı").
- **Detay paneli** (`ForeignTradeDetail.tsx`): seçim yoksa "Dosya seçin" + açıklama + kısa uyarı. Seçiliyken:
  - üst: "Seçili dosya · İthalat", referans başlığı;
  - bildirim (başarı 6 sn sonra kendiliğinden kapanır, hata kalır; `:327-332`);
  - **aşama şeridi**: 6 adım (Taslak → Planlandı → Sevkte → Gümrükte → Ulaştı → Kapandı), önceki adımlar tamamlandı; **iptal
    dosyada hiçbiri işaretli değil**; altında durum etiketi + "· sıradaki: <aşama>";
  - değer listesi: Sipariş, Rota, HS kodu, Beyan değeri (döviz ile), Taşıyıcı / takip, Gümrük referansı ("Girilmedi");
  - **"Sonraki adım" bölümü**: sonraki aşamanın eksik ön koşulları başlıkla ("Sevke geçmek için gerekli", "Gümrüğe geçmek
    için gerekli", "Kapatmak için gerekli") ve **panelde doldurulabilen girişlerle**: gümrük referansı; planlanan sevk,
    beyan değeri, Incoterms (`advance.ts:36-96`). Girilemeyenler engel olarak yazılır (bağlı belge, gerçek varış, izin);
  - **"Stok belgesi"** bölümü: bağlıysa belge, değilse açıklama "Stok hareketini standart mal kabul veya teslimat ekranında
    oluşturun. Bu adım yalnızca mevcut belgeyi bağlar; stok ikinci kez işlenmez." ve uygun belge yoksa uyarı;
  - alt uyarı: "İç operasyon kaydıdır; resmî gümrük beyannamesi değildir." (uzun metni ipucunda, `:60-64`).
- **"Stok belge seç" penceresi** (`ForeignTradeDocumentPicker.tsx`): başlık "Stok belgesi seç", tablo Belge / Tarih / Depo /
  Satır; tür adı İthalat'ta "Mal kabul", İhracat'ta "İrsaliye"; yalnız bağlı olmayanlar seçilebilir; ↑↓, Enter ve çift tık
  bağlar, Esc kapatır; Vazgeç / Bağla.
- **İptal onayı** (`:587-596`): "Dosyayı iptal et", "Dosya iptal edilsin mi? Bu işlem geri alınamaz.", "Evet, iptal et" /
  "Vazgeç", tehlike tonu.

### 1.2 API çağrıları

| Çağrı | Ne zaman | Not |
|---|---|---|
| `GET /api/foreign-trade/cases?page=1&pageSize=100` | açılış, her yazmadan sonra | `{items, page, pageSize, total}`; yön/durum süzgeci sunucuda **kullanılmaz** (istemcide) |
| `GET /api/foreign-trade/orders?direction=Import` ve `=Export` | açılış | her biri iptal edilmemiş son 100 sipariş; form seçeneği **ve** listedeki sipariş/cari sütunu |
| `GET /api/foreign-trade/capabilities` | açılış | düğme bayrakları |
| `GET /api/screen-views/foreign-trade-files/active` | açılış | yayımlanmış görünüm yoksa varsayılan sütunlar; hata sessiz |
| `GET /api/foreign-trade/cases/{id}/inventory-documents` | dosya seçilince | panel ve seçici; en çok 100, yalnız tüm satırları etkin hareketli kayıtlı belgeler |
| `POST /api/foreign-trade/cases` | yeni form kaydı | |
| `PUT /api/foreign-trade/cases/{id}` | düzenleme kaydı **ve** Sevke geçişten önce panel girişleri | tam yer değiştirme |
| `POST /api/foreign-trade/cases/{id}/transition` `{status, customsReference}` | İşlemler → geçir / iptal et | `actualDate` ve `carrierReference` sunucuda var, eski ekran **göndermez** |
| `POST /api/foreign-trade/cases/{id}/inventory-document` `{documentId}` | seçicide Bağla | |

**Olmayan uç:** `GET /cases/{id}` (tek kayıt). Eski ekran düzenlemede listedeki satırı kullanır. Bkz. **G-D4**.

### 1.3 Kurallar

- **Aşama makinesi** (`:307-315`): Taslak → Planlandı → Sevkte → Gümrükte → Ulaştı → Kapandı; Taslak ve Planlandı'dan İptal.
  Atlama, geri dönüş yok. İstemcideki `nextStatus` haritası bunun kopyasıdır (`:104-110`).
- **Geçiş ön koşulları** (`:236-267`):
  - **Sevkte:** planlanan sevk tarihi, beyan değeri > 0 ve Incoterms dolu olmalı; `ActualShipDate = actualDate ?? bugün (UTC)`.
  - **Gümrükte:** gümrük referansı (istekte ya da kayıtta) dolu olmalı. **İhracatta** ek olarak bağlı, kayıtlı ve etkin
    hareketli **teslimat** belgesi şart.
  - **Ulaştı:** `ActualArrivalDate = actualDate ?? bugün`; gerçek sevk tarihinden önce olamaz.
  - **Kapandı:** gerçek varış tarihi şart. **İthalatta** ek olarak bağlı, kayıtlı ve etkin hareketli **mal kabul** şart.
  - `actualDate` gelecekte olamaz (UTC bugününe göre, `:302-303`).
- **Belge bağlama** (`:175-224`): İthalat yalnız Ulaştı/Kapandı'da, İhracat Sevkte'den itibaren. Belge aynı siparişe ait,
  Posted, tüm satırları etkin hareketli olmalı ve başka dosyaya bağlı olmamalı. Bir dosyaya tek belge. Bağ kaldırılamaz.
- **Düzenleme** yalnız Taslak/Planlandı'da (`:128`); yön ve bağlı sipariş değiştirilemez (`:131-132`).
- **Doğrulama** (`Validate`, `:278-295`): referans 1–50, `^[A-Za-z0-9][A-Za-z0-9._/-]{0,49}$`, firmada benzersiz; çıkış ve
  varış ülkesi ISO 3166-1 alfa-2 listesinden ve **farklı**; Incoterms 2020 (11 kod) ya da boş; HS kodu 6–10 **rakam** ya da
  boş (nokta kabul etmez); taşıma Road/Sea/Air/Rail/Multimodal; beyan değeri 0 ≤ x ≤ 999.999.999.999; taşıyıcı ve gümrük
  referansı ≤ 100; not ≤ 1000; planlanan varış ≥ planlanan sevk.
- **İstemci kolaylıkları** (sunucuda yok): HS kodunda nokta/boşluk silinir ("8443.32" → "844332", `:90-101`); ülke kodu
  yazarken yalnız harf ve büyük harf (`:102-103`); **beyan değeri boşsa sipariş genel toplamı** gönderilir (`:397`) ve sipariş
  seçilince alan sipariş toplamıyla dolar (`:797-805`).
- **Denetim kaydı:** `foreign-trade.case.created`, `.updated`, `.status-changed` (`<ref>:<önceki>-><sonraki>`),
  `.inventory-document-linked`.

### 1.4 Roller

- **TenantAdmin:** her şey.
- **TenantUser / TenantDeveloper:** her işlem `erp.foreign-trade.{read,create,update,execute}` Allow kurallarına bağlı.
  Aşama ilerletmek ve iptal **`execute`**; Sevke geçişte panelden ön koşul girmek ayrıca **`update`**; belge bağlamak
  **`create` + `execute`** (G-D6).
- Eski ekran `capabilities` ile düğmeleri nedenli pasif yapar. Sistem sayfası aynı sonucu katalog `allowed` ile verir; "Eksik
  izin notu" bloğunun karşılığı yoktur (`fark`, G-D18).

### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `disTicaret.*` işlemi yok**. Yeni modül sabiti: `private const string ForeignTradeModule = "Dış Ticaret";`
ayrı dosyada (`ErpOperationCatalog.ForeignTrade.cs`, partial `BuildForeignTrade()`; Satış/Satınalma/CRM ile aynı kalıp).
Adlar kalıcıdır.

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `disTicaret.dosya.listele` | GET `/api/foreign-trade/cases` | query `q`, `direction`, `status`, `page`, `pageSize` | list `ForeignTradeCaseView`, `items`, `MetaPaths [page, pageSize, totalCount]` | **G-D2** `totalCount`, **G-D3** `q` |
| `disTicaret.dosya.getir` | GET `/api/foreign-trade/cases/{id}` (**yeni uç**) | route `id` | record | **G-D4**; düzenleme formunun kaynağı |
| `disTicaret.dosya.ozet` | GET `/api/foreign-trade/cases/summary` (**yeni uç**) | query `q` | record: `totalCount`, `importCount`, `exportCount` + 7 durum sayısı | **G-D5**; çip sayaçları (karar) |
| `disTicaret.dosya.olustur` | POST `/api/foreign-trade/cases` | body `ForeignTradeCaseWriteRequest` skalerleri | record | yön sayfa parametresinden sabit |
| `disTicaret.dosya.guncelle` | PUT `/api/foreign-trade/cases/{id}` | route `id`; aynı skalerler, `sourceBacked` | record | kaynak `disTicaret.dosya.getir`; tam yer değiştirme |
| `disTicaret.dosya.planla` | POST `…/{id}/transition` | route `id` | record | `fixedBody {status:"Booked"}` |
| `disTicaret.dosya.sevkEt` | POST aynı yol | route `id`; body `actualDate`, `carrierReference` | record | `fixedBody {status:"Shipped"}`; bkz. G-D7, G-D8 |
| `disTicaret.dosya.gumrugeGecir` | POST aynı yol | route `id`; body `customsReference` | record | `fixedBody {status:"CustomsClearance"}` |
| `disTicaret.dosya.varisKaydet` | POST aynı yol | route `id`; body `actualDate` | record | `fixedBody {status:"Arrived"}` |
| `disTicaret.dosya.kapat` | POST aynı yol | route `id` | record | `fixedBody {status:"Closed"}` |
| `disTicaret.dosya.iptalEt` | POST aynı yol | route `id` | record | `fixedBody {status:"Cancelled"}`; onaylı düğme |
| `disTicaret.dosya.stokBelgeleri` | GET `…/{id}/inventory-documents` | route `id` | list (dizi, `rowsPath` yok) | sütunlar `code`, `documentDate` (**"Belge tarihi" olarak yeniden etiketlenir**; var olan etiket "İrsaliye tarihi"), `warehouseName`, `lineCount`, `isLinked` |
| `disTicaret.dosya.stokBelgesiBagla` | POST `…/{id}/inventory-document` | route `id`; body `documentId` | record | **G-D6** izin |
| `disTicaret.siparis.ithalatSecenekleri` | GET `/api/foreign-trade/orders` | — | list (dizi) `ForeignTradeOrderOption` | `fixedQuery {direction:"Import"}` |
| `disTicaret.siparis.ihracatSecenekleri` | GET aynı yol | — | list (dizi) | `fixedQuery {direction:"Export"}` |

Motor doğrulamaları (kod okundu): `fixedBody` ile bağlı gövde parametreleri birlikte gönderilebilir (gövde
`{...kaynak, ...fixedBody}` + bağlı parametreler, `custom-page/erpOperations.ts:91, 123-124`); `fixedQuery` katalogda var
(`ErpOperationCatalog.cs:47, 769-775`). CRM'in sabit gövdeli aşama işlemleri aynı kalıptır (`ErpOperationCatalog.Crm.cs:38-47`).
`/capabilities` için işlem **açılmaz** (katalog `allowed` yeterli).

Gereken yeni `Labels` kodları (bugün yok): `referenceCode`, `originCountryCode`, `destinationCountryCode`, `incotermsCode`,
`harmonizedSystemCode`, `transportMode`, `carrierReference`, `customsReference`, `declaredValue`, `plannedShipDate`,
`actualShipDate`, `plannedArrivalDate`, `actualArrivalDate`, `actualDate`, `inventoryPostingRequired`, `salesDeliveryId`
(Satış bloğunda varsa yeniden eklenmez), `inventoryDocumentLinkedAt`, `documentId`, `isLinked`, `counterpartyName`,
`importCount`, `exportCount` ve durum sayıları; G-D5/G-D19 kabul edilirse `orderCode`, `route`, `shipDate`, `arrivalDate`.
Var olanlar: `id`, `code`, `status`, `direction` ("Yön", stok hareketinden; anlam uyar), `currencyCode`, `notes`,
`purchaseOrderId`, `purchaseReceiptId`, `warehouseName`, `lineCount`, `totalCount`, `updatedAt`, `page`, `pageSize`, `q`;
Satış/Satınalma bloklarında `grandTotal`, `orderDate`, `salesOrderId`, `documentDate`. Ayrıca güncellenecek kayıtlar:
`tests/IntegrationTests/ErpOperationCatalog.names.txt`, yeni `system-pages/foreignTradeOperations.fixture.json`,
`SystemPageStandards.versions.txt`, `system-pages/systemPageKeys.ts`.

### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → `page @foreign-trade-case` + `params direction`; Aç → aynı sayfa + `params id`,
`disabledWhen status not in [Draft, Booked]` + neden; Sil sabit pasif + neden; `moreButtons`: "İthalat dosyası", "İhracat
dosyası", aşama düğmeleri `visibleWhen status == X`, "Stok belgesi bağla…", "İptal et" `confirmEnabled`, CSV; `titleCount`),
satır içi `formCard` (`layout: inline`) içinde **yön** ve **aşama** seçimleri (son QA kuralı; `filterChips` yalnız etkin
çipleri çizer), `filterBar` (`searchParam q`), `dataTable` (sunucu sayfalama 50, `valueLabels` durum/yön/taşıma Türkçe
adları, `toneMap`, `rowOpenAction` → Aç), `contextPanel` (Özet), `steps` (aşama şeridi), `alert` (eksik ön koşul, iptal notu,
uyarı), `dialog` (stok belgesi seçimi; gümrük referansı; gerçek tarih), `text` (yasal uyarı).

Eksikler:

- **G-D1 Menü anahtarları.** `foreign-trade` ve önerilen `foreign-trade-case` standart menü kataloğunda yok; standart yüklenmez
  (`SystemPageStandards.cs:204-205`). Çözüm: kataloğa `new("foreign-trade", "Dış Ticaret Dosyaları", "Dış Ticaret")`,
  `new("foreign-trade-case", "Yeni dış ticaret dosyası", "Dış Ticaret")` **[ortak]**. Kaydedilmiş kiracı menü düzenlerinde yeni
  anahtarların nereye düştüğü doğrulanmalı (stok G-M7 ile aynı soru).
- **G-D2 `total` / `totalCount`.** Liste `{items, page, pageSize, total}` döndürür (`:78`); motor yalnız `totalCount` okur
  (`custom-page/erpOperations.ts:307-308`). Çözüm: yanıta aynı değerle `totalCount` (CRM'deki gibi, `CrmEndpoints.cs:223-224`);
  `total` kalır **[DT API]**.
- **G-D3 Sunucu araması.** `/cases` `q` almaz; bugün arama ve yön/aşama süzgeci ilk 100 satırda istemcide çalışır. Çözüm: `q`
  (referans, gümrük ve taşıyıcı referansında `Contains`) **[DT API]**. Yön ve durum süzgeci sunucuda zaten var.
- **G-D4 Tek kayıt okuma ucu.** `GET /cases/{id}` yok; kaynaklı güncelleme (`sourceBacked`) bunu ister. PUT tam yer değiştirme ve
  yön/sipariş değişimini reddettiği için kaynaksız form bütün alanları doğru doldurmak zorunda. Çözüm: yeni uç (`read` izni)
  **[DT API]**.
- **G-D5 Çip sayaçları.** Yön çiplerindeki sayılar yüklenen sayfadan; sunucu sayfalamasıyla anlamını kaybeder. Seçenekler:
  (a) `GET /cases/summary?q=` + `disTicaret.dosya.ozet` (yön ve 7 durum sayısı; aşama çiplerine de sayı gelir) **[DT API]**;
  (b) `fark`: sayısız çipler, başlıkta yalnız toplam. Öneri (a): tek küçük uç, yanlış sayı göstermemek eski ekranın açık hedefiydi.
- **G-D6 Belge bağlama izni.** Genel denetim `inventory-document` kuyruğunu `create` sayar, işleyici `execute` ister. Bugün ikisi
  birden gerekir; katalog `allowed` yalnız `create`e bakar. `execute` hakkı olup `create` hakkı olmayan kullanıcı düğmeyi açık
  görür, basınca 403 alır. Çözüm: `IsExecutionRoute` listesine `inventory-document` eklenir ya da
  `/api/foreign-trade/` için özel durum yazılır **[ortak: `PlatformPermissionCatalog.cs`]**. Sonuç: bağlama yalnız `execute`
  ister (işleyicinin niyeti). Bu **yetki genişletmesidir**; karar ister.
- **G-D7 Sevk ön koşulları tek adımda.** Eski panel eksik sevk tarihi, beyan değeri ve Incoterms'i alır, önce PUT sonra geçiş yapar
  (**atomik değil**: PUT başarılı, geçiş başarısızsa alanlar kaydedilmiş kalır, `:469-505`). Sayfa motorunda bir düğmeden iki
  yazma zinciri yok. Seçenekler: (a) `fark`: "Sevke geçir" eksik alan varken nedenli pasif ("Önce dosyayı açıp planlanan sevk
  tarihi, beyan değeri ve Incoterms girin"), panelde eksikler `alert` ile listelenir, Aç düğmesi formu açar **[standart]**;
  (b) geçiş gövdesine Sevk için bu üç alanı ekleyip sunucuda tek işlemde yazmak (`update` iznini de denetler) **[DT API]**.
  Öneri (a): API anlamı değişmez, yetki karışmaz, atomiklik sorunu da kalkar.
- **G-D8 Gerçek sevk / varış tarihi.** Sunucu `actualDate` alır, eski ekran göndermez (her zaman "bugün"). Öneri: Sevke geçir ve
  Varışı kaydet küçük pencere açar: "Gerçek tarih" (boş = bugün) + Sevk'te taşıyıcı referansı (iyileştirme) **[standart]**.
  **Risk:** sunucu "gelecek" denetimini **UTC** bugünüyle yapar (`:302`); Türkiye'de 00:00–03:00 arası yerel bugün seçilirse 400
  döner. Bu yüzden pencerede varsayılan **boş** bırakılmalı (sunucu kendi bugününü yazar), `tarih.bugun` varsayılanı verilmemeli.
  Kalıcı çözüm: sunucunun firma saat dilimini kullanması **[DT API]** (ayrı iş).
- **G-D9 Beyan değerinin sipariş toplamından gelmesi.** Eski form sipariş seçilince alanı doldurur ve boşsa toplamı gönderir. Form
  `lookup`'ında seçimle komşu alanı doldurma yok (`lookupFill` yalnız `editableGrid` için, Satış Aşama B). Seçenekler: (a) istekte
  `declaredValue` boş (`null`) gelirse sunucu sipariş genel toplamını yazar (`decimal` → `decimal?`; eski ekran hep sayı gönderdiği
  için etkilenmez) **[DT API]**; (b) `fark`: kullanıcı değeri elle girer. Öneri (a).
- **G-D10 Yöne göre sipariş seçici.** Seçenekler yön alanına bağlı. Öneri: iki `lookup` (`visibleWhen direction == Import/Export`),
  her biri sabit sorgulu kendi işlemine bağlı; yön Yeni'den sayfa parametresiyle gelir ve formda değişmez; düzenlemede seçici
  salt okunur **[standart]**. Seçenek etiketi "KOD · Cari · 12.500,00 USD" (bileşik etiket desteği doğrulanmalı; yoksa kod + cari).
- **G-D11 HS kodu biçimi.** Sunucu yalnız rakam kabul eder; eski form "8443.32" yazımını rakama çevirir. Çözüm: sunucu da nokta ve
  boşluğu silsin (ön yüz ve asistanla tutarlı) **[DT API]**; yoksa `fark`: kullanıcı rakamla girer, hata metni yol gösterir.
- **G-D12 Ülke kodu yazımı.** Eski form yalnız harf alır ve büyütür; sunucu da büyütür. `fark` yalnız görseldir. Ülke listesi
  için `select` (ISO adlarıyla) ileride düşünülebilir; v1'de metin + "2 harf, ör. TR" ipucu **[standart]**.
- **G-D13 İptal dosyada aşama şeridi.** `steps` önceki adımları tamamlandı çizer; eski şerit iptal dosyada hiçbir adımı işaretlemez.
  Öneri: `steps` `visibleWhen status != Cancelled`, iptalde `alert` "İptal edildi · sevk başlamadan kapatıldı" (CRM G-R6 kalıbı)
  **[standart]**.
- **G-D14 Yeni'nin yönü.** Yeni, yön süzgeci İthalat ise İthalat, aksi halde İhracat açar. Öneri: `params direction` =
  `{{yonSecimi.value}}`, boşsa `Export`; İşlemler'de iki sabit yönlü düğme **[standart]**. Yön parametresiz açılan formda
  (menüden) yön seçimi görünür olmalı.
- **G-D15 Çift tık davranışı.** Eski ekran düzenlenemeyen dosyada çift tıkla odağı panele taşır. `rowOpenAction` Aç'a bağlanır;
  düzenlenemeyen dosyada nedenli pasif kalır, panel zaten seçimle güncellenir. `fark` (küçük) **[standart]**.
- **G-D16 Stok belgesi seçim penceresi.** `dialog` + `dataTable` (`disTicaret.dosya.stokBelgeleri`, `isLinked == false` süzülür) +
  "Bağla" düğmesi `{{belgeListesi.seciliSatir.id}}` **[standart]**. Pencere içi tablonun seçili satırına bağlama ve açılışta yenileme
  (`resetOnOpen`) doğrulanmalı; olmazsa `lookup` + Bağla. Tür adı (Mal kabul / İrsaliye) `visibleWhen` ile iki başlık.
- **G-D17 Bildirim metinleri.** "Dosya oluşturuldu ve denetim kaydına eklendi", "<ref>: <aşama> durumuna geçirildi", "…stok
  defterine ikinci kez kayıt yapılmadı". Motorun işlem başına başarı metni desteği doğrulanmalı; yoksa `fark`: genel başarı bildirimi
  **[standart]**.
- **G-D18 Eksik izin notu.** Bloğun karşılığı yok; izinsiz düğmeler nedenli pasif. `fark` (olumlu sayılabilir: neden düğmenin
  üstünde) **[standart]**.
- **G-D19 Bileşik hücreler ve görünüm eşlemesi.** `countries` (rota + Incoterms + taşıma), `dates` (gerçek ?? planlanan, ipucu),
  `reference` (+ yön) ve `linkedOrder` (kod + cari) tek hücrede birden çok alan çizer; `dataTable`'da birleşik hücre yok
  (stok G-T2). Öneri: görünüme sunucuda hesaplanan alanlar: `route` ("TR → DE"), `shipDate`, `arrivalDate` (gerçek ?? planlanan),
  `orderCode`, `counterpartyName` (bkz. G-D20) **[DT API]**; tabloda ayrı sütunlar: Dosya, Yön, Sipariş, Cari, Rota, Incoterms,
  Taşıma, Sevk, Varış, Durum. Kiracı görünümü `foreign-trade-files` alanları (`reference`, `direction`, `linkedOrder`,
  `countries`, `status`, `transportMode`, `actions`) yeni sütunlara eşlenir; `actions` aktarılmaz **[standart]**.
- **G-D20 Sipariş ve cari sütunu.** Eski sütun istemcide son 100 iptal edilmemiş siparişle eşlenir; eski ya da iptal edilmiş
  siparişin dosyasında "—" görünür (bugünkü **kusur**). Çözüm: `ForeignTradeCaseView`'a `orderCode`, `counterpartyName` (sunucu
  birleştirmesi) **[DT API]**. Asistan ucu etkilenmez (ayrı görünüm).
- **G-D21 Sayfalama.** Eski ekran ilk 100'ü yükler, sayfa yok ("ilk 100 / toplam T"). Sistem sayfası 50'şer sunucu sayfalaması
  yapar (G-D2/G-D3 ile) **[standart]**. `fark` (olumlu).
- **G-D22 Eşzamanlılık.** Son yazan kazanır; taşıma değiştirmez. 1. sürüm dışı.
- **G-D23 Seçili dosya hedefi.** Aşama, iptal ve bağlama yalnız `liste.seciliSatir`'a uygulanır; toplu işlem eklenmez **[standart]**.
- **G-D24 Panel "Sonraki adım" bölümü.** Ön koşul girişleri G-D7(a) ile kalkar; yerine aşamaya göre `alert` metinleri
  ("Sevke geçmek için gerekli: …", "İhracatta gümrükten önce kayıtlı teslimat belgesini bağlayın", "Kapatmak için gerçek varış
  tarihi ve ithalatta mal kabul bağlı olmalı") `visibleWhen` koşullarıyla **[standart]**. Koşul dilinde boş alan denetimi
  (`== null`) doğrulanmalı.
- **G-D25 Dil.** Tek dil (G-M6 / cari G-C25); eski ekran İngilizce metinler taşır (testte de). `fark`.
- **G-D26 Ters çevrilen bağlı belge (bugünkü kusur).** Bağlı belge ters çevrilince dosya ilerleyemez ve başka belge bağlanamaz;
  çıkış yok. Taşımayla ilgisi yok ama QA'da görünür. Öneri: ayrı küçük iş: bağlı belge artık geçerli değilse yeniden bağlamaya izin
  ver (ya da `unlink`) **[DT API]**. 1. sürüm dışı; risk olarak not edildi.

---

## 2. Dış ticaret dosyası (`foreign-trade-case`; yeni + düzenleme tek tanım, önerilen)

### 2.1 Yerleşim (bugünkü pencere)

`RecordFormPage variant="dialog"` (kayıt formu v3; `finance-record-forms.css`), arka plan tıklaması kapatır (`:708-720`):

- **Başlık:** "İthalat dosyası oluştur" / "İhracat dosyası oluştur"; düzenlemede "<Yön> dosyasını düzenle". Kaydet: "Dosya oluştur" /
  "Değişiklikleri kaydet"; Vazgeç.
- **Durum satırı:** "Sipariş, firma veritabanında doğrulanır ve referans değişiklikleri denetlenir." + sipariş seçilmemişse uyarı
  "Kaydetmek için bağlı sipariş seçin."
- **Sipariş yoksa not** (`:765-782`): "İthalat dosyası için seçilebilir satın alma siparişi bulunamadı. Önce Satın Alma → Siparişler
  ekranından bir sipariş oluşturun." (ihracat için satış karşılığı).
- **Bölüm "Dosya Kimliği"** (4 sütun): Bağlı sipariş* (2 sütun, `select`, "KOD · Cari · tutar döviz"; düzenlemede pasif),
  Dış ticaret referansı* (mono, ≤ 50, yer tutucu `IMP-2026-001` / `EXP-2026-001`).
- **Bölüm "Güzergâh ve Teslim":** Çıkış ülkesi (ISO alfa-2; "2 harf, ör. TR"), Varış ülkesi ("ör. DE"), Incoterms 2020 (`select`,
  "Seçin" + 11 kod), HS kodu ("6–10 hane; 8443.32 yazabilirsiniz"), Taşıma (`select`, varsayılan Kara).
- **Bölüm "Değer ve Planlama":** Beyan değeri (sipariş dövizi başlıkta; ≥ 0, 0,01 adım; yer tutucu sipariş toplamı), Planlanan
  sevkiyat, Planlanan varış (tarih).
- **Bölüm "Referanslar ve Not":** Taşıyıcı / takip referansı (≤ 100), Gümrük referansı (≤ 100), Operasyon notu (≤ 1000, tam genişlik).

### 2.2 API çağrıları

| Çağrı | Ne zaman |
|---|---|
| `GET /api/foreign-trade/orders?direction=…` | sayfa açılışında (iki yön) |
| `POST /api/foreign-trade/cases` | yeni kayıt |
| `PUT /api/foreign-trade/cases/{id}` | düzenleme kaydı |

Önerilen sistem sayfasında: `disTicaret.siparis.{ithalat,ihracat}Secenekleri`, `disTicaret.dosya.getir` (düzenleme kaynağı),
`olustur`, `guncelle`.

### 2.3 Kurallar

- 1.3'teki doğrulamalar. Sunucu doğrulama hataları tek metinde birleşir; alan vurgusu yok (eskisi de yok).
- Yeni kayıt her zaman Taslak'tır; `InventoryPostingRequired = true` (`:104`).
- Kayıttan sonra eski ekran pencereyi kapatır, **süzgeçleri temizler** ve yeni dosyayı seçip panelde gösterir (`:437-450`).
  Sistem sayfasında form sekmesi kayıttan sonra listeye döner; yeni satırın seçilmesi `dataTable.openParam` ile verilebilir
  (Satış Aşama A özelliği) **[standart]**.
- Boş isteğe bağlı alanlar `null` gönderilir; HS kodu normalize edilir (G-D11); beyan değeri boşsa sipariş toplamı (G-D9).

### 2.4 Roller

- Yeni: `erp.foreign-trade.create` (+ seçenekler için `read`). Düzenleme: `update` + kaynak için `read`.

### 2.5 Bileşen eşlemesi ve eksikler

Var: `recordHeader` (yeni/düzenleme, yön adına göre `visibleWhen` ile dört başlık), `formCard` + `section` (dört bölüm), `text`,
`number`, `date`, `select` (Incoterms, taşıma), `lookup` (sipariş; G-D10), çok satırlı metin, `alert` (sipariş yok notu: seçenek
sorgusunun `{{sorgu.satirSayisi}} == 0` koşulu), `actionBar` (Kaydet / Vazgeç; Ctrl+S; `saveAndNew` **eklenmez**, eskide yok).

Eksikler: G-D1 (anahtar), G-D4 (kaynak), G-D9, G-D10, G-D11, G-D12. Ek olarak:

- **G-D27 Pencereden sekmeye.** Bugün form listenin üstünde kalıcı pencere. Seçenekler: (a) ayrı sekme `foreign-trade-case`
  (stok kartı, cari kartı, CRM fırsat kartıyla aynı kanıtlanmış kalıp; Aç `params id`) **[standart]**; (b) aynı standartta
  `dialog size: xl` (yeni menü anahtarı gerekmez; ama pencerede kaynaklı güncelleme ve kayıttan sonra liste yenileme
  doğrulanmamış). Öneri (a). `fark`: form yeni sekmede açılır.

---

## 3. Kaybolması kolay eski davranışlar (denetim listesi)

1. Yeni'nin yönü yön süzgecinden gelir; Tümü'nde İhracat (G-D14).
2. Aç'ın üç ayrı nedeni: seçim yok / Taslak-Planlandı değil / izin yok; meşgulken "İşlem sürüyor…".
3. Sil her zaman pasif ve "İşlemler'den iptal edin" der.
4. İşlemler'deki düğme metni sonraki aşamanın adını taşır: "Sevkte aşamasına geçir".
5. İptal yalnız Taslak/Planlandı'da ve "geri alınamaz" onayıyla; varsayılan odak Vazgeç.
6. "Stok belgesi bağla…" yalnız: iptal değil, henüz bağlı belge yok, aşama uygun (ithalat Ulaştı/Kapandı, ihracat Sevkte+).
   Uygun belge yoksa nedenli pasif "Uygun kayıtlı stok belgesi yok".
7. Bağlama bildirimi: "stok defterine ikinci kez kayıt yapılmadı".
8. İhracatta gümrükten önce teslimat, ithalatta kapanıştan önce mal kabul bağlı olmalı; sunucu metinleri hata şeridinde görünür.
9. Gümrüğe geçerken gümrük referansı kayıtta yoksa istenir.
10. Düzenlemede yön ve sipariş değiştirilemez; sevkten sonra düzenleme yok.
11. Para birimi siparişten gelir; formda döviz seçimi yoktur, beyan değeri başlığında döviz görünür.
12. Sipariş yoksa formdaki yönlendirici not (Satın Alma / Satış → Siparişler).
13. Panelde iptal dosyanın aşama şeridinde işaretsiz görünmesi (G-D13).
14. "İç operasyon kaydıdır; resmî gümrük beyannamesi değildir." uyarısı (panelde iki yerde) korunmalı: yasal yanlış anlamayı önler.
15. HS kodunda nokta yazılabilmesi (G-D11) ve ülke kodunun büyük harfe çevrilmesi.
16. Başarı bildirimlerinin 6 sn sonra kapanması, hataların kalması.
17. Esc ile seçimin kaldırılması (giriş alanı ya da pencere odakta değilken).
18. İngilizce arayüz metinleri (G-D25).

## 4. Özet tablo

| Ekran | Var olan işlemler | Yeni işlem (v1) | Sonraya kalan | Başlıca eksikler |
|---|---|---|---|---|
| Dış ticaret dosyaları | 0 | 13 (`listele`, `getir`, `ozet`, 6 aşama, `stokBelgeleri`, `stokBelgesiBagla`, 2 sipariş seçeneği) | G-D22 sürüm denetimi, G-D26 yeniden bağlama | **G-D1 menü**, **G-D2 `totalCount`**, G-D3 `q`, G-D5 sayaç, **G-D6 izin**, G-D7 sevk ön koşulu, G-D19/G-D20 sütunlar |
| Dış ticaret dosyası (yeni + düzenleme) | — | 2 (`olustur`, `guncelle`) | — | G-D4 `getir`, G-D9 beyan değeri, G-D10 seçici, G-D11 HS, G-D27 sekme |

Eksik kimlikleri (tek liste): G-D1 menü anahtarları · G-D2 `totalCount` · G-D3 sunucu araması · G-D4 tek kayıt ucu · G-D5 çip
sayaçları · G-D6 bağlama izni · G-D7 sevk ön koşulları · G-D8 gerçek tarih (UTC riski) · G-D9 beyan değeri varsayılanı · G-D10
yöne göre sipariş seçici · G-D11 HS biçimi · G-D12 ülke kodu · G-D13 iptal şeridi · G-D14 Yeni'nin yönü · G-D15 çift tık · G-D16 belge
penceresi · G-D17 bildirim metinleri · G-D18 izin notu · G-D19 bileşik hücreler · G-D20 sipariş/cari sütunu · G-D21 sayfalama ·
G-D22 eşzamanlılık · G-D23 seçili hedef · G-D24 sonraki adım bölümü · G-D25 dil · G-D26 ters çevrilen belge · G-D27 pencere/sekme.

Nerede çözülür: **[DT API]** (yalnız `ForeignTradeEndpoints.cs`) G-D2, G-D3, G-D4, G-D5(a), G-D9(a), G-D11, G-D19, G-D20; sonraya
G-D8 saat dilimi, G-D26. **[ortak]** G-D1 (`StandardMenuEndpoints.cs`), G-D6 (`PlatformPermissionCatalog.cs`), katalog
`Labels` + `names.txt` + `systemPageKeys.ts` + `versions.txt`. **Yeni ortak motor özelliği gerekmez**: gereken her şey (sabit
gövde + parametre, `fixedQuery`, pencere, satır içi süzgeç kartı, `openParam`, `{{sorgu.satirSayisi}}`) master'da var; G-D16
pencere içi tablo seçimi ve G-D17 başarı metni yalnız doğrulanacak. **[standart]** geri kalanlar.

## 5. Önerilen sıra ve riskler

Önerilen sıra: (1) [DT API] eklemeleri (`totalCount`, `q`, `GET /{id}`, `/summary`, görünüm alanları, `declaredValue` boşsa sipariş
toplamı, HS normalizasyonu) — yalnız Dış Ticaret dosyası, diğer modüllere dokunmaz; eski ekran etkilenmez (eklemeler geriye
uyumlu). (2) Ortak küçük değişiklikler: menü kataloğuna iki anahtar, G-D6 izin eşlemesi (karara göre), `disTicaret.*` katalog
dosyası ve etiketler — diğer modüllerin katalog PR'larıyla **sıralanır**. (3) İki standart (`preview`, varsayılan yine eski
ekran). Hepsi tek PR olabilir; ortak dosya çakışması yüzünden birleştirme sırası ana oturumda belirlenir.

Riskler:

- **Ortak dosya çakışması.** `ErpOperationCatalog.cs` (`Labels`), `names.txt`, `systemPageKeys.ts`, `versions.txt`,
  `StandardMenuEndpoints.cs` Üretim, İK ve Duran Varlık oturumlarının da (şu an çalışıyor) ekleme yapacağı dosyalar.
  `actualDate`, `documentId`, `counterpartyName`, `notes` gibi kodlar başka oturumlarda da önerilebilir.
- **İzin genişletmesi (G-D6).** Düzeltme, `create` hakkı olmayan ama `execute` hakkı olan kullanıcıya bağlamayı açar. Bugünkü
  kiracı kurallarında böyle bir kullanıcı varsa davranış değişir; karar ve QA'da bu kombinasyonla deneme şart.
- **UTC "bugün" (G-D8).** Pencerede yerel bugün varsayılanı verilirse gece yarısından sonraki 3 saat boyunca geçişler 400 alır.
- **Menü anahtarı (G-D1).** Kataloğa eklenen anahtar kiracının kaydedilmiş menü düzeninde kendiliğinden görünmeyebilir ya da
  yanlış gruba düşebilir; QA'da kontrol edilmeli.
- **`total` (G-D2)** düzeltilmeden yayımlanırsa sayfalama yalnız ilk sayfayı gösterir.
- **Takılan dosya (G-D26)** taşımayla gelmez ama sistem sayfası QA'sında "kusur" gibi görünebilir; önceden bilinmeli.
- **Yasal uyarı.** "Resmî gümrük beyannamesi değildir" metni kaybolursa ekran resmi beyan aracı sanılabilir; standartta zorunlu
  `text` bileşeni olarak tutulmalı.
