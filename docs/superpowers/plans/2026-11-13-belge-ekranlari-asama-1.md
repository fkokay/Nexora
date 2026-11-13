# Ortak Belge Ekranları — Aşama 1 Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satış teklifi, siparişi, irsaliyesi, faturası ile satınalma talebi, siparişi, faturası aynı liste ekranı ve aynı belge ekranıyla çalışır; menü Satış ve Satınalma olarak ayrılır.

**Architecture:** Her belge bir `DocumentDefinition` kaydıdır. `DocumentListPage` ve `DocumentShell` tek kez yazılır; belgeye özgü bölümler (`pages/*`) kabuğa sekme ve işlem olarak takılır. Liste verisi bugünkü gibi `loadAllPages` ile çekilir; arama, sekme adetleri, toplam, sayfalama ve CSV tarayıcıda saf fonksiyonlarla hesaplanır.

**Tech Stack:** React 19, TypeScript, Vite, lucide-react; test için vitest (yeni devDependency).

**Spec:** `docs/superpowers/specs/2026-11-13-satis-satinalma-belge-ekranlari-design.md`

## Global Constraints

- Sunucu ve veritabanı değişmez; yalnızca `frontend/erp-web` değişir.
- Bugün pencerelerde yapılabilen her işlem yeni ekranda da yapılabilir.
- Sütun sırası sabit: Belge no · Tarih · Cari · Kaynak belge · (özgü) · Tutar · Durum.
- Görsel dil mevcut tema: vurgu `#7865e9`, yazı tipi DM Sans / Manrope; mevcut `style.css` sınıfları yeniden kullanılır.
- Arayüz metinleri Türkçe; karşılaştırmalar `toLocaleLowerCase('tr-TR')`.
- Tarayıcı saklama anahtarı: `aierp.docs.<tenantId>.<userId>.<docKey>.<tür>`.
- CSV: UTF-8 BOM, `;` ayraç, ek bağımlılık yok.
- `tsconfig` kuralları: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (tip içe aktarmaları `import type`).
- Commit yalnızca kullanıcı isteyince atılır.

## Review Focus

1. Para birimi karışık listede toplam: tek sayıya toplanmaz, para birimi başına ayrı gösterilir.
2. Aramada Türkçe harf: "ISIK" yazınca "Işık" bulunur (tr-TR küçültme).
3. `localStorage` kapalı/bozuk JSON: ekran çalışmaya devam eder, varsayılana döner.
4. Hash'te olmayan/başka firmaya ait belge kimliği: hata mesajı ve listeye dönüş, boş ekran değil.
5. CSV'de `;`, tırnak veya satır sonu içeren cari adı: alan tırnaklanır, tırnak çiftlenir.

---

### Task 1: Ortak yardımcılar ve tipler

**Files:**
- Create: `src/lib/api.ts`, `src/documents/models.ts`, `src/documents/format.ts`
- Modify: `src/App.tsx` (taşınan tanımlar silinir, içe aktarılır), `package.json` (vitest, `"test": "vitest run"`)
- Test: `src/documents/format.test.ts`

**Interfaces — Produces:**
- `api<T>(url, token?, init?)`, `loadAllPages<T>(url, token)`, `localDateString(date?)` (`lib/api.ts`, App.tsx'teki gövdeler aynen).
- `models.ts`: App.tsx'teki satış/satınalma tipleri (`SalesQuoteSummary` … `PurchaseInvoiceDetail`, `SalesCustomer`, `StockItem`, `Warehouse`, `StockItemUnitConversion`, özel alan tipleri) dışa aktarılır.
- `formatDate(iso: string|null): string` → `12.11.2026`, boşsa `—`.
- `formatMoney(value: number, currency?: string): string` → `184.500,00 TRY`.
- `trLower(s: string): string`, `matchesSearch(haystack: (string|null|undefined)[], query: string): boolean`.

- [ ] Testler: `formatDate('2026-11-12')==='12.11.2026'`, `formatDate(null)==='—'`, `formatMoney(184500,'TRY')==='184.500,00 TRY'`, `matchesSearch(['Işık Ticaret'],'ISIK')===true`, `matchesSearch(['x'],'')===true`.
- [ ] Kırmızı → uygula → yeşil (`npm test`), `npm run build` temiz.

### Task 2: Liste mantığı (saf)

**Files:** Create `src/documents/listLogic.ts`; Test `src/documents/listLogic.test.ts`

**Interfaces — Produces:**
- `type ListTab<T> = { key: string; label: string; match: (row: T, today: string) => boolean }`
- `countTabs<T>(rows, tabs, today): Record<string, number>`
- `filterRows<T>(rows, opts: { tab?: ListTab<T>; query: string; from?: string; to?: string; today: string; searchText: (r:T)=>(string|null|undefined)[]; date: (r:T)=>string }): T[]`
- `sumByCurrency<T>(rows, amount: (r:T)=>number|null, currency: (r:T)=>string|null): { currency: string; total: number }[]` (para birimine göre sıralı; tutarı `null` olan satır atlanır)
- `paginate<T>(rows, page, pageSize): { items: T[]; page: number; pageCount: number; from: number; to: number }` (sayfa aralık dışıysa kırpılır)
- `toCsv(headers: string[], rows: (string|number|null)[][]): string`

- [ ] Testler: Review Focus 1, 2, 5; tarih aralığı uçları dahil; `paginate` boş listede `pageCount===1, from===0`; `toCsv` çıktısı `﻿` ile başlar.
- [ ] Kırmızı → uygula → yeşil.

### Task 3: Tarayıcı saklama

**Files:** Create `src/documents/storage.ts`; Test `src/documents/storage.test.ts`

**Interfaces — Produces:**
- `type DocScope = { tenantId: string; userId: string; docKey: string }`
- `type SavedView = { id: string; name: string; tab: string; query: string; from: string; to: string }`
- `loadViews(scope): SavedView[]`, `saveViews(scope, views)`, `loadHiddenColumns(scope): string[]`, `saveHiddenColumns(scope, keys)`, `loadDraft<T>(scope): T|null`, `saveDraft<T>(scope, draft)`, `clearDraft(scope)`
- Depo parametreyle verilebilir (`storage: Pick<Storage,'getItem'|'setItem'|'removeItem'> = localStorage`).

- [ ] Testler: gidiş-dönüş; bozuk JSON → varsayılan (Review Focus 3); `setItem` fırlatırsa çağrı fırlatmaz; farklı firma/kullanıcı anahtarları karışmaz.
- [ ] Kırmızı → uygula → yeşil.

### Task 4: Belge tanımları

**Files:** Create `src/documents/definitions.ts`; Test `src/documents/definitions.test.ts`

**Interfaces — Produces:**
- `type DocKey = 'sales-quotes'|'sales-orders'|'sales-deliveries'|'sales-invoices'|'purchase-requests'|'purchase-orders'|'purchase-invoices'`
- `type DocSide = 'sales'|'purchase'`; `type FlowStep = 'request'|'quote'|'order'|'delivery'|'invoice'|'return'`
- `type DocColumn<T> = { key: string; label: string; align?: 'right'; fixed?: boolean; render: (row:T)=>string; csv?: (row:T)=>string|number|null }`
- `type DocumentDefinition<T> = { key: DocKey; side: DocSide; step: FlowStep; menuLabel: string; title: string; singular: string; listUrl: string; canCreate: boolean; createLabel: string; emptyText: string; id:(r:T)=>string; code:(r:T)=>string; date:(r:T)=>string; party:(r:T)=>string|null; source:(r:T)=>string|null; amount:(r:T)=>number|null; currency:(r:T)=>string|null; status:(r:T)=>{ label: string; tone: 'neutral'|'info'|'warning'|'success'|'danger' }; tabs: ListTab<T>[]; extraColumns: DocColumn<T>[]; searchText:(r:T)=>(string|null|undefined)[] }`
- `definitions: Record<DocKey, DocumentDefinition<any>>`, `menu: { side: DocSide; label: string; keys: DocKey[] }[]`, `isDocKey(page: string): page is DocKey`

Sabit değerler:
- Menü — Satış: Teklifler, Siparişler, İrsaliyeler, Faturalar; Satınalma: Talepler, Siparişler, Faturalar.
- İşe dönük sekmeler: `sales-orders` "Teslimi geciken" (`status==='Open' && requestedDeliveryDate && requestedDeliveryDate<today`); `purchase-orders` "Teslimi geciken" (`Open|PartiallyReceived` ve `expectedReceiptDate<today`); `purchase-invoices` "Vadesi geçen" (`Posted`, `outstandingAmount>0`, `dueDate<today`); `sales-deliveries` "Faturalanmamış" (`Posted && !hasSalesInvoice`); `sales-quotes` "Süresi dolan" (`Draft|Sent` ve `validUntil<today`).
- Durum adları mevcut ekranlardaki Türkçe karşılıklarla aynı.

- [ ] Testler: her tanımda `tabs[0].key==='all'`; menüdeki her anahtar tanımlı; yukarıdaki beş sekme kuralı için birer olumlu/olumsuz örnek.
- [ ] Kırmızı → uygula → yeşil.

### Task 5: Ortak liste ekranı

**Files:** Create `src/documents/DocumentListPage.tsx`, `src/documents/documents.css`

**Interfaces:**
- Consumes: Task 1–4.
- Produces: `DocumentListPage<T>(props: { definition: DocumentDefinition<T>; token: string; scope: DocScope; reloadKey: number; onOpen: (id: string)=>void; onCreate: ()=>void; renderPreview: (row: T, close: ()=>void)=>React.ReactNode; headerExtra?: React.ReactNode })`

Davranış: spec "Liste ekranı" bölümü. Klavye kısayolları odak bir giriş alanındayken çalışmaz. Sayfa boyutu 25.

- [ ] Uygula; `npm run build` temiz.

### Task 6: Belge kabuğu ve ortak parçalar

**Files:** Create `src/documents/DocumentShell.tsx`, `src/documents/DocumentFlow.tsx`, `src/documents/LinesTable.tsx`, `src/documents/LineEditor.tsx`, `src/documents/CustomFieldsTab.tsx`, `src/documents/PartyCard.tsx`; Test `src/documents/lineMath.test.ts` (+ `lineMath.ts`)

**Interfaces — Produces:**
- `type FlowLink = { step: FlowStep; label: string; state: 'none'|'done'|'current'|'partial'; target?: { key: DocKey; id: string } }`
- `DocumentShell(props: { title: string; code: string; status: {label;tone}; onBack: ()=>void; primary?: { label: string; onClick: ()=>void; disabled?: boolean }; secondary?: { label: string; onClick: ()=>void; danger?: boolean }[]; flow: FlowLink[]; onNavigate: (key: DocKey, id: string)=>void; nextStep?: { text: string; actionLabel?: string; onAction?: ()=>void }; error?: string; notice?: string; onDismiss?: ()=>void; header: React.ReactNode; side?: React.ReactNode; tabs: { key: string; label: string; count?: number; content: React.ReactNode }[]; totals?: { subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; currency: string } })`
- `lineMath.ts`: `lineTotal(l: { quantity; unitPrice; discountPercent; vatPercent }): { net: number; discount: number; tax: number; total: number }`, `documentTotals(lines): { subtotal; discountTotal; taxTotal; grandTotal }` (2 haneye yuvarlama, sunucudaki `SalesQuoteValidation` ile aynı sıra: brüt → iskonto → KDV).
- `LineEditor(props: { lines: DraftLine[]; onChange; stockItems: StockItem[]; units: Record<string, StockItemUnitConversion[]>; balances?: Record<string, number>; priced: boolean })`; `type DraftLine = { stockItemId: string; quantity: string; unitPrice: string; discountPercent: string; vatPercent: string; unitCode: string }`. `Enter` son satırda yeni satır açar.
- `CustomFieldsTab(props: { token; role; basePath: string; documentId: string; values: FieldValue[]; editable: boolean; onSaved: ()=>void; hasHistory: boolean })` — beş kopyalanmış özel alan bloğunun yerini alır (tanım kataloğu + değerler + geçmiş/geri yükleme).
- `PartyCard(props: { token; customerId: string; pendingAmount?: number; currency: string })` — `/api/customers/{id}/balance` (mevcut müşteri ekranının kullandığı servis) ile bakiye ve risk limiti.

- [ ] `lineMath` testleri: `{quantity:400, unitPrice:285, discountPercent:5, vatPercent:20}` → net 108300, tax 21660, total 129960; boş liste → sıfırlar.
- [ ] Kırmızı → uygula → yeşil; `npm run build` temiz.

### Task 7: Belgeye özgü sayfalar

**Files:** Create `src/documents/pages/` altında `SalesQuoteDocument.tsx`, `SalesQuoteEditor.tsx`, `SalesOrderDocument.tsx`, `SalesDeliveryDocument.tsx`, `SalesInvoiceDocument.tsx`, `PurchaseRequestDocument.tsx`, `PurchaseRequestEditor.tsx`, `PurchaseOrderDocument.tsx`, `PurchaseOrderEditor.tsx`, `PurchaseInvoiceDocument.tsx`, `SourcePicker.tsx`

**Interfaces:**
- Consumes: Task 6 kabuğu.
- Produces: her sayfa `(props: { id: string; ctx: DocContext })`, her editör `(props: { ctx: DocContext; sourceId?: string })`; `type DocContext = { token: string; role: string; scope: DocScope; customers: SalesCustomer[]; stockItems: StockItem[]; warehouses: Warehouse[]; open: (key: DocKey, id: string)=>void; create: (key: DocKey, sourceId?: string)=>void; back: ()=>void; changed: ()=>void }`

Taşınacak işlemler (kaynak → hedef):
- `SalesPage` teklif penceresi → `SalesQuoteDocument` (ilet/kabul/ret/siparişe dönüştür, özel alanlar + geçmiş).
- `SalesOrderModal` → `SalesOrderDocument` (teslim tarihi, rezervasyon/çözme, irsaliye oluşturma formu, irsaliye listesi, özel alanlar).
- irsaliye satırı işlemleri → `SalesDeliveryDocument` (iptal, faturala).
- `SalesInvoiceModal` → `SalesInvoiceDocument` (tahsilat, iade, iptal, özel alanlar).
- `PurchasingPanel` talep penceresi → `PurchaseRequestDocument` (karar, tedarikçi teklifleri + karşılaştırma, siparişe dönüştür, özel alanlar).
- `PurchasingPanel` sipariş penceresi → `PurchaseOrderDocument` (mal kabul, maliyet dağıtımı, mal kabul iptali, faturala, özel alanlar).
- `PurchaseInvoiceModal` → `PurchaseInvoiceDocument` (ödeme, iade, iptal).
- "Yeni irsaliye" / "Yeni fatura": `SourcePicker` açık kaynak belgeleri listeler, seçilince kaynak belge sayfası ilgili form açık gelir.

- [ ] Her sayfa için: taşı → `npm run build` temiz → eski koddaki her `api(` çağrısının yeni sayfada karşılığı olduğunu `grep` ile doğrula.

### Task 8: Modül, menü ve yönlendirme

**Files:** Create `src/documents/DocumentsModule.tsx`, `src/documents/route.ts`; Test `src/documents/route.test.ts`; Modify `src/App.tsx`

**Interfaces — Produces:**
- `parseHash(hash: string): { key: DocKey; view: 'list' } | { key: DocKey; view: 'doc'; id: string } | { key: DocKey; view: 'new'; sourceId?: string } | null`, `buildHash(route): string` — biçim `#/sales-orders`, `#/sales-orders/<guid>`, `#/sales-quotes/new`.
- `DocumentsModule(props: { page: DocKey; token: string; role: string; tenantId: string; userId: string; onNavigate: (page: DocKey)=>void })`

App.tsx: `SalesPageKey`/`salesPageTitles` kaldırılır; kenar çubuğunda `menu`'den iki açılır grup (Satış, Satınalma); `page` bir `DocKey` ise `DocumentsModule` çizilir; `SalesPage`, `PurchasingPanel`, `SalesOrderModal`, `SalesInvoiceTable`, `SalesInvoiceModal`, `PurchaseInvoiceModal` ve yalnız onların kullandığı tipler silinir.

- [ ] `route` testleri: üç biçimin gidiş-dönüşü; bilinmeyen anahtar ve bozuk hash → `null` (Review Focus 4).
- [ ] Kırmızı → uygula → yeşil; `npm run build` temiz.

### Task 9: Uçtan uca doğrulama

- [ ] `npm test` ve `npm run build` temiz.
- [ ] Uygulama yerelde açılır; 7 belgenin her birinde: liste, sekme, arama, önizleme, belge sayfası, ana işlem denenir; sonuç ve denenemeyenler raporlanır.
