# Proje 4 — Stok Kartları Pilotu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the standard system page definition for screen key `inventory-stock` (Stok Kartları), built only from designer components and ERP catalog operations. It reaches the v1 parity scope of `docs/superpowers/specs/2026-11-18-stok-esdegerlik-envanteri.md` section 6. When this plan is done:
- a firm admin can open Stok Kartları in the Studio designer ("Tasarımcıda aç");
- the ERP renders it when the screen is enabled, through `SystemPages:StandardEnabled` or through a published firm design.

The standard ships as `version: 1`, `stage: "preview"`. `SystemPages:StandardEnabled` stays empty in production until the user approves the visual draft. The legacy React screen stays as the fallback ("Eski ekranda aç").

**Architecture:**
- **Server, catalog (Task 1).** Two new operations:
  - `uretim.recete.listele`, a BOM list filtered on the server by `productStockItemId`;
  - `ayar.negatifStok`.

  `stok.bakiye.sayfa` gains three additive extensions: an `includeInactive` filter (needed to reach a deactivated card and activate it again), a derived `status` column, and page-summary meta for the four metric cards.
- **Server, rights and schema (Task 2).**
  - An operation-only system page (no SQL query) gives its viewers write rights at the page level. The ERP endpoints stay the authority, as in Proje 1 decision 3. Today the standard is view-only for everyone, so nobody can save through it.
  - One new actionBar prop, `formDialog`.
- **ERP Web, runtime gaps (Task 3).** Five small, general runtime fixes, R1–R5, listed in the Wire contract. Without them Yeni, Aç, the metric cards, role gating and the recipe filter cannot reach parity.
- **The standard itself (Tasks 4–6).** One JSON envelope, `src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json`, authored in three reviewable slices:
  - list, detail and actionBar;
  - card dialog and composite save;
  - movement dialog.

  Every slice is loader-valid on its own and has a server test that loads the embedded standard.
- **Verification (Tasks 7–8).**
  - An erp-web render test drives the real JSON through `TenantCustomPage`.
  - A parity checklist doc lists every v1 item and the component or operation that covers it.
  - A QA-tenant live walk-through follows the checklist.

**Tech Stack:** .NET 10 minimal API, xUnit (`tests/IntegrationTests` with WebApplicationFactory + InMemory), React + TS, Vitest (erp-web), Studio (`npm run build` = tsc + vite, no test runner).

**Spec:**
- `docs/superpowers/specs/2026-11-18-stok-esdegerlik-envanteri.md`: sections 1–4 for legacy behavior, section 5 for gaps, section 6 for the v1 scope.
- `docs/superpowers/specs/2026-11-18-uyarlanabilir-erp-design.md`: Yol haritası 4 and Proje 1 decision 3, "Yetki otoritesi ERP'dir".
- `docs/superpowers/specs/2026-11-18-sistem-sayfalari-design.md`: envelope rules, routing and switch, and screen-view import.
- Builds on these plans in `docs/superpowers/plans/`:
  - `2026-11-18-erp-islem-katalogu.md`;
  - `2026-11-18-proje2-faz-a-bilesenler.md` and `2026-11-18-proje2-faz-b-bilesenler.md` (component rules, condition grammar, sequence run order);
  - `2026-11-18-proje3-sistem-sayfalari.md` (loader, versions file, `/api/system-pages`, ERP routing, Studio system mode).

**Out of Proje 4** (deferred items, from inventory section 6):
- custom-field definition management, value history and restore;
- the category manager;
- the audit "Geçmiş";
- PgUp/PgDn record navigation and the "Önceki: …" display;
- the responsive drawer;
- bulk delete;
- CSV import;
- transfers and the cost manager (`inventory-cost`);
- the `inventory-stock-create` menu key, which stays on the legacy screen;
- the `inventory-stock-movements` screen-view import.

Each of these is listed in the parity checklist with "kapsam dışı" and its fallback, which is "Eski ekranda aç" for the duration of the pilot.

## Global Constraints

- **Additive only.**
  - The new endpoint parameters (`includeInactive`, `productStockItemId`) are optional, and their defaults keep today's responses.
  - The new response fields (`InventoryBalancePageItem.Status` and the page-summary fields of `InventoryBalancePage`) are trailing record members with defaults.
  - Catalog changes are append-only:
    - two new names, recorded in `ErpOperationCatalog.names.txt`, which stays sorted;
    - `stok.bakiye.sayfa` gains one optional parameter, one column and six meta paths appended after the existing four.
  - Nothing is renamed or removed, and no migration is needed.
- **Standards are data.** The envelope has no SQL query and no `code` component, and it uses only catalog operations. Ids are stable from v1 on and are never reused.
- **Every commit is loader-valid.** `SystemPageStandards.All` throws at startup for an invalid envelope, so each of Tasks 4–6 must leave the file valid:
  - every top-level id has an `items` entry;
  - no prop references a component that a later task adds.

  For example, Task 4's actionBar has no `formDialog` and no `hareketlerDugmesi` yet.
- **Caps.** These are the schema limits (`TenantCustomPageSchema`), the pilot's budget, and the headroom target asserted by `Budget_leaves_headroom`:

  | Item | Cap | Pilot | Target |
  |---|---|---|---|
  | components, counted at every depth | 120 | 82 | ≤ 90 |
  | queries | 30 | 25 | ≤ 26 |
  | props per component | 40 | — | ≤ 30 |
  | inputs per formCard (`MaxLayoutInputs`) | 12 | ≤ 7 | |
  | tabs per tabs component | 8 | 8 | |
  | ids per tab | 20 | — | |
  | dialog `contains` | 20 | ≤ 3 | |
  | `moreButtons` | 10 | 3 | |
  | `rowActions` | 4 | 1 | |
  | sequence steps / `sequenceWhen` items | 8 / 8 | 6 / 5 | |
  | operation parameters | 60 | `olustur` ≈ 35 | |
  | definition size | 128 KiB | — | ≤ 100 KiB |

  The headroom leaves room for firm additions.
- **No new privilege.** Page-level write rights for operation-only system pages are UX gates only. Every request still goes to the real endpoint with the user's token, through the permission catalog, Allow/Deny rules, role checks and row visibility. SQL query rights are unchanged.
- **Production switch.** `SystemPages:StandardEnabled` stays `[]` in `appsettings.json`, Compose and the live `.env`. No per-tenant switch is added; see the decision in Task 8.
- **Turkish UI copy.** User-visible copy is Turkish and exactly as pinned in this plan.
- **Protected files.** Do not edit `docs/*.json` or `artifacts/`.
- **Commits.** Stage files by path. Never use `git add -A`, because `.claude/` is untracked. Do not deploy between Tasks 4 and 6: a half-built standard would show "Tasarımcıda aç" in Studio.

## Review Focus

1. **Create never updates the previously selected card.** Setup: select card A, press Yeni (F2), type, then save. The request is `POST /api/stock/items`, never `PUT /api/stock/items/{A}`. The R1 deselect, the R2 dialog reset and the `olustur` guard `kart.rows[0].id == null && olustur.sonuc.id == null` together prevent the update. After a partial failure followed by Yeni, the old `olustur.sonuc` is cleared, so the new card's units are not posted to the previous card. Tests: Task 3 (`yeni clears record table selection so the sequence creates`, `yeni after partial failure clears dialog save results`) and Task 7 (`yeni then save posts exactly one card`).
2. **A TenantUser can do what the legacy screen allowed, and nothing more.**
   - **Allowed:** save card edits, enter movements and reverse movements.
   - **Disabled:** Sil and the unit grid are disabled with a reason.
   - **Write rights.** Page write rights come from Task 2's operation-only rule, so a definition with any SQL query keeps the custom-page access rules.

   Tests: Task 2 (`Operation_only_override_gives_tenant_user_write_rights`, `Override_with_sql_keeps_access_rules`) and Task 7 (`tenant user gating`).
3. **No unfiltered BOM read.** With no card loaded, `uretim.recete.listele` sends no request (R5), and with a card it sends `?productStockItemId=<id>`. Tests: Task 3 (`read with empty required query parameter is not sent`) and Task 7.
4. **The parity claim is honest.** Every v1 item in the inventory has a checklist row with its covering component or operation, or an explicit "fark" or "kapsam dışı" note. Nothing is silently dropped. Review: Task 7's document against inventory sections 1–4 and 6.
5. **The legacy screen is still reachable.** Routing, "Eski ekranda aç" and the failure fallbacks are unchanged from Proje 3. The switch stays off. Review: Task 8 evidence.

---

## Wire contract (shared by every task)

### Server additions (Task 1)

**Balance pages.** `GET /api/warehouses/balances/page` and `GET /api/warehouses/{warehouseId}/balances/page` gain:
- **`includeInactive` (bool, default `false`).** When `true`, the stock item query drops `x.IsActive`. `belowMinimumCount` keeps counting active cards only, which is unchanged.
- **`InventoryBalancePageItem.Status`** (`string`, last member, default `"Yeterli"`). The first matching rule wins:
  1. `"Pasif"` when `!IsActive`;
  2. `"Minimum altı"` when `balance.BelowMinimum`;
  3. `"Maliyetsiz"` when `balance.UnvaluedQuantity > 0`;
  4. otherwise `"Yeterli"`.

  These are the legacy priorities.
- **`InventoryBalancePage` trailing members**, all computed over the **returned page items**, as the legacy summary cards do:

  | Member | Default | Value |
  |---|---|---|
  | `PageValuationAmountBase` | `0` | sum of `ValuationAmountBase` |
  | `PageAvailableQuantity` | `0` | sum of `AvailableQuantity` |
  | `PageUnitCode` | `null` | the single `UnitCode` shared by all page items; `null` when the page is empty or mixes units |
  | `PageAvailableCount` | `0` | items with `AvailableQuantity > 0` |
  | `PageUnvaluedCount` | `0` | items with `UnvaluedQuantity > 0` |
  | `BaseCurrencyCode` | `"TRY"` | tenant base currency |

  Both endpoints build items, status and summary through one helper, `InventoryBalancePageSummary` (`src/Hosts/AIERP.Api/InventoryBalancePageSummary.cs`).

**BOM list.** `GET /api/manufacturing/boms/` gains `Guid? productStockItemId`. When set, it adds `x.ProductStockItemId == productStockItemId` to the tenant-scoped query. Without it, the response is unchanged.

**Catalog changes.** All new entries use `Since = "2026-11-18"`.

| Name | Module | Method / route | Parameters | Result |
|---|---|---|---|---|
| `uretim.recete.listele` | `Üretim` | `GET /api/manufacturing/boms` | `productStockItemId`: `query`, `guid`, **required** | `List(Columns<BomView>(), null)`: scalar columns `id, code, name, productStockItemId, productName, productTrackingMode, outputQuantity, isActive, orderCount, rowVersion` |
| `ayar.negatifStok` | `Ayarlar` | `GET /api/tenant-settings/operations` | none | `Record(Columns<TenantOperationalSettingsView>())`: `tenantId, allowNegativeStock, updatedByUserId, updatedAt, rowVersion` |
| `stok.bakiye.sayfa` (extended) | | | + `includeInactive` (`query`, `bool`, optional), placed after `belowMinimumOnly` | + column `status` (`Durum`, text) appended last; `MetaPaths` = `page, pageSize, totalCount, belowMinimumCount, pageValuationAmountBase, pageAvailableQuantity, pageUnitCode, pageAvailableCount, pageUnvaluedCount, baseCurrencyCode` |

New `Labels` keys (`Label()` throws at static init for a missing key):

| Key | Label |
|---|---|
| `productStockItemId` | `"Mamul stok kartı"` |
| `productName` | `"Mamul"` |
| `productTrackingMode` | `"Mamul izleme türü"` |
| `outputQuantity` | `"Çıktı miktarı"` |
| `orderCount` | `"Üretim emri sayısı"` |
| `tenantId` | `"Firma kimliği"` |
| `allowNegativeStock` | `"Negatif stoka izin ver"` |
| `updatedByUserId` | `"Güncelleyen"` |
| `updatedAt` | `"Güncellenme"` |
| `status` | `"Durum"` |

Add only the keys that `Columns<T>()` actually needs. An existing key is never relabelled.

### Page rights and `formDialog` (Task 2)

**Runtime rights of an operation-only system page.** `GET /api/system-pages/{screenKey}/published` returns `rights` through one helper:

```csharp
// SystemPageEndpoints.cs
internal static CustomPageRightsView RuntimeRights(CustomPageRights rights, string definitionJson) =>
    TenantCustomPageQueries.HasSqlQueries(definitionJson)
        ? CustomPageRightsView.From(rights)
        : new CustomPageRightsView(rights.View, rights.View, rights.View, rights.View);
```

- **Override mode** passes the `CustomPageAccess.GetRightsAsync` result.
- **Standard mode** passes `View` for members, so a standard gives members `(true, true, true, true)` because standards never contain SQL.
- **Non-members** stay 403.
- **Unchanged:** `/api/custom-pages/*` rights, batch rights, the SQL query-run path and `RestrictsMembersWithoutRow`.

The justification is Proje 1 decision 3: for ERP operations the ERP endpoints are the authority, and page-level write rights exist only to gate SQL writes. Studio already shows the access panel only for system definitions with SQL (Proje 3 Task 6), so an access row's write flags cannot be configured for an operation-only page.

**`formDialog`** (actionBar, v2):
- **Allowed values.** It is a string, the id of a `dialog` component on the page. It is added to `SafePropsV2` and to `ActionBarProps`. Errors:
  - `"'formDialog' yalnız İşlem Çubuğu'nda kullanılabilir."`
  - `"'formDialog' sayfadaki bir pencere kimliği olmalıdır: <id>"`
- **Ownership.** It does not own the dialog: a dialog may be both `formDialog` and opened by buttons.

### Runtime gaps R1–R5 (Task 3, erp-web)

| # | Gap found in code | Fix |
|---|---|---|
| R1 | `startNew` (`TenantCustomPage.tsx`) resets grids, blocks and the actionBar's save-path `sonuc`, but keeps table selections. With a row selected, Yeni followed by save runs the update path. | `startNew` also clears the selection of every **record table** (`recordTableSets.all`). It clears the `sonuc` of every write query in the actionBar save path **and** in the `formDialog`'s `saveQuery`/`saveSequence`. `userSelect` clears the same combined list on a record-table row change. |
| R2 | `buildPageCommands` hard-codes `open: unbound`. `newInputs` is capped at 12, while the card has 33 fields, and Yeni cannot open a dialog. | With `formDialog` set, **Yeni** (F2) runs the existing `confirmStartNew` and `startNew`. It then resets every input the dialog owns, directly or through tabs/formCards, with the same reset as `resetOnOpen`. It opens the dialog if it is closed, and after paint focuses `newInputs[0]` while activating its tab. **Aç** (Enter) is enabled when any record table of a formCard owned by the dialog has a selection, and opens the dialog (`resetOnOpen` applies). Otherwise it shows `"Önce bir kayıt seçin"`. Without `formDialog`, behavior is unchanged. |
| R3 | A metric without `query`/`source` renders through `TenantReportWidget` with its value unformatted and the "unbound" style. A metric filter calls `setInput(id, "true")`, a string, even for a checkbox input. | In the runtime, a v2 metric whose `value` prop was a binding renders `MetricCard` with `formatCell(value, format)`, where `format` is `number` or `money`; any other value means text. It shows `"—"` for empty values and uses the normal style. Metric activation on a checkbox input sets `true`/`false`. |
| R4 | Single-query writes check only page rights, not the catalog `allowed` flag. Sequences already check it. These writes are actionBar save/delete, `query` buttons (also in `moreButtons`) and row actions. | Each of them is disabled with `"Bu işlem için yetkiniz yok"` when the bound operation query has `allowed === false`. Row actions and buttons render disabled with that reason. |
| R5 | `missingRouteValue` skips a read only for empty **route** values, so an empty optional or required query parameter still sends the request. | A **read** whose operation declares a `required` parameter (any `in`) with an empty resolved value is not sent. It behaves like a missing route value: rows are empty and no error is shown. Only `uretim.recete.listele` has such a query parameter today. |

Studio (Task 3) adds `formDialog` to `managedKeys`, an actionBar inspector select listing dialog ids ("Kayıt penceresi"), and a reconcile rule that deletes it when the dialog is gone. Unknown keys were already preserved, so nothing else changes.

### The standard: ids, queries and bindings (Tasks 4–6)

**Envelope header:**

```json
{ "screenKey": "inventory-stock", "title": "Stok Kartları",
  "description": "Stok kartları, depo bakiyeleri ve stok hareketleri.", "module": "Stok & Depo",
  "version": 1, "stage": "preview" }
```

- **`items`.** Every top-level component and every query has an item with `"since": 1` and a Turkish `label` of at most 80 characters.
- **`requires`.** Each data component's item lists the read queries it binds (`query`, `sourceQuery`, `definitionsQuery`, `valuesQuery`, `optionsQuery`). Owners (tabs, dialogs, formCards, the actionBar) list their owned component items. In v1 every item has `since: 1`, so nothing is ever offered as "Yeni", but the lists keep future additions self-contained.
- **`SystemPageStandards.versions.txt`** gains `inventory-stock=1` in Task 4.

**Queries (25).** `runOn: "load"` for reads.

| Id (= name) | Operation | Kind | Bindings (parameter=value) | Task |
|---|---|---|---|---|
| `bakiye` | `stok.bakiye.sayfa` | read | `warehouseId={{depoSecimi.value}}`, `q={{aramaKutusu.value}}`, `belowMinimumOnly={{minimumAlti.value}}`, `includeInactive={{pasifler.value}}`, `page={{liste.sayfa}}`, `pageSize={{liste.sayfaBoyutu}}` | 4 |
| `depolar` | `depo.listele` | read | — | 4 |
| `kart` | `stok.kart.getir` | read | `id={{liste.seciliSatir.stockItem.id}}` | 4 |
| `kartDepolari` | `stok.kart.depoBakiyeleri` | read | `id={{liste.seciliSatir.stockItem.id}}` | 4 |
| `sonHareketler` | `stok.kart.hareketleri` | read | `stockItemId={{liste.seciliSatir.stockItem.id}}` (bindings must be a single `{{path}}`, so literals such as `pageSize=5` are not allowed; the endpoint's default page is used and the table draws 5 rows with `limit: 5`) | 4 |
| `kartSil` | `stok.kart.sil` | delete | `id={{liste.seciliSatir.stockItem.id}}` | 4 |
| `pasifeAl` | `stok.kart.pasifeAl` | update | `id={{kart.rows[0].id}}` (rowVersion from the `kart` source) | 4 |
| `aktifEt` | `stok.kart.aktifEt` | update | `id={{kart.rows[0].id}}` | 4 |
| `kategoriler` | `stok.kategoriler` | read | — | 5 |
| `negatifStok` | `ayar.negatifStok` | read | — | 5 |
| `birimler` | `stok.kart.birimleri` | read | `id={{kart.rows[0].id}}` | 5 |
| `ozelTanimlar` | `stok.ozelAlanTanimlari` | read | — | 5 |
| `ozelDegerler` | `stok.kart.ozelAlanDegerleri` | read | `id={{kart.rows[0].id}}` | 5 |
| `varyantlar` | `stok.kart.varyantlari` | read | `id={{kart.rows[0].id}}` | 5 |
| `receteler` | `uretim.recete.listele` | read | `productStockItemId={{kart.rows[0].id}}` | 5 |
| `olustur` | `stok.kart.olustur` | insert | every `StockItemWriteRequest` scalar except `isActive` and `customFields` = `{{<input>.value}}` (field map below), `customFields={{ozelAlanlar.degerler}}`, `variants={{varyantMatrisi.satirlar}}` | 5 |
| `guncelle` | `stok.kart.guncelle` | update | `id={{kart.rows[0].id}}`, every `StockItemUpdateRequest` scalar except `rowVersion` = `{{<input>.value}}` | 5 |
| `birimEkle` | `stok.kart.birimEkle` | insert | `id={{kart.rows[0].id}}`, `unitCode={{birimIzgarasi.eklenenSatir.unitCode}}`, `factorToBase={{birimIzgarasi.eklenenSatir.factorToBase}}` | 5 |
| `birimEkleYeni` | `stok.kart.birimEkle` | insert | as `birimEkle`, with `id={{olustur.sonuc.id}}` | 5 |
| `birimSil` | `stok.kart.birimSil` | delete | `id={{kart.rows[0].id}}`, `conversionId={{birimIzgarasi.silinenSatir.id}}` | 5 |
| `ozelKaydet` | `stok.kart.ozelAlanKaydet` | update | `id={{kart.rows[0].id}}`, `values={{ozelAlanlar.degerler}}` | 5 |
| `konumlar` | `depo.konumlari` | read | `warehouseId={{depoSecimi.value}}` | 6 |
| `hareketler` | `stok.hareket.listele` | read | `warehouseId={{depoSecimi.value}}`, `stockItemId={{liste.seciliSatir.stockItem.id}}`, `page={{hareketTablosu.sayfa}}`, `pageSize={{hareketTablosu.sayfaBoyutu}}` | 6 |
| `hareketEkle` | `stok.hareket.ekle` | insert | `warehouseId={{depoSecimi.value}}`, `stockItemId={{liste.seciliSatir.stockItem.id}}`, `entryDate={{hareketTarihi.value}}`, `direction={{hareketYonu.value}}`, `quantity={{hareketMiktari.value}}`, `description={{hareketAciklamasi.value}}`, `unitCostBase={{birimMaliyet.value}}`, `unitCode={{hareketBirimi.value}}`, `storageLocationId={{hareketKonumu.value}}`, `tracking={{izlemeSatirlari.satirlar}}` | 6 |
| `tersKayit` | `stok.hareket.tersKayit` | insert | `warehouseId={{depoSecimi.value}}`, `stockItemId={{liste.seciliSatir.stockItem.id}}`, `entryId={{hareketTablosu.seciliSatir.id}}`, `reason={{tersKayitDugmesi.yanit}}` | 6 |

**Card field map (33 inputs).**
- **Defaults.** Every input's `defaultValue` is `{{kart.rows[0].<field>}}`, except `takipTuru`, whose default is that binding when it is set (create mode has no `kart` row, so every default resolves to `""`).
- **Server defaults on create.** An empty value is omitted from the body, so the server defaults apply: `TRY`, KDV 20 and the others. The inputs use placeholders to show them.
- **Field codes.** Field names are the camelCase `StockItemWriteRequest`/`StockItemUpdateRequest` parameter names.
- **Number inputs** use `step: 0.0001` unless noted.

| Card (formCard, columns) | Input id | Field | Type and rules |
|---|---|---|---|
| `kimlikKarti` "Kimlik" (3) | `kod` | `code` | text, required, maxLength 64, upperCase, label "Stok kodu" |
| | `ad` | `name` | text, required, maxLength 200, "Stok adı" |
| | `barkod` | `barcode` | text, maxLength 64, "Barkod" |
| | `kategori` | `category` | lookup, `optionsQuery: kategoriler`, value/label column `name`, minChars 0, allowClear, "Kategori" |
| | `takipTuru` | `trackingMode` | lookup, `staticOptions: ["None=Takip yok","Lot=Lot","Serial=Seri"]`, minChars 0, "Lot / seri takibi" |
| | `anaBirim` | `unitCode` | text, required, maxLength 8, upperCase, "Ana birim" |
| `stokKarti` "Stok yönetimi" (3) | `minimumStok` | `minimumStock` | number, min 0, "Minimum stok" |
| | `maksimumStok` | `maximumStock` | number, min 0, "Maksimum stok" |
| | `yenidenSiparisNoktasi` | `reorderPoint` | number, min 0, "Yeniden sipariş noktası" |
| | `emniyetStoku` | `safetyStock` | number, min 0, "Emniyet stoku" |
| | `tedarikSuresi` | `procurementLeadTimeDays` | number, min 0, max 3650, step 1, "Tedarik süresi (gün)" |
| | `uretimSuresi` | `manufacturingLeadTimeDays` | number, min 0, max 3650, step 1, "Üretim süresi (gün)" |
| `fiyatKarti` "Fiyat ve indirim" (3) | `alisFiyati` | `purchaseListPrice` | number, min 0, "Alış liste fiyatı" |
| | `satisFiyati` | `salesListPrice` | number, min 0, "Satış liste fiyatı" |
| | `fiyatParaBirimi` | `priceCurrencyCode` | text, maxLength 3, upperCase, `pattern: "^[A-Z]{3}$"`, patternMessage "Üç harfli para birimi kodu girin (ör. TRY).", placeholder "TRY", "Fiyat para birimi" |
| | `alisIndirimi` | `purchaseDiscountPercent` | number, 0–100, "Alış iskonto %" |
| | `satisIndirimi` | `salesDiscountPercent` | number, 0–100, "Satış iskonto %" |
| `vergiKarti` "Vergi" (3) | `alisKdv`, `satisKdv`, `otv`, `oiv`, `tevkifat`, `damgaVergisi` | `purchaseVatPercent`, `salesVatPercent`, `exciseTaxPercent`, `communicationTaxPercent`, `withholdingTaxPercent`, `stampTaxPercent` | number, 0–100; labels from the catalog `Labels`; placeholder "20" on the two KDV inputs |
| `lojistikKarti` "Lojistik" (3) | `netAgirlik`, `brutAgirlik`, `uzunluk`, `genislik`, `yukseklik` | `netWeight`, `grossWeight`, `length`, `width`, `height` | number, min 0 |
| `muhasebeKarti` "Muhasebe" (3) | `alisHesabi`, `satisHesabi`, `maliyetHesabi` | `purchaseAccountCode`, `salesAccountCode`, `costAccountCode` | text, maxLength 40 |
| `gorselKarti` "Görsel ve pazaryeri" (2) | `gorsel` | `productImageUrl` | text, maxLength 1000, placeholder "https://…", "Ürün görseli bağlantısı" |
| | `pazaryeriKimligi` | `marketplaceProductId` | text, maxLength 120, "Pazaryeri ürün kimliği" |

The seven card formCards above, and only those, have `recordKey: "{{kart.rows[0].id}}"` and `trackChanges: true`. `suzgecKarti` and `hareketFormu` have neither, because a `recordKey` there would reset the filters or the movement entry on every row change.

**Conditions use scalar paths only.** The Faz A grammar normalizes objects and arrays to `null`, so `liste.seciliSatir != null` is always false. Test for a selection with `liste.seciliSatir.stockItem.id != null`.

Rules that stay server-only (inventory section 4):
- unique code and barcode;
- `maximumStock ≥ minimumStock`;
- the tracking mode is locked once the card has movements;
- deactivation needs a zero balance and no open order lines;
- no posting into a closed period.

Their errors appear under the bound input through the field-error mapping.

**Components (82).** Top level, with owners in parentheses:

| Task | Id | Type | Key props |
|---|---|---|---|
| 4 | `komutlar` | actionBar | Task 4: `deleteQuery: kartSil`, `focusInput: aramaKutusu`, `exportTable: liste`, `moreButtons: [devreDisiBirak, etkinlestir]`. Task 5 adds `formDialog: kartPenceresi`, `newInputs: [kod]`. Task 6 appends `hareketlerDugmesi` to `moreButtons`. |
| 4 | `aramaKutusu` | input text (owner: `liste` searchInput) | label "Ara", placeholder "Kod, ad, barkod veya kategori" |
| 4 | `suzgecKarti` | formCard "Süzgeçler" (3) | `inputs: [depoSecimi, minimumAlti, pasifler]` |
| 4 | `depoSecimi` | input lookup (`suzgecKarti`) | `optionsQuery: depolar`, `optionValueColumn: id`, `optionLabelColumn: name`, `optionDescriptionColumn: code`, `staticOptions: ["=Tüm depolar"]`, minChars 0, allowClear, label "Depo" |
| 4 | `minimumAlti` | input checkbox (`suzgecKarti`) | label "Minimum altı ({{bakiye.meta.belowMinimumCount}})" |
| 4 | `pasifler` | input checkbox (`suzgecKarti`) | label "Pasif kartları da göster" |
| 4 | `stokDegeriGostergesi` | metric | title "Stok değeri", `value: "{{bakiye.meta.pageValuationAmountBase}}"`, `format: money`, description "Bu sayfa · {{bakiye.meta.baseCurrencyCode}}", icon `wallet` |
| 4 | `kullanilabilirGostergesi` | metric | title "Kullanılabilir", `value: "{{bakiye.meta.pageAvailableQuantity}}"`, `format: number`, description "Bu sayfa · {{bakiye.meta.pageUnitCode}}", variant `success`, icon `box`, `visibleWhen: "bakiye.meta.pageUnitCode != null"` |
| 4 | `kullanilabilirKartGostergesi` | metric | title "Kullanılabilir stoklu kart", `value: "{{bakiye.meta.pageAvailableCount}}"`, `format: number`, description "Bu sayfa", variant `success`, icon `box`, `visibleWhen: "bakiye.meta.pageUnitCode == null"` |
| 4 | `minimumAltiGostergesi` | metric | title "Minimum altı", `value: "{{bakiye.meta.belowMinimumCount}}"`, `format: number`, description "Seçili kapsam (arama hariç)", variant `danger`, icon `alert`, `filterInput: minimumAlti`, `filterValue: "true"` |
| 4 | `maliyetsizGostergesi` | metric | title "Maliyetsiz", `value: "{{bakiye.meta.pageUnvaluedCount}}"`, `format: number`, description "Bu sayfa", variant `warning`, icon `alert` |
| 4 | `liste` | dataTable | see "List table" below |
| 4 | `detaySekmeleri` | tabs | `tabs: ["Özet=ozetPaneli", "Depolar=kartDepoTablosu", "Hareketler=sonHareketTablosu"]`, `visibleWhen: "liste.seciliSatir.stockItem.id != null"` |
| 4 | `ozetPaneli` | contextPanel (`detaySekmeleri`) | `table: liste`, title "{{liste.seciliSatir.balance.code}} · {{liste.seciliSatir.balance.name}}", fields (10) listed in "Detail" below |
| 4 | `kartDepoTablosu` | dataTable (`detaySekmeleri`) | `query: kartDepolari`, `columns: [warehouseCode, warehouseName, quantityOnHand, reservedQuantity, availableQuantity, valuationAmountBase, unvaluedQuantity]`, emptyText "Bu kartın depo bakiyesi yok." |
| 4 | `sonHareketTablosu` | dataTable (`detaySekmeleri`) | `query: sonHareketler`, `limit: 5`, `columns: [entryDate, warehouseCode, direction, quantity, description]`, emptyText "Hareket yok." |
| 4 | `devreDisiBirak` | button (`komutlar` menu) | text "Devre dışı bırak", `actionType: query`, `queryId: pasifeAl`, confirmEnabled, confirmText "“{{liste.seciliSatir.balance.name}}” devre dışı bırakılsın mı? Bakiyesi sıfır olmayan veya açık siparişte kullanılan kart devre dışı bırakılamaz.", successMessage "Stok kartı devre dışı bırakıldı.", `refreshQueries: [bakiye]`, `visibleWhen: "liste.seciliSatir.stockItem.isActive == true"` |
| 4 | `etkinlestir` | button (`komutlar` menu) | text "Etkinleştir", `queryId: aktifEt`, confirmEnabled, confirmText "“{{liste.seciliSatir.balance.name}}” yeniden etkinleştirilsin mi?", successMessage "Stok kartı etkinleştirildi.", `refreshQueries: [bakiye]`, `visibleWhen: "liste.seciliSatir.stockItem.isActive == false"` |
| 5 | `kartPenceresi` | dialog | `presentation: drawer`, title "Stok kartı {{kart.rows[0].code}}", `contains: [kartSekmeleri]`, `saveSequence: [olustur, guncelle, birimEkleYeni, birimEkle, birimSil, ozelKaydet]`, `stopOnError: true`, `sequenceWhen` (below), saveLabel "Kaydet", closeOnSave, resetOnOpen, `refreshQueries: [bakiye]` |
| 5 | `kartSekmeleri` | tabs (`kartPenceresi`) | the 8 tabs below |
| 5 | 7 formCards + 33 inputs | formCard / input | field map above |
| 5 | `negatifStokYasak`, `negatifStokIzinli`, `negatifStokBilinmiyor` | text (tab Genel) | "Negatif stoka izin verilmez (sistem kuralı)" / "Negatif stoka izin veriliyor (sistem kuralı)" / "Negatif stok kuralı şirket ayarlarından gelir (sistem kuralı)", with `visibleWhen` `negatifStok.rows[0].allowNegativeStock == false` / `== true` / `== null` |
| 5 | `gorselOnizleme` | image | `value: "{{gorsel.value}}"`, title "Ürün görseli", height 160, fit `contain` |
| 5 | `birimIzgarasi` | editableGrid stage | `sourceQuery: birimler`, rowKey `id`, `gridColumns: ["unitCode\|Birim\|text\|required,unique,upperCase,maxLength:8", "factorToBase\|Ana birim katsayısı\|number\|required,min:0.000001"]`, fixedRowLabel "Ana birim: {{anaBirim.value}} (1)", `disabledWhen: "kullanici.rol != 'TenantAdmin'"`, disabledReason "Birim dönüşümlerini yalnız firma yöneticisi değiştirebilir.", title "Birim dönüşümleri" |
| 5 | `ozelAlanlar` | customFieldsBlock | `definitionsQuery: ozelTanimlar`, `valuesQuery: ozelDegerler`, columns 2, title "Özel alanlar" |
| 5 | `varyantMatrisi` | editableGrid matrix | `matrixCode: "{{kod.value}}"`, `matrixName: "{{ad.value}}"`, title "Varyant boyutları", `visibleWhen: "kart.rows[0].id == null"` |
| 5 | `varyantListesi` | dataTable | `query: varyantlar`, `columns: [code, name, barcode, isActive]`, emptyText "Bu kartın varyantı yok.", `visibleWhen: "kart.rows[0].id != null"` |
| 5 | `receteListesi` | dataTable | `query: receteler`, `columns: [code, name, outputQuantity, isActive, orderCount]`, emptyText "Bu stok kartını üreten reçete yok.", `visibleWhen: "kart.rows[0].id != null"` |
| 6 | `hareketlerDugmesi` | button (`komutlar` menu) | text "Hareketler / ekle", `actionType: openDialog`, `dialogId: hareketPenceresi`, `visibleWhen: "liste.seciliSatir.stockItem.id != null"`, `disabledWhen: "depoSecimi.value == null"`, disabledReason "Hareket için önce bir depo seçin." |
| 6 | `hareketPenceresi` | dialog | `presentation: dialog`, title "Stok hareketleri · {{liste.seciliSatir.balance.code}} · {{depoSecimi.seciliSatir.name}}", `contains: [hareketFormu, izlemeSatirlari, hareketTablosu]`, `saveQuery: hareketEkle`, saveLabel "Hareketi kaydet", closeOnSave, resetOnOpen, `refreshQueries: [hareketler, kartDepolari, sonHareketler, bakiye]` (the dialog closes on success, so refreshing `bakiye`, which clears the list selection, is acceptable here) |
| 6 | `hareketFormu` | formCard "Yeni hareket" (2) | `inputs: [hareketYonu, hareketTarihi, hareketBirimi, hareketMiktari, hareketAciklamasi, hareketKonumu, birimMaliyet]` |
| 6 | 7 movement inputs | input | see "Movement inputs" below |
| 6 | `izlemeSatirlari` | editableGrid list | `gridColumns: ["trackingCode\|Lot / seri kodu\|text\|required,unique,maxLength:80", "quantity\|Miktar\|number\|required,min:0.0001", "expiryDate\|Son kullanma tarihi\|date"]`, maxRows 200, title "Lot / seri satırları", description "Seri numaralarında miktar 1 olmalı ve son kullanma tarihi boş kalmalıdır; lotlarda son kullanma tarihi zorunludur.", `visibleWhen: "liste.seciliSatir.stockItem.trackingMode != 'None'"` |
| 6 | `hareketTablosu` | dataTable | `query: hareketler`, `paging: server`, pageSize 50, `columns: [entryDate, direction, quantity, enteredQuantity, enteredUnitCode, unitCostBase, storageLocationCode, description, isReversal, hasReversal]`, `rowActions: [tersKayitDugmesi]`, emptyText "Bu depoda hareket yok." |
| 6 | `tersKayitDugmesi` | button (row action of `hareketTablosu`) | text "Ters kayıt", `actionType: query`, `queryId: tersKayit`, promptLabel "Ters kayıt gerekçesi", promptRequired, `disabledWhen: "hareketTablosu.seciliSatir.hasReversal \|\| hareketTablosu.seciliSatir.isReversal"`, disabledReason "Bu hareket zaten ters kayıtla düzeltilmiş ya da kendisi bir ters kayıt.", successMessage "Ters kayıt oluşturuldu.", `refreshQueries: [hareketler, kartDepolari, sonHareketler]`. It **must not** contain `bakiye`. A single write reruns only its `refreshQueries` (`runQueryWrite`), and a `bakiye` rerun returns new row objects, so `QueryTable` drops the `liste` selection (`state.rows.includes(selected)`) while the dialog is still open. That would empty `hareketler` and break the next reversal. |

**List table `liste`:**
- `query: bakiye`, `paging: "server"`, pageSize 25, `searchInput: aramaKutusu`, title "Stok kartları".
- `columns: [balance.code, balance.name, stockItem.category, balance.quantityOnHand, balance.reservedQuantity, balance.availableQuantity, balance.minimumStock, balance.valuationAmountBase, balance.unvaluedQuantity, status]`.
- `columnFormats`: `balance.code=code`, the five quantity columns `=number`, `balance.valuationAmountBase=money`, `status=status`.
- `toneMap: ["Minimum altı=danger", "Maliyetsiz=warning", "Yeterli=success", "Pasif=info"]`.
- `footerMeta: ["belowMinimumCount=Minimum altı"]`.

**Detail `ozetPaneli` fields:**
- `balance.quantityOnHand=Bakiye`
- `balance.availableQuantity=Kullanılabilir`
- `balance.reservedQuantity=Rezerve`
- `balance.minimumStock=Minimum`
- `balance.valuationAmountBase=Stok değeri`
- `balance.unvaluedQuantity=Maliyetsiz`
- `stockItem.category=Kategori`
- `balance.unitCode=Birim`
- `stockItem.trackingMode=Lot / seri`
- `status=Durum`

**Card tabs `kartSekmeleri`:**
- `"Genel=kimlikKarti,stokKarti,negatifStokYasak,negatifStokIzinli,negatifStokBilinmiyor"`
- `"Fiyat ve vergi=fiyatKarti,vergiKarti"`
- `"Lojistik ve muhasebe=lojistikKarti,muhasebeKarti"`
- `"Görsel=gorselKarti,gorselOnizleme"`
- `"Birimler=birimIzgarasi"`
- `"Özel alanlar=ozelAlanlar"`
- `"Varyantlar=varyantMatrisi,varyantListesi"`
- `"Reçeteler=receteListesi"`

**`kartPenceresi.sequenceWhen`** (exact; `birimSil` has no condition because its iteration list is empty on create):
- `olustur=kart.rows[0].id == null && olustur.sonuc.id == null`
- `guncelle=kart.rows[0].id != null`
- `birimEkleYeni=kart.rows[0].id == null`
- `birimEkle=kart.rows[0].id != null`
- `ozelKaydet=kart.rows[0].id != null`

**Movement inputs:**

| Input | Type and rules |
|---|---|
| `hareketYonu` | lookup, `staticOptions: ["Receipt=Giriş","Issue=Çıkış"]`, minChars 0, required, defaultValue "Receipt", "Yön" |
| `hareketTarihi` | date, required, defaultValue "{{bugun}}", "Tarih" |
| `hareketBirimi` | lookup, `optionsQuery: birimler`, value/label column `unitCode`, minChars 0, allowClear, placeholder "Ana birim ({{liste.seciliSatir.balance.unitCode}})", "Hareket birimi" |
| `hareketMiktari` | number, required, min 0.0001, step 0.0001, "Miktar" |
| `hareketAciklamasi` | text, required, maxLength 240, "Açıklama" |
| `hareketKonumu` | lookup, `optionsQuery: konumlar`, value `id`, label `name`, description `code`, minChars 0, allowClear, `visibleWhen: "konumlar.rows[0].id != null"`, "Depo konumu" |
| `birimMaliyet` | number, min 0, `visibleWhen: "hareketYonu.value == 'Receipt'"`, "Birim maliyet" |

**`screenViews`:**

```json
[ { "key": "inventory-stock", "component": "liste",
    "fields": { "code": "balance.code", "name": "balance.name", "category": "stockItem.category",
                "quantityOnHand": "balance.quantityOnHand", "reservedQuantity": "balance.reservedQuantity",
                "availableQuantity": "balance.availableQuantity", "minimumStock": "balance.minimumStock",
                "valuationAmountBase": "balance.valuationAmountBase", "unvaluedQuantity": "balance.unvaluedQuantity",
                "status": "status" } } ]
```

`actions` (`İşlemler`, Fixed) has no mapping. Because it is fixed it never produces a note. Only visibility is imported, per the Proje 3 rule.

---

### Task 1: Server — catalog parity operations and balance page additions

**Files:**
- Create: `src/Hosts/AIERP.Api/InventoryBalancePageSummary.cs`. It holds `internal static class InventoryBalancePageSummary` with `Status(bool isActive, InventoryBalanceView balance)` and `Page(IReadOnlyList<InventoryBalancePageItem> items, int page, int pageSize, int totalCount, int belowMinimumCount, string baseCurrency)`.
- Modify: `src/Platform/AIERP.Platform.Application/PlatformContracts.cs`. Add the trailing record members from the Wire contract.
- Modify: `src/Hosts/AIERP.Api/Program.cs`, in both `/balances/page` handlers (~2901, ~2969):
  - add the `includeInactive` parameter and filter;
  - build each item with `Status`;
  - return the page through `InventoryBalancePageSummary.Page`.
- Modify: `src/Hosts/AIERP.Api/ManufacturingEndpoints.cs`. In `boms.MapGet("/")` (~521), add the `Guid? productStockItemId` filter.
- Modify: `src/Hosts/AIERP.Api/ErpOperationCatalog.cs`:
  - add the `stok.bakiye.sayfa` parameter, column and meta;
  - add `uretim.recete.listele` and `ayar.negatifStok` in a new `BuildStockPilotV1()` iterator called from `Build()`;
  - add the new label keys.
- Modify: `tests/IntegrationTests/ErpOperationCatalog.names.txt`. Add `ayar.negatifStok` first and `uretim.recete.listele` last; the file stays sorted.
- Modify: `tests/IntegrationTests/ErpOperationCatalogTests.cs`. `Flatten_and_meta_are_consistent` pins the extended `MetaPaths` list, and `Depo_operations_use_depo_module` is unchanged.
- Test: `tests/IntegrationTests/InventoryBalancePageAdditionsTests.cs` (new, InMemory, both routes)

**Interfaces (Produces):** the Wire contract "Server additions". Tasks 4 and 5 consume the column `status`, the six meta paths and the two operation names.

- [ ] **Step 1: Write failing tests:**
  - **`InventoryBalancePageAdditionsTests`:**
    - `Default_page_excludes_inactive_cards`: an active and an inactive card; the default request returns only the active one, as today.
    - `Include_inactive_returns_inactive_with_status_pasif`: both routes.
    - `Status_follows_legacy_priority`: one card below minimum that is also unvalued, one only unvalued, one sufficient. The statuses are `Minimum altı`, `Maliyetsiz` and `Yeterli`.
    - `Below_minimum_count_ignores_include_inactive`.
    - `Page_summary_sums_returned_items_only`: page size 2 of 3 cards; `pageValuationAmountBase` and `pageAvailableQuantity` cover only the two returned items.
    - `Page_unit_code_is_null_for_mixed_or_empty_page`.
    - `Page_counts_available_and_unvalued_cards`.
    - `Base_currency_code_is_tenant_base_currency`.
    - `Per_warehouse_page_has_same_additions`.
  - **`ErpOperationCatalogTests`** (add):
    - `Recipe_list_operation_requires_product_filter`: module `Üretim`, `GET /api/manufacturing/boms`, a single parameter `productStockItemId` with `In = query`, `Type = guid` and `Required = true`, and the columns from the Wire contract.
    - `Negative_stock_setting_operation_reads_settings`: module `Ayarlar`, shape `record`, a column `allowNegativeStock` of type `bool`.
    - `Balance_page_accepts_include_inactive_and_status`.
    - `Bom_list_filters_by_product_stock_item`: InMemory, two BOMs for two products. The filter returns one, no filter returns both, and another tenant's BOM is never returned.
  - The existing `Every_operation_matches_a_registered_endpoint` covers the new routes. `Names_are_append_only` and `Names_are_unique_and_well_formed` cover the names file and the since/kind rules.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~InventoryBalancePageAdditions|FullyQualifiedName~ErpOperationCatalog"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the two balance handlers' existing queries. Only the item filter, the item construction and the return statement change. Do not reformat the handlers.
- [ ] **Step 4: Run** the same filter, then `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~Inventory|FullyQualifiedName~Manufacturing|FullyQualifiedName~CustomPage"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): stok pilotu için reçete ve negatif stok işlemleri, bakiye sayfası durum ve özet alanları`.

### Task 2: Server — runtime rights of operation-only system pages and `formDialog`

**Files:**
- Modify: `src/Hosts/AIERP.Api/SystemPageEndpoints.cs`. Add `RuntimeRights` (Wire contract) and use it in both branches of `GET /{screenKey}/published`. The standard branch passes `new CustomPageRights(true, false, false, false)` into the helper, so a standard (never SQL) yields full page rights for members.
- Modify: `docs/superpowers/specs/2026-11-18-sistem-sayfalari-design.md`. Section 7 "Çalışma zamanında görme hakkı" and section 3 "Hakları yalnız görmedir" are rewritten to the new rule: "SQL sorgusu olmayan sistem sayfasında sayfa yazma hakları görme hakkına eşittir; yetkiyi ERP uç noktaları verir." This reverses a written Proje 3 decision, which that plan explicitly deferred to Proje 4.
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`:
  - add `formDialog` to `SafePropsV2` and `ActionBarProps`;
  - validate it after the loop against `ComponentTypesById`, with the errors from the Wire contract.
- Test:
  - `tests/IntegrationTests/SystemPageEndpointsIntegrationTests.cs` (extend). Use the existing config pattern for `SystemPages:StandardEnabled` (~line 564) and test-injected `ISystemPageStandardSet` envelopes.
  - `tests/IntegrationTests/TenantCustomPageSchemaFormDialogTests.cs` (new).

**Interfaces:** Consumes nothing. Produces the rights rule that Tasks 7–8 rely on, and the `formDialog` prop that Tasks 3 and 5 rely on.

- [ ] **Step 1: Write failing tests:**
  - **Update, not only extend.** Every existing `SystemPageEndpointsIntegrationTests` assertion that pins standard-mode rights as view-only (`CustomPageRightsView(true, false, false, false)`) is changed to the new rule.
  - `Standard_mode_gives_members_write_rights`: a TenantUser on an enabled standard gets `rights = { view, insert, update, delete }`, all `true`.
  - `Operation_only_override_gives_tenant_user_write_rights`: a published firm row without SQL and without an access row.
  - `Override_with_sql_keeps_access_rules`: a published firm row with one SQL query and no access row. The TenantUser gets 403 from `/published`, which is today's behavior.
  - `Override_with_access_row_without_view_is_forbidden`: a `SelectedUsers` row that excludes the user gives 403.
  - `Non_member_is_forbidden_in_standard_mode`.
  - Schema:
    - `Accepts_form_dialog_on_action_bar`;
    - `Rejects_form_dialog_on_other_type`;
    - `Rejects_form_dialog_unknown_id`;
    - `Rejects_form_dialog_pointing_to_non_dialog`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPageEndpoints|FullyQualifiedName~TenantCustomPageSchemaFormDialog"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the filter, then `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPage|FullyQualifiedName~CustomPage|FullyQualifiedName~TenantCustomPageSchema"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): yalnız ERP işlemli sistem sayfalarında yazma hakkı ve İşlem Çubuğu kayıt penceresi`.

### Task 3: ERP Web (+ Studio) — runtime gaps R1–R5

**Files:**
- Modify: `frontend/erp-web/src/custom-page/pageActions.ts`:
  - `PageActionDeps` gains `queryAllowed(id: string): boolean` and `formDialog?: { open(): void; hasRecord: boolean }`;
  - `buildPageCommands` implements the R2 new/open rules and the R4 save/delete gates.
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`:
  - **R1.** `startNew` and `userSelect` clear the combined save-path `sonuc` and the record-table selections.
  - **R2.** Wire `formDialog`: reset the owned inputs, open the dialog, focus the first `newInputs` input and activate its tab.
  - **R3.** The bound metric path.
  - **R4.** `actionAllowed` also checks `queryAllowed` for `query` actions, buttons and row actions.
- Modify: `frontend/erp-web/src/custom-page/erpOperations.ts`, `usePageQueries.ts` (R5): `missingRouteValue` → `missingRequiredValue`, covering every `required` parameter of a **read**. The old name is kept as an alias if other modules import it.
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - add `formDialog` to `managedKeys`;
  - add the actionBar inspector select "Kayıt penceresi", listing dialog ids;
  - in the reconcile, delete `formDialog` when its dialog is gone.
- Test:
  - `frontend/erp-web/src/custom-page/TenantCustomPageFormDialog.test.tsx` (new);
  - extend `pageActions.test.ts`, `MetricCard.test.tsx` (or `TenantCustomPageLayout.test.tsx`), `usePageQueries.erp.test.tsx`, `TenantCustomPageSequence.test.tsx`.

**Interfaces:** Consumes the Wire contract (R1–R5, `formDialog`). It needs no server code to test. Task 7 consumes the behavior.

- [ ] **Step 1: Write failing tests:**
  - **R1:**
    - `yeni clears record table selection so the sequence creates`: card A is selected; after Yeni and save, the mocked `api` receives `POST /api/stock/items` and no `PUT`.
    - `yeni after partial failure clears dialog save results`: `olustur` succeeds and `birimEkleYeni` fails; Yeni, then save posts a new card.
  - **R2:**
    - `form dialog: yeni opens dialog, resets owned inputs and focuses first new input`. The input sits on tab 0 while tab 2 is active; afterwards tab 0 is active.
    - `form dialog: aç needs a selection` (`"Önce bir kayıt seçin"`).
    - `form dialog: aç opens dialog with record values`.
    - `form dialog: F2 inside open dialog confirms when dirty`.
    - `no form dialog: open stays unbound`.
  - **R3:** `bound metric value is formatted as money`, `empty bound metric shows dash`, `metric filter toggles checkbox input` (the checkbox is checked and the bound bool parameter is sent as `true`).
  - **R4:** `delete disabled when operation not allowed` (`pageActions.test.ts`), `query button and row action disabled when operation not allowed`.
  - **R5:** `read with empty required query parameter is not sent`, `read with bound required query parameter is sent`, `optional empty query parameter still sends` (unchanged).
- [ ] **Step 2: Run** `npx vitest run src/custom-page` in `frontend/erp-web`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run build` in `frontend/erp-web`, and `npm run build` in `frontend/development-studio`. Expected: PASS and clean builds.
- [ ] **Step 5: Commit** `feat(erp-web): kayıt penceresi, Yeni seçimi temizler, bağlı gösterge biçimi, işlem yetkisi ve zorunlu parametre denetimi`.

### Task 4: Standard, part 1 — envelope, list, metrics, detail panel, state commands

**Files:**
- Create: `src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json`, holding:
  - the header;
  - `items` and `screenViews`;
  - the Task 4 components and queries from the Wire contract.

  The existing `<EmbeddedResource Include="SystemPages\Standards\*.json" />` picks the file up.
- Modify: `tests/IntegrationTests/SystemPageStandards.versions.txt` (`inventory-stock=1`, sorted).
- Modify: `frontend/erp-web/src/system-pages/systemPageKeys.ts` (`new Set(["inventory-stock", "inventory-warehouses"])`). It goes in **this** commit, because `systemPageKeys.test.ts` compares it with the Standards folder.
- Test: `tests/IntegrationTests/InventoryStockStandardTests.cs` (new). It loads `SystemPageStandards.All["inventory-stock"]`, so it exercises the real embedded resource and the loader. Helpers:

  ```csharp
  private static JsonObject Definition();               // parsed standard.DefinitionJson
  private static JsonObject Component(string id);       // any depth
  private static JsonObject Query(string id);
  private static string? Binding(string queryId, string parameter);
  ```

**Interfaces:** Consumes Task 1 (`status`, meta, `includeInactive`) and Task 2 (nothing yet; `formDialog` arrives in Task 5). Produces the stable ids that Tasks 5–7 extend.

- [ ] **Step 1: Write failing tests:**
  - `Header_is_preview_version_1`: title "Stok Kartları", module "Stok & Depo".
  - `List_is_server_paged_on_balances`. Paging `server`, pageSize 25 and `searchInput: aramaKutusu`. Every `bakiye` binding is exactly as in the Wire contract, including `{{liste.sayfa}}`/`{{liste.sayfaBoyutu}}`.
  - `List_columns_follow_screen_view_mapping`: `columns` equals the `screenViews[0].fields` values in catalog order.
  - `Status_column_has_tone_map_and_format`.
  - `Warehouse_lookup_offers_all_warehouses`: `staticOptions` `"=Tüm depolar"`, `optionsQuery: depolar`.
  - `Metrics_bind_page_meta`: the five metrics, their values, formats and `visibleWhen`; `minimumAltiGostergesi` has `filterInput: minimumAlti`, `filterValue: "true"`.
  - `Detail_tabs_show_summary_warehouses_and_last_movements`: tab ids, `sonHareketler` binds only `stockItemId`, and the table has `limit: 5`.
  - `State_commands_are_menu_buttons`: `moreButtons` contains `devreDisiBirak` and `etkinlestir`, and their `visibleWhen` strings are as pinned. `pasifeAl`/`aktifEt` bind `{{kart.rows[0].id}}`, and the `kart` query binds the list selection.
  - `Action_bar_part_1`: `deleteQuery: kartSil`, `exportTable: liste`, `focusInput: aramaKutusu`.
  - `Screen_view_import_hides_mapped_columns`. `SystemPageMerge.ImportScreenViews` with `status` and `category` hidden removes `status` and `stockItem.category` from `columns` and from `columnFormats`, and adds no note for `actions`.
  - `Budget_leaves_headroom`. This test is kept and re-run in Tasks 5–6. Components ≤ 90 at all depths, queries ≤ 26, the definition ≤ 100 KiB (UTF-8), no component with more than 30 props, and no SQL or code.
  - The existing `Embedded_standards_are_valid`, `Versions_file_matches` and `Every_restricted_version_validates` now also cover `inventory-stock`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~InventoryStockStandard|FullyQualifiedName~SystemPageStandards"`. Expected: FAIL.
- [ ] **Step 3: Author** the JSON slice. Run `npx vitest run src/system-pages` in `frontend/erp-web`.
- [ ] **Step 4: Run** the filter, then `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPage"`. Expected: PASS. A schema error from the loader names the offending id; fix the JSON, never the schema.
- [ ] **Step 5: Commit** `feat(sistem-sayfalari): Stok Kartları standart tanımı — liste, göstergeler ve detay paneli`.

### Task 5: Standard, part 2 — card dialog, all scalar fields, composite save

**Files:**
- Modify: `src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json`:
  - add the Task 5 queries and components;
  - add `formDialog: kartPenceresi` and `newInputs: [kod]` to `komutlar`;
  - add their `items`.
- Modify: `tests/IntegrationTests/InventoryStockStandardTests.cs`

**Interfaces:** Consumes Task 2 (`formDialog` schema) and Task 4's ids. Produces the card ids that Task 7's render test drives.

- [ ] **Step 1: Write failing tests:**
  - **`Every_create_field_has_an_input`.** Reflect over `StockItemWriteRequest`'s constructor parameters the way the catalog does: scalar types only, camelCase names, excluding `isActive` and `customFields`. Each parameter is bound in `olustur` to `{{<input>.value}}` of an input listed in the field map. The test also asserts that `customFields={{ozelAlanlar.degerler}}` and `variants={{varyantMatrisi.satirlar}}`.
  - **`Every_update_field_has_an_input`.** The same for `StockItemUpdateRequest` against `guncelle`, excluding `rowVersion` (source-backed) and with `id={{kart.rows[0].id}}`.
  - **`Inputs_default_to_card_record`.** Every field-map input's `defaultValue` is `{{kart.rows[0].<field>}}`.
  - **`Input_rules_match_field_map`.** A table-driven test over the 33 rows: required, maxLength, upperCase, min/max/step, pattern and the lookup sources.
  - **`Form_cards_track_the_card_record`.** 7 formCards, each with `recordKey: "{{kart.rows[0].id}}"`, `trackChanges: true` and at most 12 inputs.
  - **`Card_tabs_cover_every_section`.** 8 tabs, labels as pinned.
  - **`Card_dialog_save_sequence_guards_duplicate_creates`.** The exact `saveSequence` and `sequenceWhen` lists, and `stopOnError: true`.
  - **`Action_bar_opens_card_dialog`.** `formDialog: kartPenceresi`, `newInputs: [kod]`.
  - **`Units_grid_is_admin_only_and_staged`.** Stage mode, `sourceQuery: birimler`, the `disabledWhen` and reason as pinned, and the `birimEkle`/`birimEkleYeni`/`birimSil` iteration bindings.
  - **`Custom_fields_variants_and_recipes`.**
    - The block's queries.
    - Matrix `visibleWhen` for create only, and the read-only variant list for edit only.
    - `receteler` binds `productStockItemId={{kart.rows[0].id}}`, and its operation's parameter is required (R5 relies on this).
  - **`Negative_stock_notes_cover_three_states`.**
  - **`Budget_leaves_headroom`** (re-run).
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~InventoryStockStandard"`. Expected: FAIL.
- [ ] **Step 3: Author** the JSON slice.
- [ ] **Step 4: Run** the filter and `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPage"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sistem-sayfalari): Stok Kartları standart tanımı — kart penceresi ve bileşik kayıt`.

### Task 6: Standard, part 3 — movement dialog, list and reversal; endpoint smoke

**Files:**
- Modify: `src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json`:
  - add the Task 6 queries and components;
  - append `hareketlerDugmesi` to `komutlar.moreButtons`;
  - add their `items`.
- Modify: `tests/IntegrationTests/InventoryStockStandardTests.cs`
- Create: `tests/IntegrationTests/InventoryStockStandardEndpointTests.cs`. It uses the real embedded set, InMemory and the `StandardEnabled` config pattern.

**Interfaces:** Consumes Tasks 1–5.

- [ ] **Step 1: Write failing tests:**
  - **`InventoryStockStandardTests`:**
    - `Movement_dialog_contains_form_tracking_and_list`: `saveQuery: hareketEkle` and `refreshQueries` as pinned.
    - `Every_movement_parameter_is_bound`: every `stok.hareket.ekle` parameter is bound exactly as pinned, including `tracking={{izlemeSatirlari.satirlar}}`, and `tersKayit` binds `reason={{tersKayitDugmesi.yanit}}`.
    - `Movement_inputs_follow_legacy_rules`: required fields, `maxLength 240`, the `visibleWhen` of location, unit cost and tracking grid, and the `hareketTarihi` default `{{bugun}}`.
    - `Movement_list_is_server_paged_by_50`.
    - `Reversal_asks_for_a_reason_and_skips_reversed_rows`.
    - `Movements_button_needs_a_warehouse`.
    - `Budget_leaves_headroom` (final numbers, which are also reported in the commit body).
  - **`InventoryStockStandardEndpointTests`:**
    - `Runtime_map_lists_inventory_stock_only_when_enabled`;
    - `Published_standard_serves_definition_with_member_write_rights`;
    - `Draft_from_standard_imports_inventory_stock_screen_view`: a published `TenantScreenView` for `inventory-stock` with "Kategori" hidden removes `stockItem.category`;
    - `Untracked_movement_accepts_empty_tracking_list`: `POST .../transactions` with `tracking: []` on a `None` card returns 2xx. A hidden `list` grid still sends `[]`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~InventoryStockStandard"`. Expected: FAIL.
- [ ] **Step 3: Author** the JSON slice.
- [ ] **Step 4: Run** the filter, then the whole solution: `dotnet test AIERP.slnx`. Expected: PASS, including `ArchitectureBoundaryTests` and the permission-catalog coverage tests.
- [ ] **Step 5: Commit** `feat(sistem-sayfalari): Stok Kartları standart tanımı — hareket penceresi ve ters kayıt`.

### Task 7: ERP Web render test of the real standard + parity checklist

**Files:**
- Create: `frontend/erp-web/src/system-pages/inventoryStockStandard.test.tsx`.
  - It reads `../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json` with `readFileSync`, like `systemPageKeys.test.ts`.
  - It renders `TenantCustomPage` in system mode, with `../erpApi` mocked to return fixtures for every route in the Wire contract, the erp-operations catalog and a token payload with `role`.
  - It follows `TenantCustomPageSequence.test.tsx` and `TenantCustomPageErp.test.tsx`.
- Create: `docs/superpowers/specs/2026-11-18-stok-pilot-esdegerlik-kontrol.md`, the parity checklist.

**Interfaces:** Consumes Task 3 (R1–R5) and Task 6 (the final JSON).

- [ ] **Step 1: Write the render tests.** Each is expected to pass once Tasks 3 and 6 are merged. A failure is a runtime or JSON defect: fix it in the owning file and name the fix in the commit.
  - `list requests balances page with filters and paging`:
    - the first request is `/api/warehouses/balances/page?…page=1&pageSize=25`;
    - choosing a warehouse switches to `/api/warehouses/{id}/balances/page`;
    - checking "Pasif kartları da göster" sends `includeInactive=true`.
  - `metrics show formatted page meta and minimum filter toggles`.
  - `yeni then save posts exactly one card`. Select a row, press F2: the drawer opens on tab Genel. Type a code, name and unit, then press Ctrl+S. There is exactly one `POST /api/stock/items` and no `PUT`.
  - `aç then save sends PUT with source rowVersion and custom field PUT`.
  - `unit staging sends POST and DELETE after card save`.
  - `tenant user gating`. The token role is `TenantUser` and the catalog has `stok.kart.sil` and the unit operations with `allowed:false`. Sil is disabled with `"Bu işlem için yetkiniz yok"`, the unit grid shows the admin-only reason, and card save is enabled.
  - `recipes are read only with product filter`. No `/api/manufacturing/boms` request goes out before a card loads; afterwards the request carries `productStockItemId`.
  - `movement dialog posts movement and reversal sends reason`. "Hareketler / ekle" is disabled without a warehouse. Then:
    - the movement POST carries `tracking: []` for an untracked card;
    - "Ters kayıt" asks "Ters kayıt gerekçesi" and posts `{ reason }`;
    - "Ters kayıt" is disabled on a row with `hasReversal`.
  - `deactivate confirms and shows server conflict text`. A 409 body `{ error: "…" }` is shown.
  - `reversal keeps the movement list usable`. After one successful reversal the `liste` selection is kept and `hareketler` still has rows. A second reversal on another row posts with that row's `entryId`.
  - `clearing an optional field on edit`. Empty the barcode and `maksimumStok` on an existing card and save, then record what the `PUT` body carries: `null`/absent or the source value. If the source value is kept, the field cannot be cleared from the page. This becomes the checklist row "İsteğe bağlı alanı boşaltma", with status `fark`, and is reported to the controller; it is not fixed in this plan.
- [ ] **Step 2: Run** `npx vitest run src/system-pages/inventoryStockStandard` in `frontend/erp-web`. Expected: PASS.
- [ ] **Step 3: Write the parity checklist.** It is the live QA script; Turkish, in the style of the inventory. Its sections mirror inventory sections 1–4 and 6. Each row has these columns:

  | Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
  |---|---|---|---|

  **Durum** is one of:
  - `karşılandı`;
  - `fark` (covered differently, with the difference stated);
  - `sunucu kuralı` (enforced by the endpoint; the page shows its error);
  - `kapsam dışı` (with the fallback "Eski ekranda aç").

  **Canlı sonuç** is filled in Task 8. These rows must be present:

  | Item | Durum |
  |---|---|
  | Every list column | covered |
  | The level bar | `fark`: replaced by the `Durum` tone and the server-derived status |
  | Quantity+unit in one cell | `fark`: unit in the detail panel and the metric description |
  | Column labels from the catalog ("Eldeki miktar" for "Depo bakiyesi") | `fark` |
  | Excel export | `fark`: exports the visible page only |
  | Bulk delete | `kapsam dışı` |
  | Detail tab queries load eagerly with the 300 ms debounce, not on tab open | `fark` |
  | Detail panel toggle Ctrl+. | `kapsam dışı` |
  | Enter on a focused row | `fark`: Aç acts on the selected row |
  | Create defaults (TRY, KDV 20) | `fark`: applied by the server, shown as placeholders |
  | Serial quantity 1 and lot expiry | `sunucu kuralı`: shown under the tracking grid |
  | The movement dialog closes after save, and the list selection is cleared by the balance refresh | `fark` |
  | After a reversal the list balance updates on dialog close or Yenile | `fark` |
  | Clearing an optional field (barcode, maximum stock) on edit | outcome of the Task 7 test |
  | A user without manufacturing read | `fark`: the recipes tab shows the authorization error instead of an empty list |
  | `inventory-stock-create` | `kapsam dışı`: stays legacy |
  | Category manager | `kapsam dışı` |
  | Custom-field definitions | `kapsam dışı` |
  | Custom-field history | `kapsam dışı` |
  | "Geçmiş" | `kapsam dışı` |
  | PgUp/PgDn and "Önceki" | `kapsam dışı` |
  | CSV export Ctrl+E | `fark`: Ctrl+E is the Excel export |
  | `inventory-stock-movements` view import | `kapsam dışı` |

  Every inventory section 4 "Yalnız sunucuda kalan kurallar" item is a `sunucu kuralı` row.
- [ ] **Step 4: Run** `npm test` and `npm run build` in `frontend/erp-web`. Expected: PASS.
- [ ] **Step 5: Commit** `test(erp-web): Stok Kartları standart tanımı çizim testleri ve eşdeğerlik kontrol listesi`.

### Task 8: Live verification (QA Test Firma 20261117 only; controller)

**Switch decision.**
- **No per-tenant switch is added.** `SystemPages:StandardEnabled` is global (`SystemPageEndpoints.EnabledStandards`), and it stays `[]` everywhere.
- **QA path.** The live check goes through a **firm design published only in the QA tenant**: "Tasarımcıda aç" → draft from the standard → publish.
  - The sistem sayfaları design names this as the per-firm pilot mechanism ("Firma bazında pilot için anahtar gerekmez").
  - After Task 2, override mode and standard mode share one rights rule, `RuntimeRights`.
  - A draft created from the standard is the standard's definition plus the visibility-only screen-view import.
  - So the QA override exercises the same definition and the same rights as standard mode.
- **Standard mode itself** (synthetic id, `source: "standard"`) is covered by `InventoryStockStandardEndpointTests` and by Task 7.
- **Studio preview alone is not enough**, because preview never runs writes.

**Steps:**
1. **Deploy.** Deploy after merge with no migration. Confirm that `/api/system-pages/runtime` in the QA tenant returns `{ screens: {} }` and that ERP → Stok Kartları shows the legacy screen.
2. **Visual draft approval gate.** As TenantAdmin in QA, open Studio → Sayfalar → "Stok kartları" → "Tasarımcıda aç".
   - The card shows "Sistem sayfası", "Önizleme" and the preview-stage warning.
   - The import notes are shown.
   - Take designer and preview screenshots of the list, the drawer (every tab) and the movement dialog, and **show them to the user**.
   - **Stop until the user approves the visual draft.** Do not publish before that, even in QA.
3. **Publish in QA only, after approval.** Then walk **every row** of `2026-11-18-stok-pilot-esdegerlik-kontrol.md` as TenantAdmin and again as TenantUser, filling "Canlı sonuç". Use QA-only test cards, prefixed `QA-P4-`. Reverse movements instead of deleting them, because the ledger is append-only.
4. **Fallbacks.**
   - "Eski ekranda aç" shows the legacy screen with the bar, and "Yeni tasarıma dön" returns.
   - "Standarda dön" creates a draft.
   - "Firma tasarımını kaldır" returns ERP to the legacy screen.
5. **Afterwards.**
   - Remove the QA firm design, unless the user asks to keep it.
   - Deactivate the QA test cards where their balance allows.
   - Record the evidence.

**Docs.**
- In `docs/phase-status.md`, write: "Proje 4: Stok Kartları standart tanımı (v1, önizleme) ve eşdeğerlik kontrol listesi; QA firmasında firma tasarımı yoluyla doğrulandı; geçiş anahtarı hiçbir ekranda açık değil; üretim geçişi kullanıcı onayı bekliyor". Make no production-readiness claim.
- Turning on `SystemPages:StandardEnabled` for `inventory-stock` in production is a **separate, later step**. It needs the user's explicit approval of the visual draft and of the filled checklist, and it is not part of this plan.

---

## Parallelism

- **Wave 1 (parallel).** The file sets are disjoint. Only Task 1 edits `Program.cs`, and only Task 2 edits the schema and `SystemPageEndpoints.cs`.
  - Task 1: catalog, balance page and BOM filter (`ErpOperationCatalog.cs`, `Program.cs`, `ManufacturingEndpoints.cs`, `PlatformContracts.cs`, the new summary file, the names file).
  - Task 2: rights and `formDialog` schema (`SystemPageEndpoints.cs`, `TenantCustomPageSchema.cs`).
  - Task 3: erp-web runtime gaps plus the Studio `formDialog` control. Only `frontend/` is touched.
- **Wave 2.** Task 4 starts after Tasks 1 and 2 are merged: the loader validates `status` and the meta paths against the catalog, and the schema must know `formDialog` before Task 5.
- **Wave 3.** Task 5 starts after Task 4, because both edit `inventory-stock.json` and `InventoryStockStandardTests.cs`.
- **Wave 4.** Task 6 starts after Task 5, for the same reason.
- **Wave 5.** Task 7 starts after Tasks 3 and 6. It renders the final JSON with the R1–R5 runtime.
- **Last.** Task 8, by the controller, after everything is merged and deployed, with the approval gate in step 2.
