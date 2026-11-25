# Cari hareket → bağlı belgeye git — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cari Hesap Hareketleri ekstresindeki her satırdan, hareketi oluşturan belgeye (7 tür) yeni sekmede gidilebilsin.

**Architecture:** Sunucu ekstre satırına kaynak belge bilgisini ekler (kurucu dışı üyeler). Beş eski belge ekranı belgeyi
sayfa parametresiyle bir kez açar ("Karar 4" kuralı). Eski ekstre ekranı ve `customer-ledger` sistem sayfası "Belge"
sütunu ve "Belgeye git ›" düğmesiyle bu ekranları `legacy: true` olarak yeni sekmede açar.

**Tech Stack:** .NET 10 minimal API + EF Core (xUnit entegrasyon testleri), React + TypeScript + Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-cari-hareket-bagli-belge-design.md`, taslak
`docs/design-proposals/erp-design-language/28-cari-hareket-bagli-belge.html`

## Global Constraints

- Ekstre yanıtında mevcut alanlar ve `cari.ekstre`'nin mevcut sütun sırası değişmez; yeni sütunlar sona eklenir.
- Kaynak türü değerleri: `SalesInvoice`, `CustomerCollection`, `SalesReturn`, `PurchaseInvoice`, `PurchaseInvoiceDraft`,
  `SupplierPayment`, `SupplierReturn`; kaynaksızda `null`.
- Türkçe etiketler: Satış faturası, Tahsilat, Satış iadesi, Alış faturası, Alış faturası taslağı, Tedarikçi ödemesi, Alış iadesi.
- Düğme metni "Belgeye git ›"; kaynaksız satır ipucu "Elle girilen hareket; bağlı belge yok".
- Belge her zaman yeni sekmede (`replace: false`) ve eski ekranında (`legacy: true`) açılır.
- Sayfa parametresi bir kez okunur, `dropPageParam` ile silinir.

## Review Focus

- Belge iptalinden doğan ters kayıt satırı (kendi FK'si boş) özgün hareketin belgesine gitmeli → Task 1 testi.
- Tahsilat satırı tahsilatın faturasına (`CustomerCollectionAllocations`) gitmeli; dağıtımı olmayan tahsilatta `sourceOpenId` null ve düğme pasif → Task 1 testi.
- Muhasebeleşmiş alış taslağı düzenlenemez: ekran hata değil bilgi notu göstermeli → Task 2 testi.
- Aynı belgeye ikinci kez gitmek (parametre silindikten sonra) belgeyi yeniden açmalı → Task 2 testi (bir hedefte).
- Sistem sayfasında satırda tam bir "Belgeye git ›" görünmeli (kaynaksızda hiç) → Task 5 standart testi.

---

### Task 1: Ekstre satırına kaynak belge bilgisi

**Files:**
- Modify: `src/Platform/AIERP.Platform.Application/PlatformContracts.cs` (`CustomerStatementLine`)
- Modify: `src/Hosts/AIERP.Api/Program.cs` (`/{id:guid}/statement` işleyicisi, ~1735)
- Modify: `src/Hosts/AIERP.Api/ErpOperationCatalog.cs` (etiketler ~186-203, `statementColumns` ~618)
- Modify: `frontend/erp-web/src/system-pages/customerLedgerOperations.fixture.json`
- Test: `tests/IntegrationTests/CustomerSystemPagesTests.cs`

**Interfaces — Produces:** satır JSON'unda `sourceType: string|null`, `sourceId: guid|null`, `sourceCode: string|null`,
`sourceOpenId: guid|null` (açılacak kayıt: tahsilatta fatura, tedarikçi ödemesinde alış faturası, diğerlerinde `sourceId`).
`cari.ekstre` sütunlarının son dördü bu sırayla.

- [ ] **Step 1: Testleri yaz.** `Computed_members_are_appended_only_where_declared` içinde `TakeLast(10)` beklenen dizi
  `[...mevcut 6, "sourceType", "sourceId", "sourceCode", "sourceOpenId"]`. Yeni `Statement_lines_carry_their_source_document`:
  tohumla satış faturası (kodu `NXR-T1`), ona bağlı tahsilat + dağıtım, faturanın ters kaydı (yalnız `ReversalOfId`), elle
  hareket, dağıtımsız tahsilat. Beklenen: fatura satırı `("SalesInvoice", fatura.Id, "NXR-T1", fatura.Id)`; tahsilat
  `("CustomerCollection", tahsilat.Id, tahsilat.Code, fatura.Id)`; ters kayıt özgününkiyle aynı dörtlü; elle hareket dört null;
  dağıtımsız tahsilat `sourceOpenId` null.
- [ ] **Step 2: Çalıştır, düştüğünü gör.** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomerSystemPagesTests"`
- [ ] **Step 3: Uygula.** `CustomerStatementLine`'a `init` üyeler `SourceType`, `SourceId`, `SourceCode`, `SourceOpenId`
  (kurucu dışı). İşleyici satırları okuduktan sonra tek seferde çözer: ters kayıtların özgün kayıtlarını, sonra yedi FK'ye
  göre belge kodlarını (`Code`; taslakta `InvoiceNumber`) ve tahsilat → ilk dağıtımın `SalesInvoiceId`, ödeme →
  `PurchaseInvoiceId`'yi toplu sorgularla (her tür için `Where(ids.Contains)`), N+1 yok. `ErpOperationCatalog`'a etiket
  `["sourceOpenId"] = "Açılacak belge"`; `statementColumns`'a dört `Append` (`text`, `guid`, `text`, `guid`). Fixture'ı
  katalog çıktısıyla güncelle (fixture testi farkı gösterir).
- [ ] **Step 4: Testler geçer.** Aynı komut + `--filter "FullyQualifiedName~ErpOperationCatalog"`.
- [ ] **Step 5: Commit** `feat(cari): ekstre satırında kaynak belge bilgisi`

### Task 2: Belge ekranları kaydı sayfa parametresiyle açar

**Files:**
- Modify: `frontend/erp-web/src/SalesPage.tsx:459-473` (`tab` parametresi) ve `SalesInvoiceModal` çağrısı
- Modify: `frontend/erp-web/src/SalesInvoiceModal.tsx:70` (`initialTab?: "information" | "transactions"`)
- Modify: `frontend/erp-web/src/document-returns/DocumentReturnsPage.tsx` (`returnId`)
- Modify: `frontend/erp-web/src/purchasing/PurchaseInvoicesScreen.tsx` (`invoiceId` → `openInvoice(id)`)
- Modify: `frontend/erp-web/src/StandaloneSupplierInvoiceDraftPage.tsx` (`draftId`)
- Test: her dosyanın mevcut test dosyasının yanına (yoksa `<bileşen>.pageParams.test.tsx`)

**Interfaces — Produces:** sayfa anahtarı → parametre: `sales-invoices` `invoiceId` (+ `tab=transactions`),
`sales-returns` / `sales-purchase-returns` `returnId`, `sales-purchase-invoices` `invoiceId`,
`sales-purchase-invoice-drafts` `draftId`. `PurchaseInvoiceModal` ödemeleri aynı sayfada gösterdiği için sekme gerekmez.

- [ ] **Step 1: Testleri yaz.** Her hedef için: `setPageParams(key, {param: id})` sonra çiz → ilgili detay isteği
  (`/api/sales/returns/{id}`, `/api/purchasing/returns/{id}` vb.) yapılır ve `usePageParams(key)[param]` boşalır.
  `tab=transactions` ile satış faturası "Tahsilat ve İadeler" sekmesi seçili açılır. Taslak: durumu `Draft` ise düzenleme
  formu açılır; `Posted` ise form açılmaz, satır `currentId` olur ve not
  "`{invoiceNumber}` taslağı muhasebeleştirildi; düzenlenemez." görünür (hata şeridi değil).
  İadede ikinci kez aynı parametre verilince detay yeniden istenir.
- [ ] **Step 2: Düştüğünü gör.** `cd frontend/erp-web && npx vitest run <dosyalar>`
- [ ] **Step 3: Uygula.** `SalesPage.tsx:466` kalıbıyla: `usePageParams(key)[param]` + `useEffect` → `dropPageParam` +
  açma işlevi (`openDetail`, `openInvoice`, `beginEdit`). Taslakta `beginEdit` muhasebeleşmiş taslakta fırlattığı hatayı
  `draftId` yolunda bilgi notuna çevir (mevcut "Düzenle" davranışı değişmez).
- [ ] **Step 4: Testler geçer.**
- [ ] **Step 5: Commit** `feat(belge): satış/alış faturası, iade ve taslak ekranları kaydı parametreyle açar`

### Task 3: Eski ekstre ekranında Belge sütunu ve düğme

**Files:**
- Modify: `frontend/erp-web/src/CustomerLedgerPage.tsx`, `frontend/erp-web/src/customer-ledger-page.css`
- Modify: `frontend/erp-web/src/erp-types.ts:18` (ekstre satırı türüne dört alan)
- Modify: `src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs:58-63` (`customer-ledger-entries`'e `source` alanı, "Belge", görünür, `description`'dan önce)
- Create: `frontend/erp-web/src/customers/customerLedgerSource.ts` — `ledgerSourceTarget(line): { page: string; params: Record<string,string> } | null` ve `LEDGER_SOURCE_LABELS: Record<string,string>`
- Test: `frontend/erp-web/src/customers/customerLedger.test.tsx`, `customerLedgerSource.test.ts`

**Interfaces — Consumes:** Task 1 alanları, Task 2 parametreleri. `ledgerSourceTarget` eşlemesi:
`SalesInvoice → sales-invoices {invoiceId}`, `CustomerCollection → sales-invoices {invoiceId, tab: "transactions"}`,
`SalesReturn → sales-returns {returnId}`, `PurchaseInvoice | SupplierPayment → sales-purchase-invoices {invoiceId}`,
`PurchaseInvoiceDraft → sales-purchase-invoice-drafts {draftId}`, `SupplierReturn → sales-purchase-returns {returnId}`;
id hep `sourceOpenId`; `sourceType` ya da `sourceOpenId` boşsa null.

- [ ] **Step 1: Testleri yaz.** `customerLedgerSource.test.ts`: yedi tür + null. `customerLedger.test.tsx`: "Belge" sütununda
  etiket + numara; "Belgeye git ›" tıklanınca `openWorkspacePage` `{page, params, replace: false, legacy: true}` ile çağrılır
  (numaraya tıklamak da aynı); kaynaksız satırda "—", düğme `disabled` ve `title` = ipucu; İngilizce sözlük girişleri.
- [ ] **Step 2: Düştüğünü gör.**
- [ ] **Step 3: Uygula.** Sütun görünüm alanı `source` ile çizilir; düğme satırın son hücresinde (görünüm dışı, sabit).
  Metinler `localizedUiText` sözlüğüne. Sunucu görünüm alanı + varsa `TenantScreenViewEndpoints` testinin beklenen listesi.
- [ ] **Step 4: Testler geçer.** vitest + `dotnet test --filter "FullyQualifiedName~ScreenView"`
- [ ] **Step 5: Commit** `feat(cari): hareketler ekranında bağlı belgeye git`

### Task 4: Satır işlemi üst sınırı 4 → 6

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs:1721` ve iki hata metni (2045, 2449: "1–6 adet")
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx:1142` (`idList(props.rowActions, 6)`)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/layoutRefs.ts:61` (`MAX_ROW_ACTIONS = 6`)
- Test: şemanın mevcut rowActions testi (yoksa `TenantCustomPageSchemaTests`'e)

Neden: sistem sayfası `pageKey`'i satıra göre seçemiyor; türe göre beş gezinme düğmesi + kaynaksız için pasif düğme = 6.
Satırda yalnız koşulu tutan çizildiği için kullanıcı tek düğme görür.

- [ ] **Step 1: Test:** 6 satır işlemi geçerli, 7 geçersiz ve hata "1–6 adet" içerir.
- [ ] **Step 2: Düştüğünü gör.** **Step 3: Uygula.** **Step 4: Geçer** (dotnet + studio `npm test`).
- [ ] **Step 5: Commit** `feat(sayfa): satır işlemi sınırı 6`

### Task 5: `customer-ledger` standardı sürüm 2

**Files:**
- Modify: `src/Hosts/AIERP.Api/SystemPages/Standards/customer-ledger.json`
- Modify: `tests/IntegrationTests/SystemPageStandards.versions.txt` (`customer-ledger=2`)
- Test: `tests/IntegrationTests/CustomerSystemPagesTests.cs` (`Ledger_is_a_two_step_statement` ve `[InlineData("customer-ledger", …, 2)]`)

**Interfaces — Consumes:** Task 1 sütunları, Task 2 parametreleri, Task 4 sınırı.

- [ ] **Step 1: Test:** `liste.columns` `description`'dan sonra `sourceType`, `sourceCode` içerir; `valueLabels` yedi
  `sourceType:<Tür>=<Türkçe>`; `rowActions` şu altı düğme, hepsi metin "Belgeye git ›", `actionType erpPage`,
  `legacyScreen: true`, `target: newTab`, `disabledWhen "liste.seciliSatir.sourceOpenId == null"`,
  `disabledReason "Bağlı belge açılamıyor."`:

  | id | visibleWhen (`liste.seciliSatir.sourceType ==`) | pageKey | params |
  |---|---|---|---|
  | `belgeSatisFaturasi` | `'SalesInvoice'` | `sales-invoices` | `invoiceId={{liste.seciliSatir.sourceOpenId}}` |
  | `belgeTahsilat` | `'CustomerCollection'` | `sales-invoices` | aynı + `tab=transactions` |
  | `belgeSatisIadesi` | `'SalesReturn'` | `sales-returns` | `returnId=…` |
  | `belgeAlisFaturasi` | `'PurchaseInvoice' \|\| … == 'SupplierPayment'` | `sales-purchase-invoices` | `invoiceId=…` |
  | `belgeAlisIadesi` | `'SupplierReturn'` | `sales-purchase-returns` | `returnId=…` |
  | `belgeTaslak` | `'PurchaseInvoiceDraft'` | `sales-purchase-invoice-drafts` | `draftId=…` |

  Kaynaksız satırda düğme çizilmez, "Belge no" hücresi "—". Yeni öğeler `since: 2`, standart `version: 2`.
- [ ] **Step 2: Düştüğünü gör.** **Step 3: Uygula.** **Step 4: Geçer** (`--filter "FullyQualifiedName~SystemPage"` + `~CustomerSystemPages`).
- [ ] **Step 5: Commit** `feat(cari): ekstre sistem sayfasında belgeye git (sürüm 2)`

Not (taslaktan sapma): kaynaksız satırda sistem sayfası düğme göstermez, "Belge no" hücresi "—" olur; altı yuvanın
tamamı belge türlerine gider. Eski ekranda pasif düğme taslaktaki gibi kalır.

### Task 6: Tam doğrulama

- [ ] `dotnet build AIERP.slnx` uyarısız; `dotnet test tests/IntegrationTests` ve `tests/UnitTests/AIERP.Platform.UnitTests` geçer.
- [ ] `cd frontend/erp-web && npx tsc -b && npx vitest run`; `cd frontend/development-studio && npm test`.
- [ ] Yerel uygulamada eski ekstre ekranından bir fatura, tahsilat ve iade satırının belgesi açılır (run skill).
