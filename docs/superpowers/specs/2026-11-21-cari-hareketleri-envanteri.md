# B. Cari Hesap Hareketleri (`customer-ledger`): eşdeğerlik envanteri

Bu bölüm, yerleşik "Cari Hesap Hareketleri" ekranının sistem sayfasına (standart tanım) taşınması için girdidir. Bilgiler
kod okunarak çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Biçim ve terimler
`2026-11-19-stok-depo-ekranlari-envanteri.md` (özellikle §5 Stok Hareketleri) ve `2026-11-20-depo-transfer-envanteri.md`
ile aynıdır.

| Ekran anahtarı | Başlık | Eski bileşen |
|---|---|---|
| `customer-ledger` | Cari Hesap Hareketleri | `CustomerLedgerPage.tsx` (+ `customer-ledger-page.css`, test `customers/customerLedger.test.tsx`) |

Yönlendirici: `frontend/erp-web/src/WorkspacePageRouter.tsx:275-276` (`<CustomerLedgerPage token={token} />`; başka
özellik geçmez, yani başlangıç carisi verilemez). Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları
`src/Hosts/AIERP.Api/` altına göredir. `PlatformContracts.cs` ve `PlatformPermissionCatalog.cs`
`src/Platform/AIERP.Platform.Application/` altındadır.

## 0. Ortak bilgiler

### Menü ve anahtarlar

- `customer-ledger` standart menü kataloğunda **var** (`StandardMenuEndpoints.cs:14`, "Satış & cari"). Stok
  Hareketleri'nin menü anahtarı sorunu (G-M7) burada yoktur. Anahtar ayrıca `shell/moduleMenus.ts:62` ve
  `WorkspaceShellPage.tsx:39` (liste sayfaları kümesi) içinde geçer.
- Görünüm anahtarı ekran anahtarından **farklıdır**: `customer-ledger-entries`
  (`TenantScreenViewEndpoints.cs:16, 58-63, 647, 1001-1003`; ekran `CustomerLedgerPage.tsx:137` ile okur). Ayrıntı: §8.
- `SystemPages/Standards/` altında bu ekran için standart dosyası yok. Yeni standart sürüm 1 ve `preview` başlar.

### Ekranın niteliği

- Ekran **salt okunurdur**. Yalnız üç çağrı yapar: görünüm, cari arama, ekstre (§2.1). Elle hareket ekleme, ters kayıt,
  bakiye ve sayfalı hareket listesi **bu ekranda değil**, Cari Hesaplar ekranının hareket/mutabakat penceresindedir
  (`CustomersPage.tsx:1666-1684, 1811-1866`). Ekranın kendi açıklaması da bunu söyler (`CustomerLedgerPage.tsx:107-112`).
- Bu yüzden ilgili yazma uç noktaları ve kuralları aşağıda yalnız "ilgili, bu ekran çağırmıyor" olarak verilmiştir; işlem
  kataloğunda hangi önerinin bu ekrana, hangisinin cari kart / mutabakat envanterine ait olduğu ayrıca işaretlenmiştir.

### Yetki modeli

- `/api/customers` ile başlayan her yol `erp.customers` kaynağına çözülür (`PlatformPermissionCatalog.cs:51`). Eylem
  yoldan çıkar (`PlatformPermissionCatalog.cs:337-345`): GET → `read`; POST → son parça `IsExecutionRoute` listesindeyse
  `execute`, değilse `create`. `reverse` listededir (`:387-397`), yani `POST …/ledger/{entryId}/reverse` →
  `erp.customers.execute`; `POST …/ledger` → `erp.customers.create`. Beş eylem kataloğu: `:28`.
- **Satır görünürlüğü** iki yerden uygulanır:
  - Liste (`GET /api/customers/`) sorguyu `CustomerCollectionPermissionFilter.ApplyAsync` ile süzer (`Program.cs:1421-1423`).
    Kural öznitelikleri `resource.customerId / customerType / customerActive`'tir; desteklenmeyen öznitelik varsa liste
    boş döner (fail closed, `CustomerCollectionPermissionFilter.cs:36-39`). TenantAdmin süzgeci atlar (`:27`).
  - `{id}` rota değeri olan **GET** istekleri grup süzgecinden geçer (`Program.cs:1063`,
    `CustomerRowVisibilityEndpointFilter.cs:9-30`): görünmeyen cari için 404. Ekstre (`/statement`), `/ledger` (GET) ve
    `/balance` bu kapsamdadır; `/balance` ayrıca kendi içinde süzer (`CustomerBalanceEndpoints.cs:17-21`).
  - **POST istekleri satır süzgecinden geçmez** (`CustomerRowVisibilityEndpointFilter.cs:12-15`: GET değilse doğrudan
    `next`). Elle hareket ve ters kayıt uç noktaları cariyi yalnız firma kimliğiyle bulur (`Program.cs:1769, 1796`). Bu
    ekranı etkilemez; yazma işlemi kataloğa eklenirse risktir (G-H12).
- **TenantAdmin** izin kataloğunu atlar; **TenantUser** için varsayılan rettir, Allow kuralı gerekir, Deny kazanır
  (`PlatformPermissionAuthorizer.cs:53-76`, 11-19 belgesi §0).
- İlgili işleyicilerin **hiçbirinde rol denetimi yok** (`Program.cs:1718-1821`, `CustomerBalanceEndpoints.cs:11-26`).
  Katalogda `requiresTenantAdmin` gerekmez.
- İşlem kataloğunun `allowed` bayrağı yalnız rota iznini hesaplar (`ErpOperationCatalog.cs:562-590`); satır kurallarını
  yansıtmaz. Görünmeyen bir cari için ekstre 404 döner, sayfa bunu sorgu hatası olarak gösterir.

### İdempotency ve eşzamanlılık (ilgili yazmalar; bu ekran yazmaz)

- **Elle hareket (`POST …/ledger`) idempotency anahtarı almaz** (`CustomerLedgerWriteRequest`, `PlatformContracts.cs:47-48`).
  Çift gönderim iki hareket yazar. Eski pencere yalnız `busy` kilidine dayanır (`CustomersPage.tsx:1813-1838`).
- **Ters kayıt** çift kayda karşı korunur: işlem içinde özgün satır `UPDLOCK, HOLDLOCK` ile okunur, "daha önce ters
  çevrildi" denetlenir (`Program.cs:1796, 1805-1806`) ve `(TenantId, ReversalOfId)` benzersiz indeksi
  (`PlatformDbContext.cs:1291`) eşzamanlı ikinci denemeyi 409'a çevirir (`Program.cs:1817`).
- **rowVersion yok.** `CustomerLedgerEntry` varlığında sürüm alanı yoktur (`Domain/Entities.cs:837-866`); defter
  güncellenmediği için gerekmez. Her iki yazma da firma kayıt kilidini (`FiscalYearCloseEndpoints.LockTenantForPostingAsync`,
  `Program.cs:1765, 1795`) ve tek işlemi kullanır.

### Sayfa motoru, bugünkü durum (yalnız bu ekranı ilgilendirenler)

- Bileşen türleri artık `steps` ve `recordHeader`'ı da içerir (`TenantCustomPageSchema.cs:22`); `autoId`, `optionsWhen`,
  `clearsOnChange`, `minRows`, `promptText`, `promptMaxLength` eklendi (`:79-81`). Koşul dili `<, <=, >, >=` ve tarih
  karşılaştırmasını bilir (`custom-page/conditions.ts:5-6, 205-212`); `yol + n` yalnız **koşulda** gün ekler (`:195-203`).
- Şablonlar (`{{…}}`) yalnız yol çözer, ifade hesaplamaz (`custom-page/pageBindings.ts:36-39`). Kapsamda tarih kökü
  olarak yalnız `bugun` vardır (`TenantCustomPage.tsx:1777`); ay başı / yıl başı yoktur.
- Okuma sorgusu, işlemin `required` bildirdiği yol dışı bir parametre boşsa **gönderilmez**
  (`custom-page/erpOperations.ts:156-161`); eksik yol parametresinde de gönderilmez. Seçim yokken ekstre isteği gitmez.
- Sorgu bileşenleri `{{sorgu.meta.<alan>}}` ile `MetaPaths` değerlerine bağlanabilir (`custom-page/usePageQueries.ts:22-23`).
- Sayfasız (`paging` verilmemiş) tablo tüm satırları çizer; `limit` isteğe bağlıdır (`TenantCustomPage.tsx:508`). Görünen
  sütun üst sınırı 20'dir (`:506`). `totals` çizilen satırların sütun toplamını verir (`:507, 572`).
- `footerMeta`, `pageSize`, `searchInput` yalnız `paging: "server"` tabloda kullanılabilir
  (`TenantCustomPageSchema.cs:1212, 1376-1385`).
- Gösterge (`metric`) bağlı değeri `format: number|money` ile yazar (`TenantCustomPage.tsx:1003-1010`); kayıt özeti
  (`recordHeader`) en fazla 6 alan, `fieldFormats` `number|money|date|text`, `fieldUnits` şablon alır
  (`TenantCustomPageSchema.cs:1763-1770, 1817-1847`). `text` bileşeni sayıyı biçimlemez (yalnız `interpolate`).
- `lookup` girişinde sunucu araması, seçenek sorgusunun bir parametresi `{{<girişAdı>.search}}` ile bağlandığında açılır
  (`TenantCustomPage.tsx:2176`); en fazla 50 seçenek çizilir (`custom-page/LookupInput.tsx:9`).
- Giriş `min`/`max` değerleri sabittir, bağlanamaz (`BindableProps`'ta yok: `TenantCustomPageSchema.cs:126-127`;
  çizim `TenantCustomPage.tsx:813-840`).

### Testler (bugün)

- Ön yüz: `customers/customerLedger.test.tsx` (dönem çipleri `:59-64`, devir/ara toplam/kapanış ve B/A gösterimi `:66-81`,
  yabancı döviz `:83-90`, ters kayıt işaretleri `:92-100`, çip → yeniden yükleme `:102-112`, İngilizce metinler `:115-128`).
- Sunucu: `/statement` için entegrasyon testi **bulunamadı** (`tests/` altında `customers/…/statement` çağrısı yok).
  `/balance` satır görünürlüğü `CustomerBalanceIntegrationTests.cs:28-107` ile kapsanır. Elle hareket ve ters kaydın kapalı
  dönem reddi `SqlServerReturnLocationAcceptanceTests.cs:147-185` (SQL kabul, varsayılan atlanır) içindedir. Taşıma
  ekstreye dayanacağından açılış bakiyesi, sıra, koşan bakiye, `hasReversal` ve 404 (satır görünürlüğü) için test önerilir.

---

## 1. Yerleşim

### 1.1 Başlık, şeritler ve özet kartları

- **Başlık:** "Cari Hesap Hareketleri", açıklama "Cari hesabı seçerek tarih aralığındaki borç ve alacak hareketlerini
  inceleyin.", sayaç = ekstre satır sayısı + "hareket"; ekstre yokken sayaç yok (`CustomerLedgerPage.tsx:229-234`).
- **Hata şeridi:** API hatası (`:356`); ayrıca istemci denetimi "Bitiş tarihi başlangıç tarihinden önce olamaz." (`:357`).
- **Özet kartları** (yalnız ekstre yüklüyken, `:235-268`):

| Kart | Değer | İpucu |
|---|---|---|
| Açılış bakiyesi | `openingBalance`, mutlak değer + B/A + döviz | "{from − 1 gün} itibarıyla" (tarih istemcide hesaplanır, `:219-223`) |
| Dönem borç | `debitTotal` + döviz | "ters kayıt dahil" |
| Dönem alacak | `creditTotal` + döviz | "ters kayıt dahil" |
| Kapanış bakiyesi | `closingBalance`, mutlak + B/A + döviz | "{to} itibarıyla" |

### 1.2 İşlem çubuğu

| Komut | Kısayol | Davranış |
|---|---|---|
| Dışa aktar (Excel) | Ctrl+E | ızgaranın Excel'i (`:227`, `exportActionsRef`) |
| Diğer → CSV dışa aktar | | yalnız ekstre yüklüyken (`:228`, `csvExportCommand`) |
| Yenile | | araç çubuğunda; `reloadKey` artırır, ekstreyi yeniden çeker (`:270`) |

Yeni / Aç / Kaydet / Sil / Yazdır yoktur. Ekstre için yazdırma, PDF ya da "ekstre gönder" **yoktur**.

### 1.3 Süzgeçler (araç çubuğu, `:270-354`)

| Süzgeç | Tür | Davranış |
|---|---|---|
| Cari hesap | açılır seçici (düğme + arama kutusu + liste) | Arama 200 ms gecikmeyle sunucuda: `q`, `page=1`, `pageSize=100` (`:158-176`). Tüm türler (müşteri, tedarikçi, ikisi) ve **pasifler de** listelenir; pasifte "Pasif" etiketi (`:322`). Seçenek metni "kod · ad". Esc ve dışarı tıklama kapatır (`:147-156, 298-303`). |
| Dönem | çip grubu: Bu ay / Son 3 ay / Yıl başından | Yalnız tarih aralığını ayarlar (`periodRange`, `:39-44`): ay başı–bugün; bugünden **3 takvim ayı** önce–bugün; 1 Ocak–bugün. Aralık bir çiple eşleşirse çip basılı görünür (`:212-215`). |
| Başlangıç tarihi | `date` | varsayılan yıl başı (`:118`); `max = bitiş` (`:348`) |
| Bitiş tarihi | `date` | varsayılan bugün (`:119`); `min = başlangıç` (`:352`) |

Ekstre isteği yalnız cari seçili, iki tarih dolu ve `to >= from` iken gider (`:180-184`); eski yanıtlar `active` bayrağıyla
atılır (`:178-207`).

### 1.4 Ekstre gövdesi (`:359-450`)

- **Başlık satırı:** "Hesap hareketleri", cari kodu (mono), cari adı, "{from} – {to} · {döviz}", yüklenirken
  "Güncelleniyor…"; satırlardan biri hesap dövizinden farklıysa uyarı "Farklı dövizli hareket var; toplamlar ve bakiye
  dövize göre ayrıştırılmaz" (`:362-373`).
- **Devir satırı** (ızgaranın üstünde): "Devir — açılış bakiyesi · {from − 1} itibarıyla" + B/A'lı tutar (`:374-379`).
- **Izgara** (`AdvancedDataGrid`, `gridId` `customer-ledger-entries`, sayfalama dış, arama ve satır seçimi kapalı,
  `:380-417`). Sütunlar görünümden gelir (`:20-28`, `:135-145`):

| Alan anahtarı | Etiket | Gösterim |
|---|---|---|
| `entryDate` | Tarih | `tr-TR` tarih |
| `description` | Açıklama | metin; ters kayıtsa önde "↳" ve "Ters kayıt" etiketi (info); ters çevrilmişse "Ters çevrildi" etiketi (off) (`:83-91`) |
| `direction` | Yön | Borç / Alacak |
| `debit` | Borç | yalnız Debit satırda tutar; satır dövizi hesap dövizinden farklıysa yanında kodu (`:70-77, 94-95`) |
| `credit` | Alacak | aynı kural, Credit satırda |
| `balance` | Bakiye | sunucunun koşan bakiyesi, mutlak + "B" (borç) / "A" (alacak); sıfırda yalnız 0,00 (`:52-62`) |
| `currencyCode` | Döviz | varsayılan **gizli** |

  Satır sınıfları: ters kayıt `cl-is-reversal`, ters çevrilmiş `cl-is-reversed` (üstü çizili görünüm,
  `customer-ledger-page.css`). Ters kayıt `reversalOfId || isReversal` ile tanınır (`:64`); ekstre DTO'sunda `isReversal`
  **yoktur** (bkz. §2.3), bu yüzden fiilen `reversalOfId` belirler.
  Boş durum: "Seçilen tarih aralığında hareket bulunmuyor." (`:415`).
- **Dönem toplamı satırı:** "N hareket (ters kayıt dahil)" (ters kayıt varsa), Borç `debitTotal`, Alacak `creditTotal`,
  Net `debitTotal − creditTotal` (işaretli, `+` önekli) (`:418-435`).
- **Kapanış satırı:** "Kapanış bakiyesi · {to}" + B/A'lı tutar + döviz (`:436-441`).
- **Alt bilgi:** ipucu "B borç bakiyesi · A alacak bakiyesi · Ters kayıt orijinal hareketin karşı kaydıdır, hareketler
  silinmez" + Açılış / Dönem borç / Dönem alacak / Kapanış özeti (`:443-449`).
- **Yer tutucu** (ekstre yokken, `:451-457`): "Cari ekstre görünümüne başlayın" + "Cari hesap seç" düğmesi; seçim varsa
  "Cari hesap hareketleri yükleniyor…" ya da "Hareketler görüntülenemedi." ve "kod · ad".

### 1.5 Döviz

- Ekstre **kur çevrimi yapmaz**: tutarlar dövizine bakılmadan toplanır ve hesabın dövizi ile etiketlenir
  (`Program.cs:1724-1740`). Fatura kaynaklı hareketler fatura dövizini taşır (ör. `Program.cs:4566-4568, 6926-6928`), elle
  hareket ise cari dövizinde olmak zorundadır (`Program.cs:1772-1773`). Yani karışık dövizli hesapta açılış, toplamlar ve
  bakiye anlamsızdır; eski ekran bunu yalnız uyarıyla belirtir.
- CLAUDE.md'deki "son elle girilen firma kuru" kuralı bu ekranda **uygulanmaz**; bu bir taşıma kararı değil, mevcut durumdur.

### 1.6 Dil

- Metinler `localizedUiText` sözlüğüyle İngilizceye çevrilir (testi `customerLedger.test.tsx:115-128`). Sistem sayfası
  metinleri tek dildir.

---

## 2. API çağrıları

### 2.1 Bu ekranın çağırdıkları

| Ne zaman | Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|---|
| Açılış | `GET /api/screen-views/customer-ledger-entries/active` | — | `erp.screen-views.read` | hata yutulur (`CustomerLedgerPage.tsx:137-141`) |
| Açılış, seçici araması (200 ms) | `GET /api/customers/?q&page=1&pageSize=100` | `q` (kod, ad, vergi no içinde, `Program.cs:1425-1429`) | `erp.customers.read` + satır süzgeci | `Program.cs:1415-1451`; `type`, `status` parametreleri var ama ekran göndermez; sıra ad, kod; `pageSize` 1–100 |
| Cari + geçerli aralık | `GET /api/customers/{id}/statement?from&to` | `from`, `to` (`DateOnly`, **zorunlu**) | `erp.customers.read` + `RequireVisibleCustomerRows` | `Program.cs:1718-1744`; sayfasız, aralıktaki tüm satırlar tek yanıtta |

### 2.2 İlgili, bu ekran çağırmıyor (Cari Hesaplar penceresi)

| Yöntem ve yol | Parametre / gövde | İzin | Not |
|---|---|---|---|
| `GET /api/customers/{id}/ledger` | `from?`, `to?`, `page`, `pageSize` (1–100) | `erp.customers.read` + satır süzgeci | `Program.cs:1745-1758`; **azalan** sıra, koşan bakiye yok, `isReversal` var |
| `GET /api/customers/{id}/balance` | — | `erp.customers.read` + satır süzgeci | `CustomerBalanceEndpoints.cs:11-26`; tüm zamanlar, `balanceSide` Debit/Credit/Balanced, `riskLimit` |
| `POST /api/customers/{id}/ledger` | `entryDate`, `direction` (Debit/Credit), `amount`, `currencyCode`, `description` | `erp.customers.create` | `Program.cs:1759-1788`; 201 + `CustomerLedgerView`; satır süzgeci yok |
| `POST /api/customers/{id}/ledger/{entryId}/reverse` | `reason` | `erp.customers.execute` | `Program.cs:1789-1821`; 201 + ters kaydın `CustomerLedgerView`'u; satır süzgeci yok |
| `POST /api/reports/run` (`source: customerLedgerEntries`) | rapor gövdesi | rapor izni + `erp.customers.read` | `ReportEndpoints.cs:374, 724, 889`; katalogda `rapor.customerLedgerEntries` |

Defter için PUT/DELETE uç noktası **yoktur** (append-only).

### 2.3 Ekstre yanıtı

`CustomerStatementView(customerId, customerCode, customerName, currencyCode, from, to, openingBalance, debitTotal,
creditTotal, closingBalance, items)` (`PlatformContracts.cs:54-56`); satır
`CustomerStatementLine(id, entryDate, direction, amount, currencyCode, description, reversalOfId, hasReversal, balance)`
(`:52-53`). `CustomerLedgerView`'dan farklı olarak satırda `isReversal` **yoktur** (`:45-46` ile karşılaştırın). Ön yüz türü
bunu `CustomerLedgerItem & { balance }` olarak varsayar (`erp-types.ts:18`), yani alan eksikliği sessizdir.

---

## 3. Kurallar

### 3.1 İstemcide

- Ekstre yalnız cari seçili ve `to >= from` iken istenir; aksi hâlde ekstre temizlenir ve istek gitmez (`:180-184`).
- Tarih girişleri birbirine `min`/`max` ile bağlıdır (`:348, 352`).
- Varsayılan aralık yıl başı–bugün (`:118-119`).

### 3.2 Sunucuda: ekstre (`Program.cs:1718-1744`)

- `to < from` → 400 `{"to": ["Bitiş tarihi başlangıç tarihinden önce olamaz."]}` (`:1721`); ekranın kendi metniyle aynı.
- Cari yoksa (ya da satır süzgeci gizliyorsa) 404 (`:1722-1723`, süzgeç `CustomerRowVisibilityEndpointFilter.cs:29`).
- Açılış bakiyesi = `from` öncesi borç − alacak (`:1725-1727`). Satırlar `EntryDate, CreatedAt, Id` **artan** sırada
  (`:1728-1729`); koşan bakiye bellekte açılıştan başlar (`:1732-1738`); `hasReversal` her satır için alt sorguyla
  (`:1731`). Kapanış = son koşan bakiye (`:1742-1743`).
- Sayfalama ve üst sınır **yoktur**: çok hareketli bir caride uzun aralık tek yanıtta döner (performans riski, §10).

### 3.3 Append-only, ters kayıt, iptal sırası (ilgili yazmalar)

- **Append-only:** hareket güncellenmez ve silinmez; düzeltme bağlı ters kayıttır. Tutar her zaman pozitiftir, yön ayrı
  alandadır (`PlatformDbContext.cs:1302` `CK_CustomerLedgerEntries_AmountPositive`).
- **Elle hareket doğrulaması** (`CustomerLedgerValidation.Validate`, `PlatformContracts.cs:829-838`): yön Debit/Credit;
  tutar > 0, `decimal(18,2)` sınırında, en çok 2 ondalık; döviz 3 harfli ISO; açıklama zorunlu, ≤ 240.
- **Elle hareket iş kuralları** (`Program.cs:1759-1788`): kapalı dönem 409 ("cari hareketi", `:1766-1768`); cari
  `UPDLOCK, HOLDLOCK` (`:1769`); pasif cari 409 "Pasif cari hesaba yeni hareket eklenemez." (`:1771`); döviz cari
  dövizinden farklıysa 400 (`:1772-1773`); Debit hareket risk limitini aşarsa (tür Customer/Both/Dealer) 409 ve
  `currentBalance`, `projectedBalance`, `riskLimit` (`:1774-1780`); denetim `customer-ledger.created` (`:1784`).
- **Ters kayıt** (`Program.cs:1789-1821`):
  - Neden zorunlu, ≤ 160 (`PlatformContracts.cs:840-844`). Not: Cari Hesaplar penceresinin istemi `maxLength: 240` verir
    (`CustomersPage.tsx:1848`); 161–240 karakter sunucuda 400 alır (bu ekranın değil, mutabakat penceresinin sorunu).
  - Ters kaydın ters kaydı 409 (`:1798`).
  - **İptal sırası:** kaynak belgeden gelen hareket buradan ters çevrilemez; ilgili belge iptal edilmelidir: satış faturası,
    tahsilat, satış iadesi, alış faturası, tedarikçi ödemesi, alış iadesi (her biri 409, `:1799-1804`). Belge iptalleri kendi
    ters kayıtlarını yazar (ör. tahsilat iptali `Program.cs:5402-5404`).
  - `PurchaseInvoiceDraftId` (bağımsız alış faturası taslağı) için kodda **koruma yoktur** (`:1799-1804` listesinde geçmez;
    ilişki paylaşılan modelde yok sayılır, `PlatformDbContext.cs:3150-3153`). Böyle bir hareketin elle ters
    çevrilebildiği ayrıca doğrulanmalıdır; bu ekranın kapsamı dışında, ama ters kayıt işlemi kataloğa eklenirse önemlidir.
  - Daha önce ters çevrilmişse 409 (`:1805-1806`).
  - **Ters kayıt tarihi bugündür (UTC)** (`:1807`), özgün hareketin tarihi değil. Kapalı dönem denetimi de bugüne göre
    yapılır (`:1808-1810`). Sonuç: ters kayıt, özgün hareketin bulunduğu ekstre aralığının **dışına** düşebilir; o aralıkta
    özgün satır "Ters çevrildi" görünür ama karşı kaydı listede yoktur.
  - Açıklama "Ters kayıt: {neden}", döviz ve tutar özgünden (`:1811-1813`); denetim `customer-ledger.reversed` (`:1815`).
- **Mali yıl kapanışı:** iki yazma da kapalı döneme kayıt atmaz (409). Ekstre okuması dönem durumundan etkilenmez.
  `SettlementAndLedgerFiscalCloseRouteSqlAcceptanceTests` cari defter rotalarını içermez; cari rotaları
  `SqlServerReturnLocationAcceptanceTests.cs:147-185` kapsar.
- **Genel muhasebe aktarımı:** `GeneralLedgerTransferEndpoints.cs` içinde `CustomerLedgerEntries` geçmez; elle cari
  hareketin büyük deftere aktarımı kodda bulunamadı.

---

## 4. Durumlar, ters kayıt gösterimi

- Satırın üç hâli vardır: normal; ters kayıt (`reversalOfId != null`); ters çevrilmiş (`hasReversal == true`). Bir satır
  hem ters kayıt hem ters çevrilmiş olamaz (ters kaydın ters kaydı 409).
- Dönem toplamları ters kayıtları **içerir** (kartlardaki "ters kayıt dahil" ipucu).

## 5. Roller

- Ekranda rol farkı yoktur; komutlar rolle değişmez.
- TenantAdmin: tüm cariler (satır süzgeci yok) ve tüm okumalar. TenantUser: `erp.customers.read` Allow kuralı ve satır
  kuralları; görünmeyen cari seçicide çıkmaz, doğrudan kimlikle istenirse 404.

---

## 6. ERP işlem kataloğu

**Var olan:** `cari.*` adlı işlem **yok**. Cari ile ilgili yalnız rapor işlemleri var: `rapor.customerLedgerEntries`,
`rapor.customers` (`tests/IntegrationTests/ErpOperationCatalog.names.txt`; üretim `ErpOperationCatalog.cs:183-191`). Rapor
işlemi bu ekrana uygun değildir: sabit gövde ilk 12 sütunu `pageSize 100` ile ister, cari ve tarih süzgeci bağlanamaz,
koşan bakiye ve açılış yoktur.

**Bu ekranın gerektirdikleri (yeni ad):**

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `cari.listele` | GET `/api/customers` | query `q`, `type`, `status`, `page`, `pageSize` | list `CustomerView`, rowsPath `items`, meta `page, pageSize, totalCount` | Seçici / 1. adım için. **Paylaşılan**: Cari Hesaplar envanteri de aynı işlemi önerecektir, tekilleştirin. `Columns<CustomerView>()` `customFields` haritasını atlar; `rowVersion` (`byte[]`) metin olur. |
| `cari.ekstre` | GET `/api/customers/{id}/statement` | route `id`*; query `from`* (date), `to`* (date) | list `CustomerStatementLine` (+ hesaplanan üyeler, aşağıda), rowsPath `items`, meta `customerId, customerCode, customerName, currencyCode, from, to, openingBalance, debitTotal, creditTotal, closingBalance` (+ hesaplanan üst üyeler) | Yol parametresi adı **`id`** olmalı: izin çözümü rota desenini adla eşler (`ErpOperationCatalog.cs:569-581`), başka ad kapalı başarısızlık verir. `from`/`to` `Query()` ile **isteğe bağlı** çıkar (`:425`); zorunlu bildirilmeleri gerekir: `new ErpOperationParameter("from", "query", "date", true)`. Zorunlu olunca seçim/tarih eksikken istek gitmez (`erpOperations.ts:156-161`). |

`stok.hareket.gecmisi` örneğindeki gibi (`ErpOperationCatalog.cs:270-280`, `PlatformContracts.cs:153-159`) hesaplanan
üyeler kurucunun **dışında** tanımlanmalıdır; böylece JSON'a ekleme yapılır ve başka işlemlerin sütunları değişmez:

- `CustomerStatementLine`: `IsReversal => ReversalOfId != null`; `DebitAmount => Direction == Debit ? Amount : null`;
  `CreditAmount` (karşıtı); `BalanceAmount => Math.Abs(Balance)`; `BalanceSide => Balance > 0 ? "B" : Balance < 0 ? "A" : ""`;
  isteğe bağlı `ForeignCurrencyCode` (hesap dövizinden farklıysa satır dövizi, değilse null; `BaseUnitCode` gibi
  işleyicide `init` ile atanır).
- `CustomerStatementView`: `OpeningAmount`, `OpeningSide`, `ClosingAmount`, `ClosingSide`, `NetMovement`
  (`DebitTotal − CreditTotal`), `OpeningAsOf` (`From.AddDays(-1)`), `HasForeignCurrency`.
- Bunlar `Columns<T>()` tarafından görülmez (yalnız kurucu parametreleri, `ErpOperationCatalog.cs:463-475`); sütunlar
  `stok.hareket.gecmisi` gibi elle `Append` edilmeli, üst üyeler `MetaPaths`'e yazılmalıdır.

**Cari kart / mutabakat penceresinin gerektirdikleri (bu ekran kullanmaz; kardeş envanterle tekilleştirin):**

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `cari.hareket.listele` | GET `/api/customers/{id}/ledger` | route `id`; query `from`, `to` (date), `page`, `pageSize` | list `CustomerLedgerView`, rowsPath `items`, meta `page, pageSize, totalCount` | azalan sıra, bakiye yok |
| `cari.bakiye` | GET `/api/customers/{id}/balance` | route `id` | record `CustomerLedgerBalance` | |
| `cari.hareket.ekle` | POST `/api/customers/{id}/ledger` | route `id`; `BodyParameters<CustomerLedgerWriteRequest>` (`entryDate`, `direction`, `amount`, `currencyCode`, `description`) | record `CustomerLedgerView` | `pageKind` insert; idempotency yok (G-H13); `currencyCode` cari dövizine bağlanmalı |
| `cari.hareket.tersKayit` | POST `/api/customers/{id}/ledger/{entryId}/reverse` | route `id`, `entryId`; body `reason` | record `CustomerLedgerView` | ad `stok.hareket.tersKayit` ile uyumlu; izin `execute`; `promptMaxLength: 160` |

- `RequiresTenantAdmin` hiçbirinde gerekmez.
- **Yeni etiket kodları** (`Label()` etiketi olmayan kod için açılışta hata verir, `ErpOperationCatalog.cs:494-495`):
  - `cari.ekstre` sütunları: `amount`, `currencyCode`, `balance`, `debitAmount`, `creditAmount`, `balanceAmount`,
    `balanceSide` (+ `foreignCurrencyCode` seçilirse). Zaten var: `id`, `entryDate`, `direction`, `description`,
    `reversalOfId`, `isReversal`, `hasReversal` (`:94-95`).
  - `cari.listele` sütunları (`CustomerView`, `PlatformContracts.cs:12-21`): `type`, `taxNumber`, `groupId`, `groupName`,
    `currencyCode`, `riskLimit`, `paymentTermDays`, `identityNumber`, `taxOffice`, `parentCompanyId`, `parentCompanyName`,
    `subsidiaryCount`, `isEInvoiceRegistered`, `eInvoiceRecipientAlias`, `phone`, `email`, `website`, `contactName`,
    `contactPhone`, `contactEmail`, `priceListCode`, `receivableAccountCode`, `payableAccountCode`, `bankName`,
    `bankBranchCode`, `iban`. Var: `id`, `code`, `name`, `isActive`, `createdAt`, `rowVersion`.
  - `cari.bakiye`: `balanceSide`, `riskLimit` (+ yukarıdakiler).
  - Sorgu parametreleri `type`, `status`, `from`, `to` için de etiket gerekip gerekmediği `ErpOperationParameter`
    üretimine göre doğrulanmalı (`Query()` `Label()` çağırmaz; `q/page/pageSize` etiketleri yine de sözlükte var).
- Güncellenecek kayıtlar: `tests/IntegrationTests/ErpOperationCatalog.names.txt` (en az 2 yeni ad),
  `frontend/erp-web/src/system-pages/*Operations.fixture.json`, `tests/IntegrationTests/SystemPageStandards.versions.txt`.

---

## 7. Bileşen eşlemesi ve eksikler

### 7.1 Adım adım (wizard) kalıbı uyar mı?

**Evet, uyar.** `inventory-stock-movements.json` kalıbı (gizli seçim girişi `stokSecimi` + `steps` + 1. adımda sunucu
sayfalı liste ve `setInput` satır eylemi + 2. adımda `recordHeader` ve hareket tablosu) bu ekrana doğrudan aktarılabilir:

| Stok Hareketleri | Cari Hesap Hareketleri |
|---|---|
| `stokSecimi` (gizli, `defaultValue: {{sayfa.parametre.stockItemId}}`) | `cariSecimi` (gizli, `defaultValue: {{sayfa.parametre.customerId}}`) |
| `adimlar`: "Stok seç", "Hareketler" | `adimlar`: "Cari seç", "Ekstre" |
| 1. adım `stoklar` (`stok.bakiye.sayfa`, `searchInput`) + `hareketleriGor` | 1. adım `cariler` (`cari.listele`, server, `searchInput: cariArama`; sütunlar kod, ad, tür, döviz, etkin) + "Ekstreyi gör ›" (`cariSecimi={{cariler.seciliSatir.id}}`) |
| `secilenStok` (`recordHeader`, ayrı `stokOzeti` sorgusu) | `secilenCari` (`recordHeader`), **ayrı sorgu gerekmez**: başlık ve alanlar ekstrenin `meta`'sından gelir |
| `suzgecKarti` (depo) | `suzgecKarti` (`formCard`, `layout: inline`): başlangıç, bitiş tarihi + dönem düğmeleri |
| `liste` (`stok.hareket.gecmisi`, server) | `liste` (`cari.ekstre`, **sayfasız**) |

Farklar:
- Eski ekran tek adımdır; cari açılır seçiciyle tarih süzgeçlerinin yanında seçilir. Alternatif olarak tek adımlı
  `input lookup` (`optionsQuery: cariler`, `q ← {{cariSecimi.search}}`, `optionLabelColumn: name`,
  `optionDescriptionColumn: code`) eski ekrana daha yakındır; ama 50 seçenek sınırı (eskisi 100) ve "Pasif" etiketi
  kaybolur (G-H8). Stok Hareketleri'nde de eski ekran seçiciydi ve wizard seçildi; tutarlılık için wizard önerilir.
- Wizard bir kazanç da getirir: `sayfa.parametre.customerId` ile Cari Hesaplar'dan doğrudan ekstreye açılış (eski
  yönlendirici başlangıç carisi vermez, `WorkspacePageRouter.tsx:276`).
- `recordHeader` 6 alanı (`TenantCustomPageSchema.cs:1763`) dört özet kartını ve devir/kapanış satırlarını karşılar:
  Açılış, Dönem borç, Dönem alacak, Kapanış (+ Net, Hareket sayısı). `fieldFormats` `money`, `fieldUnits`
  `"{{ekstre.meta.openingSide}} {{ekstre.meta.currencyCode}}"` gibi şablonla B/A ve döviz eklenir (hesaplanan üyelerle).

### 7.2 Var olan bileşenlerle kurulabilenler

| Eski parça | Sayfa motoru karşılığı |
|---|---|
| Başlık sayacı | `actionBar.titleCount` (ekstre sayfasız olduğundan `totalCount` yok; G-H5) |
| Excel / CSV | `actionBar.exportTable: "liste"`, `exportCsv` |
| Yenile | actionBar `refresh` (`TenantCustomPageSchema.cs:86`) |
| Gizlenecek komutlar | `hiddenCommands: ["new", "open", "save", "delete", "filter", "print"]` |
| Tarih girişleri | `input date`; bitiş `defaultValue: "{{bugun}}"` |
| `to < from` uyarısı | `alert` + `visibleWhen: "bitis.value < baslangic.value"` (tarih karşılaştırması destekli) |
| Ekstre tablosu | `dataTable` `query: ekstre`, sütunlar `entryDate, description, direction, debitAmount, creditAmount, balanceAmount, isReversal, hasReversal, currencyCode`; `columnFormats` (`entryDate=date`, tutarlar `money`, `isReversal/hasReversal/direction=status`); `valueLabels` (`direction:Debit=Borç`, `direction:Credit=Alacak`, `isReversal:true=Ters kayıt`, `hasReversal:true=Ters çevrildi`, `false=—`); `columnUnits` (`balanceAmount=balanceSide`, `debitAmount=foreignCurrencyCode`, `creditAmount=foreignCurrencyCode`); `toneMap` (`Ters kayıt=info`) |
| Dönem toplamı (borç, alacak) | `totals: ["debitAmount", "creditAmount"]` (çizilen = tüm satırlar; sunucu toplamıyla aynı) |
| Boş durum | `emptyText: "Seçilen tarih aralığında hareket bulunmuyor."` |
| Kart / devir / kapanış / net | `recordHeader` alanları ya da `metric` (`value: "{{ekstre.meta.closingAmount}}"`, `format: money`, `icon: wallet/scale`) |
| Yabancı döviz uyarısı | `alert` + `visibleWhen: "ekstre.meta.hasForeignCurrency == true"` (hesaplanan üye ile) |
| Alt bilgi ipucu | `text` (sabit metin) |

### 7.3 Eksikler

- **G-H1 Borç / Alacak sütunları.** Ekstre tek `amount` + `direction` verir; iki ayrı tutar sütunu hücre biçimiyle
  kurulamaz. Öneri: hesaplanan `DebitAmount` / `CreditAmount` (§6). Aksi `fark`: tek "Tutar" + "Yön" sütunu.
- **G-H2 B/A'lı koşan bakiye.** `money` biçimi işaretli sayı gösterir; "300,00 A" yazılamaz. Öneri: `BalanceAmount` +
  `BalanceSide` ve `columnUnits`. Aynısı açılış / kapanış için üst üyeler. Aksi `fark`: işaretli bakiye (eksi = alacak).
- **G-H3 Satır dövizi ve karışık döviz uyarısı.** Kod yalnız yabancı satırda gösterilir; `columnUnits` her satıra ekler.
  Uyarı "herhangi bir satır farklı mı" sorusudur; koşul dili satırlar üzerinde toplama yapamaz, `countWhen` yalnız
  göstergededir. Öneri: `ForeignCurrencyCode` + `HasForeignCurrency`. Aksi `fark`: `currencyCode` sütunu görünür, uyarı düşer.
  Kökteki sorun (kur çevrimsiz toplam) sunucudadır ve taşımayla çözülmez (§1.5, §10).
- **G-H4 Ters kayıt işaretleri.** Açıklama hücresindeki "↳" ve iki etiket, satır sınıfları (ters çevrilmiş satırın üstü
  çizili) ifade edilemez; `toneMap` tek sütunun değerine bakar, satır biçimi yoktur. `fark`: ayrı "Ters kayıt" ve "Ters
  çevrildi" durum sütunları. Ek olarak ekstre satırında `isReversal` yoktur; hesaplanan üye gerekir (aksi hâlde
  `reversalOfId` dolu/boş, kimlik metni olarak görünür).
- **G-H5 Ekstre biçimi (devir satırı, ara toplam, kapanış satırı).** Izgaranın üstünde/altında tablo içi özel satır yoktur.
  `footerMeta` yalnız sunucu sayfalı tabloda (`TenantCustomPageSchema.cs:1383-1384`); ekstre sayfasızdır. `text` bileşeni
  sayıyı biçimlemez. `fark`: devir, net ve kapanış `recordHeader` alanlarına / göstergelere taşınır; `totals` borç ve alacak
  toplamını tablonun altında verir. "N hareket (ters kayıt dahil)" sayacı: satır sayısı kapsamda yoksa `fark` (motor eki:
  `{{ekstre.satirSayisi}}` ya da `titleCount` için sayfasız sorguda satır sayısı).
- **G-H6 Dönem çipleri ve varsayılan başlangıç (motor eki).** Varsayılan `from` = 1 Ocak; çipler ay başı, 3 takvim ayı önce,
  1 Ocak üretir. Kapsamda yalnız `bugun` var, şablonlar hesap yapmaz, `+ n` yalnız koşulda ve **gün** cinsindendir (ay değil).
  Çiplerin basılı görünümü de yoktur. Öneri: kapsama `tarih.ayBasi`, `tarih.yilBasi`, `tarih.ucAyOnce` (ya da genel
  `bugun` türevleri) eklemek; çipler iki atamalı `setInput` düğmeleri olur (`baslangic={{tarih.ayBasi}}`,
  `bitis={{bugun}}`). Olmazsa `fark`: başlangıç boş açılır ve kullanıcı seçer (zorunlu parametre olduğu için istek gitmez),
  çipler düşer. Bu ekranın en görünür farkıdır.
- **G-H7 `to < from` ve istek.** Eski ekran isteği hiç göndermez; sayfa motorunda `min`/`max` bağlanamaz ve sorguyu koşula
  bağlayan özellik yoktur (`OperationQueryKeys`, `TenantCustomPageSchema.cs:139`). İstek gider, sunucu aynı metinle 400 verir.
  `fark` (küçük): uyarı şeridi + sorgu hatası birlikte görünür. Motor eki önerisi: sorguda `runWhen` ya da bağlanabilir
  `min`/`max`.
- **G-H8 Cari seçici.** `cari.listele` işlemi yok (yeni ad + ~26 etiket, §6). Lookup kullanılırsa 50 seçenek sınırı ve
  "Pasif" etiketi farkı; wizard tablosunda `isActive` sütunu (`valueLabels true=Etkin, false=Pasif`) bunu karşılar.
- **G-H9 Sayfasız büyük yanıt.** Ekstre aralığın tüm satırlarını döndürür; sayfa motoru hepsini çizer. Eşdeğerdir ama çok
  hareketli carilerde yavaşlık riski vardır (eski ekranda da aynı). Sunucu tarafında üst sınır ya da sayfalı ekstre ayrı
  bir karar olmalıdır; mevcut işlemin sözleşmesini değiştirmeyin, gerekirse yeni ad açın.
- **G-H10 Açılış "itibarıyla" tarihi.** `from − 1 gün` şablonla hesaplanamaz. Öneri: `OpeningAsOf` üst üyesi; aksi `fark`
  ("{from} öncesi" metni).
- **G-H11 Dil.** Eski ekran İngilizceye çevrilir; sistem sayfası yalnız Türkçe. `fark`.
- **G-H12 Yazmalarda satır görünürlüğü (bu ekran için değil).** `cari.hareket.ekle` / `cari.hareket.tersKayit` kataloğa
  eklenirse, POST uç noktaları satır süzgecinden geçmediği için satır kuralıyla gizlenmiş bir cariye kimlikle yazılabilir;
  `allowed` bunu göstermez. Mevcut durumdur; taşıma bunu görünür kılar. Sunucuda POST için de süzgeç önerilir.
- **G-H13 Elle hareket idempotency (bu ekran için değil).** Sayfa motorunda `autoId` var, sunucuda `requestId` alanı ve
  benzersiz indeks yok. Elle hareket sistem sayfasına taşınacaksa `depo.transfer.olustur` örneğindeki gibi ekleme amaçlı
  `RequestId` gerekir; yoksa çift gönderim yalnız çalışma zamanının `inFlight` kilidiyle önlenir.

---

## 8. Görünüm anahtarı

- `customer-ledger-entries` alanları: `entryDate`, `description`, `direction`, `debit`, `credit`, `balance`,
  `currencyCode` (gizli) (`TenantScreenViewEndpoints.cs:58-63`).
- Eşleme (standardın `screenViews[].fields`): `entryDate → entryDate`, `description → description`,
  `direction → direction`, `debit → debitAmount`, `credit → creditAmount`, `balance → balanceAmount`,
  `currencyCode → currencyCode`. G-H1/G-H2 çözülmezse `debit`, `credit` karşılıksız kalır, `balance → balance`.
- Ters kayıt sütunları (`isReversal`, `hasReversal`) görünüm kataloğunda yoktur; görünüm alanı eklemek ayrı bir karardır
  (eklenmezse sütun seçicide kullanıcı gizleyemez).

## 9. Önerilen standart taslağı (özet)

- `komutlar` (actionBar: `exportTable: liste`, `exportCsv`, `hiddenCommands`), `adimlar` (steps "Cari seç", "Ekstre";
  `activeWhen: ["cariSecimi.value == null", "cariSecimi.value != null"]`), `cariSecimi` (gizli giriş).
- 1. adım: `cariArama` (text), `cariler` (dataTable, `cari.listele`, server, `searchInput`, `rowActions: [ekstreyiGor]`,
  `rowOpenAction`), `ekstreyiGor` (setInput).
- 2. adım: `secilenCari` (recordHeader: `title: {{ekstre.meta.customerCode}}`, `subtitle: {{ekstre.meta.customerName}} ·
  {{ekstre.meta.currencyCode}}`, 6 alan, `buttons: [cariDegistir]`), `suzgecKarti` (formCard inline: `baslangic`, `bitis`,
  dönem düğmeleri G-H6'ya bağlı), `tarihUyarisi` (alert), `dovizUyarisi` (alert), `liste` (dataTable `cari.ekstre`).
- Sorgular: `cariler` (`cari.listele`: `q`, `page`, `pageSize`), `ekstre` (`cari.ekstre`: `id ← {{cariSecimi.value}}`,
  `from ← {{baslangic.value}}`, `to ← {{bitis.value}}`).

## 10. Riskler

- **Kur çevrimsiz toplam.** Karışık dövizli hesapta açılış, toplam ve bakiye hatalıdır (§1.5). Taşıma bunu çözmez; uyarı
  (G-H3) kaybolursa kullanıcı yanlış bakiyeyi fark etmez. Uyarı çözülmeden canlıya alınmamalı ya da açıkça `fark` onaylanmalı.
- **Ters kaydın aralık dışına düşmesi.** Ters kayıt bugünün tarihiyle yazılır (§3.3); geçmiş bir aralıkta özgün satır
  "Ters çevrildi" görünür ama karşı kaydı yoktur, aralık toplamı düzeltmeyi içermez. Mevcut davranıştır.
- **Satır görünürlüğü yalnız GET'te** (G-H12) ve **`allowed` satır kurallarını yansıtmaz**: TenantUser için ekstre işlemi
  "izinli" görünüp belirli carilerde 404 alabilir.
- **Ekstre testi yok.** Sunucu ekstresinin entegrasyon testi bulunamadı; sistem sayfası tamamen ona dayanacağından taşıma
  öncesi açılış/sıra/koşan bakiye/404 testleri eklenmelidir.
- **Sözleşme değişikliği kuralı.** Hesaplanan üyeler legacy uç noktaların JSON'una alan ekler (ekleme amaçlı, zararsız);
  katalog adları kalıcıdır, mevcut bir işlemin sütunlarını değiştirmek yerine yeni ad açılmalıdır (`ErpOperationCatalog.cs:54-59`).
- **Varsayılan aralık** (G-H6): motor eki gelmezse ekran boş başlangıç tarihiyle açılır; eski "yıl başından" davranışı kaybolur.
- **Dil** (G-H11): İngilizce arayüzde ekran Türkçe görünür.

## 11. Açık sorular

1. Wizard mı, tek adımlı lookup mı? (Öneri: Stok Hareketleri ile tutarlı wizard.)
2. G-H6 için kapsam kökleri (`tarih.ayBasi` vb.) motora eklenecek mi, yoksa çipler `fark` olarak mı düşecek?
3. G-H1/G-H2/G-H3 hesaplanan üyeleri kabul ediliyor mu, yoksa tek tutar sütunu ve işaretli bakiye `fark` mı?
4. Ters kayıt sütunları için `customer-ledger-entries` görünüm kataloğuna alan eklenecek mi?
5. `cari.listele` bu envanterde mi, Cari Hesaplar envanterinde mi tanımlanacak (tek ad, iki ekran)?
