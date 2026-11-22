# Finans ve Genel Muhasebe ekranları: eşdeğerlik envanteri (A)

Bu belge yerleşik Finans ve Genel Muhasebe ekranlarından seçilen dördünü sistem sayfasına (standart tanım) taşımak için
girdidir. Bilgiler kod okunarak çıkarıldı (2026-11-21, `origin/master` `7bc6deda`). Biçim ve terimler
`2026-11-19-stok-depo-ekranlari-envanteri.md`, `2026-11-20-depo-transfer-envanteri.md` ve
`2026-11-21-cari-ekranlari-envanteri.md` ile aynıdır (son belge henüz yalnız `cari-sistem` çalışma ağacında; master'da
yok). Zarf ve yönlendirme kuralları `2026-11-18-sistem-sayfalari-design.md` belgesindedir. `fark` kabul edilmiş davranış
farkı, `eksik` taşımadan önce kapatılması gereken boşluk, `doğrulanmalı` kod okumasıyla kesinleşmeyen nokta anlamına
gelir.

Frontend yolları `frontend/erp-web/src/` altına, sunucu yolları `src/Hosts/AIERP.Api/` altına göredir.
`PlatformContracts.cs` ve `PlatformPermissionCatalog.cs` `src/Platform/AIERP.Platform.Application/` altındadır. Dosya
adı yazılmayan sunucu satır numaraları `Program.cs` içindir.

**Onay (2026-11-21):** Kullanıcı taslak 22'yi ve dört kararı onayladı: (1) G-F1 seçenek (b), kaynaklı fişte ters kayıt
açılır, onayda "belgeyi kendi ekranından iptal edin" uyarısı, tarih bugün; (2) tek önek `finans.*` (alt gruplar §1.5,
§2.5, §3.5, §4.5); (3) hesap planı ve mizan v1'de düz liste + sınıf süzgeci, ana hesap düzeyi sunucudan
(`trial-balance?level=`), ağaç ve grup ara toplamı ayrı motor işi; (4) sıra Kasa/Banka → Mizan → Hesap Planı → Yevmiye,
hepsi `preview`, varsayılan eski ekran. Uygulama, ortak motor dosyaları (`fixedQuery` vb.) diğer modüllerle
sıralanınca başlar.

## Kapsam ve seçim

Finans menüsünde 24 ekran anahtarı var (`financeCatalog.ts:5`). Hepsini bir seferde taşımak gerçekçi değil. Kullanım
verisi elimizde yok; seçim görevdeki listeye (kasa/banka, hesap planı, yevmiye/fiş, mizan, dönem kapanışı) ve
bağımlılığa göre yapıldı:

| Grup | Ekran anahtarları | Eski bileşen | Neden önce |
|---|---|---|---|
| **A · Kasa ve Banka** | `finance-accounts`, `finance-banks`, `finance-account-create` | `FinanceAccountsPage.tsx` → `FinancePages.tsx` (`section`), `finance/components/{FinanceAccountsToolbar,FinanceAccountsList,FinanceAccountStatement}.tsx` | Günlük nakit işi; manuel hareket, transfer ve ters kayıt buradan girilir. Tek bileşen, üç anahtar. |
| **B · Hesap Planı** | `finance-ledger-chart` | `LedgerOverviewPage.tsx` → `FinancePages.tsx:787-794` → `GeneralLedgerPage.tsx` (view `accounts`), `general-ledger/components/AccountChartView.tsx` | Yevmiye ve mizanın ön koşulu (aktif hesap yoksa fiş kaydedilmez). |
| **C · Yevmiye** | `finance-journal-vouchers` (giriş), `finance-journal-ledger` (liste + fiş görüntüleme) | `GeneralLedgerPage.tsx` (view `voucher` / `journal-ledger`), `general-ledger/components/{ManualJournalForm,JournalLedgerView,JournalEntryDocument,LedgerAccountCombobox}.tsx`, `general-ledger/{journalVoucher,journalEntries}.ts` | Ters kayıt yalnız liste ekranında; giriş ve liste birlikte taşınmazsa ters kayıt kuralının ekranı kalmaz. |
| **D · Mizan** | `finance-trial-balance` | `GeneralLedgerPage.tsx` → `general-ledger/components/{TrialBalanceView,LedgerReportFrame,AccountMovementsAside}.tsx`, `general-ledger/ledgerReportUtils.ts` | En sık bakılan muhasebe raporu; muavin (hesap hareketi) penceresi Hesap Planı ile ortak. |

Kapsam dışı (sonraki dalgalar): `finance-statements` (Banka Ekstreleri, mutabakat; ayrı envanter, bkz. §6), Nakit
Akışı, Kur & Değerleme, Bütçe, Döviz Pozisyonu, Vade Takibi, Çek ve Senet, Krediler (5 alt ekran), Hesap
Eşleştirmeleri, Bilanço, Aktarılabilir Kaynaklar, Genel Muhasebe hub'ı (`finance-ledger`) ve Mevzuat profilleri.

İki ad özellikle not edilmeli:

- **Tahsilat / ödeme** bu ekranların hiçbirinde girilmiyor. Tahsilat satış (`CustomerCollection`), tedarikçi ödemesi
  satınalma (`SupplierPayment`) tarafındadır. Kasa ekstresinde yalnız kaynak adı ve kodu olarak görünür
  (`FinancialAccountTransactionView.SourceType/SourceCode`). İşlem adları satış ve satınalma oturumlarına aittir;
  bu belge `finans.*` altında tahsilat/ödeme adı **açmaz**.
- **Dönem kapanışı** için ekran **yoktur**. Yalnız API var: `POST /api/finance/general-ledger/fiscal-year-close`
  (`FiscalYearCloseEndpoints.cs:18, 58-208`). Kural ayrıntısı §0'da, öneri §7'dedir (taslakta ekran olarak çizilmedi).

---

## 0. Ortak bilgiler

### Menü ve anahtarlar

- Standart menü kataloğunda (`StandardMenuEndpoints.cs:15, 20`): `finance-accounts` "Kasalar", `finance-banks`
  "Bankalar", `finance-trial-balance` "Mizan" **Finans** grubunda; `finance-ledger-chart` "Hesap Planı",
  `finance-journal-vouchers` "Yevmiye Fişi", `finance-journal-ledger` "Yevmiye Defterleri" **Genel Muhasebe**
  grubunda; `finance-account-create` "Yeni Kasa Tanımla" **Satış & cari** grubunda. Yedisi de `PageKeys` içinde, yani
  sistem sayfası `screenKey` olabilir (`SystemPages/SystemPageStandards.cs:158`).
- Modül menüsü bütün `financePageTitles` anahtarlarını + `finance-account-create`'i Finans'a bağlar
  (`shell/moduleMenus.ts:86-87`); `finance-account-create` `finance-accounts`'un alt rotasıdır (`:23`).
- Asimetriler: `CustomMenuEndpoints.cs:16` ve `TenantCustomizationPackageEndpoints.cs:43` yalnız `finance-accounts` ve
  `finance-statements` içerir, `finance-banks` yok. `workspace-storage.ts:12` `finance-accounts` ve `finance-banks`'ı
  kalıcı sekme sayar, `finance-account-create`'i saymaz.
- Henüz hiçbiri için standart dosyası yok (`SystemPages/Standards/` altında yalnız 8 `inventory-*`). Yeni standartlar
  sürüm 1 ve `preview` ile başlar; eski ekran varsayılan kalır.
- Yönlendirici Genel Muhasebe ekranlarına `onNavigate` geçirir (`WorkspacePageRouter.tsx:431-455`); Kasa/Banka'ya
  geçirmez (`:411-424`). Sistem sayfası yalnız `token` ve `systemScreenKey` alır; ekranlar arası geçişler `page @key`
  eylemiyle kurulmalıdır (bkz. G-F17).

### Yetki modeli

- Kaynaklar (`PlatformPermissionCatalog.cs`): `erp.finance-accounts` → `/api/finance/accounts` (`:90`),
  `erp.financial-transfers` → `/api/finance/transfers` (`:96`), `erp.bank-statements` → `/api/finance/statements`
  (`:97`), `erp.general-ledger` → `/api/finance/general-ledger` (`:89`). Eylem yoldan çıkar (`:337-345`): GET `read`,
  PUT `update`, DELETE `delete`; POST'ta son parça `IsExecutionRoute` (`:387-397`) listesindeyse `execute`, değilse
  `create`.
  - `POST /accounts`, `/accounts/{id}/status`, `/accounts/{id}/movements`, `/…/cash-flow-category` →
    `erp.finance-accounts.create` (`status` yürütme listesinde değil). `POST /…/transactions/{tid}/void` → `execute`.
  - `POST /api/finance/transfers` → `erp.financial-transfers.create`; `/{transferId}/void` → `execute`.
  - `POST /general-ledger/entries/manual` → **açık istisna** ile `create` (`:238-242`; "manual" yürütme listesinde
    olduğu için aksi halde `execute` olurdu). `/entries/{id}/reverse` → `execute`. `/accounts`,
    `/accounts/standard-chart/apply`, `/transfer`, `/transfer/preview`, `/fiscal-year-close` → `create`.
- **TenantAdmin** katalogu atlar (`PlatformPermissionAuthorizer.cs:53-55`). TenantUser ve TenantDeveloper için varsayılan
  **ret**tir; Allow kuralı gerekir.
- **İşleyicide rol denetimi (TenantAdmin şartı):** genel muhasebe hesabı POST/PUT/DELETE (`:7791-7848`), Tek Düzen
  uygula (`:7757`), eşleştirme PUT (`:8053`), manuel fiş (`:8104`), ters kayıt (`:8146`), aktarım ve önizleme,
  dönem kapanışı, kasa hareketinin nakit akışı sınıfı (`:8349-8367`). Kasa/banka kartı, manuel hareket, hareket iptali
  ve transfer işleyicilerinde rol denetimi **yok**; yalnız izin kuralları geçerli.
- **Satır düzeyi süzgeç yok.** Finans kaynaklarında cari'deki gibi satır öznitelikli süzgeç bulunmadı; cari G-C3
  (`allowed` yanlış negatif) riski burada **beklenmez**. `requiresTenantAdmin` bayrağı (`ErpOperationCatalog.cs:33-39`)
  işleyici rol denetimlerini karşılar.

### İdempotency ve eşzamanlılık

- `POST /accounts/{id}/movements` ve `POST /api/finance/transfers` **`requestId` zorunlu** alır. Aynı anahtar + aynı
  içerik 200 ile önceki kaydı döner; farklı içerik 409 "Bu tekrar gönderim anahtarı farklı bir finans hareketinde
  kullanıldı." / "…farklı bir hesap transferinde kullanıldı." Çalışma zamanı `autoId` bunu karşılar
  (`TenantCustomPage.tsx:717-729`, `TenantCustomPageSchema.cs:77-79`; depo transferi aynı deseni kullanıyor,
  `ErpOperationCatalog.cs:376-400`).
- **Kasa kartı oluşturma, manuel yevmiye fişi, ters kayıt ve hesap planı yazmaları idempotency anahtarı almaz.**
  Manuel fişte çift gönderim iki ayrı `YV-` fişi yazar; eski ekran bunu yalnız `busy` kilidiyle önler. Ters kayıtta
  `(TenantId, SourceType, SourceId)` benzersiz indeksi ikinciyi engeller (`PlatformDbContext.cs:477`).
- **rowVersion hiçbir finans/muhasebe varlığında yok** (`Entities.cs:458, 2703-2860`). Koruma UPDLOCK/HOLDLOCK ve
  firma (tenant) satırı üzerinde kayıt kilidi (`FiscalYearCloseEndpoints.LockTenantForPostingAsync`) ile sağlanır.
  Kart PUT'larında son yazan kazanır.
- `PUT /api/finance/accounts/{id}` ve `PUT /general-ledger/accounts/{id}` **yer değiştirmedir**; gönderilmeyen alan
  boş/varsayılan yazılır. Sistem sayfasında `sourceBacked` (kaynak `…getir`) zorunludur.

### Kapalı dönem (mali yıl kapanışı) kuralı

- Ayrı bir dönem kilidi tablosu yok. Kilit `FindClosedPeriodAsync` ile `FY-CLOSE-yyyyMMdd-yyyyMMdd` kodlu kapanış
  fişlerinin aralıklarından okunur (`FiscalYearCloseEndpoints.cs:22-33`). Hata 409, metin
  `"{from}–{to} dönemi kapalı; {etiket} bu tarihe kaydedilemez."`, gövde `{error, fromDate, toDate}` (`:35-45`).
- Kapsamdaki denetim noktaları ve **hangi tarihe** bakıldığı:

  | İşlem | Denetlenen tarih | Etiket |
  |---|---|---|
  | Kasa kartı açılış bakiyesi (≠0) | bugün (UtcNow) | "açılış bakiyesi" |
  | Manuel kasa/banka hareketi | hareket tarihi | "finans hareketi" |
  | Hareket iptali (void) | **bugün**; asıl hareketin tarihi denetlenmez | "finans hareketi ters kaydı" |
  | Transfer | transfer tarihi | "hesap transferi" |
  | Transfer iptali | **bugün** | "hesap transferi ters kaydı" |
  | Manuel yevmiye fişi | fiş tarihi | "…bu tarihe yevmiye eklenemez." |
  | Yevmiye ters kaydı | ters kaydın tarihi (eski ekranda hep bugün) | "…bu tarihe ters kayıt eklenemez." |
  | Nakit akışı sınıfı değişikliği | **denetim yok** | — |

- **Dönem kapanışı API'si** (`FiscalYearCloseRequest(FromDate, ToDate, RetainedEarningsAccountId)`, yalnız TenantAdmin):
  aralık ≤367 gün ve sıralı; özkaynak hesabı aktif ve aynı firmada; daha sonraki dönem kapalıysa ya da aralık çakışıyorsa
  409; dengesiz fiş varsa, önceki dönemin gelir/gider hesapları sıfırlanmamışsa ya da devredilecek bakiye yoksa ret.
  Serializable işlem; gelir/gider (StatementSection Revenue/Expense) hesaplarını özkaynak hesabına kapatır;
  `FY-CLOSE-…` ve `FY-OPEN-…` (ToDate+1) fişleri yazar; SourceId SHA256 ile deterministiktir. **Geri alma (unclose)
  yok**; kapanış/açılış fişleri ters kayıt listesinde olmadığı için ters çevrilemez.

### Ters kayıt ve iptal sırası (append-only)

- **Kasa/banka hareketleri yalnız eklenir.** Silme ucu yok. İptal = ters yönlü yeni hareket (`ReversalOfId` dolu,
  `RequestId` null). Ters kaydın ters kaydı yapılamaz (`RequestId` null olduğu için ilk denetimde reddedilir).
  Benzersiz filtreli `(TenantId, ReversalOfId)` indeksi çift iptali engeller (`PlatformDbContext.cs:2508`), ama bu uçta
  benzersizlik ihlali yakalanmadığından eşzamanlı ikinci istek 500 alabilir (kod çıkarımı).
- Yalnız **manuel** hareket bu uçla iptal edilir: transfer, tahsilat, ödeme ve kredi hareketleri reddedilir
  ("Yalnızca manuel finans hareketleri bu işlemle iptal edilebilir.", "Kredi kullandırım ve ödemeleri genel hesap
  hareketleri ekranından iptal edilemez."). Transfer kendi ucuyla iki ters kayıtla iptal edilir.
- **Yevmiye fişleri değiştirilemez, silinemez.** Taslak/onay durumu yok; fiş kaydedildiği an kesinleşir. Düzeltme ters
  kayıtla yapılır: borç/alacak yer değiştirir, `SourceType="ManualReversal"`, `SourceId=asıl.Id`, açıklama
  "Ters kayıt · {kod} · {gerekçe}" (240'a kesilir), numara `YV-` serisinden.
- Sunucunun ters kayda izin verdiği kaynak türleri (`:8146-8165`, doğrulandı): Manual, SalesInvoice, PurchaseInvoice,
  StandaloneInvoiceDraft, PurchaseReceipt, SalesDelivery, SalesReturn, SupplierReturn, CustomerCollection,
  SupplierPayment, FxRevaluation, InventoryCostAdjustment. Diğerleri 409 "Bu kaynak türü ters kayıtla kapatılamaz."
  (ManualReversal, FiscalYearClose/Opening, PaymentInstrumentEvent, bordro, sabit kıymet, kredi).
- **İptal sırası (kritik):** kaynak belge iptali, belgenin yevmiyesi ters çevrilmeden **reddedilir**
  (`GeneralLedgerTransferEndpoints.cs:92-98` `HasUnreversedJournalEntryAsync`; mesaj "… yevmiyeye aktarılmış. Önce
  yevmiye fişini ters kayıtla kapatın." — irsaliye `:4396`, satış faturası `:5333`, tahsilat `:5376`, satış iadesi
  `:5428`, mal kabul `:6788`, alış faturası `:7312`, alış iadesi `:7355`, tedarikçi ödemesi `:7404`; doğrulandı).
  Doğru sıra: **(1) yevmiye ters kaydı → (2) kaynak belge iptali**. Ters çevrilmiş kaynak yeniden aktarılamaz ("Bu
  kaynak daha önce deftere aktarılmıştır.", `GeneralLedgerTransferEndpoints.cs:111`).
- **Eski ekran bu sırayı kapatıyor:** `journalEntries.ts:36` Manual olmayan her fişte ters kaydı "Kaynaklı fiş kaynak
  belgeden iptal edilir" nedeniyle pasif yapar. Kaynak belge ekranı ise "Önce yevmiye fişini ters kayıtla kapatın" der.
  Sonuç: aktarılmış bir faturayı bugün yalnız API ile iptal etmek mümkün. Sistem sayfasının bu kuralı kopyalayıp
  kopyalamayacağı **karar** konusudur (G-F1).

### Çalışma zamanı ve tasarımcı (bu envanteri etkileyenler)

- Yazma isteği `{...kaynak, ...fixedBody}` ile başlar; bağlı parametreler üzerine yazılır; sorgu parametreleri yazmada
  da URL'e eklenir (`custom-page/erpOperations.ts:76-110`, doğrulandı). Ancak **`fixedQuery` yok**: sabit sorgu değeri
  yalnız bağlı parametreyle verilebilir (G-F6).
- Yol değeri bağlı değerden, yoksa kaynak kaydın **aynı adlı** alanından gelir (`:85-90`). Kasa ekstresi satırında `id`
  hareket kimliğidir; `{id}` yolu ise hesap kimliği ister (G-F8).
- `dataTable` için `totals` (en çok 12 sütun, yalnız sorguya bağlı liste) var (`TenantCustomPageSchema.cs:32, 114,
  718-724`). Ağaç, grup ara toplamı, önek toplulaştırma ve satır girintisi yok.
- Liste sonucunda `rowsPath` iç içe diziyi satır yapar (depo transferi `lines`, `ErpOperationCatalog.cs:394`); iç içe
  liste **sütun** olmaz. Gövdede liste parametresi `ListParameter<T>("lines")` ile kurulabilir (`:396, 455`).
- `Label()` etiketi olmayan her kod için açılışta hata verir (`:494`). Gereken yeni etiketler §5'te.
- Sunucu doğrulama hataları tek metne birleştirilir (`erpApi.ts:15-39`); alan vurgusu yok.

---

## 1. Kasa ve Banka (`finance-accounts`, `finance-banks`, `finance-account-create`)

### 1.1 Yerleşim

Üç anahtar `FinancePage`'i açar; `key={section-createOnOpen}` ile rota değişince bileşen baştan kurulur
(`FinanceAccountsPage.tsx`). Tür `section==="finance-banks" ? "Bank" : "Cash"` (`FinancePages.tsx:113-115`).
`createOnOpen` yalnız Kasalar'da formu açar (`:235-238`): "Yeni banka" rotası yok, banka kartı Bankalar listesinin
Yeni komutuyla açılır.

**Liste**

- Başlık `ListPageHeader` ("Kasalar"/"Bankalar", açıklama `:67-70`, sayaç `kindAccounts.length`).
- Özet kartları (`FinanceAccountsList.tsx:105-141`): "Toplam bakiye" (tek dövizde toplam, çok dövizde "—" + ipucu);
  **yalnız Bankalar'da** "Eksi bakiyeli hesap" (eksi varsa kötü tonu; tıklanınca `negativeOnly` süzgeci). Kasada kart
  yok çünkü sunucu kasa bakiyesini eksiye düşürmez.
- Araç çubuğu (`FinanceAccountsToolbar.tsx`): arama "Kod, hesap veya döviz ara" (istemcide `tr-TR` küçük harf
  `includes`, 350 ms gecikme ya da Enter — `list-page/ListToolbar.tsx:98, 121-127`), durum çipleri Tüm durumlar / Aktif
  / Pasif (sayılar aramaya göre, `FinancePages.tsx:1133-1137`), yenile, sütunlar/pivot, detay paneli (Ctrl+.).
- Izgara (`SalesDocumentGrid`, `gridId` `studio-finance-finance-accounts-{cash|bank}-v2`): Kod (ekstreyi açan bağlantı),
  Hesap, Tür, Döviz, Bakiye (eksi → kırmızı), Hareket, Durum (Aktif/Pasif). Sütunlar `GET /api/screen-views/
  finance-accounts/active`'den gelir; `actions` kapalı. Çift tık / Enter / Aç ekstreyi açar; Boşluk işaretler; toplu
  "Excel (seçilenler)". Boş: "Filtreye uygun kasa veya banka hesabı yok."
- Sağ detay paneli (`:230-268`): kod, ad, durum, döviz; Bakiye, Hareket; Tür, Döviz, Açılış (`createdAt`);
  "Hareketler ve ekstre için Aç (Enter)."
- Komutlar (`:143-195`): Yeni (F2), Aç (Enter), Sil (Ctrl+Delete; hareketli hesapta "Hareketi olan hesap silinemez;
  pasifleştirin."), İşlemler (Alt+İ): Düzenle, Manuel hareket (pasifte "Pasif hesaba hareket girilemez"), Transfer /
  döviz (pasifte ya da başka aktif hesap yoksa nedenli pasif), Pasifleştir/Etkinleştir, CSV. Listeden Manuel hareket /
  Transfer seçilince önce ekstre yüklenir, form ekstrenin çekmecesinde açılır (`:1147-1165`).

**Hesap kartı (Yeni / Düzenle)** — `RecordFormPage` tam sayfa (`:829-871`)

- Başlık "Kasa/Banka Kartı Tanımlama" / "… Hesabı Düzenle"; kaydet etiketi "Kasa Kartını Kaydet" / "Değişiklikleri
  Kaydet". Ctrl+S, Ctrl+F2 Kaydet ve Yeni (yalnız yeni kayıtta), Temizle.
- Alanlar: Kod* (≤40, yer tutucu `KASA-01`/`BANKA-01`), Ad* (≤120), Hesap türü (seçim, kilitli), Döviz* (3 harf, büyük
  harfe çevrilir), Açılış bakiyesi (yalnız yeni kayıtta; adım 0,01; kasada `min=0`; düzenlemede bilgi notu).
- Durum satırı "Zorunlu alanlar: n / 3", "Kaydedilmemiş değişiklik var".
- Yalnız Bankalar'da form açılınca `workspace-subroute-title` olayı atılır (`:239-251`, dinleyici
  `WorkspaceShellPage.tsx:347-355`).

**Hesap ekstresi** — `FinanceAccountStatement.tsx`

- Başlık "Kasa/Banka hesabı · ekstre", kod, ad, durum, döviz. Kutucuklar: Güncel bakiye (eksi → tehlike), Hareket
  (tümü), Giriş, Çıkış (bu ikisi **yalnız o sayfanın** toplamı).
- Hareket tablosu (`screenKey="finance-account-transactions"`, `financeCatalog.ts:11`): Tarih, Kaynak
  (`sourceType sourceCode`; null ise "Manuel / ters kayıt"), Açıklama, Nakit akışı (satır içi seçim), Referans, Giriş,
  Çıkış, Durum ("Ters kayıt" etiketi). Sayfa boyutu 50. **Açılış bakiyesi satırı, tarih süzgeci ve yürüyen bakiye
  yok** (`FinancePages.tsx:48-53`).
- Nakit akışı seçimi TenantAdmin değilse, iş sürerken ve InternalTransfer/OpeningBalance satırlarında pasif (`:254`).
- Komutlar: Yeni, Kaydet (hep pasif: "Hesap ekstresi salt okunurdur"), Sil (hareketliyse pasif), İşlemler: Manuel
  hareket, Transfer / döviz, **Hareketi iptal et** (yalnız "Manuel hareket" ve ters kaydı yok; aksi "Ters kayıt satırı
  iptal edilemez" / "Yalnız manuel hareket iptal edilir"), **Transferi iptal et** (yalnız "Hesap transferi" ve ters
  kaydı yok), Düzenle, Pasifleştir/Etkinleştir. Seçim yoksa "Önce ekstreden bir hareket seçin". İptal onayı
  `confirmDialog` (uyarı tonu), düğme "Ters kayıtla iptal et" (`:571-624`).

**Çekmeceler**

- Manuel hareket (`:1429-1520`): Yön (Giriş/Çıkış, varsayılan Giriş), Tarih* (bugün), Tutar* (≥0,01), Referans (≤100),
  Açıklama* (≤240), Nakit akışı sınıfı (Sınıflandırılmamış/İşletme/Yatırım/Finansman). Not: "Nakit çıkışı hesap
  bakiyesini aşamaz."
- Transfer / döviz (`:1521-1644`): Hedef hesap (aktif, kendisi hariç, **kasa ve banka birlikte**), Tarih, Referans,
  Kaynak tutarı, Kur (döviz farklıysa görünür; ≥1e-8, 8 ondalık; aynı dövizde 1'e döner), Hedef tutar (salt okunur,
  `tutar×kur`). Açıklama alanı yok; sabit "Kasa/banka döviz transferi" gönderilir.

### 1.2 API çağrıları

| Çağrı | Ne zaman | Gövde / sonuç |
|---|---|---|
| GET `/api/finance/accounts` | açılış, her işlemden sonra | `FinancialAccountSummary[]` (`Id, Code, Name, Type, CurrencyCode, IsActive, Balance, TransactionCount, CreatedAt`); sayfalama ve `type` süzgeci **yok**, Type+Code sıralı (`:8249-8258`) |
| GET `/api/screen-views/finance-accounts/active`, `/finance-account-transactions/active` | açılış | hata yutulur |
| GET `/api/finance/accounts/{id}?page&pageSize=50` | ekstre aç, sayfa değiştir | `FinancialAccountDetail` + iç içe `Transactions[]` (`FinancialAccountTransactionView`: `Id, TransactionDate, Direction, Amount, CurrencyCode, Description, Reference, SourceType, SourceCode, ReversalOfId, CreatedAt, TransferId, CashFlowCategory`), `TransactionPage/PageSize/TotalCount` (`:8327-8348`) |
| POST `/api/finance/accounts` | yeni kart | `{code, name, type, currencyCode, openingBalance}` → 201 Summary (`:8259-8290`) |
| PUT `/api/finance/accounts/{id}` | düzenle | aynı; `openingBalance` hep 0 (`:8291-8313`) |
| DELETE `/api/finance/accounts/{id}` | sil | 204, kalıcı (`:8314-8326`) |
| POST `/api/finance/accounts/{id}/status?isActive=` | pasifleştir/etkinleştir | gövde yok; `{id, isActive}` (`:8442-8452`) |
| POST `/api/finance/accounts/{id}/movements` | manuel hareket | `{requestId, transactionDate, direction, amount, description, reference, cashFlowCategory}` (`:8368-8408`) |
| POST `/api/finance/accounts/{id}/transactions/{tid}/void` | hareket iptali | gövde yok; `{id, status:"Voided"}` (`:8409-8441`) |
| POST `/api/finance/accounts/{id}/transactions/{tid}/cash-flow-category` | nakit akışı sınıfı | `{cashFlowCategory}`; ters kaydı da günceller (`:8349-8367`) |
| POST `/api/finance/transfers` | transfer | `{requestId, fromAccountId, toAccountId, transferDate, amount, reference, description, exchangeRate}` (`:8467-8533`) |
| POST `/api/finance/transfers/{transferId}/void` | transfer iptali | iki ters kayıt, durum Voided (`:8534-8575`) |

### 1.3 Kurallar

- Kart: kod trim + büyük harf; **aynı tür içinde** benzersiz (409 "Bu hesap kodu bu firmada aynı türde (kasa/banka) zaten
  kullanılıyor.", benzersiz `(TenantId, Type, Code)`). Döviz yalnız 3 ASCII harf denetlenir (ISO listesi yok). Kasa
  açılış bakiyesi negatif olamaz. Açılış ≠ 0 ise bugün tarihli, `OpeningBalance` sınıflı, açıklaması "Açılış bakiyesi"
  olan bir hareket yazılır; **yevmiye üretmez**.
- Düzenleme: açılış değiştirilemez ("Düzenlemede açılış bakiyesi değiştirilemez; bakiye hareketlerden hesaplanır.");
  hareketli hesapta tür ve döviz değiştirilemez (409). `doğrulanmalı`: `CurrencyCode` EF alternatif anahtarın parçası
  (`PlatformDbContext.cs:2440`); hareketsiz hesapta döviz değiştirmek 500 verebilir.
- Silme: hareketli ya da FK bağlı hesap silinmez (409, "Hesabı pasifleştirin."); hareketsiz hesap **kalıcı** silinir.
- Hareket: pasif hesaba yazılmaz; **kasadan** çıkış bakiyeyi aşamaz ("Kasa bakiyesi manuel çıkış için yetersiz.");
  bankada eksi bakiye denetimi yok. Hareketin dövizi hep hesabın dövizi (FK `(TenantId, AccountId, CurrencyCode)`).
- Transfer: iki hesap da aktif; aynı dövizde kur 1 (DB check de var); hedef tutar `Amount×Rate` 2 haneye
  AwayFromZero; kaynak kasa bakiyesi yetmeli; numara `Internal.FinancialTransfer`; iki hareket `InternalTransfer`.
  Transfer iptalinde hedef **kasanın** bakiyesi yetmeli.
- Manuel hareket, açılış, transfer ve iptaller **yevmiye fişi üretmez** (bu işleyicilerde JournalEntry yok; aktarım
  kaynakları listesinde finans hareketi yok, `GeneralLedgerTransferEndpoints.cs:43`). Yevmiyeyi yalnız tahsilat,
  tedarikçi ödemesi (`InvoiceSettlementJournalPosting.cs`) ve kredi hareketleri üretir. Bu bugünkü davranıştır; taşıma
  değiştirmez ama taslakta yazılmalıdır (kullanıcı kasa hareketinin muhasebeleştiğini sanabilir).
- Kapalı dönem ve ters kayıt: §0 tabloları.

### 1.4 Roller

- **TenantAdmin:** her şey; nakit akışı sınıfını değiştirebilir.
- **TenantUser / TenantDeveloper:** ekranın tamamını görür (eski ekran `role`'ü yalnız nakit akışı seçiminde
  kullanır); her yazma Allow kuralına bağlı. Nakit akışı sınıfı işleyicide TenantAdmin'e kilitli.

### 1.5 ERP işlem kataloğu

Var olan: **hiçbir `finans.*` işlemi yok.** Yalnız rapor işlemleri: `rapor.financialAccountTransactions`,
`rapor.financialAccountTransfers`, `rapor.bankStatements`, `rapor.bankStatementLines` (`ErpOperationCatalog.names.txt`).
Liste/ekstre ekranının yerini tutmazlar. Modül sabiti `Finans` eklenmeli (`ErpOperationCatalog.cs:62-70`).

Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `finans.hesap.listele` | GET `/api/finance/accounts` | query `type` (**yeni sunucu parametresi**, G-F7) | list `FinancialAccountSummary` | Kasalar `type=Cash`, Bankalar `type=Bank` |
| `finans.hesap.getir` | GET `/api/finance/accounts/{id}` | route `id`; query `page`, `pageSize` | record `FinancialAccountDetail` (iç içe liste sütun olmaz) | düzenleme ve ekstre başlığının kaynağı |
| `finans.hesap.ekstre` | GET aynı yol | route `id`; query `page`, `pageSize` | list `FinancialAccountTransactionView`, `rowsPath: "transactions"` | sayfa toplamı `transactionTotalCount` (G-F9) |
| `finans.hesap.olustur` | POST `/api/finance/accounts` | body `code`*, `name`*, `type`*, `currencyCode`*, `openingBalance` | record `FinancialAccountSummary` | `type` sayfadan sabit bağlanır |
| `finans.hesap.guncelle` | PUT `/api/finance/accounts/{id}` | route `id`; body `code`, `name`, `currencyCode`; `sourceBacked` | record `FinancialAccountSummary` | kaynak `finans.hesap.getir`; `fixedBody {openingBalance:0}`; `type` kaynaktan |
| `finans.hesap.sil` | DELETE `/api/finance/accounts/{id}` | route `id` | yok | hareketliyse 409 |
| `finans.hesap.pasifeAl` | POST `/api/finance/accounts/{id}/status` | route `id`; query `isActive` | record `{id, isActive}` | `fixedQuery` yok (G-F6) |
| `finans.hesap.aktifEt` | POST aynı | aynı | aynı | G-F6 |
| `finans.hareket.ekle` | POST `/api/finance/accounts/{id}/movements` | route `id`; body `requestId` (`autoId`), `transactionDate`*, `direction`*, `amount`*, `description`*, `reference`, `cashFlowCategory` | record `FinancialAccountTransactionView` | idempotent |
| `finans.hareket.iptal` | POST `/api/finance/accounts/{id}/transactions/{transactionId}/void` | route `id` (hesap), `transactionId` (satır) | record `{id, status}` | **G-F8** yol adı çakışması; `execute` |
| `finans.hareket.nakitAkisi` | POST `/api/finance/accounts/{id}/transactions/{transactionId}/cash-flow-category` | route `id`, `transactionId`; body `cashFlowCategory` | record | `requiresTenantAdmin`; G-F8 |
| `finans.transfer.olustur` | POST `/api/finance/transfers` | body `requestId` (`autoId`), `fromAccountId`*, `toAccountId`*, `transferDate`*, `amount`*, `exchangeRate`, `reference` | record `FinancialAccountTransferSummary` | `fixedBody {description:"Kasa/banka döviz transferi"}`; hedef seçenekleri `finans.hesap.listele` (türsüz) |
| `finans.transfer.iptal` | POST `/api/finance/transfers/{transferId}/void` | route `transferId` (satırın `transferId` alanından) | record | `execute` |

Sonraya: `finans.transfer.listele` (`GET /api/finance/transfers`, bugün ekranda kullanılmıyor), banka ekstresi işlemleri.

### 1.6 Bileşen eşlemesi ve eksikler

Var: `actionBar` (Yeni → `page @finance-account-create` ya da form penceresi, Aç, Sil `disabledWhen
transactionCount > 0`, İşlemler ≤10), `metric` (Toplam bakiye, Eksi bakiyeli hesap), `filterBar` (arama, durum),
`dataTable` (`toneMap` durum, eksi bakiye tonu, `rowActions`), `steps` (1 Hesap seç → 2 Ekstre; Cari Hesap
Hareketleri ve Stok Hareketleri ile aynı desen), `recordHeader` (ekstre başlığı), `formCard`, `dialog` (manuel
hareket, transfer; `xl` gerekmez), `button` + `confirmEnabled` (iptaller), `alert` (kapalı dönem/sunucu hatası).

Eksikler:

- **G-F6 Sabit sorgu değeri.** `/status?isActive=` gövde değil sorgu ister; `fixedBody` var, `fixedQuery` yok. Çözüm:
  katalogda `fixedQuery` (önerilen, `pasifeAl` `{isActive:false}`, `aktifEt` `{isActive:true}`) ya da sayfada sabit
  değer bağlama. `doğrulanmalı`: bool `false` değerinin `isEmpty` sayılıp atılmadığı (`erpOperations.ts:96`).
- **G-F7 Kasa/Banka ayrımı.** Liste ucu türe göre süzmez; eski ekran istemcide süzer. İki standart tek işlemi
  paylaşırsa ya sunucuya `type` sorgu parametresi eklenmeli (önerilen; yeni işlem adı zaten açılıyor) ya da sayfada yerel
  süzgeç gerekir. Transfer hedef seçeneklerinde süzgeç **uygulanmamalı** (kasa ↔ banka transferi).
- **G-F8 Ekstre satırında yol adı çakışması.** Satırdaki `id` hareket kimliği, yoldaki `{id}` hesap kimliği. Kaynaklı
  çözümde `{id}` satırın `id`'sinden gelir ve **yanlış hesaba** istek gider (depo G-D1'e benzer). `id` ← adım 1'de
  seçilen hesap, `transactionId` ← satır `id` olarak açıkça bağlanmalı; bağlama zorunlu yapılmalı.
- **G-F9 Sayfalı ekstre toplamı.** Toplam `transactionTotalCount` üst düzey alanında; çalışma zamanı sayfalamasının
  bunu `meta` olarak okuyup okumadığı `doğrulanmalı`. Giriş/Çıkış kutucukları eskide de sayfa toplamıdır (`fark` yok;
  "bu sayfa" alt yazısı korunmalı).
- **G-F10 Hesaplanan değerler.** Toplam bakiye (tek dövizde toplam, çok dövizde "—"), transferde hedef tutar
  (`tutar×kur`) ve kurun aynı dövizde 1'e dönmesi. Bağlamalarda aritmetik yok. Öneri: toplam bakiye için sunucu özeti
  (yeni işlem `finans.hesap.ozet`) ya da `fark` (kart yalnız "Hesap sayısı / Eksi bakiyeli"); hedef tutar `fark`
  (sunucu hesaplar, sonuç bildiriminde gösterilir), kur alanı `visibleWhen` ile döviz farklıyken görünür.
- **G-F11 Satır koşullu komutlar.** "Hareketi iptal et" yalnız `sourceType == "Manuel hareket"` ve `reversalOfId`
  boşken; "Transferi iptal et" yalnız `sourceType == "Hesap transferi"`. Koşul dili karşılar (`visibleWhen` /
  `disabledWhen`). Ancak `SourceType` **Türkçe görüntü metni** olarak türetiliyor (`:8327-8348`); koşulun metne
  bağlanması kırılgan. Öneri: yeni işlemde ayrıca makine kodu (`sourceKind`) ya da `fark` olarak kabul.
- **G-F12 Ekstreden oluşan hareket.** Banka ekstresinden "create-book-entry" ile yazılan hareket `RequestId=line.Id`
  alır (`:8734`, doğrulandı); ekranda "Manuel hareket" görünür ve iptal edilebilir, iptal ekstre eşleşmesini
  bozmaz/denetlemez. Bugünkü davranıştır; taşıma değiştirmez, risk olarak yazılır.
- **G-F13 Bankalar alt başlık olayı.** `workspace-subroute-title` yalnız Bankalar'da. `fark` (başlık `recordHeader`
  ile sayfada görünür).
- **G-F14 Eşzamanlı iptal 500.** Benzersizlik ihlali yakalanmıyor; `confirmEnabled` + `busy` kilidi pratikte yeter.
  Sunucu düzeltmesi ayrı iş.
- **G-F15 Izgara düzeni.** Eski `gridId` localStorage düzeni sistem sayfasına taşınmaz (`fark`).

### 1.7 Görünüm anahtarları

- `finance-accounts` → `code, name, type, currencyCode, balance, transactionCount, status, actions`
  (`TenantScreenViewEndpoints.cs:480-486, 711`); Kasa ve Banka **aynı** görünümü paylaşır. Eşleme `status → isActive`.
- `finance-account-transactions` → `transactionDate, source, description, cashFlowCategory, reference, inflow, outflow,
  actions` (`:487-493, 712`). `inflow`/`outflow` tek `amount` + `direction`'dan türetilir: iki koşullu sütun ya da
  `fark` (tek "Tutar" + yön etiketi).

---

## 2. Hesap Planı (`finance-ledger-chart`)

### 2.1 Yerleşim

`DefinitionLayout`: solda ağaç liste, sağda hesap kartı (`GeneralLedgerPage.tsx:626-748`).

- Başlık "Hesap planı", "N hesap · Tek Düzen Hesap Planı".
- Komutlar (`:318-402`): Yeni (F2, yalnız TenantAdmin), Aç, Sil (nedenler: seçim yok; kaydedilmemiş değişiklik; "Alt
  hesabı olan hesap silinemez; önce alt hesapları kaldırın."; "Hareketli hesap silinemez; bu hesap zaten pasif.";
  hareketli aktif hesapta Sil "Pasife al" öneren onay açar, `:255-268`), Dışa aktar (`hesap-plani.xlsx`), İşlemler:
  Hareketleri gör (muavin), Alt hesap ekle (pasifte yasak), Pasifleştir/Etkinleştir, Tek Düzen Hesap Planı, Hesap
  eşleştirmeleri (`onNavigate`), CSV. Yönetici olmayana neden "Hesap planını firma yöneticisi düzenler" (`:57`).
- Araç çubuğu (`:459-501`): arama (kod/ad), Sınıf seçimi (1–9, sayılarla, `:32-42`), durum çipleri Tümü / Hareketli /
  Aktif / Pasif, Tümünü daralt/genişlet.
- Ağaç tablo (`:505-611`): **Kod, Hesap, Bakiye** (3 sütun). Hiyerarşi kod önekinden: sınıf (1. hane) › grup (2 hane)
  › hesap; noktalı alt hesaplar girintili (`34+depth*16`). Pasif "· Pasif" eki; ters bakiyede uyarı simgesi
  (`isReverseBalance`, `:300-316`). Arama sırasında bütün düğümler açılır.
- Bakiye: yıl başından bugüne, `GET trial-balance?basis=TDHP&from=YYYY-01-01&to=bugün`; satır = kendisi + bütün `kod.`
  alt hesapları (rollup, `:129-168`).
- Klavye: ↑↓ gezer ve kartı açar (kaydedilmemiş değişiklikte sorar), Enter/Boşluk açar, Esc kapatır, Tab forma geçer.
- Kart (`:723-744`; yönetici değilse alanlar kilitli): Üst hesap (yalnız yeni kayıtta, aktif hesaplar; sınıfı devralır),
  Kod (alt hesapta tek parça; sonuç `üst.kod + "." + parça`), Ad (≤160), Finansal tablo sınıfı, Hesap tipi
  (Unclassified/Asset/Liability/Equity/Revenue/Expense/OffBalanceSheet), Çalışma şekli (Debit/Credit/Both), Döviz (3
  harf), IFRS kodu/adı/tablo sınıfı. Özet kutusu: dönem borç/alacak, bakiye, "Eşleştirmelerde N kullanım", hareket
  var/yok (`:404-437`). Kaydet ve Yeni; "Kaydedilecek değişiklik yok".
- İstemci doğrulaması (`:332-340`): "Alt hesap koduna tek bir alt kod girin. Örnek: 001 → 120.001.", "Oluşan hesap kodu
  en fazla 32 karakter olabilir."
- Tek Düzen şeridi (`:1079-1122`): "Eksik hesapları ekle" önce onay sorar; resmî tebliğ bağlantısı.

### 2.2 API çağrıları

| Çağrı | Ne zaman | Gövde / sonuç |
|---|---|---|
| GET `/api/finance/general-ledger/accounts` | açılış | `LedgerAccountView[]` (`Id, Code, Name, IsActive, StatementSection, HasMovements, AccountType, NormalBalance, CurrencyCode, IfrsAccountCode, IfrsAccountName, IfrsStatementSection`), koda göre sıralı (`:7682-7689`) |
| GET `/mappings` | açılış | kullanım sayısı için |
| GET `/trial-balance?basis=TDHP&from&to` | açılış, her yenilemede | yıl başı bakiyeleri |
| POST `/accounts` | yeni | `LedgerAccountWriteRequest` (`PlatformContracts.cs:472-477`) |
| PUT `/accounts/{id}` | düzenle, pasif/etkin | aynı alanlar + `isActive` |
| DELETE `/accounts/{id}` | sil | 204; bağlı eşleştirmeler **sessizce silinir** |
| GET `/accounts/standard-chart` | önizleme | `{template, version, sourceUrl, totalAccounts, existingAccounts, accountsToAdd}` |
| POST `/accounts/standard-chart/apply` | uygula | `{addedCount, preservedExistingCount, totalAccounts}` |
| GET `/accounts/{id}/statement?page&pageSize=200&from&to` | muavin | bkz. 4.2 |

### 2.3 Kurallar

- Kod 1–32, ad 1–160; 409 "Bu hesap kodu zaten tanımlı."; sınıflandırma doğrulamaları (`TryLedgerClassification`,
  `:9214-9245`): hesap tipi, çalışma şekli, IFRS sınıfı, IFRS kod+ad birlikte, döviz 3 harf ISO biçimi.
- **Üst hesap sunucuda doğrulanmaz**; hiyerarşi yalnız kod önekidir (`LedgerAccount`'ta ParentId yok,
  `Entities.cs:458`). Sistem sayfasında kullanıcı tam kodu yazarsa üstü olmayan alt hesap açılabilir (G-F19).
- Hareketli hesapta **kod ve ad** değiştirilemez (409 "…hesabı pasife alın ve yeni hesap açın."); sınıf, tip, IFRS ve
  aktiflik değişebilir. Hareketli ya da alt hesabı olan hesap silinemez.
- Tek Düzen uygula yalnız eksik kodları ekler (≈243 hesap, `TurkishUniformChartOfAccounts.cs`; tip ve çalışma şekli
  varsayılan; eşleştirme kurmaz).
- Bütün yazmalar TenantAdmin (işleyici). Denetim kaydı `finance.general-ledger.account-*`.

### 2.4 Roller

- **TenantAdmin:** her şey. **Diğerleri:** okur (Allow ile), kart kilitli, yazma komutları nedenli pasif.

### 2.5 ERP işlem kataloğu

Var olan: yok. Yeni (önerilen):

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `finans.muhasebe.hesap.listele` | GET `/api/finance/general-ledger/accounts` | — | list `LedgerAccountView` | fiş satırı hesap seçicisinin de kaynağı |
| `finans.muhasebe.hesap.getir` | — | — | — | tekil GET yok; kaynak liste satırı (`sourceBacked` satırdan) |
| `finans.muhasebe.hesap.olustur` | POST `/accounts` | body `code`*, `name`*, `statementSection`*, `accountType`, `normalBalance`, `currencyCode`, `ifrsAccountCode`, `ifrsAccountName`, `ifrsStatementSection` | record `LedgerAccountView` | `requiresTenantAdmin`; `fixedBody {isActive:true}` |
| `finans.muhasebe.hesap.guncelle` | PUT `/accounts/{id}` | route `id`; aynı body, satırdan kaynaklı; `isActive` hariç | record | `requiresTenantAdmin` |
| `finans.muhasebe.hesap.pasifeAl` / `aktifEt` | PUT `/accounts/{id}` | route `id` | record | `fixedBody {isActive:false/true}`, kaynak satır |
| `finans.muhasebe.hesap.sil` | DELETE `/accounts/{id}` | route `id` | yok | `requiresTenantAdmin` |
| `finans.muhasebe.tekDuzen.onizle` | GET `/accounts/standard-chart` | — | record | |
| `finans.muhasebe.tekDuzen.uygula` | POST `/accounts/standard-chart/apply` | — | record | `requiresTenantAdmin`, `confirmEnabled` |
| `finans.muhasebe.muavin` | GET `/accounts/{id}/statement` | route `id`; query `from`, `to`, `page`, `pageSize` | list (satırlar) | Mizan ile ortak (4.5) |

### 2.6 Bileşen eşlemesi ve eksikler

Var: `actionBar`, `filterBar` (arama, sınıf, durum), `dataTable`, `formCard` (sağ panel ya da `dialog`), `alert`
(yönetici değil notu), `button` + `confirmEnabled` (Tek Düzen, pasife al), `dialog` (muavin).

Eksikler:

- **G-F2 Ağaç ve önek toplulaştırması.** Sınıf › grup › hesap › alt hesap ağacı, daralt/genişlet, girinti ve
  "kendisi + alt hesaplar" bakiyesi istemcide hesaplanıyor. Motorda ağaç/grup yok. Seçenekler: (a) `fark` — düz liste,
  koda göre sıralı, **Sınıf** süzgeci ve kod sütununda düzey girintisi yok; bakiye yalnız hesabın kendisi (mizandan);
  (b) motora `dataTable.treeBy: "codePrefix"` (ortak motor dosyası, sıralama gerekir); (c) sunucuya düzeyli/toplulaştırılmış
  bir okuma ucu. Öneri: v1'de (a) + "Mizan'da ana hesap düzeyi" bağlantısı.
- **G-F3 Bakiye birleşimi.** Hesap listesi ile mizan iki ayrı sorgu; satıra bakiyeyi bağlamak için iki listeyi
  `accountId` ile birleştirmek gerekir, motorda birleştirme yok. `fark` (bakiye sütunu düşer, kartta muavin özeti) ya da
  sunucuda `LedgerAccountView`'e bakiye ekleyen **yeni** okuma (`finans.muhasebe.hesap.listeleBakiyeli`).
- **G-F19 Alt hesap kodu birleştirme.** `üst.kod + "." + parça` istemcide kuruluyor; sunucu üst hesabı doğrulamıyor.
  `fark`: kullanıcı tam kodu yazar ("120.001"), yardım metni örnek verir. Risk: üstsüz alt hesap (§7).
- **G-F20 Kaydedilmemiş değişiklikte gezinme sorusu.** ↑↓ ile kart değişirken soru; çalışma zamanında yalnız kayıt
  değiştirirken ve pencere kapanırken var (cari G-C18 ile aynı) — `doğrulanmalı`.
- **G-F21 Ters bakiye uyarısı.** `normalBalance` ile bakiye işaretinin karşılaştırılması; bakiye yoksa (G-F3) düşer.

### 2.7 Görünüm anahtarları

`finance-ledger-accounts` (`TenantScreenViewEndpoints.cs:500-505`) yalnız görünüm kataloğunda; gerçek ağaç bu tanımı
**okumuyor**. Aktarılacak kiracı ayarı yok.

---

## 3. Yevmiye (`finance-journal-vouchers`, `finance-journal-ledger`)

### 3.1 Yerleşim

**Yevmiye Fişi (giriş)** — `ManualJournalForm.tsx`

- TenantAdmin değilse kilit kartı: "Yevmiye fişi kaydetmek için firma yöneticisi yetkisi gerekir." (`:125-131`).
- Komutlar: Yeni (F2; doluysa sorar), İşlemler › Son fişler (→ `finance-journal-ledger`).
- `RecordFormPage` "Yeni yevmiye fişi", kaydet "Fişi kaydet"; aktif hesap yoksa kaydet pasif ve şerit "Aktif hesap
  yok; fiş kaydedilemez. Önce hesap planına hesap ekleyin." Vazgeç/Esc doluysa sorar, sonra Yevmiye Defterleri'ne
  gider. Durum satırı: "Kaydedilen fiş değiştirilemez; düzeltme ters kayıtla yapılır." + "Satır: N".
- Belge bilgileri: Fiş tarihi* (bugün), Muhasebe standardı (TDHP / IFRS düzeltme fişi), Açıklama* (≤240).
- Satır ızgarası: #, Hesap (`LedgerAccountCombobox`: yalnız aktif hesaplar, kod öneki önce, en çok 40 seçenek, ↑↓/Enter/
  Tab/Esc, tam kod eşleşmesinde blur'da seçer), Satır açıklaması (boşsa fiş açıklaması), Borç, Alacak, Kaldır.
  3 boş satırla başlar, en çok 100. Bir tarafa tutar girilince diğer taraf temizlenir. Son satırın tutarında Enter yeni
  satır; Ctrl+Shift+Enter satır ekle; tutar alanında Enter kaydetmez.
- Toplamlar: Toplam borç, Toplam alacak, "Borç = Alacak ✓ Dengeli" ya da "Fark: X borç fazlası / alacak fazlası".
- İstemci doğrulaması (`journalVoucher.ts:66-97`): "Fiş açıklaması girin.", "{n}. satırdaki tutar geçersiz. Örnek:
  1.250,50", "{n}. satırda hesap seçin.", "{n}. satıra yalnızca borç ya da alacak tutarı girin.", "Fişte hesap ve tutarı
  girilmiş en az iki satır olmalı.", "Bir fişte en fazla 100 satır olabilir.", "Fiş dengeli değil: alacağa X ekleyin ya
  da borcu azaltın." Hesap kuruş tamsayısıyla.

**Yevmiye Defterleri (liste + fiş)** — `JournalLedgerView.tsx`, `JournalEntryDocument.tsx`

- Özet kartları: Fiş sayısı (toplam), Borç = alacak toplamı (bu sayfa), Aktarılmayı bekleyen kaynak (yalnız yönetici),
  Ters kayıt (bu sayfa).
- Süzgeçler: tarih aralığı ve Standart (Tümü/TDHP/IFRS) sunucuda; "Kaynak (bu sayfa)" çipleri (Manuel, Satış,
  Tahsilat, Ödeme, İade, Çek/senet, Diğer) **yalnız yüklü sayfada**.
- Izgara: Fiş, Tarih, Kaynak (ters kaydı varsa "Ters kaydı var"), Açıklama, Standart, Borç, Alacak, Kayıt zamanı;
  sayfa 50; toplu "Excel (seçilenler)"; ↑↓/Boşluk/Enter; alt satırda sayfa toplamları.
- Komutlar: Yeni (→ `finance-journal-vouchers`), Aç, Sil (hep pasif: "Kaydedilmiş fiş silinemez — İşlemler › Ters
  kayıt oluştur"), İşlemler: Ters kayıt oluştur, Aktarılabilir kaynaklar, CSV.
- Fiş belgesi (salt okunur): fiş tarihi, kaynak belge (yalnız metin, **bağlantı yok**), standart, kayıt zamanı;
  satırlar hesap kodu/adı, açıklama, borç, alacak; toplamlar ve Dengeli; "Fiş zinciri" (asıl ↔ ters kayıt).
- Ters kayıt (`GeneralLedgerPage.tsx:645-678`): `promptDialog` "Fiş ters çevrilsin mi?", gerekçe zorunlu; tarih
  **seçilemez, bugün**. UI nedenleri (`journalEntries.ts:129-137`): yönetici değil; ters kayıt fişi; **Manual dışı her
  fiş "Kaynaklı fiş kaynak belgeden iptal edilir"**; zaten ters çevrilmiş.

### 3.2 API çağrıları

| Çağrı | Ne zaman | Gövde / sonuç |
|---|---|---|
| GET `/general-ledger/accounts` | açılış | hesap seçici |
| POST `/general-ledger/entries/manual` | fişi kaydet | `{entryDate, accountingBasis, description, lines:[{accountId, description, debit, credit}]}` → 201 `{id, code, entryDate, description, sourceType, sourceId, accountingBasis, totalDebit, totalCredit}` (`:8104-8145`) |
| GET `/general-ledger/entries?from&to&accountingBasis&page&pageSize` | liste | `{items, page, pageSize, total}`; tarih azalan (`:8083-8103`) |
| GET `/general-ledger/entries/{id}` | fiş aç (150 ms gecikme) | `JournalEntryView` + iç içe `Lines[]`, `IsReversed` (`:8185-8196`) |
| POST `/general-ledger/entries/{id}/reverse` | ters kayıt | `{entryDate, reason}` (`:8146-8179`) |
| GET `/general-ledger/sources` | liste özeti (yönetici) | bekleyen kaynak sayısı |

### 3.3 Kurallar

- Fiş: standart TDHP/IFRS/UFRS; açıklama 1–240; 2–100 satır; her satırda hesap, açıklama ve **yalnız bir tarafta**
  sıfırdan büyük, 2 ondalıklı tutar; borç = alacak > 0; bütün hesaplar aktif ve aynı firmada. **Yaprak/alt hesap
  denetimi yok** (ana hesaba da kayıt atılabilir).
- Kapalı dönem (fiş tarihi) 409. Numara `YV-{YYYY}-{SEQ:6}` (`TenantDocumentNumbering.cs:128`). `SourceType="Manual"`,
  `SourceId` yeni GUID → **idempotency yok** (çift kayıt riski).
- Ters kayıt: §0. Yalnız TenantAdmin; gerekçe 1–240; ters kaydın tarihine göre kapalı dönem denetimi; bir kez.
- İptal sırası: §0 — kaynaklı fişin ters kaydı, kaynak belge iptalinin **ön koşuludur**.

### 3.4 Roller

- **TenantAdmin:** fiş girer, ters kayıt yapar, bekleyen kaynakları görür.
- **Diğerleri:** listeyi ve fişleri okur (Allow ile); giriş ekranında kilit kartı; ters kayıt nedenli pasif.

### 3.5 ERP işlem kataloğu

Var olan: `rapor.journalEntryLines` (`POST /api/reports/run`; fiş satırı raporu, listenin yerini tutmaz). Yeni:

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `finans.fis.listele` | GET `/general-ledger/entries` | query `from`, `to`, `accountingBasis`, `page`, `pageSize` | list, `rowsPath: "items"` | toplam `total` |
| `finans.fis.getir` | GET `/general-ledger/entries/{id}` | route `id` | record `JournalEntryView` | belge başlığı |
| `finans.fis.satirlari` | GET aynı | route `id` | list, `rowsPath: "lines"` | belge satırları |
| `finans.fis.olustur` | POST `/general-ledger/entries/manual` | body `entryDate`*, `accountingBasis`, `description`*; `ListParameter("lines")`: `accountId`*, `description`*, `debit`, `credit` | record | `requiresTenantAdmin`; satır açıklaması boşsa fiş açıklaması (G-F5) |
| `finans.fis.tersKayit` | POST `/general-ledger/entries/{id}/reverse` | route `id`; body `reason`*, `entryDate` | record | `requiresTenantAdmin`, `execute`; `entryDate` varsayılan bugün (G-F1) |

### 3.6 Bileşen eşlemesi ve eksikler

Var: `recordHeader`, `formCard` (belge bilgileri), `editableGrid` + picker sütunu (hesap; `finans.muhasebe.hesap.listele`
aktif süzgeçli), `metric` + `countWhen` ("bu sayfa" kartları), `filterBar` (tarih, standart; kaynak çipleri yerel),
`dataTable` (`totals: ["totalDebit","totalCredit"]`), `dialog` (fiş belgesi `xl`; ters kayıt gerekçesi), `alert`
(yönetici değil, aktif hesap yok, kapalı dönem).

Eksikler:

- **G-F1 Kaynaklı fiş ters kaydı (karar).** Eski ekran Manual dışı fişi kilitler; sunucu buna izin verir ve kaynak
  belge iptali için **şart koşar**. Seçenekler: (a) eskiye eşdeğer kilit (iptal yolu yine yalnız API'de kalır); (b)
  sunucunun izin verdiği kaynak türlerinde ters kaydı açmak, onay metninde "Bu fiş {kaynak} belgesinden geldi. Ters
  kayıttan sonra belgeyi kendi ekranından iptal edin." uyarısı. Öneri **(b)**: ERP kuralı zaten API'de; sayfa yalnız
  sırayı açıklar. Ters kaydın tarihi seçilebilir mi: öneri **hayır, bugün** (eskiyle aynı; kapalı dönem riskini
  azaltır).
- **G-F4 Satır kenar davranışları.** "Bir tarafa yazınca diğerini temizle", Enter ile yeni satır, combobox blur'da tam
  kod eşleşmesi: `editableGrid`'de `doğrulanmalı`. Olmazsa `fark`: sunucu "yalnız bir tarafta" hatasını döner.
- **G-F5 Satır açıklaması varsayılanı.** Boş satır açıklaması fiş açıklamasıyla doldurulmalı (sunucu satır açıklamasını
  **zorunlu** tutar). Motorda "boşsa başlık alanı" bağlaması yok. Seçenekler: `editableGrid` sütun varsayılanı
  `{{form.description}}` (`doğrulanmalı`) ya da sütun zorunlu (`fark`, kullanıcı her satıra yazar).
- **G-F16 Denge göstergesi.** Borç/alacak sütun toplamı ve "Dengeli / Fark X" durumu. `editableGrid` alt toplamı ve
  iki toplamın farkı `doğrulanmalı`; fark hesabı aritmetik ister. Olmazsa `fark`: iki toplam gösterilir, denge sunucu
  hatasıyla bildirilir. Bu, fiş girişinin en önemli geri bildirimidir; **eksik** sayılması önerilir.
- **G-F17 Ekranlar arası geçiş.** Son fişler, Vazgeç sonrası liste, Yeni → giriş, Aktarılabilir kaynaklar: `page @key`
  ile kurulur. "Vazgeç'ten sonra listeye dön" `doğrulanmalı`.
- **G-F18 Kaynak çipleri bu sayfada.** Yerel süzgeç; sunucuya `sourceType` parametresi yok. `fark` (eskisiyle aynı
  sınır, "bu sayfa" etiketi korunur).
- **G-F22 Çift gönderim.** Manuel fiş idempotent değil; `busy` kilidi çalışma zamanında var mı `doğrulanmalı`. Kalıcı
  çözüm sunucuya `requestId` (yeni sözleşme alanı) — sonraya.

### 3.7 Görünüm anahtarları

`finance-journals` (`TenantScreenViewEndpoints.cs:494-499`) liste bileşenince **okunmuyor** (bileşen kendi alanlarını
kullanıyor, `gridId studio-finance-finance-journals-v3`). Aktarılacak kiracı ayarı yok.

---

## 4. Mizan (`finance-trial-balance`)

### 4.1 Yerleşim

- `LedgerReportFrame`: solda parametre paneli (Ctrl+. gizle/göster), F9 ve Yenile çalıştırır, Dışa aktar (xlsx),
  İşlemler: Raporu çalıştır, CSV.
- Parametreler: Dönem (Bu yıl / Bu ay / Özel + iki tarih), Standart (TDHP/IFRS), Hesap düzeyi (Ana hesap / Alt hesap;
  yalnız TDHP; varsayılan alt), Hesap kapsamı (Yalnız hareketli — varsayılan / Tüm hesaplar).
- Her parametre değişiminde 200 ms gecikmeyle ve iptal edilebilir istekle **otomatik** çalışır (`:124-149`).
- "Mizanda hesap ara" (istemci, kod/ad).
- Sütunlar: Hesap, Açılış B, Açılış A, Dönem B, Dönem A, Bakiye B, Bakiye A; sıfır "—".
- Gruplama: TDHP'de ilk haneye göre sınıf grubu + "X toplamı" ara toplam satırı; IFRS'te `statementSection` sırası.
  Ana hesap düzeyi istemcide ilk 3 haneyle toplulaştırılır ve bakiye netlenir (`aggregateMainAccounts`, `:71-93`). Ters
  bakiye simgesi ve sayısı. Genel toplam filtreden bağımsız (arama/kapsam yalnız satır gizler). Rozet "Mizan dengede" /
  "Dengede değil". IFRS'te eşleme eksikse uyarı ve ilk 5 hesap.
- Muavin (yalnız TDHP): satıra tıklama/Enter → `AccountMovementsAside`; ana hesapta birden çok hareketli alt hesap varsa
  önce "Alt hesaplar" listesi. Muavin: açılış, dönem B/A, kapanış, yürüyen bakiye, "Daha fazla göster". Muavin
  satırından fişe **bağlantı yok**.
- Dışa aktar `mizan-{basis}-{from}-{to}.xlsx/.csv` (başlık satırı + görünen satırlar + Toplam). Yazdırma yok.

### 4.2 API çağrıları

| Çağrı | Ne zaman | Sonuç |
|---|---|---|
| GET `/general-ledger/trial-balance?from&to&basis` | her parametre değişimi | `{from, to, basis, accounts:[{accountId, code, name, isActive, statementSection, openingDebit, openingCredit, debit, credit, balanceDebit, balanceCredit}], totalOpeningDebit, totalOpeningCredit, totalDebit, totalCredit, totalBalanceDebit, totalBalanceCredit, unmappedAccountCount, unmappedAccounts, isComplete, isBalanced}` (`TrialBalanceEndpoints.cs:10-67`) |
| GET `/general-ledger/accounts/{id}/statement?page&pageSize=200&from&to` | muavin | açılış/kapanış, satırlar, sayfalama (`LedgerAccountStatementEndpoints.cs`; pageSize 1–200) |

### 4.3 Kurallar

- Standart TDHP/IFRS/UFRS; başlangıç ≤ bitiş. TDHP yalnız TDHP fişlerini, IFRS TDHP + IFRS fişlerini toplar.
  Açılış = başlangıç öncesi; başlangıç yoksa 0. Hareketsiz hesaplar da (sıfırla) döner.
- IFRS'te satırlar `IfrsAccountCode`'a göre gruplanır ve `accountId="IFRS:{kod}"` olur (**GUID değil**; muavine
  bağlanamaz). Eşlemesi olmayan hareketli hesaplar `unmappedAccounts`'ta.
- Düzey ve gruplama yalnız istemcide; sunucu tek düz liste döner.
- Muavin bütün standartların fiş satırlarını listeler (UI bunu not düşer).

### 4.4 Roller

Okuma `erp.general-ledger.read`; rol farkı yok.

### 4.5 ERP işlem kataloğu

| Ad | Yöntem ve yol | Parametreler | Sonuç | Not |
|---|---|---|---|---|
| `finans.mizan` | GET `/general-ledger/trial-balance` | query `from`, `to`, `basis` | list, `rowsPath: "accounts"`; meta `total*`, `isBalanced`, `isComplete`, `unmappedAccountCount` | düz liste |
| `finans.mizan.anaHesap` | GET (yeni sunucu parametresi `level=main`) | aynı + `level` | aynı biçim | G-F23 seçeneği (b) |
| `finans.muhasebe.muavin` | GET `/accounts/{id}/statement` | route `id`; query `from`, `to`, `page`, `pageSize` | list | 2.5 ile ortak |

### 4.6 Bileşen eşlemesi ve eksikler

Var: `filterBar` (dönem hazır seçimleri + tarih, standart, kapsam), `dataTable` (`totals` 6 sütun), `metric` (Borç,
Alacak, Bakiye farkı, "Dengede" rozeti `toneMap`), `alert` (`visibleWhen isComplete == false`), `dialog` (muavin),
`button` (Çalıştır).

Eksikler:

- **G-F23 Sınıf grupları, ara toplamlar ve ana hesap düzeyi.** Üçü de istemcide; motorda grup/ara toplam/önek
  toplulaştırma yok. Seçenekler: (a) `fark` — düz alt hesap listesi, sınıf süzgeci, genel toplam; (b) sunucuya
  `level=main|sub` ve sıralı satırlara `groupKey/groupLabel` ekleyen **yeni** okuma (`finans.mizan.anaHesap`), ara toplam
  için motorda `groupBy` + grup toplamı (ortak motor dosyası). Öneri: v1'de (a) + sunucu `level` (motora dokunmaz);
  grup ara toplamı sonraki motor turunda.
- **G-F24 "Yalnız hareketli" kapsamı.** Sıfır satırları gizlemek için koşullu satır süzgeci (`debit + credit +
  openingDebit + openingCredit > 0`) gerekir; koşul dilinde toplama (`+ N`) var ama alan+alan toplamı `doğrulanmalı`.
  Olmazsa sunucuya `movedOnly` parametresi (aynı yeni işlemde).
- **G-F25 Muavin ve IFRS satırları.** `accountId="IFRS:…"` GUID değil; muavin bağlantısı `visibleWhen basis == "TDHP"`
  ile yalnız TDHP'de sunulmalı. Ana hesap düzeyindeki "Alt hesaplar" ara listesi `fark` (ana hesap satırında muavin
  yok; alt düzeye geçilir).
- **G-F26 Otomatik çalıştırma.** Eski ekran her değişimde 200 ms sonra çalışır; sistem sayfasında süzgeç değişimi
  sorguyu yeniler mi, yoksa "Çalıştır" mı gerekir `doğrulanmalı`. Her iki durum da kabul edilebilir (`fark`).
- **G-F27 Dışa aktarım biçimi.** Eski xlsx kendi başlık satırı, grup satırları ve Toplam satırıyla yazılır; çalışma
  zamanı yalnız görünen sayfayı/satırları aktarır (cari G-C5). `fark`.

### 4.7 Görünüm anahtarları

`finance-trial-balance` (`TenantScreenViewEndpoints.cs:595-601`) bileşen tarafından **okunmuyor**.

---

## 5. Gereken `Labels` kodları ve kayıtlar

`Label()` etiketi olmayan kod için açılışta hata verir (`ErpOperationCatalog.cs:494`). Var olanlar (`:72-119`): `id`,
`code`, `name`, `isActive`, `createdAt`, `status`, `description`, `direction`, `reversalOfId`, `transferDate`, `page`,
`pageSize`, `baseCurrencyCode`, `amountBase`, `kind`, `value`, `label`.

Yeni gerekenler:

- Kasa/Banka: `type`, `currencyCode`, `balance`, `transactionCount`, `transactionDate`, `amount`, `reference`,
  `sourceType`, `sourceCode`, `transferId`, `cashFlowCategory`, `transactionPage`, `transactionPageSize`,
  `transactionTotalCount`, `fromAccountId`, `fromAccountName`, `toAccountId`, `toAccountName`, `toCurrencyCode`,
  `destinationAmount`, `exchangeRate`, `openingBalance`, `requestId`, `transactionId`.
- Hesap Planı: `statementSection`, `hasMovements`, `accountType`, `normalBalance`, `ifrsAccountCode`,
  `ifrsAccountName`, `ifrsStatementSection`, `addedCount`, `preservedExistingCount`, `totalAccounts`, `accountsToAdd`,
  `existingAccounts`.
- Yevmiye: `entryDate`, `sourceId`, `accountingBasis`, `totalDebit`, `totalCredit`, `lineNumber`, `accountId`,
  `accountCode`, `accountName`, `debit`, `credit`, `isReversed`, `reason`, `total`.
- Mizan: `openingDebit`, `openingCredit`, `balanceDebit`, `balanceCredit`, `totalOpeningDebit`,
  `totalOpeningCredit`, `totalBalanceDebit`, `totalBalanceCredit`, `unmappedAccountCount`, `isComplete`, `isBalanced`,
  `from`, `to`, `basis`, `level`.

Güncellenecek kayıtlar: `tests/IntegrationTests/ErpOperationCatalog.names.txt`, yeni
`system-pages/finance*Operations.fixture.json`, `SystemPageStandards.versions.txt`, `system-pages/systemPageKeys.ts`.

---

## 6. Kaybolması kolay eski davranışlar (denetim listesi)

1. Kasalar'da Yeni kasa kartı rotası (`finance-account-create`), Bankalar'da rotasız Yeni; form kapanınca Kasalar
   listesine dönüş; Bankalar alt başlık olayı.
2. Liste arama gecikmesi (350 ms) ve Enter; durum çipi sayılarının aramaya göre hesaplanması.
3. Bankalar'da "Eksi bakiyeli hesap" kartının süzgeç gibi çalışması; Toplam bakiyenin çok dövizde "—" olması.
4. Kod hücresinin ekstreyi açması; listeden Manuel hareket/Transfer seçilince önce ekstrenin açılması.
5. Ekstrede Giriş/Çıkış kutucuklarının yalnız sayfa toplamı olması; açılış/yürüyen bakiye **olmaması** (yeni sayfa
   bunu "eklemiş" gibi göstermemeli).
6. İptal komutlarının satır türüne göre görünmesi ve nedenleri; onaydaki "Ters kayıtla iptal et" düğmesi.
7. Transferde kurun aynı dövizde 1'e dönmesi, hedef tutarın canlı hesaplanması; hedef listesinde kasa ve bankanın
   birlikte olması.
8. Nakit akışı sınıfının satır içinde değiştirilmesi (yalnız yönetici; transfer/açılış satırında kilitli).
9. Her işlemden sonra listenin ve açık ekstrenin yenilenmesi; pasifleştirmede aynı sayfada kalma.
10. Hesap planında ağaç, daralt/genişlet, rollup bakiye, ters bakiye simgesi, ↑↓ ile kart değiştirme sorusu, alt hesap
    kodunun üst koddan kurulması, hareketli hesapta Sil'in "Pasife al" önermesi, Tek Düzen onayı.
11. Fiş girişinde: tek taraf temizleme, Enter ile satır ekleme, Ctrl+Shift+Enter, satır açıklaması varsayılanı, canlı
    denge göstergesi, aktif hesap yoksa kaydet kilidi, Vazgeç sonrası listeye dönüş, yönetici olmayana kilit kartı.
12. Yevmiye listesinde: "bu sayfa" kaynak çipleri, ters kaydı olan fişin etiketi, Sil'in nedenle pasif kalması, fiş
    zinciri, ters kayıt gerekçe penceresi ve tarihin bugün olması.
13. Mizanda: otomatik çalıştırma, ana/alt düzey, sınıf ara toplamları, "Yalnız hareketli", dengede rozeti, IFRS eşleme
    uyarısı, TDHP'de muavin ve ana hesapta alt hesap ara listesi, dosya adı biçimi.
14. Kısayollar: F2, Enter, Ctrl+Delete, Alt+İ, Ctrl+., Ctrl+S, Ctrl+F2, Esc, F9, ↑↓/Boşluk.

---

## 7. Özet tablo, öneriler ve riskler

| Grup | Var olan işlem | Yeni işlem (v1) | Sonraya | Başlıca eksikler |
|---|---|---|---|---|
| A Kasa ve Banka | 0 (rapor.* yerini tutmaz) | 13 (`hesap.listele/getir/ekstre/olustur/guncelle/sil/pasifeAl/aktifEt`, `hareket.ekle/iptal/nakitAkisi`, `transfer.olustur/iptal`) | transfer listesi, banka ekstresi | G-F6 sabit sorgu, G-F7 tür süzgeci, **G-F8 yol adı**, G-F10 hesaplanan değerler, G-F11 SourceType metni |
| B Hesap Planı | 0 | 8 (`muhasebe.hesap.listele/olustur/guncelle/pasifeAl/aktifEt/sil`, `tekDuzen.onizle/uygula`) | eşleştirmeler | **G-F2 ağaç**, G-F3 bakiye birleşimi, G-F19 alt hesap kodu |
| C Yevmiye | `rapor.journalEntryLines` | 5 (`fis.listele/getir/satirlari/olustur/tersKayit`) | fiş `requestId`, kaynak belge bağlantısı | **G-F1 karar**, **G-F16 denge**, G-F5 satır açıklaması, G-F4 |
| D Mizan | 0 | 2 (`mizan`, `muhasebe.muavin`) + isteğe bağlı `mizan.anaHesap` | grup ara toplamı (motor) | **G-F23 gruplama/düzey**, G-F24 hareketli kapsamı, G-F25 IFRS muavin |

Eksik kimlikleri (tek liste): G-F1 kaynaklı fiş ters kaydı · G-F2 hesap planı ağacı · G-F3 bakiye birleşimi · G-F4
satır kenar davranışları · G-F5 satır açıklaması varsayılanı · G-F6 sabit sorgu değeri · G-F7 kasa/banka tür süzgeci ·
G-F8 ekstre yol adı çakışması · G-F9 ekstre sayfa toplamı · G-F10 hesaplanan değerler · G-F11 SourceType metni · G-F12
ekstreden oluşan hareket · G-F13 Bankalar alt başlık olayı · G-F14 eşzamanlı iptal 500 · G-F15 ızgara düzeni · G-F16
fiş denge göstergesi · G-F17 ekranlar arası geçiş · G-F18 bu sayfa kaynak çipleri · G-F19 alt hesap kodu · G-F20
kaydedilmemiş değişiklik sorusu · G-F21 ters bakiye uyarısı · G-F22 fiş çift gönderimi · G-F23 mizan gruplama/düzey ·
G-F24 hareketli kapsamı · G-F25 IFRS muavin · G-F26 otomatik çalıştırma · G-F27 dışa aktarım biçimi.

**Önerilen sıra:** (1) Kararlar: G-F1, işlem öneki (`finans.*` tek önek mi, genel muhasebe için `muhasebe.*` mi),
G-F2/G-F23 için "v1 düz liste" kabulü → (2) sunucu küçük eklemeleri: `GET /api/finance/accounts?type=`,
`trial-balance?level=`, katalogda `fixedQuery` (ortak motor dosyası; diğer modüllerle sıralanmalı) → (3) A Kasa ve
Banka (en az motor eksiği; depo transferi desenini kullanır) → (4) D Mizan + muavin → (5) B Hesap Planı → (6) C Yevmiye
(denge göstergesi doğrulanmadan yayımlanmamalı). Hepsi `preview`; varsayılan eski ekran.

**Dönem kapanışı ekranı (öneri, v1 dışı):** bugün yalnız API var. Sonraki adımda tek sayfalık bir sistem sayfası
(`finans.donem.kapat`, `requiresTenantAdmin`, aralık + özkaynak hesabı seçimi + güçlü onay; geri alınamaz uyarısı) ve
kapalı dönemleri listeleyen bir okuma (bugün uç yok; `FindClosedPeriodAsync` mantığı sunucuda okuma ucu olarak açılmalı)
önerilir. Ayrı taslak ister.

**Riskler:**

- **İptal sırası (G-F1).** Kilit korunursa aktarılmış belgeler arayüzden iptal edilemez (bugünkü durum). Açılırsa
  kullanıcı ters kaydı yapıp kaynak belgeyi iptal etmeyi unutabilir: defter ile belge ayrışır (ters kayıt sonrası
  belge "aktarılmış" görünmez ve yeniden aktarılamaz). Onay metni ve fiş belgesinde "Kaynak belgeyi iptal etmeyi
  unutmayın" notu şart.
- **Yanlış hesaba istek (G-F8).** Ekstre satırından kaynaklı iptal yol değerini satırın `id`'sinden alırsa istek
  başka bir hesabın yoluna gider; sunucu `(hesap, hareket)` çiftini birlikte aradığı için büyük olasılıkla 404 döner,
  ama bağlama hatası taslakta açıkça kapatılmalı.
- **Fiş çift kaydı (G-F22).** İdempotency yok; çift tıklama iki `YV-` fişi yazar. Düzeltme yalnız ters kayıtla.
- **Üstsüz alt hesap (G-F19).** Sunucu üst hesabı denetlemez; düz listede tam kod yazılırken yazım hatası ağacı bozar.
- **Kasa hareketleri yevmiye üretmez.** Bugünkü davranış; kullanıcı "muhasebeleşti" sanabilir. Taslak notunda yazılmalı.
- **Ekstreden oluşan hareketin iptali (G-F12)** mutabakatı denetlemiyor; bugünkü davranış.
- **Döviz değişikliği 500 (doğrulanmadı)** ve eşzamanlı iptal 500 (G-F14): sunucu hataları; taşıma değiştirmez.
- **Sözleşme kuralı:** katalog adları kalıcıdır (`ErpOperationCatalog.cs:56-59`). `type`/`level` gibi sunucu eklemeleri
  yeni ad altında açılmalı; sonradan sonuç biçimi değiştirilmemeli.
- **Ad çakışması:** tahsilat/ödeme işlemleri satış/satınalma oturumlarına aittir; bu belge `finans.*` altında
  tahsilat/ödeme adı önermez. Kasa ekstresinde tahsilat satırından tahsilata geçiş eklenirse onların adları kullanılır.
