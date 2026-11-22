# Satış Teklifleri, Siparişleri, İrsaliyeleri ve Faturaları: eşdeğerlik envanteri

Bu belge, satış modülünün sekiz yerleşik ekranını sistem sayfasına (standart tanım) taşımak için girdidir. Bilgiler kod
okunarak çıkarıldı (2026-11-21, `origin/master` `7bc6deda`); hiçbir şey çalıştırılmadı. Biçim ve terimler
`2026-11-21-cari-ekranlari-envanteri.md` ve `2026-11-20-depo-transfer-envanteri.md` ile aynıdır. `fark` kabul edilmiş
davranış farkı, `eksik` taşımadan önce kapatılması gereken boşluk anlamına gelir. "Kod çıkarımı" yazan bulgular eski
ekranda ya da QA firmasında ayrıca doğrulanmalıdır.

Eksik kimlikleri: `G-S*` ortak (bölüm 0), `G-SQ*` teklif, `G-SO*` sipariş, `G-SD*` irsaliye, `G-SI*` fatura.
Tasarım taslağı: `docs/design-proposals/erp-design-language/20-satis-sistem-sayfalari.html`. Taslaktaki iki aşamalı
plan ve altı karar kullanıcı tarafından **2026-11-21'de onaylandı**. Uygulama, ortak motor dosyalarına dokunduğu için
diğer modüllerle sıralanacak.

## Yönetici özeti

- **Katalogda hiç `satis.*` işlemi yok** (yalnız `rapor.sales*` rapor işlemleri). Modül sabiti "Satış" ve yaklaşık 60
  işlem adı eklenmeli (bkz. bölüm 5). Adlar kalıcı olduğundan bu belgedeki ad önerileri onaydan sonra değişmemelidir.
- **Belge kartları bugünkü motorla eşdeğer kurulamaz.** Üç ortak motor eksiği engelleyicidir:
  G-S7 (var olan satırları düzenlenebilir yükleme), G-S8 (satır/toplam hesaplama, KDV dökümü) ve G-S9 (stok seçilince
  birim, fiyat, KDV, döviz hücrelerini doldurma). Ayrıca G-S10 (ızgara 12 sütun sınırı; sipariş satırı 14 sütun).
- **Listeler bugünkü motorla büyük ölçüde kurulabilir.** Kalan farklar: "bu sayfa" özet kartları, tıklanabilir süzgeç
  kartları, satır içi "Faturayı aç" bağlantısı, `sessionStorage` köprüleri (G-S3, G-S4) ve satır koşullu izinlerde
  `allowed` yanlış negatifi (G-S11).
- **Öneri (taslakta karar 1):** iki aşama. Aşama A'da dört liste + salt okunur belge detayları sistem sayfası olur;
  kart/oluşturma ekranları "Eski ekranda aç" ile eski ekranda kalır. Aşama B'de ortak motor eksikleri (G-S7…G-S10)
  diğer modüllerle sıralanıp kapatılınca kartlar taşınır. Hesaplama sunucuda yan etkisiz önizleme uç noktalarıyla
  (`satis.teklif.hesapla`, `satis.siparis.hesapla`, `satis.fatura.onizle`) yapılır; istemci kural tekrarlamaz.
- **Eski ekranda bulunan hatalar** taşımada düzeltilmeden önce ayrıca işaretlendi (1.8, 2.8, 3.8, 4.8): ör. bağımsız
  faturada stok çıkışının başlık deposundan yapılması (G-SI6), her gönderimde yenilenen `requestId` (çift kayıt riski),
  "Süresi doldu" teklif durumunu sunucunun hiç yazmaması, siparişin iptal/kapama işleminin olmaması (G-SO27), iptal
  edilen faturanın irsaliyesinin yeniden faturalanamaması.

## 0. Ortak bilgiler

Bilgiler kod okunarak çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Hiçbir davranış çalıştırılarak doğrulanmadı.
Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir.
`PlatformPermissionCatalog.cs` ve `PlatformContracts.cs` `src/Platform/AIERP.Platform.Application/` altında,
`PlatformPermissionAuthorizer.cs` `src/Platform/AIERP.Platform.Infrastructure/` altındadır. Dosya adı yazılmayan satır
numaraları `SalesPage.tsx` (frontend) ya da `Program.cs` (sunucu) içindir. `fark` kabul edilmiş davranış farkı, `eksik`
taşımadan önce kapatılması gereken boşluk anlamına gelir.

### Kapsam

Yönlendirici: `WorkspacePageRouter.tsx:218-226` (`salesPageProps`), `:357-376` (satış dalları). Dört ince sarmalayıcı aynı
dev bileşeni açar: `SalesPage.tsx` (10 992 satır, tek `SalesPage` fonksiyonu `:170-3669`, `section` ile dallanır `:403-427`).

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `sales-quotes` | Satış Teklifleri (liste + detay paneli + teklif belgesi) | `SalesQuotesPage.tsx` → `SalesPage section="sales-quotes"`; liste `:2337-`, belge `DocumentSurface` `:3260-3626` |
| `sales-quote-create` | Yeni Teklif / Teklif Düzenleme / Teklif Revizyonu | `SalesQuotesPage createQuotePage` → `RecordFormPage` `:2909-3248` |
| `sales-orders` | Satış Siparişleri (liste + panel + sipariş belgesi) | `SalesOrdersPage.tsx` → `sales-orders/components/SalesOrdersPageContent.tsx:6-8` → `SalesPage section="sales-orders"`; detay `SalesOrderModal` `:9528-` (`:3639`) |
| `sales-order-create` | Yeni Sipariş / sipariş düzenleme | `SalesOrdersPage createOrderPage` → `RecordFormPage` `:2698-2907` |
| `sales-deliveries` | Satış İrsaliyeleri | `SalesDeliveriesScreenPage.tsx` → `SalesPage section="sales-deliveries"` → `SalesDeliveriesScreen` (`SalesDeliveriesPage.tsx`, 1 032 satır; `:2283-2292`) + `StandaloneFulfillmentPanel.tsx` (siparişsiz irsaliye) |
| `sales-delivery-create` | Yeni İrsaliye | aynı, `createDeliveryPage` → `SalesDeliveriesScreen initialCreate` |
| `sales-invoices` | Satış Faturaları | `SalesInvoicesPage.tsx` → `SalesPage section="sales-invoices"` → `SalesInvoiceTable` (`:10458-`, `:2293-2336`); detay `SalesInvoiceModal.tsx` (`:3656`); siparişten/irsaliyeden fatura `sales/components/SalesInvoiceFromDeliveryDialog.tsx` |
| `sales-invoice-create` | Yeni satış faturası | `SalesInvoicesPage openInvoiceCreate` → `createInvoicePage` (`SalesInvoicesPage.tsx:6-13`) |

Kapsam dışı (satış menüsündeki diğerleri, `workspace-navigation.ts:30`): `sales-customer-requests`
(`SalesCustomerRequestsPage`), `sales-returns` (`SalesReturnsPage`), `sales-distribution` (`SalesDistributionPage`),
`sales-promotions` (`SalesPromotionsPage`); hepsi `SalesPage` dışındadır (`WorkspacePageRouter.tsx:345-353, 383-386`).

**`SalesPage.tsx` satın alma kısımlarıyla iç içedir.** Aynı bileşen `sales-requests`, `sales-purchase-quotes`,
`sales-purchasing`, `sales-purchase-order-create`, `sales-purchase-invoices`, `sales-purchase-receipts`,
`sales-purchase-invoice-entry`, `sales-purchase-invoice-drafts` anahtarlarını da açar (`WorkspacePageRouter.tsx:359-382`,
`SalesPage.tsx:2237-2282`). Satın alma kodu dosyanın büyük kısmıdır: `PurchaseOrderCreatePage` `:3728-4243`,
`PurchasingPanel` `:4244-9527`, ortak sabitler `:3670-3727`. Taşımaya etkisi:
- Satış anahtarları sistem sayfasına geçse de `SalesPage` silinemez: satın alma ekranları ve "Eski ekran" geri dönüşü
  (`WorkspacePageRouter.tsx:178-184`, `LegacyScreenBar`) aynı bileşeni kullanmaya devam eder.
- `load()` sekmeye göre dallanır (`:555-640`): satış listeleri sayfalı uç noktayı, `purchases`/`requests` tedarikçi
  listesini, diğer durumlar `loadAllPages` ile tüm teklif/sipariş/fatura/cari listelerini okur. Bir sekmeyi taşımak bu
  dallanmayı değiştirmez; ama satış kodunu ayrı dosyaya çıkarmak (eski ekranı korumak için) satın alma ile paylaşılan
  durumları (`customers`, `stockItems`, `warehouses`, `busy`, `notice`) ayırmayı gerektirir. Tavsiye: eski ekranı olduğu gibi
  bırakmak, ayırmayı taşıma sonrasına ertelemek.
- `SALES_CHANGED_EVENT`/`PURCHASE_ORDERS_CHANGED_EVENT` (`:3670-3671`) her iki tarafın sekmeleri arasında yenileme için
  kullanılır (bkz. G-S5).

### Menü ve anahtarlar

- Standart menü kataloğunda **var**: `sales-quotes`, `sales-orders`, `sales-deliveries`, `sales-invoices`
  (`StandardMenuEndpoints.cs:18`) ve `sales-invoice-create` ("Satış & cari" grubunda, `:15`). **Yok**: `sales-quote-create`,
  `sales-order-create`, `sales-delivery-create`. Bunlar yalnız gezinmeyle açılır ve modül menüsünde üst satıra bağlanır
  (`shell/moduleMenus.ts:18-21, 77`).
- **Standart yükleyici menüde olmayan anahtarı reddeder:** `SystemPageStandards.cs:158-159` "screenKey '…' standart menüde
  bir sayfa değil." hatası verir. Bkz. G-S1.
- Hiçbir satış anahtarı için standart dosyası yok; `SystemPages/Standards/` yalnız 8 `inventory-*` dosyası içerir ve
  `system-pages/systemPageKeys.ts:6` de yalnız bunları listeler (eşitlik `systemPageKeys.test.ts` ile denetlenir).
- Başlıklar üç yerde: `workspace-navigation.ts:24, 27` (tr/en), `App.tsx:639-647` (sekme başlıkları),
  `useWorkspaceTabs.ts:38` (`sales-order-create`/`sales-quote-create` sabit etiketleri). Ayrıca `workspace-storage.ts:51`
  geri yüklenen `sales-order-create` sekmesinin etiketini "Yeni Sipariş" yapar. Global arama hızlı bağlantısında
  `sales-invoice-create` `parentPage: "sales-invoices"` ile durur (`App.tsx:323-330`).
- `salesPageProps` (`WorkspacePageRouter.tsx:218-226`): `token`, `role`, `onNavigate(page, label?)`,
  `initialInvoiceId` (= App `pendingCustomerInvoiceId`), `onInitialInvoiceOpened`, `initialSupplier`,
  `onInitialSupplierOpened`. Ek bayraklar sarmalayıcıdan: `createQuotePage`, `createOrderPage`, `openInvoiceCreate`,
  `createDeliveryPage`.
- **Sistem sayfası dalı bunların hiçbirini iletmez.** `TenantCustomPage` yalnız `token`, `systemScreenKey`,
  `onOpenLegacy`, `onSystemPageMissing` alır (`WorkspacePageRouter.tsx:185-192`; imza `TenantCustomPage.tsx:3068`).
  - `role` yerine sayfa kapsamında `kullanici.rol` vardır (JWT `role` talebinden, `TenantCustomPage.tsx:309-322, 1777`),
    yani "Sil yalnız TenantAdmin" gibi koşullar kurulabilir; sunucu tarafında `RequiresTenantAdmin` de vardır
    (`ErpOperationCatalog.cs:33-39, 563`).
  - `onNavigate` yerine sayfanın gezinme eylemleri vardır (`custom-page/navigationActions.ts`): `erpPage` (yalnız `q`
    parametresi, `:64-67`) ve `page` (`@<anahtar>` ile yerleşik ekran + en çok 6 `ad=değer`, `:41-51, 69-73`).
    Parametreler `pageNavigation.ts` belleğinde tutulur ve hedef sekmede `{{sayfa.parametre.<ad>}}` olarak okunur
    (`TenantCustomPage.tsx:3077-3083, 1777`). Sistem sayfası sekme anahtarı = `systemScreenKey`, yani okuma çalışır.
  - `initialInvoiceId`/`onInitialInvoiceOpened` ulaşmaz (bkz. G-S3).

### Ekranlar arası geçişler

| Mekanizma | Yazan | Okuyan | Taşıdığı | Sistem sayfasında |
|---|---|---|---|---|
| `sessionStorage["nexora.customer-sales-action"]` = `{page, customerId, customer}` | `CustomersPage.tsx:683-701` (`openCustomerSalesAction`; komutlar `customers/useCustomerListScreen.tsx:91-94`: Yeni sipariş/teklif/irsaliye/fatura) | `takeCustomerSalesAction` `SalesPage.tsx:128-142` (yalnız `*-create` sayfalarında, `:201-212`) | Seçili cari ile yeni belge | okunmaz (G-S4) |
| `sessionStorage["nexora.customer-sales-action-prefill"]` | `takeCustomerSalesAction` `:136` | `SalesPage.tsx:238-253` (cari listesine önden ekler, yoksa `GET /api/customers/{id}`) | Cari özeti (ek istek yapmamak için) | okunmaz |
| Pencere olayı `nexora:customer-sales-action` (`setTimeout 0`) | `CustomersPage.tsx:696-700` | `SalesPage.tsx:213-228`; `SalesDeliveriesPage.tsx:85-94` (`sales-delivery-create`) | Sekme zaten açıksa cariyi yeniden uygular | dinlenmez |
| Sekme sınırı istisnası | — | `useWorkspaceTabs.ts:43-47` | Bekleyen cari eylemi varsa 12 sekme sınırı atlanır | anahtar kalırsa çalışmaya devam eder; parametre köprüsüne geçilirse istisna kaybolur |
| `sessionStorage["nexora.sales-quote.request-id"]` (`quoteFromRequestStorageKey`) | `sales-customer-requests/SalesCustomerRequestsPage.tsx:133-137` (`sales-customer-requests/types.ts:55`) | `SalesPage.tsx:859-867` (`beginQuoteFromRequest` `:823-`) | Talepten teklif (satırlar + `salesRequestId`, `:1455`) | okunmaz (G-S4, G-S7) |
| `sessionStorage["nexora.sales-quote.edit-id"]` | `SalesPage.tsx:1410-1411` (`beginQuoteEdit(…, true)`) | `SalesPage.tsx:870-875` | Taslak teklif düzenleme (`PUT /api/sales/quotes/{id}`) | okunmaz |
| Teklif revizyonu | **sessionStorage anahtarı yok.** `beginQuoteRevision` (`:1522-1551`) durumu (`revisesQuoteId`, satırlar) bulunduğu sekme örneğine yazar ve `onNavigate("sales-quote-create")` çağırır | `sales-quote-create` sekmesi ayrı bir `SalesPage` örneğidir (keep-alive, `:535-536`); `:876` bu örnekte `revisesQuoteId` boşsa boş form açar | `revisesQuoteId` (`:1454`) | Revizyonun yeni sekmeye taşınıp taşınmadığı **doğrulanmadı**; koddan taşınmıyor gibi görünüyor. Sistem sayfasında `page` eylemiyle `revisesQuoteId` parametresi gerekir |
| `sessionStorage["nexora.sales-order.edit-id"]` | `SalesPage.tsx:1879-1880` (liste satır menüsü "Düzenle", yalnız `Open`) | `:956-962` (ön doldurma), `:1099`, `:1119-1124` (POST/PUT seçimi), siler `:1148`, `:1947` | Sipariş düzenleme (`PUT /api/sales/orders/{id}`) | okunmaz |
| Pencere olayı `nexora:sales-changed` (`SALES_CHANGED_EVENT`, `detail` = örnek kimliği) | `notifySalesChanged` `:537-542` (kayıt/geçişlerden sonra) | `:543-550` (diğer açık satış sekmeleri `load()`) | Sekmeler arası liste yenileme | yok (G-S5) |
| App `pendingCustomerInvoiceId` | `App.tsx:249, 1007-1010` (`onOpenSalesInvoice` → `setPage("sales-invoices")`); çağıran `CustomersPage.tsx:2789` (cari ekstresinden fatura) | `SalesPage.tsx:389-394` (`setInvoiceId` + `onInitialInvoiceOpened`, `App.tsx:1005`) | Faturayı doğrudan aç | ulaşmaz (G-S3) |
| `initialSupplier` | `App.tsx:1011-1014` | `SalesPage.tsx:399-402` (yalnız `sales-purchase-invoices`) | — | satış kapsamı dışı |
| Global arama | `useWorkspaceSearch.ts:29-39, 71-88` | — | **Satış belgesi aramaz.** Yalnız sayfa adları ve cariler (`/api/customers/?q=`, `:93-101`); cari seçimi `customers` ekranını açar | etkisiz |
| Diğer girişler | `ModuleLauncherPage.tsx:702, 706, 1045` (sayfa açar, kayıt açmaz); `document-returns/DocumentReturnsPage.tsx:174` (`onNavigate("sales-invoices")`); `shell/railItems.ts:23` | — | yalnız sayfa | etkisiz |

### Yetki modeli

- Kaynaklar (`PlatformPermissionCatalog.cs:66-70`): `/api/sales/quotes` → `erp.sales-quotes`, `/api/sales/orders` →
  `erp.sales-orders`, `/api/sales/deliveries` → `erp.sales-deliveries`, `/api/sales/invoices` → `erp.sales-invoices`.
  Özel eşlemeler:
  - `/api/sales/standalone-deliveries…` → `erp.sales-deliveries` (`:182-184`).
  - `POST /api/sales/invoices/{id}/collections` → `erp.customer-collections.create` (`:188-194`); `POST …/{id}/returns` →
    `erp.sales-returns.create` (`:211-217`).
  - `/api/sales/quote-pdf-templates…` → `erp.sales-quotes` (yazmalarda ayrıca TenantAdmin, `:271-277`).
  - `/api/sales/promotions…` → `erp.sales-promotions` (kapsam dışı).
- Eylem yoldan çıkar (`:319-342`): GET → `read`, PUT → `update`, DELETE → `delete`; POST'ta son parça `IsExecutionRoute`
  (`:387-397`) listesindeyse `execute`, değilse `create`. Satış yollarında sonuç:
  - `execute`: `quotes/{id}/send`, `/accept`, `/reject`, `/convert-to-order`; `orders/{id}/reservations/release`;
    `deliveries/{id}/void`; `invoices/{id}/void`; `standalone-deliveries/{id}/post`, `/void`; özel alan
    `…/restore`, `…/history/{revisionId}/restore`.
  - `create` (son parça listede yok): `POST /api/sales/quotes`, `/orders`, `/invoices` (siparişsiz fatura),
    `/standalone-deliveries`; **`POST orders/{id}/deliveries` → `erp.sales-orders.create`** (irsaliye izni değil);
    `POST orders/{id}/reservations` → `erp.sales-orders.create`; **`POST deliveries/{id}/invoice` ve
    `standalone-deliveries/{id}/invoice` → `erp.sales-deliveries.create`** (fatura izni değil).
  - `update`: `PUT quotes/{id}`, `PUT orders/{id}`, `PUT orders/{id}/delivery-date`, `PUT standalone-deliveries/{id}`,
    özel alan değer/tanım PUT'ları. **Satış faturası için PUT yok** (yalnız özel alan değerleri, `:4653`).
- TenantAdmin katalogu atlar (`PlatformPermissionAuthorizer.cs:52-55`). Diğer roller için varsayılan rettir.
- **Satır öznitelikleri** (`PermissionAuthorizationHandler.cs:59-71, 93-151`): TenantAdmin dışında `{id}` taşıyan her
  istekte kayıt okunur ve `resource.status` + `resource.customerId` eklenir: teklif (`:96-101`), sipariş (`:102-107`),
  fatura (`:120-125`). `erp.sales-deliveries` için **yalnız `StandaloneSalesDeliveries`** okunur (`:126-131`); siparişe bağlı
  irsaliyenin `{id}`'si bu tabloda olmadığından öznitelik eklenmez (fark: satır koşullu kural siparişli irsaliyede eşleşmez).
- **Liste süzgeci:** cari ekranındaki `CustomerCollectionPermissionFilter`/`CustomerRowVisibilityEndpointFilter` satışta
  **yok**. Yerine genel `PermissionStatusFilter.ApplyAsync` (`PermissionStatusFilter.cs:8-51`) kullanılır: `resource.status`,
  `resource.customerId` (ve tedarikçi/sahip) kurallarını SQL koşuluna çevirir; çözemediği öznitelik varsa sonuç boştur
  (`:27-32`). Kullanılan yerler: teklif listesi (`:3516`), sipariş listesi (`:4282`), fatura listesi (`:4930`),
  siparişsiz irsaliye listesi (`StandaloneInventoryDocumentEndpoints.cs:20-21`). **`GET /api/sales/deliveries` (siparişli
  irsaliye listesi, `:4318-4339`) ve `/search` süzülmez** (fark).
- `IsStatusFilteredCollection` (`PermissionAuthorizationHandler.cs:76-92`) teklif, sipariş, fatura ve siparişsiz irsaliye
  listelerine `collectionRowsFiltered=true` ekler; yetkilendirici bu durumda satır öznitelikli Allow kuralını yeterli
  sayar (`PlatformPermissionAuthorizer.cs:59-70`). `/api/sales/deliveries` listesinde bu bayrak yok.
- **Rol denetimi olan işleyiciler:** teklif silme (`:3350`), sipariş silme (`SalesOrderEndpoints.cs:15`), rezervasyon
  bırakma (`:4108`), irsaliye silme (`:4362`), fatura silme (`:4714`) yalnız TenantAdmin; özel alan tanımı ekleme/düzenleme
  TenantAdmin veya TenantDeveloper (`:3377-3379, 3919-3921, 4588-4590`), tanım kaldırma/geri yükleme yalnız TenantAdmin.
  Eski ekran bunları `role` ile gizler (`:1883, 1960-1965, 1986, 2016`); sistem sayfasında `kullanici.rol` koşulu ve
  katalogda `requiresTenantAdmin` gerekir.

### İdempotency ve eşzamanlılık

- **Idempotency-Key başlığı kullanılmaz.** Satışta tekrar koruması gövde alanı `requestId` (GUID) ile yapılır:
  `SalesDeliveryWriteRequest` (`PlatformContracts.cs:276`; işleyici `:4131-4150`, `UPDLOCK, HOLDLOCK` + benzersiz indeks,
  farklı içerikle aynı anahtar 409), `SalesOrderReservationWriteRequest` (`:270`), `StandaloneSalesInvoiceWriteRequest`
  (`:392`), `StandaloneSalesDeliveryWrite` (`StandaloneInventoryDocumentEndpoints.cs:549`, tekrar oynatma `:36`),
  `CustomerCollectionWriteRequest` (`:393`), `SalesReturnWriteRequest` (`:399`).
- **Anahtarsız yazmalar:** `SalesQuoteWriteRequest` (`:206-209`), `SalesOrderWriteRequest` (`:254-256`),
  `SalesDeliveryInvoiceWriteRequest` (`:289`, irsaliyeden fatura), teklif geçişleri. Çift tıklama yalnız `busy` kilidiyle
  önlenir.
- Eski ekranın anahtar üretimi tutarsızdır: `SalesInvoiceFromDeliveryDialog.tsx:383, 427` her denemede
  `crypto.randomUUID()` üretir (yeniden denemede koruma yok); sipariş detayı anahtarı durumda tutar ve başarıdan sonra
  yeniler (`SalesPage.tsx:9599, 9733, 9786`), fatura detayı da öyle (`SalesInvoiceModal.tsx:81-88, 515, 605`).
- **rowVersion hiçbir satış yazmasında yok.** Teklif/sipariş PUT'u son yazanı kabul eder; satırlar tam liste olarak
  değiştirilir. Özel alan değerleri tanım `Version` ile tutulur (eşzamanlılık değil, geçmiş içindir).

### Ortak liste çerçevesi (eski ekran)

Dört liste aynı "liste tipi A"yı (taslak 06) paylaşır; irsaliye listesi `SalesDeliveriesPage.tsx` içinde aynı parçalarla
ayrıca kurulur (`:14-24, 547-672`), fatura listesi `SalesInvoiceTable` içindedir, teklif/sipariş `SalesPage` içindedir.

- **Yerleşim:** `ListPageHeader` (başlık + kayıt sayısı) → `ListSummaryCards` → `SalesListToolbar` (arama + teklifte
  durum çipleri Taslak/İletildi/Kabul edildi/Reddedildi/Süresi doldu ve tarih aralığı, `SalesListToolbar.tsx:54-84`; araç
  yuvası sütun/pivot için; Yenile) → `sales-list-body` (ızgara + sağ detay paneli) → `SalesListFooter`
  (`SalesPage.tsx:2174-2236`; stil `sales/sales-list-v2.css`, 268 satır). `SalesListTab` yalnız quotes/orders/invoices'tır
  (`SalesListToolbar.tsx:4`); irsaliye kendi `ListToolbar`'ını kurar (`SalesDeliveriesPage.tsx:612-622`).
- **Arama:** sunucuya `q` + `page` + `pageSize=25` (+ teklifte `status`, `dateFrom`, `dateTo`) gider (`:566-582`); ardından
  yüklenen sayfa istemcide yeniden süzülür (`:1757-1771, 1902-1908`).
- **Izgara** (`sales/components/SalesDocumentGrid.tsx`): onay kutusu sütunu, kullanıcının seçtiği güncel satır (tıklama,
  ↑/↓; ilk satır kendiliğinden seçilmez), Boşluk işaretler, Enter / çift tık açar (`:150-175`), yüzen toplu işlem çubuğu
  ("Excel (seçilenler)", `SalesPage.tsx:2160-2162`), ekran görünümü sütunları (`screenViewGridDefaults`), sayı sütunları sağa
  (`nx-num`), belge no tek aralıklı (`nx-code`); varsayılan genişlikler `salesListCells.tsx:27-40`.
- **İşlem çubuğu** (`PageCommandsSlot`, `:1932-2030`): Yeni (birincil), Aç (güncel ya da tek işaretli satır; yoksa
  "Önce bir kayıt seçin"), Sil (yalnız TenantAdmin; teklifte yalnız Taslak), İşlemler (`more`): durum geçişleri, "Teklif
  alanları"/"Sipariş alanları" (TenantAdmin/Developer), CSV dışa aktarma (`csvExportCommand`). Açık belge varken çubuğu
  belge alır (`documentOpenCommands`, `:1968`); fatura ve irsaliye listeleri çubuğu kendi bileşenlerinde kurar (`:1891-1894`).
- **Detay paneli** (`useSalesListPanel.ts`, `SalesListDetailPanel.tsx`, `SalesListPanels.tsx`): geniş alanda varsayılan
  açık, Ctrl+. açar/kapatır (Stok Kartları ile aynı kural, `useSalesListPanel.ts:17-22`); güncel satır 150 ms durunca
  `GET /api/sales/<tür>/{id}` okunur, bırakılan satırın yanıtı atılır (`:31-45`); dar alanda çekmece, Esc kapatır
  (`SalesListDetailPanel.tsx:70`). İçerik: belge no + Aç, taraf, durum etiketi, sekmeler (Özet/Satırlar…), 2×2 tutar
  (Genel toplam, Ara toplam, İskonto, KDV; `SalesListPanels.tsx:102-110`), olgular, belge zinciri (talep → teklif →
  sipariş → irsaliye → fatura), ilk iki satır + "+N satır".
- **Özet kartları** yalnız yüklenen sayfadan hesaplanır ("bu sayfa"): teklif tutarı + Yanıt bekleyen (tıklayınca
  İletildi süzgeci), sipariş tutarı (iptaller hariç) + Sevk bekleyen, fatura Kesilen + İptal (`:2031-2102`). Birden çok
  para biriminde toplam verilmez (`SalesListFooter.tsx:46-66`). Tahsil edilmemiş / Vadesi geçen kartı yoktur, çünkü liste
  uç noktaları bu veriyi döndürmez (`:2027-2028`).
- **Durum tonu** (`salesListStatus.ts:35-41`): etiket belgenin kendi adıdır (`document-page/documentStatus.ts`); Taslak
  `info`, teklifte İletildi `warn`, diğerleri `success→ok, info→info, warning→warn, danger→bad, neutral→off`.
- **Satır menüsü** (`SalesRowActionsMenu.tsx`): gövdeye taşınan (portal) menü, ok/Home/End gezinme, Esc tetikleyiciye
  döner. Bugün yalnız sipariş listesinin `actions` sütununda (Detay / Düzenle / Sil, `:1874-1886`); teklif menüsü İşlemler'e
  taşınmıştır (`:1772`).
- **Alt bilgi** (`SalesListFooter.tsx:20-37`): "↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç · Ctrl+. detay paneli",
  işaretli sayısı, "Gösterilen x / toplam", sayfalama.
- **Belge formu** (`sales/salesDocumentForm.tsx`, `sales-record-forms.css`): `RecordFormPage` + `SalesFormLines` satır
  kartı (başlık, "5 satır · TRY" özeti, alt bantta notlar + toplamlar), "Satır ekle" düğmesi ve tek çalışan satır kısayolu
  Ctrl+Shift+Enter (`App.tsx:116-119`, `[data-line-add-shortcut]`). Toplam satırları: Mal/hizmet toplamı, Toplam iskonto,
  KDV %r matrahı, KDV %r, KDV toplamı, Genel toplam · Ödenecek tutar (`salesDocumentForm.tsx:77-88`); tutarları ekran
  kendisi hesaplar (`:1041-1097`, döviz çevrimi dahil).
- **Belge detayı** (`sales/salesDocumentDetail.tsx`): türe göre durum akışı (`SalesQuoteFlow` Taslak → İletildi → Kabul,
  `SalesOrderFlow` Açık → Tamamlandı, `SalesDeliveryFlow` Sevk edildi → Faturalandı, `SalesInvoiceFlow` Kesildi), KDV
  oranına göre döküm (sunucu toplamlarıyla ±1 kuruş tutmazsa döküm verilmez, `:88-112`), alt bilgi "Alt+İ işlemler".

### Sayfa motorunun bugünkü yetenekleri (satış için kritik olanlar)

| Yetenek | Durum | Kanıt |
|---|---|---|
| `editableGrid` seçim (lookup) sütunu | **var**: `lookup:<sorgu>:<değer>:<etiket>[:<açıklama>]`, sunucu araması, `columnOptionsWhen`, `columnStaticOptions` | `custom-page/gridState.ts:12-35`, `EditableGrid.tsx:53-62`, `TenantCustomPage.tsx:2750-2773` |
| Seçimde diğer hücreleri doldurma (stok → birim, fiyat, KDV) | **yok**: yalnız seçilen hücre ve etiketi yazılır | `TenantCustomPage.tsx:2768-2771`; `clearsOnChange` yalnız temizler (`:2142-2153`) |
| Satırda hesaplanan sütun (miktar × fiyat, iskonto, KDV, satır toplamı) | **yok**: sütun türleri text/number/date/checkbox/lookup; `readOnly` yalnız kilitler | `gridState.ts:15-19, 22` |
| Aritmetik ifade | **yok**: bağlama yalnız yol (`{{a.b[0].c}}`) çözer | `custom-page/pageBindings.ts:5-7, 35-39`; koşul dilinde yalnız karşılaştırma ve `+ N` (`conditions.ts`) |
| Toplam / alt bilgi | Yalnız sorgu tablosu (`dataTable`) sütun toplamı (`totals`), çizilen satırlardan | `TenantCustomPage.tsx:482-507, 572`; `DataTableGrid.tsx:131`. Düzenlenebilir ızgarada toplam yok |
| İç içe satır listesi (`lines[]`) gövdeye | **var**: `ListParameter<T>` + ızgara `satirlar`/`eklenenSatir`/`silinenSatir` bağlaması; öğe alanları skaler + metin map'i | `ErpOperationCatalog.cs:9-15, 450-458`, `TenantCustomPage.tsx:1233-1239`, örnek `stok.hareket.ekle` `:243-246` |
| Var olan belge satırlarını düzenlenebilir yükleme | **yok**: `stage` kipinde kaynak satırlar salt okunur (yalnız sil/geri al), `list` kipinde satırlar boş başlar ve her `reset`'te temizlenir | `gridState.ts:130-134, 141-145, 183-184, 211-217`; `EditableGrid.tsx:82-95` |
| Satır sınırı | En çok 12 sütun, `minRows`/`maxRows` var | `gridState.ts:37`; `TenantCustomPage.tsx:1197-1213` |
| İç içe kayıt (ör. `EDocument`) parametre | **yok**: `ScalarMembers` yalnız skaler ve (istenirse) metin map'i | `ErpOperationCatalog.cs:465-480` |
| `dialog` boyutu xl | **var** (`sm/md/lg/xl/full`) | `custom-page/PageDialog.tsx:6-7, 57`; şema `TenantCustomPageSchema.cs:2040` |
| `steps`, `recordHeader` | **var** | `TenantCustomPageSchema.cs:22`; `custom-page/StepsIndicator.tsx`, `RecordHeader.tsx` |
| Sayfa parametresi okuma | **var**: `{{sayfa.parametre.<ad>}}`, sistem sayfasında da (sekme anahtarı = ekran anahtarı) | `TenantCustomPage.tsx:1777, 3077-3083`; `pageNavigation.ts` |
| Idempotency-Key başlığı | **gönderilmez**: istek yalnız `{url, method, body}` | `custom-page/erpOperations.ts:28, 101-103`. Yerine gövde GUID'i `autoId` (açılışta üretilir, başarılı yazmadan ve `resetOnOpen` ile yenilenir, `TenantCustomPage.tsx:717-729, 1577-1592`) satış `requestId`'sine bağlanabilir |
| rowVersion | Kaynaklı güncellemede kaynak okumadan gövdeye taşınır (stok örneği); satışta rowVersion olmadığından etkisiz | `erpOperations.ts:77, 105`; `ErpOperationCatalog.cs:150-152` |
| Rol koşulu | `kullanici.rol` kapsamda | `TenantCustomPage.tsx:309-322` |
| Kayıt sınırları | En çok 30 sorgu, işlem sorgusunda 60 parametre, bileşen başına 40 özellik | `TenantCustomPageSchema.cs:18, 81, 141` |
| Satış ERP işlemleri | **yok**. Katalogda satış adına yalnız rapor işlemleri var: `rapor.salesQuotes`, `rapor.salesOrders`, `rapor.salesOrderFulfillment`, `rapor.salesDeliveries`, `rapor.salesInvoices`, `rapor.salesReturns` (`/api/reports/run`, `ErpOperationCatalog.cs:183-191`). `satis.*` adı yok | `tests/IntegrationTests/ErpOperationCatalog.names.txt` |
| Modül sabitleri | `Stok`, `Depo`, `Raporlar`, `Üretim`, `Ayarlar`, `Satınalma`; **"Satış" sabiti yok** | `ErpOperationCatalog.cs:59-66` |
| Katalog `allowed` | Boş GUID rota değeri, satır özniteliği ve `collectionRowsFiltered` olmadan çözülür; `allowed === false` sorgu eylemi çalıştırılmaz | `ErpOperationCatalog.cs:561-584`; `TenantCustomPage.tsx:284` |

### Mevcut tasarım önerileri

- **`docs/design-proposals/erp-design-language/02-belge-satis-faturasi.html`** (belge şablonu, taslak v1): sipariş,
  teklif, irsaliye ve faturalar için ortak satırlı belge iskeleti. Üstte belge no + durum akışı şeridi (Taslak → Onaylı →
  e-Fatura → Tahsil), "N değişiklik kaydedilmedi", PgUp/PgDn önceki/sonraki belge; stokla aynı işlem çubuğu (Yeni F2, Aç,
  Kaydet Ctrl+S, Sil, Yenile, Yazdır, Excel, Geri al Ctrl+Z, İşlemler Alt+İ: Onayla, e-Faturaya gönder, Tahsilat, Kopyala,
  İade, Siparişten satır çek). Sıkı başlık alanları (cari + bakiye/risk satırı, tarih, vade, depo, döviz/kur, temsilci,
  ödeme planı). Klavyeyle doldurulan satır ızgarası: stok kodu/ad/barkod eşleşmesi, Ins/Ctrl+D/Ctrl+Del/F9/Alt+↑↓; sütunlar
  stok kodu, ad, miktar, birim, birim fiyat, isk. %, KDV %, KDV h/d, **tutar** ve kullanılabilir stok; satır altında
  negatif stok uyarısı ve çözüm önerileri. Sağda bağlam paneli (cari özeti/risk, aktif satırın depo dağılımı, belge
  zinciri, denetim kaydı), altta KDV oranına göre matrahlı toplam bloğu ve her an görünen özet çubuğu.
  **Bugünle ilişkisi:** eski formda yalnız iskelet kısmen var (`SalesFormLines`, toplam bloğu, durum akışı bileşenleri,
  Ctrl+Shift+Enter). Taslak/Onaylı fatura durumu, e-Fatura akışı, risk paneli, satır stok uyarısı, F9/Ins kısayolları,
  PgUp/PgDn ve denetim kaydı **yok** (taslağın kendi notu: "bugün fatura durumu yalnız Kesildi / İptal").
- **`06-satis-modulu.html`** (ekran eşlemesi + liste taslağı): Satış'ın ekranlarını iki tipe oturtur: liste tipi A
  (Stok Kartları ile aynı) + belge ekranı (taslak 02). Talep, teklif, sipariş, irsaliye, fatura ve iade liste + belge;
  Kampanyalar tanım ekranı; Dağıtım planı özel. İş akışı düğmeleri başlıktan kalkıp durum şeridi + İşlemler menüsüne
  geçer. Fatura listesi taslağı: özet kartları (Bu ay kesilen, Tahsil edilmemiş, Vadesi geçen tıklayınca süzer, İptal;
  "bu sayfa" etiketi), durum çipleri, tarih süzgeci, sütunlar (Fatura no, Tarih, Müşteri, İrsaliye, Sipariş, **Vade**,
  Genel toplam, **Kalan**, Durum), sağ panel (Özet/Satırlar/Tahsilat, belge zinciri), alt bilgi kısayolları.
  **Bugünle ilişkisi:** liste tipi A uygulanmıştır (bkz. "Ortak liste çerçevesi"). Vade/Kalan sütunları, Tahsil
  edilmemiş/Vadesi geçen kartları ve "Vadesi geçti" etiketi yoktur, çünkü liste uç noktası bu alanları döndürmez
  (`SalesPage.tsx:2027-2028`).

### Ortak eksikler

- **G-S1 (eksik)** `sales-quote-create`, `sales-order-create`, `sales-delivery-create` standart menü kataloğunda yok;
  standart yükleyici bu anahtarlarla dosyayı reddeder (`SystemPageStandards.cs:158-159`). Ya kataloğa eklenmeli (menüde
  görünür hale gelir) ya da yükleyiciye "gezinme ile açılan alt ekran" istisnası (ör. `SUBROUTE_PARENTS` karşılığı) gerekir.
  Aynı sorun `customer-edit` için de geçerlidir.
- **G-S2 (eksik)** `systemPageKeys.ts:6` ve testine sekiz satış anahtarı eklenmeli; standartlar sürüm 1 / `preview` ile
  başlar.
- **G-S3 (eksik)** Yönlendirici bağlamı sistem sayfasına ulaşmaz: `initialInvoiceId`/`onInitialInvoiceOpened` yok. Cari
  ekstresinden "faturayı aç" (`CustomersPage.tsx:2789` → `App.tsx:1007-1010`) sistem sayfasında faturayı açmaz ve App'teki
  `pendingCustomerInvoiceId` hiç temizlenmez (eski ekrana dönülünce beklenmedik açılış). Çağıranın `openWorkspacePage`
  (`page: "sales-invoices", params: {id}`) kullanması gerekir.
- **G-S4 (eksik)** sessionStorage köprüleri (`nexora.customer-sales-action` + `-prefill` + olay,
  `nexora.sales-quote.request-id`, `nexora.sales-quote.edit-id`, `nexora.sales-order.edit-id`) sistem sayfasında okunmaz;
  sayfa yalnız `sayfa.parametre` okur. Gönderen ekranlar (`CustomersPage`, `SalesCustomerRequestsPage`, eski satış
  listeleri) parametreli gezinmeye geçirilmeli ya da sistem sayfası açılışında bu anahtarları parametreye çeviren bir ara
  katman eklenmeli. Parametreye geçilirse `useWorkspaceTabs.ts:43-47` sekme sınırı istisnası da taşınmalı.
- **G-S5 (fark)** `nexora:sales-changed` sekmeler arası yenileme yok. Sistem sayfasında yalnız gezinmede `refresh`
  (`afterSaveRefresh`) vardır; başka sekmede açık liste kayıttan sonra eskir.
- **G-S6 (eksik, kritik)** Satış ERP işlemleri katalogda yok (`satis.*` adı yok, "Satış" modül sabiti yok). Teklif,
  sipariş, irsaliye, fatura için listele/getir/oluştur/güncelle/sil, durum geçişleri, özel alan, kur
  (`/api/sales/quotes/exchange-rates`), revizyonlar, rezervasyon, siparişten irsaliye, irsaliyeden fatura, iptal işlemleri
  eklenmeli. Liste sonuçlarında `MetaPaths` (`page`, `pageSize`, `totalCount`) ve her yeni alan için `Labels` girdisi gerekir
  (`ErpOperationCatalog.cs:494-495` etiket yoksa açılışta hata).
- **G-S7 (eksik, kritik)** Var olan belge satırları düzenlenebilir olarak yüklenemez. Teklif/sipariş düzenleme (PUT tam
  satır listesi), teklif revizyonu, talepten teklif ve teklif → sipariş ön doldurma bugün motorla yapılamaz.
  `list` kipine "kaynak sorgudan başlangıç satırları" gerekir.
- **G-S8 (eksik, kritik)** Hesaplama yok: satır tutarı (miktar × fiyat × (1 − isk.)), KDV dahil/hariç, oran bazında KDV
  dökümü, genel toplam ve döviz çevrimi canlı gösterilemez. Gerekli olan: ızgarada hesaplanan (salt okunur) sütun, ızgara
  satırlarından toplam bağlaması (`<izgara>.toplam.<sütun>` gibi) ve basit aritmetik. Alternatif: sunucuda "taslak hesapla"
  önizleme işlemi.
- **G-S9 (eksik)** Seçim sütunu yalnız kendi hücresini yazar. Stok seçince birim, liste fiyatı, KDV %, döviz ve
  kullanılabilir miktar dolmaz. Seçim satırından diğer sütunlara eşleme (`fill: unitCode=unitCode,…`) gerekir.
- **G-S10 (eksik)** Sınırlar dar: ızgara 12 sütun (satış satırı: stok, miktar, birim, fiyat, isk., KDV, KDV dahil, döviz,
  kur, depo + hesaplananlar), sayfa 30 sorgu, bileşen 40 özellik. Teklif oluşturma ekranı tek başına ~8 açılış sorgusu
  kullanır (özel alanlar, cari, stok, personel, kur, depo, revizyon, talep).
- **G-S11 (eksik)** Katalog `allowed` satır öznitelikleri ve `collectionRowsFiltered` olmadan çözülür. Satışta satır
  kuralları (durum/cari) bekleniyor: yalnız satır koşullu Allow kuralı olan kullanıcıda liste sorgusu `allowed=false`
  olur ve hiç çalışmaz. Eski ekranda aynı kullanıcı süzülmüş listeyi görür (`PlatformPermissionAuthorizer.cs:59-70`).
- **G-S12 (eksik)** İç içe kayıt parametresi yok: fatura yazmalarındaki `SalesInvoiceEDocumentFields? EDocument`
  (`PlatformContracts.cs:289, 392`) bağlanamaz.
- **G-S13 (fark)** Idempotency başlığı gönderilmez; satış zaten gövde `requestId` kullandığından `autoId` girişi yeterlidir.
  Eski ekrandaki "her tıklamada yeni anahtar" (`SalesInvoiceFromDeliveryDialog.tsx:383, 427`) sistem sayfasında
  düzelir (başarıya kadar aynı anahtar).
- **G-S14 (fark)** rowVersion yok; son yazan kazanır (eski ekranla aynı).
- **G-S15 (fark)** Siparişli irsaliye `{id}` isteklerinde satır özniteliği eklenmez ve `/api/sales/deliveries` listesi
  süzülmez (`PermissionAuthorizationHandler.cs:126-131`, `:4318-4339`). Bugünkü davranıştır; taşıma değiştirmez ama
  satır kuralı yazan yöneticiye belgelenmeli. İzin adları da sezgisel değildir: siparişten irsaliye
  `erp.sales-orders.create`, irsaliyeden fatura `erp.sales-deliveries.create` ister.

---

## 1. Satış Teklifleri (`sales-quotes`, `sales-quote-create`)

Kaynak: `frontend/erp-web/src/SalesPage.tsx` (aksi belirtilmedikçe satır numaraları bu dosyadır), sunucu
`src/Hosts/AIERP.Api/Program.cs` (`Program.cs:…`). İki ekran anahtarı da aynı bileşeni açar: `SalesQuotesPage`
`section="sales-quotes"` verir (`SalesQuotesPage.tsx:6-8`). `sales-quote-create` aynı bileşene `createQuotePage` ekler
(`WorkspacePageRouter.tsx:357-359`). Bu yüzden kart ekranında `activeTab` yine `"quotes"`tur (`:403-405`) ve liste yükleme
efekti orada da çalışır (`:679-699`). Her çalışma sekmesi ayrı bir `SalesPage` örneğidir (keep-alive). Bir sekmedeki yazma
`nexora:sales-changed` olayı yayar, diğer açık listeler kendini yeniler (`:535-550, 3671`).

### 1.1 Yerleşim

#### Liste (`sales-quotes`)

- **Başlık:** "Satış Teklifleri", açıklama "Müşteri taleplerini iskonto ve KDV hesaplarıyla teklif taslağına dönüştürün.",
  sayaç = sunucu `totalCount` (`:2185-2202`). Kiracı görünümü başlığı değiştirmez (`pageSettings` okunmaz, yalnız `fields`, `:700-714`).
- **Özet kartları** (`:2040-2058`; ikisi de yalnız **yüklü sayfa**):

| Kart | Değer | Not |
|---|---|---|
| Teklif tutarı | sayfadaki `grandTotal` toplamı, tek döviz varsa "1.200,00 TRY"; birden çok dövizde `—` ve ipucu "birden çok para birimi" (`sales/components/SalesListFooter.tsx:48-66`) | ipucu "bu sayfa · tüm durumlar"; yüklenirken `—` |
| Yanıt bekleyen | sayfadaki `status == Sent` sayısı, ton `warn` | **tıklanabilir**: Durum süzgecini `Sent` ↔ boş arasında değiştirir, süzgeç `Sent` iken kart etkin görünür (`:2053-2054`) |

- **Uyarı / bildirim şeritleri:** hata ve bildirim kapatılabilir; kart ekranında gösterilmez (`:2220-2235`).
- **İşlem çubuğu** (`:1928-2026`; kısayollar `commands/shortcuts.ts:6-18`, İşlemler Alt+İ). Liste, açık detay ve kart ekranı
  için üç ayrı komut kümesi vardır:

*Liste (detay kapalı):*

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | `openQuoteCreatePage()` önce form verilerini yükler, sonra `sales-quote-create`'e gider (`:762-820, 1951-1952`). |
| Aç | Enter | Odaklı satır (`focusedRecordId`), yoksa seçili satır, yoksa tek işaretli satır. Hiçbiri yoksa pasif, neden "Önce bir kayıt seçin". Detayı **aynı ekranda** açar (`openQuote`) (`:1989-1996`, `commands/gridCommands.ts:9-12`). |
| Sil | Ctrl+Delete | **Yalnız TenantAdmin'e görünür.** Seçim yoksa "Önce bir kayıt seçin", taslak değilse "Yalnızca taslak teklifler silinebilir." (`:1997-2005`). Onay sorar (`:1641-1650`). |
| Dışa aktar (Excel) | Ctrl+E | Izgaranın kendi komutu, yalnız **yüklü sayfa** (`AdvancedDataGrid.tsx:1236`). |
| İşlemler → Düzenle / İletildi yap | | Seçili satır `Draft` ise (`:2008-2011`). |
| İşlemler → Kabul et / Reddet | | Seçili satır `Sent` ise (`:2012-2015`). |
| İşlemler → Sipariş oluştur | | `Accepted` ve `!hasSalesOrder` ise (`:2016-2017`). |
| İşlemler → Teklif alanları | | Yalnız TenantAdmin / TenantDeveloper (`:2018-2023`). Özel alan tanım penceresi. |
| İşlemler → CSV olarak dışa aktar | | Yüklü sayfa (`:2024`, `gridCommands.ts:15-17`). |

  Listede "Reddedilen teklifi kabul et" ve "Revizyon oluştur" **yoktur**, yalnız açık detayda vardır.

*Açık detay (liste ekranında `detail` dolu):* (`:1958-1984`)

| Komut | Kısayol | Koşul |
|---|---|---|
| Yeni | F2 | birincil değil (`primary: !detail`) |
| Sil | Ctrl+Delete | yalnız TenantAdmin; taslak değilse pasif |
| Yazdır | Ctrl+P | PDF penceresini açar (`:1967`) |
| Yenile | F5 | detayı yeniden okur; Süzgeç ve Dışa aktar "Belge açıkken kullanılamaz" (`commands/PageCommandsSlot.tsx:20-27`) |
| İşlemler → Düzenle | | `Draft` ve sipariş yok |
| İşlemler → İletildi yap | | `Draft` |
| İşlemler → Reddet / Kabul et | | `Sent` |
| İşlemler → Reddedilen teklifi kabul et | | `Rejected` |
| İşlemler → Siparişe dönüştür | | `Accepted` ve sipariş yok |
| İşlemler → Revizyon oluştur | | sipariş yok **ve** açık kayıt revizyon listesinin sonuncusu |

  Bütün geçiş komutları `busy` iken "Kaydediliyor…" nedeniyle pasiftir. Geçişlerde onay sorulmaz (yalnız Sil sorar).

- **Süzgeç çubuğu** (`sales/components/SalesListToolbar.tsx:45-89`):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama "Teklif no veya müşteriyle ara" | metin, sunucu **ve** istemci | `q`; 250 ms gecikme, sayfayı 1'e alır (`:678-699`). Sunucu kod, cari adı, cari kodu ve kayıtsız alıcı adında `Contains` arar (`Program.cs:3520`). İstemci de dönen satırları **yalnız kod ve müşteri adına** göre yeniden süzer (`:1757-1764`). Bkz. 1.8. |
| Durum | çip, sunucu | `status` = Tümü / Taslak / İletildi / Kabul edildi / Reddedildi / Süresi doldu. Sayaç yok. |
| Başlangıç / Bitiş | tarih, sunucu | `dateFrom` / `dateTo`, `QuoteDate` üzerinde, iki uç dahil (`Program.cs:3518-3519`). |
| Yenile | | yalnız liste (`:2215`). |
| Detay paneli anahtarı | | `SalesListPanelToggle`, Ctrl+. (`:2216`, `sales/useSalesListPanel.ts:17-22`). |

- **Liste sütunları** (varsayılan `:296-313`, hücreler `:1785-1839`, genişlikler `sales/components/salesListCells.tsx:27-30`;
  görünüm `sales-quotes`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Teklif no | bağlantı düğmesi "`{code} ({revisionNumber})`", tıklayınca seçer ve detayı açar; mono (`nx-code`) |
| `customerName` | Müşteri | kalın ad + altında `customerCode` (kayıtsız alıcıda kod yok) |
| `salesperson` | Plasiyer | `salespersonName` ("`PER001 · Ad Soyad`", sunucuda birleştirilir `Program.cs:3526-3527`), boşsa — |
| `salesOrderCode` | Sipariş no | bağlantı; tıklayınca **sipariş penceresini** (`SalesOrderModal`) bu ekranda açar (`:1812-1825, 3638`); yoksa — |
| `quoteDate` | Teklif tarihi | `gg.aa.yyyy` |
| `validUntil` | Geçerlilik | `gg.aa.yyyy` (süresi geçmiş için ton yok) |
| `lineCount` | Satır | sayı, sağa yaslı |
| `grandTotal` | Genel toplam | "1.234,50 TRY", sağa yaslı (`salesListCells.tsx:5-11`) |
| `status` | Durum | etiket + ton: Taslak `info`, İletildi `warn`, Kabul edildi `ok`, Reddedildi `bad`, Süresi doldu `off` (`sales/salesListStatus.ts:36-41`, `document-page/documentStatus.ts:21-30`) |
| `actions` | İşlemler | sabit alan, **çizilmez** (`:1772-1775`) |
| `revisionNumber` | — | ekran tanır ama her zaman gizler (`:1774`); katalogda yok |

- **Izgara:** işaret sütunu, tıkla = seçim (açmaz), çift tık / Enter = aç, ↑↓, Boşluk, toplu eylem "Excel (seçilenler)"
  (`:2160-2170`, `sales/components/SalesDocumentGrid.tsx:134-154`). Kiracı sütun genişliği ve sütun/pivot aracı sayfa
  çubuğuna yerleşir (`toolbarContainer`). Sıralama sunucuda: `QuoteDate` azalan, sonra `CreatedAt` azalan (`Program.cs:3522`).
- **Boş durumlar:** "Teklifler yükleniyor…", "Henüz satış teklifi yok.", "Aramanızla eşleşen teklif yok." (`:2350-2353`).
- **Alt bilgi:** işaretli sayısı, "Gösterilen x / toplam", sunucu sayfalama 25, ipuçları "↑↓ gez · Boşluk işaretle · Enter
  aç · Çift tık aç · Ctrl+. detay paneli" (`SalesListFooter.tsx:20-42`).
- **Seçim kuralı:** liste ilk satırı kendisi seçmez (`:1899-1900`). Seçili kayıt yeni sayfada yoksa `listCurrent`
  boşalır (`:1916`).
- **Detay paneli** (`sales/components/SalesListPanels.tsx:112-147`; panel açık, liste etkin ve satır seçiliyken `GET
  /api/sales/quotes/{id}` 150 ms gecikmeli, satır verisi değişince yeniden, `useSalesListPanel.ts:32-45`). Seçim yokken
  "Özetini görmek için listeden bir teklif seçin." (`SalesListPanels.tsx:91`):
  - Üst: kod, "Aç" (Enter), müşteri adı, durum etiketi.
  - Sekmeler **Özet / Satırlar**. Özet: Genel toplam, Ara toplam, İskonto, KDV (detaydan); Teklif tarihi, Geçerlilik,
    Plasiyer, Revizyon (**satırdan**); belge zinciri (Satış talebi → Bu teklif → Satış siparişi); ilk **2** satır +
    "tümü" bağlantısı (`SalesListDetailPanel.tsx:265-300`). Satırlar sekmesi tüm satırları listeler.
- **Teklif detayı** (liste ekranında tam sayfa `DocumentSurface`, `:3250-3628`; Esc ya da "Geri" kapatır `:374-388`):
  - Üst: "Satış teklifi · Revizyon n", kod, müşteri · kod · "Kayıtsız alıcı", durum, tarih, durum akışı Taslak → İletildi →
    Kabul edildi; Reddedildi / Süresi doldu son adım olarak gri (`sales/salesDocumentDetail.tsx:35-44`).
  - Yan bölüm: belge zinciri (talep, bu teklif, sipariş bağlantısı), Cari (Unvan, Kayıt, Plasiyer).
  - Kutucuklar: Genel toplam; Geçerlilik (süresi geçmişse `danger` + "Süresi doldu", Taslak/İletildi'de "Bugün sona
    eriyor" / "N gün kaldı", `:3252-3253, 3325-3336`); Satır; Sipariş (kod bağlantısı / "Oluşturuldu" / "Henüz yok").
  - Sekmeler **Teklif bilgileri / Geçmiş (n)**. Bilgiler: üst bilgiler (tarih, para birimi, plasiyer, kaynak talep);
    satır tablosu (Stok, Miktar+birim, yabancı dövizli satır varsa "Döviz fiyatı" ve "Kur" sütunları, Birim fiyat + "KDV
    dahil", İskonto tutarı + %, KDV %, Tutar = `lineSubtotal − discountAmount`) (`:3381-3454`); toplamlar KDV oranına göre
    matrah/KDV kırılımıyla (`:3455-3473`, `salesDocumentDetail.tsx:93-140`); notlar (teslimat koşulları, açıklama).
  - **Taslak** ve özel alan varsa "Teklif özel alanları" formu + "Değerleri kaydet" (`:3475-3527`).
  - Geçmiş sekmesi: revizyon tablosu (Revizyon, Teklif no, Durum, Tarih, Genel toplam, "Aç"/"Açık"), "Yeni revizyon
    oluştur" (`canRevise`) (`:3566-3625`).
- **Pencereler:**
  - *Teklif özel alanları* (`:2394-2557`): tanım listesi (etiket, kod · tür · en fazla N karakter · zorunlu · vN),
    "Tanımı düzenle" (ardışık `promptDialog`: etiket, metin uzunluğu 1–500, TenantAdmin'e zorunluluk "Evet/Hayır",
    `:1250-1320`), "Devre dışı bırak" (yalnız TenantAdmin, onaylı, `:1321-1349`). Altta yeni alan formu (TenantAdmin /
    TenantDeveloper): Alan kodu (büyük harf, ≤ 40), Ekran etiketi (≤ 120), Veri türü (Metin / Ondalık / Tarih / Evet-Hayır),
    En fazla karakter (Metin, 1–500), "Bu alanı zorunlu yap" (yalnız TenantAdmin) (`:2460-2545`).
  - *Yazdır / Önizle* (`sales/components/SalesQuotePdfTools.tsx:140-161`): şablon seçimi (varsayılan önce seçilir),
    "Önizleme", "Yazdır / PDF kaydet" (iframe'in tarayıcı yazdırması; sunucu PDF'i yok). TenantAdmin'e "Tasarla" paneli:
    şablon adı ≤ 80, başlık ≤ 100, giriş / alt bilgi ≤ 500, yerleşim (Kurumsal / Modern / Kompakt), yazı tipi (5), vurgu
    rengi, logo (PNG/JPEG/WebP ≤ 256 KB, data URL), logo konumu, "Satış koşullarını PDF'ye ekle", "Varsayılan şablon yap",
    "Yeni şablon", "Kaydet" (seçili yoksa POST, varsa PUT). Belge HTML'i istemcide üretilir (`:47-65`).
  - *Sipariş penceresi* (`SalesOrderModal`, `:3638-…`): Sipariş no hücresi ve detaydaki zincirden açılır. Kapsam dışı
    (sipariş envanteri).
  - Ortak onay/istem pencereleri (`confirmDialog`, `promptDialog`).

#### Kart (`sales-quote-create`: Yeni / Düzenleme / Revizyon)

- **Giriş yolları ve ön doldurma** (`:859-877`):
  - Yeni: `openQuoteCreatePage(false)` formu sıfırlar. Kod `T-YYYY-` + `Date.now()`'un son 4 hanesi, tarih bugün, geçerlilik
    +14 gün, tek boş satır (`:762-791, 230-231`). Sonra özel alan tanımlarını, müşteri seçicinin ilk sayfasını
    (`Customer` + `Both`, aktif, 100'er; `:150-156`), stok seçicinin ilk 100 aktif kartını (`:157-163`) ve aktif
    personeli (`/api/hr/employees/`) `Promise.all` ile yükler (`:794-813`).
  - Düzenle: `sessionStorage["nexora.sales-quote.edit-id"]` + `onNavigate("sales-quote-create", "Teklif Düzenleme")`
    (`:1409-1412`). Kart açılınca anahtarı okur ve `beginQuoteEdit` çalışır. Bu, `Draft` değilse ya da siparişi varsa
    "Yalnızca siparişe dönüşmemiş taslak teklifler düzenlenebilir." der (`:1361-1418`). Satırlar `enteredUnitPrice`,
    `enteredUnitCode`, `enteredCurrencyCode` ve **kayıtlı kur** (`exchangeRateOverride = exchangeRateToQuoteCurrency`)
    ile dolar (`:1397-1407`).
  - Revizyon (yalnız açık detaydan): kaynak teklifin müşterisi, dövizi, notları, plasiyeri, satırları ve özel alanları
    kopyalanır. Tarih bugün olur. Geçerlilik, kaynağınki bugünden sonraysa korunur, değilse bugün+14 olur. Kod `{kod}-R{n+1}` (40'a kırpılır), satır
    kurları kayıtlı kurdan (`:1522-1551`).
  - Satış talebinden: `sessionStorage["nexora.sales-quote.request-id"]` (`sales-customer-requests/types.ts:55`,
    `SalesCustomerRequestsPage.tsx:137`). Müşteri, döviz, açıklama ve satırlar (stok, miktar, birim) talepten gelir.
    Fiyat, iskonto, KDV ve döviz **stok kartından**, ama yalnız ilk 100 kart içinden (`:823-858`). Yan bölümde "Belge
    zinciri: Satış talebi → Bu teklif", durum çubuğunda "Kaynak talep: …" (`:2919-2930, 2959`).
  - Cari kartından "Yeni teklif": `takeCustomerSalesAction("sales-quote-create")` + `nexora:customer-sales-action` olayı
    müşteriyi seçer ve dövizini uygular (`:201-229, 441-449`).
- **Kayıt formu** (`RecordFormPage`, `:2909-3249`): başlık Yeni Teklif / Teklif Düzenleme / Teklif Revizyonu; belge
  şeridi "Satış teklifi", kod, taraf, akış (her zaman Taslak), ipucu "Ctrl+Shift+Enter satır ekle"
  (`sales/salesDocumentForm.tsx:13-14`). Birincil komut Kaydet (Ctrl+S) etiketi "Teklif taslağı oluştur" /
  "Değişiklikleri kaydet" / "Revizyon taslağını oluştur". Kurlar yüklenirken "Döviz kurları yükleniyor…", kuru olmayan
  satır varsa "Kuru bulunmayan satır var; teklif kaydedilemez." nedeniyle pasiftir (`:2936-2950`). **"Kaydet ve Yeni" ve
  "Temizle" yok** (`onSaveIntent`/`onReset` verilmez; `record-form/RecordForm.tsx:162-191`). Yeni (F2) doluysa "Yeni
  kayıt — Kaydedilmemiş değişiklikler kaybolacak." diye sorar (`:1932-1941`, `PageCommandsSlot.tsx:29-37`). Esc = Vazgeç
  (dokunulmuşsa sorar, `RecordForm.tsx:276-299`) → `sales-quotes`.
- **Durum çubuğu:** kipe göre açıklama, kur uyarıları, kaynak talep, bildirim, "Satır: n" (`:2954-2963`).
- **Belge bilgileri** grubu (`:2965-3045`):

| Alan | Zorunlu | İstemci | Sunucu (`PlatformContracts.cs:974-1006`, `Program.cs:3565-3705`) |
|---|---|---|---|
| "Kayıtlı cari olmadan teklif oluştur" | | onay kutusu; değişince müşteri ve alıcı adı temizlenir | `customerId == null` ise `prospectCustomerName` zorunlu |
| Teklif no | * | ≤ 40, yer tutucu "T-2026-0001" | ≤ 40, trim, **büyük harfe çevrilir**, firmada benzersiz (409). Boşsa **sunucu numaralandırır** (`TenantDocumentNumbering`, `:3592-3594`); ekran bunu kullanmaz. |
| Müşteri (kayıtlı) | * (kayıtta) | `SalesCustomerPopupSelect`: ilk sayfa + 2 harften sonra gecikmeli sunucu araması `q`, `type=Customer` ve `type=Both` (`:10840-10848`). Seçince dövizi cari dövizine çeker. | aktif ve türü `Customer`/`Both`/`Dealer` (`:3572-3576`) |
| Teklif alıcısı adı (kayıtsız) | * | ≤ 200 | ≤ 200 |
| Teklif dövizi (kayıtsız) | * | serbest metin, büyük harf, 3 karakter | 3 harf ISO. Kayıtlı caride **form alanı yok**: döviz carinin dövizi olarak gönderilir (`:1449`); sunucu da eşitliği denetler (`:3579-3581`). |
| Teklif tarihi | * | tarih; değişince kurlar yeniden yüklenir (`:878-887`) | kur bu tarihe göre çözülür |
| Geçerlilik tarihi | * | tarih | `ValidUntil ≥ QuoteDate` |
| Plasiyer | | `SearchableRecordPicker`, "kod · ad", yalnız `status == Active`, temizlenebilir | çıkış tarihi olmayan personel (`:3577-3578`) |

- **Satır ızgarası** (`:3082-3186`; HTML tablo, 14 sütun; satır kaldır "×"; "Satır ekle" Ctrl+Shift+Enter):

| Sütun | Giriş | Kural / hesap |
|---|---|---|
| # | sıra + kaldır | en az satır denetimi yok (sunucu 1–100) |
| Stok kartı | `SearchableRecordPicker` (yüklü kartlar + 2 harften sonra 300 ms gecikmeli `/api/stock/items/?q=&pageSize=50`, aktifler eklenir; `:475-501`) | **Seçim birim, fiyat (`salesListPrice`), iskonto (`salesDiscountPercent`), KDV (`salesVatPercent`, yoksa 20), döviz (`priceCurrencyCode`, yoksa teklif dövizi) alanlarını doldurur, "KDV dahil"i Hariç yapar ve birimleri yükler** (`:3107-3121`) |
| Miktar | sayı ≥ 0,0001, adım 0,0001 | sunucu > 0, ≤ 4 ondalık |
| Birim | seçim: temel birim + stok kartının **aktif** çevrimleri "KOD (×katsayı)" (`GET /api/stock/items/{id}/units`, `:898-912`) | sunucu birimi etkin olmalı. Temel miktar = miktar × katsayı (`:3658-3665`). |
| Birim fiyat | sayı ≥ 0, adım 0,0001 | ≤ 4 ondalık |
| Döviz | seçim: teklif dövizi, ana döviz, TRY/USD/EUR/GBP, kur tablosundaki ve stok kartlarındaki dövizler (`:1101`). Değişince kur girişi temizlenir. Altında "1 USD = 34,12 TRY" ya da "Kur bulunamadı" ipucu. | 3 harf ISO |
| Kur | sayı > 0, 8 ondalık; aynı dövizde 1 ve kilitli; boşsa hesaplanan kur gösterilir | çapraz kur = kaynak / hedef, ana dövize göre (`:1022-1040`). Sunucu: kur gelirse onu, gelmezse aynı tarihin kurunu kullanır (`:3649-3657`). Ekran **her zaman** kur gönderir (`:1464`). |
| İskonto % | 0–100, adım 0,01 | ≤ 2 ondalık |
| KDV % | 0–100, adım 0,01 | ≤ 2 ondalık |
| KDV (Hariç / Dahil) | seçim | `isVatIncluded` |
| Ara toplam, İskonto, KDV tutarı, Satır toplamı | salt okunur, hesaplanır | aşağıdaki formül |

  **Satır hesabı** (istemci `:1073-1081`, sunucu `PlatformContracts.cs:1008-1018`; ikisi de 2 hanede yuvarlar):
  `brüt = miktar × fiyat × kur`; KDV dahilse `ara = brüt ÷ (1 + KDV/100)`, değilse `ara = brüt`;
  `iskonto = ara × iskonto%`; `KDV = (ara − iskonto) × KDV%`; `toplam = ara − iskonto + KDV`. Sunucu aynı formülü
  **temel birim miktarı ve temel birim fiyatı** (`fiyat × kur ÷ katsayı`, yuvarlanmadan) ile uygular. Bu yüzden birim
  çevrimli satırlarda kuruş farkı çıkabilir. Kaydedilen tutar sunucununkidir.
- **Toplamlar** (`:3046-3054, 1082-1097`; `sales/salesDocumentForm.tsx:79-89`): Mal / hizmet toplamı, Toplam iskonto
  (− X), "KDV %r matrahı" satırları, "KDV %r" satırları (oran artan), KDV toplamı, "Genel toplam · Ödenecek tutar". Hepsi
  teklif dövizinde, canlı. Toplam bandının solunda **Teslimat koşulları** (≤ 1000) ve **Açıklama ve satış koşulları**
  (≤ 1000) metin alanları.
- **Özel alanlar** (`:3188-3247`): tanım varsa "Teklif Özel Alanları" grubu; türe göre metin (maxLength), sayı (`any`),
  tarih ya da Evet/Hayır seçimi; zorunlu işareti; "kod · tür" alt yazısı. Değerler gövdedeki `customFields` map'iyle gider.
- **Kayıt** (`:1419-1501`): istemci denetimi (müşteri ya da alıcı adı; kur yükleniyor / eksik) → `POST /api/sales/quotes/`
  ya da `PUT /{id}`. Başarıda form temizlenir, "Teklif taslağı kaydedildi./güncellendi." bildirimi, `sales-quotes`'e gidilir,
  liste yenilenir ve kaydedilen teklifin detayı açılır (`:1492-1495`). Açılışın keep-alive'da hangi sekmede göründüğü
  **doğrulanmalı**: `openQuote` kart sekmesinin örneğinde çalışıyor gibi görünür.
- **Teklif → sipariş** (`:1694-1714`, `Program.cs:3850-3907`): yalnız `Accepted` ve siparişi olmayan teklif. Cari zorunlu,
  bekleyen onay iş akışı varsa engellenir. Sipariş kodu sunucu numarası, tarihi **bugün (UTC)**. Satırlar ve tutarlar
  kopyalanır. Sipariş özel alanları teklifte **aynı kodlu** değerlerden doldurulur; teklifte karşılığı olmayan zorunlu
  sipariş alanı varsa 409 döner. Başarıda bildirim gösterilir ve `sales-orders`'a gidilir (oluşan sipariş açılmaz).

### 1.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Liste açılışı, süzgeç/sayfa değişimi, Yenile | `GET /api/sales/quotes/` | `q`, `page`, `pageSize=25`, `status?`, `dateFrom?`, `dateTo?` | `erp.sales-quotes.read` (satır süzgeçli) | `Program.cs:3509-3531`; `pageSize` 1–100; `SalesQuotePage{items, page, pageSize, totalCount}`; öğe `SalesQuoteSummary` (`PlatformContracts.cs:232-235`) |
| Liste açılışında, aynı `Promise.all` içinde | `GET /api/warehouses/` | — | `erp.warehouses.read` | `:573-592`. Teklif ekranı depo kullanmaz, ama bu çağrı hata verirse **liste de yüklenmez** (1.8). |
| Açılış | `GET /api/screen-views/sales-quotes/active` | — | `erp.screen-views.read` | yalnız `fields`; hata **sessiz** (`:700-714`). Aynı örnek `sales-orders` ve `sales-invoices` görünümlerini de okur (`:715-744`). |
| Satır seçilince, panel açıksa | `GET /api/sales/quotes/{id}` | — | `read` (kayıt öznitelikleri: durum, cari) | `useSalesListPanel.ts:32-45` |
| Aç / detay | `GET /api/sales/quotes/{id}` + `GET /{id}/revisions` | — | `read` | `:1502-1521`; `SalesQuoteView` (`PlatformContracts.cs:226-231`), revizyonlar `RevisionNumber` artan (`Program.cs:3532-3545`) |
| İletildi yap | `POST /{id}/send` | — | `erp.sales-quotes.execute` | `Program.cs:3828-3845`; `Draft` değilse ya da geçerlilik geçmişse 409 |
| Kabul et / Reddet | `POST /{id}/accept` / `POST /{id}/reject` | — | `execute` | `Program.cs:3846-3849, 8896-8934` |
| Siparişe dönüştür | `POST /{id}/convert-to-order` | — | `execute` (sipariş izni **aranmaz**) | `Program.cs:3850-3907`; `SalesOrderSummary` döner |
| Sil | `DELETE /{id}` | — | `delete` + **TenantAdmin işleyici** | `Program.cs:3348-3366` |
| Özel alan değerlerini kaydet (detay) | `PUT /{id}/custom-fields` | `{values{KOD: değer}}` | `update` | `Program.cs:3450-3481`; ≤ 40; gelmeyen kod **silinir**; zorunlu denetimi; yalnız `Draft` |
| Değer geçmişi / geri yükle | `GET /{id}/custom-fields/{definitionId}/history`; `POST …/history/{revisionId}/restore` `{confirmation:true}` | | `read` / `execute` | `Program.cs:3482-3508`. Ekranda **ulaşılamıyor** (1.8). |
| Teklif alanları penceresi | `GET /api/sales/quotes/custom-fields` | — | `read` | yalnız aktifler, etikete göre (`Program.cs:3367-3373`) |
| Alan ekle / düzenle / devre dışı | `POST /custom-fields`, `PUT /custom-fields/{id}`, `DELETE /custom-fields/{id}` | `{code,label,dataType,maxLength,isRequired}` / `{label,maxLength,isRequired?}` | `create` / `update` / `delete` + rol denetimi | `Program.cs:3374-3418`; kod `^[A-Z][A-Z0-9_]{0,39}$`; zorunlu açma taslaklarda değer ister |
| (kullanılmıyor) tanım geçmişi / geri yükle | `GET /custom-fields/{id}/history`, `POST /custom-fields/{id}/restore` | `{version, confirmation}` | `read` / `execute` + TenantAdmin | `Program.cs:3419-3440`; ekranda çağrı yok |
| Kart açılışı | `GET /custom-fields` + `GET /api/customers/?type=Customer&status=Active&pageSize=100` + `…type=Both…` + `GET /api/stock/items/?page=1&pageSize=100` + `GET /api/hr/employees/` | | `sales-quotes.read`, `erp.customers.read`, `erp.stock-items.read`, `erp.human-resources.read` | `:794-806`. Tek `Promise.all`: biri düşerse form yüklenmez. |
| Kart açılışı, teklif tarihi değişince | `GET /api/sales/quotes/exchange-rates?rateDate=` | `rateDate` (gelecek tarih 400) | `read` | `Program.cs:3334-3347`; `{baseCurrencyCode, rates[{currencyCode, rate, rateDate}]}` |
| Kart: kayıtlı ekranın liste yüklemesi | `GET /api/sales/quotes/…` + `GET /api/warehouses/` | | | kart da `activeTab="quotes"` olduğundan yükler (`:679-699`) |
| Müşteri arama | `GET /api/customers/?q=&type=Customer|Both&status=Active&pageSize=50` ×2 | | `erp.customers.read` | `:10847-10848` |
| Stok arama (≥ 2 harf) | `GET /api/stock/items/?q=&page=1&pageSize=50` | | `erp.stock-items.read` | `:475-501`; pasifler istemcide atılır |
| Stok seçilince | `GET /api/stock/items/{id}/units` | | `erp.stock-items.read` | `:898-912` |
| Cari kartından gelince | `GET /api/customers/{id}` | | `erp.customers.read` | önbellekte yoksa (`:238-269`) |
| Talepten | `GET /api/sales/requests/{id}` + `GET /api/customers/{customerId}` + `GET /api/stock/items/?page=1&pageSize=100` | | `erp.sales-requests.read` (doğrulanmalı) + diğerleri | `:823-858` |
| Düzenle | `GET /{id}` + `/custom-fields` + seçiciler | | `read` | `:1361-1418` |
| Kaydet | `POST /api/sales/quotes/` / `PUT /{id}` | `SalesQuoteWriteRequest` (`PlatformContracts.cs:205-209`): `code, customerId, prospectCustomerName, quoteDate, validUntil, currencyCode, notes, deliveryTerms, salespersonEmployeeId, customFields{KOD:değer}, revisesQuoteId, salesRequestId` (düzenlemede null), `lines[{stockItemId, quantity, unitPrice, discountPercent, vatPercent, isVatIncluded, currencyCode, exchangeRateToQuoteCurrency, unitCode}]` | `create` / `update` | `Program.cs:3565-3827`; POST 201 + `SalesQuoteSummary`; `warehouseId` satır alanı kullanılmaz |
| PDF penceresi | `GET /api/sales/quote-pdf-templates/` | — | `erp.sales-quotes.read` (`PlatformPermissionCatalog.cs:271-277`) | **Hiç şablon yoksa okuma iki şablon yazar** (Kurumsal, Sade) (`SalesQuotePdfTemplateEndpoints.cs:16-30`) |
| Şablon kaydet | `POST /` / `PUT /{id}` | şablon alanları | `create` / `update` + TenantAdmin | `:31-56`; ad benzersiz; varsayılan tekildir |
| (kullanılmıyor) şablon sil | `DELETE /{id}` | | `delete` + TenantAdmin | son şablon silinemez (`SalesQuotePdfTemplateEndpoints.cs:57-67`) |

### 1.3 Kurallar

- **Durum makinesi** (`PlatformContracts.cs:1050-1060`): `Draft → Sent`, `Sent → Accepted`, `Sent → Rejected`,
  `Rejected → Accepted`. Sipariş yalnız `Accepted` ve dönüştürülmemiş teklifte. `Expired = 5` tanımlı
  (`Entities.cs:2095`), ama **sunucuda bu durumu yazan kod bulunamadı** (`SalesQuoteStatus.Expired` araması yalnız
  tanımı buldu). Süzgeçteki "Süresi doldu" çipi büyük olasılıkla hiç sonuç döndürmez. Süre dolumu yalnız istemcide
  hesaplanır (detay kutucuğu `:3253`).
- **Tarih kuralları:** gönderme ve kabul, `ValidUntil < bugün (UTC)` ise reddedilir (`Program.cs:3835, 8905-8906`).
  Reddetme tarih bakmaz. Kur tarihi gelecekte olamaz (`Program.cs:3338-3339`). Bugün UTC'ye göre, kur tarihi İstanbul'a göre hesaplanır.
- **Düzenleme:** yalnız `Draft`, siparişi olmayan ve revizyon grubunun **en günceli** olan teklif (`Program.cs:3716-3722`).
  Satırlar silinip yeniden yazılır (`Program.cs:3789-3809`). `rowVersion` yok: sözleşmede alan yok (`PlatformContracts.cs:206-209`).
  Eşzamanlılık `UPDLOCK, HOLDLOCK` ile işlem içinde sağlanır (`Program.cs:3712-3714`), son yazan kazanır.
- **Revizyon:** `revisesQuoteId` ile yeni kayıt açılır, aynı `RevisionGroupId` altında `RevisionNumber + 1`. Kaynak
  siparişe dönüşmüşse 409, en güncel değilse 409. Müşteri, döviz ve kayıtsız alıcıda alıcı adı (büyük/küçük harf
  duyarsız) aynı olmalıdır (`Program.cs:3598-3617`). Kaynağın durumu **değişmez**; eski revizyon `Sent`/`Accepted` kalabilir ve
  ayrıca kabul edilip siparişe dönüştürülebilir (sunucu bunu engellemiyor görünür).
- **Silme:** TenantAdmin; `Draft`, sipariş yok ve kampanya uygulaması yok (`Program.cs:3353-3355`). Özel alan değerleri ve geçmişi de
  silinir. Silinen bir revizyonun grubundaki sıra boşluklu kalır.
- **Kabul ve kayıtsız alıcı:** `customerId` yoksa kabul anında **otomatik cari kartı** açılır: kod `CUS-` + GUID'in 12
  hanesi, tür `Customer`, döviz teklif dövizi (`Program.cs:8907-8923`). Kabul ayrıca `SalesQuoteAccepted` iş kuralını
  değerlendirir (`BusinessRuleEndpoints.cs:167-184`). Kural bir onay iş akışı başlatırsa dönüştürme "Teklif onay iş akışı
  tamamlanmadan siparişe dönüştürülemez." ile engellenir (`Program.cs:3861-3862`, `BusinessRuleEndpoints.cs:233-235`).
  Ekran bu bekleme durumunu göstermez, yalnız hata metni çıkar.
- **Satış talebi bağı:** talep iptal olmamalı ve müşterisi teklifinkiyle aynı olmalı (kayıtsız alıcıyla talepten teklif
  açılamaz). İlk teklif talebi `Open → Quoted` yapar (`Program.cs:3582-3590, 3680`).
- **Satırlar:** 1–100 satır; stok kartı aktif olmalı; birim etkin çevrim olmalı. Temel miktar ≤ 4 ondalık kalmalı (çevrim
  katsayısı bunu bozarsa 400). Satır toplamı ≤ decimal(18,2) (`PlatformContracts.cs:985-1004`, `Program.cs:3636-3671`).
  Aynı stok kartı birden çok satırda olabilir.
- **Döviz:** cari seçiliyse teklif dövizi = cari dövizi (zorunlu eşitlik). Satır kuru gelmezse sunucu teklif tarihinin
  kurunu çözer, bulamazsa 400 "X ile Y arasında … tarihli kur bulunamadı". Aynı dövizde kur 1 olmalıdır (`Program.cs:3649-3657`).
- **Özel alanlar:** ≤ 40 değer; kod etkin tanımda olmalı; türe göre normalize (`StockCustomFieldValidation.TryNormalize`);
  zorunlu alan boş olamaz (`Program.cs:3623-3635`). Değerler yalnız `Draft`'ta değişir. Kayıt ve PUT her değişikliği değer
  geçmişine yazar.
- **Satır düzeyi görünürlük:** liste `PermissionStatusFilter` ile **durum ve cari** özniteliğine göre süzülür
  (`Program.cs:3516`; aynı kural raporlarda `ReportEndpoints.cs:2055-2057`). `{id}` rotalarında TenantAdmin dışındaki
  kullanıcılar için kaydın `Status` ve `CustomerId`'si izin değerlendirmesine eklenir
  (`PermissionAuthorizationHandler.cs:61-73, 98-103`). Ancak `GET /{id}/revisions`, yalnız verilen kaydın izniyle
  grubun **bütün** revizyonlarını döndürür (`Program.cs:3532-3545`). Kayıtsız alıcı `Guid.Empty` cari sayılır.
- **İzin eylemleri** (`PlatformPermissionCatalog.cs:319-345, 389-397`): GET → `read`, POST `/` → `create`, PUT → `update`,
  DELETE → `delete`. Son segmenti `send`, `accept`, `reject`, `convert-to-order` ya da `restore` olan POST'lar →
  `execute`. PDF şablonları `erp.sales-quotes` kaynağına bağlanır (`PlatformPermissionCatalog.cs:271-277`).
- **Idempotency:** yok. POST tekrarında aynı kod 409 verir, ama ekran her açılışta farklı kod ürettiği için çift tık iki
  teklif açabilir. `busy` düğmeyi kilitler. Dönüştürme benzersiz ihlalde 409 döner (`Program.cs:3901-3902`).
- **Denetim kaydı:** `sales-quote.created` / `updated` / `sent` / `accepted` / `rejected` / `deleted`,
  `sales-order.created-from-quote`, `sales-quote-custom-field.created`, `sales-quote-pdf-template.created` / `updated` /
  `deleted`. Alan güncelleme, devre dışı bırakma ve değer yazımı **denetim olayı yazmaz**, yalnız revizyon tablolarına
  yazar (`Program.cs:3398-3418, 3450-3481`). Kabulde açılan otomatik cari için ayrı denetim olayı yok.

### 1.4 Roller

- **TenantAdmin:** Sil (çubukta görünür, işleyici şart koşar); PDF şablon tasarımı (Tasarla, kaydet); özel alanda zorunluluk,
  devre dışı bırakma, tanım geri yükleme; satır süzgeci uygulanmaz.
- **TenantDeveloper:** "Teklif alanları" menüsünü görür; alan ekler ve düzenler (zorunlu yapamaz: işleyici 403,
  `Program.cs:3379, 3396`; devre dışı bırakamaz). Sil ve Tasarla görünmez. Diğer her şey izin kurallarına bağlıdır.
- **TenantUser:** liste, kart, geçişler ve dönüştürme tamamen izin kurallarına bağlıdır (`read` / `create` / `update` /
  `execute`). Sil, Teklif alanları ve Tasarla görünmez. Satır koşullu okuma kuralları (durum, cari) listeyi daraltır.
  Ayrıca kart için `erp.customers.read`, `erp.stock-items.read`, `erp.human-resources.read`, liste için
  `erp.warehouses.read` gerekir (1.8).

### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `satis.*` işlemi yok** (`ErpOperationCatalog.cs`, `tests/IntegrationTests/ErpOperationCatalog.names.txt`,
82 ad). Satışla ilgili yalnız rapor işlemleri var: `rapor.salesQuotes`, `rapor.salesOrders`, `rapor.salesOrderFulfillment`,
`rapor.salesDeliveries`, `rapor.salesInvoices`, `rapor.salesReturns` (`POST /api/reports/run`, `ErpOperationCatalog.cs:188`).
Bunlar liste ekranının yerini tutmaz (`rapor.customers` için cari envanterindeki gerekçeyle aynı).

Katalogda kullanılabilecek yapılar: `ListParameter<T>("lines")` düzenlenebilir ızgara satırlarını gövde listesine bağlar
(`ErpOperationCatalog.cs:244-246, 443-448`). `MapParameter("customFields")` map gövdesidir. `rowsPath` kayıt yanıtının iç listesini okur
(`custom-page/erpOperations.ts:227`), bu yüzden `GET /{id}` üzerinden `rowsPath:"lines"` ile satır okuması mümkündür.
Enum `text`, `DateOnly` `date` olur (`ErpOperationCatalog.cs:477-487`).

Yeni (önerilen; modül sabiti `"Satış"` eklenmeli):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satis.teklif.listele` | GET `/api/sales/quotes` | query `q`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize` | list `SalesQuoteSummary`, `rowsPath:"items"`, `MetaPaths [page, pageSize, totalCount]` | `allowed` riski G-SQ12 |
| `satis.teklif.getir` | GET `/api/sales/quotes/{id}` | route `id` | record `SalesQuoteView` (`lines`, `customFields` düşer) | detay üst bilgisi; düzenlemenin kaynağı |
| `satis.teklif.satirlari` | GET `/api/sales/quotes/{id}` | route `id` | list `SalesQuoteLineView`, `rowsPath:"lines"` | ayrı uç noktası gerekmez |
| `satis.teklif.revizyonlari` | GET `/api/sales/quotes/{id}/revisions` | route `id` | list `SalesQuoteRevisionSummary` | Geçmiş sekmesi |
| `satis.teklif.olustur` | POST `/api/sales/quotes` | body `SalesQuoteWriteRequest` skalerleri (`code` **isteğe bağlı** yapılmalı → sunucu numarası; `customerId`, `prospectCustomerName`, `quoteDate`*, `validUntil`*, `currencyCode`*, `notes`, `deliveryTerms`, `salespersonEmployeeId`, `revisesQuoteId`, `salesRequestId`) + `ListParameter<SalesQuoteLineWriteRequest>("lines")` (`warehouseId` hariç) + map `customFields` | record `SalesQuoteSummary` | Revizyon ve talepten oluşturma aynı işlemi kullanır. Satır ön doldurma G-SQ3. |
| `satis.teklif.guncelle` | PUT `/api/sales/quotes/{id}` | route `id` + aynı gövde (`revisesQuoteId`, `salesRequestId` hariç) | record `SalesQuoteSummary` | Satırlar her zaman **tam liste** olarak gider (bodyMap yok). Kaynak `satis.teklif.getir`. Dikkat: `SalesQuoteView`'da `prospectCustomerName` **yok** (`PlatformContracts.cs:226-231`; ad `customerName`'de). Kaynaktan dolan gövde kayıtsız alıcıda adı kaybeder ve 400 alır. Sayfada `prospectCustomerName ← customerName` (yalnız `customerId` boşken) bağlanmalı ya da görünüme alan eklenmeli. |
| `satis.teklif.ilet` | POST `/{id}/send` | route `id` | record `SalesQuoteSummary` | `execute` |
| `satis.teklif.kabulEt` | POST `/{id}/accept` | route `id` | record | `execute`; kayıtsız alıcıda cari açar |
| `satis.teklif.reddet` | POST `/{id}/reject` | route `id` | record | `execute` |
| `satis.teklif.siparisOlustur` | POST `/{id}/convert-to-order` | route `id` | record `SalesOrderSummary` | `execute`; sonuçtaki `id` ile sipariş ekranına geçiş G-SQ10 |
| `satis.teklif.sil` | DELETE `/{id}` | route `id` | none | `requiresTenantAdmin: true` |
| `satis.teklif.kurlar` | GET `/api/sales/quotes/exchange-rates` | query `rateDate` (date) | list `rates` (`rowsPath:"rates"`) | yanıt anonim tip; `Columns<>` için adlı bir görünüm kaydı gerekir |
| `satis.teklif.ozelAlanTanimlari` | GET `/custom-fields` | — | list `SalesQuoteCustomFieldDefinitionView` | `customFieldsBlock` kaynağı |
| `satis.teklif.ozelAlanDegerleri` | GET `/{id}/custom-fields` | route `id` | list `SalesQuoteCustomFieldValueView` | |
| `satis.teklif.ozelAlanKaydet` | PUT `/{id}/custom-fields` | route `id`, map `values` | list `SalesQuoteCustomFieldValueView` | `bodyMap {values ← satis.teklif.ozelAlanDegerleri: code→value}` (stok ile aynı). Gelmeyen kod silindiği için şarttır. |
| `satis.teklif.pdfSablonlari` | GET `/api/sales/quote-pdf-templates` | — | list (şablon varlığı) | okuma yazma yan etkili (1.8); v1'de PDF eski bileşenle kalırsa gerekmez |

Seçici kaynakları için ayrıca (başka modüllerin envanterleriyle ortak, adlar uyumlu tutulmalı): `cari.listele`
(`type`, `status` ile; **`Dealer` dahil** üç tür tek sorguda verilemiyor, G-SQ9), `stok.kart.listele` (var),
`stok.kart.birimleri` (var; satır kapsamlı sorgu), personel seçeneği (`ik.personel.listele` benzeri, bugün yok).

Sonraya (v1 dışı önerilir): `satis.teklif.ozelAlanTanimEkle` / `Guncelle` (TenantAdmin **veya** TenantDeveloper) / `Kaldir`
(`requiresTenantAdmin`); değer geçmişi ve geri yükleme (`execute`, `fixedBody {confirmation:true}`); tanım geçmişi / geri
yükleme; PDF şablon yazma (`requiresTenantAdmin`); satış talebi işlemleri (ayrı envanter).

Gereken yeni `Labels` kodları (bugün yok; `Label()` açılışta hata verir, `ErpOperationCatalog.cs:494-495`): `customerId`,
`customerName`, `customerCode`, `quoteDate`, `validUntil`, `currencyCode`, `grandTotal`, `hasSalesOrder`, `revisionGroupId`,
`revisionNumber`, `salespersonName`, `salesOrderId`, `salesOrderCode`, `notes`, `subtotal`, `discountTotal`, `taxTotal`,
`deliveryTerms`, `salespersonEmployeeId`, `salesRequestId`, `salesRequestCode`, `prospectCustomerName`, `revisesQuoteId`,
`lineNumber`, `stockCode`, `stockName`, `unitPrice`, `discountPercent`, `vatPercent`, `lineSubtotal`, `discountAmount`,
`taxAmount`, `lineTotal`, `enteredCurrencyCode`, `enteredUnitPrice`, `exchangeRateToQuoteCurrency`, `isVatIncluded`,
`lines`, `status` dışındaki sipariş özeti alanları (`quoteId`, `quoteCode`, `orderDate`, `requestedDeliveryDate`),
`rateDate`, `rate`, `dateFrom`, `dateTo`. Var olanlar: `id`, `code`, `status`, `lineCount`, `createdAt`, `quantity`,
`unitCode`, `enteredUnitCode`, `stockItemId`, `customFields`, `values`, `definitionId`, `label`, `dataType`, `maxLength`,
`definitionVersion`, `isRequired`, `value`, `version`, `q`, `page`, `pageSize`, `baseCurrencyCode`. Ayrıca `names.txt`,
yeni `system-pages/salesQuote*Operations.fixture.json` ve `SystemPageStandards.versions.txt` güncellenmelidir.

### 1.6 Bileşen eşlemesi ve eksikler

Var (liste): `actionBar` (Yeni → `page @sales-quote-create`; Aç → teklif detay sayfası ya da `contextPanel`; Sil →
`satis.teklif.sil` `requiresTenantAdmin` + `disabledWhen status != Draft`; eski ekran Sil'i TenantAdmin dışına **gizler**,
sistem sayfasında gizli mi nedenli pasif mi olacağı **doğrulanmalı** (koşulların rolü görüp görmediği okunmadı); İşlemler
`moreButtons` durum koşullu; `titleCount {{liste.meta.totalCount}}`),
`filterBar` (sunucu arama `searchParam q`, durum seçimi), `dataTable` (sunucu sayfalama 25, `valueLabels` + `toneMap`
durum, para ve tarih biçimi), `metric` + `countWhen` ("Yanıt bekleyen · bu sayfa"), `contextPanel` (Özet / Satırlar),
`tabs`, `dialog` (xl), `button` (`confirmEnabled`).

Var (kart): `recordHeader` (belge türü, kod, taraf), `steps` (Taslak → İletildi → Kabul), `formCard` (belge bilgileri,
notlar), `editableGrid` `list` kipi (`lookup:` stok sütunu, satır kapsamlı birim seçenekleri `{{satirlar.satir.stockItemId}}`,
`TenantCustomPage.tsx:1218-1223, 2703`), `customFieldsBlock`, `alert` (kur uyarıları), `text`.

Eksikler:

- **G-SQ1 Satır hesapları ve canlı toplamlar.** `eksik`. Izgarada hesaplanan sütun yok: hücre türleri yalnız text /
  number / date / checkbox / lookup (`custom-page/gridState.ts:15, 21-22`). Bağlamalarda aritmetik yok: yalnız yol çözümü
  ve metin yerleştirme (`pageBindings.ts:11-56`). Gösterge ve tablo toplamı da yok (`MetricCard`/`DataTableGrid`/`countWhen`
  içinde toplama bulunamadı). Ara toplam, iskonto, KDV, satır toplamı, KDV oranı kırılımı ve genel toplam
  **kayıttan önce görünmez**. `metric` yalnız sorgu satırı sayar (`countWhen`) ya da tek bir bağlama değerini yazar
  (`TenantCustomPage.tsx:988-1010`). Öneri: sunucuda yan etkisiz bir `POST /api/sales/quotes/calculate` uç noktası (aynı
  `Calculate` + kur çözümü) ve `satis.teklif.hesapla` işlemi. POST ile okuma işlemi katalogda örneklidir (`rapor.*`,
  `ErpOperationCatalog.cs:188`). Bunun sonuçları ızgara değişince yeniden çalışan sorguyla
  toplam bölümüne bağlanır (ızgara satırlarını sorgu parametresine bağlamanın mümkün olup olmadığı **doğrulanmalı**). Bu da
  olmazsa `fark`: toplamlar ancak kayıttan sonra detayda görünür.
- **G-SQ2 Stok seçiminin kardeş hücreleri doldurması.** `eksik`. Eski ekran stok seçince birimi, fiyatı, iskontoyu,
  KDV'yi ve dövizi doldurur (`:3107-3121`). Motorda seçim hücresi yalnız kendi değerini yazar (`TenantCustomPage.tsx:2768-2771`,
  `gridState.ts:184-193`). Kullanıcı fiyatı ve KDV'yi elle girmek zorunda kalır. Öneri: sütun kuralı olarak
  `fillFrom:<seçenekSütunu>` (seçilen seçenek satırından kopya).
- **G-SQ3 Düzenleme ve revizyonda satırların ön doldurulması.** `eksik`. `list` kipi satırları her zaman boş başlar ve
  sıfırlamada temizlenir (`gridState.ts:213-220`). `stage` kipinde kaynak satırlar salt okunurdur (`gridState.ts:186`,
  `EditableGrid.tsx:24-26, 88-101`). Düzenle, Revizyon oluştur ve Talepten teklif satırları getiremez. Öneri: `list` kipine
  `sourceQuery` (ör. `satis.teklif.satirlari`) ile düzenlenebilir başlangıç satırları. O zamana kadar bu üç giriş
  `fark` olarak "eski ekranda aç"a bırakılmalıdır.
- **G-SQ4 Sütun sayısı.** `fark`. Eski ızgara 14 sütundur, motor en çok 12 kabul eder (`gridState.ts:38`). Hesaplanan dört
  sütun düşünce (G-SQ1) 9 giriş sütunu kalır (stok, miktar, birim, fiyat, döviz, kur, iskonto %, KDV %, KDV dahil). Sığar.
- **G-SQ5 Kur ve döviz.** `fark`. Kur sütunu boş bırakılırsa sunucu teklif tarihinin kurunu kullanır
  (`Program.cs:3656-3657`). Bu yüzden kur sütunu isteğe bağlı tutulabilir. Kaybolanlar: "1 USD = … TRY" ipucu, kur
  yüklenirken ya da eksikken kaydın kilitlenmesi (sunucu 400 verir), döviz değişince kurun temizlenmesi (`clearsOnChange`
  ızgara içi hücreler için **doğrulanmalı**), aynı dövizde kur kutusunun 1'e kilitlenmesi. Kayıtlı caride döviz alanı yoktur.
  Sistem sayfasında `currencyCode` seçilen carinin `currencyCode`'una bağlanmalıdır (lookup seçenek satırı bağlaması
  **doğrulanmalı**).
- **G-SQ6 Kayıtlı / kayıtsız alıcı geçişi.** `fark`. Onay kutusu iki farklı alan kümesi gösterir ve değişince müşteriyi
  ve adı temizler (`:2966-2971`). `visibleWhen` + `clearsOnChange` ile kurulabilir. Gövdede ilgisiz alanın `null`
  gitmesi (`customerId` ya da `prospectCustomerName`) sunucu için şarttır: ikisi birden gelirse ad yok sayılır, ama
  `customerId` boş GUID ise 400 olur. Bağlanmayan parametrenin gövdeden çıkarıldığı **doğrulanmalı**.
- **G-SQ7 Teklif numarası.** `fark` (olumlu). Eski ekran istemcide `T-YYYY-NNNN` üretir; çakışma riski vardır. Sistem
  sayfasında `code` boş bırakılıp sunucu numaralandırması kullanılmalı. Ancak sözleşmede `Code` `string` (null olamaz)
  ve PUT'ta zorunludur (`Program.cs:3724`). `BodyParameters` bunu `required` sayar. `olustur` için `required` kaldırılmalı.
- **G-SQ8 Durum koşullu komutlar.** `fark`. `moreButtons` + `visibleWhen`/`disabledWhen` (`status`, `hasSalesOrder`)
  yeterli. Ancak "Revizyon oluştur" koşulu "**en güncel revizyon**" (`:1960-1961`) liste satırında bulunmaz; revizyon
  listesinin son satırı ile karşılaştırma bağlaması gerekir (`{{revizyonlar.rows[-1].id}}` desteklenmiyor olabilir,
  **doğrulanmalı**). Alternatif: sunucu özetine `isLatestRevision` alanı.
- **G-SQ9 Müşteri seçici kaynağı.** `fark`. Eski seçici iki sorguyu (`Customer` + `Both`) birleştirir ve `Dealer`'ı hiç
  göstermez (`:150-156, 10847-10848`), oysa sunucu `Dealer`'ı kabul eder. Tek `cari.listele` sorgusu tek `type` alır.
  Öneri: `cari.musteriSecenekleri` (sunucuda `type in (Customer, Both, Dealer)`, aktif). Bu bir yeni uç noktası ya da
  `type` için çoklu değer desteği ister.
- **G-SQ10 Siparişe geçiş ve sipariş penceresi.** `eksik`. Dönüştürmeden sonra `sales-orders`'a gidilir ama sipariş açılmaz.
  Liste hücresi ve detay zinciri `SalesOrderModal`'ı açar (`:1820, 3286, 3347`). Sistem sayfasında `erpPage
  sales-orders` + sipariş kimliği parametresi gerekir; sipariş ekranı sayfa parametresini okumuyor (cari envanteri G-C12 ile
  aynı kök neden).
- **G-SQ11 Talepten teklif ve cariden teklif girişleri.** `eksik`. İkisi de `sessionStorage` + olay ile taşınır
  (`:201-229, 859-866`, `sales-customer-requests/types.ts:55`). Sistem sayfası sayfa parametresi (`customerId`,
  `salesRequestId`) okumalı, gönderen ekranlar da onu yazmalıdır. Talepten satır ön doldurma ayrıca G-SQ3'e takılır.
- **G-SQ12 Satır koşullu izinde `allowed`.** `eksik` (cari G-C3 ile aynı). `erp.sales-quotes` listesi durum ve cari
  öznitelikli kurallarla süzülür. Satır koşullu `execute`/`update` kuralı olan TenantUser'da katalog kaydı yanlış
  negatif verebilir; İlet / Kabul / Reddet / Düzenle nedenli pasif kalabilir. Taşımadan önce test edilmeli.
- **G-SQ13 PDF yazdırma ve şablon tasarımı.** `eksik`. HTML istemcide üretilir ve iframe ile yazdırılır
  (`SalesQuotePdfTools.tsx:47-65, 143`). Motorda karşılığı yok. Öneri: v1'de "Yazdır" eski bileşeni açan köprü
  (`onOpenLegacy` benzeri), ya da sunucu tarafı PDF/HTML uç noktası.
- **G-SQ14 Detay görünümü.** `fark`. Kutucuklar (`metric`), sekmeler (`tabs`), satır tablosu (`dataTable` ←
  `satis.teklif.satirlari`), revizyon tablosu ve özel alan formu (`customFieldsBlock` + `satis.teklif.ozelAlanKaydet`)
  kurulabilir. Kaybolanlar: "N gün kaldı / Bugün sona eriyor / Süresi doldu" (tarih farkı aritmetiği, G-SQ1 ile aynı kök);
  yabancı dövizli satır varsa **koşullu** "Döviz fiyatı / Kur" sütunları (`:3254-3256, 3393-3394`); KDV oranına göre
  matrah kırılımı; "Tutar = ara − iskonto" hesaplanan sütunu (sunucu `lineTotal` KDV dahil döner, farklı bir değerdir).
- **G-SQ15 Sayfa toplamı kartı.** `eksik`. "Teklif tutarı" sayfadaki `grandTotal`'ları tek dövizdeyse toplar
  (`SalesListFooter.tsx:48-53`). Motorda toplama yok (G-SQ1). `fark`: kart düşer ya da sunucu özetine sayfa veya
  süzgeç toplamı eklenir.
- **G-SQ16 Tarih aralığı süzgeci.** `fark` (doğrulanmalı). `filterBar` `date` türünde `param` verilince türü metne çevirir
  (`filterBarModel.ts:62, 101`). Parametresiz `date` süzgecinin `{min, max}` değeri kapsamda `<anahtar>.min/.max` olarak
  durur (`filterBarModel.ts:205-212`). Bunun sorgu parametrelerine `dateFrom`/`dateTo` olarak bağlanıp bağlanamadığı **doğrulanmalı**. Olmazsa
  iki ayrı `date` girişi gerekir.
- **G-SQ17 Kart tıklamasıyla süzme.** `fark`. "Yanıt bekleyen" kartı durum süzgecini aç/kapa yapar (`:2053-2054`).
  `metric`'in `filterInput` / `filterValue` özellikleri bir **`input`** bileşenini aç/kapa yapar (`TenantCustomPage.tsx:994-1001`).
  Durum süzgeci `filterBar` içindeyse bu bağ kurulamaz (doğrulanmalı). Durum ayrı bir `input` olursa eşdeğerdir.
- **G-SQ18 Teklif alanları penceresi.** `fark` / v1 dışı. Tanım ekleme TenantAdmin **veya** TenantDeveloper ister,
  zorunluluk ve devre dışı bırakma yalnız TenantAdmin (cari G-C21 / G-K1 ile aynı). v1: "Eski ekranda aç".
- **G-SQ19 Izgara klavyesi ve Ctrl+Shift+Enter.** Doğrulanmalı. ↑↓ / Boşluk / Enter / çift tık listede, Ctrl+Shift+Enter
  kart ızgarasında (`App.tsx` `[data-line-add-shortcut]`, `salesDocumentForm.tsx:9-13`). `EditableGrid`'in "Satır ekle"
  düğmesinde bu öznitelik yok (`EditableGrid.tsx:120`). `fark`.

### 1.7 Görünüm anahtarları

- `sales-quotes` → `code`, `customerName`, `salesperson`, `salesOrderCode`, `quoteDate`, `validUntil`, `lineCount`,
  `grandTotal`, `status`, `actions` (sabit) (`TenantScreenViewEndpoints.cs:253-260, 677, 1161-1165`). Eşleme: `salesperson →
  salespersonName`, diğerleri bire bir. `actions` aktarılmaz. `code` hücresi `({revisionNumber})` ekini taşır;
  `revisionNumber` ayrı sütun olarak eklenmelidir (katalogda yok). Kiracı genişlikleri `screenViewGridDefaults` ile
  uygulanır (`SalesDocumentGrid.tsx:84`).
- Özel alan sütunu yok, bu bir eksik değildir: teklif liste yanıtında özel alan map'i yoktur (`PlatformContracts.cs:232-235`),
  kiracı görünümü de `custom:` alanı sunmaz (`TenantScreenViewEndpoints.cs:253-260`).
- `sales-quote-create` kartı ve teklif satırları için görünüm anahtarı **yok**. Detaydaki satır tablosu sabittir.

### 1.8 Kaybolması kolay davranışlar ve riskler

- **Arama sonucu istemcide yeniden süzülür.** Sunucu müşteri **kodu** ve kayıtsız alıcı adında da arar (`Program.cs:3520`).
  İstemci dönen sayfayı yalnız kod ve müşteri adına göre süzer (`:1757-1764`). Cari koduyla aramada satırlar kaybolur, başlık
  sayacı ve "Gösterilen x / y" çelişir. Sistem sayfası bunu kendiliğinden düzeltir (`fark`, olumlu); testlerde beklenti
  değişebilir.
- **"Süresi doldu" çipi büyük olasılıkla boş döner** (1.3). Durum yazılmıyor. Süresi geçmiş `Sent` teklif kabul
  edilemez, ama listede `warn` "İletildi" olarak görünür.
- **Detayda plasiyer ve sipariş kodu boş.** `SalesQuoteView`'da `SalespersonName`, `SalesOrderId` ve `SalesOrderCode` yok
  (`PlatformContracts.cs:226-231`). Ekran bunları `SalesQuoteSummary` tipinden bekler (`erp-types.ts:50, 56`). Detayda
  Plasiyer her zaman "—" görünür, Sipariş kutucuğu kod yerine "Oluşturuldu" der, zincirde sipariş adımı çıkmaz
  (`:3285-3287, 3296, 3342-3352`). Panelde plasiyer ve sipariş **satırdan** geldiği için doğrudur. Sistem sayfası
  `getir` sonucunu kullanırsa aynı eksik taşınır. Öneri: görünüme bu üç alanı eklemek.
- **Değer geçmişi ve geri yükleme arayüzü ulaşılamaz.** `loadQuoteFieldHistory` yalnız geri yüklemenin içinden çağrılır
  (`:1576-1614`). Paneli açan bir düğme yok. Tanım geçmişi ve geri yükleme uç noktaları da hiç çağrılmaz. Taşımada
  "mevcut özellik" sayılmamalıdır.
- **Kayıtsız alıcı revizyonu.** `beginQuoteRevision` `openQuoteCreatePage`'in sıfırladığı `isProspectQuote` ve
  `prospectCustomerName`'i geri koymaz (`:1522-1551`). Kayıtsız alıcılı teklifin revizyonu istemcide "Müşteri seçin veya
  kayıtsız alıcı seçeneğini açın." ile durur. Kullanıcı kutuyu açıp adı **aynen** yazarsa sunucu kabul eder
  (`Program.cs:3605-3607`). Revizyonda döviz de cari değil `source.currencyCode`'dur.
- **Kabul yan etkisi:** kayıtsız alıcılı teklif kabul edilince sessizce `CUS-…` kodlu cari kartı açılır. Ekran bunu
  bildirmez. Sistem sayfasında da onay metninde belirtilmeli.
- **Eski kur korunur.** Düzenleme ve revizyon satırlarına kayıtlı kur **elle girilmiş** gibi yüklenir
  (`exchangeRateOverride`, `:1406, 1544`). Tarih değişse de kur güncellenmez. Yeni kur için döviz yeniden seçilmelidir.
- **Talepten fiyat** yalnız ilk 100 stok kartından alınır (`:840`). 100'ün dışındaki kartın fiyatı 0, KDV'si 20 olur.
- **Toplu `Promise.all` kırılganlığı.** Liste depoları (`/api/warehouses/`), kart personeli (`/api/hr/employees/`) aynı
  çağrıda yükler. `erp.warehouses.read` ya da `erp.human-resources.read` izni olmayan kullanıcıda **liste veya kart hiç
  açılmaz** (`:573-592, 794-806`). Sistem sayfasında bu çağrılar ayrı ve isteğe bağlı olmalıdır (iyileşme).
- **Kart ekranı listeyi de yükler** (`activeTab="quotes"`, `:679-699`): gereksiz iki çağrı. Taşımada düşer.
- **Silme sonrası** `notifySalesChanged` çağrılmaz (`:1641-1666`). Diğer sekmelerdeki listeler eski kalır. Gönderme, karar ve
  dönüştürme çağırır.
- **Onaysız geçişler.** İlet, Kabul, Reddet ve Siparişe dönüştür onay sormaz. Dönüştürme ve kabul geri alınamaz. Sistem
  sayfasında `confirmEnabled` eklemek iyileşmedir (`fark`, olumlu); kararla yazılmalıdır.
- **Liste menüsü ile detay menüsü farklı.** "Reddedilen teklifi kabul et" ve "Revizyon oluştur" yalnız detayda
  (`:1978-1983`), "Sipariş oluştur" listede ve "Siparişe dönüştür" detayda: aynı eylemin iki adı var.
- **Esc iki iş yapar:** detay açıkken pencere düzeyinde dinleyici önce PDF penceresini, sonra detayı kapatır (`:374-388`).
- **Kuruş farkı:** birim çevrimli satırlarda istemci önizlemesi ile kaydedilen tutar farklı olabilir (1.1 satır hesabı).
- **PDF okuması yazar.** Şablonu olmayan firmada ilk `GET` iki şablon oluşturur (`SalesQuotePdfTemplateEndpoints.cs:20-28`).
  Salt okuma işlemi olarak kataloğa alınırsa bu yan etki bilinmelidir. PDF'te durum **ham İngilizce** (`Draft`) ve tarihler
  `yyyy-aa-gg` yazılır (`SalesQuotePdfTools.tsx:64`).
- **Eski revizyonların bağımsızlığı.** Revizyon kaynağı kapatmaz; eski `Sent` revizyon kabul edilip siparişe
  dönüştürülebilir. Sistem sayfası bu durumu gizlememelidir (belki iyileşme: eski revizyonda geçişleri kapatmak).
- **Testler** (`sales/salesActionBar.test.tsx:177, 200`, `sales/salesDocumentForms.test.tsx:123, 145, 360`,
  `sales/salesDocuments.test.tsx:267`, `sales/salesLists.test.tsx:393`) Türkçe etiketleri, gövde biçimini ve KDV oranı
  kırılımını doğrular. Sistem sayfasına geçişte bunların eşdeğerleri sözleşme testlerine (fixture) taşınmalıdır.

---

## 2. Satış Siparişleri (`sales-orders`, `sales-order-create`)

Kaynak: kod okuması, 2026-11-21, `origin/master` `7bc6deda`. Yönlendirici `WorkspacePageRouter.tsx:364-366`. İki anahtar da
`SalesOrdersPage` → `SalesOrdersPageContent` → `SalesPage section="sales-orders"` zincirini açar
(`SalesOrdersPage.tsx:6-8`, `sales-orders/components/SalesOrdersPageContent.tsx:6-8`). `sales-order-create` ayrıca
`createOrderPage` bayrağını verir. Dosya adı yazılmayan frontend satırları `SalesPage.tsx`, sunucu satırları `Program.cs`
içindir. `SalesOrderEndpoints.cs` ayrıca adıyla anılır.

- **Tek bileşen, üç ekran.** `orderListScreen = activeTab === "orders" && !createQuotePage && !createOrderPage` (`:1897`)
  listeyi çizer. `createOrderPage` ise oluşturma/düzenleme formunu çizer (`:2698-2914`). Listeden açılan sipariş detayı ayrı
  bir belge yüzeyidir: `SalesOrderModal` (`:3638-3653`, bileşen `:9528-10450`). Detay açıkken işlem çubuğunu detay alır
  (`ownsActionBar`, `:1928-1929, 9915-9950`).
- **Menü:** `sales-orders` standart menüde var (`StandardMenuEndpoints.cs:18`). `sales-order-create` menüde **yok**. Modül
  menüsünde `sales-orders`'a bağlıdır (`shell/moduleMenus.ts:19, 77`). Sekme etiketi her zaman "Yeni Sipariş"tir, düzenleme
  modunda da (`useWorkspaceTabs.ts:39`, `workspace-storage.ts:51`).
- **Yönlendirici bağlamı:** `salesPageProps` (`WorkspacePageRouter.tsx:218-226`) içindeki `onNavigate`,
  `initialInvoiceId` ve `onInitialInvoiceOpened` sistem sayfasına ulaşmaz (bkz. 0, G-C13). Sipariş detayından fatura
  açmak bugün sayfanın içindeki `SalesInvoiceModal` ile yapılır (`:3655-3664`).

### 2.1 Yerleşim

#### 2.1.1 Liste (`sales-orders`)

- **Başlık:** `ListPageHeader`. Başlık "Satış Siparişleri", açıklama "Bağımsız veya kabul edilen tekliflerden oluşan
  siparişleri ve sevkiyat süreçlerini yönetin.", sayaç sunucu `totalCount` (`salesListTotal`) (`:2185-2203`). Başlık ve
  açıklama sabittir. Kiracı görünümünde `pageSettings` **yoktur** (cariden farkı budur).
- **Özet kartları** (`:2059-2079`, `amountCard` `:2031-2037`; ikisi de **yalnız yüklü sayfayı** sayar ve süzmez):

| Kart | Değer | Ton / ipucu |
|---|---|---|
| Sipariş tutarı | `pageAmount`: iptal dışı satırların `grandTotal` toplamı. Yalnız tek döviz varsa yazılır, yoksa "—" (`sales/components/SalesListFooter.tsx:43-58`) | ipucu "bu sayfa · iptaller hariç". Birden çok döviz varsa "· birden çok para birimi" eklenir. Simge `CircleDollarSign`. |
| Sevk bekleyen | `status === "Open"` satır sayısı | `warn`, "bu sayfa", simge `Truck` |

  Yüklenirken iki kart da "—" gösterir (`:2034, 2038`).
- **Uyarı / bildirim şeritleri:** hata ve bildirim, ikisi de kapatılabilir. Oluşturma sayfasında gizlenirler, form
  kendi hata kutusunu kullanır (`:2220-2235`).
- **İşlem çubuğu** (liste; `:1941-2025`; kısayollar `commands/shortcuts.ts:6-16`, İşlemler Alt+İ):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | `onNavigate("sales-order-create")` (`:1953-1954`). Liste içinde "Yeni sipariş" düğmesi yoktur (`salesActionBar.test.tsx:256-266`). |
| Aç | Enter | Odaklı satır (`focusedRecordId`, `commands/gridCommands.ts:9-13`), yoksa seçili satır, yoksa tek işaretli satır. Hiçbiri yoksa nedenli pasif: "Önce bir kayıt seçin". Detayı açar (`openOrder`, `:1989-1996, 1715-1724`). |
| Sil | Ctrl+Delete | **Yalnız TenantAdmin'e görünür.** Seçim yoksa "Önce bir kayıt seçin". Sipariş için **durum koşulu yoktur**; karar sunucudadır (`:1997-2005`). Onay sorulur: "Sipariş silinsin mi? … siparişi ve özel alan geçmişi silinecek." (`:1725-1752`). Silinen son satırsa bir önceki sayfaya döner. |
| Dışa aktar (Excel) | Ctrl+E | Izgaranın XLSX dışa aktarımı (`hideExport` ile ızgara düğmesi gizli; `exportActionsRef`, `:2373-2374`). Yalnız görünen sayfa. |
| İşlemler → Sipariş alanları | | Yalnız TenantAdmin/TenantDeveloper. Alan tanımları penceresi (`:2018-2023`, pencere `:2558-2697`). |
| İşlemler → CSV olarak dışa aktar | | `csvExportCommand` (`:2024`, `commands/gridCommands.ts:15-17`). |
| Yenile | F5 | Araç çubuğunun Yenile'si `load()` çağırır (`:2215`). |

  Satır menüsü (`⋯`, `actions` sütunu; `:1873-1887`, `sales/components/SalesRowActionsMenu.tsx`): **Detay**, **Düzenle**
  (yalnız `status === "Open"`; `sessionStorage["nexora.sales-order.edit-id"] = id` + `onNavigate("sales-order-create")`) ve
  **Sil** (yalnız TenantAdmin; `busy` iken pasif). Düzenle'nin çubuk karşılığı **yoktur**; bu bilinçli bir karardır
  (`salesLists.test.tsx:408`). Teklif listesinde satır menüsü çubuğa taşınmıştır, siparişte taşınmamıştır (`:1772, 2006-2017`).
- **Süzgeç çubuğu** (`sales/components/SalesListToolbar.tsx:44-90`): yalnız **arama** vardır. Etiket ve yer tutucu "Sipariş
  no veya müşteriyle ara" (`:23-27`). Durum ya da tarih süzgeci yoktur; bunlar yalnız teklif listesine çizilir (`:58-87`).
  Arama sunucuya `q` olarak **250 ms** gecikmeyle gider ve sayfayı 1'e alır (`:665-686`). Sunucu `Code`, kaynak teklif
  `Code` ve `Customer.Name` içinde `Contains` arar (`:4283`). İstemci, gelen sayfayı **aynı metinle bir kez daha** süzer
  (`filteredOrders`, `:1765-1771`). Ayrıca Yenile, sütun/pivot araç yuvası (`toolsSlotRef`) ve detay paneli anahtarı
  (`SalesListPanelToggle`, Ctrl+.) vardır (`:2204-2217`).
- **Liste sütunları** (varsayılan `:271-286`; sunucu görünümü `sales-orders`, `TenantScreenViewEndpoints.cs:240-245`;
  hücreler `:1840-1890`; genişlikler `sales/components/salesListCells.tsx:30-32`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Sipariş no | mono bağlantı düğmesi. Tık = satırı seç + detayı aç (`aria-haspopup="dialog"`) |
| `quoteCode` | Kaynak teklif | düz metin. Bağımsız siparişte sunucu **"Bağımsız"** metnini döner (`:4286`, `SalesOrderEndpoints.cs:151`) |
| `customerName` | Müşteri | kalın |
| `orderDate` | Sipariş tarihi | `gg.aa.yyyy` (dize çevrimi) |
| `lineCount` | Satır | sayı, sağa yaslı (`SALES_NUMBER_FIELDS`) |
| `grandTotal` | Genel toplam | `listAmount`: tr-TR 2 ondalık + döviz kodu (`salesListCells.tsx:5-11`) |
| `status` | Durum | `StatusTag`: Açık → `warn`, Tamamlandı → `ok`, İptal → `off` (`sales/salesListStatus.ts:36-41`, `document-page/documentStatus.ts:32-39`) |
| `actions` | İşlemler | sabit alan; `⋯` menüsü olarak **çizilir** (cariden farklı; görünür olmasa da her zaman eklenir, `:1776-1784`) |

  Liste yanıtında olup varsayılan görünümde olmayan alanlar: `requestedDeliveryDate`, `salespersonEmployeeId`,
  `currencyCode`, `createdAt`, `quoteId`, `customerId` (`PlatformContracts.cs:240-242`). Özel alan değerleri liste
  yanıtında **yoktur**.
- **Izgara:** `SalesDocumentGrid`. İşaret sütunu vardır; tık = geçerli satır (detay açılmaz); ↑↓ gezinme, Boşluk işaretleme,
  çift tık / Enter = aç. Toplu eylem "Excel (seçilenler)" (`:2160-2171`, `sales/components/SalesDocumentGrid.tsx:100-110,
  134-180`). Sunucu sayfalama 25 (`externalPagination`). Liste ilk satırı kendisi seçmez (`:1899-1900`).
- **Boş durumlar** (`:2377-2382`): "Siparişler yükleniyor…", "Henüz satış siparişi yok. Yeni sipariş oluşturabilir veya
  kabul edilen bir teklifi dönüştürebilirsiniz.", "Aramanızla eşleşen sipariş yok."
- **Alt bilgi** (`sales/components/SalesListFooter.tsx:19-37`): işaretli sayısı, "Gösterilen x / y", sayfalama, ipuçları
  "↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç · Ctrl+. detay paneli".
- **Detay paneli** (`OrderListPanel`, `sales/components/SalesListPanels.tsx:148-179`; boşken "Özetini görmek için listeden bir
  sipariş seçin.", `:88-99`). Panel açıkken ve geçerli satır 150 ms durduktan sonra `GET /api/sales/orders/{id}` yapılır.
  Bırakılan satırın geç gelen yanıtı atılır (`sales/useSalesListPanel.ts:23-45`). Satırın liste verisi değişince yeniden
  okunur (`reloadKey`, `:1921-1927`). İçerik:
  - Üst: kod, müşteri, durum etiketi, "Aç", kapat.
  - Sekmeler "Özet" / "Satırlar" (`SUMMARY_TABS`). Sekme, satır değişince korunur (`SalesListPanels.tsx:58-60`).
  - Özet: Genel toplam, Ara toplam, İskonto, KDV (`amounts`, `:102-111`); Sipariş tarihi, Teslim tarihi; zincir (kaynak teklif
    → bu sipariş); ilk satırlardan önizleme ve "tümünü gör".
  - Zincir düğümü `row.quoteCode` doluysa eklenir (`:161`). Bağımsız siparişte değer "Bağımsız" olduğundan zincirde
    **"Bağımsız · Satış teklifi"** düğümü görünür (bkz. G-SO20).
- **Pencere:** *Sipariş alan tanımları* (`:2558-2697`). Liste kod · tür · "zorunlu" · `v{version}` biçimindedir. Düzenleme
  ve devre dışı bırakma **yoktur**. Altında TenantAdmin/TenantDeveloper için yeni tanım formu bulunur: kod (büyük harfe
  çevrilir), etiket, tür (Text/Decimal/Date/Boolean), Text için uzunluk, ve yalnız TenantAdmin'e "Bu alanı zorunlu yap"
  (`:1214-1250, 2599-2689`).

#### 2.1.2 Sipariş detayı (`SalesOrderModal`, `:9528-10450`)

- **Belge yüzeyi** (`DocumentSurface variant="detail"`, `:9952-9991`): başlık "Satış siparişi", kod, alt başlık müşteri, durum
  rozeti (`salesOrderStatus`), meta sipariş tarihi. Durum akışı Açık → Tamamlandı; İptal akış dışı son durumdur
  (`sales/salesDocumentDetail.tsx:47-55`). Kapat ve Esc listeye döner (`:376-389`). Alt bilgi satır sayısı ve genel
  toplamdır (`SalesFooterStatus`). İpucu "Alt+İ işlemler" (`salesDocumentDetail.tsx:172`).
- **Belge zinciri** (sağ bağlam, `:9962-9988`): kaynak teklif (`quoteCode` doluysa; "Bağımsız" sorunu burada da vardır),
  bu sipariş, her irsaliye (kod, tarih, durum) ve her **faturalanmış** irsaliyenin faturası. Faturanın kodu yoktur, yalnız
  durumu vardır; tıklanınca `onInvoiceCreated` faturayı açar.
- **İşlem çubuğu** (detay; `:9915-9950`): Yenile = `onReload` (siparişi yeniden okur). Süz ve Dışa aktar "Belge açıkken
  kullanılamaz" nedeniyle pasiftir (`commands/PageCommandsSlot.tsx:20-27`). Yeni, listenin Yeni'sidir.

| İşlemler öğesi | Koşul | Davranış |
|---|---|---|
| Stok ayır | `Open` ve aktif rezervasyon yok | Bilgi sekmesine geçer, ilk aktif depoyu seçer, yeni `requestId` üretir, rezervasyon formunu açar |
| Rezervasyonu bırak | `Open` + aktif rezervasyon + **TenantAdmin** | gerekçe istemi (zorunlu, çok satırlı) + onay "Stok rezervasyonu bırakılsın mı?" (`:9796-9834`) |
| İrsaliye oluştur | `Open` | nedenli pasif: "Kaydediliyor…", "Aktif depo yok.", "Sevk edilecek kalan miktar yok.". İrsaliye sekmesine geçer, `startDelivery` (`:9730-9772`) |

  Sil, Düzenle, İptal ve Kapat komutları **yoktur** (`salesActionBar.test.tsx:269-279`).
- **Sekmeler** (`DetailTabs`, `:10007-10015`): "Sipariş Bilgileri" ve "İrsaliye Geçmişi" (irsaliye sayılı).
- **Sipariş Bilgileri sekmesi:**
  - Üst bilgi ızgarası (`:10018-10027`): Sipariş tarihi, İstenen teslim tarihi, Para birimi, Kaynak teklif ("—" yalnız
    boşsa; bağımsızda "Bağımsız"). Plasiyer **gösterilmez** (`salespersonEmployeeId` gelir ama çizilmez).
  - **Teslim tarihi formu** (yalnız `Open`; `:10028-10055`): tarih (`min = orderDate`), not "MRP, açık sipariş talebini bu
    tarihte karşılamaya çalışır.", "Teslim tarihini kaydet". Başarıda bildirim "… MRP bu tarihi ihtiyaç tarihi olarak
    kullanacak." (`:9667-9692`).
  - **Özel alanlar formu** (yalnız `order.customFields.length > 0`; `:10056-10133`): türe göre denetim (Boolean = Seçin/Evet/
    Hayır seçimi, Decimal = sayı, Date = tarih, Text = `maxLength`). `Open` değilse değer salt metindir ("—"), not "Sipariş
    kapanınca kilitlenir.". `Open` iken "Değerleri kaydet" ve sabit not "Tekliften eşleşen kodlu alan değerleri taşındı."
    gösterilir (`:9693-9711`).
  - **Rezervasyon formu** (`reservationEditor`; `:10134-10158`): aranabilir aktif depo seçici (zorunlu), açıklama "Siparişin
    teslim edilmemiş ürün miktarları seçilen depoda rezerve edilir.", not "Bu işlem stok hareketi oluşturmaz.", Vazgeç /
    "Stok ayır" (depo yoksa pasif) (`:9773-9795`). **Satır seçimi yoktur**: kalan miktarın tamamı tek depoda ayrılır.
  - **Satır ızgarası** (`AdvancedDataGrid gridId="sales-order-lines"`; varsayılan alanlar `:9554-9574`; görünüm
    `sales-order-lines`; `:10159-10222`; seçim yok):

| Alan | Etiket | Gösterim |
|---|---|---|
| `stockCode` / `stockName` | Stok kodu / Stok adı | metin |
| `quantity` | Sipariş miktarı | "miktar birim" (≤ 4 ondalık, **temel birim**) |
| `deliveredQuantity` | Teslim edilen | sayı |
| `remainingQuantity` | Kalan miktar | **kalın** sayı (kısmi sevk göstergesi) |
| `reservedQuantity` | Rezerve | "miktar · depo adı", 0 ise boş |
| `unitPrice` | Birim fiyat | `enteredUnitPrice` + `enteredCurrencyCode`. Girilen döviz sipariş dövizinden farklıysa altına "Kur x · birim fiyat SİPARİŞ_DÖVİZİ" yazılır (`:10198-10211`) |
| `lineTotal` | Satır toplamı | 2 ondalık |

    Sayısal sütunlar sağa yaslıdır (`ORDER_NUMBER_FIELDS`, `:10454`). İskonto %, KDV %, KDV dahil bayrağı, ara toplam ve
    satır KDV tutarı yanıtta vardır ama **sütun değildir**.
  - **Toplamlar** (`DetailLinesFooter`, `:10224-10233`; `sales/salesDocumentDetail.tsx:118-140`): Ara toplam, Toplam iskonto
    (> 0 ise eksi ve vurgulu), Toplam KDV, KDV oranına göre "KDV %x · matrah y" satırları. Bunlar satırlardan gruplanır;
    toplamlar belge toplamıyla tutmazsa gruplama bırakılır (`vatByRate`, `salesDocuments.test.tsx:210`). En altta Genel
    toplam. Hepsi sunucu değeridir.
- **İrsaliye Geçmişi sekmesi:**
  - **İrsaliye alt formu** (`RecordFormPage variant="dialog" ownSave`; `:10240-10362`): kendi "İrsaliye oluştur" düğmesi
    vardır, çubuğun Kaydet'i bu formu kaydetmez (`salesDocuments.test.tsx:325`). Depo yoksa nedenli pasif: "Kaydetmek için
    depo seçin.".
    - Sevk Bilgileri: Depo * (aktif depolar; değişince konumlar yeniden yüklenir ve konum seçimleri sıfırlanır), Sevk tarihi *
      (varsayılan bugün).
    - Teslim Edilecek Kalemler: yalnız `remainingQuantity > 0` satırlar. Her satırda "stok kodu / adı · siparişte kalan x
      birim", **teslim birimi** seçimi (temel birim + stokun aktif çevrimleri), **miktar** ve **konum** ("Depo düzeyinde" +
      deponun aktif konumları; depo yoksa pasif) bulunur.
    - Varsayılanlar (`startDelivery`, `:9730-9772`): depo = rezervasyon deposu, yoksa ilk aktif depo. Miktar = rezervasyonlu
      satırda `min(kalan, rezerve)`, diğerlerinde kalan. Birim = temel birim. Her açılışta yeni `requestId` üretilir. Birim
      listeleri her satır için `GET /api/stock/items/{id}/units` ile okunur; biri bile hata verirse form **açılmaz**.
    - Gönderim yalnız miktarı > 0 olan satırları içerir. Hiç yoksa "En az bir satır için teslim miktarı girin."
      (`:9835-9868`).
  - **İrsaliyeler bölümü** (`DetailSection`, `:10363-10446`): başlık eylemleri "Rezervasyonu bırak" (TenantAdmin) ve
    "İrsaliye oluştur" (birincil; `Open`, depo yok ya da tüm kalan 0 ise pasif). Bu ikisi çubuktaki komutların kopyasıdır.
  - Satırlar: kod, "tarih · depo · N satır", rozet "Sevk edildi"/"İptal". Satır eylemleri:
    - **Fatura kes** (`Posted` + faturasız; onay yok; `:9869-9888`).
    - **Faturayı aç** (`invoiceId` varsa).
    - **İptal et** (`Posted` ve fatura `Posted` değilse; onay "İrsaliye iptal edilsin mi? … Stok hareketi ters
      kaydedilecek.", `:9889-9914`).
  - Boş durumlar: "İrsaliyeler yükleniyor…", "Henüz irsaliye oluşturulmadı."

#### 2.1.3 Oluşturma / düzenleme (`sales-order-create`, `:2698-2914`)

- **Kayıt formu** (`RecordFormPage`, belge görünümü; `:2699-2741`): tür "Satış siparişi", kod, taraf (müşteri adı), durum
  akışı (yeni kayıtta **geçerli adım yok**, düzenlemede Açık; `:2705-2706`, `salesDocumentForms.test.tsx:389`). Başlık
  "Yeni Sipariş" / "Sipariş Düzenleme", kaydet etiketi "Sipariş oluştur" / "Siparişi kaydet". Kaydet çubuktaki Ctrl+S'dir.
  `RecordFormPage` İşlemler'e "Kaydet ve Yeni" (Ctrl+F2) ve "Temizle" ekler (`record-form/RecordForm.tsx:121-127, 189`).
  Siparişin `onSubmit`'i bu ayrımı yapmaz; her kayıt listeye döner (`:1153`).
- **Yeni (F2):** form kirliyse "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?" sorulur. Sonra `edit-id` silinir ve
  form sıfırlanır (`:1943-1950`, `commands/PageCommandsSlot.tsx:30-37`). Esc kirli formda sorar
  (`salesDocumentForms.test.tsx:173-180`).
- **Kaydet engeli:** kurlar yükleniyorsa "Döviz kurları yükleniyor…", kuru bulunmayan satır varsa "Kuru bulunmayan satır
  var; sipariş kaydedilemez." (`saveDisabledReason`, `:2714-2728`; durum şeridi `:2732-2740`). Şeritte ayrıca "Satır: N"
  ve kayıt bildirimi gösterilir.
- **Belge bilgileri** (`:2742-2808`):

| Alan | Kural |
|---|---|
| Sipariş no * | `maxLength 40`. Varsayılan `S-YYYYMMDD-NNNN` (`Date.now()`'ın son 4 hanesi, `:953-955`). Sunucu büyük harfe çevirir ve desen denetler. Boş gönderilirse (yalnız POST'ta) belge numaralandırmasından atanır (`SalesOrderEndpoints.cs:41-43, 109`). |
| Müşteri | `SalesCustomerPopupSelect` (`:10811-…`). Seçenekler **bütün** cari sayfalarıdır (`loadAllPages("/api/customers/")`, `:927-929`), süzgeç aktif + `Supplier` değil (`:10860-10861`). Uzak arama (≥ 2 harf) yalnız `type=Customer` ve `type=Both` çeker (`:10847-10848`); `Dealer` uzak aramada **yoktur**, `Employee` yerel listede **vardır**. Seçim belge dövizini cari dövizine çeker. Cariden gelindiyse ön seçilidir (`:128-142, 207-264, 430-449`). |
| Sipariş tarihi * | tarih; değişince kurlar yeniden okunur (`:888-897`) |
| İstenen teslim tarihi | `min = sipariş tarihi` |
| Plasiyer | aranabilir, temizlenebilir; `GET /api/hr/employees/` içinden `status === "Active"` olanlar (`:932-936`) |

- **Satır ızgarası** (`SalesFormLines` + `table.dd-lines`; `:2809-2846`; 14 sütun):

| # | Sütun | Denetim / hesap |
|---|---|---|
| 1 | `#` + × kaldır | son satır kaldırılınca boş satır bırakılır |
| 2 | Stok kartı * | `SearchableRecordPicker`; seçenekler `code · name`, açıklama birim. **Bütün** stok kataloğu açılışta yüklenir ve aktifler süzülür (`loadStockItemCatalog`, `:930-935`; `erpApi.ts:59`). Arama yalnız istemcidedir. |
| 3 | Miktar * | `min 0.0001`, `step 0.0001` |
| 4 | Birim * | temel birim + stokun aktif çevrimleri `birim (×çarpan)` (`GET /api/stock/items/{id}/units`, `:899-913`) |
| 5 | Birim fiyat * | `min 0`, `step 0.0001` |
| 6 | Döviz | `quoteCurrencies`: belge dövizi, kur tabanı, TRY/USD/EUR/GBP, kur listesindekiler, stok fiyat dövizleri (`:1101`) |
| 7 | Kur | salt okunur; `quoteLineFxRate` (çapraz kur = kaynak ÷ hedef), yoksa "Kur yok" (`:1023-1031`) |
| 8 | İskonto % * | 0–100 |
| 9 | KDV % * | 0–100 |
| 10 | KDV türü | KDV hariç / KDV dâhil |
| 11–14 | Ara toplam, İskonto, KDV tutarı, Satır toplamı | salt okunur; KDV dâhilse ara toplam KDV'den arındırılır. **Yuvarlama yoktur** (`:2819-2826`) |

  Satır ekleme düğmesi ve Ctrl+Shift+Enter (`data-line-add-shortcut`). Yeni satırın varsayılanları miktar 1, fiyat 0,
  iskonto 0, KDV 20, KDV hariç, döviz = belge dövizi (`:2843`).
- **Stok seçimi satırı doldurur** (`selectDirectOrderStock`, `:997-1022`): birim = stok temel birimi. Ayrıca fiyat =
  `salesListPrice`, döviz = `priceCurrencyCode` (yoksa cari dövizi), KDV = `salesVatPercent` (yoksa 20), iskonto =
  `salesDiscountPercent` doldurulur. **Düzenlemede** dolu satırın stoku değişirse önce sorulur: "Satış fiyatı güncellensin
  mi? … Tanımlı satış fiyatı X olarak satıra uygulanır." (Fiyatı güncelle / Mevcut fiyatı koru).
- **Toplamlar** (`salesFormTotalRows`, `sales/salesDocumentForm.tsx:79-89`; `:2812`): Mal / hizmet toplamı, Toplam iskonto
  (eksi), oran başına "KDV %x matrahı" ve "KDV %x", KDV toplamı, "Genel toplam · Ödenecek tutar". Hepsi cari dövizinde
  gösterilir. Hesap `directOrderTotals`'tadır (`:1041-1058`) ve **KDV dâhil bayrağını yok sayar**. Bu yüzden satır
  hücreleri ile alt toplam KDV dâhil satırda tutmaz (bkz. G-SO25).
- **Sipariş Özel Alanları** (yalnız tanım varsa; `:2847-2912`): türe göre denetim, zorunlu işareti, "kod · tür" alt yazısı,
  not "Tenant alan tanımlarına göre doğrulanır.".
- **Kaydet** (`createDirectOrder`, `:1102-1159`): müşteri yoksa "Müşteri seçin.". Kur yükleniyorsa ya da kur yoksa istemci
  hatası verir. Gövde `{code, customerId, orderDate, requestedDeliveryDate|null, currencyCode: cari.currencyCode,
  salespersonEmployeeId|null, customFields, lines[{stockItemId, quantity, unitPrice, discountPercent, vatPercent,
  isVatIncluded, unitCode, currencyCode}]}` biçimindedir (`salesDocumentForms.test.tsx:155-171`). Başarıda `edit-id`
  silinir, `nexora:sales-changed` olayı yayılır ve listeye dönülür.
- **Düzenleme ön doldurma** (`:956-981`): `GET /api/sales/orders/{editId}`. Satır alanları şöyle eşlenir:
  `unitPrice ← enteredUnitPrice ?? unitPrice`, `unitCode ← enteredUnitCode || unitCode`,
  `currencyCode ← enteredCurrencyCode || belge dövizi`, `isVatIncluded`. Özel alanlar `code → value` map'ine çevrilir.

#### 2.1.4 Durumlar ve kapsam dışı kalan konular (bugün **yok**)

- **Onay, iptal, kapama:** sipariş onay adımı, iptal ve elle kapama yoktur. `SalesOrderStatus { Open, Fulfilled, Cancelled }`
  (`Entities.cs:2271`) tanımlıdır, ama `Cancelled`'ı yazan bir uç nokta **yoktur**. Durum yalnız sevkiyatla `Fulfilled`
  olur (`:4263`) ve irsaliye iptaliyle `Open`'a döner (`:4422-4428`).
- **Kampanya / promosyon:** siparişte uygulanmaz. Kampanya yalnız **taslak teklife** uygulanır
  (`SalesPromotionEndpoints.cs:62-82`). Tekliften dönüşen sipariş indirimi satır tutarlarıyla devralır.
- **Risk limiti:** sipariş kaydında ve sevkte **denetlenmez**. Yalnız fatura kesilirken denetlenir: irsaliyeden fatura
  (`:4533-4538`), "Fatura tutarı müşteri risk limitini aşacağı için kaydedilmedi.".
- **Stok uygunluğu:** sipariş kaydında denetlenmez. Rezervasyonda depo bakiyesi − aktif rezervasyonlar ile denetlenir
  (`:4085-4096`). Sevkte konum bakiyesi, rezervasyon ve negatif stok ayarı denetlenir (`:4188-4240`).
- **Teklif kaynağı:** "Siparişe dönüştür" teklif ekranındadır (`POST /api/sales/quotes/{id}/convert-to-order`, `:1694-1714`;
  sunucu `:3849-3907`). Sipariş ekranı yalnız `quoteCode`'u gösterir.

### 2.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Liste açılışı, arama, sayfa, Yenile, `nexora:sales-changed` | `GET /api/sales/orders/` | `q`, `page`, `pageSize=25` | `erp.sales-orders.read` (satır süzgeçli) | `:4275-4289`; `OrderByDescending(OrderDate).ThenByDescending(CreatedAt)`; `pageSize` 1–100; `SalesOrderPage{items,page,pageSize,totalCount}`. Durum süzgeci parametresi **yok**. |
| Her liste yüklemesi | `GET /api/warehouses/` | — | `erp.warehouses.read` | `:585`; aktifler detaya (`warehouses`) verilir |
| Açılış | `GET /api/screen-views/sales-orders/active` | — | `erp.screen-views.read` | `:731-744`; hata **sessiz** |
| Panel açık + geçerli satır | `GET /api/sales/orders/{id}` | — | `erp.sales-orders.read` (+ satır öznitelikleri) | `useSalesListPanel.ts:33-45` |
| Aç / Detay / kod tıklaması / Yenile (detay) | `GET /api/sales/orders/{id}` | — | `erp.sales-orders.read` | `:1715-1724`; `SalesOrderView` (satırlar teslim, kalan, rezerve ve girilen fiyat/döviz/birim ile; özel alanlar). Sunucu `:4290-4316` |
| Detay açılışı | `GET /api/sales/deliveries/?orderId={id}&page=1&pageSize=100` | — | `erp.sales-deliveries.read` | `:9626-9640`; `Deleted` hariç; **en çok 100** |
| Detay açılışı | `GET /api/screen-views/sales-order-lines/active` | — | `erp.screen-views.read` | `:9641-9653`; hata sessiz |
| Teslim tarihini kaydet | `PUT /api/sales/orders/{id}/delivery-date` | `{requestedDeliveryDate|null}` | `erp.sales-orders.update` | `SalesOrderEndpoints.cs:286-311`; yalnız `Open` (409) |
| Özel alan değerlerini kaydet | `PUT /api/sales/orders/{id}/custom-fields` | `{values{kod: değer}}` | `erp.sales-orders.update` | `:3987-4018`; yalnız `Open`; ≤ 40; mapte olmayan etkin alan **silinir**; zorunlu denetimi; `UPDLOCK` |
| Stok ayır | `POST /api/sales/orders/{id}/reservations` | `{requestId, warehouseId}` | `erp.sales-orders.create` | `:4044-4104`; **idempotent** (`requestId`); kalan miktarın tümü |
| Rezervasyonu bırak | `POST /api/sales/orders/{id}/reservations/release` | `{reason, confirmation:true}` | `erp.sales-orders.execute` (`release`) | `:4105-4123`; **TenantAdmin işleyici**; gerekçe denetim kaydına yazılır |
| İrsaliye formu açılışı | `GET /api/warehouses/{warehouseId}/locations` | — | `erp.warehouses.read` | `:9712-9729`; aktif konumlar |
| İrsaliye formu açılışı | `GET /api/stock/items/{stockItemId}/units` × satır | — | `erp.stock-items.read` | `:9750-9768`; biri hata verirse form açılmaz |
| İrsaliye oluştur | `POST /api/sales/orders/{id}/deliveries` | `{requestId, warehouseId, deliveryDate, lines[{orderLineNumber, quantity, unitCode, storageLocationId|null}]}` | `erp.sales-orders.create` (**irsaliye izni değil**) | `:4124-4274`; idempotent; kapalı dönem; stok çıkışı; durum güncellemesi |
| Fatura kes | `POST /api/sales/deliveries/{id}/invoice` | gövde **yok** | `erp.sales-deliveries.create` | `:4434-…`; idempotent (aynı irsaliyenin faturası döner, `:4445`); risk limiti; cari borç kaydı |
| İrsaliye iptal et | `POST /api/sales/deliveries/{id}/void` | — | `erp.sales-deliveries.execute` (`void`) | `:4374-4433`; ters stok hareketi; rezervasyonu geri açar; sipariş durumunu yeniden hesaplar |
| Sil | `DELETE /api/sales/orders/{id}` | — | `erp.sales-orders.delete` | `SalesOrderEndpoints.cs:13-34`; **TenantAdmin işleyici** |
| Sipariş alanları penceresi | `GET /api/sales/orders/custom-fields` | — | `erp.sales-orders.read` | `:3910-3915`; etkinler, etikete göre |
| Alan tanımı ekle | `POST /api/sales/orders/custom-fields` | `{code, label, dataType, maxLength, isRequired}` | `erp.sales-orders.create` | `:3916-3934`; TenantAdmin **veya** TenantDeveloper; zorunluluk yalnız TenantAdmin |
| Oluşturma açılışı | `GET /api/sales/orders/custom-fields` + `loadAllPages /api/customers/` + `loadStockItemCatalog` + `GET /api/hr/employees/` | — | `erp.sales-orders.read`, `erp.customers.read`, `erp.stock-items.read`, **`erp.human-resources.read`** | `:914-982`; müşteri ve stok için **bütün sayfalar** 100'lük parçalarla (`erpApi.ts:46-59`). Herhangi biri hata verirse form hata gösterir. |
| Oluşturma; sipariş tarihi değişince | `GET /api/sales/quotes/exchange-rates?rateDate=` | — | **`erp.sales-quotes.read`** | `:888-897`; sunucu `:3334-3347`; ileri tarih 400 |
| Müşteri uzak arama | `GET /api/customers/?q=&type=Customer|Both&status=Active&page=1&pageSize=50` ×2 | — | `erp.customers.read` | `:10847-10848` |
| Cariden gelindiyse | `GET /api/customers/{id}` | — | `erp.customers.read` | `:241-257`; önbellek `nexora.customer-sales-action-prefill` varsa atlanır |
| Stok seçilince | `GET /api/stock/items/{id}/units` | — | `erp.stock-items.read` | `:899-913`; stok başına bir kez |
| Düzenleme açılışı | `GET /api/sales/orders/{editId}` | — | `erp.sales-orders.read` | `:956-981` |
| Kaydet (yeni) | `POST /api/sales/orders/` | yukarıdaki gövde | `erp.sales-orders.create` | `SalesOrderEndpoints.cs:35-153`; `201 SalesOrderSummary` |
| Kaydet (düzenleme) | `PUT /api/sales/orders/{id}` | aynı gövde (**rowVersion yok**) | `erp.sales-orders.update` | `SalesOrderEndpoints.cs:154-285`; satırlar silinip yeniden yazılır |

İzin eşlemesi `PlatformPermissionCatalog.cs:68-69, 337-345, 387-397` içindedir: GET → `read`, PUT → `update`, DELETE →
`delete`. POST'ta son parça `release`/`void`/`convert-to-order` ise `execute`, değilse `create` olur.

### 2.3 Kurallar

- **Durum makinesi:** `Open → Fulfilled` geçişi, bir sevkiyattan sonra her satırda teslim ≥ sipariş miktarı olduğunda olur
  (`:4262-4263`). İrsaliye iptali durumu yeniden hesaplar ve `Fulfilled → Open` dönüşü olabilir (`:4422-4428`).
  `Cancelled` yazılmaz (2.1.4). `Open` dışında yasak olanlar: düzenleme, teslim tarihi, özel alan değerleri ve geri yükleme,
  rezervasyon, sevk ve silme (`SalesOrderEndpoints.cs:18-22, 164-168, 295-296`; `:3992, 4032, 4064, 4157`). Bırakma durum
  denetlemez.
- **Düzenleme ve silme ön koşulu:** sipariş `Open` olmalı, ayrıca **hiç** irsaliyesi (iptal edilmiş olsa bile), faturası
  ya da rezervasyonu (bırakılmış olsa bile) olmamalıdır. Aksi halde 409: "Yalnızca sevkiyat, fatura veya rezervasyonu
  olmayan açık siparişler düzenlenebilir." / "Yalnızca irsaliye, fatura veya rezervasyon kaydı bulunmayan açık siparişler
  silinebilir." (`SalesOrderEndpoints.cs:18-22, 164-168`). Eski ekran Düzenle'yi yalnız `Open` ile, Sil'i hiçbir koşulla
  sınırlamaz. Kalan durumları sunucu 409 ile reddeder. Tekliften dönüşen sipariş de aynı kurallarla düzenlenebilir.
- **Kayıt doğrulamaları** (POST ve PUT, `SalesOrderEndpoints.cs:41-107, 170-237`):
  - Kod: POST'ta boş olabilir, PUT'ta zorunlu (1–40); desen `^[A-Z0-9][A-Z0-9._/-]{0,39}$`; firmada benzersiz (409; ayrıca
    benzersiz indeks yakalanır, `code = sales_order.code_conflict`).
  - Satır sayısı 1–200. Teslim tarihi ≥ sipariş tarihi.
  - Müşteri aktif ve `Customer`/`Both`/`Dealer` türünde olmalı. **Sipariş dövizi carinin dövizine eşit olmalı**.
  - Plasiyer aktif personel olmalı.
  - Özel alanlar: ≤ 40; etkin olmayan kod, tür/uzunluk hatası ve eksik zorunlu alan ayrı ayrı raporlanır.
  - Stok kartları aktif olmalı. Satır dövizi ISO-3 olmalı ve sipariş tarihli kuru bulunmalı. Birim, stokun aktif çevrimi
    olmalı.
  - Miktar > 0 ve temel birime çevrildiğinde ≤ 4 ondalık. Fiyat ≥ 0. İskonto ve KDV 0–100. Taşma denetimi yapılır.
  - Saklanan değerler: miktar **temel birimde**, fiyat = girilen × kur ÷ çarpan, `UnitCode` = temel birim. Girilen döviz,
    fiyat ve birim `Entered*` alanlarında, kur `ExchangeRateToOrderCurrency`'de tutulur. Tutarlar satır başına 2 ondalığa
    `AwayFromZero` yuvarlanır (`PlatformContracts.cs:1008-1018`).
- **rowVersion yok.** `SalesOrderWriteRequest` rowVersion taşımaz (`PlatformContracts.cs:254-256`). PUT tüm satırları siler ve
  yeniden yazar, satır numaraları 1'den başlar (`SalesOrderEndpoints.cs:243-255`). Eşzamanlı iki düzenlemede son yazan
  kazanır. PUT bir işlem içinde çalışır ama siparişi kilitlemez (`UPDLOCK` yok).
- **PUT'ta özel alanlar:** `CustomFields == null` ise mevcut değerlerin **tümü silinir** (`removed` = map'te olmayan her
  değer, `SalesOrderEndpoints.cs:256-270`). Cari PUT'undan farkı budur: orada `null` korur.
- **Idempotency:** rezervasyon (`requestId`, başka sipariş/depoda kullanılmışsa 409, aynıysa önceki sonuç döner), sevkiyat
  (`requestId`, `UPDLOCK` + benzersiz indeks; içerik farklıysa 409, `SalesDeliveryIdempotency.MatchesPayload`) ve faturalama
  (irsaliye başına tek fatura; farklı tür, profil ya da e-belge bilgisi 409). Sipariş **oluşturma** idempotent değildir.
  Kod verilmezse çift tıklama iki sipariş yazar; eski ekran bunu `busy` ile önler.
- **Rezervasyon:** siparişte aktif rezervasyon varken ikincisi yapılamaz. Depo aktif olmalı. Ayrılan miktar, satır başına
  kalan (sipariş − sevk) miktardır ve **tek depoda** ayrılır. Uygunluk = depo bakiyesi − o depodaki aktif rezervasyonlar
  (konum ve lot dikkate alınmaz). Yetmezse 409 döner; gövdede `quantityOnHand`, `alreadyReservedQuantity`,
  `availableQuantity` ve `requestedQuantity` bulunur. Eski ekran yalnız `error` metnini gösterir.
- **Sevkiyat:**
  - Kapalı mali dönemde reddedilir. Depo ve konum aktif olmalı, konum o depoya ait olmalı. Satır numarası siparişte olmalı.
  - Miktar ≤ kalan olmalı. Rezervasyonlu satır rezervasyon deposundan ve rezervasyonda kalan miktar kadar sevk edilebilir.
  - Konum seçilmişse konum bakiyesi denetlenir. Depo bakiyesi başka siparişlerin rezervasyonları düşülerek denetlenir;
    negatif stok ayarı ve izleme moduna göre istisnalar vardır.
  - Lot/seri tahsisi otomatiktir; yetmezse 409 döner. Maliyet ağırlıklı ortalamadır.
  - Belge numarası `SalesDelivery` serisinden verilir.
- **Fatura (irsaliyeden):** müşteri aktif ve müşteri türünde olmalı. Cari dövizi sipariş dövizine eşit olmalı. Vergi profili,
  kapalı dönem ve risk limiti (`borç − alacak + fatura > limit` ise 409) denetlenir. Toplam > 0 olmalı. Cari borç kaydı
  yazılır. Fatura tarihi bugündür (UI tarih göndermez).
- **İrsaliye iptali:** yevmiyeye aktarılmışsa ya da kesilmiş faturası varsa reddedilir. Ters tarih bugündür ve bugün kapalı
  dönemdeyse reddedilir. Rezervasyonun `FulfilledQuantity`'si geri alınır.
- **Silme:** özel alan değerleri ve geçmişi de silinir (`SalesOrderEndpoints.cs:24-28`). İlişki kısıtı 409'a çevrilir.
- **Özel alan tanımı:** zorunlu tanım ancak hiç açık sipariş yoksa ve siparişe dönmemiş kabul edilmiş teklifler bu kodda değer
  taşıyorsa açılabilir (`:3926-3929`). Tekliften dönüşümde zorunlu alan teklifte yoksa dönüşüm 409 verir (`:3870-3874`).
- **Satır görünürlüğü:**
  - *Liste:* `PermissionStatusFilter.ApplyAsync(... "erp.sales-orders.read", x => x.Status, x => x.CustomerId)` (`:4282`).
    Desteklenen satır öznitelikleri `resource.status` ve `resource.customerId`'dir. Bilinmeyen bir öznitelik **boş** liste
    döndürür (`PermissionStatusFilter.cs:27-32`). Liste isteğine `collectionRowsFiltered=true` eklenir
    (`PermissionAuthorizationHandler.cs:52-58, 76-90`). TenantAdmin süzülmez.
  - *`{id}` isteklerinde:* TenantAdmin dışındaki her istekte yetki işleyicisi siparişin `Status` ve `CustomerId`'sini okuyup
    öznitelik olarak ekler (`PermissionAuthorizationHandler.cs:59-71, 104-109`). GET `/{id}`'nin kendi içinde süzgeç yoktur,
    karar yetki aşamasında verilir.
  - *İrsaliye uçlarında* (`/api/sales/deliveries/{id}/invoice|void`): öznitelik çözümü `StandaloneSalesDeliveries`
    tablosuna bakar (`PermissionAuthorizationHandler.cs:128-133`). Sipariş irsaliyesi o tabloda olmadığından öznitelik
    **eklenmez**. Satır koşullu irsaliye kuralı olan kullanıcıda bu iki eylem reddedilebilir (**kod çıkarımı**,
    doğrulanmalı).
- **Denetim kaydı:**
  - `sales-order.created-direct`, `sales-order.created-from-quote`, `sales-order.updated`
    (`SalesOrderEndpoints.cs:135, 271`; `:3900`).
  - `sales-order.delivery-date-updated` (`eski->yeni` ile, `SalesOrderEndpoints.cs:302-306`), `sales-order.deleted`.
  - `sales-order.stock-reserved`, `sales-order.stock-reservation-released` (`kod:gerekçe`) (`:4098, 4119`).
  - `sales-delivery.posted`, `sales-delivery.voided`, `sales-invoice.posted`.
  - Özel alan **değer** yazmaları denetim olayı yazmaz; yalnız revizyon tablosuna kaydedilir (`:4012-4014`).

### 2.4 Roller

- **TenantAdmin:** her şeyi yapar, satır süzgeci uygulanmaz. Sil (çubuk ve satır menüsü) ve "Rezervasyonu bırak" yalnız ona
  görünür ve sunucuda da yalnız o yapabilir (`SalesOrderEndpoints.cs:15`, `:4108`). Zorunlu özel alan tanımı, tanım
  kaldırma ve tanım geri yükleme yalnız TenantAdmin'dir (`:3952-3978`).
- **TenantDeveloper:** "Sipariş alanları" penceresini ve tanım formunu görür. Zorunlu olmayan tanım ekler ve tanım düzenler
  (`:3916-3951`). Diğer her şey izin kurallarına bağlıdır.
- **TenantUser:** liste, detay, oluşturma, düzenleme, teslim tarihi, özel alan değeri, stok ayırma, irsaliye ve fatura izin
  kurallarına bağlıdır (işleyicide rol denetimi yok). Oluşturma formu ayrıca `erp.customers.read`, `erp.stock-items.read`,
  `erp.human-resources.read` ve **`erp.sales-quotes.read`** (kurlar) ister. Herhangi biri eksikse form açılışta hata verir
  ya da kaydı engeller (bkz. G-SO23, G-SO24). Sipariş alanları penceresi görünmez.

### 2.5 ERP işlem kataloğu

Var olan: **hiçbir `satis.*` işlemi yok** (`ErpOperationCatalog.cs`, `tests/IntegrationTests/ErpOperationCatalog.names.txt`).
Satışla ilgili yalnız rapor işlemleri vardır: `rapor.salesOrders`, `rapor.salesOrderFulfillment`, `rapor.salesQuotes`,
`rapor.salesDeliveries`, `rapor.salesInvoices`, `rapor.salesReturns` (`names.txt:39-44`; sabit `source` ile
`POST /api/reports/run`). Bunlar liste ekranının yerini tutmaz. Yeniden kullanılabilecek var olan işlemler şunlardır:
`stok.kart.listele` (`q` + sayfalama, `ErpOperationCatalog.cs:147`), `stok.kart.birimleri` (`:229`), `depo.listele`
(`:226`) ve `depo.konumlari` (`:227`). Cari seçicisi için önerilen `cari.listele`'nin (1.5) tek `type` parametresi
`Customer`+`Both`+`Dealer` kümesini karşılamaz (G-SO8).

Yeni (önerilen; modül sabiti `"Satış"` eklenmeli; `depo.transfer.olustur`'daki `ListParameter` deseni `:395-397` örnek alınır):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satis.siparis.listele` | GET `/api/sales/orders` | query `q`, `page`, `pageSize` | list `SalesOrderSummary`, `rowsPath "items"`, `MetaPaths [page,pageSize,totalCount]` | durum süzgeci yok (G-SO16); `allowed` riski G-C3 ile aynı |
| `satis.siparis.getir` | GET `/api/sales/orders/{id}` | route `id` | record `SalesOrderView` (skalerler) | `lines` ve `customFields` iç içe olduğu için sütun olmaz |
| `satis.siparis.kalemleri` | GET `/api/sales/orders/{id}` | route `id` | list `SalesOrderLineView`, `rowsPath "lines"` | `depo.transfer.kalemleri` gibi; detay ızgarası, irsaliye kaynağı ve düzenleme ön doldurması |
| `satis.siparis.olustur` | POST `/api/sales/orders` | body `SalesOrderWriteRequest` skalerleri (`code`, `customerId`*, `orderDate`*, `requestedDeliveryDate`, `currencyCode`*, `salespersonEmployeeId`) + `MapParameter("customFields")` + `ListParameter<SalesQuoteLineWriteRequest>("lines")` (öğe: `stockItemId`*, `quantity`*, `unitPrice`*, `discountPercent`, `vatPercent`, `unitCode`, `currencyCode`, `isVatIncluded`; `warehouseId` ve `exchangeRateToQuoteCurrency` kullanılmaz, hariç tutulmalı) | record `SalesOrderSummary` | `code` boş bırakılabilir (sunucu numaralar). `currencyCode` cari seçiminden bağlanmalı (G-SO8). |
| `satis.siparis.guncelle` | PUT `/api/sales/orders/{id}` | route `id` + aynı gövde; **kaynaksız** | record `SalesOrderSummary` | `satis.siparis.getir` kaynak yapılamaz: `{...kaynak}` gövdeye `customFields` **listesini** ve `lines` görünüm alanlarını kopyalar (`custom-page/erpOperations.ts:120`), sunucu map bekler ve 400 verir. `customFields` her zaman bağlanmalı, yoksa değerler silinir (2.3). G-SO6. |
| `satis.siparis.sil` | DELETE `/api/sales/orders/{id}` | route `id` | none | `requiresTenantAdmin` |
| `satis.siparis.teslimTarihiKaydet` | PUT `/api/sales/orders/{id}/delivery-date` | route `id`; body `requestedDeliveryDate` | record `SalesOrderSummary` | |
| `satis.siparis.ozelAlanTanimlari` | GET `/api/sales/orders/custom-fields` | — | list `SalesOrderCustomFieldDefinitionView` | |
| `satis.siparis.ozelAlanDegerleri` | GET `/api/sales/orders/{id}/custom-fields` | route `id` | list `SalesOrderCustomFieldValueView` | |
| `satis.siparis.ozelAlanKaydet` | PUT `/api/sales/orders/{id}/custom-fields` | route `id`; map `values` | list `SalesOrderCustomFieldValueView` | `bodyMap {values ← satis.siparis.ozelAlanDegerleri: code→value}` (`stok.kart.ozelAlanKaydet` gibi) |
| `satis.siparis.stokAyir` | POST `/api/sales/orders/{id}/reservations` | route `id`; body `requestId` (`autoId` girişi), `warehouseId` | list `SalesOrderReservationSummary` | 201 bir dizi döner; sonuç `list`, `rowsPath null` |
| `satis.siparis.rezervasyonBirak` | POST `/api/sales/orders/{id}/reservations/release` | route `id`; body `reason` | record (`id, code, releasedCount`; anonim, sütunlar elle) | `fixedBody {confirmation:true}`, `requiresTenantAdmin` |
| `satis.siparis.irsaliyeOlustur` | POST `/api/sales/orders/{id}/deliveries` | route `id`; body `requestId` (`autoId`), `warehouseId`*, `deliveryDate`*; `ListParameter<SalesDeliveryLineWriteRequest>("lines")` (`orderLineNumber`*, `quantity`*, `unitCode`, `storageLocationId`) | record `SalesDeliverySummary` | izin `erp.sales-orders.create`; satır kaynağı `satis.siparis.kalemleri` (G-SO11) |
| `satis.siparis.irsaliyeleri` | GET `/api/sales/deliveries` | query `orderId` (guid), `page`, `pageSize` | list `SalesDeliverySummary`, `rowsPath "items"` | |
| `satis.kurlar` | GET `/api/sales/quotes/exchange-rates` | query `rateDate` (date) | list, `rowsPath "rates"` (`currencyCode, rate, rateDate`) + `MetaPaths [baseCurrencyCode]` | anonim yanıt; sütunlar elle tanımlanmalı; izin `erp.sales-quotes.read` (G-SO24) |

Sonraya (v1 dışı önerilir):

- İrsaliye işlemleri **ayrı bir envanteri** ister. İsimler önerisi: `satis.irsaliye.faturaOlustur` (POST
  `/api/sales/deliveries/{id}/invoice`, gövdesiz; idempotent) ve `satis.irsaliye.iptal` (POST `/api/sales/deliveries/{id}/void`,
  `confirmEnabled`).
- `satis.teklif.siparisDonustur` (teklif envanterinde).
- `satis.siparis.ozelAlanTanimEkle` / `Guncelle`. TenantAdmin **veya** TenantDeveloper koşulu G-K1 gibi tek bayrakla
  ifade edilemez.
- `satis.siparis.ozelAlanTanimKaldir` / `TanimGecmisi` / `TanimGeriYukle` (`requiresTenantAdmin`).
- `satis.siparis.ozelAlanDegerGecmisi` / `DegerGeriYukle` (`fixedBody {confirmation:true}`). Eski sipariş ekranı bunları
  **kullanmaz**; uç noktalar var ama arayüzü yok.
- Plasiyer seçenekleri: `/api/hr/employees` için işlem gerekir (`ik.personel.listele` ya da `satis.plasiyerler`; G-SO23).

Gereken yeni `Labels` kodları (bugün yok; `Label()` açılışta hata verir, `ErpOperationCatalog.cs:494-495`):
- **Sipariş ve satır:** `quoteId`, `quoteCode`, `customerId`, `customerName`, `orderDate`, `currencyCode`, `grandTotal`,
  `subtotal`, `discountTotal`, `taxTotal`, `requestedDeliveryDate`, `salespersonEmployeeId`, `lineNumber`, `stockCode`,
  `stockName`, `unitPrice`, `discountPercent`, `vatPercent`, `isVatIncluded`, `lineSubtotal`, `discountAmount`, `taxAmount`,
  `lineTotal`, `deliveredQuantity`, `remainingQuantity`, `reservationId`, `reservationWarehouseId`,
  `reservationWarehouseName`, `enteredCurrencyCode`, `enteredUnitPrice`, `exchangeRateToOrderCurrency`.
- **İrsaliye ve rezervasyon:** `requestId`, `deliveryDate`, `orderId`, `orderCode`, `orderLineNumber`, `hasSalesInvoice`,
  `invoiceStatus`, `invoiceId`, `fulfilledQuantity`, `remainingReservedQuantity`, `releasedAt`.
- **Kur:** `rateDate`, `rate`.

Var olanlar: `id`, `code`, `status`, `lineCount`, `createdAt`, `quantity`, `unitCode`, `stockItemId`, `warehouseId`,
`warehouseName`, `storageLocationId`, `reservedQuantity`, `reason`, `customFields`, `values`, `definitionId`, `label`,
`dataType`, `maxLength`, `isRequired`, `value`, `definitionVersion`, `version`, `baseCurrencyCode`, `q`, `page`, `pageSize`.
Ayrıca güncellenecek kayıtlar: `names.txt`, yeni `system-pages/salesOrder*Operations.fixture.json` ve
`SystemPageStandards.versions.txt`.

### 2.6 Bileşen eşlemesi ve eksikler

Var:
- **Liste:** `actionBar` (Yeni → `page @sales-order-create`, Aç → detay penceresi ya da sayfa, Sil `visibleWhen` rol + TenantAdmin
  işlemi, `moreButtons`, `titleCount {{liste.meta.totalCount}}`), `filterBar` (sunucu arama `searchParam q`), `dataTable`
  (sunucu sayfalama 25, `columnFormats` code/money/date/status, `toneMap` durum tonu, `valueLabels` Open/Fulfilled/Cancelled,
  `rowActions` Detay/Düzenle/Sil), `metric` + `countWhen` ("Sevk bekleyen · bu sayfa"), `contextPanel` (özet paneli).
- **Detay:** `dialog` (`size: "xl"`, `TenantCustomPageSchema.cs:2040`) + `tabs` (Bilgiler / İrsaliyeler), `recordHeader` (kod,
  müşteri, tarih, toplamlar; en çok 6 alan, `custom-page/RecordHeader.tsx:8`), `steps` (Açık → Tamamlandı,
  `activeWhen`), `dataTable` (satırlar, irsaliyeler), `formCard` (teslim tarihi, rezervasyon deposu, irsaliye üst bilgisi),
  `customFieldsBlock` (özel alan değerleri), `button` (`visibleWhen`/`disabledWhen`/`confirmEnabled`), `alert`.
- **Oluşturma:** `formCard` + `editableGrid` (`list` modu, `lookup:` seçici sütunları, sunucu aramalı seçenek,
  `custom-page/EditableGrid.tsx:53-60`, `TenantCustomPage.tsx:2750-2771`), `customFieldsBlock`, giriş `autoId`
  (`TenantCustomPage.tsx:717-729, 1577-1590`).

Eksikler (satış siparişleri):

- **G-SO1 Satır ızgarasının sütun sınırı ve hesaplı sütunlar.** Eski satır ızgarasında 14 sütun vardır: 9 giriş, 1 kur ve
  4 hesaplı tutar. `editableGrid` en çok 12 sütun alır (`custom-page/gridState.ts:38`). Giriş türleri yalnız text, number,
  date, checkbox ve lookup'tır (`:22`); **seçim (select) ve hesaplı/formül sütunu yoktur**. Ara toplam, İskonto, KDV tutarı,
  Satır toplamı ve Kur canlı gösterilemez. `eksik`: hesaplı salt okunur sütun (satır içi aritmetik) ya da `fark`. `fark`
  seçilirse tutarlar yalnız kayıttan sonra (detayda, sunucu değeri) görünür. KDV türü bir `checkbox` olabilir. Döviz
  `lookup` olabilir (`satis.kurlar` + belge dövizi; statik seçenek `staticOptions` ile).
- **G-SO2 Seçimle satır doldurma.** Stok seçilince birim, liste fiyatı, fiyat dövizi, KDV % ve iskonto % satıra yazılır.
  Düzenlemede stok değişirse "Satış fiyatı güncellensin mi?" sorulur (`:997-1022`). Izgara seçicisi yalnız kendi hücresini
  yazar (`onChange` → `edit`, `TenantCustomPage.tsx:2767-2770`). `eksik`: lookup seçiminde seçenek satırından başka
  hücrelere `fill` eşlemesi (ör. `fill {unitPrice: salesListPrice, vatPercent: salesVatPercent, …}`) ve isteğe bağlı onay.
  Olmazsa kullanıcı her satırda fiyatı elle girer. Bu ciddi bir gerilemedir.
- **G-SO3 Satıra bağlı birim seçenekleri.** Birim seçenekleri stok başına `GET /api/stock/items/{id}/units` ile gelir. Izgara
  seçici tek bir sorguya bağlıdır. `optionsWhen` satır koşuluyla süzebilir (`TenantCustomPage.tsx:2758-2759`), ama tüm
  stokların çevrimlerini döndüren bir okuma yoktur. `eksik` (toplu çevrim okuması, ör. `/api/stock/unit-conversions?stockItemIds=`)
  ya da `fark` (birim serbest metin olur, sunucu denetler; hata `lines[i].unitCode`).
- **G-SO4 Canlı belge toplamları ve KDV oranı grupları.** Formda alt toplam, iskonto, oran başına matrah ve KDV, genel toplam
  canlı hesaplanır (`:1041-1058`, `salesDocumentForm.tsx:79-89`). `dataTable.totals` yalnız sorguya bağlı **liste** sütunlarını
  toplar (`TenantCustomPageSchema.cs:718-725`). Izgara taslağı için toplam yoktur, oran gruplaması da yoktur. `eksik`: form
  önizlemesi için sunucu "hesapla" uç noktası (ör. `POST /api/sales/orders/preview`) ya da `fark` (toplamlar kayıttan
  sonra). Detayda sunucu toplamları `recordHeader`/`metric` ile gösterilebilir. "KDV %x · matrah y" satırları satırlardan
  gruplanır ve bağlamada gruplama yoktur; `fark`.
- **G-SO5 Kur yükleme ve kaydet engeli.** Sipariş tarihi değişince kurlar okunur. "Kur yok" satırı varken kaydet "Kuru
  bulunmayan satır var; sipariş kaydedilemez." nedeniyle pasiftir (`:1100, 2714-2728`). `disabledWhen` koşulu satır
  dövizlerinin kur listesinde olup olmadığını soramaz (dizi üyelik koşulu yok). `fark`: engel kalkar, sunucu
  `lines[i].currencyCode` 400'ünü döner ("… sipariş tarihli kur bulunamadı."). Kabul edilebilir. Ancak birleşik hata metni
  hangi satır olduğunu gösterir mi, **doğrulanmalı** (`erpApi.ts:15-25`).
- **G-SO6 Düzenleme girişi ve ön doldurma.** Düzenleme bugün `sessionStorage["nexora.sales-order.edit-id"]` ile açılır.
  Sistem sayfasında `page @sales-order-create` + `openParams id=…` yapılır. Ön doldurma için `editableGrid` kaynağı
  `satis.siparis.kalemleri` olur. Ancak düzenlenecek değerler görünümde farklı adlarda durur: `enteredUnitPrice` →
  `unitPrice`, `enteredUnitCode` → `unitCode`, `enteredCurrencyCode` → `currencyCode`. Ayrıca `quantity` **temel birimdedir**,
  girilen miktar saklanmaz. Sunucu girilen birimi geri verir ama miktarı temel birimde verir. Eski ekran da miktarı temel
  birimle doldurup birimi girilen birim yapar (`:966-975`). Bu, bugünkü ekranın da hatası olabilir (temel olmayan birimle
  girilen satırda miktar × çarpan). **Doğrulanmalı.**
  - Gerekenler (`eksik`): (a) kaynak satır sütunu → taslak hücre eşlemesi (`fromColumn`), (b) `list` modu ön doldurması,
    (c) `satis.siparis.guncelle`'nin kaynaksız tanımı (2.5).
  - Sunucu her PUT'ta satırları yeniden yazdığından `stage` modu (eklenen/silinen) yerine `list` modu doğrudur.
- **G-SO7 Eşzamanlılık.** rowVersion yoktur ve PUT satırları yeniden yazar (2.3). Sistem sayfası da bu korumayı ekleyemez.
  `fark` (aynı). Sunucuya rowVersion eklenirse **yeni işlem adı** gerekir.
- **G-SO8 Müşteri seçici ve döviz bağı.**
  - Eski seçici bütün carileri yükler ve tür/aktiflik süzer. Uzak arama Customer+Both ile yapılır. Seçim belge dövizini
    carinin dövizine çeker. Kayıt `currencyCode`'u **carinin** dövizinden gönderir (`:1130`).
  - `cari.listele` tek `type` alır. `Dealer` ve `Both`'u birlikte veremez.
  - `eksik`: (a) çoklu tür parametresi (`types=Customer,Both,Dealer`) ya da satış için ayrı müşteri seçenekleri okuması,
    (b) seçimin seçenek satırından `currencyCode` girişini doldurması (G-SO2'nin form karşılığı), (c) satır dövizi
    varsayılanının belge dövizine bağlanması.
  - Olmazsa yanlış dövizle 400 döner: "Sipariş dövizi seçilen carinin döviziyle (X) aynı olmalıdır.".
- **G-SO9 Belge yüzeyi ve zincir.** `DocumentSurface`'in durum akışı (İptal son durumu dahil), sağ "Belge zinciri" (teklif →
  sipariş → irsaliyeler → faturalar, tıklanabilir) ve alt bilgi satırı vardır. `steps` İptal gibi akış dışı son durumu
  çizemez (`custom-page/StepsIndicator.tsx:14-23`). Zincir `contextPanel` + `dataTable` (irsaliyeler) ile yaklaşık kurulur.
  Faturayı açmak için köprü yoktur (G-SO12). `fark` + `eksik`.
- **G-SO10 Rezervasyon bırakma: gerekçe istemi + onay.** Eski ekran önce zorunlu çok satırlı gerekçe sorar, sonra onay ister
  (`:9796-9834`). Sistem sayfasında `dialog` içinde `formCard` (gerekçe, `required`) + `confirmEnabled` düğmesi gerekir.
  Mümkün; iki adımlı akış `fark` (tek pencere).
- **G-SO11 İrsaliye alt formu.**
  - Satırlar `remainingQuantity > 0` olan sipariş satırlarıdır. Varsayılan miktar `min(kalan, rezerve)` (rezervasyonluysa),
    birim seçeneği satırın stokuna bağlıdır (G-SO3), konum seçenekleri seçilen **depoya** bağlıdır (`depo.konumlari` route
    `warehouseId` ← form girişi; ızgara lookup sorgusunun sayfa girişine bağlanması **doğrulanmalı**).
  - Varsayılan depo = rezervasyon deposu.
  - `eksik`: (a) kaynak satırların koşulla süzülmesi (`remainingQuantity > 0`), (b) satır başına hesaplı varsayılan miktar,
    (c) `orderLineNumber`'ın kaynak satırdan taşınması.
  - Olmazsa `fark`: tüm satırlar listelenir, miktar boş başlar, sunucu `kalan miktar` 409'unu döner.
  - Formun her açılışta yeni `requestId` üretmesi `autoId` ile karşılanır: pencere her açılışta kimliği yeniler
    (`TenantCustomPage.tsx:1586-1590, 2229`). Form pencere değil sayfa içi bir bölümse yenileme anı **doğrulanmalı**.
- **G-SO12 Fatura kes / Faturayı aç / İrsaliye iptal.** İrsaliye satır eylemleri irsaliye işlemlerine bağlıdır (2.5 sonraya).
  "Faturayı aç" ve zincirdeki fatura düğümü, aynı sayfada `SalesInvoiceModal` açar (`onInvoiceCreated`). Sistem sayfasında
  fatura ekranına parametreli geçiş yoktur (G-C13 ile aynı). `eksik`. "Fatura kes" onay sormadan cari borç kaydı yazar;
  sistem sayfasında `confirmEnabled` eklemek olumlu bir `fark`tır.
- **G-SO13 Duruma bağlı özel alan kilidi.** Özel alanlar `Open` dışında salt metindir (`:10080`). `customFieldsBlock`
  için `disabledWhen` vardır (`TenantCustomPageSchema.cs:1284-1306`): `disabledWhen "siparis.status != Open"`. Var. Not metni
  ("Sipariş kapanınca kilitlenir.") ise `text` + `visibleWhen` ile yazılır.
- **G-SO14 Sipariş alan tanımları penceresi v1 dışı.** Rol koşulu TenantAdmin veya TenantDeveloper'dır (G-K1). Öneri: v1'de
  "Eski ekranda aç".
- **G-SO15 Sayfa tutarı kartı.** "Sipariş tutarı": yüklü sayfanın iptal dışı satırlarının `grandTotal` toplamı; birden çok
  döviz varsa "—" ve ek ipucu gösterilir. `countWhen` yalnız sayar (`custom-page/countWhen.ts:13-25`), toplamaz. `eksik`
  (`sumWhen` + tek döviz koşulu) ya da `fark` (kart düşer, yerine `dataTable.totals grandTotal` konur; ama o da döviz
  karışıklığını gözetmez).
- **G-SO16 Durum süzgeci ve sunucu sayaçları.** Eski ekranda durum süzgeci yoktur. Sistem sayfasında eklemek istenirse sunucu
  `status` parametresi almaz. `fark` (aynı). "Sevk bekleyen" sunucu sayacı değildir, yalnız o sayfayı sayar.
- **G-SO17 Sekmeler arası yenileme.** Bir sekmedeki yazma `nexora:sales-changed` olayı yayar. Açık teklif, sipariş ve fatura
  listeleri kendini yeniler (`:527-541, 654-657`). Sistem sayfasında bu olay ne dinlenir ne yayılır. `eksik` ya da `fark`.
  Öneri: sistem sayfası yazmalarında ortak bir "kayıt değişti" olayı (ör. `onSaved` → `nexora:sales-changed`).
- **G-SO18 Cariden "Yeni sipariş".** `customer-sales-action` sessionStorage + olay ile cari ön seçimi
  (`:125-142, 207-264`). G-C12 ile aynı `eksik`: `page @sales-order-create` + `openParams customerId`. Bu yol cari envanteri
  taşınmadan da gereklidir.
- **G-SO19 Satır koşullu izinlerde `allowed` yanlış negatif.** G-C3 ile aynıdır. Liste `collectionRowsFiltered` ile çalışır.
  `{id}` yazmaları siparişin `status` ve `customerId` özniteliğiyle değerlendirilir. Katalog `allowed` bunları boş GUID ile
  çözer. Ek risk: irsaliye uçları öznitelik çözemez (2.3). `eksik`; TenantUser + `resource.status == Open` kuralıyla test
  gerekir.
- **G-SO20 "Bağımsız" sözde teklif kodu.** Sunucu bağımsız siparişte `QuoteCode = "Bağımsız"` döner. Liste sütunu bunu
  gösterir (istenen davranış olabilir). Ancak panel zinciri ve detay zinciri `quoteCode` doluluğuna baktığı için olmayan bir
  "Bağımsız · Satış teklifi" düğümü çizer (`SalesListPanels.tsx:161`, `:9965`). Sistem sayfasında zincir `quoteId != null`
  koşuluyla kurulmalıdır. `fark` (olumlu düzeltme).
- **G-SO21 Sil komutunun koşulu.** Sil yalnız TenantAdmin'e görünür ve durum koşulu yoktur. Sunucu `Open` + ilişkisiz değilse
  409 verir. Liste yanıtında irsaliye ve rezervasyon bilgisi olmadığından istemci tam koşulu bilemez. `disabledWhen
  "status != Open"` eklenebilir. Kalan durumlar sunucu hatasıyla kalır. `fark` (olumlu).
- **G-SO22 Satır menüsü koşulları.** "Düzenle" yalnız `Open` satırda, "Sil" yalnız TenantAdmin'de görünür. `rowActions`'ın satır
  başına `visibleWhen` desteklediği **doğrulanmalı**. Desteklemiyorsa Düzenle her satırda görünür ve sunucu 409 döner (`fark`).
- **G-SO23 Plasiyer seçici.** `/api/hr/employees` için işlem yoktur. Bu uç `erp.human-resources.read` ister. Satış kullanıcısına
  personel modülü okuması vermek gereksiz bir yetki genişlemesidir. Bugün bu izni olmayan TenantUser'da oluşturma formu
  **hiç açılmaz**, çünkü `Promise.all` hata verir (`:921-937`). `eksik`: satış için daraltılmış plasiyer seçenekleri okuması
  (ör. `GET /api/sales/salespeople`, `erp.sales-orders.read` altında) + `satis.plasiyerler`. Plasiyer detayda hiç
  gösterilmez (`fark`, eklenebilir).
- **G-SO24 Kur okumasının izni.** Kurlar `/api/sales/quotes/exchange-rates` üzerinden okunur, bu da `erp.sales-quotes.read`
  ister. Teklif izni olmayan sipariş kullanıcısında kurlar yüklenmez. Kaydet engellenir mi, açık kalır mı, bu yükleme
  durumuna bağlıdır; **doğrulanmalı**. Çapraz dövizli satır da kaydedilemez. `eksik`: kurların satış ortak yolu
  (ör. `/api/sales/exchange-rates`) ya da `satis.kurlar`'ın izin notu.
- **G-SO25 Toplam tutarsızlığı (eski ekranın hatası).** Satır hücreleri KDV dâhil fiyatı arındırır (`:2822-2823`), alt toplam
  arındırmaz (`:1041-1058`). Sunucu satır bazında yuvarlar. Yeni ekranda toplamlar sunucudan (G-SO4) gelirse bu tutarsızlık
  kalkar. `fark` (olumlu).
- **G-SO26 Bütün stok ve cari kataloğunun yüklenmesi.** Oluşturma açılışında bütün cari ve stok sayfaları 100'lük parçalarla
  çekilir (`:927-931`). Büyük kiracıda yavaştır. Sistem sayfasında sunucu aramalı `lookup` (`stok.kart.listele q`) kullanılır.
  `fark` (olumlu). Ancak düzenlemede seçili stokun etiketi ilk sayfada yoksa `pickerLabel` ham id gösterebilir;
  **doğrulanmalı** (`TenantCustomPage.tsx:2744-2749`).
- **G-SO27 İptal / kapama yok.** Kısmi sevk edilmiş bir sipariş, kalan miktar için ne iptal edilebilir ne kapatılabilir; sonsuza
  dek `Open` kalır ve "Sevk bekleyen" sayılır. Bu, sistem sayfasının kapatamayacağı bir **sunucu eksiğidir**. Taşımadan bağımsız
  olarak yol haritasına yazılmalıdır.
- **G-SO28 Klavye ve hata gösterimi.** Ctrl+Shift+Enter satır ekleme, Ctrl+. panel, Esc ile detay kapatma ve ↑↓/Boşluk/Enter
  ızgara klavyesi. G-C19 ve 0'daki çalışma zamanı notları geçerlidir. Sunucunun `lines[i].*` hataları tek metne birleşir;
  satır vurgusu olmaz (0, `erpApi.ts:15-25`).
- **G-SO29 İngilizce arayüz.** Testler Türkçe/İngilizce karışık başlıklar kullanır. G-C25 ile aynı `fark`.

### 2.7 Görünüm anahtarları

| Anahtar | Kullanan | Varsayılan alanlar (`TenantScreenViewEndpoints.cs`) | Not |
|---|---|---|---|
| `sales-orders` | liste sütunları (`:731-744`) | `code`, `quoteCode`, `customerName`, `orderDate`, `lineCount`, `grandTotal`, `status`, `actions` (sabit) (`:240-245`; katalog `:681, 1151-1155`) | `pageSettings` yok. `actions` sabit alandır ve her zaman çizilir. Özel alan sütunu yok. |
| `sales-order-lines` | detay satır ızgarası (`:9641-9653`) | `stockCode`, `stockName`, `quantity`, `deliveredQuantity`, `remainingQuantity`, `reservedQuantity`, `unitPrice`, `lineTotal` (`:246-252`; katalog `:682, 1156-1160`) | `unitPrice` hücresi bileşik çizilir (girilen fiyat + döviz + kur notu). Görünüm eşlemesinde bu `fark`tır. |

Oluşturma ızgarası, panel ve irsaliye alt formu görünümden **beslenmez** (sabit). Anahtarların izinli listesi
`TenantScreenViewEndpoints.cs:34`'tedir. `BuiltInScreenViewsPage.tsx:106, 658` ve `ScreenViewPreview.tsx:125` sipariş
önizlemesine özel dallar içerir. Sistem sayfasına geçişte bu önizlemeler ilgisiz kalır.

### 2.8 Kaybolması kolay davranışlar ve riskler

1. **Düzenleme sekmesinin bayatlaması (eski ekranın hatası, kod çıkarımı).** Satış sekmeleri canlı tutulur (`:527-528`).
   `openDirectOrderModal` yalnız `[actionCustomerId, createOrderPage, token]` değişince çalışır (`:983-985`). `directOrderEditId`
   ise her çizimde sessionStorage'dan okunur (`:1099`). "Yeni Sipariş" sekmesi açıkken başka bir siparişte Düzenle'ye
   basılırsa başlık "Sipariş Düzenleme" olur, ama form eski içerikle kalır. Kaydet, **yeni id'ye eski satırlarla PUT** yapar
   (`:1119-1124`). Taşıma sırasında `openParams id` her girişte yeniden okunmalıdır. Eski ekranda tekrar üretip
   doğrulanmalıdır.
2. **Özel alanların PUT'ta silinmesi.** `customFields` gönderilmeyen ya da `null` gönderilen bir PUT, siparişin bütün özel alan
   değerlerini siler (2.3). `satis.siparis.guncelle`'de map parametresi her zaman bağlanmalıdır. Testi şart.
3. **Kaynaklı güncellemenin 400'ü.** `satis.siparis.getir` kaynak yapılırsa gövdeye `customFields` dizisi kopyalanır ve
   sunucu map beklediği için istek düşer (2.5). Fixture testinde yakalanmalıdır.
4. **İrsaliye oluşturma izni** sipariş iznidir (`erp.sales-orders.create`), fatura ve iptal ise irsaliye iznidir. Rol
   şablonları bu ayrımı bilmeli. `allowed` hesabı da aynı eşlemeyi kullanmalıdır.
5. **Gizli izin bağımlılıkları:** oluşturma formu `erp.human-resources.read` (plasiyer) ve `erp.sales-quotes.read` (kurlar)
   olmadan açılmaz ya da kaydedemez (G-SO23, G-SO24). Sistem sayfası bu okumaları ayrı sorgular yaparsa form en azından
   açılır. Bu olumlu bir farktır, yazılmalıdır.
6. **Para birimi.** Belge dövizi carinin dövizine zorunlu eşittir ve kullanıcı değiştiremez. Satır dövizi serbesttir. Kur
   sipariş tarihinden gelir; satır kuru elle girilemez (teklifte `exchangeRateOverride` vardır, siparişte yoktur).
   Sunucu `ExchangeRateToQuoteCurrency` alanını sipariş yolunda yok sayar.
7. **Miktar temel birimde saklanır.** Detay "Sipariş miktarı"nı temel birimle gösterir. Girilen miktar kaybolur (yalnız
   girilen birim ve fiyat saklanır). G-SO6'daki ön doldurma riski buna bağlıdır.
8. **Düzenleme yalnız "hiç ilişkisi olmayan" siparişte mümkündür.** İptal edilmiş bir irsaliye ya da bırakılmış bir
   rezervasyon bile düzenlemeyi ve silmeyi kalıcı olarak engeller (2.3). Kullanıcıya "Düzenle" gösterilip 409 alınması
   bugün de olur. Mesaj kaybolmamalıdır.
9. **Kısmi sevk ve rezervasyon:** rezervasyon tek depoda yapılır. Rezervasyonlu satır yalnız o depodan ve rezervasyon
   kalanı kadar sevk edilebilir. İrsaliye formunun varsayılan deposu ve miktarı bu yüzden rezervasyondan gelir. Bu
   varsayılanlar düşerse kullanıcı ilk denemede 409 alır.
10. **İdempotency anahtarlarının yaşam döngüsü:** eski ekran her form açılışında ve her başarılı rezervasyondan sonra yeni
    `requestId` üretir (`:9733, 9786, 9927`). Aynı anahtarla farklı içerik 409 döner. `autoId`'nin yenileme anı eski
    davranışla aynı olmalıdır.
11. **Fatura kesme onaysızdır, cari borç ve risk limiti denetimi o anda çalışır.** Risk limiti 409'unun ek alanları
    (`currentBalance`, `projectedBalance`, `riskLimit`) bugün de gösterilmez. Sistem sayfasında da yalnız metin kalır.
12. **Sayfa kartları ve dışa aktarma yalnız yüklü sayfayı kapsar.** "Bu sayfa" ipuçları korunmalı, yoksa kullanıcı tüm
    siparişlerin toplamı sanır.
13. **Kaydet sonrası gezinme:** yeni ve düzenlenen kayıt listeye döner. Bildirim oluşturma sekmesinde kalır ve listede
    görünmez (sekme örnekleri ayrıdır). Liste yeniden yüklemesi olayla gelir (G-SO17).
14. **"Bağımsız" metni** hem sütunda hem zincirde görünür. Sistem sayfası `quoteCode`'a değil `quoteId`'ye bakmalıdır (G-SO20).
15. **Testler:** `salesActionBar.test.tsx:255-289` (çubuk ve İşlemler içeriği), `salesDocumentForms.test.tsx:155-180, 389`
    (gövde eşitliği, Esc sorusu, akış), `salesLists.test.tsx:407-421` (kartlar, tonlar, panel zinciri, satır menüsü),
    `salesDocuments.test.tsx:287-340` (detay akışı, zincir, irsaliye alt formu). Sistem sayfası eşdeğerlik testleri bu
    beklentilerden türetilmelidir; özellikle POST gövdesi eşitliği (`:155-171`).

---

## 3. Satış İrsaliyeleri (`sales-deliveries`, `sales-delivery-create`)

Kısaltmalar (satır numaraları origin/master `7bc6deda`):

- `SDP` = `frontend/erp-web/src/SalesDeliveriesPage.tsx`
- `SFP` = `frontend/erp-web/src/StandaloneFulfillmentPanel.tsx`
- `SIFD` = `frontend/erp-web/src/sales/components/SalesInvoiceFromDeliveryDialog.tsx`
- `SP` = `frontend/erp-web/src/SalesPage.tsx`
- `P` = `src/Hosts/AIERP.Api/Program.cs`
- `SIDE` = `src/Hosts/AIERP.Api/StandaloneInventoryDocumentEndpoints.cs`
- `PC` = `src/Platform/AIERP.Platform.Application/PlatformContracts.cs`

**Önce çerçeve.** Bu ekranlarda iki ayrı belge ailesi ve iki ayrı tablo vardır. Brief'teki "siparişten ve bağımsız yeni
irsaliye" varsayımı koda uymaz:

| Aile | Tablo | Nasıl doğar | Listede görünür mü |
|---|---|---|---|
| **Satış irsaliyesi** (`SalesDelivery`) | `SalesDeliveries` | (a) Sipariş detayındaki "İrsaliye oluştur" (`SP:9730-9868, 10240-10362` → `POST /api/sales/orders/{id}/deliveries`, `P:4124-4274`). (b) Fatura ekranındaki pencerenin "Siparişten irsaliye oluştur" kipi (`SIFD:359-410`). (c) Siparişsiz satış faturası, bağlı irsaliyeyi kendisi yazar (`POST /api/sales/invoices`, `P:4872`). | Evet. `sales-deliveries` listesi yalnız bu tabloyu okur (`P:4322`). |
| **Siparişsiz satış irsaliyesi** (`StandaloneSalesDelivery`) | `StandaloneSalesDeliveries` | `sales-delivery-create` ekranı: taslak → "Kaydet ve stoğa işle" (`SFP`, `SIDE:13-91`). | **Hayır.** Yalnız formun altındaki şeritte görünür (ilk 100, sayfalama yok, `SFP:116-117, 705-771`). |

- `sales-delivery-create` **yalnız siparişsiz** taslak irsaliye ekranıdır. Sipariş seçimi, kalan miktar gösterimi ya da
  siparişe bağlı sevk bu ekranda **yoktur**. Siparişli sevk sipariş detayında yaşar. O akış aşağıda (3.1.4) "giriş
  noktası" olarak envanterlenmiştir; asıl yeri `sales-orders` envanteridir.
- Listedeki siparişsiz satırlar (`orderId = null`, "Bağımsız sevkiyat", `SDP:739`) siparişsiz faturanın yazdığı
  irsaliyelerdir. Bunların faturası her zaman zaten vardır (bkz. 3.8 R-SD3).
- Yönlendirme: `sales-deliveries` → `SalesDeliveriesScreenPage` → `SalesPage section="sales-deliveries"`;
  `sales-delivery-create` aynı sayfaya `createDeliveryPage` ile gider (`WorkspacePageRouter.tsx:371-374`,
  `SalesDeliveriesScreenPage.tsx:1-8`, `SP:2283-2292`). Başlıklar `App.tsx:646-647`. Menüde yeni sayfa listenin altına
  bağlıdır (`shell/moduleMenus.ts:21`).

### 3.1 Yerleşim

#### 3.1.1 Liste (`sales-deliveries`)

- **Veri ön yüklemesi:** `SalesPage` bu sekmede **bütün** teklifleri, siparişleri, faturaları ve carileri sayfa sayfa
  çeker (`loadAllPages`). Bunlara ek olarak ilk 100 stok kartını ve depoları da çeker (`SP:624-646`). Bunların hiçbiri
  listeyi beslemez; yalnız oluşturma formuna ve fatura alt formuna seçenek olarak geçer (`SP:2284-2292`).
- **Başlık:** "Satış İrsaliyeleri". Açıklama: "Sevk edilen sipariş satırlarını, depoları ve bağlı faturaları izleyin."
  Sayaç sunucu toplamıdır (`total`) (`SDP:605-610`). Başlık **sabittir**; `pageSettings` okunmaz.
- **Özet kartları** (`SDP:571-596`). İkisinin değeri de **yüklenen sayfadan** hesaplanır (ipucu "bu sayfa"):

| Kart | Değer | Davranış |
|---|---|---|
| Faturalanmamış (warn) | `status == Posted && !hasSalesInvoice` sayısı | **Süzgeçtir:** tıklayınca `unbilledOnly` açılır/kapanır, sayfa 1'e döner; kart `filterActive` ile basılı görünür |
| İptal | `status == Voided` sayısı | süzmez |

- **Hata şeridi:** kapatılabilir (`SDP:625-632`). Bildirim (notice) şeridi **yoktur**. İptal, silme ve fatura
  sonrasında başarı iletisi gösterilmez.
- **İşlem çubuğu** (`SDP:478-545`; kısayollar `commands/shortcuts.ts:6-18`, İşlemler Alt+İ). Çubuk "hedef" kayıt
  üzerinde çalışır. Hedef sırasıyla şudur: açık belge, yoksa odaklı satır (`selectedId`), yoksa tek işaretli satır
  (`SDP:482-485`).

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni | F2 | Belge açık değilken birincil. Açık belgeyi kapatır, oluşturma formunu açar (`SDP:488-494`). |
| Aç | Enter | Yalnız belge kapalıyken. Hedef yoksa "Önce bir kayıt seçin". Önce odaklı ızgara satırını (`focusedRecordId`) açar (`SDP:498-505`). |
| Sil | Ctrl+Delete | **Yalnız TenantAdmin'e kayıtlıdır** (diğer rollerde komut yok). Hedef yoksa "Önce bir kayıt seçin". `Voided` değilse "Sevk edilmiş irsaliye silinemez — İşlemler › İptal et". Onay sorar (tehlike): "İrsaliye silinsin mi?" / "… listeden kaldırılır; stok hareketleri ve denetim kayıtları korunur." (`SDP:428-453, 506-514`) |
| Yenile | F5 | Belge açıkken açık belgeyi yeniden okur (`documentOpenCommands`, `SDP:496`). Listedeyken `ListToolbar`'ın yedek komutuyla listeyi yeniler (`list-page/ListToolbar.tsx:104-114`). |
| Süz (arama odağı) | Ctrl+F | listedeyken arama kutusuna odaklanır (`ListToolbar.tsx:106-113`); belge açıkken pasif "Belge açıkken kullanılamaz" |
| Dışa aktar | Ctrl+E | Bu liste için kaydeden kod **bulunamadı** (ızgara `hideExport`, `SDP:649`; `ListToolbar` yalnız refresh/filter kaydeder). Belge açıkken pasif. **Doğrulanmadı.** |
| İşlemler → Faturalaştır | | Hedef `Posted` ve faturasız ise, faturalama alt formu da açık değilse görünür. Belge açıksa alt formu açar (`startOrderlessInvoice`). Listedeyken **siparişli** irsaliyede **gövdesiz POST ile hemen fatura keser, onay sormaz**. Siparişsizde belgeyi açıp alt formu açar (`SDP:517-528`). |
| İşlemler → Faturayı aç | | `invoiceId` varsa görünür. `SalesInvoiceModal`'ı açar (`SDP:529-530, 1020-1029`). |
| İşlemler → İptal et | | Hedef `Posted` ise görünür. Pasif olduğu durumlar: işlem sürerken "İşleniyor…"; TenantAdmin değilse "İrsaliye iptali için yönetici yetkisi gerekir."; fatura `Posted` ise "Önce bağlı satış faturasını iptal edin." Onay sorar: "… iptal edilecek. Stok çıkışı ters hareketle geri alınır." (`SDP:454-477, 531-543`). |
| İşlemler → CSV olarak dışa aktar | | Yalnız belge kapalıyken. Izgaranın yüklü satırlarını aktarır (`SDP:544`, `commands/gridCommands.ts:15-17`). |

- **Araç çubuğu** (`SDP:612-622`). Arama "İrsaliye, sipariş veya depo ara". Arama sunucudadır: 350 ms gecikmeli ya da Enter
  ile uygulanır, sayfayı 1'e alır (`ListToolbar.tsx:98, 116-140`, `SDP:617`). Sunucu ise **depo adında aramaz**. Aradığı
  alanlar: irsaliye kodu, sipariş kodu, sipariş müşterisinin adı ve faturanın müşteri adı (`P:4326-4331`). Ayrıca
  Yenile ve detay paneli anahtarı (`SalesListPanelToggle`, Ctrl+.) vardır.
- **Liste sütunları** (varsayılan `SDP:96-104`; görünüm `sales-deliveries`, `SDP:199-218`; hücreler `SDP:253-298`;
  genişlikler `sales/components/salesListCells.tsx:38-40`):

| Alan | Etiket | Gösterim |
|---|---|---|
| `code` | İrsaliye no | mono bağlantı düğmesi. Tıklayınca satırı seçer **ve belgeyi açar** (`SDP:258-273`). |
| `orderCode` | Sipariş no | yoksa — |
| `deliveryDate` | Sevk tarihi | `gg.aa.yyyy` (metin bölme) |
| `warehouseName` | Depo | metin |
| `lineCount` | Satır | sayı (sağa) |
| `status` | Durum | etiket: Posted "Sevk edildi" (ok), Voided "İptal" (bad), Deleted "Silindi" (`document-page/documentStatus.ts:41-49`, `sales/salesListStatus.ts:25`) |
| `invoiceStatus` | Fatura | `invoiceId` varsa satır içi "Faturayı aç" düğmesi, yoksa "Yok". **Fatura durumu yazmaz:** iptal edilmiş fatura da "Faturayı aç" gösterir. |
| `actions` | İşlemler | sabit alan; çizilmez (`SDP:219-222`) |

- **Izgara:** `SalesDocumentGrid` (`SDP:647-685`). İşaret sütunu vardır. Tık seçer, çift tık / Enter açar. Toplu eylem
  "Excel (seçilenler)" yalnız liste görünürken çalışır. Sunucu sayfalaması 25'tir.
- **Boş durumlar** (`SDP:654-657`): "İrsaliyeler yükleniyor…", "Henüz satış irsaliyesi yok. İrsaliye, açık sipariş
  ayrıntısından oluşturulur.", "Aramanızla eşleşen irsaliye yok."
- **Alt bilgi:** `SalesListFooter`: işaretli sayısı, gösterilen/toplam, sayfa düğmeleri (`SDP:671-681`).
- **Detay paneli** (`sales/components/SalesListPanels.tsx:257-298`, kanca `sales/useSalesListPanel.ts:22-57`). Panel
  geniş ekranda varsayılan açıktır. Seçili satır değişince 150 ms sonra `GET /api/sales/deliveries/{id}` çağrılır; geç
  gelen yanıt atılır. Seçim yokken "Satış irsaliyesi özeti / Özetini görmek için listeden bir irsaliye seçin." gösterilir
  (`SalesListPanels.tsx:89-98`). Üstte kod, depo adı (başlık olarak), durum etiketi, "Aç" ve kapat vardır.
  - Sekmeler: **Özet** ve **Satırlar**. Özet: Sevk tarihi, Depo, Satır sayısı. Belge zinciri: sipariş (kod), "Bu
    irsaliye", fatura (**yalnız durum**, numara yok).
  - Satırlar: stok kodu/adı, miktar ve birim; tutar yok (`currency=""`).
- **Belge detayı** (`DocumentSurface`, `SDP:690-1019`; Esc kapatır, `SDP:150-157`). Başlık "Satış irsaliyesi" + kod +
  durum. Meta: sevk tarihi. Durum akışı Sevk edildi → Faturalandı, son durum İptal (`sales/salesDocumentDetail.tsx:62-74`).
  "Faturalandı" yalnız fatura `Posted` ise geçerli adımdır. Yan panel "Belge zinciri"dir: sipariş, bu irsaliye, fatura
  (durum + aç). İpucu "Alt+İ işlemler". Alt durumda satır sayısı ve fiyat varsa genel toplam gösterilir.
  - Sekme **İrsaliye Bilgileri** (`SDP:734-790`): Bağlı sipariş ("Bağımsız sevkiyat"), Sevk deposu, Sevk tarihi ve
    Fatura durumu ("Faturası kesildi" / "Fatura iptal edildi" / "Fatura bekliyor"). Satır tablosu: #, Stok kartı (kod +
    ad), Sipariş satırı, Sevk miktarı + birim. Boşsa "İrsaliye kalemi bulunamadı.".
  - Toplamlar **istemcide** hesaplanır. Fiyat, iskonto ve KDV siparişin satırından gelir. Kalemler: Mal/hizmet toplamı,
    "− iskonto", oran başına KDV matrahı ve KDV, KDV toplamı, "Genel toplam · Ödenecek tutar". Döviz TRY ise "TL" yazılır.
    Hiç fiyat yoksa (siparişsiz) toplam bloğu gizlenir (`SDP:223-252, 783-788`). Bu toplam **faturanın toplamı değildir**:
    vergi profili ve perakende ayrımı yoktur.
  - Sekme **Fatura İşlemleri** (sayaç 0/1, `SDP:791-1017`): bkz. 3.1.5.
- **Pencereler:** `SalesInvoiceModal` ("Faturayı aç"; kendi işlem çubuğunu tutar, `SDP:601, 1020-1029`) ve ortak
  onay penceresi (`confirmDialog`).

#### 3.1.2 Yeni irsaliye (`sales-delivery-create`) = siparişsiz taslak

`SDP:633-643` → `StandaloneFulfillmentPanel sales` (`SFP:22-916`). Liste başlığı ve araç çubuğu gizlenir
(`SDP:603`).

- **Açılış:** form boştur. Tarih bugündür. Cari, `initialCustomerId` ile gelebilir: cari ekranının "Yeni irsaliye"
  komutu `sessionStorage` ya da `nexora:customer-sales-action` olayıyla gönderir (`SP:126-140, 200-232`, `SDP:79-94`,
  `SFP:111-113`). Aynı anda `GET /api/sales/standalone-deliveries/?page=1&pageSize=100` ile alttaki şerit yüklenir
  (`SFP:114-127`).
- **Kayıt formu** (`RecordFormPage variant="page"`, `SFP:473-515`). Belge başlığı "Satış irsaliyesi"; kod ve cari adı
  yazıldıkça başlığa yansır. Durum akışı: Taslak (geçerli) → Sevk edildi → Faturalandı. İpuçları: satır ekleme
  (Ctrl+Shift+Enter) ve Alt+İ. Form başlığı "Siparişsiz satış irsaliyesi". Kaydet düğmesi "Taslak oluştur" / düzenlemede
  "Taslağı güncelle" (Ctrl+S). `formId="sales-delivery-create-form"`. Vazgeç (Esc): düzenleme varsa düzenlemeyi
  bırakır, yoksa listeye döner (`onCancel`). Temizle (`onReset`) ve hata şeridi vardır.
- **İşlem çubuğu:** `Yeni` (F2) kaydedilmemiş değişiklik varsa önce sorar (`confirmStartNew`), sonra formu sıfırlar
  (`SFP:462-472`). Formun kirli sayılma koşulu: düzenleme, kod ya da başlangıçtan farklı cari, ya da stok seçilmiş satır
  (`SFP:457-459`).
- **Durum çubuğu:** "Kaydetme stok çıkışı oluşturur; fatura daha sonra kesilir." (**yanlış**: taslak stok çıkışı yazmaz,
  bkz. 3.8), bildirim metni ve "Satır: n" (`SFP:502-514`).
- **Belge bilgileri** (`SFP:516-589`; "* zorunlu alan"):

| Alan | Zorunlu | İstemci | Sunucu (`SIDE:30-66, 511-520`) |
|---|---|---|---|
| İrsaliye kodu | * | mono, `maxLength 40`, yer tutucu "IRS-2026-001". **Elle girilir**; numaralandırma yok. | trim, 1–40, kontrol karakteri yok, firmada benzersiz (409 "İrsaliye kodu zaten kullanılıyor.") |
| Müşteri | * | aranabilir seçici "kod · ad". Seçenekler: aktif ve `type != Supplier`, **Employee dahil** (`SFP:107-110`). | aktif, Supplier ve Employee değil (400) |
| Depo | * | düz seçim, yalnız aktif depolar. Değişince satırların depo gözü temizlenir (`SFP:557-577`). | var (400), aktif (409) |
| Tarih | * | `date`, varsayılan bugün | `deliveryDate` (kapalı dönem denetimi yalnız kayıtta, `SIDE:383`) |

- **Adres / sevk adresi:** **yok.** Ne formda ne sözleşmede alan vardır (`SIDE:543`; `SalesDelivery`
  `Domain/Entities.cs:2455-2470`).
- **Satır ızgarası** (`SalesFormLines` + tablo, `SFP:590-642`). Üst not: "Lot / seri takipli stoklarda takip kodu
  zorunludur."

| Sütun | Görünürlük | Giriş |
|---|---|---|
| # | her zaman | satır no. Birden çok satır varsa "×" ile kaldırılır. |
| Stok kartı | her zaman | aranabilir seçici "kod · ad (birim)". Yalnız aktif kartlar; liste **önceden yüklenmiş ilk 100 karttır** (`SP:157-163`). |
| Miktar | her zaman | `number`, min 0,0001, adım 0,0001, zorunlu |
| Birim | her zaman | **salt okunur:** kartın ana birimi. Birim seçimi yok; gövdede kartın birimi gider (`SFP:167-168`). |
| Depo gözü | yalnız depoda aktif göz varsa (`GET /api/warehouses/{id}/locations`, `SFP:128-145`) | seçim; "Depo düzeyinde" boş |
| Lot / seri kodu | sütun herhangi bir satır takipliyse; hücre yalnız takipli satırda | metin, zorunlu, ≤ 80 |
| Son kullanma tarihi | sütun herhangi bir satır `Lot` ise; hücre yalnız Lot satırında | `date`, zorunlu |

  Son satır "Satır ekle" düğmesidir (Ctrl+Shift+Enter, `SFP:633-639`). Sunucu sınırı 1–200 satırdır. Seri için
  miktar 1 olmalı ve SKT girilmemelidir; Lot için kod ve SKT zorunludur; takipsiz satıra lot yazılamaz (`SIDE:521-527`).
- **Kaydet** (`SFP:146-205`). Gönderilen gövde: `{requestId (her tıklamada yeni), code, customerId, supplierId (aynı
  değer, kullanılmaz), warehouseId, deliveryDate, lines[{stockItemId, quantity, unitCode, unitCostBase, trackingCode,
  expiryDate, storageLocationId}]}`. Kaydet `POST`'tur, düzenlemede `PUT /{id}` olur. Önce istemcide "En az bir stok
  satırı ekleyin." denetimi yapılır. Başarıda form **tümüyle** sıfırlanır; cari de `initialCustomerId`'ye değil boşa
  döner. Bildirim: "Taslak oluşturuldu. … stok hareketi için listedeki Kaydet düğmesini kullanın."
- **Alttaki taslak/kayıt şeridi** (`SFP:705-771`). Satır biçimi: "kod · müşteri", tarih (ham ISO), "n satır", durum
  (Taslak / Kaydedildi / İptal) ve faturalıysa "· Faturalı". Satır düğmeleri:
  - **Taslak:** "Düzenle" (`GET /{id}`, formu doldurur, `SFP:206-248`), "Kaydet ve stoğa işle" (`POST /{id}/post`
    `{}`, **onaysız**, `SFP:272-292`), "Taslağı sil" (onay "Taslak silinsin mi?", `DELETE`).
  - **Kaydedildi + faturasız:** "Fatura oluştur" (3.1.6) ve "Ters hareketle iptal et" (onay "Belge iptal edilsin mi?" /
    "… ters stok hareketiyle iptal edilecek.", `POST /{id}/void`, `SFP:359-393`). Kaydedildi + faturalı: düğme yok.
  - Şerit 100 kayıtta kesilir. Arama, süzgeç ve sayfalama yoktur. Listede tıklanıp açılan bir detay da yoktur.

#### 3.1.3 Sevk tarihi, iptal / ters kayıt (özet)

- **Siparişli irsaliye:** sevk tarihi formdan gelir, kapalı döneme düşemez (`P:4152-4154`). İptalin ters hareketi
  **sunucu tarihiyle (UTC bugün)** yazılır. O tarih kapalı dönemdeyse iptal reddedilir (`P:4382-4385`). İptal yevmiyeye
  aktarılmış irsaliyede ve `Posted` faturası olan irsaliyede reddedilir (`P:4395-4398`). Rezervasyonun karşılanan miktarı
  geri alınır. Sipariş durumu yeniden hesaplanır (Fulfilled ↔ Open) (`P:4399-4428`).
- **Siparişsiz irsaliye:** ters hareket de UTC bugün tarihlidir (`SIDE:458`). `Posted` fatura varsa 409 döner: "…
  Önce faturayı iade/ters kayıt süreciyle düzeltin …" (`SIDE:466-468`). Ters çıkışta stok kontrolü yapılmaz; kontrol
  yalnız ters giriş yönünde çalışır (`SIDE:493-504`). Sonuçta satışta ters hareket stok girişidir.
- **Silme:** yalnız siparişli irsaliyede, `Voided` → `Deleted` geçişiyle (yumuşak) yapılır (`P:4360-4373`).
  Siparişsizde yalnız taslak silinir; silme gerçek silmedir (`SIDE:80-87`).

#### 3.1.4 Siparişten irsaliye (giriş noktası; `sales-orders` detayında)

- İşlemler → "İrsaliye oluştur" ve bölüm düğmesi (`SP:9932-9946, 10370-10394`). Komut yalnız sipariş `Open` iken
  görünür. Pasif olduğu durumlar: "Kaydediliyor…", "Aktif depo yok.", "Sevk edilecek kalan miktar yok.".
- `startDelivery` (`SP:9730-9772`):
  - `requestId` **editör her açılışta** yeniden üretilir; aynı editörden yapılan yeniden denemede aynı kalır.
  - Depo varsayılanı: rezervasyonun deposu, yoksa ilk aktif depo. Depo gözleri yüklenir.
  - Miktar varsayılanı: rezervasyon varsa `min(kalan, rezervede kalan)`, yoksa kalan.
  - Her satırın birim dönüşümleri `GET /api/stock/items/{id}/units` ile **satır başına** çekilir.
- Form "Satış irsaliyesi" (`SP:10240-10362`). Kaydet "İrsaliye oluştur"; depo yoksa pasif ("Kaydetmek için depo
  seçin."). Durum metni: "Konum seçimi isteğe bağlıdır; stok, seçilen konum ve depoda doğrulanır." Sevk Bilgileri: Depo
  (aranabilir), Sevk tarihi. "Teslim Edilecek Kalemler" yalnız `remainingQuantity > 0` olan satırları listeler. Her
  satırda şunlar vardır: kod, "ad · siparişte kalan n birim", **teslim birimi seçimi** (ana birim + etkin dönüşümler),
  miktar (`number`, 0,0001), **satır başına depo gözü** ("Depo düzeyinde").
- **Lot / seri seçilmez.** Sunucu takipli kartta kullanılabilir lot/seriyi kendisi dağıtır
  (`AllocateAvailableTrackingAsync`, `P:4251-4252`). Yoksa 409 döner: "… lot/seri bazında sevk edilebilir miktar yok."
- Kaydet (`SP:9835-9868`): miktarı 0 olan satırlar atılır. Hiç satır kalmazsa "En az bir satır için teslim miktarı
  girin." uyarısı çıkar. Başarı iletisi: "İrsaliye oluşturuldu ve stok çıkışı kaydedildi."
- Sipariş detayındaki "İrsaliyeler" listesi (`GET /api/sales/deliveries/?orderId=&pageSize=100`, `SP:9626-9641,
  10396-10445`). Satırda kod, tarih, depo, satır sayısı ve durum vardır. Düğmeler:
  - "Fatura kes": gövdesiz POST, onaysız (`SP:9869-9888`).
  - "Faturayı aç".
  - "İptal et": **rol denetimi yok** (`SP:10432-10442`; liste ekranında yalnız TenantAdmin).

#### 3.1.5 İrsaliye detayındaki fatura alt formu (`SDP:791-1017`)

- Bölüm başlığı "Fatura oluşturulmuş" ya da "Henüz fatura yok". Açıklama: fatura durumu, ya da siparişliyse
  "Bu irsaliyeyi faturalaştırarak satış faturasını ve cari borç kaydını oluşturun.", ya da siparişsizse "Faturayı
  daha sonra bu irsaliyedeki miktarları değiştirmeden oluşturabilirsiniz.".
- Bölüm eylemi: fatura varsa "Faturayı aç". Yoksa ve irsaliye `Posted` ise birincil düğme "Faturalaştır" (siparişli) ya
  da "Fatura bilgilerini gir" (siparişsiz) olur. Düğme, iki durumda da alt formu açar (`startOrderlessInvoice`:
  irsaliyeyi yeniden okur, satırları fiyat 0, iskonto 0, KDV 20 ile doldurur; `SDP:314-341`).
- Alt form "Fatura bilgileri" (`RecordFormPage variant="dialog"`, `ownSave`). Kaydet "Faturayı oluştur". Siparişsizde
  müşteri seçilmeden pasiftir: "Kaydetmek için müşteri seçin.". Durum metni: "Sipariş fiyatları kullanılır." ya da
  "<cari dövizi> · KDV/iskonto oranlarını doğrulayın".
  - **Siparişli:** yalnız not "Fatura fiyatları sipariş satırlarından alınır. Zorunlu fatura özel alanlarını
    tamamlayın." ve özel alanlar gösterilir. Gövde: `{customFields}`.
  - **Siparişsiz:** Fatura Kimliği (Müşteri * = aktif ve Supplier olmayan, "kod · ad (döviz)"; Fatura tarihi *). Fatura
    Satırları tablosu: İrsaliye satırı (kod · ad), Miktar (salt okunur), Birim fiyat (min 0, adım 0,0001, zorunlu),
    İskonto % (0–100), KDV % (0–100). Not: "Bu işlem yalnızca faturayı ve cari borç kaydını oluşturur; irsaliyedeki stok
    çıkışı tekrarlanmaz.". Gövde: `{customerId, invoiceDate, customFields, lines[{orderLineNumber, unitPrice,
    discountPercent, vatPercent}]}` (`SDP:838-856`).
  - **Fatura Özel Alanları** (`GET /api/sales/invoices/custom-fields`, `SDP:185-198, 364-427`). Türe göre giriş:
    Boolean → Seçin/Evet/Hayır; Decimal → number; Date → date; Text → `maxLength`. Zorunlu olanlar "*" taşır.
  - Bu alt formda **e-belge, vergi profili ve fatura türü yoktur** (Wholesale varsayılır).
- Başarıda alt form kapanır, fatura penceresi (`SalesInvoiceModal`) açılır, liste ve belge yeniden yüklenir
  (`SDP:342-363`).

#### 3.1.6 İrsaliyeden fatura: diğer pencereler

**(a) `SalesInvoiceFromDeliveryDialog` (fatura ekranı `sales-invoices` → Yeni; `SP:10774-10806`)**

- Pencere ya tam sayfadır ya modal. Başlık "SATIŞ · FATURALAMA" / "Yeni satış faturası" ya da "Siparişten irsaliye ve
  fatura". Kapat düğmesi işlem sürerken pasiftir. Arka plana tıklayınca kapanır (fatura işlemi sürmüyorsa)
  (`SIFD:640-686`).
- Üç kipli sekme "Fatura oluşturma yöntemi" (`SIFD:687-713`; tam sayfada gizli): **Mevcut irsaliyeden**, **Siparişten
  irsaliye oluştur**, **Siparişsiz fatura + irsaliye**.
- Ortak "Fatura türü" seçimi (`SIFD:635-639, 714-718`): "Perakende satış · KDV dâhil" / "Toptan satış · KDV hariç"
  (varsayılan Toptan).
- **E-belge ve e-ticaret bilgileri** (`SIFD:98-152`):
  - Belge senaryosu: TEMELFATURA, TICARIFATURA, EARSIVFATURA, IHRACAT, YOLCUBERABERFATURA, KAMU, HKS, ENERJI,
    ILAC_TIBBICIHAZ.
  - Belge tür kodu: SATIS (varsayılan), IADE, TEVKIFAT, ISTISNA, OZELMATRAH, IHRACKAYITLI, TEVKIFATIADE, HKSSATIS,
    HKSKOMISYONCU.
  - "Ek bilgiler" açılır bölümü **senaryoya göre** değişir. TEMELFATURA / TICARIFATURA / KAMU: alıcı etiketi.
    EARSIVFATURA: satın alma URL'si, aracı firma VKN/ünvan/etiket, ödeme aracısı, ödeme türü/yöntemi/notu, aracı firma
    ülke/kod/şehir/ilçe, ödeme tarihi ve son ödeme tarihi (`datetime-local` → ISO). Senaryo seçilince her zaman
    taşıyıcı VKN, ad ve soyad ile sevk tarihi eklenir.
  - İpucu: "Seçilen senaryonun alanları" ya da "Devam etmek için belge senaryosunu seçin".
- **Vergi mevzuatı profili** (`SIFD:182-213`). `GET /api/finance/general-ledger/rule-profiles` çağrılır; yalnız aktif ve
  `parametersJson.taxRules` dolu profiller listelenir. Varsayılan sırası: `defaultForDocuments`, yoksa `TR-LOCAL`, yoksa
  ilk profil. Liste boşsa bölüm çizilmez. Seçim zorunludur. Not: "Fatura vergileri seçilen ülke profiline göre
  hesaplanır."
- **Mevcut irsaliyeden** (`SIFD:719-813`). Sırasıyla: e-belge alanları, profil, arama "İrsaliye no, sipariş no veya
  müşteriyle ara" ve hata. Arama `SP:10531-10561` üzerinden `GET /api/sales/deliveries/?unbilledOnly=true&q=&page=&pageSize=25`
  çağırır, 250 ms gecikmelidir.
  - Liste en çok 420 px yükseklikte kayar. Satır: "kod · sipariş kodu", tarih · n satır · depo. Satır düğmesi "Fatura
    kes" (işlemdeyken "Oluşturuluyor…").
  - Boş durumlar: "İrsaliyeler yükleniyor…", "Aramanızla eşleşen faturalanmamış irsaliye yok.", "Faturalanmamış,
    kaydedilmiş irsaliye bulunmuyor.".
  - Alt bilgi "n faturalanmamış irsaliye · Sayfa x / y" + Önceki / Sonraki / Kapat.
  - Gövde: `{eDocument, accountingProfileCode, invoiceType}` (`SP:10562-10577`). **Fatura özel alanları bu kipte ne
    çizilir ne gönderilir;** zorunlu özel alan varsa sunucu 400 döner. Başarıda pencere kapanır, fatura açılır.
- **Siparişten irsaliye oluştur** (`SIFD:359-410, 814-955`):
  - "Açık satış siparişi" seçimi (önceden yüklenmiş siparişlerden `Open` olanlar; "kod · müşteri · döviz tutar").
  - Seçilince `GET /api/sales/orders/{id}`. "Sevk deposu" seçimi rezervasyon tek depodaysa o depoya kilitlenir; değilse
    ilk depo seçilir.
  - "İrsaliye tarihi". Kalan satırlar salt okunurdur ("Faturalanacak kalan miktar: …"). **Kısmi miktar girilemez:**
    bütün kalan sevk edilir. Kalan yoksa "Bu siparişte sevk edilebilir miktar kalmamış.".
  - Ardından özel alanlar, e-belge, profil ve açıklama gelir.
  - Düğme "İrsaliye ve faturayı oluştur". Pasif olduğu durumlar: sipariş, depo, yükleme, işlem, rezervasyonlar birden
    çok depoda, kalan yok.
  - **İki ayrı çağrıdır:** önce `POST /orders/{id}/deliveries` (`requestId` her tıklamada yeni), sonra `POST
    /deliveries/{id}/invoice` `{customFields, eDocument, accountingProfileCode, invoiceType}`. İkincisi düşerse ileti
    "İrsaliye X oluşturuldu ancak fatura kesilemedi: … İrsaliyeler ekranından faturalaştırmayı tekrar deneyin."
    olur (`SIFD:359-410`).
- **Siparişsiz fatura + irsaliye** (`SIFD:956-1191`): `POST /api/sales/invoices` ile fatura yazılır; irsaliyeyi sunucu
  kendisi doğurur (`P:4735-4914`). Bu kip **satış faturası envanterinin** konusudur; burada yalnız listedeki
  siparişsiz satırların kaynağı olarak anılır.

**(b) Siparişsiz irsaliyeden fatura (`SFP:293-358, 772-913`)**

- Modal "<kod> için fatura oluştur". Kaydet "Faturayı kaydet". Durum: "Müşteri: …" ve "Fatura ve cari borç kaydı
  oluşturulur. Sevkiyatta kaydedilen stok çıkışı değişmez.".
- Fatura tarihi *. "E-belge Bilgileri" açılır bölümü **serbest metin** girişlerdir: Senaryo (yer tutucu "TEMELFATURA /
  EARSIVFATURA"), tür kodu, alıcı etiketi, URL, aracı firma alanları, ödeme alanları, taşıyıcı ve sevk tarihi. Senaryoya
  göre gizleme yoktur.
- Satırlar: Stok, Miktar (salt okunur), Birim fiyat (zorunlu), İskonto %, KDV % (varsayılan 0 / 0 / 20).
- Gövde: `{invoiceDate, lines[{lineNumber, unitPrice, discountPercent, vatPercent}], eDocument}`. **Özel alan, profil ve
  fatura türü gönderilmez;** sözleşmede profil ve tür alanı yoktur (`SIDE:545`).

### 3.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Sekme açılışı | `GET /api/sales/quotes/`, `/orders/`, `/invoices/`, `/api/customers/` (hepsi tüm sayfalar), `GET /api/stock/items/?page=1&pageSize=100`, `GET /api/warehouses/` | — | ilgili `read` izinleri | `SP:624-646`; listeyle ilgisiz ağır ön yükleme. Biri düşerse sekme hata gösterir. |
| Liste açılışı, sayfa/arama/süzgeç | `GET /api/sales/deliveries/` | `page`, `pageSize=25`, `q?`, `unbilledOnly?`; (`orderId?` sipariş detayında) | `erp.sales-deliveries.read` | `P:4318-4339`. `Deleted` hariç; sıra tarih ↓, oluşturma ↓. `pageSize` 1–100. **Satır süzgeci yok** (`PermissionStatusFilter` çağrılmaz). `SalesDeliveryPage{items, page, pageSize, totalCount}`. Öğe `SalesDeliverySummary` (`PC:281-283`). |
| Açılış | `GET /api/screen-views/sales-deliveries/active` | — | `erp.screen-views.read` | yalnız `fields`; hata sessiz (`SDP:199-218`) |
| Açılış | `GET /api/sales/invoices/custom-fields` | — | `erp.sales-invoices.read` | aktif tanımlar, etikete göre (`P:4579-4584`); hata sessiz |
| Belge aç / panel | `GET /api/sales/deliveries/{id}` | — | `erp.sales-deliveries.read` | `P:4340-4359`. `SalesDeliveryView` (`PC:284-286`): satırda sipariş satırının fiyat/iskonto/KDV'si ve sipariş dövizi, konum (ters olmayan harekette). `hasSalesInvoice`, `invoiceStatus`, `invoiceId`. **Girilen miktar/birim döndürülmez** (`EnteredQuantity` sözleşmede var ama doldurulmaz). |
| Sil | `DELETE /api/sales/deliveries/{id}` | — | `erp.sales-deliveries.delete` + **işleyicide TenantAdmin** | `P:4360-4373`; yalnız `Voided` (409); yumuşak silme |
| İptal et | `POST /api/sales/deliveries/{id}/void` | gövde yok | `erp.sales-deliveries.execute` (`void` yürütme segmenti, `PlatformPermissionCatalog.cs:387-398`) | `P:4374-4433`. **İşleyicide rol denetimi yok.** İkinci iptal 409. Yanıt `{id, code, deliveryStatus, orderStatus}`. |
| Faturalaştır / Fatura kes / Faturayı oluştur | `POST /api/sales/deliveries/{id}/invoice` | gövde isteğe bağlı: `SalesDeliveryInvoiceWriteRequest{customerId, invoiceDate, lines[{orderLineNumber, unitPrice, discountPercent, vatPercent, isVatIncluded}], customFields, eDocument, accountingProfileCode, invoiceType, notes}` (`PC:288-289`) | `erp.sales-deliveries.create` ("invoice" yürütme segmenti değil) | `P:4434-4580`. Yeni ise 201, aynı irsaliyeye var olan fatura varsa **200** ile o fatura döner. Farklı tür/profil/e-belge ile gelirse 409. `SalesInvoiceSummary`. |
| Siparişten irsaliye | `POST /api/sales/orders/{id}/deliveries` | `SalesDeliveryWriteRequest{requestId*, warehouseId*, deliveryDate, lines[{orderLineNumber, quantity, unitCode?, storageLocationId?}]}` (`PC:275-276`) | `erp.sales-orders.create` (sipariş öznitelikleriyle) | `P:4124-4274`. 201 + `SalesDeliverySummary`. Aynı anahtar ve içerikle tekrar gelirse yine 201 ve aynı kayıt döner (yeniden oynatma). |
| Sipariş detayı | `GET /api/sales/orders/{id}`, `GET /api/stock/items/{id}/units` (satır başına), `GET /api/warehouses/{id}/locations` | — | `sales-orders.read`, `stock-items.read`, `warehouses.read` | `SP:9690-9772`, `P:4290-4316` |
| Fatura ekranı penceresi | `GET /api/sales/deliveries/?unbilledOnly=true&q&page&pageSize=25`; `GET /api/finance/general-ledger/rule-profiles` | — | `sales-deliveries.read`, `general-ledger.read` | `SP:10531-10561`, `SIFD:182-200` |
| Yeni irsaliye açılışı | `GET /api/sales/standalone-deliveries/?page=1&pageSize=100` | `page`, `pageSize` (varsayılan 50, en çok 100) | `erp.sales-deliveries.read` (**satır süzgeçli**: durum ve müşteri) | `SIDE:14-29`. Anonim nesne `{id, code, customerId, customerName, warehouseId, warehouseName, date, status, lineCount, createdAt, invoiceId}` + `{items, page, pageSize, totalCount}` |
| Depo seçilince | `GET /api/warehouses/{id}/locations` | — | `erp.warehouses.read` | yalnız aktif gözler istemcide süzülür |
| Taslak oluştur | `POST /api/sales/standalone-deliveries/` | `StandaloneSalesDeliveryWrite{requestId, code, customerId, warehouseId, deliveryDate, lines[{stockItemId, quantity, unitCode?, trackingCode?, expiryDate?, storageLocationId?}]}` (`SIDE:543-544`) | `erp.sales-deliveries.create` | `SIDE:30-68`. 201 `{id, code, status}`. Aynı `requestId` ve aynı kodla gelirse 200, farklı kodla 409. |
| Taslak güncelle | `PUT /api/sales/standalone-deliveries/{id}` | aynı gövde | `erp.sales-deliveries.update` | `SIDE:285-325`; yalnız `Draft` (409); satırlar baştan yazılır |
| Taslak düzenle | `GET /api/sales/standalone-deliveries/{id}` | — | `read` | `SIDE:70-79`; anonim nesne; satırlarda `lineNumber`, girilen miktar/birim, lot, SKT, göz |
| Taslak sil | `DELETE /api/sales/standalone-deliveries/{id}` | — | `erp.sales-deliveries.delete` | `SIDE:80-87`; yalnız `Draft`; gerçek silme; **rol denetimi yok** |
| Kaydet ve stoğa işle | `POST /api/sales/standalone-deliveries/{id}/post` | `StandalonePostRequest{tracking?[{lineId, trackingCode, quantity, expiryDate}]}`; ekran `{}` gönderir | `erp.sales-deliveries.execute` | `SIDE:370-405, 406-452`. Zaten `Posted` ise 200. |
| Ters hareketle iptal | `POST /api/sales/standalone-deliveries/{id}/void` | — | `erp.sales-deliveries.execute` | `SIDE:454-485`. Zaten `Voided` ise 200 `{reversalCount:0}`. |
| Fatura oluştur (siparişsiz) | `POST /api/sales/standalone-deliveries/{id}/invoice` | `StandaloneSalesDeliveryInvoiceWrite{invoiceDate, lines[{lineNumber, unitPrice, discountPercent, vatPercent}], customFields?, eDocument?, notes?}` (`SIDE:545-546`) | `erp.sales-deliveries.create` | `SIDE:166-283`. Var olan fatura varsa 200. |
| Faturayı aç | `SalesInvoiceModal` içindeki çağrılar | | `erp.sales-invoices.*` | satış faturası envanteri |

Ayrıca yardımcı için `GET /api/sales/deliveries/search?q=` ve `/search/details?code=` vardır (`SalesDeliverySearchEndpoints.cs:11-77`;
2–100 karakter; ilki ilk 10 sonucu ve `hasMore`'u, ikincisi tam kodla en çok 50 satırı döndürür). Ekran kullanmaz.

### 3.3 Kurallar

- **Durum makinesi.**
  - Siparişli: `Posted` (doğuşta) → `Voided` → `Deleted` (`Domain/Entities.cs:2453`). Taslak yoktur; kayıt anında stok
    düşer.
  - Siparişsiz: `Draft` → `Posted` → `Voided` (`Domain/Entities.cs:1754`). Taslak düzenlenir ve silinir; yalnız `post`
    stoğu düşürür.
  - "Faturalandı" ayrı bir durum değildir; bağlı faturanın varlığından ve durumundan türetilir.
- **Fatura bağı kalıcıdır.** `SalesInvoice.DeliveryId` benzersizdir (`PlatformDbContext.cs:1876`). Fatura iptali
  bağı koparmaz (`P:5321-5355`, yalnız `Status = Voided`). İrsaliye endpoint'i var olan faturayı durumuna bakmadan
  döndürür (`P:4445-4459`). Sonuç: **iptal edilmiş faturası olan irsaliye yeniden faturalanamaz.** Listede de
  "Faturalanmamış" sayılmaz (`unbilledOnly`, `P:4324-4325`). Tek yol irsaliyeyi iptal edip yeniden sevk etmektir.
- **Stok yeterliliği (siparişli, `P:4205-4236`):**
  - Seçilen göz bakiyesi ≥ istenen olmalıdır (göz için negatif izin yok).
  - Depo bakiyesi − **başka siparişlerin** aktif rezervasyonları + bu siparişin tükettiği rezervasyon ≥ istenen olmalıdır.
  - Negatif stok ayarı `CanPostNegativeBalance` ile bunu gevşetir: ayar açık ve başka rezervasyon yok, takip ve göz
    koşulları uygun olmalıdır.
- **Stok yeterliliği (siparişsiz, `SIDE:410-430`):** depo bakiyesi − tüm aktif rezervasyonlar kontrol edilir. Göz
  bakiyesinde negatif yalnız ayar açıksa ve kart takipsizse geçer. **Lot/seri bazında bakiye denetlenmez:** satıra
  yazılan kod doğrudan hareket izine yazılır (`SIDE:431-450`). Bu bir **kod çıkarımıdır**; `PostLines` içinde
  lot bakiyesi okunmuyor.
- **Kısmi sevk** (yalnız siparişli; `P:4186-4204, 4262-4263`):
  - Satır başına kalan = sipariş miktarı − `Posted` irsaliyelerde sevk edilen. İstenen kalanı aşarsa 409 döner, gövdede
    `remainingQuantity` vardır.
  - Rezervasyonlu satırda depo rezervasyon deposu olmalıdır (409 `reservationWarehouseId`). Miktar rezervede kalanı
    aşamaz.
  - Bütün satırlar karşılanınca sipariş `Fulfilled` olur; iptal geri `Open`'a çevirir (`P:4422-4428`).
- **Birim:** siparişli satırda girilen birim kartın etkin dönüşümüyle ana birime çevrilir. Sonuç pozitif ve ≤ 4
  ondalık olmalıdır (`P:4175-4184`). Satırda girilen miktar ve birim saklanır. Siparişsiz satırda da çevrilir
  (`SIDE:50-56`), ama ekran her zaman ana birimi gönderir.
- **Doğrulama (siparişli, `PC:1077-1098`):** `requestId` ve depo zorunludur. 1–100 satır. Sipariş satırı > 0, her satır
  bir kez. Miktar > 0 ve ≤ 4 ondalık. Siparişsiz: 1–200 satır (`SIDE:511-520`).
- **Sevk edilebilirlik:** yalnız `Open` sipariş, aktif depo, aktif göz (pasif göz 409) ve aktif stok kartı sevk edilir
  (`P:4155-4174`).
- **Faturalama kuralları (`P:4434-4580`):**
  - Yalnız `Posted` irsaliye faturalanır.
  - Siparişli irsaliyede fiyat, iskonto ve KDV sipariş satırından gelir; müşteri dövizi sipariş dövizine eşit olmalıdır
    (409, `P:4496`).
  - Siparişsiz irsaliyede müşteri ve 1–200 satır zorunludur; satırlar irsaliye satırlarıyla **birebir** eşleşmelidir
    (`P:4482-4511`).
  - Müşteri aktif ve `Customer`/`Both`/`Dealer` türünde olmalıdır. Kapalı dönem reddedilir. Vergi profili çözülür
    (`P:4497`).
  - Genel toplam > 0 olmalıdır (`P:4530`). Özel alanlar (zorunlu dahil) doğrulanır (`P:4531`).
  - **Risk limiti** uygulanır: bakiye + fatura > limit ise 409 (`P:4532-4538`).
  - Cari borç hareketi yazılır. Fatura numarası e-belge senaryosuna göre seriden alınır.
- **Numaralandırma:** siparişli irsaliye kodu `TenantDocumentNumbering.NextAsync("SalesDelivery", …, deliveryDate)`
  ile üretilir (`P:4238`). Siparişsiz irsaliye kodu **elle** girilir (`SIDE:44`). İki tablonun kodları birbirinden
  bağımsızdır; aynı kod iki tabloda da olabilir.
- **Maliyet:** siparişli çıkışta birim maliyet sevk tarihindeki ağırlıklı ortalamadır (`P:4249`). Siparişsiz çıkışta
  `UnitCost = null` yazılır (`SIDE:381`) ve maliyet hesabı hareket katmanına kalır. Bu bir **kod çıkarımıdır**.
- **rowVersion yok.** `SalesDelivery` ve `StandaloneSalesDelivery` varlıklarında satır sürümü alanı yoktur
  (`Domain/Entities.cs:1757-1771, 2455-2470`). Eşzamanlılık `UPDLOCK, HOLDLOCK` kilitleri ve firma kayıt kilidiyle
  (`LockTenantForPostingAsync`) sağlanır (`P:4130-4135, 4155-4158, 4380-4392`; `SIDE:293, 378-381`).
- **Idempotency:**
  - Siparişli oluşturma: `(TenantId, RequestId)` benzersizdir (`PlatformDbContext.cs:1847`). Aynı anahtar aynı içerikle
    gelirse aynı irsaliye 201 ile döner (`SalesDeliveryIdempotency.cs:8-30`: depo, tarih, satır, girilen miktar ve
    birim, göz). Farklı içerik ya da iptal edilmiş irsaliye için 409 döner. Eşzamanlı çakışma 409 olur (`P:4133-4151,
    4265-4270`).
  - Siparişsiz taslak: `(TenantId, RequestId)` ve `(TenantId, Code)` benzersizdir (`TenantDbContext.cs:173-180`).
    Yeniden oynatmada **yalnız kod** karşılaştırılır (`SIDE:37`). Ekran her tıklamada yeni anahtar ürettiği için asıl
    koruma kod benzersizliğidir.
  - Post ve void her iki ailede de doğal olarak tekrarlanabilir: zaten `Posted`/`Voided` ise 200 döner (siparişsiz) ya
    da 409 (siparişli void).
  - Fatura: irsaliye başına tek fatura vardır; tekrar çağrı 200 ile aynı faturayı döndürür.
- **Satır görünürlüğü:**
  - `GET /api/sales/deliveries` satır süzgeci uygulamaz ve `collectionRowsFiltered` işareti almaz
    (`PermissionAuthorizationHandler.cs:79-93`).
  - `{id}` istekleri için kaynak öznitelikleri **yalnız `StandaloneSalesDeliveries` tablosundan** aranır
    (`PermissionAuthorizationHandler.cs:128-133`). Siparişli irsaliyede sonuç `null` olur ve öznitelik eklenmez
    (`:59-71`).
  - Beklenen sonuç (**kod çıkarımı**, `IsAllowedAsync` okunmadı): durum ya da müşteri koşullu bir Allow kuralı olan
    TenantUser siparişli irsaliyede detay, iptal ve faturalamada reddedilir. Koşulsuz Allow ise bütün irsaliyeleri
    gösterir.
  - Siparişsiz liste `PermissionStatusFilter` ile durum ve müşteriye göre süzülür (`SIDE:20-21`).
- **Denetim kaydı:**
  - Siparişli: `sales-delivery.posted` (`P:4264`; siparişsiz faturanın doğurduğu irsaliye de `P:4914`),
    `sales-delivery.voided` (`P:4429`), `sales-delivery.deleted` (`P:4369`), faturada `sales-invoice.posted` (`P:4569`).
  - Siparişsiz: `sales.standalone-delivery.draft-created` / `draft-updated` / `draft-deleted` / `posted` / `voided` /
    `invoiced` (`SIDE:65, 322, 85, 387, 470, 276`).
- **e-İrsaliye:** **yok.** İrsaliye için GİB e-İrsaliye üretimi, gönderimi ya da durumu bu ekranlarda ve uç noktalarda
  bulunmaz. Yalnız şunlar vardır: numaralandırmada `EDelivery` → `EIRSALIYE` serisi (`TenantDocumentNumbering.cs:121`)
  ve entegrasyon tarafında Trendyol adaptörünün despatch-advice durum sorgusu (`AIERP.IntegrationHost/
  TrendyolEInvoiceAdapter.cs:129, 151`). Faturadaki "Sevk tarihi" ve "taşıyıcı" e-belge alanları faturaya aittir.

### 3.4 Roller

- **TenantAdmin:**
  - Sil komutunu görür ve çalıştırır (işleyici de TenantAdmin ister).
  - Liste ekranında İptal et etkindir.
  - Satır ve kaynak düzeyi öznitelik denetimi uygulanmaz (`PermissionAuthorizationHandler.cs:59`).
- **TenantDeveloper / TenantUser:**
  - Liste ekranında Sil komutu hiç yoktur.
  - İptal et görünür ama pasiftir ("İrsaliye iptali için yönetici yetkisi gerekir.", `SDP:537-538`). **Bu yalnız
    istemci kuralıdır:** sunucu `erp.sales-deliveries.execute` izni olan herkese iptal ettirir. Sipariş detayındaki
    "İptal et" (`SP:10432`) ve siparişsiz "Ters hareketle iptal et" (`SFP:759-767`) rol denetimi yapmaz.
  - Siparişsiz taslak silme de rol denetimsizdir.
  - Faturalaştır ve taslak işlemleri tamamen izin kurallarına bağlıdır.
  - Satır koşullu kurallar için 3.3'e bakınız.
- **Fatura özel alan tanımları:** TenantAdmin/TenantDeveloper tanımlar (`P:4585-4600`). Bu ekranlar yalnız değer girer.

### 3.5 ERP işlem kataloğu

Var olan: **hiçbir `satis.*` işlemi yok.** Satışla ilgili yalnız rapor işlemleri var: `rapor.salesDeliveries`,
`rapor.salesInvoices`, `rapor.salesOrders`, `rapor.salesOrderFulfillment`, `rapor.salesQuotes`, `rapor.salesReturns`
(`ErpOperationCatalog.cs:188`; `tests/IntegrationTests/ErpOperationCatalog.names.txt`). `rapor.salesDeliveries`
yalnız `SalesDeliveries` kaynağını okur (`ReportEndpoints.cs:360, 717`). İlk 12 sütunla ve kendi satır süzgeciyle
çalışır; liste ekranının yerini tutmaz.

Yeniden kullanılabilir olanlar:

- `depo.listele` (depo seçenekleri; yalnız etkinler için G-K3).
- `depo.konumlari` (göz seçenekleri, `warehouseId` parametreli).
- `stok.kart.listele` (stok seçici, sunucu araması `q`).
- `stok.kart.birimleri` (satır başına birim; G-SD5).
- `ayar.negatifStok` (bilgi).
- `stok.izleme.bakiyeler` (`warehouseId` + `trackingMode` ile lot/seri bakiyeleri; siparişsiz lot seçimine kaynak
  olabilir, G-SD6).
- Desen örneği: `depo.transfer.olustur` (`BodyParameters` + `ListParameter<…>("lines")`, `ErpOperationCatalog.cs:395-397`)
  ve `depo.transfer.iptal` (`fixedBody`).

Yeni (önerilen; modül sabiti `"Satış"` eklenmeli):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satis.irsaliye.listele` | GET `/api/sales/deliveries` | query `q`, `unbilledOnly` (bool), `orderId` (guid), `page`, `pageSize` | list `SalesDeliverySummary`, `rowsPath "items"`, `MetaPaths [page, pageSize, totalCount]` | Satır süzgeci yok (3.3). `unbilledOnly` özet kartının süzgeci olur. |
| `satis.irsaliye.getir` | GET `/api/sales/deliveries/{id}` | route `id` | record `SalesDeliveryView` (skalerler) | `lines` iç içe olduğu için sütun olmaz (G-K6); ayrı işlem gerekir. |
| `satis.irsaliye.kalemleri` | GET `/api/sales/deliveries/{id}` | route `id` | list `SalesDeliveryLineView`, `rowsPath "lines"` | `depo.transfer.kalemleri` ile aynı desen; fiyat, iskonto, KDV, döviz sütunları gelir. |
| `satis.irsaliye.siparistenOlustur` | POST `/api/sales/orders/{orderId}/deliveries` | route `orderId`; body `requestId` (`autoId`), `warehouseId`*, `deliveryDate`; `ListParameter<SalesDeliveryLineWriteRequest>("lines")` (`orderLineNumber`, `quantity`, `unitCode`, `storageLocationId`) | record `SalesDeliverySummary` | İzin `erp.sales-orders.create`. Asıl yeri sipariş detayıdır (G-SD2). |
| `satis.irsaliye.iptal` | POST `/api/sales/deliveries/{id}/void` | route `id` | none | `execute`. Yanıt gövdesi sözleşmesizdir (anonim); `None` yeterlidir. Eski istemci kuralı "yalnız TenantAdmin" ya `requiresTenantAdmin` ile korunur ya da bilinçli `fark` olur (G-SD10). |
| `satis.irsaliye.sil` | DELETE `/api/sales/deliveries/{id}` | route `id` | none | `requiresTenantAdmin: true` |
| `satis.irsaliye.faturalastir` | POST `/api/sales/deliveries/{id}/invoice` | route `id`; body `invoiceType` (enum metin), `accountingProfileCode`, `notes`; map `customFields`; siparişsiz için `customerId`, `invoiceDate` ve `ListParameter<SalesDeliveryInvoiceLineWriteRequest>("lines")` | record `SalesInvoiceSummary` | `eDocument` iç içe kayıt, parametre olamaz (**G-SD7**). `customerId`/`invoiceDate` sözleşmede zorunlu (non-nullable) görünür ama siparişli irsaliyede yok sayılır; katalog onları `required` saymamalıdır (G-SD8). |
| `satis.faturaOzelAlanTanimlari` | GET `/api/sales/invoices/custom-fields` | — | list `SalesInvoiceCustomFieldDefinitionView` | fatura alt formunun alanları (`customFieldsBlock`) |
| `satis.siparissizIrsaliye.listele` | GET `/api/sales/standalone-deliveries` | `page`, `pageSize` | list, `rowsPath "items"` | **Engel:** yanıt anonim nesnedir, `Columns<T>` yansıtacak tür bulamaz. Önce adlı bir görünüm kaydı (ör. `StandaloneSalesDeliverySummary`) gerekir. Listede alan adı `date`, detayda `deliveryDate`'tir; birleştirilmelidir. |
| `satis.siparissizIrsaliye.getir` / `.kalemleri` | GET `/api/sales/standalone-deliveries/{id}` | route `id` | record / list `rowsPath "lines"` | aynı engel (anonim) |
| `satis.siparissizIrsaliye.olustur` | POST `/api/sales/standalone-deliveries` | body `requestId` (`autoId`), `code`*, `customerId`*, `warehouseId`*, `deliveryDate`*; `ListParameter<StandaloneSalesDeliveryLineWrite>("lines")` | record (adlı tür gerekir) | `StandaloneSalesDeliveryWrite.Lines` `List<…>?` türündedir; `ListParameter` bunu karşılamalıdır. |
| `satis.siparissizIrsaliye.guncelle` | PUT `/api/sales/standalone-deliveries/{id}` | aynı + route `id` | record | yalnız taslak |
| `satis.siparissizIrsaliye.kaydet` | POST `…/{id}/post` | route `id` | none | `execute`; `fixedBody {}` (`tracking` boş, satırdaki lot kullanılır) |
| `satis.siparissizIrsaliye.iptal` | POST `…/{id}/void` | route `id` | none | `execute` |
| `satis.siparissizIrsaliye.sil` | DELETE `…/{id}` | route `id` | none | yalnız taslak |

Sonraya (v1 dışı önerilir):

- `satis.siparissizIrsaliye.faturalastir` (`StandaloneSalesDeliveryInvoiceWrite`; `eDocument` yine G-SD7).
- "Siparişten irsaliye **ve** fatura" bileşik akışı (iki yazmalı `saveSequence`; atomik değildir, 3.8 R-SD6).
- Yardımcı arama uç noktaları (`/search`, `/search/details`).
- Fatura özel alan tanım yönetimi.

Gereken yeni `Labels` kodları (bugün yok; `Label()` açılışta hata verir, `ErpOperationCatalog.cs:494-495`):

- İrsaliye: `orderId`, `orderCode`, `deliveryDate`, `hasSalesInvoice`, `invoiceStatus`, `invoiceId`,
  `orderLineNumber`, `unitPrice`, `discountPercent`, `vatPercent`, `currencyCode`, `requestId`, `lines`.
- Fatura: `customerId`, `customerName`, `invoiceDate`, `invoiceType`, `accountingProfileCode`, `notes`, `isVatIncluded`,
  `deliveryId`, `deliveryCode`, `grandTotal`, `subtotal`, `taxTotal`, `discountTotal`.
- Siparişsiz: `lineNumber`, `stockCode`, `stockName`.

Var olanlar: `id`, `code`, `status`, `warehouseId`, `warehouseName`, `lineCount`, `createdAt`, `quantity`, `unitCode`,
`stockItemId`, `storageLocationId`, `enteredQuantity`, `enteredUnitCode`, `trackingCode`, `expiryDate`, `customFields`,
`page`, `pageSize`, `q`.

Ayrıca güncellenecekler: `names.txt`, yeni `system-pages/sales*Operations.fixture.json` ve
`SystemPageStandards.versions.txt` (bugün yalnız `inventory-*` var).

### 3.6 Bileşen eşlemesi ve eksikler

Var olanlarla kurulabilenler:

- `actionBar`: Yeni → `page @sales-delivery-create`, Aç → `openParams id`, Sil (TenantAdmin, `disabledWhen status != Voided`
  + gerekçe), `moreButtons` (Faturalaştır / Faturayı aç / İptal et / CSV), `titleCount`.
- `filterBar`: sunucu arama `q`; `unbilledOnly` bayrağı.
- `metric` + `countWhen`: "bu sayfa" kartları.
- `dataTable`: sunucu sayfalama 25; `status` biçimi + `toneMap`; `rowActions`.
- `contextPanel` + `tabs`: Özet / Satırlar.
- `recordHeader` + `steps`: kod, durum, akış Sevk edildi → Faturalandı (`custom-page/StepsIndicator.tsx:8-25`).
- `section` / `formCard`: belge bilgileri.
- `dialog` (`size: "xl"`, `custom-page/PageDialog.tsx:6-7`): fatura alt formu ve iptal onayı.
- `alert`, `text`, `button` (`visibleWhen` / `disabledWhen`, `confirmEnabled`).
- `customFieldsBlock`: fatura özel alanları.
- `editableGrid` `list` kipi ve **`lookup` sütunları** (`lookup:<sorgu>:<değer>:<etiket>[:<açıklama>]`,
  `custom-page/gridState.ts:18-35`, `EditableGrid.tsx:53-61`).
- `clearsOnChange`: depo değişince göz sütununu temizler (`TenantCustomPage.tsx:2142-2150`).
- `autoId`: tekrar deneme kimliği; girişler açılışta üretilir, başarılı yazmadan sonra döndürülür
  (`TenantCustomPage.tsx:717-729, 1579-1592, 1923`).
- 11-20 envanterindeki G-TR1 ("GUID yok") ve G-TR2'nin (a)/(c) kısmı ("seçim hücresi yok") **kapandı**.

Eksikler:

- **G-SD1 İki belge ailesi, tek liste yok (engelleyici, ürün kararı).** `sales-delivery-create` ile oluşan siparişsiz
  irsaliyeler `sales-deliveries` listesinde görünmez (`P:4322` yalnız `SalesDeliveries`). Eski ekran bunu formun
  altındaki 100'lük şeritle kapatır. Sistem sayfası için seçenekler:
  - (a) Oluşturma sayfasında ikinci bir `dataTable` (`satis.siparissizIrsaliye.listele`). Eski ekrana eşdeğerdir;
    sayfalama ve arama bir iyileştirme olur.
  - (b) Listeye sekme ya da ikinci tablo.
  - (c) Sunucuda birleşik liste uç noktası (yeni işlem adı).

  Karar verilmeden liste ve oluşturma ekranı eşdeğer kurulamaz. `eksik`.
- **G-SD2 Siparişli sevk bu ekranlarda yok.** "Siparişten irsaliye" sipariş detayının alt formudur (`SP:10240-10362`).
  Fatura penceresinde de bir kip olarak vardır. `sales-delivery-create` standardına bir "sipariş seçimi" adımı eklemek
  yeni bir davranış olur (`fark`, olumlu). Öneri: v1'de siparişli sevk `sales-orders` taşımasıyla birlikte ele alınsın;
  bu belgede yalnız giriş noktası.
- **G-SD3 Kalan miktarla ön dolu düzenlenebilir satırlar (siparişli sevk için engelleyici).** Sipariş satırlarından
  (`remainingQuantity > 0`) ön dolu, miktarı **düzenlenebilir** satırlar gerekir. Bugün:
  - `list` kipi boş başlar ve bir sorgudan ön değer almaz.
  - `stage` kipinde kaynak satırlar **salt okunurdur**, yalnız silinir (`EditableGrid.tsx:88-101`, `gridState.ts:127-131`).
  - `max` kuralı sabit bir sayıdır, satıra göre değişmez (`gridState.ts:16`). "Miktar ≤ satırın kalanı" ifade edilemez;
    sunucunun 409'u gösterilir.

  `eksik`: `list` kipine `seedQuery` (satırları sorgudan doldur, sütun eşlemesiyle) ve satır kapsamlı kural
  (`max: {{satir.remainingQuantity}}`).
- **G-SD4 Koşullu sütun ve hücre (siparişsiz satırlar).** Lot / seri sütunu yalnız takipli kart varsa, SKT sütunu yalnız
  Lot varsa görünür. Hücre de yalnız ilgili satırda görünür ve zorunludur (`SFP:603-630`). Depo gözü sütunu deponun
  gözü yoksa gizlenir. Izgarada sütun ya da hücre düzeyinde `visibleWhen`/`requiredWhen` yoktur
  (`gridState.ts:16-19`).
  - `fark`: lot ve SKT sütunları her zaman görünür ve isteğe bağlı olur. Takipsiz satıra yazılan lot 400 ile reddedilir
    ("Takipsiz stok satırında lot/seri bilgisi kullanılamaz.", `SIDE:521-527`), zorunluluk da sunucuya kalır.
  - Ayrıca seçilen kartın `trackingMode`'u satıra taşınmalıdır (lookup açıklama sütunu yetmez). `eksik`.
- **G-SD5 Satır kapsamlı seçim (birim).** Siparişli sevkte satır başına teslim birimi seçilir (`stok.kart.birimleri`,
  karta göre). G-TR2(b) ile aynıdır: `lookup` sorgusu sayfa düzeyindedir, `{{satir.stockItemId}}` yoktur.
  - Siparişsiz ekranda birim zaten seçilmez (ana birim), bu yüzden etkisi yoktur.
  - Siparişli için `fark`: birim `text` hücresi (`upperCase,maxLength:8`) ya da yalnız ana birim. `eksik`.
- **G-SD6 Stok seçici kapsamı.** Eski seçici önceden yüklenmiş **ilk 100** aktif kartla sınırlıdır (`SP:157-163`). Bu
  bir eski ekran hatasıdır. `lookup` + `stok.kart.listele` sunucu aramasıyla daha iyi olur (`fark`, olumlu). Ancak
  `isActive` süzgeci G-K3'e takılır (sunucu pasifi reddeder).
- **G-SD7 `eDocument` iç içe kayıt.** Fatura penceresinin e-belge bölümü 20 alanlı iç içe `SalesInvoiceEDocumentFields`
  ister (`PC:325`). `BodyParameters` yalnız skalerleri alır. Ayrıca senaryoya bağlı alan gösterimi gerekir.
  - v1'de irsaliye ekranının kendi alt formunda e-belge zaten **yoktur** (`SDP:817-1016`); orada sorun çıkmaz.
  - Fatura ekranı penceresi (3.1.6a) için `eksik`: iç içe gövde (`bodyObject "eDocument"`) ya da sunucuda düz alanlı
    yeni sözleşme. Ayrıca, aynı irsaliyeye farklı e-belgeyle ikinci çağrı 409 alır.
- **G-SD8 Siparişe göre değişen gövde.** Faturalaştır gövdesi irsaliyenin siparişli olup olmamasına göre değişir.
  Siparişli: yalnız `customFields`. Siparişsiz: `customerId`, `invoiceDate`, `lines` zorunlu (`SDP:842-854`). İki ayrı
  düğme ya da pencere (`visibleWhen orderId`) ve aynı işlemin iki bağlaması gerekir. `customerId` non-nullable `Guid`
  olduğundan katalog onu `required` sayar (`ErpOperationCatalog.cs:446-449`). Siparişli bağlamada değer verilemezse
  çalışma zamanı engeller. `eksik`: katalogda `exclude` ya da iki işlem adı (`faturalastir` / `faturalastirSiparissiz`).
  Bu karar şimdi verilmelidir, çünkü adlar sonradan değişmez.
- **G-SD9 Fatura satırı ızgarası (siparişsiz).** Satırlar irsaliye satırlarından gelmeli ve fiyat, iskonto, KDV
  düzenlenmelidir. Bu, G-SD3 ile aynı ihtiyaçtır (ön dolu, düzenlenebilir satır). Ayrıca satır sayısı birebir olmalıdır
  (silinemez, eklenemez). `eksik`. Pratikte bu yol neredeyse hiç kullanılmaz (3.8 R-SD3); `fark` olarak bırakılması
  önerilir.
- **G-SD10 İptalin rol kuralı.** Liste ekranı iptali yalnız TenantAdmin'e açar; sunucu ve diğer iki ekran açmaz (3.4).
  Seçenekler:
  - `requiresTenantAdmin: true`: eski liste ekranına eşdeğerdir ama sunucudan sıkıdır. Studio'da "izinsiz" görünür.
  - `fark`: izin kuralına bırakmak.

  Karar yazılmalıdır.
- **G-SD11 Faturalaştırda onay ve "aynı işlem, iki davranış".** Eski liste İşlemler → Faturalaştır siparişli irsaliyede
  **onaysız ve gövdesiz** keser (`SDP:525-526`). Detaydan aynı komut alt formu açar. Sistem sayfasında tek davranış
  seçilmelidir. Öneri: her zaman pencere (özel alanlar için). Bu `fark`tır, olumludur.
- **G-SD12 Hesaplanan belge toplamları.** Oran başına KDV matrahı/KDV, genel toplam ve "TL" gösterimi istemcide
  satırlardan toplanır (`SDP:223-252`). Bağlamalarda aritmetik ve grup toplamı yoktur. `fark` (toplam bloğu düşer) ya da
  sunucuda `SalesDeliveryView`'a toplam alanları (yeni işlem adı).
- **G-SD13 Fatura durumu sütunu.** "Fatura" sütunu bir düğmedir ("Faturayı aç" / "Yok"). İptal edilmiş faturayı da
  "Faturayı aç" gösterir. `dataTable` hücre düğmesi `rowActions` ile kurulur. "Faturayı aç" köprüsü yoktur
  (`SalesInvoiceModal` uygulama içi pencere; G-C13 ile aynı). `eksik`: `erpPage @sales-invoices` + `params id`
  (`navigationActions.ts:64-68` yalnız `q` taşır).
- **G-SD14 Cariden "Yeni irsaliye".** Cari ekranı cariyi `sessionStorage` + olayla taşır (`SP:126-140`, `SDP:85-94`).
  G-C12 ile aynıdır: sistem sayfası `customerId` sayfa parametresini okumalı, `erpPage` parametre taşımalıdır. `eksik`.
- **G-SD15 Ön yükleme.** `SalesPage` sekmesi bütün teklif, sipariş, fatura ve carileri çeker (`SP:624-646`). Sistem
  sayfasında bunlar yerine seçenek sorguları (`lookup`) kullanılır. Bu `fark`tır, olumludur (performans). Ancak cari
  seçicide "aktif, Supplier ve Employee değil" süzgeci G-K3'e takılır. `cari.listele` `type` tek değer alır; iki çağrı
  ya da sunucuda `salesOnly` gerekir.
- **G-SD16 Panelin geç yüklenmesi ve sıra kilidi.** Panel 150 ms gecikmeyle yüklenir ve eski yanıtı atar
  (`useSalesListPanel.ts:31-45`). `contextPanel`'in seçili satıra bağlı okuması aynı korumayı sağlıyor mu?
  **Doğrulanmalı.**
- **G-SD17 Taslak şeridi düğmeleri.** Durum bazlı satır düğmeleri (Düzenle / Kaydet ve stoğa işle / Sil / Fatura oluştur
  / Ters hareketle iptal et) `rowActions` + `visibleWhen` ile kurulur. "Düzenle" formu doldurur. Bu, `formCard`'ın
  kaynaklı (`recordKey`) kipiyle eşleşir; `cari.guncelle` desenine benzer. "Kaydet ve stoğa işle" eskide onaysızdı;
  `confirmEnabled` önerilir (`fark`, olumlu).
- **G-SD18 Kayıt sonrası sıfırlama.** Eski form başarıdan sonra bütün alanları ve cariyi boşaltır (`SFP:185-198`).
  Cariden gelindiyse cari de kaybolur. Sistem sayfası `resetOnSuccess` ile aynısını yapar; başlangıç carisini korumak
  bir iyileştirmedir (`fark`).
- **G-SD19 Ondalık gösterim.** Miktarlar 4 ondalıklıdır; `number` biçimi 2 ondalık gösterir (G-K4,
  `cellFormat.ts:51`). `eksik` ya da `fark`.
- **G-SD20 Dil.** Eski ekran Türkçedir; satış testleri Türkçe etiketleri doğrular (`sales/salesActionBar.test.tsx:338-400`,
  `sales/salesDocumentForms.test.tsx:424`, `sales/salesDocuments.test.tsx:392-440`). Fark yok.

### 3.7 Görünüm anahtarları

- `sales-deliveries` → `code`, `orderCode`, `deliveryDate`, `warehouseName`, `lineCount`, `status`, `invoiceStatus`,
  `actions` (sabit) (`TenantScreenViewEndpoints.cs:281-287, 683, 1181-1185`). Hepsi varsayılan görünürdür. Anahtar,
  ızgara destekli ekranlardadır (sütun genişliği ve sabitleme, `TenantScreenViewEndpoints.cs:33-37`).
  - Eşleme: `status` → `status`; `invoiceStatus` → `invoiceStatus` (eski hücre `invoiceId`'den düğme çizer, G-SD13).
    Diğerleri bire bir. `actions` aktarılmaz.
  - Ekran görünümde yalnız `fields` okur; `pageSettings` kullanılmaz (`SDP:199-218`).
- `sales-delivery-create` için görünüm anahtarı **yok**. Oluşturma formu ve taslak şeridi kiracıya açık değildir.
- İlgili ama kapsam dışı: `sales-order-lines` (sipariş detayı satırları, `SP:9643-9655`), `sales-invoices`.

### 3.8 Kaybolması kolay davranışlar ve riskler

- **R-SD1 Görünmeyen siparişsiz irsaliyeler.** Yeni irsaliye ekranından kaydedilen belgeler satış irsaliyeleri listesinde
  yoktur. Kullanıcı onları yalnız formun altındaki ilk 100 kayıtta bulur (G-SD1). Taşıma bunu "düzeltmeye" çalışırsa
  liste uç noktası değişir. Yeni işlem adıyla yapılmalıdır.
- **R-SD2 Yanıltıcı metinler.**
  - Durum çubuğu "Kaydetme stok çıkışı oluşturur" der (`SFP:506`). Oysa "Taslak oluştur" stok yazmaz; stok yalnız
    "Kaydet ve stoğa işle" ile düşer.
  - Arama yer tutucusu "depo" der; sunucu depo adında aramaz, müşteri adında arar (`P:4326-4331`).
  - Liste boş metni "İrsaliye, açık sipariş ayrıntısından oluşturulur." der; Yeni ise siparişsiz form açar.
  - Bunlar standart taslakta düzeltilmeli ve `fark` olarak yazılmalıdır.
- **R-SD3 Ölü fatura yolu.** Listede siparişsiz irsaliye yalnız siparişsiz faturanın doğurduğu irsaliyedir. Faturası
  hep vardır (`P:4872-4914`). Fatura iptali de bağı koparmaz (3.3). Bu yüzden `SDP`'deki siparişsiz faturalama alt
  formu (`SDP:858-1007`) pratikte erişilemez. Bu bir **kod çıkarımıdır**; veri göçüyle gelmiş faturasız siparişsiz
  irsaliye olabilir. Taşımada v1 dışı bırakılabilir.
- **R-SD4 Yeniden faturalanamama.** Faturası iptal edilen irsaliye "Faturalanmamış" sayılmaz ve faturalanamaz.
  Kullanıcıya "Faturayı aç" gösterilir (G-SD13). Bu bir kural mıdır, açık mı? Ürün kararı gerekir; taşıma değiştirmemeli.
- **R-SD5 Beş farklı "irsaliyeden fatura" yolu, beş farklı gövde:**
  - liste İşlemler (gövdesiz),
  - detay alt formu (`customFields`; siparişsizde satırlar),
  - sipariş detayı "Fatura kes" (gövdesiz),
  - fatura ekranı "Mevcut irsaliyeden" (`eDocument`, `accountingProfileCode`, `invoiceType`; **`customFields` yok**),
  - fatura ekranı "Siparişten irsaliye" (hepsi).

  Zorunlu fatura özel alanı tanımlı firmada gövdesiz yollar 400 alır. Sunucu, ikinci çağrının e-belge/tür/profil
  farkında 409 döner. Taşıma tek bir yol seçerse diğer yolların davranışı da değişir.
- **R-SD6 Atomik olmayan "irsaliye + fatura".** Fatura ekranındaki sipariş kipi iki ayrı istekle çalışır. İkincisi
  düşerse faturasız bir irsaliye ve stok çıkışı kalır (`SIFD:359-410`). `requestId` her tıklamada yenidir. Kullanıcı
  hatadan sonra tekrar tıklarsa **ikinci bir irsaliye** oluşur (kalan miktar yetiyorsa). `saveSequence` ile taşınırsa
  aynı risk sürer. Anahtar `autoId` olmalı, ikinci adım ayrı yeniden denenebilmelidir.
- **R-SD7 `requestId` ömrü farklı.** Sipariş detayında anahtar editör açılışında üretilir (yeniden deneme güvenli,
  `SP:9733`). Siparişsiz taslakta ve fatura penceresinde her tıklamada üretilir (`SFP:156`, `SIFD:383`). Sistem sayfası
  `autoId` ile hepsini "pencere başına" yapar. Bu `fark`tır, olumludur. Siparişsiz yeniden oynatma yalnız kodu
  karşılaştırır (`SIDE:37`).
- **R-SD8 İptalin tarihi.** İki ailede de ters hareket **UTC bugün** tarihli yazılır (`P:4382`, `SIDE:458`). Sevk tarihi
  açık dönemde, bugün kapalı dönemdeyse iptal reddedilir. Türkiye saatinde gece yarısından sonraki ilk üç saatte tarih
  bir gün geride kalır. Taşıma etkilemez ama test senaryosu olmalıdır.
- **R-SD9 Rol ve izin tutarsızlığı.** İptal için yalnız liste ekranı TenantAdmin ister (G-SD10). Satır koşullu izinler
  siparişli irsaliyede öznitelik bulamaz (3.3). Katalogda `allowed` yanlış negatif riski de sürer (G-C3). TenantUser +
  koşullu kuralla test edilmeden taşınmamalıdır.
- **R-SD10 Lot denetimi.** Siparişli sevkte lot/seri sunucuda otomatik dağıtılır; kullanıcı seçmez. Siparişsiz sevkte
  kullanıcı lotu **serbest metinle** yazar ve sunucu o lotun bakiyesini denetlemez (**kod çıkarımı**, `SIDE:431-450`).
  Sistem sayfası ızgarası lotu `lookup` (`stok.izleme.bakiyeler`) ile seçtirirse davranış sıkılaşır. Bu bilinçli bir
  `fark` olarak yazılmalıdır; sunucu yine serbest metni kabul eder.
- **R-SD11 Müşteri süzgeci farkı.** Siparişsiz formda Employee türü cari seçilebilir (`SFP:107-110`); sunucu 400 verir.
  Fatura alt formunda ise `type != Supplier` süzülür (`SDP:872-877`), sunucu yalnız `Customer`/`Both`/`Dealer` kabul
  eder. Sistem sayfasında sunucu kuralına uyulmalıdır.
- **R-SD12 Esc ve belge.** Belge açıkken Esc pencereyi kapatır (`SDP:150-157`). Fatura alt formu açıkken de aynı dinleyici
  çalışır ve belgeyi (alt formla birlikte) kapatır. **Doğrulanmalı.** Sistem sayfasında pencere içi Esc yalnız pencereyi
  kapatmalıdır.
- **R-SD13 Tıklama açar.** Kod hücresine tıklamak satırı seçer **ve** belgeyi açar (`SDP:265-269`). Satırın başka yerine
  tıklamak yalnız seçer. `dataTable` bağlantı hücresi (`rowActions` ya da `link`) ile korunmalıdır.
- **R-SD14 Sipariş durumunun yan etkisi.** İrsaliye oluşturma ve iptal, siparişin durumunu (`Open`/`Fulfilled`) ve
  rezervasyonun `FulfilledQuantity`'sini değiştirir (`P:4244-4263, 4399-4428`). Sistem sayfası yazmadan sonra yalnız
  kendi sorgularını yeniler. Aynı oturumda açık sipariş sekmesi eski ekranda `SALES_CHANGED_EVENT` ile yenilenir
  (`SP:539-550`). Sistem sayfasında bu olay yoktur; `fark`.
- **R-SD15 Testler.**
  - Ön yüz: `sales/salesActionBar.test.tsx:338-400` (Yeni/Aç/Sil, Faturalaştır, F2, fatura penceresi),
    `sales/salesDocumentForms.test.tsx:424`, `sales/salesDocuments.test.tsx:392-440`.
  - Sunucu: `SalesDeliveryIdempotencyTests.cs`, `SalesDeliveryLocationGuardIntegrationTests.cs`,
    `SalesDeliverySearchEndpointsIntegrationTests.cs`, `StandaloneInventoryDocumentsIntegrationTests.cs`,
    `SqlServerStandaloneInventoryDocumentsAcceptanceTests.cs`, `Phase2SalesOrderDeliveryGuardAcceptanceTests.cs`.
  - Şu durumlar için test **aranmadı / bulunamadı**: rol farkıyla iptal; iptal edilmiş faturalı irsaliyeyi yeniden
    faturalama; satır koşullu izinle irsaliye detayı. Taşıma öncesinde eklenmeleri önerilir.

---

## 4. Satış Faturaları (`sales-invoices`, `sales-invoice-create`)

Kaynak taban: origin/master `7bc6deda`. Atıflarda dosya adı verilmeyen satır numaraları: istemcide
`frontend/erp-web/src/SalesPage.tsx`, sunucuda `src/Hosts/AIERP.Api/Program.cs`.

**Yönlendirme.** İki ekran anahtarı da `SalesInvoicesPage` → `SalesPage section="sales-invoices"`'tır
(`SalesInvoicesPage.tsx:6-13`, `WorkspacePageRouter.tsx:367-370`). `sales-invoice-create` ayrıca `openInvoiceCreate` verir.
`SalesInvoicesPage` bunu `createInvoicePage` olarak da geçirir. Bu yüzden yeni fatura sayfasında **iki bayrak birlikte**
doğrudur: liste gizlenir (`entryPage`), form tam sayfa açılır (`:395-398, 2314-2324`). Menüde `sales-invoice-create`'in
üst sayfası `sales-invoices`'tır (`shell/moduleMenus.ts:20, 77`; `App.tsx:323-330` global arama girişi).

### 4.1 Yerleşim

#### Liste (`sales-invoices`)

- **Başlık:** "Satış Faturaları", açıklama "Kesilen satış faturalarını ve cari borç kayıtlarını izleyin.", sayaç =
  sunucu `totalCount` (`:2185-2203`). Başlık metinleri **kiracı görünümünden gelmez** (`pageSettings` yalnız `customers`
  içindir, `TenantScreenViewEndpoints.cs:1486`). `sales/components/SalesInvoiceListHeader.tsx` (eski "Fatura oluştur"
  başlığı) **hiçbir yerde kullanılmıyor** (ölü kod). Test de eski düğmenin olmadığını doğrular (`salesActionBar.test.tsx:298`).
- **Özet kartları** (`:2080-2104`; yalnız **yüklenen sayfa**, kartlar süzmez):

| Kart | Değer | Kaynak |
|---|---|---|
| Kesilen (ok tonu) | `Posted` satırların genel toplamı, ipucu "N fatura · bu sayfa" | `pageAmount` tek dövizse toplar. Birden çok dövizde "—" + "birden çok para birimi" gösterilir (`sales/components/SalesListFooter.tsx:48-66`). |
| İptal | `Voided` satır sayısı, "bu sayfa" | yüklenen sayfa |

  Yorum: liste uç noktası vade ya da açık bakiye döndürmez. Bu yüzden "Tahsil edilmemiş" ve "Vadesi geçen" kartları yok (`:2028-2029`).
- **Uyarı / bildirim:** sayfa düzeyinde `error`/`notice` (`:2220-2235`), ayrıca tablo düzeyinde `actionError`/`actionNotice`
  (iptal ve silme sonuçları, `:10723-10738`). İkisi de kapatılabilir.
- **İşlem çubuğu** (`SalesInvoiceTable`, `:10675-10720`; kısayollar `commands/shortcuts.ts:6-18`, İşlemler Alt+İ). Çubuk,
  açık bir fatura ya da sipariş detayı varken bırakılır (`commandsSuspended`, `:2335, 10722`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | `onNavigate("sales-invoice-create")` (`:10693, 2334`). Liste içinde açılan oluşturma penceresi yok (bkz. G-SI14). |
| Aç | Enter | Odaklı satır, yoksa seçili satır, yoksa tek işaretli satır. Hiçbiri yoksa "Önce bir kayıt seçin". `invoiceId` atanır, detay açılır (`:10694-10700, 1753-1756`). |
| Sil | Ctrl+Delete | **Yalnız TenantAdmin'e görünür.** `Posted` ise pasif, neden "Kesilmiş belge silinemez — İşlemler › İptal et". `Voided` ise onay sorulur ("Yalnızca iptal edilmiş faturalar silinebilir."), sonra `DELETE` (`:10702-10713, 10606-10627`). |
| İşlemler → İptal et | | Yalnız TenantAdmin ve seçili satır `Posted` ise. Onay: "… iptal edilecek ve cari hareketi ters kayıtla kapatılacak." (`:10715, 10581-10605`). İstemci tahsilat/iade varlığını **denetlemez**, sunucunun 409'u gösterilir. |
| İşlemler → CSV olarak dışa aktar | | ızgaranın görünen sayfası (`commands/gridCommands.ts:15-17`) |
| Dışa aktar (Excel) | Ctrl+E | ızgaranın kendi kaydı; görünen sayfa (`AdvancedDataGrid.tsx:1236`; `salesActionBar.test.tsx:297`) |
| Yenile | F5 | Çubukta tanımlı değil. Araç çubuğundaki Yenile düğmesi `load()` çağırır (`:2215`). |

- **Süzgeç çubuğu** (`sales/components/SalesListToolbar.tsx:44-89`; fatura sekmesinde yalnız arama var):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama "Fatura no veya müşteriyle ara" | metin, sunucu **ve** istemci | `q`, 250 ms gecikmeli, değişince sayfa 1 (`:678-698`). Sunucu fatura no, irsaliye no (bağımsız irsaliye dahil), sipariş no ve müşteri adında `Contains` arar (`:4931-4934`). İstemci yüklenen 25 satırı ayrıca `code + deliveryCode + orderCode + customerName + customerTaxNumber` içinde süzer (`:1902-1908`). |
| Durum / tarih / müşteri | — | **Yok.** Sunucu yalnız `q`, `customerId`, `page`, `pageSize` alır (`:4923`). |
| Detay paneli anahtarı | | `SalesListPanelToggle`, Ctrl+. (`:2216`) |

- **Liste sütunları** (varsayılan `:318-337`, hücreler `:10634-10673`; görünüm `sales-invoices`,
  `TenantScreenViewEndpoints.cs:288-294` + özel alanlar `:1468-1482`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Fatura no | bağlantı düğmesi. Tek tıkla seçer **ve açar** (`stopPropagation`, `:10640-10653`; `salesLists.test.tsx:243`). |
| `deliveryCode` | İrsaliye | metin, boşsa — (bağımsız irsaliye kodu da buraya gelir, `:4937`) |
| `orderCode` | Sipariş | metin, boşsa — |
| `customerName` | Müşteri | metin |
| `customerTaxNumber` | Müşteri vergi no | varsayılan gizli. Görünümde var, istemci varsayılanında yok. |
| `invoiceDate` | Fatura tarihi | gg.aa.yyyy |
| `lineCount` | Satır | sayı |
| `grandTotal` | Genel toplam | `listAmount(tutar, döviz)` |
| `status` | Durum | `Posted` → "Kesildi" (success), `Voided` → "İptal" (`document-page/documentStatus.ts:51-57`) |
| `custom:<definitionGuid>` | özel alan etiketi (pasifse "(pasif)") | `listCustomFields` map'i (`:4940-4951`) |
| `actions` | İşlemler | sabit alan; **sütun çizilmez** (`:10631-10632`) |

- **Izgara:** `SalesDocumentGrid gridId="sales-invoices"` (`:10742-10769`): işaret sütunu, tıkla = seçim, çift tık / Enter =
  aç, işaret hücresine çift tık açmaz (`salesLists.test.tsx:216-243`). Toplu eylem "Excel (seçilenler)". Sütun aracı
  araç çubuğuna yerleşir (`toolbarContainer`). Genişlikler `INVOICE_LIST_WIDTHS` (`sales/components/salesListCells.tsx:34-37`).
  Seçim kuralı: ilk satır kendiliğinden seçilmez (`:1897-1899`).
- **Boş durumlar:** "Faturalar yükleniyor…", "Henüz satış faturası yok. Yeni fatura oluştururken sipariş ve irsaliye kaydı
  otomatik oluşturulur.", "Aramanızla eşleşen fatura yok." (`:10748-10753`). Not: `loading={false}` sabit verilir (`:10747`).
  Yükleme metni bu yüzden hiç görünmez; yükleme sırasında boş liste metni görünebilir.
- **Alt bilgi:** işaretli sayısı, "Gösterilen x / toplam", sunucu sayfalama (25), ipuçları "↑↓ gez · Boşluk işaretle ·
  Enter aç · Çift tık aç · Ctrl+. detay paneli" (`sales/components/SalesListFooter.tsx:20-38`, `:2150-2158`).
- **Detay paneli** (`InvoiceListPanel`, `sales/components/SalesListPanels.tsx:183-255`). Panel açık, liste etkin ve satır
  seçiliyse açılır. Satır seçilmemişse "Özetini görmek için listeden bir fatura seçin." gösterilir (`:93`). Detay
  `GET /api/sales/invoices/{id}` ile 150 ms gecikmeyle yüklenir. Satırdan ayrılınca gelen geç yanıt atılır
  (`sales/useSalesListPanel.ts:31-45`).
  - Üst: kod, müşteri adı, durum etiketi, "Aç", kapat.
  - **Özet** sekmesi: Genel toplam, Kalan (nötr ton, "vade yok"), Matrah (= ara toplam − iskonto), KDV. Altında belge
    zinciri (sipariş → irsaliye → bu fatura → iadeler ve durumları) ve satır önizlemesi + "Tümünü göster" (`:231-251`).
  - **Satırlar** sekmesi: satır listesi (`:195`).
  - **Tahsilat** sekmesi: Tahsil edilen / İade edilen / Kalan; tahsilat satırları (kod, tarih, yöntem, "İptal" eki, tutar).
    Boşsa "Henüz tahsilat yok." (`:196-229`).
- **Detay ekranı** (`SalesInvoiceModal.tsx`, `DocumentSurface variant="detail"`; liste üstünde tam ekran, `:3655-3664`):
  - Başlık "Satış faturası" + kod. Alt başlık müşteri adı. Durum etiketi. Meta: tarih ve fatura türü ("Perakende · KDV
    dâhil" / "Toptan · KDV hariç"). Durum akışı `SalesInvoiceFlow` (Kesildi; İptal akış dışı son durum,
    `sales/salesDocumentDetail.tsx:77-79`). Kapat = "Listeye dön" (`SalesInvoiceModal.tsx:726-741`).
  - **Yan panel:** Belge zinciri (sipariş, irsaliye, bu fatura, iadeler + tarih + durum), Ödeme durumu (tahsil / iade /
    açık bakiye, döviz ipucu), Cari (unvan, vergi no ipucu) (`:742-775`). Alt bilgi: satır sayısı + genel toplam, ipucu "Alt+İ
    işlemler" (`:776-777`).
  - **Çubuk** (`:681-695`): Yeni (listedeyken `sales-invoice-create`'e gider, `SalesPage.tsx:3663`), Yenile (= yeniden yükle),
    Süz ve Dışa aktar pasif ("Belge açıkken kullanılamaz", `commands/PageCommandsSlot.tsx:20-27`). `Posted` faturada Sil pasif
    olur ("Kesilmiş belge silinemez — İşlemler › Faturayı iptal et"). İşlemler'de "Faturayı iptal et" bulunur. Tahsilat ya da
    iade varsa bu komut pasiftir ("Önce tahsilat ve iadeleri iptal edin."). **Rol denetimi yok**; listede ise yalnız
    TenantAdmin görür. `Voided` faturada Sil ve İptal komutu yoktur.
  - **Sekmeler** (`:799-807`): "Fatura Bilgileri" ve "Tahsilat ve İadeler (n)".
  - *Fatura Bilgileri:* kutucuklar (Fatura toplamı, Tahsil edilen, Açık bakiye, `:809-816`). Belge bilgileri ızgarası
    kiracı görünümünden gelir (`sales-invoice-details`; `grandTotal/paidAmount/outstandingAmount/status` kutucukta olduğu
    için çıkarılır). `ledgerEntry` alanı "Cari borç kaydı oluşturuldu" ya da "Cari hareketi yok" yazar. E-belge özeti tek
    satır metindir (`:817-833, 221-259, 709-724`). Satır tablosu sütunları: #, Stok (kod + ad), Miktar + birim, Birim fiyat
    (2–4 ondalık), İskonto (tutar + %), KDV (tutar + %), Toplam (`:834-876`). Altta toplamlar bloğu yer alır: Ara toplam,
    Toplam iskonto (>0 ise negatif vurgulu), Toplam KDV, KDV oranına göre dağılım, Genel toplam
    (`sales/salesDocumentDetail.tsx:118-…`, `vatByRate` `:697-708`). Varsa fatura notu gösterilir (`:877-881`). Profil ya da
    döküm varsa "Vergi mevzuatı" bölümü vergi adı, kod, oran, tür (Tevkifat/Ek vergi) ve tutarla çizilir (`:883-889`).
  - *Fatura özel alanları* bölümü (`:890-1125`): değerler yalnız `Posted` faturada düzenlenir ve "Değerleri kaydet" ile
    kaydedilir. Her alanda "Geçmiş" (son 50, "Öncekine döndür" yalnız `Posted`) bulunur. "Tanımı düzenle" TenantAdmin ve
    TenantDeveloper'a görünür (ardışık istemler: etiket, metin için 1–500 sınırı; zorunluluk sorusu yalnız TenantAdmin'e).
    "Devre dışı" yalnız TenantAdmin'e görünür. "Alan tanımla" formu da TenantAdmin ve TenantDeveloper içindir: kod (büyük
    harf, ≤ 40), etiket (≤ 120), tür, metin sınırı; "Zorunlu alan" yalnız TenantAdmin'e açıktır.
  - *Tahsilat ve İadeler* (`:1174-1610`):
    - Tahsilatlar ızgarası (`sales-invoice-payments` görünümü: Fiş no, Tarih, Yöntem, Referans, Tutar, Durum "Alındı/İptal",
      Oluşturulma gizli, satır "İptal et").
    - Tahsilat formu yalnız `Posted` faturada ve açık bakiye > 0 ise görünür. Alanlar: tarih, tutar (varsayılan = açık
      bakiye, en çok açık bakiye), yöntem (Havale/EFT · Nakit · Kart · Çek), referans (≤ 100), Kasa/Banka hesabı (yalnız Nakit
      ve Havale'de zorunlu). Hesap listesi aynı döviz + aktif + türe göre süzülür. Uygun hesap yoksa "Bu dövizde aktif hesap
      yok…" yazar ve düğme pasif kalır.
    - Satış iadeleri tablosu (`FinanceStudioGrid screenKey="sales-returns"`): İade no, Tarih, Depo, Satır, Tutar, Durum
      "İşlendi/İptal", satır "İptal et".
    - İade formu yalnız `Posted` faturada görünür. Alanlar: tarih, iade deposu (aranabilir seçici; seçilince depo konumları
      yüklenir). Satır başına: Faturalanan, İade kalan (yalnız `Posted` iadeler düşülür), birim seçimi (kartın etkin
      birimleri), miktar (kalan 0 ise pasif), konum ("Depo düzeyi" boş). Alt not: "İade girişi seçilen depoya eklenir;
      müşteri cari hesabına alacak yazılır."
  - **Yazdırma / PDF yok.** Faturada `print` komutu ya da PDF şablonu yoktur (teklifte var: `SalesPage.tsx:1967`).
    **e-Fatura gönderimi bu ekranda yok.** Gönderim Entegrasyon kuyruğundadır: `/api/e-documents/source-documents` yalnız
    `Posted` faturaları listeler, `/api/e-documents/submissions` ile gönderilir (`IntegrationExecutionApiEndpoints.cs:55-118`,
    `IntegrationQueuePage.tsx`).
- **Girişler:**
  - App `pendingCustomerInvoiceId`: Cari Hesaplar → Satış faturaları penceresi → "Aç" `onOpenSalesInvoice(id)` çağırır.
    Bu, `setPage("sales-invoices")` yapar; açılışta `invoiceId` atanır ve değer temizlenir (`App.tsx:249-251, 1005-1010`;
    `SalesPage.tsx:389-394`; `CustomerSalesInvoicesPanel.tsx:140`).
  - Sipariş detayı ve irsaliye ekranı faturayı aynı sayfa örneği içinde `openInvoice` ile açar (`:3649, 9869-9882, 9981,
    10425-10431`).
  - Cari → "Yeni fatura": `sessionStorage["nexora.customer-sales-action"]` + `nexora:customer-sales-action` olayı;
    `sales-invoice-create` cariyi `actionCustomerId` olarak alır (`:126-161, 200-262, 2317`).
- **Sekmeler arası tazeleme:** başka bir satış sekmesindeki yazma `nexora:sales-changed` olayıyla duyurulur. Liste
  sekmeleri `load()` çağırır, oluşturma sayfaları formu korur (`:535-550, 653-656`).

#### Yeni fatura (`sales-invoice-create`)

- **Açılış** (`prepareInvoiceCreate`, `:658-677`): bütün cariler (`loadAllPages /api/customers/`) ve bütün aktif stok
  kartları (`loadStockItemCatalog`) yüklenir. Ardından form açılır. Aynı anda liste yüklemesi de çalışır: `load()` fatura
  sekmesinde `/api/sales/invoices`, `/api/warehouses/` ve `/api/sales/orders/?page=1&pageSize=100` çağırır (`:559-608`).
  Ayrıca `createOpen` olduğu için faturalanmamış irsaliyeler de çekilir (`:10531-10561`). Tam sayfa formda bunların hiçbiri
  kullanılmaz (bkz. G-SI14).
- **Kaynak seçimi:** tam sayfada yalnız **"Siparişsiz fatura + irsaliye" (bağımsız)** vardır. `fullPage` ise mod
  `standalone`'a sabitlenir ve yöntem sekmeleri çizilmez (`sales/components/SalesInvoiceFromDeliveryDialog.tsx:79-81,
  687-712`). Bileşendeki "Mevcut irsaliyeden" ve "Siparişten irsaliye oluştur" modları bu iki ekrandan **erişilemez**: liste
  penceresi hiç açılmaz (`setCreateOpen(true)` çağıran yok, `SalesPage.tsx:2318-2324`). Bu yollar bugün İrsaliyeler ekranı
  ("Fatura kes"/"Faturalaştır", `POST /api/sales/deliveries/{id}/invoice`, `:9869-9882`) ve sipariş detayıyla yürür
  (başka envanter).
- **Kayıt formu** (`RecordFormPage variant="page"`, `:951-1186`). Başlık "Yeni satış faturası". Belge şeridi: tür "Satış
  faturası", taraf = seçili müşteri adı, durum akışı Kesildi (kayıttan önce güncel adım yok), ipucu satır ekleme kısayolu
  (`sales/salesDocumentForm.tsx:14`).
  - Birincil komut çubukta "Kaydet" (Ctrl+S) olur. Müşteri seçilmemişse ya da bir satırda stok veya depo eksikse pasiftir:
    "Kaydetmek için müşteri ile her satırın stok ve deposunu seçin." (`:625-627, 970-982`; `salesActionBar.test.tsx:327-334`).
    `saveLabel` metni ("İrsaliye ve faturayı oluştur") yalnız eski başlık düğmesi içindir.
  - "Kaydet ve Yeni" ve "Temizle" yoktur (`onSaveIntent` verilmez, `record-form/RecordForm.tsx:160, 186-191`).
  - Yeni (F2) kirli formda sorar, formu yeniden kurar (`key` artar, `SalesPage.tsx:10680-10688`). Kirli sayılma: ilk
    cariden farklı müşteri, not ya da stoklu satır (`:628-634`).
  - Vazgeç ve Esc kirli formda "Kaydedilmemiş değişiklikler kaybolacak…" diye sorar ve `sales-invoices`'a döner
    (`RecordForm.tsx:274-296`; `salesDocumentForms.test.tsx:317`).
- **Durum satırı:** "Sipariş seçmeden fatura oluşturun. Seçilen depodan stok çıkışı ve faturaya bağlı irsaliye otomatik
  kaydedilir." + engel uyarısı + "Fatura toplamı N <döviz>" (`:986-1010`).

| Bölüm | Alan | Zorunlu | İstemci | Sunucu (`:4735-4921`, `PlatformContracts.cs:392`) |
|---|---|---|---|---|
| Belge bilgileri | Fatura tarihi | * | `date`, varsayılan bugün | kapalı dönemde 409 (`:4802-4803`). Aynı tarih irsaliye tarihi olur. |
| Belge bilgileri | Müşteri | * | aranabilir seçici; **aktif ve `Supplier` olmayan** cariler (Personel dahil), "kod · ad", açıklama döviz (`:1027-1048`) | aktif + `Customer`/`Both`/`Dealer` olmalı; değilse 400 "Aktif bir müşteri seçilmelidir." (`:4805`) |
| Belge bilgileri | Fatura türü | | Perakende (KDV dâhil) / Toptan (KDV hariç), varsayılan Toptan | `InvoiceType`; satır `IsVatIncluded` sunucuda türe göre **yeniden yazılır** (`:4830-4831`) |
| E-belge ve E-ticaret | Belge senaryosu | | seçim: boş, TEMELFATURA, TICARIFATURA, EARSIVFATURA, IHRACAT, YOLCUBERABERFATURA, KAMU, HKS, ENERJI, ILAC_TIBBICIHAZ | ≤ 32. **Numara serisini belirler** (bkz. 4.3). |
| E-belge | Belge tür kodu | | SATIS (varsayılan), IADE, TEVKIFAT, ISTISNA, OZELMATRAH, IHRACKAYITLI, TEVKIFATIADE, HKSSATIS, HKSKOMISYONCU | ≤ 32 |
| E-belge "Ek bilgiler" (katlanır) | Alıcı e-Fatura etiketi | | yalnız TEMEL/TICARI/KAMU senaryosunda | ≤ 255 |
| E-belge | Satın alma URL'si, aracı firma VKN/TCKN, ünvan, etiket, ödeme aracısı, ödeme türü, ödeme yöntemi, ödeme notu, aracı firma ülke / ülke kodu / şehir / ilçe, ödeme tarihi, son ödeme tarihi (`datetime-local` → ISO) | | yalnız EARSIVFATURA | uzunluk sınırları; VKN/TCKN 10–11 rakam; `paymentMeans` ∈ CREDIT_CARD, EFT, ON_DELIVERY, MEDIATOR, OTHER (istemcide serbest metin) (`PlatformContracts.cs:345-368`) |
| E-belge | Taşıyıcı VKN/TCKN, adı/ünvanı, soyadı, sevk tarihi | | senaryo seçiliyse | aynı |
| Fatura satırları (`dd-lines`) | Stok | * | aranabilir seçici, aktif kartlar "kod · ad", açıklama birim (`:509-532`) | aktif kart olmalı. Lot/seri takipli kart iki satırda olamaz (`:4818-4819`). |
| Satırlar | Depo | * | aranabilir seçici, aktif depolar; varsayılan ilk aktif depo; açıklama "Bu satırın stok çıkışı bu depodan yapılır" (`:533-556`) | depolar var ve aktif olmalı. **Ama çıkış başlık deposundan yapılır** (G-SI6). |
| Satırlar | Miktar | * | min 0.0001, adım 0.0001, varsayılan 1 | > 0, ≤ 4 ondalık |
| Satırlar | Birim fiyat (<müşteri dövizi>) | * | min 0, adım 0.0001, varsayılan 0 | 0–99.999.999.999.999,9999 |
| Satırlar | İskonto % | | 0–100, adım 0.01 | 0–100 |
| Satırlar | KDV % | | 0–100, varsayılan 20 | 0–100 |
| Satırlar | Birim | — | **sütun yok** | gönderilmez. Gönderilirse kartın temel birimi olmalı (`:4828-4829`). |
| Satırlar | Satır tutarı | — | **sütun yok**; yalnız alt toplamlara girer | — |
| Satırlar | Satır sil / ekle | | sil (tek satırda pasif), "Satır ekle" (Ctrl+Shift+Enter) (`:592-606, 1102-1108`) | 1–200 satır (`:4744`) |
| Toplamlar | Fatura notu | | textarea ≤ 1000, sayaç (`:1062-1074`) | ≤ 1000 (`PlatformContracts.cs:381-390`) |
| Fatura Özel Alanları | tanımlı her alan | tanıma göre | türe göre (Metin/Ondalık/Tarih/Evet-Hayır); tanım yoksa bölüm yok (`:218-291`) | `SalesInvoiceCustomFieldSupport.PrepareAsync` (`:4820-4821`) |
| Vergi Mevzuatı Profili | Hesap profili | * (görünürse) | `GET /api/finance/general-ledger/rule-profiles`: aktif ve `taxRules` dolu profiller. Varsayılan: `defaultForDocuments`, yoksa TR-LOCAL, yoksa ilki. Profil yoksa bölüm çizilmez, hata sessiz (`:187-217`). | `ResolveDocumentProfileAsync` (`:4806-4807`); vergi tutarını profil hesaplar (`:4832-4834`) |

- **Toplamlar** (`:456-483, 615-624`): Toplam tutar (ara toplam − iskonto), KDV %oran satırları, KDV toplamı, Genel toplam
  (vurgulu), "KDV tevkifat tutarı" **her zaman 0**, Ödenecek tutar (= genel toplam). Tutarlar "1.234,56 TL" biçimindedir
  (TRY yerine "TL").
  - Perakende türde girilen fiyat KDV dâhil sayılır ve matrah ayrıştırılır.
  - İstemci hesabı vergi profilini **bilmez**: ek vergi ya da tevkifat sunucuda hesaplanır, ekrandaki toplam farklı çıkabilir
    (G-SI9).
- **Döviz / kur:** fatura dövizi **müşterinin kart dövizidir**. Seçim ve kur alanı yoktur (`:491-493`; sunucu `:4874`).
  Satır sözleşmesindeki `CurrencyCode`/`ExchangeRateToQuoteCurrency` gönderilmez.
- **Vade:** fatura varlığında vade alanı yoktur (`Entities.cs:2498-…`). Müşterinin `paymentTermDays` değeri kullanılmaz.
- **Kayıt sonrası:** `onClose()` ve `onInvoiceCreated(id)` çağrılır. Liste yeniden yüklenir, sonra
  `onNavigate("sales-invoices")` ile listeye dönülür. Yeni fatura **açılmaz** (`SalesPage.tsx:2325-2332`). Hata formun
  hata şeridinde gösterilir (`:450-454, 984-985`).

### 4.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Liste açılışı, arama / sayfa, Yenile, `sales-changed` | `GET /api/sales/invoices/` | `q`, `page`, `pageSize=25` (`customerId` yalnız Cari penceresinde) | `erp.sales-invoices.read` (satır süzgeçli: durum + `customerId`, `PermissionStatusFilter.cs:8-…`) | `:4923-4953`. `InvoiceDate` sonra `CreatedAt`'e göre azalan. `pageSize` 1–100. `SalesInvoicePage{items, page, pageSize, totalCount}`. Öğede `customerTaxNumber`, `invoiceType`, `listCustomFields{"custom:<guid>": değer}`. |
| Her liste yüklemesi | `GET /api/warehouses/` | — | `erp.warehouses.read` | `:588`. Aktifler; iade deposu ve oluşturma için. |
| Her fatura listesi yüklemesi | `GET /api/sales/orders/?page=1&pageSize=100` | — | `erp.sales-orders.read` | `:589-594`. Yalnız erişilemeyen "siparişten" modu için (G-SI14). İzin yoksa **bütün liste yüklemesi hata verir** (`Promise.all`). |
| Açılış | `GET /api/screen-views/sales-invoices/active` | — | `erp.screen-views.read` | `:730-745`; hata sessiz |
| Satır seçilince, panel açıksa | `GET /api/sales/invoices/{id}` | — | `erp.sales-invoices.read` (satır süzgeçli) | panel özeti (`sales/useSalesListPanel.ts`) |
| Detay açılışı / Yenile / her yazmadan sonra | `GET /api/sales/invoices/{id}` | — | aynı | `:5019-5074`. `SalesInvoiceView`: satırlar, tahsilatlar, iadeler, özel alanlar, e-belge alanları, `paidAmount/returnedAmount/outstandingAmount`, `ledgerEntryId`, `accountingProfileCode`, `taxBreakdownJson`, `notes`. |
| Detay açılışı | `GET /api/finance/accounts` | — | `erp.finance-accounts.read` | `SalesInvoiceModal.tsx:188-190`. Hata **gösterilir** (G-SI17). |
| Detay açılışı | `GET /api/screen-views/sales-invoice-details/active` | — | `erp.screen-views.read` | hata sessiz |
| Tahsilat sekmesi ilk açılış | `GET /api/screen-views/sales-invoice-payments/active` | — | `erp.screen-views.read` | hata sessiz |
| Detay açılışı (satır başına) | `GET /api/stock/items/{stockItemId}/units` ×N | — | `erp.stock-items.read` | iade birimi seçenekleri (`:260-288`); biri düşerse hata şeridi |
| İade deposu seçilince | `GET /api/warehouses/{id}/locations` | — | `erp.warehouses.read` | aktif konumlar (`:552-572`) |
| Liste → İptal et; detay → Faturayı iptal et | `POST /api/sales/invoices/{id}/void` | — | `erp.sales-invoices.execute` (`void` yürütme bölütü, `PlatformPermissionCatalog.cs:387-398`) | `:5321-5354`. Rol denetimi yok. |
| Liste → Sil | `DELETE /api/sales/invoices/{id}` | — | `erp.sales-invoices.delete` + **TenantAdmin işleyici** (`:4714`) | yalnız `Voided` ve bağlı tahsilat/iade **kaydı** yoksa (iptal edilmiş olanlar dahil, `:4719-4721`) |
| Tahsilat kaydet | `POST /api/sales/invoices/{id}/collections` | `{requestId, collectionDate, amount, paymentMethod, reference?, financialAccountId?}` | **`erp.customer-collections.create`** (özel eşleme, `PlatformPermissionCatalog.cs:188-194`) | `:5075-5147`. `requestId` istemcide üretilir, başarıdan sonra yenilenir (`SalesInvoiceModal.tsx:80-82, 515`). |
| Tahsilat iptal | `POST /api/customer-collections/{id}/void` | — | `erp.customer-collections.execute` | `:5356-5410` |
| İade kaydet | `POST /api/sales/invoices/{id}/returns` | `{requestId, warehouseId, returnDate, lines[{salesInvoiceLineId, quantity, unitCode, storageLocationId?}]}` | **`erp.sales-returns.create`** (`PlatformPermissionCatalog.cs:211-217`) | `:5148-5320` |
| İade iptal | `POST /api/sales/returns/{id}/void` | — | `erp.sales-returns.execute` | `:5411-…` |
| Özel alan değerlerini kaydet | `PUT /api/sales/invoices/{id}/custom-fields` | `{values{kod: değer}}` | `erp.sales-invoices.update` | ≤ 40 değer; yalnız `Posted` (`:4653-4684`) |
| Değer geçmişi / geri yükle | `GET …/{id}/custom-fields/{definitionId}/history`; `POST …/history/{revisionId}/restore` `{confirmation:true}` | | `read` / `erp.sales-invoices.execute` | `:4685-4708` |
| Tanım ekle / düzenle / devre dışı | `POST`/`PUT`/`DELETE /api/sales/invoices/custom-fields[/{definitionId}]` | | `create` / `update` / `delete` + **işleyicide rol** (ekle/düzenle TenantAdmin veya TenantDeveloper; zorunluluk ve silme yalnız TenantAdmin) | `:4585-4630` |
| Oluşturma açılışı | `GET /api/customers/` (bütün sayfalar) + stok kataloğu (bütün sayfalar) | — | `erp.customers.read`, `erp.stock-items.read` | `:658-677`. Yüzlerce/binlerce kayıt (G-SI8). |
| Oluşturma açılışı | `GET /api/sales/invoices/custom-fields` | — | `erp.sales-invoices.read` | hata sessiz (`SalesInvoiceFromDeliveryDialog.tsx:173-186`) |
| Oluşturma açılışı | `GET /api/finance/general-ledger/rule-profiles` | — | `erp.general-ledger.read` | hata sessiz → bölüm gizli, sunucu varsayılan profili seçer |
| Oluşturma açılışı (kullanılmaz) | `GET /api/sales/deliveries/?unbilledOnly=true&q=&page=1&pageSize=25` | — | `erp.sales-deliveries.read` | `:10531-10561`; tam sayfada boşa gider |
| Cariden gelindiyse | `GET /api/customers/{id}` | — | `erp.customers.read` | önbellek yoksa (`:240-264`) |
| Kaydet | `POST /api/sales/invoices/` | `{requestId (her gönderimde yeni), customerId, warehouseId (= ilk satırın deposu), invoiceDate, accountingProfileCode?, customFields{kod: değer}, eDocument{…21 alan}, invoiceType, notes?, lines[{stockItemId, quantity, unitPrice, discountPercent, vatPercent, isVatIncluded, warehouseId}]}` | `erp.sales-invoices.create` | `:4735-4921`. Bağımsız irsaliye + stok çıkışı + fatura + cari borç tek işlemde. 201 `SalesInvoiceSummary`; aynı `requestId` + aynı içerik için 200. |
| (bağlam) İrsaliyeden fatura | `POST /api/sales/deliveries/{id}/invoice` | `{eDocument, accountingProfileCode, invoiceType[, customFields]}` | **`erp.sales-deliveries.create`** (fatura izni değil) | `:4434-4577`; İrsaliyeler ekranının konusu |

### 4.3 Kurallar

- **Durum makinesi:** `Posted = 1` → `Voided = 2` (`Entities.cs:2495`). Taslak durumu yoktur: kaydetmek faturayı keser.
  - Geri dönüş ve düzenleme yoktur. Satır, tutar, tarih, müşteri ve e-belge alanlarını değiştiren bir uç nokta yoktur.
    Yalnız özel alan değerleri `Posted` iken değişir.
  - `Voided` fatura silinebilir: TenantAdmin yapabilir, bağlı tahsilat ya da iade kaydı (iptal edilmiş dahil) olmamalıdır.
    Silme cari hareketlerin `SalesInvoiceId` bağını boşaltır; hareketleri silmez (`:4724-4729`).
- **İptal (void)** (`:5321-5354`). Ters kayıt tarihi **bugündür**, fatura tarihi kullanılmaz. Kapalı dönemde 409 döner.
  - Fatura yevmiyeye aktarılmışsa ve bu aktarım ters kayıtla kapatılmamışsa 409 döner.
  - Aktif (Posted) tahsilat ya da iade varsa 409 döner (`paidAmount`, `returnedAmount` ile).
  - İptal, cari borcun **alacak yönlü ters kaydını** (`ReversalOfId`) yazar.
  - İptal **stoku geri almaz**: irsaliye ve stok çıkışı yerinde kalır. İrsaliye iptali ayrıca yapılır. İrsaliye ekranı,
    faturası `Posted` olmayan irsaliyede İptal'i açar (`SalesPage.tsx:10433-10442`).
  - İrsaliyeden faturada `existing` denetimi durum bakmaz. İptal edilmiş faturası olan irsaliyeye tekrar "fatura kes"
    denirse sunucu **eski iptal faturayı** 200 ile döndürür (`:4445-4477`). Yeniden faturalamak için önce iptal faturayı
    silmek gerekir (kod çıkarımı).
- **Risk limiti** (`:4862-4868`; irsaliyeden `:4532-4539`; bağımsız irsaliyeden `StandaloneInventoryDocumentEndpoints.cs:242`):
  - Öngörülen bakiye = Σ borç − Σ alacak + fatura genel toplamı.
  - Bakiye limiti aşarsa 409 döner: "Fatura tutarı müşteri risk limitini aşacağı için kaydedilmedi." Yanıtta
    `currentBalance`, `projectedBalance` ve `riskLimit` de gelir.
  - Toplam **döviz ayrımı yapılmadan** alınır (Cari 1.3 ile aynı).
  - Açık sipariş ve irsaliyeler hesaba girmez.
  - İstemci risk denetimi yapmaz, yalnız sunucu metnini gösterir. Ek alanlar (bakiye, limit) ekranda kullanılmaz.
  - Test **bulunamadı** (`tests/` içinde fatura + risk limiti senaryosu yok).
- **Pasif / türü uygun olmayan cari:** sunucu yalnız aktif `Customer`/`Both`/`Dealer` kabul eder (`:4805`). İstemci
  `Employee`'yi de listeler (`SalesInvoiceFromDeliveryDialog.tsx:1031-1034`) ve sunucunun 400'üne düşer.
- **Stok:** başlık deposundaki bakiye − aktif rezervasyonlar ≥ istenen miktar olmalıdır. Negatif stok ayarı ve takip
  türüne göre istisna vardır (`:4843-4860`). Lot/seri, kullanılabilir izlerden ayrılır (`:4903-4904`). Maliyet, fatura
  tarihindeki ağırlıklı ortalamadır (`:4905`).
- **Satır deposu:** satır `warehouseId`'leri yalnız var ve aktif mi diye denetlenir (`:4808-4813`). Stok denetimi,
  izleme ayırması, `InventoryTransaction` ve irsaliye **başlık deposunda** yapılır (`warehouse.Id`, `:4844, 4888, 4903-4906`).
  İstemci başlık deposu olarak ilk satırın deposunu gönderir. Karışık depolu faturada öteki satırlar da ilk depodan düşer.
  Ayrıca idempotency karşılaştırması hareket deposunu satır deposuyla kıyaslar (`:4792`). Bu yüzden karışık depolu bir
  yeniden deneme her zaman 409 alır (kod çıkarımı; G-SI6).
- **Tutar hesabı:** `SalesQuoteValidation.Calculate`, ardından profilin vergi hesabı (`AccountingRuleTaxCalculator`,
  `:4832-4834`). Genel toplam ≤ 0 ise 409 döner: "Cari borç kaydı oluşturulabilmesi için…". Taşma (decimal(18,2)) da 409'dur.
- **İdempotency:**
  - Bağımsız fatura `RequestId` ile çalışır (`:4754-4800`). Anahtar irsaliye tablosunda tutulur.
  - Aynı anahtar ve **aynı içerik** (depo, tarih, müşteri, tür, profil, 21 e-belge alanı, satırlar) gelirse var olan fatura
    200 ile döner.
  - Farklı içerikte 409 döner: "Bu requestId farklı içerikle daha önce kullanılmış." İptal edilmiş sevkiyatta da 409 döner.
  - İstemci `crypto.randomUUID()`'yi **her gönderimde** yeniden üretir (`SalesInvoiceFromDeliveryDialog.tsx:427`). Bu yüzden
    ağ hatasından sonraki yeniden deneme **ikinci bir fatura** kesebilir (G-SI5).
  - Tahsilat ve iadede anahtar formda tutulur, yalnız başarıdan sonra yenilenir (doğru davranış).
- **rowVersion:** fatura varlığında ve görünümde `RowVersion` yoktur. Eşzamanlılık `UPDLOCK, HOLDLOCK` ve kiracı kilidiyle
  (`LockTenantForPostingAsync`) sağlanır. Tahsilat ayrıca `Serializable` işlemde yürür (`:5088`).
- **Numara serisi** (`TenantDocumentNumbering.cs:107-116`):
  - Senaryo `EARSIVFATURA` ise `EArchive` serisi kullanılır.
  - TEMEL / TICARI / IHRACAT / YOLCUBERABER / KAMU / HKS / ENERJI / ILAC_TIBBICIHAZ senaryolarında `EInvoice` serisi
    (senaryo bazlı) kullanılır. Bu serilerde numara 16 karakter, sıra en çok 9 hanedir; aşılırsa hata alınır (`:99-102`).
  - Senaryo boşsa `SalesInvoice` serisi kullanılır.
  - Bağımsız faturada irsaliyeye ayrıca `SalesDelivery` numarası alınır (`:4871`).
  - Numara fatura tarihine göre üretilir.
- **Kapalı dönem:** kesme, iptal, tahsilat, iade ve iptalleri dönem kapanışına tabidir (`FiscalYearCloseEndpoints`; testler
  `SettlementAndLedgerFiscalCloseRouteSqlAcceptanceTests.cs:181, 196`).
- **Cari ve muhasebe etkisi:**
  - Kesme: cari **borç** hareketi (`Satış faturası {kod}`) yazılır, fatura dövizindedir (`:4911-4913`). Fatura kesilirken
    yevmiye fişi **oluşmaz**; yevmiye aktarımı ayrı ekrandadır (`GeneralLedgerTransferEndpoints.cs:43, 516`).
  - Tahsilat: cari **alacak** + finans hesabı girişi (Nakit/Havale) + yevmiye fişi (`InvoiceSettlementJournalPosting`,
    `:5135-5137`). Tutar ≤ kalan bakiyedir. Hesap aynı dövizde, aktif ve yönteme uygun türde olmalıdır.
  - Tahsilat iptali: cari borç ters kaydı ve finans çıkışı yazılır. Kasa bakiyesi negatife düşecekse 409 döner, yevmiyeye
    aktarılmışsa 409 döner.
  - İade: stok girişi (kaynak sevkiyat lotu/serisiyle) + cari alacak yazılır. Miktar ≤ faturada kalan miktardır.
    **İrsaliye satırı bağlantısı olmayan faturada iade yapılamaz** (`:5206-5207`). Bağımsız irsaliyeden (`standalone-deliveries`)
    kesilen faturalarda `DeliveryLineId` boştur, iade sunucuda reddedilir; ekran yine de formu gösterir (G-SI16).
- **Açık bakiye** = max(0, genel toplam − aktif tahsilat − aktif iade) (`:5066`). Liste özeti bunu içermez.
- **Satır görünürlüğü:** liste, tek kayıt (panel + detay) ve asistan araması `PermissionStatusFilter` ile **durum** ve
  **müşteri** özniteliğine göre süzülür (`:4930, 5024-5026`). Yazma uçları (iptal, sil, tahsilat, iade, özel alan) bu
  süzgeci uygulamaz; satır kuralı yazmada yalnız izin denetiminde değerlendirilir (doğrulanmadı, Cari G-C3'e bakınız).
- **Özel alanlar:**
  - Kayıtta zorunlu alan denetimi yapılır.
  - Faturalar varken yeni zorunlu alan açılamaz (`:4595`). Bir alanı zorunlu yapmak için bütün `Posted` faturalarda değer
    olmalıdır (`:4613`).
  - Metin sınırı mevcut değerlerden küçük olamaz.
  - Tanım silme yalnız devre dışı bırakır.
- **Denetim kaydı:**
  - Faturanın kendisi: `sales-invoice.posted` (bağımsız akışta ayrıca `sales-delivery.posted`, `:4914-4915`),
    `sales-invoice.voided`, `sales-invoice.deleted`; bağımsız irsaliyeden kesmede `sales.standalone-delivery.invoiced`.
  - Bağlı kayıtlar: `customer-collection.posted/voided`, `sales-return.posted`.
  - Özel alan tanım ve değer olayları (`SalesInvoiceCustomFieldSupport`).

### 4.4 Roller

- **TenantAdmin:** satır süzgeci uygulanmaz. Listede Sil ve İptal et komutlarını görür. Silme işleyicisi yalnız TenantAdmin
  içindir. Özel alan tanımında zorunluluk ve devre dışı bırakma yalnız ondadır.
- **TenantDeveloper:** "Alan tanımla" ve "Tanımı düzenle" düğmelerini görür, zorunlu alan açamaz. Listede İptal et'i
  **görmez**, ama detayda "Faturayı iptal et" görünür ve izin varsa çalışır.
- **TenantUser:** liste, detay, oluşturma, tahsilat ve iade tamamen izin kurallarına bağlıdır:
  - `erp.sales-invoices.read/create/execute/update`;
  - tahsilat için `erp.customer-collections.create/execute`;
  - iade için `erp.sales-returns.create/execute`;
  - oluşturma için ayrıca `erp.customers.read`, `erp.stock-items.read`, `erp.warehouses.read`; fatura sekmesi yüklemesi için
    `erp.sales-orders.read` (G-SI14).

  Listede Sil ve İptal et görünmez, iptal ancak detaydan yapılır. Satır koşullu kurallar (durum/müşteri) listeyi ve detayı
  daraltır.
- **Kişisel ayar:** ekran görünümü (`sales-invoices`, `sales-invoice-details`, `sales-invoice-payments`) kiracı düzeyindedir.
  `erp.screen-views` izni olmayanda varsayılan sütunlar kullanılır (hata sessiz).

### 4.5 ERP işlem kataloğu

Var olan: **hiçbir `satis.*` işlemi yok** (`ErpOperationCatalog.cs`, `tests/IntegrationTests/ErpOperationCatalog.names.txt`).
Satışla ilgili yalnız rapor işlemleri var: `rapor.salesInvoices`, `rapor.salesDeliveries`, `rapor.salesOrders`,
`rapor.salesOrderFulfillment`, `rapor.salesQuotes`, `rapor.salesReturns`, ayrıca `rapor.customerLedgerEntries`
(`POST /api/reports/run`, sabit `source`, en çok 12 sütun; `ErpOperationCatalog.cs:186-190`, `ReportEndpoints.cs:347`).
Bunlar liste ekranının yerini tutmaz.
Modül sabiti yok: `"Satış"` eklenmeli (bugün `Stok`, `Depo`, `Raporlar`, `Üretim`, `Ayarlar`, `Satınalma`, `:63-68`).

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `satis.fatura.listele` | GET `/api/sales/invoices` | query `q`, `customerId` (guid), `page`, `pageSize` | list `SalesInvoiceSummary`, `rowsPath: "items"`, `MetaPaths [page, pageSize, totalCount]` | `listCustomFields` map'i sütun olmaz (G-SI2). Durum ve tarih süzgeci sunucuda yok (G-SI3). |
| `satis.fatura.getir` | GET `/api/sales/invoices/{id}` | route `id` | record `SalesInvoiceView` (skalerler) | panel, detay başlığı, kutucuklar, e-belge alanları |
| `satis.fatura.satirlari` | GET `/api/sales/invoices/{id}` | route `id` | list `SalesInvoiceLineView`, `rowsPath: "lines"` | `depo.transfer.kalemleri` ile aynı desen (`ErpOperationCatalog.cs:393-394`) |
| `satis.fatura.tahsilatlari` | GET `/api/sales/invoices/{id}` | route `id` | list `CustomerCollectionSummary`, `rowsPath: "collections"` | |
| `satis.fatura.iadeleri` | GET `/api/sales/invoices/{id}` | route `id` | list `SalesReturnSummary`, `rowsPath: "returns"` | iç içe `lines` atlanır. "İade kalan" hesabı G-SI12. |
| `satis.fatura.olustur` | POST `/api/sales/invoices` | body: `requestId` (sayfada `autoId`), `customerId`*, `warehouseId`*, `invoiceDate`*, `accountingProfileCode`, `invoiceType` (text: Wholesale/Retail), `notes`; map `customFields`; list `lines` (`SalesQuoteLineWriteRequest`: `stockItemId`*, `quantity`*, `unitPrice`*, `discountPercent`, `vatPercent`, `warehouseId`; `unitCode`, `currencyCode`, `exchangeRateToQuoteCurrency`, `isVatIncluded` **dışarıda bırakılmalı**) | record `SalesInvoiceSummary` | `eDocument` iç içe kayıt olduğu için parametre olamaz (**G-SI1**). `warehouseId` ilk satırdan bağlanmalı (G-SI6). 200/201 ikisi de başarı. |
| `satis.fatura.iptal` | POST `/api/sales/invoices/{id}/void` | route `id` | none (yanıt `{id, code, status}`) | execute. Onay `confirmEnabled`. |
| `satis.fatura.sil` | DELETE `/api/sales/invoices/{id}` | route `id` | none | `requiresTenantAdmin: true`; yalnız `Voided` için görünür |
| `satis.fatura.ozelAlanTanimlari` | GET `/api/sales/invoices/custom-fields` | — | list `SalesInvoiceCustomFieldDefinitionView` | oluşturma formu `customFieldsBlock` |
| `satis.fatura.ozelAlanDegerleri` | GET `/api/sales/invoices/{id}/custom-fields` | route `id` | list `SalesInvoiceCustomFieldValueView` | |
| `satis.fatura.ozelAlanKaydet` | PUT `/api/sales/invoices/{id}/custom-fields` | route `id`; map `values` | list `SalesInvoiceCustomFieldValueView` | `bodyMap {values ← satis.fatura.ozelAlanDegerleri: code→value}`, stok/cari ile aynı |
| `satis.fatura.tahsilatEkle` | POST `/api/sales/invoices/{id}/collections` | route `id`; body `requestId` (autoId), `collectionDate`*, `amount`*, `paymentMethod`* (Cash / Bank transfer / Card / Check), `reference`, `financialAccountId` | record `CustomerCollectionSummary` | izin `erp.customer-collections.create`. Katalog izni özel eşlemeyi görmeli (G-SI13). |
| `satis.fatura.tahsilatIptal` | POST `/api/customer-collections/{collectionId}/void` | route `collectionId` | none | execute; onaylı |
| `satis.fatura.iadeEkle` | POST `/api/sales/invoices/{id}/returns` | route `id`; body `requestId` (autoId), `warehouseId`*, `returnDate`*; list `lines` (`salesInvoiceLineId`*, `quantity`*, `unitCode`, `storageLocationId`) | record `SalesReturnSummary` | izin `erp.sales-returns.create`; ızgara kaynağı `satis.fatura.satirlari` (G-SI12) |
| `satis.fatura.iadeIptal` | POST `/api/sales/returns/{returnId}/void` | route `returnId` | none | execute; onaylı |

Seçenek kaynakları:
- Var olanlar: `stok.kart.listele` (sunucu araması `q`), `depo.listele`, `depo.konumlari`, `stok.kart.birimleri`.
- Gereken yeni işlemler:
  - müşteri seçenekleri: `cari.listele` önerildi (Cari 1.5); `type` tek değer alır, `Customer`+`Both`+`Dealer` için G-SI7;
  - `finans.hesaplar` (`GET /api/finance/accounts`, tahsilat hesabı);
  - `muhasebe.vergiProfilleri` (`GET /api/finance/general-ledger/rule-profiles`; `parametersJson` içindeki `taxRules` ve
    `defaultForDocuments` istemcide ayrıştırılıyor, G-SI10).

Sonraya (v1 dışı önerilir):
- Tanım yönetimi: `satis.fatura.ozelAlanTanimEkle` / `Guncelle` / `Kaldir`. Rol ayrımı TenantAdmin **veya** TenantDeveloper
  olduğu için G-K1'e takılır.
- Özel alan geçmişi: `satis.fatura.ozelAlanDegerGecmisi` ve `…DegerGeriYukle` (`fixedBody {confirmation:true}`).
- Başka envanterlerin konusu olan yollar: irsaliyeden fatura `satis.irsaliye.faturaKes` (`POST /api/sales/deliveries/{id}/invoice`,
  İrsaliyeler envanteri) ve siparişten irsaliye + fatura.
- e-Fatura gönderimi (Entegrasyon).

Gereken yeni `Labels` kodları (bugün yok; `Label()` açılışta hata verir):
- Liste ve başlık: `customerId`, `customerName`, `customerTaxNumber`, `invoiceDate`, `currencyCode`, `grandTotal`,
  `deliveryId`, `deliveryCode`, `orderId`, `orderCode`, `invoiceType`, `subtotal`, `discountTotal`, `taxTotal`,
  `ledgerEntryId`, `paidAmount`, `returnedAmount`, `outstandingAmount`, `accountingProfileCode`, `taxBreakdownJson`,
  `notes`, `eDocumentScenario`, `eDocumentTypeCode`, `eDocumentRecipientAlias`, `eCommerce*` (13 alan),
  `deliveryCarrier*` (3), `deliverySentAt`.
- Satır: `orderLineNumber`, `stockCode`, `stockName`, `unitPrice`, `discountPercent`, `vatPercent`, `lineSubtotal`,
  `discountAmount`, `taxAmount`, `lineTotal`, `isVatIncluded`.
- Tahsilat ve iade: `collectionDate`, `amount`, `paymentMethod`, `reference`, `financialAccountId`, `financialAccountName`,
  `returnDate`, `salesInvoiceId`, `salesInvoiceCode`, `salesInvoiceLineId`.
- `requestId`: Labels sözlüğünün ilk 70 satırında bulunamadı; `depo.transfer.olustur` için tanımlı olmalı, doğrulanmalı.

Var olanlar: `id`, `code`, `status`, `createdAt`, `lineCount`, `quantity`, `unitCode`, `stockItemId`, `warehouseId`,
`warehouseName`, `storageLocationId`, `label`, `value`, `dataType`, `maxLength`, `isRequired`, `definitionId`,
`definitionVersion`.

Ayrıca güncellenecek kayıtlar: `names.txt`, yeni `system-pages/salesInvoice*Operations.fixture.json` ve
`SystemPageStandards.versions.txt`.

### 4.6 Bileşen eşlemesi ve eksikler

Var olanlar:
- **Liste:**
  - `actionBar`: Yeni → `page @sales-invoice-create`. Aç → detay sayfası ya da `dialog` (xl) + `openParams id`. Sil
    `visibleWhen` TenantAdmin + `disabledWhen status != Voided`. `moreButtons`: İptal et, CSV. `titleCount
    {{liste.meta.totalCount}}`.
  - `metric` + `countWhen`: "bu sayfa" kartları. Tek döviz koşulu G-SI4.
  - `filterBar`: sunucu araması `searchParam q`.
  - `dataTable`: `paging: "server"` 25, `columnFormats` (`code=code`, `invoiceDate=date`, `grandTotal=money`,
    `status=status`), `valueLabels` (Posted=Kesildi, Voided=İptal), `toneMap`, `totals`, `rowActions`.
  - `contextPanel` + `tabs`: Özet / Satırlar / Tahsilat paneli.
- **Detay:**
  - `recordHeader`: kod, müşteri, durum, tarih, tür.
  - `steps`: Kesildi / İptal, koşullu; bileşen 2–6 etiket ister (`custom-page/StepsIndicator.tsx:7-20`).
  - `metric` ×3: Fatura toplamı, Tahsil edilen, Açık bakiye.
  - `section`/`card` + `text`: belge bilgileri, e-belge özeti, not.
  - `dataTable`: satırlar, tahsilatlar, iadeler.
  - `button`: tahsilat/iade "İptal et"; `rowActions` + `visibleWhen status == Posted`, `confirmEnabled`.
  - `dialog` (xl, `TenantCustomPage.tsx:1163`): tahsilat formu (`formCard` + `input` + `lookup`) ve iade formu.
- **Oluşturma:**
  - `formCard` + `input`: tarih `defaultValue {{bugun}}`, müşteri `lookup` + `searchable`, tür `select`.
  - `editableGrid` (`gridMode: "list"`, `maxRows: 200`, `minRows: 1`): sütunlar stok
    `lookup:stoklar:id:code:name|required`, depo `lookup:depolar:id:code:name|required`, miktar `number|required,min:0.0001,
    step:0.0001`, fiyat `number|required,min:0`, iskonto ve KDV `number|min:0,max:100`. Seçim sütunu bugün var
    (`custom-page/gridState.ts:10-35`).
  - `customFieldsBlock`: özel alanlar.
  - `input` `autoId`: `requestId` (`TenantCustomPage.tsx:717-729, 1577-1590`).
  - `alert`: kayıt hatası.

Eksikler (satış faturaları):

- **G-SI1 E-belge alanları iç içe kayıt (engelleyici değil, `fark` riski yüksek).** `eDocument`
  `SalesInvoiceEDocumentFields` 21 alanlı iç içe bir kayıttır. `BodyParameters` yalnız skaler üyeleri alır
  (`ErpOperationCatalog.cs:446-449, 466-476`), bu yüzden senaryo, tür kodu ve alıcı etiketi bağlanamaz. Senaryo **numara
  serisini** de belirler: e-Fatura/e-Arşiv numarası yerine iç seri kullanılır. `eksik`: katalogda iç içe kaydın düz
  parametreye açılması (`eDocument.scenario` gibi noktalı ad) ya da sunucuda düz alanlı yeni bir istek sözleşmesi. Cari
  G-C1 (adres) ile aynı motor eki.
- **G-SI2 Dinamik özel alan sütunları.** Liste `custom:<guid>` sütunlarını `listCustomFields` map'inden çizer. Map'ler
  sütun olmaz (Cari G-C2 ile aynı). `fark` ya da katalogda map açma.
- **G-SI3 Durum / tarih / müşteri süzgeci yok.** Eski ekranda da yok (`fark` değil). `filterBar` istemci süzgeci yalnız
  yüklenen 25 satırı süzer. `status` çipi eklenirse sayfalı listede yanıltır. Öneri: v1'de eklenmemeli; sonra sunucuya
  `status`, `dateFrom`, `dateTo` parametreleri.
- **G-SI4 Tek döviz koşullu sayfa toplamı.** "Kesilen" kartı satırlar tek dövizdeyse toplar, değilse "—" + "birden çok para
  birimi" gösterir. `metric` bağlamasında koşullu toplam/aritmetik yok. `fark` (kart yalnız sayı gösterir) ya da sunucuda
  döviz bazında sayfa toplamı. Aynı sorun Cari G-C13(c)'de var.
- **G-SI5 İstemci `requestId`'yi her gönderimde yeniler (eski ekran hatası).** Yeniden deneme çift fatura kesebilir.
  `autoId` doğru davranışı verir (pencere başına bir kez, başarıda yenilenir). `fark` (olumlu); kararla yazılmalı.
- **G-SI6 Satır deposu yok sayılıyor (sunucu hatası, kod çıkarımı).** Satırların depoları denetlenir ama çıkış başlık
  deposundan yapılır. Karışık depolu faturanın yeniden denemesi 409 alır (4.3). Taşımadan önce karar gerekir:
  - (a) ızgaradan depo sütununu kaldırıp başlıkta tek depo seçmek (sunucunun bugünkü gerçek davranışı);
  - (b) sunucuyu satır deposuna göre düzeltmek.

  Sistem sayfasında "ilk satırın deposunu başlığa bağla" ifadesi de yoktur (`{{kalemler.rows[0].warehouseId}}` benzeri
  doğrulanmalı). Öneri (a).
- **G-SI7 Müşteri seçeneklerinin süzülmesi.** Eski ekran bütün carileri yükleyip istemcide `isActive && type !==
  "Supplier"` ile süzer. Personel bu yüzden görünür, sunucu onu reddeder. `GET /api/customers` `type` parametresini tek
  değer olarak alır. `eksik`:
  - sunucuya `type` çoklu değer ya da `salesEligible=true` parametresi, veya
  - üç ayrı sorgu + birleştirme (motorda yok).

  `optionsWhen` ile istemci süzmesi yalnız yüklenen sayfada çalışır.
- **G-SI8 Büyük katalogların toptan yüklenmesi.** Cari ve stok kataloglarının hepsi bellekte tutulur. Sistem sayfasında
  `lookup` + sunucu araması (`searchParam`) bunun yerini alır (`fark`, olumlu). Stok seçicide açıklama "birim" idi. Bunun
  için `optionDescriptionColumn: unitCode` kullanılır.
- **G-SI9 Satır tutarı ve canlı toplamlar.** Eski form satır başına tutarı göstermez. Alt bantta Toplam tutar, KDV oranı
  dağılımı, KDV toplamı, Genel toplam, tevkifat (0) ve Ödenecek tutar canlı hesaplanır. Perakende türde fiyat KDV dâhil
  ayrıştırılır. `editableGrid`'de hesaplanan sütun ya da alt toplam **yok** (`gridState.ts` sütun türleri text/number/date/
  checkbox/lookup). `eksik`:
  - (a) ızgarada hesaplanan salt okunur sütun + toplam satırı, veya
  - (b) sunucuda "önizle" uç noktası (`POST /api/sales/invoices/preview`): profil vergilerini de doğru hesaplar ve
    istemci-sunucu farkını kapatır.

  Öneri (b) ile yeni bir `satis.fatura.onizle` işlemi. Ara çözüm olarak `fark`: toplamlar kayıttan sonra detayda görünür.
- **G-SI10 Vergi profili seçeneği.** Seçenek listesi `parametersJson` içinden `taxRules` doluluğuyla süzülür. Varsayılan da
  `defaultForDocuments`'tan seçilir. Bağlamalar JSON ayrıştıramaz. Profil yoksa bölüm gizlenir. `eksik`: sunucuda
  `GET …/rule-profiles?documentReady=true` + `isDefaultForDocuments` alanı. Ara çözüm `fark`: alan isteğe bağlı bırakılır,
  sunucu varsayılan profili kendisi seçer (`ResolveDocumentProfileAsync`).
- **G-SI11 E-belge alanlarının koşullu görünürlüğü.** Alıcı etiketi yalnız TEMEL/TICARI/KAMU senaryosunda, e-ticaret
  alanları yalnız e-Arşiv'de, taşıyıcı alanları senaryo seçiliyse görünür. "Ek bilgiler" katlanır ve sayaçlıdır.
  `visibleWhen` + `in` ile görünürlük kurulabilir. Katlanır grup için `section` gerekir (doğrulanmalı). `datetime-local`
  türü `input`'ta yok: `paymentDate`/`paymentDueDate` için `fark` (yalnız tarih) ya da yeni giriş türü. G-SI1 çözülmeden
  hepsi anlamsızdır.
- **G-SI12 İade ızgarası.** Satır başına "İade kalan" değeri = faturalanan − `Posted` iadelerin aynı satırdaki toplamı
  (`SalesInvoiceModal.tsx:673-680`). Hücreler: miktar, birim (satırın kartına **bağlı** `stok.kart.birimleri`) ve konum
  (seçili iade deposuna bağlı). `gridMode: "source"` ile satırlar `satis.fatura.satirlari`'ndan beslenebilir. Ancak:
  - (a) kalan miktar hesaplanmalı (sunucu `remainingReturnQuantity` alanı önerilir);
  - (b) satıra bağlı birim seçeneği Depo G-TR2(b) ile aynı eksiktir;
  - (c) miktarı 0 olan satır gönderilmemelidir: ızgaranın boş satırı atlaması doğrulanmalı.

  `eksik`; v1 öneri: iade formu "Eski ekranda aç" ya da Satış İadeleri envanterine bırakılır.
- **G-SI13 Özel izin eşlemeleri ve katalog `allowed`.** Tahsilat `erp.customer-collections.create`, iade
  `erp.sales-returns.create`, irsaliyeden fatura `erp.sales-deliveries.create`, iptaller `execute` ile çözülür
  (`PlatformPermissionCatalog.cs:188-217, 387-398`). Katalog izni bu yolları aynı `TryResolve` ile çözmezse yanlış izin
  gösterir. **Doğrulanmalı**, gerekirse test eklenmeli. Satır koşullu kurallar için Cari G-C3 burada da geçerlidir (durum
  ve müşteri öznitelikleri).
- **G-SI14 Erişilemeyen oluşturma modları ve gereksiz yüklemeler.** `SalesInvoiceFromDeliveryDialog`'un "Mevcut irsaliyeden"
  ve "Siparişten irsaliye oluştur" modları iki ekrandan da açılmaz. Buna rağmen fatura sekmesi her yüklemede 100 sipariş,
  oluşturma sayfası faturalanmamış irsaliyeleri çeker. `erp.sales-orders.read` izni olmayan kullanıcıda **fatura listesi
  hiç yüklenmez** (`Promise.all`, `SalesPage.tsx:574-594`; kod çıkarımı). Sistem sayfasında bu çağrılar kaldırılmalı
  (`fark`, olumlu). Modlar İrsaliyeler/Siparişler ekranlarında kalır.
- **G-SI15 Detay ekranı ve App köprüsü.** Detay `DocumentSurface` tam ekrandır. Girişleri:
  - Cari penceresinden `pendingCustomerInvoiceId`;
  - sipariş ve irsaliye ekranlarından `openInvoice` (aynı `SalesPage` örneği).

  Sistem sayfasında detay ya ayrı sayfadır (`@sales-invoice-detail` + `openParams id`) ya da xl `dialog`'dur.
  `eksik`:
  - (a) App `onOpenSalesInvoice`'ın sayfa parametresi yazması (`setPageParams("sales-invoices", {id})`);
  - (b) liste sayfasının açılışta `id` parametresiyle detayı açması (`defaultWhen`/`openParams` doğrulanmalı);
  - (c) irsaliye ve sipariş ekranlarının sistem sayfasına geçişi.

  Cari G-C13 ile aynı köprü.
- **G-SI16 İadesi desteklenmeyen fatura.** Bağımsız irsaliyeden kesilen faturalarda iade formu görünür, kayıt 409 alır.
  `visibleWhen` için görünümde "irsaliye satırı bağlı mı" bilgisi yok. `eksik`: `SalesInvoiceView`'a `canReturn` alanı.
  Ara çözüm `fark`: sunucu mesajı gösterilir (eski davranış).
- **G-SI17 Finans hesapları hatası.** Detay her açılışta `/api/finance/accounts` çağırır. İzin yoksa genel hata şeridi
  çıkar. Sistem sayfasında sorgu yalnız tahsilat penceresinde (`runOn` pencere açılışı) çalışmalı (`fark`, olumlu).
  Uygun hesap süzmesi (aynı döviz + aktif + yöntem türü) `optionsWhen` ile yapılabilir. Yöntem değişince seçimin
  temizlenmesi doğrulanmalı.
- **G-SI18 Özel alan değer düzenleme detayda.** Değerler `Posted` iken düzenlenir, sürüm etiketi ("v3"), geçmiş ve geri
  yükleme vardır. `customFieldsBlock` + `satis.fatura.ozelAlanKaydet` değerleri karşılar. Geçmiş ve tanım yönetimi v1
  dışıdır (Cari G-C21 ile aynı).
- **G-SI19 Yazdırma / PDF ve e-belge gönderimi yok.** Eski ekranda da yoktur (`fark` değil). Kullanıcı beklentisi
  olabilir. Ayrı iş olarak kaydedilmeli.
- **G-SI20 Kayıt sonrası davranış.** Eski sayfa kayıttan sonra listeye döner ve yeni faturayı **açmaz**. Bildirim de
  göstermez. Sistem sayfasında `afterSave` → liste + `successMessage` "F-… faturası kesildi." eklenebilir (`fark`, olumlu).
- **G-SI21 Yükleme durumu.** Liste ızgarasına `loading={false}` sabit verilir. "Faturalar yükleniyor…" hiç görünmez,
  yükleme sırasında boş liste metni çıkabilir. Çalışma zamanı yükleme durumunu doğru gösterir (`fark`, olumlu).
- **G-SI22 Tahsilat formunun koşulları.** Tutar varsayılanı açık bakiyedir, en çok açık bakiye girilir. Hesap alanı Nakit ve
  Havale'de zorunludur, Kart ve Çek'te gönderilmemelidir: sunucu 400 verir (`:5084-5085`). `visibleWhen` + koşullu
  `required` gerekir. Gizli alanın gövdeden **çıkarılması** doğrulanmalı, yoksa Kart'ta eski seçim gönderilip 400 alınır.
- **G-SI23 İngilizce test etiketleri.** Testler eski bileşen metinlerini doğrular (`salesActionBar.test.tsx:292-334`,
  `salesLists.test.tsx:216-272`, `salesDocumentForms.test.tsx:297-317, 435`). Sistem sayfasına geçişte bu testler yeniden
  yazılmalı (G-M6 ile aynı).

### 4.7 Görünüm anahtarları

- `sales-invoices` → `code`, `deliveryCode`, `orderCode`, `customerName`, `customerTaxNumber` (varsayılan gizli),
  `invoiceDate`, `lineCount`, `grandTotal`, `status`, `custom:<guid>…` (pasif tanımlar "(pasif)" ekiyle), `actions` (sabit)
  (`TenantScreenViewEndpoints.cs:288-294, 684, 1186-1189, 1468-1482`). Eşleme bire birdir. `custom:*` karşılıksızdır (G-SI2),
  `actions` aktarılmaz. `pageSettings` bu anahtarda yoktur (yalnız `customers`).
- `sales-invoice-details` → `customerName`, `invoiceDate`, `orderCode`, `deliveryCode`, `currencyCode`, `subtotal`,
  `discountTotal`, `taxTotal`, `grandTotal`, `paidAmount`, `returnedAmount`, `outstandingAmount`, `status`, `ledgerEntry`
  (`:301-310, 686`). Kart olarak çizilir (`:12`).
  - `ledgerEntry` görünüm sözleşmesinde yoktur: `ledgerEntryId`'den türetilen metindir. Eşleme `ledgerEntryId` + `valueLabels`
    ile kurulur ya da `fark` olur.
  - `grandTotal/paidAmount/outstandingAmount/status` ızgarada değil kutucuklarda gösterilir.
- `sales-invoice-payments` → `code`, `collectionDate`, `paymentMethod`, `reference`, `amount`, `status`, `createdAt` (gizli),
  `actions` (sabit) (`:149-152, 656, 1056-1059`). Eşleme: `paymentMethod` için `valueLabels` (Bank transfer=Havale, Cash=Nakit,
  Card=Kart, Check=Çek); `status` için Posted=Alındı, Voided=İptal (`SalesInvoiceModal.tsx:1212-1234`).
- `sales-returns` (detaydaki iade tablosu, `FinanceStudioGrid`) → `code`, `returnDate`, `warehouseName`, `lineCount`,
  `grandTotal`, `status`, `actions` (`:295-300`). Sütunlar sabit yazılmıştır; görünüm yalnız ızgara ayarlarını taşır.
  Satış İadeleri ekranıyla ortaktır.
- `customer-sales-invoices` Cari penceresine aittir (Cari 1.7).

### 4.8 Kaybolması kolay davranışlar ve riskler

- **Vergi no araması çalışmaz.** İstemci süzgeci `customerTaxNumber`'ı da arar, ama önce sunucu `q`'yu vergi no içermeyen
  alanlarda süzer (`:4931-4934`). Vergi no ile arama boş döner. Sistem sayfasında yalnız sunucu araması kalırsa davranış aynı
  olur. Doğrusu sunucuya `x.Customer.TaxNumber.Contains(term)` eklemek.
- **Kod bağlantısı tek tıkla açar.** Satıra tıklama yalnız seçer, kod bağlantısı seçip açar. `dataTable`'da kod sütunu
  bağlantısı (`rowOpenAction` + `columnFormats code`) ayrıca kurulmalı.
- **Listede iptal yalnız TenantAdmin, detayda herkes.** Eski ekranda tutarsızdır; sunucu yalnız izne bakar. Sistem sayfası
  tek kural seçmeli. Öneri: iki yerde de izne bağlı olsun, rol koşulu kalksın.
- **İptal stoku geri almaz; ters kayıt bugünün tarihiyle yazılır.** Kullanıcı onay metni "cari hareketi ters kayıtla
  kapatılacak" der, stoktan söz etmez. Sistem sayfasında aynı metin korunmalı. İrsaliye iptalinin ayrı yapılması gerektiği
  belirtilebilir.
- **İptal fatura silinmeden irsaliye yeniden faturalanamaz** (4.3, kod çıkarımı). Sil komutu bu yüzden işlevseldir,
  kaldırılmamalı.
- **Fatura türü satır KDV bayrağını ezer.** Perakendede fiyat KDV dâhildir. Ekrandaki toplam hesabı bunu yapar; sistem
  sayfasında önizleme yoksa (G-SI9) kullanıcı tutarı kayıttan önce göremez.
- **Döviz müşteri kartından gelir.** Fiyat sütun başlığı "Birim fiyat (USD)" gibi müşteri dövizini gösterir
  (`SalesInvoiceFromDeliveryDialog.tsx:1083`). Sistem sayfasında sütun etiketi bağlanamazsa döviz bilgisi kaybolur. Bunun
  için `text` ile "Fiyatlar {{musteri.currencyCode}} cinsindendir" notu eklenmeli.
- **Cariden gelen müşteri.** `sales-invoice-create` cariyi `sessionStorage` + olayla alır ve seçili getirir. Sistem
  sayfasında parametre köprüsü yoksa (Cari G-C12) "Yeni fatura" komutu boş form açar.
- **Kirli form ölçütü dardır.** Yalnız müşteri değişikliği, not ve stok seçimi kirli sayılır; e-belge alanları ve özel
  alanlar sayılmaz (`:628-631`). Çalışma zamanının `trackChanges`'i daha geniş olabilir (`fark`, olumlu).
- **Tahsilat tutarı varsayılanı** açık bakiyedir ve her yüklemede yeniden yazılır (`SalesInvoiceModal.tsx:174-176`). Formda
  yazılmış tutar başka bir yazma sonrası ezilir. Sistem sayfasında `defaultValue {{fatura.outstandingAmount}}` aynı davranışı
  verir.
- **Hesap uygun değilse düğme pasiftir.** Nakit/Havale seçilip uygun dövizde hesap yoksa "Tahsilat kaydet" pasif kalır,
  açıklama gösterilir (`:1344-1367`). `disabledWhen` + `disabledReason` ile korunmalı.
- **İade birim ve konumu satır başına seçilir.** Çok satırlı faturada her satır için birim sorgusu açılışta yapılır (N
  istek). Sistem sayfasında satır kapsamlı sorgu yoksa birim `text` olur; sunucu yanlış birimde 400 döner (`:5226-5228`).
- **Özel alan zorunluluğu kesmeyi engeller.** Zorunlu özel alan tanımlıysa ve `customFieldsBlock` eksikse kayıt 400 alır.
  Oluşturma sayfasında blok zorunludur.
- **Tarih ve kapalı dönem.** Fatura tarihi geçmişe alınabilir. Kapalı dönemde 409 metni gösterilmeli (`alert`). Numara
  fatura tarihine göre üretilir; yıl değişiminde seri sayacı da değişir.
- **Testler.**
  - İstemci: liste/çubuk (`salesActionBar.test.tsx:292-334`), ızgara ve panel (`salesLists.test.tsx:216-272`), oluşturma
    formu (`salesDocumentForms.test.tsx:297-317, 435`), detay akışı (`salesDocuments.test.tsx:381`).
  - Sunucu: not ve bağımsız fatura (`SalesInvoiceNotesIntegrationTests.cs:45-106`), kapalı dönem
    (`SettlementAndLedgerFiscalCloseRouteSqlAcceptanceTests.cs:181-196`), asistan araması, iade konumu.
  - **Test bulunamayanlar:** risk limiti, bağımsız faturada `requestId` yeniden denemesi (200/409), karışık depolu satırlar,
    iptal edilmiş faturası olan irsaliyenin yeniden faturalanması, satır koşullu okuma kuralları.

  Taşımadan önce en az risk limiti, karışık depo ve idempotency için sunucu testi önerilir.

---

## 5. Birleşik öneriler

### 5.1 Gereken ERP işlemleri (`satis.*`, modül sabiti "Satış")

Belge bölümlerindeki tabloların birleşimi; ayrıntı ve gövde eşlemeleri ilgili bölümdedir.

| Belge | v1 (Aşama A: liste + detay) | Aşama B (kart / yazma) | Sonraya |
|---|---|---|---|
| Teklif (1.5) | `satis.teklif.listele`, `getir`, `satirlari`, `revizyonlari`, `ilet`, `kabulEt`, `reddet`, `siparisOlustur`, `sil` | `olustur`, `guncelle`, `hesapla` (yeni uç nokta), `kurlar`, `ozelAlanTanimlari`, `ozelAlanDegerleri`, `ozelAlanKaydet`, `pdfSablonlari` | özel alan tanım yazma, değer geçmişi/geri yükleme, PDF şablon yazma |
| Sipariş (2.5) | `satis.siparis.listele`, `getir`, `kalemleri`, `irsaliyeleri`, `sil`, `stokAyir`, `rezervasyonBirak`, `teslimTarihiKaydet` | `olustur`, `guncelle`, `irsaliyeOlustur`, `ozelAlan*`, `satis.kurlar` | iptal/kapama (sunucuda uç nokta yok, G-SO27), özel alan tanım yazma |
| İrsaliye (3.5) | `satis.irsaliye.listele`, `getir`, `kalemleri`, `iptal`, `sil`, `faturalastir` | `siparistenOlustur`, `satis.siparissizIrsaliye.*` (`listele`, `getir`, `kalemleri`, `olustur`, `guncelle`, `kaydet`, `iptal`, `sil`; önce adlı yanıt türleri) | e-İrsaliye |
| Fatura (4.5) | `satis.fatura.listele`, `getir`, `satirlari`, `tahsilatlari`, `iadeleri`, `iptal`, `sil` | `olustur`, `onizle` (yeni uç nokta), `ozelAlan*`, `tahsilatEkle`, `tahsilatIptal`, `iadeEkle`, `iadeIptal` | yazdırma/PDF, e-Fatura gönderimi (Entegrasyon kuyruğu) |

Seçenek kaynağı olarak modül dışı işlemler de gerekir: `finans.hesaplar`, `muhasebe.vergiProfilleri`, plasiyer için
`ik.personel` (izin bağımlılığı G-SO23), stok/depo seçenekleri için var olan `stok.*` işlemleri (bölüm 0.7).
Yeni `Labels` kodları ve `names.txt`, `system-pages/sales*Operations.fixture.json`, `SystemPageStandards.versions.txt`
güncellemeleri belge bölümlerinde listelenmiştir.

### 5.2 Önerilen sıra

1. **Sunucu ve katalog (motor dışı):** "Satış" modülü + Aşama A işlemleri; G-S1 (üç oluşturma anahtarı standart menüye),
   G-S2 (`systemPageKeys.ts`), ad etiketleri. Eski ekran davranışı değişmez.
2. **Aşama A standartları:** `sales-quotes`, `sales-orders`, `sales-deliveries`, `sales-invoices` (liste + detay
   penceresi/sayfası), sürüm 1, `preview`, varsayılan eski ekran. QA Test Firma 20261117'de sırayla fatura → irsaliye →
   sipariş → teklif denenir (salt okunur riskten yazma riskine).
3. **Ortak motor işi (diğer modüllerle sıralanır):** G-S7, G-S8 (sunucu önizleme ile), G-S9, G-S10, G-S3/G-S4 (sayfa
   parametresi köprüsü), G-S11 (`allowed` satır öznitelikleri). Cari, satın alma ve finans envanterleriyle ortak.
4. **Aşama B standartları:** `sales-quote-create`, `sales-order-create`, `sales-delivery-create`,
   `sales-invoice-create`.

### 5.3 Önce karar verilmesi gerekenler

- G-SD1: siparişli irsaliye ile siparişsiz (bağımsız) irsaliye tek listede mi görünsün? (bugün ayrı tablolar; yeni
  irsaliye ekranında kaydedilenler `sales-deliveries` listesinde görünmüyor).
- G-SD7/G-SD8: `satis.irsaliye.faturalastir` gövdesi siparişli/siparişsiz ayrımı ve `customerId` zorunluluğu; işlem
  adı ve parametreleri kalıcı olacağı için Aşama A'dan önce.
- Eski ekran hataları (1.8, 2.8, 3.8, 4.8) taşımadan önce mi, taşımayla mı düzeltilsin? Öneri: sunucu hataları
  (G-SI6, `requestId` yenilenmesi, irsaliye iptal yetkisi G-SD10) ayrı küçük PR'larla önce.
