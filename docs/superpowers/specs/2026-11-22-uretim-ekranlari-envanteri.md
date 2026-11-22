# Üretim ekranları: eşdeğerlik envanteri

Bu belge yerleşik Üretim ekranlarından seçilen beşini (biri ertelenmiş) sistem sayfasına (standart tanım) taşımak için
girdidir. Bilgiler kod okunarak çıkarıldı (2026-11-22, `origin/master` `abd6b027`). Kaynakta ayrıca satır satır
doğrulananlar: iptal işleyicisi (ME:1324-1346), tamamlama (ME:1167-1192, 1244-1316), reçete PUT'unda `operations`
null → boş (ME:605), genel stok ters kaydı (`Program.cs:3205-3250`), yürütme son ekleri
(`PlatformPermissionCatalog.cs:402-407`), menü kataloğu (`StandardMenuEndpoints.cs:11-31`), eski ekranda iptalin onaysız
olduğu (MP:2356-2357) ve emir çiplerinde sayı olmadığı (MP:4790-4800), maliyet raporu yanıt biçimi
(`ReportEndpoints.cs:672-684, 6020-6030`). Diğer satır numaraları okuma geçişinden gelir; uygulamada yeniden bakılır. Biçim ve terimler
`2026-11-21-finans-ekranlari-envanteri.md`, `2026-11-21-crm-ekranlari-envanteri.md` ve
`2026-11-21-cari-ekranlari-envanteri.md` ile aynıdır; zarf ve yönlendirme kuralları
`2026-11-18-sistem-sayfalari-design.md` belgesindedir. `fark` kabul edilmiş davranış farkı, `eksik` taşımadan önce
kapatılması gereken boşluk, `kusur` bugünkü kodda bulunan hata, `doğrulanmalı` kod okumasıyla kesinleşmeyen noktadır.

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir. **ME:** =
`ManufacturingEndpoints.cs`, **MP:** = `ManufacturingPage.tsx` (5395 satır; bütün üretim ekranlarını tek bileşen çizer,
`Manufacturing*Page.tsx` dosyaları 8–10 satırlık sarmalayıcıdır). Eksik kimlikleri **G-U** önekiyle numaralanır
(docs altında daha önce kullanılmadı).

**Onay (2026-11-22):** Kullanıcı taslak 24'ü ve on kararı onayladı: (1) kapsam Üretim emirleri, Yeni üretim emri,
Reçete listesi, Maliyet analizi; iş merkezleri ve MRP sonraki dalga; (2) reçete kartı eski ekranda, Yeni/Aç
`legacyScreen` ile eski karta, eski kart `bomId` sayfa parametresini okur (G-U20); (3) `manufacturing-order-create`
kataloğa sıradan alt ekran "Yeni üretim emri" (G-U1 seçenek a); (4) Üretim API okuma ekleri (G-U4, G-U5, G-U6, G-U9,
G-U16); (5) iptal onaylı, başlamış operasyonda uyarılı; (6) ızgara/alan doldurma ekleri için üçüncü ad açılmaz, o güne
kadar elle giriş ve birim başına önizleme; (7) lot/seri satır başına; (8) operatör seçici İK işlemini kullanır; (9)
G-U2 ayrı PR adayı, bu işin parçası değil; (10) ayrı `ErpOperationCatalog.Manufacturing.cs`, sıra Maliyet analizi →
API ekleri + Emirler + Yeni emir → Reçete listesi + G-U20 → (motor ekleri gelince) reçete kartı; hepsi `preview`,
varsayılan eski ekran. Uygulama, ortak motor dosyalarına dokunan diğer modüllerle sıralanınca başlar.

## Kapsam ve seçim

Üretim menüsünde 8 ekran anahtarı var (`workspace-navigation.ts:16-21`, `StandardMenuEndpoints.cs:21`'de 7'si).
Kullanım verisi elimizde yok; seçim günlük iş akışına ve **bağımlılığa** göre yapıldı:

| Grup | Ekran anahtarları | Karmaşıklık | Neden önce / neden sonra |
|---|---|---|---|
| **A · Üretim emirleri** | `manufacturing-orders` | yüksek | Üretimin günlük ekranı: çizelgele, serbest bırak, operasyon başlat/tamamla, üretimi bildir, iptal. Stok hareketlerinin tamamı buradan doğar. |
| **B · Yeni üretim emri** | `manufacturing-order-create` | orta | A'nın girişi; tek POST, satış siparişine bağlama. |
| **C · Reçeteler** | `manufacturing-recipes` (liste); `manufacturing-recipe-create` (kart) **envanterde, taşıması ertelendi** | orta / yüksek | Emrin ön koşulu (aktif reçete yoksa emir açılmaz). Kart iki satır ızgarası ve çoklu seçim hücresi ister (G-U15); bu dalgada Yeni/Aç eski karta gider (§7 öneri 3). |
| **D · Maliyet analizi** | `manufacturing-cost-variance` | düşük | Salt okunur rapor; motorda karşılığı hazır, ucuz kazanç. |

Kapsam dışı (sonraki dalga):

- **İş merkezleri** (`manufacturing-work-centers`, `-work-center-create`): kayıt panelindeki çalışma takvimi
  (haftalık maske, tarih istisnası, yıllık kural, dönüşümlü vardiya, sıralı kurulum kuralları; MP:3798-4774) için sayfa
  motorunda karşılık yok. Liste + basit oluşturma formu taşınabilir ama takvim eski ekranda kalacağından tek başına
  değeri düşük. **Reçete rota ızgarası için yine de `uretim.isMerkezi.listele` lookup işlemi gerekir** (C.5).
- **Malzeme planlama** (`manufacturing-mrp`): anlık görüntülü plan, seviye girintili satırlar, satır bazında reçete
  seçerek dönüştürme ve satınalma talebi özel alanları (MP:4847-5256). Ağaç/girinti ve dinamik özel alan formu ayrı
  motor işi; ayrıca bir sunucu kusuru var (§0 Kusurlar).

---

## 0. Ortak bilgiler

### Menü ve anahtarlar

- Standart menü kataloğu (`StandardMenuEndpoints.cs:21`, grup "Üretim"): `manufacturing-recipes` "Tanımlı reçeteler",
  `-recipe-create` "Reçete oluştur", `-work-centers`, `-work-center-create`, `-orders` "Üretim emirleri", `-mrp`,
  `-cost-variance` "Maliyet analizi". PageKeys bu kataloğdan türer (`:25`).
- **G-U1 `eksik`:** `manufacturing-order-create` katalogda ve PageKeys'te **yok** (yalnız ön yüz tipinde,
  `erp-types.ts:5`; `ManufacturingOrderCreatePage.tsx` `section="manufacturing-orders"` + `createOrderPage` geçirir).
  Standart yükleyici bu `screenKey` ile dosya kabul etmez (`SystemPages/SystemPageStandards.cs:204`; satış G-S1 ile aynı
  sorun). Katalogda gizli girdi bayrağı **yok**; alt ekranlar sıradan menü girdisidir (`crm-opportunity-create` "Yeni
  fırsat", `manufacturing-recipe-create` "Reçete oluştur"). Seçenekler: (a) aynı biçimde
  `new("manufacturing-order-create", "Yeni üretim emri", "Üretim")` girdisi (ortak dosya; menüde görünür olur),
  (b) `NavigablePageKeys`'e eklemek (`:30-31`, satış oluşturma ekranları gibi) — yalnız erpPage hedefini açar, PageKeys'e
  girmez, standart yine yüklenmez, (c) `manufacturing-orders` standardına `aliases` (`SystemPageStandards.cs:160-186`) —
  takma ad aynı tanımı açar, ayrı form veremez. **Öneri (a).**
- Alt rotalar (`shell/moduleMenus.ts:29-31`): recipe-create → recipes, work-center-create → work-centers,
  order-create → orders. `workspace-storage.ts:13-15` tüm `manufacturing-*` anahtarlarını kalıcı sekme sayar.
- `system-pages/systemPageKeys.ts` içinde üretim anahtarı yok; eklenecek (ortak dosya).
- Yönlendirici üretim sayfalarına `{token, onNavigate}` verir, maliyet farkına yalnız `token`
  (`WorkspacePageRouter.tsx:319-335`). Sistem sayfasında ekranlar arası geçiş `page @key` eylemiyle kurulur.
- Görünüm anahtarları (`TenantScreenViewEndpoints.cs:28`): `manufacturing-cost-variance`, `-mrp-lines`, `-orders`,
  `-recipes`, `-work-centers` (beş anahtar). Standartların `screenViews` alanına bağlanır.

### Yetki modeli

- Tek kaynak `erp.manufacturing` (`PlatformPermissionCatalog.cs:54`). GET `read`, PUT `update`, DELETE `delete`.
  POST'ta son parça yürütme listesindeyse (`:402-407`: `cancel, release, convert, activate, deactivate, schedule,
  start, complete`) `execute`, değilse `create` (`work-centers`, `boms`, `orders`, **`mrp/plan`**).
- **Hiçbir üretim işleyicisinde rol (TenantAdmin) denetimi yok.** TenantAdmin katalogu atlar; TenantUser ve
  TenantDeveloper için Allow kuralı gerekir. `requiresTenantAdmin` bayrağı hiçbir `uretim.*` işleminde gerekmez.
- **Maliyet analizi istisnası:** `GET /api/reports/manufacturing-cost-variance` rolü TenantAdmin **veya TenantUser**
  ister ve ayrıca `manufacturingOrders` rapor kaynağı izni arar (`ReportEndpoints.cs:386-388, 590-680`).
  TenantDeveloper raporu göremez; sistem sayfası bunu nedenli boş durumla göstermelidir (G-U19).
- Satır düzeyi süzgeç yok (cari G-C3 riski beklenmez).
- **Kusur (küçük):** eski ekranın 403 metni izin adını yazar ("Gerekli izin: erp.manufacturing.{…}", MP:644-728) ama
  `execute` son ek listesinde `activate` yok; "Etkinleştir" reddinde yanlış izin adı (`create`) gösterilir. Sistem
  sayfası izinsiz düğmeyi nedenli pasif çizdiği için bu metin taşınmaz (`fark`, olumlu).

### İdempotency ve eşzamanlılık

- **Hiçbir üretim ucu `requestId` almaz.** Çift gönderimi şunlar önler:

  | Yazma | Koruma |
  |---|---|
  | Emir oluştur | emir kodu firma içinde benzersiz (`PlatformDbContext.cs:2989`) → ikinci istek 409 |
  | Çizelgele / serbest bırak / tamamla / iptal / operasyon başlat-tamamla | durum koruması + Serializable işlem + `UPDLOCK, HOLDLOCK` (ME:1617-1621); ikinci istek 409 |
  | Reçete oluştur | reçete kodu benzersiz |
  | Reçete güncelle | `rowVersion` zorunlu (ME:594-604, 641) |
  | MRP dönüştür | dönüştürülmüş satır işareti (kapsam dışı) |

  Sistem sayfasında ek `autoId` gerekmez; tek `busy` kilidi motorun düğme kilidiyle karşılanır.
- **rowVersion yalnız reçete PUT'unda kullanılır.** `OrderView` `RowVersion` döndürür (ME:751) ama hiçbir emir ucu
  okumaz. Reçete PUT'u **tam yer değiştirmedir**: satırlar ve operasyonlar silinip yeniden yazılır (ME:626-638).
  Sistem sayfasında `sourceBacked` + kaynak okuma zorunlu; gönderilmeyen alan **sessizce silinir** (bkz. G-U9).
- Eski ekran sekmeler arası `nexora:manufacturing-changed` olayıyla diğer açık üretim sekmelerini sessizce yeniler
  (MP:910-925). Motorda karşılığı yok (`fark`, §6).

### Stok hareketleri, ters kayıt ve iptal sırası

**Durum makinesi** (`Entities.cs:928-929`):

- Emir: `Planned` (Planlandı) → `Released` (Serbest bırakıldı) → `Completed` (Tamamlandı); `Planned | Released` →
  `Cancelled` (İptal edildi). Taslak / çizelgelendi / devam ediyor emir durumu **yok**; "çizelgelendi" yalnız
  operasyonların takvim alanından anlaşılır.
- Operasyon: `Planned` (Bekliyor) → `InProgress` (Devam ediyor) → `Completed` (Tamamlandı).

| Geçiş | Uç | Ön koşul | Yazdığı | Stok | Muhasebe |
|---|---|---|---|---|---|
| Planla | POST `/orders` | aktif reçete, aktif depo, tercih edilen iş merkezleri aktif, kaynak sipariş satırı mamulle eşleşir, seri izlemede tam sayı (ME:779-874) | emir + reçete anlık görüntüsü (bileşen `RequiredQuantity = qty×(1+fire%)/çıktı×planlanan`, ME:810-819; operasyon maliyeti ME:848-867) | yok | yok |
| Çizelgele | POST `/{id}/schedule` | Planned, operasyonlu (ME:876-1068) | kapasite tahsisleri, operasyon tarihleri, seçilen makine ve maliyet | yok | yok; **denetim kaydı da yok** (`kusur`) |
| Serbest bırak | POST `/{id}/release` | Planned, tüm operasyonlar çizelgeli (rota yoksa serbest) (ME:1070-1084) | durum | yok | yok |
| Operasyon başlat | POST `/{id}/operations/{opId}/start` | emir Released; op Planned ve çizelgeli; bugün ≥ planlanan başlangıç; önceki sıralar Completed; bekleme günü (ME:1086-1119) | op durumu, `StartedAt` | yok | yok |
| Operasyon tamamla | POST `…/complete` | op InProgress; aktif personel; süre > 0 (ME:1121-1165) | fiili süre, enerji, maliyet, operatör | yok | yok |
| Üretimi bildir (tamamla) | POST `/{id}/complete` | **kapalı dönem (bugün)**; Released; iyi + fire = planlanan (4 ondalık); fire varsa neden (≤500); tüm operasyonlar Completed ve fiili maliyetli (ME:1167-1192) | bileşen başına **Issue**, mamul için tek **Receipt**, emir iyi/fire alanları | aşağıda | **yok** |
| İptal | POST `/{id}/cancel` | Planned veya Released (ME:1324-1346) | kapasite tahsisleri silinir, op tarihleri boşaltılır, durum Cancelled, denetim kaydı | yok | yok |

Tamamlama ayrıntısı:

- Depo **emrin deposudur**; seçim yok. Bileşen ve mamul **konumu** isteğe bağlıdır (aynı depoda aktif olmalı);
  eski ekran konum alanlarını hiç göstermez (`componentStorageLocationId`, `finishedGoodsStorageLocationId`
  gönderilmez).
- Bileşen tüketimi **planlanan** gereksinimdir (iyi miktara oranlanmaz; iyi + fire = planlanan olduğu için tutarlı).
  Hareket açıklaması "Üretim {kod} bileşen tüketimi", mamul "Üretim {kod} mamul girişi"; hepsi `ManufacturingOrderId`
  taşır, tarih İstanbul bugünü.
- **Fire için ayrı stok hareketi yok**; yalnız `ScrapQuantity/ScrapReason` alanına yazılır (ME:1313-1314).
- Yetersizlik: bakiye = depo (konum seçildiyse konum) toplamı − etkin satış rezervasyonları (ME:1252-1259). Negatif
  stoka yalnız firma ayarı açık, rezervasyon yok, izlemesiz ürün ve konumsuz durumda izin var
  (`TenantOperationalSettingsEndpoints.cs:65-67`); aksi halde 409 "Bileşen stokları açık satış rezervasyonları
  düşüldükten sonra yetersiz." + `shortages[]` listesi.
- Bileşen lot/serisi **otomatik FEFO** ile ayrılır, SKT'si geçmiş lotlar hariç (ME:1636-1662); kullanıcı seçmez. 409
  "{kod} için son kullanma tarihi geçmemiş, izlenen miktar yetersiz."
- Mamul izleme (ME:1537-1551): seride her kod 1 adet ve SKT'siz, kod tekrar kullanılamaz; lotta SKT zorunlu ve
  bugünden önce olamaz, var olan lotun SKT'si değiştirilemez; toplam = iyi miktar.
- Maliyet: bileşen birim maliyeti bugüne kadar ağırlıklı ortalama + düzeltmeler; değerlenmemiş hareket varsa bilinmez.
  Mamul birim maliyeti = (bileşen + operasyon fiili) / iyi miktar, 8 ondalık. Bilinmezse `UnitCostBase=null`,
  `costStatus="IncompleteComponentCost"`. Yanıt `{order, baseCurrencyCode, totalCostBase, unitCostBase,
  operationCostBase, costStatus}`.

**Ters kayıt ve iptal sırası:**

- **Tamamlanmış emir iptal edilemez ve üretimin ters kaydı yoktur.** "Tamamlanmış veya iptal edilmiş üretim emri iptal
  edilemez." Muhasebe fişi hiç yazılmadığı için fiş tarafında da geri alınacak bir şey yok.
- **G-U2 `kusur` (kapsam dışı, işaretlenir):** genel stok hareketi ters kaydı
  (`Program.cs:3205-3250`, POST `…/transactions/{entryId}/reverse`) transfer, irsaliye, iade ve mal kabul hareketlerini
  "belgesinin iptaliyle geri alın" diye reddeder ama **`ManufacturingOrderId` taşıyan hareketi reddetmez**. Üretimin
  bileşen çıkışı ve mamul girişi stok ekranından tek tek ters çevrilebilir; emir Completed kalır, ters kayıt
  `ManufacturingOrderId`'yi korur (`:3249`), maliyet analizi fiilî malzemeyi bu FK üzerinden topladığı için raporu
  bozar. Taşıma bunu değiştirmez; düzeltme (reddetmek ya da "üretim geri alma" işlemi) ayrı karar ve ayrı PR'dır.
- **G-U3 `kusur`/risk:** iptal, **başlamış ya da tamamlanmış operasyonu olan** Released emri de engellemez; fiili
  süre/maliyet kayıtları iptal edilen emirde kalır. Eski ekranda iptal **onaysız** çalışır (MP:2357). Öneri: sistem
  sayfasında onay; başlamış operasyon varsa onay metni uyarır ("n operasyonun fiili kaydı var; iptal geri alınamaz").
- İptal yalnız `ScheduledStart/EndDate`'i boşaltır; dakika/saniye alanları kalır (ME:1337-1341). Zararsız ama
  `doğrulanmalı`: yeniden çizelgeleme yapılamadığı için (iptal son durum) etkisi yok.
- Üretim için rezervasyon kavramı yok; iptalde çözülecek ayırma yoktur.

### Kapalı dönem

Yalnız tamamlamada: `LockTenantForPostingAsync` + `FindClosedPeriodAsync(bugün)`, etiket "üretim stok hareketi"
(ME:1171-1175). Hata 409 `"{from}–{to} dönemi kapalı; üretim stok hareketi bu tarihe kaydedilemez."`. Hareket tarihi hep
bugün olduğu için kullanıcı tarih seçmez; geçmiş tarihli üretim bildirimi yok (`fark` değil, bugünkü davranış).

### Kusurlar (bugünkü kod, taşımadan bağımsız)

- G-U2 ve G-U3 yukarıda.
- **MRP:** açık emir sorgusunda `Include(Operations)` yok (ME:1418); açık emirlerin arz/talep tarihi hep `PlannedDate`'e
  düşer (ME:1450, 1453). MRP kapsam dışı; not edildi.
- **Çizelgeleme denetim kaydı yazmaz** (ME:876-1068); diğer emir geçişleri yazar.
- **İş merkezleri:** Sil gerekçesi "İş merkezi silinemez; durumu Genel sekmesinden değiştirilir." diyor ama Genel
  sekmesinde durum kontrolü yok; API'de iş merkezi PUT / aktif-pasif / sil ucu da yok (ME:36-249).
- `ManufacturingSummary.tsx` hiçbir yerde kullanılmıyor (ölü kod).

### Grid ekleri ve ortak motor bağımlılığı

Reçete bileşen satırları, emir önizlemesi ve tamamlama ızgarası, açık iki dalın **farklı adlarla** yazdığı ızgara
eklerine dayanır:

| İhtiyaç | Satış Aşama B (`feat/satis-asama-b`) | Satınalma Faz 2 (`feat/satinalma-faz-2`) |
|---|---|---|
| kaynaktan dolan satırlar | `editableGrid.initialRowsQuery` + `initialRowsMap` + `skipRowsWhenEmpty` | E1 `fillQuery` / `fillColumns` / `skipWhenZero` |
| seçimle komşu hücre doldurma | `lookupFill: ["<lookup>:<hedef>=<alan>"]` | E2 `lookupFills: {…}` |
| hesaplanan sütun | `calc:<sorgu>:<alan>` (sunucuda) | E3 `formulas: {col: "…"}` (istemcide) |

Üretim üçüncü bir ad açmaz; hangisi birleşirse onu kullanır. O güne kadar üretim standartları bu eklere ihtiyaç
duymayan biçimde (sunucu alanları + salt okunur önizleme) kurulur (G-U8, G-U12).

---

## 1. Üretim emirleri (`manufacturing-orders`)

### 1.1 Yerleşim

**Liste** (MP:4775-4846; yardımcılar `manufacturing/orderList.ts`)

- Başlık "Üretim emirleri", sayaç `totalCount`.
- Özet kartları (MP:2086-2128): **Açık emir** (`openOrderCount`, "firma geneli · Planlandı + Serbest bırakıldı"),
  **Planlanan maliyet** (bu sayfa, iptal hariç), **Çizelgelenmemiş** (warn, "bu sayfa · rotası takvimsiz"),
  **Tamamlanan** (tıklanınca Completed süzgecini aç/kapat). Üç kart **yalnız görünen sayfayı** sayar.
- Araç çubuğu: arama "Emir, reçete, depo veya sipariş ara" (taslak yazılır, **Enter ile** sunucu `q`'suna uygulanır,
  sayfa 1'e döner); durum çipleri Planlandı / Serbest bırakıldı / Tamamlandı / İptal edildi; panel aç/kapa.
- Izgara (sütunlar MP:527-555, genişlik :341-350): Üretim emri (kod), Plan tarihi, Reçete / rota ("kod · mamul" +
  rota özeti: "rota yok", "n op · çizelgelenmedi" (warn), "n op · çizelgelendi", "x / n tamamlandı"), Depo, Planlanan
  miktar (≤4 ondalık), Üretim türü / sipariş ("SO-kod · satır n" ya da "Stoka üretim"), Bileşenler (kodlar virgülle,
  title'da adlar), Durum rozeti (Planlandı info, Serbest bırakıldı warn, Tamamlandı ok, İptal off; `orderList.ts:12`).
- Sunucu sayfalaması 25; seçili satır sayfadan çıkarsa düşer. Boş: "Henüz üretim emri yok. Bir reçete oluşturduktan
  sonra ilk emri planlayabilirsiniz." / süzgeçte "Filtreyle eşleşen üretim emri yok."
- Tek tık seçer; çift tık / Enter / Aç paneli açar ve odağı taşır (onay kutusu hücresinde açmaz).

**Komutlar** (`orderList.ts:19-43`, MP:2345-2376)

| Komut | Görünür / etkin | Çağrı | Sonuç metni |
|---|---|---|---|
| Yeni (F2) | her zaman | `page manufacturing-order-create` | — |
| Kapasiteye çizelgele | Planned ve çizelgesiz operasyon var | POST `/schedule` `{}` | "{kod} için iş merkezi kapasitesi ayrıldı." |
| Serbest bırak | Planned ve tüm operasyonlar çizelgeli (rota yoksa da) | POST `/release` | "Üretim emri serbest bırakıldı." |
| Üretimi tamamla | Released ve tüm operasyonlar Completed | tamamlama diyaloğu | (1.1 sonu) |
| İptal et | Planned veya Released | POST `/cancel` `{}` — **onaysız** | "Üretim emri iptal edildi." |
| Sil | hep pasif | — | "Üretim emri silinemez; İşlemler'den iptal edin." |
| CSV / Excel (seçilenler) | — | istemci | — |

**Detay paneli** (`manufacturing/components/ManufacturingOrderPanel.tsx`; sekmeler Özet, Rota, Bileşenler)

- Özet: planlanan miktar + birim, iyi / fire, planlanan maliyet (bileşen + operasyon), fiili işlem maliyeti, **"Sıradaki
  adım"** düğmesi (bir sonraki geçerli geçişi önerir), plan tarihi, depo, üretim türü, fire nedeni, tamamlanma. Not:
  "Tutarlar firma baz para birimindedir."
- Rota (MP:2145-2322): her operasyon "sıra · merkez kodu", durum, dakika (tamamlandıysa fiili). Title'da enerji, maliyet,
  zaman penceresi, çok günlük kapasite dilimleri.
  - Released + op Planned: **Operasyonu başlat** → POST `/operations/{opId}/start`.
  - Released + op InProgress: **Operasyonu tamamla** satır içi giriş: Kurulum dk, Çalışma dk (varsayılan plan),
    Enerji kWh, Baz para/kWh, Operatör (aktif personel; **tek kişi varsa otomatik seçilir**). "Fiili kayıtları kaydet"
    → POST `…/complete`. Operatörsüz: "Fiili operasyon kaydı için operatör/personel seçin." Boş: "Operasyon rotası
    tanımlı değil."
- Bileşenler: ad, kod, gereken miktar; "Planlanan malzeme" toplamı. Boş: "Bu emirde bileşen satırı yok."
- Klavye: Esc listeye döner / drawer'ı kapatır; Ctrl+. panel.

**Tamamlama diyaloğu "Üretimi bildir · {kod}"** (MP:1635-1643, 1741-1797, 5257-5392)

- İyi ürün miktarı (varsayılan planlanan), Fire miktarı (0), Fire nedeni (fire > 0 iken görünür, zorunlu, ≤500). Durum
  satırı "Planlanan / Bildirilen". Kaydet "Bildir ve Tamamla".
- İzleme modu reçetenin `productTrackingMode`'undan: **Lot** → Lot numarası (≤100) + SKT (zorunlu), tek kayıt, miktar =
  iyi; **Seri** → metin kutusu, satır / virgül / noktalı virgülle bölünür, her kod miktar 1 (sayı istemcide
  denetlenmez); izlemesizde alan yok.
- İstemci kuralları: "İyi ürün ve fire miktarlarının toplamı planlanan miktara eşit olmalıdır.", "Fire miktarı varsa
  fire nedeni girilmelidir."
- Sonuç: `costStatus==="Valued"` → "Üretim tamamlandı. Mamul maliyeti: ₺…"; değilse "…Bileşen maliyetleri eksik; mamul
  girişi maliyetsiz kaydedildi."
- **Yok:** bileşen tüketimini düzenleme, bileşen lot/seri seçimi, depo/konum seçimi.

### 1.2 API çağrıları

| Çağrı | Ne zaman | Gövde / sonuç |
|---|---|---|
| GET `/api/manufacturing/orders/?page&pageSize=25&q&status` | açılış, süzgeç, sayfa, her yazmadan sonra | `{page, pageSize, totalCount, openOrderCount, items: OrderView[]}` (ME:699-755). `page` yoksa düz dizi, Take(100). `OrderView` iç içe `Lines[]` ve `Operations[]` (+ `CapacityDays[]`) taşır (ME:1708-1721) |
| GET `/api/hr/employees/` | açılış | operatör seçimi (Active) |
| GET `/api/screen-views/manufacturing-orders/active` | açılış | sütun görünümü |
| POST `/orders/{id}/schedule`, `/release`, `/cancel` | komut | gövde `{}`; schedule yanıtı emir |
| POST `/orders/{id}/operations/{opId}/start` | Rota sekmesi | — |
| POST `/orders/{id}/operations/{opId}/complete` | Rota sekmesi | `{actualSetupMinutes, actualRunMinutes, actualEnergyQuantityKwh, actualEnergyCostPerKwhBase, performedByEmployeeId}` → emir |
| POST `/orders/{id}/complete` | tamamlama | `{finishedGoodsTracking[{trackingCode, quantity, expiryDate}], actualGoodQuantity, scrapQuantity, scrapReason}` (+ kullanılmayan `componentStorageLocationId`, `finishedGoodsStorageLocationId`) |

- **Tekil GET `/orders/{id}` yok** (G-U4). `OrderView` alanlarında mamul kodu/adı ve izleme modu **yok**; eski ekran
  bunları reçete listesinden eşler (G-U5).

### 1.3 Kurallar

§0 tablosu. Ek: arama `q` emir kodu, reçete kod/ad, depo kod/ad ve satış sipariş kodunda arar; `status` geçersizse
"Üretim emri durumu geçersiz."; sıralama plan tarihi azalan, sonra kod. Çizelgeleme algoritması (ufuk 365 gün,
tarih istisnası > yıllık kural > vardiya döngüsü > haftalık maske, sıralı kurulum ailesi, alternatif makine seçimi:
en erken bitiş → en erken başlangıç → tercih edilen → kod; ME:938-1052) sunucuda kalır; ekran yalnız sonucu gösterir.
Kapasite bulunamazsa 409 "{kod} veya alternatif makineleri 365 gün içinde kapasite bulamadı ya da sıralı kurulum
kuralı geçişi engelledi; çizelge kaydedilmedi."

### 1.4 Roller

Bütün düğmeler `erp.manufacturing` kurallarına bağlı: listele `read`; çizelgele, serbest bırak, operasyon başlat/
tamamla, tamamla, iptal `execute`. TenantUser'a yalnız `read` verilmişse sistem sayfası komutları nedenli pasif
gösterir (bugün düğme görünür, basınca 403 metni çıkar — `fark`, olumlu).

### 1.5 ERP işlem kataloğu

Var olan: yalnız `uretim.recete.listele` (stok kartı v1 için, `productStockItemId` **bilerek zorunlu**:
`ErpOperationCatalog.cs:351-353`) ve rapor kaynakları `rapor.manufacturingOrders`, `rapor.manufacturingWorkCenters`.
Emir işlemi yok. Modül sabiti hazır (`ManufacturingModule = "Üretim"`, `:74`). Yeni işlemler ayrı partial dosyada
önerilir: `ErpOperationCatalog.Manufacturing.cs` (Sales/Purchasing/Crm gibi, `InModule` etiket bloğuyla).

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `uretim.emir.listele` | GET `/api/manufacturing/orders` | query `q`, `status`, `page`, `pageSize` | list `OrderView`, `rowsPath:"items"`, `MetaPaths [page,pageSize,totalCount,openOrderCount]` | iç içe diziler sütun olmaz; G-U6 alanları |
| `uretim.emir.getir` | GET `/api/manufacturing/orders/{id}` (**yeni uç**, G-U4) | route `id` | record `OrderView` | panel başlığı, tamamlama kaynağı |
| `uretim.emir.operasyonlari` | aynı uç | route `id` | list `ManufacturingOrderOperationView`, `rowsPath:"operations"` | Rota sekmesi |
| `uretim.emir.bilesenleri` | aynı uç | route `id` | list `OrderLineView`, `rowsPath:"lines"` | Bileşenler sekmesi |
| `uretim.emir.olustur` | POST `/orders` | body `code`*, `billOfMaterialId`*, `warehouseId`*, `plannedQuantity`*, `plannedDate`*, `sourceSalesOrderId`, `sourceSalesOrderLineNumber` | record `OrderView` | §2 |
| `uretim.emir.cizelgele` | POST `/orders/{id}/schedule` | route `id`; `fixedBody {}` | record `OrderView` | |
| `uretim.emir.serbestBirak` | POST `/orders/{id}/release` | route `id` | yok | |
| `uretim.emir.operasyonBaslat` | POST `/orders/{id}/operations/{operationId}/start` | route `id`, `operationId` | yok | iki rota parametresi (`doğrulanmalı`: `Route()` yardımcısı ikinci guid'i destekliyor mu) |
| `uretim.emir.operasyonTamamla` | POST `…/complete` | route `id`, `operationId`; body `actualSetupMinutes`*, `actualRunMinutes`*, `actualEnergyQuantityKwh`, `actualEnergyCostPerKwhBase`, `performedByEmployeeId`* | record `OrderView` | operatör seçicisi G-U7 |
| `uretim.emir.tamamla` | POST `/orders/{id}/complete` | route `id`; body `actualGoodQuantity`*, `scrapQuantity`*, `scrapReason`, `componentStorageLocationId`, `finishedGoodsStorageLocationId`; list `finishedGoodsTracking` (`trackingCode`, `quantity`, `expiryDate`) | record `{order, baseCurrencyCode, totalCostBase, unitCostBase, operationCostBase, costStatus}` (`Flatten`) | `successMessage` `costStatus`'a göre iki metin (G-U10) |
| `uretim.emir.iptal` | POST `/orders/{id}/cancel` | route `id`; `fixedBody {}` | yok | onaylı (G-U3) |

Etiket kodları (`Labels`) `OrderView`, `ManufacturingOrderOperationView`, `OrderLineView` ve tamamlama sonucu için
eklenir (§5).

### 1.6 Bileşen eşlemesi ve eksikler

| Eski | Sistem sayfası | Durum |
|---|---|---|
| Başlık + sayaç | `actionBar.titleCount {{emirler.meta.totalCount}}` | hazır |
| Açık emir kartı | `metric` ← `{{emirler.meta.openOrderCount}}` | `MetaPaths`'e `openOrderCount` eklenir |
| Planlanan maliyet / Çizelgelenmemiş (bu sayfa) | — | **G-U6**: sunucu liste yanıtına `plannedCostTotal`, `unscheduledOrderCount`, `completedOrderCount` (tüm sonuç) eklenir; kartlar "tüm kayıtlar" sayar (`fark`, CRM kararı 2 gibi) |
| Tamamlanan kartı tıklanınca süzgeç | `metric` + `setInput durum=Completed` | `doğrulanmalı` (metric tıklama eylemi) |
| Arama (Enter) + durum çipleri | arama `input` + satır içi `formCard (layout: inline)` içinde "Durum" seçimi + yalnız etkin süzgeci gösteren `filterChips` (`crm-opportunities.json:77-88` deseni, PR #140) | hazır; tıklanabilir durum çipleri seçim kutusuna döner (`fark`); eski emir çiplerinde zaten sayı yok |
| Izgara | `dataTable` `paging:"server"`, `valueLabels status`, `toneMap`, `rowOpenAction` | hazır |
| "Reçete / rota" iki satırlı hücre ve rota özeti | — | **G-U6**: view'a `productCode`, `productName`, `operationCount`, `scheduledOperationCount`, `completedOperationCount` düz alanları; özet ayrı sütunlar ("Rota" `x/n`) |
| Bileşenler sütunu (kod listesi) | — | **G-U6**: `componentCodes` düz metin alanı ya da sütun kaldırılır |
| Durum bazlı komutlar | `button` + `visibleWhen` | **G-U6**: `canSchedule`, `canRelease`, `canComplete` bayrakları sunucudan (operasyon dizisine koşul dilinde erişilemez) |
| İptal | `button` query + `confirmEnabled/confirmText` | **fark** (olumlu): onay eklenir; başlamış operasyon uyarısı `startedOperationCount` alanıyla |
| Detay paneli 3 sekme | `contextPanel` ya da `dialog xl` + `tabs "Rota {{operasyonlar.satirSayisi}}"` | `uretim.emir.getir` gerekli (G-U4) |
| "Sıradaki adım" düğmesi | durum başına tek `button` + `visibleWhen` | hazır (bayraklarla) |
| Rota satırında Başlat / Tamamla | operasyon tablosunda satır seçilir; `rowActions` düğmeleri `disabledWhen` ile seçili satırın durumuna bağlanır (`inventory-transfers.json:71-81` deseni) | `doğrulanmalı`: ikinci rota parametresi `operationId` ← `{{operasyonlar.seciliSatir.id}}` (katalog `Route()` yardımcısında örnek yok) |
| Operatör seçimi, tek kişide otomatik | `input lookup` ← `ik.*` personel listesi | **G-U7**: katalogda personel işlemi yok (`names.txt`); İK oturumu (`ik-sistem`) açıyor; otomatik seçim `fark` (kaybolur) |
| Tamamlama diyaloğu | `dialog` + `formCard` | hazır |
| Lot / seri girişi | `editableGrid` `finishedGoodsTracking` (kod, miktar, SKT) | **G-U21**: seri metin kutusu bölme yok → satır başına bir seri (`fark`); modu göstermek için view'a `productTrackingMode` (G-U5) |
| İyi + fire = planlanan | sunucu 400 | istemci ön denetimi kaybolur, sunucu metni gösterilir (`fark`) |
| İki sonuç metni | `successMessage` | **G-U10**: koşullu başarı metni yok → tek metin "Üretim tamamlandı." + sonuç kutusunda `costStatus` rozeti |
| Sekmeler arası yenileme olayı | — | `fark` (kaybolur) |

### 1.7 Görünüm anahtarları

`screenViews: ["manufacturing-orders"]` (`TenantScreenViewEndpoints.cs:28`). Sütun kodları yeni düz alanlarla değişirse
görünüm alanları da güncellenir (`doğrulanmalı`: `ScreenViewCatalog`'da `manufacturing-orders` alanları).

---

## 2. Yeni üretim emri (`manufacturing-order-create`)

### 2.1 Yerleşim (MP:3109-3461)

- `RecordFormPage` "Üretim Emri Planlama", kaydet "Emir Planla". Reçete ya da depo yoksa: "Emir planlamak için en az
  bir reçete ve üretim deposu gerekir."
- Alanlar: Reçete* (aktif reçeteler), Planlanan miktar* (1, ≥0,0001; mamul birimi son ek), Üretim deposu* (seçici,
  **varsayılan yok**; durum MRP ile paylaşılır), Plan tarihi (bugün), Emir kodu* (≤48, "URE-2026-001"; **otomatik
  numara yok**), Üretim türü segmenti Stoka üretim / Satış siparişine üretim.
- Siparişe üretim: Satış siparişi (açık siparişler) → GET `/api/sales/orders/{id}`; kalan > 0 satırlar listelenir.
  Satır seçilince **otomatik doldurma**: mamule eşleşen aktif reçete, miktar = kalan, plan tarihi = istenen teslim
  (MP:1578-1587). Kalan yoksa "Açık siparişte üretime bağlanabilecek kalan satır yok."
- Salt okunur önizleme: bileşenler (Sıra, Bileşen, Fire %, Gereken = qty×(1+fire)×(planlanan/çıktı), Birim maliyet,
  Planlanan maliyet), rota (Kurulum dk, Çalışma dk = birim×miktar); yan panel "Reçete özeti" (mamul, bileşen, operasyon,
  toplam dk, planlanan malzeme; boşsa "Reçete seçilmeden özet boş kalır.").
- Kayıt sonrası "Üretim emri planlandı." ve emir listesine gidilir.

### 2.2 API çağrıları

GET `/api/manufacturing/boms/`, `/api/warehouses/`, `/api/sales/orders/?page=1&pageSize=100` (Open),
`/api/sales/orders/{id}`; POST `/api/manufacturing/orders/` `{code, billOfMaterialId, warehouseId, plannedQuantity,
plannedDate, sourceSalesOrderId|null, sourceSalesOrderLineNumber|null}`.

### 2.3 Kurallar

"Emir kodu, pozitif üretim miktarı veya plan tarihi geçersiz."; "Aktif reçete bulunamadı."; "Aktif depo bulunamadı.";
kaynak sipariş id ve satır numarası birlikte, satır açık ve mamulle eşleşmeli (ME:801-806); seri izlemeli mamul/bileşende
tam sayı (ME:827-830). Kod çakışması 409.

### 2.4 Roller

`erp.manufacturing.create`; satış siparişi seçici ayrıca satış okuma izni ister.

### 2.5 ERP işlem kataloğu

`uretim.emir.olustur` (§1.5); seçiciler: `uretim.recete.tumunuListele` (§3.5), `depo.listele` (var),
`satis.siparis.listele`, `satis.siparis.kalemleri` (var, `names.txt:178-181`). Önizleme için
`uretim.recete.getir` (yeni uç, G-U9).

### 2.6 Bileşen eşlemesi ve eksikler

| Eski | Sistem sayfası | Durum |
|---|---|---|
| Form | `formCard` + `input` | hazır |
| Ekran anahtarı | — | **G-U1** |
| Reçete, depo seçici | `input lookup` (`optionsQuery`) | hazır; depo varsayılanı yok (bugünkü gibi) |
| Emir kodu elle | `input` | **G-U11** (öneri, isteğe bağlı): sunucuya `Internal.ManufacturingOrder` numara serisi — bugün yok; taşıma için şart değil |
| Siparişe üretim segmenti | `input` seçim + `visibleWhen` | hazır |
| Sipariş satırı seçimi + otomatik doldurma | `lookup` ← `satis.siparis.kalemleri` + lookupFill | **G-U12**: ızgara/alan doldurma eki bekleniyor (§0 tablo); gelene kadar kullanıcı reçete/miktar/tarihi elle girer, sunucu eşleşmeyi doğrular (`fark`) |
| Bileşen / rota önizleme + reçete özeti | `dataTable` ← `uretim.recete.getir` satırları | çarpanlı "Gereken miktar" için **G-U13**: sunucu önizleme ucu `POST /orders/preview` (ya da `calc` eki); v1'de reçete satırları birim başına gösterilir + "× planlanan / çıktı" notu (`fark`) |
| Sonrası listeye dön | `successMessage` + `page manufacturing-orders` | hazır |

### 2.7 Görünüm anahtarları

Yok.

---

## 3. Reçeteler (`manufacturing-recipes`, `manufacturing-recipe-create`)

### 3.1 Yerleşim

**Liste** (`manufacturing/components/ManufacturingRecipeList.tsx`)

- Arama "Kod, reçete veya mamul ara" (istemcide, tr-TR küçük harf); durum çipleri Aktif / Pasif (sayılı); Yenile.
- Sütunlar (`:21-29`): Reçete (ad + altında kod), Mamul, Çıktı (≤4 ondalık), İçerik ("n bileşen · m operasyon"),
  Durum/kullanım (Aktif ok / Pasif off + "n üretim emri"), İş merkezleri (gizli).
- **İstemci sayfalaması 25.** Boş: "Henüz ürün reçetesi yok. Yeni (F2) ile ilk reçeteyi oluşturun." / "Aramanızla
  eşleşen reçete bulunamadı."
- Komutlar (MP:3652-3693): Yeni; Aç (çift tık / Enter) → kart; **Sil** (orderCount > 0 → pasif "Üretim emri referansı
  olan reçeteler silinemez."; aksi `confirmDialog` "Ürün reçetesi kalıcı olarak silinsin mi?" / "{kod} · {ad} reçetesi
  kalıcı olarak silinecek. Bu işlem geri alınamaz." / "Kalıcı olarak sil") → "{kod} reçetesi silindi."; İşlemler: Pasife
  al / Etkinleştir → "Ürün reçetesi pasife alındı." / "…etkinleştirildi."; CSV.

**Kart** (MP:2394-3108) — `RecordFormPage` "Ürün Reçetesi Tanımlama" / "Ürün Reçetesini Düzenle", kaydet "Reçeteyi
Kaydet" / "Değişiklikleri Kaydet"; Kaydet ve Yeni; Temizle (yalnız yeni); Vazgeç (kaydedilmemiş değişiklik **sorulmaz**).

- Sekmeler: **Kimlik**, **Bileşenler (n)**, **Rota (n)**. Durum satırı "Bileşen: n", "Operasyon: n / 50".
- Kimlik: Reçete kodu* (≤48, "REC-URUN-001"), Reçete adı* (≤160), Mamul* (aktif stok kartları; "İzlemeli: Lot/Seri" ya
  da birim; seçilince aynı kartı taşıyan bileşen satırları temizlenir), Çıktı miktarı* (1, ≥0,0001).
- Bileşenler (MP:2587-2729): Sıra, Stok kartı (mamul hariç), Miktar (1, ≥0,0001), Fire % (0–100), Birim maliyet (baz,
  0), sil (tek satırda pasif); "Bileşen ekle". Not: "Miktar reçete çıktısı başınadır; birim maliyet baz para
  birimindedir."
- Rota (MP:2749-3047): Sıra, İş merkezi (aktif), Birim süre dk (1), Kurulum dk (0), **Gelişmiş** (Kurulum ailesi ≤48,
  Enerji kWh/birim, Enerji bedeli baz/kWh, Bekleme gün 0–365, **Alternatif iş merkezleri** onay kutuları ≤19). Geçersiz
  alan varsa Gelişmiş açık kalır. ≤50 operasyon; boş "Rota isteğe bağlıdır; henüz operasyon yok."
- Yan panel "Özet": bileşen/operasyon sayısı, **Planlanan malzeme** = Σ miktar×(1+fire/100)×birim maliyet.
- Stok kartı yoksa: "Stok kartı bulunmadığı için reçete kaydedilemez."

### 3.2 API çağrıları

| Çağrı | Ne zaman | Gövde / sonuç |
|---|---|---|
| GET `/api/manufacturing/boms/` | açılış | `BomView[]` (`Id, Code, Name, ProductStockItemId, ProductName, ProductTrackingMode, OutputQuantity, IsActive, OrderCount, Lines[], RowVersion, Operations[]`; ME:1698-1705). Sayfalama yok, tek süzgeç `productStockItemId` |
| GET `/api/stock/items/?page=1&pageSize=100` + `q=` arama (≥2, 250 ms) | kart | seçici |
| GET `/api/manufacturing/work-centers/` | kart | ≤200, Code sıralı |
| POST `/boms` | yeni | `{code, name, productStockItemId, outputQuantity, lines[{componentStockItemId, quantity, scrapPercent, standardUnitCostBase}], operations[{sequence, workCenterId, setupMinutes, runMinutesPerOutputUnit, minimumWaitDaysAfterPrevious, setupFamilyCode, plannedEnergyKwhPerOutput, plannedEnergyCostPerKwhBase, eligibleWorkCenterIds[]}]}` |
| PUT `/boms/{id}` | düzenle | aynı + `rowVersion`; **tam yer değiştirme** |
| DELETE `/boms/{id}` | sil | 204 |
| POST `/boms/{id}/activate`, `/deactivate` | İşlemler | `{}` |

**Tekil GET `/boms/{id}` yok** (G-U9).

### 3.3 Kurallar

- `ValidateBom` (ME:1359-1370): kod harfle başlar; ad ≤160; 1–100 bileşen; fire 0–100; mamul kendi bileşeni olamaz;
  ≤50 operasyon, sıra benzersiz; alternatif ≤20 ve tercih edilen merkezi içerir; bekleme 0–365. Aktif iş merkezi,
  aktif mamul, aktif ve tekrarsız bileşen (ME:556-569). Yeni reçete aktif doğar. **Sürüm/revizyon kavramı yok.**
- Düzenleme: rowVersion zorunlu, "Reçete sürüm bilgisi eksik; listeyi yenileyin."; çakışmada 409 "Reçete başka bir
  kullanıcı tarafından değiştirildi…". Emirler anlık görüntü tuttuğu için kullanılmış reçete de düzenlenebilir.
- Silme: emirde kullanılmışsa 409 "Üretim emirlerinde kullanılmış reçete silinemez. Geçmiş kayıtlar korunur; reçeteyi
  pasife alın." Kalıcı silme.
- Etkinleştir: mamul/bileşen kartları ve iş merkezleri aktif olmalı. Pasife al: Planned/Released emir varsa 409 "Açık
  üretim emri olan reçete pasife alınamaz."

### 3.4 Roller

Liste `read`; oluştur `create`; güncelle `update`; sil `delete`; etkinleştir / pasife al `execute`.

### 3.5 ERP işlem kataloğu

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `uretim.recete.tumunuListele` | GET `/api/manufacturing/boms` | query `productStockItemId` (isteğe bağlı) | list `BomView` (iç içe diziler sütun olmaz) | **G-U14**: mevcut `uretim.recete.listele` bilerek zorunlu süzgeçli ve adı kalıcı; yeni ad açılır. Sayfalama istemcide (`paging:"client"`) |
| `uretim.recete.getir` | GET `/api/manufacturing/boms/{id}` (**yeni uç**, G-U9) | route `id` | record `BomView` | düzenleme kaynağı |
| `uretim.recete.bilesenleri` | aynı | route `id` | list `BomLineView`, `rowsPath:"lines"` | ızgara başlangıç satırları |
| `uretim.recete.operasyonlari` | aynı | route `id` | list `BomOperationView`, `rowsPath:"operations"` | |
| `uretim.recete.olustur` | POST `/boms` | body `code`*, `name`*, `productStockItemId`*, `outputQuantity`*; list `lines`; list `operations` | record `BomView` | **G-U15**: iki liste parametresi + `operations[].eligibleWorkCenterIds` iç içe guid listesi (G-K6 sınıfı) |
| `uretim.recete.guncelle` | PUT `/boms/{id}` | route `id`; aynı + `rowVersion`; `sourceBacked` | record `BomView` | kaynak `uretim.recete.getir` |
| `uretim.recete.sil` | DELETE `/boms/{id}` | route `id` | yok | |
| `uretim.recete.etkinlestir` | POST `/boms/{id}/activate` | route `id`; `fixedBody {}` | yok | |
| `uretim.recete.pasifeAl` | POST `/boms/{id}/deactivate` | route `id`; `fixedBody {}` | yok | |
| `uretim.isMerkezi.listele` | GET `/api/manufacturing/work-centers` | — | list `WorkCenterView` | rota ızgarası seçicisi |

Stok seçici: `stok.kart.listele` (var).

### 3.6 Bileşen eşlemesi ve eksikler

| Eski | Sistem sayfası | Durum |
|---|---|---|
| Liste, istemci arama + çipler | `dataTable paging:"client"` + satır içi `formCard` "Durum" seçimi + `filterChips` | hazır; sayılı çipler seçim kutusuna döner (`fark`) |
| Reçete hücresi ad + kod | ayrı Kod sütunu | `fark` (CRM kararı 8 gibi) |
| "n bileşen · m operasyon", "n üretim emri" | — | **G-U16**: view'a `lineCount`, `operationCount` düz alanları (`OrderCount` var) |
| Sil koşulu + onay | `deleteQuery` + `visibleWhen orderCount == 0` + onay | hazır |
| Pasife al / Etkinleştir | `button` + `visibleWhen isActive` | hazır |
| Yeni / Aç | erpPage `manufacturing-recipe-create` + `legacyScreen:true` (Aç'ta `params bomId=…`) | **G-U20**: eski ekran sayfa parametresi okumuyor; `ManufacturingPage` `bomId`'yi `usePageParams` ile okuyup `beginEditBom` çağırmalı (satınalma K7 deseni, `sales/purchasingPageParams.ts`); yalnız üretim dosyası |
| Kart 3 sekme (ertelendi) | `tabs "Bileşenler {{bilesenler.satirSayisi}}=…"` | hazır |
| Bileşen ızgarası | `editableGrid` (`lookup:stoklar`, number) | düzenlemede başlangıç satırları **G-U8** (ızgara eki); 5 sütun < 12 sınır |
| Mamul seçilince bileşenden düşürme | — | `fark`: sunucu "Mamul kendi bileşeni olamaz" ile reddeder |
| Rota ızgarası (Gelişmiş dahil 9 sütun) | `editableGrid` | 9 < 12 sınır; "Gelişmiş" açılır satır yok → hepsi sütun ya da gizlenebilir sütun (`fark`) |
| **Alternatif iş merkezleri (çoklu seçim hücresi)** | — | **G-U15 kritik**: ızgarada çoklu seçim hücresi ve iç içe liste yok. PUT tam yer değiştirme olduğu için alternatifli bir reçeteyi sistem sayfasında kaydetmek **alternatifleri siler** (veri kaybı) |
| Planlanan malzeme özeti | `metric` | `calc`/`formulas` eki ya da `editableGrid totals` (Finans eki); v1'de kalkar (`fark`) |
| rowVersion | gizli `input` ← kaynak | hazır (`sourceBacked`) |
| Kaydet ve Yeni, Temizle | `saveAndNew` | hazır |

### 3.7 Görünüm anahtarları

`screenViews: ["manufacturing-recipes"]` (`TenantScreenViewEndpoints.cs:667`).

---

## 4. Maliyet analizi (`manufacturing-cost-variance`)

### 4.1 Yerleşim (`ManufacturingCostVariancePage.tsx`, `manufacturing-cost-variance/components/*`)

- Başlık "Üretim maliyet analizi", sayaç `totalCount`.
- Kartlar ("Bu sayfa"): Planlanan malzeme ("fire dahil emir anlık görüntüsü"), Planlanan dönüşüm (işçilik + genel
  gider + enerji), Fiilî malzeme.
- Süzgeç: Plan tarihi başlangıcı / bitişi (ikisi de bugün; bitiş ≤ başlangıç + 365); değişince otomatik yükler; Yenile.
- Sütunlar (`Results.tsx:16-30`): Üretim emri (kalın kod + "n operasyon"), Plan tarihi, Durum, Miktar, Planlanan /
  Fiilî malzeme, Planlanan / Fiilî dönüşüm, Dönüşüm farkı, Fiilî toplam, Toplam fark, Planlanan / Fiilî işçilik
  (gizli). Para; null "—".
- Önceki / Sonraki "Sayfa x / y" (50'şer). Boş "Bu tarih aralığında üretim emri bulunamadı." Altta "Rapor kapsamı"
  kutusunda `limitations` metni.

### 4.2 API çağrıları

GET `/api/reports/manufacturing-cost-variance?from&to&page&pageSize=50` (dönem ≤366 gün, pageSize 1–200);
GET `/api/screen-views/manufacturing-cost-variance/active`.

### 4.3 Kurallar

Malzeme fiilisi `ManufacturingOrderId` FK'lı hareketlerden (G-U2 bu rakamı etkiler). Toplam varyans bilerek null
olabilir. Sunucu dönem sınırını 400 ile reddeder.

### 4.4 Roller

TenantAdmin veya TenantUser + `manufacturingOrders` rapor kaynağı izni (G-U19).

### 4.5 ERP işlem kataloğu

| Ad | Yöntem ve yol | Parametreler | Sonuç |
|---|---|---|---|
| `uretim.maliyetAnalizi` | GET `/api/reports/manufacturing-cost-variance` | query `from`*, `to`*, `page`, `pageSize` | list `ManufacturingCostVarianceOrder`, `rowsPath:"orders"`, `MetaPaths [page,pageSize,totalCount,limitations,pageTotals.*]` (`ReportEndpoints.cs:6020-6030`) |

Yanıt `{from, to, periodBasis, baseCurrencyCode, page, pageSize, totalCount, orders[], pageTotals, limitations}`.
`pageTotals` **yalnız o sayfanın** toplamıdır (`:672-678`); satırlarda emir kimliği yok (yalnız `orderCode`), satır
açma eylemi kurulmaz (eski ekranda da yok).

### 4.6 Bileşen eşlemesi ve eksikler

| Eski | Sistem sayfası | Durum |
|---|---|---|
| Tarih aralığı, bugün varsayılan | `formCard layout:inline` + `input date` (`tarih.bugun` kapsamı) | hazır |
| Bitiş ≤ başlangıç + 365 | — | sunucu reddi (`fark`) |
| Izgara + sayfalama | `dataTable paging:"server"` | hazır |
| İki satırlı emir hücresi | ayrı "Operasyon" sütunu | `fark` |
| "Bu sayfa" kartları | `metric` ← `{{rapor.meta.pageTotals.plannedMaterialBase}}` vb. | hazır, bugünkü gibi "bu sayfa" (`doğrulanmalı`: `MetaPaths` iç içe nesne yolu). **G-U17** (isteğe bağlı): dönem toplamı için rapor yanıtına `periodTotals` |
| Rapor kapsamı kutusu | `alert` ← `{{rapor.meta.limitations}}` (sunucu sabit metni, `:684`) | **G-U18** `doğrulanmalı`: meta yolundan metin bağlama |
| TenantDeveloper | nedenli boş durum | **G-U19** |

### 4.7 Görünüm anahtarları

`screenViews: ["manufacturing-cost-variance"]` (`TenantScreenViewEndpoints.cs:668`).

---

## 5. Gereken `Labels` kodları ve kayıtlar

- `ErpOperationCatalog.Manufacturing.cs` içinde `InModule("Üretim")` etiket bloğu: `OrderView`
  (`code, billOfMaterialName, warehouseName, sourceSalesOrderCode, sourceSalesOrderLineNumber, plannedQuantity,
  actualGoodQuantity, scrapQuantity, scrapReason, status, plannedDate, completedAt` + G-U6 alanları),
  `ManufacturingOrderOperationView`, `OrderLineView`, `BomView` (+ G-U16), `BomLineView`, `BomOperationView`,
  `WorkCenterView`, tamamlama sonucu, maliyet analizi satırı.
- `tests/IntegrationTests/ErpOperationCatalog.names.txt`: bu dalgada **18** yeni ad (emir 11; reçete 6:
  `tumunuListele, getir, bilesenleri, sil, etkinlestir, pasifeAl`; `maliyetAnalizi` 1). Kart ertelendiği için
  `uretim.recete.olustur`, `guncelle`, `operasyonlari` ve `uretim.isMerkezi.listele` (4) **açılmaz**; adlar kalıcı
  olduğundan kart adımında kesinleşir.
- `system-pages/systemPageKeys.ts` + testi; standart dosyaları `manufacturing-orders.json`,
  `manufacturing-order-create.json`, `manufacturing-recipes.json`, `manufacturing-cost-variance.json` (sürüm 1,
  `preview`). `manufacturing-recipe-create.json` kart adımında.
- CRM notu: Labels yinelemesi indeksleyicide sessizce eziliyor; `status`, `code` gibi ortak kodlar modül bloğunda
  yeniden tanımlanmamalı.

## 6. Kaybolması kolay eski davranışlar (denetim listesi)

1. Emir iptali ve MRP dönüştürme **onaysız**; sistem sayfası onay ekler (olumlu `fark`).
2. Sekmeler arası `nexora:manufacturing-changed` sessiz yenilemesi kaybolur.
3. Operatör tek kişiyse otomatik seçilir; kaybolur.
4. Tamamlamada iyi + fire istemci ön denetimi; sunucu metnine düşer.
5. Seri numaraları metin kutusundan bölünür; sistem sayfasında satır başına bir seri.
6. `costStatus`'a göre iki farklı başarı metni.
7. Özet kartlarının üçü "bu sayfa"yı sayar; yeni sürüm "tüm kayıtlar" (G-U6).
8. Reçete listesi istemcide arar ve sayfalar (25); emirler sunucuda (25, arama Enter ile).
9. Emir kodu otomatik numaralanmaz.
10. `OrderView` mamul ve izleme modu taşımaz; eski ekran reçete listesinden eşler.
11. Yeni emirde siparişe bağlanınca reçete, miktar ve tarih otomatik dolar.
12. Reçete kartında mamul seçilince aynı kartı taşıyan bileşen satırları silinir.
13. Alternatif iş merkezleri `eligibleWorkCenterIds = [ana + alternatifler]` olarak gönderilir; ana merkez seçilince
    alternatiflerden düşer.
14. Reçete kartında "Planlanan malzeme" canlı hesaplanır.
15. 403 metni gerekli izin adını yazar (ve `activate`'te yanlış adı).
16. Yeni emirde depo durumu MRP ekranıyla paylaşılır (aynı oturumda son seçilen depo).
17. Stok seçicide aramaya göre büyüyen önbellek (ilk 100 + aramalar).
18. Rota sekmesi title'ında çok günlük kapasite dilimleri ve zaman pencereleri.

## 7. Özet tablo, öneriler ve riskler

| Kimlik | Konu | Tür | Nerede |
|---|---|---|---|
| G-U1 | `manufacturing-order-create` katalogda yok | eksik | ortak (`StandardMenuEndpoints.cs`) |
| G-U2 | genel ters kayıt üretim hareketini reddetmiyor | kusur | Program.cs (ayrı PR) |
| G-U3 | başlamış operasyonlu emir iptali; onay yok | kusur / fark | standart |
| G-U4 | tekil `GET /orders/{id}` yok | eksik | Üretim API |
| G-U5 | `OrderView`'da mamul ve izleme modu yok | eksik | Üretim API |
| G-U6 | liste düz alanları + durum bayrakları + tüm-kayıt toplamları | eksik | Üretim API |
| G-U7 | personel seçici işlemi yok | bağımlılık | İK oturumu |
| G-U8 | düzenlemede başlangıç satırları (ızgara eki) | bağımlılık | Satış B / Satınalma Faz 2 |
| G-U9 | tekil `GET /boms/{id}` yok | eksik | Üretim API |
| G-U10 | koşullu başarı metni yok | fark | standart |
| G-U11 | emir otomatik numarası (isteğe bağlı) | öneri | Üretim API |
| G-U12 | sipariş satırından otomatik doldurma | bağımlılık | ızgara/alan doldurma eki |
| G-U13 | emir önizlemesinde çarpanlı gereksinim | eksik | Üretim API (önizleme ucu) |
| G-U14 | `uretim.recete.listele` zorunlu süzgeçli → yeni ad | karar | katalog |
| G-U15 | alternatif iş merkezi çoklu seçim + iç içe liste | **eksik, veri kaybı riski** | ortak motor |
| G-U16 | reçete view sayaçları | eksik | Üretim API |
| G-U17 | maliyet analizi dönem toplamları (isteğe bağlı) | öneri | Rapor API |
| G-U18 | meta yolundan metin bağlama | doğrulanmalı | motor |
| G-U19 | TenantDeveloper rapor erişimi | fark | standart |
| G-U20 | eski reçete kartı `bomId` sayfa parametresini okumuyor | eksik | ön yüz (yalnız üretim) |
| G-U21 | seri numaraları satır başına | fark | standart |

**Öneriler (taslak 24'teki kararlar):**

1. Kapsam A–D; iş merkezleri ve MRP sonraki dalga.
2. Sıra: **Maliyet analizi → Üretim emirleri (+ yeni emir) → Reçeteler**. Analiz motor eki ve sunucu değişikliği istemez (kartlar bugünkü gibi "bu sayfa"); emirler yalnız
   Üretim API eklerine (G-U4–G-U6) dayanır; reçeteler ızgara ekleri ve G-U15'i bekler.
3. G-U15 çözülene kadar **reçete listesi** sistem sayfasına geçer, **reçete kartı geçmez**: Yeni ve Aç, erpPage
   `legacyScreen:true` ile bugünkü karta gider (satış Aşama A deseni). Böylece alternatif makineli bir reçetenin
   kaydedilirken alternatiflerini kaybetme riski hiç doğmaz. Kart standardı, ızgarada çoklu seçim hücresi + iç içe
   liste gövdesi (G-K6 sınıfı) ortak motora girince ayrı adımda yazılır. (Not: PUT'ta `operations` null gönderilirse
   sunucu bugün rotayı **boşaltır**; "gönderme, koru" yolu yok.)
4. İptal onaylı; başlamış operasyon varsa uyarılı. G-U2 ayrı PR olarak önerilir (bu işin parçası değil).
5. Tüm standartlar sürüm 1, `preview`; varsayılan eski ekran. Ortak dosyalar (`ErpOperationCatalog.cs` Labels,
   `names.txt`, `systemPageKeys.ts`, `StandardMenuEndpoints.cs`, `SystemPageStandardsTests`) açık PR'larla (#134,
   #136, Satış B, Satınalma Faz 2) çakışır; uygulama onlarla sıralanır.

**Riskler:**

- Reçete PUT tam yer değiştirme: kaynakta olmayan alan sessizce silinir (G-U15 ve `setupFamilyCode`, enerji alanları
  ızgarada eksik kalırsa).
- Rota ızgarasında 9 sütun + Stok kartı seçicileri; 12 sütun / 30 sorgu sınırına yakın değil ama Satış B sınırı 16/40'a
  çıkarıyor, `doğrulanmalı`.
- Operasyon başlat/tamamla satır eylemlerinde iki rota parametresi (`id` + `operationId`) — motorda örneği yok,
  `doğrulanmalı`.
- QA yalnız "QA Test Firma 20261117"de; tamamlama gerçek stok hareketi yazar ve **geri alınamaz** — test için ayrı
  test stok kartları ve izlemesiz/lotlu/serili üç reçete gerekir.
