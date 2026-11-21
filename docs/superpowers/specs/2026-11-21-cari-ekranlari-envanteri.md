# Cari Hesaplar, Yeni Cari Kart ve Cari Kart Düzenleme: eşdeğerlik envanteri (A)

Bu belge üç yerleşik cari ekranını sistem sayfasına (standart tanım) taşımak için girdidir. Bilgiler kod okunarak
çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Biçim ve terimler `2026-11-19-stok-depo-ekranlari-envanteri.md` ile
aynıdır. Zarf ve yönlendirme kuralları `2026-11-18-sistem-sayfalari-design.md` belgesindedir. `fark` kabul edilmiş
davranış farkı, `eksik` taşımadan önce kapatılması gereken boşluk anlamına gelir.

Kapsam (yönlendirici: `frontend/erp-web/src/WorkspacePageRouter.tsx:262-274`; üç anahtar da aynı bileşeni açar):

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `customers` | Cari Hesaplar (liste + detay paneli) | `CustomersPage.tsx` + `customers/useCustomerListScreen.tsx`, `customers/components/{CustomerDirectoryHeader,CustomerFilters,CustomerGrid,CustomerDetailPanel}.tsx` |
| `customer-create` | Yeni Cari Kart | `CustomersPage.tsx` (`initialCreate`) + `customers/components/CustomerCreatePage.tsx` |
| `customer-edit` | Cari kart düzenleme | `CustomersPage.tsx` (`initialEdit`) + `customers/components/CustomerEditPage.tsx` (yalnız `CustomerCreatePage` sarmalayıcısı, `:6-11`) + `CustomerAddressSection.tsx` |

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir. `PlatformContracts.cs`
ve `PlatformPermissionCatalog.cs` `src/Platform/AIERP.Platform.Application/` altında, `PlatformPermissionAuthorizer.cs`
`src/Platform/AIERP.Platform.Infrastructure/` altındadır. Dosya adı yazılmayan satır numaraları `CustomersPage.tsx`
(frontend) ya da `Program.cs` (sunucu) içindir.

Not: `customers/components/CustomerReferenceSidebar.tsx` adına rağmen cariye özgü değildir. Çalışma alanının sağ
widget kenar çubuğudur (`WorkspaceShellPage.tsx:605`; hava, kur, vadesi geçen cariler, stok widget'ları). Bu envanterin
kapsamı dışındadır ve sistem sayfasına taşınmasından etkilenmez.

## 0. Ortak bilgiler

### Menü ve anahtarlar

- `customers` ve `customer-create` standart menü kataloğunda **var** (`StandardMenuEndpoints.cs:14`). `customer-edit`
  menüde **yok**. Yalnız gezinmeyle açılır (`:1061-1068`) ve modül menüsünde `customers`'a bağlanır
  (`shell/moduleMenus.ts:14-15, 62`).
- Üç anahtar için de henüz standart dosyası yok (`SystemPages/Standards/` altında yalnız 8 `inventory-*` dosyası var).
  `system-pages/systemPageKeys.ts:6` listesi de yalnız bunları içerir. Yeni standartlar sürüm 1 ve `preview` ile başlar.
- **Sistem sayfasına giden yolda yönlendirici bağlamı yoktur.** Sistem sayfası yalnız `token` ve `systemScreenKey`
  alır (`WorkspacePageRouter.tsx:185-192`). Eski ekrana verilen `initialSearch`, `onNavigate`, `onOpenSalesInvoice` ve
  `onOpenPurchaseInvoices` (`:264-273`) sistem sayfasına ulaşmaz (bkz. G-C12…G-C14).

### Yetki modeli

- `/api/customers…` → `erp.customers`, `/api/customer-groups…` → `erp.customer-groups`, `/api/location-definitions…` →
  `erp.customer-locations` (`PlatformPermissionCatalog.cs:50-51, 60, 278-280`). Eylem yoldan çıkar (`:337-345`):
  GET → `read`, PUT → `update`, DELETE → `delete`. POST'ta son parça `IsExecutionRoute` (`:387-397`) listesindeyse
  `execute`, değilse `create` olur:
  - `POST /api/customers`, `POST …/{id}/addresses`, `POST …/custom-fields`, `POST …/bulk-import`, `POST …/{id}/ledger`
    → `erp.customers.create`.
  - `POST …/custom-fields/{definitionId}/restore`, `POST …/history/{revisionId}/restore`, `POST …/ledger/{entryId}/reverse`
    → `erp.customers.execute`.
- **TenantAdmin** katalogu atlar (`PlatformPermissionAuthorizer.cs:53-55`). TenantUser ve TenantDeveloper için
  varsayılan **ret**tir; Allow kuralı gerekir, Deny kazanır.
- **Satır düzeyi görünürlük üç katmanlıdır:**
  1. *Liste ve seçenekler:* `CustomerCollectionPermissionFilter.ApplyAsync` (`CustomerCollectionPermissionFilter.cs:22-56`)
     `erp.customers.read` kurallarını SQL koşuluna çevirir. Desteklenen satır öznitelikleri `resource.customerid`,
     `resource.customertype` ve `resource.customeractive`'dir (`:19-20`). Bilinmeyen bir satır özniteliği varsa
     sonuç **boş** döner (`:36-39`). TenantAdmin süzülmez (`:26`). Liste (`:1415-1450`), tek kayıt (`:1452-1470`),
     ana firma seçenekleri (`:1397-1414`) ve bakiye (`CustomerBalanceEndpoints.cs:17-21`) bu süzgeçten geçer.
  2. *`{id}` ile GET:* grup düzeyindeki uç nokta süzgeci (`CustomerRowVisibilityEndpointFilter.cs:9-30`, kayıt
     `Program.cs:1063`) **yalnız GET** isteğinde ve yalnız `id` rota değerinde çalışır (`:12-15`). Görünmeyen kayıt 404 döner.
     Bu, `/{id}/addresses`, `/{id}/custom-fields`, `/{id}/statement`, `/{id}/ledger` ve `/{id}/balance` okumalarını da kapsar.
  3. *Yazmalar:* PUT ve POST için uç nokta süzgeci çalışmaz. Bunları yetki işleyicisi korur: TenantAdmin dışında
     `{id}` taşıyan her istekte kaydın türü ve durumu okunup `resource.customerId/customerType/customerActive` olarak
     eklenir (`PermissionAuthorizationHandler.cs:59-71, 149-156`). Kural ilgili eylemin (`update`, `create`) izniyle
     değerlendirilir. Yani okuma kuralı "yalnız müşteri" olan ama güncelleme kuralı satır koşulsuz olan bir kullanıcı,
     okuyamadığı bir carinin id'sini biliyorsa onu PUT ile güncelleyebilir. Bu bugünkü davranıştır.
  - `GET /api/customers` (liste) için işleyici `collectionRowsFiltered=true` ekler (`PermissionAuthorizationHandler.cs:52-58,
    76-90`). Yetkilendirici bu durumda satır öznitelikli bir Allow kuralını da yeterli sayar
    (`PlatformPermissionAuthorizer.cs:59-70`).
- **Rol denetimi olan işleyiciler:** özel alan tanımı ekleme/düzenleme TenantAdmin **veya TenantDeveloper**
  (`:1155-1158, 1181-1184`); tanım geri yükleme ve kaldırma yalnız TenantAdmin (`:1218, 1241`); toplu içe aktarma yalnız
  TenantAdmin (`MasterDataImportEndpoints.cs:16`); il/ilçe yönetimi yalnız TenantAdmin (`:1083-1142`). Cari oluşturma,
  güncelleme, adres, grup ve özel alan değeri yazmalarında **rol denetimi yok**.

### İdempotency ve eşzamanlılık

- Kapsamdaki yazmaların **hiçbiri** idempotency anahtarı almaz. Çift kayıt yalnız benzersizlikle sınırlıdır: cari
  kodu firmada benzersizdir (409 "Bu cari kodu bu firmada zaten kullanılıyor.", `:1482, 1532, 1576-1577`). Adres eklemede
  benzersizlik yoktur; çift tıklama iki adres yazar. Eski ekran bunu yalnız `busy` kilidiyle önler.
- **rowVersion** yalnız `PUT /api/customers/{id}` için zorunludur. Boşsa 400 döner (`:1556-1557`), uyuşmazlıkta 409:
  "Cari kart başka bir oturumda değiştirildi. Kaydı yenileyip tekrar deneyin." (`:1654, 1657`). Adres PUT'u, grup PUT'u
  ve özel alan değeri PUT'u rowVersion **almaz**. Özel alan yazmaları `UPDLOCK, HOLDLOCK` ile kilitlenir (`:1308-1309`).
- Eski düzenleme ekranı rowVersion'ı açılışta `GET /{id}` ile alır ve kayıt boyunca saklar (`:923`, `:1171`). Pasife
  alma ise önce taze bir `GET /{id}` yapar, sonra tam PUT gönderir (`:1253-1290`). Bu yüzden araya giren değişikliği
  fark etmez, son okunanı yazar.
- **PUT bir yer değiştirmedir.** `CustomerWriteRequest`'in her skaler alanı yazılır (`:1628-1636`). Gönderilmeyen
  iletişim/banka alanları `null` olur. İki istisna vardır: `Address == null` ise adreslere dokunulmaz (`:1637-1653`), ve
  `CustomFields == null` ise özel alan değerleri korunur (`:1579`). Map gönderilirse, mapte **olmayan** etkin alanların
  değeri silinir (`:1616-1621`).

### Çalışma zamanı ve tasarımcı, bugün (kısa; önceki envanterden farklı olanlar)

- Koşul dili artık `<`, `<=`, `>`, `>=` ve `+ N` toplamını bilir (`custom-page/conditions.ts:5-12`). Stok envanterindeki
  G-K5 kısıtı ("sıralama karşılaştırması yok") **geçersizdir**.
- `countWhen` yüklenmiş satırları koşula göre sayar (`custom-page/countWhen.ts:13-25`). Bu sayım sunucu sayaçlarının
  yerini tutmaz; sayfalı sorguda yalnız o sayfayı sayar.
- CSV ve seçili satır dışa aktarma bayrakları var (`showCsv`, `showSelectedExport`, `exportCsv`;
  `TenantCustomPageSchema.cs` SafePropsV2). Ancak `exportTable` yalnız **görünen** satırları aktarır. Sunucu sayfalı
  listede "Yalnız görünen sayfa aktarıldı" uyarısı verir (`TenantCustomPage.tsx:1407-1430`).
- Yazma gövdesi `{...kaynak, ...fixedBody}` ile başlar, bağlı parametreler üzerine yazılır (`custom-page/erpOperations.ts:77,
  105`). Kaynaklı işlemde yol değeri kaynağın aynı adlı alanıyla eşleşmelidir (`:170-182`). Cari için yol `{id}`, görünümde
  alan `id`'dir; bu yüzden depo G-D1 sorunu burada **yoktur**.
- `ScalarMembers` yalnız skaler alanları ve (istenirse) metin map'lerini parametre/sütun yapar (`ErpOperationCatalog.cs:465-487`).
  İç içe kayıt (ör. `CustomerWriteRequest.Address`) ne parametre ne sütun olur. `Columns<T>()` map'leri atlar
  (`:438-439`). `Label()` etiketi olmayan her kod için açılışta hata verir (`:494-495`).
- **Katalog `allowed` bayrağı**, rota değerleri boş GUID ve satır öznitelikleri olmadan çözülür
  (`ErpOperationCatalog.cs:561-584`). `collectionRowsFiltered` de eklenmez. Çalışma zamanı `allowed === false` olan
  sorgu eylemini çalıştırmaz (`TenantCustomPage.tsx:284, 2015, 2321, 2647`). Bkz. G-C3; cari için bu somut bir risktir.
- Sunucu doğrulama hataları (`ValidationProblem`) tek bir metne birleştirilir (`erpApi.ts:15-25, 31-34`). Alan
  vurgusu ya da sekme uyarısı oluşmaz.
- Çalışma zamanında "Kaydet ve Yeni" (Ctrl+F2), sayfa formunda Esc ile "Kaydedilmemiş değişiklikler" sorusu ve Ctrl+.
  detay paneli kısayolu **yok**. Kaydedilmemiş değişiklik sorusu yalnız pencere kapatırken ve kayıt değiştirirken
  sorulur (`TenantCustomPage.tsx:1262, 2261, 2638`).

---

## 1. Cari Hesaplar (`customers`)

### 1.1 Yerleşim

- **Başlık:** `pageSettings.title` (varsayılan "Cari Hesaplar"), açıklama "Müşteri ve tedarikçi kartlarını firma bazında
  yönetin.", sayaç = sunucudaki toplam (`directoryMetrics.total`) (`:59-60, 2090-2095`,
  `customers/components/CustomerDirectoryHeader.tsx`). Başlık, açıklama, arama etiketi ve yer tutucu, süzgeç etiketleri
  ve süzgeçlerin gizlenmesi **kiracı görünümünden** (`customers` görünümünün `pageSettings`) gelir (`:609-628`;
  sunucu `TenantScreenViewEndpoints.cs:804-805, 1436-1460, 1633`).
- **Özet kartları** (`useCustomerListScreen.tsx:129-170`; kartlar süzmez):

| Kart | Değer | Kaynak |
|---|---|---|
| Cari kartı | toplam; ipucu "tüm kayıtlar/aramayla eşleşen · N aktif" | sunucu sayacı (arama uygulanmış, tür/durum uygulanmamış) |
| Pasif | pasif sayısı | sunucu sayacı |
| e-Fatura mükellefi | "x / y", ipucu "bu sayfa" | yüklenen sayfa (`isEInvoiceRegistered`) |
| Risk limiti tanımlı | "x / y", ipucu "bu sayfa" | yüklenen sayfa (`riskLimit != null`) |

  Sunucu sayaçları sekiz ayrı `GET /api/customers/?page=1&pageSize=1[&q][&type|&status]` çağrısıyla alınır: toplam, beş
  tür, Aktif, Pasif (`:722-770`). Hata olursa sessizce `—` gösterilir.
- **Uyarı / bildirim şeritleri:** hata ve bildirim, ikisi de kapatılabilir (`:2097-2112`).
- **İşlem çubuğu** (`useCustomerListScreen.tsx:74-113`; kısayollar `commands/shortcuts.ts:6-18`, İşlemler menüsü Alt+İ):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | `customer-create` sekmesine geçer (`:1934`). |
| Aç | Enter | Odaklı ızgara satırı, yoksa seçili satır, yoksa tek işaretli satır. Hiçbiri yoksa "Önce bir kayıt seçin". `customer-edit`'i açar (`:1061-1069`). |
| Sil | Ctrl+Delete | Her zaman pasif, neden "Cari silinmez, pasife alınır" (`:19, 84`). Silme uç noktası yoktur. |
| Dışa aktar | Ctrl+E | **Bütün sayfaları** 100'lük parçalarla çeker ve Excel yazar (`:536-607`). Sütunlar: kod, ünvan, grup, tür, döviz, vade, vergi no, vergi dairesi, risk limiti, durum. |
| İşlemler → Yeni sipariş / teklif / irsaliye / fatura | | Seçim gerekir. Tür `Customer`/`Both`/`Dealer` değilse pasif, neden "Satış işlemleri yalnız müşteri ve bayi kartlarında" (`useCustomerListScreen.tsx:20`, türler `customerLabels.ts:26`). Cariyi `sessionStorage["nexora.customer-sales-action"]` + `nexora:customer-sales-action` olayı ile satış ekranına taşır (`:683-702`). |
| İşlemler → Cari mutabakatı | | Mutabakat penceresini açar (`:1655`, pencere `:2793-3158`; bkz. 1.6 G-C21). |
| İşlemler → Adresler / Özel alanlar | | Kartı ilgili bölümünde açar (`customer-edit` + `nexora.customer-edit-section`, `:1061-1069, 1128-1130`). |
| İşlemler → Özel alan tanımları ve geçmiş | | Özel alan değerleri penceresi (`:1297`, `:2177-…`). |
| İşlemler → Satış faturaları | | Tür `Supplier` değilse. `CustomerSalesInvoicesPanel` penceresi. |
| İşlemler → Alış faturaları | | Tür `Customer` değilse. `onOpenPurchaseInvoices` (App durumu) ile alış faturalarına gider. |
| İşlemler → Pasife al / Etkinleştir | | Seçim gerekir. **Onay sorulmaz.** Taze GET + tam PUT (`:1253-1295`). |
| İşlemler → Gruplar | | Cari grupları penceresi (`:2078-2084, 2653-2780`). |
| İşlemler → CSV / Excel içe aktar | | Yalnız TenantAdmin (`useCustomerListScreen.tsx:111`). `MasterDataImportDialog kind="customers"` (`:3359-3366`). |
| İşlemler → CSV olarak dışa aktar | | Bütün sayfalar, CSV (UTF-8 BOM). |

- **Süzgeç çubuğu** (`customers/components/CustomerFilters.tsx:40-100`):

| Süzgeç | Tür | Parametre / davranış |
|---|---|---|
| Arama "Cari kodu, unvanı veya vergi no ile ara" | metin, sunucu | `q`, **250 ms** gecikmeli, sayfayı 1'e alır (`:349-355`). Sunucu `Code`, `Name`, `TaxNumber` içinde `Contains` arar (`Program.cs:1424-1428`). |
| Cari türü | çip, sunucu | `type`; Tümü / Müşteri / Tedarikçi / Bayi / Personel / Müşteri & Tedarikçi, sayaçlı. Sayacı 0 olan çip gizlenir (`hideEmpty`). |
| Durum | çip, sunucu, temizlenebilir | `status` = `Active` / `Inactive`, sayaçlı. |
| Yenile | | yalnız listeyi yeniler (`:2129`). Sayaçları yenilemez. |
| Detay paneli anahtarı | | `SalesListPanelToggle`, Ctrl+. (`useCustomerListScreen.tsx:197`). |

- **Liste sütunları** (`:235-276` varsayılan, `:1868-1917` hücreler; görünüm `customers`, sunucu
  `TenantScreenViewEndpoints.cs:41-50` + özel alanlar `:1466-1480`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Cari kodu | mono kod. Sütun gizlenirse kod ünvanın altına yazılır (`:1884`). |
| `name` | Ünvan | metin + e-Fatura etiketi (`isEInvoiceRegistered`) |
| `groupName` | Cari grubu | boşsa "Grup atanmamış" |
| `type` | Tür | etiket (`customerTypeLabels`, `customerLabels.ts:8-14`) + ton: Tedarikçi warn, Personel off, diğerleri info |
| `currencyCode` | Döviz | metin |
| `paymentTermDays` | Vade | "N gün" |
| `taxNumber` | Vergi no | mono, boşsa — |
| `status` | Durum | Aktif (ok) / Pasif (off), `isActive`'ten |
| `identityNumber`, `taxOffice`, `riskLimit`, `parentCompanyName`, `subsidiaryCount`, `createdAt` | (varsayılan gizli) | `riskLimit` tr-TR sayı; `createdAt` tarih |
| `custom:<definitionGuid>` | özel alan etiketi | değer metni (liste yanıtındaki `customFields` map'inden, `Program.cs:1441-1449`) |
| `actions` | İşlemler | sabit alan; **sütun çizilmez** (`:672-679`) |

- Izgara: işaret sütunu, tıkla = seçim (kart açılmaz), çift tık / Enter = aç, ↑↓ gezinme, Boşluk işaretleme, toplu eylem
  "Excel (seçilenler)" (`useCustomerListScreen.tsx:115-127`, `CustomerGrid.tsx:39-66`). Sütun aracı ve pivot sayfa
  çubuğuna yerleşir (`toolbarContainer`).
- **Boş durumlar:** "Kayıtlar yükleniyor…", "Henüz cari kartı eklenmemiş.", "Aramanızla eşleşen cari kartı yok."
  (`CustomerGrid.tsx:52-55`).
- **Alt bilgi:** işaretli sayısı, gösterilen/toplam, sunucu sayfalama (25), ipuçları "↑↓ gez · Boşluk işaretle ·
  Enter kartı aç · Çift tık aç · Ctrl+. detay paneli" (`useCustomerListScreen.tsx:172-183`).
- **Seçim kuralı:** liste ilk satırı kendisi seçmez. Seçili kayıt yeni sayfada yoksa seçim kalkar. Global aramadan
  gelindiyse **o aramanın ilk eşleşmesi** bir kez seçilir. Geç dönen, süzülmemiş ilk yükleme dikkate alınmaz
  (`:703-721`, sıra kilidi `:508-534`).
- **Detay paneli** (`customers/components/CustomerDetailPanel.tsx`; panel açık ve satır seçiliyken; seçim yokken "Özetini
  görmek için listeden bir cari seçin.", `useCustomerListScreen.tsx:186-187`):
  - Üst: kod, "Aç" (Enter), ünvan, tür/durum/e-Fatura etiketleri, kapat (`CustomerDetailPanel.tsx:140-158`).
  - Göstergeler (`GET /{id}/balance`, yalnız panel açıkken ve satır değişince; `useCustomerListScreen.tsx:65-71`):
    Bakiye "186.242,00 TRY B/A/Dengede" (`CustomerDetailPanel.tsx:51-67`), Risk limiti, **Limit kullanımı %** = |bakiye| ÷ limit × 100. Bu yalnız
    bakiye ve kart dövizi aynıysa, limit > 0 ise ve bakiye borçsa hesaplanır; alacakta %0, %100 üstünde "bad" tonu
    (`CustomerDetailPanel.tsx:131-138, 169-173`). Vade "N gün". Altında not "cari dövizi; farklı dövizli hareketler ayrıştırılmaz".
  - **Sekmeler kiracı görünümünden** (`customer-details`) gelir. Her alanın `section`'ı bir sekme olur, sekmesi
    olmayanlar sabit eşlemeyle bölünür (`CustomerDetailPanel.tsx:42-49, 93-102`). Sunucu varsayılanı: Genel Bilgiler (grup, vergi no, TCKN),
    Finans (döviz, vade, risk limiti), Diğer (vergi dairesi) (`TenantScreenViewEndpoints.cs:51-56`). Ekran ayrıca
    görünümde olmayan `identityNumber`/`taxOffice`'i vergi no'dan sonra ekler (`CustomersPage.tsx:629-662`). Son sekme sabit
    **İletişim**'dir: telefon, kurumsal e-posta, yetkili kişi, yetkili telefon, e-Fatura alıcı etiketi (`CustomerDetailPanel.tsx:186-197`).
  - **Varsayılan adres** bölümü (her sekmede): etiket, adres, ilçe, il · posta kodu · ülke, varsa "Harita konumu: enlem,
    boylam" (6 ondalık). "Adresler" bağlantısı kartı Adresler bölümünde açar (`CustomerDetailPanel.tsx:203-233`). Adres, seçim değişince
    `GET /{id}/addresses` ile yüklenir. Seçilen satır: aktif + varsayılan + `General`; yoksa aktif + varsayılan
    (`CustomersPage.tsx:813-857`, `defaultAddressOf` `CustomersPage.tsx:170-176`). Düzenleme sekmesinde adres değişirse liste paneli
    `nexora:customer-addresses-changed` olayıyla güncellenir (`CustomersPage.tsx:802-812, 1581-1583`).
  - **İlgili kayıtlar:** Cari Hesap Hareketleri (mutabakat), Satış faturaları (Supplier değilse), Alış faturaları
    (Customer değilse), Özel alanlar (`CustomerDetailPanel.tsx:234-257`). İpucu "İşlemler (Alt+İ) — …" (`CustomerDetailPanel.tsx:258-260`).
- **Pencereler** (bu ekranın içinde açılır):
  - *Cari grupları* (`:2653-2780`): grup listesi (kod, ad, durum rozeti, Düzenle, Sil). Sil onay ister ("Gruba bağlı
    cari kartları varsa silme işlemi engellenir."). Altta grup formu: Grup kodu * (≤ 40), Grup adı * (≤ 120),
    "Kaydet ve Yeni" (`onSaveIntent`).
  - *Cari Özel Alan Değerleri* (`:2177-2400`): seçili carinin alanları türe göre (Metin/Ondalık/Tarih/Evet-Hayır),
    "Değerleri kaydet", her alanda "Değer geçmişi" (son 50) ve "Önceki değeri geri yükle" (onaylı). "Alan tanımları"
    düğmesi yalnız TenantAdmin/TenantDeveloper'a görünür ve tanım listesi / yeni tanım ekranını açar (`:2400-2652`;
    düzenle = ardışık `promptCustomerValue`: etiket ≤ 120, metin sınırı 1–500, zorunluluk yalnız TenantAdmin,
    `:1412-1477`; devre dışı bırak ve sürüm geri yükleme yalnız TenantAdmin).
  - *Satış faturaları* (`CustomerSalesInvoicesPanel.tsx`): `GET /api/sales/invoices/?customerId=&page=&pageSize=25`
    (`:140`), görünüm `customer-sales-invoices` (`:104`). Sütunlar fatura, sipariş, irsaliye, tarih, satır, tutar,
    durum (Posted/Voided) ve "Aç". Kesilmiş faturaların döviz bazında toplamı yalnız o sayfa içindir (`:166-178`).
    "Aç", `onOpenSalesInvoice` → App `pendingCustomerInvoiceId` (`App.tsx:249, 1007-1010`) üzerinden fatura ekranında
    o faturayı açar.
  - *Cari mutabakatı* (`:2793-3158`) ve *Yeni hareket* (`:3159-3257`): bakiye şeridi, tarih aralıklı ekstre, harici
    ekstre CSV'si ile karşılaştırma (`parseCustomerStatementCsv` `:62-155`), ekstre CSV indirme, manuel hareket ve ters
    kayıt. Bu bölüm **bu belgenin kapsamı dışındadır**; ayrıca envanterlenmelidir (giriş noktası burada sayılmıştır).
  - *İçe aktar* (`MasterDataImportDialog`, `POST /api/customers/bulk-import`).
  - Ortak onay/istem penceresi (`:456-507, 3259-3357`).

### 1.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, süzgeç/sayfa değişimi, Yenile | `GET /api/customers/` | `q`, `page`, `pageSize=25`, `type?`, `status?` | `erp.customers.read` (satır süzgeçli) | `:1415-1450`; ada, sonra koda göre sıralı; `pageSize` 1–100'e kırpılır; `CustomerPage{items, page, pageSize, totalCount}`; öğede `customFields{"custom:<guid>": değer}` |
| Açılış, arama değişimi | `GET /api/customers/?page=1&pageSize=1…` ×8 | `q?` + `type` ya da `status` | `erp.customers.read` | sayaçlar (`:722-770`); hata sessiz |
| Açılış ve her liste yüklemesi | `GET /api/customer-groups/` | — | `erp.customer-groups.read` | `:1344-1350`; ada göre sıralı; liste her `load()` ile yeniden çekilir (`:717-720`) |
| Açılış | `GET /api/customers/company-options` | (`q`, `excludeId` gönderilmez) | `erp.customers.read` | `:1397-1414`; aktif, Supplier/Employee hariç, satır süzgeçli, **en çok 200**; form için |
| Açılış | `GET /api/location-definitions/` | — | `erp.customer-locations.read` | `:1067-1074`; aktif il ve ilçeler (adla eşleşir) |
| Açılış | `GET /api/screen-views/customers/active` | — | `erp.screen-views.read` | sütunlar + `pageSettings`; hata **gösterilir** (`:622-624`) |
| Açılış | `GET /api/screen-views/customer-details/active` | — | `erp.screen-views.read` | panel sekmeleri; hata gösterilir |
| İlk seçimde | `GET /api/screen-views/customer-detail-movements/active` | — | `erp.screen-views.read` | mutabakat sütunları (`:306-321`); hata sessiz |
| Satır seçilince | `GET /api/customers/{id}/addresses` | — | `erp.customers.read` | varsayılan adres (`:813-857`) |
| Satır seçilince, panel açıksa | `GET /api/customers/{id}/balance` | — | `erp.customers.read` | `CustomerBalanceEndpoints.cs:11-26`; `CustomerLedgerBalance{currencyCode, balance, balanceSide, riskLimit}`; hareketler döviz ayrımı yapılmadan toplanır |
| Dışa aktar (Excel/CSV) | `GET /api/customers/?pageSize=100&page=1..n` | süzgeçler | `erp.customers.read` | bütün sayfalar (`:536-607`) |
| Pasife al / Etkinleştir | `GET /api/customers/{id}` + `PUT /api/customers/{id}` | PUT: kartın tüm skaler alanları + `isActive: !isActive` + `rowVersion`; `address` ve `customFields` **gönderilmez** | `read` + `erp.customers.update` | `:1253-1295`; onay yok; bakiye denetimi yok |
| Gruplar: kaydet | `POST /api/customer-groups/` / `PUT /api/customer-groups/{id}` | `{code, name}` | `erp.customer-groups.create` / `update` | `:1351-1384`; kod büyük harfe çevrilir, firmada benzersiz (409) |
| Gruplar: sil | `DELETE /api/customer-groups/{id}` | — | `erp.customer-groups.delete` | `:1385-1397`; bağlı cari varsa 409 |
| Özel alan değerleri penceresi | `GET /api/customers/custom-fields` + `GET /api/customers/{id}/custom-fields` | — | `erp.customers.read` | `:1145-1151, 1253-1262` |
| Değerleri kaydet | `PUT /api/customers/{id}/custom-fields` | `{values{kod: değer}}` | `erp.customers.update` | `:1304-1335`; ≤ 40 değer; mapte olmayan alan **silinir**; zorunlu alan denetimi |
| Değer geçmişi / geri yükle | `GET …/{id}/custom-fields/{definitionId}/history`; `POST …/history/{revisionId}/restore` `{confirmation:true}` | | `read` / `erp.customers.execute` | `:1263-1303`; geri yükleme yeni revizyon yazar |
| Tanım ekle / düzenle / kaldır / geçmiş / geri yükle | `POST`/`PUT`/`DELETE /api/customers/custom-fields[/{definitionId}]`, `…/history`, `…/restore` | | `create` / `update` / `delete` / `read` / `execute` | `:1152-1252`; rol denetimleri 0'da |
| İçe aktar | `POST /api/customers/bulk-import` | satırlar | `erp.customers.create` | **TenantAdmin işleyici** |
| Satış faturaları penceresi | `GET /api/sales/invoices/?customerId=…` + `GET /api/screen-views/customer-sales-invoices/active` | | `erp.sales-invoices.read` (satır süzgeçli) | |

### 1.3 Kurallar

- **Silme yok.** Cari kartı yalnız pasife alınır. Pasife almada sunucu bakiye, açık belge ya da hareket denetimi
  **yapmaz**; PUT `IsActive`'i doğrudan yazar (`:1629`). Pasif cariye yeni manuel hareket eklenemez (`:1771`). Satış
  faturası pasif ya da müşteri türünde olmayan cariye kesilemez (`:4494`).
- **Risk limiti kartta yalnız saklanır** (negatif olamaz, `PlatformContracts.cs:772-773`). Uygulandığı yerler başka
  ekranlardadır: satış faturası kaydı (`:4533-4538`), manuel borç hareketi (`:1774`), bağımsız satış faturası (`:4862-4867`) ve
  bağımsız belgeden fatura (`StandaloneInventoryDocumentEndpoints.cs:242`). Paneldeki "Limit kullanımı" yalnız istemcide hesaplanan bir
  göstergedir; açık sipariş ve irsaliyeler dahil değildir (`CustomerDetailPanel.tsx:69-74`).
- **Bakiye** döviz ayrımı yapılmadan borç − alacak olarak toplanır ve kart dövizinin etiketiyle gösterilir
  (`PlatformContracts.cs:847-853`).
- **Satır görünürlüğü** (0'a bakınız): liste, seçenekler, tek kayıt ve bakiye süzülür. Ana firma adı ve bağlı firma
  sayısı da yalnız **görünen** kayıtlar üzerinden hesaplanır (`:1437-1439, 1465-1467`). Ana firması görünmeyen bir carinin
  görünümünde `parentCompanyId` **null** gelir.
- **Türe bağlı komutlar:** satış işlemleri `Customer`/`Both`/`Dealer`; Satış faturaları ≠ `Supplier`; Alış faturaları
  ≠ `Customer` (`customerLabels.ts:26`, `useCustomerListScreen.tsx:88-102`, `CustomerDetailPanel.tsx:240-251`).
- **Arama** sunucuda `Contains` ile çalışır (kod, ünvan, vergi no). Tür süzgeci bilinmeyen değeri yok sayar
  (`Enum.TryParse`), durum yalnız `Active`/`Inactive` kabul eder (`:1429-1431`).
- **Sayaçlar** arama uygulanmış, tür ve durum uygulanmamış sayımlardır. "Bu sayfa" kartları yalnız yüklenmiş 25 satırı
  sayar.
- **Grup silme** bağlı cari varsa engellenir. Grup pasife alma uç noktası yoktur; `CustomerGroup.IsActive` yazılmaz
  (yalnız okunur).
- **Denetim kaydı:** `customer.created`/`customer.updated` (`:1530, 1655`), `customer-address.created/updated`
  (`:1693, 1713`), `customer-group.created/updated/deleted`, `customer-custom-field.*` (`values-updated`, `restored`,
  `value-restored`, `deactivated`…). Pasife alma ayrı eylem yazmaz; `customer.updated` olarak görünür.

### 1.4 Roller

- **TenantAdmin:** her şey; satır süzgeci uygulanmaz; içe aktarma görünür ve çalışır; özel alan tanımında zorunluluk,
  kaldırma ve geri yükleme yapabilir.
- **TenantDeveloper:** "Alan tanımları" düğmesini görür; tanım ekler/düzenler (zorunlu yapamaz, kaldıramaz, geri
  yükleyemez). Diğer her şey izin kurallarına bağlıdır (Allow gerekir).
- **TenantUser:** liste, kart, adres, grup ve özel alan değeri işlemleri tamamen izin kurallarına bağlıdır (işleyicide
  rol denetimi yok). Satır koşullu okuma kuralları listeyi ve paneli daraltır. İçe aktar ve Alan tanımları görünmez.

### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `cari.*` işlemi yok** (`ErpOperationCatalog.cs`, `tests/IntegrationTests/ErpOperationCatalog.names.txt`).
Cariyle ilgili yalnız iki rapor işlemi var: `rapor.customers` ve `rapor.customerLedgerEntries` (`POST /api/reports/run`,
sabit `source`; `ErpOperationCatalog.cs:188`). Bunlar liste ekranının yerini tutmaz (rapor sütunları en çok 12, satır
süzgeci ayrı, sayfalama rapor sözleşmesine göre).

Yeni (önerilen; modül sabiti `"Cari"` eklenmeli):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `cari.listele` | GET `/api/customers` | query `q`, `type`, `status`, `page`, `pageSize` | list `CustomerView`, `rowsPath: "items"` | `customFields` map'i sütun olmaz (G-C2). `allowed` riski: G-C3. |
| `cari.getir` | GET `/api/customers/{id}` | route `id` | record `CustomerView` | düzenleme ve durum değişikliğinin kaynağı |
| `cari.olustur` | POST `/api/customers` | body `CustomerWriteRequest` skalerleri (`code`*, `name`*, `type`*, `currencyCode`, `paymentTermDays`, `riskLimit`, `groupId`, `parentCompanyId`, `taxNumber`, `identityNumber`, `taxOffice`, `isEInvoiceRegistered`, `eInvoiceRecipientAlias`, iletişim, muhasebe, banka; `isActive` hariç tutulup `fixedBody {isActive:true}` önerilir; `rowVersion` hariç) + map `customFields` | record `CustomerView` | `address` iç içe kayıt olduğundan parametre olamaz (**G-C1**). |
| `cari.guncelle` | PUT `/api/customers/{id}` | route `id`; body aynı skalerler, `sourceBacked` (bağlanmayan alan kaynaktan gelir); `isActive` hariç | record `CustomerView` | kaynak `cari.getir`. `customFields` **bu işlemde yok** (ayrı `cari.ozelAlanKaydet`, bkz. 3.3). `address` yine G-C1. |
| `cari.pasifeAl` | PUT `/api/customers/{id}` | route `id` (diğerleri kaynaktan, parametre olarak sunulmaz) | record `CustomerView` | kaynak `cari.getir`, `fixedBody {isActive:false}`. Eski davranışa eşdeğer (taze okuma + tam PUT). |
| `cari.aktifEt` | PUT `/api/customers/{id}` | route `id` | record `CustomerView` | `fixedBody {isActive:true}` |
| `cari.bakiye` | GET `/api/customers/{id}/balance` | route `id` | record `CustomerLedgerBalance` | panel göstergeleri |
| `cari.adresleri` | GET `/api/customers/{id}/addresses` | route `id` | list `CustomerAddressView` | `IsDefault` önce, sonra etikete göre sıralı (`:1671-1674`) |
| `cari.anaFirmaSecenekleri` | GET `/api/customers/company-options` | query `q`, `excludeId` | list `CustomerCompanyOption` | lookup; `excludeId` ile "kendisi hariç" sunucuda çözülür |
| `cari.gruplar` | GET `/api/customer-groups` | — | list `CustomerGroupView` | seçenek kaynağı (yalnız aktifler: G-C20) |
| `cari.ozelAlanTanimlari` | GET `/api/customers/custom-fields` | — | list `CustomerCustomFieldDefinitionView` | |
| `cari.ozelAlanDegerleri` | GET `/api/customers/{id}/custom-fields` | route `id` | list `CustomerCustomFieldValueView` | |
| `cari.ozelAlanKaydet` | PUT `/api/customers/{id}/custom-fields` | route `id`; map `values` | list `CustomerCustomFieldValueView` | `bodyMap {values ← cari.ozelAlanDegerleri: code→value}` (stok.kart.ozelAlanKaydet ile aynı); mapte olmayan kod silineceği için bodyMap şarttır |
| `cari.iller` | GET `/api/location-definitions/provinces` | — | list `CustomerLocationProvinceView` | `GET /api/location-definitions` iç içe iki liste döndürdüğü için kullanılamaz (iç içe liste sütun olmaz) |
| `cari.ilceler` | GET `/api/location-definitions/districts` | query `provinceId` (int) | list `CustomerLocationDistrictView` | il **adı** saklandığı için il id'sine bağlanamaz (G-C10) |
| `cari.adres.ekle` | POST `/api/customers/{id}/addresses` | route `id`; body `CustomerAddressWriteRequest` skalerleri (`kind`*, `label`*, `addressLine`*, `city`*, `district`, `postalCode`, `countryCode`, `isDefault`, `latitude`, `longitude`) | record `CustomerAddressView` | `isDefault` hesabı G-C9 |
| `cari.adres.pasifeAl` | PUT `/api/customers/{id}/addresses/{addressId}` | route `id`, `addressId`; body adres skalerleri (satırdan bağlanır) | record `CustomerAddressView` | kaynaksız (tek adres okuması yok); `fixedBody {isActive:false, isDefault:false}` (eski ekran `:1642`) |
| `cari.adres.aktifEt` | PUT aynı yol | aynı | record `CustomerAddressView` | `fixedBody {isActive:true}`; `isDefault` satırdan |

Sonraya (v1 dışı önerilir): `cari.grup.olustur` / `guncelle` / `sil`; `cari.ozelAlanTanimEkle` / `Guncelle` (TenantAdmin
**veya** TenantDeveloper, G-K1 gibi tek bayrakla ifade edilemez) / `Kaldir` / `TanimGecmisi` / `TanimGeriYukle`
(`requiresTenantAdmin`); `cari.ozelAlanDegerGecmisi`, `cari.ozelAlanDegerGeriYukle` (`execute`, `fixedBody
{confirmation:true}`); `cari.iceAktar` (`requiresTenantAdmin`); mutabakat ve hareket işlemleri (ayrı envanter).

Gereken yeni `Labels` kodları (bugün yok; `Label()` açılışta hata verir): `type`, `taxNumber`, `groupId`, `groupName`,
`currencyCode`, `riskLimit`, `paymentTermDays`, `identityNumber`, `taxOffice`, `parentCompanyId`, `parentCompanyName`,
`subsidiaryCount`, `isEInvoiceRegistered`, `eInvoiceRecipientAlias`, `phone`, `email`, `website`, `contactName`,
`contactPhone`, `contactEmail`, `priceListCode`, `receivableAccountCode`, `payableAccountCode`, `bankName`,
`bankBranchCode`, `iban`, `addressLine`, `city`, `district`, `postalCode`, `countryCode`, `isDefault`, `latitude`,
`longitude`, `balance`, `balanceSide`, `provinceId` (`cari.ilceler` sonuç sütunu). Var olanlar: `id`, `code`, `name`, `isActive`, `createdAt`, `rowVersion`, `kind`,
`label`, `dataType`, `maxLength`, `version`, `isRequired`, `value`. Ayrıca güncellenecek kayıtlar: `names.txt`, yeni
`system-pages/customer*Operations.fixture.json` ve `SystemPageStandards.versions.txt`.

### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → `page @customer-create`, Aç → `page @customer-create` + `openParams id=…`, Sil gizli ya da
`disabledReason`, `moreButtons` ≤ 10, `titleCount {{liste.meta.totalCount}}`), `filterBar` (sunucu arama `searchParam q`,
`type`/`status` seçimi), `dataTable` (sunucu sayfalama 25, `valueLabels` tür etiketleri, `toneMap` tür/durum tonu,
`status` biçimi, `rowActions`), `metric` + `countWhen` ("bu sayfa" kartları), `contextPanel` / `card` (detay paneli),
`tabs`, `button` (`visibleWhen`/`disabledWhen` + `in` ile türe bağlı komutlar, `confirmEnabled`), `dialog`.

Eksikler (cari listesi):

- **G-C2 Dinamik özel alan sütunları.** Kiracı `customers` görünümüne `custom:<guid>` sütunları ekleyebilir. Değerler
  liste yanıtında `customFields` map'indedir. `Columns<T>()` map'leri atladığı için (`ErpOperationCatalog.cs:438-439`)
  ne sütun olur ne `screenViews` eşlemesinde karşılık bulur. `fark` (özel alan sütunları düşer) ya da katalogda map
  açma (`flatten` benzeri `customFields.<kod>`). Anahtar tanım **GUID**'idir, kod değildir; ayrıca eşlenmelidir.
- **G-C3 Satır koşullu izinlerde `allowed` yanlış negatif.** Katalog izni boş GUID ile, satır özniteliği ve
  `collectionRowsFiltered` olmadan çözülür (`ErpOperationCatalog.cs:561-584`). Okuma izni yalnız `resource.customerType
  == Customer` gibi satır koşullu bir Allow kuralıyla verilmiş TenantUser'da `MatchesAttribute` özniteliği bulamaz.
  Bu yüzden ilgili işlemler **`allowed=false`** görünür; oysa sunucu gerçek istekte kaydın özniteliklerini ekleyip
  izin verir (`PermissionAuthorizationHandler.cs:59-71`), listede de süzerek verir (`PlatformPermissionAuthorizer.cs:59-70`).
  Çalışma zamanında `allowed` okunan yerler düğme/satır eylemleri, yazma dizileri ve kod bileşeni çağrılarıdır
  (`TenantCustomPage.tsx:284-286, 2015, 2321, 2647-2652`). `runOn: load` okumaları ise yalnız sayfanın `view` hakkına
  bakıyor görünür (`:1992`). Beklenen sonuç: liste yüklenir, ama satır koşullu `update`/`create` kuralı olan
  kullanıcıda Pasife al / Etkinleştir / Kaydet / Adres ekle **nedenli pasif** kalır. Ayrıca Studio tasarımcısı işlemi
  izinsiz gösterir. Bu bir **kod çıkarımıdır** (`IsAllowedManyAsync` okunmadı). `eksik`: katalog izni satır öznitelikli
  kuralları "kayıt düzeyinde karar sunucuda" saymalı (koleksiyonda `collectionRowsFiltered`). Taşımadan önce TenantUser +
  satır kuralıyla test gerekir.
- **G-C4 Sunucu sayaçları.** Çip ve özet kartı sayaçları sekiz ayrı `pageSize=1` çağrısının `totalCount`'udur. Sekiz ek
  `cari.listele` sorgusu (`{{sayacX.meta.totalCount}}`) teknik olarak mümkündür (sorgu sınırı 30). Ancak `filterBar`
  seçeneklerine başka sorgudan sayaç bağlanıp bağlanamadığı **doğrulanmalı**. `facetCounts` yüklenmiş satırları sayıyor
  gibi görünüyor (`TenantCustomPage.tsx:947`). Olmazsa `fark`: sayaçlar yalnız özet göstergelerde kalır. "Sayacı 0
  olan tür çipi gizlenir" davranışı da düşer.
- **G-C5 Bütün sayfaların dışa aktarımı.** Eski Ctrl+E / CSV bütün arama sonucunu kendi 10 sütunuyla aktarır.
  Çalışma zamanı yalnız görünen sayfayı aktarır ve uyarır. `fark` (G-K7 ile aynı), ya da sunucu tarafı dışa aktarma.
- **G-C6 Kiracıya bağlı panel sekmeleri.** Panel sekmeleri `customer-details` görünümündeki `section` değerlerinden
  üretilir; kiracı yeni bölüm adı verebilir. `tabs` durağandır, `defaultTab` bağlanamaz. `fark`: sabit üç sekme
  (Genel Bilgiler / Finans / Diğer) + İletişim. Kiracının alan gizleme/sıralama tercihleri panelde uygulanmaz.
- **G-C7 Hesaplanan panel değerleri.** "Limit kullanımı %" (döviz eşitliği ve borç tarafı koşullu oran), "B/A/Dengede"
  taraf metni ve "%100 üstü kırmızı" tonu. Bağlamalarda aritmetik yok; koşullar yalnız karşılaştırma yapar. `eksik`
  ya da sunucuda `CustomerLedgerBalance`'a `limitUsagePercent` ve `balanceAbs` eklenmeli. Bu durumda **yeni işlem adı**
  (`cari.bakiye` sonucunu sonradan değiştirmek yerine) açılmalıdır.
- **G-C8 Varsayılan adres seçimi.** Panel, adres listesinden koşula göre **ilk** satırı seçer (aktif + varsayılan +
  General, yoksa aktif + varsayılan). "Koşulu sağlayan ilk satır" bağlaması yok. `fark`: `cari.adresleri` satırı
  `rows[0]` (sunucu `IsDefault`'u öne sıralar ama türü ve aktifliği gözetmez; pasif ya da Fatura adresi görünebilir).
  Doğrusu sunucuda `defaultAddress` alanı ya da `?kind=General&activeOnly=true` parametresi.
- **G-C12 Satış belgesine cariyle geçiş.** "Yeni sipariş/teklif/irsaliye/fatura" cariyi `sessionStorage` + pencere
  olayıyla taşır (`:683-702`); satış ekranları bunu okur (`SalesPage.tsx:126-127, 227`, `SalesDeliveriesPage.tsx:92`,
  `useWorkspaceTabs.ts:45`). `erpPage` eylemi yalnız `q` taşır (`custom-page/navigationActions.ts:69-72`). `eksik`:
  eski satış ekranları için parametreli giriş (ör. `erpPage` + `params customerId`) ve onların sayfa parametresini
  okuması gerekir. Aksi halde dört komut düşer.
- **G-C13 Fatura pencereleri ve uygulama durumu.** Satış faturaları penceresi ve "Aç" → `pendingCustomerInvoiceId`
  (`App.tsx:249, 1007-1010`). "Alış faturaları" → `pendingPurchaseSupplier` (`App.tsx:1011`). İkisi de sistem
  sayfasına verilmeyen geri çağırımlardır. Pencere, `dialog` + `dataTable` (`/api/sales/invoices?customerId`) ile
  kurulabilir. Ancak (a) bu okuma için `satis.fatura.listele` işlemi yok, (b) "faturayı aç" köprüsü yok, (c) döviz
  bazında sayfa toplamı hesaplanamaz. `eksik`.
- **G-C14 Global arama.** Global arama `customers`'ı `initialSearch` ve `nexora:customer-search-request` olayıyla açar
  ve ilk eşleşmeyi bir kez seçer (`useWorkspaceSearch.ts:72-77`, `:331-348, 703-721`). Sayfa parametresi yazmaz
  (`pageNavigation.ts:43-46` kullanılmaz). Sayfa tarafı kısmen hazırdır: `filterBar` süzgeçleri sayfa
  parametresinden ön değer alır (`custom-page/filterBarModel.ts:290-301`, `TenantCustomPage.tsx:1679`); arama kutusunun
  da alıp almadığı doğrulanmalı. `eksik` olan esas taraf global aramadır: `setPageParams("customers", {q})` yazmalı. "İlk eşleşmeyi seç" için ayrıca karar gerekir (`fark`
  olabilir). Aynı metinle tekrar arama da yeniden uygulanmalıdır (`seq`).
- **G-C15 Ekran ayarları (`pageSettings`).** Kiracının başlık, açıklama, arama etiketi/yer tutucu, süzgeç etiketleri ve
  tür/durum süzgecini gizleme ayarları `customers` görünümünde saklanır. `screenViews` eşlemesi yalnız alanları taşır.
  `fark` (kiracı ayarları sistem sayfasında yok sayılır; sistem sayfası Studio'da ayrıca düzenlenir) ya da geçişte
  bu ayarların standart taslağa aktarılması.
- **G-C19 Izgara klavyesi ve Ctrl+.** ↑↓ / Boşluk / Enter / çift tık davranışı ve Ctrl+. panel anahtarı. Çalışma
  zamanı `DataTableGrid.tsx`'te klavye işleyicisi hızlı aramada bulunamadı (büyük/küçük harf duyarlı arandı).
  **Doğrulanmalı**; yoksa `fark`. Panel anahtarı
  stok pilotundaki gibi bir onay kutusu `input`'udur.
- **G-C20 Seçenek süzme.** Grup seçicisi yalnız **aktif** grupları gösterir (`CustomerCreatePage.tsx:298-300`).
  `cari.gruplar` süzgeç almaz. G-K3 ile aynı: `fark` ya da sunucuya `activeOnly` parametresi.
- **G-C21 Alt pencereler v1 dışı.** Cari grupları, özel alan değerleri/tanımları/geçmiş/geri yükleme, cari mutabakatı
  (ekstre, CSV karşılaştırma, hareket, ters kayıt) ve içe aktarma. Öneri: v1'de "Eski ekranda aç" (`onOpenLegacy`).
  Mutabakat kendi envanterini ister. Tanım ekranının TenantAdmin/TenantDeveloper ayrımı G-K1'e takılır.
- **G-C22 Onaysız pasife alma.** Eski ekran pasife alırken onay sormaz. Sistem sayfasında `confirmEnabled` ile onay
  eklemek bir iyileştirmedir (`fark`, olumlu). Kararla yazılmalı.
- **G-C25 İngilizce arayüz.** Testler İngilizce etiketleri doğrular (`customersList.test.tsx:268-283`). Sistem sayfası
  tek dillidir. `fark` (G-M6 ile aynı).

### 1.7 Görünüm anahtarları

- `customers` → `code`, `name`, `groupName`, `type`, `currencyCode`, `paymentTermDays`, `taxNumber`, `status`,
  `identityNumber`, `taxOffice`, `riskLimit`, `parentCompanyName`, `subsidiaryCount`, `createdAt`, `custom:<guid>…`,
  `actions` (sabit) (`TenantScreenViewEndpoints.cs:41-50, 1466-1480`). Eşleme: `status → isActive`, diğerleri bire bir.
  `custom:*` karşılıksızdır (G-C2), `actions` aktarılmaz, `pageSettings` aktarılmaz (G-C15).
- `customer-details` → paneldeki alanlar ve sekmeler (G-C6). `customer-detail-movements` ve `customer-sales-invoices`
  kapsam dışı pencerelere aittir.

---

## 2. Yeni Cari Kart (`customer-create`)

### 2.1 Yerleşim

- **Açılış:** form alanları sıfırlanır, adres etiketi "Merkez", ülke TR olur. Sonra özel alan tanımları **20 saniye
  zaman aşımıyla** yüklenir. Zaman aşımında "Cari formu verileri zamanında yüklenemedi…" + "Yeniden dene" + "Cari
  listesine dön" gösterilir (`:859-903, 2052-2076`). Yükleme sürerken "Cari kartı formu yükleniyor…".
- **Kayıt formu v3** (`CustomerCreatePage.tsx:217-631`, `record-form/RecordForm.tsx`): başlık "Cari Kart Tanımlama",
  birincil komut Kaydet (Ctrl+S, "Cari Kartı Kaydet"), İşlemler → "Kaydet ve Yeni" (Ctrl+F2) ve "Temizle", Vazgeç
  (Esc). Esc, yazılmış değer varsa "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?" diye sorar
  (`RecordForm.tsx:71, 189, 206-215, 277-291`).
- **Durum çubuğu:** "Zorunlu alanlar: n / 4" (kod, ünvan, tür, döviz), e-Fatura uyarısı, "Kaydet ve Yeni" sonrası bildirim,
  "Kaydedilmemiş değişiklik var" (kod veya ünvan girildiyse) (`:192-199, 215, 246-255`).
- **Kimlik grubu** (sekmelerin üstünde, her zaman görünür) ve **sekmeler** (`:182-191`): İletişim ve Adres / Finans ve
  Muhasebe / Vergi ve E-Fatura / Özel Alanlar (yalnız tanım varsa). Sekmeler hatalı alanda uyarı işareti taşır
  (`:213-214`).

| Bölüm | Alan | Zorunlu | İstemci | Sunucu (`PlatformContracts.cs:727-777`, `Program.cs:1471-1541`) |
|---|---|---|---|---|
| Cari Kimliği | Cari kodu | * | `maxLength 64`, `required` | trim, ≤ 64, **büyük harfe çevrilir**, firmada benzersiz (409) |
| Cari Kimliği | Ünvan | * | `maxLength 200` | trim, ≤ 200 |
| Cari Kimliği | Cari türü | * | seçim, varsayılan Müşteri (5 değer) | enum |
| Cari Kimliği | Cari grubu | | yalnız **aktif** gruplar, "Grup atama" boş | grup firmada var ve aktif olmalı |
| İletişim | Telefon, Kurumsal e-posta, Web sitesi | | `tel`/`email`/`url`, 40 / 254 / 255 | aynı sınırlar; trim, boş → null |
| Yetkili Kişi | Yetkili kişi, Yetkili telefon, Yetkili e-posta | | 160 / 40 / 254 | aynı |
| Adres (birincil) | Ülke | | seçim, varsayılan TR; değişince il/ilçe temizlenir | 2 harf ISO |
| Adres | İl | adres girildiyse | serbest metin + öneri listesi (TR ise iller), ≤ 100; değişince ilçe temizlenir | ≤ 100, zorunlu |
| Adres | İlçe | | serbest metin + seçili ilin ilçe önerileri (ada göre eşleşir) | ≤ 100 |
| Adres | Posta kodu | | ≤ 20 | ≤ 20 |
| Adres | Adres | il/ilçe/posta girildiyse | `textarea` ≤ 400 | ≤ 400, zorunlu |
| Adres | Harita konumu | | Leaflet + OpenStreetMap karosu, tıklayarak enlem/boylam (`CustomerFormControls.tsx:105-…`) | ikisi birlikte; enlem −90..90, boylam −180..180 |
| Finans | Döviz kodu | * | büyük harf, 3 karakter, varsayılan TRY | 3 harf ISO |
| Finans | Vade günü | | sayı 0–3650, varsayılan 0 | 0–3650 |
| Finans | Risk limiti | | sayı ≥ 0, adım 0.01, boş = "Belirtilmedi" | ≥ 0 |
| Finans | Fiyat listesi kodu | | ≤ 40 | ≤ 40 |
| Muhasebe ve Banka | Alıcı / Satıcı muhasebe hesabı | | mono, ≤ 40 | ≤ 40 |
| Muhasebe ve Banka | Banka adı, Şube kodu | | 120 / 40 | aynı |
| Muhasebe ve Banka | IBAN | | boşluk silinir, büyük harf, ≤ 34; **ISO 13616 mod-97 ve ülke uzunluğu** (`identifierValidation.ts:45-59`); hata alandan çıkınca | aynı algoritma (`TurkishIdentifierValidation`) |
| Bağlı Firma | Grup şirketi / Ana firma | | aranabilir seçici (`company-options`), "Bağımsız firma" temizler | aktif, Supplier/Employee olmayan firma |
| Vergi ve Kimlik | Vergi dairesi | | ≤ 120 | ≤ 120 |
| Vergi ve Kimlik | Vergi numarası | | **TR ise** yalnız rakam, 10 hane, GİB VKN sağlaması; değilse serbest ≤ 32 (`CustomerCreatePage.tsx:514-529`) | ≤ 32; TR ise VKN sağlaması |
| Vergi ve Kimlik | T.C. kimlik no | | yalnız rakam, 11 hane, TCKN sağlaması | 11 rakam + sağlama |
| E-Fatura | E-Fatura mükellefi | | onay kutusu | |
| E-Fatura | Alıcı etiketi (PK) | | yalnız mükellefse görünür, ≤ 255 | ≤ 255 |
| Özel Alanlar | tanımlardan dinamik | tanıma göre | türe göre giriş; Text `maxLength`; "kod · tür" ipucu | tür/uzunluk normalizasyonu, zorunlu alan, ≤ 40 değer |

### 2.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış | `GET /api/customers/custom-fields` | — (20 sn zaman aşımı) | `erp.customers.read` | |
| Açılış (bileşen ortak) | `GET /api/customer-groups/`, `GET /api/customers/company-options`, `GET /api/location-definitions/`, liste ve sayaç çağrıları | | | Oluşturma sekmesi de liste `load()` ve sayaç çağrılarını **yapar**, çünkü aynı bileşendir (`:715-770`). Gereksizdir; sistem sayfasında olmamalı. |
| Kaydet / Kaydet ve Yeni | `POST /api/customers/` | tüm alanlar; boş metinler `null`; `address` yalnız adres satırı/il/ilçe/posta girildiyse `{kind:"General", label: etiket‖"Merkez", …, isDefault:true}`; `isActive:true`; `riskLimit` boşsa `null`; `customFields{kod:değer}` | `erp.customers.create` | `:986-1059`; tek işlemde kart + adres + özel alan + revizyon + denetim (`:1488-1531`) |

### 2.3 Kurallar

- **Kimlik doğrulama** istemci ve sunucuda aynı algoritmayla çalışır (`identifierValidation.ts:1-3`). Gönderimde hata
  varsa kaydetme durur. İlk hatalı alanın sekmesi açılır (VKN/TCKN → Vergi ve E-Fatura, IBAN → Finans), şeritte ilk
  ileti gösterilir (`:973-985`).
- **VKN kuralı adres ülkesine bağlıdır.** Kart, gönderilen adresin ülkesi TR ise ya da **adres hiç gönderilmiyorsa**
  Türk sayılır (`PlatformContracts.cs:781-783`, `identifierValidation.ts:62-64`). Yabancı bir firmanın VKN olmayan
  vergi numarası, ancak ülkesi TR olmayan bir adresle **aynı istekte** kaydedilebilir.
- **E-Fatura uyarıları** engellemez: mükellefte vergi no/TCKN yoksa ya da alıcı etiketi yoksa durum çubuğunda uyarı
  gösterilir (`CustomerCreatePage.tsx:193-199`). Sunucu bu ikisini zorunlu kılmaz.
- **Ana firma:** aktif ve Supplier/Employee olmayan, firmada var olan bir cari olmalı (`:1485-1486`). Oluşturmada
  döngü denetimi gerekmez.
- **Özel alanlar:** bilinmeyen/etkin olmayan kod 400; zorunlu alan eksikse 400 (`:1492-1503`).
- **Kayıttan sonra:** "Kaydet ve Yeni" formu temizler, İletişim sekmesine döner, "{kod} kaydedildi. Yeni cari kartı
  girebilirsiniz." gösterir. Normal kayıt formu temizleyip **listeye** döner; sekme canlı kalır (`:1035-1053`).
- **Denetim:** `customer.created` (+ özel alan değer revizyonları).

### 2.4 Roller

- Rol denetimi yoktur; `erp.customers.create` izni yeterlidir. TenantAdmin için her zaman açıktır.
- Özel alan **tanımı** bu formda yapılmaz; değerler herkes içindir.

### 2.5 ERP işlem kataloğu

`cari.olustur`, `cari.ozelAlanTanimlari`, `cari.gruplar`, `cari.anaFirmaSecenekleri`, `cari.iller`, `cari.ilceler`
(bkz. 1.5). Oluşturma özel alanları `customFields` map'iyle **aynı istekte** göndermelidir, çünkü zorunlu alan
denetimi oluşturmada yapılır. `customFieldsBlock.degerler` → `customFields` bağlaması (stok kartı oluşturma gibi).

### 2.6 Bileşen eşlemesi ve eksikler

Var: `formCard` + `input` (`maxLength`, `upperCase`, `min`/`max`/`step`, `required`, `requiredWhen` → adres alanları
birbirine bağlı zorunlu, `pattern` + `patternMessage` → biçim), `tabs`, `lookup` (ana firma, `minChars`, `allowClear`),
`select` + `staticOptions` (tür, ülke), `customFieldsBlock` (tanım sorgusundan), `alert` + `visibleWhen` (e-Fatura
uyarıları), `actionBar` `saveQuery` + `afterSaveAction page @customers`.

Eksikler:

- **G-C1 İç içe `address` gövdesi.** `CustomerWriteRequest.Address` bir kayıttır. `ScalarMembers` onu atlar, bu yüzden
  `cari.olustur`/`cari.guncelle` birincil adresi gönderemez. Bunu ayrı bir `cari.adres.ekle` adımına bölmek **eşdeğer
  değildir**:
  (a) VKN kuralı adres ülkesini aynı istekten okur (2.3). Adres ayrı adımda gönderilirse yabancı kartın vergi numarası
  ilk adımda VKN sağlamasına takılır ve kart **kaydedilemez**.
  (b) Kart + adres tek işlem değildir; adres adımı hata verirse adressiz kart kalır.
  (c) Düzenlemede PUT, aynı türün varsayılan adresini **günceller ya da ekler** (`:1637-1653`). Bunun bağımsız bir uç
  noktası yoktur.
  `eksik`: katalogda iç içe nesne parametresi (ör. `address.countryCode` adlı parametrelerin gövdede `address{}`
  nesnesine toplanması) ya da sunucuda düz alanlı yeni bir istek sözleşmesi. Öncelik: **en yüksek**.
- **G-C10 Konum girişleri.** (a) İl/ilçe, **serbest metin + öneri** (datalist) girişleridir; konum listesi boşsa elle
  yazılır. Çalışma zamanının `select`/`lookup`'ı seçimi zorunlu kılar. (b) İlçe önerileri seçili il **adına** göre
  süzülür. Saklanan değer ad olduğu için `cari.ilceler?provinceId` bağlanamaz. (c) TR dışı ülkede öneri yoktur. (d)
  Leaflet harita seçicisi yoktur. `fark`: il/ilçe metin girişi (öneri yok), enlem/boylam iki sayı girişi. Ya da serbest
  metinli bir `combobox` girişi eklenir (`eksik`).
- **G-C11 Kimlik sağlaması istemcide yok.** `pattern` yalnız biçimi denetler (10/11 rakam, IBAN yapısı). VKN, TCKN ve
  mod-97 sağlamaları yalnız sunucuda çalışır. Hata tek şerit metnidir (`erpApi.ts:15-25`); alan vurgusu, sekme
  uyarısı ve hatalı sekmeye geçiş yoktur. Ayrıca vergi numarasının ülkeye göre değişen biçimi (TR: rakam/10, değilse
  serbest/32) tek `pattern` ile yazılamaz. `fark` (iki ayrı giriş + `visibleWhen` denenebilir, ama tek alana yazmaları
  gerekir) ya da istemci doğrulayıcı kaydı (`validator: vkn|tckn|iban`) eklenir (`eksik`, önerilir).
- **G-C17 "Kaydet ve Yeni" ve "Temizle".** Çalışma zamanında yok. `fark` ya da `afterSave` için "formu sıfırla, sayfada
  kal" seçeneği.
- **G-C18 Sayfa formunda kaydedilmemiş değişiklik sorusu.** Esc/Vazgeç sorusu ve "Kaydedilmemiş değişiklik var" durumu
  yok. Sekme kapatma ya da listeye dönüşte girilen değerler sessizce kaybolur. `eksik` (veri kaybı riski).
- **G-C23 "Zorunlu alanlar n/4" ve durum çubuğu.** Sayaç bağlamayla hesaplanamaz. `fark`.
- **G-C24 Gereksiz açılış çağrıları.** Eski oluşturma sekmesi liste + 8 sayaç çağrısı yapar. Sistem sayfasında yapılmaz
  (`fark`, olumlu).

---

## 3. Cari kart düzenleme (`customer-edit`)

### 3.1 Yerleşim

- **Açılış:** kayıt kimliği `sessionStorage["nexora.customer-edit-id"]`'den okunur. Yoksa listeye dönülür
  (`:913-930`). Açık bir düzenleme sekmesi canlı kalır ve `nexora:customer-edit-request` olayıyla yeni kaydı yükler
  (`:906-912, 1065-1068`). Bu yeniden yüklemede **kaydedilmemiş değişiklik sorulmaz**. Başlangıç bölümü
  `sessionStorage["nexora.customer-edit-section"]` (`addresses` | `custom`) ile seçilir (`:1061-1069, 1128-1130`).
- **Yükleme:** `GET /{id}` → aynı anda adresler, özel alan tanımları ve değerleri (`:1099-1103`). Birincil adres
  alanları aktif + varsayılan + `General` adresten doldurulur (`:1106-1119`).
- **Form:** oluşturma formuyla aynıdır (2.1), şu farklarla (`CustomerCreatePage.tsx:221-235`):
  - Başlık carinin ünvanı. Alt başlıkta kod, Aktif/Pasif, tür, e-Fatura etiketleri ve özet "grup · Vade N gün · döviz
    · Vergi no … · vergi dairesi" (`:28-43`). Özet son **kaydedilmiş** değerlerdir.
  - Kaydet etiketi "Değişiklikleri Kaydet". "Kaydedilmemiş değişiklik var" durumu düzenlemede **gösterilmez** (`:215`).
  - Ana firma seçeneklerinden kart kendisi çıkarılır (`:478`).
  - Kimlik sağlaması yalnız **değişen** değerlere uygulanır (eski değerli kartlar kaydedilebilir, `identifierValidation.ts:80-102`).
  - Ek sekme **Adresler** (sayaçlı) (`:2032-2049`, `CustomerAddressSection.tsx`):
    - Adres tablosu: Tür (Genel/Fatura/Teslimat), Etiket (+ "Varsayılan"), Adres (satır, ilçe, il · ülke), Durum, "Pasife al /
      Etkinleştir". Adresler **silinmez**.
    - "Yeni adres" alt formu: Adres türü, Adres etiketi * (≤ 80), Adres * (≤ 400), İl * (≤ 100), İlçe, Posta kodu, Ülke,
      harita. Kendi düğmesi "Adres ekle" vardır. Ayrı bir `<form>`'a bağlıdır (`CUSTOMER_ADDRESS_FORM_ID`), bu yüzden
      kartın Kaydet'i ya da Ctrl+S adres göndermez ve adres zorunlu alanları kartı kilitlemez (`:50-55`, `:2056-2059`).
      Kayıttan sonra tür ve ülke korunur.
- **Kayıttan sonra:** "Cari kartı güncellendi.", oturumdaki kimlik silinir, listeye dönülür, liste yenilenir
  (`:1183-1190`).

### 3.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış | `GET /api/customers/{id}` | — | `erp.customers.read` (satır süzgeçli, 404) | rowVersion buradan alınır ve saklanır |
| Açılış | `GET /{id}/addresses`, `GET /api/customers/custom-fields`, `GET /{id}/custom-fields` | — | `erp.customers.read` | paralel |
| Kaydet | `PUT /api/customers/{id}` | 2.2'deki gövde + `isActive` (değişmeden), `rowVersion` (açılıştaki), `address` (birincil alanlar doluysa, `kind:"General", isDefault:true`), `customFields` (bütün değerler) | `erp.customers.update` | `:1133-1196`; işlem içinde özel alanlar, adres upsert, rowVersion denetimi |
| Adres ekle | `POST /api/customers/{id}/addresses` | `{kind, label, addressLine, city, district?, postalCode?, countryCode, isDefault (hesaplı), latitude, longitude}` | `erp.customers.create` | `:1585-1627`, sunucu `:1676-1696`; aynı türün eski varsayılanını kaldırır |
| Adres pasife al / etkinleştir | `PUT /api/customers/{id}/addresses/{addressId}` | satırın tüm alanları + `isActive` ters; pasife alırken `isDefault:false` | `erp.customers.update` | `:1629-1653`, sunucu `:1697-1717`; rowVersion yok |

### 3.3 Kurallar

- **Ana firma döngüsü:** kart kendisini ya da alt firmalarından birini ana firma seçemez; hiyerarşide döngü yasaktır
  (`:1559-1574`).
- **Kod benzersizliği** kendisi hariç denetlenir (`:1575-1577`).
- **Özel alanlar düzenlemede kartla birlikte** gönderilir. Map'te olmayan etkin alanlar **silinir**, zorunlu alan
  eksikse 400 (`:1579-1621`). Eski ekran bütün değerleri gönderdiği için sorun çıkmaz. Sistem sayfasında
  `cari.guncelle`'den `customFields`'i çıkarıp `cari.ozelAlanKaydet` (bodyMap) kullanmak, kısmi bağlamada veri
  silinmesini önler. Bedeli: kart ve özel alanlar iki işlemde yazılır (G-C16 ile birlikte `saveSequence`).
- **Adres upsert:** `address` gönderilirse aynı türün **varsayılan** adresi güncellenir, yoksa eklenir. Varsayılan
  politika aynı türdeki diğer varsayılanları kaldırır (`:1637-1653`, `PlatformContracts.cs:810-825`). Birincil adres
  alanları boşaltılırsa `address` gönderilmez ve mevcut adres **olduğu gibi kalır**. Bu, kullanıcıya "silindi" gibi
  görünebilir, ama silinmez.
- **Görünmeyen ana firma:** liste/tek kayıt görünümü ana firmayı yalnız görünen kayıtlar içinden doldurur
  (`:1465-1467`). Kullanıcının göremediği bir ana firmaya bağlı kart açılıp kaydedilirse `parentCompanyId: null`
  gönderilir ve **bağ kopar** (`:1086`). Bu eski ekranda da böyledir. Kaynaklı `cari.guncelle` ve `cari.pasifeAl` de
  aynı sonucu verir (kaynak `GET /{id}` aynı süzgeçten geçer). Taşıma değiştirmez, ama düzeltilmesi önerilir.
- **rowVersion:** açılış sürümü saklanır. Sistem sayfasında kaynak `kart` sorgusu kaydetmeden önce yeniden yüklenirse,
  yeni sürümle yazılır ve araya girmiş değişiklik ezilebilir (stok envanteri Riskler'deki aynı not).
- **Denetim:** `customer.updated`, gerekirse `customer-custom-field.values-updated`, `customer-address.created/updated`.

### 3.4 Roller

- `erp.customers.read` (kayıt satır kurallarıyla) + `erp.customers.update`; adres eklemede `erp.customers.create`.
  İşleyicide rol denetimi yok. Satır koşullu güncelleme kuralları yetki işleyicisinde kaydın türü/durumuyla
  değerlendirilir (bkz. 0).

### 3.5 ERP işlem kataloğu

`cari.getir` (kaynak), `cari.guncelle`, `cari.ozelAlanDegerleri`, `cari.ozelAlanKaydet`, `cari.adresleri`,
`cari.adres.ekle`, `cari.adres.pasifeAl`, `cari.adres.aktifEt`, `cari.anaFirmaSecenekleri` (`excludeId =
{{kart.rows[0].id}}`) (bkz. 1.5).

### 3.6 Bileşen eşlemesi ve eksikler

Var: stok kartı standardındaki desen (`inventory-stock-create.json`): `kart` sorgusu `sayfa.parametre.id`'den, başlıklar
`visibleWhen kart.rows[0].id ==/!= null`, `saveSequence [olustur, guncelle, ozelKaydet]`, `customFieldsBlock`
(`definitionsQuery` + `valuesQuery`), `formCard trackChanges` ("Önceki" gösterimi). Adres tablosu `dataTable` +
`rowActions` (Pasife al / Etkinleştir, `visibleWhen adresTablosu.seciliSatir.isActive`), yeni adres `formCard` + kendi
`button`'u (`cari.adres.ekle`, `refreshQueries [adresler]`).

Eksikler:

- **G-C1** (2.6) burada da geçerlidir: birincil adresin kart PUT'u içinde güncellenmesi ve VKN ülke kuralı.
- **G-C16 İki ekran anahtarı, tek tanım ve oturum köprüleri.** Eski ekran düzenlemeyi ayrı `customer-edit` anahtarında
  `sessionStorage` kimliğiyle açar. Stok standardı oluştur/düzenle'yi tek anahtarda `sayfa.parametre.id` ile çözer.
  Karar gerekir:
  (a) `customer-create` tek standart olur ve `customer-edit` ona yönlendirilir (menüde olmadığı için kolay). Ya da
  (b) `customer-edit` ayrı standart olur, aynı tanımın kopyasıdır.
  Eski giriş noktaları (`openEditCustomer`, `nexora:customer-edit-request`) ve başlangıç bölümü (`customer-edit-section`
  → `defaultTab`; `defaultTab` **bağlanamaz**) sayfa parametresine çevrilmelidir. Aksi halde listedeki "Adresler" /
  "Özel alanlar" komutları kartı ilk sekmede açar. `eksik`.
- **G-C9 Adres `isDefault` hesabı.** Yeni adres, aynı türde aktif varsayılan yoksa varsayılan olur (`:1592-1594`). Bu
  satırlar arası bir hesaptır, bağlamayla ifade edilemez. Seçenekler: sunucuda "türde varsayılan yoksa ilk adres
  varsayılan olur" kuralı (davranış değişikliği, migration gerekmez) ya da formda "Varsayılan yap" onay kutusu (`fark`).
- **G-C10** (konum girişleri, 2.6) yeni adres alt formunda da geçerlidir.
- **G-C26 Kart başlığı özeti.** `customerCardSummary` boş parçaları atlayarak birleştirir. `subtitle`/`pageTitle`
  bağlaması koşullu birleştirme yapamaz. `fark`: sabit biçim (boş parçada "—").
- **G-C27 Adres listesi olayı.** Kartta adres değişince liste panelinin varsayılan adresi olayla güncellenir. Sistem
  sayfasında iki sekme arası olay yok. Liste sekmesine dönüşte `afterSaveRefresh` ya da panel yeniden yüklemesi gerekir
  (`fark`, küçük).
- **G-C18** (kaydedilmemiş değişiklik) düzenlemede daha önemlidir: eski ekran da canlı sekmede yeni kayıt yüklerken
  sormaz. Sistem sayfasının "Kayıt değiştirilsin mi?" sorusu (`TenantCustomPage.tsx:2638`) burada **iyileştirme**
  olabilir.

---

## 4. Kaybolması kolay eski davranışlar (denetim listesi)

1. Global aramadan `initialSearch` + `nexora:customer-search-request`; aynı metinle tekrar aramada yeniden uygulama ve
   ilk eşleşmeyi bir kez seçme; geç dönen süzülmemiş yüklemenin yok sayılması (`:331-348, 703-721`;
   `customersList.test.tsx:221-233, 315-348`).
2. 250 ms gecikmeli canlı arama; arama/süzgeç değişince sayfanın 1'e dönmesi (`:349-355`).
3. Kısayollar: F2 Yeni, Enter Aç, Ctrl+Delete (nedenli pasif), Ctrl+E bütün sayfaları Excel, Alt+İ İşlemler, Ctrl+.
   detay paneli, ↑↓ / Boşluk / çift tık; formda Ctrl+S, Ctrl+F2 Kaydet ve Yeni, Esc Vazgeç sorusu.
4. "Sil" komutunun görünüp nedenle pasif kalması ("Cari silinmez, pasife alınır").
5. Satış belgesi başlatma köprüsü (`nexora.customer-sales-action` + olay) ve türe göre pasif nedeni.
6. `CustomerSalesInvoicesPanel`: müşteri süzgeçli faturalar, sayfa toplamı, "Aç" → `pendingCustomerInvoiceId`;
   Alış faturaları → `pendingPurchaseSupplier`.
7. Düzenleme sekmesinin canlı kalıp `nexora:customer-edit-request` ile yeni kaydı yüklemesi; başlangıç bölümü
   (`nexora.customer-edit-section`); kimlik yoksa listeye dönüş.
8. Oluşturma sekmesinin canlı kalması ve kayıttan/vazgeçten sonra temizlenmesi (`:1044-1049, 1953-1961`).
9. Özel alan tanımı açılışındaki 20 sn zaman aşımı + "Yeniden dene" / "Cari listesine dön".
10. Kimlik alanlarının yazarken biçimlenmesi (VKN/TCKN yalnız rakam ve kırpma, IBAN boşluksuz büyük harf, döviz
    büyük harf 3), alandan çıkınca satır içi hata, hatalı sekmeye geçiş, eski değerlerin sağlamadan muaf olması.
11. Adres alanlarının karşılıklı zorunluluğu (biri doluysa il ve adres satırı zorunlu); ülke değişince il/ilçe, il
    değişince ilçe temizlenir.
12. Yeni adres alt formunun kartın Kaydet'inden bağımsız olması (Enter ya da Ctrl+S adres göndermez; yarım koordinat
    kartı kilitlemez — `customersList.test.tsx:409-443`).
13. Kod sütunu gizlenince kodun ünvan altına yazılması; ünvan yanında e-Fatura etiketi; "Grup atanmamış" yer tutucusu.
14. Panelde limit kullanımının yalnız aynı dövizde gösterilmesi ve döviz uyarı notu (`customersList.test.tsx:299-313`).
15. Kiracının `customers` görünümü: özel alan sütunları, sütun genişlikleri, `pageSettings` (başlık, etiketler, süzgeç
    gizleme).
16. Grup ve özel alan tanımı formlarındaki "Kaydet ve Yeni" (`onSaveIntent`).

---

## 5. Özet tablo

| Ekran | Var olan işlemler | Yeni işlem (v1) | Sonraya kalan | Başlıca eksikler |
|---|---|---|---|---|
| Cari Hesaplar | 0 (`rapor.customers` yerini tutmaz) | 7 (`listele`, `getir`, `pasifeAl`, `aktifEt`, `bakiye`, `adresleri`, `gruplar`) | grup CRUD, özel alan tanım/geçmiş, içe aktar, mutabakat | G-C3 `allowed` (yazma düğmeleri), G-C12/13/14 köprüler, G-C2 özel sütunlar, G-C4 sayaçlar, G-C6 sekmeler, G-C7 limit % |
| Yeni Cari Kart | — | 5 (`olustur`, `ozelAlanTanimlari`, `anaFirmaSecenekleri`, `iller`, `ilceler`) | — | **G-C1 iç içe adres**, G-C11 sağlama, G-C10 konum girişleri, G-C17/18 |
| Cari kart düzenleme | — | 6 (`guncelle`, `ozelAlanDegerleri`, `ozelAlanKaydet`, `adres.ekle`, `adres.pasifeAl`, `adres.aktifEt`) | — | G-C1, G-C16 iki anahtar + oturum köprüsü, G-C9 varsayılan adres |

Eksik kimlikleri (tek liste): G-C1 iç içe `address` · G-C2 `custom:` sütunları · G-C3 satır kurallı `allowed` · G-C4
sunucu sayaçları · G-C5 bütün sayfa dışa aktarım · G-C6 kiracı panel sekmeleri · G-C7 hesaplanan panel değerleri · G-C8
varsayılan adres seçimi · G-C9 adres `isDefault` · G-C10 il/ilçe/harita · G-C11 kimlik sağlaması/alan hataları · G-C12
satış belgesi köprüsü · G-C13 fatura pencereleri/App durumu · G-C14 global arama · G-C15 `pageSettings` · G-C16
create/edit anahtarları ve oturum köprüsü · G-C17 Kaydet ve Yeni · G-C18 kaydedilmemiş değişiklik · G-C19 ızgara
klavyesi / Ctrl+. · G-C20 aktif grup süzme · G-C21 alt pencereler v1 dışı · G-C22 onaysız pasife alma · G-C23 zorunlu
alan sayacı · G-C24 gereksiz açılış çağrıları · G-C25 dil · G-C26 başlık özeti · G-C27 adres değişikliği olayı.

## 6. Önerilen sıra ve riskler

Önerilen sıra: (1) G-C1 ve G-C3 kararları (sunucu/katalog) → (2) `customer-create` + `customer-edit` tek standart
(G-C16) → (3) `customers` listesi, köprüler (G-C12…G-C14) çözülmeden **yayımlanmamalı**, çünkü satış akışının girişi
ve global arama bu ekrandan geçer.

Riskler:

- **Yabancı cari kaydı (G-C1).** Adres ayrı adımda yazılırsa TR dışı vergi numaraları reddedilir; adres dahil edilmezse
  sunucu kartı Türk sayar. Çözülmeden form yayımlanırsa dış ticaret carileri açılamaz/düzenlenemez.
- **Satır kurallı TenantUser (G-C3).** Eski ekranda kartı güncelleyebilen kullanıcı, sistem sayfasında yazma
  düğmelerini nedenli pasif görebilir (kod çıkarımı). Canlı QA'da satır kurallı TenantUser ile denenmeli.
- **Okuma süzgeçli ama yazma süzgeçsiz kural seti.** Bir carinin id'sini bilen kullanıcı onu okuyamasa da güncelleyebilir
  (`CustomerRowVisibilityEndpointFilter.cs:12`). Bugünkü davranıştır, taşıma değiştirmez. Sistem sayfasının kaynaklı
  yazmaları önce `GET /{id}` yaptığı için pratikte 404 alır (eski ekran da önce GET yapar; davranış aynıdır).
- **Ana firma bağının kopması** (3.3): görünmeyen ana firmalı kart kaydedilince bağ silinir; eski ve yeni ekranda aynı.
- **Özel alan silinmesi:** `cari.guncelle`'ye `customFields` map'i kısmen bağlanırsa bağlanmayan değerler silinir.
  `bodyMap`'li ayrı işlem şart.
- **İdempotency yok:** adres ekleme ve kart oluşturma çift gönderimde çift kayıt (kartta kod benzersizliği korur, adreste
  koruma yok).
- **Sözleşme kuralı:** G-C7 / G-C8 sunucu yanıtına alan eklemeyi öneriyor. Katalog adları kalıcıdır, yeni ad açılmalıdır
  (`ErpOperationCatalog.cs:56-59`).
- **Kapsam dışı ama bağlı:** Cari mutabakatı penceresi (`:2793-3257`) ve `customer-ledger` ekranı ayrı envanter ister.
  Liste taşınıp mutabakat taşınmazsa "Cari mutabakatı" komutu eski ekrana yönlendirilmelidir.
