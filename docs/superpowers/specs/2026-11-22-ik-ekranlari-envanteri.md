# İnsan Kaynakları ekranları: eşdeğerlik envanteri

Bu belge, İnsan Kaynakları (İK) modülünün yerleşik ekranlarından seçilenleri sistem sayfasına (standart tanım) taşımak
için girdidir. Bilgiler kod okunarak çıkarıldı (2026-11-22, `origin/master` `abd6b027`). Biçim ve terimler
`2026-11-21-cari-ekranlari-envanteri.md`, `2026-11-21-crm-ekranlari-envanteri.md` ve
`2026-11-21-finans-ekranlari-envanteri.md` ile aynıdır. Zarf ve yönlendirme kuralları `2026-11-18-sistem-sayfalari-design.md`
belgesindedir. `fark` kabul edilmiş davranış farkı, `eksik` taşımadan önce kapatılması gereken boşluk, `doğrulanmalı`
kod okumasıyla kesinleşmeyen nokta anlamına gelir. Her eksiğin sonunda **nerede çözüleceği** yazılıdır: `[standart]`
yalnız JSON tanımı, `[İK API]` yalnız `HumanResourcesEndpoints.cs`, `[ortak]` sayfa motoru ya da her modülün dokunduğu
katalog/menü dosyası (sıralama gerekir).

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir.
`PlatformPermissionCatalog.cs` `src/Platform/AIERP.Platform.Application/` altındadır. Dosya adı yazılmayan satır
numaraları frontend'de `HumanResourcesPage.tsx` (HRP), sunucuda `HumanResourcesEndpoints.cs` (HRE) içindir.

**Onay (2026-11-22):** Kullanıcı taslak 25'i ve on kararın hepsini önerildiği gibi onayladı: (1) yeni menü anahtarları
`hr-employees`, `hr-employee-create`, `hr-leave-requests`, `hr-attendance`, (`hr-period-summary`); bordro/ücret eski
`human-resources` ekranında "Bordro ve ücret" olarak kalır; (2) liste uçlarına eklemeli `q`/süzgeç/`page`/`pageSize`,
sayfa istenince `totalCount` zarfı; (3) `GET /employees/{id}`, `GET /attendance/{id}`, `canReview`, `canApprove`;
(4) Excel içe aktarma ve toplu düzenleme v1'de yok, eski ekranda kalır; (5) `requestedDays` boşsa sunucu takvim günü
yazar; (6) puantaj süresi v1'de dakika; (7) izin ve puantaj formları `saveAndNew`'lü pencerede, personel varsayılan boş,
kart ayrı sekmede; (8) notlar listede ve dışa aktarımda varsayılan gizli, ücret/bordro için `ik.*` işlemi açılmaz;
(9) Reddet isteğe bağlı not soran pencere, `ik.izin.onayla`/`ik.izin.reddet` sabit gövdeli; (10) sıra: bekleyen modül
PR'ları → tek İK PR'ı (API + 17 işlem + menü + dört standart, `preview`) → Dönem özeti → bordro ayrı envanter.
Uygulama, ortak dosyalar diğer modüllerle sıralanınca başlar.

## Kapsam ve seçim

İK bugün **tek bir ekran anahtarıdır**: `human-resources` (`WorkspacePageRouter.tsx:315-317`, `shell/moduleMenus.ts:94`,
`shell/railItems.ts:28`). Bütün iş, 6.770 satırlık `HumanResourcesPage.tsx` içinde yerel `useState<Section>` ile seçilen
sekmelerdedir (HRP:730, sekme listesi HRP:2667-2701). Alt rota ve derin bağlantı yoktur.

| Sekme | İçerik | Kim görür | Kullanım |
|---|---|---|---|
| `employees` Personel | liste, özet paneli, düzenleme formu, yeni kayıt penceresi, Excel içe aktarma, ızgarada toplu düzenleme | herkes (yönetici olmayan yalnız kendi kaydını görür) | **günlük** |
| `leave` İzinler | liste + yan "izin talebi" formu, onay/ret/iptal | herkes (self servis) | **günlük** |
| `attendance` Puantaj & fazla mesai | liste, panel, düzeltme formu, her zaman açık kayıt formu, onay | herkes görür, yazma yönetici | **günlük** |
| `report` Dönem özeti | tarih aralıklı özet + CSV | yalnız TenantAdmin | aylık |
| `compensation` Ücret kayıtları | brüt/net ücret, önceki işveren matrahı beyanı | `erp.payroll-compensation` yetkisi | dönemsel |
| `runs` Bordro taslakları | snapshot, önizleme, hesap, onay → kesinleştir, pusula/ZIP/yevmiye/1003A | yetkiye bağlı | aylık |
| `rules` Bordro kural setleri | vergi yılı kural JSON'u, 1003A işveren profili | yönetici | kurulum |
| `calendar` İşyeri ve takvim | işyeri ataması, işyeri takvimi, personel takvim istisnası | yönetici | kurulum |

**Seçim (4 + 1 ekran):** Kullanım verisi yok; seçim günlük kullanım, sayfa motoruna uygunluk ve kişisel veri riskine göre
yapıldı.

| # | Önerilen yeni ekran anahtarı | Eski sekme | Neden |
|---|---|---|---|
| A | `hr-employees` Personel listesi | `employees` | Modülün ana kaydı; diğer her ekranın personel seçicisi buradan beslenir. |
| B | `hr-employee-create` Personel kartı (yeni + düzenleme tek tanım) | `employees` (pencere + düzenleme formu) | Stok/CRM'deki "liste → kart sekmesi" kalıbı. |
| C | `hr-leave-requests` İzin talepleri | `leave` | En çok kullanıcıya dokunan ekran (self servis talep + yönetici onayı). |
| D | `hr-attendance` Puantaj | `attendance` | Günlük giriş; bordro blokajlarının (`attendance-approval-pending`, `attendance-days-missing`) kaynağı. |
| E (isteğe bağlı) | `hr-period-summary` Dönem özeti | `report` | Küçük, salt okunur; `runOn: "manual"` ile birebir taşınır. |

Bu adlar mevcut ekran görünümü anahtarlarıyla (`TenantScreenViewEndpoints.cs:23-24, 639-641`: `hr-employees`,
`hr-leave-requests`, `hr-attendance`) **aynıdır**; kiracının kayıtlı sütun görünümü aynı adla eşlenir (G-I14).

**Kapsam dışı (bu dalgada eski ekranda kalır):** Ücret kayıtları, Bordro taslakları, Bordro kural setleri, İşyeri ve
takvim. Gerekçe: (1) ham JSON alanları (kural seti, takvim haftası, matrah girdileri, snapshot/sonuç dökümleri) için
motorda düzenleyici yok; (2) 1003A düzenleyicisi yaklaşık 600 satır istemci doğrulaması ve kuruş düzeyinde mutabakat
içeriyor; (3) dosya indirmeleri (pusula HTML, ZIP, yevmiye CSV, 1003A XML, JSON şablonu yükleme) motorda yok; (4) üç kişilik
onay zinciri (oluşturan ≠ onaylayan ≠ kesinleştiren ≠ XML üreten); (5) **ücret tutarları** (KVKK, §0). Bordro ayrı bir
envanter ister (§6).

Ayrıca kodda **yok** (envanter için not): departman/pozisyon ana kaydı (departman, görev, çalışan kategorisi serbest
metin), avans, bordro parametre ekranı, puantaj içe aktarma, izin hakkı/bakiye takibi.

---

## 0. Ortak bilgiler

### Menü ve anahtarlar

- `human-resources` standart menü kataloğunda **yok** (`StandardMenuEndpoints.cs:13-25`; `PageKeys` = katalog sayfaları,
  `:25`). Sistem sayfası standardı yalnız `PageKeys` içindeki bir `screenKey` için kabul edilir
  (`SystemPages/SystemPageStandards.cs:204`). Bu yüzden A–E için **yeni menü anahtarları** gerekir: `StandardMenuEndpoints`
  kataloğu, `shell/moduleMenus.ts:94` (`pages`), `workspace-navigation.ts:58` başlıkları, `workspace-storage.ts:13`,
  `WorkspaceShellPage.tsx:39` (`standardListPages`), `WorkspacePageRouter.tsx`, `system-pages/systemPageKeys.ts`,
  `App.tsx:406` komut paleti **[ortak]** (G-I1).
- `TenantUserPreferenceEndpoints.cs:13` `human-resources`'ı çalışma alanı anahtarı olarak tutar; yeni anahtarlar eklenmeli
  ya da İK rayı `human-resources` altında gruplanmalı (doğrulanmalı).
- Eski ekran yerinde kalır: ücret/bordro/kural/takvim sekmeleri `human-resources` anahtarında yaşamaya devam eder.
  Önizleme döneminde eski ekranda Personel/İzin/Puantaj sekmeleri de görünür kalır (varsayılan eski ekran).
- Yeni standartlar sürüm 1 ve `preview` ile başlar.

### Yetki modeli

- Tek kaynak `erp.human-resources` → `/api/hr` (`PlatformPermissionCatalog.cs:55`); ücret için ayrı
  `erp.payroll-compensation` (`:56`, eylemleri yalnız `view/change/approve`, `:127-129`). **`hr.*` izin kodu yok**; `hr.*`
  yalnız denetim kaydı adlarıdır.
- Eylem yoldan çıkar: GET `read`, PUT `update`, POST son parça `review/approve/cancel/reject` ise `execute`, değilse `create`.
- **İkinci katman işleyicide:** `IsTenantAdmin` (HRE:2114) çoğu yazmayı yalnız TenantAdmin'e açar:
  personel oluştur/güncelle, izin onay/ret, puantaj kayıt/düzelt/onay, dönem özeti. İzin talebi ise **self servis**tir
  (kullanıcı kendi bağlı personeli için, HRE:189-226); izin iptali **yalnız talep eden** içindir (HRE:250-266).
- **Satır düzeyi süzgeç sunucudadır:** yönetici olmayan kullanıcı personel, izin ve puantaj listelerinde yalnız
  `UserId == kendisi` olan personelin satırlarını görür (HRE:113, 180, 268-276). Sistem sayfası buna bir şey eklemez.
- **Dört göz kuralı:** izni talep eden onaylayamaz (sunucu 409, HRE:228-248), puantajı kaydeden onaylayamaz (HRE:307-327).
  Eski ekran izinde bunu istemcide JWT `sub` ile `requestedByUserId` karşılaştırarak gösterir (HRP:339, 2573); puantajda hiç
  göstermez (G-I6).
- Katalogun `allowed` bayrağı yalnız rota iznini görür; işleyicideki "yalnız yönetici" denetimini görmez. Yönetici
  işlemleri `requiresTenantAdmin: true` ile tanımlanmalı (G-I5).

### Kişisel veri ve KVKK

- Personel kaydında **TC kimlik no, IBAN, SGK no, doğum tarihi, adres, telefon ve sağlık bilgisi alanı yoktur**
  (`Entities.cs:128` belge yorumu; HRP:2742 açıklaması). Bu bilinçli bir tasarım; sistem sayfası **yeni alan eklememeli**.
- Taşınan ekranlardaki hassas veriler:
  - **İzin türü "Sağlık"** (`Health`) ve serbest metin **izin notu / değerlendirme notu**: dolaylı sağlık verisi olabilir
    (KVKK özel nitelikli). Liste ve panelde maskelenmeden görünür; CSV dışa aktarmaya girer.
  - **İş e-postası**, **işe giriş / çıkış tarihi**, bağlı kullanıcı kimliği (GUID).
  - Puantaj notu (serbest metin).
- Ücret, matrah, bordro sonucu ve 1003A'daki TCKN **kapsam dışıdır** (eski ekranda kalır). Önemli sonuç: `ik.*` işlemleri
  kiracının Studio'sundaki ERP işlem kataloğunda **görünür olacak**; ücret uçları için işlem açılmaması bu yüzden de
  önerilir (bir kiracı geliştiricisi kendi sayfasına maaş sütunu koyamasın).
- Öneriler: (1) izin listesinde not sütunu varsayılan gizli, yalnız panelde; (2) "Sağlık" türü bugünkü gibi görünür
  (yönetici onayı için gerekli), ama dışa aktarmada not sütunu varsayılan dışı (G-I15) **[standart]**.
- Personel, izin ve puantaj **liste okumaları denetim kaydı yazmaz**; yalnız dönem özeti yazar (`hr.period-summary.viewed`).
  Dönem özeti bu yüzden `runOn: "manual"` olmalı (G-I12).

### Sayfalama, arama ve süzgeç (bugün)

- **Hiçbir İK liste ucu sayfalama, `q` ya da süzgeç almaz** (puantaj yalnız `from/to`, HRE:268). Sabit sınırlar:
  personel `Take(1000)` (HRE:113), izin `Take(500)` (HRE:181), puantaj `Take(500)` (HRE:276). `totalCount` yok.
- Eski ekran arama ve durum çiplerini **istemcide** uygular (`EmployeeFilters.tsx`, HRP:2551) ve sınıra takılınca
  "ilk N kayıt" uyarısı verir (`human-resources/hrList.tsx` `HrListFooter`).
- Sayfa motorunda istemci tarafı süzgeç yok; `filterBar` ve seçimler sorgu parametresine bağlanır (diğer standartlar,
  ör. `customers.json`). Bkz. **G-I2**.

### Eşzamanlılık ve idempotency

- Her PUT ve onay/ret/iptal gövdesi `rowVersion` (base64) ister (`TryDecodeRowVersion`, HRE:2128); uyuşmazlıkta 409.
- Kaynaklı yazma `rowVersion`'ı kaynak kayıttan taşır (`erpOperations.ts:236` `sourceRecordError` yorumu). Personel ve
  puantaj güncellemesi için **tek kayıt GET'i yok** (G-I3).
- Yazmalar idempotency anahtarı almaz. Çift gönderim: personelde kod benzersizliği 409, puantajda (personel, gün) benzersiz
  dizini 409, izinde çakışma denetimi 409 (serializable işlem, HRE:189-226). Doğal koruma yeterli.

### Testler (bugün)

- Frontend: `human-resources/hrDefinitions.test.tsx` (istek gövdeleri, F9 rapor, tanım onay/ret),
  `human-resources/hrFrame.test.tsx` (çerçeve, liste davranışı, izin paneli taslak uyarısı).
- Sunucu: `tests/IntegrationTests` altında İK entegrasyon testleri (doğrulanmalı: dosya adları). İşletim belgesi:
  `docs/human-resources-operations.md`.

---

## 1. Personel listesi (`hr-employees`)

### 1.1 Yerleşim (eski `employees` sekmesi)

- **Çerçeve:** `ListPageHeader` "İnsan kaynakları" + sekme açıklaması + sayaç (HRP:3216); sekme şeridi ←/→ ile gezilir ve
  Personel/İzin/Puantaj sayaç rozetleri taşır (HRP:3229-3262). Hata şeridi; "Tekrar dene" yalnız 5xx/ağ hatasında (HRP:304, 3264).
- **İşlem çubuğu** (`PageCommandsSlot`, HRP:3104-3138): Yenile, Yeni (F2, yalnız yönetici), Aç (Enter / çift tık), Sil
  (**her zaman pasif**, neden "Personel kaydı silinemez"), İşlemler (Alt+İ): CSV dışa aktar, Excel'den içe aktar (yönetici).
- **Süzgeç** (`components/EmployeeFilters.tsx`): arama (kod, ad, departman, görev, kategori; istemcide), durum çipleri
  Tümü / Aktif / Ayrıldı + sayaç. Varsayılan Tümü.
- **Izgara** (`components/EmployeeGrid.tsx`, `hrGridSelection`): onay kutusu, current satır, sütunlar `personnelCode`, `fullName`
  (kalın), `department`, `jobTitle`, `employmentCategory`, `status` etiketi. Toplu eylem "Excel (seçilenler)". Alt bilgi
  "Gösterilen x/y" + sınır uyarısı.
- **Ekran görünümü:** `GET /api/screen-views/hr-employees/active`; `actions` sütunu sabit (HRP:1110-1329, varsayılanlar HRP:632-670).
- **Özet paneli** (HRP:3141): kod, ad, durum, departman, görev, işe giriş.
- **Izgarada toplu düzenleme** (yönetici, HRP:2053-2106): yalnız kod, departman, görev, kategori; satır başına bir PUT.
- **Excel içe aktarma** (yönetici, HRP:1989-2052): başlık eşanlamlıları (tr/en), satırlar sırayla POST edilir, ilk hatada
  durur ve satır numarası + aktarılan sayıyı bildirir.

### 1.2 API çağrıları

| Çağrı | Ne zaman | Not |
|---|---|---|
| `GET /api/hr/employees/` | açılış, her yazmadan sonra (tam `reload()`, HRP:1027-1106, 1330) | parametresiz; yönetici tümü, diğerleri kendi kaydı; `Take(1000)` |
| `GET /api/screen-views/hr-employees/active` | açılış | sütun görünümü |
| `POST /api/hr/employees/` | içe aktarma | yeni kayıt (bkz. 2) |
| `PUT /api/hr/employees/{id}` | toplu düzenleme | tam gövde + `rowVersion` |

### 1.3 Kurallar

- Durum sunucuda **bugünden hesaplanır**: `terminationDate` doluysa ve geçmişteyse `Terminated`, değilse `Active`
  (`EmployeeView`, HRE:2150). `OnLeave` enum'da var (`Entities.cs:125`) ama **hiç yazılmaz**; etiket tablosunda olması
  ölü koddur (`hrStatus.tsx`).
- Personel silinemez; işten çıkış `terminationDate` ile yapılır.
- Sıralama sabit: `PersonnelCode` artan.

### 1.4 Roller

- TenantAdmin: tümü. TenantUser/Developer: `erp.human-resources.read` ile yalnız **kendi bağlı** personel kaydı (0–1 satır).
  Yeni, içe aktarma, toplu düzenleme yöneticiye özgü; eski ekran yönetici değilse bu düğmeleri gizler.

### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `ik.*` işlemi yok** (`ErpOperationCatalog.cs` modülleri: Stok, Depo, Raporlar, Üretim, Ayarlar, Satınalma,
Cari, Finans, CRM, Satış). Modül sabiti `IK` ("İnsan Kaynakları") eklenmeli **[ortak]**.

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `ik.personel.listele` | GET `/api/hr/employees` | query `q`, `status` (`Active`/`Terminated`), `department`, `page`, `pageSize` (**yeni parametreler**, G-I2) | list `EmployeeView`, `rowsPath: "items"`, `metaPaths ["page","pageSize","totalCount"]` | Geriye uyum: parametresiz çağrı bugünkü dizi yanıtını mı döndürür? Bkz. G-I2 |
| `ik.personel.getir` | GET `/api/hr/employees/{id}` (**yeni uç**) | route `id` | record `EmployeeView` | kart düzenlemesinin kaynağı (G-I3) |
| `ik.personel.ozet` | GET `/api/hr/employees/summary` (**yeni uç**, isteğe bağlı) | `q` | record `total`, `active`, `terminated` | çip sayaçları; yoksa `{{sorgu.satirSayisi}}` + `countWhen` yalnız yüklenen sayfayı sayar |

### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → `page @hr-employee-create`, `requiresTenantAdmin`; Aç → `page @hr-employee-create` + `openParams id`;
Sil yok; Yenile; CSV; `titleCount`), satır içi `formCard` (`layout: inline`) içinde arama + durum seçimi + departman
(yeni QA kuralı: seçimler formCard'da, `filterChips` yalnız etkin süzgeç çipleri), `filterChips`, `dataTable` (sunucu
sayfalama 50, `valueLabels`/`toneMap` durum, `date`), `contextPanel` (özet), `tabs` sayaç rozetleri.

Eksikler:

- **G-I1 Menü anahtarları.** `hr-employees`, `hr-employee-create`, `hr-leave-requests`, `hr-attendance`, (`hr-period-summary`)
  standart menü kataloğunda ve frontend menü/rota listelerinde yok. **[ortak]** — diğer modüllerle sıralanır; stok G-M7 ile aynı tür.
- **G-I2 Sayfalama, arama, süzgeç, `totalCount`.** Üç liste ucu da parametresiz ve sınırlı. Öneri: uçlara **ekleyerek**
  `q`, `status`, (izin: `leaveType`, `employeeId`, `from`, `to`; puantaj: `employeeId`, `approvalStatus`), `page`, `pageSize`
  eklenir; `page` verildiğinde yanıt `{items, page, pageSize, totalCount}` zarfına geçer, verilmediğinde bugünkü dizi döner
  (eski ekran ve AI asistanı `ERPAssistantHrTools.cs` etkilenmez) **[İK API]**. Alternatif `fark`: sınırlı liste, süzgeçsiz
  — kabul edilemez (1000 personelli firmada arama yok).
- **G-I3 Tek kayıt GET'i yok.** Personel, izin, puantaj için `GET /{id}` yok. Kaynaklı güncelleme (`sourceOperation`)
  kaynağı için `ik.personel.getir` ve `ik.puantaj.getir` gerekir **[İK API]**. (Liste satırını kaynak olarak kullanmak
  mümkün olabilir; `doğrulanmalı`. Yine de kart sekmesi `openParams id` ile açıldığı için tek kayıt ucu gerekir.)
- **G-I4 Excel içe aktarma ve ızgarada toplu düzenleme.** Motorda içe aktarma bileşeni ve düzenlenebilir liste ızgarası
  (editableGrid satır başına PUT) yok. Öneri: `fark` — v1'de yok; önizleme döneminde eski ekranda kalır (eski ekran varsayılan).
  Kalıcı çözüm ayrı motor işi **[ortak]**.
- **G-I13 Durum etiketi `OnLeave`.** Sunucu yazmıyor; `valueLabels`'a eklenmez **[standart]**.
- **G-I14 Görünüm eşlemesi.** `hr-employees` görünüm alanları (`TenantScreenViewEndpoints.cs` `HrEmployeeFields`) bire bir
  `dataTable` sütunlarına; `actions` aktarılmaz **[standart]**.

---

## 2. Personel kartı (`hr-employee-create`; yeni + düzenleme tek tanım)

### 2.1 Yerleşim (eski)

- **Yeni:** modal `<dialog>` (HRP:3508-3655), Esc kapatır (meşgul değilse), gövde kaydırması kilitli. Alanlar: Personel kodu*
  (40, odak), Ad soyad* (160), Departman (120), Görev (120), Çalışan kategorisi (80), İş e-postası (`type=email`), Bağlı kullanıcı
  (serbest **GUID metni**), İşe giriş* (tarih, varsayılan bugün). "Kaydet ve devam" niyeti + sıfırla.
- **Düzenleme:** Aç/Enter/çift tık (HRP:3343-3507); aynı alanlar + İşten çıkış tarihi ("boşsa aktif"); bağlı kullanıcı düzenlenemez.

### 2.2 API çağrıları

| Çağrı | Ne zaman |
|---|---|
| `POST /api/hr/employees/` `{personnelCode, fullName, department, jobTitle, employmentCategory, workEmail, hireDate, terminationDate:null, userId}` | yeni |
| `PUT /api/hr/employees/{id}` aynı gövde + `rowVersion` | düzenleme |

### 2.3 Kurallar (sunucu, `ValidateEmployee` HRE:1741)

- `personnelCode` zorunlu, ≤40, `^[A-Za-z0-9._-]+$`, sunucu büyük harfe çevirir; firmada benzersiz (409).
- `fullName` zorunlu ≤160; departman/görev ≤120, kategori ≤80 (serbest metin); `workEmail` geçerli e-posta ≤254.
- `hireDate` zorunlu; `terminationDate` ≥ `hireDate` (ayrıca DB denetimi, `PlatformDbContext.cs:933`).
- `userId` isteğe bağlı, `Guid.Empty` olamaz, firmada benzersiz (409).
- **Eski ekran kusuru:** düzenleme formu kayıt sonucu gelmeden kapanır (HRP:3379); hata olursa kullanıcı girdiğini kaybeder.
  Sistem sayfasında kayıt başarılı olunca dönülür; kusur kendiliğinden gider (`fark`, olumlu).

### 2.4 Roller

- Yalnız TenantAdmin (işleyici). Katalogda `requiresTenantAdmin: true`.

### 2.5 ERP işlem kataloğu

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `ik.personel.olustur` | POST `/api/hr/employees` | body `personnelCode`*, `fullName`*, `department`, `jobTitle`, `employmentCategory`, `workEmail`, `hireDate`*, `userId` | record (bugün `EmployeeView`, 201) | `requiresTenantAdmin` |
| `ik.personel.guncelle` | PUT `/api/hr/employees/{id}` | route `id`; aynı skalerler + `terminationDate`; `sourceBacked` (`rowVersion`, `userId` kaynaktan) | record `EmployeeView` | kaynak `ik.personel.getir`; tam yer değiştirme |

### 2.6 Bileşen eşlemesi ve eksikler

Var: `recordHeader` (yeni / düzenleme `visibleWhen`), `formCard` + `section` ("Kimlik", "Görev", "Çalışma"), `text`, `date`
(varsayılan `{{tarih.bugun}}`), `actionBar` (Kaydet Ctrl+S, `saveAndNew`, Vazgeç), `alert`.

Eksikler:

- **G-I7 Bağlı kullanıcı seçimi.** Bugün serbest GUID metni (kullanıcı dostu değil). Öneri: firma kullanıcıları için `lookup`
  (var olan bir kullanıcı listeleme işlemi varsa; `doğrulanmalı`), yoksa `fark`: alan yalnız düzenlemede salt okunur gösterilir,
  yeni kayıtta gizli (eski ekranda yine girilebilir) **[standart]**.
- **G-I8 Departman / görev serbest metin.** Ana kayıt yok, seçenek listesi yok. `fark`: metin alanı (bugünkü gibi). Ayrı iş:
  `/api/definitions/*` altında departman tanımı (kapsam dışı).
- **G-I9 İşten çıkış onayı.** Bugün tarih girilip kaydedilir, onay sorulmaz. Öneri: değişmez; yalnız ipucu "Doluysa kayıt
  'Ayrıldı' olur" **[standart]**.

---

## 3. İzin talepleri (`hr-leave-requests`)

### 3.1 Yerleşim (eski `leave` sekmesi)

- **Süzgeç:** arama (personel, departman, tür, tarih, durum; istemcide), durum çipleri Bekliyor / Onaylandı / Reddedildi / Tümü;
  **varsayılan "Bekliyor"** (HRP:756). İptal edilmiş için çip yok (yalnız Tümü'nde görünür).
- **Izgara:** personel (ad + altında "kod · departman"), izin türü, tarih aralığı (`startDate` sütununda "başlangıç – bitiş";
  `endDate` ayrı sütun değil, HRP:2541), talep edilen gün, durum. `Take(500)`.
- **Yan form** `#hr-leave-create` (HRP:3770-3899), herkese açık: Personel (yalnız **aktif** personel), İzin türü
  (Yıllık / Sağlık / Ücretsiz / Mazeret / Diğer; varsayılan Yıllık), Başlangıç* / Bitiş* (varsayılan bugün, bitiş `min=başlangıç`),
  canlı "N takvim günü" ipucu, Talep edilen gün (0,01 adım, en çok takvim günü), Not (1000). Ctrl+S veya "Talep et".
- **Satır seçilince** yan form yerine özet paneli gelir; kaydedilmemiş taslak varsa "Kaydedilmemiş izin talebi var — Yeni (F2)"
  uyarısı; Yeni formu geri getirip odaklar.
- **İşlemler** (HRP:2805-2854): Onayla / Reddet (yönetici, durum Bekliyor; kendi talebinde nedenli pasif "Başka bir yönetici
  onaylamalı"), İptal et (sunucu `canCancel` verirse). **Hiçbirinde onay penceresi yok.**

### 3.2 API çağrıları

| Çağrı | Ne zaman | Not |
|---|---|---|
| `GET /api/hr/leave-requests/` | açılış, yazmalardan sonra | `LeaveView{…, employee:"KOD · Ad", requestedByUserId, reviewedByUserId, reviewNote, rowVersion, canCancel}`, `Take(500)` |
| `GET /api/hr/employees/` | açılış | form seçicisi (aynı tam liste) |
| `POST /api/hr/leave-requests/` `{employeeId, leaveType, startDate, endDate, requestedDays, note}` | talep | 201 `{id, status}` (tam görünüm değil) |
| `POST /api/hr/leave-requests/{id}/review` `{approve, rowVersion}` | onay / ret | eski ekran `note` göndermez (sunucu kabul eder) |
| `POST /api/hr/leave-requests/{id}/cancel` `{rowVersion}` | iptal | |

### 3.3 Kurallar (sunucu, HRE:189-266)

- Tür ∈ Annual|Health|Unpaid|Excuse|Other; `endDate ≥ startDate`; `requestedDays` (0, 366] ve **takvim gün sayısını aşamaz**.
- Personel aktif olmalı ve iki tarih çalışma süresi içinde kalmalı.
- **Çakışma:** reddedilmemiş/iptal edilmemiş başka izinle çakışamaz (serializable; onayda yeniden denetlenir) → 409.
- **İzin hakkı / bakiye takibi yok**; iş günü hesabı yok (gün sayısı kullanıcıdan gelir).
- Onay/ret: yalnız yönetici, durum `Requested`, talep eden ≠ değerlendiren (409). İptal: yalnız talep eden, durum `Requested`.
- Durumlar: Requested "Bekliyor" (warn), Approved (ok), Rejected (bad), Cancelled (off) (`hrStatus.tsx`).
- **İstemci kuralı:** talep edilen gün, kullanıcı elle değiştirene kadar tarih aralığını izler (`daysTouched`) ve aralığa
  kıstırılır (HRP:2580). Personel yoksa / aktif değilse / aralık geçersizse "Talep et" pasif (HRP:2575).

### 3.4 Roller

- Talep: herkes kendi bağlı personeli için (`erp.human-resources.create`); yönetici herkes için. Yönetici olmayan için
  personel seçici yalnız kendi kaydını içerir (liste zaten süzülü).
- Onay/ret: TenantAdmin + `execute`. İptal: talep eden + `execute`.

### 3.5 ERP işlem kataloğu

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `ik.izin.listele` | GET `/api/hr/leave-requests` | query `q`, `status`, `leaveType`, `employeeId`, `from`, `to`, `page`, `pageSize` (G-I2) | list `LeaveView`, `items` + `totalCount` | varsayılan `status=Requested` sayfada verilir |
| `ik.izin.talepEt` | POST `/api/hr/leave-requests` | body `employeeId`*, `leaveType`*, `startDate`*, `endDate`*, `requestedDays`(G-I10), `note` | record `{id,status}` | self servis; `requiresTenantAdmin` **değil** |
| `ik.izin.onayla` | POST `/api/hr/leave-requests/{id}/review` | route `id`; `rowVersion` (kaynak satırdan), `note` | none/record | `fixedBody {approve:true}`, `requiresTenantAdmin` |
| `ik.izin.reddet` | POST aynı yol | route `id`; `rowVersion`, `note` | | `fixedBody {approve:false}`, `requiresTenantAdmin`; ret notu isteyen pencere (yeni, G-I11) |
| `ik.izin.iptal` | POST `/api/hr/leave-requests/{id}/cancel` | route `id`; `rowVersion` | | `visibleWhen canCancel` |

`approve` bool'u sabit gövdeyle iki ayrı ada bölündü (CRM kararı 6 ile aynı gerekçe: düğmeye yanlış değer bağlanma riski yok).

### 3.6 Bileşen eşlemesi ve eksikler

Var: satır içi `formCard` süzgeç (arama, durum seçimi varsayılan "Bekliyor", tür, tarih aralığı), `filterChips`, `dataTable`
(`valueLabels` tür/durum, `toneMap`), `contextPanel` (özet + not), `dialog` (izin talebi formu, `saveAndNew`),
`actionBar` (Yeni talep, Onayla, Reddet, İptal; `disabledWhen` + neden).

Eksikler:

- **G-I6 Kendi talebini onaylama göstergesi.** Eski ekran JWT `sub`'ı `requestedByUserId` ile karşılaştırır. Koşul dilinde
  oturum kullanıcısı kökü var mı `doğrulanmalı`; yoksa öneri: `LeaveView`'a `canReview` alanı (yönetici ∧ Requested ∧
  talep eden ≠ ben) ve `AttendanceView`'a `canApprove` (yönetici ∧ PendingApproval ∧ kaydeden ≠ ben), kural seti/ücretteki
  `canApprove` kalıbıyla aynı **[İK API]**. Sunucu zaten 409 ile korur; bu yalnız nedenli pasif düğme içindir.
- **G-I10 Gün sayısının tarih aralığını izlemesi.** Motorda alanlar arası aritmetik yok (cari G-C7). Seçenekler: (a) `requestedDays`
  isteğe bağlı olur, boşsa sunucu takvim gününü yazar **[İK API]**; (b) `fark`: kullanıcı elle girer, sunucu aşımı 400 ile reddeder.
  Öneri (a): en sık durum "tam gün aralık"tır; yarım gün için alan elle doldurulur. "N takvim günü" canlı ipucu kaybolur (`fark`).
- **G-I11 Ret notu ve onay penceresi.** Eski ekran onay/ret/iptalde soru sormaz, ret notu göndermez. Öneri: Reddet bir
  `dialog` açar (isteğe bağlı not → `reviewNote`); Onayla ve İptal onaysız kalır **[standart]**. `fark` (olumlu).
- **G-I15 Not ve sağlık türü (KVKK).** Not sütunu varsayılan gizli, yalnız panelde; CSV'de varsayılan dışı **[standart]**.
- **G-I16 Personel sütununun iki satırı.** "Ad + kod · departman" alt satırı `dataTable`'da yok (stok G-T2). `fark`: `employee`
  ("KOD · Ad") tek sütun + ayrı departman sütunu (departman `LeaveView`'da yok → G-I2 ile birlikte `department` eklenir **[İK API]**).
- **G-I17 Tarih aralığı tek hücrede.** `fark`: Başlangıç ve Bitiş ayrı sütun.
- **G-I18 Yan form ↔ panel taslak uyarısı.** Yan form yerine `dialog`; taslak uyarısı gereksizleşir (`fark`).

---

## 4. Puantaj (`hr-attendance`)

### 4.1 Yerleşim (eski `attendance` sekmesi)

- **Süzgeç:** arama, onay durumu çipleri Onay bekliyor / Onaylandı / **Reddedildi** (temizlenebilir, varsayılan tümü).
  Sunucuda puantaj **ret ucu yok** ve `Rejected` hiç yazılmaz (HRE:268-355); Reddedildi çipi hep boştur (ölü çip, G-I13).
- **Izgara:** personel, iş günü, çalışılan ve fazla mesai süreleri ("X sa Y dk"), not, onay durumu (eklenen sütun, HRP:2587). `Take(500)`.
- **Kayıt formu** `#hr-attendance-create` (yönetici, **her zaman açık**, HRP:4108-4204): Personel (tüm personel), İş günü
  (varsayılan bugün), Çalışılan dk (0–1440, varsayılan 480), Fazla mesai dk (0–1440, varsayılan 0), Not (1000).
  **Kusur:** personel seçimi izin formuyla aynı `employeeId` durumunu paylaşır ve açılışta ilk personele ayarlanır (HRP:1096).
- **Düzeltme** (Aç, yönetici): `PUT` personel salt okunur; form sonuç beklemeden kapanır (HRP:4035, kusur).
- **İşlemler › Onayla:** yönetici + `PendingApproval`.

### 4.2 API çağrıları

| Çağrı | Ne zaman | Not |
|---|---|---|
| `GET /api/hr/attendance/?from&to` | açılış (eski ekran tarih vermez) | `AttendanceView{…, recordedByUserId, approvalStatus, approvedByUserId, rowVersion}` |
| `POST /api/hr/attendance/` | kayıt | durum `PendingApproval` |
| `PUT /api/hr/attendance/{id}` `{employeeId, workDate, workedMinutes, overtimeMinutes, note, rowVersion}` | düzeltme | gövdedeki `employeeId` yok sayılır; **onayı sıfırlar** |
| `POST /api/hr/attendance/{id}/approve` `{rowVersion}` | onay | kaydeden ≠ onaylayan |

### 4.3 Kurallar

- Çalışılan + fazla mesai ≤ 1440 dk; ikisi de ≥ 0; iş günü çalışma süresi içinde; (personel, gün) benzersiz → 409.
- **Düzeltme onayı geri alır** (durum `PendingApproval`, onaylayan temizlenir). Kullanıcıya söylenmez; bordro taslağında
  `attendance-approval-pending` blokajı doğar.
- Dönem kapanış kilidi **yok** (bordro snapshot'ı veriyi dondurur).

### 4.4 Roller

- Okuma herkes (kendi satırları); kayıt, düzeltme, onay yalnız TenantAdmin.

### 4.5 ERP işlem kataloğu

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `ik.puantaj.listele` | GET `/api/hr/attendance` | query `from`, `to`, `employeeId`, `approvalStatus`, `q`, `page`, `pageSize` (G-I2) | list `AttendanceView` | varsayılan `from` = ayın 1'i (`{{tarih.ayBasi}}`, doğrulanmalı), `to` = bugün |
| `ik.puantaj.getir` | GET `/api/hr/attendance/{id}` (**yeni uç**) | route `id` | record | düzeltme kaynağı |
| `ik.puantaj.kaydet` | POST `/api/hr/attendance` | body `employeeId`*, `workDate`*, `workedMinutes`*, `overtimeMinutes`*, `note` | record | `requiresTenantAdmin`; varsayılan 480 / 0 sayfada |
| `ik.puantaj.duzelt` | PUT `/api/hr/attendance/{id}` | route `id`; `workDate`, `workedMinutes`, `overtimeMinutes`, `note`; `sourceBacked` | record | `requiresTenantAdmin`; onay metni "Düzeltme onayı geri alır" |
| `ik.puantaj.onayla` | POST `/api/hr/attendance/{id}/approve` | route `id`; `rowVersion` | record | `requiresTenantAdmin`; `canApprove` (G-I6) |

### 4.6 Bileşen eşlemesi ve eksikler

Var: süzgeç formCard (tarih aralığı, personel `lookup`, onay durumu), `dataTable`, `dialog` (kayıt, `saveAndNew`: günlük toplu
giriş için personel ve tarih korunur — `doğrulanmalı`), düzeltme `dialog` ya da kart, `actionBar`.

Eksikler:

- **G-I19 Süre biçimi "X sa Y dk".** Hücre biçimleri `text/number/money/date/datetime` (`cellFormat.ts`). Seçenekler: (a) motora
  `format: "minutes"` (dakikayı "8 sa 30 dk" yazar) **[ortak]**; (b) `fark`: sütun "dk" sayı. Öneri (b) v1, (a) sonra.
- **G-I20 Her zaman açık kayıt formu.** Eski ekranda form listenin yanında sürekli açık; günlük çok satır girişte hızlıdır.
  Öneri: `dialog` + `saveAndNew` (Ctrl+S sonrası form açık kalır) **[standart]**; `fark`: bir tık fazla.
- **G-I21 Ortak `employeeId` kusuru.** Taşınmaz; her form kendi seçicisini taşır (`fark`, olumlu). Varsayılan personel "ilk
  personel" yerine **boş** (yanlış kişiye puantaj yazma riskini kaldırır).
- **G-I22 Düzeltmenin onayı sıfırlaması.** Onay pencere metniyle görünür kılınır: "Kayıt yeniden onaya düşer." **[standart]**.

---

## 5. Dönem özeti (`hr-period-summary`, isteğe bağlı)

- **Yerleşim** (`components/HrPeriodReport.tsx`): parametre paneli (Başlangıç = ayın 1'i, Bitiş = bugün; Ctrl+. gizle/göster),
  yalnız istekle çalışır (F9 / düğme), "sonuç güncel değil" bayrağı; sonuç: gösterge tablosu (dönem sonu personel, puantaj kaydı,
  puantajı olan personel, çalışılan süre, fazla mesai, izin talebi, talep edilen gün) + izin durumu kırılımı (alt toplamlı).
- **API:** `GET /api/hr/period-summary?from&to` (yönetici, ≤366 gün, **her çağrı denetim kaydı yazar**);
  `GET /api/hr/period-summary.csv` (dosya).
- **İşlemler:** `ik.donemOzeti` (GET, `from`*, `to`*, record + `leaveStatuses` listesi `metaPaths`/ayrı sonuç; `requiresTenantAdmin`).
- **Eşleme:** `runOn: "manual"` (`finance-trial-balance.json` kalıbı), `metric` kartları, `dataTable` (`leaveStatuses`,
  `totals`).
- **Eksikler:** **G-I12** sorgu yalnız "Çalıştır"la (her açılışta denetim kaydı yazılmasın) **[standart]**; **G-I23** CSV dosya
  indirmesi motorda yok → `fark`: tablo CSV dışa aktarımı (aynı veri, farklı dosya adı/biçim); **G-I24** F9 kısayolu ve
  "güncel değil" bayrağı `doğrulanmalı` (finans mizanında nasıl çözüldüyse aynı).

---

## 6. Bordro ve ücret için not (sonraki dalga)

Bordro/ücret ekranları için ayrı envanter önerilir. Ön bulgular: üç kişilik onay (onaylayan ≠ kesinleştiren ≠ XML üreten);
snapshot ve hesap sonuçları değiştirilemez (`PlatformDbContext.cs:230-236`); yevmiyeye kayıt ve ters kayıt kapalı dönem
kilidine bağlı (`PayrollVoucherDraftEndpoints.cs:15, 172`); ücret uçları ayrı yetki kaynağı (`erp.payroll-compensation`) ve her
okuma denetlenir; `/compensation/employees` işleyicide `view`, katalogda `change` ister (`PlatformPermissionCatalog.cs:331`,
HRE:501) — tutarsızlık. Motor ihtiyaçları: JSON düzenleyici, dosya indirme/yükleme eylemi, çok adımlı onay zinciri.

---

## 7. Kaybolması kolay eski davranışlar (denetim listesi)

1. İzin listesinin **"Bekliyor"** süzgeciyle açılması.
2. Kendi izin talebinde Onayla/Reddet'in nedenli pasif olması ("Başka bir yönetici onaylamalı").
3. İptal'in yalnız `canCancel` doluyken görünmesi.
4. İzin formunda yalnız **aktif** personelin seçilebilmesi.
5. Gün sayısının tarih aralığını izlemesi ve aralığa kıstırılması (G-I10).
6. Puantaj varsayılanları 480 / 0 dk, iş günü bugün.
7. Puantaj düzeltmesinin onayı sıfırlaması (G-I22).
8. Personelde Sil'in her zaman nedenli pasif olması ("Personel kaydı silinemez").
9. Yönetici olmayanın yalnız kendi satırlarını görmesi (sunucuda; sayfa ek süzgeç koymamalı, boş liste metni buna uygun olmalı:
   "Kullanıcınıza bağlı personel kaydı yok").
10. "İlk N kayıt" sınır uyarısının sayfalamayla kalkması (G-I2).
11. Sekme sayaç rozetleri → her ayrı sayfada `titleCount`.
12. Hata şeridinde "Tekrar dene"nin yalnız 5xx'te çıkması.
13. Durum tonları: Aktif/Onaylandı yeşil, Bekliyor sarı, Reddedildi kırmızı, Ayrıldı/İptal gri.
14. Kısayollar: F2 Yeni, Enter/çift tık Aç, Ctrl+S kaydet, Alt+İ İşlemler, Esc pencere kapat, F9 rapor.
15. İngilizce arayüz (HRP:355-469 hata eşleme tablosu; G-M6 tek dil).
16. Dönem özetinin kendiliğinden çalışmaması (denetim kaydı).

## 8. Özet tablo

| Ekran | Var olan işlemler | Yeni işlem (v1) | Başlıca eksikler |
|---|---|---|---|
| Personel listesi | 0 | `ik.personel.listele`, `ik.personel.getir`, (`ik.personel.ozet`) | **G-I1 menü anahtarı**, **G-I2 sayfalama/arama**, G-I3, G-I4 içe aktarma |
| Personel kartı | — | `ik.personel.olustur`, `ik.personel.guncelle` | G-I3, G-I7 bağlı kullanıcı, G-I8 |
| İzin talepleri | — | `ik.izin.listele`, `talepEt`, `onayla`, `reddet`, `iptal` | G-I2, **G-I6 canReview**, G-I10 gün hesabı, G-I11, G-I15 KVKK |
| Puantaj | — | `ik.puantaj.listele`, `getir`, `kaydet`, `duzelt`, `onayla` | G-I2, G-I3, G-I6 canApprove, G-I19 süre biçimi, G-I20 |
| Dönem özeti (ops.) | — | `ik.donemOzeti` | G-I12 manual, G-I23 CSV |

Toplam 17 (+1 isteğe bağlı) `ik.*` işlemi; modül sabiti `IK`.

Eksik kimlikleri (tek liste): G-I1 menü anahtarları · G-I2 sayfalama/arama/süzgeç/`totalCount` · G-I3 tek kayıt GET'i ·
G-I4 Excel içe aktarma ve toplu düzenleme · G-I5 `requiresTenantAdmin` · G-I6 `canReview`/`canApprove` · G-I7 bağlı kullanıcı
seçici · G-I8 serbest metin departman/görev · G-I9 işten çıkış ipucu · G-I10 izin gün hesabı · G-I11 ret notu penceresi ·
G-I12 dönem özeti yalnız istekle · G-I13 ölü durumlar (`OnLeave`, puantaj `Rejected`) · G-I14 görünüm eşlemesi ·
G-I15 not/sağlık türü dışa aktarma · G-I16 personel iki satırı · G-I17 tarih aralığı sütunları · G-I18 taslak uyarısı ·
G-I19 süre biçimi · G-I20 kayıt formu yeri · G-I21 ortak `employeeId` kusuru · G-I22 düzeltme onayı sıfırlar ·
G-I23 rapor CSV dosyası · G-I24 F9 / güncel değil bayrağı.

Nerede çözülür: **[İK API]** G-I2, G-I3, G-I6, G-I10(a), G-I16 (`department` alanı) — hepsi eklemeli, eski ekran ve AI
asistanı etkilenmez. **[ortak]** G-I1 (menü/rota/`systemPageKeys`/`PageKeys`), katalog modül sabiti `IK` + yaklaşık 45 `Labels`
kodu (`personnelCode`, `fullName`, `department`, `jobTitle`, `employmentCategory`, `workEmail`, `hireDate`, `terminationDate`,
`userId`, `employeeId`, `employee`, `leaveType`, `startDate`, `endDate`, `requestedDays`, `requestedByUserId`, `reviewedByUserId`,
`reviewedAt`, `reviewNote`, `canCancel`, `canReview`, `workDate`, `workedMinutes`, `overtimeMinutes`, `recordedByUserId`,
`approvalStatus`, `approvedByUserId`, `approvedAt`, `canApprove`, `approve`, dönem özeti alanları …; `note`, `status`, `from`,
`to`, `totalCount` gibi kodların önceden var olup olmadığı birleştirme anında denetlenmeli), `names.txt`, `versions.txt`;
isteğe bağlı G-I4, G-I19(a). **[standart]** G-I5, G-I7–G-I9, G-I11–G-I15, G-I17, G-I18, G-I20–G-I22.

## 9. Önerilen sıra ve riskler

Önerilen sıra: (1) bekleyen modül PR'ları (#133–#136 vb.) birleşir, ortak dosyalar oturur → (2) tek İK PR'ı: İK API
eklemeleri (G-I2, G-I3, G-I6, G-I10, G-I16), `ik.*` katalog girdileri, menü anahtarları (G-I1), dört standart (`preview`,
varsayılan eski ekran) → (3) Dönem özeti aynı PR'a ya da hemen sonrasına → (4) bordro/ücret ayrı envanter.
QA yalnız "QA Test Firma 20261117"de; yönetici olmayan bir kullanıcıyla (kendi kaydı bağlı) ve iki ayrı yöneticiyle (dört göz).

Riskler:

- **Ortak dosya çakışması.** `ErpOperationCatalog.cs` `Labels`, `StandardMenuEndpoints.cs`, `moduleMenus.ts`,
  `systemPageKeys.ts`, `names.txt`, `versions.txt` tüm modül oturumlarının eklediği dosyalar; `note`, `status`, `employeeId`
  gibi kodlar başka oturumlarda da önerilebilir (yinelenen kod sessizce ezilir).
- **Yanıt zarfı değişimi (G-I2).** Liste uçları bugün düz dizi döndürür; zarfa geçiş yalnız `page` verildiğinde olmalı, yoksa
  eski ekran ve AI asistanı kırılır. Entegrasyon testi şart.
- **İşlem adları kalıcı.** `ik.izin.onayla/reddet` (sabit gövde) ve `ik.puantaj.kaydet/duzelt` adları 1. sürümden önce
  kesinleşmeli.
- **KVKK.** Sağlık türlü izin ve serbest notlar dışa aktarmayla dosyaya çıkar; ücret uçları için işlem açılmaması kiracı
  Studio'sunda maaş verisinin sayfalara taşınmasını önler. Bordro dalgasında ayrıca değerlendirilmeli.
- **Yetki farkı (olumlu).** Eski ekran izin onayında 403/409'u hata şeridinde gösterir; sistem sayfası `requiresTenantAdmin` ve
  `canReview` ile düğmeyi nedenli pasif gösterir. QA'da yalnız `read`+`create` hakkı olan TenantUser ile denenmeli.
- **Yarım taşıma.** Personel/İzin/Puantaj sistem sayfasına geçerken bordro eski ekranda kalır; kullanıcı iki yerde İK görür.
  Menü düzeni (karar 1) bunu açıkça göstermeli.
