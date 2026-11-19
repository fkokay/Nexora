# Stok & Depo ekranları (5 ekran): eşdeğerlik envanteri

Bu belge, beş yerleşik Stok & Depo ekranının sistem sayfasına (standart tanım) taşınması için girdidir. Kod okunarak
çıkarılmıştır (2026-11-19, `origin/master` tabanı). Biçim ve terimler `2026-11-18-stok-esdegerlik-envanteri.md` ile
aynıdır; zarf ve yönlendirme kuralları `2026-11-18-sistem-sayfalari-design.md` belgesindedir.

Kapsam (yönlendirici: `frontend/erp-web/src/WorkspacePageRouter.tsx:316-334`):

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `inventory-warehouses` | Depo Yönetimi | `InventoryPage.tsx` (`section="inventory-warehouses"`) + `inventory/useWarehouseDefinitionScreen.tsx` |
| `inventory-locations` | Raf ve Konumlar | `WarehouseLocationsPage.tsx` + `warehouse-locations/components/*` |
| `inventory-cost` | Stok Değerleme | `InventoryPage.tsx` (`section="inventory-cost"`) + `inventory/useCostListScreen.tsx`, `InventoryCostGrid.tsx` |
| `inventory-tracking` | Lot / Seri İzleme | `InventoryTrackingPage.tsx` + `inventory-tracking/components/*` |
| `inventory-stock-movements` | Stok Hareketleri | `InventoryMovementsPage.tsx` |

Aşağıda frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir;
`PlatformContracts.cs` ve `PlatformPermissionCatalog.cs` `src/Platform/AIERP.Platform.Application/` altında,
`PlatformPermissionAuthorizer.cs` `src/Platform/AIERP.Platform.Infrastructure/` altındadır.

## 0. Ortak bilgiler

### Yetki modeli (beş ekranın hepsi için)

- Her `/api/*` isteği `PermissionAuthorizationHandler.cs:50` üzerinden `PlatformPermissionCatalog.TryResolve` ile bir
  izne çözülür. Eylem fiilden değil yoldan çıkar (`PlatformPermissionCatalog.cs:337-345`): GET → `read`, PUT → `update`,
  DELETE → `delete`; POST → yolun son parçası `IsExecutionRoute` listesindeyse (`:387-397`; ör. `reverse`, `restore`,
  `activate`, `deactivate`) `execute`, değilse `create`.
  - Dikkat: `POST /api/warehouses/{id}/status` ve `POST .../revaluations` son parçaları listede **yok**, bu yüzden
    `create` olarak çözülür (sırasıyla `erp.warehouses.create`, `erp.inventory-cost-adjustments.create`).
- **TenantAdmin** izin kataloğunu atlar (`PlatformPermissionAuthorizer.cs:53-55`, bordro hariç). **TenantUser** (ve
  TenantDeveloper) için varsayılan **ret**tir; firma Allow kuralı gerekir, Deny kazanır (`PlatformPermissionAuthorizer.cs:57-76`).
- Bazı uç noktalar ayrıca kendi içinde yalnız TenantAdmin kabul eder (aşağıda her ekranda "TenantAdmin işleyici" olarak
  yazılıdır). Katalogda bunlar `requiresTenantAdmin: true` ile işaretlenir (`ErpOperationCatalog.cs:403`).
- İlgili kaynaklar (`PlatformPermissionCatalog.cs:52-82`): `erp.stock-items` (`/api/stock`), `erp.warehouses`
  (`/api/warehouses`), `erp.inventory-cost-adjustments` (`/api/warehouses/cost-adjustments` + yolunda `/stock/…/cost-adjustments`,
  `/stock/…/revaluations` geçenler + `/api/purchasing/receipts/…/landed-costs`; yönlendirme `:262-267`),
  `erp.purchase-receipts` (`/api/purchasing/receipts`), `erp.inventory-tracking` (`/api/inventory-tracking`),
  `erp.screen-views` (`/api/screen-views`).

### İdempotency ve eşzamanlılık

- **İdempotency anahtarı:** beş ekranın çağırdığı uç noktaların **hiçbiri** idempotency anahtarı (`requestId`)
  kullanmaz. (Anahtar yalnız kapsam dışındaki transferde var: `InventoryTransferWriteRequest.RequestId`,
  `PlatformContracts.cs:161`.) Bu yüzden çift tıklama ya da yeniden deneme çift kayıt üretebilir; eski ekranlar bunu
  yalnız `busy` kilidiyle önler. Sayfa çalışma zamanında da süren bir yazma varken ikinci yazma reddedilir
  (`custom-page/writeAction.ts:32`, `inFlight`); bunun her yazma yolunu (düğme, pencere kaydı, `saveSequence`)
  kapsadığı ayrıca doğrulanmalıdır.
- **rowVersion:** yalnız iki PUT denetler:
  - `PUT /api/warehouses/{id}` (`Program.cs:2636-2656`, `RowVersion` uzunluğu 8 olmalı: `PlatformContracts.cs:863-868`),
  - `PUT /api/warehouses/{wid}/locations/{lid}` (`WarehouseLocationEndpoints.cs:49-90`, `PlatformContracts.cs:879-884`).
  - Depo durum değişikliği (`POST /status`), özel alan değerleri, maliyet ve ek maliyet yazmaları rowVersion
    **almaz**; bunlar sunucuda işlem içinde `UPDLOCK, HOLDLOCK` ile kilitlenir. Konum oluşturma (`POST …/locations`)
    ne rowVersion alır ne kilit kullanır; yalnız benzersizlik ihlalini 409'a çevirir (`WarehouseLocationEndpoints.cs:43-44`).
- **Tek kayıt okuma yok:** `GET /api/warehouses/{id}` ve `GET /api/warehouses/{wid}/locations/{lid}` uç noktaları
  yoktur. Eski ekranlar rowVersion'ı liste satırından alır (`useWarehouseDefinitionScreen.tsx:152`,
  `WarehouseLocationsPage.tsx:432`).

### Çalışma zamanı ve tasarımcı, bugün (kısa)

- Bileşen türleri (`TenantCustomPageSchema.cs:20-21`): `heading, text, metric, card, section, divider, spacer, button,
  dataTable, form, code, alert, badge, list, progress` + v2: `label, input, formCard, contextPanel, filterChips, facetPanel,
  actionBar, tabs, editableGrid, customFieldsBlock, dialog, image, filterBar`.
- Sütun biçimleri yalnız `text|code|number|money|date|status` (`TenantCustomPageSchema.cs:99`); `number` en fazla
  **2 ondalık** gösterir (`custom-page/cellFormat.ts:51`). `columnUnits` aynı satırdaki başka bir sütunu birim olarak ekler,
  `valueLabels` değer→etiket eşler, `toneMap` sabit değer→renk eşler.
- Koşul dili (`visibleWhen`, `disabledWhen`, satır eylemi görünürlüğü) yalnız `==`, `!=`, `in`, `&&`, `||`, `!` bilir
  (`custom-page/conditions.ts:5-8`); `<`/`>` ve tarih karşılaştırması **yoktur**. Kapsamda `kullanici.rol`, `bugun`,
  `sayfa.parametre.*` vardır (`TenantCustomPage.tsx:1599`).
- `Columns<T>()` yalnız skaler alanları sonuç sütunu yapar (`ErpOperationCatalog.cs:275-276, 300-312`); iç içe listeler
  (ör. hareketin `tracking` dağılımı, maliyet kaydının `Lines`) bağlanamaz. `Label()` etiketi olmayan her kod için
  açılışta hata verir (`ErpOperationCatalog.cs:331-332`): yeni işlemlerin her yeni alan kodu `Labels` sözlüğüne eklenmelidir.
- Sınırlar: bileşen başına 40 özellik (`TenantCustomPageSchema.cs:68`), en fazla 4 satır eylemi (`:1386`), en fazla
  10 "Diğer" düğmesi (`:75`), işlem sorgusunda en fazla 60 parametre (`:118`), pencerede en fazla 20 öğe
  (`TenantCustomPage.tsx:1043`).
- Pencere (`dialog`) tek bir kaydet sorgusu ya da `saveSequence` taşır; içine konan düğmeler kendi yazma sorgularını
  çalıştırabilir. Kayıt değiştirirken kaydedilmemiş değişiklik onayı vardır (`TenantCustomPage.tsx:2369`).
- Kısayollar ortak komut kaydından gelir: Sil = Ctrl+Delete, dışa aktar = Ctrl+E (`commands/shortcuts.ts:10, 14`).
- **Dışa aktarma.** Eski ekranların hepsinde "CSV dışa aktar" (Diğer menüsü) ve çoklu seçimle "Excel (seçilenler)"
  vardır. Çalışma zamanında `actionBar.exportTable` yalnız **görünen sayfayı Excel'e** aktarır; CSV ve seçili satırları
  dışa aktarma yoktur (`dataTable` satır seçimi tekildir; stok pilotunda aynı karar `fark` olarak kayıtlı:
  `2026-11-18-stok-pilot-esdegerlik-kontrol.md:82-83`). Bu, beş ekranın hepsi için `fark`tır (G-K7).
- Yeni işlemler eklenince güncellenecek kayıtlar: `tests/IntegrationTests/ErpOperationCatalog.names.txt` (isimler
  kalıcıdır), `frontend/erp-web/src/system-pages/*Operations.fixture.json` (çizim testleri), ve standart sürümü için
  `tests/IntegrationTests/SystemPageStandards.versions.txt`.

---

## 1. Depo Yönetimi (`inventory-warehouses`)

Mevcut standart: `SystemPages/Standards/inventory-warehouses.json` sürüm 1, `preview`; yalnız `depo.listele` ile
3 sütunlu bir tablo içerir. Bu belgedeki her yeni öğe sürüm 2 ve `since: 2` ile eklenmelidir.

### 1.1 Yerleşim

- **Başlık:** "Depo Yönetimi", açıklama "Depoları ve kullanım durumlarını yönetin.", sayaç = depo sayısı
  (`InventoryPage.tsx:2492-2526`).
- **Uyarı / bilgi şeritleri:** hata (form açıkken formun içinde gösterilir, `:2528`), bildirim (`:2536`).
- **Tanım ekranı yerleşimi** (`useWarehouseDefinitionScreen.tsx:423-456`): solda liste, sağda seçili deponun formu.
  Seçim yokken boş bölme: "Bir depo seçin ya da F2 ile yeni depo ekleyin." (`:388`).
- **İşlem çubuğu** (`InventoryPage.tsx:2448-2450, 2476-2481, 2484`; `useWarehouseDefinitionScreen.tsx:341-367`):

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni | F2 | Kaydedilmemiş değişiklik varsa onay ister; boş formu açar ve özel alan **tanımlarını** yükler (`:183-196`). |
| Kaydet | Ctrl+S | Formun kendi kaydet komutu; düzenlemede değişiklik yoksa devre dışı ("Kaydedilecek değişiklik yok"). Oluşturmada "Kaydet ve Yeni" vardır (`:226-230`). |
| Vazgeç | Esc | Değişiklik varsa onay ister (`:332-339`). |
| Sil | Ctrl+Delete | Depo silinmez. Onay metni açıklar ve "Pasife al" önerir (`:316-329`). Seçim yoksa / değişiklik varsa / zaten pasifse devre dışı. |
| Diğer → Devre dışı bırak / Yeniden etkinleştir | | Onay ister (`:302-314`). |
| Diğer → Depo alan tanımları | | Yalnız TenantAdmin ve TenantDeveloper (`InventoryPage.tsx:2479-2480`). |
| Diğer → CSV dışa aktar | Ctrl+E | `csvExportCommand` (`:2484`). |

- **Liste araç çubuğu** (`inventory/components/WarehouseDefinitionList.tsx:56-74`):
  - Arama: metin, istemcide `code + name` içinde, Türkçe küçük harfle (`useWarehouseDefinitionScreen.tsx:372-377`).
  - Durum çipleri: Tümü / Aktif / Pasif, her birinde sayaç; istemci süzgeci.
  - Yenile: `loadBase()` (depo listesini yeniden çeker).
- **Liste sütunları** (`WarehouseDefinitionList.tsx:40-53`; görünüm `inventory-warehouses`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `code` | Depo kodu | mono kod |
| `name` | Depo adı | metin |
| `status` | Durum | rozet Aktif (ok) / Pasif (off), `isActive`'ten |
| `availability` | Açıklama | türetilmiş metin: "Yeni stok hareketlerine açık/kapalı" |

- Çoklu seçim + toplu eylem "Excel (seçilenler)" (`useWarehouseDefinitionScreen.tsx:368-370`).
- **Boş durumlar** (`WarehouseDefinitionList.tsx:76-138`): "Depolar yükleniyor…"; "Henüz depo tanımlanmamış" (+ "Depo
  ekle" düğmesi); "Aramayla eşleşen depo yok".
- **Alt bilgi:** seçili sayısı; "N depo · A aktif · P pasif"; kısayol ipuçları (`:139-149`). Sayfalama yok (tüm depolar
  tek çağrıda gelir).
- **Form** (`inventory/components/WarehouseDefinitionForm.tsx`; başlık yeni kayıtta "Yeni depo", düzenlemede depo adı,
  alt başlıkta kod ve durum rozeti):

| Bölüm | Alan | Zorunlu | Doğrulama (istemci) | Doğrulama (sunucu) |
|---|---|---|---|---|
| Depo Kimliği | Depo kodu | * | `maxLength 40`, `required` | trim, ≤ 40, büyük harfe çevrilir, firmada benzersiz (409) (`PlatformContracts.cs:855-861`, `Program.cs:2608`) |
| Depo Kimliği | Depo adı | * | `maxLength 120`, `required` | trim, ≤ 120 |
| Depo Özel Alanları | tanımlardan dinamik (Metin / Ondalık / Tarih / Evet-Hayır) | tanıma göre | oluştururken `required`; düzenlemede zorunluluk yalnız özel alanlar kaydedilirken denetlenir (`useWarehouseDefinitionScreen.tsx:252-258`) | tür ve uzunluk normalizasyonu, zorunlu alan, en fazla 40 değer (`Program.cs:2531-2566`) |
| Lokasyonlar (yalnız düzenleme) | salt okunur alt tablo: Kod (ağaç girintili), Ad, Durum | | | |

  - Düzenlemede değişen her alanda "Önceki: …" gösterilir ve değişiklik sayacı vardır.
  - Pasif depoda özel alanlar salt okunurdur: "Devre dışı depoda değerler kaydedilemez." (`WarehouseDefinitionForm.tsx` `readOnlyCustom`).
  - Lokasyonlar kartı: konumları ağaç sırasıyla gösterir (`locationTree`), "N · Tümünü yönet ›" bağlantısı ve "Lokasyon
    ekle" (yalnız TenantAdmin ve aktif depo, `useWarehouseDefinitionScreen.tsx:384`). İkisi de Raf ve Konumlar
    ekranına geçer (`:378-382`; bkz. 2.6).
- **Depo alan tanımları penceresi** (`InventoryPage.tsx:4019-…`): tanım listesi (etiket, kod, tür, uzunluk, sürüm,
  "Zorunlu" etiketi); "Tanımı düzenle" (TenantAdmin/TenantDeveloper; ardışık üç `promptDialog`: etiket, uzunluk 1–500,
  zorunlu Evet/Hayır yalnız TenantAdmin, `:1441-1507`); "Devre dışı bırak" (yalnız TenantAdmin, `:1508-1537`);
  "Yeni depo alanı" formu: Ekran etiketi * (≤ 120), Alan kodu * (≤ 40, büyük harf), Veri türü, En fazla karakter
  (1–500, yalnız Metin), "Bu alanı zorunlu yap" (yalnız TenantAdmin) (`:1405-1440`).

### 1.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, Yenile | `GET /api/warehouses/` | — | `erp.warehouses.read` | `Program.cs:2595-2601`; ada göre sıralı `WarehouseView{id, code, name, isActive, rowVersion}` |
| Açılış | `GET /api/screen-views/inventory-warehouses/active` | — | `erp.screen-views.read` | hata sessizce yutulur (`InventoryPage.tsx:954-968`) |
| Depo seçilince | `GET /api/warehouses/{id}/custom-fields` | — | `erp.warehouses.read` | `Program.cs:2519-2530`; etkin tanımlar + değer |
| Depo seçilince | `GET /api/warehouses/{id}/locations` | — | `erp.warehouses.read` | `WarehouseLocationEndpoints.cs:17-24` |
| Yeni (F2) | `GET /api/warehouses/custom-fields` | — | `erp.warehouses.read` | `Program.cs:2425-2431` |
| Kaydet (yeni) | `POST /api/warehouses/` | `{code, name, customFields{kod: değer}}` | `erp.warehouses.create` | `Program.cs:2602-2635`; **rol denetimi yok**; benzersizlik 409 |
| Kaydet (düzenle), kod/ad değiştiyse | `PUT /api/warehouses/{id}` | `{code, name, rowVersion}` | `erp.warehouses.update` | `Program.cs:2636-2656`; **rol denetimi yok**; rowVersion uyuşmazlığı 409 |
| Kaydet (düzenle), özel alan değiştiyse ve depo aktifse | `PUT /api/warehouses/{id}/custom-fields` | `{values{kod: değer}}` | `erp.warehouses.update` | `Program.cs:2531-2566`; pasif depoda 409 |
| Pasife al / Etkinleştir | `POST /api/warehouses/{id}/status` | `{isActive, confirmation: true}` | `erp.warehouses.create` (bkz. 0) | `Program.cs:2657-2682`; **rol denetimi yok**; bakiye ≠ 0 iken pasife alma 409 |
| Alan tanımları penceresi | `GET /api/warehouses/custom-fields` | — | `erp.warehouses.read` | |
| Yeni alan tanımı | `POST /api/warehouses/custom-fields` | `{code, label, dataType, maxLength, isRequired}` | `erp.warehouses.create` | `Program.cs:2432-2457`; **TenantAdmin veya TenantDeveloper işleyici**; zorunlu alanı yalnız TenantAdmin açar |
| Tanımı düzenle | `PUT /api/warehouses/custom-fields/{id}` | `{label, maxLength, isRequired?}` | `erp.warehouses.update` | `Program.cs:2458-2480`; TenantAdmin veya TenantDeveloper; `isRequired` yalnız TenantAdmin |
| Tanımı kaldır | `DELETE /api/warehouses/custom-fields/{id}` | — | `erp.warehouses.delete` | `Program.cs:2481-2492`; **TenantAdmin işleyici** |

Ekranda kullanılmayan ama var olan: tanım geçmişi ve geri yükleme (`Program.cs:2493-2518`), değer geçmişi ve geri
yükleme (`:2567-2594`).

### 1.3 Kurallar

- **İstemcide:** kod/ad boş olamaz (düzenlemede ayrıca açık denetim, `useWarehouseDefinitionScreen.tsx:235-238`);
  düzenlemede yalnız değişen parça gönderilir (kod/ad PUT'u ve özel alan PUT'u ayrı ayrı, sırayla; ilk parça
  kaydedilip ikincisi başarısız olursa form yalnız o parçayı değişmiş gösterir, `:239-266`); zorunlu özel alan denetimi
  yalnız özel alanlar kaydedilirken; liste yenilendiğinde değişmemiş form yeni değerlerle açılır, değişmiş form eski
  sürümü korur ve sunucunun 409 metnini alır (`:197-206`).
- **Yalnız sunucuda:** kod benzersizliği; bakiye ≠ 0 iken pasife alma yasağı; pasif depoda özel alan yazma yasağı;
  zorunlu yeni alan tanımı mevcut depolar varsa açılamaz; uzunluk küçültme mevcut değerleri bozamaz.

### 1.4 Roller

- TenantAdmin: her şey. Depo alan tanımlarını kaldırabilir, zorunlu yapabilir; "Lokasyon ekle" görünür.
- TenantDeveloper: alan tanımı ekler/düzenler (zorunlu yapamaz, kaldıramaz).
- TenantUser: depo oluşturma, güncelleme ve durum değiştirme **işleyicide rol denetimi olmadığı için** yalnız izin
  kurallarına bağlıdır. "Depo alan tanımları" menüsü görünmez; "Lokasyon ekle" görünmez.

### 1.5 ERP işlem kataloğu

Var olan: `depo.listele` (`ErpOperationCatalog.cs:201`), `depo.konumlari` (`:202`).

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `depo.olustur` | POST `/api/warehouses` | body `code`*, `name`*, map `customFields` | record `WarehouseView` | |
| `depo.guncelle` | PUT `/api/warehouses/{warehouseId}` | route `warehouseId`; body `code`*, `name`*, `rowVersion`* | record `WarehouseView` | Kaynak okuması yok: `rowVersion` liste satırından bağlanır (bkz. G-D1). |
| `depo.pasifeAl` | POST `/api/warehouses/{warehouseId}/status` | route `warehouseId` | record `WarehouseView` | `fixedBody {isActive:false, confirmation:true}` (stok.kart.pasifeAl gibi) |
| `depo.aktifEt` | POST `/api/warehouses/{warehouseId}/status` | route `warehouseId` | record `WarehouseView` | `fixedBody {isActive:true, confirmation:true}` |
| `depo.ozelAlanTanimlari` | GET `/api/warehouses/custom-fields` | — | list `WarehouseCustomFieldDefinitionView` | |
| `depo.ozelAlanDegerleri` | GET `/api/warehouses/{warehouseId}/custom-fields` | route `warehouseId` | list `WarehouseCustomFieldValueView` | |
| `depo.ozelAlanKaydet` | PUT `/api/warehouses/{warehouseId}/custom-fields` | route `warehouseId`; map `values` | list `WarehouseCustomFieldValueView` | `bodyMap {values ← depo.ozelAlanDegerleri: code→value}` (stok.kart.ozelAlanKaydet ile aynı) |

Sonraya (yönetici işi, v1 dışı önerilir): `depo.ozelAlanTanimEkle` (POST), `depo.ozelAlanTanimGuncelle` (PUT),
`depo.ozelAlanTanimKaldir` (DELETE, `requiresTenantAdmin`). İlk ikisi TenantAdmin **veya TenantDeveloper** kabul eder;
katalogdaki tek bayrak (`RequiresTenantAdmin`) bunu ifade edemez (G-K1).

Yeni etiket kodu gerekmez (`WarehouseView`, özel alan görünümleri ve `customFields`/`values` etiketleri zaten var;
`confirmation` parametre değildir).

### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni / Kaydet / Sil / Diğer / CSV), `filterBar` (arama + yüklenen satırlarda durum süzgeci),
`dataTable` (`status` biçimi, `valueLabels`), `formCard` (`trackChanges`, `recordKey`, "Önceki"), `customFieldsBlock`
(tanım ve değer sorgularından), `saveSequence` + `sequenceWhen` (PUT kod/ad → PUT özel alanlar), `button`
(`confirmEnabled` ile Pasife al / Etkinleştir), `visibleWhen` (`kullanici.rol`, `liste.seciliSatir.isActive`),
`page` eylemi (Raf ve Konumlar'a parametreyle geçiş).

Eksikler:
- **G-D1 rowVersion kaynağı.** Tek depo okuması yok. `sourceOperation` kullanılamaz: çalışma zamanı kaynak satırı
  `rows[0]`'dan alır ve yol parametresi `warehouseId`'yi kaynağın aynı adlı alanıyla karşılaştırır, görünümde ise alan
  `id`'dir (`custom-page/erpOperations.ts:170-182`, `custom-page/usePageQueries.ts:141-145`). **Öneri:** `depo.guncelle`
  kaynaksız olsun; `code`, `name`, `rowVersion` formdan ve `liste.seciliSatir.rowVersion`'dan açıkça bağlansın. Bu, eski
  ekranın davranışına yakındır (bkz. Riskler). (Alternatif: `GET /api/warehouses/{warehouseId}` + `depo.getir`; yeni uç
  nokta ve izin eşlemesi ister.)
- **G-D2 türetilmiş sütun `availability`.** `isActive`'ten metin üretilir. `valueLabels` ile aynı sütunun ikinci bir
  gösterimi olarak çözülebilir mi doğrulanmalı; çözülmezse sütun atlanır (`fark`).
- **G-D3 çip sayaçları.** "Tümü N / Aktif A / Pasif P" sayaçları ve alt bilgideki sayaçlar istemcide sayılır; çalışma
  zamanında satırları koşula göre sayan gösterge yok. `fark`: süzgeç kalır, sayaçlar düşer.
- **G-D4 konum ağacı girintisi** (form içi Lokasyonlar kartı): tabloda ağaç/girinti biçimi yok. `fark`: düz liste, koda göre.
- **G-D5 kısmi kayıt davranışı.** Eski ekran kod/ad değişmediyse PUT'u atlar; `sequenceWhen` ile "alan değiştiyse"
  koşulu yazılabilmesi `trackChanges` durumunun koşulda okunabilmesine bağlıdır: doğrulanmalı. Atlanamazsa değişmemiş
  kod/ad yine gönderilir; sunucu aynı değerde no-op döner (`Program.cs:2648`), yani zararsızdır.
- **G-D6 alan tanımı penceresi.** Ardışık `promptDialog` akışı ve TenantDeveloper ayrımı; v1 dışı önerilir ("Eski
  ekranda aç").

### 1.7 Görünüm anahtarı

- `inventory-warehouses` → alanlar `code`, `name`, `status`, `availability` (`TenantScreenViewEndpoints.cs:199-203`).
- Mevcut standartta eşleme: `code→code`, `name→name`, `status→isActive`; `availability` karşılıksız (aktarılmaz).

---

## 2. Raf ve Konumlar (`inventory-locations`)

### 2.1 Yerleşim

- **Başlık:** "Depo konumları" (menü adı "Raf ve Konumlar"), açıklama "Ambar içindeki raf ve bölmeleri tanımlayın;
  konuma atanmış stok bakiyelerini izleyin.", sayaç = konum sayısı (depo seçiliyse)
  (`warehouse-locations/components/WarehouseLocationOverview.tsx:18-60`).
- **İşlem çubuğu** (`WarehouseLocationsPage.tsx:616-639`): CSV dışa aktar herkes; Yeni (F2), Aç (Enter), Sil
  (Pasife al önerir, `:562-605`) yalnız TenantAdmin. Kaydet / Ctrl+S formun kendi komutudur; Esc formu kapatır (`:608-614`).
- **Liste araç çubuğu** (`WarehouseLocationOverview.tsx:75-130`):

| Süzgeç | Tür | Parametre |
|---|---|---|
| Arama "Kod, ad veya üst konum ara" | metin, istemci | `code + name + üst konumun kodu` (`WarehouseLocationsPage.tsx:165-181`) |
| Depo | aranabilir seçici (temizlenebilir), etiket `kod · ad`, açıklama Aktif/Pasif | sorguya değil, `warehouseId` durumuna gider; açılışta **ilk aktif depo** seçilir (`:210-212`); değiştirirken kaydedilmemiş değişiklik onayı (`:471-480`) |
| Durum | çip Tümü / Aktif / Pasif (sayaçlı), istemci | |
| Yenile | | depolar, konumlar, seçili konum bakiyesi ve denetim sırayla (`:358-363`) |

- **Konum listesi sütunları** (`warehouse-locations/components/WarehouseLocationPanels.tsx:35-150`; görünüm
  `inventory-warehouse-locations`): `code` Konum kodu (mono), `name` Konum adı, `parentLocation` Üst konum (üst konumun
  **kodu**, yoksa "Üst düzey"; istemcide aynı listeden bulunur, `:119-123`), `status` Durum (Aktif/Pasif rozeti).
  `actions` sütunu çizilmez. Çoklu seçim + "Excel (seçilenler)". Sayfalama yok.
- **Boş durumlar:** "Konumlar yükleniyor…", "Konumları görmek için önce bir depo seçin.", "Bu depoda henüz konum yok…",
  "“q” aramasıyla eşleşen konum bulunamadı.", "Konum görünümünde açık sütun bulunmuyor." (`:60-80`).
- **Alt bilgi:** seçili sayısı; "N konum · A aktif · P pasif"; ipuçları role göre (`WarehouseLocationsPage.tsx:740-758`).
- **Sağ bölme** (`:656-693`):
  - TenantAdmin ve seçim: düzenleme formu + altında konum bakiyesi.
  - TenantUser ve seçim: salt okunur özet (ad, kod, durum, üst konum) + konum bakiyesi (`WarehouseLocationPanels.tsx:154-298`).
  - Seçim yok: "Bir konum seçin ya da F2 ile yeni konum ekleyin." / TenantUser: "Bir konum seçin."
- **Oluşturma formu** (`warehouse-locations/components/WarehouseLocationForms.tsx:28-150`), başlık "Konum oluştur":

| Alan | Zorunlu | İstemci | Sunucu (`PlatformContracts.cs:870-877`, `WarehouseLocationEndpoints.cs:26-47`) |
|---|---|---|---|
| Konum kodu | * | `maxLength 40`, büyük harfe çevrilir | trim, ≤ 40, büyük harf, depo içinde benzersiz (409) |
| Konum adı | * | `maxLength 120` | trim, ≤ 120 |
| Üst konum | | seçenekler: aynı deponun **aktif** konumları | aynı depoda ve etkin olmalı; boş GUID olamaz |

  Depo seçili değilse kaydet devre dışı: "Konum eklemek için önce depo seçin." Kayıttan sonra yeni konum formda açık kalır.
- **Düzenleme formu** (`WarehouseLocationForms.tsx:163-258`), başlık "{kod} konumunu düzenle": Konum kodu *, Konum adı *,
  Üst konum (kendisi hariç aktif konumlar), "Konum aktif" onay kutusu. "Önceki" gösterimi ve değişiklik sayacı vardır;
  değişiklik yoksa kaydet devre dışı.
- **Konum bakiyesi** (görünüm `warehouse-location-balances`): `stockItemCode`, `stockItemName`, `quantity` (4 ondalık),
  `unitCode`; "N stok satırı"; boş: "Bu konumda stok bakiyesi bulunmuyor." (`WarehouseLocationPanels.tsx:154-298`).
- **Konumlandırma denetimi** (sayfanın altında, seçili depo için; görünüm `inventory-warehouse-reconciliation`,
  `WarehouseLocationPanels.tsx:301-411`): `stockItemCode`, `stockItemName`, `warehouseQuantity`, `locatedQuantity`,
  `unlocatedQuantity` (vurgulu), `unitCode`; açıklama notu; boş: "Konumu boş hareket kaynaklı fark bulunmuyor."

### 2.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış, Yenile | `GET /api/warehouses/` | — | `erp.warehouses.read` | |
| Depo değişince | `GET /api/warehouses/{wid}/locations` | — | `erp.warehouses.read` | koda göre sıralı; eski yanıtlar atılır (`WarehouseLocationsPage.tsx:220-246`) |
| Konum seçilince | `GET /api/warehouses/{wid}/locations/{lid}/balances` | (sunucu `asOfDate` alır; ekran göndermez, bugün varsayılır) | `erp.warehouses.read` | `WarehouseLocationEndpoints.cs:92-105`; yanıt `{…, items[]}` |
| Depo değişince | `GET /api/warehouses/{wid}/location-reconciliation` | (`asOfDate` gönderilmez) | `erp.warehouses.read` | `WarehouseLocationEndpoints.cs:107-134`; yanıt `{…, items[]}` |
| Açılış | `GET /api/screen-views/{warehouse-location-balances, inventory-warehouse-locations, inventory-warehouse-reconciliation}/active` | — | `erp.screen-views.read` | hatalar yutulur (`WarehouseLocationsPage.tsx:315-357`) |
| Kaydet (yeni) | `POST /api/warehouses/{wid}/locations` | `{code, name, parentLocationId \| null}` | `erp.warehouses.create` | **TenantAdmin işleyici** (`WarehouseLocationEndpoints.cs:28`); pasif depoya ekleme 409 |
| Kaydet (düzenle) | `PUT /api/warehouses/{wid}/locations/{lid}` | `{code, name, parentLocationId, isActive, rowVersion}` | `erp.warehouses.update` | **TenantAdmin işleyici** (`:51`); rowVersion 409; döngü 409 |
| Sil → Pasife al | aynı PUT, `isActive:false`, satırın değerleriyle | | `erp.warehouses.update` | `WarehouseLocationsPage.tsx:579-592` |

### 2.3 Kurallar

- **İstemcide:** kod ve ad boş olamaz (kaydet devre dışı); üst konum seçeneği yalnız aktif konumlar, düzenlemede
  kendisi hariç; değişmemiş form yenilenince güncel satırla yeniden açılır, değişmiş form eski rowVersion'ı korur
  (`WarehouseLocationsPage.tsx:488-496`); kayıt / depo değiştirirken kaydedilmemiş değişiklik onayı.
- **Yalnız sunucuda:** depo içi kod benzersizliği; konum kendisinin üstü olamaz; ağaçta döngü yasak; etkin alt konumu
  ya da sıfırdan farklı bakiyesi olan konum pasife alınamaz; pasif depoya konum eklenemez.

### 2.4 Roller

- TenantAdmin: oluşturur, düzenler, pasife alır.
- TenantUser: salt okunur. Yeni / Aç / Sil komutları **eklenmez** (`WarehouseLocationsPage.tsx:617`); işleyiciler de
  TenantAdmin dışını 403 ile reddeder.

### 2.5 ERP işlem kataloğu

Var olan: `depo.listele`, `depo.konumlari`.

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `depo.konum.olustur` | POST `/api/warehouses/{warehouseId}/locations` | route `warehouseId`; body `code`*, `name`*, `parentLocationId` | record `WarehouseLocationView` | `requiresTenantAdmin` |
| `depo.konum.guncelle` | PUT `/api/warehouses/{warehouseId}/locations/{locationId}` | route `warehouseId`, `locationId`; body `code`*, `name`*, `parentLocationId`, `isActive`*, `rowVersion`* | record `WarehouseLocationView` | `requiresTenantAdmin`; kaynaksız, rowVersion satırdan (G-D1 ile aynı gerekçe) |
| `depo.konum.pasifeAl` | PUT, aynı yol | route `warehouseId`, `locationId`; body `code`*, `name`*, `parentLocationId`, `rowVersion`* | record `WarehouseLocationView` | `fixedBody {isActive:false}`; `requiresTenantAdmin`. Sil → Pasife al için. Gerekçe: iki standartta parametreler yalnız `{{…}}` bağlamasıyla kullanılıyor; sabit değer bağlanabiliyorsa bu ad gereksizdir, `depo.konum.guncelle` yeter (doğrulanmalı). `fixedBody` ayrıca sayfanın bu alanı yanlış bağlamasını engeller. |
| `depo.konum.bakiyeleri` | GET `/api/warehouses/{warehouseId}/locations/{locationId}/balances` | route ×2; query `asOfDate` (date, isteğe bağlı) | list `WarehouseLocationBalanceView`, rowsPath `items` | |
| `depo.konumlandirmaDenetimi` | GET `/api/warehouses/{warehouseId}/location-reconciliation` | route `warehouseId`; query `asOfDate` | list `WarehouseLocationReconciliationItemView`, rowsPath `items` | |

Yeni etiket kodları: `stockItemCode`, `stockItemName`, `warehouseQuantity`, `locatedQuantity`, `unlocatedQuantity`,
`asOfDate` (`quantity`, `unitCode`, `parentLocationId` var).

### 2.6 Bileşen eşlemesi ve eksikler

Var: `actionBar`, `filterBar` (depo seçimi `select` + `depo.listele`; arama ve durum süzgeci yüklenen satırlarda),
`dataTable` ×3, `formCard` ×2 (`trackChanges`), `input` (`upperCase`, `maxLength`, `select` seçenekleri `depo.konumlari`),
`visibleWhen`/`disabledWhen` (`kullanici.rol == 'TenantAdmin'`), `contextPanel` (TenantUser özeti).

Eksikler:
- **G-L1 üst konum kodu.** `WarehouseLocationView` yalnız `parentLocationId` taşır; tabloda aynı listeden kod bulan
  bir biçim yok, `valueLabels` statiktir. Seçenekler: (a) görünüme ekleme amaçlı `ParentLocationCode` alanı ve yeni
  işlem adı (`depo.konumlari` sözleşmesine sütun eklemek sözleşme değişikliği sayılabilir; `ErpOperationCatalog.cs:56-59`),
  (b) `fark`: sütun düşer. Öneri: (a).
- **G-L2 üst konum seçeneklerini süzme.** Seçenekler yalnız **aktif** ve **kendisi hariç** olmalı; seçenek sorgusu
  satırlarını koşula göre süzen özellik yok. `fark`: tüm konumlar listelenir; yanlış seçimi sunucu reddeder (aynı etkin
  depo, kendisi, döngü).
- **G-L3 ilk aktif depoyu varsayılan seçme.** `defaultValue: "{{depolar.rows[0].id}}"` ilk depoyu seçer, ilk **aktif**
  depoyu değil (liste ada göre sıralı). `fark` ya da sunucuda aktif depolar için süzgeç (yeni işlem adı).
- **G-L4 Depolar'dan geçiş.** Eski Depolar ekranı isteği `sessionStorage` + pencere olayıyla iletir
  (`warehouse-locations/locationRequest.ts`); sistem sayfasının `page` eylemi `sayfa.parametre.*` ile iletir
  (`custom-page/navigationActions.ts:69-73`). İki ekran farklı modlardaysa (biri eski, biri yeni) geçiş depo seçimini ve
  "Lokasyon ekle" kipini kaybeder. İki ekran **birlikte** taşınmalı ya da eski konum ekranı sayfa parametresini okumalıdır.
- **G-L5 bakiye ve denetimde 4 ondalık.** `number` biçimi 2 ondalık gösterir (`cellFormat.ts:51`). `fark` (yuvarlanmış
  gösterim) ya da biçime ondalık hassasiyet seçeneği.
- **G-L6 TenantUser'da form yerine özet.** Aynı sağ bölmede role göre form ya da özet: `visibleWhen` ile iki bileşen;
  ifade edilebilir.

### 2.7 Görünüm anahtarları

| Anahtar | Alanlar (`TenantScreenViewEndpoints.cs`) | Bileşen eşlemesi |
|---|---|---|
| `inventory-warehouse-locations` | `code`, `name`, `parentLocation`, `status`, `actions` (sabit) (`:221-226`) | `code→code`, `name→name`, `status→isActive`, `parentLocation→parentLocationCode` (G-L1 çözülürse); `actions` karşılıksız |
| `warehouse-location-balances` | `stockItemCode`, `stockItemName`, `quantity`, `unitCode` (`:216-220`) | bire bir |
| `inventory-warehouse-reconciliation` | `stockItemCode`, `stockItemName`, `warehouseQuantity`, `locatedQuantity`, `unlocatedQuantity`, `unitCode` (`:227-232`) | bire bir |

---

## 3. Stok Değerleme (`inventory-cost`)

### 3.1 Yerleşim

- **Başlık:** "Stok Değerleme", açıklama "Ek maliyetleri, stok değerlemelerini ve alternatif birimleri yönetin.",
  sayaç = toplam bakiye satırı (yalnız TenantAdmin) (`InventoryPage.tsx:2492-2526`).
- **TenantUser:** yalnız sınır notu: "Stok maliyetleri ve alternatif birimler yalnızca firma yöneticileri tarafından
  yönetilebilir." (`:2544-2551`). Liste, süzgeç ve dışa aktarma yok (`:2484`).
- **TenantAdmin:**
  - Özet kartı: "Maliyetsiz" = yüklenen sayfadaki `unvaluedQuantity > 0` satır sayısı, "bu sayfa" (`useCostListScreen.tsx:53-69`).
  - Süzgeç satırı (`InventoryStockFilters`, `allowAll=false`, `showMinimumFilter=false`, `InventoryPage.tsx:2555-2579`):
    Depo seçici ("Tüm depolar" yok; açılışta ilk aktif depo, `:442-445`), arama (`q`, 250 ms gecikme), Yenile.
  - Liste (`inventory/components/InventoryCostGrid.tsx:11-18`, sabit sütunlar, görünüm anahtarı **yok**):

| Kod | Etiket | Biçim |
|---|---|---|
| `code` | Stok kodu | mono |
| `name` | Stok adı | |
| `quantityOnHand` | Depo miktarı | sayı (4 ondalık) + `unitCode` |
| `valuationAmountBase` | Stok değeri | 2 ondalık + `baseCurrencyCode` |
| `unvaluedQuantity` | Maliyetsiz miktar | sayı + `unitCode` |
| `actions` | İşlemler | "Yönet" düğmesi |

  - Boş durumlar: "Stok bakiyeleri yükleniyor…", "Yönetilecek stok bakiyesi yok".
  - Alt bilgi: seçili sayısı ve seçili değer toplamı, "Gösterilen N / toplam", sayfalayıcı (25) (`useCostListScreen.tsx:70-89`).
  - İşlem çubuğu: Aç (Enter) = mevcut satırın maliyet yöneticisi (`:40-48`); Diğer → CSV dışa aktar; toplu "Excel (seçilenler)".
- **Maliyet yöneticisi penceresi** (`InventoryPage.tsx:4576-…`), başlık "STOK MALİYETİ · {kod}" / ad; dört bölüm:
  1. **Birim dönüşümleri:** form Alternatif birim kodu * (≤ 8, büyük harf) + Temel birim katsayısı * (min/adım
     0.00000001) → "Birim ekle"; liste "1 X = k {birim}", satır eylemi "Devre dışı bırak" (onaylı, `:1843-1870`);
     boş: "Alternatif birim tanımı yok."
  2. **Maliyet yeniden değerleme:** Değerleme tarihi * (bugün), Değer farkı * (adım 0.01, ± işaretli), Açıklama *
     (≤ 240) → "Yeniden değerle". Not: "Negatif stok değeri veya maliyetsiz miktar kabul edilmez."
  3. **Mal kabul ek maliyeti:** Mal kabul * (seçenekler: son 50 mal kabulden **istemcide** `status == "Posted"` olanlar,
     ilki seçili, `:1786-1798`; değişince o kabulün ek maliyetleri yüklenir), Tutar * (min 0.01), Dağıtım yöntemi
     (Satır maliyetine göre / Miktara göre / Eşit), Kayıt tarihi * (yeniden değerleme tarihiyle **aynı durum**),
     Açıklama * (≤ 240) → "Ek maliyeti dağıt". Altında seçili kabulün ek maliyet kayıtları; `LandedCost` türünde ve ters
     kaydı **listede bulunmayan** satırda "Ters kayıt".
  4. **Seçili depodaki maliyet kayıtları:** son 100 kayıt (kod, tutar, tarih, açıklama); `Revaluation` türünde ve ters
     kaydı listede bulunmayan satırda "Ters kayıt".
  - Ters kayıt: zorunlu gerekçe ister (`promptDialog`, `:1936-1974`); yol türe göre değişir (bkz. 3.2).
  - Her başarılı yazmadan sonra pencere verileri ve liste yeniden yüklenir.

### 3.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış | `GET /api/warehouses/` | — | `erp.warehouses.read` | |
| Depo / sayfa / arama değişince | `GET /api/warehouses/{wid}/balances/page` | `page`, `pageSize=25`, `belowMinimumOnly=false`, `q` | `erp.warehouses.read` | `Program.cs:2970`; depo seçili değilse çağrılmaz. **Rol kısıtı yok**: TenantUser'a liste yalnız istemcide gizlenir. |
| Yönet / Aç | `GET /api/warehouses/{wid}/stock/{sid}/cost-adjustments` | — | `erp.inventory-cost-adjustments.read` | `Program.cs:3236-3246`; son 100 |
| Yönet / Aç | `GET /api/stock/items/{sid}/units` | — | `erp.stock-items.read` | `Program.cs:2359` |
| Yönet / Aç | `GET /api/purchasing/receipts/?page=1&pageSize=50` | — | `erp.purchase-receipts.read` | `Program.cs:6638-6649`; durum süzgeci yok |
| Yönet / kabul değişince | `GET /api/purchasing/receipts/{rid}/landed-costs` | — | `erp.inventory-cost-adjustments.read` | `Program.cs:6650-6659` |
| Birim ekle | `POST /api/stock/items/{sid}/units` | `{unitCode, factorToBase}` | `erp.stock-items.create` | **TenantAdmin işleyici** (`Program.cs:2371-2389`) |
| Birim kaldır | `DELETE /api/stock/items/{sid}/units/{cid}` | — | `erp.stock-items.delete` | **TenantAdmin işleyici** (`:2410`) |
| Yeniden değerle | `POST /api/warehouses/{wid}/stock/{sid}/revaluations` | `{entryDate, amountBase, reason}` | `erp.inventory-cost-adjustments.create` | **TenantAdmin işleyici** (`Program.cs:3247-3293`); kapalı dönem 409 |
| Ek maliyet dağıt | `POST /api/purchasing/receipts/{rid}/landed-costs` | `{entryDate, amountBase, allocationMethod, description}` | `erp.inventory-cost-adjustments.create` | **TenantAdmin işleyici** (`Program.cs:6660-6724`); kapalı dönem 409 |
| Ters kayıt (Revaluation) | `POST /api/warehouses/cost-adjustments/{id}/reverse` | `{reason}` | `erp.inventory-cost-adjustments.execute` | **TenantAdmin işleyici** (`Program.cs:3294-3326`) |
| Ters kayıt (LandedCost) | `POST /api/purchasing/receipts/{rid}/landed-costs/{aid}/reverse` | `{reason}` | `erp.inventory-cost-adjustments.execute` | **TenantAdmin işleyici** (`Program.cs:6725-6757`) |

### 3.3 Kurallar

- **İstemcide:** liste ve pencere yalnız TenantAdmin'de çizilir; mal kabul seçenekleri `Posted` süzülür; ters kayıt
  düğmesi türe ve "listede ters kaydı yok" koşuluna göre görünür; ters kayıt gerekçesi zorunlu.
- **Yalnız sunucuda** (kopyalanmaz): değerleme tutarı ≠ 0, 2 ondalık, açıklama ≤ 240; tarih bugünden ileri ve son
  hareket/değerleme tarihinden geri olamaz; yalnız pozitif bakiyede ve maliyetsiz miktar yokken değerleme; değer
  negatife düşemez; ek maliyet yalnız işlenmiş (`Posted`) kabule, kabul tarihinden önce olamaz, kabulden sonra çıkış
  varsa yasak, ters kaydı olan satıra yasak; yuvarlama farkı son satıra; aynı kayıt ikinci kez ters çevrilemez (409);
  ters kayıt tarihi bugündür ve kapalı döneme düşemez; ters kayıt gerekçesi ≤ 160 (`PlatformContracts.cs:933-937`);
  birim kodu ≤ 8, katsayı > 0 ve ≤ 8 ondalık, temel birim için dönüşüm yok, kod benzersiz.
- Maliyet kayıtları append-only'dir; ters kayıt yeni bağlı kayıt yazar.

### 3.4 Roller

- TenantAdmin: tüm ekran.
- TenantUser: yalnız sınır notu. Okuma uç noktaları (bakiye, maliyet kayıtları, mal kabuller) rolle sınırlı değildir,
  izin kurallarıyla açılabilir; yazmaların hepsi TenantAdmin işleyicidir.

### 3.5 ERP işlem kataloğu

Var olan: `stok.bakiye.sayfa` (`ErpOperationCatalog.cs:190-200`; meta'da `pageUnvaluedCount` zaten var),
`depo.listele`, `stok.kart.birimleri` (`:204`), `stok.kart.birimEkle` (`:207`, TenantAdmin), `stok.kart.birimSil`
(`:209`, TenantAdmin).

Yeni (önerilen; yeni modül sabiti `Satınalma` gerekir):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `stok.maliyet.kayitlari` | GET `/api/warehouses/{warehouseId}/stock/{stockItemId}/cost-adjustments` | route ×2 | list `InventoryCostAdjustmentView` (skaler: `id, code, entryDate, kind, purchaseReceiptId, description, reversalOfId, createdAt, totalAmountBase`) | `Lines` bağlanamaz |
| `stok.maliyet.yenidenDegerle` | POST `/api/warehouses/{warehouseId}/stock/{stockItemId}/revaluations` | route ×2; body `entryDate`*, `amountBase`*, `reason`* | record `InventoryCostAdjustmentView` | `requiresTenantAdmin` |
| `stok.maliyet.tersKayit` | POST `/api/warehouses/cost-adjustments/{id}/reverse` | route `id`; body `reason`* | record | `requiresTenantAdmin` |
| `satinalma.malKabul.listele` | GET `/api/purchasing/receipts` | query `page`, `pageSize` | list `PurchaseReceiptSummary`, rowsPath `items`, meta `page, pageSize, totalCount` | durum süzgeci yok (G-C2) |
| `satinalma.malKabul.ekMaliyetler` | GET `/api/purchasing/receipts/{id}/landed-costs` | route `id` | list `InventoryCostAdjustmentView` | |
| `satinalma.malKabul.ekMaliyetDagit` | POST `/api/purchasing/receipts/{id}/landed-costs` | route `id`; body `entryDate`*, `amountBase`*, `allocationMethod`*, `description`* | record | `requiresTenantAdmin` |
| `satinalma.malKabul.ekMaliyetTersKayit` | POST `/api/purchasing/receipts/{id}/landed-costs/{adjustmentId}/reverse` | route ×2; body `reason`* | record | `requiresTenantAdmin` |

Yeni etiket kodları: `kind`, `purchaseReceiptId`, `totalAmountBase`, `amountBase`, `reason`, `allocationMethod`,
`purchaseOrderId`, `purchaseOrderCode`, `receiptDate`, `lineCount`.

### 3.6 Bileşen eşlemesi ve eksikler

Var: `alert` (TenantUser notu, `visibleWhen: kullanici.rol != 'TenantAdmin'`), `metric`
(`{{bakiye.meta.pageUnvaluedCount}}`), `filterBar` (depo `select` + `q`), `dataTable` (sunucu sayfalı, `columnUnits`
ile birim, `money` biçimi), `dialog` (bir kaydet sorgusu + içinde kendi sorgusunu çalıştıran düğmeler), `editableGrid`
(birim dönüşümleri; stok kartı standardındaki `birimIzgarasi` örneği), `button` (`promptLabel`/`promptRequired` ile ters
kayıt gerekçesi), satır eylemi `visibleWhen`.

Eksikler:
- **G-C1 "ters kaydı var" koşulu.** Düğme, listedeki **başka bir satırın** `reversalOfId`'si bu satıra eşitse gizlenir;
  koşul dili satırlar arası arama yapamaz, `InventoryCostAdjustmentView` da `hasReversal` taşımaz. Seçenekler:
  (a) görünüme ekleme amaçlı `HasReversal` alanı + yeni işlem adı, (b) `fark`: düğme her zaman görünür, ikinci denemeyi
  sunucu 409 ile reddeder. Öneri: (a).
- **G-C2 mal kabul seçeneklerini `Posted` ile süzme.** Seçenek satırlarını süzen özellik yok; uç noktanın durum
  parametresi yok. Öneri: ekleme amaçlı `status` sorgu parametresi (yeni işlem adı) ya da `fark` (her durum listelenir,
  sunucu `Posted` olmayanı 409 ile reddeder).
- **G-C3 ters kayıt yolu türe göre.** Revaluation ve LandedCost ayrı işlemlerdir; iki satır eylemi `visibleWhen` (`kind`)
  ile ayrılır. İfade edilebilir; 4 satır eylemi sınırı içinde kalınmalıdır.
- **G-C4 dört bölümlü pencere.** Üç bağımsız form (birim, değerleme, ek maliyet) tek pencerededir; pencerenin tek
  kaydet sorgusu vardır. Bölüm başına bir yazma düğmesi ile çözülür (`fark`: Ctrl+S yalnız bir bölümü kaydeder).
  Pencerenin 20 öğelik `contains` sınırı gözetilmelidir.
- **G-C5 4 ondalık miktar.** bkz. G-L5.
- **G-C6 açılışta ilk aktif depo.** bkz. G-L3.
- **G-C7 TenantUser'da okumalar.** Liste `visibleWhen` ile gizlense de sorgular `runOn: load` ise istekler yine gider;
  sorgular TenantUser için çalışmamalıdır (bkz. Riskler).

### 3.7 Görünüm anahtarı

- Yok (`InventoryCostGrid.tsx:10`: "this screen has no tenant screen layout"). Görünüm kataloğunda `inventory-cost`
  anahtarı bulunmaz; `screenViews` boş kalır.

---

## 4. Lot / Seri İzleme (`inventory-tracking`)

### 4.1 Yerleşim

- **Başlık:** "Lot / seri izleme", açıklama "Depolardaki izlenen lot ve seri numaralarının güncel bakiyesini ve son
  hareket tarihini bulun.", sayaç = `totalCount` (`inventory-tracking/components/InventoryTrackingHeader.tsx:8-16`).
- **Uyarılar** (`InventoryTrackingAlerts.tsx:8-40`): "Depo listesi yüklenemedi: …"; "Lot / seri bakiyeleri
  yüklenemedi: …" + "Yeniden dene".
- **Özet kartları** (`InventoryTrackingPage.tsx:223-242`): "Süresi geçmiş" (bugünden önce) ve "30 gün içinde dolacak"
  (bugün dahil 30 gün), yalnız **yüklenen sayfa** üzerinden ("bu sayfa"). Eşik sabittir (`inventory/trackingExpiry.ts`).
- **İşlem çubuğu:** yalnız Diğer → CSV dışa aktar (`InventoryTrackingPage.tsx:74`). Yazma yok.
- **Süzgeçler** (`InventoryTrackingFilters.tsx:25-103`):

| Süzgeç | Tür | Parametre |
|---|---|---|
| Arama "Lot/seri kodu, stok veya depo ara" | metin; Enter ve yazma durunca uygulanır | `q` (sunucuda ≤ 120) |
| İz türü | çip Tümü / Lot / Seri | `trackingMode` = `Lot` \| `Serial` |
| Depo | aranabilir seçici, temizlenebilir ("Tüm depolar") | `warehouseId` |
| Filtreleri temizle | düğme, süzgeç varken | |
| Yenile | | |

- **Liste** (`InventoryTrackingPage.tsx:168-210`; görünüm `inventory-trace-balances`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `trackingCode` | Lot / seri | mono |
| `trackingMode` | İz türü | rozet Lot (info) / Seri (off) |
| `stockItem` | Stok | `stockItemName` + küçük `stockItemCode` (birleşik) |
| `warehouse` | Depo | `warehouseCode · warehouseName` (birleşik) |
| `quantityOnHand` | Mevcut miktar | 4 ondalık + `unitCode` |
| `expiryDate` | Son kullanma | tarih + durum etiketi (geçmiş / yakında) ya da "—" |
| `lastMovementDate` | Son hareket | tarih |

  Satır anahtarı `stockItemId:warehouseId:trackingCode:expiryDate` (`InventoryTrackingBalanceTable.tsx:9-10`); çoklu
  seçim + "Excel (seçilenler)"; boş durumlar "İz kayıtları yükleniyor…", hata, "Bu filtrelerle aktif lot veya seri
  bakiyesi bulunamadı." / "Aktif lot veya seri bakiyesi bulunamadı."
- **Sayfalama:** 50'şer (`InventoryTrackingPage.tsx:76`); alt bilgi "Gösterilen N / toplam".
- **Detay paneli** (`InventoryTrackingDetail.tsx:12-70`, salt okunur): kod, lot/seri kodu, tür rozeti, son kullanma
  etiketi; Mevcut miktar, Son kullanma ("Belirtilmemiş"), Stok, Depo, Son hareket; not "Bu ekran salt okunurdur…".
  Seçim yokken: "Bir lot veya seri seçin; ayrıntıları burada görün."
- **Alt not** (`InventoryTrackingBoundaryNote.tsx`): bakiyenin yalnız iz kodlu hareketlerden hesaplandığı.

### 4.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre | İzin | Not |
|---|---|---|---|---|
| Açılış | `GET /api/warehouses/` | — | `erp.warehouses.read` | tüm depolar (aktif süzgeci yok) |
| Açılış | `GET /api/screen-views/inventory-trace-balances/active` | — | `erp.screen-views.read` | hata yutulur |
| Açılış, süzgeç değişince, sayfa, Yenile | `GET /api/inventory-tracking/balances` | `page`, `pageSize=50`, `q`, `warehouseId`, `trackingMode` | `erp.inventory-tracking.read` | `InventoryTrackingInquiryEndpoints.cs:12-62`; `pageSize` sunucuda 1–100, varsayılan 25; son kullanmaya göre sıralı; yalnız bakiye ≠ 0; eski yanıtlar atılır |

### 4.3 Kurallar

- **İstemcide:** son kullanma durumu (geçmiş / 30 gün) yerel takvim gününe göre hesaplanır; sayaçlar yalnız o sayfa.
- **Sunucuda:** `trackingMode` yalnız Lot/Serial (400), `q` ≤ 120 (400); bakiye = Giriş − Çıkış iz miktarları.

### 4.4 Roller

- Fark yok; ekran salt okunur. TenantUser'ın `erp.inventory-tracking.read` ve depo seçenekleri için
  `erp.warehouses.read` Allow kuralı olmalıdır.

### 4.5 ERP işlem kataloğu

Var olan: `depo.listele`.

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç |
|---|---|---|---|
| `stok.izleme.bakiyeler` | GET `/api/inventory-tracking/balances` | query `q` (text), `warehouseId` (guid), `trackingMode` (text), `page`, `pageSize` | list `InventoryTrackingBalanceView`, rowsPath `items`, meta `page, pageSize, totalCount` |

Yeni etiket kodları: `stockItemCode`, `stockItemName`, `lastMovementDate` (diğerleri var). `InventoryTrackingBalanceView`
`AIERP.Api` projesinde tanımlıdır (`InventoryTrackingInquiryEndpoints.cs:147-149`); `Columns<T>()` ile okunabilir.

İsteğe bağlı (G-T1 için): aynı uç noktaya ekleme amaçlı meta `expiredCount`, `expiringSoonCount` (tüm sonuç üzerinden)
ve satıra `expiryState` alanı; sözleşme değişeceği için yeni işlem adıyla.

### 4.6 Bileşen eşlemesi ve eksikler

Var: `filterBar` (arama `searchParam: q`, iz türü `select` sabit seçenekler, depo `select` `depo.listele`),
`dataTable` (sunucu sayfalı, `valueLabels` Lot/Serial → Lot/Seri, `toneMap`, `date` biçimi, `columnUnits`),
`card`/`contextPanel` (seçili satır ayrıntısı), `metric`, `alert`, `text`.

Eksikler:
- **G-T1 son kullanma durumu.** "Süresi geçmiş" / "30 gün içinde dolacak" etiketleri ve sayaçları bugüne göre tarih
  karşılaştırması ister; koşul dilinde `<`/`>` yok, satırları koşula göre sayan gösterge yok. Seçenekler: sunucuda
  satıra `expiryState` ve meta sayaçları (yeni işlem adı) ya da `fark` (yalnız tarih gösterilir, kartlar düşer).
  Öneri: sunucu alanı. Eski kartlar yalnız "bu sayfa"yı sayıyordu; sunucu sayacı tüm sonucu sayarsa davranış değişir,
  bu etikette yazılmalıdır.
- **G-T2 birleşik hücreler.** `stockItem` (ad + kod) ve `warehouse` (kod · ad) iki alandan oluşur. `fark`: ayrı
  sütunlar (`stockItemCode`, `stockItemName`, `warehouseCode`, `warehouseName`).
- **G-T3 "Filtreleri temizle"** düğmesi: filterBar'ın toplu temizleme davranışı doğrulanmalı; yoksa `fark`.
- **G-T4 4 ondalık miktar.** bkz. G-L5.

### 4.7 Görünüm anahtarı

- `inventory-trace-balances` → `trackingCode`, `trackingMode`, `stockItem`, `warehouse`, `quantityOnHand`, `expiryDate`,
  `lastMovementDate` (`TenantScreenViewEndpoints.cs:233-239`).
- Eşleme: `trackingCode`, `trackingMode`, `quantityOnHand`, `expiryDate`, `lastMovementDate` bire bir;
  `stockItem → stockItemName`, `warehouse → warehouseName` (G-T2 nedeniyle kod sütunları eşlenmez).

---

## 5. Stok Hareketleri (`inventory-stock-movements`)

**Önkoşul:** `inventory-stock-movements` anahtarı `StandardMenuEndpoints` kataloğunda **yok** (`StandardMenuEndpoints.cs:17`
dizisinde geçmez). `SystemPages/SystemPageStandards.cs:158` standart menüde olmayan anahtarı reddeder; standart dosyası
eklenmeden önce anahtar menü kataloğuna eklenmelidir. Anahtar bugün yalnız yönlendiricide
(`WorkspacePageRouter.tsx:318`), sayfa adı haritasında (`workspace-navigation.ts:10, 13`), liste sayfaları kümesinde
(`WorkspaceShellPage.tsx:41`) ve `InventoryPageKey` türünde (`erp-types.ts:3`) geçer; standart menüden bu ekrana nasıl
gidildiği (menü öğesi, komut paleti ya da bağlantı) taşıma öncesinde netleştirilmelidir.

Ad karışıklığı: bu ekranın görünüm anahtarı `inventory-movement-history`'dir. `inventory-stock-movements` adlı görünüm
anahtarı ise Stok Kartları ekranının hareket penceresine aittir (`InventoryPage.tsx:1003`) ve bu ekranı ilgilendirmez.

### 5.1 Yerleşim

- **Başlık:** "Stok Hareketleri" (İngilizce arayüzde "Stock movements"), açıklama "Bir stok seçerek depo hareket
  geçmişini görüntüleyin.", sayaç = `totalCount` + "kayıt" (`InventoryMovementsPage.tsx:186-191`). Ekran
  `locale === "en"` için tüm metinleri İngilizce verir; görünümde etiketi değiştirilmemiş alanlar da dille değişir
  (`:78-81`).
- **İşlem çubuğu:** yalnız Diğer → CSV dışa aktar (`:65`). Yazma yok (kayıt append-only).
- **Süzgeçler** (`:193-226`):

| Süzgeç | Tür | Parametre |
|---|---|---|
| Stok kartı | aranabilir seçici; arama 180 ms gecikmeyle sunucuda (`q`, ilk 50), yalnız **aktif** kartlar istemcide süzülür (`:116-133`) | rota parametresi `stockItemId` |
| Depo | düz seçim: "Tüm depolar" (varsayılan) + yalnız **aktif** depolar (`:103-105`) | "Tüm depolar" → kart rotası; depo → depo rotası |
| Yenile | | `refreshKey` |

- **Liste** (`:229-281`; görünüm `inventory-movement-history`; varsayılan sütunlar `:22-31`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `entryDate` | Tarih | tarih |
| `direction` | Yön | rozet Giriş (ok) / Çıkış (info) + ok simgesi; ters kayıtta "· İade" ve gri ton |
| `quantity` | Miktar | `enteredQuantity ?? quantity` (3 ondalık) + `enteredUnitCode \|\| kartın birimi` |
| `warehouse` | Depo | `warehouseCode · warehouseName`; yoksa seçili depo |
| `storageLocation` | Konum | `storageLocationCode · storageLocationName` ya da "—" |
| `tracking` | Lot / seri | `tracking[]` → "KOD (miktar), …" |
| `description` | Açıklama | |
| `unitCostBase` | Birim maliyet | varsayılan gizli; sayı ya da "—" |

  Çoklu seçim + "Excel (seçilenler)". Boş durumlar: "Stok hareketleri yükleniyor…", "Hareketleri görmek için bir stok
  kartı seçin.", "Önce bir depo oluşturun veya etkinleştirin.", "Seçili stok ve depoda hareket bulunmuyor."
- **Sayfalama:** 50'şer; alt bilgi "Gösterilen N / toplam" (`:282-295`).

### 5.2 API çağrıları

| Ne zaman | Yöntem ve yol | Parametre | İzin | Not |
|---|---|---|---|---|
| Açılış | `GET /api/screen-views/inventory-movement-history/active` | — | `erp.screen-views.read` | hata yutulur |
| Açılış | `GET /api/warehouses/` | — | `erp.warehouses.read` | istemcide aktifler |
| Açılış, stok araması | `GET /api/stock/items/?page=1&pageSize=50[&q]` | `q` | `erp.stock-items.read` | `Program.cs:1916`; aktif süzgeci yok |
| Stok seçili, "Tüm depolar" | `GET /api/stock/items/{sid}/transactions` | `page`, `pageSize=50` | `erp.stock-items.read` | `Program.cs:1825-1856`; depo kodu ve adı döner |
| Stok + depo seçili | `GET /api/warehouses/{wid}/stock/{sid}/transactions` | `page`, `pageSize=50` | `erp.warehouses.read` | `Program.cs:3063-3084`; **depo kodu/adı dönmez** (görünümün `warehouseId/Code/Name` alanları boş kalır, `:3078-3082`) |

İki okuma farklı izin kaynaklarındadır: "Tüm depolar" `erp.stock-items.read`, tek depo `erp.warehouses.read` ister.

### 5.3 Kurallar

- **İstemcide:** pasif kartlar ve pasif depolar seçeneklerden çıkarılır; seçim değişince sayfa 1'e döner; eski
  yanıtlar atılır.
- **Sunucuda:** `pageSize` 1–100; tarih ve oluşturma zamanına göre azalan sıra; `hasReversal` her satır için hesaplanır.

### 5.4 Roller

- Fark yok; salt okunur.

### 5.5 ERP işlem kataloğu

Var olan:
- `stok.kart.listele` (`ErpOperationCatalog.cs:133-134`): stok seçici için.
- `depo.listele`.
- `stok.kart.hareketleri` (`:151-152`): kart rotası, ama `MetaPaths` yok, toplam sayı bağlanamaz.
- `stok.hareket.listele` (`:216-217`): depo rotası, meta var; ama iki rotayı tek tabloda seçemez.

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `stok.hareket.gecmisi` | GET `/api/stock/items/{stockItemId}/transactions`; `routeVariants: [/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions when warehouseId]` | route `stockItemId`*; route `warehouseId` (isteğe bağlı, `stok.bakiye.sayfa` gibi); query `page`, `pageSize` | list `InventoryTransactionView`, rowsPath `items`, meta `page, pageSize, totalCount` | Varyantlı işlemde çağıranın **iki rotanın da** iznine sahip olması gerekir (`ErpOperationCatalog.cs:404-420`): `erp.stock-items.read` **ve** `erp.warehouses.read`. Yalnız birine izinli kullanıcı için işlem `allowed=false` olur; eski ekranda bu kullanıcı yalnız bir kipte çalışabiliyordu (`fark`). |

Yeni etiket kodu gerekmez (`InventoryTransactionView` alanlarının etiketleri var).

### 5.6 Bileşen eşlemesi ve eksikler

Var: `filterBar` / `input` `lookup` (stok kartı, `stok.kart.listele`, `minChars`, sunucu araması), `input` `select`
(`staticOptions` "Tüm depolar" + `depo.listele`), `dataTable` (sunucu sayfalı, `valueLabels` Receipt/Issue →
Giriş/Çıkış, `toneMap`, `date`, `columnUnits`), boş durum metni (`emptyText`).

Eksikler:
- **G-M1 Lot / seri sütunu.** `tracking` iç içe listedir; `Columns<T>()` onu atar, hücre biçimi listeyi birleştiremez.
  Seçenekler: sunucuda ekleme amaçlı düz metin alanı (`trackingText`) ve yeni işlem adı, ya da `fark` (sütun düşer).
  Lot/seri bilgisinin kaybolması izlenebilirlik açısından önemlidir; öneri: sunucu alanı.
- **G-M2 tek depo rotasında depo adı.** Depo rotası `warehouseCode/Name` döndürmez. Seçenekler: rotaya alanları eklemek
  (`stok.hareket.listele` sonuç sütunları bu alanları zaten bildiriyor ama boş geliyor) ya da `fark` (depo seçiliyken
  sütun boş; seçili depo süzgeçte zaten görünür).
- **G-M3 miktar hücresi.** `enteredQuantity ?? quantity` ve `enteredUnitCode || kart birimi` geri düşüşü ifade
  edilemez. `fark`: `enteredQuantity` + `columnUnits: enteredUnitCode` ve ayrı `quantity` (ana birim) sütunu.
- **G-M4 yön + ters kayıt.** "Giriş · İade" birleşik etiketi ve ters kayıtta gri ton tek hücrede ifade edilemez
  (`toneMap` tek sütunun değerine bakar). `fark`: ayrı "Ters kayıt" (`isReversal`) sütunu.
- **G-M5 aktif kart / aktif depo seçenekleri.** Seçenek satırlarını süzen özellik yok; `stok.kart.listele` aktif
  süzgeci almaz. `fark` ya da ekleme amaçlı `activeOnly` parametresi.
- **G-M6 İngilizce arayüz.** Ekran `locale` ile iki dillidir; sistem sayfası metinleri tek dildir. `fark` (yalnız Türkçe).
- **G-M7 standart menü anahtarı** (yukarıdaki önkoşul).
- **G-M8 3 ondalık miktar.** bkz. G-L5.

### 5.7 Görünüm anahtarı

- `inventory-movement-history` → `entryDate`, `direction`, `quantity`, `warehouse`, `storageLocation`, `tracking`,
  `description`, `unitCostBase` (gizli) (`TenantScreenViewEndpoints.cs:193-198`).
- Eşleme: `entryDate`, `direction`, `description`, `unitCostBase` bire bir; `quantity → enteredQuantity`;
  `warehouse → warehouseName`; `storageLocation → storageLocationName`; `tracking → trackingText` (G-M1 çözülürse,
  yoksa karşılıksız).

---

## 6. Özet tablo

| Ekran | Var olan işlemler | Yeni işlem (v1) | Sonraya kalan yeni işlem | Başlıca eksikler |
|---|---|---|---|---|
| Depo Yönetimi | 2 | 7 | 3 (alan tanımı yönetimi) | G-D1 rowVersion kaynağı, G-D3 sayaçlar, G-D4 ağaç, G-K1 TenantDeveloper |
| Raf ve Konumlar | 2 | 5 | — | G-L1 üst konum kodu, G-L2 seçenek süzme, G-L3 ilk aktif depo, G-L4 geçiş kanalı |
| Stok Değerleme | 5 | 7 | — | G-C1 "ters kaydı var", G-C2 Posted süzgeci, G-C4 çok formlu pencere, G-C7 TenantUser okumaları |
| Lot / Seri İzleme | 1 | 1 | (+ isteğe bağlı sürüm: son kullanma alanları) | G-T1 son kullanma durumu, G-T2 birleşik hücre |
| Stok Hareketleri | 2 (+2 kısmen) | 1 | — | G-M7 menü anahtarı, G-M1 lot/seri, G-M2 depo adı, G-M3/G-M4 birleşik hücre, G-M6 dil |

Genel eksikler (birden çok ekranda):
- **G-K1** `RequiresTenantAdmin` ikilidir; "TenantAdmin veya TenantDeveloper" işleyicileri ifade edilemez.
- **G-K2** satırları koşula göre sayan gösterge yok (çip ve alt bilgi sayaçları).
- **G-K3** seçenek sorgusunu satır koşuluna göre süzme yok (aktif kayıtlar, `Posted`, kendisi hariç).
- **G-K4** sayı biçiminde ondalık hassasiyet seçilemez (2 sabit).
- **G-K5** koşul dilinde sıralama/tarih karşılaştırması yok.
- **G-K6** iç içe listeler sonuç sütunu olamaz.
- **G-K7** CSV ve seçili satırları dışa aktarma yok; yalnız görünen sayfa Excel'e aktarılır (bkz. 0).

## 7. Önerilen taşıma sırası (kolaydan zora)

1. **Lot / Seri İzleme** — salt okunur, tek okuma işlemi; sunucu sayfalı liste ve süzgeçler mevcut bileşenlerle
   kurulur. Tek ciddi fark son kullanma etiketleridir (G-T1); v1 `fark` ile çıkabilir.
2. **Stok Hareketleri** — salt okunur, tek yeni işlem (`stok.hareket.gecmisi`). Önce menü anahtarı (G-M7) ve tercihen
   lot/seri metni (G-M1) çözülmelidir; birleşik hücreler `fark`tır.
3. **Depo Yönetimi** — mevcut `inventory-warehouses.json` (v1) sürüm 2'ye genişletilir. CRUD, özel alanlar ve durum
   değişikliği mevcut bileşenlerle kurulur (stok kartı standardındaki `customFieldsBlock` ve `saveSequence` örnekleri).
   Alan tanımı yönetimi sonraya.
4. **Raf ve Konumlar** — Depo Yönetimi ile **aynı sürümde** yayımlanmalı (G-L4). TenantAdmin işleyicileri, üst konum
   kodu (G-L1) ve seçenek süzme (G-L2) kararları gerekir.
5. **Stok Değerleme** — en çok yeni işlem (7), çok formlu pencere, satırlar arası koşul (G-C1), seçenek süzgeci (G-C2),
   kapalı dönem ve maliyet kuralları. En son taşınmalıdır.

## 8. Riskler

- **Yetki çözümü farkları.** Varyantlı işlem iki rotanın iznini birden ister (Stok Hareketleri); izin kuralları
  bir rotaya göre yazılmış TenantUser'lar ekranı eskisinden daha kısıtlı görebilir. Canlı QA'da TenantUser ile denenmeli.
- **`POST /status` ve `POST /revaluations` → `create`.** Firma kuralları "execute" üzerine kurulmuşsa beklenen
  sonuç çıkmaz. Bu mevcut davranıştır, taşıma değiştirmez; sistem sayfasının `allowed` bayrağı onu görünür kılar.
- **Rol denetimsiz depo yazmaları.** Depo oluşturma/güncelleme/durum işleyicilerinde rol denetimi yoktur; eski ekranda
  da rol kısıtı yoktu. Değişiklik değil, bilinen durum.
- **TenantUser'a istemcide gizlenen okuma (Stok Değerleme).** Bakiye ve maliyet kayıtları okumaları rolle sınırlı
  değildir; sistem sayfası `visibleWhen` ile gizlese de sorgu `runOn: load` ise istek yine gider. Sorgular rol koşuluna
  göre çalışmalı ya da TenantUser için hiç yüklenmemelidir.
- **İdempotency yok.** Değerleme, ek maliyet ve konum/depo oluşturma çift gönderimde çift kayıt üretebilir; yazma
  düğmelerinin çalışırken kilitlenmesi korunmalıdır.
- **rowVersion'ın liste satırından bağlanması.** Bağlama `liste.seciliSatir.rowVersion`'a yapılırsa, kaydetmeden önce
  liste yenilenip satır güncellenirse yeni sürümle yazılır ve araya girmiş değişiklik ezilebilir. Eski ekran açılıştaki
  sürümü saklar (`useWarehouseDefinitionScreen.tsx:67-69, 197-206`; `WarehouseLocationsPage.tsx:147-149, 488-496`).
  Formun açılış değerini saklayan bir bağlama (`formCard` `recordKey` + açılış anlık görüntüsü) gerekip gerekmediği
  doğrulanmalıdır.
- **Sözleşme değişikliği kuralı.** G-L1, G-C1, G-C2, G-M1, G-M2, G-T1 sunucu yanıtına alan eklemeyi öneriyor. Katalog
  isimleri kalıcıdır; mevcut bir işlemin sonuç sütunlarını değiştirmek yerine yeni ad açılmalıdır
  (`ErpOperationCatalog.cs:56-59`, `tests/IntegrationTests/ErpOperationCatalog.names.txt`).
- **Depolar ↔ Konumlar geçişi** (G-L4): yalnız biri taşınırsa "Lokasyon ekle" / "Tümünü yönet" bağlamı kaybolur.
- **Menü anahtarı** (G-M7): Stok Hareketleri için standart menü kataloğuna yeni anahtar eklemek menü düzenleme ve
  yönlendirme haritasını etkiler; geriye uyum (eski menü öğeleri) denetlenmelidir.
- **Ondalık hassasiyet** (G-K4): miktarlar 2 ondalığa yuvarlanmış görünür; lot/seri ve birim dönüşümlü kartlarda
  kullanıcı yanlış miktar okuyabilir. Biçim desteği gelmeden canlıya alınmamalı ya da açıkça `fark` olarak onaylanmalıdır.
- **Dil** (G-M6): Stok Hareketleri İngilizce arayüzde Türkçe görünür.
