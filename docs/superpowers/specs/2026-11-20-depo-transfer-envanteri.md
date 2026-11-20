# Depolar arası transferler (`inventory-transfers`): eşdeğerlik envanteri

Bu belge, Stok & Depo modülünde sistem sayfasına taşınmamış son yerleşik ekranın, "Depolar arası transferler"in
standart tanıma taşınması için girdidir. Bilgiler kod okunarak çıkarıldı (2026-11-20, `origin/master` `a122902d`).
Biçim ve terimler `2026-11-19-stok-depo-ekranlari-envanteri.md` ile aynıdır. Zarf ve yönlendirme kuralları
`2026-11-18-sistem-sayfalari-design.md` belgesindedir.

Kapsam (yönlendirici: `frontend/erp-web/src/WorkspacePageRouter.tsx:107, 335-336`):

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `inventory-transfers` | Depolar arası transferler | `InventoryTransfersPage.tsx` → `InventoryPage.tsx` (`section="inventory-transfers"`) + `inventory/useTransferListScreen.tsx`, `inventory/components/InventoryTransferGrid.tsx` |

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir. `PlatformContracts.cs`
ve `PlatformPermissionCatalog.cs` `src/Platform/AIERP.Platform.Application/` altındadır. Satır numaraları `InventoryPage.tsx`
ve `Program.cs` içindir; başka dosyadaki satır için dosya adı ayrıca yazılmıştır.

## 0. Ortak bilgiler

### Menü ve anahtarlar

- `inventory-transfers` standart menü kataloğunda **var** (`StandardMenuEndpoints.cs:17`). Stok Hareketleri'nde yaşanan
  menü anahtarı sorunu (G-M7) burada yoktur. Anahtar ayrıca `workspace-navigation.ts:10, 13`, `shell/moduleMenus.ts:56`
  (depo sayfaları grubu) ve `WorkspaceShellPage.tsx:42` (liste sayfaları kümesi) içinde geçer.
- Görünüm anahtarı ekran anahtarıyla aynıdır: `inventory-transfers` (`TenantScreenViewEndpoints.cs:204-210, 651`). Ayrıntı
  için bkz. 8.
- Ekran için henüz standart dosyası yok (`SystemPages/Standards/` altında 7 dosya var, `inventory-transfers.json` yok).
  Yeni standart sürüm 1 ve `preview` olarak başlar.

### Yetki modeli

- `/api/warehouses/transfers` ile başlayan her yol `erp.inventory-transfers` kaynağına çözülür
  (`PlatformPermissionCatalog.cs:63, 244-245`). Bu yönlendirme, genel `/api/warehouses` kuralından (`erp.warehouses`) önce
  çalışır. Eylemler katalogdaki beş eylemden gelir (`PlatformPermissionCatalog.cs:28`):
  - `GET /transfers`, `GET /transfers/{id}` → `erp.inventory-transfers.read`
  - `POST /transfers` → `erp.inventory-transfers.create`
  - `POST /transfers/{id}/void` → `erp.inventory-transfers.execute`. Son parça `void`, `IsExecutionRoute` listesindedir
    (`PlatformPermissionCatalog.cs:387-397`). Depo `POST …/status` yolunun tersine bu yol doğru eyleme çözülür.
- Penceredeki yardımcı okumalar başka kaynaklara bağlıdır: depo listesi ve konumlar `erp.warehouses.read`, stok arama ve
  birimler `erp.stock-items.read` ister.
- **TenantAdmin** izin kataloğunu atlar (`PlatformPermissionAuthorizer.cs:53-55`). **TenantUser** için varsayılan **ret**tir;
  firma Allow kuralı gerekir ve Deny kazanır (`PlatformPermissionAuthorizer.cs:57-76`).
- Transfer işleyicilerinin **hiçbirinde rol denetimi yok** (`Program.cs:2685-2902`). Katalogda `requiresTenantAdmin`
  gerekmez.

### İdempotency ve eşzamanlılık

- **İdempotency anahtarı yalnız oluşturmada var:** `InventoryTransferWriteRequest.RequestId` (`PlatformContracts.cs:180`).
  Firma içinde benzersiz indeksi var: `(TenantId, RequestId)` (`PlatformDbContext.cs:1507`).
  - Boş GUID gönderilirse 400 döner ("Tekrar deneme güvenliği için requestId zorunludur.", `PlatformContracts.cs:924-942`).
  - Eski ekran anahtarı **pencere her açıldığında bir kez** üretir (`crypto.randomUUID()`, `:1584`). Hatalı bir denemeden
    sonra aynı pencereden yapılan yeniden denemelerde anahtar aynı kalır. Başarılı kayıt pencereyi kapatır; sonraki "Yeni"
    yeni anahtar üretir.
  - Aynı anahtar **aynı içerikle** yeniden gelirse sunucu var olan transferi **200** ile döndürür (ilk kayıtta **201**). Bu
    durumda yeni hareket yazılmaz (`:2761-2780`). Karşılaştırılan içerik: depolar, tarih, satır sayısı, her satırın stok
    kartı, girilen miktarı, girilen birimi ve iki konumu.
  - Aynı anahtar **farklı içerikle** gelirse 409 döner: "requestId daha önce farklı içerikli bir depo transferinde
    kullanılmış."
  - Eşzamanlı çift gönderimde benzersiz indeks ihlali 409'a çevrilir: "Bu requestId ile bir transfer zaten kaydedilmiş;
    listeyi yenileyin." (`:2840`).
  - Sıra notu: yeniden deneme denetimi kapalı dönem, stok kartı kilidi ve birim çözümünden **sonra** yapılır
    (`:2737-2759` → `:2761`). İlk kayıttan sonra stok kartı pasife alınmış ya da dönem kapanmışsa, aynı isteğin yeniden
    denemesi 200 yerine 409 alır.
- **İptalde idempotency anahtarı yoktur.** İkinci iptal kilit altındaki durum denetimine takılır ve 409 alır: "Depo
  transferi daha önce iptal edilmiş." (`:2856-2858`). Bu yüzden çift tıklama çift ters kayıt üretmez.
- **rowVersion yok.** `InventoryTransfer` varlığında satır sürümü alanı yoktur (`Domain/Entities.cs:1345-1356`). Yanıtlar da
  sürüm taşımaz. Eşzamanlılık sunucuda `UPDLOCK, HOLDLOCK` kilitleriyle sağlanır: oluşturmada stok kartları ve iki depo,
  iptalde transfer satırı ve iki depo kilitlenir. Her iki yazma da önce firma kayıt kilidini alır
  (`FiscalYearCloseEndpoints.LockTenantForPostingAsync`).
- **Transaction:** iki yazma da tek veritabanı işleminde çalışır (`BeginTransactionAsync` … `CommitAsync`). Kaynak çıkışı,
  hedef girişi, lot/seri dağılımları, belge numarası ve denetim kaydı birlikte kaydedilir ya da hiçbiri kaydedilmez.

### Çalışma zamanı, bugünkü durum (11-19 belgesinden bu yana değişenler)

11-19 envanterindeki bazı genel eksikler kapandı. Bu ekran için geçerli durum şöyle:

- **Kapandı:** koşul dili artık `<`, `<=`, `>`, `>=` destekler (`custom-page/conditions.ts:5-6`). Gösterge `countWhen` ile
  koşula uyan satırları sayar (`custom-page/countWhen.ts`). CSV ve "Excel (seçilenler)" dışa aktarma eklendi (`showCsv`,
  `showSelectedExport`, `exportCsv`; `TenantCustomPageSchema.cs:54-55`). Aranabilir seçim ve ilk seçeneği varsayılan yapma
  eklendi (`searchable`, `defaultFirst`; seçim girişi ve filterBar).
- **Açık:**
  - `number` biçimi en fazla 2 ondalık gösterir (G-K4, `custom-page/cellFormat.ts:51`).
  - `date` biçimi saat göstermez (`cellFormat.ts:53`).
  - Seçenek sorgusunun satırları koşula göre süzülemez (G-K3).
  - İç içe listeler sonuç sütunu olamaz (G-K6). Bunun yolu `rowsPath` ile listeyi kök almaktır.
  - `editableGrid` sütun türleri yalnız `text`, `number`, `date`, `checkbox`'tır (`custom-page/gridState.ts:13, 18`).
    Seçim (lookup) hücresi yoktur.
  - İstemde (`promptLabel`) açıklama metni yoktur ve istem onayın yerine geçer (`custom-page/saveSequence.ts:50-60, 99-106`).
  - Sayfa kapsamında GUID üreten bir değer yoktur. `custom-page/` ve `TenantCustomPage.tsx` içinde `randomUUID` geçmez.

### Testler (bugün)

- SQL kabul testleri: `InventoryPostingFiscalCloseRouteSqlAcceptanceTests.cs:110-143` (oluşturma, kapalı dönemde oluşturma
  ve iptal reddi), `SqlServerNegativeStockAcceptanceTests.cs:27, 152` (negatif stok ayarı), ayrıca
  `InternalDocumentNumberingIntegrationTests.cs` ve `ReportEndpointsIntegrationTests.cs:1378` (rapor kaynağı).
- Aynı `requestId` ile yeniden deneme (200 / 409) ve iptalin hedef rezervasyon reddi için test **bulunamadı**. Taşıma
  sırasında sistem sayfası bu davranışlara dayanacağından eklenmeleri önerilir.
- Ön yüz: `inventory/inventoryActionBar.test.tsx`, `inventory/stockScreens.test.tsx` eski ekranı kapsar.

---

## 1. Yerleşim

### 1.1 Başlık ve şeritler

- **Başlık:** "Depolar arası transferler". Açıklama: "Depolar arasındaki stok aktarım kayıtlarını ve iptal geçmişini
  yönetin." Sayaç: sunucudaki toplam transfer sayısı (`transferTotal`, bütün durumlar) (`:2491-2526`).
- **Hata şeridi** sayfanın üstündedir. Oluşturma penceresi açıkken hata pencerenin içinde gösterilir
  (`RecordFormPage error`, `:3743`).
- **Bildirim şeridi** (`:2536`):
  - Kayıttan sonra: "Depo transferi iki depoda bağlantılı stok hareketleriyle kaydedildi."
  - İptalden sonra: "Depo transferi iki depoda ters hareketlerle iptal edildi."

### 1.2 İşlem çubuğu

Kaynaklar: `:2451-2460, 2482-2484`, `useTransferListScreen.tsx:40-55`.

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni (birincil) | F2 | Etkin depo sayısı 2'den azsa devre dışıdır: "Transfer için en az iki aktif depo gerekir". Pencere açık ve en az bir kalem eklenmişse önce "Kaydedilmemiş değişiklikler kaybolacak" onayı sorulur (`startNew`, `:2363-2366`). Ayrıntı penceresi açıkken Yeni eklenmez (`pageDialogOpen`, `:2359-2361`). |
| Aç | Enter | Geçerli satırın ya da tek seçili satırın kalemlerini açar. Kayıt yoksa: "Önce bir kayıt seçin". |
| Diğer → Transferi iptal et | | Yalnız hedef satırın durumu `Posted` ise menüde görünür. Başka bir yazma sürerken devre dışıdır: "İşlem sürüyor…". |
| Diğer → CSV dışa aktar | Ctrl+E | `csvExportCommand(gridExportRef)` |

Sil komutu yoktur. Transfer append-only bir kayıttır, düzeltme yalnız iptal (ters kayıt) ile yapılır.

### 1.3 Liste araç çubuğu

Kaynak: `:2618-2639`.

| Süzgeç | Tür | Davranış |
|---|---|---|
| Arama "Kod veya depo adıyla ara" (etiket "Transfer ara") | metin, **istemcide** | `code + fromWarehouseName + toWarehouseName` içinde, Türkçe küçük harfle arar (`:2085-2092`). Yalnız **yüklenmiş sayfadaki 50 satırı** süzer. |
| Durum | çip: Kaydedildi / İptal edildi, temizlenebilir | İstemcide çalışır. Her çipte sayaç vardır; sayaçlar da yalnız yüklenmiş sayfayı sayar. |
| Yenile | | `loadTransfers()`, geçerli sayfayı yeniden yükler. |

Sunucunun liste yolu `q` ya da durum parametresi **almaz** (bkz. 2). Arama ve çipler bu yüzden sayfa içi süzgeçtir.

### 1.4 Liste sütunları

Görünüm `inventory-transfers`. Varsayılan sütunlar `:357-368`, hücreler `InventoryTransferGrid.tsx:59-93`.

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Transfer kodu | mono kod |
| `transferDate` | Tarih | `gg.aa.yyyy` |
| `fromWarehouseName` | Kaynak depo | depo **adı** (kod yok) |
| `toWarehouseName` | Hedef depo | depo **adı** (kod yok) |
| `lineCount` | Stok kalemi | sayı, sağa yaslı |
| `status` | Durum | rozet: Kaydedildi (ok) / İptal edildi (off) |
| `createdAt` | Oluşturulma | **varsayılan gizli**; `toLocaleString("tr-TR")`, tarih ve saat |
| `actions` | İşlemler | sabit sütun; satır düğmeleri "Kalemler" (her satırda) ve "Transferi iptal et" (yalnız `Posted`, tehlike tonu, `busy` iken devre dışı) |

- Çoklu seçim ve toplu eylem "Excel (seçilenler)" vardır (`useTransferListScreen.tsx:53-55`).
- **Boş durumlar** (`:2647`):
  - Yüklenirken: "Transferler yükleniyor…"
  - Satırlar var ama süzgece uyan yok: "Aramayla eşleşen transfer yok", "Arama ifadesini değiştirip yeniden deneyin."
  - Hiç satır yok: "Henüz transfer kaydı yok", "Bir depodan diğerine stok aktardığınızda geçmiş burada görünür."
- **Alt bilgi** (`useTransferListScreen.tsx:56-71`):
  - İpuçları: "↑↓ gez · Boşluk işaretle · Enter aç"
  - "N seçili"
  - "Gösterilen X / toplam". X süzgeçten sonra görünen satır sayısıdır; toplam sunucudan gelir.
  - Sayfalama 50'şer.

### 1.5 Kalemler penceresi (salt okunur)

Kaynak: `:3608-3714`. "Kalemler" düğmesi ya da Aç komutu açar ve `GET /transfers/{id}` çağırır.

- Üst satır: "{kod} · DEPO TRANSFERİ".
- Başlık: "{kaynak depo adı} → {hedef depo adı}".
- Alt satır: "gg.aa.yyyy · Kaydedildi" ya da "… · İptal edildi".
- Tablo:

| Sütun | Gösterim |
|---|---|
| Stok kodu | kod |
| Stok adı | ad. Altında, varsa "Kaynak: {konum kodu} · {konum adı}" ve "Hedef: {konum kodu} · {konum adı}" satırları |
| Miktar | `enteredQuantity ?? quantity` ve `enteredUnitCode \|\| unitCode`, en fazla 4 ondalık. Girilen birim ana birimden farklıysa altta "= {ana miktar} {ana birim}" |

- Boş tablo: "Transfer kalemi yok."
- Alt satır: "Kaynak ve hedef hareketler tek transfer kaydına bağlıdır." Tek düğme: "Kapat". Pencere dışına tıklamak da
  pencereyi kapatır.

### 1.6 Yeni transfer penceresi

Kaynak: `:3716-4014`, `openTransferModal` `:1576-1608`. Pencere geniş bir `RecordFormPage`'dir: başlık "Depolar arası
transfer", kaydet düğmesi "Transferi kaydet". Pencere dışına tıklamak, yazma sürmüyorsa pencereyi kapatır.

- **Açılış:**
  - Kaynak depo = ilk **etkin** depo (depolar ada göre sıralı gelir).
  - Hedef depo = kaynaktan farklı ilk etkin depo.
  - Tarih = yerel bugün.
  - Yeni `requestId` üretilir; satırlar, birimler ve konumlar sıfırlanır.
  - İki deponun konumları paralel okunur ve yalnız **etkin** konumlar tutulur. Konum okuması başarısız olursa pencere
    açılmaz ve hata gösterilir.
- **Transfer Bilgileri bölümü:**

| Alan | Zorunlu | Seçenekler / davranış |
|---|---|---|
| Kaynak depo | * | Aranabilir seçici. Yalnız etkin depolar, "kod · ad" biçiminde. Boş arama sonucu: "Aramanızla eşleşen aktif depo bulunamadı." Değişince hedef aynı depoysa hedef başka bir etkin depoya alınır, iki deponun konumları yeniden okunur ve **satırların kaynak ve hedef konum seçimleri temizlenir** (`:1539-1560, 3772-3784`). |
| Hedef depo | * | Aranabilir seçici. Etkin depolar, **kaynak hariç**. Değişince hedef konum seçimleri temizlenir ve konumlar yeniden okunur. |
| Transfer tarihi | * | `date`. Varsayılan bugün. |

  Bilgi notu: "Transfer tek işlemde kaynak depodan düşer ve hedef depoya ekler. Aynı stok kalemi bir kez girilebilir."
- **Transfer Kalemleri bölümü:**
  - **"Stok kartı" ekleme seçicisi** ("Stok ara ve ekle"):
    - Arama 250 ms gecikmeyle sunucuya gider (`GET /api/stock/items/?page=1&pageSize=50&q`, `:452-502`).
    - Sonuçlardan yalnız **etkin** kartlar ve **henüz eklenmemiş** kartlar listelenir. Seçenek "kod · ad" biçimindedir,
      açıklaması birimdir.
    - Eklenen kartlar sonraki aramalarda da bellekte tutulur. Eski aramaların yanıtları atılır.
    - Boş sonuç: "Stok kartları aranıyor…" ya da "Aramanızla eşleşen başka stok kartı bulunamadı."
    - 100 kalemde seçici devre dışı kalır.
    - Kart seçilince satır eklenir ve kartın birim dönüşümleri okunur (`GET /api/stock/items/{id}/units`,
      `:1561-1575`).
  - **Satır** (her stok kartı bir kez):
    - Kod (kalın) ve altında "ad · ana birim".
    - "Kaldır" düğmesi. Satırı, miktarını ve konum seçimlerini siler.
    - Kaynak konum seçimi: "Kaynak konum belirtme" (boş) ya da kaynak deponun etkin konumları, "kod · ad".
    - Hedef konum seçimi: "Hedef konum belirtme" ya da hedef deponun etkin konumları.
    - Birim seçimi: ana birim ve kartın **etkin**, ana birimden farklı dönüşüm birimleri. Varsayılan ana birimdir.
    - Miktar: `number`, `min 0`, `step 0.0001`.
  - Boş tablo: "Arama yapıp transfer edilecek stokları ekleyin."
- **Durum satırı** (`:3745-3757`):
  - "Kalem: **n / 100**".
  - Kayda hazır değilse uyarı: "Kaydetmek için hedef depo seçin ve en az bir kaleme miktar girin."
  - Sağda: "Kaynak depo bakiyesi API tarafından kilit altında doğrulanır."
- **Kaydet koşulu** (`transferReady`, `:2302-2304`): hedef depo seçili olmalı ve en az bir satırın miktarı 0'dan büyük
  olmalıdır. Koşul sağlanmazsa kaydet devre dışıdır ve gerekçe olarak yukarıdaki uyarı gösterilir.
- **Gönderim** (`:1609-1655`):
  - Miktarı boş ya da ≤ 0 olan satırlar **sessizce atılır**, hata vermez.
  - Kalan satır kalmazsa hata: "Transfer için en az bir stok kalemi ve miktar girin."
  - `unitCode` = seçilen birim, yoksa kartın ana birimi. Boş konum `null` gönderilir.
  - Başarıda pencere kapanır, bildirim gösterilir ve liste **1. sayfadan** yeniden yüklenir.
  - Hata pencerede gösterilir; pencere ve `requestId` korunur.

### 1.7 İptal akışı

Kaynak: `:1682-1722`.

1. İstem penceresi: başlık "Transfer iptal edilsin mi?", alan "İptal nedeni" (zorunlu), metin "{kod} transferi iptal
   edilecek.", tehlike tonu, düğme "Devam". Neden boş ya da vazgeçilirse akış durur.
2. Onay penceresi: başlık "Transfer hareketleri iptal edilsin mi?", metin "{kod} · Kaynak ve hedef depodaki tüm transfer
   hareketleri birlikte ters kayıtla iptal edilecek. Hedef stok kullanılmışsa işlem reddedilir.", tehlike tonu, düğme
   "İptal et".
3. `POST …/void` `{reason, confirmation: true}` gönderilir. Başarıda bildirim gösterilir ve **geçerli sayfa** yeniden
   yüklenir.

İstemcide neden uzunluğu denetlenmez; 160 karakter sınırı yalnız sunucudadır.

---

## 2. API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış (`loadBase`) | `GET /api/warehouses/` | — | `erp.warehouses.read` | Bütün depolar; istemci etkin olanları süzer. |
| Açılış, Yenile, sayfa | `GET /api/warehouses/transfers` | `page`, `pageSize=50` | `erp.inventory-transfers.read` | `:2685-2700`. `pageSize` 1–100 arasına kısılır. Sıra: `TransferDate` azalan, sonra `CreatedAt` azalan. Yanıt `{items, page, pageSize, totalCount}`, satır `InventoryTransferSummary{id, code, fromWarehouseId, fromWarehouseName, toWarehouseId, toWarehouseName, transferDate, status, lineCount, createdAt}`. Depo **kodları dönmez**. `lineCount` kaynak taraftaki hareket sayısıdır. |
| Açılış | `GET /api/screen-views/inventory-transfers/active` | — | `erp.screen-views.read` | Hata yutulur (`:969-984`). |
| Kalemler / Aç | `GET /api/warehouses/transfers/{transferId}` | — | `erp.inventory-transfers.read` | `:2701-2729`. Yoksa 404. Yanıt `InventoryTransferDetailView{transfer: Summary, lines[]}`. Satırlar stok koduna göre sıralıdır; konumlar kaynak ve hedef hareketlerinden çözülür. |
| Yeni (pencere açılışı), depo değişimi | `GET /api/warehouses/{wid}/locations` ×2 | — | `erp.warehouses.read` | İstemci yalnız etkin konumları tutar. |
| Stok arama (pencere) | `GET /api/stock/items/?page=1&pageSize=50[&q]` | `q` | `erp.stock-items.read` | Aktif süzgeci yok; istemci süzer. |
| Satır ekleme | `GET /api/stock/items/{id}/units` | — | `erp.stock-items.read` | Yanıt `{conversions[]}`. Kart başına bir kez okunur. |
| Transferi kaydet | `POST /api/warehouses/transfers` | `{requestId, fromWarehouseId, toWarehouseId, transferDate, lines[{stockItemId, quantity, unitCode, fromStorageLocationId, toStorageLocationId}]}` | `erp.inventory-transfers.create` | `:2730-2844`. Yeni kayıtta 201 ve özet, aynı içerikli yeniden denemede 200. Rol denetimi yok. |
| Transferi iptal et | `POST /api/warehouses/transfers/{transferId}/void` | `{reason, confirmation: true}` | `erp.inventory-transfers.execute` | `:2845-2902`. Yanıt 200 ve anonim `{id, code, status}`. Rol denetimi yok. |

Ekranda kullanılmayan ama var olan: rapor kaynağı `inventoryTransfers` (`ReportEndpoints.cs:97-105, 376, 1912-1928`). Kod,
tarih, durum, depo **kodu ve adı**, kalem sayısı, toplam miktar ve oluşturulma sütunlarını süzgeç ve sıralamayla verir.

---

## 3. Kurallar

### 3.1 İstemcide

- Kaynak ve hedef depo seçenekleri yalnız etkin depolardır; hedef seçenekleri kaynağı içermez.
- Kaynak değişip hedefle aynı olursa hedef başka bir etkin depoya alınır.
- Depo değişince ilgili konum seçimleri temizlenir.
- Konum seçenekleri yalnız etkin konumlardır.
- Stok seçenekleri yalnız etkin kartlardır ve eklenmiş kartları içermez. En fazla 100 kalem eklenebilir.
- Birim seçenekleri ana birim ve kartın etkin dönüşüm birimleridir.
- Kaydet için hedef depo ve miktarı 0'dan büyük en az bir satır gerekir. Miktarı boş ya da 0 olan satırlar gönderilmez.
- Yazma sürerken (`busy`) kaydet ve iptal düğmeleri kilitlidir.

### 3.2 Sunucuda: doğrulama (400)

Kaynak: `PlatformContracts.cs:924-942`, `Program.cs:2750-2759, 2792-2797`.

- `requestId` boş GUID olamaz.
- Kaynak ve hedef depo boş olamaz ve birbirinden farklı olmalıdır.
- Satır sayısı 1–100 olmalıdır. Her satırda stok kartı seçilmelidir ve aynı kart iki satırda bulunamaz.
- Miktar 0'dan büyük, en fazla 99 999 999 999 999,9999 olmalı ve en fazla 4 ondalık içermelidir.
- Konum alanları boş GUID olamaz (`null` serbesttir).
- Birim, kart için etkin bir birim olmalıdır. Aksi halde hata `lines[{stockItemId}].unitCode` anahtarıyla döner.
- Ana birime çevrilen miktar da en fazla 4 ondalık içermelidir (`lines[{id}].quantity`).
- Konumlar etkin olmalı ve kendi depolarına ait olmalıdır: "Kaynak ve hedef konumlar etkin olmalı ve ilgili depoya ait
  olmalıdır."

### 3.3 Sunucuda: iş kuralları (404 / 409)

- **Kapalı dönem:** transfer tarihi kapalı bir mali dönemdeyse 409 döner (`CreateClosedPeriodConflict(…, "depo transferi")`,
  `:2737-2739`).
- Stok kartı bulunamaz ya da pasifse 409: "Transfer satırlarından en az birinin stok kartı bulunamadı veya pasif."
  Kilitleme sırası kart kimliğine göredir.
- Depo bulunamazsa 404. Depolardan biri pasifse 409: "Depo transferinde kaynak ve hedef depolar etkin olmalıdır."
  (`:2781-2791`).
- **Negatif stok:** kullanılabilir miktar = kaynak bakiye − etkin satış rezervasyonları. Miktar bunu aşarsa 409 döner, ancak
  firmanın negatif stok ayarı izin veriyorsa geçer (`TenantOperationalSettingsEndpoints.CanPostNegativeBalance(ayar,
  rezerve, izleme türü, konum seçildi mi)`). Hata metni: "{kod} için kaynak depoda rezervasyonlar düşüldükten sonra yeterli
  stok yok." Yanıt `currentBalance`, `reservedQuantity` ve `requestedQuantity` alanlarını da taşır (`:2798-2808`).
- Kaynak konum seçildiyse konum bakiyesi yetmeli; yetmezse 409: "… seçilen kaynak konumda yeterli stok yok." (`:2809-2814`).
- **Lot / seri:** kullanıcı lot ya da seri **seçmez**. Sunucu, kaynak depoda (konum seçildiyse o konumda) bakiyesi olan
  izleri son kullanma tarihine, sonra koda göre sırayla dağıtır; seride her iz 1 adettir (`AllocateAvailableTrackingAsync`,
  `:9094-9117`). Yetmezse 409: "{kod} için lot/seri bazında kaynak stok yetersiz." Aynı dağılım hedef girişine de yazılır.
- **Maliyet:** iki hareket de transfer tarihindeki ağırlıklı ortalama birim maliyeti taşır (`:2824`).
- **Numaralandırma:** `TenantDocumentNumbering.Internal.InventoryTransfer` kullanılır (`:2817`). Kod firma içinde
  benzersizdir (`PlatformDbContext.cs:1506`).
- **Yazılanlar:**
  - Satır başına iki hareket: kaynakta `Issue` ("Depo transferi {kod} · kaynak"), hedefte `Receipt` ("… · hedef").
  - Hareketler girilen miktar ve birimi, ana birim miktarını ve konumu taşır. İkisi de `InventoryTransferId` ile transfere
    bağlıdır.
  - Denetim kaydı: `inventory-transfer.posted`.

---

## 4. Durumlar, iptal ve ters kayıt

- **Durumlar** (`InventoryTransferStatus`): `Posted` (Kaydedildi) ve `Voided` (İptal edildi). Taslak ya da onay adımı yoktur;
  transfer kaydedildiği anda iki depoya işlenir.
- Değişen tek alan transfer başlığının `Status` alanıdır. Hareketler append-only kalır; iptal **bağlantılı ters hareket**
  yazar (`ReversalOfId`).
- **İptal kuralları** (`:2845-2902`):
  - Doğrulama (400): `confirmation` `true` olmalıdır ("Transfer iptali için açık onay gerekir."). Neden 1–160 karakter
    olmalıdır.
  - **Ters kayıt tarihi**, transfer tarihi değil **sunucunun UTC bugünüdür** (`DateTime.UtcNow`, `:2852`). Kapalı dönem
    denetimi bu tarihe yapılır ("depo transferi iptali"). Türkiye saatiyle 00:00–03:00 arasında yapılan iptal bir önceki güne
    tarihlenir (bkz. Riskler).
  - Transfer kilitlenir. Yoksa 404, `Posted` değilse 409.
  - İki depo kilitlenir. Depo yoksa 409: "Transfer deposu artık bulunamadı." Depoların **etkinliği denetlenmez**.
  - Hareketleri eksikse ya da herhangi biri zaten ters kayıtlıysa 409: "Transfer hareketleri eksik veya daha önce ters kayıt
    oluşturulmuş."
  - **Hedef kullanım denetimi:** hedefteki her giriş için hedef bakiye − etkin rezervasyon, transfer miktarından küçükse
    409 döner; negatif stok ayarı izin veriyorsa geçer. Hata metni: "Transfer iptali hedef depodaki rezervasyonları
    karşılayamaz; önce stok kullanımını veya rezervasyonları düzenleyin." Eski ekranın "Hedef stok kullanılmışsa işlem
    reddedilir" uyarısı bu denetime karşılık gelir.
  - Hedef **konum** ve **lot/seri** bakiyeleri iptalde ayrıca denetlenmez (kodda görülmedi). İz satırları ters kayda
    kopyalanır.
  - Her orijinal hareket için karşı yönde, aynı miktar, maliyet ve konumla bir ters hareket yazılır. Açıklama: "Transfer
    iptali {kod} · {neden}". Ters harekette girilen miktar ve birim **yazılmaz**, yalnız ana birim miktarı yazılır.
  - Durum `Voided` olur. Denetim kaydı: `inventory-transfer.voided`.
- **Sıralama kuralı:** transferin kendisinden önce iptal edilmesi gereken bağlı bir belge yoktur. Hedef stok satışta
  rezerve edilmiş ya da kullanılmışsa önce o belgeler düzeltilmelidir (yukarıdaki 409).

---

## 5. Roller

- Eski ekranda TenantAdmin ile TenantUser arasında **fark yok**. `role` bileşene gelir, ama transfer bölümünde
  kullanılmaz; Diğer → CSV herkese açıktır (`:2483`).
- TenantAdmin: izin kataloğunu atladığı için her şeyi yapar.
- TenantUser: şu Allow kurallarına ihtiyaç duyar:
  - Listeleme ve Kalemler: `erp.inventory-transfers.read`
  - Yeni transfer: `erp.inventory-transfers.create`
  - İptal: `erp.inventory-transfers.execute`
  - Pencere seçenekleri: `erp.warehouses.read` (depolar, konumlar) ve `erp.stock-items.read` (stok arama, birimler)
- Eski ekran izinleri önceden bilmez. Yetkisiz kullanıcı düğmeleri görür ve 403 alır. Sistem sayfasında işlemin `allowed`
  bayrağı düğmeyi önceden kapatır. Bu bir iyileşmedir; davranış farkı olarak not edilir.

---

## 6. ERP işlem kataloğu

**Var olan, kullanılabilir:**
- `depo.listele` (`ErpOperationCatalog.cs:220`): depo seçenekleri.
- `depo.konumlari` (`:221-222`): konum seçenekleri.
- `stok.kart.listele` (`:142-143`): stok arama, `q` ve sayfalama.
- `stok.kart.birimleri` (`:223-224`): `rowsPath conversions`, meta `baseUnitCode`.

**Var olan, bu ekrana uygun değil:** `rapor.inventoryTransfers` (rapor işlemi).
- Sabit gövdesi ilk 12 sütunu `pageSize 100` ile ister; süzgeç ya da sayfa bağlanamaz.
- Satırlarda `id` yoktur, bu yüzden satır eylemi kurulamaz.
- İzin: `/api/reports/run` yolunun izni ve kaynağın kendi okuma izni gerekir. Kaynak izni
  `erp.inventory-transfers.read`'dir (`ReportEndpoints.cs:5946, 5970`); yani yetki açısından engel yoktur, engel
  yukarıdaki iki maddedir.

**Eksik (önerilen, hepsi yeni ad):**

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `depo.transfer.listele` | GET `/api/warehouses/transfers` | query `page`, `pageSize` | list `InventoryTransferSummary`, rowsPath `items`, meta `page, pageSize, totalCount` | `q` ve durum parametresi yok (bkz. G-TR10). |
| `depo.transfer.kalemleri` | GET `/api/warehouses/transfers/{transferId}` | route `transferId` | list `InventoryTransferLineView`, rowsPath `lines` (+ `displayQuantity`, `displayUnitCode`; bkz. G-TR7) | Başlık bilgisi seçili liste satırından alınır; `transfer` alt nesnesi gerekmez. |
| `depo.transfer.olustur` | POST `/api/warehouses/transfers` | body `requestId`* (guid), `fromWarehouseId`*, `toWarehouseId`*, `transferDate`* (date); `ListParameter<InventoryTransferLineWriteRequest>("lines")` öğeleri `stockItemId`*, `quantity`*, `unitCode`, `fromStorageLocationId`, `toStorageLocationId` | record `InventoryTransferSummary` | `BodyParameters<InventoryTransferWriteRequest>` `lines`'ı skaler olmadığı için atlar; liste ayrıca eklenir (`stok.hareket.ekle`'deki `tracking` gibi). `requestId` sayfadan bağlanmalıdır (G-TR1). |
| `depo.transfer.iptal` | POST `/api/warehouses/transfers/{transferId}/void` | route `transferId`; body `reason`* | none (ya da adlandırılmış bir `{id, code, status}` kaydı) | `fixedBody {confirmation: true}` (`depo.pasifeAl` gibi): sayfa onayı atlayamaz. `pageKind` "update" önerilir, böylece onay tehlike tonuyla gösterilir. İzin `execute`. |

- `RequiresTenantAdmin` hiçbirinde gerekmez.
- **Yeni etiket kodları.** `Label()` etiketi olmayan her kod için açılışta hata verir, bu yüzden şunlar `Labels` sözlüğüne
  eklenmelidir: `transferDate`, `fromWarehouseId`, `fromWarehouseName`, `toWarehouseId`, `toWarehouseName`,
  `fromStorageLocationId`, `fromStorageLocationCode`, `fromStorageLocationName`, `toStorageLocationId`,
  `toStorageLocationCode`, `toStorageLocationName`.
- Zaten var olan etiketler: `id`, `code`, `name`, `status`, `lineCount`, `createdAt`, `stockItemId`, `unitCode`, `quantity`,
  `enteredQuantity`, `enteredUnitCode`, `displayQuantity`, `displayUnitCode`, `reason`.
- Gövde parametreleri (`requestId`, `lines`) için etiket gerekmez (`BodyParameters` `Label()` çağırmaz).
- Güncellenecek kayıtlar:
  - `tests/IntegrationTests/ErpOperationCatalog.names.txt`: 4 yeni ad.
  - `frontend/erp-web/src/system-pages/*Operations.fixture.json`.
  - `tests/IntegrationTests/SystemPageStandards.versions.txt`: yeni standart.

---

## 7. Bileşen eşlemesi ve eksikler

### 7.1 Var olan bileşenlerle kurulabilenler

| Eski parça | Sayfa motoru karşılığı |
|---|---|
| Başlık sayacı | `actionBar.titleCount: "{{transferler.meta.totalCount}}"` |
| Yeni (F2) → pencere | `actionBar.newButton` → `openDialog` düğmesi (`yeniTransferPenceresi`). Alternatif: `newAction`. |
| Aç (Enter) / satır çift tıklama | `openButton` + `dataTable.rowOpenAction: "kalemlerDugmesi"` → `openDialog` (`kalemlerPenceresi`) |
| Diğer → Transferi iptal et | `moreButtons: ["iptalMenuDugmesi"]`, `visibleWhen: "liste.seciliSatir.status == 'Posted'"`. Satır düğmesi İşlem Çubuğu menüsünde kullanılamaz (`TenantCustomPageSchema.cs:2101`), bu yüzden aynı `transferIptal` sorgusunu çalıştıran **iki ayrı düğme** gerekir: menü için `iptalMenuDugmesi`, satır için `iptalDugmesi`. |
| Diğer → CSV, Excel (seçilenler) | `exportCsv`, `exportTable`, `showSelectedExport` |
| Arama (kod, depo adları) | `filterBar` `search` + `searchColumns: ["code", "fromWarehouseName", "toWarehouseName"]`. Parametre verilmediği için yüklenen satırlarda süzer; eski ekranla aynı. |
| Durum çipleri | `filterBar` `filters: ["status\|select\|row\|\|Durum"]` + `valueLabels` (Posted=Kaydedildi, Voided=İptal edildi). Yüklenen satırlarda süzer. |
| Liste sütunları ve rozet | `dataTable` `paging: "server"`, `pageSize: 50`, `columnFormats` (`code=code`, `transferDate=date`, `status=status`), `toneMap` (Kaydedildi=success, İptal edildi=info) |
| Satır düğmeleri | `rowActions: ["kalemlerDugmesi", "iptalDugmesi"]`. İptal düğmesinin `visibleWhen` koşulu satır bindirmesiyle değerlendirilir. |
| Boş durum | `emptyText` (tek metin; bkz. G-TR12) |
| Kalemler penceresi | Kaydetsiz `dialog`. `saveQuery` isteğe bağlıdır; `contains` diyalog ve actionBar dışında her üst düzey bileşeni alabilir (`TenantCustomPageSchema.cs:1917-1933, 2087-2094`). `presentation: "dialog"`; başlık `{{liste.seciliSatir.code}} · {{liste.seciliSatir.fromWarehouseName}} → {{liste.seciliSatir.toWarehouseName}}`) + `text` (tarih ve durum) + `dataTable` (`depo.transfer.kalemleri`; konum için `columnUnits: fromStorageLocationCode=fromStorageLocationName`, Stok Hareketleri'ndeki gibi) |
| Transfer Bilgileri | `formCard` + `input` `lookup` ×2 (`depo.listele`, `optionLabelColumn: name`, `optionDescriptionColumn: code`, `searchable`, `required`) + `input` `date` (`defaultValue: "{{bugun}}"`) |
| Kaydet | `dialog.saveQuery: "transferOlustur"`, `saveLabel: "Transferi kaydet"`, `closeOnSave`, `resetOnOpen`, `refreshQueries: ["transferler"]`, `successMessage` |
| Kalem sınırı ve tekillik | `editableGrid` `gridMode: "list"`, `maxRows: 100`, `unique` kuralı (stok sütununda) |
| Miktar | ızgara sütunu `quantity\|Miktar\|number\|required,min:0.0001,step:0.0001` |
| İptal nedeni | `iptalDugmesi` `actionType: "query"`, `promptLabel: "İptal nedeni"`, `promptRequired: true`, `reason ← {{iptalDugmesi.yanit}}` |
| Yazma kilidi | Çalışma zamanının `inFlight` / `writeLock` kilidi (`custom-page/writeAction.ts`) |

### 7.2 Eksikler

Engelleyiciler (G-TR1 ve G-TR2 çözülmeden ekran taşınamaz):

- **G-TR1 idempotency anahtarı (engelleyici).** `requestId` zorunludur ve boşsa 400 döner. Sayfa kapsamında GUID üreten bir
  değer yoktur.
  - Gereken davranış:
    - pencere her açıldığında yeni bir değer;
    - aynı pencerede hata sonrası yeniden denemede **aynı** değer;
    - başarılı kayıttan sonra yeni değer.
  - Öneri: kapsamda bir kez değerlendirilen bir değer, ör. gizli `input` + `defaultValue: "{{yeniKimlik}}"`, `resetOnOpen`
    ile yeniden üretilir.
  - Yalnız sunucuda üretmek (ör. `fixedBody`) yeniden deneme güvenliğini bozar, önerilmez.
  - Ayrıca doğrulanmalı: yanıtın 200 (yeniden deneme) ya da 201 olması sayfada aynı başarı olarak işlenmeli.
- **G-TR2 kalem ızgarası (engelleyici).** `editableGrid` hücreleri yalnız text/number/date/checkbox'tır. Eski satırın ihtiyacı:
  - (a) stok kartı seçimi: sunucu araması, "kod · ad";
  - (b) satırın kartına **bağlı** birim seçimi (`stok.kart.birimleri`, satıra göre değişen parametre);
  - (c) kaynak ve hedef konum seçimi (başlıktaki depolara bağlı, satırdan bağımsız sorgu).

  İki yol var:
  - **A (eski ekrana en yakın):** ızgaraya `lookup` sütun türü eklemek. Örnek:
    `stockItemId|Stok kartı|lookup:stoklar:id:code:name|required,unique`. Seçenek sorgusu sayfa düzeyinde olabilir; (a) ve
    (c) bununla çözülür. (b) için satır kapsamlı parametre (`{{satir.stockItemId}}`) ve kart başına önbellek gerekir. Bu
    olmadan birim `text` hücresi olarak kalır (`upperCase,maxLength:8`; boşsa ana birim). Yanlış birim için sunucunun
    400'ü gösterilir.
  - **B:** ızgaranın üstüne bir "kalem ekle" satırı koymak (Stok `lookup`, Birim `lookup` = seçili kartın birimleri,
    Miktar, Kaynak konum, Hedef konum) ve yeni bir `addRow` eylemiyle bu değerleri ızgaraya satır olarak eklemek. Bağımlı
    birim listesi mevcut girişlerle çalışır. Izgarada ise yalnız miktar düzenlenir; birim ya da konum değiştirmek için
    satır silinip yeniden eklenir (`fark`). Ayrıca salt okunur gösterim sütunları (kod, ad, konum adı) ve gönderilmeyen
    kimlik sütunu gerekir. Izgara satırının tel biçimine yalnız bildirilen öğe alanlarının girdiği doğrulanmalıdır.

  Taslak HTML A yolunu çizer; B karar sorusudur (bkz. Açık sorular).
- **G-TR3 boş isteğe bağlı GUID (G-TR2'nin bir koşulu).** Bugün ızgara boş hücreyi tel biçimine hiç yazmaz
  (`cellWire` boş metinde `undefined` döner, `custom-page/gridState.ts:193-208`). Alan gövdede yer almaz ve sunucuda `null`
  olur, yani bugünkü hücre türlerinde sorun yoktur. G-TR2'deki yeni seçim hücresi de aynı kuralı korumalıdır. Boş seçim `""`
  olarak giderse sunucu `Guid?` alanını çözemez ve 400 döner.

Farklar ve küçük motor ekleri:

- **G-TR4 seçenek süzme (G-K3).** Hepsi istemcide süzülüyordu, sayfada ifade edilemez: yalnız etkin depolar, hedefte kaynak
  hariç, yalnız etkin konumlar, yalnız etkin stok kartları, eklenmiş kartları dışarıda bırakma.
  - Sunucu bunların hepsini reddeder: aynı depo 400, pasif depo ya da kart 409, pasif ya da başka depoya ait konum 400.
    Eklenmiş kart ise `unique` kuralıyla hücrede uyarı verir.
  - `fark`: kullanıcı pasif kaydı seçebilir ve hatayı kayıtta görür. Motor eki önerisi: seçim girişine `optionsWhen`
    (seçenek satırı koşulu, ör. `satir.isActive == true && satir.id != kaynakDepo.value`).
- **G-TR5 bağımlı temizleme.** Kaynak ya da hedef depo değişince satırların konum seçimleri temizlenmez; kaynak hedefe
  eşitlenince hedef de değişmez. `fark`: eski konumlar kalır ve sunucu 400 döner ("Kaynak ve hedef konumlar etkin olmalı ve
  ilgili depoya ait olmalıdır."). Motor eki önerisi: girişte `clearsOnChange: ["izgara.fromStorageLocationId"]`.
- **G-TR6 varsayılan depolar.**
  - Kaynak için `defaultFirst` ilk seçeneği seçer, ama `depo.listele` pasif depoları da içerdiği için ilk depo pasif
    olabilir (G-TR4'e bağlı).
  - "Kaynaktan farklı ilk etkin depo" hedef varsayılanı ifade edilemez. `fark`: hedef boş ve zorunlu açılır.
- **G-TR7 Kalemler miktar hücresi.**
  - `enteredQuantity ?? quantity` ve `enteredUnitCode || unitCode` geri düşüşü `stok.hareket.gecmisi`'ndeki gibi
    hesaplanan üyelerle çözülür: `InventoryTransferLineView`'e `DisplayQuantity` ve `DisplayUnitCode` eklenir, sütunlar
    elle eklenir. Bu, legacy uç noktanın JSON'una alan ekler; ekleme amaçlıdır ve zararsızdır.
  - "= ana miktar" alt satırı ayrı bir "Ana birim miktarı" sütunu olur (`quantity` + `columnUnits: quantity=unitCode`).
    `fark`.
- **G-TR8 ondalık hassasiyet (G-K4).** Miktarlar 4 ondalıklıdır, gösterim 2 ondalık. Kalemler penceresinde 0,0001
  hassasiyet kaybolur. Girişte `step: 0.0001` doğru çalışır.
- **G-TR9 iptal onayı.** Eski akış iki adımlıdır (neden istemi, sonra açıklamalı tehlike onayı). Çalışma zamanında istem
  onayın yerine geçer ve istemde açıklama metni yoktur. "Kaynak ve hedef … ters kayıtla iptal edilecek. Hedef stok
  kullanılmışsa işlem reddedilir." uyarısı kaybolur. İstem başlığı düğmenin metnidir (`TenantCustomPage.tsx:2274`); bu
  yüzden düğme metnine bağlanmadıkça **transfer kodu istemde görünmez**. Neden için `maxLength` yoktur; 160 sınırı yalnız
  sunucuda kalır.
  - Ara çözüm (`fark`): uyarıyı istem etiketine yazmak.
  - Motor eki önerisi: istemde `promptText` ve `promptMaxLength`, ya da istem varken `confirmEnabled` onayını da sormak.
- **G-TR10 sunucu süzgeci yok.** Liste yolu `q` ve `status` almaz; arama ve durum yalnız yüklenen 50 satırda çalışır (eski
  ekranla aynı). Eski davranış korunur. İstenirse sonraya, ekleme amaçlı `q`/`status` parametreli yeni bir işlem adı
  açılabilir.
- **G-TR11 "Yeni" devre dışı gerekçesi.** "Transfer için en az iki aktif depo gerekir" koşulu, etkin depoları sayan bir ifade
  ister. `countWhen` yalnız göstergede çalışır, koşulda kullanılamaz; `commandWhen` ise komutu gizler, gerekçe göstermez.
  `fark`: Yeni her zaman açık. Tek etkin depoda kullanıcı hedef seçemez ve kayıt sunucuda reddedilir. Motor eki önerisi:
  koşulda `depolar.rowCountWhen(...)` ya da göstergenin değerini kapsama koymak.
- **G-TR12 boş durum metinleri ve çip sayaçları (G-K2).** Üç ayrı boş durum metni (yükleniyor, eşleşme yok, hiç kayıt yok)
  tek `emptyText`'e iner. Çip sayaçları da düşer. `fark`.
- **G-TR13 `createdAt` saati.** `date` biçimi saati göstermez. Sütun varsayılan gizli olduğu için `fark` küçüktür.
- **G-TR14 kayıt sonrası sayfa.** Eski ekran yeni kayıttan sonra 1. sayfaya döner. `refreshQueries` geçerli sayfayı
  yeniler; yeni transfer en üstte olduğundan kullanıcı 2. sayfadaysa onu görmez. `fark` (küçük).
- **G-TR15 durum satırı.** "Kalem: n / 100" sayacı ve "Kaynak depo bakiyesi API tarafından kilit altında doğrulanır." notu
  `text` bileşeniyle kurulabilir. Sayaç için ızgara satır sayısının kapsamda okunabilmesi (`{{kalemler.satirSayisi}}`
  gibi) doğrulanmalı.
- **G-TR16 kaydet koşulu.** Eski "hedef ve en az bir miktar" koşulu: hedef `required` ile, satır `required,min` ile
  karşılanır. Izgaranın **en az bir satır** kuralı yoksa boş ızgarayla gönderim sunucuda 400 alır ("Transfer 1 ile 100
  arasında stok kalemi içermelidir."). `fark` ya da `minRows` eki. Miktarı boş satırlar eskiden sessizce atılırdı; burada
  hücre hatası verir. Bu daha sıkı bir davranıştır ve kabul edilebilir.
- **G-TR17 dil.** Eski ekran yalnız Türkçedir; fark yok.

---

## 8. Görünüm anahtarı

- `inventory-transfers` alanları: `code`, `transferDate`, `fromWarehouseName`, `toWarehouseName`, `lineCount`, `status`,
  `createdAt` (gizli), `actions` (sabit) (`TenantScreenViewEndpoints.cs:204-210`).
- Eşleme: ilk yedi alan bire bir eşlenir. `actions` karşılıksızdır; satır eylemleri `rowActions` ile gelir.

## 9. Önerilen standart taslağı (özet)

- **Bileşenler:**
  - `komutlar` (actionBar)
  - `suzgec` (filterBar)
  - `liste` (dataTable)
  - `kalemlerDugmesi`, `iptalDugmesi` (satır), `iptalMenuDugmesi` (Diğer menüsü) (button)
  - `kalemlerPenceresi` (dialog) ⊃ `kalemlerBilgisi` (text) + `kalemTablosu` (dataTable)
  - `yeniTransferPenceresi` (dialog) ⊃ `transferBilgileri` (formCard: `kaynakDepo`, `hedefDepo`, `transferTarihi`)
    + `transferNotu` (text) + `kalemler` (editableGrid, G-TR2) + `durumSatiri` (text)
  - `istekKimligi` (gizli input, G-TR1)
- **Sorgular:**
  - `transferler` (`depo.transfer.listele`, `runOn: load`)
  - `kalemDetayi` (`depo.transfer.kalemleri`; `transferId ← {{liste.seciliSatir.id}}`)
  - `depolar` (`depo.listele`)
  - `kaynakKonumlar`, `hedefKonumlar` (`depo.konumlari`; `warehouseId ← {{kaynakDepo.value}}` / `{{hedefDepo.value}}`)
  - `stoklar` (`stok.kart.listele`; `q` ← arama)
  - `birimler` (`stok.kart.birimleri`, G-TR2 yoluna göre)
  - `transferOlustur` (`depo.transfer.olustur`; `lines ← {{kalemler.satirlar}}`)
  - `transferIptal` (`depo.transfer.iptal`; `reason ← {{iptalDugmesi.yanit}}`)
- Sürüm 1, `preview`. `items` kayıtları 11-19 standartlarındaki gibi `since: 1` ve `requires` ile yazılır.

## 10. Riskler

- **İdempotency (G-TR1).** Motor eki yanlış kurulursa (her denemede yeni anahtar) ağ hatasından sonraki yeniden deneme
  **çift transfer** yazar. Her denemede aynı anahtar ama başarıdan sonra yenilenmeyen anahtar ise sonraki transferi 409 ile
  ya da sessizce eskisini döndürerek engeller. İki durum için de çalışma zamanı testi gerekir. Sunucu tarafında yeniden
  deneme (200/409) testi bugün yok.
- **Yeniden deneme sırası.** Aynı istek, ilk kayıttan sonra stok kartı pasife alınmış ya da dönem kapanmışsa 409 alır
  (bkz. 0). Bu mevcut davranıştır; sayfada "kaydedilmedi" gibi okunabilir. Hata metni bunu açıklamaz.
- **İptal tarihi UTC.** Ters kayıtlar sunucunun UTC bugünüyle tarihlenir. Gece yarısından sonraki ilk üç saatte (TR) yapılan
  iptal önceki güne düşer; ay ya da yıl sonunda kapalı dönem denetimi beklenmedik sonuç verebilir. Taşıma bunu değiştirmez,
  ama kullanıcıya gösterilen tarih açıklaması yoktur.
- **İptalde konum ve lot denetimi yok.** Hedef konum ya da hedef lot kullanılmışsa iptal yine geçebilir ve konum/lot bakiyesi
  negatife düşebilir (kodda yalnız depo düzeyi denetim görüldü). Bu, taşıma dışı ama bilinmesi gereken bir sunucu
  davranışıdır.
- **Pasif depoya iptal.** İptal depoların etkinliğini denetlemez; kaynak depo transferden sonra pasife alındıysa stok pasif
  depoya geri yazılır.
- **Seçenek süzme yokluğu (G-TR4).** Pasif depo, konum ya da kart seçilebilir. Kullanıcı hatayı ancak kaydette görür; çok
  satırlı bir transferde bu can sıkıcıdır.
- **İzin görünürlüğü.** TenantUser'ın `erp.inventory-transfers.*` kuralı olsa bile `erp.warehouses.read` ya da
  `erp.stock-items.read` yoksa pencerenin seçenek sorguları boş gelir. Canlı QA'da kısıtlı bir TenantUser ile denenmeli.
- **Sözleşme kuralı.** Yeni adlar kalıcıdır (`ErpOperationCatalog.cs:54-59`). `InventoryTransferLineView`'e hesaplanan üye
  eklemek mevcut uç noktanın yanıtına alan ekler, yalnız eklemedir. Rapor işlemi değiştirilmemelidir.

## 11. Açık sorular

1. Kalem ızgarası için hangi yol (G-TR2)? **A** (ızgarada lookup hücresi, satıra bağlı birim) eski ekrana en yakın olanıdır
   ama en büyük motor işidir. **B** ("kalem ekle" satırı ve `addRow`) daha küçüktür, fakat satırda yalnız miktar
   düzenlenir.
2. Birim seçimi v1'de zorunlu mu? Değilse birim, metin hücresi ya da yalnız ana birim olabilir; dönüşüm birimiyle transfer
   eskisinden zorlaşır.
3. Seçenek süzme (aktif depo/konum/kart, kaynak≠hedef) motor eki olarak bu taşımaya mı girsin, yoksa v1 `fark` olarak mı
   çıksın?
4. İptal uyarısının kaybolması (G-TR9) kabul mü, yoksa istem açıklaması (`promptText`) motor eki mi?
5. Liste depo **adını** gösteriyor; seçiciler "kod · ad". Listeye depo kodu eklemek (yeni işlem adıyla yanıt alanı) istenir
   mi?
6. İptal tarihinin UTC olması ve iptalde konum/lot denetiminin olmaması bu işin kapsamında mı ele alınsın, yoksa ayrı bir
   sunucu düzeltmesi mi?
7. Sunucu tarafında arama/durum süzgeci (G-TR10) şimdi mi eklensin, yoksa eski davranış (sayfa içi süzgeç) mı korunsun?
