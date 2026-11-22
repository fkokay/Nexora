# Duran Varlık ekranları: eşdeğerlik envanteri

Bu belge Duran Varlık (sabit kıymet) modülünün yerleşik ekranını sistem sayfasına (standart tanım) taşımak için
girdidir. Bilgiler kod okunarak çıkarıldı (2026-11-22, `origin/master` `abd6b027`). Biçim ve terimler
`2026-11-21-cari-ekranlari-envanteri.md`, `2026-11-21-crm-ekranlari-envanteri.md` ve
`2026-11-21-finans-ekranlari-envanteri.md` ile aynıdır. Zarf ve yönlendirme kuralları `2026-11-18-sistem-sayfalari-design.md`
belgesindedir. `fark` kabul edilmiş davranış farkı, `eksik` taşımadan önce kapatılması gereken boşluk, `doğrulanmalı` kod
okumasıyla kesinleşmeyen nokta anlamına gelir. Her eksiğin sonunda nerede çözüleceği yazılıdır: `[standart]` yalnız JSON
tanımı, `[DV API]` yalnız `FixedAssetEndpoints.cs`, `[ortak]` sayfa motoru ya da her modülün dokunduğu katalog dosyası
(sıralama gerekir).

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir. Dosya adı yazılmayan
satır numaraları frontend'de `FixedAssetsPage.tsx`, sunucuda `FixedAssetEndpoints.cs` içindir. Taslak:
`docs/design-proposals/erp-design-language/27-duran-varlik-sistem-sayfalari.html`.

**Onay (2026-11-22):** Kullanıcı taslak 27'yi ve altı kararı onayladı: (K1) üç anahtar `fixed-assets`,
`fixed-asset-create`, `fixed-asset-card`; (K2) tek önek `duranVarlik.*` (alt gruplar `kiymet`, `edinim`, `amortisman`,
`vergiAmortismani`, `eldenCikarma`, `zimmet`), modül sabiti "Duran Varlık"; (K3) VUK v1'de, motor çoklu alan
doldurmayı desteklemiyorsa yalnız kod dolar, sabit "2026" taşınmaz; (K4) toplu amortisman kapsam dışı, ayrı iş; (K5)
amortisman, vergi kaydı, edinim fişi ve elden çıkarmada "geri alınamaz" onayı, zimmet/iade onaysız; (K6) sıra liste +
kart → edinim formu → zimmet (İK personel listesi gelince), hepsi `preview`, varsayılan eski ekran. Uygulama, ortak motor
ve katalog dosyaları diğer modüllerle sıralanınca başlar.

## Kapsam ve seçim

Duran Varlık modülünde **tek ekran anahtarı** var: `fixed-assets` (`shell/moduleMenus.ts:95`, ray `shell/railItems.ts:29`,
yönlendirici `WorkspacePageRouter.tsx:313-314`). Tek bileşen (`FixedAssetsPage.tsx`, 2.428 satır) beş görünüm çizer:

| Görünüm | Eski yer | Kullanım sıklığı (tahmin) | Taşıma |
|---|---|---|---|
| **A · Kıymet listesi** (özet kartları + sağ panel) | `:2002-2202`, `fixed-assets/components/FixedAssetRegister.tsx` | Yüksek; modülün giriş noktası | v1 |
| **B · Edinim kaydı** (yeni kıymet formu, VUK profili dahil) | `:924-1239` | Düşük–orta; alım olunca | v1 |
| **C · Kıymet kartı** (salt okunur, 5 sekme) | `:1425-1991` | Orta | v1 |
| **D · İş akışı pencereleri:** amortisman kaydı, elden çıkarma, zimmet + iade | `:1242-1422`, `fixed-assets/components/FixedAssetDialog.tsx` | Amortisman orta–yüksek (her ay, kıymet başına bir kayıt); zimmet düşük–orta; elden çıkarma seyrek | v1, liste ve kartın içinde |
| **E · VUK vergi amortismanı** (kart sekmesindeki ikinci plan + "Vergi kaydı oluştur") | `:1547-1765` (VUK paneli) | Düşük; yalnız VUK profilli kıymet | v1, kartta; ayrı karar (K3) |

"En sık 3–5 ekran" seçimi burada gerekmez: modül küçüktür ve hepsi tek bileşendedir. Öneri, beş görünümü **üç sistem
sayfasına** bölmektir (K1): `fixed-assets` (liste + pencereler), `fixed-asset-create` (edinim formu), `fixed-asset-card`
(kart + aynı pencereler).

**Bugün olmayanlar.** Görevde örnek olarak geçen bazı işlemler ne arayüzde ne API'de var. Bunlar eşdeğerlik değil, yeni
özelliktir ve bu belgede taşınmaz:

- **Transfer** (yer/şube/masraf yeri değişikliği) yok. En yakın karşılık **zimmet**tir (personel + serbest metin konum).
- Yeniden değerleme, bakım, sigorta, kıymet raporları, kategori ana kaydı (kategori serbest metin, en çok 80) yok.
- **Kıymet düzenleme ve silme** yok. Kart salt okunurdur; Sil her zaman nedenli pasiftir.
- **Ters kayıt / iptal hiçbir işlemde yok** (bkz. §0 "Ters kayıt"). Kaydedilmiş amortisman, vergi amortismanı, edinim fişi ve
  elden çıkarma arayüzden geri alınamaz.
- **Toplu amortisman** (tüm kıymetler için ay sonu çalıştırma) yok; N kıymet = N ayrı kayıt (K4).
- **Onay penceresi** hiçbir işlemde yok; her yazma Kaydet'e ya da satır düğmesine basınca gider (K5).

Kapsam dışı ama aynı API'yi kullanan tüketiciler (taşımadan etkilenmez): AI asistanı
(`src/AI/AIERP.AIService/AI/ERPAssistantFixedAssetTools.cs`), yevmiye kaynak etiketleri
(`general-ledger/sourceTypeLabels.ts:22-24`, `GeneralLedgerRules.cs:27-28`), hesap eşleştirme kataloğu
(`general-ledger/mappingCatalog.ts:71-78`).

---

## 0. Ortak bilgiler

### Menü ve anahtarlar

- **`fixed-assets` standart menü kataloğunda yok** (`StandardMenuEndpoints.cs:11-21`; dosyada "fixed" geçmiyor). Bu yüzden
  `PageKeys`'te değildir ve **sistem sayfası `screenKey`'i olamaz** (`SystemPages/SystemPageStandards.cs`; stok G-M7 ile aynı
  sorun). Bkz. **G-V1**.
- Modül menüsü tek sayfa bağlar (`moduleMenus.ts:95`). Ray kimliği `fixed-assets` kullanıcı tercihlerinde saklanır ve
  **yeniden adlandırılamaz** (`railItems.ts:16-17`). Hızlı arama girdisi `App.tsx:411-414`, Studio etiketi `App.tsx:627`
  ("Sabit Kıymetler"), bağımsız başlık `workspace-navigation.ts:59`, liste sayfaları kümesi `WorkspaceShellPage.tsx:39`,
  kalıcı sekme kümesi `workspace-storage.ts:13`. Tercih uç listesinde de var (`TenantUserPreferenceEndpoints.cs:14`).
- Henüz standart dosyası yok. Yeni standartlar sürüm 1 ve `preview` ile başlar; varsayılan eski ekran kalır.
- Yönlendirici eski ekrana yalnız `token` ve `locale` geçirir (rol yok, `onNavigate` yok). Sistem sayfaları arası geçiş
  `page @key` eylemiyle kurulur.
- Adlandırma tutarsızlığı: menü "Duran Varlıklar", ray "Duran Varlık", Studio/görünüm "Sabit Kıymetler", API etiketi
  "Sabit Kıymetler". Standart başlığı "Duran Varlıklar" önerilir (menüyle aynı).

### Görünüm (screen view) anahtarları

Üç anahtar `TenantScreenViewEndpoints.cs:23, 407-428, 701-703, 1271-1284`'te tanımlı:

| Anahtar | Alanlar | Not |
|---|---|---|
| `fixed-assets` | `assetCode`, `name`, `category`, `acquisitionDate`, `inServiceDate`, `acquisitionCostBase`, `residualValueBase`, `usefulLifeMonths`, `accumulatedDepreciationBase`, `remainingBookValueBase`, `vukTaxYear`, `vukDepreciationLowerLimitTry`, `vukCommuniqueNumber`, `status`, `actions` (sabit) | `remainingBookValueBase` API görünümünde **yok**; istemcide hesaplanır (G-V4) |
| `fixed-asset-depreciation` | `periodStart`, `amountBase`, `isPosted`, `journalEntryId` | kart › Amortisman tablosu |
| `fixed-asset-assignments` | `employee`, `assignedDate`, `returnedDate`, `location`, `actions` (sabit) | kart › Zimmet geçmişi |

Zarfın `screenViews` bölümü üçünü de eşlemeli; `actions` aktarılmaz.

### Yetki modeli

- Tek kaynak: `erp.fixed-assets` → `/api/fixed-assets` (`PlatformPermissionCatalog.cs:57`); beş eylemin hepsi tanımlı
  (`:28, 119-125`). Eylem yoldan çıkar: GET `read`; POST'ta son yol parçası `IsExecutionRoute` (`:399-408`) listesindeyse
  `execute`, değilse `create`. Sonuç **tutarsızdır**:

  | Uç | Son parça | Eylem |
  |---|---|---|
  | `POST /` (edinim) | — | `create` |
  | `POST /{id}/acquisition-posting` (edinim fişi) | `acquisition-posting` | **`create`** |
  | `POST /{id}/depreciation-postings` (amortisman) | listede | **`execute`** |
  | `POST /{id}/tax-depreciation-postings` (vergi amortismanı) | listede değil | **`create`** |
  | `POST /{id}/disposals` (elden çıkarma) | listede değil | **`create`** |
  | `POST /{id}/assignments` (zimmet) | — | `create` |
  | `POST /{id}/assignments/{aid}/return` (iade) | `return` | `execute` |

  Yani yalnız `create` hakkı olan kullanıcı kıymeti **elden çıkarabilir** ve vergi amortismanı yazabilir, ama muhasebe
  amortismanı yazamaz. Bkz. **G-V2**.
- **TenantAdmin** katalogu atlar; TenantUser ve TenantDeveloper için varsayılan **ret**tir. **İşleyicide rol denetimi yok**
  (her işleyici yalnız `TryIdentity` çalıştırır, `:650-655`). **Satır düzeyi süzgeç yok.**
- Eski ekran ayrıca `/api/hr/employees` (`erp.human-resources`), `/api/finance/general-ledger/accounts`
  (`erp.general-ledger`) ve `/api/screen-views/*` okur. **İlk yükleme `Promise.all`'dır** (`:259-279`): personel ya da
  hesap planı okuma izni olmayan kullanıcıda **bütün liste** açılmaz, yalnız hata görünür. Sistem sayfasında sorgular
  bağımsızdır; liste yine açılır, yalnız ilgili seçici boş kalır (iyileştirme, `fark`).
- İstemci hiçbir izin denetlemez; düğmeler gizlenmez, sunucu 403 döner. Sistem sayfasında katalog `allowed` bayrağı
  düğmeleri nedenli pasif gösterir (`fark`, olumlu).

### İdempotency ve eşzamanlılık

| Yazma | Tekrar koruması | Eşzamanlılık |
|---|---|---|
| Edinim `POST /` | yok; ikinci istek kod benzersizliğine takılır (409 "Bu firmada sabit kıymet kodu zaten kullanılıyor.", `:90-91`) | — |
| Edinim fişi | **kaynaklı:** aynı kıymetin fişi varsa 200 ile o fiş döner; yarışta `DbUpdateException` sonrası kazanan döner (`:141-148, 184-190`) | Serializable + firma satırı kilidi |
| Amortisman | dönem başına tek kayıt (409 "…zaten kaydedilmiş.", `:357-358`) + sıra kuralı | Serializable + firma kilidi + kıymet `RowVersion` (409 "Kıymet aynı anda güncellendi…") |
| Vergi amortismanı | kaynak kimliği SHA256(kıymet, ay) ile deterministik (`:639-643`); ikinci 409 | aynı |
| Elden çıkarma | **gövdede `idempotencyKey` (Guid, zorunlu)**. Aynı anahtar + aynı içerik → 200 + önceki kayıt; farklı içerik → 409 "Bu işlem anahtarı farklı bir elden çıkarma talebinde kullanılmış." (`:417-426`); yarışta kazanan döner (`:525-537`) | Serializable + firma kilidi + kıymet `RowVersion` |
| Zimmet | **yok**; açık zimmet varsa 409 (`:562-563`), ama denetim ile yazma arasında kilit yok → eşzamanlı iki istek iki açık zimmet yazabilir (kod çıkarımı) | — |
| İade | — | zimmet `rowVersion` zorunlu (base64, 8 bayt; 409 "Zimmet kaydı başka bir kullanıcı tarafından değiştirildi.") |

- Eski istemci elden çıkarma anahtarını durumda tutar, hatadan sonra yeniden dener ve **yalnız başarıda** temizler
  (`:650-671`; test `fixedAssetActions.test.tsx:127-147`). **Kusur:** pencere kapanınca ya da başka kıymet seçilince anahtar
  temizlenmez; A kıymetinde başarısız olup vazgeçen kullanıcı B kıymetini çıkarırsa aynı anahtar gider ve 409 alır. Sistem
  sayfasında `autoId` (`TenantCustomPage.tsx:717-729`) bunu karşılar; anahtarın pencere her açıldığında yenilendiği,
  aynı pencerede yeniden denemede **korunduğu** doğrulanmalı (G-V9).

### Kapalı dönem (mali yıl kapanışı) kuralı

Kilit `FiscalYearCloseEndpoints.FindClosedPeriodAsync` ile okunur (bkz. finans envanteri §0). Hata 409, gövde
`{error, fromDate, toDate}`. Duran varlıkta denetlenen tarihler:

| İşlem | Denetlenen tarih | Metin |
|---|---|---|
| Edinim kaydı (`POST /`) | **denetim yok** (yevmiye yazmaz) | — |
| Edinim fişi | edinim tarihi | "Edinim tarihi kapalı mali dönem içinde; yevmiye oluşturulmadı." |
| Amortisman | dönem sonu (ayın son günü) | "Amortisman dönemi kapalı mali dönem içinde; yevmiye oluşturulmadı." |
| Vergi amortismanı | dönem sonu | "Vergi amortisman dönemi kapalı mali dönem içinde; yevmiye oluşturulmadı." |
| Elden çıkarma | elden çıkarma tarihi | "Elden çıkarma tarihi kapalı mali dönem içinde; yevmiye oluşturulmadı." |
| Zimmet / iade | denetim yok | — |

Eski istemcinin özel işlemesi yok; metin hata şeridinde görünür. Sistem sayfası aynısını yapar; `fromDate`/`toDate`
gösterilmez (`fark` yok).

### Amortisman kuralları (sunucu)

- **Yöntem:** aylık doğrusal, kullanıma giriş ayını **izleyen** aydan başlar (`StraightLineMonthlyAfterInServiceMonth`,
  `:203, 225`). Aylık tutar = yuvarla2((maliyet − kalıntı) / ömür), en az 0,01; son ömür ayı kuruş farkını emer (`:219-222`).
- **Sıra zorunlu:** yalnız son kayıtlı dönemin bir sonraki ayı (ilk kayıtta ilk ay) yazılabilir (409 "Amortisman dönemleri
  sırayla kaydedilmelidir.", `:362-365`). Gelecek ay yazılamaz (en geç içinde bulunulan ay, `:355-356`). Yani **her an
  yazılabilecek tek bir dönem** vardır.
- Tamamen ayrılmışsa 409; gider ve birikmiş amortisman eşlemeleri **farklı ve etkin** olmalı (`:376-377`).
- Fiş kodu `FADEP-yyyyMM-{id8}`, tarih ayın son günü, `SourceType = FixedAssetDepreciation`. Kıymetin
  `AccumulatedDepreciationBase` alanı artar.
- **Vergi (VUK) amortismanı** ayrı bir defterdir: yalnız mali müşavir onaylı VUK profili varsa; vergi başlangıcını izleyen
  aydan; aylık = yuvarla2((maliyet − kalıntı) × oran / 100 / 12); sıra ve ömür sınırı aynı; ayrı eşlemeler
  (`fixed-assets.tax-*`); `isStatutoryFiling = false` (yasal beyan değildir, `:277-340`). Kıymetin birikmiş amortismanını
  **değiştirmez**.
- **Plan uçları** (`depreciation-schedule`, `tax-depreciation-schedule`) `through` (varsayılan bugün, en çok +20 yıl) tarihine
  kadar kayıtlı + planlanan satırları döndürür.

### Elden çıkarma kuralları (sunucu, `:404-539`)

- Tarih ≤ bugün ve ≥ kullanıma giriş; açıklama 1–500; tahsilat ≥ 0. Yalnız **Active** kıymet; ikinci kez çıkarılamaz.
- Elden çıkarma ayında ya da sonrasında kayıtlı amortisman varsa 409 ("Önce tarih sıralamasını düzeltin.").
- Defter değeri, **elden çıkarmadan önceki son tam aya kadar** plan üzerinden hesaplanır; kayıtlı amortisman plandan azsa
  fark **yetişme amortismanı** olarak aynı fişe yazılır. Kayıtlı amortisman planı aşıyorsa 409.
- Altı eşleme gerekir ve **hepsi farklı** olmalıdır (maliyet, birikmiş amortisman, gider, tahsilat, kâr, zarar). Eksikse 409
  + `requiredMappings`.
- Kıymet `Disposed` olur; **açık zimmet otomatik kapanır** (iade tarihi = elden çıkarma tarihi); zimmet teslim tarihi elden
  çıkarma tarihinden sonraysa 409.
- Fiş kodu `FADIS-yyyyMMdd-{id8}`, `SourceType = FixedAssetDisposal`.

### Ters kayıt

- Kıymet uçlarında **iptal, ters kayıt, silme yok**.
- Genel muhasebe ters kaydı da bu fişleri kabul etmez: `JournalReversalRules.ReversibleSourceTypes`
  (`src/Platform/AIERP.Platform.Application/GeneralLedgerRules.cs:14-18`) `FixedAsset*` türlerini içermez; `Program.cs:8219`
  409 "Bu kaynak türü ters kayıtla kapatılamaz." döner. Finans taslağı 22 "sabit kıymet fişleri kendi ekranından ters
  çevrilir" diyor; **böyle bir ekran yoktur**.
- Sonuç: yanlış ay, yanlış tutar ya da yanlış elden çıkarma bugün yalnız manuel yevmiye fişiyle düzeltilebilir ve bu
  durumda kıymet kaydı (birikmiş amortisman, durum) **defterle uyumsuz** kalır. Taşıma bunu değiştirmez; risk olarak not
  edilir ve onay pencereleri önerilir (K5). Ters kayıt API'si ayrı bir iştir (§6).

### Testler (bugün)

- Frontend: `fixed-assets/fixedAssetsList.test.tsx` (satır menüsü yok, İşlemler içeriği durumla değişir, Sil nedeni, Yeni →
  tam sayfa form, edinim gövdesi birebir) ve `fixed-assets/fixedAssetActions.test.tsx` (elden çıkarma gövdesi + anahtar
  yeniden kullanımı, zimmet, amortisman, iade, edinim fişi, vergi kaydı yalnız ilk planlanan satırda, kart sekmeleri / salt
  okunur / Esc / Vazgeç).
- Sunucu: `tests/IntegrationTests/FixedAsset{AcquisitionPosting,Depreciation,Disposal}IntegrationTests.cs`, SQL kabul
  testleri `FixedAsset{DepreciationFiscalClose,DisposalFiscalCloseRoute,FiscalClose}SqlAcceptanceTests.cs`.

---

## 1. Kıymet listesi (`fixed-assets`)

### 1.1 Yerleşim

- **Başlık** (`ListPageHeader`, `:2006-2015`): "Duran Varlıklar", açıklama "Edinim, amortisman, zimmet ve elden çıkarmaları
  tek kıymet kaydından yönetin.", sayaç = yüklenen kıymet sayısı ("kıymet"; ilk yüklemede boş).
- **Hata şeridi** yalnız pencere açık değilken görünür (`:2017-2021`); bildirim `role=status` (`:2022-2026`).
- **Özet kartları** (`:2028-2059`; ilk yüklemede "—"; ipucu "yüklenen kıymetler (ilk 200)"):

| Kart | Değer | Not |
|---|---|---|
| Edinim maliyeti | Σ maliyet, **elden çıkarılanlar dahil** | yüklenen ilk 200 kıymet |
| Birikmiş amortisman | Σ birikmiş | aynı |
| Net defter değeri | maliyet − birikmiş (**kalıntı değer düşülmez**) | aynı |
| Bu ay amortisman | etkin kıymetlerde doğrusal tahmin: 1 ≤ geçen ay ≤ ömür, matrah > 0, birikmiş < matrah olanların aylık tutarı (`:782-800`); ipucu "doğrusal tahmin · etkin kıymetler" | aynı |

- **Araç çubuğu** (`FixedAssetRegister.tsx:129-152`): arama "Kod, ad veya kategori" — **istemcide**, yerel küçük harfle alt
  dize (`:801-814`); durum çipleri Tümü / Etkin / Elden çıkarılan (sayaçlı; varsayılan Tümü); Yenile (yükleme/meşgulken
  etkisiz; seçili kıymet varsa ayrıntıları da yeniler, `:2068-2072`); ızgara araçları yuvası.
- **Izgara** (`AdvancedDataGrid`, `gridId fixed-assets-register`, ayarlar localStorage'da): satır seçimi yok, işaretleme var;
  toplu eylem "Excel (seçilenler)". Sütunlar görünümden, yoksa varsayılan listeden; `actions` düşer, **ad görünürse kod ayrı
  sütun olmaz** (adın altına "kod · kategori" yazılır, `Register.tsx:117-121, 228-234`).
  - **Varsayılan gizli sütunlar** (yalnız yerleşik düzende ve kayıtlı ızgara ayarı yokken bir kez tohumlanır,
    `Register.tsx:16-25, 40-55`): kategori, edinim tarihi, kalıntı, ömür, birikmiş, üç VUK sütunu. Görünenler: ad (+kod),
    kullanıma giriş, maliyet, net defter, durum. Sayfa boyutu 25 (istemci sayfalama).
  - Sütun başlıkları: kiracı etiketi katalog varsayılanıysa kısa ad ("Maliyet", "Net defter"); kiracı adları korunur
    (`:912-921`).
  - Biçim: tarih dd.MM.yyyy (yalnız tarih değerleri yerel tarih olarak çözülür, saat dilimi kayması yok, `:2306-2322`);
    para en az 2 ondalık; durum `StatusTag` Etkin `ok` / Elden çıkarıldı `off`; VUK boşsa "—".
  - Etkileşim: tık / ↑↓ current satır; çift tık / Enter kartı açar; Boşluk işaretler. **Satır menüsü yok** (test).
  - Boş durumlar: "Kıymetler yükleniyor…", "Filtreye uygun kıymet bulunamadı.", "Henüz kıymet kaydı yok. Yeni edinim ile ilk
    kaydı oluşturun." Görünüm isteği bitmeden ızgara hiç çizilmez.
  - Alt bilgi: "↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç"; 200 kayıtta "ilk 200 kayıt".
- **Sağ panel** (`:2097-2199`): boşken "Özetini görmek için bir kıymet seçin."; seçiliyken ad, "kod · kategori", ilerleme
  çubuğu "N / ömür ay" (N = min(ömür, yuvarla(birikmiş / aylık))), Maliyet, Aylık amortisman, Net defter, **Zimmet** (açık
  zimmetteki personel), **Bağlı fatura**; ipucu "Enter kıymet kartını açar · işlemler İşlemler'de (Alt+İ)."
- **İşlem çubuğu** (`:866-911`):

| Komut | Koşul / davranış |
|---|---|
| Yeni (birincil) | Edinim formunu tam sayfa açar |
| Aç | seçim yoksa "Önce bir kayıt seçin" |
| Sil | **her zaman pasif**: "Kıymet silinemez; İşlemler'den elden çıkarın." |
| İşlemler ▾ (Alt+İ) | yalnız seçili + Active + elden çıkarma kaydı yokken: **Amortismanı kaydet**, **Zimmetle**, **Elden çıkar** (meşgul / ayrıntı yükleniyor / ayrıntı hatası nedenli pasif); her zaman **CSV olarak dışa aktar** |

### 1.2 API çağrıları

| Çağrı | Ne zaman | Not |
|---|---|---|
| `GET /api/fixed-assets?page=1&pageSize=200` | açılış, Yenile, her yazmadan sonra | yanıt `{items, page, pageSize, totalCount}`; sıralama kıymet kodu; sunucu `q` (2–100 karakter) kabul eder ama istemci kullanmaz; **durum süzgeci yok** |
| `GET /api/hr/employees` | aynı, `Promise.all` | zimmet seçicisi; istemci `status ≠ Terminated` süzer |
| `GET /api/finance/general-ledger/accounts` | aynı | edinim karşı hesabı; istemci `isActive` süzer |
| `GET /api/fixed-assets/purchase-invoices` | aynı | yalnız Posted alış faturaları, tarih azalan |
| `GET /api/screen-views/{fixed-assets,fixed-asset-depreciation,fixed-asset-assignments}/active` | açılış | hata → varsayılan alanlar |
| `GET /{id}/depreciation-schedule`, `/assignments`, `/disposal` (**404 = elden çıkarılmamış**), `/acquisition-posting`, VUK varsa `/tax-depreciation-schedule` | seçim değişince, Yenile, yazmalardan sonra | panel ve pencereler bunlarla dolar |

**Tek kıymet okuma ucu yok** (`GET /{id}` tanımlı değil). Eski ekran listedeki satırı kullanır. Bkz. **G-V3**.

### 1.3 Kurallar

§0'daki amortisman, elden çıkarma ve zimmet kuralları. İstemciye özgü: İşlemler yalnız Active kıymette; Yenile sonrası seçim
kimlikle korunur, kıymet kaybolduysa temizlenir (`:284-288`).

### 1.4 Roller

§0 tablosu. Liste `read`; amortisman `execute`; zimmet `create`; elden çıkarma `create` (G-V2); iade `execute`. Zimmet
seçicisi ayrıca `erp.human-resources.read` ister.

### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `duranVarlik.*` işlemi ve rapor kaynağı yok** (`ErpOperation­Catalog.names.txt`). Modül sabiti
`DuranVarlikModule = "Duran Varlık"` eklenmeli. Yeni (önerilen; adlar kalıcıdır):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `duranVarlik.kiymet.listele` | GET `/api/fixed-assets` | query `q`, `status` (**yeni**, G-V5), `page`, `pageSize` | list `FixedAssetView`, `rowsPath items`, `metaPaths [page,pageSize,totalCount]` | `totalCount` adı motorla uyumlu (CRM G-R1 sorunu yok) |
| `duranVarlik.kiymet.getir` | GET `/api/fixed-assets/{id}` (**yeni uç**, G-V3) | route `id` | record: görünüm + `remainingBookValueBase`, `monthlyDepreciationBase`, `depreciatedMonths`, `currentAssignee`, `purchaseInvoiceCode`, `disposalId` | kartın ve pencerelerin kaynağı |
| `duranVarlik.kiymet.ozet` | GET `/api/fixed-assets/summary` (**yeni uç**, G-V6) | query `q`, `status` | record: `count`, `activeCount`, `disposedCount`, `acquisitionCostBase`, `accumulatedDepreciationBase`, `netBookValueBase`, `currentMonthDepreciationEstimateBase` | dört kart + çip sayaçları; "ilk 200" sınırı kalkar |
| `duranVarlik.kiymet.olustur` | POST `/api/fixed-assets` | body `FixedAssetCreateRequest` skalerleri (§2.5) | record `FixedAssetView` | `create` |
| `duranVarlik.alisFaturalari` | GET `/api/fixed-assets/purchase-invoices` | — | list (dizi kök) | edinim formu seçicisi |
| `duranVarlik.vukAltSinir` | GET `/api/fixed-assets/tax-limits/{taxYear}` | route `taxYear` (int) | record | 404 = o yıl için sınır yok (G-V10) |
| `duranVarlik.vukOmurKatalogu` | GET `/api/fixed-assets/vuk-useful-life-catalog` | query `q` | list, `rowsPath entries` | VUK profili seçicisi |
| `duranVarlik.edinim.muhasebe` | GET `/{id}/acquisition-posting` | route `id` | record (+ `lines` alt liste) | kart sekmesi |
| `duranVarlik.edinim.yevmiyele` | POST `/{id}/acquisition-posting` | route `id`; body `offsetAccountId` | record | `create`; kaynaklı tekrar koruması var |
| `duranVarlik.amortisman.plani` | GET `/{id}/depreciation-schedule` | route `id`, query `through` | list `rowsPath rows` + üst alanlar | kart sekmesi; **`nextPeriodStart` eklenmeli** (G-V7) |
| `duranVarlik.amortisman.kaydet` | POST `/{id}/depreciation-postings` | route `id`; body `periodStart` (date) | record | `execute` |
| `duranVarlik.vergiAmortismani.plani` | GET `/{id}/tax-depreciation-schedule` | route `id`, query `through` | list `rowsPath rows` | 409 = VUK profili yok (G-V10); `nextPeriodStart` eklenmeli |
| `duranVarlik.vergiAmortismani.kaydet` | POST `/{id}/tax-depreciation-postings` | route `id`; body `periodStart` | record | `create` (G-V2) |
| `duranVarlik.eldenCikarma.getir` | GET `/{id}/disposal` | route `id` | record | **404 normal durum** (G-V10) |
| `duranVarlik.eldenCikarma.kaydet` | POST `/{id}/disposals` | route `id`; body `disposalDate`, `reason`, `proceedsBase`, `idempotencyKey` (`autoId`) | record `FixedAssetDisposalView` | `create` (G-V2); onay penceresi önerilir (K5) |
| `duranVarlik.zimmet.listele` | GET `/{id}/assignments` | route `id` | list (dizi kök) | — |
| `duranVarlik.zimmet.ver` | POST `/{id}/assignments` | route `id`; body `employeeId`, `assignedDate`, `location`, `notes` | record | `create` |
| `duranVarlik.zimmet.iadeAl` | POST `/{id}/assignments/{assignmentId}/return` | route `id`, `assignmentId`; body `returnedDate`, `rowVersion` | record | `execute`; G-V8 |

Diğer modüllerden alınacak seçenek kaynakları (yeni `duranVarlik.*` adı açılmaz):

- Edinim karşı hesabı: `finans.muhasebe.hesap.listele` (var; etkin süzgeci finans oturumunun `fixedQuery`'siyle).
- Personel: **`ik.*` personel listesi** (İK oturumu çalışıyor; adı oradan gelir). İK standardı önce birleşmezse
  `duranVarlik.personelSecenekleri` (GET `/api/hr/employees`) geçici olarak açılmaz; bekleme önerilir (G-V11).
- Tedarikçi: bugün formda **yok** (`supplierAccountId: null` gönderilir). Taşınmaz.

### 1.6 Bileşen eşlemesi ve eksikler

Var: `recordHeader`/başlık + `titleCount`, `metric` (dört kart), `filterBar` (arama `q`, durum çipleri; seçimler satır içi
`formCard layout: inline` içinde — son QA dersi), `dataTable` (sunucu sayfalama, `valueLabels` durum, `toneMap`,
`money`/`date` biçimleri, boş metin), `contextPanel` (sağ özet; ilerleme `text` olarak), `actionBar` (Yeni → `page
@fixed-asset-create`; Aç → `page @fixed-asset-card` + `openParams id`; Sil nedenli pasif; `moreButtons`: üç iş akışı
`visibleWhen status == Active`, CSV), `dialog` (üç pencere), `alert`.

Eksikler:

- **G-V1 Menü anahtarı.** `fixed-assets` standart menü kataloğunda yok; `screenKey` olamaz. Yeni `fixed-asset-create`,
  `fixed-asset-card` anahtarları da `NavigablePageKeys`'e (`StandardMenuEndpoints.cs:29-30`) ya da kataloğa girmeli; frontend
  `workspace-storage.ts`, `WorkspacePageRouter.tsx`, `moduleMenus.ts` alt rota eşlemesi. **[ortak]**
- **G-V2 Eylem tutarsızlığı.** Elden çıkarma ve vergi amortismanı `create`, muhasebe amortismanı `execute`. Seçenekler: (a)
  `IsExecutionRoute` listesine `disposals`, `tax-depreciation-postings`, `acquisition-posting` eklemek — **var olan izin
  kurallarını değiştirir**, `create` Allow kuralı olan kullanıcı bu işlemleri kaybeder **[ortak]**; (b) `fark` olarak bırakmak,
  belgelemek. Öneri (b) v1, (a) ayrı güvenlik kararı.
- **G-V3 Tek kıymet ucu yok.** Kartın kaynağı, `sourceBacked` bağlamalar ve `openParams id` ile açılış için
  `GET /api/fixed-assets/{id}` gerekir. Hesaplanan alanlar burada verilir (G-V4). **[DV API]**
- **G-V4 Hesaplanan alanlar.** Net defter (maliyet − birikmiş), aylık amortisman, geçen ay / ilerleme, açık zimmet sahibi,
  bağlı fatura kodu bugün istemcide hesaplanır; bağlamalarda aritmetik yok (cari G-C7). Öneri: `FixedAssetView`'a
  `remainingBookValueBase`, `monthlyDepreciationBase`, `depreciatedMonths`, `currentAssignee`, `purchaseInvoiceCode`
  eklemek (eski ekranla aynı formüller; **kalıntı düşülmez**). Görünüm alanı `remainingBookValueBase` böylece gerçek alan
  olur. **[DV API]**
- **G-V5 Sunucu araması ve durum süzgeci.** Eski ekran 200 satırı çekip istemcide süzer. Sistem sayfası sunucu sayfalamasıyla
  çalışır: `status` parametresi yok; `q` en az 2 karakter (1 karakterde 400). Öneri: `status=Active|Disposed`, `q` tek
  karakterde süzmesin (400 yerine yok sayılsın) ya da arama kutusuna en az 2 karakter ipucu. **[DV API]**
- **G-V6 Özet kartları ve çip sayaçları.** Bugün ilk 200 kıymet üzerinden; sunucu sayfalamasında yalnız görünen sayfa olur.
  Öneri: `GET /summary` + `duranVarlik.kiymet.ozet`. **[DV API]**
- **G-V12 Ad altında kod.** `dataTable`'da iki satırlı hücre yok (CRM G-R11). `fark`: kod ayrı sütun.
- **G-V13 Varsayılan gizli sütunlar.** Tohumlanan gizli sütun listesi `dataTable` sütun `hidden` varsayılanıyla karşılanmalı;
  kullanıcı ızgara ayarlarının taşınması (localStorage `nexora.grid.fixed-assets-register`) yok. `fark`. **[standart]**
- **G-V14 Açıklamalı boş durum.** "Henüz kıymet kaydı yok. Yeni edinim ile ilk kaydı oluşturun." tek satır metin olarak.
  `fark` yok.

---

## 2. Edinim kaydı (`fixed-asset-create`, önerilen yeni anahtar)

### 2.1 Yerleşim

`ModuleRecordForm variant="page" mode="create"`; liste arkada çizilmez. Kaydet "Edinimi kaydet", **Kaydet ve Yeni** var
(`:936-938`), Vazgeç listeye döner. Durum satırı: "Önce kıymet bilgilerini, ardından maliyet ve muhasebe kaynağını girin.
Tutarlar firma baz para birimindedir."

| Bölüm | Alanlar |
|---|---|
| Kıymet bilgileri | Kıymet kodu* (≤40), Ad* (≤160), Kategori (serbest, ≤80) |
| Tarihler ve faydalı ömür | Edinim tarihi*, Kullanıma giriş*, Faydalı ömür (ay)* 1–1200 **varsayılan 60**; VUK alt sınırı bilgisi: "GİB VUK {yıl} amortisman alt sınırı: {tutar} TL (Tebliğ {no}). Bilgilendirme amaçlıdır; otomatik gider yazma kararı değildir." |
| Maliyet ve referans | Edinim maliyeti* ≥0,01, Kalıntı değer* ≥0 **varsayılan 0**, Kaynak referansı (≤120) |
| Muhasebe kaynağı | "Bağlı alış faturası (isteğe bağlı)" seçimi; boş seçenek "Fatura bağlantısı yok"; seçenek "kod · tarih · genel toplam" + " · yevmiye kayıtlı"; yardım "Fatura bağlandığında muhasebe kaynağı alış faturası olur; çift kayıt olmaması için ayrı edinim fişi engellenir." |
| İsteğe bağlı VUK vergi profili | Onay kutusu "Mali müşavir tarafından doğrulanmış VUK amortisman profili ekle"; açıkken GİB PDF bağlantılı bilgi, Tablo kodu (katalog önerili, ≤40), Kıymet sınıfı açıklaması (≤500), Tablo yılı 2004–2100, Tebliğ no 1–999, Vergi faydalı ömrü (ay) 1–1200, Normal amortisman oranı (%) 0,01–100, Vergi amortisman başlangıcı (≥ edinim tarihi), doğrulama onayı "Bu profili ve vergi başlangıç tarihini firma mali müşaviriyle doğruladım." — hepsi yalnız açıkken zorunlu |

### 2.2 API çağrıları

`POST /api/fixed-assets` (gövde `{assetCode, name, category|null, acquisitionDate, inServiceDate, acquisitionCostBase,
residualValueBase, usefulLifeMonths, sourceReference|null, supplierAccountId:null, purchaseInvoiceId|null}` + VUK açıkken yedi
VUK alanı; test `fixedAssetsList.test.tsx:134-137`), `GET /tax-limits/{yıl}` (edinim tarihi değişince; hata → bilgi yok),
`GET /vuk-useful-life-catalog` (VUK açılınca bir kez), `GET /purchase-invoices`.

### 2.3 Kurallar

- Sunucu: kod kırpılıp büyütülür, `A-Z a-z 0-9 - _ .`, firmada benzersiz; kullanıma giriş ≥ edinim; 0 < maliyet;
  0 ≤ kalıntı < maliyet; VUK alanları ya hep boş ya hep geçerli; bağlı fatura **Posted** olmalı. Tutarlar 2 haneye yuvarlanır;
  edinim yılının VUK alt sınırı kayda **kalıcı anlık görüntü** olarak yazılır (`:113-119`). Denetim olayı `fixed-asset.acquired`.
- İstemci: VUK açık ve doğrulama onayı işaretsizse "VUK profilini mali müşavirinizle doğruladığınızı onaylayın." ve gönderilmez.
- **Katalogdan otomatik doldurma** (`:482-494`): tablo kodu seçilince açıklama, tebliğ no, ömür (yıl × 12) ve oran dolar;
  **tablo yılı sabit "2026"** yazılır; başlangıç tarihi dolmaz.
- **Kaydet ve Yeni**'den sonra kalanlar: edinim ve kullanıma giriş tarihleri, kalıntı, ömür, VUK tablo yılı/tebliğ/ömür/oran/
  başlangıç; temizlenenler: kod, ad, kategori, maliyet, referans, fatura, VUK onayı ve kodu (`:547-556`). Toplu giriş için önemli.
- Başarı bildirimi: "Sabit kıymet edinimi kaydedildi. Muhasebe kaydı alış faturasındaysa faturayı bağlayın."
- **Edinim kaydı yevmiye yazmaz.** Fiş ayrıca kart › Edinim muhasebesi sekmesinden oluşturulur (§3).

### 2.4 Roller

`erp.fixed-assets.create`; fatura seçicisi aynı kaynaktan (`read`).

### 2.5 ERP işlem kataloğu

`duranVarlik.kiymet.olustur`, `duranVarlik.alisFaturalari`, `duranVarlik.vukAltSinir`, `duranVarlik.vukOmurKatalogu`.
`olustur` skalerleri: `assetCode`*, `name`*, `category`, `acquisitionDate`*, `inServiceDate`*, `acquisitionCostBase`*,
`residualValueBase`* (varsayılan 0), `usefulLifeMonths`* (varsayılan 60), `sourceReference`, `purchaseInvoiceId`,
`vukUsefulLifeCode`, `vukUsefulLifeDescription`, `vukUsefulLifeTableYear`, `vukUsefulLifeCommuniqueNumber`,
`vukUsefulLifeMonths`, `vukNormalDepreciationRatePercent`, `vukTaxDepreciationStartDate`. `supplierAccountId` açılmaz (bugün
formda yok).

### 2.6 Bileşen eşlemesi ve eksikler

Var: `recordHeader`, `formCard` + `section` (beş bölüm), `input` (metin, sayı, tarih), `select` (fatura; seçenek kaynağı sorgu),
`checkbox`, `alert`/`text` (bilgi), `actionBar` (Kaydet / Kaydet ve Yeni `saveAndNew` / Vazgeç; Ctrl+S, Ctrl+F2).

- **G-V15 VUK bölümünün koşullu zorunluluğu.** Bölüm `visibleWhen vukAcik == true`; alanların **yalnız görünürken zorunlu**
  olması gerekir. Gizli zorunlu alanın kaydı engelleyip engellemediği doğrulanmalı; engellerse alanlar zorunsuz yapılır ve
  doğrulamayı sunucu (hep-ya-hiç kuralı) üstlenir (`fark`: hata alan yerine şeritte). Doğrulama onay kutusu istemci kuralıdır;
  sistem sayfasında Kaydet `disabledWhen vukAcik && !vukOnay` + neden metni ile karşılanır. **[standart]**
- **G-V16 Katalogdan çoklu alan doldurma.** Bir seçimin dört alanı doldurması motorda yok (doğrulanmalı: `lookup` seçimi
  başka alanlara değer yazabiliyor mu). Seçenekler: (a) motora "seçimle alan doldur" (`fillOnSelect`) **[ortak]**; (b) `fark`:
  katalog satırı yalnız kodu doldurur, kullanıcı diğerlerini GİB tablosundan yazar; (c) sunucu, yalnız kod gönderildiğinde
  boş alanları katalogdan doldurur **[DV API]** — mali müşavir onayı anlamını zayıflatır, önerilmez. Öneri: (a) varsa (a), yoksa
  (b) ve VUK profili ilk sürümde nadir kullanıldığı için kabul edilebilir.
- **G-V17 Tablo yılı 2026 sabiti.** Eski ekranın kusuru; katalog yanıtı `version` taşır ama giriş başına yıl yok. Taşımada
  sabit kopyalanmaz: (a) ile doldurulursa sunucu katalog satırına `tableYear` eklemeli **[DV API]**; (b)'de kullanıcı yazar.
- **G-V18 VUK alt sınır bilgisi.** Edinim tarihi değişince `tax-limits/{yıl}` çağrısı: yol parametresi tarih alanının
  **yılı** olmalı; bağlamalarda `tarih.*` kapsamı var ama bir alanın yılını alma doğrulanmalı. Olmazsa `fark`: bilgi kayıttan
  sonra kartta (anlık görüntü zaten kayıtta) gösterilir. **[standart]**
- **G-V19 Kayıttan sonra kalan alanlar.** `saveAndNew`'in hangi alanları koruduğu tanımlanabiliyor mu doğrulanmalı; yoksa `fark`:
  form tamamen temizlenir (toplu girişte tarih ve ömür yeniden yazılır).

---

## 3. Kıymet kartı (`fixed-asset-card`, önerilen yeni anahtar)

### 3.1 Yerleşim

`RecordFormPage variant="page" mode="edit"`, **salt okunur**: Kaydet pasif, neden "Kıymet edinimden sonra düzenlenmez;
işlemler İşlemler menüsünde." (`:1456-1462`). Başlık ad; alt başlık kod, durum etiketi, kategori. Yan kutu: ilerleme
"N / ömür ay", Net defter, Zimmet, Bağlı fatura. İşlem çubuğu: Yenile, İşlemler (listeyle aynı üç iş akışı, CSV yok).
Ayrıntı hatası: "Seçili kıymetin ayrıntıları yüklenemedi. Yenile ile tekrar deneyin."

| Sekme | İçerik |
|---|---|
| **Genel** | Kimlik (kod, ad, kategori); Maliyet ve amortisman (edinim, kullanıma giriş, ömür, maliyet, "**Hurda değeri**" — formda "Kalıntı değer", etiket tutarsız; aylık amortisman, birikmiş, kaynak referansı); VUK profili yalnız varsa |
| **Amortisman tablosu** (sayaç = satır) | Muhasebe / VUK geçişi (VUK yalnız profil varsa). Muhasebe: Dönem (yyyy-MM), Tutar, Durum (Kaydedildi `ok` / Planlandı `info`), Yevmiye fişi ("—"); alt satırlar Birikmiş amortisman ve Net defter değeri; boş "Bu aralıkta kalan dönem yok." VUK: profil satırı, "Yalnızca tahmindir; yasal beyan veya vergi danışmanlığı değildir…", tablo Dönem / Tahmini tutar / Durum; **"Vergi kaydı oluştur" yalnız ilk kaydedilmemiş satırda** |
| **Edinim muhasebesi** | Fiş varsa fiş kimliği, tarih, satırlar "kod · ad — Borç/Alacak"; fatura bağlıysa "Muhasebe kaynağı alış faturası … ayrıca edinim fişi oluşturulmaz."; değilse "Edinim karşı hesabı"* seçimi + "Edinimi yevmiyeleştir" |
| **Zimmet geçmişi** (sayaç) | Personel (kalın), Teslim, İade, Konum; açık satırda "İade al"; boş "Henüz zimmet geçmişi yok." |
| **Elden çıkarma** | Çıkarıldıysa tarih, açıklama, tahsilat, defter değeri, kâr/zarar, yevmiye fişi; değilse "Elden çıkarılmadı. Elden çıkar: İşlemler (Alt+İ)." |

### 3.2 İş akışı pencereleri (liste ve kartta ortak)

| Pencere | Alanlar | Kaydet | Not |
|---|---|---|---|
| **Amortismanı kaydet** | "Kaydedilecek dönem"* (`type=month`), **varsayılan ilk planlanan dönem** | "Kaydet"; Active değilse pasif | "Aylık doğrusal tahmin kullanıma giriş ayını izleyen ay başlar; kayıt için defter eşleştirmeleri gerekir." |
| **Elden çıkarma kaydı** | Tarih* (**varsayılan bugün**), Tahsilat (baz)* ≥0 (**varsayılan 0**), Açıklama* ≤500 | "Elden çıkarmayı kaydet" | başarı: "Kıymet elden çıkarıldı. Defter değeri X, kâr/zarar Y. Elden çıkarma yevmiye fişi oluşturuldu."; alanlar başarıdan sonra **temizlenmez** |
| **Zimmet kaydı** | Personel* (aranabilir, "kod · ad", ayrılanlar hariç), Teslim tarihi* (varsayılan bugün), Konum ≤160 | "Zimmetle"; personel yoksa pasif | açık zimmet varsa sunucu 409 "Kıymetin açık bir zimmet kaydı var; önce iade alın." |
| **İade al** (satır düğmesi, pencere yok) | — (tarih **her zaman bugün**) | doğrudan gönderir | onay yok |

Pencere kabuğu: Esc ve arka plan tıklaması **meşgul değilken** kapatır; ilk alana odaklanır; açıkken sayfa hata şeridi
gizlenir, hata pencerenin içinde görünür.

### 3.3 Kurallar

§0. Edinim fişi: maliyet eşlemesi etkin olmalı, karşı hesap maliyet hesabından farklı ve etkin olmalı; fatura bağlıysa 409
(`requiresAccountingPolicyDecision`). Fiş kodu `FAACQ-{id12}`, tarih edinim tarihi. Yazmalardan sonra eski ekran listeyi ve
ayrıntıları yeniden yükler; elden çıkarmadan sonra planı **yenilemez** (kusur değil, plan artık kullanılmaz).

### 3.4 Roller

Kart `read`; sekme yazmaları §0 tablosu.

### 3.5 ERP işlem kataloğu

`duranVarlik.kiymet.getir`, `…edinim.muhasebe`, `…edinim.yevmiyele`, `…amortisman.plani`, `…amortisman.kaydet`,
`…vergiAmortismani.plani`, `…vergiAmortismani.kaydet`, `…eldenCikarma.getir`, `…eldenCikarma.kaydet`, `…zimmet.listele`,
`…zimmet.ver`, `…zimmet.iadeAl`; seçenekler `finans.muhasebe.hesap.listele` ve İK personel listesi.

### 3.6 Bileşen eşlemesi ve eksikler

Var: `recordHeader`, `tabs` (sayaç rozetleri), `formCard` salt okunur alanlar, `dataTable` (plan, zimmet), `card`/`text`,
`select` + `button` (edinim fişi), `dialog` (üç pencere), `actionBar`.

- **G-V7 Kaydedilecek dönem.** Motorda ay girişi (`month`) yok; ama sunucu sırayı zorladığı için **geçerli tek dönem** vardır.
  Öneri: plan yanıtına `nextPeriodStart` (ve vergi planına aynısı) eklemek; pencerede dönem salt okunur gösterilir ve gövdeye
  bağlanır (`{{plan.nextPeriodStart}}`). Serbest ay seçimi kalkar; kullanıcı zaten başka ay yazamıyordu. **[DV API]**
- **G-V8 İade yolu.** Yol `{assignmentId}` ister, zimmet satırının alanı `id`'dir; yol değeri kaynağın **aynı adlı** alanından
  gelir (finans G-F8). Parametre açık bağlanmalı: `assignmentId = {{zimmetler.seciliSatir.id}}`, `rowVersion =
  {{zimmetler.seciliSatir.rowVersion}}`, `returnedDate = {{tarih.bugun}}`. Satır içi "İade al" düğmesi yerine tablo seçimi +
  çubuk düğmesi `disabledWhen returnedDate != null` (son QA: `rowOpenAction` düğmesi üst düzeyde çizilmez). **[standart]**
- **G-V9 Elden çıkarma anahtarı.** `idempotencyKey` → `autoId: true`. Anahtarın ömrü (pencere açılışında yeni, aynı pencerede
  yeniden denemede aynı) doğrulanmalı; eski ekrandaki "başka kıymette eski anahtar" kusuru taşınmamalı. **[standart]**
- **G-V10 404/409'un normal durum olması.** `GET /disposal` elden çıkarılmamış kıymette 404, `tax-depreciation-schedule` VUK
  profili yoksa 409 döner; sorgu hata olarak çizilir (doğrulanmalı). Öneri: sorguları `runWhen` benzeri koşulla yalnız
  `status == Disposed` / `vukUsefulLifeCode != null` iken çalıştırmak; koşullu sorgu yoksa `getir` yanıtına `disposal` özetini
  gömmek (G-V3). `tax-limits/{yıl}` 404'ü de aynı sınıftadır. **[standart]** / **[DV API]**
- **G-V11 Personel seçicisi.** İK standardının personel listesi adına bağımlı; İK oturumu birleşmeden zimmet penceresi
  yayımlanmaz ya da geçici ad açılır (karar ana oturumda). Ayrılan personeli süzme sunucuda yapılmalı (`status` parametresi;
  bugün istemci süzer).
- **G-V20 "Vergi kaydı oluştur" yalnız ilk planlanan satırda.** Satır içi düğme yerine G-V7'deki `nextPeriodStart` ile çubuk
  düğmesi. `fark` (yerleşim).
- **G-V21 Plan alt satırları.** Birikmiş ve net defter tablo altında; `dataTable` `totals` toplama yapar ama "net defter"
  toplam değildir. Öneri: tablo üstünde iki `metric`/`text` (plan yanıtının üst alanlarından). `fark` (yerleşim).
- **G-V22 Edinim muhasebesi üç durumu.** Fiş var / fatura bağlı / ikisi de yok: üç bileşen, `visibleWhen` ile
  (`journalEntryId`, `purchaseInvoiceId`). Fiş satırları `lines` alt listesinden `rowsPath`. **[standart]**
- **G-V23 Etiket tutarlılığı.** "Hurda değeri" (kart) ↔ "Kalıntı değer" (form). Öneri: ikisi de "Kalıntı değer". `fark`.

---

## 4. Gereken `Labels` kodları ve kayıtlar

`Label()` etiketi olmayan her kod için açılışta hata verir. Yeni kodlar (var olanlar `id`, `code`, `name`, `q`, `page`,
`pageSize`, `rowVersion`, `status`, `totalCount`; diğer oturumların eklediği adlar birleştirme anında denetlenmeli):

`assetCode`, `category`, `acquisitionDate`, `inServiceDate`, `acquisitionCostBase`, `residualValueBase`, `usefulLifeMonths`,
`accumulatedDepreciationBase`, `remainingBookValueBase`, `monthlyDepreciationBase`, `depreciatedMonths`, `currentAssignee`,
`supplierAccountId`, `sourceReference`, `purchaseInvoiceId`, `purchaseInvoiceCode`, `vukTaxYear`, `vukDepreciationLowerLimitTry`,
`vukCommuniqueNumber`, `vukSourceUrl`, `vukUsefulLifeCode`, `vukUsefulLifeDescription`, `vukUsefulLifeTableYear`,
`vukUsefulLifeCommuniqueNumber`, `vukUsefulLifeMonths`, `vukNormalDepreciationRatePercent`, `vukTaxDepreciationStartDate`,
`taxYear`, `lowerLimitTry`, `communiqueNumber`, `advisory`, `usefulLifeYears`, `normalRatePercent`, `offsetAccountId`,
`journalEntryId`, `entryDate`, `debit`, `credit`, `accountCode`, `accountName`, `periodStart`, `periodEnd`, `amountBase`,
`isPosted`, `through`, `nextPeriodStart`, `disposalDate`, `reason`, `proceedsBase`, `idempotencyKey`,
`postedAccumulatedDepreciationBase`, `scheduleAccumulatedDepreciationBase`, `bookValueBase`, `gainLossBase`,
`scheduleThroughPeriod`, `accountingTreatment`, `employeeId`, `employee`, `assignedDate`, `returnedDate`, `location`, `notes`,
`assignmentId`, özet alanları (`activeCount`, `disposedCount`, `netBookValueBase`, `currentMonthDepreciationEstimateBase`).

`journalEntryId`, `periodStart`, `notes`, `reason`, `location`, `debit`, `credit` finans/satınalma/İK oturumlarında da
önerilmiş olabilir: yinelenen kod sessizce ezilir.

Güncellenecek kayıtlar: `ErpOperationCatalog.cs` (modül sabiti + ~19 işlem), `tests/IntegrationTests/ErpOperationCatalog.names.txt`,
yeni `system-pages/fixedAssetOperations.fixture.json`, `SystemPageStandards.versions.txt`, `system-pages/systemPageKeys.ts`,
`StandardMenuEndpoints.cs` (G-V1).

---

## 5. Kaybolması kolay eski davranışlar (denetim listesi)

1. İşlemler'deki üç iş akışının yalnız **Active ve elden çıkarılmamış** kıymette görünmesi; elden çıkarılmışta yalnız CSV.
2. Sil'in her zaman nedenli pasif olması: "Kıymet silinemez; İşlemler'den elden çıkarın."
3. Kartın salt okunur olması ve Kaydet nedeni.
4. **Net defter = maliyet − birikmiş** (kalıntı düşülmez) her yerde aynı formül.
5. "Bu ay amortisman" kartının yalnız etkin kıymetleri ve ömür içindeki ayı sayması.
6. Amortisman penceresinde dönemin **ilk planlanan dönemle** dolması (G-V7).
7. Elden çıkarma anahtarının hatadan sonra **aynı** kalması (çift fiş önlenir) ama başka kıymete taşınmaması (G-V9).
8. Elden çıkarmanın açık zimmeti kendiliğinden kapatması (sunucu; bildirimde söylenmez).
9. Edinim fişi sekmesinin fatura bağlıysa yazma yerine açıklama göstermesi.
10. Vergi kaydı düğmesinin yalnız ilk planlanan satırda olması; vergi kaydının kıymetin birikmiş amortismanını değiştirmemesi.
11. Kaydet ve Yeni'den sonra tarih, ömür, kalıntı ve VUK tablo alanlarının korunması (toplu giriş).
12. Edinim formunda ömür varsayılanı 60, kalıntı 0; elden çıkarmada tarih bugün, tahsilat 0; zimmette tarih bugün.
13. VUK doğrulama onayı olmadan kaydın gönderilmemesi ve onay metni.
14. VUK alt sınırı bilgisinin "bilgilendirme amaçlıdır" uyarısıyla gösterilmesi.
15. Ad sütunu görünürken kodun adın altına yazılması; varsayılan gizli sütunlar (G-V12, G-V13).
16. Tarihlerin saat dilimi kayması olmadan gösterilmesi (yalnız tarih değerleri yerel tarih).
17. Pencerelerin meşgulken Esc/arka planla kapanmaması.
18. Sunucu hata metinlerinin (kapalı dönem, eşleme eksik, sıra) olduğu gibi gösterilmesi; doğrulama başlığı "Girilen bilgileri
    kontrol edin." ile değiştirilmesi.
19. İngilizce arayüz metinleri (`locales/en/hr-assets.ts:41-135, 495-538`; G-M6 tek dil kısıtı).

## 6. Özet tablo, kararlar ve riskler

| Sayfa | Görünümler | Yeni işlem (v1) | Yeni sunucu işi | Başlıca eksikler |
|---|---|---|---|---|
| `fixed-assets` | liste, özet, panel, 3 pencere | `kiymet.listele`, `kiymet.ozet`, `kiymet.getir`, `amortisman.plani`, `amortisman.kaydet`, `eldenCikarma.kaydet`, `zimmet.ver`, `zimmet.listele` | `status` süzgeci, `/summary`, `GET /{id}`, hesaplanan alanlar, `nextPeriodStart` | **G-V1 menü**, G-V3–G-V7 |
| `fixed-asset-create` | edinim formu + VUK profili | `kiymet.olustur`, `alisFaturalari`, `vukAltSinir`, `vukOmurKatalogu` | (G-V17 isteğe bağlı) | G-V15–G-V19 |
| `fixed-asset-card` | 5 sekme + aynı pencereler + iade + vergi kaydı | `edinim.muhasebe`, `edinim.yevmiyele`, `vergiAmortismani.*`, `eldenCikarma.getir`, `zimmet.iadeAl` | aynı | G-V8, G-V10, G-V11, G-V20–G-V23 |

Toplam ~19 `duranVarlik.*` işlemi. Eksik kimlikleri: G-V1 menü anahtarı · G-V2 eylem tutarsızlığı · G-V3 tek kıymet ucu ·
G-V4 hesaplanan alanlar · G-V5 durum süzgeci ve 2 karakter · G-V6 özet ucu · G-V7 dönem seçimi · G-V8 iade yolu · G-V9
elden çıkarma anahtarı · G-V10 404/409 normal durumlar · G-V11 personel seçicisi · G-V12 kod alt satırı · G-V13 gizli
sütunlar · G-V14 boş durum · G-V15 koşullu zorunluluk · G-V16 katalogdan doldurma · G-V17 tablo yılı · G-V18 alt sınır
bilgisi · G-V19 Kaydet ve Yeni alanları · G-V20 vergi kaydı düğmesi · G-V21 plan alt satırları · G-V22 edinim muhasebesi
durumları · G-V23 etiket.

Nerede çözülür: **[DV API]** G-V3–G-V7, G-V10 (gömülü özet seçeneği), G-V17 — hepsi `FixedAssetEndpoints.cs`, başka modüle
dokunmaz. **[ortak]** G-V1 (menü/anahtar dosyaları), G-V2(a), G-V16(a), katalog `Labels` + modül sabiti + `names.txt` +
`systemPageKeys.ts` + `versions.txt`. **[standart]** G-V8, G-V9, G-V12–G-V15, G-V18–G-V23. **Bağımlılık:** G-V11 İK standardı.

### Kararlar (taslak 27'de)

- **K1 Sayfa bölünmesi.** Üç anahtar (`fixed-assets`, `fixed-asset-create`, `fixed-asset-card`) mı, tek anahtarda form/kart
  olarak mı? Öneri: üç anahtar (stok kartı ve CRM kalıbı); kart ayrı sekmede açılır (`fark`: bugün aynı sekmede).
- **K2 İşlem adları.** Öneri tek önek `duranVarlik.*`, alt gruplar `kiymet`, `edinim`, `amortisman`, `vergiAmortismani`,
  `eldenCikarma`, `zimmet`; modül sabiti "Duran Varlık".
- **K3 VUK vergi amortismanı v1'de mi?** Öneri: evet, kartta; ama katalogdan otomatik doldurma motorda yoksa (G-V16) VUK
  alanları elle yazılır.
- **K4 Toplu amortisman** (ay sonu tüm etkin kıymetler). Bugün yok; kullanıcı için en büyük zaman kazancı. Öneri: v1 dışı,
  ayrı sunucu işi (`POST /api/fixed-assets/depreciation-runs`, kıymet başına sonuç, idempotent dönem). Taslakta yalnız not.
- **K5 Onay pencereleri.** Bugün hiçbir yazmada onay yok ve hiçbiri geri alınamaz. Öneri: elden çıkarma, amortisman, vergi
  kaydı ve edinim fişinde `confirmEnabled` onayı ("Bu kayıt yevmiyeye yazılır ve arayüzden geri alınamaz."); zimmet/iade
  onaysız kalır.
- **K6 Sıra ve yayın.** Öneri: önce `[DV API]` eklemeleri + liste ve kart (`preview`, varsayılan eski ekran), sonra edinim
  formu; İK personel adı gelince zimmet. QA yalnız "QA Test Firma 20261117"; eşlemeler (`fixed-assets.*`) test firmasında
  önce tanımlanmalı.

### Riskler

- **Geri alınamaz kayıtlar.** Amortisman, vergi amortismanı, edinim fişi ve elden çıkarma için ters kayıt yolu yok; genel
  muhasebe ters kaydı da `FixedAsset*` türlerini reddeder. Yanlış kayıt kıymet ile defter arasında kalıcı uyumsuzluk bırakır.
  Sistem sayfası bu riski artırmamalı (K5); ters kayıt API'si ayrı iş.
- **İzin tutarsızlığı (G-V2).** Elden çıkarma (kalıcı, fiş yazan) `create` ile yapılabiliyor. Düzeltmek var olan kuralları
  değiştirir; ayrı karar.
- **Menü anahtarı (G-V1)** ortak dosyalara dokunur; diğer modüllerin PR'larıyla çakışır.
- **Ortak `Labels` çakışması.** Aynı kodlar birden çok oturumda; birleştirme sırası şart.
- **Zimmet yarışı.** Açık zimmet denetimi kilitsiz; iki eşzamanlı istek iki açık zimmet yazabilir. Taşıma değiştirmez;
  `[DV API]` küçük düzeltme (benzersiz filtreli dizin) ayrı iş.
- **Sunucu sayfalaması davranışı değiştirir.** Bugün arama istemcide ve tek harfle çalışır; sunucuda en az 2 karakter (G-V5).
- **Eşlemeler.** Test firmasında sekiz `fixed-assets.*` eşlemesi yoksa amortisman ve elden çıkarma 409 verir; QA önce
  Hesap Eşleştirmeleri ekranından tanımlamalı.
