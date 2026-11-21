# Satınalma ekranları: eşdeğerlik envanteri (A)

Bu belge Satın Alma menüsündeki yerleşik ekranları sistem sayfasına (standart tanım) taşımak için girdidir. Bilgiler
kod okunarak çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Biçim ve terimler `2026-11-21-cari-ekranlari-envanteri.md`
ve `2026-11-20-depo-transfer-envanteri.md` ile aynıdır. Zarf ve yönlendirme kuralları `2026-11-18-sistem-sayfalari-design.md`
belgesindedir. `fark` kabul edilmiş ya da belgelenmesi gereken davranış farkı, `eksik` taşımadan önce kapatılması gereken
boşluk anlamına gelir. Tasarım taslağı: `docs/design-proposals/erp-design-language/21-satinalma-sistem-sayfalari.html`.

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir.
`PlatformPermissionCatalog.cs` ve `PlatformContracts.cs` `src/Platform/AIERP.Platform.Application/` altında,
`PlatformPermissionAuthorizer.cs` `src/Platform/AIERP.Platform.Infrastructure/` altındadır.

## Okuma kılavuzu

Belge beş kısımdan oluşur. Her kısmın başında **kendi atıf kuralı** vardır: dosya adı yazılmayan `:N` atıflarının hangi
bölümde `SalesPage.tsx`, hangisinde `Program.cs` olduğunu orada okuyun. Kısımlar içindeki numaralar (`1.6`, `2.3` …) o kısma
aittir; başka kısımdan atıfta "B 1.6" biçimi kullanılır.

| Kısım | Ekranlar | Eksik kimlikleri |
|---|---|---|
| **0** Ortak bilgiler | menü, yönlendirici, `SalesPage` ortaklığı, yetki, idempotency, katalog ve belge satırları | (G-P80…G-P93, Kısım E'de) |
| **A** | Satınalma Talepleri (`sales-requests`), Satınalma Teklifleri (`sales-purchase-quotes`) | G-P1…G-P19 |
| **B** | Satınalma Siparişleri (`sales-purchasing`), Yeni satınalma siparişi (`sales-purchase-order-create`) | G-P20…G-P39 |
| **C** | Satınalma İrsaliyeleri (`sales-purchase-delivery-notes`), Mal kabulleri (`sales-purchase-receipts`), Mal kabul faturası girişi (`sales-purchase-invoice-entry`) | G-P40…G-P59 |
| **D** | Satınalma Faturaları (`sales-purchase-invoices`), Bağımsız fatura taslakları (`sales-purchase-invoice-drafts`), Satınalma İadeleri (`sales-purchase-returns`) | G-P60…G-P79 |
| **E** | Ticari sözleşmeler (`commercial-contracts`), tedarikçi kartları, ortak eksikler | G-P80…G-P99 |
| **Son** | birleşik işlem kataloğu, özet tablo, sıra, riskler, kararlar | — |

**Tedarikçi kartları ve hareketleri.** Ayrı bir tedarikçi ekranı, tedarikçi fiyat listesi ya da tedarikçi performansı ekranı
**yoktur**. Tedarikçi, `customers` ekranında türü `Supplier` ya da `Both` olan cari karttır; kart, adres ve hareketleri (cari
mutabakatı, `customer-ledger`) Cari envanteri kapsar. Satınalmaya özgü tek ek bulgu belge ekranlarındaki tedarikçi
seçicisidir (G-P15, G-P38, G-P99; bkz. E 2).

## Kök eksikler (aynı boşluk, birden çok kimlik)

Kısımlar bağımsız yazıldığı için aynı kök boşluk birkaç ekranda ayrı kimlikle geçer. Kimlikler kısım içi atıfları
bozmamak için yeniden numaralanmadı; aşağıdaki tablo onları birleştirir. Karar ve uygulama **kök** üzerinden yapılmalıdır.

| Kök | Kimlikler | Kısa açıklama | Tür |
|---|---|---|---|
| K1 Kaynaktan dolan, düzenlenebilir satırlar | G-P1, G-P11, G-P28, G-P40, G-P42, G-P66, G-P86 | Talep satırlarından fiyat ızgarası, sipariş satırlarından mal kabul/irsaliye miktarı, fatura satırlarından iade miktarı. Hüküm aşağıda. | motor |
| K2 İç içe satır dizisi | G-P27, G-P52, G-P85 | Mal kabulde `lines[].tracking[]` (lot/seri). Katalog tek düzey `list` bilir. | motor + katalog |
| K3 Hesaplanan sütun ve toplam | G-P16, G-P24, G-P36, G-P53, G-P72, G-P87 | Satır tutarı, KDV dökümü, genel toplam, fatura önizlemesi istemcide hesaplanıyor. | motor ya da sunucu önizleme |
| K4 Lookup'ın komşu hücreleri doldurması | G-P37, G-P71 | Stok seçilince alış fiyatı/iskonto/KDV; taslakta gider hesabı. | motor |
| K5 Satır kurallı izinlerde `allowed` | G-P3, G-P46, G-P88, G-P90 | Cari G-C3 ile aynı kök; ayrıca "sahip veya TenantAdmin" ve işleyici rol denetimleri katalog bayrağıyla ifade edilemiyor. | katalog |
| K6 Tedarikçi seçicisi | G-P15, G-P38, G-P99 | Supplier ∪ Both, ilk 100+100 kayıt, sunucu araması yok. | sunucu + katalog |
| K7 Ekranlar arası köprüler | G-P8, G-P30, G-P34, G-P57, G-P62, G-P77, G-P80 | `sessionStorage` + pencere olayı + App durumu (`pendingPurchaseSupplier`). Sistem sayfası yalnız `token` ve `systemScreenKey` alır. | çalışma zamanı |
| K8 `SalesPage` ortak yükleme | G-P35, G-P58, G-P81 | Beş satınalma sekmesi bütün satış belgelerini ve carileri okuyan genel yüklemeye düşer. | fark (olumlu) |
| K9 Onay akışı | G-P21, G-P91 | İş kuralı yalnız talepten siparişte çalışır; doğrudan `POST /orders` atlar (`Program.cs:6172`, `:6389`). | sunucu (mevcut hata) |
| K10 Sunucu sayaçları ve meta | G-P5, G-P22, G-P49, G-P61, G-P93 | Durum çipleri istemci dizininden; `satinalma.malKabul.listele` meta taşımıyor; sözleşme listesi `total` döndürüyor. | sunucu + katalog |

**K1 hükmü (kısımlar arasındaki çelişkinin çözümü).** C kısmı "Kalem ekle" yolunu yeterli sayıp G-P40'ı `fark` yazdı; A, B
ve E aynı boşluğu engel saydı. Kod: `editableGrid` `gridMode: "list"` kullanıcıya boş satır ekletir ve satırları
`{{ızgara.satirlar}}` ile tek düzey `list` parametresine gönderir (`inventory-transfers.json:127-163`, `depo.transfer.olustur`).
`stage` kipi kaynak satırlarını **salt okunur** çizer ve yalnız eklenen satırları düzenletir (`custom-page/EditableGrid.tsx:42-43`,
`custom-page/gridState.ts:166, 333, 371`). Yani:

- **Teknik engel değil:** mal kabul, irsaliye ve iade "Kalem ekle" ile kurulabilir. Kullanıcı sipariş/fatura satırını
  `lookup` ile seçip miktarı yazar (sipariş satır numarası `int` değerli lookup: doğrulanmalı).
- **Kullanılabilirlik engeli:** bugünkü ekranlarda bütün kalan satırlar ön dolu gelir ve kullanıcı yalnız miktarı düzeltir.
  Kısmi teslim en sık durumdur. Talep → teklif fiyat ızgarası ve "bu teklifle sipariş" (G-P1, G-P11) ise talep satırlarının
  her biri için fiyat ister; "Kalem ekle" ile bu, satır sayısı kadar seçim demektir.
- **Öneri:** satırlı belge **yazmaları** motora "kaynaktan doldur, düzenle, sıfırları atla" eki (`gridMode: "fill"` gibi;
  ortak motor dosyası, diğer modüllerle sıralanır) yapılmadan yayımlanmasın. Listeler, paneller, belge görüntüleme ve satırsız
  komutlar (onay, ret, iptal, faturala) bu eki beklemez.

## Doğrulama durumu

Aşağıdaki iddialar ana oturumda kodla yeniden denetlendi: doğrudan `POST /api/purchasing/orders` (`Program.cs:6389`) iş
kuralını çağırmaz, tek çağrı talepten siparişte (`Program.cs:6172`); `/api/purchasing/orders` grubunda iptal, kapatma ya da
onay uç noktası yoktur (`Program.cs:6243-6521` yazmaları yalnız özel alanlar, oluşturma ve mal kabul) ve
`PurchaseOrderStatus.Cancelled` hiçbir yerde atanmaz (yalnız okunur); `editableGrid` kipleri (K1).
**Kod çıkarımı olarak kalanlar** (QA ya da ek okuma gerekir): ödeme iptalinin ilk denemede 409 vermesi (D, R3; dayanak
`GeneralLedgerTransferEndpoints.cs:92-98`), izlemeli stoğun siparişe bağlı mal kabulde 400 alması (G-P27), teklif ve iade
listelerinin satır süzgecinden geçmemesi (A 4, G-P75), satış okuma izni olmayan kullanıcıda hata bandı (G-P81), fatura
girişi kayıt izninin `erp.purchase-receipts.create`'e çözülmesi (G-P47). Bu beş madde **bugünkü** davranıştır; taşıma
tasarımına katılmadan ayrı hata kaydı olarak ele alınmalıdır (bkz. Son 5).

## İşlem adı kararları (kısımlar arası tekilleştirme)

Katalog adları kalıcıdır (`ErpOperationCatalog.cs:56-59`). Aynı uç nokta için iki kısım farklı ad önerdiyse aşağıdaki
geçerlidir; kısım tablolarındaki diğer ad **kullanılmaz**:

| Uç nokta | B'deki ad | C'deki ad | Geçerli ad |
|---|---|---|---|
| `POST /api/purchasing/orders/{id}/receipts` | `satinalma.siparis.malKabulEkle` | `satinalma.malKabul.olustur` | **`satinalma.malKabul.olustur`** |
| `POST /api/purchasing/receipts/{id}/invoice` | `satinalma.malKabul.faturala` | `satinalma.faturaGirisi.olustur` | **`satinalma.malKabul.faturala`** (talep → `talep.siparisOlustur` ile aynı "kaynaktan dönüştür" kalıbı) |
| `GET /api/purchasing/receipts` (meta'lı) | — | `satinalma.malKabul.sayfa` | **`satinalma.malKabul.sayfaliListe`** (`listele` `inventory-cost.json:238`'de kullanılıyor, sonucu değiştirilemez) |
| Bağımsız fatura taslakları | — | — | D'deki `satinalma.taslak.*` → **`satinalma.faturaTaslagi.*`** ("taslak" tek başına belirsiz) |
| `GET /api/purchasing/orders/custom-fields` | A ve B | — | tek ad `satinalma.siparis.ozelAlanTanimlari` |
| `satinalma.siparis.listele/getir/satirlari/malKabulleri`, `satinalma.malKabul.iptal`, `satinalma.malKabul.ozelAlanTanimlari` | B | C | aynı ad, tek tanım (B'deki sütun ve not birleşik) |
| Ticari sözleşmeler | — | — | E'deki `ticari.sozlesme.*` önerisi **Satış oturumuyla** kararlaştırılacak (G-P94); karar verilene kadar bu ad katalogda açılmaz |

---

## 0. Ortak bilgiler


Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir.
`PlatformPermissionCatalog.cs` ve `PlatformContracts.cs` `src/Platform/AIERP.Platform.Application/` altında,
`PlatformPermissionAuthorizer.cs` ise `src/Platform/AIERP.Platform.Infrastructure/` altındadır. Dosya adı verilmeyen sunucu
satırları `Program.cs` içindir.

Kapsamdaki anahtarlar (yönlendirici `WorkspacePageRouter.tsx:337-392`):

| Ekran anahtarı | Başlık | Yönlendiricideki bileşen | Gerçek gövde |
|---|---|---|---|
| `sales-requests` | Satınalma Talepleri | `SalesRequestsPage` (`:360-361`) | `SalesPage section="sales-requests"` → `PurchasingPanel mode="requests"` (`SalesPage.tsx:2258-2267`) |
| `sales-purchase-quotes` | Satınalma Teklifleri | `PurchaseSupplierQuotesScreenPage` (`:362-363`) | `SalesPage` → `PurchaseSupplierQuotesPage` (`SalesPage.tsx:2237-2242`) |
| `sales-purchasing` | Satınalma Siparişleri | `SupplierOrdersPage` (`:375-376`) | `SalesPage` → `PurchasingPanel mode="purchasing"` |
| `sales-purchase-order-create` | Yeni satınalma siparişi (menüde yok) | `SupplierOrdersPage createPurchaseOrderPage` (`:377-378`) | `SalesPage` → `PurchaseOrderCreatePage` (`SalesPage.tsx:2251-2257, 3728`) |
| `sales-purchase-delivery-notes` | Satınalma İrsaliyeleri | `PurchaseDeliveryNotesPage` (`:355-356`), yalnız `token` | bağımsız (722 satır) |
| `sales-purchase-receipts` | Mal kabulleri | `PurchaseReceiptsPage` (`:381-382`) | `SalesPage` → `PurchaseReceiptsScreen` (`SalesPage.tsx:2275-2282`) |
| `sales-purchase-invoices` | Satınalma Faturaları | `PurchaseInvoicesPage` (`:379-380`) | `SalesPage` → `PurchaseInvoicesScreen` (`SalesPage.tsx:2268-2274`) |
| `sales-purchase-returns` | Satınalma İadeleri | `PurchaseReturnsPage` (`:387-388`) | `DocumentReturnsPage` (`PurchaseReturnsPage.tsx:1-8`) |
| `sales-purchase-invoice-entry` | Mal kabul faturası girişi | `PurchaseInvoiceEntryScreenPage` (`:389-390`) | `SalesPage` → `PurchaseInvoiceEntryPage` (`SalesPage.tsx:2245-2250`) |
| `sales-purchase-invoice-drafts` | Bağımsız fatura taslakları | `SupplierInvoiceDraftsPage` (`:391-392`) | `SalesPage` → `StandaloneSupplierInvoiceDraftPage` (`SalesPage.tsx:2243-2244`) |
| `commercial-contracts` | Ticari sözleşmeler | `CommercialContractsPage` (`:337-344`), `token`, `role`, `locale` | bağımsız, bkz. E 1 |

---


### 0.1 Menü ve anahtarlar

- Standart menü kataloğunda "Satın Alma" grubunda **10 anahtar** var (`StandardMenuEndpoints.cs:19`): `sales-requests`,
  `sales-purchase-quotes`, `sales-purchasing`, `sales-purchase-delivery-notes`, `sales-purchase-receipts`,
  `sales-purchase-invoices`, `sales-purchase-returns`, `sales-purchase-invoice-entry`, `sales-purchase-invoice-drafts`,
  `commercial-contracts`. `sales-purchase-order-create` menüde **yok**. Modül menüsünde `sales-purchasing`'e bağlanır
  (`shell/moduleMenus.ts:22, 79-83`).
- Aynı 10 anahtar `purchasingNavigationPages` listesindedir (`workspace-navigation.ts:31`). Başlıklar
  `salesPageTitles`/`salesPageTitlesEn` tablosundadır (`:24, 27`). `App.tsx:643-649` içinde ikinci bir başlık tablosu
  daha var ("Mal Kabulleri" ≠ "Mal kabulleri"). Taşımada tek kaynak seçilmeli (doğrulanmalı: hangisi sekme başlığına gider).
- **`commercial-contracts` dışındaki tüm anahtarlar `sales-` önekiyle başlar.** Hepsi (sözleşmeler dahil)
  `SalesPageKey` birleşim türündedir (`erp-types.ts:4`). Satış ve
  Satınalma aynı türü, aynı `onNavigate(page: SalesPageKey)` imzasını paylaşır (`SalesPage.tsx:189`).
- Kenar çubuğu (rail) "Satın Alma" düğmesi `sales-purchase-invoices` açar (`shell/railItems.ts:24`). Başlatıcı ana
  ekranında da "Alış Faturaları" kutusu var (`ModuleLauncherPage.tsx:708`). Genel hızlı menüde varsayılan olarak
  `sales-purchase-invoices` bulunur (`App.tsx:55-60`).
- Anahtarların hepsi sekme kalıcılığı kümesindedir (`workspace-storage.ts:12`), `sales-purchase-order-create` dahil. Liste
  sayfası kabuğu kümesinde de hepsi var (`WorkspaceShellPage.tsx:38-47`).
- Henüz hiçbir satınalma anahtarı için standart dosyası yok. `SystemPages/Standards/` altında yalnız 8 `inventory-*`
  dosyası var. `system-pages/systemPageKeys.ts:6` de yalnız bunları listeler (tek satırlık `Set`).
- **Sistem sayfası yoluna yönlendirici bağlamı gitmez.** Sistem sayfası yalnız `token`, `systemScreenKey`,
  `onOpenLegacy` ve `onSystemPageMissing` alır (`WorkspacePageRouter.tsx:185-192`). Eski ekranlara giden
  `salesPageProps` (`:218-226`) şunları taşır: `role`, `onNavigate`, `initialInvoiceId`, `onInitialInvoiceOpened`,
  `initialSupplier` (= `pendingPurchaseSupplier`) ve `onInitialSupplierOpened`. Bunların hiçbiri sistem sayfasına ulaşmaz
  (bkz. G-P80).

### 0.2 Yönlendirici bağlamı ve ekranlar arası köprüler (bugün)

| Köprü | Nereden → nereye | Mekanizma | Kaynak |
|---|---|---|---|
| Cari kartından "Alış faturaları" | `customers` → `sales-purchase-invoices` | App durumu `pendingPurchaseSupplier`, sonra `setPage` | `App.tsx:252, 1006, 1011-1014`; `CustomersPage.tsx:1946, 2169`; `SalesPage.tsx:399-402` |
| Teklif ekranında "Aç" (talep) | `sales-purchase-quotes` → `sales-requests` | `sessionStorage["nexora.purchase-request.open"]` + `nexora:purchase-request-open` olayı | `purchasing/purchaseRequestList.tsx:114-134`; `SalesPage.tsx:2240` (`onOpenRequests`) |
| Yeni sipariş oluşturuldu / talepten siparişi aç | `sales-purchase-order-create` veya talep listesi → `sales-purchasing` | `sessionStorage["nexora.purchase-order.created"]` (`intent: "open"`) + `nexora:purchase-orders-changed` olayı | `SalesPage.tsx:3670-3690, 3889-3900, 6495-6499` |
| Fatura girişi bitti | `sales-purchase-invoice-entry` → `sales-purchase-invoices` | `onNavigate` | `SalesPage.tsx:2248` |
| Satış listeleri arası tazeleme | aynı oturumdaki `SalesPage` örnekleri | `nexora:sales-changed` olayı (örnek kimliğiyle) | `SalesPage.tsx:537-550, 3671` |

Not: Cari kartındaki "Yeni sipariş/teklif/irsaliye/fatura" köprüsü (`nexora.customer-sales-action`) yalnız **satış**
oluşturma sayfalarını kapsar (`SalesPage.tsx:201-212`, `customers/useCustomerListScreen.tsx:91-94`). Satınalmaya giden
tek cari köprüsü "Alış faturaları"dır (`useCustomerListScreen.tsx:101-102`).

### 0.3 `SalesPage.tsx` ortaklığı (10.992 satır)

- Satınalma ekranlarından 8'i (`sales-requests`, `sales-purchase-quotes`, `sales-purchasing`,
  `sales-purchase-order-create`, `sales-purchase-receipts`, `sales-purchase-invoices`, `sales-purchase-invoice-entry`,
  `sales-purchase-invoice-drafts`; `sales-requests` ile `sales-purchasing` aynı `PurchasingPanel`'i açar) 8 satırlık sarmalayıcılarla `SalesPage`'i `section` ile açar
  (ör. `SupplierOrdersPage.tsx:1-8`). `section` → `activeTab` eşlemesi `SalesPage.tsx:403-423`'tedir. Bilinmeyen her
  bölüm `"purchases"` olur (`:423`).
- **Satınalma kodu SalesPage içinde gömülü:** `PurchaseOrderCreatePage` (`:3728-4242`) ve `PurchasingPanel`
  (`:4244-9526`, yaklaşık 5.280 satır, talepler + siparişler) aynı dosyadadır. Diğer satınalma ekranları ayrı dosyadır
  ama SalesPage'in ortak durumundan beslenir (`customers`, `stockItems`, `warehouses`; `:2253-2282`).
- **Ortak yükleme (somut bulgu):** `load()` (`:551-652`) üç dala ayrılır. `quotes/orders/invoices` sayfalı satış
  listelerini okur (`:559-605`). `purchases/requests` tedarikçileri (`type=Supplier` ve `type=Both`, her biri
  `pageSize=100`, sayfalama yok) ve depoları okur (`:607-624`). Geri kalan **her** sekme, yani `purchase-quotes`,
  `purchase-invoices`, `purchase-receipts`, `purchase-invoice-entry` ve `purchase-invoice-drafts`, genel dala düşer
  (`:626-646`). Bu dal `loadAllPages` ile **tüm** satış tekliflerini, siparişlerini, faturalarını ve **tüm** carileri,
  ayrıca stok seçici sayfasını ve depoları okur. Sonuç:
  1. Satış okuma izni (`erp.sales-quotes/-orders/-invoices.read`) olmayan bir satınalma kullanıcısı, bu beş ekranda
     `Promise.all` reddi yüzünden üstte hata bandı görür (`:647-648, 2220-2222`). Ekranın kendi bileşeni yine de çalışır
     (doğrulanmalı: bileşen kendi verisini ayrıca mı yüklüyor).
  2. Büyük firmalarda gereksiz tam tarama olur. Sistem sayfası bu bağımlılığı **taşımamalı** (bkz. G-P81).
- Paylaşılan pencere davranışı: SalesPage genel bir `keydown` (Esc) dinleyicisi kurar (`:376-388`). Aynı dosyada ikinci
  bir dinleyici daha var (`:10874`). Satınalma ayrıntı panelleri bunlardan etkilenir (doğrulanmalı: hangi paneller).
- Bildirim/hata alanları (`notice`, `error`) tek ve ortaktır. Sekme değişince temizlenir (`:424-427`).

### 0.4 Satış taşımasıyla çakışma riski (Satış ayrı oturumda)

| Sıcak nokta | Neden çakışır | Öneri |
|---|---|---|
| `SalesPage.tsx` | İki taşıma da aynı dosyadan dal söker. `activeTab` zinciri (`:403-423`), `load()` dalları (`:551-652`) ve render zinciri (`:2236-2290`) ortaktır. | Satınalma taşıması SalesPage'e **dokunmamalı**; yalnız yönlendiricide sistem sayfası seçimi yapılmalı. Eski ekran "Eski ekran" çubuğu ile aynen kalır. Silme işi her iki taşımadan sonra ayrı bir temizlik PR'ına bırakılmalı. |
| `system-pages/systemPageKeys.ts:6` | Tek satırlık `Set`; iki dal aynı satırı değiştirir. `systemPageKeys.test.ts` klasörle eşitliği denetler. | Birleştirme sırasını Satış oturumuyla belirleyin; ikinci gelen yeniden tabanlayıp satırı birleştirir. |
| `ErpOperationCatalog.cs` `Labels` (`:72-119`) ve `Build()` (`:138-195`) | İki taşıma da etiket sözlüğüne kod ekler. Sözlük `["kod"] = …` dizinleyici başlatıcısıdır, yani aynı kod iki kez eklenirse açılış düşmez, **sonuncusu sessizce kazanır**. Risk metinsel birleştirme çakışması ve iki dalda farklı etiket metnidir. Ortak kodlar (`supplierId`, `grandTotal`, `currencyCode`, `customerId` …) iki dalda da gerekecek. | `BuildPurchasing()` / `BuildSales()` gibi ayrı metotlar; ortak etiketler tek PR'da önceden eklensin. |
| `tests/IntegrationTests/ErpOperationCatalog.names.txt` | Ad listesi kalıcılık testidir; iki dal da satır ekler. | Sıralı ekleme, yeniden tabanlama. |
| `sales/` ortak bileşenleri | Satınalma dosyaları `sales/` altından içe aktarır: `SalesListDetailPanel` (13 dosya), `SalesListFooter` (7), `SalesDocumentGrid` (7), `salesDocumentForm` (5), `salesDocumentDetail` (5), `useSalesListPanel` (4), `salesListCells` (4), `SalesRowActionsMenu` (2, sözleşmeler dahil: `ContractRegister.tsx:4`), `SalesListPanels` (2), `salesListStatus`, `AsyncStockItemPicker`. | Satış taşıması bunları silerse eski satınalma ekranları kırılır. Satış oturumuna "silme yok" notu iletilmeli. |
| `document-page/documentStatus` | Satış ve satınalma durum sözlükleri aynı dosyadadır (`SalesPage.tsx:83`). | Dokunulmamalı. |
| `SalesPageKey` / `onNavigate` türü | Satınalma anahtarları satış türünde (`erp-types.ts:4`). | Tür ayrıştırması ayrı iş; taşımada değiştirilmemeli. |
| Ticari sözleşmeler | Hem satış hem satınalma sözleşmesi (`CommercialContracts.cs:3`) ama menüde "Satın Alma" altında (`StandardMenuEndpoints.cs:19`). | Kimin taşıyacağı ve işlem adları Satış oturumuyla kararlaştırılmalı (G-P94). |

### 0.5 Yetki modeli

Eylem yoldan çözülür (`PlatformPermissionCatalog.cs:319-348`): GET → `read`, PUT → `update`, DELETE → `delete`. POST'ta
son parça `IsExecutionRoute` listesindeyse `execute`, değilse `create` olur (`:387-397`). Her kaynak için
`read/create/update/delete/execute` tanımı vardır (`:28, 119-129`). **TenantAdmin** katalogu atlar
(`PlatformPermissionAuthorizer.cs:52-55`); diğer roller için varsayılan **ret**tir.

Kaynaklar (`PlatformPermissionCatalog.cs:51, 73-84`): `erp.purchase-requests` (`/api/purchasing/requests`),
`erp.supplier-quotes` (`/api/purchasing/supplier-quotes`), `erp.purchase-orders` (`/api/purchasing/orders`),
`erp.purchase-receipts` (`/api/purchasing/receipts`), `erp.purchase-delivery-notes` (`/api/purchasing/delivery-notes`),
`erp.purchase-invoices` (`/api/purchasing/invoices`), `erp.commercial-contracts` (`/api/commercial-contracts`),
`erp.supplier-returns` (`/api/purchasing/returns`), `erp.supplier-payments` (`/api/purchasing/payments`) ve tedarikçi
kartları için `erp.customers`.

**Özel çözümlemeler (öneki sezgisel kaynaktan farklı olanlar):**

| İstek | Çözülen izin | Kaynak |
|---|---|---|
| `GET /api/purchasing/invoices/entry/receipts` | `erp.purchase-invoices.create` (okuma değil) | `PlatformPermissionCatalog.cs:159-167` |
| `GET /api/purchasing/standalone-invoices/suppliers` | `erp.purchase-invoices.create` | `:168-175` |
| `/api/purchasing/standalone-invoices…` (tümü) | `erp.purchase-invoices.*` | `:176-181` |
| `/api/purchasing/standalone-receipts…` | `erp.purchase-receipts.*` | `:185-187` |
| `POST /api/purchasing/invoices/{id}/payments` | `erp.supplier-payments.create` | `:218-224` |
| `POST /api/purchasing/invoices/{id}/returns` | `erp.supplier-returns.create` | `:225-231` |
| `/api/purchasing/receipts/{id}/landed-costs…` | `erp.inventory-cost-adjustments.*` (ters kayıt `execute`) | `:263-267` |
| `POST /api/purchasing/delivery-notes/{id}/link-receipt` / `unlink-receipt` | `erp.purchase-delivery-notes.update` | `:332-334` |
| `POST /api/commercial-contracts/{id}/transitions` | `erp.commercial-contracts.execute` | `:154-158` |
| `POST /api/purchasing/requests/{id}/order` (talepten sipariş) | `erp.purchase-requests.create` (**sipariş izni değil**) | önek + `order` listede yok |
| `POST /api/purchasing/requests/{id}/supplier-quotes` | `erp.purchase-requests.create` (**teklif izni değil**) | önek |
| `POST /api/purchasing/orders/{id}/receipts` (mal kabul) | `erp.purchase-orders.create` (**mal kabul izni değil**) | önek |
| `POST /api/purchasing/receipts/{id}/invoice` (kabulden fatura) | `erp.purchase-receipts.create` (**fatura izni değil**) | önek, `invoice` listede yok |

**`IsExecutionRoute` listesindeki satınalma son ekleri** (`:390-395`): `post` (bağımsız mal kabul ve fatura taslağı
kesinleştirme), `void` (mal kabul, fatura, iade, ödeme iptali; bağımsız kabul iptali), `decision` (talep onay/ret),
`restore` (özel alan tanımı ve değer geçmişi geri yükleme), `reverse` (ek maliyet ters kaydı). `approve`, `cancel`,
`close` ve `convert` listede var ama **hiçbir satınalma ucu bunları kullanmaz**. Satınalma siparişinde iptal/kapama ucu
yoktur (sipariş grubu: `:6245-6521`).

**Satır düzeyi görünürlük:**

1. *Liste süzgeci:* `PermissionStatusFilter.ApplyAsync` (`PermissionStatusFilter.cs:8-51`) `*.read` kurallarını SQL
   koşuluna çevirir. Desteklenen satır öznitelikleri `resource.status`, `resource.customerId`, `resource.supplierId` ve
   `resource.ownerUserId`'dir. Bilinmeyen öznitelik ya da seçicisi verilmemiş öznitelik varsa sonuç **boş** döner
   (`:26-31`). TenantAdmin süzülmez (`:14`). Satınalmada kullanıldığı yerler: talep listesi (durum + sahip,
   `Program.cs:5689`), sipariş listesi (durum + tedarikçi, `:6468`), fatura listesi ve asistan ayrıntısı (`:6946, 6969`),
   bağımsız taslaklar (`PurchaseInvoiceDraftEndpoints.cs:24, 45, 75, 96, 114, 294`), tedarikçi irsaliyeleri
   (`PurchaseDeliveryNoteEndpoints.cs:298`), fatura girişi sipariş seçimi (`PurchaseInvoiceEntryEndpoints.cs:23`),
   bağımsız mal kabuller (`StandaloneInventoryDocumentEndpoints.cs:20, 99`).
   **Süzgeçsiz listeler:** sipariş bağlı mal kabul listesi (`Program.cs:6646`), iade listesi
   (`DocumentListEndpoints.cs:48`), teklif listesi (`Program.cs:5796`) ve sözleşme listesi.
2. *Liste isteği yetkilendirmesi:* `GET` ile şu yollar `collectionRowsFiltered=true` alır
   (`PermissionAuthorizationHandler.cs:52-58, 77-93`): `/api/purchasing/standalone-receipts`, `/requests`, `/orders`,
   `/invoices`, `/standalone-invoices`, `/standalone-invoices/suppliers`. Yetkilendirici bu durumda satır öznitelikli bir
   Allow kuralını da yeterli sayar (`PlatformPermissionAuthorizer.cs:59-70`).
3. *`{id}` rotalı istekler (tüm yöntemler):* TenantAdmin dışında `id` rota değeri varsa kaydın öznitelikleri okunur
   (`PermissionAuthorizationHandler.cs:60-71`): talep → durum + sahip (`:110-115`), sipariş → durum + tedarikçi
   (`:116-121`), `erp.purchase-receipts` → **yalnız `StandalonePurchaseReceipts`** (`:134-139`), fatura → önce fatura,
   yoksa taslak (`:140-147`). Sipariş bağlı mal kabul (`/receipts/{id}/void`, `/invoice`), teklif, irsaliye, iade ve
   ödeme kayıtları için öznitelik **çözülmez**. `{quoteId}` ve `{orderId}` rotaları da kapsam dışıdır (bkz. G-P90).
   Cari envanterindeki `CustomerRowVisibilityEndpointFilter` benzeri bir uç nokta süzgeci satınalmada **yoktur**.

**İşleyicide rol denetimi olan satınalma uçları** (izin kataloğuna ek olarak):

| Uç | Kural | Kaynak |
|---|---|---|
| Talepten tedarikçi teklifi ekleme `POST /requests/{id}/supplier-quotes` | yalnız TenantAdmin | `Program.cs:5948` |
| Talep kararı `POST /requests/{id}/decision` | yalnız TenantAdmin; talep sahibi kendi talebine karar veremez (409); bekleyen iş akışı varsa 409 | `:6021, 6028-6039` |
| Talepten sipariş `POST /requests/{id}/order` | yalnız TenantAdmin | `:6051` |
| Bağımsız teklif `POST /supplier-quotes` | yalnız TenantAdmin | `PurchaseSupplierQuoteEndpoints.cs:22` |
| Ek maliyet dağıt / ters kayıt | yalnız TenantAdmin | `Program.cs:6671, 6736` |
| Özel alan tanımı ekle/düzenle (talep, teklif, sipariş, mal kabul) | TenantAdmin **veya TenantDeveloper**; zorunlu bayrağı yalnız TenantAdmin | `:5493-5496, 5517-5520, 5827-5830, 5844-5847, 6194-6197, 6210-6213, 6253-6256` |
| Özel alan tanımı kaldır / geri yükle | yalnız TenantAdmin | `:5544, 5564, 5865, 6229, 6287, 6303` |
| Talep özel alan değeri yaz / geri yükle | talep sahibi **veya** TenantAdmin | `:5601, 5655` |
| Fatura girişi, irsaliye, taslak uçları | yalnız "rol boş değil" | `PurchaseInvoiceEntryEndpoints.cs:17`, `PurchaseDeliveryNoteEndpoints.cs:291`, `PurchaseInvoiceDraftEndpoints.cs:580` |
| Ticari sözleşmeler | okuma TenantAdmin/TenantUser; yazma, `/counterparties`, `/sources` yalnız TenantAdmin | `CommercialContractEndpoints.cs:299-307`, bkz. §1.4 |

Talep oluşturma (`:5716`), sipariş oluşturma (`:6389`), mal kabul (`:6521`), kabul iptali (`:6766`), kabulden fatura
(`:6838`), ödeme (`:7046`), iade (`:7111`) ve iptaller (`:7293, 7334, 7385`) için **rol denetimi yok**. Bunlar yalnız
izin kataloğuyla korunur.

**Onay akışı / iş kuralları:**

- Talep: kayıtta (`Program.cs:5766`) `purchase-request.submitted` tetikleyicisi değerlendirilir
  (`BusinessRuleEndpoints.cs:152-164`;
  tetikleyici `TenantBusinessRuleEngine.cs:17, 24-28`). İş akışına bağlıysa doğrudan karar 409 döner
  (`Program.cs:6037-6039`). İş akışı tamamlanınca talep durumu güncellenir (`WorkflowEndpoints.cs:224-233`). Bağlama
  kuralları `WorkflowEndpoints.cs:343-352, 384-394`'tedir.
- Sipariş: `purchase-order.created` tetikleyicisi (`TenantBusinessRuleEngine.cs:19, 35-39`) siparişi `PendingApproval`
  durumuna alabilir. Ancak bu yalnız **talepten siparişte** çağrılır (`Program.cs:6172-6173`;
  `BusinessRuleEndpoints.cs:186-198`). Doğrudan `POST /api/purchasing/orders` (`Program.cs:6389-6460`) bu kuralı
  **çağırmaz** (bkz. G-P91). İş akışı bağlama kuralları `WorkflowEndpoints.cs:243-251, 361-367, 405-411`'dedir.
- Sayfa düğmesinden başlatılan iş akışı yalnız `subjectType: "General"` gönderir (`custom-page/workflowStart.ts:3-14`).
  Belgeye bağlı (`PurchaseRequest`/`PurchaseOrder`) bir akış sistem sayfasından **başlatılamaz**.
- Tutar bazlı onay limiti yok. Arama sonucu boş (`approvalLimit`/"onay limiti"). Limit, kural koşulu olarak
  `grandTotal` üzerinden kurulabilir (sipariş tetikleyicisi alanları, `TenantBusinessRuleEngine.cs:37-38`).

### 0.6 İdempotency ve eşzamanlılık

`Idempotency-Key` **başlığı** satınalmada hiçbir uçta okunmaz. Başlık yalnız entegrasyon yürütme ve firma hazırlama
uçlarında var (`IntegrationExecutionApiEndpoints.cs:111, 499`, `TenantProvisioningEndpoints.cs:81`). Satınalmada
tekrar deneme güvenliği **gövdedeki** bir GUID ile sağlanır:

| Uç | Gövde anahtarı | Davranış | Kilit / eşzamanlılık |
|---|---|---|---|
| Talep oluştur `POST /requests` | yok | talep kodu benzersiz (409, `:5768`) | özel alan tanımları `UPDLOCK, HOLDLOCK` (`:5723-5724`) |
| Talepten teklif, karar, sipariş | yok | teklif/sipariş kodu benzersiz (`:6007, 6178`) | talep satırı `UPDLOCK, HOLDLOCK` (`:5954, 6034, 6057`) |
| Bağımsız teklif `POST /supplier-quotes` | yok | kod benzersizliği (doğrulanmalı) | tanım kilidi (`PurchaseSupplierQuoteEndpoints.cs:53`) |
| Sipariş oluştur `POST /orders` | yok | kod benzersiz (409, `:6456`) | tanım kilidi (`:6402-6403`) |
| Mal kabul `POST /orders/{id}/receipts` | `requestId` (`PlatformContracts.cs:549`) | aynı `requestId` → var olan kabul (`:6530`), benzersizlik 409 (`:6639`) | dönem kilidi + sipariş, depo, konum `UPDLOCK, HOLDLOCK` (`:6526-6562`) |
| Kabul iptali / fatura iptali / iade iptali / ödeme iptali | yok | durum denetimi | `UPDLOCK, HOLDLOCK` (`:6772-6798` vb.) |
| Kabulden fatura `POST /receipts/{id}/invoice` | yok | fatura numarası benzersiz (409, `:6931`) | sipariş, kabul, cari kilidi (`:6847-6881`) |
| Ödeme `POST /invoices/{id}/payments` | `requestId` (`PlatformContracts.cs:597`) | tekrar → var olan ödeme (`:7056`) | **Serializable** işlem (`:7051`) |
| İade `POST /invoices/{id}/returns` | `requestId` zorunlu (`:7115`) | farklı içerikle aynı anahtar 409 (`:7136-7157`) | kilitli okuma (`:7131-7172`) |
| Bağımsız mal kabul `POST /standalone-receipts` | `requestId` (`StandaloneInventoryDocumentEndpoints.cs:553`) | tekrar oynatma (`:114`) | — |
| Fatura taslağı oluştur | `requestId` (`PurchaseInvoiceDraftEndpoints.cs:780`) | kilitli tekrar oynatma (`:214-215`) | `UPDLOCK, HOLDLOCK` |
| Fatura taslağı güncelle `PUT` | `expectedRowVersion` zorunlu (`:107, 783`) | uyuşmazlık 409 (`:122`) | **tek rowVersion'lı satınalma yazması** |
| Tedarikçi irsaliyesi `POST /delivery-notes/orders/{orderId}` | yok | aynı sipariş + belge no 409 (`PurchaseDeliveryNoteEndpoints.cs:182-184`) | sipariş kilidi (`:166`) |
| Sözleşme oluştur / durum geçişi | `idempotencyKey` (`CommercialContractEndpoints.cs:317-319, 321`) | farklı içerik 409, aynı → tekrar (`:140-146, 200-209`) | `revision` (`:186, 211`) |
| Özel alan değeri PUT (talep, teklif, sipariş) | yok | — | `UPDLOCK, HOLDLOCK` (`:5596-5597, 5882-5883, 6331`) |

Motor tarafında `autoId` girişi (gizli, yeni GUID; açılışta, `resetOnOpen` ile ve başarılı yazmadan sonra yenilenir,
`TenantCustomPageSchema.cs:1241-1245`, `TenantCustomPage.tsx:717-729, 1577`) `requestId`/`idempotencyKey` alanlarına
bağlanabilir. `inventory-transfers.json:124-125, 159` bu kalıbı kullanır.

### 0.7 ERP işlem kataloğu ve belge satırları

- **Modül sabiti** `PurchasingModule = "Satınalma"` (`ErpOperationCatalog.cs:68`). Var olan satınalma işlemleri yalnız
  4 tanedir, hepsi Stok Değerleme standardı için eklendi (`:338-362`):
  `satinalma.malKabul.listele` (sayfalı ama `MetaPaths` yok, `:355-356`), `satinalma.malKabul.ekMaliyetler`,
  `satinalma.malKabul.ekMaliyetDagit` ve `satinalma.malKabul.ekMaliyetTersKayit` (son ikisi `requiresTenantAdmin`).
- **Rapor işlemleri:** her rapor kaynağı `rapor.<kaynak>` olarak eklenir (`:183-191`): `rapor.purchaseRequests`,
  `rapor.purchaseSupplierQuotes`, `rapor.purchaseOrders`, `rapor.purchaseOrderFulfillment`, `rapor.purchaseReceipts`,
  `rapor.purchaseInvoices`, `rapor.supplierReturns`, `rapor.supplierPayments`, `rapor.supplierLedgerEntries`
  (`ReportEndpoints.cs:5958-5966`; `tests/IntegrationTests/ErpOperationCatalog.names.txt`). Bunlar sabit gövdelidir:
  ilk 12 sütun, `pageSize: 100`, süzgeç yok (`ErpOperationCatalog.cs:403-419`). Listelerin yerini **tutmaz**. İrsaliye,
  taslak ve sözleşme için rapor kaynağı yoktur.
- **Katalog kuralları:** adlar kalıcıdır; yalnız eklenir ya da `deprecated` işaretlenir (`:53-58`). Her sütun ve
  parametre kodu için `Labels` (`:72-119`) içinde etiket zorunludur; yoksa `Label()` açılışta hata verir (`:494-495`).
  `requiresTenantAdmin` yalnız sunucuda `allowed`'a katlanır (`:35-39, 566`).
- **Belge satırları (lines[]) bugün bağlanabiliyor (görevdeki varsayım kısmen eski):**
  - `ScalarMembers<T>` yalnız skaler alanları (ve istenirse metin map'lerini) parametre yapar (`:463-476`).
    `BodyParameters<T>` bu yüzden `Lines`'ı **atlar** (`:446-448`).
  - Satır dizisi için ayrı bir `list` parametresi tanımlanır: `ListParameter<T>("lines")` öğe alanlarını `T`'nin
    skaler alanları ve metin map'leri olarak yayınlar (`:450-458`). Örnek: `depo.transfer.olustur`
    (`:395-397`), `stok.hareket.ekle` (`tracking`, `:244-246`), `stok.kart.olustur` (`variants`, `:150-152`).
  - Sayfada `list` parametresi **yalnız** `{{<ızgara>.satirlar}}` biçiminde bağlanır (`TenantCustomPageSchema.cs:445-465`).
    `inventory-transfers.json:128-138, 163` `editableGrid` (`gridMode: "list"`) satırlarını `lines`'a bağlar.
    `inventory-stock-movements.json` ise salt okumadır. Yazma ızgarası ya da `satirlar` bağlaması içermez, lot/seri
    yalnız `trackingText` görüntü sütunudur (`:28, 84-86`). Bu yüzden örnek alınacak standart yalnız transferlerdir. Çalışma
    zamanı koleksiyonu olduğu gibi gövdeye yazar; çözülemeyen koleksiyon anahtarı hiç yazılmaz
    (`custom-page/erpOperations.ts:10, 132-134`). Sunucunun `lines[i].alan` hata anahtarları sayfa anahtarına çevrilir
    (`erpOperations.ts:260-268`).
  - **Sınırlar** (satınalma için kritik):
    1. *Tek düzey:* liste öğesinde iç içe dizi olamaz. `PurchaseReceiptLineWriteRequest.Tracking`
       (`PlatformContracts.cs:547-548`) öğe alanı olarak yayınlanmaz, yani mal kabulde satır başına lot/seri verilemez
       (G-P85). `StandalonePostRequest.Tracking` ise üst düzey bir listedir ve bağlanabilir
       (`StandaloneInventoryDocumentEndpoints.cs:555-556`).
    2. *Kaynaktan doldurup düzenleme yok:* `sourceQuery` yalnız `stage` kipinde geçerlidir
       (`TenantCustomPageSchema.cs:1908-1912`). `stage` kipinde `satirlar` = silinmeyen kaynak satırlar **olduğu gibi** +
       yeni satırlar (`custom-page/gridState.ts:364-377`). Kaynak satırlardaki hücre düzenlemesi gövdeye girmez.
       Talepten sipariş (satır başına fiyat), siparişten mal kabul (sipariş satırı başına miktar), faturadan iade ve
       irsaliye girişi bu biçimi gerektirir (G-P86).
    3. *Hesap yok:* `editableGrid` özellikleri `gridMode, sourceQuery, rowKey, gridColumns, maxRows, minRows, addLabel,
       fixedRowLabel, matrixCode, matrixName, columnOptionsWhen, columnStaticOptions` ile sınırlıdır
       (`TenantCustomPageSchema.cs:1573-1575`). Hesaplanan sütun, satır tutarı ya da toplam yok. Sütun türleri `text,
       number, date, checkbox, lookup`'tır (`GridColumnSpec.cs:21, 47-50`), en çok 12 sütun (`TenantCustomPageSchema.cs:1561`).
       Kapsam yalnız `satirlar/eklenenler/silinenler/…Sayisi/degisti` verir (`gridState.ts:370`). Fatura taslağı ise
       istemcide hesaplanmış satır ve belge toplamları ister; kesinleştirmede tutarlılık denetlenir
       (`PurchaseInvoiceDraftEndpoints.cs:780-787, 324-332`) (G-P87).
- **`allowed` bayrağı:** rota değerleri boş GUID ile ve satır öznitelikleri olmadan çözülür
  (`ErpOperationCatalog.cs:562-590`, `:576`); `collectionRowsFiltered` eklenmez. Talep, sipariş, fatura, taslak ve
  bağımsız kabul listeleri satır süzgeçlidir. Süzgeçsiz dalda öznitelik yoksa kural eşleşmez
  (`PlatformPermissionAuthorizer.cs:72-76, 79-83`), yani okuma kuralı satır öznitelikli bir kullanıcıda `allowed=false` olur ve
  çalışma zamanı sorguyu çalıştırmaz (cari G-C3 ile aynı; bkz. G-P88).
- **Liste meta:** `rowCount` yalnız yanıtta `totalCount` sayısı varsa toplamdır (`erpOperations.ts:237-239`). Satınalma
  listeleri `totalCount` döner (`PlatformContracts.cs:564, 596` vb.); sözleşme listesi `total` döner
  (`CommercialContractEndpoints.cs:120`) (G-P93).

---


---

## Kısım A — Satınalma Talepleri ve Satınalma Teklifleri

Taban: `origin/master` 7bc6deda. Bu bölüm iki ekranı kapsar:
**Satınalma Talepleri** (`sales-requests`) ve **Satınalma Teklifleri** (`sales-purchase-quotes`). Belge yalnız okumaya
dayanır; kod değiştirilmedi.

**Atıf kuralı.** Dosya adı yazılmayan `:N` atıfları şöyle okunur:
- §0, X.1, X.6, §3 (kaybolması kolay) ve §4 (riskler): `frontend/erp-web/src/SalesPage.tsx`.
- X.2, X.3, X.4, X.5: `src/Hosts/AIERP.Api/Program.cs`.
- Diğer dosyalar her zaman adlarıyla yazılır. Kısaltmalar:
  - `PRL` = `purchasing/purchaseRequestList.tsx`
  - `PQL` = `purchasing/purchaseQuoteList.tsx`
  - `PSQP` = `PurchaseSupplierQuotesPage.tsx`
  - `SQ/…` = `purchase-supplier-quotes/components/…`
  - `PPC` = `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs`
  - `PC` = `src/Platform/AIERP.Platform.Application/PlatformContracts.cs`
  - `PAH` = `src/Hosts/AIERP.Api/PermissionAuthorizationHandler.cs`
  - `EOC` = `src/Hosts/AIERP.Api/ErpOperationCatalog.cs`
  - `TCP` = `frontend/erp-web/src/TenantCustomPage.tsx`

**Ad tuzağı.** Sayfa anahtarı `sales-requests` "Satınalma Talepleri"dir; menü etiketi `workspace-navigation.ts:24`'tedir.
Bu ekranın verisi `/api/purchasing/requests`'ten gelir. `/api/sales/requests` (`erp.sales-requests`, `PPC:65`) Satış
Talepleri'dir (`sales-customer-requests`) ve bu belgenin kapsamı dışındadır.

### 0. Ortak yapı

- **Yönlendirme.** `WorkspacePageRouter.tsx:360-363`:
  - `sales-requests` → `SalesRequestsPage` → `<SalesPage section="sales-requests">` (`SalesRequestsPage.tsx:6-7`).
  - `sales-purchase-quotes` → `PurchaseSupplierQuotesScreenPage` → `<SalesPage section="sales-purchase-quotes">`
    (`PurchaseSupplierQuotesScreenPage.tsx:6-7`).
  - `SalesPage` bölümü sekmeye eşler: `requests` / `purchase-quotes` (`:403-424`).
  - Satış başlığı, özet ve süzgeç bu iki sekmede çizilmez (`:2175-2183`).
  - Sekme gövdesi `:2237-2267`:
    - `purchase-quotes` → `PurchaseSupplierQuotesPage` (`onOpenRequests` → `onNavigate("sales-requests")`).
    - `requests` → `PurchasingPanel mode="requests"`. Bu bileşen satınalma siparişleriyle **ortaktır**
      (`:4244-9527`, `requestsOnly` bayrağı `:4275`).
- **SalesPage ön yüklemesi (yalnız talepler).** `load()` talep sekmesinde şunları çeker (`:607-623`):
  - `GET /api/customers/?type=Supplier&status=Active&page=1&pageSize=100` ve aynı çağrının `type=Both` hali. Bunlar
    yalnız **ilk 100'er** kaydı getirir (G-P15).
  - `GET /api/warehouses/`; aktif depolar süzülür.
  - `stockItems` boş bırakılır (`:621`).
- **Oturum kimliği.** Öz-onay denetimi için `PurchasingPanel` belirteçteki `sub`'ı okur (`:4262-4274`). Sistem
  sayfasında karşılığı `{{kullanici.id}}` / `{{kullanici.rol}}`'dür (`TCP:309-323, 1777`).
- **Liste tipi (iki ekranda aynı).**
  - Izgara `SalesDocumentGrid`'dir: işaret sütunu, kullanıcının seçtiği güncel satır (örtük ilk satır yok), çift tık /
    Enter / Aç, toplu "Excel (seçilenler)", altta `SalesListFooter`.
  - Sağ panel kendiliğinden açılır: liste alanı ≥ 1440 px ise (`inventory/components/InventoryStockDetailPanel.tsx:17, 24-36`,
    `PRL:81-84`). Ctrl+. paneli açıp kapar.
  - Arama kutusu Ctrl+F'tir; Yenile F5'tir (`list-page/ListToolbar.tsx:104-114`).
  - Standart kısayollar: Yeni F2, Aç Enter, İşlemler Alt+İ (`commands/shortcuts.ts:6-18`).
- **Durum sözlükleri.**
  - `document-page/documentStatus.ts:68-85`:
    - Talep: `Submitted` = Onay bekliyor (warning), `Approved` = Onaylandı (info), `Rejected` = Reddedildi
      (**danger**), `Ordered` = Siparişe dönüştü (success).
    - Teklif: `Submitted` = Değerlendirmede, `Selected` = Seçildi, `NotSelected` = Seçilmedi.
  - Liste tonları ayrıdır:
    - Talep: warn / info / ok / **off** (`PRL:26-37`).
    - Teklif: warn / ok / off (`PQL:18-23`).
- **Sunucu enum'ları.** `PurchaseRequestStatus {Submitted=1, Approved=2, Rejected=3, Ordered=4}` ve
  `PurchaseSupplierQuoteStatus {Submitted=1, Selected=2, NotSelected=3}` (`src/Platform/AIERP.Platform.Domain/Entities.cs:1445-1446`).

---

### 1. Satınalma Talepleri (`sales-requests`)

#### 1.1 Yerleşim

- **Başlık.** "Satınalma talepleri" (küçük t; menüde "Satınalma Talepleri"). Açıklama: "İhtiyaçları kaydedin, onayları
  ve tedarikçi tekliflerini takip edin." Sayaç `requestStatusCounts.all`'dur; sayılar yoksa ve durum süzgeci boşsa
  `requestTotal` gösterilir. Sayaç etiketi "talep"tir (`:7421-7435`).
- **Özet kartları** (`PRL:90-111`, `:7436-7444`). Kartlar **tıklanınca süzer**; aynı karta tekrar tıklamak süzgeci
  kaldırır (`filterActive`, `onFilter`).

| Kart | Değer | İpucu | Ton / simge |
|---|---|---|---|
| Onay bekliyor | `Submitted` sayısı | "tüm talepler" / aramadaysa "aramayla eşleşen" | warn, saat |
| Onaylandı | `Approved` sayısı | aynı | —, onay |
| Siparişe dönüştü | `Ordered` sayısı | aynı | ok, sepet |
| Reddedildi | `Rejected` sayısı | aynı | —, çarpı |

  Sayılar beş ayrı `GET /api/purchasing/requests/?page=1&pageSize=1[&search][&status]` çağrısının `totalCount`'udur
  (`""`, Submitted, Approved, Ordered, Rejected; `:4822-4848`). Arama uygulanır, etkin durum çipi uygulanmaz. Sayılar
  her liste yüklemesinden sonra yeniden kurulur (`requestCountsVersion`, `:4580`). Hata olursa sayılar `null` olur ve
  kartta "—" görünür.
- **Uyarı / bildirim şeritleri.** Hata ve bildirim şeridi vardır; ikisi de kapatılabilir (`:7496-7511`). Bildirim
  örnekleri: "ST-… satın alma talebi onaya gönderildi.", "… talebi onaylandı/reddedildi.", "… siparişi … talebinden
  oluşturuldu.", "… için … teklifi kaydedildi." (`:5796, 5824, 5914, 5985`).
- **İşlem çubuğu, liste görünümünde** (`:7318-7345`). Komutlar, `purchaseTarget` adlı hedefe uygulanır. Bu hedef seçili
  satırdır; yoksa tek işaretli satırdır (`:7260-7262`).

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | `beginRequestCreate()`: talep penceresini açar (`:5340-5349`). Alanlar penceresi, talep penceresi ya da faturalama açıkken kaldırılır (`:7365`). |
| Aç | Enter | Odaklı ızgara satırı, yoksa hedef. İkisi de yoksa "Önce bir kayıt seçin". `openRequest(id)` çağrılır. |
| İşlemler → Onayla / Reddet | Alt+İ | `canDecideRequest` gerekir: TenantAdmin **ve** `Submitted` **ve** `requestedByUserId ≠ oturum`. `decideFromList` talebi açar, karar bölümüne kaydırır ve "Onayla"da onay düğmesine, "Reddet"te nota odaklanır (`:6490-6491, 6518-6532`). |
| İşlemler → Teklif ekle | | TenantAdmin ve `Approved`. Talebi açar, teklif formunu başlatır ve "Tedarikçi teklifleri" bölümüne odaklanır (`:6502-6507`). |
| İşlemler → Siparişe dönüştür | | TenantAdmin, `Approved` ve `purchaseOrderId` yok. Talebi açar ve dönüştürme formunu başlatır (`:6508-6513`). |
| İşlemler → Siparişi aç | | `Ordered` ve `purchaseOrderId` var. `openLinkedPurchaseOrder`: sessionStorage `createdPurchaseOrderStorageKey {id, code, intent:"open"}` yazar, `nexora:purchase-orders-changed` olayını yayar ve `sales-purchasing`'e gider (`:6493-6501`). |
| İşlemler → Alanlar | | TenantAdmin veya TenantDeveloper (`canManagePurchaseFields`, `:6621`). Alanlar penceresini açar. |
| İşlemler → CSV olarak dışa aktar | | Izgaranın kendi dışa aktarımıdır (`commands/gridCommands.ts:15-17`); görünen sayfayı aktarır. **Doğrulanmalı.** |

  Satır menüsü "⋯" (`:4977-5013`): İncele (= Aç), Onayla, Reddet, Teklif ekle, Siparişe dönüştür, Siparişi aç.
  Koşullar işlem çubuğundakiyle aynıdır.
- **İşlem çubuğu, belge açıkken** (`requestDetail`, `:7284-7317`):
  - `documentOpenCommands`: Yenile talebi yeniden okur; Süz ve Dışa aktar "Belge açıkken kullanılamaz" ile pasiftir
    (`commands/PageCommandsSlot.tsx:20-27`).
  - Yeni birincil değildir; talep penceresini açar.
  - İşlemler: Onayla / Reddet / Teklif ekle / Siparişe dönüştür / Siparişi aç, aynı koşullarla. `busy` sırasında
    "Kaydediliyor…" nedeniyle pasiftir.
- **Süzgeç çubuğu** (`:7445-7468`):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama: "Satın alma taleplerinde ara", yer tutucu "Talep no, açıklama veya talep sahibi" | metin, sunucu | `search`. Panel durumu değişince **250 ms** gecikmeyle `load(1)` çalışır (`:4640-4645`). `ListToolbar`'a `onSearchApply` verilmez. Sunucu `Code`/`Description` içinde ve talep sahibinin `DisplayName`'inde `Contains` arar (`Program.cs:5692-5698`). En çok 120 karakter (`Program.cs:5680`). |
| Durum çipleri | çip, sunucu | `status`: Tümü / Onay bekliyor / Onaylandı / Siparişe dönüştü / Reddedildi, sayaçlı (`:7454-7464`). Bilinmeyen değer 400 döner (`Program.cs:5681-5686`). |
| Yenile | | `load()` (`:7451`) |
| Detay paneli anahtarı | | `SalesListPanelToggle`, Ctrl+. (`:7466`) |

- **Liste sütunları.**
  - İstemci varsayılanı `:4313-4340`'tadır. Kiracı görünümü `purchase-requests`'tir. Sunucu kataloğu farklıdır
    (`src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs:141-144`); bkz. G-P18.
  - Hücreler `:4905-5017`'dedir. Genişlikler `PRL:50-59`'dadır.

| Alan anahtarı | Etiket (istemci) | Gösterim |
|---|---|---|
| `code` | Talep | Mono bağlantı (`erp-link-button`); tıklanınca seçer ve açar. Altında, ilgili sütun gizliyse "açıklama · N kalem" yazar (`:4908-4937`). |
| `requestedByName` | Talep sahibi | metin, boşsa — |
| `neededByDate` | İhtiyaç | tarih. Altında, `Submitted`/`Approved` durumlarında "N gün", "bugün" ya da kırmızı "N gün geçti" (`:4885-4891, 4944-4955`). |
| `quotes` | Teklif | Yalnız `Approved`/`Ordered`. Değer "N · en iyi 1.200,00 TRY" ya da "N teklif"; yüklenirken "…", hata ya da 0 ise — (`:4956-4970`). **Sunucu kataloğunda yok.** |
| `status` | Durum | `PurchaseRequestTag` (warn/info/ok/off) |
| `description` | Açıklama (gizli) | `title` ipuçlu metin |
| `requestDate` | Talep tarihi (gizli) | gg.aa.yyyy |
| `lineCount` | Kalem (gizli) | sağa dayalı sayı (`PRL:56`) |
| `purchaseOrderCode` | Bağlı sipariş (gizli) | mono, boşsa — |
| `actions` | İşlemler | Sabit, sağa iğneli, 64 px. Görünümde iğnesizse sağa iğnelenir (`:4865-4883`). |

- **"Teklif" sütununun yüklenmesi** (`:6431-6466`):
  - Sütun görünüyorsa sayfadaki her `Approved`/`Ordered` talep için, görünmüyorsa yalnız seçili satır için
    `GET /api/purchasing/requests/{id}/supplier-quotes` çağrılır.
  - Çağrılar beşerli gruplar halinde yapılır. Sonuçlar `requestQuoteCache`'e yazılır; bu önbellek her liste
    yüklemesinde temizlenir (`:4578`).
  - "En iyi" teklif, `comparableGrandTotal`'ı en küçük olandır (`:6472-6481`).
- **Izgara.** İşaret sütunu vardır; tek tık güncel satırı seçer (`purchaseGridSelection`, `:7406-7415`). Çift tık ve
  Enter açar; işaret hücresine çift tık açmaz (test `purchasing/purchaseRequests.test.tsx:257-283`). Toplu eylem
  "Excel (seçilenler)" yalnız liste görünürken vardır (`:7411-7413`).
- **Boş durumlar** (`:7521-7529`): "Satınalma talepleri yükleniyor…". Durum `Approved` ise "Onaylanmış satın alma
  talebi yok."; arama ya da durum varsa "Filtrelerle eşleşen satın alma talebi yok."; aksi halde "Henüz satın alma
  talebi yok."
- **Alt bilgi** (`:7535-7545`): işaretli sayısı, gösterilen / toplam, sunucu sayfalama (**25**, `purchasePageSize`
  `:4544`). Sayfa değişince `load(next)` çalışır.
- **Seçim kuralı.**
  - Yeniden yüklemede seçili satır yeni sayfada varsa korunur, yoksa seçim kalkar (`:4584-4587`).
  - Karar verildikten sonra o talep seçili kalır (`:5826`).
  - Bir talep için yazılan karar notu, seçim başka talebe geçince sıfırlanır (`:6482-6489`).
- **Detay paneli** (`PRL:166-286`). Panel açıkken ve liste görünürken çizilir (`purchaseListActive`, `:7255-7257,
  7367-7390`).
  - Seçim yoksa "Özetini görmek için listeden bir talep seçin." (`PRL:289-291`).
  - Üst kısım: kod, talep sahibi, durum etiketi, "Aç" (Enter), kapat.
  - Sekmeler: "Özet"; teklifi olabilecek durumlarda ayrıca "Teklifler" (`PRL:167-169`).
  - **Özet:**
    - Talep tarihi; İhtiyaç (tarih ve gün ipucu); Kalem; varsa Açıklama.
    - `Submitted` değilse Onaylayan / Reddeden; varsa Not.
    - `Ordered` ise Sipariş bağlantısı (`PRL:215-253`).
    - Zincir "Bu talep → Satınalma siparişi" (`PRL:254-259`).
    - "Teklifler" bölümü: "N teklif · en iyi X" (`PRL:260-280`).
    - **Satır içi karar denetimleri** (`decision`, `:7370-7378`).
  - **Teklifler sekmesi:** satır başına tedarikçi, en iyisinde kupa simgesi, `kod · durum` ve tutar. Tutar,
    kıyaslanabiliyorsa baz para biriminde, değilse teklif dövizindedir (`PRL:187-212`).
- **Karar denetimi** (`renderDecisionControls`, `:6549-6620`). Yalnız TenantAdmin ve `Submitted` için çizilir.
  - Talep sahibi kendisiyse: "Kendi talebinizi onaylayamaz veya reddedemezsiniz; kararı başka bir yetkili verir."
    (`:6552-6556`).
  - "Karar notu" metin kutusu: 2 satır, **maxLength 500**; yer tutucu "Onaylarken isteğe bağlı, reddederken zorunlu".
  - Reddet / Onayla iki adımlıdır: önce "Bu talep onaylansın mı? / reddedilsin mi?" sorulur, ardından "Vazgeç" ve
    "Evet, onayla" / "Evet, reddet" düğmeleri gelir.
  - Not boşken Reddet'e basılırsa "Ret gerekçesi zorunludur." hatası çıkar (`role=alert`, `aria-invalid`;
    `:6540-6547, 5810-5814`).
- **Pencereler / formlar.**
  - *Satın alma talebi* (`:8230-8492`). `RecordFormPage variant="dialog"`, kayıt düğmesi "Onaya gönder". Durum satırında
    "Talep TenantAdmin onayına gönderilir; talep sahibi kendi talebini karara bağlayamaz." ve "Kalem: N" yazar. Arka
    plana tıklamak, meşgul değilse pencereyi kapatır.
    - **Talep Kimliği:**
      - Talep no * (maxLength 40, mono, yer tutucu "ST-2026-0001"; istemcide **zorunlu**).
      - Talep tarihi * (varsayılan bugün).
      - İhtiyaç tarihi (isteğe bağlı, `min=talep tarihi`).
      - Talep açıklaması * (textarea, ≤ 1000, yer tutucu "Satın alma gerekçesi") (`:8258-8303`).
    - **Talep Özel Alanları:** tanım başına bir giriş. Tür Boolean ise Evet/Hayır seçimi, Decimal ise sayı, Date ise
      tarih, aksi halde metin (≤ tanımdaki `maxLength`). Zorunlu alanda "*" vardır. Tanım yoksa "Firma yöneticisi henüz
      özel alan tanımlamadı." (`:8304-8366`).
    - **İstenen Stok Kalemleri:**
      - Açıklama: "İstenen miktar seçilen birim üzerinden temel birime çevrilir."
      - "Kalem ekle" en çok 100 kaleme kadar çalışır (`:8376`). Birden fazla kalem varken her kalemde "Kaldır" çıkar.
      - Kalem başına: Stok kartı (`AsyncStockItemPicker`), Birim (stok kartının temel birimi + `GET
        /api/stock/items/{id}/units` sonucundaki aktif dönüşümler, "KOD (×katsayı)"), Miktar (min 0.0001, adım 0.0001)
        (`:8367-8488`, birimler `:5325-5339`).
    - Gövde `:5764-5803`. `unitCode` boşsa stok kartının birimi gönderilir. Başarıda form temizlenir ve `load(1)`
      çalışır.
  - *Talep belgesi* (`DocumentSurface variant="detail"`, `:8493-9455`). Belge açıkken liste görünmez.
    - **Üst kısım:** "Satınalma talebi", kod, alt başlık talep sahibi, durum rozeti, meta talep tarihi.
    - **Durum akışı:** `PurchaseRequestFlow` (Onay bekliyor → Onaylandı → Siparişe dönüştü; Reddedildi akış dışı son
      durum; `PRL:41-44`). İpuçları "Alt+İ işlemler" (`sales/salesDocumentDetail.tsx:172`). Alt bilgide kalem sayısı
      vardır.
    - **Yan "Belge zinciri":** Bu talep, her tedarikçi teklifi (belge durumuyla), Satınalma siparişi (açılabilir)
      (`:8504-8530`).
    - **Üst bilgi ızgarası:** Talep tarihi; İhtiyaç tarihi ("İhtiyaç tarihi belirtilmedi"); Talep sahibi; karar
      verilmişse Onaylayan / Reddeden, verilmemişse Kalem.
    - **Satırlar:** #, Stok (kod ve ad), Miktar (birimle). Notlarda Açıklama ve varsa Karar notu vardır.
    - **Talep kararı:** TenantAdmin ve `Submitted` (`:8601-8605`).
    - **Siparişe dönüştüyse:** "Bu talep **SİP-…** siparişine dönüştürüldü." (`:8606-8612`).
    - **Tedarikçi teklifleri** (`:8613-8990`). Teklif varsa ya da talep `Approved` ise görünür. Bölüm sayaçlıdır;
      açıklaması "Tutarlar teklif tarihindeki kurla tenant baz para birimine çevrilir; kur yoksa kıyaslanamaz." Bölüm
      eylemi "Teklif kaydet"tir (TenantAdmin, `Approved`, form kapalı).
      - Tablo sütunları:
        - Tedarikçi: dolu özel alanlar "Etiket: değer" ve "Kalem fiyatlarını incele" açılır düğmesi.
        - Teklif no, Teklif tarihi, Geçerlilik ("Geçerlilik tarihi yok").
        - Genel toplam: teklif dövizinde.
        - Kıyas: baz tutar ve kur tarihi, ya da "Baz para birimine çevrilemedi".
        - Durum: `supplierQuoteDocumentStatus`, yani Seçildi / Seçilmedi / **Süresi doldu** / **Değerlendiriliyor**
          (`PRL:65-73`).
        - "Bu teklifle sipariş": TenantAdmin, talep `Approved`, teklif `Submitted` ve süresi dolmamış (`:8689-8704`).
      - Açılır alt tablo: Kalem, Miktar, Birim fiyat, KDV, Toplam (`:8708-8742`).
      - Boşsa "Henüz tedarikçi teklifi kaydedilmedi."
      - Sıralama sunucudadır: kıyaslanabilirler önce, sonra tutar, sonra oluşturma (`Program.cs:5942`).
    - **Teklif kayıt formu** (`:8752-8988`, gövde `:5945-5991`):
      - Tedarikçi teklif no * (≤ 64, yer tutucu "TKL-2026-001").
      - Tedarikçi * (`SearchableRecordPicker`: aktif `Supplier`/`Both`, `kod · ad`, açıklama döviz; `:6423-6425`).
      - Teklif tarihi *; Geçerlilik sonu (`min=teklif tarihi`).
      - Talep satırı başına fiyat tablosu: Stok, Miktar (salt okunur), Birim fiyat * (≥ 0, adım 0.0001), İskonto % *
        (0–100), KDV % * (0–100, varsayılan 20).
      - Teklif özel alanları; Teklif notu (≤ 1000).
      - Düğmeler: "Vazgeç" / "Teklifi kaydet".
      - Başarıda teklifler yeniden okunur, çünkü POST yanıtında kıyas yoktur (`:5978-5985`).
    - **Talebi siparişe dönüştür** (`:8991-9275`, gövde `:5875-5923`). TenantAdmin, `Approved` ve sipariş yoksa
      görünür. Bölüm eylemi "Sipariş oluştur"dur; açıklaması "Tedarikçi seçin ve talep miktarları için birim fiyatları
      girin."
      - Sipariş no * (≤ 40, yer tutucu "ST-SIP-2026-0001").
      - Tedarikçi *: tekliften gelindiyse **kilitli** (`disabled`).
      - Sipariş tarihi *.
      - Beklenen teslim tarihi: **salt okunur**, talebin ihtiyaç tarihi (`:9055-9061`).
      - Hedef depo: isteğe bağlı, aktif depolar, "Belirtilmedi".
      - Satır fiyat tablosu: tekliften gelindiyse fiyatlar teklif fiyatlarıyla dolar ve **kilitlenir**
        (`:9113, 9137, 9161`); aksi halde 0 / 0 / 20 ile başlar (`:5836-5874`).
      - Sipariş özel alanları: aynı kodlu talep değeriyle büyük/küçük harf duyarsız ön doldurulur ("talep değeri varsa
        aktarılır").
      - Not: tekliften gelindiyse "Tedarikçi teklifi TKL-…" ile başlar.
      - Alt bilgi "Talep miktarları siparişe aynen aktarılır; tutarlar sunucuda hesaplanır." Düğmeler "Vazgeç" /
        "Siparişi oluştur".
      - Başarıda talep belgesi kapanır, liste yenilenir ve **oluşan sipariş belgesi aynı panelde açılır**
        (`openOrder`, `:5916-5917`). O belgenin mal kabul ve fatura işlemleri bu envanterin kapsamı dışındadır.
    - **Talep özel alanları** (`:9276-9452`):
      - `Submitted` iken düzenlenebilir form vardır: "Alanları kaydet", alt bilgi "Onay sonrası alanlar
        değiştirilemez.".
      - Diğer durumlarda salt okunur liste gösterilir.
      - Her alanda "Değer geçmişi" vardır: son 50 kayıt, "eski → yeni", tanım sürümü ve zaman. `Submitted` iken
        "Önceki değeri geri yükle" de vardır; onay sorar (`:5699-5744`).
    - Alt not: "Onay, sipariş ve finans kaydı birbirinden ayrı adımlardır." (`:9454`).
  - *Alanlar* (`:7592-7655`). TenantAdmin veya TenantDeveloper için açılır. Sekmeler: "Talep alanları (N)" ve "Teklif
    alanları (N)".
    - Talep alanları (`:6622-6822`):
      - Tanım listesi: etiket · kod, tür, uzunluk, sürüm, zorunlu.
      - "Düzenle": ardışık sorular sorar; etiket, metin için 1–500 uzunluk, zorunluluk yalnız TenantAdmin'e sorulur
        (`:5561-5620`).
      - "Sürüm geçmişi" ve "Bu sürümü geri yükle" (TenantAdmin).
      - "Devre dışı bırak" (TenantAdmin, onaylı).
      - Ekleme formu: Alan kodu (büyük harf, ≤ 40, yer tutucu "PROJE_KODU"), Ekran etiketi (≤ 120), Veri türü (Metin /
        Ondalık sayı / Tarih / Evet-Hayır), En fazla karakter (1–500), "Yeni taleplerde zorunlu olsun" (yalnız
        TenantAdmin).
    - Teklif alanları (`:6823-6951`, işleyiciler `:5992-6113`): aynı yapıdadır, ancak sürüm geçmişi ve geri yükleme
      düğmesi yoktur.
    - Ortak onay / istem pencereleri `confirmDialog` / `promptDialog` ile açılır.
- **Durum akışı.**
  - Talep: `Submitted` (oluşturulunca) → `Approved` ya da `Rejected` (karar) → `Ordered` (dönüştürme). `Rejected` ve
    `Ordered` son durumlardır.
  - Talep için düzenleme, iptal, silme ya da yeniden gönderme **yoktur**. İstemcide de sunucuda da uç noktası yoktur.
  - Teklif: `Submitted` → (talep dönüştürülünce) seçilen teklif `Selected`, diğerleri `NotSelected` olur.

#### 1.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, arama/durum değişimi, sayfa, Yenile, her yazmadan sonra | `GET /api/purchasing/requests/` | `page`, `pageSize=25`, `search?`, `status?` | `erp.purchase-requests.read` (satır süzgeçli) | `:5673-5715`. `pageSize` 1–100'e kırpılır. Sıralama `CreatedAt desc`. Yanıt `PurchaseRequestPage{items, page, pageSize, totalCount}`. Öğe `PurchaseRequestSummary` (`PC:515-518`). Satır süzgeci `PermissionStatusFilter` (`resource.status`, `resource.ownerUserId`, `:5689`; `src/Hosts/AIERP.Api/PermissionStatusFilter.cs:8-48`). Koleksiyon `collectionRowsFiltered`'dir (`PAH:76-92`). |
| Her liste yüklemesinden sonra | `GET /api/purchasing/requests/?page=1&pageSize=1…` ×5 | `search?` + `status` | aynı | Sayaçlar (`SalesPage.tsx:4822-4848`); hata sessizdir. |
| Her liste yüklemesinde | `GET /api/purchasing/requests/custom-fields` | — | `erp.purchase-requests.read` | `:5483-5489`. Aktif tanımlar, etikete göre. İstemcide hata olursa atlanır (`SalesPage.tsx:4563-4575`). |
| Her liste yüklemesinde, yalnız TenantAdmin/Developer | `GET /api/purchasing/orders/custom-fields`, `GET /api/purchasing/supplier-quotes/custom-fields` | — | `erp.purchase-orders.read`, `erp.supplier-quotes.read` | Dönüştürme ve teklif formları ile Alanlar penceresi içindir (`SalesPage.tsx:4562-4573`). TenantUser'da çağrılmaz. |
| Açılış (SalesPage) | `GET /api/customers/?type=Supplier\|Both&status=Active&page=1&pageSize=100`, `GET /api/warehouses/` | — | `erp.customers.read`, `erp.warehouses.read` | `SalesPage.tsx:607-623` (G-P15) |
| Açılış | `GET /api/screen-views/purchase-requests/active` | — | `erp.screen-views.read` | Yalnız `view.id` doluysa (yayımlanmış kiracı görünümü) uygulanır; hata sessizdir (`SalesPage.tsx:4806-4821`). |
| "Teklif" sütunu / seçili satır / belge açılışı | `GET /api/purchasing/requests/{id}/supplier-quotes` | — | `erp.purchase-requests.read` (id öznitelikli) | `:5912-5944`. `PurchaseSupplierQuoteView[]`: satırlar, özel alanlar, `baseCurrencyCode`, `comparableGrandTotal`, `appliedExchangeRate`, `appliedRateDate`. Kur, teklif tarihinde ya da öncesindeki en son tarihin en yüksek revizyonudur. |
| Aç / İncele / kod bağlantısı / hand-off | `GET /api/purchasing/requests/{id}` | — | `erp.purchase-requests.read` (TenantAdmin dışında `resource.status` + `resource.ownerUserId` eklenir, `PAH:56-70, 110-115`) | `:5775-5794`. `PurchaseRequestView`: satırlar (`lineNumber`, `stockItemId`, `stockCode`, `stockName`, `unitCode`, `quantity`), `purchaseOrderId/Code`, `customFields` (`PC:519-523`). |
| Kalem stoku seçilince | `GET /api/stock/items/{id}/units` | — | `erp.stock-items.read` | `SalesPage.tsx:5325-5339`. Birim seçenekleri. |
| Stok seçici araması | `AsyncStockItemPicker` → `GET /api/stock/items/?…` | `q`, sayfa | `erp.stock-items.read` | Uç noktanın ayrıntısı **doğrulanmalı** (bileşen okunmadı). |
| Onaya gönder | `POST /api/purchasing/requests/` | `{code, requestDate, neededByDate, description, lines[{stockItemId, quantity, unitCode}], customFields{kod: değer}}` | `erp.purchase-requests.create` | `:5716-5774`. Yanıt 201 `PurchaseRequestSummary`. |
| Onayla / Reddet (son adım) | `POST /api/purchasing/requests/{id}/decision` | `{approved, note}` | `erp.purchase-requests.execute` (`decision` yürütme kuyruğundadır, `PPC:387-398`) + **işleyicide TenantAdmin** | `:6018-6047`. Yanıt `{id, code, status, reviewNote, reviewedAt}`. |
| Teklifi kaydet | `POST /api/purchasing/requests/{id}/supplier-quotes` | `{code, supplierId, quoteDate, validUntil, notes, customFields, lines[{requestLineNumber, unitPrice, discountPercent, vatPercent}]}` | `erp.purchase-requests.create`. Son bölüm `supplier-quotes` yürütme kuyruğunda olmadığı için **create** olur; **`erp.supplier-quotes` değildir.** İşleyicide TenantAdmin. | `:5945-6017`. 201 `PurchaseSupplierQuoteView`, ancak kıyas alanları boştur. |
| Siparişi oluştur | `POST /api/purchasing/requests/{id}/order` | `{code, supplierId, orderDate, expectedReceiptDate, targetWarehouseId, notes, supplierQuoteId, customFields, lines[{lineNumber, unitPrice, discountPercent, vatPercent}]}` | `erp.purchase-requests.create` (`order` kuyrukta değildir, yalnız `convert-to-order` vardır) + işleyicide TenantAdmin | `:6048-6241`. 201 `PurchaseOrderSummary`. Ardından istemci `GET /api/purchasing/orders/{id}` çağırır (`SalesPage.tsx:5240-5258`). |
| Alanları kaydet | `PUT /api/purchasing/requests/{id}/custom-fields` | `{values{kod: değer}}` | `erp.purchase-requests.update` + işleyicide **talep sahibi veya TenantAdmin** | `:5592-5634`. ≤ 40 değer. Map'te olmayan tanım **silinir**. Zorunlu alan denetimi yapılır. Yanıt `PurchaseRequestCustomFieldValueView[]`. |
| Değer geçmişi / geri yükle | `GET …/{id}/custom-fields/{definitionId}/history`; `POST …/history/{revisionId}/restore` `{confirmation:true}` | | `read` / `execute` (`restore`) + sahip veya TenantAdmin | `:5635-5672`. Son 50 kayıt. Geri yükleme yeni revizyon yazar. |
| Tanım ekle / düzenle / devre dışı / geçmiş / geri yükle | `POST`/`PUT`/`DELETE /api/purchasing/requests/custom-fields[/{definitionId}]`, `…/history`, `…/restore` `{version, confirmation:true}` | | `create` / `update` / `delete` / `read` / `execute` | `:5490-5583`. Rol denetimleri 1.4'tedir. |
| Teklif alan tanımı ekle / düzenle / devre dışı | `POST`/`PUT`/`DELETE /api/purchasing/supplier-quotes/custom-fields[/{definitionId}]` | | `erp.supplier-quotes.create/update/delete` | `:5825-5871` |
| Siparişi aç | — (navigasyon) | sessionStorage + olay | — | `SalesPage.tsx:6493-6501` |

#### 1.3 Kurallar

- **Talep oluşturma doğrulamaları** (`PC:1151-1180`, işleyici `:5716-5774`):
  - Kod ≤ 40. Kod **boşsa sunucu belge numaralamasıyla üretir** (`TenantDocumentNumbering "PurchaseRequest"`); doluysa
    büyük harfe çevirir (`:5745`). İstemci kodu zorunlu kılar.
  - Talep tarihi zorunludur. İhtiyaç tarihi talep tarihinden önce olamaz.
  - Açıklama zorunludur ve ≤ 1000 karakterdir.
  - Kalem sayısı 1–100'dür. Aynı stok kartı **bir kez** bulunabilir. Miktar > 0, en çok 4 ondalık.
  - Stok kartları var ve aktif olmalıdır (409).
  - Birim stokta etkin olmalıdır. Miktar **temel birime çevrilerek** saklanır ve satıra stok kartının temel birimi
    yazılır. Çevrilen miktar pozitif ve en çok 4 ondalık olmalıdır; taşma 400 döner (`:5732-5743, 5749-5756`).
  - Özel alanlar `TryNormalizePurchaseRequestFields` ile doğrulanır; tür, sınır ve zorunluluk denetlenir. Her değer
    için ilk revizyon yazılır.
  - Aynı kod 409 "Bu talep numarası bu firmada zaten kullanılıyor." döner.
  - Kayıttan önce iş kuralları değerlendirilir: `BusinessRuleEndpoints.ApplyPurchaseRequestRulesAsync`, tetikleyici
    `PurchaseRequestSubmitted`. Bu değerlendirme bir **iş akışı örneği** başlatabilir
    (`src/Hosts/AIERP.Api/BusinessRuleEndpoints.cs:152-165`).
- **Karar** (`:6018-6047`, `PC:1182-1188`):
  - Yalnız TenantAdmin karar verebilir; diğer roller 403 alır.
  - Not ≤ **1000** karakterdir; istemci 500'e sınırlar. Ret için not zorunludur.
  - **Öz-onay engeli:** talebi açan kişi karar veremez (409).
  - Yalnız `Submitted` talep karara bağlanabilir (409).
  - Talep için `Pending` iş akışı örneği varsa 409 "Bu talep için iş akışı onayı bekleniyor. Kararı İş Akışları
    ekranından verin." döner. İstemcide bunun **ön denetimi yoktur**; hata şeritte görünür.
  - Karar `ReviewedByUserId`, `ReviewedAt` ve `ReviewNote`'u yazar. Talep satırı `UPDLOCK, HOLDLOCK` ile kilitlenir.
- **Teklif (talepli)** (`:5945-6017`, `PC:1223-1250`):
  - Yalnız TenantAdmin teklif kaydedebilir.
  - Kod ≤ 64 ve zorunludur. Tedarikçi zorunludur. Geçerlilik tarihi teklif tarihinden önce olamaz. Not ≤ 1000.
  - Satır sayısı 1–100'dür ve her talep satırı için **tam bir** fiyat girilmelidir. Fiyat 0–99999999999999.9999 (en
    çok 4 ondalık); iskonto ve KDV 0–100 (en çok 2 ondalık).
  - Yalnız `Approved` talebe teklif kaydedilebilir (409).
  - Tedarikçi aktif olmalı ve türü `Supplier`/`Both` olmalıdır (409).
  - Teklif dövizi **tedarikçi kartının dövizidir**; formda seçilmez.
  - Toplamlar sunucuda hesaplanır (`SalesQuoteValidation`).
  - Aynı tedarikçi için aynı kod 409 döner. Özel alanlarda zorunluluk denetlenir.
- **Siparişe dönüştürme** (`:6048-6241`, `PC:1191-1221`):
  - Yalnız TenantAdmin ve yalnız `Approved` talep dönüştürülebilir.
  - Teklif seçildiyse:
    - Teklif bu talebe ait ve `Submitted` olmalı; tedarikçisi istekle aynı olmalıdır.
    - Geçerliliği **UTC bugüne göre** dolmamış olmalıdır.
    - Tedarikçi dövizi teklif kaydından sonra değişmemiş olmalıdır.
    - Satır fiyatları teklif fiyatlarıyla **birebir aynı** olmalıdır (409).
  - Her talep satırı fiyatlanmalıdır. Stoklar aktif olmalıdır.
  - Beklenen teslim tarihi sipariş tarihinden önce olamaz; boşsa talebin ihtiyaç tarihi kullanılır.
  - Hedef depo aktif olmalıdır.
  - Sipariş özel alanlarının değeri öncelik sırasıyla şu kaynaklardan gelir: **teklif değeri**, formda girilen değer,
    talep değeri (koda göre, büyük/küçük harf duyarsız; `:6114-6117`).
  - Sonuçlar:
    - Talep `Ordered` olur.
    - Seçilen teklif `Selected`, talebin diğer `Submitted` teklifleri `NotSelected` olur. Teklifsiz dönüştürmede
      **tüm** `Submitted` teklifler `NotSelected` olur.
    - Sipariş iş kuralı tetiklenirse sipariş `PendingApproval` ile başlar (`:6172-6173`).
  - Benzersizlik ihlali 409 "Talep zaten siparişe dönüştürülmüş veya sipariş numarası bu firmada kullanılıyor." döner.
- **Özel alan değerleri.** Yalnız `Submitted` talepte değiştirilebilir (409). Değiştirebilen kişi talep sahibi veya
  TenantAdmin'dir; diğerleri 403 alır. İstemci formu rol denetimi yapmadan gösterir (`SalesPage.tsx:9283-9370`). Geri
  yüklenen değer güncel tanıma uymalı ve zorunlu alanı boşaltmamalıdır.
- **Satır görünürlüğü.** TenantAdmin dışındaki kullanıcıda liste `resource.status` ve `resource.ownerUserId`
  kurallarıyla süzülür; tek kayıt ve alt yollar `{id}` öznitelikleriyle denetlenir. "Talep sahibi"ne göre arama,
  platform kullanıcılarının adından id listesi çıkarır (`:5694-5697`).
- **rowVersion / idempotency yok.** Talep, teklif ve dönüştürme gövdelerinde `rowVersion` da istek anahtarı da yoktur.
  Eşzamanlılık `UPDLOCK, HOLDLOCK` ve durum denetimiyle sağlanır. Yeniden denemenin korunması yalnız benzersiz kodlara
  dayanır: talep kodu, tedarikçi başına teklif kodu, sipariş kodu ve talep başına tek sipariş.
  `PurchasingPanel`'deki `requestId` UUID'si mal kabule aittir (`SalesPage.tsx:4530`).
- **Denetim kaydı eylemleri:**
  - Talep: `purchase-request.submitted`, `.approved`, `.rejected`, `.ordered` (`:5765, 6043-6044, 6176`).
  - Teklif: `purchase-supplier-quote.created`, `.selected`, `.not-selected`.
  - Sipariş: `purchase-order.created-from-request`.
  - Özel alanlar: `purchase-request-custom-field.created`, `.updated`, `.deactivated`, `.restored`, `.values-updated`,
    `.value-restored`; ayrıca `purchase-supplier-quote-custom-field.created` …

#### 1.4 Roller

- **TenantAdmin:**
  - Başkasının `Submitted` talebini onaylar ya da reddeder; kendi talebinde yalnız uyarı görür.
  - Teklif ekler, siparişe dönüştürür, özel alan değerlerini düzenler.
  - Alanlar penceresinde her şeyi yapar: zorunluluk, devre dışı bırakma, sürüm geri yükleme.
  - Satır süzgeci uygulanmaz (`PermissionStatusFilter.cs:15`).
- **TenantDeveloper:**
  - Alanlar penceresini görür; tanım ekler ve düzenler. Zorunlu yapamaz, devre dışı bırakamaz, geri yükleyemez
    (`Program.cs:5493-5496, 5517-5520, 5544, 5564`).
  - Karar, teklif ve dönüştürme **göremez**; işleyiciler de 403 verir.
  - Diğer işlemler izin kurallarına bağlıdır.
- **TenantUser:**
  - Liste, oluşturma ve kendi `Submitted` talebinde özel alan düzenleme izin kurallarına bağlıdır.
  - Karar, teklif ve dönüştürme ögeleri hiç görünmez (test `purchasing/purchaseRequests.test.tsx:247-255`); işleyiciler
    de 403 verir.
  - Sipariş ve teklif tanımları yüklenmez.
  - Satır koşullu okuma kuralları ("yalnız kendi talepleri", "yalnız Onay bekleyenler") listeyi daraltır.
- **İşleyici rol denetimleri özeti:**
  - Yalnız TenantAdmin: `decision`, `{id}/supplier-quotes` POST, `{id}/order`, tanım `DELETE`, tanım `restore`.
  - TenantAdmin ya da TenantDeveloper: tanım `POST`/`PUT`.
  - Talep sahibi ya da TenantAdmin: değer `PUT` ve değer `restore`.

#### 1.5 ERP işlem kataloğu

**Var olan.** Hiçbir `satinalma.talep.*` işlemi yoktur (`EOC`, `tests/IntegrationTests/ErpOperationCatalog.names.txt`).
Satınalma modülü sabiti `PurchasingModule = "Satınalma"` vardır (`EOC:68`); yalnız `satinalma.malKabul.*` işlemleri
kullanır (`EOC:355-363`). İlgili rapor işlemleri `rapor.purchaseRequests` ve `rapor.purchaseSupplierQuotes`'tur
(`POST /api/reports/run`, `EOC:188`). Bunlar listenin yerini tutmaz.

**Yeni (önerilen).**

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.talep.listele` | GET `/api/purchasing/requests` | query `search`, `status`, `page`, `pageSize` | list `PurchaseRequestSummary`, `rowsPath "items"`, `MetaPaths [page, pageSize, totalCount]` | Satır süzgeçli. `allowed` riski: G-P3. "Teklif" sütunu yok: G-P4. |
| `satinalma.talep.getir` | GET `/api/purchasing/requests/{id}` | route `id` | record `PurchaseRequestView` | `lines` / `customFields` iç içe olduğundan sütun olmaz. |
| `satinalma.talep.kalemleri` | GET `/api/purchasing/requests/{id}` | route `id` | list `PurchaseRequestLineView`, `rowsPath "lines"` | `depo.transfer.kalemleri` örneği (`EOC:393-394`). |
| `satinalma.talep.olustur` | POST `/api/purchasing/requests` | body `code` (istemci zorunlu, sunucu boşa izin verir), `requestDate`*, `neededByDate`, `description`*; `ListParameter<PurchaseRequestLineWriteRequest>("lines")` (`stockItemId`, `quantity`, `unitCode`); `MapParameter("customFields")` | record `PurchaseRequestSummary` | Skaler + list + map birlikte kullanılabilir (`stok.kart.olustur`, `EOC:150-152`). |
| `satinalma.talep.onayla` | POST `/api/purchasing/requests/{id}/decision` | route `id`; body `note` | none (yanıt `{id, code, status, reviewNote, reviewedAt}`, sözleşmesiz anonim nesne) | `fixedBody {approved:true}`, `requiresTenantAdmin`. Öz-onay koşulu sayfada `visibleWhen` ile yazılır (G-P2). |
| `satinalma.talep.reddet` | aynı yol | route `id`; body `note` (sunucuda zorunlu) | none | `fixedBody {approved:false}`, `requiresTenantAdmin` |
| `satinalma.talep.teklifleri` | GET `/api/purchasing/requests/{id}/supplier-quotes` | route `id` | list `PurchaseSupplierQuoteView` | Kıyas alanları dahildir. Satır `lines` ve `customFields` iç içedir. |
| `satinalma.talep.teklifKaydet` | POST `/api/purchasing/requests/{id}/supplier-quotes` | route `id`; body `code`*, `supplierId`*, `quoteDate`*, `validUntil`, `notes`; `ListParameter<PurchaseSupplierQuoteLineWriteRequest>("lines")`; map `customFields` | record `PurchaseSupplierQuoteView` | `requiresTenantAdmin`. `lines` talep satırlarından üretilmelidir (G-P1). |
| `satinalma.talep.siparisOlustur` | POST `/api/purchasing/requests/{id}/order` | route `id`; body `code`*, `supplierId`*, `orderDate`*, `notes`, `supplierQuoteId`, `expectedReceiptDate`, `targetWarehouseId`; `ListParameter<PurchaseRequestOrderLineRequest>("lines")`; map `customFields` | record `PurchaseOrderSummary` | `requiresTenantAdmin`. Ön dolum ve kilitler: G-P11. |
| `satinalma.talep.ozelAlanTanimlari` | GET `/api/purchasing/requests/custom-fields` | — | list `PurchaseRequestCustomFieldDefinitionView` | `customFieldsBlock` kaynağı |
| `satinalma.talep.ozelAlanDegerleri` | GET `/api/purchasing/requests/{id}/custom-fields` | route `id` | list `PurchaseRequestCustomFieldValueView` | |
| `satinalma.talep.ozelAlanKaydet` | PUT `/api/purchasing/requests/{id}/custom-fields` | route `id`; map `values` | list `PurchaseRequestCustomFieldValueView` | `bodyMap {values ← satinalma.talep.ozelAlanDegerleri: code→value}` (`stok.kart.ozelAlanKaydet` gibi, `EOC:238-240`). Sahip veya TenantAdmin kuralı tek bayrakla ifade edilemez. |
| `satinalma.teklif.ozelAlanTanimlari` | GET `/api/purchasing/supplier-quotes/custom-fields` | — | list `PurchaseSupplierQuoteCustomFieldDefinitionView` | Teklif formu (2.x ile ortak) |
| `satinalma.siparis.ozelAlanTanimlari` | GET `/api/purchasing/orders/custom-fields` | — | list `PurchaseOrderCustomFieldDefinitionView` | Dönüştürme formu. Sipariş envanteriyle (B) çakışabilir; adı oradakiyle birleştirilmelidir. |

Var olan ve kullanılabilecek işlemler: `stok.kart.listele` (lookup), `stok.kart.birimleri` (birim seçenekleri,
`EOC:229`), `depo.listele` (hedef depo, `EOC:226`). Tedarikçi lookup'ı için G-P15'e bakınız; Cari envanterindeki
`cari.listele` önerisi tek `type` alır.

Sonraya (v1 dışı önerilir):
- `satinalma.talep.ozelAlanDegerGecmisi` / `ozelAlanDegerGeriYukle` (`execute`, `fixedBody {confirmation:true}`).
- `satinalma.talep.ozelAlanTanimEkle` / `Guncelle` (TenantAdmin **veya** TenantDeveloper; tek bayrakla ifade
  edilemez, G-K1 benzeri) / `Kaldir` / `TanimGecmisi` / `TanimGeriYukle` (`requiresTenantAdmin`).
- Teklif tanım işlemleri.

**Gereken yeni `Labels` kodları.** Bugün yokturlar ve `Label()` açılışta hata verir (`EOC:494-495`):
- Talep: `requestDate`, `neededByDate`, `requestedByUserId`, `requestedByName`, `reviewedByUserId`, `reviewedByName`,
  `reviewNote`, `reviewedAt`, `search`, `note`, `approved`.
- Satırlar: `lineNumber`, `stockCode`, `stockName`, `unitPrice`, `discountPercent`, `vatPercent`, `requestLineNumber`,
  `lineSubtotal`, `discountAmount`, `taxAmount`, `lineTotal`.
- Teklif: `supplierId`, `supplierName`, `quoteDate`, `validUntil`, `currencyCode`, `subtotal`, `discountTotal`,
  `taxTotal`, `grandTotal`, `notes`, `comparableGrandTotal`, `appliedExchangeRate`, `appliedRateDate`,
  `purchaseRequestId`, `requestCode`, `requestStatus`.
- Sipariş: `orderDate`, `expectedReceiptDate`, `targetWarehouseId`, `supplierQuoteId`.

Var olanlar: `id`, `code`, `name`, `description`, `status`, `quantity`, `unitCode`, `lineCount`, `purchaseOrderId`,
`purchaseOrderCode`, `createdAt`, `customFields`, `values`, `label`, `value`, `dataType`, `maxLength`,
`definitionVersion`, `isRequired`, `version`, `definitionId`, `baseCurrencyCode`, `stockItemId`, `isActive`,
`confirmation`, `page`, `pageSize`, `q` (`EOC:86-130`).

`currencyCode`, `supplierName` gibi kodlar Cari ve Sipariş envanterlerinde de önerilir; **tek etiketle**
birleştirilmelidir. Ayrıca şunlar güncellenmelidir: `names.txt`, yeni `system-pages/purchase-request*Operations.fixture.json`
ve `SystemPageStandards.versions.txt` (bugün yalnız `inventory-*` kayıtları var).

#### 1.6 Bileşen eşlemesi ve eksikler

Var olan bileşenler:
- `actionBar`: Yeni → dialog, Aç → kayıt sekmesi ya da `page` + `openParams id`, `moreButtons` ≤ 10 (talepte 7 öge
  yeter), `titleCount`.
- `metric` + sorgu sayaçları: 4 kart.
- `filterBar`: sunucu arama `searchParam search`, `status` çipleri.
- `dataTable`: sunucu sayfalama 25, `valueLabels` durum, `toneMap` (Submitted warn, Approved info, Ordered ok,
  Rejected off), `rowActions`.
- `contextPanel`: panel.
- `recordHeader` + `steps`: belge başlığı ve durum akışı (`custom-page/RecordHeader.tsx`, `custom-page/StepsIndicator.tsx`).
- `section` / `formCard`: belge bölümleri.
- `dialog` (xl): talep formu.
- `editableGrid` (picker sütunlu): talep kalemleri.
- `customFieldsBlock`: özel alanlar.
- `button`:
  - `visibleWhen` örneği: `liste.seciliSatir.status == 'Submitted' && kullanici.rol == 'TenantAdmin' &&
    liste.seciliSatir.requestedByUserId != kullanici.id`. Seçili satır yolu `<tablo>.seciliSatir` biçimindedir
    (`custom-page/pageActions.test.ts:306`). Tablo adı (`liste`) örnektir; bu yolun koşullarda çözüldüğü
    **doğrulanmalı**. Yol-yol karşılaştırması desteklenir (`custom-page/conditions.ts:5-12`).
  - `confirmEnabled`.
- `alert`: "Bu talep … siparişine dönüştürüldü", öz-onay uyarısı.
- `text`: alt notlar.

Eksikler (talep ekranı):

- **G-P1 Talep satırlarından fiyat ızgarası.** `eksik`.
  - Teklif kaydı ve siparişe dönüştürme, **talebin satırlarını** sabit sayıda ve eklenemez/silinemez biçimde listeler.
    Her satırda Birim fiyat / İskonto % / KDV % düzenlenir ve `lines[{requestLineNumber|lineNumber, …}]` gönderilir.
  - `editableGrid`'de kaynak sorgu yalnız `stage` kipinde vardır (`TCP:1212`). Bu kipte kaynak satırlar salt okunur
    çizilir; düzenlenebilen yalnız eklenen satırlardır (`custom-page/EditableGrid.tsx:42-43, 95`). `list` kipinin
    kaynağı yoktur.
  - Öneri: `editableGrid`'e "kaynaktan doldurulan liste" kipi eklenmelidir. Bu kipte satırlar `sourceQuery`'den
    gelir; ekleme ve silme kapalıdır; kaynak sütunları (`stockCode`, `quantity`, `unitCode`) salt okunurdur;
    `requestLineNumber`/`lineNumber` gizli sabittir; varsayılanlar `unitPrice 0`, `discountPercent 0`,
    `vatPercent 20`'dir.
  - Bu olmadan iki ana iş akışı da taşınamaz.
- **G-P2 Notlu, iki adımlı karar.** `fark`.
  - Eski davranış: not kutusu panelde ve belgededir. Önce Reddet/Onayla, sonra "Evet, …" onayı gelir. Ret notu boşsa
    istemci hata verir. Not 500 karakterle sınırlıdır.
  - Sistem sayfasında `dialog` + `formCard` (Karar notu input, Reddet'te `required`) + `button` (iki ayrı işlem:
    `satinalma.talep.onayla` / `reddet`) yapılabilir.
  - Fark: satır içi panel denetimi yerine pencere açılır. Öz-onay uyarı metni `alert` + `visibleWhen` ile verilir.
  - İş akışı bekleyen talepteki 409 için ön denetim yoktur; eskide de yoktu, yani eşdeğerdir.
  - Not sınırı sunucuyla eşitlenmelidir (1000).
- **G-P3 Satır koşullu izinlerde `allowed` yanlış negatif ve rol denetimi.** `eksik`. Cari G-C3 ile aynıdır.
  - Talepler `resource.ownerUserId` ve `resource.status` kurallarıyla süzülür (`Program.cs:5689`). "Kendi talebini oluşturup
    alanlarını düzenleyebilir" türünden bir kural boş GUID ile çözülürse `satinalma.talep.ozelAlanKaydet` ve
    `olustur` `allowed=false` görünebilir. Katalog izni boş GUID ile çözülür (`EOC:562-586`, özellikle `:576`).
  - Karar, teklif ve sipariş işlemlerinde `requiresTenantAdmin: true` doğrudur. Ancak `ozelAlanKaydet`'in "sahip veya
    TenantAdmin" kuralı katalog bayrağıyla ifade edilemez; sunucu 403'e kalır.
  - Taşımadan önce TenantUser ile sahip kuralı test edilmelidir.
  - Öneri: katalog izni, satır öznitelikli kuralları "kayıt düzeyinde karar sunucuda" saymalıdır (Cari G-C3 önerisi).
    Ek olarak, sahip koşulu için `requiresOwnerOrTenantAdmin` benzeri bir bayrak ya da düğmede
    `liste.seciliSatir.requestedByUserId == kullanici.id || kullanici.rol == 'TenantAdmin'` koşulu kullanılmalıdır.
- **G-P4 "Teklif" sütunu ve en iyi teklif.** `eksik`.
  - Eski ekran onaylanmış satırların tekliflerini satır başına ayrı çağrıyla (5'erli) getirir. "N · en iyi X" ve
    paneldeki kupa, satırlar **arası** en küçük `comparableGrandTotal`'dır.
  - `dataTable` satır başına alt sorgu ve satırlar arası en küçük değer hesaplayamaz.
  - Öneri: sunucuda `PurchaseRequestSummary`'ye `quoteCount`, `bestComparableGrandTotal`, `bestQuoteBaseCurrency`
    eklenmesi ve `PurchaseSupplierQuoteView`'a `isBest` eklenmesi. Böylece yeni işlem sürümü doğar.
  - Yoksa `fark`: sütun ve kupa düşer.
- **G-P5 Sunucu durum sayaçları ve kartla süzme.** `fark`, kısmen doğrulanmalı.
  - Beş `pageSize=1` sorgusu teknik olarak mümkündür (`satinalma.talep.listele` ×5, `{{x.meta.totalCount}}`).
  - Kart tıklamasının `filterBar` durum değerini değiştirip değiştiremediği, ve çip sayaçlarına başka sorgudan değer
    bağlanıp bağlanamadığı **doğrulanmalıdır** (Cari G-C4).
  - Yoksa kartlar yalnız gösterge olur.
  - Öneri: v1'de beş sayaç sorgusu `metric` kartlarına bağlanmalı; kartla süzme `fark` olarak kabul edilmeli ve çip
    sayaçları kaldırılmalıdır. Kalıcı çözüm sunucuda tek çağrıda durum başına sayı döndüren bir uç nokta
    (`/api/purchasing/requests/status-counts`) ve buna karşılık gelen `satinalma.talep.durumSayilari` işlemidir.
- **G-P6 "İhtiyaç" gün sayacı.** `eksik`.
  - "N gün", "bugün" ve kırmızı "N gün geçti", `neededByDate − bugün` farkıyla ve yalnız açık durumlarda hesaplanır
    (`:4885-4891`).
  - Bağlamada tarih farkı yoktur; koşullarda yalnız `add` vardır (`custom-page/conditions.ts:10`). Kırmızı ton
    `neededByDate < bugun` koşuluyla verilebilir (tarih karşılaştırması **doğrulanmalı**), ama gün sayısı metni
    verilemez.
  - Öneri: sunucu `daysUntilNeeded` alanı. Yoksa `fark`: yalnız tarih ve gecikme tonu kalır.
- **G-P7 Talep belgesi, belge zinciri ve durum akışı.** `fark`.
  - `recordHeader` + `steps` (Reddedildi akış dışı son durumdur; `steps`'in "terminal" durumu desteklediği
    **doğrulanmalı**) + `section` ile kurulabilir.
  - "Belge zinciri" (talep → N teklif, durum rozetli → açılabilir sipariş) `contextPanel` içinde `dataTable`
    (`satinalma.talep.teklifleri`) ile verilebilir.
  - Teklif belge durumu "Süresi doldu", `validUntil < bugün` ile hesaplanır (G-P12).
  - Belge açıkken işlem çubuğunun değişmesi (Süz / Dışa aktar pasif, Yenile = belgeyi yenile) sekme ya da `dialog` ile
    yaklaşık karşılanır.
- **G-P8 Ekranlar arası açma.** `eksik`.
  - (a) "Siparişi aç": sessionStorage `createdPurchaseOrderStorageKey` + `nexora:purchase-orders-changed` →
    `sales-purchasing` (`:6493-6501`).
  - (b) Teklifler › Aç talebi açar: `nexora.purchase-request.open` + `nexora:purchase-request-open` (`PRL:113-135`).
    Talep ekranı bunu açılışta ve olayda okur (`:4670-4683`).
  - Öneri: iki ekran da sistem sayfası olursa `page @sales-requests` + `openParams id` ve sayfanın `sayfa.parametre.id`
    ile belgeyi açması kullanılır. Bu yolun Aç akışıyla aynı çalıştığı **doğrulanmalı**.
  - `page` eylemi `@sayfa-anahtarı` koduyla parametre taşıyabilir (`custom-page/navigationActions.ts:69-72`). `erpPage`
    eylemi yalnız `q` taşır (`:65-67`, aynı dosya). Ancak eski `sales-purchasing` ekranı sayfa parametresi okumaz;
    sessionStorage ve olay bekler (`SalesPage.tsx:4646-4669`). Eski sipariş ekranının sayfa parametresinden
    (`id`, `intent=open`) okuması gerekir.
  - Ekranlardan yalnız biri taşınırsa eski olay ve sessionStorage köprüsü korunmalıdır.
- **G-P9 Satır bazlı birim seçenekleri.** `eksik`.
  - Talep kaleminde Birim seçenekleri, o satırda seçilen stok kartının `GET /api/stock/items/{id}/units` sonucudur
    (temel birim + aktif dönüşümler). Seçenek listesi satırdaki başka hücreye bağlıdır.
  - `editableGrid` picker'ında `columnOptionsWhen` / seçenek sorgusuna satır hücresi parametresi verilip
    verilemediği **doğrulanmalıdır** (`TCP:1196-1199`).
  - Yoksa `fark`: birim sütunu düşer ve miktar temel birimde girilir. `unitCode` gönderilmezse sunucu temel birimi
    kullanır; çevirme katsayısı 1 olur (`Program.cs:5734` **doğrulanmalı**).
- **G-P10 Özel alan değer düzenleme ve Alanlar penceresi.** `fark`.
  - Oluşturmada `customFieldsBlock` + `satinalma.talep.ozelAlanTanimlari` yeterlidir.
  - Belgede değer düzenleme yalnız `Submitted` iken yapılır (`disabledWhen`). Değer geçmişi ve geri yükleme, ile
    tanım yönetimi (TenantAdmin/Developer ayrımı) v1 dışıdır. Öneri: "Eski ekranda aç" (`onOpenLegacy`).
- **G-P11 Dönüştürme formunun ön dolumu ve kilitleri.** `eksik`.
  - "Bu teklifle sipariş"te tedarikçi ve satır fiyatları tekliften gelir ve **kilitlenir**; sunucu fiyatların birebir
    aynı olmasını ister.
  - Not "Tedarikçi teklifi TKL-…" ile başlar. Beklenen teslim, salt okunur ihtiyaç tarihidir.
  - Sipariş özel alanları aynı kodlu talep değerleriyle dolar.
  - Sistem sayfasında form girişlerinin başka bir sorgunun satırından (seçili teklif) ön değer alması ve
    teklif seçiliyken girişleri kilitleyen bir `disabledWhen` koşulu gerekir. Koşulun yol adı burada
    verilemez; formCard girişlerinin başka sorgudan ön değer alıp alamadığı **doğrulanmalı**. G-P1 ızgarası da teklif satırlarından dolmalıdır.
  - Öneri: "Bu teklifle sipariş" ayrı bir işlem olmalıdır (`satinalma.talep.tekliftenSiparis`). Bu işlem gövdeyi
    sunucuda tekliften kurabilir; yeni uç nokta gerekir. Ya da form ön dolumu açılmalıdır.
  - Başarıdan sonra oluşan sipariş belgesinin açılması da eksiktir (G-P8).
- **G-P15 Tedarikçi seçenekleri.** `eksik`.
  - Talep ekranı tedarikçiyi `Supplier` ve `Both` için ayrı ayrı, **yalnız ilk 100'er** kayıtla yükler (`:607-623`).
    Teklifler ekranı ise 50 sayfaya kadar hepsini yükler (`SQ/SupplierQuoteCreateForm.tsx:18-27`).
  - Tek bir lookup iki türün birleşimini istemelidir.
  - Var olan `GET /api/purchasing/standalone-invoices/suppliers?q&page&pageSize` (aktif `Supplier ∪ Both`, sayfalı,
    `src/Hosts/AIERP.Api/PurchaseInvoiceDraftEndpoints.cs:15-35`) `erp.purchase-invoices.create` izniyle
    süzülür; yanlış izin ailesidir.
  - Öneri: `/api/purchasing/supplier-options` (izin `erp.purchase-requests` veya `erp.supplier-quotes`) +
    `satinalma.tedarikciSecenekleri` işlemi.
- **G-P17 Liste ortakları.** `fark`, doğrulanmalı.
  - ↑↓ / Boşluk / Enter / çift tık, işaret hücresi istisnası, Ctrl+. panel, "panel 1440 px'te kendiliğinden açık",
    toplu "Excel (seçilenler)", CSV, sayfa boyutu 25, arama gecikmesi 250 ms.
  - Cari G-C19 ile aynı şekilde doğrulanmalıdır.
  - Öneri: `dataTable` sayfa boyutu 25 (talepler) ve 50 (teklifler) olarak sabitlenmeli. Arama gecikmesinin
    farklılığı (250 ms / 350 ms + Enter) kabul edilebilir `fark`'tır. Klavye ve panel davranışı runtime'da yoksa Cari
    G-C19 ile birlikte tek iş olarak ele alınmalıdır.
- **G-P18 Ekran görünümü ve dinamik alt yazı.** `fark`.
  - İstemci varsayılanı (Talep, Talep sahibi, İhtiyaç, Teklif, Durum görünür) sunucu kataloğundan farklıdır.
    Katalogda Açıklama, Talep tarihi, İhtiyaç tarihi, Kalem ve Durum görünürdür, `quotes` yoktur
    (`src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs:141-144`).
  - Eski ekran kiracı görünümünü yalnız `view.id` doluysa uygular (`:4814`).
  - "Açıklama · N kalem" alt yazısı, ilgili sütun **gizliyse** koda eklenir (`:4908-4914`). Bu dinamik kural sistem
    sayfasında yoktur.
  - Öneri: `screenViews` eşlemesinde `quotes` karşılıksız sayılmalı; alt yazı sabit olmalıdır (açıklama her
    zaman kodun altında ya da ayrı sütunda). `dataTable`'da hücre alt yazısı özelliğinin varlığı **doğrulanmalı**.

#### 1.7 Görünüm anahtarları

- `purchase-requests` → `code`, `description`, `requestedByName`, `requestDate`, `neededByDate`, `lineCount`, `status`,
  `purchaseOrderCode`, `actions` (sabit) (`src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs:141-144, 654, 1046-1049`).
  - Eşleme bire birdir.
  - İstemcinin `quotes` sütununun karşılığı yoktur (G-P4, G-P18). `actions` aktarılmaz.

---

### 2. Satınalma Teklifleri (`sales-purchase-quotes`)

#### 2.1 Yerleşim

Liste **salt okunurdur**. Teklif ayrıntısı bu ekranda açılmaz; "Aç" teklifin talebini Talepler ekranında açar
(`PSQP:48-51, 139-144`). Talepsiz teklif "Yeni" ile girilir.

- **Başlık.** "Satınalma Teklifleri". Açıklama: "Taleplere bağlı teklifleri tek listede bulun, durumlarını ve
  fiyatlarını inceleyin." Sayaç `totalCount`'tur; yüklenmemişse `null` (`SQ/SupplierQuotesHeader.tsx:9-16`).
- **Özet kartı yok.** `SQ/SupplierQuotesSummary.tsx` hiçbir yerde kullanılmaz (grep).
- **Hata şeridi:** `role=alert`, **kapatılamaz** (`PSQP:202-206`). Bildirim şeridi yoktur; kayıttan sonra bildirim
  çıkmaz.
- **İşlem çubuğu** (`PSQP:146-164`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni | F2 | TenantAdmin değilse pasif, neden "Teklifi yalnızca firma yöneticisi kaydedebilir". `creating=true` olur; form **listenin yerine** açılır (`PSQP:181-196`). Birincil işaretlenmez. |
| Aç | Enter | Odaklı satır, yoksa güncel, yoksa tek işaretli satır. Hiçbiri yoksa "Önce bir kayıt seçin"; talepsiz teklifte "Bu teklif bir talebe bağlı değil". `requestPurchaseRequestOpen(id)` + `onNavigate("sales-requests")` çağrılır. |
| İşlemler → Talep üzerinden teklif gir | Alt+İ | Talepler ekranına gider (`onOpenRequests`). |
| İşlemler → CSV olarak dışa aktar | | Izgara dışa aktarımı |

- **Süzgeç çubuğu** (`SQ/SupplierQuotesFilters.tsx:18-51`, `PSQP:207-225`):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama: "Tedarikçi tekliflerinde ara", yer tutucu "Teklif no, talep no veya tedarikçi" | metin, sunucu | `search`. `ListToolbar` **350 ms** sonra ya da Enter'da `onSearchApply` çağırır (`list-page/ListToolbar.tsx:98, 116-140`). Sayfayı 1'e alır ve metni kırpar. Sunucu teklif kodu, talep kodu ve tedarikçi adı içinde `Contains` arar (`Program.cs:5810`). En çok 120 karakter. |
| Durum | çip, sunucu | `status`: Tümü / Değerlendirmede / Seçildi / Seçilmedi. **Sayaçsızdır.** Sayfayı 1'e alır. |
| Yenile | | Yükleme sürmüyorsa `reload++`. Listeyi ve panel ayrıntısını yeniler (`PSQP:124, 220-222`). |
| Detay paneli anahtarı | | Ctrl+. |

- **Liste sütunları.** Varsayılan `SQ/SupplierQuotesTable.tsx:9-19`'tedir; sunucu kataloğu aynıdır
  (`src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs:342-347`). Kiracı görünümü `purchase-supplier-quotes`'tur ve
  `fields` doluysa **her zaman** uygulanır (`PSQP:81-94`; taleplerdeki `view.id` koşulu yoktur). Genişlikler
  `PQL:26-29`'dedir.

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Teklif no | mono |
| `requestCode` | Talep | mono; talepsizse — |
| `supplierName` | Tedarikçi | kalın |
| `quoteDate` | Tarih | gg.aa.yyyy |
| `validUntil` | Geçerlilik | gg.aa.yyyy ya da —. **Süresi dolmuş vurgusu yok.** |
| `status` | Durum | `StatusTag`: Değerlendirmede warn / Seçildi ok / Seçilmedi off |
| `grandTotal` | Toplam | `listAmount(tutar, döviz)`, sağa dayalı |
| `lineCount` | Satır (gizli) | tr-TR sayı |
| `createdAt` | Oluşturulma (gizli) | tarih + saat |

- **Izgara.** Liste tipi taleplerle aynıdır. Çift tık ve Enter talebi açar; talepsizde hiçbir şey olmaz. Toplu
  "Excel (seçilenler)" vardır (`PSQP:234-243`).
- **Boş durumlar:** "Teklifler yükleniyor…"; arama, süzgeç ve boş liste için tek metin "Bu filtrelerle teklif
  bulunamadı." (`SQ/SupplierQuotesTable.tsx:86-89`).
- **Alt bilgi:** işaretli sayısı, gösterilen / toplam, sunucu sayfalama **50** (`PSQP:29, 244-254`).
- **Seçim kuralı:** örtük ilk satır yoktur. Yeniden yüklemede seçili satır sayfada varsa korunur (`PSQP:107`). Yeni
  teklif kaydından sonra süzgeçler sıfırlanır, sayfa 1 olur ve **yeni teklif seçilir** (`PSQP:186-194`).
- **Detay paneli** (`PQL:44-91`). Panel açıkken ve satır seçiliyken `GET /api/purchasing/supplier-quotes/{id}`
  çağrılır (`PSQP:120-137`).
  - Seçim yoksa "Özetini görmek için listeden bir teklif seçin."
  - Üst kısım: kod, tedarikçi, durum. "Aç" talepsiz teklifte pasiftir. Yüklenirken ve hatada panel durumu gösterilir
    ("Teklif bulunamadı.").
  - Sekmeler: "Özet" ve "Satırlar".
  - **Özet:**
    - Gösterge "Genel toplam".
    - Teklif tarihi, Geçerlilik, varsa Not.
    - Zincir "Satınalma talebi → Bu teklif".
    - Satır önizlemesi ve "tümünü göster".
  - **Satırlar:** stok, miktar, birim fiyat, tutar (`SalesPanelLines`).
  - Detay yanıtındaki şu alanlar **gösterilmez**: kıyas tutarı, kur, özel alanlar, `requestStatus`,
    `purchaseOrderCode`.
- **Pencere / form: Yeni tedarikçi teklifi** (`SQ/SupplierQuoteCreateForm.tsx:39-348`). Tam sayfa `RecordFormPage`'dir.
  - Başlık "Yeni tedarikçi teklifi". Belge şeridi: tür, kod, cari.
  - Kayıt düğmesi "Teklif kaydet" (form id `supplier-quote-create-form`). İptal listeye döner.
  - Durum satırı: "Talep olmadan girilen teklif. Miktar stok kartının temel birimindedir; KDV %20 uygulanır." ve
    "Satır: N".
  - **Belge bilgileri:**
    - Tedarikçi teklif no * (≤ 64, yer tutucu "TKL-2026-001").
    - Tedarikçi * (`SearchableRecordPicker`, aktif Supplier + Both, **50 sayfaya kadar** yüklenir,
      `SupplierQuoteCreateForm.tsx:18-27`).
    - Teklif tarihi * (bugün); Geçerlilik sonu (`min=teklif tarihi`).
  - **Teklif satırları:**
    - Sütunlar: #, Stok kartı, Miktar, Birim fiyat, Tutar.
    - Stok kartı `AsyncStockItemPicker`'dır. Seçilince birim alt yazısı görünür. Fiyat boş ya da 0 ise ve stok fiyat
      dövizi tedarikçi dövizine eşitse `purchaseListPrice` önerilir (`SQ/SupplierQuoteCreateForm.tsx:90-103`).
    - Miktar min 0.0001. Birim fiyat ≥ 0. Tutar = miktar × fiyat ve canlı hesaplanır.
    - Satır kaldırma "×" ile yapılır; son satır kaldırılamaz.
    - "Satır ekle" düğmesinin kısayolu Ctrl+Shift+Enter'dır.
  - **Toplamlar:** ara toplam, KDV ve genel toplam istemcide `purchaseCreateOrderTotals` ile, iskonto 0 / KDV 20 sabit
    hesaplanır (`SQ/SupplierQuoteCreateForm.tsx:75-82`). Döviz tedarikçinindir; TRY "TL" yazılır.
  - **Teklif notu:** ≤ 1000, sayaçlı.
  - **Teklif Özel Alanları:** tanım varsa gösterilir.
  - **İstemci doğrulaması:** "Tedarikçi seçin." ve "Her satır için stok kartı seçin." (`SQ/SupplierQuoteCreateForm.tsx:109-116`). Gizli
    (keep-alive) form kaydetmez (`SQ/SupplierQuoteCreateForm.tsx:107-108`).
- **Durum akışı.**
  - Teklif `Submitted` olarak doğar. Yalnız talepten siparişe dönüştürmede `Selected` / `NotSelected` olur.
  - Teklifte düzenleme, silme, iptal ya da elle seçme **yoktur**.
  - **Talepsiz teklif hiçbir zaman siparişe bağlanamaz.** `/order` teklifi `PurchaseRequestId = {id}` koşuluyla
    arar (`Program.cs:6064`). Talepsiz teklif sonsuza dek "Değerlendirmede" kalır.

#### 2.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, arama / durum / sayfa değişimi, Yenile, kayıttan sonra | `GET /api/purchasing/supplier-quotes/` | `page`, `pageSize=50`, `search?`, `status?` | `erp.supplier-quotes.read` (**satır süzgeci yok**) | `:5796-5818`. Sıralama `CreatedAt desc`, sonra `Code`. Yanıt anonim `{items, page, pageSize, totalCount}`; öğe `PurchaseSupplierQuoteSummary` (`PC:443-445`). Bilinmeyen durum 400 döner. |
| Açılış | `GET /api/screen-views/purchase-supplier-quotes/active` | — | `erp.screen-views.read` | Hata sessizdir (`PSQP:81-94`). |
| Panel açık ve satır seçili | `GET /api/purchasing/supplier-quotes/{id}` | — | `erp.supplier-quotes.read` | `src/Hosts/AIERP.Api/DocumentListEndpoints.cs:79-112`. `PurchaseSupplierQuoteDetail` (`PC:1427-1431`): satırlar, `requestStatus`, kıyas, kur, özel alanlar, `purchaseOrderId/Code`. |
| Yeni form açılışı | `GET /api/customers/?type=Supplier&status=Active&page=1..50&pageSize=100`, aynısı `type=Both`, `GET /api/purchasing/supplier-quotes/custom-fields` | — | `erp.customers.read`, `erp.supplier-quotes.read` | `SQ/SupplierQuoteCreateForm.tsx:53-71`. Hata form hatası olarak gösterilir. |
| Stok seçici | `AsyncStockItemPicker` | | `erp.stock-items.read` | doğrulanmalı |
| Teklif kaydet | `POST /api/purchasing/supplier-quotes/` | `{code, supplierId, quoteDate, validUntil, notes, customFields, lines[{stockItemId, quantity, unitPrice, discountPercent:0, vatPercent:20}]}` | `erp.supplier-quotes.create` + işleyicide **TenantAdmin** | `src/Hosts/AIERP.Api/PurchaseSupplierQuoteEndpoints.cs:19-106`. 201 `PurchaseSupplierQuoteView`; istemci yalnız `{id, code}` kullanır. |
| Aç | — (navigasyon) | sessionStorage `nexora.purchase-request.open` + `nexora:purchase-request-open` | — | `PRL:113-124` |

#### 2.3 Kurallar

- **Talepsiz teklif doğrulaması** (`PC:1252-…`; `src/Hosts/AIERP.Api/PurchaseSupplierQuoteEndpoints.cs:21-66`):
  - Kod ≤ 64 ve zorunludur. Tedarikçi zorunludur. Teklif tarihi zorunludur. Geçerlilik teklif tarihinden önce olamaz.
    Not ≤ 1000. Satır sayısı 1–100.
  - Stok seçilmelidir. Miktar, fiyat, iskonto ve KDV sınırları talepli teklifle aynıdır (**doğrulanmalı**; satır kuralı
    okunmadı, `PC:1262+`).
  - **Aynı stok birden fazla satırda olabilir.** Talepteki "bir kez" kuralı burada görünmüyor; **doğrulanmalı**.
  - Tedarikçi aktif olmalı ve türü `Supplier`/`Both` olmalıdır (409). Stoklar var ve aktif olmalıdır (409).
  - Satır birimi stok kartının temel birimidir; birim çevirme yapılmaz.
  - Teklif dövizi tedarikçinin dövizidir. Toplamlar sunucuda hesaplanır. Özel alanlarda zorunluluk denetlenir.
  - Aynı tedarikçi için aynı kod 409 döner.
  - SQL Server'da tanımlar kilitlenir; InMemory'de işlem yoktur (`src/Hosts/AIERP.Api/PurchaseSupplierQuoteEndpoints.cs:48-54`).
- **Listede satır görünürlüğü yoktur.** `erp.supplier-quotes` listesi `IsStatusFilteredCollection`'da değildir
  (`PAH:76-92`) ve `PermissionStatusFilter` uygulanmaz. Talepleri "yalnız kendi talepleri" ile süzülen bir kullanıcı,
  **bütün tekliflerin talep kodlarını ve tutarlarını** görebilir. Bu bir çıkarımdır; bkz. Riskler.
- **Teklif dövizi ve kıyas.** Liste tutarı teklif dövizindedir. Kıyas yalnız detayda ve talep belgesinde vardır.
- **rowVersion / idempotency yok.** Yeniden denemeye karşı koruma yalnız "tedarikçi + kod" benzersizliğidir.
- **Denetim kaydı:** `purchase-supplier-quote.created`, `Resource = "{kod}:-:{tedarikçi}"` (`src/Hosts/AIERP.Api/PurchaseSupplierQuoteEndpoints.cs:93`).

#### 2.4 Roller

- **TenantAdmin:** Yeni etkindir ve talepsiz teklif kaydeder. Diğerleriyle aynıdır.
- **TenantDeveloper / TenantUser:** Yeni nedenli pasiftir (test `purchasing/purchaseRequests.test.tsx:327-332`). POST
  işleyicisi 403 verir; izin kuralı tek başına açmaz.
  - Liste ve panel `erp.supplier-quotes.read` kuralına bağlıdır. Satır koşulu yoktur; öznitelik olarak yalnız rota
    değerleri bulunur. `{id}` yolu için `ResolveResourceAttributesAsync`'te `erp.supplier-quotes` dalı yoktur;
    **doğrulanmalı**.
  - "Aç" talebi açar. Talep okuma izni yoksa talep ekranı hata gösterir.

#### 2.5 ERP işlem kataloğu

**Var olan.** Hiçbir `satinalma.teklif.*` işlemi yoktur. `rapor.purchaseSupplierQuotes` listenin yerini tutmaz.

**Yeni (önerilen).**

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.teklif.listele` | GET `/api/purchasing/supplier-quotes` | query `search`, `status`, `page`, `pageSize` | list `PurchaseSupplierQuoteSummary`, `rowsPath "items"`, `MetaPaths` | Yanıt anonim nesnedir; sütunlar `Columns<PurchaseSupplierQuoteSummary>()` ile verilir. |
| `satinalma.teklif.getir` | GET `/api/purchasing/supplier-quotes/{id}` | route `id` | record `PurchaseSupplierQuoteDetail` | Panel ve özet |
| `satinalma.teklif.kalemleri` | GET `/api/purchasing/supplier-quotes/{id}` | route `id` | list `PurchaseSupplierQuoteLineView`, `rowsPath "lines"` | Panel "Satırlar" sekmesi |
| `satinalma.teklif.olustur` | POST `/api/purchasing/supplier-quotes` | body `code`*, `supplierId`*, `quoteDate`*, `validUntil`, `notes`; `ListParameter<PurchaseSupplierQuoteStandaloneLineWriteRequest>("lines")` (`stockItemId`, `quantity`, `unitPrice`, `discountPercent`, `vatPercent`); map `customFields` | record `PurchaseSupplierQuoteView` | `requiresTenantAdmin`. Eski ekranın sabit iskonto 0 / KDV 20 değerleri ızgara sütun varsayılanı olarak verilmeli ya da sütunlar gizlenmelidir. |
| `satinalma.teklif.ozelAlanTanimlari` | GET `/api/purchasing/supplier-quotes/custom-fields` | — | list `PurchaseSupplierQuoteCustomFieldDefinitionView` | 1.5 ile ortak ad |

Sonraya: `satinalma.teklif.ozelAlanDegerleri` / `ozelAlanKaydet` (`GET`/`PUT /{quoteId}/custom-fields`, yalnız
`Submitted`, `Program.cs:5872-5911`). Eski arayüzde kullanılmıyor.

Gereken yeni `Labels` kodları 1.5'teki listeyle aynıdır (`requestCode`, `purchaseRequestId`, `supplierName`,
`quoteDate`, `validUntil`, `currencyCode`, `grandTotal`, `requestStatus`, `comparableGrandTotal`, …).

#### 2.6 Bileşen eşlemesi ve eksikler

Var olan bileşenler:
- `actionBar`: Yeni → `page` ya da tam sayfa form sekmesi; `disabledWhen kullanici.rol != 'TenantAdmin'` +
  `disabledReason`; Aç → `page @sales-requests` + `openParams id={{liste.seciliSatir.purchaseRequestId}}` (yol biçimi `custom-page/pageActions.test.ts:306`; doğrulanmalı), talepsizde
  `disabledWhen`.
- `filterBar`: arama, durum.
- `dataTable`: sunucu sayfalama 50, `toneMap`, `valueLabels`.
- `contextPanel` + `tabs`: Özet / Satırlar.
- `metric`: Genel toplam.
- `formCard`, `editableGrid` (stok picker'lı, `stage` gerektirmeyen ekleme kipi), `customFieldsBlock`: yeni teklif
  formu.

Eksikler (teklif ekranı; G-P3, G-P8, G-P15, G-P17 burada da geçerlidir):

- **G-P12 Durum etiketi ve tonu tutarsızlığı, hesaplanan "Süresi doldu".** `fark`.
  - Listede `Submitted` "Değerlendirmede" (warn) diye görünür; talep belgesinde aynı teklif "Değerlendiriliyor" ya da
    `validUntil < bugün` ise "Süresi doldu" olur (`PRL:65-73`).
  - Talep listede `Rejected` off, belgede danger'dır.
  - Teklif listesinde süre dolumu hiç gösterilmez.
  - Öneri: tek sözlük. "Süresi doldu" için `toneMap` + koşullu etiket (`validUntil < bugun`) ya da sunucuda
    `effectiveStatus`. Karar verilmeden taşınırsa iki ekran arasında etiket farkı sürer.
- **G-P13 Kıyas (baz para) gösterimi.** `fark`.
  - Teklif detayı ve talep teklifleri `comparableGrandTotal`, `baseCurrencyCode` ve `appliedRateDate` verir. Talep
    belgesi "Baz para birimine çevrilemedi" metnini ve kur tarihini gösterir.
  - `dataTable`'daki `emptyText` yalnız tablonun boş olduğu durum içindir (`TCP:1072, 1111`). Boş (`null`) hücre için özel metin verilip verilemediği **doğrulanmalı**; verilemiyorsa hücrede "Baz para birimine çevrilemedi" yerine — görünür.
  - Öneri: `satinalma.talep.teklifleri` sonucuna sunucuda `comparableText` (biçimlenmiş metin ya da "Baz para birimine çevrilemedi") alanı eklenmeli; kur tarihi ayrı `appliedRateDate` sütunu olarak gösterilmeli.
  - Teklif listesi kıyas göstermez; özet panel de göstermez. Bu eşdeğerdir.
- **G-P14 Kalem fiyatları alt tablosu.** `fark`.
  - Talep belgesinde her teklif satırı genişleyip kalemlerini gösterir (`SalesPage.tsx:8661-8742`). Satır içi açılır
    alt tablo yoktur.
  - Öneri: satır eylemi → `dialog` + `dataTable` (`satinalma.teklif.kalemleri`).
- **G-P16 Talepsiz teklif formunun hesapları ve fiyat önerisi.** `fark`.
  - Satır tutarı (miktar × fiyat) ve ara toplam / KDV / genel toplam canlı, istemcide hesaplanır.
  - `purchaseListPrice` yalnız fiyat 0 ve döviz eşitse önerilir. Satır ekleme kısayolu Ctrl+Shift+Enter'dır.
  - `editableGrid`'de hesaplanan sütun ve toplam satırının olup olmadığı, ve picker seçiminden başka hücreye koşullu
    değer kopyalanıp kopyalanamadığı **doğrulanmalıdır**.
  - Yoksa toplamlar yalnız kayıt yanıtında görünür ve fiyat önerisi düşer.
- **G-P19 İngilizce arayüz ve başlık yazımı.** `fark`.
  - Testler her yeni metin için İngilizce karşılık bekler (`purchasing/purchaseRequests.test.tsx:382-396`). Sistem
    sayfası tek dillidir (Cari G-C25 / G-M6 ile aynı).
  - Talep başlığı küçük harflidir ("Satınalma talepleri"), menüde büyük harfle yazılır. Sistem sayfasında menü
    etiketiyle birleştirilmesi önerilir.

#### 2.7 Görünüm anahtarları

- `purchase-supplier-quotes` → `code`, `requestCode`, `supplierName`, `quoteDate`, `validUntil`, `status`,
  `grandTotal`, `lineCount` (gizli), `createdAt` (gizli) (`src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs:342-347, 692, 1221-1224`).
  - Eşleme bire birdir. `actions` alanı yoktur.

---

### 3. Kaybolması kolay eski davranışlar

- **Öz-onay engeli.** Kendi talebinde TenantAdmin'e karar düğmeleri yerine bilgi metni gösterilir (`:6552-6556`).
  `visibleWhen` yalnız "TenantAdmin ve Submitted" diye yazılırsa düğmeler görünür, sunucu 409 verir.
- **Ret notu zorunluluğu** istemcide de vardır ve iki adımlı onay sorulur (`:6540-6547, 6583-6605`). Not 500 karakterle
  sınırlıdır; sunucu 1000'e izin verir.
- **Teklif kaydı ve dönüştürme yalnız `Approved` talepte** yapılabilir. "Bu teklifle sipariş" yalnız `Submitted` ve
  süresi dolmamış teklifte görünür (`:8689-8704`). Sunucu süreyi **UTC** bugüne göre, istemci yerel bugüne göre
  denetler (`Program.cs:6068`).
- **Tekliften siparişte kilitler:** tedarikçi ve fiyatlar kilitlidir, not ön doludur. Sunucu fiyatlar eşleşmezse 409
  verir; kilit kalkarsa kullanıcı sürekli hata alır.
- **Teklifsiz dönüştürme tüm bekleyen teklifleri "Seçilmedi" yapar** (`Program.cs:6162-6170`). Teklifler varken düz "Sipariş
  oluştur" bunu sessizce yapar. Eski ekran bu konuda uyarmaz; sistem sayfasında onay metni eklenmesi önerilir.
- **Dönüştürmede beklenen teslim** salt okunur ihtiyaç tarihidir. İstek `expectedReceiptDate: neededByDate` gönderir
  (`:5891`).
- **Sipariş özel alanlarının talepten ve tekliften miras alınması**; öncelik sunucuda teklif > form > talep sırasıdır.
- **Talep kodu büyük harfe çevrilir ve boşsa sunucuda üretilir.** İstemci zorunlu kıldığı için bu yol hiç kullanılmaz.
  Sistem sayfasında zorunluluk kaldırılırsa otomatik numaralama açılır; ancak `PurchaseRequestWriteRequest.Code` null olamaz (`PC:411`) ve `BodyParameters` onu zorunlu sayar (`EOC:463-475`). Boş metin göndermek için ya sözleşme (`string? Code`) ya da `fixedBody`/varsayılan değer gerekir; bilinçli karar verilmelidir.
- **Miktar temel birime çevrilir.** Belgede ve sonraki siparişte temel birim görünür; girilen birim saklanmaz.
- **Aynı stok bir talepte iki kez olamaz** (`PC:1173-1174`). Hata alanı `lines`'tır, satır alanı değildir.
- **Özel alanlar yalnız `Submitted` iken düzenlenir** ("Onay sonrası alanlar değiştirilemez."). Değer geçmişi her
  durumda görünür; geri yükleme yalnız `Submitted` iken yapılabilir.
- **POST teklif yanıtında kıyas yoktur.** Kayıttan sonra listenin yeniden okunması gerekir (`:5978-5985`). Yoksa
  "Baz para birimine çevrilemedi" yanlışlıkla görünür.
- **Karar sonrası durum:** talep belgesi kapanır, talep seçili kalır, liste yenilenir (`:5825-5828`).
- **Dönüştürme sonrası oluşan sipariş belgesi aynı yerde açılır.** Kullanıcı mal kabul adımına geçebilir.
- **Teklifler ekranındaki "Aç" belge açmaz; talebi açar.** Talep ekranı bağlı değilse olay ve sessionStorage üzerinden
  sonradan açar (`:4670-4683`). Talepsiz teklif açılamaz.
- **Teklifler ekranında Yeni'den sonra** süzgeçler sıfırlanır ve yeni teklif seçili gelir (`PSQP:186-194`).
- **Talepsiz teklifte fiyat önerisi:** `purchaseListPrice` yalnız fiyat 0 ve stok dövizi tedarikçi dövizine eşitse
  önerilir.
- **İş akışı bekleyen talep** karar alamaz (409, "İş Akışları ekranından verin"). Sistem sayfası bu hatayı okunur
  göstermelidir.
- **Talep sahibine göre arama:** sunucu platform kullanıcılarının adlarında arar. Kod ve açıklama dışında kişi adıyla
  da bulunur.
- **Durum sayaçları aramayı izler, etkin çipi izlemez.** Başlık sayacı durum süzgeci varken "tüm" sayısını gösterir.

### 4. Riskler

**Satınalma Talepleri**
- **Fiyat ızgarası (G-P1) ve ön dolum (G-P11) olmadan** teklif kaydı ve siparişe dönüştürme taşınamaz. Taşıma iki
  evrede yapılmalıdır: v1'de liste + oluşturma + karar sistem sayfasında olur, teklif ve dönüştürme "Eski ekranda aç"
  ile açılır.
- **Ortak bileşen.** `PurchasingPanel` sipariş listesiyle ortaktır (`:4244-9527`). Talep sekmesi sistem sayfasına
  geçince sipariş sekmesi bu bileşeni kullanmayı sürdürür. Bileşenden talep kodu silinirse sipariş ekranındaki "Talep
  oluştur" komutu kırılır (`:7359`). Teklifler ekranı ve sipariş ekranı da hand-off olaylarıyla talep ekranına bağlıdır
  (G-P8).
- **Satır koşullu izinler** (G-P3). "Yalnız kendi talepleri" kuralı yaygın bir kullanımdır. `allowed` yanlış negatifi
  TenantUser'ın oluşturma ve alan kaydetme düğmelerini kapatabilir.
- **İş akışı ile karar çatışması:** iş kuralı akışı başlatmışsa karar 409 döner. Sistem sayfasında karar düğmesini
  gizleyecek veri (`hasPendingWorkflow`) yoktur.
- **Teklif sütunu** (G-P4): çözülmezse satır başına N+1 çağrı yapılır ya da sütun düşer.

**Satınalma Teklifleri**
- **Görünürlük sızıntısı (çıkarım).** Teklif listesi ve detayı satır süzgecinden geçmez. Talepleri kısıtlı kullanıcı
  tüm teklifleri ve talep kodlarını görür. Bu durum eski ekranda da vardır; sistem sayfası onu korur ama görünür
  kılar. Öneri: sunucuda `PurchaseRequestId` üzerinden talep süzgecini uygulamak (ayrı iş).
- **Talepsiz tekliflerin kör noktası.** Siparişe bağlanamaz ve durumu hiç değişmez. Sistem sayfasında "Aç" pasiftir
  ve kullanıcıya bir sonraki adım gösterilmez. Ürün kararı gerekir: talepsiz tekliften doğrudan sipariş açılması.
- **Etiket tutarsızlığı** (G-P12) iki ekran arasında kullanıcıyı şaşırtır. Taşıma sırasında tek sözlüğe geçilmezse
  kalıcılaşır.
- **Tedarikçi seçenekleri** (G-P15). Taleplerdeki 100+100 sınırı sistem sayfasında da tek `type`'lı lookup ile
  sürerse büyük kiracılarda tedarikçi bulunamaz.
- **Yeni sadece TenantAdmin'dir.** Studio'da işlem `requiresTenantAdmin` olmadan tanımlanırsa diğer rollerde düğme
  etkin görünür ve sunucu 403 verir.


---

## Kısım B — Satınalma Siparişleri ve Yeni satınalma siparişi

Taban: `origin/master` 7bc6deda. Yalnız okuma yapıldı.

**Başvuru kuralı:** Dosya adı yazılmayan `:N` / `:N-M` başvuruları `frontend/erp-web/src/SalesPage.tsx`'e aittir. Sunucu
başvuruları her zaman `Program.cs:N` (= `src/Hosts/AIERP.Api/Program.cs`) diye yazılır. `PlatformContracts.cs` =
`src/Platform/AIERP.Platform.Application/PlatformContracts.cs`, `PermissionCatalog` =
`src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs`, `Catalog` = `src/Hosts/AIERP.Api/ErpOperationCatalog.cs`,
`purchaseOrderList.tsx` / `purchaseCreateForms.tsx` = `frontend/erp-web/src/purchasing/…`.

**Giriş ve yönlendirme.** İki anahtar da aynı bileşene gider: `WorkspacePageRouter.tsx:375-378` →
`SupplierOrdersPage.tsx:6-7` → `<SalesPage section="sales-purchasing">` (oluşturma için `createPurchaseOrderPage`).
`section`→`activeTab` eşlemesinde bilinmeyen her bölüm `"purchases"`'a düşer (`:403-424`). `"purchases"` sekmesi
`createPurchaseOrderPage` ise `PurchaseOrderCreatePage`'i, değilse `PurchasingPanel mode="purchasing"`'i çizer (`:2251-2267`).
Menüde `sales-purchase-order-create` sayfası `sales-purchasing`'in alt sayfasıdır (`shell/moduleMenus.ts:22, 82`), sekme
başlığı "Yeni satınalma siparişi" (`App.tsx:643`). `PurchasingPanel` bileşeni Satınalma Talepleri ile **ortaktır**
(`mode: "requests" | "purchasing"`, `:4244-4275`); talep tarafı A envanterinin kapsamındadır, burada yalnız sipariş
tarafına etkisi yazılmıştır.

---

### 1. Satınalma Siparişleri (`sales-purchasing`)

#### 1.1 Yerleşim

- **Başlık:** "Satınalma siparişleri", açıklama "Tedarikçi siparişlerini, kısmi mal kabulleri ve depo stok girişlerini
  yönetin.", sayaç = sunucu `totalCount` (`orderTotal`), birim "sipariş" (`:7421-7435`). Kiracı `pageSettings`'i bu ekranda
  **okunmaz** (yalnız `fields` alınır, `:4684-4700`).
- **Özet kartları** (`purchaseOrderList.tsx:82-119`; hepsi **yalnız görünen sayfa** üzerinden, "bu sayfa"):

| Kart | Değer | Kaynak / davranış |
|---|---|---|
| Sipariş tutarı | `pageAmount(counted)`: İptal ve Reddedildi hariç `grandTotal` toplamı; farklı para birimleri toplanmaz, ipucu "bu sayfa · iptaller hariç" (`purchaseOrderList.tsx:90-99`) | `pageAmount`/`pageAmountHint` (`sales/components/SalesListFooter`) |
| Mal bekleyen | Açık + Kısmen alındı satır sayısı, ton warn | görünen satırlar (`purchaseOrderList.tsx:101-107`) |
| Gecikmiş | `isPurchaseOrderOverdue` sayısı, ton bad; **tıklanınca "Gecikmiş" çipini aç/kapat** (`filterActive`, `onFilter`) | `purchaseOrderList.tsx:108-117`; `:7440-7442` |

  Yükleme sürerken ya da süzgeç dizini beklenirken değerler "—" (`purchaseOrderList.tsx:89`, `:7440`).
- **Uyarı / bildirim şeritleri:** hata ve bildirim, ikisi de kapatılabilir (`:7496-7511`). Belge açıkken aynı şeritler
  belgenin içinde çizilir (`:7773-7788`).
- **İşlem çubuğu** (liste kipi `:7345-7362`; kısayollar `commands/shortcuts.ts:6-18`, İşlemler menüsü Alt+İ):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | `sales-purchase-order-create` sekmesine geçer (`:7347`). Alanlar penceresi, talep formu ya da Faturala penceresi açıkken **kaldırılır** (`:7365`). |
| Aç | Enter | Odaklı ızgara satırı (`focusedRecordId`), yoksa seçili satır, yoksa tek işaretli satır (`:7260-7262, 7348-7354`). Hiçbiri yoksa "Önce bir kayıt seçin". `openOrder(id)` → sipariş belgesi. |
| Sil | — | Kaydedilmemiş; sipariş silme uç noktası yoktur. |
| Dışa aktar | Ctrl+E | Izgaranın XLSX dışa aktarımı, **yalnız görünen sayfa** (`SalesDocumentGrid` `exportActionsRef`, `:7555-7556`). Doğrulanmalı. |
| İşlemler → Mal kabul ekle | | Hedef satır varsa ve `canReceiveOrder(status)` (≠ Received, ≠ Cancelled, `:5277-5278`). Meşgulken "Kaydediliyor…" nedenli pasif. Siparişi açar, alt formu başlatır, forma kaydırır ve odaklar (`:5280-5292, 7357-7358`). |
| İşlemler → Talep oluştur | | Her zaman. **Sipariş ekranının içinde** talep formu penceresini açar (`beginRequestCreate`, `:5340-5349, 7359`; pencere `:8230-…`). Talep kapsamı A envanterindedir. |
| İşlemler → Alanlar | | Yalnız TenantAdmin / TenantDeveloper (`canManagePurchaseFields`, `:6621, 7360`). Teklif / Sipariş / Mal kabul özel alan tanımları penceresi (`:7656-7721`). |
| İşlemler → CSV olarak dışa aktar | | Görünen sayfa (`commands/gridCommands.ts:15-17`). |
| Yenile | (F5 doğrulanmalı) | süzgeç çubuğundaki Yenile düğmesi listeyi yeniler (`:7478`); liste kipinde `refresh` komutu kaydedilmez, F5'in çubukta karşılığı doğrulanmalı. |

  **Belge açıkken** (`detail != null`, `:7270-7283`): Yenile = belgeyi yeniden oku, Süzgeç ve Dışa aktar "Belge açıkken
  kullanılamaz" (`commands/PageCommandsSlot.tsx:20-27`); Yeni (birincil olmayan) oluşturma sekmesine geçer; İşlemler →
  "Mal kabul ekle" (aynı koşul). Fatura belgesi (`invoiceId`) açıkken komut çubuğu hiç kaydedilmez (`:7419`).
  **Onayla / Reddet / İptal / Kapat komutu yoktur** (bkz. 1.3, G-P20).

- **Süzgeç çubuğu** (`:7469-7493`):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama "Sipariş no veya tedarikçi ara" | metin, sunucu | `q`, **250 ms** gecikmeli (`:4640-4645`), sayfayı 1'e alır (`:7471-7474`). Sunucu `Code`, `Supplier.Name`, `Supplier.Code` içinde `Contains` (`Program.cs:6469`). |
| Durum çipi | çip, **istemci** | Tümü / Açık / Kısmen alındı / Tam alındı / Gecikmiş, sayaçlı (`:7480-7491`). Liste API'sinde durum süzgeci yok; çipler en çok **10 × 100 = 1000** özetlik istemci dizinini süzer (`:4715-4740`). Sayaçlar yalnız dizin **tamsa** gösterilir (`:4743-4751`); dizin eksikken süzme yine yapılır (eksik sonuç). "Onay bekliyor", "Reddedildi", "İptal" çipi **yoktur**. |
| Yenile | | `load(requestPage, orderPage)` (`:7478`). |
| Detay paneli anahtarı | | `SalesListPanelToggle`, Ctrl+. (`usePurchaseListPanel`, `purchasing/purchaseRequestList.tsx:79`; `:7258, 7492`). |

- **Liste sütunları** (varsayılan `:4279-4309`, hücreler `:5104-5210`, genişlikler `purchaseOrderList.tsx:73-76`; kiracı
  görünümü `purchase-orders` yalnız **yayımlanmış** görünüm (`view.id` dolu) varsa kullanılır, `:4684-4700`):

| Alan anahtarı | Etiket | Varsayılan | Gösterim |
|---|---|---|---|
| `code` | Sipariş | görünür | mono bağlantı düğmesi; tıklama satırı seçer **ve** belgeyi açar (`:5115-5126`). `orderDate`/`expectedReceiptDate` sütunları ikisi de gizliyse altına "gg.aa · teslim gg.aa" yazılır; gecikmişte kırmızı (`:5111, 5127-5133`). |
| `supplierName` | Tedarikçi | görünür | kalın ünvan; `targetWarehouseCode` gizliyse altına hedef **depo adı** (depolar listesinden id ile eşlenir, `:5137-5147`). |
| `receivedProgress` | Teslim alınan | görünür | **istemci sütunu**: her görünen satır için `GET /orders/{id}` ile satırların alınan/sipariş miktarı toplamı + ilerleme çubuğu (`role=progressbar`); yüklenirken "…", hatada "—" (`:4761-4804, 5148-5171`). Sunucu görünüm kataloğunda **yok** (`TenantScreenViewEndpoints.cs:348-355`). |
| `grandTotal` | Genel toplam | görünür | `currencyCode` sütunu görünürse yalnız sayı, değilse "tutar + döviz" (`listAmount`, `:5184-5189`). |
| `status` | Durum | görünür | tek etiket: Gecikmiş (bad) önceliklidir; sonra Onay bekliyor (warn), Açık (info), Kısmen alındı (warn), Tam alındı (ok), İptal / Reddedildi (off) (`purchaseOrderList.tsx:27-48`). |
| `orderDate` | Sipariş tarihi | gizli | gg.aa.yyyy |
| `expectedReceiptDate` | Beklenen teslim | gizli | gg.aa.yyyy, boşsa — |
| `targetWarehouseCode` | Hedef depo | gizli | özet yalnız `targetWarehouseId` taşır; kod istemcide depo listesinden bulunur (`:5176-5181`) |
| `lineCount` | Satır | gizli | sayı |
| `currencyCode` | Döviz | gizli | metin |
| `actions` | İşlemler | sabit, sağa iğneli, 64 px (`:4300-4308, 4706-4711`) | "⋯" menüsü: Siparişi aç; Mal kabul ekle (`canReceiveOrder`) (`:5194-5206`) |

- **Izgara** (`SalesDocumentGrid gridId="purchase-orders-v2"`, `:7552-7587`): işaret sütunu, tıklama = satır seçimi
  (`onCurrentChange`), çift tık / Enter = aç (`onOpen`), toplu eylem "Excel (seçilenler)" yalnız liste görünürken
  (`:7406-7415`). Sayı sütunları sağa yaslı (`PURCHASE_ORDER_NUMBER_FIELDS`), kod sütunu mono
  (`purchaseOrderList.tsx:122-125`). Sütun aracı süzgeç çubuğuna yerleşir (`toolbarContainer`).
- **Boş durumlar** (`:7559-7569`): "Satın alma siparişleri yükleniyor…", "Bu durumda satın alma siparişi yok." (çip),
  "Aramanızla eşleşen tedarikçi siparişi yok.", "Henüz satın alma siparişi yok.".
- **Alt bilgi** (`SalesListFooter`, `:7576-7586`): işaretli sayısı, gösterilen/toplam (çipliyken dizin sayısı,
  `:4760`), sunucu sayfalama **25** (`:4544`); çipliyken sayfalama istemci dilimlemesidir (`:4755-4757, 7584`).
- **Seçim kuralı:** liste ilk satırı kendisi seçmez (`:6426-6427`). `selectedOrderSummary` yalnız görünen satırlarda
  aranır; seçili kayıt sayfadan çıkınca panel boş durumuna düşer.
- **Detay paneli** (`PurchaseOrderListPanel`, `purchaseOrderList.tsx:148-225`; panel açık + liste görünürken,
  `:7387-7404`; seçim yokken "Özetini görmek için listeden bir sipariş seçin.", `purchaseOrderList.tsx:227-229`):
  - Üst: kod, tedarikçi ünvanı, durum etiketi (Gecikmiş dahil), "Aç" (meşgulken pasif), kapat.
  - Veri: sayfanın **sipariş detay önbelleği** (`orderDetailCache`, `:4375, 7392`); yüklenirken iskelet, hatada
    "Satırlar yüklenemedi.".
  - Sekme **Özet:** Genel toplam / Ara toplam / İskonto / KDV (detay dövizi ile); Sipariş tarihi, Beklenen teslim (gecikmişte
    kırmızı), Hedef depo (ad), Mal kabul (Kabul edildi sayısı), Faturalanan "x / y"; **belge zinciri**: Bu sipariş → her mal
    kabul (durumu) → varsa alış faturası (durumu) (`purchaseOrderList.tsx:189-221`). Panel zinciri tıklanabilir değildir.
  - Sekme **Satırlar:** stok adı, mono stok kodu, "alınan / sipariş birim" (`purchaseOrderList.tsx:174-187`).
- **Sipariş belgesi** (`DocumentSurface variant="detail"`, `:7722-8227`; liste yerine çizilir, kapat = listeye dön):
  - Başlık: "Satınalma siparişi", kod, tedarikçi, durum rozeti (`purchaseOrderStatus`: Açık **warning**, Kısmen alındı
    **info**, Tam alındı success, Onay bekliyor warning, Reddedildi danger, İptal; `document-page/documentStatus.ts:87-97`
    — liste etiketinin tonlarından **farklıdır**), sipariş tarihi; durum akışı Onay bekliyor → Açık → Kısmen alındı → Tam
    alındı, İptal ya da Reddedildi son durum (`purchaseOrderList.tsx:58-67`).
  - Sağ bağlam "Belge zinciri": sipariş → mal kabuller (tarih, durum) → alış faturası (tıklanınca `PurchaseInvoiceModal`
    açılır, `:7741-7769, 9510-9522`).
  - Kutucuklar: Genel toplam, Mal kabul (Kabul edildi sayısı), Faturalanan "x / y", Beklenen teslim (gecikmişte danger +
    "N gün geçti") (`:7789-7802`).
  - Üst bilgiler: Sipariş tarihi, Beklenen teslim, Hedef depo "kod · ad", Para birimi (`:7803-7813`).
  - **Satırlar** tablosu: #, Stok (kod + ad), Sipariş (miktar + birim), Alınan, Kalan, Toplam (`:7814-7846`). Alt bilgi:
    not (varsa) ve toplamlar: Ara toplam, İskonto, **KDV oranına göre matrah/KDV dökümü**, Genel toplam (`:7847-7858`;
    döküm istemcide `vatByRate` ile satırlardan hesaplanır).
  - **Sipariş özel alanları** (yalnız tanım varsa, `:7860-7943`): türe göre giriş (Boolean seçimi, Decimal/Date/Text);
    Received / Cancelled'da girişler pasif; "Alanları kaydet" düğmesi **yalnız Açık / Kısmen alındı**'da; açıklama
    "Açık siparişte düzenlenebilir." / "Sipariş kapalı.". (PendingApproval / Rejected'da girişler açık ama kaydet yok.)
  - **Mal kabuller** bölümü (`:7944-7995`): sayaç, "Her kayıt seçilen depoya stok girişi yapar.", "+ Mal kabul ekle"
    (`canReceiveOrder`). Izgara `purchase-order-receipts` görünümünden (`:4853`, catalog
    `TenantScreenViewEndpoints.cs:145-148`): Mal kabul (kod + doluysa özel alan değerleri "Etiket: değer · …"), Tarih, Depo,
    Satır, Durum rozeti (Taslak / Kabul edildi / İptal), Alış faturası, İşlemler (`:5019-5100`). Boş: "Henüz mal kabul yok.".
    - *Alış faturası* hücresi: fatura varsa "AF-… · kalan 600,00 TRY" düğmesi → fatura penceresi; yoksa ve Kabul edildi
      ise "Fatura oluştur" (fatura tarihi = kabul tarihi önerilir); aksi halde — (`:5063-5085`).
    - *İşlemler* hücresi: Kabul edildi ve faturasızsa "İptal et" (tehlike, onaylı; `:5086-5097, 6365-6393`).
  - **Mal kabul alt formu** (`RecordFormPage variant="dialog" ownSave`, `:7996-8225`): belgenin **kendi Kaydet'i** vardır;
    çubuktaki Kaydet / Ctrl+S onu kaydetmez (test `purchaseOrders.test.tsx:227`).
    - Mal Kabul Kimliği: Mal kabul tarihi * (varsayılan bugün), Depo * (aktif depolar; **varsayılan ilk aktif depo,
      siparişin hedef deposu değil**, `:5260-5264`); depo değişince konumlar yeniden yüklenir, konum seçimleri temizlenir.
    - Mal Kabul Özel Alanları: tanımlar varsa; değerler **sipariş özel alanlarından aynı kodla** ön doldurulur
      (`:5265-5274`).
    - Kabul Edilen Kalemler: yalnız `remainingQuantity > 0` satırlar; Stok (kod + ad), Kalan sipariş (miktar + birim), "Bu
      kabul · birim / miktar" (birim seçimi: temel birim + stok kartının aktif dönüşümleri; miktar `min 0 step 0.0001`), Depo
      konumu ("Depo düzeyinde" + aktif konumlar) (`:8124-8222`; birimler `:5211-5239`).
    - Durum: "Konum seçimi isteğe bağlıdır; tekrar gönderim anahtarı çift stok girişini engeller."; hiçbir satırda miktar
      yoksa "Kaydetmek için en az bir kalemde miktar girin." ve kaydet nedenli pasif (`:7997-8034`).
    - Gönderim: miktarı > 0 satırlar; lot/seri izlemeli stoklarda sırayla istem pencereleri (seri: çok satırlı liste; lot:
      kod + SKT) — **bu sekmede stok kataloğu boş yüklendiği için istemler hiç çıkmaz** (bkz. G-P27) (`:6246-6336, 622`).
  - **Faturala penceresi** "Mal kabulini faturala" (`:9458-9508`): Tedarikçi fatura no * (≤ 64, yer tutucu "TDR-2026-0042"),
    Fatura tarihi *; durum "Vade, tedarikçinin kayıtlı ödeme koşulundan hesaplanır."; kayıttan sonra bildirim "{kod} alış
    faturası oluşturuldu; vade gg.aa.yyyy.", liste ve belge yenilenir, **fatura penceresi açılır** (`:6394-6422`).
  - **Fatura penceresi** `PurchaseInvoiceModal` (`PurchaseInvoiceModal.tsx`; ödeme, iade, iptal içerir — bu envanterin
    kapsamı dışı, C/D envanterleri); kapanınca/değişince sipariş belgesi yenilenir (`:9510-9522`).
  - Belge altı not: "Alış faturası vade gününü tedarikçi kartından alır." (`:8226`).
- **Pencereler** (liste kipinde): *Alanlar* (sekmeler Teklif alanları / Sipariş alanları / Mal kabul alanları, sayaçlı;
  tanım ekle, etiket/uzunluk/zorunluluk düzenle — ardışık `promptDialog` — devre dışı bırak, tanım geçmişi ve geri yükle,
  `:5378-5541, 7656-7721`); *Talep oluştur* (A envanteri).
- **Köprüler** (gelen): (a) oluşturma sekmesi kayıttan sonra `sessionStorage["nexora.purchase-order.created"]` `{id, code}`
  yazar, `nexora:purchase-orders-changed` olayını yayar ve `sales-purchasing`'e geçer (`:3888-3902`); liste olayda ya da
  açılışta kaydı okuyup siler, listeyi 1. sayfadan yeniler, "{kod} satın alma siparişi oluşturuldu." bildirir ve
  **belgeyi açar** (`:3670-3687, 4646-4669`). (b) Talepler ekranındaki "Siparişi aç" aynı kaydı `intent:"open"` ile yazar
  (bildirim yok, `:6493-6501`). Giden: fatura penceresi (yukarıda). **Mal kabul / fatura listelerine gitme köprüsü yoktur**;
  mal kabul ve faturalama bu ekranın içinde yapılır.

#### 1.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış (SalesPage ortak yükleme) | `GET /api/customers/?type=Supplier&status=Active&page=1&pageSize=100` + `…type=Both…` | | `erp.customers.read` | `:607-624`; tedarikçi seçicileri için (liste için gereksiz); **en çok 100 + 100** |
| Açılış | `GET /api/warehouses/` | | `erp.warehouses.read` (doğrulanmalı) | aktifler tutulur; hedef depo adı/kodu eşlemesi buradan |
| Açılış, arama, sayfa, Yenile, her işlem sonrası | `GET /api/purchasing/orders/` | `page`, `pageSize=25`, `q?` | `erp.purchase-orders.read` (durum/tedarikçi satır süzgeçli, `Program.cs:6468`) | `Program.cs:6461-6475`; `OrderDate` azalan, sonra `CreatedAt`; `pageSize` 1–100; `PurchaseOrderPage{items,page,pageSize,totalCount}` |
| Aynı `load()` içinde (**tek `Promise.all`**) | `GET /api/purchasing/requests/?page&pageSize=25[&search&status]` | | `erp.purchase-requests.read` | `:4590-4603`; sipariş sekmesinde kullanılmaz ama çağrılır; hata **listeyi boşaltır** |
| Aynı | `GET /api/purchasing/requests/custom-fields`, `…/orders/custom-fields`, `…/supplier-quotes/custom-fields`, `…/receipts/custom-fields` | | ilgili kaynakların `read`'i (supplier-quotes kaynağı doğrulanmalı) | `:4604-4619`; Alanlar penceresi ve mal kabul formu için; biri 403 verirse **liste yüklenmez** |
| Her liste yüklemesinden sonra | `GET /api/purchasing/orders/?page=1..10&pageSize=100[&q]` | | `erp.purchase-orders.read` | çip dizini (`:4718-4740`); hata sessiz (dizin null) |
| Görünen satırlar (Teslim alınan görünürse) ya da seçili satır | `GET /api/purchasing/orders/{id}` | 5'li gruplar | `erp.purchase-orders.read` (kayıt öznitelikli) | `:4770-4792`; `Program.cs:6476-6520`; `PurchaseOrderView` (satırlar + alınan/kalan, mal kabuller + fatura özeti + özel alanlar) |
| Açılış | `GET /api/screen-views/purchase-orders/active` | | `erp.screen-views.read` | yalnız `view.id` doluysa uygulanır; hata sessiz |
| Açılış | `GET /api/screen-views/purchase-order-receipts/active` | | `erp.screen-views.read` | `:4853` |
| Aç / satır kodu / olay | `GET /api/purchasing/orders/{id}` | | read | `:5240-5258`; özel alan değerleri `customFields`'tan forma kopyalanır |
| Belge açılınca (her satır) | `GET /api/stock/items/{stockItemId}/units` | | `erp.stock-items.read` | `:5211-5239`; mal kabul birimleri; hata şeride |
| Mal kabul formu açılınca / depo değişince | `GET /api/warehouses/{warehouseId}/locations` | | depo konum izni (doğrulanmalı) | `:6228-6245`; aktif konumlar istemcide süzülür |
| Mal kabul kaydet | `POST /api/purchasing/orders/{id}/receipts` | `{requestId, warehouseId, receiptDate, customFields{kod:değer}, lines[{orderLineNumber, quantity, unitCode, tracking[{trackingCode, quantity, expiryDate?}], storageLocationId|null}]}` | `erp.purchase-orders.create` (son parça `receipts` yürütme sayılmaz, `PermissionCatalog:387-397`) | `:6337-6350`; `Program.cs:6521-6644`; `requestId` istemcide `crypto.randomUUID()`, yalnız **başarıdan sonra** yenilenir (`:4530, 6351`) |
| Mal kabul iptal | `POST /api/purchasing/receipts/{id}/void` | — | `erp.purchase-receipts.execute` (`void`) | `:6380`; `Program.cs:6766-6836`; yanıt `{id, code, status, orderStatus}` |
| Faturala | `POST /api/purchasing/receipts/{id}/invoice` | `{code, invoiceDate}` (sağlayıcı UUID/senaryo/tür/gönderici etiketi ve muhasebe profili **gönderilmez**) | `erp.purchase-receipts.create` (son parça `invoice` yürütme listesinde yok; doğrulanmalı) | `:6401-6408`; `Program.cs:6838-6935`; `PurchaseInvoiceSummary` |
| Fatura penceresi | `GET /api/purchasing/invoices/{id}` (+ pencerenin kendi çağrıları) | | `erp.purchase-invoices.read` | `PurchaseInvoiceModal.tsx` (kapsam dışı) |
| Özel alan değerlerini kaydet | `PUT /api/purchasing/orders/{id}/custom-fields` | `{values{kod:değer}}` | `erp.purchase-orders.update` | `:5542-5560`; `Program.cs:6328-6357`; ≤ 40 değer; mapte olmayan alan **silinir** |
| Alanlar: tanım ekle / düzenle / devre dışı / geçmiş / geri yükle | `POST`/`PUT`/`DELETE /api/purchasing/orders/custom-fields[/{definitionId}]`, `GET …/history`, `POST …/restore {version, confirmation:true}` | | `create` / `update` / `delete` / `read` / `execute` + rol denetimleri | `:5378-5541`; `Program.cs:6251-6320`; mal kabul ve teklif alanlarının eşleri `:5992-6227` |
| Talep oluştur penceresi | `POST /api/purchasing/requests/` | | `erp.purchase-requests.create` | A envanteri |

  Kullanılmayan ama var olan sipariş uç noktaları: `GET /api/purchasing/orders/{id}/custom-fields` (`Program.cs:6321`),
  değer geçmişi ve geri yükleme (`Program.cs:6358-6388`), `GET /api/purchasing/orders/assistant-summary`
  (`PurchaseOrderAssistantSummaryEndpoints.cs:10`).

#### 1.3 Kurallar

- **Durum makinesi** (`Entities.cs:1444`; `PurchaseOrderWorkflow` `PlatformContracts.cs:1122-1134`):
  `Open` (varsayılan, `Entities.cs` PurchaseOrder `Status = Open`) ↔ `PartiallyReceived` ↔ `Received` mal kabul ve mal
  kabul iptaliyle **otomatik** hesaplanır (`GetStatus`: tüm satırlar ≥ sipariş ve en az biri > 0 → Received; herhangi > 0 →
  PartiallyReceived; değilse Open). İptalde Received → PartiallyReceived/Open'a **geri döner** (`Program.cs:6829-6832`).
  `PendingApproval` yalnız **talepten siparişe dönüşümde**, iş kuralı yönlendirirse atanır (`Program.cs:6172-6173`);
  karar `POST /api/workflows/instances/{id}/decision` ile verilir, Approved → Open, Rejected → Rejected
  (`WorkflowEndpoints.cs:243-276`; red açıklaması zorunlu, ≤ 500, `WorkflowEndpoints.cs:181-183`).
  **`Cancelled` hiçbir yerde atanmaz** (src içinde yalnız okunur); siparişi iptal etme, kapatma, onaya gönderme ya da
  düzenleme uç noktası **yoktur**. Ekran Cancelled'ı yalnız gösterir (test `purchaseOrders.test.tsx:264`).
- **Mal kabul koşulu:** sunucu yalnız Open / PartiallyReceived kabul eder (`CanReceive`, `Program.cs:6540`, 409 "Bu sipariş
  için yeni mal kabul yapılamaz."). İstemci `canReceiveOrder` PendingApproval ve Rejected'ı da açık sayar (`:5277-5278`):
  bu durumlarda düğme görünür, kayıt 409 alır.
- **Mal kabul sunucu doğrulamaları** (`Program.cs:6521-6644`; `PurchaseReceiptValidation` `PlatformContracts.cs:1290-1312`):
  `requestId` zorunlu, depo zorunlu, 1–100 satır, satır numarası tekrar edemez, miktar > 0 ve ≤ 4 ondalık. Kiracı kayıt
  kilidi (`LockTenantForPostingAsync`) ve sipariş `UPDLOCK`. **İdempotency:** aynı `requestId` aynı siparişte önceki kabulü
  200 ile döndürür; başka siparişte 409 (`Program.cs:6530-6536`). Kapalı mali dönem 409 (`Program.cs:6537-6539`). Pasif
  depo / pasif konum 409, başka depoya ait konum 400. Satır sipariş satırında olmalı; birim stok kartında etkin olmalı; temel
  birime çevrilen miktar ≤ 4 ondalık; **kalan miktar aşılamaz** (409 gövdesinde `orderLineNumber`, `remainingQuantity`,
  `Program.cs:6591-6595`). Sipariş dövizi için kabul tarihinde kur yoksa 409 (`Program.cs:6596-6597`). Kod
  `TenantDocumentNumbering` ile otomatik (`Program.cs:6598`). Birim maliyet = sipariş birim fiyatı × (1 − iskonto) × kur
  (`Program.cs:6613`). Lot/seri: izlemeli stokta izleme kodu **zorunlu**, seri 1 adet ve SKT'siz, lot SKT'li, toplam = miktar
  (`ValidateTrackingAllocations` `Program.cs:9075-9087`); daha önce kullanılmış seri ve SKT'si değişen lot 409
  (`Program.cs:6618-6625`). Mal kabul özel alanları: gönderilmeyen kod **sipariş özel alanından** aynı kodla alınır, zorunlu
  alan denetlenir (`Program.cs:6541-6555`).
- **Mal kabul iptali** (`Program.cs:6766-6836`): yalnız Kabul edildi; bağlı tedarikçi irsaliyesi, yevmiyeye aktarılmış kayıt,
  **aktif alış faturası**, ters kaydı yapılmamış ek maliyet ya da rezervasyon açığı varsa 409. Ters hareketler **bugünün
  (UTC) tarihiyle** yazılır, kapalı dönemdeyse 409. Sipariş durumu yeniden hesaplanır.
- **Mal kabulden fatura** (`Program.cs:6838-6935`): kabul Kabul edildi olmalı. Aynı kabulde aktif fatura varsa: kod (büyük/
  küçük harf duyarsız), tarih ve sağlayıcı alanları aynıysa **mevcut fatura 200 ile döner** (yeniden deneme güvenli),
  farklıysa 409 + `invoiceId`. Sağlayıcı UUID tekrarı 409, kapalı dönem 409, tedarikçi tür/döviz uyuşmazlığı 409. Vade =
  fatura tarihi + tedarikçi `PaymentTermDays`. Tutarlar sipariş satırının fiyat/iskonto/KDV'sinden, önceki faturalı
  miktarlar düşülerek **artımlı** hesaplanır; muhasebe vergi profili uygulanır; toplam ≤ 0 ise 409. Cari hesaba alacak
  kaydı yazılır. Kod tekrarı 409.
- **Özel alan değerleri** yalnız Open / PartiallyReceived'da (`CanEdit`, `Program.cs:6332`); zorunlu alan eksikse 400.
  Zorunlu tanım, açık/onay bekleyen siparişlerin hepsinde değer yoksa açılamaz (`Program.cs:6261, 6280, 6313-6315`).
- **Satır görünürlüğü:** liste `PermissionStatusFilter` ile **durum ve tedarikçi** özniteliğine göre süzülür
  (`Program.cs:6468`); tek kayıt ve alt yollarında izin, kaydın `status` + `supplierId` öznitelikleriyle çözülür
  (`PermissionAuthorizationHandler.cs:60-72, 116-121`). Liste sayfasındaki toplam da süzülmüş sayıdır.
- **Stok kartını devre dışı bırakma** açık, kısmen alınmış ya da onay bekleyen sipariş satırı varsa engellenir
  (`Program.cs:2094-2095`, 409 "Bekleyen satın alma siparişi satırları bulunan stok kartı devre dışı bırakılamaz."). Silme
  yolunda aynı denetim olup olmadığı doğrulanmalı.
- **Denetim kaydı:** `purchase-receipt.posted`, `purchase-receipt.voided`, `purchase-invoice.posted`,
  `purchase-order-custom-fields.updated`, `purchase-order-custom-field.created`; onay akışında
  `purchase-order.approved-by-workflow` / `rejected-by-workflow`. Tanım güncelleme, devre dışı bırakma, tanım geri
  yükleme ve değer geri yükleme **AuditEvent yazmaz**, yalnız revizyon satırı yazar (`Program.cs:6281-6290, 6316-6318,
  6384-6386`).
- **rowVersion yok:** sipariş, mal kabul ve fatura uç noktaları `rowVersion` almaz; eşzamanlılık `UPDLOCK, HOLDLOCK`
  ile sunucuda çözülür.

#### 1.4 Roller

- **TenantAdmin:** her şey; satır süzgeci uygulanmaz (`PermissionAuthorizationHandler.cs:60`); Alanlar penceresinde
  zorunlu tanım, devre dışı bırakma ve tanım geri yükleme yalnız onda (`Program.cs:6254-6256, 6287, 6303`).
- **TenantDeveloper:** "Alanlar" komutunu görür (`:6621`); tanım ekler/düzenler (zorunlu yapamaz). Diğer her şey izin
  kurallarına bağlıdır.
- **TenantUser:** liste, belge, mal kabul, iptal, faturalama ve özel alan değerleri tamamen izin kurallarına bağlıdır;
  işleyicilerde rol denetimi yoktur. Durum/tedarikçi koşullu okuma kuralları listeyi daraltır. Alanlar görünmez.
- **Onay akışı kararı** bu ekranda değildir; iş akışı adımının yetkili rol/kullanıcısı iş akışı ekranından karar verir
  (`WorkflowEndpoints.cs:177-…`; ayrıntı doğrulanmalı).

#### 1.5 ERP işlem kataloğu

Var olan: siparişle ilgili **hiçbir işlem yok**. Satınalmada yalnız `satinalma.malKabul.listele`,
`satinalma.malKabul.ekMaliyetler`, `satinalma.malKabul.ekMaliyetDagit`, `satinalma.malKabul.ekMaliyetTersKayit`
(`Catalog:355-363`; `tests/IntegrationTests/ErpOperationCatalog.names.txt:51-54`) ve rapor işlemleri `rapor.purchaseOrders`,
`rapor.purchaseOrderFulfillment`, `rapor.purchaseReceipts`, `rapor.purchaseInvoices` (liste ekranının yerini tutmaz). Kullanılabilir
yardımcılar: `depo.listele`, `depo.konumlari`, `stok.kart.listele` (`q`), `stok.kart.birimleri` (`id`); tedarikçi için
cari envanterinin önerdiği `cari.listele` (`type`, `status`) — bugün yok.

Yeni (önerilen; modül sabiti `PurchasingModule` var, `Catalog:68`):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.siparis.listele` | GET `/api/purchasing/orders` | query `q`, `page`, `pageSize` | list `PurchaseOrderSummary`, `rowsPath: "items"` | `status` sütunu enum metni. Durum süzgeci yok (G-P22). |
| `satinalma.siparis.getir` | GET `/api/purchasing/orders/{id}` | route `id` | record `PurchaseOrderView` | `lines`, `receipts`, `customFields` listeleri sütun olmaz; skalerler (toplamlar, notlar, tarihler, `targetWarehouseId`) |
| `satinalma.siparis.satirlari` | GET `/api/purchasing/orders/{id}` | route `id` | list `PurchaseOrderLineView`, `rowsPath: "lines"` | aynı yol, farklı `rowsPath` (aynı yolu iki işlemin okuması doğrulanmalı); `receivedQuantity`, `remainingQuantity` dahil |
| `satinalma.siparis.malKabulleri` | GET `/api/purchasing/orders/{id}` | route `id` | list `PurchaseReceiptSummary`, `rowsPath: "receipts"` | iç içe `invoice` nesnesi ve `customFields` sütun olmaz (G-P26) |
| `satinalma.siparis.olustur` | POST `/api/purchasing/orders` | body `code`*, `supplierId`*, `orderDate`*, `currencyCode`*, `notes`, `expectedReceiptDate`, `targetWarehouseId`; map `customFields`; list `lines` (`SalesQuoteLineWriteRequest`: `stockItemId`*, `quantity`*, `unitPrice`*, `discountPercent`, `vatPercent`, `unitCode`) | record `PurchaseOrderSummary` | Satır türü satış türüdür: `warehouseId`, `currencyCode`, `exchangeRateToQuoteCurrency`, `isVatIncluded` öğeleri de görünür (`PlatformContracts.cs:205`); `ListParameter` öğe dışlaması yok (G-P36). |
| `satinalma.siparis.ozelAlanTanimlari` | GET `/api/purchasing/orders/custom-fields` | — | list `PurchaseOrderCustomFieldDefinitionView` | oluşturma ve belge için |
| `satinalma.siparis.ozelAlanDegerleri` | GET `/api/purchasing/orders/{id}/custom-fields` | route `id` | list `PurchaseOrderCustomFieldValueView` | |
| `satinalma.siparis.ozelAlanKaydet` | PUT `/api/purchasing/orders/{id}/custom-fields` | route `id`; map `values` | list `PurchaseOrderCustomFieldValueView` | `bodyMap {values ← ozelAlanDegerleri: code→value}`; mapte olmayan kod silinir |
| `satinalma.malKabul.ozelAlanTanimlari` | GET `/api/purchasing/receipts/custom-fields` | — | list `PurchaseReceiptCustomFieldDefinitionView` | mal kabul alt formu |
| `satinalma.siparis.malKabulEkle` | POST `/api/purchasing/orders/{id}/receipts` | route `id`; body `requestId`* (`autoId`), `warehouseId`*, `receiptDate`*; map `customFields`; list `lines` (`orderLineNumber`*, `quantity`*, `unitCode`, `storageLocationId`) | record `PurchaseReceiptSummary` | `lines[].tracking[]` iki düzeyli olduğu için düşer (G-P27). İzin `erp.purchase-orders.create`. |
| `satinalma.malKabul.iptal` | POST `/api/purchasing/receipts/{id}/void` | route `id` | record (anonim `{id, code, status, orderStatus}`) | anonim tür `Columns<T>` alamaz; sonuç sözleşmesi tanımlanmalı ya da `record` sütunsuz. `execute`. `confirmEnabled`. |
| `satinalma.malKabul.faturala` | POST `/api/purchasing/receipts/{id}/invoice` | route `id`; body `code`*, `invoiceDate`*, `providerInvoiceUuid`, `providerScenario`, `providerInvoiceTypeCode`, `providerSenderAlias`, `accountingProfileCode` | record `PurchaseInvoiceSummary` | eski ekran yalnız ilk ikisini gönderir |
| `satinalma.siparis.iptal` / `kapat` / `onayla` / `reddet` | **uç nokta yok** | — | — | Önerilebilir ama önce sunucu uç noktası gerekir (G-P20). Onay iş akışı kararıdır (`/api/workflows/instances/{id}/decision`), sipariş işlemi değildir. |

Sonraya (v1 dışı önerilir): `satinalma.siparis.ozelAlanTanimEkle/Guncelle/Kaldir/TanimGecmisi/TanimGeriYukle`
(`requiresTenantAdmin` / TenantDeveloper ayrımı, G-K1 benzeri), değer geçmişi ve geri yükleme, mal kabul ve teklif tanım
işlemleri.

Gereken yeni `Labels` kodları (bugün yok; `Label()` açılışta hata verir, `Catalog:494-495`): `supplierId`, `supplierName`,
`orderDate`, `currencyCode`, `grandTotal`, `expectedReceiptDate`, `targetWarehouseId`, `subtotal`, `discountTotal`,
`taxTotal`, `notes`, `lineNumber`, `stockCode`, `stockName`, `unitPrice`, `discountPercent`, `vatPercent`, `lineSubtotal`,
`discountAmount`, `taxAmount`, `lineTotal`, `receivedQuantity`, `remainingQuantity`, `requestId`, `orderLineNumber`,
`invoiceDate`, `dueDate`, `providerInvoiceUuid`, `providerScenario`, `providerInvoiceTypeCode`, `providerSenderAlias`,
`accountingProfileCode`, `receiptCode`, `paidAmount`, `outstandingAmount`, ve satır öğesi dışlanamazsa `exchangeRateToQuoteCurrency`,
`isVatIncluded`. Var olanlar: `id`, `code`, `status`, `lineCount`, `createdAt`, `warehouseId`, `warehouseName`,
`purchaseOrderId`, `purchaseOrderCode`, `receiptDate`, `stockItemId`, `unitCode`, `quantity`, `storageLocationId`,
`enteredQuantity`, `enteredUnitCode`, `definitionId`, `label`, `dataType`, `maxLength`, `definitionVersion`,
`isRequired`, `value`, `version`, `isActive`, `customFields`, `values`, `tracking`, `trackingCode`, `expiryDate`,
`purchaseReceiptId`, `q`, `page`, `pageSize`. Ayrıca güncellenecekler: `names.txt`, yeni
`system-pages/purchase*Operations.fixture.json`, `SystemPageStandards.versions.txt`.

#### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → `page @sales-purchase-order-create` ya da yeni sistem sayfası, Aç → belge sayfası +
`openParams id`, `moreButtons` ≤ 10, `titleCount {{liste.meta.totalCount}}`), `filterBar` (sunucu arama `searchParam q`),
`dataTable` (sunucu sayfalama 25, `toneMap` durum tonu, `valueLabels`, `rowActions`), `metric` + `countWhen` ("bu sayfa"
kartları), `contextPanel` + `tabs` (Özet / Satırlar), `recordHeader` + `steps` (belge başlığı ve durum akışı), `section`
(Satırlar, Özel alanlar, Mal kabuller), `formCard` + `customFieldsBlock`, `editableGrid` (liste kipi, satıra bağlı `lookup`
sorgusu `{{kalemler.satir.…}}`, `columnStaticOptions`, `maxRows`; örnek `SystemPages/Standards/inventory-transfers.json:128-163`),
`input autoId` (`requestId`), `dialog` (xl) + `button confirmEnabled`, `alert`.

Eksikler (G-P20…G-P39):

- **G-P20 Sipariş durum işlemleri yok.** `eksik`. İptal, kapatma (kısmi kalanı kapatma), onaya gönderme ve düzenleme uç
  noktası bulunmuyor; `Cancelled` hiç atanmıyor (1.3). Eski ekran da bunları sunmuyor, yani eşdeğerlik için gerekmiyor; ancak
  istemci `canReceiveOrder` uyuşmazlığı (PendingApproval/Rejected'da "Mal kabul ekle" görünür, 409 alır, `:5277`) sistem
  sayfasında `visibleWhen status in [Open, PartiallyReceived]` ile **düzeltilmeli** (`fark`, olumlu). Öneri: v1'de durum
  komutu yok; ayrı iş olarak `POST /orders/{id}/cancel` ve `/close` (yürütme son parçaları zaten `IsExecutionRoute`'ta,
  `PermissionCatalog:387-397`) ve `satinalma.siparis.iptal`/`kapat`.
- **G-P21 Doğrudan oluşturmada iş kuralı / onay akışı çalışmıyor.** `fark` (mevcut hata). `ApplyPurchaseOrderCreatedRulesAsync`
  yalnız talepten dönüşümde çağrılır (`Program.cs:6172`); `POST /orders/` siparişi her zaman Open yazar
  (`Program.cs:6435-6458`). Oysa oluşturma ekranının açıklaması "Onay bekliyor ya da Açık" der
  (`purchaseCreateForms.tsx:15-21`, `:3919`) ve iş kuralı şablonu `purchase-order.created` tetikleyicisi önerir
  (`business-rules/components/BusinessRuleTemplateGallery.tsx:29-35`). Sistem sayfası aynı uç noktayı kullanacağından
  bu açık aynen taşınır; karar gerekir (sunucuda düzeltme önerilir, ayrı iş).
- **G-P22 Durum çipleri ve sayaçları istemci dizininden.** `eksik`. Liste API'sinde `status` / `overdue` parametresi yok;
  eski ekran ≤ 1000 özeti çekip çipleri ve sayaçları istemcide üretir (`:4715-4760`), 1000'i aşan kiracıda süzme sessizce
  eksik kalır. `filterBar` sunucu parametresi bekler. Öneri: sunucuya `status` (çoklu) ve `overdueOn=<tarih>` parametresi
  + sayaç için `pageSize=1` sorguları (cari G-C4 ile aynı yöntem; `filterBar` seçeneğine başka sorgudan sayaç bağlanabilmesi
  doğrulanmalı). Ek olarak Onay bekliyor / Reddedildi / İptal çipleri eklenebilir (`fark`, olumlu).
- **G-P23 "Teslim alınan" sütunu.** `eksik`. Satır başı `GET /orders/{id}` ile hesaplanan alınan/sipariş toplamı ve ilerleme
  çubuğu (`:4761-4804, 5148-5171`); sunucu görünüm kataloğunda yok, yayımlanmış kiracı görünümü onu düşürür. `dataTable`
  satır başı ek okuma yapamaz. Öneri: `PurchaseOrderSummary`'ye `orderedQuantity`, `receivedQuantity` (ve isteğe bağlı
  `receivedPercent`) eklemek; bu durumda **yeni işlem adı** ya da sözleşme sürümü gerekir. İlerleme çubuğu için `progress`
  biçimi yoksa `fark` ("12 / 40" metni). Ayrıca birimleri farklı satırların miktarları toplanır (eski davranış; anlamı zayıf).
- **G-P24 Hesaplanan ve birleşik hücreler.** `fark`. (a) "Gecikmiş" etiketi `status ∈ {Open, PartiallyReceived} &&
  expectedReceiptDate < bugün` koşuluyla **durum etiketinin yerine** geçer (`purchaseOrderList.tsx:37-48`); `toneMap`
  tek alan değerine bakıyor görünür (doğrulanmalı). (b) "N gün geçti" (`:7729, 7799`) tarih farkı ister. (c) Kod hücresinin altına tarih,
  tedarikçi hücresinin altına depo yazılması **görünür sütunlara bağlı** (`:5111, 5138`). Öneri: sunucuda `isOverdue`,
  `overdueDays` hesaplı alanları (yeni sürüm); bağlamada `{{bugun}}` karşılaştırması destekleniyorsa koşullu ton denenebilir
  (doğrulanmalı). Birleşik hücreler `fark`: ayrı sütun.
- **G-P25 Hedef depo kodu/adı istemcide eşleniyor.** `eksik`. Özet ve detay yalnız `targetWarehouseId` taşır; kod/ad depo
  listesinden bulunur (`:5176-5181, 7730, 7395`). `dataTable` sütunu başka sorgudan eşleme yapamaz (doğrulanmalı;
  `valueLabels` durağandır). Öneri: `PurchaseOrderSummary`/`View`'a `targetWarehouseCode`, `targetWarehouseName`
  (görünüm kataloğu zaten `targetWarehouseCode` anahtarını kullanıyor, `TenantScreenViewEndpoints.cs:352`).
- **G-P26 Belge zinciri ve iç içe fatura özeti.** `fark`. Panel ve belgedeki zincir sipariş → mal kabuller → (her birinin)
  `invoice` nesnesinden kurulur (`purchaseOrderList.tsx:210-220`, `:7743-7767`); mal kabul ızgarasındaki "AF-… · kalan
  600,00 TRY" hücresi de `receipt.invoice.outstandingAmount`'tan gelir (`:5063-5076`). `Columns<T>` iç içe nesneyi atlar.
  Öneri: `satinalma.siparis.malKabulleri` için `invoice.*` alanlarını düzleştirme (`invoiceId`, `invoiceCode`,
  `invoiceStatus`, `invoiceOutstandingAmount`) ya da katalogda `flatten`. Zincir `contextPanel` içinde düz liste olarak
  çizilir; "Faturalanan x / y" sayımı `countWhen` ile yapılabilir (doğrulanmalı).
- **G-P27 Mal kabul izleme kodları (iki düzeyli dizi) ve bugünkü kusur.** `eksik`. Gövde `lines[].tracking[]` ister;
  `ListParameter` öğeleri yalnız skaler + map alır (`Catalog:454-458`), bu yüzden lot/seri izlemeli stokta kabul
  **gönderilemez** (sunucu "izleme kodları zorunludur" 400, `Program.cs:9078`). Not: eski ekranda da bu sekmede
  `stockItems` boş yüklendiği için (`:622`) istem pencereleri hiç açılmıyor (`:6277-6285`), yani izlemeli stoğun kabulü
  bugün de 400 alıyor gibi görünüyor — **doğrulanmalı** (gerçek kiracıda ya da testle). Öneri: düz satır sözleşmesi
  (`trackingCode`, `expiryDate`, seri için `serialCodes` metni) ya da katalogda iç içe liste parametresi.
- **G-P28 Mal kabul satırlarını siparişten üretme.** `eksik`. Eski form satırları sipariş satırlarından **kendisi** üretir
  (yalnız `remainingQuantity > 0`, salt okunur stok ve kalan sütunları, girilebilir birim/miktar/konum) ve miktarı boş
  satırları göndermez (`:6265-6267, 8136-8218`). `editableGrid` kullanıcı satır ekler; başka sorgudan ön dolu, satır
  eklenip silinemeyen bir ızgara kipi (ör. `rowsFrom: {{satirlar.rows}}` + `readOnly` sütunlar + boş miktarı atla) gerekir.
  Ayrıca: birim seçimi satırın stok kartına bağlı (`stok.kart.birimleri` + `columnStaticOptions` ile karşılanır), konum
  seçimi seçili **depoya** bağlı ve depo değişince temizlenir (`clearsOnChange` var), "en az bir satırda miktar" koşulu
  (`saveDisabledReason`, `:8010`). Not: `gridMode "stage"` kaynak satırları taşır ama yalnız **eklenen** satırlar
  düzenlenebilir (`custom-page/gridState.ts:127, 166`), bu yüzden kaynak satırlara miktar girilemez (koddan çıkarım,
  doğrulanmalı). Öneri: ızgaraya kaynak satır kipi; yoksa `fark` değil **eşdeğersizlik** (v1'de "Eski
  ekranda mal kabul" bağlantısı).
- **G-P29 Mal kabul varsayılanları ve idempotency anahtarı.** `fark`. (a) Varsayılan depo ilk aktif depodur, siparişin
  hedef deposu değil (`:5261`); sistem sayfasında `defaultValue {{siparis.targetWarehouseId}}` önerilir (olumlu `fark`,
  kararla). (b) Özel alanlar sipariş değerlerinden kod eşleşmesiyle ön doldurulur (`:5265-5274`); sunucu gönderilmeyeni
  zaten siparişten alır (`Program.cs:6549-6550`), bu yüzden boş bırakmak eşdeğerdir. (c) `requestId` yalnız başarıda
  yenilenir (`:6351`); `autoId` girişinin başarıdan sonra yenilenip yenilenmediği doğrulanmalı (yenilenmezse ikinci kabul
  ilkinin yanıtını alır).
- **G-P30 Faturala ve fatura penceresi köprüsü.** `eksik`. "Fatura oluştur" mal kabul satırından pencere açar, tarih
  önerisi = kabul tarihi (`:5077-5081`), başarıda bildirim + **faturayı açar** (`:6409-6416`); fatura hücresi ve zincir
  `PurchaseInvoiceModal`'ı açar (`:5066-5069, 7761`). Sistem sayfasında satır eylemi + `dialog` (xl) + `satinalma.malKabul.faturala`
  kurulabilir; "faturayı aç" için alış faturası sistem sayfasına `openParams id` ya da eski ekrana parametreli geçiş gerekir
  (C envanteri ile birlikte). Bildirimdeki "vade gg.aa.yyyy" sonuçtan bağlanabilir.
- **G-P31 Mal kabul iptali.** `fark`. Onay metni "İptal stok bakiyesini negatife düşürmemelidir." (`:6366-6375`); sunucu
  409 gövdesi ek alanlar taşır (`stockItemId`, `currentBalance`, `reservedQuantity`, `requiredQuantity`,
  `Program.cs:6820-6821`) ama eski ekran yalnız `error` metnini gösterir — eşdeğer. Satır eylemi koşulu `status == Posted &&
  invoice == null` (`:5088`) düzleştirilmiş `invoiceId` ister (G-P26).
- **G-P32 Alanlar penceresi v1 dışı.** `fark`. Üç tanım türü (teklif, sipariş, mal kabul), sayaçlı sekmeler, ardışık istem
  pencereleriyle düzenleme, TenantAdmin/TenantDeveloper ayrımı (`:5378-5541, 6621, 7656-7721`). G-K1'e takılır. Öneri: v1'de
  "Eski ekranda aç".
- **G-P33 Belgedeki özel alan değerleri.** `fark`. Girişler Received/Cancelled'da pasif, kaydet yalnız Open/PartiallyReceived
  (`:7864-7940`); `customFieldsBlock` + `satinalma.siparis.ozelAlanKaydet` (`bodyMap`) ile kurulabilir, düğme
  `visibleWhen status in [Open, PartiallyReceived]`. PendingApproval/Rejected'da girişlerin açık görünmesi düzeltilir (olumlu).
- **G-P34 Oluşturmadan / talepten siparişi açma köprüsü.** `eksik`. `sessionStorage` + `nexora:purchase-orders-changed`
  olayı ile liste açılır, 1. sayfadan yenilenir, bildirim gösterilir ve belge açılır (`:3670-3687, 3888-3902, 4646-4669,
  6493-6501`). Sistem sayfasında `afterSaveAction page @<sipariş belgesi> + openParams id={{sonuc.id}}` yeterli olabilir;
  ancak talepler (eski) ekranı ile siparişler (sistem sayfası) arasında karışık durumda **eski ekranların sayfa parametresi
  yazması** gerekir (cari G-C12 ile aynı). Bildirim metni "{kod} satın alma siparişi oluşturuldu." `fark` olarak düşebilir.
- **G-P35 Ortak yükleme bağımlılığı.** `fark` (olumlu). Sipariş listesi tek `Promise.all` içinde talep listesi ve dört tanım
  listesini de okur; birinde 403/hata **sipariş listesini boşaltır** (`:4590-4638`). Tedarikçi listeleri (2 × 100) ve stok
  kataloğu sıfırlaması da liste için gereksizdir (`:607-624`). Sistem sayfasında her sorgu bağımsızdır; tanım okumaları
  yalnız gerektiği yerde yapılmalı.

#### 1.7 Görünüm anahtarları

- `purchase-orders` → `code`, `supplierName`, `orderDate`, `expectedReceiptDate`, `targetWarehouseCode`, `lineCount`,
  `grandTotal`, `currencyCode`, `status`, `actions` (sabit) (`TenantScreenViewEndpoints.cs:348-355`). Eski ekranın varsayılanı
  farklıdır (`receivedProgress` ekli, tarihler/depo/satır/döviz gizli, `:4279-4309`). Eşleme: `targetWarehouseCode` karşılıksız
  (G-P25), `receivedProgress` katalogda yok (G-P23), `actions` aktarılmaz, `pageSettings` kullanılmıyor.
- `purchase-order-receipts` → `code`, `receiptDate`, `warehouseName`, `lineCount`, `status`, `invoice`, `actions`
  (`TenantScreenViewEndpoints.cs:145-148`). `invoice` iç içe nesnedir (G-P26).

---

### 2. Yeni satınalma siparişi (`sales-purchase-order-create`)

#### 2.1 Yerleşim

- **Açılış:** form boş; sipariş tarihi bugün; tek boş satır (miktar 1, fiyat 0, iskonto 0, KDV **20**) (`:3700-3710,
  3740-3758`). Sipariş özel alan tanımları okunur; hata şeride yazılır, form çalışmaya devam eder (`:3759-3774`). Tedarikçi
  ve depo seçenekleri SalesPage ortak yüklemesinden gelir (`:607-624`). Sekme kalıcıdır (keep-alive): kayıt ya da vazgeç
  sonrası form `resetForm()` ile temizlenir ve seçiciler yeniden kurulur (`:3781-3795`).
- **Kayıt formu** (`RecordFormPage`, `:3910-4239`): başlık "Yeni satınalma siparişi"; belge başlığı tür "Satınalma siparişi",
  kod (girildikçe), taraf = tedarikçi adı, durum akışı **geçerli adımsız** (`PurchaseCreateOrderFlow`,
  `purchaseCreateForms.tsx:19-21`), ipuçları `SALES_FORM_HINTS`. Birincil komut "Sipariş oluştur" (Ctrl+S); Vazgeç (Esc)
  dokunulmuş formda "Kaydedilmemiş değişiklikler kaybolacak…" sorusu sorar (test `purchaseCreateForms.test.tsx:184-190`).
  Gizli keep-alive sekmesi Ctrl+S ile kaydetmez (`:3850-3851`, test `purchaseCreateForms.test.tsx:330`). "Kaydet ve Yeni" yoktur.
- **Durum çubuğu:** "Miktar ve fiyat seçilen birim içindir; sipariş stok kartının temel biriminde saklanır." + "Satır: N"
  (`:3934-3944`).
- **Belge bilgileri** (`:3946-4020`):

| Alan | Zorunlu | İstemci | Sunucu (`PurchaseOrderValidation` `PlatformContracts.cs:1136-1149`, `SalesQuoteValidation` `PlatformContracts.cs:969-1006`, `Program.cs:6389-6460`) |
|---|---|---|---|
| Sipariş no | * | mono, `maxLength 40`, yer tutucu "SA-2026-0001" | ≤ 40 (trim); **boş kodu reddeden denetim yok** (yalnız uzunluk), otomatik numaralandırma yok; firmada benzersiz (409 "Bu satın alma sipariş numarası bu firmada zaten kullanılıyor.") — boş kodun davranışı doğrulanmalı |
| Tedarikçi | * | aranabilir seçici; aktif ve `Supplier`/`Both`; etiket "kod · ünvan", açıklama döviz; boşsa gönderimde "Tedarikçi seçin." (`:3775-3777, 3852-3855, 3964-3978`) | var olmalı (404), aktif ve Supplier/Both (409 "Aktif bir tedarikçi seçilmelidir.") |
| (Döviz) | gizli | **tedarikçinin dövizi**; ekranda alan yok, satır başlığında ve tutarlarda görünür (TRY → "TL") (`:3779, 3874, 3718-3723`) | 3 harf ISO; tedarikçi dövizine eşit olmalı (400) |
| Sipariş tarihi | * | `date`, varsayılan bugün | zorunlu (tarih) |
| Beklenen teslim | | `date`, `min = sipariş tarihi` | sipariş tarihinden önce olamaz (400) |
| Hedef depo | | aranabilir seçici, yalnız aktif depolar, "Belirtilmedi" | firmada aktif depo (400) |

- **Sipariş satırları** (`SalesFormLines` + tablo, `:4021-4187`; başlık "Sipariş satırları", ek bilgi = döviz):

| Sütun | Giriş | Davranış |
|---|---|---|
| # | — | sıra no + "×" satırı kaldır (tek satırda pasif) |
| Stok kartı | `AsyncStockItemPicker` (`GET /api/stock/items/?q=…&page=1&pageSize=25`, `sales/AsyncStockItemPicker.tsx:35-36`) | seçimde: birim ve temel birim = kartın birimi; birimleri yüklenir; **alış koşulları önerilir**: fiyat yalnız alan 0/boşsa ve kartın `priceCurrencyCode`'u sipariş dövizine eşitse `purchaseListPrice`; iskonto 0/boşsa `purchaseDiscountPercent`; KDV boş ya da 20 ise `purchaseVatPercent` (`:3813-3847`) |
| Miktar | `number`, min 0.0001, step 0.0001, zorunlu | seçilen birimde |
| Birim | seçim: temel birim + kartın aktif dönüşümleri "KOLI (×12)" | `:4101-4121` |
| Birim fiyat | `number`, min 0, step 0.0001 | seçilen birim için |
| İsk. % | `number`, 0–100, step 0.01 | |
| KDV % | `number`, 0–100, step 0.01 | |
| Tutar | `output` | **net** (miktar × fiyat − iskonto), KDV hariç (`:4163-4166, 3711-3717`) |
| (Satır ekle) | düğme, Ctrl+Shift+Enter | `:4171-4184` |

- **Toplamlar** (`purchaseCreateOrderTotals`, `purchaseCreateForms.tsx:45-61`; `salesFormTotalRows`): Ara toplam (brüt),
  İskonto, KDV oranına göre matrah ve KDV dökümü, Genel toplam; para birimi tedarikçinin. İstemci **yuvarlamaz**; sunucu
  her satırı 2 ondalığa yuvarlar (`SalesQuoteValidation.Calculate`, `PlatformContracts.cs:1008-1017`).
- **Sipariş notu:** `textarea` ≤ 1000, sayaç "n / 1000" (`:4027-4043`); sunucu ≤ 1000.
- **Sipariş Özel Alanları** (yalnız tanım varsa, `:4188-4238`): etiket + "*" + kod; Boolean seçim (Seçin/Evet/Hayır),
  Decimal `number step any`, Date `date`, Text `maxLength`; `required` tanıma göre.
- **Doğrulamalar (istemci):** tedarikçi seçili; her satırda stok kartı ("Her satır için stok kartı seçin.") (`:3852-3859`);
  HTML `required`/`min`/`max`.
- **Kayıttan sonra:** `sessionStorage` kaydı + olay + `sales-purchasing`'e geçiş; liste siparişi açar ve bildirir (1.1
  Köprüler). Hata olursa form ve `busy` korunur (`:3903-3906`).

#### 2.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış | `GET /api/purchasing/orders/custom-fields` | — | `erp.purchase-orders.read` | `:3759-3774`; etikete göre sıralı aktif tanımlar (`Program.cs:6245-6250`) |
| Açılış (bileşen ortak) | `GET /api/customers/?type=Supplier&status=Active&page=1&pageSize=100`, `…type=Both…`, `GET /api/warehouses/` | | `erp.customers.read`, depo okuma | `:607-624`; tedarikçi en çok 100 + 100 |
| Stok arama | `GET /api/stock/items/?q=&page=1&pageSize=25` | | `erp.stock-items.read` | `AsyncStockItemPicker.tsx:35-36` |
| Stok seçilince | `GET /api/stock/items/{id}/units` | | `erp.stock-items.read` | `:3801-3812`; hata şeride |
| Sipariş oluştur | `POST /api/purchasing/orders/` | `{code, supplierId, orderDate, expectedReceiptDate|null, targetWarehouseId|null, currencyCode (tedarikçiden), notes|null, customFields{kod:değer}, lines[{stockItemId, quantity, unitPrice, discountPercent, vatPercent, unitCode}]}` (test `purchaseCreateForms.test.tsx:166-171`) | `erp.purchase-orders.create` | `:3863-3887`; `Program.cs:6389-6460`; yanıt `PurchaseOrderSummary`; tek işlemde sipariş + satırlar + özel alan değerleri + revizyonlar + denetim |

#### 2.3 Kurallar

- **Birim dönüşümü sunucuda:** girilen miktar × çarpan = temel miktar, fiyat ÷ çarpan = temel fiyat; temel miktar ≤ 4
  ondalık olmalı, aksi halde 400 "Birim dönüşümü temel miktar ve fiyat için desteklenen hassasiyet sınırını aşıyor."
  (`Program.cs:6418-6431`). Satırlar **temel birimde** saklanır; belge detayı ve mal kabul temel birimi gösterir. Girilen
  birim ve miktar siparişte **saklanmaz** (mal kabulde saklanır).
- **Satır sınırları:** 1–100 satır; miktar > 0, fiyat ≥ 0, ikisi ≤ 4 ondalık; iskonto ve KDV 0–100, ≤ 2 ondalık; satır
  toplamı decimal(18,2) (`PlatformContracts.cs:985-1004`). Stok kartları var ve aktif olmalı (409). Aynı stok birden çok
  satırda **olabilir** (benzersizlik denetimi yok).
- **Tutar hesabı** (sunucu): ara toplam = round(miktar × fiyat, 2); iskonto = round(ara × %, 2); KDV = round((ara − iskonto)
  × %, 2) (`PlatformContracts.cs:1008-1017`). `IsVatIncluded` varsayılan false; ekran göndermez.
- **Özel alanlar:** her etkin tanım için tür/uzunluk normalizasyonu; zorunlu boşsa 400 `customFields.<KOD>`
  (`Program.cs:6403-6412`). Bilinmeyen kod **sessizce yok sayılır** (yalnız tanımlar dolaşılır).
- **Durum:** her zaman Open (G-P21). İş kuralı/onay akışı tetiklenmez.
- **Denetim:** `purchase-order.created` (`Program.cs:6454`) + özel alan değer revizyonları.
- **rowVersion / idempotency yok:** aynı kodla ikinci gönderim benzersizlik nedeniyle 409 alır; çift tıklama koruması
  yalnız `busy` durumudur.

#### 2.4 Roller

- Rol denetimi yoktur; `erp.purchase-orders.create` yeterlidir (TenantAdmin her zaman). Tedarikçi ve stok seçicileri için
  `erp.customers.read` ve `erp.stock-items.read` de gerekir; tedarikçi okuma satır kuralı seçenekleri daraltır.
- Özel alan **tanımı** bu formda yapılmaz.

#### 2.5 ERP işlem kataloğu

`satinalma.siparis.olustur`, `satinalma.siparis.ozelAlanTanimlari` (bkz. 1.5); seçenekler için `cari.listele` (`type`,
`status`; cari envanterinde önerilen, bugün yok), `depo.listele`, `stok.kart.listele` (`q`), `stok.kart.birimleri` (`id`,
satıra bağlı; `inventory-transfers.json:155-156` gibi). Özel alanlar `customFields` map'iyle **aynı istekte** gönderilmeli
(zorunlu alan denetimi oluşturmada). Satırlar `lines` liste parametresi (`{{kalemler.satirlar}}`, `inventory-transfers.json:163`).

#### 2.6 Bileşen eşlemesi ve eksikler

Var: `recordHeader` + `steps` (geçerli adımsız akış), `formCard` + `input` (`maxLength`, `required`, `min` bağlaması),
`lookup` (tedarikçi, depo; `allowClear`), `editableGrid` liste kipi (stok `lookup`, satıra bağlı birim sorgusu,
`columnStaticOptions "Ana birim"`, `number` kuralları, `minRows 1`, `maxRows 100`), `customFieldsBlock`, `text` (durum
satırı, "Kalem: {{kalemler.satirSayisi}} / 100"), `actionBar` `saveQuery` + `afterSaveAction`.

Eksikler:

- **G-P36 Satır ızgarasının hesaplanan sütunu, toplamlar ve satır sözleşmesi.** `eksik`. (a) Satır "Tutar" (net) ve alt
  toplamlar (Ara toplam, İskonto, KDV oranı dökümü, Genel toplam) istemcide hesaplanır (`purchaseCreateForms.tsx:45-61`);
  bağlamalarda aritmetik ve ızgara toplamı yok. Öneri: ızgaraya `computed` sütun (`quantity*unitPrice*(1-discountPercent/100)`)
  ve `{{kalemler.toplam.<ifade>}}` toplamı **ya da** sunucuda `POST /api/purchasing/orders/preview-totals` (yuvarlama
  sunucuyla aynı olur; istemci yuvarlamadığı için bugün kuruş farkı görünebilir). (b) `lines` öğe türü satış türüdür
  (`SalesQuoteLineWriteRequest`); `ListParameter` öğe dışlaması olmadığından `warehouseId`, `currencyCode`,
  `exchangeRateToQuoteCurrency`, `isVatIncluded` Studio'da bağlanabilir görünür (sunucu POST'ta yok sayar mı, doğrulanmalı;
  `isVatIncluded=true` hesabı değiştirir, `PlatformContracts.cs:1011-1013`). Öneri: `PurchaseOrderLineWriteRequest`
  sözleşmesi ya da `ListParameter<T>(name, exclude…)`.
- **G-P37 Stok seçiminde alış koşullarını önerme.** `eksik`. Seçilen stok kartının `purchaseListPrice`,
  `purchaseDiscountPercent`, `purchaseVatPercent` değerleri **koşullu** (alan hâlâ varsayılandaysa; fiyat yalnız döviz
  eşitse) satıra yazılır (`:3813-3847`). `editableGrid` lookup seçimi yalnız değer sütununu doldurur; seçilen satırın diğer
  alanlarını komşu hücrelere kopyalama yok (`custom-page/gridState.ts:15-19`). Öneri: lookup sütununa `fill: {unitPrice:
  purchaseListPrice, …}` + `fillWhen` (varsayılandaysa) ve döviz koşulu; yoksa `fark` (fiyatlar elle girilir — kullanıcı için
  belirgin gerileme).
- **G-P38 Tedarikçi seçici ve gizli döviz.** `eksik`. (a) Seçenekler iki ayrı sorgunun (Supplier + Both, her biri ≤ 100)
  birleşimidir (`:610-621`); `lookup` tek sorgu alır ve 100'ü aşan kiracıda tedarikçi eksik kalır (eski ekranda da). Öneri:
  sunucuda `type=Supplier,Both` çoklu değer ya da `GET /api/purchasing/suppliers?q` (sunucu araması). (b) `currencyCode`
  ekranda alan değildir, **seçilen tedarikçi satırının** dövizinden gelir (`:3779, 3874`); bağlamanın lookup'ın seçili
  satırının başka sütununu okuyabilmesi gerekir (`{{tedarikci.secili.currencyCode}}` — destek doğrulanmalı). Ayrıca satır
  tutarlarının ve ızgara başlığının dövizi. Yanlış döviz 400 döndürür, sessiz veri hatası olmaz.
- **G-P39 Form davranış farkları.** `fark`. (a) Sipariş no zorunlu ve elle; otomatik numara yok (sunucu boş metni
  engellemiyor, doğrulanmalı) — sistem sayfasında `required` korunmalı. (b) Beklenen teslim `min = sipariş tarihi`
  (`:3999`): `min` bağlaması destekleniyorsa eşdeğer, değilse yalnız sunucu 400'ü. (c) Esc/Vazgeç "kaydedilmemiş değişiklik"
  sorusu (test `purchaseCreateForms.test.tsx:184`) cari G-C18 ile aynı eksik (veri kaybı riski). (d) Gizli keep-alive
  sekmesinin Ctrl+S'e tepki vermemesi (`:3850-3851`) ve vazgeç/kayıt sonrası sıfırlama (`:3781-3795`) çalışma zamanında
  karşılığı doğrulanmalı. (e) Satır kaldırma tek satırda pasif (`minRows 1` karşılar). (f) Not sayacı "n / 1000"
  (`fark`, düşebilir). (g) Durum satırındaki birim açıklaması `text` ile korunur.

---

### 3. Kaybolması kolay eski davranışlar

- Gecikmiş etiketi durum etiketinin **yerine** geçer ve kırmızıdır; liste kodu altındaki teslim tarihi de kırmızı olur
  (`purchaseOrderList.tsx:45-48`, `:5128`).
- "Gecikmiş" özet kartı tıklanınca Gecikmiş çipini aç/kapatır (`purchaseOrderList.tsx:115-116`, `:7440-7442`).
- Çip seçiliyken sayfalama istemci dilimlemesidir; çip kaldırılınca liste 1. sayfadan yeniden yüklenir (`:7263-7267`).
- Sipariş tutarı kartı İptal/Reddedildi'yi saymaz ve farklı dövizleri toplamaz (`purchaseOrderList.tsx:90-99`).
- `code` ve `supplierName` hücrelerinin alt satırı, ilgili sütunlar gizliyken görünür (`:5111, 5138`).
- Liste ile belge durum tonları farklıdır (Açık: liste info, belge warning; Kısmen alındı: liste warn, belge info)
  (`purchaseOrderList.tsx:27-34`, `documentStatus.ts:87-97`).
- Kod hücresine tıklamak satırı seçer **ve** belgeyi açar; satırın kendisine tıklamak yalnız seçer (`:5119-5123`).
- Belge açıkken Yenile belgeyi yeniden okur; Süzgeç/Dışa aktar nedenli pasiftir (`commands/PageCommandsSlot.tsx:20-27`).
- Belge açıkken "Yeni" oluşturma sekmesine gider; Alanlar/talep/faturala penceresi açıkken Yeni yoktur (`:7273, 7365`).
- Mal kabul formu belgenin içinde açılır, forma kaydırılır ve ilk alan odaklanır (`:5286-5292`); kendi Kaydet'i vardır,
  çubuk Kaydet'i onu göndermez (`ownSave`, `:8009`).
- Mal kabul özel alanları sipariş özel alanlarından **kod eşleşmesiyle** ön doldurulur (`:5265-5274`).
- Mal kabul birim seçimi her satırın stok kartı dönüşümlerinden gelir; seçili birim siparişin temel birimiyle başlar
  (`:5224-5231`).
- Konum seçimi depo değişince sıfırlanır; depo seçili değilken pasiftir (`:8056-8060, 8201`).
- Mal kabul `requestId` yalnız başarıdan sonra yenilenir; başarısız denemede aynı anahtar tekrar gönderilir (`:6351`).
- Kabul sonrası bildirim "Mal kabul kaydedildi; seçilen depoya stok girişi işlendi."; iptal sonrası "{kod} mal kabul iptal
  edildi; stok hareketleri ters kaydedildi."; fatura sonrası "{kod} alış faturası oluşturuldu; vade …" ve fatura penceresi
  açılır (`:6356, 6383-6385, 6409-6416`).
- "Fatura oluştur" fatura tarihini kabul tarihiyle önerir, fatura no alanını boşaltır (`:5079-5081`).
- Mal kabul "İptal et" yalnız faturasız Kabul edildi satırlarda görünür (`:5088`).
- Fatura penceresinde yapılan değişiklik (ödeme, iade, iptal) sipariş belgesini yeniler (`:9515-9520`).
- Oluşturulan sipariş listeye dönüldüğünde açılır ve bildirilir; talep ekranından "Siparişi aç" bildirim göstermez
  (`:4652-4663`).
- Oluşturmada stok seçimi alış fiyatı/iskonto/KDV önerir, ama kullanıcı alanı değiştirdiyse üzerine yazmaz; fiyat yalnız
  döviz eşitse önerilir (`:3824-3843`).
- Varsayılan KDV %20; yeni satır KDV'si de 20 (`:3700, 3707`).
- Birim seçeneği etiketi çarpanı gösterir "KOLI (×12)" (`:4117`).
- Sipariş no yer tutucusu "SA-2026-0001"; para birimi TRY ise "TL" yazılır (`:3722, 3957`).
- Detay belgesinde gecikmişte "N gün geçti" ipucu (`:7799`).
- Mal kabul ızgarasında doluysa özel alan değerleri kodun altında "Etiket: değer · …" (`:5027-5034`).

### 4. Riskler

- **Onay akışı açığı (G-P21):** doğrudan oluşturulan siparişler iş kuralıyla onaya düşmüyor; sistem sayfasına geçiş bunu
  görünür kılmaz ama "eşdeğer" diye taşınması açığı kalıcılaştırır. Karar gerekli.
- **Lot/seri kabulü (G-P27):** iki düzeyli dizi desteklenmezse izlemeli stoğun mal kabulü sistem sayfasında hiç yapılamaz;
  bugünkü eski ekranın da çalışmıyor görünmesi (stok kataloğu boş) gerçek kiracıda doğrulanmalı. Doğrulanmazsa
  "eski ekranda çalışıyordu" varsayımıyla yanlış öncelik verilebilir.
- **Mal kabul ızgarası (G-P28):** kaynak satır kipi olmadan alt form kurulamaz; mal kabul eski ekranda kalırsa sipariş
  belgesi iki ekrana bölünür (köprü gerekir).
- **Stok/para dönüşüm farkı (G-P36):** istemci yuvarlamadığı için toplamlar sunucudan kuruş farklı görünebilir; sistem
  sayfasında istemci hesabı eklenirse aynı farkı taşır, sunucu önizlemesi tercih edilmeli.
- **Sayaç ve çip yükü (G-P22, G-P23):** satır başı detay okuması (25 sayfa × 1 GET) ve 10 sayfalık dizin yükü sistem
  sayfasında kaybolur; karşılığında sunucu alanları eklenmezse "Teslim alınan" ve durum süzme özellikleri düşer.
- **Satır koşullu izinler:** liste ve tek kayıt `status`/`supplierId` öznitelikleriyle süzülür; katalog izni boş GUID ile
  çözüldüğü için `allowed=false` yanlış negatifi (cari G-C3) burada da beklenir — TenantUser + tedarikçi kuralıyla test
  edilmeli.
- **Kaynak çözümü:** `POST /orders/{id}/receipts` sipariş `create`'i, `POST /receipts/{id}/invoice` mal kabul `create`'i
  ister (son parçalar yürütme listesinde yok). Kiracı kuralları farklı varsayıyorsa düğmeler yanlış görünür; geçişten önce
  `PermissionCatalog` ile test edilmeli.
- **Ortak bileşen:** `PurchasingPanel` talep ve sipariş kiplerini paylaşır; sipariş ekranı taşınırken talepler eski kalırsa
  "Talep oluştur" (sipariş ekranındaki pencere) ve "Siparişi aç" köprüleri ayrı ayrı yeniden kurulmalı (G-P34).
- **İngilizce metinler:** testler İngilizce karşılık bekler (`purchaseCreateForms.test.tsx:470-…`); sistem sayfası tek dilli
  (cari G-C25 / G-M6 ile aynı `fark`).


---

## Kısım C — Satınalma İrsaliyeleri, Mal kabulleri ve Mal kabul faturası girişi

Bu belge üç yerleşik satınalma ekranını sistem sayfasına (standart tanım) taşımak için girdidir. Bilgiler kod okunarak
çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Biçim ve terimler
`2026-11-21-cari-ekranlari-envanteri.md` ve `2026-11-20-depo-transfer-envanteri.md` ile aynıdır. `fark` kabul edilmiş
davranış farkı, `eksik` ise taşımadan önce kapatılması gereken boşluk anlamına gelir. Eksik kimlikleri yalnız
**G-P40 … G-P59** aralığındadır. Ortak (modüller arası) eksikler için var olan kimliklere atıf yapılır (G-C*, G-TR*, G-K*).

Kapsam (yönlendirici `frontend/erp-web/src/WorkspacePageRouter.tsx`):

| Ekran anahtarı | Başlık | Eski bileşen | Yönlendirici |
|---|---|---|---|
| `sales-purchase-delivery-notes` | Satınalma İrsaliyeleri | `PurchaseDeliveryNotesPage.tsx` + `purchase-delivery-notes/components/*` + `purchasing/purchaseDeliveryNotePanel.tsx` | `:355-356` (yalnız `token` alır) |
| `sales-purchase-receipts` | Mal kabulleri | `PurchaseReceiptsPage.tsx` → `SalesPage` (`section`) → `PurchaseReceiptsScreen.tsx` + `purchasing/purchaseReceiptDocument.tsx` (+ Yeni: `StandaloneFulfillmentPanel.tsx`) | `:381-382` (`salesPageProps`) |
| `sales-purchase-invoice-entry` | Mal kabul faturası girişi | `PurchaseInvoiceEntryScreenPage.tsx` → `SalesPage` → `PurchaseInvoiceEntryPage.tsx` | `:389-390` (`salesPageProps`) |

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir.
`PlatformContracts.cs` ve `PlatformPermissionCatalog.cs` `src/Platform/AIERP.Platform.Application/` altında,
`Entities.cs` `src/Platform/AIERP.Platform.Domain/` altında, `PlatformDbContext.cs`
`src/Platform/AIERP.Platform.Infrastructure/` altındadır. Dosya adı yazılmayan sunucu satır numaraları `Program.cs`
içindir.

**Kapsam sınırı.** Siparişe bağlı mal kabulün **oluşturulması, iptali ve "Fatura oluştur"** bugün Mal kabulleri ekranında
değil, **satınalma siparişi belgesinde** (`sales-purchasing`, `SalesPage.tsx` `PurchasingPanel`) yapılır. Mal kabulleri
ekranı yalnız listeler, açar ve "Yeni" ile **siparişsiz** mal kabul alt ekranını gösterir. Bu belge sipariş belgesindeki mal
kabul formunun kurallarını, işlemlerini ve stok etkisini (bölüm 2.1 son iki madde, 2.3, 2.5) kapsar; o formun yerleşimi sipariş ekranı
envanterinde ele alınmalıdır (adlar o belgeyle hizalanmalı).

---

### 0. Ortak bilgiler

#### Menü ve anahtarlar

- Üç anahtar da standart menü kataloğunda **var**, "Satın Alma" grubunda (`StandardMenuEndpoints.cs:19`). Sekme başlıkları
  `workspace-navigation.ts:24, 27` (TR/EN), satınalma gezinme sırası `workspace-navigation.ts:31`. Canlı tutulan (keep-alive)
  sayfalar arasındadır (`WorkspaceShellPage.tsx:38-47`, `standardListPages`; kümenin anlamı doğrulanmalı).
- Hiçbiri için standart dosyası yok. `SystemPages/Standards/` altında yalnız 8 `inventory-*` dosyası var;
  `system-pages/systemPageKeys.ts:6` aynı listeyi taşır. Yeni standartlar sürüm 1 ve `preview` ile başlamalıdır.
- **İki ekran `SalesPage` kabuğundan geçer.** `section` → `activeTab` eşlemesi `SalesPage.tsx:403-424`
  (`purchase-receipts` `:418-419`, `purchase-invoice-entry` `:420-421`). Kabuk bu iki sekmede kendi başlığını çizmez
  (`:2175-2184`), ama **hata ve bildirim şeridini çizer** (`:2214-2229`) ve `load()`'u çalıştırır (bkz. 0. "SalesPage yan
  etkileri", G-P58).
- Giriş noktaları: Satınalma Faturaları ekranı "mal kabul faturası girişi"ne gider (`purchasing/PurchaseInvoicesScreen.tsx:144`).
  Fatura girişi kaydedince Satınalma Faturaları'na döner (`SalesPage.tsx:2245-2250`). Sistem sayfasında yönlendirici
  bağlamı (`onNavigate`, `role`) yoktur; yalnız `token` ve ekran anahtarı geçer (cari envanteri §0 ile aynı).

#### Yetki modeli

- Kaynaklar (`PlatformPermissionCatalog.cs:75-78`): `/api/purchasing/orders` → `erp.purchase-orders`,
  `/api/purchasing/receipts` → `erp.purchase-receipts`, `/api/purchasing/delivery-notes` → `erp.purchase-delivery-notes`,
  `/api/purchasing/invoices` → `erp.purchase-invoices`. Eylem yoldan çıkar: GET → `read`, POST'ta son parça
  `IsExecutionRoute` listesindeyse (`:387-397`) `execute`, değilse `create` (`:344`). Özel durumlar:
  - `GET /api/purchasing/invoices/entry/receipts` → **`erp.purchase-invoices.create`** (`:159-166`).
  - `/api/purchasing/standalone-receipts…` → `erp.purchase-receipts` (`:185-187`).
  - `/api/purchasing/receipts/{id}/landed-costs…` → **`erp.inventory-cost-adjustments`** (`:262-267`). GET `read`, POST `create`,
    `…/reverse` `execute`.
  - `POST /api/purchasing/delivery-notes/{id}/link-receipt` ve `/unlink-receipt` → **`update`** (`:332-334`).
    `POST …/delivery-notes/orders/{orderId}` → `create`.
  - `POST /api/purchasing/receipts/{id}/void` → son parça `void` → `erp.purchase-receipts.execute`.
  - `POST /api/purchasing/receipts/{id}/invoice` → son parça `invoice` listede yok, özel kural da yok (grep: tek eşleşme
    `landed-costs`) → **`erp.purchase-receipts.create`** (kod çıkarımı; doğrulanmalı). Bkz. G-P47.
  - `POST /api/purchasing/orders/{id}/receipts` → `erp.purchase-orders.create` (son parça `receipts`; doğrulanmalı).
- **TenantAdmin** katalogu atlar. Diğer roller için varsayılan **ret**, Allow kuralı gerekir.
- **Satır düzeyi görünürlük:**
  - *İrsaliyeler:* liste, arama, `{id}` ve sipariş irsaliyeleri **satınalma siparişinin** okuma kurallarıyla süzülür
    (`AccessibleOrdersAsync` → `PermissionStatusFilter.ApplyAsync(…"erp.purchase-orders.read"…, status, supplier)`,
    `PurchaseDeliveryNoteEndpoints.cs:293-301`). Yani irsaliye izni (`erp.purchase-delivery-notes.read`) ile sipariş satır
    kuralının **ikisi** gerekir. Görünmeyen siparişin irsaliyesi 404 döner (`:146-147`, `:165`, `:231`, `:257`).
  - *Mal kabulleri:* `GET /api/purchasing/receipts` **hiç süzülmez** (`:6646-6657`) ve süzgeçli koleksiyon listesinde yoktur
    (`PermissionAuthorizationHandler.cs:79-93`). `GET /api/purchasing/receipts/{id}` de süzülmez (`DocumentListEndpoints.cs:113-140`).
  - *Kaynak öznitelikleri:* `{id}` taşıyan isteklerde `erp.purchase-receipts` öznitelikleri **yalnız
    `StandalonePurchaseReceipts` tablosundan** çözülür (`PermissionAuthorizationHandler.cs:134-139`). Siparişe bağlı mal
    kabulde (`PurchaseReceipts`) kayıt bulunmaz, `resource.status`/`resource.supplierId` eklenmez. Durum ya da tedarikçi
    koşullu bir Allow kuralı `void`/`invoice` için eşleşmez (yanlış ret); koşulsuz Deny/Allow normal çalışır. Bkz. G-P46.
  - *Fatura girişi listesi:* siparişler `erp.purchase-invoices.create` kurallarıyla (durum, tedarikçi) süzülür
    (`PurchaseInvoiceEntryEndpoints.cs:22-25`).
- **Rol denetimi olan işleyiciler:** ek maliyet dağıtma ve ters kaydı yalnız TenantAdmin (`:6671`, `:6736`). Mal kabul
  özel alan tanımı yazmaları (`:6186-6243`, rol satırları doğrulanmalı). İrsaliye, mal kabul oluşturma/iptal ve fatura
  oluşturmada rol denetimi **yok**.
- Eski ekranlar `role` alır ama kullanmaz (`PurchaseReceiptsScreen.tsx:54`, `PurchaseInvoiceEntryPage.tsx:254-257`;
  irsaliye ekranı `role` almaz, `WorkspacePageRouter.tsx:356`).

#### İdempotency ve eşzamanlılık

- **Siparişe bağlı mal kabul:** `PurchaseReceiptWriteRequest.RequestId` zorunlu (`PlatformContracts.cs:549`; boş GUID 400
  "Mal kabul istek anahtarı zorunludur.", `PlatformContracts.cs:1297`). Firma içinde benzersiz indeks `(TenantId,
  RequestId)` (`PlatformDbContext.cs:2255`).
  - Yeniden deneme denetimi **erken** yapılır: sipariş kilidinden hemen sonra, kapalı dönem ve durum denetiminden önce
    (`:6530-6535`). Aynı anahtar aynı siparişle gelirse var olan özet **200** ile döner (içerik karşılaştırılmaz). Başka
    siparişle gelirse 409 "Bu istek anahtarı başka bir satın alma siparişinde kullanılmış." Eşzamanlı çift gönderimde benzersiz
    indeks ihlali 409 "Mal kabul istek anahtarı veya belge numarası daha önce kullanıldı." (`:6639`).
  - Eski form anahtarı bileşen açılışında üretir (`SalesPage.tsx:4530`) ve **yalnız başarıdan sonra** yeniler (`:6351`).
    Hatalı denemeden sonraki yeniden deneme aynı anahtarı kullanır.
- **Siparişsiz mal kabul taslağı:** `RequestId` zorunlu (`StandaloneInventoryDocumentEndpoints.cs:513`), aynı anahtar aynı
  kodla 200, farklı kodla 409 "İstek anahtarı farklı bir belge için kullanılmış." (`:114-115`). Ama eski ekran anahtarı
  **her gönderimde yeniden üretir** (`StandaloneFulfillmentPanel.tsx:156`): yeniden deneme koruması fiilen yoktur; kod
  benzersizliği (409 "Mal kabul kodu zaten kullanılıyor.", `:122`) çift kaydı önler. "Kaydet ve stoğa işle" (`/post`)
  ikinci çağrıda 200 döner (`StandaloneInventoryDocumentEndpoints.cs:395`), iptal (`/void`) ikinci çağrıda 200 döner (`:475`).
- **İrsaliye:** idempotency anahtarı yok. Çift kayıt `(TenantId, PurchaseOrderId, DocumentNumber)` benzersiz indeksiyle
  önlenir (`PlatformDbContext.cs:2310`; 409 "Bu sipariş için aynı tedarikçi irsaliye numarası zaten kayıtlı.",
  `PurchaseDeliveryNoteEndpoints.cs:182-184`, yarışta `:213`). Bir mal kabul yalnız bir irsaliyeye bağlanabilir
  (süzgeçli benzersiz indeks `PlatformDbContext.cs:2312`; `:243`). Bağlantıyı kaldır idempotenttir (bağ yoksa 204, `:258`).
- **Fatura oluşturma:** anahtar yok; **mal kabul başına tek etkin fatura** kuralı idempotency gibi çalışır. Aynı mal kabule
  aynı kod, tarih ve e-belge alanlarıyla ikinci istek var olan faturayı **200** ile döndürür; farklıysa 409 "Bu mal kabul
  için farklı bilgilerle aktif alış faturası zaten var." (`:6855-6873`). Benzersiz indeks ihlali 409 (`:6931`).
- **rowVersion:** üç ekranın hiçbir yazmasında yok. Eşzamanlılık `UPDLOCK, HOLDLOCK` ile sağlanır: sipariş, depo, konumlar,
  özel alan tanımları (mal kabul `:6528, 6541, 6556, 6562`), irsaliye ve mal kabul (`PurchaseDeliveryNoteEndpoints.cs:166, 227,
  253, 273`). Stok yazan her işlem önce firma kayıt kilidini alır (`FiscalYearCloseEndpoints.LockTenantForPostingAsync`,
  `:6527, 6676, 6775, 6846`). İrsaliye yazmaları bu kilidi **almaz** (stok yazmaz).
- **Transaction:** tüm yazmalar tek veritabanı işlemindedir (`BeginTransactionAsync` … `CommitAsync`).

#### Stok, maliyet, depo/konum, lot/seri, kalite kontrol

| Konu | İrsaliye | Siparişe bağlı mal kabul | Siparişsiz mal kabul | Fatura girişi |
|---|---|---|---|---|
| Stok hareketi | **Yok** ("Bu kayıt stok veya muhasebe hareketi oluşturmaz.", `DeliveryNoteCreateView.tsx:62`; belge notu `DeliveryNoteDocument.tsx:113-116`) | Satır başına `InventoryTransaction` `Receipt` (`:6625-6630`) | Taslakta yok; `/post` ile `Receipt` (`StandaloneInventoryDocumentEndpoints.cs:443-449`) | **Yok**; cari alacak kaydı (`CustomerLedgerEntry Credit`, `:6926-6928`) |
| Birim maliyet | — | sipariş birim fiyatı × (1 − iskonto) × firma kuru, 8 ondalık (`:6612`); kur yoksa 409 (`:6596-6597`) | kullanıcı girer (`unitCostBase`, `StandaloneFulfillmentPanel.tsx:676-686`) | fatura maliyet farkı **işlenmez** (sipariş akışı; doğrulanmalı). Siparişsiz akışta ekran metni "fatura geldiğinde maliyet farkı işlenir" (`StandaloneFulfillmentPanel.tsx:506-507`) |
| Birim çevirimi | yalnız sipariş satırının temel birimi (400, `PurchaseDeliveryNoteEndpoints.cs:176-181`) | satır başına girilen birim → katsayı (`ResolveStockUnitFactorAsync`, `:6581-6590`); hem temel hem girilen miktar saklanır | satır başına | — |
| Depo | — | zorunlu, etkin (`:6556-6558`) | zorunlu, etkin (`:118-120`) | yalnız gösterim |
| Konum | — | satır başına isteğe bağlı, depoya ait ve etkin (`:6559-6568`) | satır başına isteğe bağlı | — |
| Lot / seri | — | `tracking` listesi: seri başına 1, lot'ta kod + SKT; lot SKT değişemez, seri tekrar kullanılamaz (`:6615-6624`) | satırda tek `trackingCode` + `expiryDate` (`StandaloneInventoryDocumentEndpoints.cs:436-442`) | — |
| Sipariş durumu | değişmez | `Open`/`PartiallyReceived`/`Received` yeniden hesaplanır (`:6634-6636`) | — | değişmez |
| Kalan miktar | sipariş miktarı − **irsaliyelenmiş** toplam (`PurchaseDeliveryNoteEndpoints.cs:185-194`) | sipariş miktarı − **kabul edilmiş** (Posted) toplam (`:6591-6595`) | — | artımlı tutar (`:6900-6913`) |
| Muhasebe | — | yevmiyeye aktarım ayrı ekranda (`GeneralLedgerTransferEndpoints.cs:43, 376`); aktarılmışsa iptal 409 (`:6787-6788`) | — | aynı (`"PurchaseInvoice"` kaynak türü) |
| Ek maliyet | — | yalnız `inventory-cost` ekranında (TenantAdmin) | — | — |

**Kalite kontrol:** yok. `src/Hosts/AIERP.Api` ve `AIERP.Platform.Domain` altında `QualityInspection`, `QualityControl`,
"kalite kontrol" araması eşleşme vermedi. Mal kabul tek adımda `Posted` olur (`Entities.cs:1752` `PurchaseReceiptStatus
{ Posted, Voided }`); muayene/bekleme (karantina) durumu yoktur.

#### Çalışma zamanı, bugün (bu tabanda doğrulananlar)

- **Tekrar deneme kimliği var:** `input` `autoId: true` sayfa açılınca GUID üretir (`TenantCustomPage.tsx:717-729, 1577-1586`);
  depo transferi standardı kullanıyor (`SystemPages/Standards/inventory-transfers.json:124-125, 159`). G-TR1 kapanmıştır.
  Yenilenme kuralı (kayıt başarısından sonra) doğrulanmalı.
- **Izgarada seçim sütunu var:** `gridColumns` türü `lookup:<sorgu>:<değer>:<etiket>[:<açıklama>]` (`custom-page/gridState.ts:12-38`,
  sunucu `TenantCustomPageSchema.cs:1936-1951`), `columnOptionsWhen`/`columnStaticOptions` (`:1972-…`), `minRows`
  (`:1955-1960`). Transfer standardı kullanıyor (`inventory-transfers.json:129-134`). G-TR2 kapanmıştır.
- **`stage` kipinde kaynak satırlar salt okunurdur**; yalnız yeni satırlar düzenlenir (`custom-page/EditableGrid.tsx:24-26`,
  `custom-page/gridState.ts:129-133`). `list` kipinde kaynak sorgu yoktur (`TenantCustomPageSchema.cs:1909-1911`). Yani
  "kaynak sorgunun satırlarını göster, her satırda bir hücreyi düzenlet" ızgarası **bugün kurulamaz**. Bkz. G-P40.
- **Liste parametresi:** `ListParameter<T>` öğeleri yalnız skaler alanlar ve metin map'leridir (`ErpOperationCatalog.cs:454-476`).
  İç içe liste (ör. `PurchaseReceiptLineWriteRequest.Tracking`) öğe olamaz. Bkz. G-P52.
- **Sonuç biçimi:** `rowsPath` bir kayıttaki iç içe listeyi hedefleyebilir (`depo.transfer.kalemleri` `rowsPath "lines"`,
  `ErpOperationCatalog.cs:394`). `Flatten` iç içe kaydın skaler alanlarını noktalı anahtarlara açar (`:19-21`); `MetaPaths`
  üst düzey sayfa alanlarını `meta`'ya kopyalar (`:22`).
- **Kaydettikten sonra gezinme var:** `afterSaveAction`/`afterSavePageCode`/`afterSaveTarget`/`afterSaveRefresh`,
  `afterSaveButton` (`TenantCustomPageSchema.cs:67-70`). `erpPage` gezinmesi yalnız `q` taşır
  (`custom-page/navigationActions.ts:64-67`).
- **Koşul dili** `null` sabitini bilir (`custom-page/conditions.ts:16, 24, 92`). `purchaseReceiptId == null` yazılabilir; boş
  metin ile `null` ayrımı doğrulanmalı.
- **Katalog `allowed`** rota değerlerini boş GUID ile çözer (`ErpOperationCatalog.cs:562-589`, `:576`). Kaynak öznitelikleri
  eklenmez (G-C3 ile aynı). `RequiresTenantAdmin` işlemler TenantAdmin dışında `allowed=false` olur (`:566`).

#### SalesPage yan etkileri (iki ekran için)

- `load()` yalnız `quotes`/`orders`/`invoices` ve `purchases`/`requests` sekmelerinde erken döner (`SalesPage.tsx:558-622`).
  `purchase-receipts` ve `purchase-invoice-entry` **varsayılan dala düşer** ve açılışta şunları çeker (`:625-646`):
  `loadAllPages` ile **bütün** satış teklifleri, siparişleri, faturaları ve **bütün** cariler, `GET /api/stock/items/?page=1&pageSize=100`
  (`:157-163`) ve `GET /api/warehouses/`. Ayrıca koşulsuz satış görünümleri (`/api/screen-views/sales-quotes|orders|invoices/active`,
  `:700-…`) yüklenir.
- Bu çağrılardan biri hata verirse (ör. satış izni olmayan satınalma kullanıcısı) hata **SalesPage şeridinde** görünür
  (`:2214-2221`). Kod çıkarımı; doğrulanmalı.
- Mal kabulleri bu yüklemeden `warehouses`, `customers`, `stockItems` alır ve **yalnız siparişsiz mal kabul alt ekranına**
  verir (`:2275-2282`, `PurchaseReceiptsScreen.tsx:298-309`). Fatura girişi hiçbirini kullanmaz (`:2245-2250`).
- Keep-alive sekmeler arası `SALES_CHANGED_EVENT` yalnız satış listelerini yeniler (`:535-551, 649-653`); bu iki ekranı
  etkilemez.

---

### 1. Satınalma İrsaliyeleri (`sales-purchase-delivery-notes`)

Üç görünüm (`purchase-delivery-notes/README.md:3-16`): **liste**, **belge** (kayıtlı irsaliye, salt okunur) ve **oluşturma
görünümü** (sipariş seçimi + irsaliye kimliği + satır miktarları + siparişin irsaliyeleri ve mal kabul bağla/kaldır). İrsaliyenin
**durumu yoktur**; etiket mal kabul bağlantısından türetilir. Tutar verisi yoktur.

#### 1.1 Yerleşim

- **Başlık:** "Satınalma İrsaliyeleri", açıklama "Tedarikçi belge numarası ve sipariş miktarlarını kaydedin; mal kabul öncesi
  veya sonrasında bağlantı kurun.", sayaç = sunucudaki toplam (yüklenirken ve 0 iken `null`)
  (`purchase-delivery-notes/components/PurchaseDeliveryNotesHeader.tsx:10-14`, `PurchaseDeliveryNotesPage.tsx:638-640`). Arama
  sonuçları gösterilirken bile başlık sayacı **arama dışı toplamı** gösterir (`noteTotal`).
- **Özet kartı** (tek kart, süzmez; `:641-652`):

| Kart | Değer | Kaynak |
|---|---|---|
| Bağlantısı yok (warn, `Link2Off`) | gösterilen satırlarda `purchaseReceiptId` boş olanların sayısı, ipucu "bu sayfa" | yüklenen sayfa ya da arama sonucu sayfası |

- **Uyarı şeridi:** hata, kapatılabilir; `mutationOrderError || error` (`:669-683`). Bildirim (`notice`) yalnız oluşturma
  görünümünün durum satırında görünür (`DeliveryNoteCreateView.tsx:61`).
- **İşlem çubuğu** (`:489-536`; kısayollar `commands/shortcuts.ts:6-18`, İşlemler Alt+İ):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil, belge açık değilken) | F2 | Oluşturma görünümünü açar, açık belgeyi kapatır (`:496-500, 514`). Oluşturma görünümündeyken Yeni: form kirliyse "Kaydedilmemiş değişiklikler kaybolacak." onayı, sonra belge no ve miktarlar temizlenir; **sipariş seçimi korunur** (`:503-512`, `commands/PageCommandsSlot.tsx:30-37`). |
| Aç | Enter | Odaklı ızgara satırı, yoksa güncel satır, yoksa tek işaretli satır; yoksa "Önce bir kayıt seçin" (`:493, 523-530`). Belgeyi açar (`GET /{id}`). |
| Sil | Ctrl+Delete | Her zaman pasif. Neden: kayıt varsa "İrsaliye kaydı silinemez — mal kabul bağlantısı İşlemler › Siparişi aç'ta yönetilir", yoksa "Önce bir kayıt seçin" (`:515-519`). Silme uç noktası yok. |
| Yenile / Süz / Dışa aktar (belge açıkken) | F5 / Ctrl+F / Ctrl+E | Belge açıkken Yenile belgeyi yeniden okur; Süz ve Dışa aktar "Belge açıkken kullanılamaz" (`:520-521`, `PageCommandsSlot.tsx:20-27`). |
| İşlemler → Siparişi aç | | Hedef kayıt varsa. Oluşturma görünümünü **o siparişle** açar (`:532-533`). İrsaliye–mal kabul bağlantısı yalnız buradan yönetilir. |
| İşlemler → CSV olarak dışa aktar | | Liste görünümünde; **yalnız görünen sayfa** (`:534`, `commands/gridCommands.ts:15-17`). |
| Kaydet ("İrsaliyeyi kaydet") | Ctrl+S | Oluşturma görünümünde; sipariş seçilmeden pasif, neden "Önce bir sipariş seçin" (`DeliveryNoteCreateView.tsx:40-41`). |
| Vazgeç | Esc | Oluşturma görünümünden listeye döner (`:576`); kirliyse sorar (`RecordFormPage` `dirty`, `:572`; doğrulanmalı). |

- **Süzgeç çubuğu** (`:653-667`):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama "Gelen irsaliyelerde ara" / "İrsaliye no, sipariş, tedarikçi veya mal kabul ara" | metin, sunucu, **Enter ile uygulanır** (`onSearchApply`) | `q`; sunucu irsaliye no, sipariş kodu, tedarikçi adı ve mal kabul kodunda büyük harfle `Contains` arar (`PurchaseDeliveryNoteEndpoints.cs:98-106`). Arama **ayrı sayfa durumu** tutar (`noteSearchResults/Page/Total`, `:84-87`); boş arama listeye döner (`:305-323`). Geç dönen arama yanıtı sıra kilidiyle atılır (`:281, 290`). |
| Yenile | | Siparişleri ve listeyi yeniler, aramayı temizler, 1. sayfaya döner (`:660-664, 360-367`). Yüklenirken etkisiz. |
| Detay paneli anahtarı | | `SalesListPanelToggle`, Ctrl+. (`:666`, `sales/useSalesListPanel.ts:19`). |

- **Liste sütunları** (varsayılan `purchase-delivery-notes/types.ts:14-22`, sunucu `TenantScreenViewEndpoints.cs:363-369`;
  hücreler `DeliveryNotesListPanel.tsx:59-91`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `documentNumber` | Tedarikçi irsaliye no | mono bağlantı düğmesi; tıklayınca belgeyi açar (`:61-75`) |
| `documentDate` | Belge tarihi | `formatDate` (gg.aa.yyyy) |
| `purchaseOrderCode` | Satın alma siparişi | mono kod |
| `supplierName` | Tedarikçi | metin |
| `lineCount` | Satır | sayı |
| `purchaseReceiptCode` | Mal kabul | mono kod, yoksa "—" |
| `receiptLinkStatus` (sayfa sütunu) | Durum | **kiracı görünümünde yok**, her zaman sona eklenir; "Mal kabul eşleşti" (ok) / "Bağlantısı yok" (warn) (`:12-18, 92-96`, `purchasing/purchaseDeliveryNotePanel.tsx:21-29`) |
| `actions` | İşlemler | sabit; **sütun çizilmez** (`PurchaseDeliveryNotesPage.tsx:686`) |

- **Izgara:** işaret sütunu, tıkla = güncel satır (belge açılmaz), çift tık / Enter / numara bağlantısı = aç, toplu eylem
  "Excel (seçilenler)" yalnız liste ekrandayken (`DeliveryNotesListPanel.tsx:113-125`). Sütun genişlikleri `:15-18`. Sayfa
  boyutu 25 (`types.ts:12`).
- **Boş durumlar:** "İrsaliyeler yükleniyor…", toplam 0 ise "Henüz gelen irsaliye yok.", değilse "Bu sayfada kayıt yok;
  listeyi yenileyin.", arama boşsa "Aramanızla eşleşen irsaliye bulunamadı." (`DeliveryNotesListPanel.tsx:106-109`).
- **Sayfa sıkıştırma:** istenen sayfa son sayfadan büyükse son sayfaya iner; boş sayfa dönerse geriye doğru dener
  (`PurchaseDeliveryNotesPage.tsx:128-156`).
- **Detay paneli** (`purchasing/purchaseDeliveryNotePanel.tsx:46-111`; seçim yokken "Özetini görmek için listeden bir irsaliye
  seçin.", `:113-115`): üst kod, tedarikçi, etiket, Aç, kapat. Sekmeler **Özet** (belge tarihi, sipariş, mal kabul ya da
  "Bağlantısı yok", satır sayısı + zincir sipariş → bu irsaliye → mal kabul, `:95-106, 32-38`) ve **Satırlar** ("Sipariş satırı
  N" · "miktar birim"; `GET /{id}` panel açıkken satır değişince, `:80-92`; `PurchaseDeliveryNotesPage.tsx:538-544`).
- **Belge (kayıtlı irsaliye)** (`purchase-delivery-notes/components/DeliveryNoteDocument.tsx:35-119`): başlık "Tedarikçi
  irsaliyesi", kod = irsaliye no, alt başlık tedarikçi, durum = türetilmiş etiket, meta tarih; **durum akışı yok**. Yan panel
  "Belge zinciri" (sipariş → bu irsaliye → mal kabul). "İrsaliye bilgileri" (sipariş, tedarikçi, tarih, mal kabul ya da
  "Bağlantısı yok"). "Satırlar" ızgarası `purchase-delivery-note-lines` görünümüyle: sipariş satırı, "miktar birim" (`:91-101`),
  boşsa "Satır ayrıntısı bulunamadı.", yüklenirken "İrsaliye ayrıntısı yükleniyor…". Alt not: "İrsaliye kaydı stok hareketi
  oluşturmaz. Stok girişi bağlı mal kabulde kaydedilir; irsaliye durumu ayrıca yönetilmez." İpucu "Alt+İ işlemler"
  (`sales/salesDocumentDetail.tsx:172`).
- **Oluşturma görünümü** ("Yeni tedarikçi irsaliyesi", `DeliveryNoteCreateView.tsx:35-66`). Belge başlığı: tür "Tedarikçi
  irsaliyesi", kod = yazılan irsaliye no, taraf = sipariş tedarikçisi. Durum satırı: sipariş seçiliyse "SA-… · Tedarikçi ·
  miktarlar sipariş satırının temel biriminde girilir.", değilse "İrsaliye siparişe bağlanır; mal kabul stok girişinin tek
  kaynağıdır."; sağda sabit "Bu kayıt stok veya muhasebe hareketi oluşturmaz." Bölümler:
  1. **Satın alma siparişi** (`OrderSelectionPanel.tsx:35-99`): arama kutusu (Enter **arar, kaydetmez**, `:47-52`) + "Ara" +
     "Yenile"; "Sipariş" seçimi (`kod · tedarikçi · durum` — durum **İngilizce enum** metni, `:69`), sayfa göstergesi
     "1–25 / N sipariş", Önceki/Sonraki (`:74-98`). Seçenekler sunucu sayfasından istemcide süzülür: `Cancelled`,
     `PendingApproval`, `Rejected` hariç (`PurchaseDeliveryNotesPage.tsx:372-375`). Sipariş değişince belge no, bildirim ve
     açık belge temizlenir (`:329-340`).
  2. **Belge Kimliği** (`DeliveryNoteComposePanel.tsx:40-81`): "Tedarikçi irsaliye numarası *" (mono, ≤ 80), "Belge tarihi *"
     (varsayılan bugün, `PurchaseDeliveryNotesPage.tsx:90`), "Mevcut mal kabul (isteğe bağlı)" seçimi: "Sonradan bağlayacağım"
     + siparişin `Posted` ve başka irsaliyeye bağlanmamış mal kabulleri ("MK-… · yyyy-aa-gg", `:68-78`).
  3. **İrsaliye Satırları** (`:82-140`; görünüm `purchase-delivery-order-lines`): sipariş satırı, ürün "kod · ad", sipariş miktarı
     "miktar birim", **"İrsaliye miktarı · sipariş birimi"** sayı girişi (`min 0`, `max` = sipariş miktarı, `step 0.0001`,
     `:111-125`). Mal kabul seçiliyse not: "Mal kabul bağlantısında tüm irsaliye satırları ile mal kabul satırları ve temel
     birim miktarları bire bir eşleşmelidir." (`:134-139`).
  4. **Bu siparişin irsaliyeleri** (`OrderDeliveryNotesPanel.tsx:29-118`; görünüm `purchase-order-delivery-notes`): belge no,
     tarih (**ham ISO**, `:53-54`), satır, mal kabul ya da "Bekliyor" (`:58`), "Bağlantı işlemi" sütunu: bağlıysa "Bağlantıyı
     kaldır" (tehlike, **onaysız**, `:59-67`); değilse mal kabul seçimi + "Bağla" (seçim yoksa pasif, `:69-101`). Seçim
     **Belge Kimliği'ndeki mal kabul seçimiyle aynı durumu paylaşır** (`receiptId`, `PurchaseDeliveryNotesPage.tsx:606, 622-624`).
     Boşsa "Bu sipariş için irsaliye yok."
- **Doğrulamalar (istemci):** miktarı > 0 olan satırlar gönderilir; hiçbiri yoksa "İrsaliyeye en az bir satır miktarı girin."
  (`:382-397`). Belge no ve tarih `required`. Kaydedince bildirim: mal kabulle "İrsaliye kaydedildi ve stok hareketi
  oluşturmadan mal kabul ile mutabık hale getirildi.", değilse "İrsaliye kaydedildi; stok girişi mal kabul işleminde yapılır."
  (`:416-419`); belge no ve miktarlar temizlenir, liste aramasız 1. sayfaya döner, sipariş yeniden okunur (`:420-425`).
  Bağla: "İrsaliye mal kabule bağlandı; yeni stok hareketi oluşturulmadı." (`:451-453`). Kaldır: "Mal kabul bağlantısı
  kaldırıldı; irsaliye kaydı korundu." (`:478`). Yazma sonrası sipariş yeniden okuması hata verirse ayrı hata alanına yazılır
  (`mutationOrderError`, `:210, 223`); sipariş değiştiyse sonuç bildirimi gösterilmez (`orderSelectionGeneration`, `:368-371`).
- **Durum akışı:** yok. Türetilmiş iki durum: bağlı / bağlantısız.

#### 1.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, sayfa değişimi, Yenile | `GET /api/purchasing/delivery-notes/` | `page`, `pageSize=25` | `erp.purchase-delivery-notes.read` + sipariş satır kuralı | `PurchaseDeliveryNoteEndpoints.cs:89-114`; `pageSize` 1–100; varsayılan 50; tarih ↓, oluşturma ↓; `PurchaseDeliveryNotePage{items, page, pageSize, totalCount}` (`:304-307`). Sıkıştırma için ek çağrılar (`:128-156`). |
| Arama (Enter) | aynı + `q` | `q`, `page`, `pageSize=25` | aynı | `:275-303` |
| Açılış | `GET /api/purchasing/orders/?q=&page=1&pageSize=25` | `q` | `erp.purchase-orders.read` (satır süzgeçli) | `PurchaseDeliveryNotesPage.tsx:170-193, 233-235`. **Liste görünümünde de** çağrılır; yalnız oluşturma görünümünde kullanılır. Sunucu `Program.cs:6461-6475`. |
| Açılış | `GET /api/screen-views/purchase-delivery-notes/active` | — | `erp.screen-views.read` | hata sessiz (`:239-252`) |
| Açılış | `GET /api/screen-views/{purchase-delivery-order-lines, purchase-order-delivery-notes, purchase-delivery-note-lines}/active` ×3 | — | aynı | hata sessiz (`:253-273`) |
| Panel açık, satır değişince | `GET /api/purchasing/delivery-notes/{id}` | — | `read` + sipariş görünürlüğü | `useSalesListPanel` (`:538-544`); `PurchaseDeliveryNoteView` + `lines` (`:134-149`) |
| Aç | `GET /api/purchasing/delivery-notes/{id}` | — | aynı | `:341-359` |
| Sipariş seçimi | `GET /api/purchasing/orders/{id}` + `GET /api/purchasing/delivery-notes/orders/{orderId}` (paralel) | — | `erp.purchase-orders.read` / `erp.purchase-delivery-notes.read` | `:195-231`; sipariş satırları ve **mal kabulleri** (`PurchaseOrderView.Receipts`, `Program.cs:6476-6519`); irsaliyeler satırlarıyla (`PurchaseDeliveryNoteEndpoints.cs:116-132`) |
| İrsaliyeyi kaydet | `POST /api/purchasing/delivery-notes/orders/{orderId}` | `{documentNumber, documentDate, lines[{orderLineNumber, quantity, unitCode}], purchaseReceiptId \| null}` | `erp.purchase-delivery-notes.create` | `:377-432`; `201` + `PurchaseDeliveryNoteView` (`:215-218`) |
| Bağla | `POST /api/purchasing/delivery-notes/{id}/link-receipt` | `{purchaseReceiptId}` | `…update` | `:434-462`; 204 |
| Bağlantıyı kaldır | `POST /api/purchasing/delivery-notes/{id}/unlink-receipt` | — | `…update` | `:464-487`; 204 |
| CSV / Excel (seçilenler) | — | — | — | istemcide, görünen sayfa |

Kullanılmayan uç noktalar: `GET /delivery-notes/search` (asistan, en çok 10, `:15-40`) ve `/search/details` (`:44-87`).

#### 1.3 Kurallar

- **Doğrulama (400):** belge no boş ya da > 80, tarih boş, satır 1–500 dışı, satır numarası ≤ 0, miktar ≤ 0, > 99.999.999.999.999,9999
  ya da > 4 ondalık → "Belge numarası ve en az bir pozitif, en fazla dört ondalık basamaklı miktar içeren satır gereklidir."
  (`PurchaseDeliveryNoteEndpoints.cs:155-159`). Aynı sipariş satırı iki kez → "Aynı sipariş satırı irsaliyede bir kez
  bulunabilir." (`:160-161`). Siparişte olmayan satır → "İrsaliye satırı sipariş satırlarıyla eşleşmiyor." (`:174-175`). Birim
  temel birim değilse `lines[n].unitCode` → "İrsaliye miktarı sipariş satırının temel biriminde girilmelidir." (`:176-181`).
- **İş kuralları (404/409):** sipariş görünmüyorsa 404 (`:164-168`). Sipariş `Cancelled`, `PendingApproval` ya da `Rejected` ise
  409 "Bu sipariş durumunda tedarikçi irsaliyesi kaydedilemez." (`:169-170`); `Received` siparişe irsaliye **kaydedilebilir**.
  Aynı siparişte aynı irsaliye no → 409 (`:182-184`). Satır miktarı **kalan irsaliyelenebilir** miktarı aşarsa 409 "Sipariş satırı N
  için irsaliye miktarı kalan X miktarını aşıyor." + `orderLineNumber`, `remainingQuantity` (`:185-194`). Kalan, mal kabule değil
  **önceki irsaliyelere** göre hesaplanır.
- **Mal kabul eşleşmesi** (`CheckReceiptMatchAsync`, `:270-286`): mal kabul firmada yoksa "Mal kabul bu firmada bulunamadı.",
  başka siparişinse "Mal kabul ve irsaliye aynı satın alma siparişine bağlı olmalıdır.", `Posted` değilse "Yalnızca işlenmiş mal
  kabule bağlantı kurulabilir.", başka irsaliyeye bağlıysa "Mal kabul başka bir tedarikçi irsaliyesine bağlanmış." Satırlar
  **bire bir** aynı sipariş satırları ve aynı temel birim miktarları olmalı (`PurchaseDeliveryNoteReconciliation.IsExactMatch`,
  `:314-323`). Hepsi 409.
- **Bağla:** boş GUID 400 "Mal kabul seçilmelidir." (`:225`). Zaten bağlıysa 409 "İrsaliye başka bir mal kabule bağlanmış;
  bağlantı değiştirilemez." (`:232`) — önce kaldırmak gerekir.
- **Kaldır:** bağ yoksa 204 (`:258`). Bağlı mal kabul iptal edilmek istenirse mal kabul tarafı 409 verir ("Mal kabule bağlı
  tedarikçi irsaliyesi var. Önce irsaliye bağlantısını kaldırın.", `Program.cs:6785-6786`). Yani iptal akışı irsaliye
  ekranından geçer.
- **Silme ve düzenleme yok.** İrsaliye ne silinir ne düzenlenir; uç noktası yoktur.
- **Denetim kaydı:** `purchase-delivery-note.recorded` (`:209-211`), `.receipt-linked` (`:239-241`), `.receipt-unlinked`
  (kaynak `"belgeNo · receiptId"`, `:261-263`).

#### 1.4 Roller

- **TenantAdmin:** her şey; sipariş satır süzgeci uygulanmaz (`PermissionStatusFilter.cs:15`).
- **TenantUser / TenantDeveloper:** `erp.purchase-delivery-notes.read/create/update` Allow kuralları **ve**
  `erp.purchase-orders.read` (sipariş seçici ve görünürlük için). Sipariş okuma kuralı durum/tedarikçi koşulluysa irsaliyeler de
  o kurala göre daralır. İşleyicilerde rol denetimi yok.

#### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `satinalma.irsaliye.*` işlemi yok** (`tests/IntegrationTests/ErpOperationCatalog.names.txt:51-54` yalnız
dört `satinalma.malKabul.*` adı içerir).

Yeni (önerilen; modül sabiti `PurchasingModule` "Satınalma" var, `ErpOperationCatalog.cs:68`):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.irsaliye.listele` | GET `/api/purchasing/delivery-notes` | query `q`, `page`, `pageSize` | list `PurchaseDeliveryNoteView`, `rowsPath "items"`, `MetaPaths [page, pageSize, totalCount]` | `lines` iç içe, sütun olmaz. Türetilmiş durum: G-P44. |
| `satinalma.irsaliye.getir` | GET `/api/purchasing/delivery-notes/{id}` | route `id` | record `PurchaseDeliveryNoteView` | belge başlığı |
| `satinalma.irsaliye.satirlari` | GET `/api/purchasing/delivery-notes/{id}` | route `id` | list `PurchaseDeliveryNoteLineView`, `rowsPath "lines"` | panel Satırlar sekmesi ve belge ızgarası |
| `satinalma.irsaliye.siparisIrsaliyeleri` | GET `/api/purchasing/delivery-notes/orders/{orderId}` | route `orderId` | list `PurchaseDeliveryNoteView` (`rowsPath` yok, dizi) | oluşturma görünümü "Bu siparişin irsaliyeleri" |
| `satinalma.irsaliye.olustur` | POST `/api/purchasing/delivery-notes/orders/{orderId}` | route `orderId`; body `documentNumber`*, `documentDate`*, `purchaseReceiptId`; `ListParameter<PurchaseDeliveryNoteWriteLine>("lines")` öğeleri `orderLineNumber`*, `quantity`*, `unitCode` | record `PurchaseDeliveryNoteView` | `BodyParameters` `lines`'ı atlar, liste ayrıca eklenir (transfer gibi). Satır ızgarası G-P40/G-P42. |
| `satinalma.irsaliye.malKabulBagla` | POST `/api/purchasing/delivery-notes/{id}/link-receipt` | route `id`; body `purchaseReceiptId`* | none | 204; `pageKind "update"` |
| `satinalma.irsaliye.malKabulBaglantisiKaldir` | POST `/api/purchasing/delivery-notes/{id}/unlink-receipt` | route `id` | none | 204; `pageKind "update"`, onay önerilir (G-P43) |

Sipariş bağlamı için (Kısım B ile tekilleştirildi; geçerli adlar baştaki "İşlem adı kararları" tablosundadır):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.siparis.listele` | GET `/api/purchasing/orders` | query `q`, `page`, `pageSize` | list `PurchaseOrderSummary`, `rowsPath "items"`, meta | sipariş seçici (`lookup`, sunucu araması) |
| `satinalma.siparis.getir` | GET `/api/purchasing/orders/{id}` | route `id` | record `PurchaseOrderView` (skalerler: kod, tedarikçi, durum, döviz, toplamlar) | oluşturma görünümü başlığı ve mal kabul zincirindeki sipariş durumu rozeti (G-P48) |
| `satinalma.siparis.satirlari` | GET `/api/purchasing/orders/{id}` | route `id` | list `PurchaseOrderLineView`, `rowsPath "lines"` | irsaliye ve mal kabul satırları |
| `satinalma.siparis.malKabulleri` | GET `/api/purchasing/orders/{id}` | route `id` | list `PurchaseReceiptSummary`, `rowsPath "receipts"` (+ `Flatten ["invoice"]` isteğe bağlı) | bağlanacak mal kabul seçenekleri (`status == 'Posted'`), fatura girişi önizlemesi değil |

Gereken yeni `Labels` kodları (yalnız sonuç sütunları ve liste öğeleri; `BodyParameters` ve rota parametreleri `Label()`
çağırmaz, `ErpOperationCatalog.cs:446-447`): `documentNumber`, `documentDate`, `supplierName`, `purchaseReceiptCode`,
`orderLineNumber`; sipariş işlemleri için `supplierId`, `orderDate`, `currencyCode`, `grandTotal`, `expectedReceiptDate`,
`targetWarehouseId`, `lineNumber`, `stockCode`, `stockName`, `unitPrice`, `discountPercent`, `vatPercent`, `lineSubtotal`,
`discountAmount`, `taxAmount`, `lineTotal`, `receivedQuantity`, `remainingQuantity`. Var olanlar: `id`, `code`, `createdAt`,
`purchaseOrderId`, `purchaseOrderCode`, `purchaseReceiptId`, `lineCount`, `unitCode`, `quantity`, `stockItemId`, `status`,
`warehouseId`, `warehouseName`, `receiptDate` (`ErpOperationCatalog.cs:72-120`).

#### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → oluşturma `dialog` xl ya da sayfa içi bölüm, Aç → belge `dialog`, Sil `disabledReason`,
`moreButtons` "Siparişi aç", `titleCount {{irsaliyeler.meta.totalCount}}`, `exportCsv`), `filterBar` (`searchParam q`),
`dataTable` (sunucu sayfalama 25, `columnFormats` tarih/kod, `rowActions`, `showSelectedExport`), `metric` + `countWhen`
(`irsaliyeler.satir.purchaseReceiptId == null`, "bu sayfa"), `contextPanel` + `tabs` (Özet / Satırlar), `recordHeader` (belge
üst bilgisi), `text` (stok etkisi notları), `formCard` + `input` (`lookup` sipariş, `date`, `select` mal kabul,
`optionsWhen` ile `status == 'Posted'`), `dialog` (`size: "xl"`, `TenantCustomPage.tsx:1162-1163`, `custom-page/PageDialog.tsx:7`).

Eksikler:

- **G-P40 Sipariş satırlarıyla ön dolu miktar ızgarası (`fark`; ön dolu biçim için `eksik`).** İrsaliye satırları siparişin
  satırlarıdır; her satırda yalnız "İrsaliye miktarı" düzenlenir (`DeliveryNoteComposePanel.tsx:100-130`). Aynı desen siparişe
  bağlı mal kabulde de var (kalan miktar + birim + miktar + konum, `SalesPage.tsx:8124-8200`). `stage` kipi kaynak satırları salt
  okunur çizer, `list` kipi kaynak almaz (bkz. §0), yani **ön dolu** ızgara bugün kurulamaz.
  - **v1 yolu (`fark`, engelleyici değil):** transfer standardındaki gibi `gridMode: "list"` + "Kalem ekle"
    (`inventory-transfers.json:129-134`): `orderLineNumber|Sipariş satırı|lookup:siparisSatirlari:lineNumber:stockCode:stockName|required,unique`
    + `quantity|İrsaliye miktarı|number|required,min:0.0001,step:0.0001` + `minRows: 1`. Yalnız eklenen satırlar gönderilir,
    bu yüzden kısmi irsaliye çalışır ve G-P42 bu yolda **doğmaz**. Birim gönderilmez; sunucu boş birimi sipariş satırının birimiyle
    doldurur (`PurchaseDeliveryNoteEndpoints.cs:178`). Seçim hücresi değeri metin olarak gider (`custom-page/gridState.ts:251-266`);
    `int` alana `"3"` metninin Web JSON varsayılanıyla (`AllowReadingFromString`) okunması ve `int` değer sütunlu `lookup`'ın
    çalışması **doğrulanmalı**. Kayıp: kullanıcı satırları tek tek ekler, sipariş/kalan miktarı ızgarada görmez (seçenek açıklaması
    ya da yanında salt okunur `dataTable` ile gösterilebilir), `max` kuralı yok (sunucunun 409'u, `:192-193`).
  - **Eski görünüme eşdeğer yol (`eksik`, motor):** `gridMode: "stage"` + `editableSourceColumns: ["quantity"]` (kaynak satır
    hücresi düzenlenir; tel biçimine kaynak satırın `rowKey`'i ve bildirilen sütunlar girer) ya da `gridMode: "fill"` (kaynak
    satırlar bir kez `list` satırlarına kopyalanır, sipariş değişince sıfırlanır) ve satır başına `max`'ın kaynak sütuna bağlanması.
    Bu yol seçilirse G-P42 gerekir.
- **G-P41 Sipariş bağlamı ve iç içe listeler (`eksik`).** Oluşturma görünümü siparişin satırlarını ve mal kabullerini tek
  `GET /api/purchasing/orders/{id}` yanıtından okur (`PurchaseDeliveryNotesPage.tsx:212-215`). Sistem sayfasında bu üç ayrı
  işlem ister (`satinalma.siparis.satirlari`, `…malKabulleri`, `satinalma.irsaliye.siparisIrsaliyeleri`); aynı uç nokta iki kez
  çağrılır (`fark`, performans). Sipariş seçici eski ekranda `select` + elle sayfalama; sistem sayfasında sunucu aramalı `lookup`
  (`minChars`) daha iyidir. Uygun olmayan durumlar istemcide süzülür (`:372-375`); `optionsWhen "satir.status != 'Cancelled' &&
  …"` ile karşılanır, ama süzme yüklenen seçenek sayfasındadır (`fark`, G-TR4/G-K3 ile aynı). Seçenek etiketi İngilizce
  durum yerine `valueLabels`'la Türkçe gösterilebilir (iyileştirme).
- **G-P42 Sıfır miktarlı satırların atlanması (`eksik`, yalnız ön dolu ızgarada).** Eski ekran yalnız miktarı > 0 satırları gönderir
  (`PurchaseDeliveryNotesPage.tsx:382-393`; mal kabulde `SalesPage.tsx:6267-6268`). Sunucu ≤ 0 miktarı **400** ile reddeder
  (`PurchaseDeliveryNoteEndpoints.cs:157`, `PlatformContracts.cs:1306-1307`). G-P40'ın ön dolu biçimi tüm sipariş satırlarını
  göndereceği için kısmi irsaliye kaydedilemez ("Kalem ekle" biçiminde sorun yok). Öneri: ızgaraya `omitRowsWhen: "satir.quantity == null || satir.quantity <= 0"`
  benzeri tel süzgeci ve "en az bir dolu satır" kuralı (eski "İrsaliyeye en az bir satır miktarı girin." iletisi). `minRows`
  satır sayısını sayar, dolu satırı saymaz.
- **G-P43 Mal kabul bağla / kaldır (`fark`).** Eski ekran bağlamayı oluşturma görünümünde satır içi seçim + "Bağla" ile yapar ve
  seçim Belge Kimliği'yle paylaşılır (`OrderDeliveryNotesPanel.tsx:69-101`). Öneri: "Bu siparişin irsaliyeleri" tablosunda iki
  `rowActions`: "Bağla" → küçük `dialog` (mal kabul `lookup`, `optionsQuery` = `satinalma.siparis.malKabulleri`, `optionsWhen
  "satir.status == 'Posted'"`; "başka irsaliyeye bağlı olmayan" koşulu ifade edilemez, sunucu 409'u gösterilir), "Bağlantıyı
  kaldır" → `confirmEnabled` (eski ekran onaysızdır; onay eklemek **olumlu** fark). `visibleWhen` ile `purchaseReceiptId` boş /
  dolu ayrımı. Paylaşılan seçim davranışı düşer. Liste ve belgeden doğrudan bağla/kaldır eklemek ayrı karardır (eski ekranda yok).
- **G-P44 Türetilmiş bağlantı durumu (`eksik` küçük).** Durum sütunu kiracı görünümünde olmayan, `purchaseReceiptId`'den türeyen
  bir sütundur (`DeliveryNotesListPanel.tsx:12-18, 92-96`). `valueLabels`/`toneMap` değer eşler, `null`'ı "Bağlantısı yok"a
  eşleyip eşleyemediği **doğrulanmalı**. Öneri: `PurchaseDeliveryNoteView`'e hesaplanan `LinkStatus` (`Linked`/`Unlinked`) alanı
  ve yeni işlem adı (katalog adları kalıcıdır, `ErpOperationCatalog.cs:56-59`); ya da `fark`: "Mal kabul" sütunu boşsa "—" ve
  rozet yok. Kart sayımı `countWhen` ile kurulur.
- **G-P45 Arama ve sayfa davranışı (`fark`).** Arama Enter ile uygulanır, ayrı sayfa durumu tutar, başlık sayacı arama dışı
  toplamı gösterir, boş sayfada geri gider (`PurchaseDeliveryNotesPage.tsx:84-87, 128-156, 638-640`). Sistem sayfasında arama
  `searchParam` ile tek sorgu, sayaç `meta.totalCount` (aramalı toplam). Liste görünümünde sipariş listesinin gereksiz yüklenmesi
  düşer (olumlu).

Ortak eksiklere atıf: dışa aktarım yalnız görünen sayfa (G-C5), ızgara klavyesi ve Ctrl+. (G-C19), boş durum metinleri tek
`emptyText` (G-TR12), İngilizce sözlük testleri (`purchasing/purchaseReceipts.test.tsx:376-390`; G-C25).

#### 1.7 Görünüm anahtarları

- `purchase-delivery-notes` → `documentNumber`, `documentDate`, `purchaseOrderCode`, `supplierName`, `lineCount`,
  `purchaseReceiptCode`, `actions` (sabit) (`TenantScreenViewEndpoints.cs:363-369`). Bire bir eşlenir; `actions` aktarılmaz;
  `receiptLinkStatus` görünümde yoktur.
- `purchase-delivery-order-lines` → `lineNumber`, `product` (kod · ad birleşik), `orderedQuantity`, `deliveryQuantity` (sabit)
  (`:370-375`). `product` iki sütuna (`stockCode`, `stockName`) ya da `columnUnits` ile tek sütuna eşlenir; `orderedQuantity` →
  `quantity`.
- `purchase-order-delivery-notes` → `documentNumber`, `documentDate`, `lineCount`, `purchaseReceiptCode`, `actions` (`:376-381`).
- `purchase-delivery-note-lines` → `orderLineNumber`, `quantity` (`:382-385`).

---

### 2. Mal kabulleri (`sales-purchase-receipts`)

`PurchaseReceiptsScreen.tsx:42-46`: liste tipi; tek tık satırı seçer, çift tık / Enter / Aç / numara bağlantısı belgeyi açar.
Listede **sunucu araması yoktur**. Mal kabul **sipariş ayrıntısından** kaydedilir; siparişsiz mal kabul **Yeni** ile açılan
kendi ekranındadır.

#### 2.1 Yerleşim

- **Başlık:** "Mal kabulleri", açıklama "Tedarikçi siparişlerinden depoya giren mal kabul belgelerini inceleyin.", sayaç =
  sunucu toplamı (`:313-317`). Sekme adı App'te "Mal Kabulleri" (`App.tsx:649`).
- **Özet kartı** (`:318-328`):

| Kart | Değer | Kaynak |
|---|---|---|
| İptal (`CircleSlash`) | `status == 'Voided'` satır sayısı, ipucu "bu sayfa" | yüklenen sayfa (aramadan **önceki** satırlar, `items`) |

- **Uyarı şeridi:** hata, kapatılabilir (`:341-348`). Ayrıca SalesPage şeridi (§0).
- **İşlem çubuğu** (`:226-265`; açık fatura penceresi ve Yeni ekranı çubuğu kendisi yönetir, `:294`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil, belge açık değilken) | F2 | Açık belgeyi kapatır, **siparişsiz mal kabul** ekranını listenin yerine açar (`:235-241`). |
| Aç | Enter | Odaklı satır / güncel satır / tek işaretli; yoksa "Önce bir kayıt seçin"; açılırken "Açılıyor…" (`:256-262`). |
| Sil | Ctrl+Delete | Her zaman pasif. Neden: seçim yoksa "Önce bir kayıt seçin"; `Posted` ise "Kabul edilmiş belge silinemez — iptal sipariş belgesinden yapılır"; `Voided` ise "Mal kabul kaydı silinemez" (`:244-250`). |
| Yenile / Süz / Dışa aktar (belge açıkken) | | `documentOpenCommands` (`:252`). |
| İşlemler → Alış faturasını aç | | Yalnız belge açıkken ve mal kabulün etkin faturası varsa (`:253-254`). `PurchaseInvoiceModal`'ı açar (depolar ilk seferde yüklenir, `:176-189, 403-411`). |
| İşlemler → CSV olarak dışa aktar | | Liste görünümünde, görünen sayfa (`:263`). |

- **Süzgeç çubuğu** (`:329-340`): arama "Bu sayfada ara: mal kabul, sipariş veya depo" — **yalnız yüklenen sayfada**, kod +
  sipariş kodu + depo adında `tr` küçük harfle (`:146-153`); sunucuya `q` gitmez (test `purchaseReceipts.test.tsx:171-180`).
  Yenile (yüklenirken etkisiz), detay paneli anahtarı (Ctrl+.).
- **Liste sütunları** (varsayılan `:59-78`, sunucu `TenantScreenViewEndpoints.cs:356-362`; hücreler `:194-224`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Mal kabul no | mono bağlantı düğmesi, belgeyi açar |
| `purchaseOrderCode` | Tedarikçi siparişi | mono kod |
| `receiptDate` | Kabul tarihi | gg.aa.yyyy |
| `warehouseName` | Depo | metin |
| `lineCount` | Satır | sayı |
| `status` | Durum | "Kabul edildi" (ok) / "İptal" (off) (`purchasing/purchaseReceiptDocument.tsx:54-56`, `document-page/documentStatus.ts:99-106, 9`) |
| `actions` | İşlemler | sabit, çizilmez (`:141-143`) |

  Tedarikçi **sütunu yoktur** (liste yanıtında `supplierName` yok, `PlatformContracts.cs:560-563`).
- **Izgara:** işaret sütunu, güncel satır, çift tık = aç, toplu "Excel (seçilenler)" (`:365-374`). Sayfa 25 (`:35`). Genişlikler
  `:38-40`.
- **Boş durumlar:** "Mal kabulleri yükleniyor…", "Henüz mal kabul yok. Kabul, satın alma siparişi ayrıntısından kaydedilir.",
  "Bu sayfada aramanızla eşleşen mal kabul yok." (`:358-361`).
- **Detay paneli** (`purchaseReceiptDocument.tsx:77-155`; boşken "Özetini görmek için listeden bir mal kabul seçin."): veri
  **bağlı siparişin ayrıntısından** gelir (`GET /api/purchasing/orders/{purchaseOrderId}`, `PurchaseReceiptsScreen.tsx:267-274`).
  Üst: kod, başlık = sipariş tedarikçisi, durum etiketi. **Özet:** sipariş, depo, kabul tarihi, satır sayısı, alış faturası
  (kod; yoksa `Posted` için "Henüz faturalanmadı", `Voided` için "—") + zincir sipariş → bu mal kabul → alış faturası
  (`:98-102, 132-150`). **Satırlar:** stok adı, kod, "miktar birim" (`:120-129`).
- **Belge (kayıtlı mal kabul)** (`purchaseReceiptDocument.tsx:165-253`): başlık "Mal kabul", kod, alt başlık tedarikçi, durum,
  meta tarih, **durum akışı** "Kabul edildi" (tek adım) + son durum "İptal" (`:59-67`). Yan panel "Belge zinciri": sipariş
  (sipariş durumu rozetiyle), bu mal kabul, alış faturası (fatura durumuyla; tıklayınca faturayı açar, `:178-184`). "Mal kabul
  bilgileri": sipariş, tedarikçi, depo, kabul tarihi, alış faturası (`:204-216`). "Satırlar" tablosu (kiracı görünümü **yok**,
  sabit): #, stok kartı (kod + ad), sipariş satırı, kabul miktarı "miktar birim" (temel birim) (`:219-249`); boşsa "Satır yok."
  Konum, lot/seri, girilen birim **gösterilmez**.
- **Siparişe bağlı mal kabul formu (sipariş belgesinde; yerleşim Kısım B)** — burada yalnız kuralları
  etkileyen parçalar: "İşlemler → Mal kabul ekle" sipariş `Received`/`Cancelled` değilse (`SalesPage.tsx:7274-7284, 5277-5278`).
  Form "Mal kabul" (`ownSave`, kendi Kaydet'i "Mal kabul kaydet", `:8002-8022`): Mal kabul tarihi *, Depo (aranabilir, etkin;
  varsayılan ilk etkin depo, `:5260-5263`), özel alanlar (siparişin aynı kodlu özel alan değerleriyle ön dolu, `:5265-5274`),
  "Kabul Edilen Kalemler": yalnız kalan > 0 sipariş satırları; stok, kalan sipariş, birim seçimi (ana birim + etkin çevrimler)
  + miktar, depo konumu (`:8124-8200`). Lot/seri **kayıt sırasında ardışık istemlerle** sorulur: seri için çok satırlı liste,
  lot için kod sonra SKT (yyyy-aa-gg); istemden vazgeçmek "Mal kabul iptal edildi." hatası verir (`:6283-6327`). Satır listesinde
  `Posted` ve faturasız mal kabul için "İptal et" (tehlike onaylı: "… İptal stok bakiyesini negatife düşürmemelidir.",
  `:6365-6393, 5086-5098`) ve "Fatura oluştur" (kod + tarih, `:5068-5080, 6394-6424`).
- **Siparişsiz mal kabul alt ekranı (Yeni)** (`StandaloneFulfillmentPanel.tsx`, `sales=false`): liste yerine açılır
  (`PurchaseReceiptsScreen.tsx:295-310`); Vazgeç listeye döner ve listeyi yeniler (test `purchaseReceipts.test.tsx:215-237`).
  - Çubuk: Yeni = taslağı temizle (kirliyse sorar, `:462-471`); form Kaydet'i ("Taslak oluştur" / düzenlemede "Taslağı
    güncelle", `:495`); Temizle menüde.
  - Başlık "Siparişsiz satın alma mal kabulü" (`:488-492`), durum satırı "Birim maliyeti girin; fatura geldiğinde maliyet farkı
    işlenir." + "Satır: n" (`:503-512`).
  - **Mal Kabul Kimliği:** Mal kabul kodu * (mono, ≤ 40, yer tutucu "MK-2026-001"), Tedarikçi * (aranabilir; etkin ve türü
    `Customer` olmayan cariler, `:107-110, 534-552`), Depo * (etkin; değişince satır konumları temizlenir, `:553-577`), Tarih *
    (`:578-588`).
  - **Mal Kabul Satırları** (`:644-705`): "Satır ekle" (Ctrl+Shift+Enter); her satırda Stok kartı (aranabilir), Miktar, Depo gözü
    (depoda konum varsa, isteğe bağlı), Birim maliyet (temel birim, ≥ 0, 8 ondalık), takipli stokta Lot / seri kodu (≤ 80) ve
    lot'ta Son kullanma tarihi. Birim her zaman stok kartının ana birimidir (`:166-167`).
  - **Taslak listesi** (form altında, `:708-770`): "kod · tedarikçi", "tarih · n satır · Kaydedildi/Taslak/İptal"; Taslak için
    Düzenle, "Kaydet ve stoğa işle", "Taslağı sil" (onaylı); Kaydedildi için "Ters hareketle iptal et" (onaylı, `:359-398`). Liste
    `?page=1&pageSize=100`, sayfalama yok (`:114-125`).
  - Bu kayıtlar **ayrı varlıktır** (`StandalonePurchaseReceipts`) ve Mal kabulleri listesinde **görünmez** (liste
    `PurchaseReceipts`'i okur, `:6649`). Faturası "Bağımsız fatura taslakları"ndan girilir (`PurchaseInvoiceDraftEndpoints.cs:37`).

#### 2.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış (SalesPage) | satış teklif/sipariş/fatura ve cari **tüm sayfalar**, `GET /api/stock/items/?page=1&pageSize=100`, `GET /api/warehouses/` | — | ilgili `read` izinleri | `SalesPage.tsx:625-646` (G-P58) |
| Açılış, sayfa değişimi, Yenile | `GET /api/purchasing/receipts/?page=&pageSize=25` | `page`, `pageSize` | `erp.purchase-receipts.read` (**süzgeçsiz**) | `PurchaseReceiptsScreen.tsx:98-116`; sunucu `:6646-6657`: tarih ↓, oluşturma ↓; `PurchaseReceiptPage` |
| Açılış | `GET /api/screen-views/purchase-receipts/active` | — | `erp.screen-views.read` | hata sessiz (`:117-137`) |
| Panel açık, satır değişince | `GET /api/purchasing/orders/{purchaseOrderId}` | — | `erp.purchase-orders.read` | `:267-274`; mal kabulün satırları ve faturası sipariş yanıtındaki `receipts[]`'ten (`Program.cs:6489-6508`) |
| Aç | aynı | — | aynı | `:159-175`; mal kabul siparişte bulunamazsa "Mal kabul bulunamadı." |
| Alış faturasını aç | `GET /api/warehouses/` (ilk sefer) + `PurchaseInvoiceModal`: `GET /api/purchasing/invoices/{id}`, `GET /api/finance/accounts`, `GET /api/purchasing/orders/{id}`, … | — | `erp.purchase-invoices.read` … | `:176-189`; pencere Satınalma Faturaları envanterinin konusudur (`PurchaseInvoiceModal.tsx:114-390`) |
| Yeni ekranı: açılış | `GET /api/purchasing/standalone-receipts/?page=1&pageSize=100` | — | `erp.purchase-receipts.read` (durum/tedarikçi süzgeçli) | `StandaloneFulfillmentPanel.tsx:114-125`; sunucu `StandaloneInventoryDocumentEndpoints.cs:93-106` |
| Yeni ekranı: depo seçilince | `GET /api/warehouses/{id}/locations` | — | `erp.warehouses.read` (doğrulanmalı) | etkinler süzülür (`:127-147`) |
| Taslak oluştur / güncelle | `POST /api/purchasing/standalone-receipts/` / `PUT …/{id}` | `{requestId (her gönderimde yeni), code, customerId, supplierId, warehouseId, receiptDate, lines[{stockItemId, quantity, unitCode, unitCostBase, trackingCode, expiryDate, storageLocationId}]}` | `create` / `update` | `:148-203`; sunucu `:107-143, 144, 326-368` |
| Düzenle | `GET …/standalone-receipts/{id}` | — | `read` | `:204-247` |
| Kaydet ve stoğa işle | `POST …/{id}/post` | `{}` | `execute` (`post` listede) | `:272-292`; sunucu `:370-403` |
| Taslağı sil / Ters hareketle iptal et | `DELETE …/{id}` / `POST …/{id}/void` | — | `delete` / `execute` | `:359-398`; sunucu `:154-161, 454-484` |
| *(sipariş belgesinde)* Mal kabul kaydet | `POST /api/purchasing/orders/{id}/receipts` | `{requestId, warehouseId, receiptDate, customFields{kod: değer}, lines[{orderLineNumber, quantity, unitCode, tracking[{trackingCode, quantity, expiryDate?}], storageLocationId}]}` | `erp.purchase-orders.create` (doğrulanmalı) | `SalesPage.tsx:6246-6363`; sunucu `Program.cs:6521-6644` |
| *(sipariş belgesinde)* İptal et | `POST /api/purchasing/receipts/{id}/void` | — | `erp.purchase-receipts.execute` | `SalesPage.tsx:6365-6393`; sunucu `:6766-6836` |
| *(sipariş belgesinde)* Fatura oluştur | `POST /api/purchasing/receipts/{id}/invoice` | `{code, invoiceDate}` | `erp.purchase-receipts.create` (G-P47) | `SalesPage.tsx:6394-6424` |
| *(sipariş belgesinde)* konumlar, birimler, özel alan tanımları | `GET /api/warehouses/{id}/locations`, `GET /api/stock/items/{id}/units`, `GET /api/purchasing/receipts/custom-fields` | — | | `SalesPage.tsx:6228-6245`; tanımlar `Program.cs:6186-6191` |

Kullanılmayan uç noktalar: `GET /api/purchasing/receipts/{id}` (`DocumentListEndpoints.cs:113-140`: tedarikçi, depo, durum,
satırlar, etkin fatura özeti, özel alanlar) ve `GET /api/purchasing/receipts/search` (asistan, `PurchaseReceiptSearchEndpoints.cs:9-31`).

#### 2.3 Kurallar

- **Oluşturma doğrulaması (400)** (`PlatformContracts.cs:1290-1313`, `Program.cs`): istek anahtarı boş; depo boş; satır 1–100
  dışı; satır numarası ≤ 0; miktar ≤ 0 / > 4 ondalık; aynı sipariş satırı iki kez. Siparişte olmayan satır ("Mal kabul
  satırlarından biri siparişte bulunamadı.", `:6570-6572`). Etkin olmayan birim (`lines[n].unitCode`, `:6583-6584`). Temel birime
  çevrilen miktar geçersiz (`:6586-6588`). Konum firmaya/depoya ait değil (`lines.storageLocationId`, `:6565-6566`). Özel alan
  geçersiz/zorunlu (`customFields.<kod>`, `:6544-6553`; gönderilmeyen alan siparişin aynı kodlu değerinden alınır, `:6547-6548`).
  Takip dağılımı hatası (`lines[n].tracking`, `:6616-6617`).
- **Oluşturma iş kuralları (404/409):** sipariş yok 404; kapalı dönem 409 (`:6536-6538`); sipariş `Open`/`PartiallyReceived` değilse
  409 "Bu sipariş için yeni mal kabul yapılamaz." (`:6539-6540`, `PlatformContracts.cs:1124`); depo yok 404, pasif depo 409
  (`:6556-6558`); pasif konum 409 (`:6567-6568`); stok kartı yok/pasif 409 (`:6575-6577`); kalan miktar aşımı 409 "Sipariş satırı N
  için kalan miktar X." + `orderLineNumber`, `remainingQuantity` (`:6591-6595`); kur yok 409 (`:6596-6597`); birim maliyet
  decimal(18,8) aşımı 409 (`:6613-6614`); lot SKT değişimi / seri tekrarı 409 (`:6618-6624`). Belge kodu sunucuda numaralandırılır
  (`TenantDocumentNumbering.Internal.PurchaseReceipt`, `:6598`).
- **Stok etkisi:** satır başına giriş hareketi (depo, konum, maliyet, takip izleri; `:6625-6631`); sipariş durumu yeniden
  hesaplanır (`:6634-6636`).
- **İptal** (`:6766-6836`): kapalı dönem 409 (`:6776-6779`); `Voided` ise 409 "Mal kabul daha önce iptal edildi."; bağlı irsaliye
  409; yevmiyeye aktarılmışsa 409; etkin alış faturası varsa 409 "Mal kabul önce bağlı alış faturası iptal edilerek
  kapatılmalıdır."; ters kaydı olmayan ek maliyet varsa 409 (`:6784-6793`); stok hareketi önceden ters kaydedilmişse 409
  (`:6801-6803`); rezervasyon/negatif stok kuralı (`TenantOperationalSettings`) karşılanmazsa 409 + `stockItemId`,
  `currentBalance`, `reservedQuantity`, `requiredQuantity` (`:6804-6820`). Başarılıysa her hareket için ters `Issue`
  (bugünün tarihiyle, aynı maliyet, konum ve takip kopyası, `:6821-6827`), durum `Voided`, sipariş durumu yeniden hesaplanır
  (`:6828-6832`). Yanıt `{id, code, status, orderStatus}` (`:6835`). İptal idempotent değildir (ikinci istek 409).
- **Durum geçişleri:** `Posted` → `Voided` (tek yön; taslak yok). Sipariş: `Open` ↔ `PartiallyReceived` ↔ `Received`
  (`PlatformContracts.cs:1128-1133`).
- **Siparişsiz mal kabul:** taslak doğrulaması (kod 1–40, satır 1–200, stok, miktar, birim ≤ 8, takip kodu ≤ 80;
  `StandaloneInventoryDocumentEndpoints.cs:511-517`); birim maliyet ≥ 0 (`:112`); etkin tedarikçi (`:116-117`); etkin depo
  (`:118-120`); kod benzersiz (`:122`); takip kuralları (`:133-134`). Yalnız taslak düzenlenir/silinir (`:339`, `:158`). Kaydet:
  kapalı dönem, takip zorunluluğu (`:436-442`), `Receipt` hareketi kullanıcının maliyetiyle (`:443-449`). İptal: fatura taslağı
  muhasebeleştirilmişse 409 (`:476-479`), bakiye/rezervasyon yetmezse 409 (`:497-499`).
- **Denetim kaydı:** `purchase-receipt.posted` (`:6637`), `purchase-receipt.voided` (`:6833`); siparişsiz
  `purchasing.standalone-receipt.draft-created/draft-updated/draft-deleted/posted/voided` (`StandaloneInventoryDocumentEndpoints.cs:140, 365, 159, 400, 481`; satırlar
  doğrulanmalı); ek maliyet `inventory-landed-cost.posted/reversed` (`:6729, 6760`).

#### 2.4 Roller

- **TenantAdmin:** her şey; ek maliyet yalnız ona açık (ama bu ekranda ek maliyet yok).
- **TenantUser / TenantDeveloper:** liste için `erp.purchase-receipts.read` (satır kuralı **uygulanmaz**, tedarikçi kısıtlı
  kullanıcı tüm mal kabulleri görür). Panel ve Aç için ayrıca `erp.purchase-orders.read` (siparişi görünmeyen mal kabul
  açılamaz: `GET orders/{id}` süzgeçsizdir, ret yetki işleyicisinden **403** gelir, `PermissionAuthorizationHandler.cs:116-121`). Siparişsiz ekran `erp.purchase-receipts.read/create/update/delete/execute` (durum/tedarikçi
  koşulları burada **çalışır**, `PermissionAuthorizationHandler.cs:134-139`). İptal ve fatura oluşturmada durum/tedarikçi koşullu
  kurallar çalışmaz (G-P46).

#### 2.5 ERP işlem kataloğu

Var olan (`ErpOperationCatalog.cs:338-364`, `BuildStockCost`; adlar `names.txt:51-54`):

| Ad | Yöntem ve yol | Kullanıldığı yer | Not |
|---|---|---|---|
| `satinalma.malKabul.listele` | GET `/api/purchasing/receipts`, query `page`, `pageSize` (`:355-356`) | `inventory-cost.json:238` (`runOn: load`, **parametresiz** → sunucu varsayılanı 50) ek maliyet "Mal kabul" seçimi (`:169-172`, varsayılan `rows[0]`) | list `PurchaseReceiptSummary` skalerleri, `rowsPath "items"`, **`MetaPaths` yok** → `meta.totalCount` yok (G-P49). Yorum: "The list has no status filter" (`:354`). |
| `satinalma.malKabul.ekMaliyetler` | GET `…/receipts/{id}/landed-costs` (`:357-358`) | `inventory-cost.json:239` | list `InventoryCostAdjustmentView` |
| `satinalma.malKabul.ekMaliyetDagit` | POST `…/landed-costs`, body `entryDate`, `amountBase`, `allocationMethod`, `description` (`:359-360`) | `inventory-cost.json:241-247`; düğme `disabledWhen "ekMaliyetKabul.seciliSatir.status != 'Posted'"` (`:157-161`) | `requiresTenantAdmin` |
| `satinalma.malKabul.ekMaliyetTersKayit` | POST `…/landed-costs/{adjustmentId}/reverse`, body `reason` (`:361-363`) | `inventory-cost.json:248-252`, `visibleWhen kind == 'LandedCost' && hasReversal != true` (`:182-186`) | `requiresTenantAdmin` |

Bunlar Mal kabulleri ekranında bugün **kullanılmaz** (eski ekranda ek maliyet yok; ek maliyet `InventoryPage.tsx:1803-1963` ve
onun sistem sayfası `inventory-cost`'tadır). İsteğe bağlı iyileştirme: belgeye "Ek maliyetler" sekmesi (salt okunur
`ekMaliyetler`, TenantAdmin'e dağıt/ters kayıt) — eski ekranda olmadığı için karar gerektirir.

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.malKabul.sayfa` | GET `/api/purchasing/receipts` | query `page`, `pageSize` | list `PurchaseReceiptSummary`, `rowsPath "items"`, `MetaPaths [page, pageSize, totalCount]` | `listele`'nin meta'lı eşi (G-P49). `q`/`status` yok (G-P50). |
| `satinalma.malKabul.getir` | GET `/api/purchasing/receipts/{id}` | route `id` | record `PurchaseReceiptDetail`, `Flatten ["invoice"]` (record sonucunda `Flatten` doğrulanmalı) (`invoice.code`, `invoice.status`, `invoice.id` …) | panel ve belge (G-P48) |
| `satinalma.malKabul.satirlari` | GET `/api/purchasing/receipts/{id}` | route `id` | list `PurchaseReceiptLineView`, `rowsPath "lines"` | `storageLocationId` ve `tracking` bu yanıtta **boş** (`DocumentListEndpoints.cs:133-134`; doğrulanmalı) |
| `satinalma.malKabul.olustur` | POST `/api/purchasing/orders/{id}/receipts` | route `id`; body `requestId`*, `warehouseId`*, `receiptDate`*; map `customFields`; `ListParameter<PurchaseReceiptLineWriteRequest>("lines")` öğeleri `orderLineNumber`*, `quantity`*, `unitCode`, `storageLocationId` | record `PurchaseReceiptSummary` | `requestId` ← `autoId`. `tracking` öğe olamaz (G-P52). Sipariş belgesinde kullanılır. |
| `satinalma.malKabul.iptal` | POST `/api/purchasing/receipts/{id}/void` | route `id` | none (ya da adlandırılmış `{id, code, status, orderStatus}`) | `execute`; `pageKind "update"`, `confirmEnabled` tehlike tonu |
| `satinalma.malKabul.ozelAlanTanimlari` | GET `/api/purchasing/receipts/custom-fields` | — | list `PurchaseReceiptCustomFieldDefinitionView` | `customFieldsBlock` tanım sorgusu |
| `satinalma.malKabul.siparissiz.listele` | GET `/api/purchasing/standalone-receipts` | query `page`, `pageSize` | anonim satır (`id, code, supplierId, supplierName, warehouseId, warehouseName, date, status, lineCount, createdAt`) | anonim tip, `Columns<T>` için **adlandırılmış kayıt** gerekir (`StandaloneInventoryDocumentEndpoints.cs:103-104`). G-P51 |
| `satinalma.malKabul.siparissiz.getir` | GET `…/standalone-receipts/{id}` | route `id` | record | aynı not |
| `satinalma.malKabul.siparissiz.taslakOlustur` | POST `…/standalone-receipts` | `requestId`*, `code`*, `supplierId`*, `warehouseId`*, `receiptDate`*; `ListParameter<StandalonePurchaseReceiptLineWrite>("lines")` (`stockItemId`, `quantity`, `unitCode`, `unitCostBase`, `trackingCode`, `expiryDate`, `storageLocationId`) | record | eski gövdedeki `customerId` gereksizdir |
| `satinalma.malKabul.siparissiz.taslakGuncelle` | PUT `…/{id}` | aynı | record | |
| `satinalma.malKabul.siparissiz.taslakSil` | DELETE `…/{id}` | route `id` | none | |
| `satinalma.malKabul.siparissiz.kaydet` | POST `…/{id}/post` | route `id`; `fixedBody {}` | `{id, status}` | `execute` |
| `satinalma.malKabul.siparissiz.iptal` | POST `…/{id}/void` | route `id` | `{id, status, reversalCount}` | `execute` |

Gereken yeni `Labels` kodları: `supplierId`, `supplierName`, `orderLineNumber`, `stockCode`, `stockName` (satırlar),
`invoice.*` için iç kodlar `receiptCode`, `invoiceDate`, `dueDate`, `currencyCode`, `grandTotal`, `paidAmount`,
`outstandingAmount` (önek kendi etiketini kullanır, `ErpOperationCatalog.cs:437-438`); siparişsizde `date`, `unitCostBase`
(var), `trackingCode` (var), `expiryDate` (var), `reversalCount`. Var olanlar: `id`, `code`, `purchaseOrderId`,
`purchaseOrderCode`, `warehouseId`, `warehouseName`, `receiptDate`, `status`, `lineCount`, `createdAt`, `stockItemId`,
`unitCode`, `quantity`, `enteredQuantity`, `enteredUnitCode`, `storageLocationId`, `label`, `dataType`, `maxLength`, `version`,
`isRequired`, `isActive`.

#### 2.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → siparişsiz ekranı/`dialog` xl ya da `page`, Aç → belge `dialog`, Sil `disabledReason` (durumla:
`disabledWhen` + koşullu metin iki düğmeyle ya da tek genel neden), `moreButtons` "Alış faturasını aç" (`visibleWhen`
`invoice.id != null`), `titleCount`, `exportCsv`), `filterBar` (`search` + `searchColumns [code, purchaseOrderCode,
warehouseName]`, yüklenen satırlarda), `dataTable` (sunucu sayfalama 25, `valueLabels` Posted=Kabul edildi / Voided=İptal,
`toneMap`, `showSelectedExport`), `metric` + `countWhen status == 'Voided'`, `contextPanel` + `tabs`, `recordHeader`, `steps`
(Kabul edildi → İptal son durum; `steps` 2–6 etiket alır, `custom-page/StepsIndicator.tsx:7`, tek adım + akış dışı son durum
gösterimi **doğrulanmalı**, olmazsa `recordHeader` durum rozeti), `text`.

Eksikler:

- **G-P46 Siparişe bağlı mal kabulde kaynak öznitelikleri (`eksik`, sunucu).** `{id}` öznitelikleri yalnız siparişsiz tablodan
  çözülür (`PermissionAuthorizationHandler.cs:134-139`). Siparişe bağlı mal kabulün `void` ve `invoice` istekleri durum/tedarikçi
  koşullu kurallarla değerlendirilemez; `GET /api/purchasing/receipts` ve `/{id}` satır süzgeci uygulamaz (`:6646-6657`,
  `DocumentListEndpoints.cs:113`). Katalog `allowed` de öznitelik çözmediği için sunucuyla **aynı** kararı verir (ikisi de koşullu
  Allow kuralını eşleştiremez); sorun ayrışma değil, durum/tedarikçi koşullu kuralın bu kaynakta **hiç ifade edilememesidir**
  (G-C3'ten farklı). Öneri: çözümleyici önce `PurchaseReceipts`'e (sipariş
  tedarikçisi ve mal kabul durumu) bakmalı; liste için `PermissionStatusFilter` (tedarikçi = `PurchaseOrder.SupplierId`). Bu bir
  **güvenlik davranışı değişikliğidir** (bugün tedarikçi kısıtlı kullanıcı tüm mal kabulleri görür); ayrı karar.
- **G-P48 Belge ve panel kaynağı (`fark`).** Eski ekran mal kabulü siparişin ayrıntısından okur (`PurchaseReceiptsScreen.tsx:159-175,
  267-274`). Önerilen `satinalma.malKabul.getir` daha uygundur (tedarikçi, depo, satırlar, etkin fatura tek yanıtta), ama
  (a) zincirdeki **sipariş durumu rozeti** yoktur (`purchaseReceiptDocument.tsx:179`) — ikinci okuma (`satinalma.siparis.getir`)
  ya da `fark`; (b) siparişi okuyamayan kullanıcı artık mal kabulü **açabilir** (eskiden `GET orders/{id}` yetki işleyicisinde
  403 alırdı, `PermissionAuthorizationHandler.cs:116-121`) — davranış
  farkı, G-P46 kararıyla birlikte ele alınmalı; (c) yanıtta satır konumu yoktur (sipariş yanıtında vardı, `Program.cs:6497`),
  belge zaten göstermiyor.
- **G-P49 `satinalma.malKabul.listele` meta taşımıyor (`eksik`).** `MetaPaths` tanımsız (`ErpOperationCatalog.cs:355-356`),
  `titleCount` ve sunucu sayfalama toplamı kurulamaz. Var olan adın sonucunu değiştirmek yerine (adlar kalıcı, `:56-59`) yeni
  `satinalma.malKabul.sayfa`. Yan bulgu: `inventory-cost` ek maliyet seçimi parametresiz `listele` ile **en yeni 50** mal kabulü
  (iptaller dahil) gösterir (`inventory-cost.json:238`, sunucu varsayılanı `:6646`); eski ek maliyet ekranıyla karşılaştırılmalı
  (o ekranın envanteri).
- **G-P50 Arama ve süzgeç yalnız bu sayfada (`fark`).** Uç nokta `q`/`status` almaz; arama ve "İptal" kartı yüklenen 25 satırdadır
  (eski ekranla aynı). Tedarikçiye göre arama yoktur (sütun da yok). İstenirse sonraya ekleme amaçlı `q`/`status`/`supplierName`
  içeren yeni uç nokta ve işlem adı.
- **G-P51 Siparişsiz mal kabul alt ekranı (`eksik`, büyük).** Ayrı varlık, ayrı yol ailesi, taslak → kaydet → iptal yaşam döngüsü,
  satır başına maliyet ve takip, taslak listesi satır eylemleri (`StandaloneFulfillmentPanel.tsx:148-398, 708-770`). Liste yanıtları
  **anonim tiptir** (`StandaloneInventoryDocumentEndpoints.cs:103-104`), katalog `Columns<T>` için adlandırılmış görünüm kaydı
  gerekir. Satış tarafıyla ortak bileşendir (`sales=true` satış irsaliyesi). Öneri: v1'de Mal kabulleri standardında **Yeni →
  eski ekranda aç** (ya da ayrı `sales-purchase-standalone-receipts` standardı, satış eşiyle birlikte); işlemler tabloda
  `siparissiz.*` olarak sonraya. Yeniden deneme anahtarı `autoId` ile **iyileşir** (eskisi her gönderimde yeni).
- **G-P52 Siparişe bağlı mal kabulde lot/seri girişi (`eksik`, sipariş belgesi).** Satırın `tracking` listesi (seri başına bir kayıt,
  lot'ta kod + SKT) iç içe listedir; `ListParameter` öğesi olamaz (`ErpOperationCatalog.cs:454-458`). Eski ekran bunu kayıt anında
  **ardışık istemlerle** toplar (`SalesPage.tsx:6283-6327`). Öneri: (a) `PurchaseReceiptLineWriteRequest`'e skaler
  `TrackingCode` + `ExpiryDate` (lot ve tek seri) ve `TrackingCodes` (virgüllü seri listesi) ekleyip sunucuda `Tracking`'e
  çevirmek; ya da (b) ızgara satırında map/alt liste desteği. Ayrıca satır başına birim seçimi (`lookup` + satır kapsamlı
  `stok.kart.birimleri` — G-TR2'de çözülmüş desen, doğrulanmalı) ve konum (`depo.konumlari`, başlıktaki depoya bağlı). Takipli
  ürün yoksa (a)'sız da çalışır; takipli üründe sunucu 400 döner (`:6616-6617`).
- **G-P57 Alış faturası penceresi köprüsü (`eksik`).** "Alış faturasını aç" ve zincirdeki fatura bağlantısı yerinde
  `PurchaseInvoiceModal` açar (`PurchaseReceiptsScreen.tsx:176-189, 403-411`; 1046 satır: ödeme, iade, iptal). Sistem sayfasında
  karşılığı yok; `erpPage sales-purchase-invoices` yalnız `q` taşır (`navigationActions.ts:64-67`). Öneri: `erpPage` + `params
  {invoiceId}` ve Satınalma Faturaları ekranının sayfa parametresini okuması (G-C12/G-C13 ile aynı köprü sorunu); ara çözüm
  `queryText` = fatura kodu.
- **G-P58 SalesPage kabuğunun kaybolan/kazanılan yan etkileri (`fark`, olumlu).** Taşıma, açılıştaki toplu satış ve cari
  yüklemelerini (`SalesPage.tsx:625-646`) ve SalesPage hata şeridini kaldırır. Bağımlılık: siparişsiz alt ekran `customers`,
  `stockItems`, `warehouses`'ı buradan alıyordu; sistem sayfasında `cari.listele` (tür süzgeçli), `stok.kart.listele`, `depo.listele`
  ile sunucu aramalı seçimlere döner (iyileşme: bugün yalnız ilk 100 stok kartı seçilebilir, `:157-163`).

Ortak eksiklere atıf: G-C5 (dışa aktarım), G-C19 (klavye), G-TR12 (boş durumlar), G-C25 (İngilizce sözlük testi
`purchaseReceipts.test.tsx:376-390`).

#### 2.7 Görünüm anahtarları

- `purchase-receipts` → `code`, `purchaseOrderCode`, `receiptDate`, `warehouseName`, `lineCount`, `status`, `actions` (sabit)
  (`TenantScreenViewEndpoints.cs:356-362`). Bire bir eşlenir; `actions` aktarılmaz.
- `purchase-order-receipts` (`:32`) sipariş belgesinin mal kabul tablosudur (`SalesPage.tsx:5040-5098`; `invoice`, `actions`
  sütunları) — Kısım B.
- Belge satırları ve siparişsiz ekran için görünüm anahtarı yok.

---

### 3. Mal kabul faturası girişi (`sales-purchase-invoice-entry`)

İki görünüm: **liste** (faturalanmamış, işlenmiş, siparişe bağlı mal kabuller) ve **fatura formu** ("Mal kabul faturası girişi",
listenin yerine çizilir, `PurchaseInvoiceEntryPage.tsx:509-657`).

#### 3.1 Yerleşim

- **Başlık:** "Mal kabul faturası girişi", açıklama "İşlenmiş mal kabullerini seçin; fatura kaydı sipariş ve stok kabulüyle
  bağlantısını korusun.", sayaç sunucu toplamı, sayaç etiketi **"mal kabul fatura bekliyor"** (`:742-747`).
- **Özet kartı:** yok.
- **Uyarı / bildirim şeritleri:** hata ve bildirim, ikisi de kapatılabilir (`:772-783`). Kayıt bildirimi "AF-… alış faturası
  kaydedildi. Tedarikçi borcu 1.234,00 TRY." (`:455-457`) — ama hemen ardından ekran Satınalma Faturaları'na gider (G-P56).
- **İşlem çubuğu** (`:730-741`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Aç | Enter | Odaklı/güncel satır; yoksa "Önce bir kayıt seçin". Fatura formunu açar (`:502-507`). |
| İşlemler → CSV olarak dışa aktar | | görünen sayfa |
| Yeni / Sil | | **kayıtlı değil** (çubukta görünmez ya da genel pasif; doğrulanmalı) |
| Formda: Kaydet ("Faturayı kaydet") | Ctrl+S | `formId purchase-invoice-entry-form` (`:547-549`) |
| Formda: Vazgeç | Esc | kayıt sürerken etkisiz (`:550-555`); dokunulmuş formda sorar (test `purchasing/purchaseCreateForms.test.tsx:379-390`) |

- **Süzgeç çubuğu** (`:748-771`): arama "Mal kabul, sipariş, tedarikçi veya depo ara", **Enter ile uygulanır**, sayfayı 1'e alır
  (`:751-754`); sunucu mal kabul kodu, sipariş kodu, tedarikçi adı ve depo adında `Contains` arar (`PurchaseInvoiceEntryEndpoints.cs:32-35`,
  ≤ 120 karakter, `:18`). Yenile: başarısız sipariş ayrıntılarını yeniden dener (`:757-764`). Bilgi satırı "Yalnızca siparişe bağlı,
  işlenmiş mal kabuller listelenir." + uzun ipucu (hizmet/masraf faturası desteklenmez, `:118-119, 766-769`). Detay paneli anahtarı
  (Ctrl+.; panel genişliğe göre kendiliğinden açılır/kapanır, `inventory/components/InventoryStockDetailPanel.tsx:21-42`, `:293`).
- **Liste sütunları** (varsayılan `:105-117`; sunucu görünümü `TenantScreenViewEndpoints.cs:327-333` **farklıdır**; eski kayıtlar
  `migrateFields` ile dönüştürülür, `:237-252`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `receipt` | Mal kabul / sipariş | **kısaltılmış kod** "GR-…E1DAEA5" (tam kod ipucunda; dışa aktarımda tam, `:210-227`) + altında sipariş kodu |
| `supplier` | Tedarikçi | ad + altında "depo · n satır" |
| `receiptDate` | Kabul tarihi | gg.aa.yyyy |
| `invoiceAmount` | Fatura tutarı | **istemcide hesaplanan** genel toplam + döviz; hesaplanamazsa "—" (`:488-491`) |
| `actions` | Fatura işlemi | sabit, çizilmez (`:469-471`) |

  Sunucu görünümünde `warehouse`, `lineCount`, `purchaseOrderTotal` vardır; `purchaseOrderTotal` → `invoiceAmount`'a çevrilir,
  diğerleri atılır (`:241-247`).
- **Izgara:** güncel satır, çift tık / Enter = formu aç, toplu "Excel (seçilenler)" (her zaman, `:800-806`). Sayfa 25 (`:286`).
  Genişlikler `:828-830`.
- **Boş durumlar:** "Mal kabuller yükleniyor…", "Faturalanabilir mal kabul yok. Önce satın alma siparişi üzerinden mal kabul
  kaydedin.", "Aramanızla eşleşen faturalanabilir mal kabul yok." (`:793-796`).
- **Detay paneli** (`:660-726`; boşken "Fatura girmek için listeden bir mal kabul seçin."): üst kod, tedarikçi, **"Mal kabul
  numarasını kopyala"** düğmesi (panoya, 1,5 sn onay simgesi, `:415-424, 668-678`), tek sekme "Özet": istatistikler Genel toplam /
  Ara toplam / KDV, satırlar (stok adı, "miktar birim", net tutar), kabul tarihi, depo, zincir sipariş → mal kabul. Yüklenirken
  "Satırlar yükleniyor…", hata "Mal kabul satırları alınamadı."
- **Fatura formu** (`:509-657`): belge başlığı tür "Alış faturası", kod = yazılan fatura no, taraf = tedarikçi, **durum akışı**
  "İşlendi" (kayıttan önce güncel adım yok) + son durum "İptal" (`purchasing/purchaseCreateForms.tsx:25-27`). Yan panel "Belge
  zinciri" (sipariş → mal kabul (tarih) → bu fatura) + depo, kabul tarihi (`:528-544`). Durum satırı "Yalnızca siparişe bağlı,
  işlenmiş mal kabuller listelenir." + "Satır: n" (`:558-565`).
  - **Belge bilgileri** (`:567-611`): "Tedarikçi fatura no *" (mono, ≤ 64), "Fatura tarihi *" (varsayılan bugün), **vade önizlemesi**
    "Vade gg.aa.yyyy · N gün" (tedarikçinin `paymentTermDays`'i okunabildiyse, `:590-592, 496-500`), **"Vergi mevzuatı profili *"**
    (yalnız uygun profil varsa; `:593-601`), katlanır "Gelen e-belge bilgileri": Belge UUID, Belge senaryosu (TEMELFATURA /
    TICARIFATURA / EARSIVFATURA), Belge tür kodu (SATIS / IADE / TEVKIFAT), Gönderen e-Fatura etiketi (`:602-610`).
  - **Fatura satırları** (salt okunur, `:612-655`): #, stok (kod + ad), miktar, birim, tutar (net), KDV; toplamlar Ara toplam / KDV /
    Genel toplam + döviz (`:510-516`). Tutarlar **önizlemedir**: profil vergi kuralları (ör. tevkifat) kayıtlı toplamı değiştirebilir
    (`:177-182`).
- **Profil seçenekleri** (`:313-332`): etkin ve `parametersJson.taxRules` dolu profiller; varsayılan `defaultForDocuments == true`,
  yoksa `TR-LOCAL`, yoksa ilk. Uç nokta hatası sessiz (profil alanı gizlenir).
- **Fatura tutarı hesabı** (`:171-207`): sipariş ayrıntısındaki satır fiyatı, iskonto ve KDV ile; aynı siparişin **faturalı** diğer
  mal kabullerinin miktarı "önceki" sayılıp kümülatif fark alınır (`PurchaseInvoiceWorkflow.CalculateIncrementalAmounts` aynası),
  KDV net üzerinden 2 ondalık, `AwayFromZero` yuvarlama (`round2`, `:165-168`).
- **Kayıt sonrası:** form kapanır, alanlar temizlenir, o siparişin ayrıntısı önbellekten atılır (`:444-454`), bildirim, sonra
  `onInvoiceCreated` → **Satınalma Faturaları'na gider** (`SalesPage.tsx:2245-2250`; oluşturulan fatura açılmaz). Hata olursa
  form açık kalır ve liste yenilenir (`:460-463`).

#### 3.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış (SalesPage) | satış ve cari tüm sayfalar, stok ilk 100, depolar | — | — | `SalesPage.tsx:625-646` (G-P58); **hiçbiri kullanılmaz** |
| Açılış | `GET /api/screen-views/purchase-invoice-receipt-selection/active` | — | `erp.screen-views.read` | hata sessiz (`:295-311`) |
| Açılış | `GET /api/finance/general-ledger/rule-profiles` | — | finans/muhasebe kuralı okuma (doğrulanmalı) | hata sessiz (`:313-332`) |
| Açılış, sayfa, arama, Yenile | `GET /api/purchasing/invoices/entry/receipts?page=&pageSize=25&q=` | `page`, `pageSize` (**zorunlu**, varsayılansız `int`, `PurchaseInvoiceEntryEndpoints.cs:12`), `q` | `erp.purchase-invoices.create` (satır süzgeçli) | `:334-352`; `Posted`, satırlı, etkin faturası olmayan mal kabuller; tarih ↓ (`PurchaseInvoiceEntryEndpoints.cs:27-45`); `PurchaseInvoiceEntryReceiptPage` |
| Liste her değiştiğinde | `GET /api/purchasing/orders/{id}` × sayfadaki **farklı sipariş** sayısı | — | `erp.purchase-orders.read` | `:354-378`; hata "error" olarak saklanır, Yenile'de yeniden denenir |
| Form açılınca (tedarikçi başına bir kez) | `GET /api/customers/{supplierId}` | — | `erp.customers.read` (satır süzgeçli) | `:380-393`; yalnız `paymentTermDays`; hata sessiz (vade gizlenir) |
| Faturayı kaydet | `POST /api/purchasing/receipts/{id}/invoice` | `{code (kırpılmış), invoiceDate, accountingProfileCode \| null, providerInvoiceUuid \| null, providerScenario \| null, providerInvoiceTypeCode \| null, providerSenderAlias \| null}` | `erp.purchase-receipts.create` (G-P47) | `:426-466`; `201` + `PurchaseInvoiceSummary` (`Program.cs:6933-6935`) ya da tekrar isteğinde `200` |
| CSV / Excel (seçilenler) | — | — | — | istemcide |

#### 3.3 Kurallar

- **Doğrulama (400)** (`PlatformContracts.cs:1316-1345`): fatura no boş ya da > 64 (`code`); UUID boş GUID; senaryo/tür kodu > 32;
  gönderen etiketi > 255; profil kodu > 32; kontrol karakterleri. Vade tarihi aralık aşımı (`invoiceDate`, `Program.cs:6886-6887`).
  Değerler kırpılır, profil kodu büyük harfe çevrilir (`PlatformContracts.cs:1318-1324`).
- **İş kuralları (404/409)** (`Program.cs:6838-6936`): mal kabul yok 404; iptal edilmiş mal kabul 409 "İptal edilmiş mal kabul için
  alış faturası oluşturulamaz." (`:6853`); etkin fatura varsa **aynı bilgilerle 200 (tekrar)**, farklıysa 409 + `invoiceId`
  (`:6855-6873`); sağlayıcı UUID firmada kullanılmış 409 (`:6875-6877`); kapalı dönem 409 (`:6878-6880`); tedarikçi `Supplier`/`Both`
  değil 409 "Sipariş tedarikçi hesabı kullanılamıyor." (`:6882`); profil çözülemezse 409 (`:6883-6884`); tedarikçi dövizi sipariş
  dövizinden farklı 409 (`:6885`); satırsız mal kabul 409 (`:6890`); toplam ≤ 0 409 (`:6923`); fatura no benzersizlik ihlali 409
  "Fatura numarası zaten kullanılıyor veya bu mal kabul faturalanmış." (`:6931`).
- **Hesap:** satır tutarı **artımlı**: aynı sipariş satırının önceki `Posted` faturalı miktar ve tutarları üzerine kümülatif hesap
  (`:6891-6913`); vergi profil kurallarıyla (`AccountingRuleTaxCalculator`, `:6909-6910`); vade = fatura tarihi + tedarikçi vadesi
  (`:6898`); döviz sipariş dövizi.
- **Etkiler:** cari **alacak** kaydı (tedarikçi, genel toplam, `:6926-6928`); stok etkisi **yok**; yevmiye aktarımı ayrı.
- **Durum geçişleri:** fatura `Posted` (taslaksız); iptal Satınalma Faturaları ekranında (`PurchaseInvoiceModal.tsx:299`).
  Fatura iptal edilince mal kabul yeniden listeye düşer (liste sorgusu `Posted` fatura arar, `PurchaseInvoiceEntryEndpoints.cs:29-30`).
- **Denetim kaydı:** `purchase-invoice.posted` (`:6929`).

#### 3.4 Roller

- **TenantAdmin:** her şey.
- **TenantUser / TenantDeveloper:** liste için `erp.purchase-invoices.create` (okuma değil), kayıt için `erp.purchase-receipts.create`
  (doğrulanmalı, G-P47), tutar önizlemesi için `erp.purchase-orders.read`, vade için `erp.customers.read`, profil için kural profili
  okuma. Biri eksikse ilgili parça sessizce düşer (tutar "—", vade yok, profil alanı yok) ama kayıt sunucu kurallarıyla yine çalışır.
  `erp.purchase-invoices.create` kuralları durum/tedarikçi koşulluysa liste daralır; kayıt bu kurala tabi **değildir**.

#### 3.5 ERP işlem kataloğu

Var olan: **yok** (`names.txt` içinde `satinalma.faturaGirisi.*` yok).

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.faturaGirisi.malKabulleri` | GET `/api/purchasing/invoices/entry/receipts` | query `q`, `page`*, `pageSize`* (int, **zorunlu**: uç nokta varsayılansız) | list `PurchaseInvoiceEntryReceiptView`, `rowsPath "items"`, `MetaPaths [page, pageSize, totalCount]` | `Query()` yardımcısı zorunlu=false üretir (`ErpOperationCatalog.cs:425`); zorunlu sorgu parametresi için yardımcı ya da `dataTable` sunucu sayfalamasının her zaman göndermesi doğrulanmalı |
| `satinalma.faturaGirisi.olustur` | POST `/api/purchasing/receipts/{id}/invoice` | route `id`; body `BodyParameters<PurchaseInvoiceCreateRequest>`: `code`*, `invoiceDate`*, `providerInvoiceUuid`, `providerScenario`, `providerInvoiceTypeCode`, `providerSenderAlias`, `accountingProfileCode` | record `PurchaseInvoiceSummary` | `pageKind "insert"`; 200 (tekrar) ve 201 aynı başarı sayılmalı (doğrulanmalı) |
| `satinalma.faturaGirisi.onizleme` | **yeni uç nokta** GET `/api/purchasing/receipts/{id}/invoice-preview` | route `id`; query `invoiceDate`, `accountingProfileCode` | record (`subtotal`, `discountTotal`, `taxTotal`, `grandTotal`, `currencyCode`, `dueDate`, `paymentTermDays`) | G-P53/G-P54; sunucu hesabını (`:6891-6923`) yazmadan çalıştırır |
| `satinalma.faturaGirisi.onizlemeSatirlari` | aynı yeni uç nokta | route `id`; query `invoiceDate`, `accountingProfileCode` | list, `rowsPath "lines"` (`orderLineNumber`, `stockCode`, `stockName`, `quantity`, `unitCode`, `lineSubtotal`, `discountAmount`, `taxAmount`, `lineTotal`) | form satırları ve panel satırları |
| `satinalma.faturaGirisi.mevzuatProfilleri` | GET `/api/finance/general-ledger/rule-profiles` (+ önerilen `?documentTaxRulesOnly=true`) | — | list (`profileCode`, `name`, `jurisdictionCode`, `reportingStandard`, `isActive`, + önerilen `hasTaxRules`, `isDefaultForDocuments`) | G-P55 |

Tedarikçi vadesi için cari envanterinde önerilen `cari.getir` kullanılabilir (`paymentTermDays`), önizleme uç noktası gelirse gerekmez.

Gereken yeni `Labels` kodları: `receiptCode`, `supplierId`, `supplierName`, `currencyCode`, `purchaseOrderTotal`, `invoiceDate`,
`dueDate`, `grandTotal`, `paidAmount`, `outstandingAmount`; önizleme için `subtotal`, `discountTotal`, `taxTotal`, `paymentTermDays`,
`lineSubtotal`, `discountAmount`, `taxAmount`, `lineTotal`, `orderLineNumber`, `stockCode`, `stockName`; profiller için `profileCode`,
`jurisdictionCode`, `reportingStandard`, `hasTaxRules`, `isDefaultForDocuments`. Var olanlar: `id`, `code`, `purchaseOrderId`,
`purchaseOrderCode`, `receiptDate`, `warehouseId`, `warehouseCode`, `warehouseName`, `lineCount`, `status`, `createdAt`, `name`,
`isActive`, `quantity`, `unitCode`.

#### 3.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Aç → `openButton` form `dialog` xl ya da sayfa bölümü, `exportCsv`, `titleCount` + başlık metni), `filterBar`
(`searchParam q`), `dataTable` (sunucu sayfalama, `columnUnits` ile alt satırlar: `receiptCode` + `purchaseOrderCode`,
`supplierName` + `warehouseName`), `contextPanel`, `recordHeader`, `steps` ("İşlendi" adımı, güncel yok), `formCard` + `input`
(`text` ≤ 64, `date` `{{bugun}}`, `select` profil `requiredWhen`), katlanır bölüm için `section`, `dataTable` (salt okunur satırlar),
`text` (ipucu ve durum notları), `afterSaveAction erpPage sales-purchase-invoices`.

Eksikler:

- **G-P47 Fatura oluşturma izni uyuşmazlığı (`eksik`, karar).** Liste `erp.purchase-invoices.create` ile korunur
  (`PlatformPermissionCatalog.cs:159-166`) ama yazma `POST /api/purchasing/receipts/{id}/invoice` `erp.purchase-receipts.create`'e
  çözülür (kod çıkarımı, `:344` + özel kural yok). Faturayı girebilecek kullanıcı listeyi görmeyebilir ya da tersine listeyi gören
  kaydedemeyebilir; katalog `allowed` ve ekran farklı karar verir. Öneri: `PlatformPermissionCatalog.TryResolve`'a `receipts/{id}/invoice`
  → `erp.purchase-invoices.create` (nested write) kuralı ve testi. Değişmeden taşınırsa `fark` (bugünkü davranış) ve QA'da TenantUser
  ile denenmeli.
- **G-P53 Fatura tutarı önizlemesi istemcide (`eksik`).** Liste sütunu, panel istatistikleri ve form satır/toplamları sipariş
  ayrıntısından istemcide hesaplanır (`:171-207, 354-378`). Bağlamalarda aritmetik ve "aynı siparişin faturalı diğer mal kabulleri"
  toplaması yoktur. Öneri: `invoice-preview` uç noktası (sunucu hesabının yazmasız hali, profil vergisi dahil — eski önizlemeden
  **daha doğru**). Liste sütunu için ya liste yanıtına `PreviewGrandTotal` eklenip yeni işlem adı açılır, ya `fark`: liste
  sütunu "Sipariş toplamı" (`purchaseOrderTotal`, sunucu görünümündeki eski anlam) olur. Sayfa başına N sipariş çağrısı düşer
  (olumlu).
- **G-P54 Vade önizlemesi (`eksik` küçük).** Fatura tarihi + tedarikçi vadesi istemcide toplanır (`:229-234, 496-500`). Tarih
  aritmetiği yok. Öneri: önizleme yanıtında `dueDate` (fatura tarihi parametresine bağlı yeniden çalışma: `runOn` giriş değişimi
  doğrulanmalı); ara çözüm `fark`: "Vade: N gün" metni (`cari.getir`).
- **G-P55 Mevzuat profili seçimi (`eksik`).** Seçenekler `parametersJson` JSON'u **istemcide ayrıştırılarak** süzülür ve varsayılan
  seçilir (`:313-332`); alan yalnız seçenek varsa görünür ve zorunludur (`:593-601`). JSON ayrıştırma bağlamada yok. Öneri:
  uç noktaya hesaplanan `hasTaxRules`, `isDefaultForDocuments` alanları (yeni işlem adı) + `optionsWhen "satir.hasTaxRules == true &&
  satir.isActive == true"` + `defaultWhen`/sıralı varsayılan; `visibleWhen`/`requiredWhen` için seçenek sayısının kapsamda okunması
  doğrulanmalı (G-TR11 benzeri). Olmazsa `fark`: alan her zaman görünür ve isteğe bağlı; boşsa sunucu kendi varsayılanını çözer
  (`ResolveDocumentProfileAsync`, doğrulanmalı).
- **G-P56 Kayıt sonrası gezinme (`fark`).** Eski ekran kayıttan sonra Satınalma Faturaları'na gider ve bildirim görünmeden kaybolur
  (`SalesPage.tsx:2249`, `:455-458`). `afterSaveAction erpPage` + `afterSavePageCode sales-purchase-invoices` karşılar; oluşturulan
  faturayı açmak G-P57 köprüsünü ister. Öneri: v1'de listede kalıp `successMessage` göstermek (daha iyi geri bildirim) ya da eski
  davranış; karar.
- **G-P59 Kısa kod ve kopyalama (`fark`).** Uzun mal kabul kodları "GR-…E1DAEA5" biçiminde kısaltılır, tam kod ipucunda; panelde
  "Mal kabul numarasını kopyala" düğmesi (`:210-227, 415-424`). Çalışma zamanında kısaltma biçimi ve pano eylemi yok. `fark`: tam kod
  (sütun genişliği artar); kopyalama düşer. Ayrıca sunucu görünümü (`purchase-invoice-receipt-selection`) ile eski ekranın sütun
  kümesi farklıdır; eşleme kararı gerekir (§3.7).

Ortak eksiklere atıf: G-C5, G-C19, G-TR12, G-C25 (`purchaseCreateForms.test.tsx:471`).

#### 3.7 Görünüm anahtarı

- `purchase-invoice-receipt-selection` → `receipt`, `supplier`, `receiptDate`, `warehouse`, `lineCount`, `purchaseOrderTotal`,
  `actions` (sabit) (`TenantScreenViewEndpoints.cs:327-333`). Eşleme: `receipt → receiptCode` (+ `columnUnits purchaseOrderCode`),
  `supplier → supplierName`, `warehouse → warehouseName`, `lineCount`, `purchaseOrderTotal` (G-P53'e göre `invoiceAmount` önizlemesi
  ya da sipariş toplamı), `actions` aktarılmaz. Eski ekranın `migrateFields`'i (`:237-252`) `warehouse` ve `lineCount`'u atıyordu;
  sistem sayfasında bunlar ayrı sütun olarak geri gelir (`fark`, küçük).

---

### 4. Kaybolması kolay eski davranışlar (denetim listesi)

1. İrsaliyede **stok hareketi olmaması** ve bunu söyleyen üç metin (oluşturma durum satırı, belge notu, kayıt bildirimleri)
   (`DeliveryNoteCreateView.tsx:56-62`, `DeliveryNoteDocument.tsx:113-116`, `PurchaseDeliveryNotesPage.tsx:416-419, 451-453, 478`).
2. İrsaliye satırında `max` = sipariş miktarı, `step 0.0001`; yalnız miktarı > 0 satırların gönderilmesi ve "İrsaliyeye en az bir
   satır miktarı girin." (G-P40, G-P42).
3. Sipariş arama kutusunda **Enter'ın kaydetmemesi** (`OrderSelectionPanel.tsx:47-52`; test `purchaseReceipts.test.tsx:312-338`)
   ve bağla/kaldır düğmelerinin irsaliye formunu göndermemesi (test `:340-361`).
4. Uygun olmayan sipariş durumlarının (İptal, Onay bekliyor, Reddedildi) seçiciden çıkarılması; `Received` siparişin seçilebilmesi.
5. Mal kabul seçeneklerinde yalnız `Posted` ve başka irsaliyeye bağlı olmayanlar; mal kabul seçiliyken bire bir eşleşme notu.
6. Oluşturma görünümünde Yeni'nin **siparişi koruyup** yalnız belge no ve miktarları temizlemesi (`PurchaseDeliveryNotesPage.tsx:503-512`).
7. Sipariş değişince bekleyen yazma sonucunun bildirilmemesi ve yazma sonrası sipariş okumasının ayrı hata alanı (`:368-371, 210-224`).
8. "Siparişi aç" komutu: listeden irsaliyenin siparişiyle oluşturma görünümünü açmak (`:532-533`).
9. Sil komutlarının **nedenli pasif** görünmesi (irsaliye ve mal kabul; mal kabulde duruma göre iki ayrı metin).
10. Durum sütununun kiracı görünümünde olmasa da her zaman çizilmesi; kiracı "Mal kabul" sütununu gizlese bile (test
    `purchaseReceipts.test.tsx:278-292`).
11. Mal kabul aramasının **yalnız bu sayfada** olduğu ve bunu söyleyen yer tutucu; "İptal" kartının aramadan önceki satırları sayması.
12. Mal kabul belgesinde "Alış faturasını aç"ın çubukta değil İşlemler menüsünde olması; iptal edilmiş mal kabulde komutun gizlenmesi
    (test `:198-213, 251-260`).
13. Belge zincirinde sipariş ve fatura **durum rozetleri**; fatura bağlantısının tıklanabilir olması.
14. Yeni'nin açık belgeyi kapatıp siparişsiz ekranı açması; Vazgeç sonrası listenin yenilenmesi (test `:215-249`).
15. Siparişsiz mal kabulde: depo değişince satır konumlarının temizlenmesi, takip kodu/SKT alanlarının yalnız takipli üründe çıkması,
    taslak listesi eylemleri, "Kaydet ve stoğa işle" ayrı adımı.
16. Sipariş belgesindeki mal kabulde: istek anahtarının **yalnız başarıda** yenilenmesi, özel alanların siparişten ön dolması,
    varsayılan ilk etkin depo, lot/seri ardışık istemleri ve vazgeçilince "Mal kabul iptal edildi.", iptal onay metni.
17. Fatura girişinde: Enter ile arama, sayfayı 1'e alma, başarısız sipariş ayrıntılarının Yenile'de yeniden denenmesi, kısaltılmış
    kod ve kopyalama, vade önizlemesi, profil varsayılan sırası (`defaultForDocuments` → `TR-LOCAL` → ilk), e-belge alanlarının
    katlanır bölümde olması, kayıt sırasında Vazgeç'in kilitlenmesi, hata sonrası listenin yenilenmesi.
18. Fatura kaydından sonra aynı siparişin diğer mal kabullerinin tutarlarının yeniden hesaplanması (önbellek silme, `:449-454`).
19. Fatura girişinden Satınalma Faturaları'na otomatik geçiş.
20. Panel davranışı: Ctrl+. ve fatura girişinde genişliğe göre kendiliğinden açılma.
21. İngilizce sözlük kapsamı (`purchaseReceipts.test.tsx:376-390`, `purchaseCreateForms.test.tsx:471`).

---

### 5. Özet tablo

| Ekran | Var olan işlemler | Yeni işlem (v1) | Sonraya kalan | Başlıca eksikler |
|---|---|---|---|---|
| Satınalma İrsaliyeleri | 0 | 7 `satinalma.irsaliye.*` + 4 `satinalma.siparis.*` (Kısım B ile ortak) | — | G-P40 "Kalem ekle" ızgarası (ön dolu biçim motor eki), G-P42 (yalnız ön dolu biçimde), G-P41 sipariş bağlamı, G-P43 bağla/kaldır, G-P44 türetilmiş durum |
| Mal kabulleri | 4 (`listele`, `ekMaliyetler`, `ekMaliyetDagit`, `ekMaliyetTersKayit`; yalnız `inventory-cost`'ta) | 6 (`sayfa`, `getir`, `satirlari`, `olustur`*, `iptal`*, `ozelAlanTanimlari`*; * sipariş belgesinde) | 7 `satinalma.malKabul.siparissiz.*` | **G-P51** siparişsiz alt ekran, **G-P46** kaynak öznitelikleri, G-P49 meta, G-P52 lot/seri, G-P57 fatura köprüsü |
| Mal kabul faturası girişi | 0 | 5 (`malKabulleri`, `olustur`, `onizleme`*, `onizlemeSatirlari`*, `mevzuatProfilleri`; * yeni uç nokta) | — | **G-P47** izin uyuşmazlığı, **G-P53** tutar önizlemesi, G-P55 profil, G-P54 vade, G-P56 gezinme |

Toplam önerilen yeni işlem adı: **22** v1 (7 irsaliye + 4 sipariş bağlamı + 6 mal kabul + 5 fatura girişi) + **7** sonraya
(siparişsiz) = **29**. Bunlardan 4 sipariş adı Kısım B ile tekilleştirildi (baştaki karar tablosu).

Eksik kimlikleri (tek liste): G-P40 sipariş satırı ızgarası (Kalem ekle / ön dolu) · G-P41 sipariş bağlamı/iç içe listeler · G-P42 boş satır atlama
· G-P43 bağla/kaldır · G-P44 türetilmiş bağlantı durumu · G-P45 irsaliye arama/sayfa · G-P46 mal kabul kaynak öznitelikleri ·
G-P47 fatura izni uyuşmazlığı · G-P48 belge/panel kaynağı · G-P49 `listele` meta · G-P50 mal kabul arama/süzgeç · G-P51 siparişsiz
alt ekran · G-P52 lot/seri girişi · G-P53 tutar önizlemesi · G-P54 vade · G-P55 mevzuat profili · G-P56 kayıt sonrası gezinme ·
G-P57 alış faturası köprüsü · G-P58 SalesPage yan etkileri · G-P59 kısa kod/kopyala.

### 6. Önerilen sıra ve riskler

Önerilen sıra: (1) sunucu: G-P47, G-P46 kararları, G-P53 önizleme uç noktası; G-P40 için "Kalem ekle" yolunun doğrulanması
(`int` değerli `lookup`)
→ (2) **Mal kabul faturası girişi** (en az bağımlı; G-P53 önizleme uç noktasıyla) → (3) **Mal kabulleri** listesi + belge (salt
okunur; Yeni v1'de eski ekrana) → (4) **Satınalma İrsaliyeleri** ("Kalem ekle" ızgarasıyla; ön dolu biçim isteniyorsa G-P40 motor eki + G-P42) → (5) siparişsiz mal kabul ve sipariş
belgesindeki mal kabul formu (G-P51, G-P52; sipariş ekranı taşımasıyla birlikte).

Riskler:

- **Stok ve maliyet yazan akış (mal kabul oluştur/iptal) sipariş belgesindedir.** Mal kabulleri listesi taşınıp sipariş belgesi
  taşınmazsa kullanıcı mal kabulü hâlâ eski sipariş ekranından girer; Mal kabulleri'nden siparişe geçiş köprüsü (`erpPage
  sales-purchasing` + sipariş kimliği) yoktur (G-C12 benzeri).
- **İzinler (G-P46, G-P47).** Taşıma, katalog `allowed` hesabı yüzünden eski ekranda çalışan bir kullanıcıya düğmeleri pasif
  gösterebilir ya da tersine. Satır kurallı TenantUser ile canlı QA şart. G-P46'yı düzeltmek tedarikçi kısıtlı kullanıcıların
  görünürlüğünü **daraltır** (bugün tüm mal kabulleri görürler).
- **Fatura tutarı farkı (G-P53).** Eski önizleme profil vergi kurallarını (tevkifat) hesaba katmaz; sunucu önizlemesine geçmek
  kullanıcının gördüğü tutarı değiştirir (doğru yöne). Listede "Sipariş toplamı"na dönülürse kullanıcı faturalanacak tutarı göremez.
- **Kısmi irsaliye (G-P40/G-P42).** "Kalem ekle" ızgarasında sorun yoktur. Ön dolu ızgara seçilirse boş satır süzgeci olmadan
  yalnız tüm satırları dolu irsaliye kaydedilebilir; kısmi teslimat pratikte en sık durumdur.
- **Lot/seri (G-P52).** Takipli ürünlerde siparişe bağlı mal kabul sistem sayfasında kaydedilemez (400); çözüm sunucu sözleşmesi
  ekler, katalog adı yeni açılmalıdır.
- **Siparişsiz mal kabul tekrar denemesi.** Eski ekran her gönderimde yeni anahtar ürettiği için ağ hatasında çift taslak kod
  çakışmasıyla (409) yakalanır; `autoId`'ye geçiş iyileştirmedir ama "kayıt başarılıysa yenile" kuralı doğrulanmalı.
- **Sözleşme kuralı:** önerilen yanıt alanları (`LinkStatus`, `hasTaxRules`, önizleme) yeni işlem adlarıyla açılmalıdır
  (`ErpOperationCatalog.cs:56-59`); `satinalma.malKabul.listele`'nin sonucu değiştirilmemelidir (`inventory-cost` kullanıyor).
- **Kapsam dışı ama bağlı:** `PurchaseInvoiceModal` (ödeme, iade, iptal) Satınalma Faturaları envanterindedir; sipariş belgesindeki
  mal kabul tablosu (`purchase-order-receipts`) Kısım B'dedir; ek maliyet `inventory-cost` standardındadır.

### 7. Açık sorular

1. G-P40: v1 "Kalem ekle" (`list` + `lookup`) yeterli mi, yoksa eski ön dolu görünüm için motor eki (`stage` + düzenlenebilir kaynak
   sütunu ya da `fill` kipi) mi yazılsın?
2. G-P47: fatura oluşturma izni `erp.purchase-invoices.create`'e mi taşınsın, yoksa bugünkü `erp.purchase-receipts.create` korunsun mu?
3. G-P46: mal kabul listesine tedarikçi satır süzgeci eklensin mi (görünürlük daralır)?
4. G-P51: siparişsiz mal kabul v1'de eski ekrana mı yönlendirilsin, yoksa satış eşiyle ortak ayrı standart mı yazılsın?
5. G-P53: fatura girişi listesinde önizleme tutarı (yeni alan) mı, sipariş toplamı mı?
6. G-P56: fatura kaydından sonra listede mi kalınsın, Satınalma Faturaları'na mı gidilsin?
7. Mal kabul belgesine (eski ekranda olmayan) "Ek maliyetler" sekmesi eklensin mi?

---

## Kısım D — Satınalma Faturaları, Bağımsız fatura taslakları ve Satınalma İadeleri

Bu belge, üç yerleşik satınalma ekranını sistem sayfasına (standart tanım) taşımak için girdidir. Bilgiler kod
okunarak çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Biçim ve terimler cari envanteriyle
(`2026-11-21-cari-ekranlari-envanteri.md`) aynıdır. `fark` kabul edilmiş bir davranış farkıdır. `eksik` ise taşımadan
önce kapatılması gereken boşluktur. Bu belgedeki boşluk kimlikleri yalnız **G-P60…G-P79** aralığındadır. Ortak
boşluklar cari belgesindeki kimlikleriyle anılır (G-C3, G-C5, G-C13, G-C19, G-C25).

Kapsam (yönlendirici: `WorkspacePageRouter.tsx:379-392`):

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `sales-purchase-invoices` | Satınalma Faturaları (liste + panel + belge detayı) | `PurchaseInvoicesPage.tsx` → `SalesPage section=…` (`PurchaseInvoicesPage.tsx:6-8`) → `activeTab "purchase-invoices"` (`SalesPage.tsx:416-417`) → `purchasing/PurchaseInvoicesScreen.tsx` (`SalesPage.tsx:2268-2274`); detay `PurchaseInvoiceModal.tsx`; panel `purchasing/PurchaseInvoiceListPanel.tsx`; rozet `purchasing/purchaseInvoiceStatus.ts` |
| `sales-purchase-invoice-drafts` | Bağımsız fatura taslakları (mal kabulsüz fatura) | `SupplierInvoiceDraftsPage.tsx` → `SalesPage` → `activeTab "purchase-invoice-drafts"` (`SalesPage.tsx:422-423, 2243-2244`) → `StandaloneSupplierInvoiceDraftPage.tsx` + `supplier-invoice-draft/components/*` |
| `sales-purchase-returns` | Satınalma İadeleri | `PurchaseReturnsPage.tsx:5-7` → `document-returns/DocumentReturnsPage.tsx side="purchase"` (Satış İadeleri ile ortak) + `components/ReturnDetailSurface.tsx` + `sales/components/SalesListPanels.tsx:337-371` |

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir.
`PlatformContracts.cs` ve `PlatformPermissionCatalog.cs` `src/Platform/AIERP.Platform.Application/` altındadır.
Dosya adı yazılmayan sunucu satır numaraları `Program.cs` içindir.

Kapsam dışı ama bağlantılı: **Mal kabul faturası girişi** (`sales-purchase-invoice-entry`, `PurchaseInvoiceEntryPage`,
sunucu `POST /api/purchasing/receipts/{id}/invoice`, `:6838-6935`). Faturayı oluşturan tek yol budur. Gelen e-Fatura
alanları (`providerInvoiceUuid`, `providerScenario`, `providerInvoiceTypeCode`, `providerSenderAlias`) ve vergi profili
de burada yazılır (`:6899-6901`). Bu belgedeki ekranlar bu alanları yalnız **gösterir**. Ayrı bir "gelen fatura kutusu"
uç noktası bulunamadı (arama: `incoming`, `inbox`, `e-documents`; `IntegrationExecutionApiEndpoints.cs:55-168` yalnız
giden gönderimdir). **Doğrulanmalı.**

### 0. Ortak bilgiler

#### Menü, anahtarlar ve uygulama durumu

- Üç anahtar da satınalma gezinme listesinde (`workspace-navigation.ts:24, 31`), kalıcı sayfalar listesinde
  (`workspace-storage.ts:12`) ve kabuk listesinde (`WorkspaceShellPage.tsx:45-47`) vardır. Raydaki "Satın Alma" düğmesi
  doğrudan `sales-purchase-invoices`'ı açar (`shell/railItems.ts:24`). Modül başlatıcıda "Alış Faturaları" kutusu da
  vardır (`ModuleLauncherPage.tsx:708`).
- İki ekran (`sales-purchase-invoices`, `sales-purchase-invoice-drafts`) 10.992 satırlık `SalesPage`'in içinden açılır.
  `SalesPage` bu iki sekmede kendi başlığını çizmez (`SalesPage.tsx:2175-2183`). Çizdiği tek şey dış kabuktur
  (`list-v2 sales-lv2-root`). Bir "eylem çubuğu sahipliği" de vardır (`:2174`, `ownsActionBar`); bu sekmelerde sahipliğin
  kimde olduğu **doğrulanmalı**. Bildirim ve hata durumu sekme değişince sıfırlanır (`:425-428`). Sistem sayfasına
  geçişte `SalesPage` bağlamı tümden düşer.
- **Sistem sayfasına yönlendirici bağlamı ulaşmaz.** Sistem sayfası yalnız `token`, `systemScreenKey`, `onOpenLegacy`
  ve `onSystemPageMissing` alır (`WorkspacePageRouter.tsx:184-191`). `onNavigate`, `initialSupplier` ve
  `onInitialSupplierOpened` gitmez. Cari ekranından "Alış faturaları" ile gelinen tedarikçi süzgeci
  (`App.tsx:252-255, 1011-1014` → `SalesPage.tsx:399-402` → `PurchaseInvoicesScreen.tsx:71, 106-108`) bu yüzden kaybolur
  (G-P62, G-C13).

#### Yetki modeli

- Kaynaklar şunlardır (`PlatformPermissionCatalog.cs:78, 83, 84`):
  - `/api/purchasing/invoices…` → `erp.purchase-invoices`
  - `/api/purchasing/returns…` → `erp.supplier-returns`
  - `/api/purchasing/payments…` → `erp.supplier-payments`

  `/api/purchasing/standalone-invoices…` açıkça `erp.purchase-invoices`'a bağlanır (`:176-180`). İki istisna yeniden
  eşlenir. `GET …/standalone-invoices/suppliers` → `erp.purchase-invoices.create` (`:168-174`). `GET
  /api/purchasing/invoices/entry/receipts` → `create` (`:159-167`, kapsam dışı ekran).
- **İç içe yazmalar** başka kaynağa düşer:
  - `POST /api/purchasing/invoices/{id}/payments` → `erp.supplier-payments.create` (`:218-224`)
  - `POST /api/purchasing/invoices/{id}/returns` → `erp.supplier-returns.create` (`:225-231`)

  İkisinde de `nestedWriteAction` vardır (`:327`).
- **Eylemler** şöyle çözülür. GET → `read`, PUT → `update`. POST'ta yolun son parçası `IsExecutionRoute` listesindeyse
  `execute`, değilse `create` olur (`:337-345`, liste `:387-397`; `void` ve `post` listede). Buna göre:
  - `POST /api/purchasing/invoices/{id}/void` → `erp.purchase-invoices.execute`
  - `POST /api/purchasing/returns/{id}/void` → `erp.supplier-returns.execute`
  - `POST /api/purchasing/payments/{id}/void` → `erp.supplier-payments.execute`
  - `POST …/standalone-invoices/{id}/post` → `erp.purchase-invoices.execute`
  - `POST …/standalone-invoices` → `erp.purchase-invoices.create`
  - `PUT …/standalone-invoices/{id}` → `erp.purchase-invoices.update`
- **TenantAdmin** katalogu atlar (`PlatformPermissionAuthorizer.cs:52-54`, `src/Platform/AIERP.Platform.Infrastructure/`) ve satır süzgecine girmez (`PermissionStatusFilter.cs:15`). Diğer rollerde varsayılan
  **ret**tir; bir Allow kuralı gerekir.
- **Satır düzeyi görünürlük (fatura ve taslak).** `PermissionStatusFilter.ApplyAsync` (`PermissionStatusFilter.cs:8-48`)
  kuralları `resource.status` ve `resource.supplierId` özniteliklerine göre SQL koşuluna çevirir (`:29-31, 81-92`).
  Bu süzgeç şu okumalarda uygulanır:
  - fatura listesi (`:6946`) ve asistan araması (`:6969-6971`)
  - taslak listesi ve tek taslak (`PurchaseInvoiceDraftEndpoints.cs:75-77, 96-98`)
  - tedarikçi seçenekleri ve mal kabul satırı seçenekleri; bu ikisi **create** kurallarıyla süzülür (`:24-26, 45-47`)

  Bunlar `IsStatusFilteredCollection` ile `collectionRowsFiltered=true` alır (`PermissionAuthorizationHandler.cs:52-58,
  77-93`). `{id}` taşıyan isteklerde kaydın durumu ve tedarikçisi öznitelik olarak eklenir. Fatura bulunamazsa aynı
  kimlik taslaklarda aranır (`PermissionAuthorizationHandler.cs:140-148`). Fatura detayı (`GET /{id}`, `:7012-7045`)
  kendisi süzmez; işleyicinin öznitelikli karar verdiğine güvenir.
- **İadelerde satır düzeyi görünürlük yok.** `GET /api/purchasing/returns` ve `GET /{id}` (`DocumentListEndpoints.cs:48-78`)
  `PermissionStatusFilter` çağırmaz. `IsStatusFilteredCollection`'da da bu yol yoktur. `ResolveResourceAttributesAsync`
  `erp.supplier-returns` dalı içermez (`PermissionAuthorizationHandler.cs:95-158`). Faturayı yalnız belli tedarikçiler
  için görebilen bir kullanıcı, bütün tedarikçilerin iadelerini görür (G-P75).
- **Sessiz çapraz izin bağımlılıkları** (ekranın açılması ek kaynak ister):
  - `/api/warehouses/` → `erp.warehouses.read`. Fatura ekranında hata mesajına düşer (`PurchaseInvoicesScreen.tsx:124-129`),
    iade ekranında sessizdir (`DocumentReturnsPage.tsx:101-107`).
  - `/api/finance/accounts` → `erp.finance-accounts.read`. Hata gösterilir (`PurchaseInvoiceModal.tsx:127-129`).
  - `/api/stock/items/{id}/units` → `erp.stock-items.read`. Hata gösterilir (`:183-211`).
  - `/api/purchasing/orders/{id}` → `erp.purchase-orders.read`. "Depo" bilgisi içindir; hata **sessizdir**, alan "—"
    kalır (`:163-182`).
  - `/api/finance/general-ledger/accounts` → `erp.general-ledger.read`. Gider hesabı listesi içindir; hata sessizdir,
    liste boş kalır (`StandaloneSupplierInvoiceDraftPage.tsx:162-183`).
  - `/api/screen-views/*` → `erp.screen-views.read`. Hata sessizdir.

#### İdempotency ve eşzamanlılık

| Yazma | İdempotency | rowVersion | Kilit |
|---|---|---|---|
| Ödeme ekle | `requestId` zorunlu (`PlatformContracts.cs:1378`). Aynı istek tekrarında önceki ödeme 200 döner; başka faturada kullanılmışsa 409 (`:7056-7062`). Benzersizlik ihlali 409 (`:7104-7105`). | yok | `Serializable` işlem + `UPDLOCK, HOLDLOCK` (`:7051-7054`) |
| İade oluştur | `requestId` zorunlu (`:7115`). Aynı içerik 200, farklı içerik 409 "Bu requestId farklı içerikle…" (`:7135-7165`). | yok | `UPDLOCK` (`:7133`) |
| Fatura iptal | **yok** (ikinci çağrı 409 "daha önce iptal edildi", `:7311`) | yok | `UPDLOCK` (`:7305-7313`) |
| İade iptal / ödeme iptal | yok (ikinci çağrı 409, `:7354`, `:7403`) | yok | `UPDLOCK` |
| Taslak oluştur | `requestId` zorunlu (`PurchaseInvoiceDraftEndpoints.cs:599`). Aynı içerik 200, farklı içerik 409 (`:212-223, 271-278`). | — | `UPDLOCK` |
| Taslak güncelle | `requestId` **gönderilmez** (taslağın ilk kimliği kullanılır, `:125`) | **zorunlu**, alan adı `expectedRowVersion` (`:107-108, 122-123, 172, 180-184`) | `UPDLOCK` |
| Taslak muhasebeleştir | Durum üzerinden: zaten `Posted` ise mevcut yevmiye/cari kimliğiyle 200 (`:305-311`) | yok | `UPDLOCK` + kiracı kilidi (`:289`) |

Eski ekranlar `requestId`'yi `crypto.randomUUID()` ile üretir ve **yalnız başarıdan sonra** yeniler
(`PurchaseInvoiceModal.tsx:88, 96, 243, 361`; `StandaloneSupplierInvoiceDraftPage.tsx:60, 344`). Başarısız kaydı yeniden
denemek aynı anahtarı kullanır. Sistem sayfasında bunun karşılığı `autoId` girişidir (`TenantCustomPage.tsx:717-728`,
`depo.transfer.olustur` örüntüsü `ErpOperationCatalog.cs:375-399`).

#### Muhasebe ve cari etkisi (özet)

| Olay | Cari hareket | Stok | Kasa/banka | Yevmiye |
|---|---|---|---|---|
| Fatura (giriş ekranı) | Alacak (tedarikçiye borç), `GrandTotal` (`:6926-6928`) | — (mal kabulde girmiş) | — | Anında oluşmaz; "deftere aktarma" ile kaynak `PurchaseInvoice` (`GeneralLedgerTransferEndpoints.cs:43, 401`; **doğrulanmalı**) |
| Ödeme ekle | Borç (`:7093-7095`) | — | Nakit/Havale'de çıkış (`:7096-7099`) | **Anında** `InvoiceSettlementJournalPosting.CreateAsync`, kaynak `SupplierPayment` (`:7100-7102`; `InvoiceSettlementJournalPosting.cs:19-112`). Döviz kuru yoksa 409 (`:55`). |
| Ödeme iptal | Alacak ters kaydı (`:7422-7424`) | — | Giriş ters kaydı (`:7408-7420`) | Bozulmamış yevmiye varsa **409** "yevmiyeye aktarılmış" (`:7404`). Ödeme yevmiyesi anında yazıldığından, iptalden önce fişin ters kaydı gerekir (G-P67). |
| İade oluştur | Borç, iade `GrandTotal` (`:7278-7280`) | Depodan çıkış; mal kabul ağırlıklı ortalama maliyetiyle, lot/seri ayırmalı (`:7256-7271`) | — | Anında oluşmaz (aktarım kaynağı `SupplierReturn`) |
| İade iptal | Alacak ters kaydı (`:7376-7378`) | Giriş ters kaydı, izleme kopyalanır (`:7370-7375`) | — | Bozulmamış yevmiye varsa 409 (`:7355`) |
| Fatura iptal | Borç ters kaydı (`:7324-7326`) | **dokunulmaz** (mal kabul yerinde kalır) | — | Bozulmamış yevmiye varsa 409 (`:7312`) |
| Taslak muhasebeleştir | Alacak, `GrandTotal`, taslak dövizinde (`PurchaseInvoiceDraftEndpoints.cs:516-526`) | Miktar **değişmez**. Mal kabule bağlı satırda maliyet farkı `InventoryCostAdjustment` (LandedCost) yazılır (`:463-482`). | — | **Anında**, kaynak `StandaloneInvoiceDraft`. Satırlar: gider (borç), stok varlığı, tüketilmiş fark için SMM, indirilecek KDV, karşısında tedarikçi borcu (`:423-514`). Baz para birimine fatura tarihi kuruyla çevrilir (`:416-421`). |

- **KDV ve tevkifat** (mal kabul faturası): satır vergisi vergi profiliyle hesaplanır
  (`AccountingRuleTaxCalculator.Calculate`, `:6909`). Döküm `TaxBreakdownJson` metninde saklanır (satır ve belge,
  `:6918`). Detay ekranı bu JSON'u istemcide çözer. KDV'yi orana göre gruplar, ek vergileri ve tevkifatı ayrı
  satırda gösterir. KDV oranları tutmazsa tek "KDV" satırına düşer (`PurchaseInvoiceModal.tsx:408-453`). Formül şudur:
  `grandTotal = subtotal − discount + taxTotal − tevkifat` (`:411-412` yorumu).
- **Döviz:** faturanın dövizi siparişin dövizidir. Tedarikçi dövizi farklıysa fatura kesilmez (`:6885`). Ödeme hesabı
  fatura dövizinde olmalıdır (`:7071`). İade fatura dövizindedir (`:7280`). Liste kartları birden çok döviz varsa
  toplamaz (bkz. 1.1).
- **Vade:** `DueDate = InvoiceDate + supplier.PaymentTermDays` (`:6898`). Ekranda değiştirilemez. Taslakta vade elle
  girilir, isteğe bağlıdır ve fatura tarihinden önce olamaz (`PurchaseInvoiceDraftEndpoints.cs:603`).
- **Kapalı dönem:** iade tarihi (`:7166-7168`), iptallerin bugünkü tarihi (`:7301-7304, 7342-7345, 7393-7396`) ve taslak fatura tarihi
  (`PurchaseInvoiceDraftEndpoints.cs:372-374`) kapalı döneme düşerse 409 döner. **İptal tarihi `DateTime.UtcNow`'dur**
  (`:7301, 7342, 7393`). Türkiye saatiyle 00:00-03:00 arasında yapılan iptal bir önceki güne yazılır (risk R4).

#### Çalışma zamanı, bugün (bu belge için önemli olanlar)

- Koşul dilinde `bugun` kökü ve `bugun + N` tarih toplamı vardır (`TenantCustomPage.tsx:1777`,
  `custom-page/conditions.ts:118`). `countWhen` yüklenmiş satırları sayar (`custom-page/countWhen.ts:1-25`).
  **Toplama (`sum`) bağlaması bulunamadı.** Arama: `sumWhen`, `sum:`, `aggregate`. **Doğrulanmalı.** Doğruysa sayfa
  tutarı kartları kurulamaz (G-P61).
- Katalog `Columns<T>()` yalnız skaler alanları sütun yapar (`ErpOperationCatalog.cs:437-439, 465-487`). İç içe liste
  (`lines`, `payments`, `returns`) ayrı işlem + `rowsPath` ister (`depo.transfer.kalemleri` örneği, `:393-394`). Etiketi
  olmayan sütun kodu açılışta hata verir (`:494-495`). Gövde parametreleri etiket istemez (`:448-452`). Liste
  parametresi öğeleri ister (`:454-458`).
- `allowed` bayrağı rota değerleri ve satır öznitelikleri olmadan hesaplanır (`ErpOperationCatalog.cs:531-539`).
  Fatura ve taslak işlemleri satır koşullu kurallarla süzülür. G-C3 riski bu iki ekran için **aynen** geçerlidir.

---

### 1. Satınalma Faturaları (`sales-purchase-invoices`)

#### 1.1 Yerleşim

- **Başlık:** "Satınalma Faturaları". Açıklama: "Mal kabullerinden oluşan tedarikçi faturalarını, vadeleri ve kalan
  borçları izleyin." Sayaç sunucu toplamıdır (`totalCount`) (`PurchaseInvoicesScreen.tsx:317-322`). Başlık ve açıklama
  **sabittir**; kiracı görünümünden gelmez.
- **Özet kartları** (`:184-236`). Hepsi **yüklenen sayfa** ("bu sayfa") üzerinden hesaplanır. Kartlar süzme yapmaz.

| Kart | Değer | Ton | İpucu / kural |
|---|---|---|---|
| Fatura toplamı | Σ `grandTotal`, yalnız `Posted` satırlar | — | "bu sayfa · N fatura". Birden çok döviz varsa değer "—" ve ipucuna "birden çok para birimi" eklenir (`sales/components/SalesListFooter.tsx:59-66`). |
| Ödenmemiş | Σ `outstandingAmount`, `Posted` ve kalan > 0 | warn | aynı kural |
| Vadesi geçen | **sayı**: kalan > 0 ve vadesi geçmiş | bad | ipucu "Σ kalan · bu sayfa" (tek dövizse) |
| İptal | sayı, `status ≠ Posted` | — | "bu sayfa" |

  Kartın kendi satırı yoksa sayfa tek dövizliyse "0,00 TRY", değilse "0,00" yazılır (`:189-199`). Yükleme sırasında
  "—" gösterilir (`:190, 205`). Örnek: test verisinde 4 işlenmiş ve 1 iptal satır vardır. Kartlar "Fatura toplamı
  3.200,00 TRY · 4 fatura", "Ödenmemiş 2.500,00 TRY · 3 fatura", "Vadesi geçen 1 · 1.200,00 TRY", "İptal 1" verir
  (`purchasing/purchaseInvoices.test.tsx:157-167`).
- **Uyarı şeridi:** kapatılabilir hata (`:353-360`). Listede bildirim şeridi yoktur. Bildirimler detay ekranındadır.
- **İşlem çubuğu** (`:144-182`; kısayollar `commands/shortcuts.ts:6-16`, İşlemler menüsü Alt+İ `:18`). Çubuk yalnız
  fatura açık **değilken** listeye aittir (`listActive`, `:134, 315`).

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | `onNavigate("sales-purchase-invoice-entry")`: Mal kabul faturası girişi (`:144-145`) |
| Aç | Enter | Odaklı ızgara satırı, yoksa güncel satır, yoksa tek işaretli satır. Hiçbiri yoksa "Önce bir kayıt seçin" (`:148-154`). Açmadan önce depolar bir kez yüklenir (`:121-131`). |
| Sil | Ctrl+Delete | Her zaman pasif. Nedenleri: "Önce bir kayıt seçin" / "İşlenmiş belge silinemez — İşlemler › İptal et" / "İptal edilmiş belge silinemez" (`:156-162`). Silme uç noktası yok. |
| İşlemler → Mal kabulünden fatura | | giriş ekranına gider (`:167`) |
| İşlemler → Mal kabulsüz fatura | | `sales-purchase-invoice-drafts`'a gider (`:168`) |
| İşlemler → Ödeme ekle | | yalnız hedef `Posted` ve kalan > 0. Faturayı `initialAction="payment"` ile açar (`:170-172`). |
| İşlemler → İade oluştur | | yalnız `Posted`, `initialAction="return"` (`:173`) |
| İşlemler → İptal et (ters kayıt) | | yalnız `Posted`. `paidAmount > 0` ise pasif, neden "İptal için önce ödemeleri iptal edin." `initialAction="void"` ile onaylı iptal (`:174-179`). |
| İşlemler → CSV | | `csvExportCommand` (görünen ızgara, `:181`) |
| Yenile | (F5 doğrulanmalı) | araç çubuğu düğmesi (`:333`); `commands` nesnesinde `refresh` kaydı yok, F5 kısayolunun çalışıp çalışmadığı doğrulanmalı |

- **Süzgeç çubuğu** (`:324-351`):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama "Fatura no, tedarikçi veya mal kabul ara" | metin, sunucu | `q`. Her tuşta sorgu atar (gecikme yok, `:105, 326-329`). Sayfayı 1'e alır. Sunucu fatura kodu, tedarikçi adı ve mal kabul kodunda `Contains` arar (`:6948`). |
| Tedarikçi çipi | yalnız tedarikçiyle gelindiyse | `supplierId`. Seçenekler "Tüm tedarikçiler" ve tedarikçi adıdır. "Tümü" seçilince çip kalkar (`:335-349`). Kullanıcı yeni tedarikçi **seçemez**; çip yalnız kaldırılır. |
| Durum süzgeci | **yok** | uç nokta durum süzgeci almaz (`purchaseInvoices.test.tsx:168`) |
| Detay paneli anahtarı | Ctrl+. | `SalesListPanelToggle` (`:350`) |

- **Liste sütunları** (`DEFAULT_FIELDS` `:31-44`, genişlikler `:46-49`, hücreler `:241-297`). Sütunlar kiracının
  **yayımlanmış** `purchase-invoices` görünümünden gelir, ama yalnız `view.id` doluysa (`:109-120`). Sunucu
  varsayılanı (`id: null`) kullanılmaz. `actions` alanı çizilmez (`:238-240`).

| Alan | Etiket (istemci varsayılanı) | Gösterim |
|---|---|---|
| `code` | Fatura no | bağlantı düğmesi. Tıklayınca satırı güncel yapar ve faturayı açar (`:244-259`). |
| `invoiceDate` | Tarih | gg.aa.yyyy |
| `supplierName` | Tedarikçi | metin |
| `receiptCode` | Mal kabul | mono, boşsa — |
| `dueDate` | Vade | Gecikmişse "gg.aa · N gün geçti" kırmızı (`:268-275`). Gün sayısı yerel bugüne göredir (`purchaseInvoiceStatus.ts:18-21`). |
| `grandTotal` | Genel toplam | `listAmount` tutar + döviz |
| `paidAmount` | Ödenen | tutar |
| `outstandingAmount` | Kalan | İptalde "—". Gecikmişse `is-bad`, kısmi ödemede `is-warn` (`:282-287`). |
| `status` | Durum | beş durumlu rozet (aşağıda) |
| `purchaseOrderCode`, `currencyCode`, `lineCount` | Sipariş no, Döviz, Satır | varsayılan gizli |

- **Durum rozeti** (`purchaseInvoiceStatus.ts:30-40`). Sunucu durumu yalnız `Posted`/`Voided`'dır. Ödeme durumu
  istemcide türetilir:
  - `Voided` → İptal (off)
  - `Posted`, kalan ≤ 0, ödenen > 0 → Ödendi (ok). Kalan ≤ 0 ama ödeme yoksa (tamamen iade) → İşlendi (info).
  - kalan > 0 ve vade geçmiş → Vadesi geçti (bad)
  - kalan > 0 ve ödeme var → Kısmen ödendi (warn)
  - diğer → İşlendi (info)
- **Izgara** (`:363-406`):
  - işaret sütunu; tek tık satırı güncel yapar (fatura açılmaz)
  - çift tık, Enter ve kod bağlantısı faturayı açar
  - toplu eylem "Excel (seçilenler)" yalnız liste aktifken çıkar (`:387-389`)
  - sütun aracı sayfa çubuğuna yerleşir
  - `gridId` "purchase-invoices-v2"; eski sütun ayarları bir kez sıfırlanır (`:364-365`)
- **Boş durumlar:** "Alış faturaları yükleniyor…". Tedarikçi süzgeci varsa "{ad} için görüntülenebilir alış faturası
  yok.", yoksa "Henüz alış faturası yok. Fatura eklemek için faturalanabilir bir mal kabul seçin.". Arama boşsa "Aramanızla
  eşleşen alış faturası yok." (`:372-379`).
- **Alt bilgi:** işaretli sayısı, gösterilen/toplam ve sunucu sayfalama (25) (`:392-402`). İpuçları "↑↓ gez · Boşluk
  işaretle · Enter aç · Çift tık aç" (test `:192`; "· Ctrl+. detay paneli" soneki doğrulanmalı).
- **Seçim kuralı:** ilk satır kendiliğinden seçilmez (`:79`). Güncel satır yeni sayfada yoksa panel boş kalır.
- **Detay paneli** (`PurchaseInvoiceListPanel.tsx`). Panel açıkken güncel satırın `GET /{id}` sonucuyla dolar
  (`useSalesListPanel`, `PurchaseInvoicesScreen.tsx:137-143`). `reloadKey` satırın JSON'udur.
  - Seçim yokken: "Özetini görmek için listeden bir alış faturası seçin." (`:28-30`)
  - Üst: kod, tedarikçi, rozetler. İptalde yalnız "İptal". Diğer durumlarda "İşlendi" + ödeme rozeti; gecikmede
    "Vadesi geçti · N gün" (`:50-64`).
  - Sekmeler Özet / Satırlar / Ödemeler (`:22-26`).
  - **Özet** (`:106-124`): göstergeler Genel toplam, Kalan (gecikmede bad; iptalde —), Ödenen, Vade. Belge zinciri:
    sipariş → mal kabul → bu fatura → iadeler (durum rozetli). İlk satırlar önizlemesi ve "tümü" → Satırlar.
  - **Ödemeler** (`:72-105`): Ödenen/Kalan; liste kod, tarih, yöntem ("Nakit", "Havale / EFT", "Kart", "Çek"), iptalde
    "· İptal", tutar. Boşken "Henüz ödeme yok."
- **Belge detayı** (`PurchaseInvoiceModal.tsx`, `DocumentSurface variant="detail"`; listenin üstünü kaplar):
  - **Başlık:** tür "Alış faturası", kod, alt başlık tedarikçi, tarih, durum rozeti "İşlendi"/"İptal"
    (`document-page/documentStatus.ts:108-114`). Durum akışı İşlendi, uç durum İptal (`purchasing/purchaseDocumentDetail.tsx:10-16`).
    Kapat düğmesi "Geri" (`:482-492`).
  - **Bağlam paneli:** Belge zinciri (sipariş, mal kabul, bu fatura, iadeler + tarih + durum) ve Tedarikçi (Unvan)
    (`:493-517`).
  - **Göstergeler** (`:543-571`):
    - Fatura toplamı, Ödenen
    - Kalan: işlenmiş ve kalan > 0 ise warning. Ödenen oranı ilerleme çubuğuyla (`paidShare`) gösterilir.
    - Vade: iptalde muted "İptal edildi", ödenmişse success "Ödendi", gecikmişse danger "N gün gecikti", aksi halde
      "Bugün" / "N gün kaldı".
    - **Not:** detaydaki Kalan iptal faturada da tutarı gösterir; liste ve panel "—" gösterir (`:550` ile
      `PurchaseInvoiceListPanel.tsx:69` farkı).
  - **Fatura bilgileri** (`:572-604`): Fatura tarihi, Sipariş, Mal kabul (ortası kısaltılır, tam değer ipucunda), Depo,
    Vergi profili ("Belirtilmemiş"). Varsa **Gelen e-belge**: "senaryo · tür", ipucunda UUID ve gönderen etiketi.
    **Depo** faturada yoktur. `GET /api/purchasing/orders/{purchaseOrderId}` çağrısının `receipts[]` dizisinden mal kabul
    kimliğiyle bulunur (`:163-182`).
  - **Satırlar** tablosu (`:605-652`): #, Stok (kod + ad), Miktar + birim, Birim fiyat (4 ondalık), İskonto (tutar +
    %), KDV %, Tutar (`lineSubtotal − discountAmount`).
  - **Toplamlar:** Ara toplam, İskonto, KDV %oran satırları, ek vergiler "ad %oran", tevkifat "ad %oran (tevkifat)"
    eksi olarak, Genel toplam (`:408-453`).
  - **Ödemeler** bölümü (`:655-721`): satırlarda Tarih (+ kod, iptalde "· İptal"), Yöntem, Hesap
    (`financialAccountName`), Referans ve Tutar bulunur. Satır menüsünde "Ödemeyi iptal et" vardır (yalnız işlenmiş
    ödeme). Başlık eylemi "Ödeme ekle" yalnız `canPay` iken görünür. Boşken "Henüz ödeme yok."
  - **İadeler** bölümü (`:722-789`): satırlarda İade no, Tarih, Depo, Satır, Tutar ve Durum (İşlendi/İptal) bulunur.
    Satır menüsünde "İadeyi iptal et" vardır. Başlık eylemi "İade oluştur" `canReturn` iken görünür (işlenmiş + en az
    bir aktif depo, `:134-135`). Boşken "Bu faturadan iade yapılmadı. İade, faturalanan miktarı ve depodaki stoğu
    aşamaz."
  - **Alt bilgi:** satır sayısı · genel toplam. İpuçları `SALES_DETAIL_HINTS` (`:518-519`).
  - **İşlem çubuğu (detay açıkken)** (`:458-480`):
    - Yenile = yeniden yükle. Filtre ve Excel "Belge açıkken kullanılamaz" (`commands/PageCommandsSlot.tsx:20-27`).
    - Yeni (F2) yine giriş ekranına gider (`:461`).
    - Sil pasif; neden "İşlenmiş belge silinemez — İşlemler › Faturayı iptal et".
    - İşlemler: Ödeme ekle (`canPay`), İade oluştur (`canReturn`), Faturayı iptal et (ters kayıt). İptal ödenmişse
      pasiftir; meşgulken "Kaydediliyor…".
  - **`initialAction`** (`:150-162`): listeden gelen eylem bir kez çalışır. `void` onay penceresini doğrudan açar,
    `return` ve `payment` sağ çekmeceyi açar. İptal faturada hiçbiri çalışmaz.
- **Pencereler / formlar** (sağ çekmece, aynı anda bir tane, `:131-149`):
  - **Tedarikçi Ödemesi** (`:934-1040`). Kaydet "Ödeme kaydet". Durum satırında "En fazla {kalan} ödenebilir." yazar.
    Alanlar:
    - Ödeme tarihi *: varsayılan bugün (yerel)
    - Tutar ({döviz}) *: min 0.01, max kalan, adım 0.01
    - Ödeme yöntemi: Havale / EFT (varsayılan), Nakit, Kart, Çek. Değişince hesap temizlenir.
    - Referans: isteğe bağlı, ≤ 100, yer tutucu "Dekont veya işlem numarası"
    - Yalnız Nakit/Havale'de *Kasa hesabı* / *Banka hesabı* *. Seçenekler aktif, fatura dövizinde ve yönteme uygun
      türdekilerdir (`Cash`/`Bank`). Etiket "kod · ad (bakiye döviz)" biçimindedir (`:212-217, 1011-1037`).
    - Uygun hesap yoksa "Bu dövizde aktif hesap yok. Önce Finans ekranından hesap açın." yazar ve kayıt kilitlenir
      (`prf-save-blocked`, `:941-945`).

    Başarıda "Tedarikçi ödemesi kaydedildi; cari borçtan düşüldü." gösterilir, detay ve liste yenilenir (`:243-249`).
  - **Alış İadesi** (`:790-933`). Kaydet "İadeyi kaydet". Durum satırında "İade, tedarikçi cari borcunu azaltır."
    yazar. Kimlik alanları: İade tarihi * (varsayılan bugün) ve Çıkış deposu * (aktif depolar, aranabilir seçici; değişince
    konumlar yeniden yüklenir, `:820-840`). **İade satırları** ızgarası: her fatura satırı için bir satır (eklenemez,
    silinemez). Sütunlar:
    - Stok
    - Fatura miktarı
    - **İade edilebilir** = fatura miktarı − Σ işlenmiş iadelerin aynı fatura satırındaki miktarları (`:855-860`). Bu
      değer istemcide `returns[].lines[]` üzerinden hesaplanır. **Not:** Σ temel birimdeki miktardır, form birim
      seçimine göre çevrim yapmaz.
    - İade miktarı: üç denetim yan yanadır (`:872-923`):
      - **birim**: satır birimi + stok kartının diğer aktif birimleri, `GET /api/stock/items/{stockItemId}/units`,
        satır başına ayrı liste
      - **miktar**: min 0, adım 0.0001
      - **konum**: "Depo düzeyi" + seçili deponun aktif konumları

    Kayıt yalnız miktarı > 0 olan satırları gönderir; hiçbiri yoksa sessizce çıkar (`:335-343`). Depo yoksa ya da hiçbir
    satırda miktar yoksa kayıt kilitlenir (`:793-798`). Başarıda "Alış iadesi kaydedildi; stoktan düşüldü ve tedarikçi
    borcu azaltıldı." gösterilir.
  - **Onay pencereleri** (`confirmDialog`, tehlike tonu):
    - Ödeme iptali: "Ödeme iptal edilsin mi?" / "{kod} ödemesi iptal edilecek. Tedarikçi cari hareketi ters
      kaydedilecek." (`:256-283`)
    - Fatura iptali: "Alış faturası iptal edilsin mi?" / "… Cari borç ters kayıtla kapatılacak.", düğme "Faturayı iptal
      et" (`:284-310`)
    - İade iptali: "Alış iadesi iptal edilsin mi?" / "… Stok ve cari hareketleri ters kaydedilecek." (`:376-403`)
    - Bildirimler: "Ödeme iptal edildi; tedarikçi borcu ters kayıtla yeniden açıldı.", "Alış faturası iptal edildi;
      cari hareket ters kaydedildi.", "Alış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu."
- **Doğrulamalar (istemci):** ödeme tutarının alt/üst sınırı, hesabın koşullu zorunluluğu ve iade satırı seçimi.
  Sunucu hataları tek metin olarak çekmecede (`drawerError`) ya da sayfada gösterilir (`:457, 522-529`).
- **Durum akışı:** İşlendi → İptal. Ödeme durumu türetilmiş beşli rozettir. İptalin ön koşulları şunlardır: işlenmiş
  ödeme yok, işlenmiş iade yok ve bozulmamış fatura yevmiyesi yok (`:7311-7318`).

#### 1.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, arama, sayfa, tedarikçi çipi, Yenile, yazma sonrası | `GET /api/purchasing/invoices/` | `page`, `pageSize=25`, `q` (boş da gönderilir), `supplierId?` | `erp.purchase-invoices.read` (satır süzgeçli) | `:6939-6958`. Sıra fatura tarihi azalan, sonra oluşturma azalan. `pageSize` 1–100. `PurchaseInvoicePage{items, page, pageSize, totalCount}` (`PlatformContracts.cs:596`). `outstandingAmount = max(0, total − Σödeme − Σiade)` iptal faturada da hesaplanır. |
| Açılış | `GET /api/screen-views/purchase-invoices/active` | — | `erp.screen-views.read` | Yalnız `id` doluysa uygulanır (`PurchaseInvoicesScreen.tsx:109-120`). Hata sessizdir. |
| İlk "Aç" | `GET /api/warehouses/` | — | `erp.warehouses.read` | aktifler süzülür (`:124-125`) |
| Panel açık + satır değişince; detay açılışı | `GET /api/purchasing/invoices/{id}` | — | `read` (öznitelikli) | `:7012-7045`. `PurchaseInvoiceView` (`PlatformContracts.cs:588-595`): `lines`, `payments` (`financialAccountName` dahil), `returns` (her biri `lines` ile) ve `provider*`, `accountingProfileCode`, `taxBreakdownJson`. |
| Detay açılışı | `GET /api/finance/accounts` | — | `erp.finance-accounts.read` | hesap seçici; hata gösterilir |
| Detay açılışı (siparişi varsa) | `GET /api/purchasing/orders/{purchaseOrderId}` | — | `erp.purchase-orders.read` | yalnız Depo adı; hata sessiz |
| Detay açılışı | `GET /api/stock/items/{stockItemId}/units` × satır sayısı | — | `erp.stock-items.read` | iade birim seçenekleri (`:183-211`) |
| İade çekmecesi, depo değişimi | `GET /api/warehouses/{id}/locations` | — | `erp.warehouses.read` | aktifler süzülür (`:311-331`) |
| Ödeme kaydet | `POST /api/purchasing/invoices/{id}/payments` | `{requestId, paymentDate, amount, paymentMethod, reference?, financialAccountId?}` (`PlatformContracts.cs:597-598`) | `erp.supplier-payments.create` | `:7046-7110`. 201 `SupplierPaymentSummary`, tekrar 200. |
| Ödeme iptal | `POST /api/purchasing/payments/{paymentId}/void` | — | `erp.supplier-payments.execute` | `:7385-7429` |
| İade kaydet | `POST /api/purchasing/invoices/{id}/returns` | `{requestId, warehouseId, returnDate, lines[{purchaseInvoiceLineId, quantity, unitCode, storageLocationId?}]}` (`PlatformContracts.cs:574-576`) | `erp.supplier-returns.create` | `:7111-7292`. 201 `SupplierReturnSummary`. |
| İade iptal | `POST /api/purchasing/returns/{returnId}/void` | — | `erp.supplier-returns.execute` | `:7334-7383` |
| Fatura iptal | `POST /api/purchasing/invoices/{id}/void` | — | `erp.purchase-invoices.execute` | `:7293-7332`. `{id, code, status}` döner. |
| (kullanılmıyor) | `GET /api/purchasing/invoices/assistant-detail?q=` | `q` 2–100 | `read` | asistan içindir (`:6959-7011`); ekran çağırmaz |

#### 1.3 Kurallar

- **Ödeme ekle** (`:7046-7110`):
  - `SupplierPaymentValidation` (`PlatformContracts.cs:1373-1392`): tutar > 0, en çok 2 ondalık. Yöntem `Cash` / `Bank
    transfer` / `Card` / `Check`. Nakit ve Havale'de `financialAccountId` zorunlu, diğerlerinde yasak. Referans ≤ 100.
  - Fatura `Posted` olmalı (`:7063`).
  - Hesap aktif olmalı, yönteme uygun türde ve fatura dövizinde olmalı (`:7067-7072`).
  - **Kasa bakiyesi** ödemeyi karşılamalı; yoksa 409 "Kasa bakiyesi ödemeyi karşılamıyor." ve `currentBalance`
    (`:7073-7078`). Bankada bakiye denetimi yoktur.
  - Kalan ≤ 0 ise 409 "Alış faturası tamamen ödendi.". Tutar kalanı aşarsa 409 ve `outstandingAmount` (`:7083-7084`).
  - Kod `TenantDocumentNumbering.Internal.SupplierPayment` ile üretilir (`:7086`).
- **İade oluştur** (`:7111-7292`):
  - 1–100 satır; aynı fatura satırı bir kez; miktar > 0 ve en çok 4 ondalık; boş GUID konum yasak (`:7114-7129`).
  - Fatura `Posted` olmalı (`:7169`); depo aktif olmalı (`:7174`); konumlar etkin ve seçili depoya ait olmalı (`:7176-7178`).
  - Birim stok kartında etkin olmalı. Miktar temel birime çevrilir (`:7185-7197`).
  - İade miktarı, faturada kalan iade edilebilir miktarı aşamaz; 409 ve `remainingQuantity` (`:7202-7205`).
  - **Kullanılabilir stok** (bakiye − aktif satış rezervasyonları) yetmezse 409. Kiracının negatif stok ayarı dikkate
    alınır (`:7206-7226`). Konum seçildiyse konum bakiyesi denetlenir (`:7227-7235`). Lot/seri ayırma yetmezse 409 (`:7262-7263`).
  - Tutarlar kaynak satırdan oransal hesaplanır (`CalculateIncrementalFromSource`, `:7245-7247`). Toplam ≤ 0 ise 409 (`:7274`).
  - Maliyet, mal kabul hareketlerinin ağırlıklı ortalamasıdır (`:7256-7260`).
- **Fatura iptal** (`:7293-7332`):
  - Durum `Posted` olmalı.
  - Bozulmamış `PurchaseInvoice` yevmiyesi varsa 409 "Önce yevmiye fişini ters kayıtla kapatın".
  - İşlenmiş ödeme varsa 409; işlenmiş iade varsa 409.
  - Cari hareket bulunamazsa (toplam > 0) ya da zaten ters kaydedilmişse 409 (`:7319-7323`).
  - Ters kayıt ve `Status=Voided` yazılır. Mal kabul ve sipariş **kilitlenir ama değiştirilmez** (`:7305-7308`).
    Mal kabulün yeniden faturalanabilir olup olmadığı giriş ekranının kuralıdır: aktif fatura denetimi yalnız `Posted`
    faturaya bakar (`:6853-6855`). Yani iptalden sonra aynı mal kabul yeniden faturalanabilir.
- **İade iptal** (`:7334-7383`): durum `Posted` olmalı; yevmiye yok; stok hareketleri satırlarla birebir eşleşmeli;
  cari hareket tutarı eşleşmeli; ters kaydı olmamalı.
- **Ödeme iptal** (`:7385-7429`): yevmiye yok, cari hareket ve finans hareketi eşleşmeli. Ödeme yevmiyesi ödeme anında
  yazıldığından (`:7100`; `InvoiceSettlementJournalPosting.cs:95`), önce o fişin ters kaydı gerekir. **Doğrulandı:**
  `HasUnreversedJournalEntryAsync`, kaynak türü ve kimliğiyle bir fiş bulup buna bağlı bir `ManualReversal` fişi
  yoksa `true` döner (`GeneralLedgerTransferEndpoints.cs:92-98`). Yani "Ödemeyi iptal et" **ilk denemede her zaman 409**
  "Tedarikçi ödemesi yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." verir (`:7404`). Kullanıcı önce
  Finans → yevmiye fişini ters kaydetmelidir. Ödemesi olan bir faturanın iptal sırası da şöyledir: ödeme fişinin ters
  kaydı → ödeme iptali → (iade varsa iade iptali) → fatura iptali.
- **İdempotency ve rowVersion:** 0. bölümdeki tabloya bakınız. Ödeme ve iade `requestId` ister; iptaller anahtarsızdır;
  bu ekranda rowVersion yoktur.
- **Durum geçişleri:** Fatura `Posted → Voided`, ödeme `Posted → Voided`, iade `Posted → Voided`. Geri alma yoktur.
- **Denetim kaydı:** `supplier-payment.posted` (`:7103`), `supplier-payment.voided` (`:7426`), `supplier-return.posted`
  (`:7281`), `supplier-return.voided` (`:7380`), `purchase-invoice.voided` (`:7329`), `purchase-invoice.posted`
  (giriş ekranı, `:6929`). Kaynak alanına belge kodu yazılır.

#### 1.4 Roller

- **TenantAdmin:** her şey; satır süzgeci uygulanmaz. Ekranda rol denetimi **yoktur** (`role` prop'u ekrana bile
  iletilmez; `SalesPage.tsx:2269-2274`).
- **TenantUser / TenantDeveloper:** her işlem ayrı bir izne bağlıdır:
  - liste ve detay → `erp.purchase-invoices.read` (durum/tedarikçi koşullu olabilir)
  - ödeme ekle → `erp.supplier-payments.create`; ödeme iptal → `erp.supplier-payments.execute`
  - iade oluştur → `erp.supplier-returns.create`; iade iptal → `erp.supplier-returns.execute`
  - fatura iptal → `erp.purchase-invoices.execute`
  - ekran ayrıca depo, finans hesabı ve stok birimi okuma izinlerini ister (0. bölüm)

  Eski ekran izin yokluğunda düğmeleri **gizlemez**. Sunucu 403 döner ve hata metni gösterilir.

#### 1.5 ERP işlem kataloğu

Var olan: hiçbir `satinalma.fatura.*` işlemi yok. Satınalma için yalnız `satinalma.malKabul.*` dört işlem vardır
(`ErpOperationCatalog.cs:355-362`). Raporlar `rapor.purchaseInvoices`, `rapor.supplierPayments`,
`rapor.supplierReturns`, `rapor.supplierLedgerEntries` (`names.txt`) liste ekranının yerini tutmaz (en çok 12 sütun,
`:188`).

Yeni (önerilen; modül sabiti `PurchasingModule` var, `:68`):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.fatura.listele` | GET `/api/purchasing/invoices` | query `q`, `supplierId` (guid), `page`, `pageSize` | list `PurchaseInvoiceSummary`, `rowsPath "items"`, `MetaPaths [page, pageSize, totalCount]` | Satır süzgeçli; G-C3 |
| `satinalma.fatura.getir` | GET `/api/purchasing/invoices/{id}` | route `id` | record `PurchaseInvoiceView` (skalerler) | `lines`/`payments`/`returns` sütun olmaz; `taxBreakdownJson` opak metin |
| `satinalma.fatura.satirlari` | GET aynı yol | route `id` | list `PurchaseInvoiceLineView`, `rowsPath "lines"` | `depo.transfer.kalemleri` örüntüsü |
| `satinalma.fatura.odemeleri` | GET aynı yol | route `id` | list `SupplierPaymentSummary`, `rowsPath "payments"` | `financialAccountName` dahil |
| `satinalma.fatura.iadeleri` | GET aynı yol | route `id` | list `SupplierReturnSummary`, `rowsPath "returns"` | iade satırları iç içedir, sütun olmaz |
| `satinalma.fatura.odemeEkle` | POST `/api/purchasing/invoices/{id}/payments` | route `id`; body `requestId`* (autoId), `paymentDate`*, `amount`*, `paymentMethod`*, `reference`, `financialAccountId` | record `SupplierPaymentSummary` | izin `erp.supplier-payments.create` (iç içe). Katalog izni bu yeniden eşlemeyi doğru çözmeli (doğrulanmalı). |
| `satinalma.fatura.odemeIptal` | POST `/api/purchasing/payments/{paymentId}/void` | route `paymentId` | none | `execute`. Sunucu rotası `{id:guid}`; rota adı eşlemesi transfer örüntüsündeki gibi doğrulanmalı. |
| `satinalma.fatura.iptal` | POST `/api/purchasing/invoices/{id}/void` | route `id` | none (`{id, code, status}`) | `execute`. Gövde yok, `confirmation` yok (onay sayfada `confirmEnabled`). |
| `satinalma.fatura.odemeHesaplari` | GET `/api/finance/accounts` | — | list `FinancialAccountView` (doğrulanmalı) | seçenek; tür/döviz/aktif süzme istemcide (G-P65). Finans modülüne alınabilir. |
| `satinalma.fatura.ozet` (**yeni uç nokta**) | GET `/api/purchasing/invoices/summary` | query `q`, `supplierId` | record: döviz bazında `postedTotal`, `unpaidTotal`, `overdueCount`, `overdueTotal`, `voidedCount` | G-P61. Bugünkü kartlar "bu sayfa"dır; sunucu özeti bütün süzgece bakar (`fark`, olumlu). |
| `satinalma.fatura.iadeEdilebilirSatirlar` (**yeni uç nokta**) | GET `/api/purchasing/invoices/{id}/returnable-lines` | route `id` | list: `purchaseInvoiceLineId`, `stockItemId`, `stockCode`, `stockName`, `unitCode`, `quantity`, `returnedQuantity`, `remainingQuantity` | G-P66 |

İade oluşturma ve iade iptali `satinalma.iade.*` altında tanımlanır (3.5); detay ekranı onları kullanır.

Gereken yeni `Labels` kodları (yalnız sonuç sütunları ve liste parametresi öğeleri; gövde parametreleri etiket istemez,
`ErpOperationCatalog.cs:448-452`):
- belge: `receiptCode`, `supplierId`, `supplierName`, `invoiceDate`, `dueDate`, `currencyCode`, `grandTotal`,
  `paidAmount`, `outstandingAmount`, `subtotal`, `discountTotal`, `taxTotal`, `taxBreakdownJson`, `accountingProfileCode`,
  `providerInvoiceUuid`, `providerScenario`, `providerInvoiceTypeCode`, `providerSenderAlias`
- satır: `purchaseReceiptLineId`, `orderLineNumber`, `stockCode`, `stockName`, `unitPrice`, `discountPercent`,
  `vatPercent`, `lineSubtotal`, `discountAmount`, `taxAmount`, `lineTotal`
- ödeme ve iade: `purchaseInvoiceId`, `invoiceCode`, `paymentDate`, `amount`, `paymentMethod`, `reference`,
  `financialAccountId`, `financialAccountName`, `returnDate`
- özet: `postedTotal`, `unpaidTotal`, `overdueCount`, `overdueTotal`, `voidedCount`, `returnedQuantity`,
  `remainingQuantity`

Var olanlar: `id`, `code`, `status`, `createdAt`, `lineCount`, `purchaseOrderId`, `purchaseOrderCode`,
`purchaseReceiptId`, `stockItemId`, `unitCode`, `quantity`, `warehouseId`, `warehouseName`, `enteredQuantity`,
`enteredUnitCode`, `storageLocationId` (`:72-119`). Ayrıca güncellenecek kayıtlar: `names.txt`, yeni
`system-pages/purchaseInvoice*Operations.fixture.json` ve `SystemPageStandards.versions.txt`.

#### 1.6 Bileşen eşlemesi ve eksikler

Var olan karşılıklar:
- `actionBar`: Yeni → `erpPage sales-purchase-invoice-entry` (ya da o ekranın sistem sayfası); Aç; Sil gizli ya da
  `disabledReason`; `moreButtons` ödeme, iade, iptal, mal kabulsüz fatura, CSV; `titleCount`.
- `filterBar`: arama `q`, tedarikçi seçimi.
- `dataTable`: sunucu sayfalama 25, `valueLabels`, `toneMap`.
- `metric` + `countWhen`: Vadesi geçen ve İptal sayıları; `satinalma.fatura.listele.satir.status == "Posted" && satinalma.fatura.listele.satir.outstandingAmount > 0 && satinalma.fatura.listele.satir.dueDate < bugun` (yalnız `dueDate < bugun` iptal ve ödenmiş satırları da sayar).
- `contextPanel` + `tabs`: panel.
- Belge detayı: `recordHeader` + `steps` (İşlendi/İptal), `metric` kartları, `section`, `dataTable` (satırlar,
  ödemeler, iadeler; satır eylemleri), `dialog` (xl) ödeme ve iade formları için, `formCard`, `editableGrid`, `alert`,
  `button` + `confirmEnabled`.

Eksikler:

- **G-P60 Türetilmiş ödeme durumu ve gecikme günü** — `eksik`. Beş durumlu rozet (`purchaseInvoiceStatus.ts:30-40`),
  "gg.aa · N gün geçti" hücresi, Kalan hücresinin bad/warn tonu ve iptalde "—" istemcide hesaplanır. `toneMap` tek
  alana bakar; gün farkı aritmetiği bağlamada yok. Öneri: `PurchaseInvoiceSummary`'ye sunucuda `paymentState`
  (`Voided|Paid|Overdue|Partial|Posted`), `overdueDays` ve `displayOutstanding` (iptalde null) eklensin. Var olan
  sonuç değişeceği için bu alanlar `satinalma.fatura.listele` ilk kez yayımlanmadan eklenmeli. `valueLabels` +
  `toneMap` bu alana bağlanır.
- **G-P61 Sayfa tutarı kartları** — `eksik`. "Fatura toplamı", "Ödenmemiş" ve vadesi geçen tutar ipucu yüklenen
  sayfanın **döviz bazında toplamıdır**; çok dövizde "—" + "birden çok para birimi" yazılır (`:184-236`). Çalışma
  zamanında toplama bağlaması bulunamadı (doğrulanmalı). Öneri: `satinalma.fatura.ozet` uç noktası. Bu, "bu sayfa"
  yerine süzgecin tamamına bakar (`fark`, olumlu); ipucu metni buna göre değişmeli.
- **G-P62 Tedarikçiyle açılış ve tedarikçi çipi** — `eksik`. Cari ekranındaki "Alış faturaları" komutu
  `pendingPurchaseSupplier` ile `{id, name}` taşır (`App.tsx:1011-1014`). Çip yalnız bu durumda görünür ve yalnız
  kaldırılabilir (`PurchaseInvoicesScreen.tsx:335-349`). Sistem sayfası bu geri çağırımı almaz (0. bölüm; G-C13). Öneri:
  App, sistem sayfasına `setPageParams("sales-purchase-invoices", {supplierId, supplierName})` yazsın; `filterBar`
  sayfa parametresinden ön değer alsın. Çip etiketi için `supplierName` parametresi ya da tedarikçi seçenek sorgusu
  gerekir. Boş durum metni "{ad} için görüntülenebilir alış faturası yok." da bu parametreye bağlıdır.
- **G-P63 Belge detayının iç içe listeleri ve vergi dökümü** — `eksik`. Satırlar, ödemeler ve iadeler tek
  `GET /{id}` yanıtındadır. Üç ayrı `rowsPath` işlemi gerekir (aynı uç noktaya üç çağrı; önbellek yoksa üç istek,
  doğrulanmalı). Toplamlar bloğu `taxBreakdownJson`'u çözüp KDV'yi orana göre gruplar ve tevkifatı ayrı gösterir
  (`PurchaseInvoiceModal.tsx:408-453`). Opak JSON metni bağlanamaz. Öneri: sunucu `PurchaseInvoiceView`'a düz
  `taxLines[{label, rate, amount, treatment}]` listesi eklesin ve ayrı işlem `satinalma.fatura.vergiDokumu` (`rowsPath
  "taxLines"`) açılsın. Aksi halde `fark`: yalnız Ara toplam / İskonto / Vergi toplamı / Genel toplam gösterilir;
  **tevkifat görünmez olur** (yasal görünürlük riski).
- **G-P64 Depo adı ikincil okuma** — `fark`. Depo, siparişin `receipts[]` dizisinden bulunur ve
  `erp.purchase-orders.read` ister; hata sessizdir (`:163-182`). İç içe dizi elemanını kimlikle seçmek bağlamada yok.
  Öneri: sunucu `PurchaseInvoiceView`'a `warehouseName` eklesin (yan etkisiz). Yoksa alan düşer.
- **G-P65 Ödeme formunun koşullu alanları** — `eksik`.
  - (a) Hesap seçenekleri üç koşulla süzülür: aktif, fatura dövizi, yönteme göre `Cash`/`Bank` (`:212-217`).
    Seçenek süzgeci (`filterOptionRows`, `TenantCustomPage.tsx:710-715`) satır koşulunu destekliyor; giriş değerine
    (yöntem) ve belge alanına (döviz) bağlanabildiği **doğrulanmalı**.
  - (b) Yöntem değişince hesap temizlenir.
  - (c) Hesap alanı yalnız Nakit/Havale'de görünür ve zorunludur (`visibleWhen` var; koşullu `required` doğrulanmalı).
  - (d) Tutarın üst sınırı kalan tutardır (`max` bağlanabilir mi doğrulanmalı).
  - (e) Uygun hesap yoksa yönlendirme metniyle kayıt kilitlenir.
  - (f) `requestId` `autoId` olmalı ve yalnız başarıda yenilenmeli.
  - (g) Kasa bakiyesi seçenek etiketinde görünür.
- **G-P66 İade formu ızgarası** — `eksik`. Bu en ağır kalemdir.
  - Satırlar fatura satırlarından **ön doludur** ve eklenip silinemez. `editableGrid`'in bir sorgudan satır tohumlaması
    yaptığı doğrulanmalı.
  - "İade edilebilir" değeri `returns[].lines[]` üzerinden istemcide toplanır (iki kat iç içe, `:855-860`).
  - Birim seçenekleri **satır başına farklıdır** (her stok kartının birimleri, ayrı çağrılar). Picker sütunu satırın
    `stockItemId`'sine bağlı seçenek sorgusu çalıştırmalı.
  - Konum seçenekleri başlıktaki depoya bağlıdır; depo değişince satır konumları sıfırlanır (`:317`).
  - Yalnız miktarı > 0 satırlar gönderilir (`:342`). Gönderim süzgeci (`filter` koşulu) doğrulanmalı.

  Öneri: `satinalma.fatura.iadeEdilebilirSatirlar` uç noktası, ızgara tohumu + `remainingQuantity` (ve `max`). Birim
  için `stok.kart.birimleri` picker'ı satır bağlamalı. Kalmazsa `fark`: yalnız fatura birimiyle iade, konum seçimi
  "Depo düzeyi".
- **G-P67 İptal ön koşulları ve sıra** — `fark`. İstemci yalnız `paidAmount > 0` için önceden pasif yapar. Sunucu
  ayrıca işlenmiş iade ve bozulmamış yevmiye için 409 döner (`:7312-7318`). Ödeme iptali ödeme yevmiyesi yüzünden
  **her zaman** önce fiş ters kaydı ister (1.3, doğrulandı); "Ödemeyi iptal et" satır eylemi bu yüzden bugün de etkin
  görünüp 409 verir. Öneri: sistem sayfasında `disabledWhen` iki koşulla kurulmalı:
  `paidAmount > 0` ve "işlenmiş iade var". İkincisi için sunucuya `hasPostedReturns` gerekir (G-P60 ile birlikte).
  409 metni olduğu gibi gösterilir. Ayrıca listeden "İptal et" eskiden önce detayı açıp sonra onay sorar (`initialAction`).
  Sistem sayfasında doğrudan satır eylemi + onay olur; detay açılmaz (`fark`, kabul edilebilir).
- **G-P68 Gelen e-belge ve vergi profili gösterimi** — `fark`. "Gelen e-belge: senaryo · tür" satırı yalnız
  `provider*` alanlarından biri doluysa görünür; UUID ve gönderen etiketi ipucundadır. Mal kabul kodu ortadan
  kısaltılır (`:584-601`). Koşullu görünürlük (`visibleWhen`) var; birleşik metin ve ipucu yok. Öneri: iki ayrı alan
  (Senaryo/Tür, UUID) koşullu gösterilsin.
- Ortak: **G-C3** (satır koşullu `allowed`), **G-C5** (CSV yalnız görünen sayfa), **G-C19** (ızgara klavyesi),
  **G-C25** (testler İngilizce etiket doğrular: `purchaseInvoices.test.tsx:440-454`).

#### 1.7 Görünüm anahtarları

- `purchase-invoices` → sunucu varsayılanı (`TenantScreenViewEndpoints.cs:317-326, 688, 1206-1209`): `code` "Fatura
  no", `supplierName`, `receiptCode`, `purchaseOrderCode` "Sipariş no", `invoiceDate` "Fatura tarihi", `dueDate` "Vade
  tarihi", `currencyCode`, `grandTotal` "Toplam", `paidAmount`, `outstandingAmount` "Ödenmemiş", `lineCount`, `status`,
  `actions` (sabit). Hepsi görünürdür.
- **İstemci varsayılanından farkı:** istemci (`PurchaseInvoicesScreen.tsx:31-44`) farklı sıra ve etiket kullanır.
  Sipariş no, Döviz ve Satır gizlidir; "Kalan" ve "Genel toplam" etiketleri farklıdır. Sunucu varsayılanını
  **uygulamaz** (yalnız yayımlanmış görünüm). Sistem sayfası standardı istemci varsayılanını esas almalı; aksi halde ilk
  açılışta sütunlar değişir. Eşleme bire birdir; `actions` aktarılmaz.

---

### 2. Bağımsız fatura taslakları (`sales-purchase-invoice-drafts`)

#### 2.1 Yerleşim

Ekranın iki hâli vardır: **liste** ve **taslak formu**. Form açıkken liste ekrandan kalkar
(`StandaloneSupplierInvoiceDraftPage.tsx:125-126, 511-562`).

- **Başlık (liste):** "Bağımsız fatura taslakları". Açıklama "Siparişsiz tedarikçi faturasını kaydedin; uygunsa mal
  kabul satırıyla eşleştirip maliyet farkını aktarın.". Sayaç `totalCount`; yükleme sürerken toplam 0 ise boş kalır
  (`supplier-invoice-draft/components/InvoiceDraftList.tsx:136-140`).
- **Özet kartları:** **yok**.
- **Uyarı / bildirim şeritleri:** hata ve bildirim, ikisi de kapatılabilir, araç çubuğunun altında
  (`StandaloneSupplierInvoiceDraftPage.tsx:579-590`).
- **İşlem çubuğu (liste)** (`InvoiceDraftList.tsx:66-84, 123-135`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | boş taslak formu; meşgulken "İşleniyor…" (`:125`) |
| Aç | Enter | Odaklı satır, yoksa güncel satır. Neden: "Önce bir kayıt seçin" / taslak değilse "Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir." (`:26, 63-64, 126-132`) |
| İşlemler → Düzenle | | Aç ile aynı koşul (`:67-74`) |
| İşlemler → Muhasebeleştir | | aynı koşul; onay penceresi (`:75-82`) |
| İşlemler → CSV | | görünen ızgara (`:83`) |
| Sil | | **tanımlı değil** (komut verilmez). Silme ve iptal uç noktası yoktur. |

- **Süzgeç çubuğu:** **arama yok** (`ListToolbar`'a `search` verilmez, `:141-148`). Yalnız Yenile (yüklenirken
  çalışmaz) ve panel anahtarı Ctrl+. vardır.
- **Liste sütunları** (`StandaloneSupplierInvoiceDraftPage.tsx:37-54`, hücreler `InvoiceDraftList.tsx:206-231`,
  genişlikler `:31-34`). Kiracı görünümü `standalone-invoice-drafts`; **`fields` boş değilse her zaman uygulanır**
  (`id` aranmaz, `StandaloneSupplierInvoiceDraftPage.tsx:185-207`).

| Alan | Etiket | Gösterim |
|---|---|---|
| `invoiceNumber` | Fatura no | mono |
| `supplierName` | Tedarikçi | metin |
| `invoiceDate` | Fatura tarihi | **ham ISO** (`yyyy-aa-gg`, biçimlenmez, `:212-213`) |
| `dueDate` | Vade tarihi | ham ISO, boşsa — |
| `currencyCode` | Döviz | metin |
| `grandTotal` | Genel toplam | `listAmount` |
| `lineCount` | Satır | sayı |
| `createdAt` | Kaydedilme | `toLocaleString("tr-TR")` (tarih + saat) |
| `status` | Durum | Taslak (warn) / Muhasebeleştirildi (ok) (`purchasing/purchaseCreateForms.tsx:35-37`) |
| `actions` | İşlemler | çizilmez (`InvoiceDraftList.tsx:200-204`) |

- **Izgara:** tek tık güncel satır; çift tık / Enter / Aç **yalnız taslakta** formu açar (`openRow`, `:85-88`). Toplu
  eylem "Excel (seçilenler)" vardır.
- **Boş durumlar:** "Faturalar yükleniyor…", "Henüz bağımsız fatura kaydı yok." (`:159-162`).
- **Alt bilgi:** ipuçları, işaretli sayısı, "Gösterilen x / y" (`:173-187`). **Sayfalayıcı yoktur**: ilk 50 kayıt
  gösterilir (`StandaloneSupplierInvoiceDraftPage.tsx:147`, `types.ts:40`).
- **Detay paneli** (`InvoiceDraftList.tsx:90-119`; `useStockDetailPanelOpen(true)`, varsayılan açık). Tek sekme Özet
  vardır. Gösterge: Genel toplam. Bilgiler: Fatura tarihi, Vade tarihi, Satır, Kaydedilme ve muhasebeleştirilmişse
  "Durum: Deftere aktarıldı". Taslak değilse "Aç" pasiftir. Seçim yokken "Özetini görmek için listeden bir fatura
  seçin." Panel **detay okuması yapmaz**, yalnız liste satırını gösterir.
- **Taslak formu** (`supplier-invoice-draft/components/InvoiceDraftForm.tsx`; `RecordFormPage`):
  - **Başlık:** "Tedarikçi Fatura Taslağı" ya da düzenlemede "Fatura Taslağını Düzenle". Belge türü "Tedarikçi
    faturası", kod = girilen fatura no, karşı taraf = tedarikçi. Durum akışı Taslak → Muhasebeleştirildi; geçerli adım
    Taslak (`:23-32`; `purchaseCreateForms.tsx:30-32`).
  - **Kaydet:** "Taslağı kaydet" / "Taslağı güncelle". Vazgeç ve Esc listeye döner; form, değişiklik varsa önce sorar
    (`:35-40`; `StandaloneSupplierInvoiceDraftPage.tsx:393-402`).
  - **Durum satırı:** "Zorunlu alanlar: n / 4" (tedarikçi, fatura no, tarih, döviz), "Satır sayısı", düzenlemede
    "{no} taslağı düzenleniyor." ve sabit not "Tutarlar kaydedildiği haliyle korunur; bu işlem muhasebe veya stok kaydı
    oluşturmaz." (`InvoiceDraftForm.tsx:15-20, 43-57`).
  - **İşlem çubuğu (form):** yalnız Yeni (F2) vardır. Değişiklik varsa "Yeni kayıt — Kaydedilmemiş değişiklikler
    kaybolacak. Devam edilsin mi?" diye sorar (`StandaloneSupplierInvoiceDraftPage.tsx:511-535`;
    `commands/PageCommandsSlot.tsx:30-37`). Açık kayıtlı taslak her zaman "kirli" sayılır (`:516`).
  - **Belge bilgileri** (`InvoiceDraftDocumentFields.tsx:25-92`):
    - Tedarikçi *: aranabilir seçici, "kod · ad". Sunucu araması **180 ms** gecikmelidir, `pageSize=100`
      (`StandaloneSupplierInvoiceDraftPage.tsx:209-227`). Seçilen tedarikçi sonuçlarda yoksa listeye eklenir (`:251-258`).
      Seçilince taslak dövizi tedarikçi dövizine **kopyalanır** (`:297-305`).
    - Tedarikçi fatura no *: mono, ≤ 100
    - Fatura tarihi *: varsayılan yerel bugün (`:55-58`)
    - Vade tarihi: isteğe bağlı
    - Para birimi *: 3 harf, büyük harfe çevrilir, varsayılan TRY
    - Not: ≤ 1000, 2 satır
  - **Satır ızgarası** (`InvoiceDraftLineEditor.tsx:25-179`). 12 sütundur ve her satır bir ızgara satırıdır:
    - #: sil düğmesi; tek satırken pasif. Model de son satırı silmez (`StandaloneSupplierInvoiceDraftPage.tsx:312-320`).
    - **Siparişsiz mal kabul satırı**: aranabilir picker. Etiket "MK kodu · tarih · stok kodu · ad"; açıklamada "Kalan
      N birim · birim maliyet x baz para". Temizlenebilir; boş metin "Mal kabule bağlı değil · gider hesabı seçin".
      Seçenekler `supplierId` + `invoiceDate` (+ düzenlemede `draftId`) değişince yeniden yüklenir; hata sessizdir
      (`:229-249`).
    - Açıklama * (≤ 240)
    - Miktar (adım 0.0001)
    - Birim (≤ 12)
    - Birim fiyat (adım 0.0001)
    - Ara toplam *
    - İskonto * (varsayılan 0)
    - Vergi tutarı *
    - KDV % (0–100)
    - **Gider hesabı**: mal kabul satırı seçiliyse "—" (gizli). Değilse seçim kutusudur: "Şimdi seçme" + aktif `Expense`
      hesapları "kod · ad".
    - Satır toplamı *
  - **Mal kabul satırı seçilince** (`StandaloneSupplierInvoiceDraftPage.tsx:275-296`): açıklama "stok kodu · ad",
    miktar = kalan, birim = mal kabul birimi olur; gider hesabı **temizlenir**. Satır uyarı tonuna geçer ve altına not
    eklenir: "Bu satır mal kabul maliyetini faturadaki net tutara günceller. Yalnız kalan, tüketilmemiş stok için
    aktarılır; stok miktarı değişmez." (`InvoiceDraftLineEditor.tsx:76, 152-159`).
  - **Satır ekle** düğmesi ve Ctrl+Shift+Enter (`:162-168`). Izgara altında not: "Miktar ve birim fiyat isteğe
    bağlıdır; satır tutarları kaynak belgeden girilir, yeniden hesaplanmaz. KDV oranı belge üzerinden kaydedilir…
    Gider hesabı yalnız sonraki muhasebeleştirme için sınıflandırmadır." (`:171-179`).
  - **Belge toplamları** (`InvoiceDraftTotals.tsx:21-69`): Ara toplam *, İskonto toplamı * (varsayılan 0), Vergi
    toplamı *, Genel toplam *. **Elle girilir, hesaplanmaz**. İpucu "Toplamları tedarikçi belgesinden aynen aktarın."
- **Doğrulamalar (istemci):** HTML `required` / `min=0` / `maxLength` / `minLength=3`. Satır ve belge toplamlarının
  tutarlılığı istemcide **denetlenmez**.
- **Muhasebeleştir onayı** (uyarı tonu, `StandaloneSupplierInvoiceDraftPage.tsx:479-487`): "Tedarikçi faturası
  muhasebeleştirilsin mi?" / "{no} numaralı fatura için gider veya mal kabule bağlı stok maliyeti, varsa indirilecek KDV,
  tedarikçi borcu ve yevmiye kaydı oluşturulur. Stok miktar hareketi veya ödeme kaydı oluşturmaz.", düğme
  "Muhasebeleştir".
- **Bildirimler:**
  - oluşturma: "{no} taslak olarak kaydedildi. Cari borç, stok, ödeme veya yevmiye kaydı oluşturulmadı." (`:462-464`)
  - güncelleme: "{no} taslağı güncellendi. Muhasebe veya stok kaydı oluşturulmadı." (`:450-452`)
  - muhasebeleştirme: "{no} muhasebeleştirildi. Yevmiye ve tedarikçi cari hareketi oluşturuldu; stok miktarı ve ödeme
    hareketi oluşturulmadı." (`:500-502`)

  Kayıt hatası formda (`formError`), muhasebeleştirme hatası listede gösterilir.
- **Durum akışı:** Taslak → Muhasebeleştirildi (`Posted`). **Geri dönüş, silme ve iptal yok.**

#### 2.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, Yenile, kayıt / muhasebeleştirme sonrası | `GET /api/purchasing/standalone-invoices/` | `page=1&pageSize=50` (sabit), `q` gönderilmez | `erp.purchase-invoices.read` (satır süzgeçli) | `PurchaseInvoiceDraftEndpoints.cs:66-89`. **`page` ve `pageSize` varsayılansızdır** (`int page, int pageSize`); gönderilmezse bağlama hatası verir (doğrulanmalı). `q` ≤ 100 karakter; fatura no ve tedarikçi adında arar. Sıra fatura tarihi azalan, sonra oluşturma azalan. |
| Açılış | `GET /api/finance/general-ledger/accounts` | — | `erp.general-ledger.read` | Aktif ve `statementSection == "Expense"` istemcide süzülür (`StandaloneSupplierInvoiceDraftPage.tsx:162-183`). Hata sessizdir, liste boş kalır. |
| Açılış | `GET /api/screen-views/standalone-invoice-drafts/active` | — | `erp.screen-views.read` | hata sessiz |
| Form açık, tedarikçi araması (180 ms) | `GET …/standalone-invoices/suppliers` | `page=1&pageSize=100&q` | `erp.purchase-invoices.create` (satır süzgeçli) | `:15-35`. Aktif `Supplier`/`Both` cariler; `q` ≤ 120, kod/ad araması. `{id, code, name, currencyCode}`. **Form kapalıyken de** açılışta bir kez çalışır (`:209-227`; efekt `formOpen`'a bağlı değil). |
| Tedarikçi veya fatura tarihi değişince | `GET …/standalone-invoices/receipts` | `supplierId`, `invoiceDate`, düzenlemede `draftId` | `read` (rota) + **create** kuralıyla satır süzgeci | `:37-64`. İşlenmiş, tedarikçinin, fatura tarihinden önceki siparişsiz mal kabul satırları. Başka taslaklarda **ayrılmış** miktar düşülür (taslak durumu fark etmez); kalanı > 0 olanlar gelir. En çok 500. |
| Düzenle / Aç | `GET …/standalone-invoices/{id}` | — | `read` | `:91-101`. `Draft` değilse istemci "Yalnızca muhasebeleştirilmemiş…" hatası verir (`StandaloneSupplierInvoiceDraftPage.tsx:331-334`). `rowVersion` base64 döner. |
| Taslağı kaydet (yeni) | `POST …/standalone-invoices/` | `{requestId, supplierId, invoiceNumber, invoiceDate, dueDate?, currencyCode, notes?, subtotal, discountTotal, taxTotal, grandTotal, lines[{lineNumber (= sıra+1), description, quantity?, unitCode?, unitPrice?, subtotal, discountAmount, taxAmount, total, expenseAccountId?, vatRate?, standalonePurchaseReceiptLineId?}]}` | `erp.purchase-invoices.create` | `:195-281`. 201 `StandaloneSupplierInvoiceDraftDetail`; tekrar 200. |
| Taslağı güncelle | `PUT …/standalone-invoices/{id}` | yukarıdaki alanlar − `requestId` + **`expectedRowVersion`** | `erp.purchase-invoices.update` (satır süzgeçli) | `:103-191`. Satırlar **tümden silinip** yeniden yazılır (`:139-171`). |
| Muhasebeleştir | `POST …/standalone-invoices/{id}/post` | — | rota `erp.purchase-invoices.execute`; işleyici satır süzgecini **create** kurallarıyla uygular (`:294-296`) | `:284-547`. `{draftId, status, journalEntryId, ledgerEntryId}` |

#### 2.3 Kurallar

- **Kayıt doğrulaması** (`PurchaseInvoiceDraftEndpoints.cs:595-631`):
  - `requestId` ve tedarikçi zorunlu; fatura no 1–100; tarih zorunlu; vade ≥ fatura tarihi
  - döviz 3 harf; not ≤ 1000; tutarlar ≥ 0, 16+2 basamak
  - 1–100 satır; satır numaraları benzersiz ve pozitif; açıklama 1–240; birim ≤ 12
  - miktar ve fiyat ≥ 0, en çok 4 ondalık; KDV oranı 0–100, en çok 2 ondalık
  - gider hesabı firmanın etkin gider hesabı olmalı (`:558-572`)
  - tedarikçi etkin ve `Supplier`/`Both` türünde olmalı (`:136-137, 209-210`)
- **Kayıtta tutarlılık denetlenmez.** Satır toplamlarının belgeye eşitliği yalnız **muhasebeleştirmede** denetlenir.
- **Güncelleme:** yalnız `Draft` güncellenir (409). Sürüm uyuşmazlığında 409 "Taslağın gönderilen sürümü güncel değil.
  Yenileyip tekrar deneyin." (`:120-123`). Eşzamanlılık hatasında 409 (`:180-184`). Mal kabul satırı başka taslağa
  bağlıysa benzersizlik ihlali 409 (`:185-189`).
- **Muhasebeleştirme** (`:284-547`):
  - aynı tedarikçi + normalize fatura no ile muhasebeleştirilmiş başka fatura varsa 409 (`:314-318`)
  - toplam > 0 ve 1–100 satır (`:319-320`)
  - **tutarlılık**: `Total = Subtotal − Discount + Tax` her satırda; satır toplamları belgeye eşit; belge formülü tutarlı
  - mal kabul satırında gider hesabı **olmamalı**, diğer satırlarda **zorunlu**; aynı mal kabul satırı bir kez;
    bağlı satırda miktar > 0 ve birim dolu (`:324-333`)
  - mal kabul satırı: işlenmiş, aynı tedarikçinin ve tarihi ≤ fatura tarihi; birimi aynı; faturalanmış + bu miktar
    ≤ mal kabul miktarı; hareket tersine çevrilmemiş; fatura tarihinden sonra tüketim yok (`:337-370`)
  - kapalı dönem 409; tedarikçi etkin olmalı
  - eşleştirmeler: `PurchasePayable` (yükümlülük), varsa `PurchaseTaxRecoverable` (varlık), bağlı satır varsa
    `InventoryAsset` (varlık), tüketilmiş fark varsa `SalesCost` (gider). Hesaplar birbirinden farklı olmalı (`:390-414`).
  - **döviz kuru**: fatura tarihi ve öncesindeki son kur, yoksa 409 (`:416-421`)
  - tüketilmiş maliyet farkı ağırlıklı ortalama akışıyla dağıtılır; ayrıntılı hata metinleri `:668-766`
- **Denetim kaydı:** `standalone-supplier-invoice.draft-created` (`:265`), `.draft-updated` (`:174`), `.posted` (`:535`).
- **Muhasebeleştirilen taslak, Satınalma Faturaları listesinde görünmez.** O liste `PurchaseInvoices` tablosunu okur
  (`:6945`). Taslaklar `PurchaseInvoiceDrafts` tablosundadır. Ödeme ve iade akışları bu belgeye **bağlanamaz**: ödeme
  ve iade uç noktaları `PurchaseInvoices`'ı arar (`:7054, 7133`). Ödemesi başka ekrandan (cari/finans) yapılmalıdır;
  doğrulanmalı.

#### 2.4 Roller

- **TenantAdmin:** her şey; süzgeç yok. Ekranda rol denetimi yoktur (`role` prop'u kullanılmaz, `:113-115`).
- **TenantUser / TenantDeveloper:** her işlem ayrı bir izne bağlıdır:
  - liste ve okuma → `erp.purchase-invoices.read`
  - tedarikçi seçenekleri → `create`
  - mal kabul seçenekleri → `read` rotası + `create` satır kuralları
  - kaydet → `create`; güncelle → `update`
  - muhasebeleştir → **hem `execute` (rota) hem `create` satır kuralları**. `create` kuralı olmayan kullanıcıda
    süzgecin boş dönüp 404 verip vermediği **doğrulanmalı** (`PermissionStatusFilter.cs:15-48`).
  - gider hesapları ayrıca `erp.general-ledger.read` ister

#### 2.5 ERP işlem kataloğu

Var olan: yok.

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.taslak.listele` | GET `/api/purchasing/standalone-invoices` | query `q`, `page`*, `pageSize`* | list `StandaloneSupplierInvoiceDraftSummary`, `rowsPath "items"`, `MetaPaths` | `page`/`pageSize` sunucuda zorunlu; standart `paging` parametreleri **zorunlu** işaretlenmeli ya da sunucuya varsayılan eklenmeli |
| `satinalma.taslak.getir` | GET `/api/purchasing/standalone-invoices/{id}` | route `id` | record `StandaloneSupplierInvoiceDraftDetail` (skalerler, `rowVersion` dahil) | `satinalma.taslak.guncelle` kaynağı |
| `satinalma.taslak.satirlari` | GET aynı yol | route `id` | list `StandaloneSupplierInvoiceDraftLineView`, `rowsPath "lines"` | düzenleme ızgarasının tohumu |
| `satinalma.taslak.olustur` | POST `/api/purchasing/standalone-invoices` | body `requestId`* (autoId), `supplierId`*, `invoiceNumber`*, `invoiceDate`*, `dueDate`, `currencyCode`*, `notes`, `subtotal`*, `discountTotal`*, `taxTotal`*, `grandTotal`*; `ListParameter<StandaloneSupplierInvoiceDraftLineCreateRequest>("lines")` | record `StandaloneSupplierInvoiceDraftDetail` | `lineNumber` ızgara sırasından üretilmeli (G-P73) |
| `satinalma.taslak.guncelle` | PUT `/api/purchasing/standalone-invoices/{id}` | route `id`; body aynı skalerler + `expectedRowVersion`*; `lines` | record `…Detail` | kaynak `satinalma.taslak.getir`. `expectedRowVersion` ← kaynağın `rowVersion`'ı; ad farkı nedeniyle otomatik eşlenmez (G-P73). `lines` bütünüyle gönderilmeli (PUT tam değiştirir). |
| `satinalma.taslak.muhasebelestir` | POST `/api/purchasing/standalone-invoices/{id}/post` | route `id` | record `StandaloneSupplierInvoiceDraftPostingResult` | `execute` + `create` (2.4) |
| `satinalma.taslak.tedarikciler` | GET `/api/purchasing/standalone-invoices/suppliers` | query `q`, `page`*, `pageSize`* | list `StandaloneSupplierInvoiceDraftSupplierOption`, `rowsPath "items"` | picker; sunucu araması |
| `satinalma.taslak.malKabulSatirlari` | GET `/api/purchasing/standalone-invoices/receipts` | query `supplierId`* (guid), `invoiceDate`* (date), `draftId` (guid) | list `StandaloneSupplierInvoiceDraftReceiptOption` | satır picker'ı; 500 sınırı |
| `satinalma.taslak.giderHesaplari` | GET `/api/finance/general-ledger/accounts` | — | list (hesap görünümü; doğrulanmalı) | aktif + `Expense` süzmesi istemcide (G-P71); sunucuda `?statementSection=Expense&activeOnly=true` önerilir |

Gereken yeni `Labels` kodları:
- `supplierId`, `supplierName`, `invoiceNumber`, `invoiceDate`, `dueDate`, `currencyCode`, `notes`, `subtotal`,
  `discountTotal`, `taxTotal`, `grandTotal`
- liste parametresi öğeleri ve satır sütunları: `lineNumber`, `unitPrice`, `discountAmount`, `taxAmount`, `total`,
  `expenseAccountId`, `vatRate`, `standalonePurchaseReceiptLineId`
- seçenek ve sonuç sütunları: `lineId`, `receiptId`, `receiptCode`, `stockCode`, `stockName`, `draftId`,
  `journalEntryId`, `ledgerEntryId`, `statementSection`

Var olanlar: `id`, `code`, `name`, `status`, `createdAt`, `updatedAt`, `rowVersion`, `description`, `quantity`,
`unitCode`, `receiptDate`, `unitCostBase`, `lineCount`, `isActive`.

#### 2.6 Bileşen eşlemesi ve eksikler

Var olan karşılıklar:
- liste: `actionBar` (Yeni → form, Aç / Düzenle `disabledWhen status != Draft` + neden, Muhasebeleştir
  `confirmEnabled`), `dataTable`, `contextPanel`
- form: `recordHeader` + `steps` (Taslak → Muhasebeleştirildi), `formCard` (belge bilgileri ve toplamlar)
- satırlar: `editableGrid` (picker sütunları: mal kabul satırı, gider hesabı)
- `text` (notlar), `alert`

Eksikler:

- **G-P69 Liste sayfalaması ve arama** — `fark`. Eski ekran yalnız ilk 50 kaydı gösterir: sayfalayıcı ve arama yoktur
  (`StandaloneSupplierInvoiceDraftPage.tsx:147`). Sunucu `q` ve sayfalamayı destekler. Sistem sayfasında sunucu
  sayfalama 25 + arama `q` açılması **iyileştirmedir** ve kararla yazılmalı. Tarihler eski ekranda ham ISO'dur;
  sistem sayfasında tarih biçimi uygulanır (`fark`, olumlu).
- **G-P70 Tedarikçi seçiminin yan etkileri** — `eksik`.
  - (a) Picker sunucu aramalıdır (180 ms, ≤ 100 sonuç).
  - (b) Seçili tedarikçi arama sonucunda yoksa seçenekte tutulur (düzenlemede kod boş gelir, `:336-341`).
  - (c) Seçim **döviz alanını tedarikçi dövizine kopyalar**. "Seçimde başka alanı doldur" eylemi doğrulanmalı.
  - (d) Tedarikçi değişince satırlardaki mal kabul seçimleri **temizlenmez**; geçersiz seçimi sunucu muhasebeleştirmede
    reddeder.

  Öneri: picker'da `onSelectSet {currencyCode: satir.currencyCode}`; olmazsa `fark`: döviz elle seçilir.
- **G-P71 Satır picker'ının bağımlı seçenekleri ve satır doldurma** — `eksik`.
  - Mal kabul satırı seçenekleri başlıktaki `supplierId` + `invoiceDate` + (düzenlemede) taslak `id`'sine bağlıdır.
  - Seçim aynı satırda açıklama, miktar ve birimi doldurur, gider hesabını **temizler ve gizler**.
  - Seçili satırın altına uyarı satırı eklenir ve satır uyarı tonuna geçer.
  - Gider hesabı seçenekleri istemcide `Expense` + aktif süzülür.

  `editableGrid` picker'ının (a) başlık alanlarına bağlı parametreli seçenek sorgusu, (b) seçimde kardeş hücre
  doldurma, (c) hücre `visibleWhen`/`disabledWhen` desteklediği **doğrulanmalı**. Uyarı alt satırı yoktur (`fark`:
  satır tonu ya da ızgara altında sabit not).
- **G-P72 Elle girilen toplamlar ve geç doğrulama** — `fark`. Tutarlar kaynak belgeden aynen girilir; ne istemci ne
  kayıt uç noktası tutarlılığı denetler. Hata ancak muhasebeleştirmede tek 409 metniyle çıkar (`:324-333`). Sistem
  sayfasında da aynı kalırsa eşdeğerdir. Öneri (iyileştirme): kayıttan önce `Σ satır = belge` ve `Total = Subtotal −
  Discount + Tax` için `alert` + kaydet `disabledWhen`. Bu, ızgara toplamı bağlaması ister; toplama yoktur, G-P61 ile
  aynı kısıt. "Zorunlu alanlar: n / 4" sayacı da düşer (`fark`).
- **G-P73 Güncellemede sürüm alanı ve satır numarası** — `eksik`.
  - PUT gövdesi `expectedRowVersion` ister, okuma `rowVersion` döndürür. Kaynaklı işlemde gövde
    `{...kaynak, ...fixedBody}` ile başladığından (`custom-page/erpOperations.ts:77, 105`; kod çıkarımı) `rowVersion` gönderilir, `expectedRowVersion` boş kalır ve 400 "Geçerli taslak
    sürümü gereklidir." döner (`:107-108`).
  - `lineNumber` ızgara sırasından (index + 1) üretilir (`StandaloneSupplierInvoiceDraftPage.tsx:422-423`). `editableGrid`'in sıra numarası üretip üretmediği
    doğrulanmalı.
  - PUT satırları tümden değiştirir; ızgara bütün satırları göndermelidir.

  Öneri: katalogda `bodyMap`/takma ad ile `expectedRowVersion ← rowVersion`, ya da sunucunun `rowVersion`'ı da kabul
  etmesi.
- **G-P74 Muhasebeleştirmenin geri alınamazlığı ve çift izin** — `eksik`. Taslağı silen ya da muhasebeleştirmeyi
  geri alan **uç nokta yoktur** (grup yalnız GET/PUT/POST tanımlar, `:13-281`). Yanlış taslak listede sonsuza kadar
  kalır; muhasebeleştirilmiş kayıt yalnız yevmiye ters kaydıyla düzeltilebilir (doğrulanmalı). Eski ekranda da
  böyledir, yani eşdeğerdir. Ancak sistem sayfasında "Sil" komutu tanımlanmamalı (silme işlemi önerilmez). İzin tarafında
  muhasebeleştirme `execute` + `create` ister. Katalog `allowed` yalnız `execute`'a bakarsa düğme etkin görünür ama
  404 olabilir. Öneri: sunucu işleyicisinin süzgeci `erp.purchase-invoices.execute` ile yapılsın (davranış değişikliği,
  güvenlik incelemesi gerekir).

#### 2.7 Görünüm anahtarları

- `standalone-invoice-drafts` → `invoiceNumber`, `supplierName`, `invoiceDate`, `dueDate`, `currencyCode`,
  `grandTotal`, `lineCount`, `createdAt`, `status`, `actions` (sabit) (`TenantScreenViewEndpoints.cs:334-341, 690,
  1216-1219`). İstemci varsayılanıyla **aynıdır**. Eşleme bire birdir; `actions` aktarılmaz. Eski ekran `id` aramadan
  her görünümü uyguladığından sunucu varsayılanı da uygulanır. Sistem sayfası standardı bu listeyi esas alabilir.

---

### 3. Satınalma İadeleri (`sales-purchase-returns`)

#### 3.1 Yerleşim

Ekran Satış İadeleri ile ortaktır (`document-returns/DocumentReturnsPage.tsx`). Taraf farkı
`returnSides.purchase`'tadır (`document-returns/types.ts:85-99`).

- **Başlık:** "Satınalma İadeleri". Açıklama "Tedarikçilere geri gönderilen ürünler. İade stoktan düşülür ve tedarikçi
  borcunu azaltır.". Sayaç `totalCount`. Başlığın sağında sabit ipucu "İade, fatura detayından oluşturulur"
  (`DocumentReturnsPage.tsx:215-218`).
- **Özet kartları** (`:219-236`, "bu sayfa"):
  - İade tutarı: Σ `grandTotal`, yalnız `Posted`, tek dövizse. İpucu "bu sayfa · iptaller hariç"; çok dövizde
    "birden çok para birimi".
  - İptal: `Voided` sayısı
- **Uyarı şeridi:** kapatılabilir hata (`:248-253`). Bildirim ve hata detay ekranındadır.
- **İşlem çubuğu (liste)** (`:173-192`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | **fatura listesine gider** (`onNavigate("sales-purchase-invoices")`); iade faturadan oluşturulur (`:174`) |
| Aç | Enter | Odaklı satır, yoksa güncel satır, yoksa tek işaretli satır. Yoksa "Önce bir kayıt seçin" (`:183-189`). |
| İşlemler → CSV | | görünen ızgara (`:190`) |
| Sil | | tanımlı değil (listede) |

- **Süzgeç çubuğu** (`:237-247`): arama "İade no, fatura veya tedarikçi ara" vardır. **Yazarken uygulanmaz**: Enter /
  uygula ile `filter`'a geçer ve sayfayı 1'e alır (`onSearchApply`, `:240`). Sunucu iade kodu, fatura kodu ve tedarikçi
  adında `Contains` arar (`DocumentListEndpoints.cs:53-57`). Durum süzgeci yoktur. Yenile ve panel anahtarı Ctrl+. vardır.
- **Liste sütunları** (sabit, **kiracı görünümü yok**; `DocumentReturnsPage.tsx:71-80`, hücreler `:152-169`):

| Alan | Etiket | Gösterim |
|---|---|---|
| `code` | İade no | bağlantı düğmesi; detayı açar |
| `returnDate` | Tarih | gg.aa.yyyy |
| `partyName` | Tedarikçi | `supplierName`'den eşlenir (`types.ts:108`); boşsa — |
| `invoiceCode` | Fatura | metin |
| `warehouseName` | Depo | metin |
| `lineCount` | Satır | sayı |
| `grandTotal` | Tutar | `listAmount` |
| `status` | Durum | `listTag("return")`: İşlendi / İptal (`document-page/documentStatus.ts:60-66`) |

- **Izgara:** tek tık güncel satır; çift tık / Enter / kod bağlantısı detayı açar. Toplu eylem "Excel (seçilenler)"
  yalnız liste aktifken çıkar (`:275-278`). `gridId` "purchase-returns-list".
- **Boş durumlar:** "İadeler yükleniyor…", "Henüz alış iadesi yok. İade, kayıtlı bir alış faturasının detayından
  oluşturulur.", "Aramanızla eşleşen iade yok." (`:263-266`; `types.ts:93`).
- **Alt bilgi:** işaretli, gösterilen/toplam, sayfalama 25 (`:280-290`).
- **Detay paneli** (`ReturnListPanel`, `sales/components/SalesListPanels.tsx:337-371`): kod, tedarikçi ve durum
  rozeti; sekmeler Özet / Satırlar (`:83-86`). Özet şunları gösterir:
  - göstergeler: Genel toplam, Ara toplam, İskonto, KDV (`:102-108`)
  - bilgiler: İade tarihi, Depo
  - zincir: Alış faturası → Bu iade
  - satır önizlemesi

  Veri `GET /api/purchasing/returns/{id}` sonucundandır.
- **İade detayı** (`components/ReturnDetailSurface.tsx`; listenin üstünü kaplar):
  - **Başlık:** "Alış iadesi", kod, tedarikçi, tarih, durum. Akış İşlendi, uç durum İptal (`:43-51`; `sales/salesDocumentDetail.tsx:82-84`).
  - **Bağlam:** Belge zinciri. "Alış faturası" öğesi **tıklanabilir** (`onOpen`) ve faturayı açar (`:52-61`).
  - **Üst bilgiler:** İade tarihi, "İadenin çıktığı depo", Kaynak fatura, Para birimi (`:77-87`).
  - **Satırlar** (`:88-134`): #, Stok, Miktar + birim (girilen birim farklıysa altında "girilen miktar · birim"),
    Birim fiyat, İskonto (tutar + %), KDV (tutar + %), Toplam. Boşken "Satır yok."
  - **Toplamlar:** KDV oranına göre gruplar (`vatByRate`, `salesTotalRows`, `:34-41, 135-139`). Yanında not:
    işlenmişse "İade stoktan düşülür ve tedarikçi borcunu azaltır.", iptalse "Bu iade iptal edildi; stok ve cari
    hareketleri ters kayıtla geri alındı."
  - **Hata / bildirim** şeritleri (`:65-76`).
  - **İşlem çubuğu (detay açıkken)** (`DocumentReturnsPage.tsx:174-182`):
    - Yeni birincil değil
    - Yenile = detayı yeniden okur; Filtre ve Excel pasif
    - Sil pasif (işlenmişse "Kesilmiş belge silinemez — İşlemler › İadeyi iptal et")
    - İşlemler → **Faturayı aç** ve **İadeyi iptal et** (yalnız işlenmiş; meşgulken "İptal ediliyor…")
  - **Faturayı aç:** iade ekranının üstünde `PurchaseInvoiceModal`'ı açar. Fatura açıkken iade ekranı çubuğu bırakır
    (`:214`). Fatura üzerinde değişiklik yapılırsa (ödeme, iade iptali…) iade listesi ve açık iade yeniden okunur
    (`:145-150, 312-314`).
  - **İptal onayı:** "İade iptal edilsin mi?" / "{kod} alış iadesinin stok ve cari hareketleri ters kaydedilecek.",
    düğme "İptal et" (`:120-131`; `types.ts:95`). Başarıda detay yeniden okunur, bildirim "Alış iadesi iptal edildi; stok
    ve cari kayıtları ters hareketle korundu." çıkar ve liste yenilenir (`:134-138`).
- **Durum akışı:** İşlendi → İptal. **Oluşturma bu ekranda yoktur**; fatura detayındadır (1.1).

#### 3.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, sayfa, arama uygula, Yenile, iptal sonrası | `GET /api/purchasing/returns/` | `page`, `pageSize=25`, `q?` (yalnız doluysa) | `erp.supplier-returns.read` (**satır süzgeci yok**) | `DocumentListEndpoints.cs:48-63`. Sıra iade tarihi azalan, sonra oluşturma azalan. `SupplierReturnListItem` (`PlatformContracts.cs:1419-1421`): `currencyCode` faturadan gelir. |
| Açılış | `GET /api/warehouses/` | — | `erp.warehouses.read` | yalnız "Faturayı aç" içindir; hata sessiz (`DocumentReturnsPage.tsx:101-107`) |
| Panel + satır değişimi; Aç; Yenile; iptal sonrası | `GET /api/purchasing/returns/{id}` | — | `read` | `:65-77`. `SupplierReturnDetail` (`PlatformContracts.cs:1423-1426`): `invoiceStatus`, `purchaseOrderId`, ara toplam, iskonto, vergi ve satırlar (`SupplierReturnLineView`, `storageLocationId` **bu uçta doldurulmaz**, `:74-75`) |
| İadeyi iptal et | `POST /api/purchasing/returns/{id}/void` | — | `erp.supplier-returns.execute` | `Program.cs:7334-7383` |
| Faturayı aç | 1.2'deki fatura detay çağrıları | | `erp.purchase-invoices.read` … | `PurchaseInvoiceModal` |

#### 3.3 Kurallar

- İdempotency ve rowVersion: iade iptali anahtarsızdır ve rowVersion almaz; ikinci çağrı 409 döner (0. bölüm tablosu). İade iptalinin kuralları 1.3'tedir (`:7334-7383`). İptal tarihi UTC bugündür. Kapalı dönem 409 verir. Bozulmamış
  `SupplierReturn` yevmiyesi varsa 409 "Önce yevmiye fişini ters kayıtla kapatın".
- İptal, stok **girişi** ters kaydı yazar. Lot/seri izleme kopyalanır ve konum korunur (`:7370-7375`). İptal edilen
  iade faturanın "kalan" ve "iade edilebilir" hesabından düşer (`:7035, 7042`; `PurchaseInvoiceModal.tsx:855-860`).
- **Satır görünürlüğü yok** (0. bölüm). Yazma tarafında `{id}` öznitelik çözümü de yoktur; yalnız kaynak düzeyi izin
  vardır.
- **Denetim kaydı:** `supplier-return.voided` (`:7380`); oluşturma `supplier-return.posted` (`:7281`, fatura ekranında).

#### 3.4 Roller

- **TenantAdmin:** her şey.
- **TenantUser / TenantDeveloper:**
  - liste ve detay → `erp.supplier-returns.read`; iptal → `erp.supplier-returns.execute`. **Tedarikçi/durum koşullu
    kural uygulanmaz** (süzgeç yok; öznitelik çözümü yok). Tedarikçi koşullu Allow kuralının bu kaynakta nasıl
    sonuçlandığı (hiç eşleşmeme → ret?) **doğrulanmalı**.
  - "Faturayı aç" `erp.purchase-invoices.read` ister.
  - Rol `role` prop'u satış tarafındaki `SalesInvoiceModal` içindir; alış tarafında kullanılmaz (`:309-314`).

#### 3.5 ERP işlem kataloğu

Var olan: yok (`rapor.supplierReturns` yalnız rapordur).

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satinalma.iade.listele` | GET `/api/purchasing/returns` | query `q`, `page`, `pageSize` | list `SupplierReturnListItem`, `rowsPath "items"`, `MetaPaths` | satır süzgeci yok (G-P75) |
| `satinalma.iade.getir` | GET `/api/purchasing/returns/{id}` | route `id` | record `SupplierReturnDetail` (skalerler) | `invoiceStatus` enum metin |
| `satinalma.iade.satirlari` | GET aynı yol | route `id` | list `SupplierReturnLineView`, `rowsPath "lines"` | |
| `satinalma.iade.olustur` | POST `/api/purchasing/invoices/{id}/returns` | route `id`; body `requestId`* (autoId), `warehouseId`*, `returnDate`*; `ListParameter<SupplierReturnLineWriteRequest>("lines")` (`purchaseInvoiceLineId`*, `quantity`*, `unitCode`, `storageLocationId`) | record `SupplierReturnSummary` | fatura detayından çağrılır; izin `erp.supplier-returns.create` (iç içe). G-P66. |
| `satinalma.iade.iptal` | POST `/api/purchasing/returns/{id}/void` | route `id` | none (`{id, code, status}`) | `execute`. Gövde yok. |

Gereken yeni `Labels` kodları: `invoiceCode`, `purchaseInvoiceId`, `invoiceStatus`, `supplierId`, `supplierName`,
`returnDate`, `currencyCode`, `grandTotal`, `subtotal`, `discountTotal`, `taxTotal`, `purchaseInvoiceLineId`,
`orderLineNumber`, `stockCode`, `stockName`, `unitPrice`, `discountPercent`, `vatPercent`, `lineSubtotal`,
`discountAmount`, `taxAmount`, `lineTotal` (1.5 ile örtüşenler bir kez eklenir).

#### 3.6 Bileşen eşlemesi ve eksikler

Var olan karşılıklar:
- liste: `actionBar` (Yeni → `erpPage sales-purchase-invoices`, Aç, CSV), `filterBar` (`q`), `dataTable` (sayfalama 25,
  `valueLabels`/`toneMap` durum), `metric` + `countWhen` (İptal sayısı), `contextPanel` + `tabs`
- detay: `recordHeader` + `steps`, `section` + `dataTable` (satırlar), `button` + `confirmEnabled` (İadeyi iptal et)

Eksikler:

- **G-P75 İadelerde satır düzeyi süzgeç yok** — `eksik` (sunucu, güvenlik). Faturalar tedarikçi/durum koşullu
  süzülür, iadeler süzülmez (0. bölüm). Sistem sayfası bu açığı aynen taşır. Fatura satır kuralıyla daraltılmış bir
  kullanıcı iade listesinden diğer tedarikçilerin iade tutarlarını ve fatura kodlarını görür. Öneri: liste ve detayda
  `PermissionStatusFilter.ApplyAsync(..., "erp.supplier-returns.read", ..., x => x.Status, null, x => x.SupplierId)`.
  Ayrıca `IsStatusFilteredCollection` ve `ResolveResourceAttributesAsync`'e `erp.supplier-returns` dalı eklenmeli.
  Taşımadan **önce** kapatılması önerilir. Aksi halde katalog işlemi bu açığı Studio'ya da açar.
- **G-P76 Aramanın uygulanma biçimi** — `fark`. Eski ekran aramayı yazarken değil Enter/uygula ile gönderir
  (`DocumentReturnsPage.tsx:240`). Fatura ekranı her tuşta gönderir. `filterBar` arama davranışı (gecikmeli canlı
  arama) kabul edilebilir.
- **G-P77 "Faturayı aç" köprüsü** — `eksik`. İade detayı, bağlam zincirindeki fatura öğesinden ve İşlemler menüsünden
  **faturayı iade ekranının üstünde** açar. Fatura değişince iadeyi yeniden okur (`:145-150, 297-314`). Sistem
  sayfasında bu ya (a) `erpPage sales-purchase-invoices` + `openParams {id}` olur, ki fatura sayfasının açılışta
  `id` parametresiyle detay açması gerekir, ya da (b) iade sayfası içinde fatura detayını yeniden kuran bir `dialog`
  (xl) olur; bu da fatura detayının bütün eksiklerini (G-P63…G-P67) ikinci kez taşır. Öneri (a), dönüşte iade listesi
  yenilenir (`fark`: aynı ekran üstünde açılmaz).
- **G-P78 İade satırında girilen birim ve KDV grubu** — `fark`. Miktar hücresi, girilen birim temel birimden farklıysa
  ikinci satırda "girilen miktar · birim" gösterir (`ReturnDetailSurface.tsx:114-119`). Toplamlar KDV oranına göre
  gruplanır. Satır altı ikincil metin ve oran grubu yoktur. Öneri: `enteredQuantity`/`enteredUnitCode` ayrı sütunlar
  (varsayılan gizli) ve toplamlarda yalnız Ara toplam / İskonto / KDV / Genel toplam. İptal notunun koşullu metni
  `text` + `visibleWhen` ile kurulabilir.
- **G-P79 Sabit sütunlar ve Yeni'nin anlamı** — `fark`. İade listesinin kiracı görünümü yoktur; sütunlar sabittir.
  Sistem sayfası Studio'da düzenlenebilir hâle getirir (olumlu). "Yeni" kayıt açmaz, fatura listesine gider; başlıkta
  "İade, fatura detayından oluşturulur" ipucu durur. Sistem sayfasında Yeni → `erpPage` + `text` ipucu ile eşdeğerdir.
  Ancak kullanıcı orada faturayı kendisi bulmalıdır; seçili iadenin faturası ön seçilmez (bugün de seçilmez).
- Ortak: **G-C3** iadelerde etkisizdir (satır kuralı yok). **G-C5**, **G-C19**, **G-C25** geçerlidir.

#### 3.7 Görünüm anahtarları

- İade listesi için `screen-views` anahtarı **yoktur** (`TenantScreenViewEndpoints.cs:31-35` listesinde
  `purchase-returns` yok). Aktarılacak kiracı tercihi yoktur.

---

### 4. Kaybolması kolay eski davranışlar

1. Listeden **Ödeme ekle / İade oluştur / İptal et**, faturayı açıp ilgili çekmeceyi ya da onayı **kendiliğinden**
   başlatır (`PurchaseInvoiceModal.tsx:150-162`).
2. **Yeni (F2)** fatura listesinde yeni fatura açmaz, mal kabul faturası girişine gider. Fatura detayı açıkken de aynısı
   olur (`PurchaseInvoicesScreen.tsx:144-145, 416`). İade listesinde Yeni fatura listesine gider.
3. İptal fatura listede ve panelde "Kalan —" gösterir; sunucu yine de tutar döndürür. Kartlar iptali sayılara katmaz
   (`:185-188, 282-284`). Detay ise tutarı gösterir (tutarsızlık, korunmalı mı karar verilmeli).
4. Tamamen iade edilmiş, hiç ödenmemiş fatura "Ödendi" değil "İşlendi" görünür (`purchaseInvoiceStatus.ts:26-27, 33-35`).
5. Sayfa kartlarında birden çok döviz varsa toplam yerine "—" + "birden çok para birimi" yazılır. Boş kart sayfa
   tek dövizliyse "0,00 TRY" gösterir.
6. Ödeme formunda hesap seçenekleri yönteme, dövize ve aktifliğe göre süzülür. Yöntem değişince seçim temizlenir.
   Kasa bakiyesi etikette görünür. Uygun hesap yoksa yönlendirme metni çıkar ve kayıt kilitlenir.
7. Başarısız kayıtta `requestId` korunur; yeniden deneme çift kayıt yapmaz. Yalnız başarıda yenilenir.
8. İade formunda birim seçimi satır başına, konum seçimi depoya bağlıdır. Depo değişince konumlar sıfırlanır.
   Miktarı 0 olan satırlar gönderilmez.
9. Fatura detayındaki **Depo** adı siparişten bulunur; izin yoksa "—" kalır, hata verilmez.
10. Taslakta tedarikçi seçimi dövizi kopyalar. Mal kabul satırı seçimi açıklama, miktar ve birimi doldurur, gider
    hesabını temizleyip gizler ve uyarı satırı ekler.
11. Taslakta son satır silinemez. Ctrl+Shift+Enter satır ekler. F2 kirli formda onay sorar. Açık kayıtlı taslak hep
    "kirli" sayılır.
12. Taslak güncellemesi `expectedRowVersion` ile iyimser kilitlidir. Muhasebeleştirilmiş taslak Aç/Düzenle ile
    açılamaz; neden metni gösterilir.
13. İade detayından "Faturayı aç" faturayı üstte açar; fatura üzerinde yapılan değişiklik iade ekranını yeniler.
14. İade araması yalnız Enter/uygula ile çalışır. Fatura araması her tuşta çalışır.
15. Cari ekranından gelen tedarikçi süzgeci yalnız kaldırılabilir bir çip olarak görünür; boş durum metni tedarikçi
    adını içerir.
16. Detay panelleri ilk satırı kendiliğinden seçmez. Fatura paneli `reloadKey` = satır JSON'u ile, satır değiştiğinde
    (ör. ödeme sonrası) yeniden okur.

### 5. Riskler

- **R1 (güvenlik):** İadelerde satır düzeyi görünürlük yok (G-P75). Katalog işlemi bu açığı Studio sayfalarına da
  genişletir.
- **R2 (izin tutarsızlığı):** Taslak muhasebeleştirme `execute` rotası + `create` satır süzgeci ister (G-P74). G-C3 ile
  birlikte düğme durumu ile sunucu sonucu ayrışabilir.
- **R3 (iptal zinciri):** Ödeme yevmiyesi ödeme anında yazıldığından, ödeme iptali (ve dolayısıyla ödemeli faturanın
  iptali) önce fiş ters kaydı ister. Bu doğrulandı (1.3; `GeneralLedgerTransferEndpoints.cs:92-98`). Bugünkü ekran bunu
  önceden bildirmez; "Ödemeyi iptal et" etkin görünür ve 409 metniyle öğrenilir. Sistem sayfasında da aynı kalır.
  Öneri: `SupplierPaymentSummary`'ye `hasUnreversedJournal` eklenip `disabledReason` "Önce yevmiye fişini ters kayıtla
  kapatın" yazılsın.
- **R4 (tarih):** İptal tarihleri `DateTime.UtcNow` ile yazılır (`:7301, 7342, 7393`). Gece yarısı ile 03:00 arasındaki
  iptal önceki güne düşer, kapalı dönem denetimini de etkiler. Sistem sayfası değiştirmez; bilinmeli.
- **R5 (yasal görünürlük):** Vergi dökümü (KDV oranları, ek vergiler, tevkifat) taşınmazsa detay ekranında tevkifat
  görünmez olur (G-P63).
- **R6 (iki kopya fatura detayı):** Fatura detayı hem fatura listesinden hem iade detayından açılır. Sistem sayfasında
  `dialog` ile ikinci kez kurmak bakım yükü getirir (G-P77).
- **R7 (eski bileşen bağı):** İki ekran `SalesPage` içinden açılır. Sistem sayfasına geçiş `SalesPage`'deki sekme
  eşlemesini ve dış kabuğu (`:2172-2183`) etkilemez. Ancak "Eski ekranda aç" (`onOpenLegacy`) yolu `SalesPage`'i yine
  yükler (10.992 satır, tembel yükleme `WorkspacePageRouter.tsx:89-99`).
- **R8 (görünüm uyumsuzluğu):** Fatura listesinde sunucu varsayılan görünümü istemci varsayılanından farklıdır (1.7).
  Standart yanlış kaynaktan üretilirse kullanıcı ilk açılışta farklı sütunlar görür.
- **R9 (bağımsız faturanın kopukluğu):** Muhasebeleştirilmiş bağımsız fatura Satınalma Faturaları listesinde görünmez;
  ödeme ve iade akışına bağlanamaz (2.3). Kullanıcı beklentisiyle çelişebilir. Taşıma kapsamı dışı ama belgelenmeli.

### 6. Boşluk dizini (G-P60…G-P79)

| Kimlik | Ekran | Etiket | Kısa ad |
|---|---|---|---|
| G-P60 | Faturalar | eksik | Türetilmiş ödeme durumu ve gecikme günü |
| G-P61 | Faturalar | eksik | Sayfa tutarı kartları (toplama yok) |
| G-P62 | Faturalar | eksik | Tedarikçiyle açılış ve çip |
| G-P63 | Faturalar | eksik | İç içe listeler ve vergi dökümü |
| G-P64 | Faturalar | fark | Depo adı ikincil okuma |
| G-P65 | Faturalar | eksik | Ödeme formu koşullu alanları |
| G-P66 | Faturalar | eksik | İade formu ızgarası |
| G-P67 | Faturalar | fark | İptal ön koşulları ve sıra |
| G-P68 | Faturalar | fark | Gelen e-belge ve vergi profili gösterimi |
| G-P69 | Taslaklar | fark | Liste sayfalaması ve arama |
| G-P70 | Taslaklar | eksik | Tedarikçi seçiminin yan etkileri |
| G-P71 | Taslaklar | eksik | Satır picker'ı bağımlı seçenekler ve doldurma |
| G-P72 | Taslaklar | fark | Elle toplamlar, geç doğrulama |
| G-P73 | Taslaklar | eksik | `expectedRowVersion` ve satır numarası |
| G-P74 | Taslaklar | eksik | Geri alınamazlık ve çift izin |
| G-P75 | İadeler | eksik | Satır düzeyi süzgeç yok |
| G-P76 | İadeler | fark | Aramanın uygulanma biçimi |
| G-P77 | İadeler | eksik | "Faturayı aç" köprüsü |
| G-P78 | İadeler | fark | Girilen birim ve KDV grubu |
| G-P79 | İadeler | fark | Sabit sütunlar ve Yeni'nin anlamı |

Önerilen işlem adları: **25**.
- `satinalma.fatura.*`: 11, bunların 2'si yeni uç nokta ister: `ozet`, `iadeEdilebilirSatirlar`. Ayrıca G-P63 için
  isteğe bağlı `vergiDokumu` önerilir.
- `satinalma.taslak.*`: 9
- `satinalma.iade.*`: 5

---

## Kısım E — Ticari sözleşmeler, tedarikçi kartları ve ortak eksikler

Atıf kuralı: dosya adı verilmeyen sunucu satırları `Program.cs` içindir. Ortak bilgiler (E 0) bu belgenin 0. bölümüne taşındı.

### 1. Ticari sözleşmeler (`commercial-contracts`)

Bileşen: `CommercialContractsPage.tsx` (667 satır) + `commercial-contracts/components/{ContractsPageHeader (59),
ContractRegister (444), ContractCreateDialog (474)}.tsx`, `commercial-contracts/types.ts` (86), `commercial-contracts.css`.
Yönlendirici yalnız `token`, `role` ve `locale` verir (`WorkspacePageRouter.tsx:337-344`). Sunucu:
`CommercialContractEndpoints.cs` (332 satır), alan modeli `src/Platform/AIERP.Platform.Domain/CommercialContracts.cs`.

#### 1.1 Yerleşim

- **Başlık:** `ContractsPageHeader`. Sayaç = görünen (istemcide süzülmüş) sözleşme sayısı (`CommercialContractsPage.tsx:554`).
  "Yeni sözleşme" yalnız `canEdit` (TenantAdmin) için görünür. XLSX ve CSV dışa aktarma düğmeleri var
  (`:555-565`). Dışa aktarılan sütunlar: kod, tür, cari, başlangıç, bitiş, döviz, durum, sürüm (`:526-549`).
- **Sol sütun (liste):** arama kutusu ("Kod veya cari ara") ve Yenile (`ContractRegister.tsx:113-134`). Tür çipleri
  (Tümü / Satış / Satın alma, `:135-144`) ve sayaçlı durum çipleri (Taslak, Aktif, Askıda, Tamamlandı, Feshedildi, İptal;
  `:145-154`). Sayaçlar tür ve arama süzgecine uyar, durum süzgecine uymaz (`:96-108`). Liste kartı bir düğmedir:
  kod, cari, geçerlilik metni ("x gün kaldı" vb.), geçen sürenin çubuğu ve 30 gün kala "bitiyor" işareti
  (`:184-230, 43, 252-262`). Boş durum metinleri role göre değişir (`:160-182`).
- **Sağ sütun (ayrıntı):** başlıkta kod, durum + sürüm, tür ve döviz (`:307-321`). Durum düğmeleri yalnız TenantAdmin için
  (`:322-353`). Görünür düğmeler: Etkinleştir / Askıya al / Tamamla. Feshet ve İptal "…" menüsünde ayrıdır
  (`:36-38`). Geçiş tablosu `availableTransitions` (`:25-34`) sunucuyla aynıdır.
- **Sekmeler:** "Özet" ve "Durum geçmişi (sayaçlı)" (`:354-366`). Özet alanları cari, geçerlilik, para birimi, sürüm ve
  kaynak belgedir. Kaynak belge **türü ve ham GUID'i** gösterir, belge kodu gösterilmez (`:390-402, 277-283`).
  Geçmiş sekmesinde "eski → yeni" durum, zaman ve gerekçe listelenir (`:413-440`).
- **Oluşturma penceresi** (`ContractCreateDialog.tsx`): tür (Satış/Satın alma; değişince cari ve kaynak temizlenir,
  `:159-178`), kod (zorunlu, en çok 40, `:180-192`), para birimi (zorunlu, 3 harf, büyük harfe çevrilir, kaynağı temizler,
  `:193-210`). Cari arama + sayfalı seçici (25'lik, Önceki/Sonraki, `:213-300`); cari seçilince para birimi carinin
  dövizine ayarlanır (`:239-245`). Kaynak belge türü (bağlantı yok / satış teklifi / satış siparişi / tedarikçi teklifi /
  satınalma siparişi; türe göre süzülür) ve sayfalı kaynak seçici (`:304-…`). Tarihler (`:448, 460`). Varsayılan bitiş yıl
  sonudur (`CommercialContractsPage.tsx:255-256`).
- Ekran görünümü kataloğunda `commercial-contracts` **var** (`TenantScreenViewEndpoints.cs:15, 706, 1296-1298`) ve Studio
  önizlemesi bunu tanır (`built-in-screen-views/components/ScreenViewPreview.tsx:8`). Ancak sayfa düzeni okumaz:
  `defaultScreenFields` (`commercial-contracts/types.ts:59-69`) hiçbir yerde kullanılmıyor (fark, G-P97).

#### 1.2 Veri ve API

| Amaç | İstek | Parametreler | İzin | Not |
|---|---|---|---|---|
| Liste | `GET /api/commercial-contracts` | `type`, `status`, `search` (≤100), `sortBy` (10 alan), `sortDirection`, `page`, `pageSize` (≤100) | `erp.commercial-contracts.read` | `CommercialContractEndpoints.cs:82-121`; yanıt `{items, page, pageSize, total}`. **Eski ekran 100'lük sayfalarla en çok 100 sayfa, yani hepsini çeker** ve süzmeyi istemcide yapar (`CommercialContractsPage.tsx:35-36, 265-291, 390-397`). |
| Ayrıntı | `GET /{id}` | — | read | `:123-131`; yanıt `{contract, transitions[]}`, geçişler `ChangedAt` sırasıyla. Ekran, seçili satırın `revision`'ı değişince yeniden okur (`CommercialContractsPage.tsx:404-433`). |
| Cari seçenekleri | `GET /counterparties` | `type` (Sales/Purchase, **zorunlu**), `q`, `page`, `pageSize` (≤50) | read + **TenantAdmin** | `:12-31`; yalnız etkin, türe uygun (`Customer`/`Supplier` + `Both`) cariler; vergi no ile de arar. |
| Kaynak belge seçenekleri | `GET /sources` | `kind`, `counterpartyId`, `currencyCode` (**zorunlu**), `q`, `page`, `pageSize` (≤50) | read + **TenantAdmin** | `:34-80`; cari ve para birimine uyan teklif/sipariş. Belge durumuna bakmaz (iptal edilmiş sipariş de seçilebilir; doğrulanmalı). |
| Oluştur | `POST /` | `CommercialContractCreateRequest` (`:317-319`) | create + **TenantAdmin** | `:133-174`; durum her zaman `Draft`. |
| Tarih güncelle | `PUT /{id}` | `effectiveFrom`, `effectiveThrough`, `revision` (`:320`) | update + **TenantAdmin** | `:176-193`; yalnız Taslak. **Eski ekran bu ucu hiç çağırmaz.** |
| Durum geçişi | `POST /{id}/transitions` | `status`, `reason` (≤500), `idempotencyKey`, `revision` (`:321`) | **execute** + **TenantAdmin** | `:195-237` |

#### 1.3 Kurallar

- Kod 1–40 karakter, yalnız harf, rakam, `-`, `_`, `/`; **büyük harfe çevrilir** ve firmada benzersizdir (409)
  (`CommercialContractEndpoints.cs:268-270, 138, 150, 309`). Para birimi 3 harf ISO, büyük harf (`:271-272, 139`).
- Tarihler: başlangıç ≤ bitiş, başlangıç yılı ≥ 2000, bitiş yılı ≤ 2100 (`:265-267`).
- Cari: aynı firmada, etkin ve sözleşme yönüne uygun olmalı (Satış → Customer/Both, Satın alma → Supplier/Both)
  (`:147-149`). Ad, oluşturma anındaki **anlık görüntü** olarak saklanır (`CounterpartyNameSnapshot`, `:157`).
- Kaynak belge en çok bir tane olabilir ve yönle uyumlu olmalıdır. Cari ve para birimi de eşleşmelidir (`:239-262`).
- Durum makinesi (`:282-297`): Taslak → Aktif (yalnız bugün geçerlilik aralığındaysa) | İptal. Aktif → Askıda |
  Tamamlandı | Feshedildi. Askıda → Aktif | Tamamlandı | Feshedildi. Tamamlandı ve Feshedildi, başlangıç tarihinden önce
  seçilemez. Diğer durumlar sondur. "Bugün" sunucuda UTC tarihtir (`:212`); ekranın `today` değeri yerel tarihtir
  (`CommercialContractsPage.tsx:263`), gece yarısı civarında farklı karar gösterebilir (doğrulanmalı).
- Eşzamanlılık: `revision` uyuşmazlığı 409 döner, gövdede `currentRevision` bulunur (`:186, 211`). PUT'ta tarih
  değişmemişse revizyona bakılmadan 200 döner (`:184-185`).
- İdempotency: oluşturmada `CreateIdempotencyKey`, geçişte `IdempotencyKey` benzersizdir. Aynı anahtar + aynı içerik
  → önceki sonuç (`replayed: true`); farklı içerik → 409 (`:140-146, 200-209, 166-172, 223-234`). **Eski ekran her
  denemede yeni anahtar üretir** (`CommercialContractsPage.tsx:459, 497`); tekrar deneme güvenliği fiilen kullanılmıyor.
- Geçişlerde gerekçe her zaman boş gönderilir (`CommercialContractsPage.tsx:496`). Feshet ve İptal **onay sorulmadan** tek tıkla çalışır
  (`ContractRegister.tsx:336-350`).
- Denetim kayıtları: `commercial-contract.created`, `.updated`, `.status-changed` (`CommercialContractEndpoints.cs:164, 189, 220`).
- Sözleşmenin satırı, fiyatı ya da koşul metni **yoktur**; yalnız başlık bilgisidir (`CommercialContracts.cs:7-30`).
  Sipariş veya fatura sözleşmeye göre denetlenmez (kullanım yeri: yalnız bu uçlar; doğrulanmalı).

#### 1.4 Roller

- İşleyici rolü izin kataloğundan **ayrı** denetler (`CommercialContractEndpoints.cs:299-307`). Liste ve ayrıntı okumayı
  yalnız `TenantAdmin` ve `TenantUser` yapabilir; **`TenantDeveloper` reddedilir**. Oluşturma, PUT, geçiş,
  `/counterparties` ve `/sources` yalnız `TenantAdmin`'e açıktır.
- Eski ekran `canEdit = role === "TenantAdmin"` ile düğmeleri gizler (`CommercialContractsPage.tsx:262`). Diğer roller
  için "Oluşturma ve durum değiştirme işlemleri firma yöneticisine açıktır." notu gösterilir (`ContractRegister.tsx:406-410`).
- Satır düzeyi süzgeç yok; tür (Satış/Satın alma) bazında yetki ayrımı da yok.

#### 1.5 Önerilen işlemler

**Ad önerisi doğrulanmalı.** Sözleşmeler hem satış hem satınalma içindir ve adlar kalıcıdır. `satinalma.sozlesme.*`
ya da tarafsız `ticari.sozlesme.*` seçimi Satış oturumuyla birlikte yapılmalı (G-P94). Aşağıda `ticari.sozlesme.*`
kullanılmıştır:

| Ad | Tür | Yol | Not |
|---|---|---|---|
| `…listele` | read | `GET /api/commercial-contracts` | Sorgu: `type`, `status`, `search`, `sortBy`, `sortDirection`, `page`, `pageSize`; `List(Columns<CommercialContractView>, "items")`, `MetaPaths = [page, pageSize, total]` |
| `…getir` | read | `GET /{id}` | `record` + `Flatten = ["contract"]` |
| `…durumGecmisi` | read | `GET /{id}` | `List(Columns<CommercialContractTransitionView>, "transitions")` |
| `…cariSecenekleri` | read | `GET /counterparties` | `type` zorunlu; `requiresTenantAdmin` |
| `…kaynakBelgeler` | read | `GET /sources` | `kind`, `counterpartyId`, `currencyCode` zorunlu; `requiresTenantAdmin` |
| `…olustur` | write/insert | `POST /` | `BodyParameters<CommercialContractCreateRequest>`; `idempotencyKey` ← `autoId`; `requiresTenantAdmin` |
| `…tarihGuncelle` | write/update | `PUT /{id}` | `revision` kaynaktan; `requiresTenantAdmin` |
| `…etkinlestir`, `…askiyaAl`, `…tamamla`, `…feshet`, `…iptalEt` | write/update | `POST /{id}/transitions` | `fixedBody.status` sabit; `reason` istemi; `idempotencyKey` ← `autoId`; `revision` seçili satırdan; `requiresTenantAdmin` |

Yeni etiket kodları gerekir: `type`, `counterpartyId`, `counterpartyName`, `effectiveFrom`, `effectiveThrough`,
`currencyCode`, `salesQuoteId`, `salesOrderId`, `purchaseSupplierQuoteId`, `revision`, `updatedAt`, `contractId`,
`fromStatus`, `toStatus`, `changedByUserId`, `changedAt`, `idempotencyKey`, `search`, `sortBy`, `sortDirection` vb.
(`ErpOperationCatalog.cs:72-119` içinde yoklar; `purchaseOrderId` ve `status` var).

#### 1.6 Sözleşmeye özgü eksikler

G-P94…G-P98'e bakın.

---

### 2. Tedarikçi kartları ve hareketleri

- **Ayrı bir tedarikçi kartı ekranı yok.** Tedarikçiler `customers` (Cari Hesaplar) içinde `type = Supplier` (ya da
  `Both`) carilerdir. Kaynak `erp.customers`'tır ("Customer and supplier accounts", `PlatformPermissionCatalog.cs:51`).
  Cari listesinde tür çipi ve sayacı vardır (`CustomersPage.tsx:743`). Tür `Customer` değilse cari menüsünde
  "Alış faturaları" bulunur (`customers/useCustomerListScreen.tsx:100-102`).
- **Tedarikçi hareketleri:** `customer-ledger` (Cari Hesap Hareketleri) tüm türleri, tedarikçiler dahil listeler.
  Alış faturası, tedarikçi ödemesi ve alış iadesi belge türleri orada yer alır. Rapor tarafında
  `rapor.supplierLedgerEntries` ve `rapor.supplierPayments` vardır (`ReportEndpoints.cs:5965-5966, 332-337`).
- **Fiyat listesi:** yalnız cari kartında serbest metin `priceListCode` alanı var (`CustomersPage.tsx:378, 1006`;
  sunucu `Program.cs:1510, 1635`). Fiyat listesi modülü ya da ekranı **yok**. Stok kartında `purchaseListPrice` ve
  `purchaseDiscountPercent` alanları var (`ErpOperationCatalog.cs:77-80`).
- **Tedarikçi performansı / puanlama / son alış fiyatı ekranı yok** (`supplierRating`, `scorecard`, `onTimeDelivery`,
  `lastPurchasePrice` aramaları satınalmada sonuç vermedi). Teklif karşılaştırması talep/teklif ekranlarındadır (diğer
  bölüm).
- **Sonuç:** tedarikçi kartı ve hareketleri için ayrı envanter gerekmez. Kartlar
  `docs/superpowers/specs/2026-11-21-cari-ekranlari-envanteri.md`
  ile (özellikle "Alış faturaları" köprüsü G-C13, satır 148, 383-386), hareketler aynı klasördeki
  `2026-11-21-cari-hareketleri-envanteri.md` ile kapsanır. Satınalmaya özgü tek ek, belge ekranlarındaki **tedarikçi
  seçicileridir** (bkz. G-P99).

---

### 3. Eksikler ve farklar (G-P80 … G-P99)

- **G-P80 (eksik) Yönlendirici bağlamı ve ekranlar arası köprüler.** Sistem sayfası `initialSupplier`/
  `onInitialSupplierOpened` (cari → alış faturaları), `onNavigate` ve `sessionStorage` + pencere olayı köprülerini
  (`nexora.purchase-request.open`, `nexora.purchase-order.created`, `nexora:purchase-orders-changed`,
  `nexora:sales-changed`) almaz (§0.2; `WorkspacePageRouter.tsx:185-192`). *Öneri:* önce motorda "açılış parametresi"
  (sayfa anahtarı + seçili kayıt kimliği / tedarikçi süzgeci) ve `erpPage` gezinmesine parametre desteği. O zamana
  kadar `sales-purchase-invoices` ve `sales-requests` yayımlanırsa cari kartındaki "Alış faturaları" ve teklif
  ekranındaki "Aç" köprüleri sessizce bozulur. Bu iki köprü kabul testi olarak yazılmalı.
- **G-P81 (fark) SalesPage genel yükleme dalının satış bağımlılığı.** Beş satınalma sekmesi tüm satış belgelerini ve
  carileri okur (`SalesPage.tsx:626-646`). *Öneri:* sistem sayfası yalnız kendi işlemlerini okusun ve bu bağımlılık
  bilinçli olarak bırakılsın. Bunun bir davranış farkı olduğu belgeye yazılmalı: satış izni olmayan kullanıcı artık hata
  bandı görmez. Eski ekran düzeltmesi ayrı iştir ve SalesPage'e dokunur (G-P82).
- **G-P82 (eksik) Satış taşımasıyla birleştirme sıcak noktaları.** Ortak dosyalar: `SalesPage.tsx`,
  `systemPageKeys.ts:6`, `ErpOperationCatalog.cs` `Labels`/`Build()`, `ErpOperationCatalog.names.txt`, `sales/` ortak
  bileşenleri (§0.4). *Öneri:* (1) Satınalma PR'ları SalesPage'i değiştirmesin. (2) Katalogda `BuildPurchasing()`
  ayrı metot olsun. Ortak etiketler (`supplierId`, `supplierName`, `customerId`, `currencyCode`, `grandTotal`,
  `invoiceDate` …) tek bir ön PR'da eklensin. (3) Birleştirme sırası Satış oturumuyla yazılı olarak kararlaştırılsın.
  (4) `sales/` bileşenleri iki taşıma bitene kadar silinmesin.
- **G-P83 (eksik) Satınalma işlem kataloğu neredeyse boş.** Yalnız 4 mal kabul işlemi ve 9 rapor işlemi var (§0.7).
  Talep, teklif, sipariş, irsaliye, fatura, taslak, iade ve ödeme için okuma/yazma işlemi yok. *Öneri:* aile başına
  `satinalma.<belge>.{listele,getir,kalemleri,olustur,…}`. Ayrıntılı listeyi ekran bölümleri verir. Adlar kalıcı olduğu
  için ilk ad listesi bu bölümlerden toplanıp tek seferde onaylanmalı.
- **G-P84 (eksik) `Labels` zorunluluğu.** Satınalma görünümlerinin kodlarının çoğu (`supplierName`, `supplierCode`,
  `grandTotal`, `paidAmount`, `outstandingAmount`, `dueDate`, `invoiceDate`, `requestDate`, `neededByDate`,
  `reviewNote`, `expectedReceiptDate`, `targetWarehouseId` …) etiket sözlüğünde yok. Etiketsiz ilk işlem açılışta
  `Label()` hatası verir (`ErpOperationCatalog.cs:494-495`). *Öneri:* her işlem PR'ında etiket ekleme denetimi.
  Aynı kodu iki dal eklerse derleme ya da açılış hatası olmaz, son yazılan etiket kazanır. Etiket metinleri ortak ön
  PR'da sabitlensin (G-P82).
- **G-P85 (eksik, motor) İç içe satır dizisi.** `ListParameter` tek düzeydir (`ErpOperationCatalog.cs:450-458, 463-476`).
  Mal kabulde satır başına `tracking` (lot/seri dağılımı) taşınamaz (`PlatformContracts.cs:547-548`). *Öneri:* ya
  satır öğesinde ikinci düzey `list` (öğe içi `{{…}}` bağlaması), ya da izli stoklar için mal kabulün eski ekranda
  kalması (`fark`). Bağımsız mal kabulün kesinleştirme `tracking` listesi üst düzeydir ve bağlanabilir.
- **G-P86 (eksik, motor) Kaynaktan doldurulan, düzenlenebilir satırlar.** `list` kipi kaynak okumaz. `stage` kipi kaynak
  satırları olduğu gibi gönderir (`TenantCustomPageSchema.cs:1908-1912`, `gridState.ts:364-377`). Talepten sipariş
  (`PurchaseRequestOrderLineRequest(LineNumber, UnitPrice, DiscountPercent, VatPercent)`, `PlatformContracts.cs:509`),
  talepten teklif (`RequestLineNumber`, `:423`), siparişten mal kabul (`OrderLineNumber, Quantity`, `:547`), faturadan
  iade (`PurchaseInvoiceLineId, Quantity`, `:574`) ve irsaliye (`OrderLineNumber, Quantity`,
  `PurchaseDeliveryNoteEndpoints.cs:309`) bu biçimi ister. *Öneri:* yeni bir kip ya da `list` + `sourceQuery`: kaynak
  satırlar doldurulsun, `readOnly` sütunlar (satır no, stok) kilitlensin, düzenlenen hücreler gövdeye girsin. Bu,
  satınalma belge akışlarının **çoğu için ön koşuldur**.
- **G-P87 (eksik, motor) Hesaplanan sütun ve toplam.** Izgarada satır tutarı, KDV, toplam ya da belge altı toplamı yok
  (`TenantCustomPageSchema.cs:1573-1575`). Sütun sınırı 12'dir (`:1561`). Fatura taslağı istemcide hesaplanmış
  `subtotal/discountTotal/taxTotal/grandTotal` ve satır `subtotal/discountAmount/taxAmount/total` ister. Kesinleştirmede
  bunlar tutarlılık için denetlenir (`PurchaseInvoiceDraftEndpoints.cs:324-332`). Sipariş oluşturma ise sunucuda
  hesaplar, ama eski ekran satır ve toplam önizlemesi gösterir (`SalesPage.tsx:3711-3727`). *Öneri:* `columnFormulas`
  (koşul dilinin aritmetiğiyle) ve `{{grid.toplam.<sütun>}}` kapsamı. O zamana kadar taslak girişi eski ekranda kalır.
- **G-P88 (eksik) `allowed` ve satır kapsamlı kurallar, TenantAdmin bayrakları.** Satır süzgeçli listelerde (talep,
  sipariş, fatura, taslak, bağımsız kabul) satır öznitelikli Allow kuralı olan kullanıcıda katalog `allowed=false`
  döner (`ErpOperationCatalog.cs:562-590`). Cari G-C3 ile aynı kök neden. Ayrıca işleyicide TenantAdmin isteyen uçlar
  (talep kararı, talepten sipariş/teklif, bağımsız teklif, ek maliyet; §0.5) katalogda `requiresTenantAdmin: true` ile
  işaretlenmeli. İşaretlenmezse düğme görünür, sunucu 403 döner. *Öneri:* G-C3 çözümü ortak yapılsın (liste
  işlemlerinde `collectionRowsFiltered` eklemek).
- **G-P89 (fark) İç içe rotaların izin kaynağı.** Talepten sipariş ve talepten teklif `erp.purchase-requests.create`,
  mal kabul `erp.purchase-orders.create`, kabulden fatura `erp.purchase-receipts.create`, fatura girişi ve taslak
  tedarikçi seçenekleri `erp.purchase-invoices.create` ister (§0.5 tablosu). Yetki tasarımcıları beklemeyebilir.
  *Öneri:* davranış değişmesin. İşlem etiketleri ve Studio ipucu gerçek izni göstersin (ör. "Mal kabul oluştur
  (sipariş oluşturma izni)").
- **G-P90 (fark) Kaynak özniteliği çözümleyicisindeki boşluklar.** `erp.purchase-receipts` için yalnız bağımsız mal kabul
  okunur (`PermissionAuthorizationHandler.cs:134-139`). Sipariş bağlı kabul, teklif, irsaliye, iade ve ödeme için
  öznitelik yoktur. `{quoteId}`/`{orderId}` rotaları hiç çözülmez (`:60-61`). Sipariş bağlı kabul listesi, teklif ve
  iade listeleri süzgeçsizdir. *Öneri:* bugünkü davranış belgelensin. Sistem sayfası bu uçlarda satır kuralına
  güvenmesin. Güvenlik düzeltmesi ayrı iştir (doğrulanmalı: durum/tedarikçi kuralı olan bir rolün sipariş bağlı kabulü
  `void` edebilmesi).
- **G-P91 (fark) Onay akışı yalnız talepten siparişte.** Doğrudan sipariş oluşturma `purchase-order.created` kuralını
  çağırmaz (`Program.cs:6389-6460`'ta yok; çağrı yalnız `:6172`). Belgeye bağlı iş akışı sayfadan başlatılamaz
  (`workflowStart.ts:6-12`, `subjectType: "General"`). *Öneri:* sistem sayfası bu farkı korusun ve belgelesin. Doğrudan
  siparişte kural değerlendirmesi ürün kararıdır, taşıma kapsamı dışındadır.
- **G-P92 (eksik) Gövde idempotency'sinin yalnız bazı uçlarda olması.** `requestId` mal kabul, ödeme, iade, bağımsız
  kabul ve taslak oluşturmada var. Talep, teklif, sipariş, kabulden fatura ve irsaliyede yok; bunlar yalnız kod/numara
  benzersizliğine dayanır (§0.6). *Öneri:* anahtarı olan her işlemde gizli `autoId` girişi zorunlu tutulsun
  (`inventory-transfers.json:124-125` kalıbı). Anahtarsız işlemlerde kod girişi zorunlu tutulsun ve 409 metni gösterilsin.
  Eski ekranların `busy` kilidi (çift tıklama önleme) motorda kaydet düğmesi kilidiyle karşılanmalı (doğrulanmalı).
- **G-P93 (eksik) Liste meta ve toplam sayısı.** `satinalma.malKabul.listele` sayfalıdır ama `MetaPaths` bildirmez
  (`ErpOperationCatalog.cs:355-356`). Sözleşme listesi `total` döner, çalışma zamanı ise yalnız `totalCount`'u toplam
  sayar (`erpOperations.ts:237-239`; `CommercialContractEndpoints.cs:120`). Sunucu sayfalamasında sayfa sayısı yanlış
  çıkar. *Öneri:* yeni sayfalı işlemlerde `MetaPaths = [page, pageSize, totalCount]`. Sözleşme için ya katalogda
  `total` → `rowCount` eşlemesi (ör. `TotalPath`), ya da uca `totalCount` alanı eklenmesi (ek alan, geriye uyumlu).
- **G-P94 (eksik) Sözleşme işlem adlarının sahipliği.** Sözleşme satış + satınalma ortaktır, menüde Satın Alma
  altındadır, adlar kalıcıdır (`ErpOperationCatalog.cs:53-58`). *Öneri:* `ticari.sozlesme.*` (tarafsız) ya da
  `satinalma.sozlesme.*`. Karar Satış oturumuyla ortak verilsin, `names.txt`'e tek kez yazılsın. Modül sabiti için de
  yeni bir `CommercialModule` gerekebilir.
- **G-P95 (eksik) Sözleşme rol modeli katalogda ifade edilemiyor.** Okuma işleyicide TenantAdmin/TenantUser ile
  sınırlıdır; **TenantDeveloper reddedilir** (`CommercialContractEndpoints.cs:303`). Katalogda yalnız
  `requiresTenantAdmin` var. TenantDeveloper için okuma işlemi `allowed=true` görünür ama 403 alır. Yazma, cari ve
  kaynak seçenekleri `requiresTenantAdmin` ile doğru işaretlenebilir. *Öneri:* katalogda rol kümesi
  (`AllowedRoles`) ya da sözleşme okumalarını TenantDeveloper için kapalı sayan bir bayrak. Alternatif: fark olarak
  belgelemek.
- **G-P96 (fark) Sözleşme listesinin istemcide tam yüklenmesi ve sayaçlar.** Eski ekran en çok 10.000 kaydı çekip
  süzer. Durum çiplerinin sayaçları tüm kayıtlar üzerindendir (`CommercialContractsPage.tsx:35-36, 264-291`;
  `ContractRegister.tsx:96-108`). Sunucu `type/status/search` süzgeçlerini destekler ama durum başına sayaç vermez.
  `countWhen` yalnız yüklenmiş sayfayı sayar. *Öneri:* sunucu sayfalı liste + sunucu süzgeçleri. Sayaçlar ya kaldırılsın
  (`fark`), ya da sayaç ucu eklensin. "Bitiyor (30 gün)" işareti ve geçerlilik çubuğu için hesaplanan sütun/biçim
  gerekir (G-P87 ile ilişkili; doğrulanmalı: `cellFormat` desteği).
- **G-P97 (fark) Sözleşme durum geçişi ve ayrıntı farkları.** Eski ekran: her denemede yeni idempotency anahtarı
  üretir, gerekçe her zaman boştur, Feshet/İptal onaysızdır, PUT (tarih düzenleme) kullanılmaz, kaynak belge ham GUID
  ile gösterilir, ekran görünümü kataloğu okunmaz (§1.1, §1.3). *Öneri:* sistem sayfasında geçiş düğmeleri `autoId` +
  `promptLabel` (gerekçe, Feshet/İptal için zorunlu) + onay metni ile kurulsun. Taslak için "Tarihleri düzenle"
  eklensin. Kaynak belge kodu, kaynak türüne göre ilgili belge getir işlemiyle gösterilsin (her dört tür için ayrı okuma
  gerekir; doğrulanmalı). Bunlar eski ekrandan farklı davranışlar olarak `fark` etiketiyle yazılsın.
- **G-P98 (eksik) Sözleşme oluşturmada bağımlı seçiciler.** Cari seçenekleri `type`'a, kaynak seçenekleri
  `kind + counterpartyId + currencyCode`'a bağlıdır. Tür değişince cari ve kaynak, para birimi değişince kaynak
  temizlenir. Cari seçilince para birimi carinin dövizine ayarlanır (`ContractCreateDialog.tsx:159-178, 193-210, 239-245`).
  Motor `optionsQuery` parametre bağlaması ve `clearsOnChange` ile ilk ikisini karşılar
  (`TenantCustomPageSchema.cs:1241-1245`). **Seçilen satırdan başka bir girişe değer yazma** yalnız `setInput` düğme
  eylemiyle mümkün görünüyor (`custom-page/setInputAction.ts:3-6`; seçim olayında atama doğrulanmalı). Kaynak türü
  seçimi (4 tür → 4 ayrı işlem) için koşullu sorgu/`routeVariants` benzeri seçim gerekir. *Öneri:* lookup'a
  `onSelectAssign` (ör. `para=satir.currencyCode`). Kaynak türü için dört ayrı lookup + `visibleWhen`.
- **G-P99 (fark) Tedarikçi kartı ve seçiciler.** Ayrı tedarikçi ekranı, fiyat listesi modülü ve tedarikçi performansı
  yoktur (§2); kartlar ve hareketler cari envanterlerince kapsanır. Belge ekranlarındaki tedarikçi seçici ise eski
  ekranda `Supplier` + `Both` türlerinden **ilk 100'er kayıtla sınırlıdır**, sunucu araması yoktur
  (`SalesPage.tsx:610-622`). *Öneri:* sistem sayfasında tedarikçi seçicisi sunucu aramalı lookup olsun (ör.
  `cari.listele` + `type`/`status` süzgeci; cari envanterindeki işlem adıyla ortak). `Supplier` ve `Both` için tek
  istekte çoklu tür süzgeci olmadığından iki kaynak birleşimi ya da yeni sorgu parametresi gerekir (doğrulanmalı:
  `/api/customers` `type` çoklu değer kabul ediyor mu).

---

### 4. Özet

| Konu | Durum |
|---|---|
| Menü | 10 anahtar "Satın Alma" grubunda; `sales-purchase-order-create` menü dışı; standart dosyası hiçbiri için yok |
| Gövde | 8 ekran `SalesPage` üzerinden (Satış ile ortak dosya, ortak durum, ortak `sales/` bileşenleri); irsaliye, iade ve sözleşme bağımsız |
| Yetki | 9 satınalma kaynağı + `erp.customers`; iç içe rotalar üst kaynağın `create` iznine düşer; satır süzgeci talep, sipariş, fatura, taslak, irsaliye ve bağımsız kabulde var |
| Motor | Satır dizisi bağlanabiliyor (tek düzey `list` + `{{grid.satirlar}}` + `autoId`); kaynaktan doldurulup düzenlenen satır, iç içe dizi ve hesaplanan toplam **yok** |
| Sözleşmeler | Yalnız başlık; TenantAdmin yazar, TenantAdmin/TenantUser okur; idempotency ve revision sunucuda tam, eski ekran tam kullanmıyor |
| Tedarikçi kartı | Ayrı ekran yok; cari envanterleri kapsar; tek ek: belge ekranlarındaki 100+100 sınırlı tedarikçi seçicisi |
| Önerilen yayın sırası | (1) G-P82 birleştirme düzeni ve ortak etiketler, (2) Ticari sözleşmeler (satırsız, motor yeterli; G-P93/G-P95/G-P97 ile), (3) okuma ağırlıklı listeler, (4) satırlı belge yazmaları ancak G-P86/G-P87 sonrası |

---

## Son. Birleşik özet, sıra, riskler ve kararlar

### Son 1. Birleşik işlem kataloğu (yeni adlar, tekilleştirilmiş)

Bugün katalogda satınalma için yalnız dört işlem var: `satinalma.malKabul.listele`, `…ekMaliyetler`, `…ekMaliyetDagit`,
`…ekMaliyetTersKayit` (`ErpOperationCatalog.cs:355-361`). Dördü de yalnız `inventory-cost.json`'da kullanılır. Rapor
işlemleri (`rapor.purchase*`) ekranların yerini tutmaz. Modül sabiti `PurchasingModule = "Satınalma"` vardır (`:68`).
Ayrıntılı parametreler kısım tablolarındadır; aşağıdaki sayılar "İşlem adı kararları" uygulanmış hâlidir.

| Grup | v1 adları | Sayı | Kısım |
|---|---|---|---|
| `satinalma.talep.*` | `listele`, `getir`, `kalemleri`, `olustur`, `onayla`, `reddet`, `teklifleri`, `teklifKaydet`, `siparisOlustur`, `ozelAlanTanimlari`, `ozelAlanDegerleri`, `ozelAlanKaydet` | 12 | A 1.5 |
| `satinalma.teklif.*` | `listele`, `getir`, `kalemleri`, `olustur` (talepsiz, TenantAdmin), `ozelAlanTanimlari` | 5 | A 2.5 |
| `satinalma.siparis.*` | `listele`, `getir`, `satirlari`, `malKabulleri`, `olustur`, `ozelAlanTanimlari`, `ozelAlanDegerleri`, `ozelAlanKaydet` | 8 | B 1.5, 2.5 |
| `satinalma.malKabul.*` (yeni) | `sayfaliListe`, `getir`, `satirlari`, `olustur`, `iptal`, `faturala`, `ozelAlanTanimlari` | 7 | B 1.5, C 2.5 |
| `satinalma.irsaliye.*` | `listele`, `getir`, `satirlari`, `olustur`, `siparisIrsaliyeleri`, `malKabulBagla`, `malKabulBaglantisiKaldir` | 7 | C 1.5 |
| `satinalma.faturaGirisi.*` | `malKabulleri`, `onizleme`*, `onizlemeSatirlari`*, `mevzuatProfilleri` (* yeni uç nokta) | 4 | C 3.5 |
| `satinalma.fatura.*` | `listele`, `getir`, `satirlari`, `odemeleri`, `iadeleri`, `iptal`, `odemeEkle`, `odemeIptal`, `odemeHesaplari`, `ozet`*, `iadeEdilebilirSatirlar`* (* yeni uç nokta) | 11 | D 1.5 |
| `satinalma.faturaTaslagi.*` | `listele`, `getir`, `satirlari`, `olustur`, `guncelle`, `muhasebelestir`, `tedarikciler`, `giderHesaplari`, `malKabulSatirlari` | 9 | D 2.5 |
| `satinalma.iade.*` | `listele`, `getir`, `satirlari`, `olustur`, `iptal` | 5 | D 3.5 |
| `ticari.sozlesme.*` (ad kararı bekliyor) | `listele`, `getir`, `durumGecmisi`, `cariSecenekleri`, `kaynakBelgeler`, `olustur`, `tarihGuncelle`, `etkinlestir`, `askiyaAl`, `tamamla`, `feshet`, `iptalEt` | 12 | E 1.5 |
| **Toplam v1** | | **80** | |
| Sonraya | `satinalma.malKabul.siparissiz.*` (7), alan tanımı/geçmiş/geri yükleme işlemleri, `satinalma.fatura.vergiDokumu` | | C 2.5, D 1.5 |
| Koşullu (eksik kararına bağlı) | `satinalma.tedarikciSecenekleri` (K6), `satinalma.talep.tekliftenSiparis` (G-P11), `satinalma.talep.durumSayilari` (K10) | 3 | A 1.6 |

Uç noktası **olmadığı için** önerilemeyenler: `satinalma.siparis.iptal`, `…kapat`, `…onayla`, `…reddet` (G-P20; onay bugün iş
akışı kararıyla, `/api/workflows/instances/{id}/decision`).

Gereken `Labels` kodları: kısım başına listelendi (A ≈45, B ≈35, C, D, E ayrı listeler). Ortak olanlar (`supplierId`,
`supplierName`, `warehouseId`, `currencyCode`, `grandTotal`, `vatTotal`, `unitCode`, `quantity`, `unitPrice`, `discountRate`,
`vatRate`, `lineNumber`, `requestId`…) Satış ile de ortaktır; **tek bir ön PR'da** eklenmelidir (G-P82, G-P84).

### Son 2. Özet tablo

| Ekran | Var olan işlem | Yeni (v1) | Sonraya | Başlıca eksikler | Önerilen faz |
|---|---|---|---|---|---|
| Satınalma Talepleri | 0 | 12 + 1 (sipariş alan tanımları) | alan tanımları | K1 (G-P1, G-P11), G-P2 notlu karar, K5 (G-P3), G-P4 teklif sütunu, K7 (G-P8) | liste+karar: 1 · oluşturma: 1b · teklif/sipariş dönüşümü: 2 |
| Satınalma Teklifleri | 0 | 5 | — | G-P12 durum/süre, G-P13 kıyas, satır süzgeci yok (kod çıkarımı), K3 (G-P16) | liste: 1 · talepsiz teklif: 2 |
| Satınalma Siparişleri | 0 | 8 (oluşturma dahil) | iptal/kapat (uç nokta yok) | G-P20, K9 (G-P21), K10 (G-P22), G-P23, G-P26, K7 (G-P30, G-P34) | liste+belge: 1 · mal kabul formu: 2 |
| Yeni satınalma siparişi | — | (`siparis.olustur`) | — | K3 (G-P36), K4 (G-P37), K6 (G-P38), G-P39 | 2 |
| Satınalma İrsaliyeleri | 0 | 7 | — | K1 (G-P40, G-P42), G-P41, G-P43, G-P44 | liste: 1 · oluşturma: 2 |
| Mal kabulleri | 4 (yalnız `inventory-cost`) | 7 | 7 siparişsiz | **G-P51** siparişsiz alt ekran, K5 (G-P46), K10 (G-P49), K2 (G-P52), K7 (G-P57) | liste+belge+iptal+faturala: 1 · siparişsiz: 3 |
| Mal kabul faturası girişi | 0 | 4 + `malKabul.faturala` | — | **G-P47** izin, K3 (G-P53 önizleme), G-P54, G-P55, G-P56 | 1 (önizleme uç noktasıyla) |
| Satınalma Faturaları | 0 | 11 | vergi dökümü | G-P60 ödeme durumu, G-P61, G-P63 iç içe listeler, G-P65, G-P67, K7 (G-P62) | liste+belge+iptal+ödeme: 1 · iade formu: 2 |
| Bağımsız fatura taslakları | 0 | 9 | — | K4 (G-P71), K3 (G-P72), G-P73 rowVersion adı, G-P74 | 2 |
| Satınalma İadeleri | 0 | 5 | — | **G-P75** satır süzgeci yok, K1 (G-P66), G-P78, G-P79 | liste+iptal: 1 · oluşturma: 2 |
| Ticari sözleşmeler | 0 | 12 | — | G-P93 `total`, G-P94 ad, G-P95 rol modeli, G-P97, G-P98 | 1 (satırsız; motor yeterli) |

Eksik kimlikleri: G-P1…G-P19 (A 1.6, 2.6), G-P20…G-P39 (B 1.6, 2.6), G-P40…G-P59 (C 1.6, 2.6, 3.6, C 5'te tek liste),
G-P60…G-P79 (D 1.6, 2.6, 3.6, D 6'da dizin), G-P80…G-P99 (E 3). Kökler: yukarıdaki K1…K10.

### Son 3. Kaybolması kolay eski davranışlar (modül geneli; ekran ayrıntısı A 3, B 3, C 4, D 4)

1. Ekranlar arası açma köprüleri: teklif → talep, talep → sipariş, sipariş → mal kabul → fatura penceresi, fatura girişi
   sonrası faturalar, Cari ekranından tedarikçiyle Alış faturaları (`App.tsx:252, 1006-1013`, `pendingPurchaseSupplier`) (K7).
2. Talep kararında not alanı ve iki adımlı onay; talep sahibinin kendi talebini onaylayamaması (409) (G-P2).
3. Sipariş "Teslim alınan" ilerleme çubuğu, "N gün geçti" gecikme metni ve gecikmiş kartının süzmesi (G-P6, G-P23, G-P24).
4. Mal kabul ve irsaliyede kalan miktarların ön dolu gelmesi, sıfır satırların atlanması (K1, G-P42).
5. Stok seçilince alış fiyatı, iskonto ve KDV'nin satıra yazılması (K4, G-P37).
6. Fatura listesinde türetilmiş ödeme durumu (Kısmen ödendi, Vadesi geçti) ve kalan tutar tonları (G-P60).
7. Fatura girişi ve taslakta istemcide hesaplanan ara toplam, KDV, genel toplam ve vade önizlemesi (K3, G-P54).
8. Kısayollar: F2 Yeni, Enter Aç, Ctrl+S, Alt+İ İşlemler, Ctrl+. detay paneli, ↑↓ / Boşluk ızgara klavyesi (cari G-C19 ile aynı).
9. Belge zinciri gösterimi (talep → teklif → sipariş → mal kabul → fatura → iade) (G-P7, G-P26, G-P48).
10. Satış sekmeleriyle paylaşılan sekme durumu: `SalesPage` içinde sekme değişince bildirim/hata şeridinin temizlenmesi
    (`SalesPage.tsx:425-428`) ve ortak yükleme (K8).

### Son 4. Önerilen sıra

- **Faz 0, sunucu ve katalog (ekran değişmez).** (a) G-P82: Satış oturumuyla birleştirme düzeni ve ortak `Labels` ön PR'ı;
  satınalma işlemleri ayrı `BuildPurchasing()` metodunda. (b) K5 `allowed` düzeltmesi (cari G-C3 ile tek iş). (c) K6 tedarikçi
  seçicisi (sunucu araması, Supplier ∪ Both). (d) K10 sayaç/meta uçları ve `malKabul.sayfaliListe`. (e) Yeni uç noktalar:
  `faturaGirisi.onizleme`, `fatura.ozet`, `fatura.iadeEdilebilirSatirlar`. (f) G-P47 izin kararı, G-P94 sözleşme ad kararı.
- **Faz 1, motor eki gerektirmeyenler.** Ticari sözleşmeler; bütün listeler, sağ paneller ve salt okunur belge görünümleri;
  satırsız komutlar: talep onay/ret (notlu), mal kabul iptal ve faturala, fatura iptal ve ödeme ekle/iptal, iade iptal; mal kabul
  faturası girişi (satırlar salt okunur, toplam sunucu önizlemesinden). **Faz 1b:** talep oluşturma ("Kalem ekle", satır başına
  birim seçeneği transfer standardındaki gibi).
- **Faz 2, motor ekleri sonrası (K1, K3, K4).** Sipariş oluşturma, talepten teklif kaydı ve siparişe dönüştürme, siparişe bağlı mal
  kabul formu, irsaliye oluşturma, iade oluşturma, bağımsız fatura taslağı formu.
- **Faz 3 / sonraya.** Siparişsiz mal kabul (G-P51), lot/seri (K2), alan tanımı ve değer geçmişi pencereleri. O zamana kadar
  bu komutlar "Eski ekranda aç" ile açılır.

Her faz stok ve cari gibi `preview` aşamasında yayımlanır; eski ekran varsayılan kalır. Yönlendirme yalnız kullanıcı
sistem sayfasını seçerse değişir.

### Son 5. Riskler

- **`SalesPage` ortaklığı (K8, G-P82).** Sekiz satınalma ekranı Satış ile aynı 10.992 satırlık dosyadan açılır. Taşıma bu
  dosyaya **dokunmamalıdır**; sistem sayfası yönlendiricide anahtar bazında devreye girer. Çakışma noktaları
  `system-pages/systemPageKeys.ts:6`, katalogdaki `Labels`/`Build()`, `ErpOperationCatalog.names.txt`,
  `SystemPageStandards.versions.txt` ve ortak `document-returns/` (satış iadeleriyle ortak), `commercial-contracts/` (satışla ortak).
- **Stok ve maliyet yazan akış sipariş belgesinde.** Mal kabul oluşturma Faz 2'ye kalırsa kullanıcı Faz 1'de mal kabulü
  eski sipariş ekranından girer. Sistem sayfasındaki "Mal kabul oluştur" komutu o süre eski ekranı açmalıdır.
- **İzin farkları (K5, G-P47, G-P89).** İç içe rotalar üst kaynağın `create` iznine düşer (talepten sipariş →
  `erp.purchase-requests.create`, mal kabul → `erp.purchase-orders.create`, kabulden fatura → `erp.purchase-receipts.create`).
  Katalog bunu yansıtmazsa düğmeler yanlış etkin/pasif görünür. Satır kurallı TenantUser ile canlı QA şart.
- **Görünürlüğü daraltan düzeltmeler.** G-P46 (mal kabul) ve G-P75 (iade) satır süzgeci eklenirse tedarikçi kısıtlı
  kullanıcı bugün gördüğü kayıtları göremez. Bu bir davranış değişikliğidir, ayrı kararla yapılmalı.
- **Tutar farkı (K3, G-P53).** Sunucu önizlemesine geçmek ekrandaki fatura tutarını değiştirebilir (tevkifat, satır yuvarlama);
  doğru yöne, ama kullanıcıya duyurulmalı.
- **İdempotency (G-P92).** `Idempotency-Key` başlığı satınalmada hiç yok; gövde `requestId` yalnız mal kabul, ödeme, iade,
  bağımsız kabul ve taslakta. Talep, teklif, sipariş, irsaliye oluşturmada çift gönderim çift belge yazabilir (kod
  benzersizliği varsa 409). Sistem sayfasında bu yazmalar `autoId` + meşgul kilidiyle korunmalı.
- **Ad kalıcılığı.** Yeni yanıt alanları (`quoteCount`, `bestComparableGrandTotal`, `linkStatus`, önizleme) yeni işlem adlarıyla
  açılmalı; `satinalma.malKabul.listele` sonucu değiştirilmemeli (`inventory-cost` kullanıyor).
- **Bugünkü hatalar (taşımadan bağımsız, ayrı iş olarak ele alınmalı):** doğrudan sipariş oluşturmada onay akışının atlanması
  (K9, doğrulandı); sipariş iptal/kapatma uç noktasının olmaması (G-P20, doğrulandı); ödeme iptalinin ilk denemede 409 vermesi
  (D R3, kod çıkarımı); izlemeli stoğun siparişe bağlı kabulde 400 alması (G-P27, kod çıkarımı); iade ve teklif listelerinde
  satır süzgeci olmaması (G-P75, A 4, kod çıkarımı); ticari sözleşme ekranının her denemede yeni idempotency anahtarı
  üretmesi (G-P97).

### Son 6. Kararlar (kullanıcı 2026-11-21 tüm önerileri onayladı)

1. **Fazlama:** Faz 1 (listeler, paneller, satırsız komutlar, fatura girişi, sözleşmeler) önce; satırlı belge yazmaları motor
   ekinden sonra. *Öneri: evet.*
2. **K1 motor eki** ("kaynaktan doldur, düzenle, sıfırları atla" ızgara kipi): ortak motor dosyası olduğu için diğer modüllerle
   sıralanarak yazılsın mı? *Öneri: evet; "Kalem ekle" yolu yalnız geçici çözüm.*
3. **Siparişsiz mal kabul (G-P51):** v1'de "Eski ekranda aç". *Öneri: evet.*
4. **Fatura girişi izni (G-P47):** katalog bugünkü sunucu davranışını (`erp.purchase-receipts.create`) yansıtsın; izin
   hizalaması ayrı karar. *Öneri: bugünküyle aynı kalsın.*
5. **Sözleşme işlem adı (G-P94):** `ticari.sozlesme.*` (satış ve satınalma ortak). *Öneri: bu ad, Satış oturumunun onayıyla.*
6. **Fatura tutarı (G-P53):** sunucu önizleme uç noktası. *Öneri: evet.*
7. **Bugünkü hatalar** (Son 5 son madde): taşıma işinden ayrı hata kaydı. *Öneri: ayrı iş.*
