# Proje 2 Faz B — Kalan Bileşenler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the stock pilot v1 the components Faz A left out:
- **B1** a multi-operation save (`saveSequence`, G8) on the actionBar, on buttons and on dialogs;
- **B2** selection-dependent lists with row actions. These are expressed as `dataTable` extensions (`rowActions`, `emptyText`, `limit`), not as a new `dependentList` type. Row actions can ask for confirmation or for a reason;
- **B3** an `editableGrid` with three modes:
  - `stage`: unit conversions, applied by the save sequence;
  - `list`: lot/serial allocations, sent as a body list;
  - `matrix`: variants, built as a cartesian product on create;
- **B4** a `customFieldsBlock` that draws dynamic inputs from the definitions and saves through a map parameter;
- **B5** an `image` display component, and a `dialog` container (dialog or drawer) with its own Ctrl+S scope, used for the movement window;
- **B6** formCard change tracking, in a minimal form:
  - `recordKey` reset (**not optional**: today a value typed for card A is saved onto card B);
  - a dirty counter;
  - a leave confirmation on row change, Yeni and dialog close.

  The "Önceki: …" display, PgUp/PgDn navigation and the browser/workspace tab-close guard are deferred.

**Architecture:**
- **Server, catalog.** `ErpOperationParameter` gains two additive collection types:
  - `list`, which carries `items` describing the row fields;
  - `map`, for code → value maps.

  Three existing operations gain optional collection parameters: `stok.kart.olustur` (`customFields`, `variants`), `stok.hareket.ekle` (`tracking`) and `stok.kart.ozelAlanKaydet` (`values`). No operation names are added.
- **Server, schema.** `TenantCustomPageSchema` validates the new props and types, and resolves collection bindings, sequence steps, row-action ownership and dialog ownership after the component loop.
- **ERP Web, pure modules.** `saveSequence.ts` is the sequence runner. `gridState.ts` holds the column spec, row validation, the stage/list/matrix reducers and the scope. `customFields.ts` holds the definition → field mapping. `inventory/variantDrafts.ts` is the variant generator extracted from `InventoryPage.tsx`, so the old and new screens produce identical variants.
- **ERP Web, components.** `EditableGrid`, `CustomFieldsBlock`, `PageDialog` and `PageImage`. The rest is wiring in `TenantCustomPage.tsx`.
- **Studio.** The palette, inspector, canvas, binding suggestions and reconcile rules learn the same props.
- **Client-side checks are UX only.** Sequences, grid rules and required custom fields run in the browser; every server rule, right and validation is unchanged.

**Tech Stack:** .NET 10 minimal API, xUnit (`tests/IntegrationTests`, WebApplicationFactory + InMemory), React + TS, Vitest (erp-web), Studio (`npm run build` = tsc + vite, no test runner).

**Spec:**
- `docs/superpowers/specs/2026-11-18-uyarlanabilir-erp-design.md` (Yol haritası 2; Proje 1 decision 2: "İç içe ve dizi alanlar list tipindedir … sayfadan düzenlenmeleri Proje 2'deki satır düzenlenen tabloyla gelir").
- `docs/superpowers/specs/2026-11-18-stok-esdegerlik-envanteri.md` (section 4 composite blocks; section 5 G8 and components 4, 5, 6, 7, 9, 10, plus the dialog/drawer container; section 6 v1 scope).
- Builds on `docs/superpowers/plans/2026-11-18-erp-islem-katalogu.md` (Proje 1), `2026-11-18-sayfa-kod-koprusu.md` (Proje 2b: `beforeSave`/`afterSave`) and `2026-11-18-proje2-faz-a-bilesenler.md` (conditions, tabs, lookup, paging, validation, `bodyMap`).

**Out of Faz B:**
- formCard "Önceki: …" display, PgUp/PgDn record navigation, and the browser or workspace tab-close unsaved guard (inventory section 6 already defers them).
- In-place update of existing grid rows. There is no `birimGuncelle` operation, and the old screen only adds and deletes units.
- A grid "immediate" mode that runs add/remove queries per click.
- `uretim.recete.listele` (it needs a server-side filter) and category/custom-field definition management.
- Server-side hooks (Proje 5).
- Drag reordering of grid rows.

## Global Constraints

- **No new operation names.** Faz B changes only the parameter lists of three existing operations, additively. `ErpOperationCatalog.names.txt` is unchanged.
- **Additive changes only.**
  - A page that binds none of the new parameters sends byte-identical requests.
  - The new wire field `parameters[i].items` is always present: `null` except on `list` parameters.
  - The existing props, `saveQuery`, `queryId`, the v1 schema and the Faz A behavior are unchanged.
- **Props stay flat.** `SafeValue` allows only strings, numbers, booleans and arrays of at most 40 strings, with no `<`, `>` or `{{`. Every structured prop is therefore a string-item array, like `tabs`/`footerMeta`. Bindable text goes only into props listed in `BindableProps`.
- **Do not touch `TenantCustomPageQueries.ReservedNames`.** `SessionValue` overwrites every SQL parameter whose root is reserved, and `ConditionRoots` copies the set. The new name `onceki` is reserved in `ValidName` only.
- **No new privilege.** A sequence calls the same catalog operations, one request per step and row, with the user's token. The client gates (page rights, `allowed`, conditions, validation) are UX; the server decides.
- **Turkish UI copy.** User-visible copy is Turkish and exactly as pinned in this plan.
- **Upper-casing.** `upperCase` uses JS `toUpperCase()`, as in Faz A.
- **Caps (v2 only).**
  - Top-level and children component arrays rise from 80 to 120. The pilot needs about 33 scalar inputs, 8 form cards, about 12 movement-dialog inputs, plus tables, tabs and grids, and tabs and dialogs own components by id at the top level.
  - Queries stay 30; the pilot counts about 26 (`Task 9` lists them).
  - Props stay 40. v1 keeps 80 components and 30 props.
- **Ownership by id, not nesting.** Tabs, dialogs and table row actions own components by id. One component has at most one owner of any kind, and `children` stays on `section`/`card` only.
- **Twins.** Every erp-web pure module that Studio mirrors has a twin file with the header comment `erp-web/src/custom-page/<file> ile aynıdır; biri değişirse diğeri de güncellenmelidir.` Faz B twins: `gridColumns` (inside `gridState.ts` / Studio `gridColumns.ts`) and the `erpOperations` collection rules.
- **Protected files.** Do not edit `docs/*.json` or `artifacts/`.
- **Commits.** Stage files by path. Never use `git add -A`, because `.claude/` is untracked.

## Review Focus

1. **Partial failure does not duplicate the card.** Setup:
   - a create sequence `olustur` → `birimEkleYeni` (iterating over two staged unit rows);
   - unit row 2 fails.

   The status reads `"Stok kartına birim ekle (satır 2/2) başarısız: … Önceki 2 işlem kaydedildi; kalan adımlar çalıştırılmadı."`. Unit row 1 leaves the staged list and row 2 stays. Pressing save again sends **only** the row-2 POST. `olustur` is skipped by its `sequenceWhen` (`olustur.sonuc.id == null`), and the unit step binds `{{olustur.sonuc.id}}` from the persisted state. Test: Task 5 (`retry after partial failure sends only remaining rows`).
2. **A typed value never moves to another record.** Setup: a formCard with `recordKey: "{{kart.rows[0].id}}"`; the user edits `ad` on card A and then selects card B (no `trackChanges`). `ad` shows B's value, and save sends B's value. With `trackChanges` the row click asks first; answering Vazgeç keeps A selected and keeps the typed text. Test: Task 6 (`recordKey change resets owned inputs`, `dirty form confirms row change`).
3. **A TenantUser can save a card with no unit changes.** `birimEkle`/`birimSil` have `allowed:false`, but their iterating steps have zero rows, so they are skipped without a request or an error. With one staged unit, the step reports `"Bu işlem için yetkiniz yok."` and sends no request. Test: Task 3 (`unallowed step with zero rows is skipped`, `unallowed step with rows fails without request`).
4. **Ctrl+S inside the movement dialog saves the dialog, not the card.** With the dialog open, Ctrl+S runs the dialog's `saveQuery` (`stok.hareket.ekle`). The actionBar `saveSequence` is not called. After the dialog closes, Ctrl+S saves the card again. Test: Task 5 (`ctrl+s in dialog runs dialog save only`).
5. **A row action uses its own row.** Setup: row 3 is selected and the user clicks "Ters kayıt" on row 1. The reverse request carries row 1's `id`, the reason prompt answer is sent as `reason`, and the selection becomes row 1. A `disabledWhen: "hareketler.seciliSatir.hasReversal"` disables the action per row, evaluated against that row. Test: Task 5 (`row action resolves against its row`, `row action disabledWhen per row`).
6. **Custom fields are sent on create and merged on edit.**
   - Create sends `customFields` from the block.
   - Edit sends `values` = the source rows overlaid with the block map; codes the block does not render keep their source value.
   - An empty required field blocks the save and jumps to its tab.
   - A server error `values.RENK` is shown under the RENK field.

   Tests: Task 3 (`map parameter merges over body map source`), Task 6 (`required custom field blocks save`, `custom field server error shown under field`).
7. **Two source-backed steps cannot share a sequence.** The second step would send the pre-sequence `rowVersion` and fail with 409. The schema rejects it. Test: Task 2 (`Rejects_two_source_backed_steps`).

---

## Wire contract (shared by every task)

### Collection parameters (catalog)

`GET /api/custom-pages/erp-operations` parameter entries gain `items`; everything else is unchanged.

```json
{ "name": "variants", "in": "body", "type": "list", "required": false,
  "items": [ { "code": "code", "label": "Kod", "dataType": "text", "required": true },
             { "code": "name", "label": "Ad", "dataType": "text", "required": true },
             { "code": "barcode", "label": "Barkod", "dataType": "text", "required": false },
             { "code": "attributes", "label": "Özellikler", "dataType": "map", "required": true } ] }
{ "name": "customFields", "in": "body", "type": "map", "required": false, "items": null }
{ "name": "id", "in": "route", "type": "guid", "required": true, "items": null }
```

| operation | new parameter | type | items |
|---|---|---|---|
| `stok.kart.olustur` | `customFields` | map | — |
| `stok.kart.olustur` | `variants` | list | `StockItemVariantWriteRequest`: `code`*, `name`*, `barcode`, `attributes`* (map) |
| `stok.hareket.ekle` | `tracking` | list | `InventoryTrackingAllocationRequest`: `trackingCode`*, `quantity`* (decimal), `expiryDate` (date) |
| `stok.kart.ozelAlanKaydet` | `values` | map | — (this is the operation's `bodyMap.property`) |

Rules for collection parameters:
- `list` and `map` are only `in: "body"` and never `required`. Item `dataType` is one of the scalar types or `map`; a `map` item is one level deep with string values.
- **Page binding.** A page parameter of type `list` binds exactly `{{<grid>.satirlar}}`, where `<grid>` is an `editableGrid` in mode `list` or `matrix`. A parameter of type `map` binds exactly `{{<blok>.degerler}}`, where `<blok>` is a `customFieldsBlock`. SQL queries keep the six scalar types.
- **Coercion** (`coerceParameter`):
  - `list` accepts an array of plain objects (at most 200), whose values are scalars or one-level string maps; anything else becomes `null`;
  - `map` accepts a plain object of at most 40 string or `null` values; anything else becomes `null`;
  - keys `__proto__`, `constructor` and `prototype` are dropped at every level.
- **Body.** A bound `list`/`map` value is written to the body like any body parameter. `null` keeps the key absent, so an unbound or unresolved collection sends nothing.
- **`bodyMap` merge.** For an operation with a `bodyMap` and a declared `map` parameter named `bodyMap.property`, the body property is built in this order:
  1. the source rows (`keyColumn` → `valueColumn`), as in Faz A;
  2. then the bound map's entries whose value is not `null`;
  3. then the individually bound uppercase parameters (Faz A).

  The declared map parameter never replaces the merged map wholesale.
- **Field errors.** A server key `<param>.<KEY>` (`customFields.RENK`, `values.RENK`), where `<param>` is a `map` parameter, is kept as `fieldErrors["<param>.<KEY>"]`. A key `<param>[<i>].<field>` of a `list` parameter is kept as `fieldErrors["<param>[<i>].<field>"]`. Every other key maps as in Proje 1.

### Save sequence (`saveSequence`)

Allowed on:
- `actionBar` (exclusive with `saveQuery`);
- `dialog` (exclusive with `saveQuery`);
- `button` with `actionType: "sequence"` (`queryId` is not allowed there).

| prop | rule |
|---|---|
| `saveSequence` | 1–8 distinct write query ids (insert/update/delete), run in this order |
| `stopOnError` | bool, default `true` |
| `sequenceWhen` | ≤ 8 strings `"<queryId>=<koşul>"`. `<queryId>` is in `saveSequence`, and `<koşul>` uses the Faz A condition grammar. The condition is evaluated **once, before the first step**, against the page scope; a false condition skips the step. It may reference write query names (their persisted `sonuc`) and may not reference `onceki`. |

**Step bindings.**
- `{{onceki.sonuc.X}}` is the response of the most recent **executed** step.
  - A skipped step does not change it.
  - Inside an iterating step it stays fixed at its pre-step value for every row. After the iterating step it is the last successful row's response.
  - Prefer named references (`{{olustur.sonuc.id}}`), because `onceki` after an iterating step is a unit or a movement, not the card.
- `{{<sorgu>.sonuc.X}}` reads the sequence-local result when that step ran in this sequence; otherwise it reads the persisted query state (`QueryState.sonuc`).
- **Iteration.** A step whose parameters bind `{{<grid>.eklenenSatir.X}}` or `{{<grid>.silinenSatir.X}}` (stage-mode grid only) runs once per staged row of that list, in row order. Zero rows means the step is skipped. A step may iterate one grid list only, and such a query may be used only as a sequence step.

**Run order** (one call of `runSaveSequence`):
1. **Lock.** The page's single write lock is taken for the whole run. If it is held, nothing runs and the result is `busy`.
2. **Active steps.** Each step's `sequenceWhen` is evaluated, and the iteration rows are snapshotted. If no call would run (every step is skipped or has zero rows), the status reads `"Kaydedilecek bir değişiklik yok."` (tone `warning`).
3. **Validation, once.** It covers the union of:
   - inputs bound by the active steps (Faz A `validateFor` rules);
   - grids bound by them (`satirlar` or an iteration list);
   - custom-field blocks bound by them.

   On failure: `VALIDATION_BLOCKED`, and the first tab holding an error is activated.
4. **`beforeSave`, once,** with the first active step's query name; a cancel stops the run.
5. **Confirm, once:** the button's `confirmEnabled`/`confirmText`, and in preview always (Faz A rule).
6. **Steps, in order.** For each call:
   - the values are resolved against the **current** scope (a ref, not the render-time scope) plus an overlay: sequence results by query name, `onceki`, and for an iterating step `<grid>.eklenenSatir`/`silinenSatir` = the row;
   - a step whose operation has `allowed === false` fails with `"Bu işlem için yetkiniz yok."` and sends no request;
   - a step whose bindings reference `onceki`, or the name of a step that failed or was skipped for a dependency, is skipped as `bağlı olduğu adım başarısız`;
   - with `stopOnError`, the first failure ends the run.
7. **End.**
   - If at least one call succeeded:
     - successful iteration rows are committed (removed from the grid's staged lists);
     - the page reruns its load reads plus `refreshQueries`;
     - `afterSave` is emitted once with `{ query, sonuc, adimlar }`. `query`/`sonuc` are the last successful call; `adimlar` is `[{ query, ok, sonuc?, hata? }]`, an additive field (the Proje 2b payload keeps `query` and `sonuc`).
   - The lock is released.

**A sequence may contain at most one step whose operation has a `sourceOperation`.** A second one would reuse the pre-sequence source row and its `rowVersion`.

**Rights.** The save command is enabled only when the page right exists for every distinct step kind; otherwise it shows `"Bu işlem için yetkiniz yok"`.

**Messages.** The label of a step is the catalog operation label for operation queries, and the query name otherwise. For an iterating row it is `"<label> (satır <i>/<n>)"`. `<hata>` is the step error text, with a period appended when it does not end in `.`, `!` or `?`.

| outcome | tone | text |
|---|---|---|
| all calls succeeded | success | `"<successMessage veya İşlem tamamlandı.> (<n> işlem)"` (n = successful calls) |
| `stopOnError`, the first call failed | error | `"<adım> başarısız: <hata> Hiçbir değişiklik kaydedilmedi."` |
| `stopOnError`, k ≥ 1 calls succeeded first | warning | `"<adım> başarısız: <hata> Önceki <k> işlem kaydedildi; kalan adımlar çalıştırılmadı."` |
| `stopOnError: false` with failures | warning (error if none succeeded) | `"<ok>/<toplam> işlem tamamlandı. Başarısız: <adım1>: <hata1> <adım2>: <hata2>"` |
| nothing to run | warning | `"Kaydedilecek bir değişiklik yok."` |

### Row actions and reason prompt (B2)

`dataTable` (v2, query-bound) gains these props:

| prop | rule |
|---|---|
| `rowActions` | 1–4 button ids. Each button has `actionType` `query`, `sequence` or `openDialog`. The table owns them: they are not drawn at top level and cannot be in `moreButtons`, a tab or a dialog. The table must be named. |
| `emptyText` | static string ≤ 120. Replaces both the idle text and the empty-result text. |
| `limit` | int 1–100; only the first `limit` rows are drawn (client-side; totals and export use the drawn rows) |

**Row-action runtime.**
- An extra last column `İşlemler` holds one small button per action.
- On click, the table's selection becomes that row, and the button runs with an overlay `<tablo>.seciliSatir = row`. This is the same overlay mechanism the sequence uses, so the run never depends on React state flushing.
- `visibleWhen` and `disabledWhen` of a row-action button are evaluated per row with the same overlay.

`button` gains these props:

| prop | rule |
|---|---|
| `promptLabel` | bindable ≤ 60; the button must have a `name`. Before the write, `promptDialog({ title: <düğme metni>, label: <promptLabel>, required: <promptRequired>, multiline: true, confirmLabel: <düğme metni> })` asks for the answer; cancelling stops the run silently. The answer binds as `{{<düğmeAdı>.yanit}}` for that run only. |
| `promptRequired` | bool; only with `promptLabel` |
| `dialogId` | the id of a `dialog` component; required with `actionType: "openDialog"` and allowed only then |

The prompt runs after validation and `beforeSave`, and before the confirm. When both prompt and confirm are set, only the prompt is shown, because the prompt is itself a confirmation.

### Editable grid (`editableGrid`, B3)

A new v2 type. A `name` is required. Props:

| prop | rule |
|---|---|
| `gridMode` | required: `stage`, `list` or `matrix` |
| `sourceQuery` | read query id; required in `stage`, forbidden otherwise |
| `rowKey` | `stage` only: a column code of the source rows, default `id` |
| `gridColumns` | `stage`/`list`: 1–12 column specs (below); forbidden in `matrix` |
| `maxRows` | int 1–200, default 50 (`stage`/`list`) |
| `addLabel` | static ≤ 40, default `"Satır ekle"` |
| `fixedRowLabel` | bindable ≤ 200; drawn as a first row spanning all columns, read-only and never removable (the base-unit row) |
| `matrixCode`, `matrixName` | bindable ≤ 200, both required in `matrix` (code and name prefixes, e.g. `{{kod.value}}`, `{{ad.value}}`) |
| `title`, `description`, `visibleWhen`, `disabledWhen`, `disabledReason` | as elsewhere; `disabledWhen` is extended to `editableGrid` and `customFieldsBlock` |

**Column spec** `"<kod>|<Etiket>|<tür>[|<kurallar>]"`. Server and client share `frontend/erp-web/src/custom-page/gridColumns.vectors.json`.
- `kod`: `^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[\p{L}\p{N}_ -]{1,40})?$`. One dot at most; `attributes.Renk` writes into the `attributes` map item.
- `Etiket`: 1–60 chars, no `|`.
- `tür`: `text`, `number`, `date` or `checkbox`.
- `kurallar`: comma list of:
  - `required`;
  - `unique` (case-insensitive across all rows, after `upperCase`);
  - `upperCase` (text only);
  - `readOnly`;
  - `maxLength:N` (text, 1–4000);
  - `min:N`, `max:N` (number, `min ≤ max`);
  - `step:N` (number, > 0).

  An unknown token, or a rule on the wrong type, is invalid.
- Cell messages are the Faz A `inputValidation` messages. Additions: `"Bu değer başka bir satırda da var."` and `"En fazla <n> satır eklenebilir."`.

**Modes.**
- **`stage` (units).**
  - **Rows.** Source rows are read-only. The user adds new rows (editable) and marks source rows for removal (greyed, badge `"Silinecek"`, button `"Geri al"`). New rows have the badge `"Yeni"` and a remove button (`aria-label="Satırı sil"`).
  - **Scope.** `{ satirlar, eklenenler, silinenler, eklenenSayisi, silinenSayisi, degisti }`, where `satirlar` = source rows minus removed, plus added. Rows are keyed by `rowKey`; added rows get a client key `yeni-<n>`.
  - **Reset.** Staged lists reset when the source query's `ranWith` changes, and on actionBar Yeni.
  - **Commit.** Committed (successfully sent) rows are removed from the staged lists. A removal whose key no longer exists in a refreshed source is dropped.
- **`list` (lot/serial).**
  - All rows are editable and there is no source.
  - **Scope.** `satirlar` is the row list in wire shape:
    - number cells become JS numbers;
    - checkbox cells become booleans;
    - date cells become `YYYY-MM-DD`;
    - empty cells are omitted;
    - `a.b` columns are nested into `{ a: { b } }`.
  - **Reset.** The rows reset on actionBar Yeni and after a successful run of a step that binds `satirlar`.
- **`matrix` (variants).**
  - **Rows.** The rows are dimensions, with fixed columns `Özellik adı` (≤ 40) and `Değerler` (comma separated); at most 10 rows.
  - **Scope.** `satirlar = makeVariantDrafts(matrixCode, matrixName, rows)`, from `inventory/variantDrafts.ts`, identical to the old screen. It is capped at 200.
  - **Preview.** A preview line reads `"<n> varyant oluşturulacak"`. Over 200 it reads `"En fazla 200 varyant oluşturulabilir; ilk 200 kullanılacak."`.
  - **Reset.** As in `list`.
- **Binding rules.** `list` and `matrix` grids are consumed through `{{<grid>.satirlar}}` on a `list` parameter. `stage` grids are consumed through iteration bindings. For a `list` grid, each column code's root must be an item of the bound parameter, and a dotted code's root must be a `map` item. A `matrix` grid requires the parameter's items to include `code`, `name` and `attributes`.

### Custom fields block (`customFieldsBlock`, B4)

A new v2 type. A `name` is required. Props:
- `definitionsQuery`: read, required;
- `valuesQuery`: read, optional;
- `columns`: 1–3, the formCard rule;
- `title`, `visibleWhen`, `disabledWhen`, `disabledReason`.

**Columns.**
- Definitions rows: `code`, `label`, `dataType`, `isRequired`, `maxLength`, and `isActive` when present. A row with `isActive === false` is skipped.
- Values rows: `code`, `value`.
- When a query is an operation query, the schema checks that its result columns contain these. The errors read `"'definitionsQuery' sorgusunun sonucu code, label ve dataType sütunlarını içermelidir."` and `"'valuesQuery' sorgusunun sonucu code ve value sütunlarını içermelidir."`.

**Inputs by `dataType`** (`CustomFieldDataType` is serialized as a string):

| dataType | input |
|---|---|
| `Text` | text input, with `maxLength` from the definition (≤ 500) |
| `Decimal` | number input (`step any`), invariant `.`-decimal |
| `Date` | date input |
| `Boolean` | checkbox; the value is `"true"`/`"false"` |
| unknown | text input |

**Scope.** `{ degerler: { <CODE>: string }, degisti }` over every rendered definition: the typed value, else the values-query value, else `""`.

**Required.** `isRequired` with an empty value gives `"Bu alan zorunludur."` and blocks a save that binds `degerler`. A Boolean field never fails required, because the server stores `"false"`.

**Reset.** Typed values reset when the values query's `ranWith` changes, and on actionBar Yeni. At most 40 fields are drawn. With no definitions, the block shows `"Tanımlı özel alan yok."`.

**Server errors.** `fieldErrors["<mapParam>.<CODE>"]` from a write that binds `degerler` is shown under that field.

### Dialog (`dialog`) and image (`image`) (B5)

**`dialog`** is a new v2 type; props are required.

| prop | rule |
|---|---|
| `contains` | 1–20 top-level component ids. The tab ownership rules apply. Not `dialog` or `actionBar`; `tabs` is allowed. A tab may not own a `dialog`. |
| `presentation` | `dialog` (default) or `drawer` (right side) |
| `saveQuery` or `saveSequence` (+ `stopOnError`, `sequenceWhen`) | optional; without them the dialog has only `"Kapat"` |
| `saveLabel` | static ≤ 40, default `"Kaydet"` |
| `closeOnSave` | bool, default `true` (closes only on full success) |
| `resetOnOpen` | bool, default `true`. On open, the typed values, validation messages and lookup state of every input owned directly or through an owned formCard/tabs are cleared. |
| `refreshQueries` | as on buttons (extended to `dialog`) |
| `title` | bindable |

- **Opening.** A `button` with `actionType: "openDialog"` and `dialogId` opens the dialog. It works from the page, from `moreButtons` and from a row action; a row action selects its row first.
- **Scope.** A named dialog exposes `{{<ad>.acik}}`.
- **Markup.** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` set to the title, and a backdrop. It is rendered inside the view (no portal), so `modalsBelongToView` holds.
- **Focus.** Focus moves to the first field on open and returns to the opener on close.
- **Closing.** Esc or `"Kapat"` closes the dialog, with the dirty confirmation from B6.
- **Hidden content.** Owned components render only while open. Inputs of a closed dialog are skipped by validation (a closed dialog counts as a hidden owner in `ancestorsOf`).
- **Ctrl+S scope.** While open, the dialog registers `usePageCommands({ save }, "form", dialogRef)`, so its save outranks the actionBar's `page` save (`SOURCE_PRECEDENCE`). The registration unmounts on close.
- **Copy.** The footer reads `"Vazgeç"` and `<saveLabel>`; the busy text is `"Kaydediliyor…"`. The status line inside the dialog uses the sequence/write messages.

**`image`** is a new v2 type.
- **Props.** `value` (bindable URL), `title` (alt text), `height` (int 40–400, default 160), `fit` (`contain`/`cover`), `visibleWhen`.
- **Rendering.** Only absolute `http:`/`https:` URLs are drawn, as `<img referrerPolicy="no-referrer" loading="lazy">`. Every other value shows the placeholder `"Görsel yok"`; a load error shows `"Görsel yüklenemedi"`.

### Change tracking (B6)

`formCard` gains these props:

| prop | rule |
|---|---|
| `recordKey` | bindable ≤ 200, e.g. `{{kart.rows[0].id}}`. When its resolved text changes after the first render, all inputs the card owns are reset: their `touched` entries, validation messages and lookup state. This happens with or without `trackChanges`. |
| `trackChanges` | bool. Dirty inputs are owned inputs with a `touched` entry whose raw value differs from the resolved default. The card header shows `"<n> değişiklik"` when n > 0. |

**Page dirty.** The page is dirty when any of these holds:
- a `trackChanges` formCard is dirty;
- a `stage` grid has staged changes;
- a `list`/`matrix` grid has rows;
- a `customFieldsBlock` has typed values.

**Leave confirmation** (only when the page is dirty):
- **A user row click** in a named dataTable asks `confirmDialog({ title: "Kayıt değiştirilsin mi?", message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?", confirmLabel: "Devam" })`. Vazgeç keeps the old selection. A selection cleared by a data refresh never asks.
- **actionBar Yeni** uses the existing `confirmStartNew(true)`. When it continues, Yeni also:
  - resets every grid and custom-fields block;
  - clears the `sonuc` of every write query in the actionBar's `saveQuery`/`saveSequence`.
- **Dialog close** of a dirty dialog asks `confirmDialog({ title: "Pencere kapatılsın mı?", message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?", confirmLabel: "Kapat" })`. Dirty is counted over its owned content.

---

### Task 1: Server — collection parameters in the catalog and query schema

**Files:**
- Modify: `src/Hosts/AIERP.Api/ErpOperationCatalog.cs`
  - Add the `ErpOperationParameterItem` record and `ErpOperationParameter.Items`.
  - Add `ListParameter<T>(name)` (items from `ScalarMembers<T>`, plus `map` for `IReadOnlyDictionary<string,string>` members) and `MapParameter(name)`.
  - Append the four parameters from the Wire contract to `stok.kart.olustur`, `stok.hareket.ekle` and `stok.kart.ozelAlanKaydet`.
  - Add the new label keys.
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`, **query methods only**:
  - `ReadParameters` gains `bool allowCollections`;
  - `ValidateOperationQuery` adds the collection type and binding-shape rules;
  - `ValidName` adds the reservation of `onceki`.
- Modify: `tests/IntegrationTests/ErpOperationCatalogTests.cs`
- Create: `tests/IntegrationTests/TenantCustomPageCollectionParameterTests.cs` (a new file, so it does not collide with Task 2)

**Interfaces (Produces):**

```csharp
internal sealed record ErpOperationParameterItem(string Code, string Label, string DataType, bool Required);
internal sealed record ErpOperationParameter(string Name, string In, string Type, bool Required)
{ public IReadOnlyList<ErpOperationParameterItem>? Items { get; init; } } // wire: "items", null unless Type == "list"
// Context gains (read by Task 2 after the component loop):
public List<(string Query, string Parameter, string Kind /* list|map */, string Root, string Path)> PendingCollectionBindings { get; } = [];
```

**New label keys:**

| key | label |
|---|---|
| `customFields` | Özel alanlar |
| `variants` | Varyantlar |
| `attributes` | Özellikler |
| `tracking` | Lot / seri dağılımı |
| `trackingCode` | Lot / seri kodu |
| `expiryDate` | Son kullanma tarihi |
| `values` | Özel alan değerleri |

**Schema rules.**
- **Collection types.** For operation queries, `ParameterTypes` also accepts `list` and `map`. For SQL queries the six types and the existing error text are unchanged.
- **Type match.** A collection parameter must match the declared type, as for scalar parameters.
- **Binding shape.** The binding must be exactly two segments: `{{<ad>.satirlar}}` for `list` and `{{<ad>.degerler}}` for `map`. The errors read:
  - `"'<sorgu>' sorgusundaki '<param>' parametresi {{<ızgara>.satirlar}} biçiminde bağlanmalıdır."`
  - `"'<sorgu>' sorgusundaki '<param>' parametresi {{<blok>.degerler}} biçiminde bağlanmalıdır."`

  The pair is stored in `PendingCollectionBindings` for Task 2.
- **Reserved name.** `ValidName` rejects `onceki` (case-insensitive) with the existing text `"'onceki' ayrılmış bir addır; başka bir ad seçin."`.

- [ ] **Step 1: Write failing tests:**
  - **`ErpOperationCatalogTests`:**
    - `Collection_parameters_are_body_and_optional`: every `list`/`map` parameter has `In == "body"` and `!Required`. `Items` is non-empty exactly for `list`, and each item's `DataType` is scalar or `map`.
    - `Collection_parameters_only_extend_three_operations`: the parameter names of every operation equal the Proje 1/Faz A names, except these additions: `olustur` +`customFields`,`variants`; `hareket.ekle` +`tracking`; `ozelAlanKaydet` +`values`. Pin it with an inline expected map.
    - `Variant_items_follow_write_request`: the `variants` items are `code`*, `name`*, `barcode`, `attributes`* (map). The `tracking` items are `trackingCode`*, `quantity`* (decimal), `expiryDate` (date).
    - `Catalog_endpoint_returns_parameter_items`: the JSON has `items == null` on `id` and `items[3].dataType == "map"` on `variants`.
    - `Names_are_append_only`: still passes unchanged.
  - **`TenantCustomPageCollectionParameterTests`:**
    - `Accepts_list_parameter_with_satirlar_binding` (`variants` = `{{varyant.satirlar}}`).
    - `Accepts_map_parameter_with_degerler_binding` (`customFields` = `{{ozel.degerler}}`).
    - `Rejects_list_parameter_bound_to_value` (`{{varyant.value}}`): error contains "{{<ızgara>.satirlar}} biçiminde".
    - `Rejects_map_type_mismatch` (`customFields` typed `text`): error contains "türü map olmalıdır".
    - `Rejects_list_type_on_sql_query`: error contains "text, int, decimal, date, bool veya guid".
    - `Accepts_values_map_on_body_map_operation`: `stok.kart.ozelAlanKaydet` with `values` = `{{ozel.degerler}}` plus `RENK` text. Faz A's same-id rule still applies.
    - `Rejects_onceki_as_component_name` and `Rejects_onceki_as_query_name`.

    These tests use only the query rules, so the `varyant`/`ozel` roots need not resolve yet; the test pages declare no such components. Task 2 adds root resolution. In the same commit it updates the three accepting tests here to declare a `list` grid `varyant` and a block `ozel`, because unresolved roots then fail.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~ErpOperationCatalogTests|FullyQualifiedName~TenantCustomPageCollectionParameterTests"`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** `ScalarMembers` stays scalar-only; the collection parameters are appended explicitly per operation.
- [ ] **Step 4: Run the tests again.** Expected: PASS. Then run `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~Inventory"`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(api): ERP işlemlerinde liste ve eşlem parametreleri`.

### Task 2: Server — component schema for Faz B

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`. Component methods and `Context` only, not Task 1's query methods:
  - `ComponentTypesV2` gains `editableGrid`, `customFieldsBlock`, `dialog` and `image`;
  - the new prop names go into `SafePropsV2`;
  - `BindableProps` gains `promptLabel`, `fixedRowLabel`, `matrixCode`, `matrixName` and `recordKey`;
  - `MessageLimits` gains `promptLabel` 60, `fixedRowLabel` 200, `matrixCode` 200, `matrixName` 200 and `recordKey` 200;
  - the v2 `MaxComponents` is 120;
  - `saveQuery` is allowed on `actionBar` and `dialog`;
  - `refreshQueries`, `confirmEnabled`, `confirmText`, `successMessage` and `errorMessage` keep their button rule, plus `refreshQueries` on `dialog`;
  - `actionType` gains `sequence` and `openDialog` (v2);
  - `disabledWhen`/`disabledReason` are allowed on `editableGrid` and `customFieldsBlock`.
- Modify: `tests/IntegrationTests/AIERP.Api.IntegrationTests.csproj`: add `<None Include="..\..\frontend\erp-web\src\custom-page\gridColumns.vectors.json" Link="GridColumnVectors.json" CopyToOutputDirectory="PreserveNewest" />` next to the Faz A vectors item.
- Create: `tests/IntegrationTests/TenantCustomPageComponentsFazBTests.cs`
- Modify: `tests/IntegrationTests/TenantCustomPageCollectionParameterTests.cs`: the accepting pages declare the grid and the block (see Task 1).

**Interfaces:**
- Consumes:
  - Task 1 (`PendingCollectionBindings`, parameter `Items`);
  - Task 4's vectors file (`gridColumns.vectors.json`: `{ "valid": [{ "text", "code", "root", "inputType" }], "invalid": [string] }`).
- Produces:

```csharp
internal static class GridColumnSpec
{
    /// <summary>Parses "kod|Etiket|tür[|kurallar]" per the Wire contract; false with a Turkish reason otherwise.</summary>
    internal static bool TryParse(string text, out string code, out string inputType, out string? error);
}
```

(`GridColumnSpec` goes into `src/Hosts/AIERP.Api/GridColumnSpec.cs`, a new file.)

**Prop rules** (v2 only; each violation is rejected with the quoted Turkish text):

| prop | on | rule / error |
|---|---|---|
| `saveSequence` | actionBar, dialog, button (`actionType: "sequence"`) | 1–8 distinct ids of write queries on the page; else `"'saveSequence' 1–8 adet farklı yazma sorgusu kimliği içermelidir."`; with `saveQuery`: `"'saveSequence' ve 'saveQuery' birlikte kullanılamaz."`; a sequence button without it: `"Kayıt dizisi düğmesi için 'saveSequence' gerekli."`; a sequence button with `queryId`: `"Kayıt dizisi düğmesinde 'queryId' kullanılamaz."` |
| `stopOnError` | only with `saveSequence` | bool |
| `sequenceWhen` | only with `saveSequence` | ≤ 8 items `^([A-Za-z0-9_-]{1,64})=(.+)$`; id in the sequence (`"'sequenceWhen' adımı dizide yok: <id>"`); the condition parses (`"'sequenceWhen' koşulu geçersiz: <neden>"`); its roots are resolved like `visibleWhen`; the root `onceki` gives `"'sequenceWhen' koşulu 'onceki' kullanamaz; adımlar başlamadan değerlendirilir."` |
| `rowActions` | named query-bound dataTable | 1–4 ids of buttons with `actionType` `query`, `sequence` or `openDialog`; else `"'rowActions' 1–4 adet sorgu, kayıt dizisi veya pencere düğmesi içermelidir."`; unnamed table: `"Satır işlemleri için veri listesinin adı olmalıdır: <id>"` |
| `emptyText` | dataTable | static ≤ 120 |
| `limit` | dataTable with `query` | int 1–100; not with `paging: "server"` (`"'limit' sunucu sayfalı listede kullanılamaz."`) |
| `promptLabel` | button with `actionType` `query`/`sequence` | bindable ≤ 60; the button needs a `name`: `"Gerekçe soran düğmenin adı olmalıdır: <id>"` |
| `promptRequired` | button with `promptLabel` | bool; else `"'promptRequired' için 'promptLabel' de tanımlı olmalıdır."` |
| `dialogId` | button with `actionType: "openDialog"` | an existing `dialog` id; missing: `"Pencere açan düğme için 'dialogId' gerekli."`; unknown: `"Açılacak pencere sayfada yok: <id>"` |
| `gridMode` | editableGrid (required) | `stage`/`list`/`matrix`; else `"'gridMode' stage, list veya matrix olmalıdır."`; the grid needs a `name`: `"Düzenlenebilir tablonun adı olmalıdır: <id>"` |
| `sourceQuery` | editableGrid `stage` (required there; forbidden elsewhere) | a read query; else `"'sourceQuery' yalnız stage kipinde ve sayfadaki bir okuma sorgusu olabilir."` |
| `rowKey` | editableGrid `stage` | 1–128 chars; when `sourceQuery` is an operation query, a column of its result: `"'rowKey' kaynak sorgunun sütunu olmalıdır: <kod>"` |
| `gridColumns` | editableGrid `stage`/`list` (required; forbidden in `matrix`) | 1–12 items, each `GridColumnSpec.TryParse` ok (`"'gridColumns' öğesi geçersiz: <neden>"`), codes distinct |
| `maxRows` | editableGrid `stage`/`list` | int 1–200 |
| `addLabel` | editableGrid | static ≤ 40 |
| `fixedRowLabel` | editableGrid `stage`/`list` | bindable ≤ 200 |
| `matrixCode`, `matrixName` | editableGrid `matrix` (both required) | bindable ≤ 200; missing: `"Varyant tablosu için 'matrixCode' ve 'matrixName' gerekli."` |
| `definitionsQuery` | customFieldsBlock (required) | a read query; operation result columns contain `code`, `label`, `dataType` (Wire-contract error); the block needs a `name`: `"Özel alanlar bloğunun adı olmalıdır: <id>"` |
| `valuesQuery` | customFieldsBlock | a read query; operation result columns contain `code`, `value` |
| `columns` | customFieldsBlock | 1–3 (the formCard rule) |
| `contains` | dialog (required) | 1–20 ids; resolved like tabs (below) |
| `presentation` | dialog | `dialog`/`drawer` |
| `saveLabel` | dialog | static ≤ 40 |
| `closeOnSave`, `resetOnOpen` | dialog | bool |
| `height` | image | int 40–400 |
| `fit` | image | `contain`/`cover` |
| `recordKey` | formCard | bindable ≤ 200 |
| `trackChanges` | formCard | bool |

**Post-loop resolution** (after `ResolveFazAReferences`, sharing its `owners` map):
- **Ownership.** Owned ids are resolved in this order: tabs (Faz A), dialog `contains`, dataTable `rowActions`. One id has one owner. The errors read:
  - `"Pencerenin bileşeni sayfada yok: <id>"`
  - `"Pencereler yalnız üst düzey bileşenleri içerebilir: <id>"`
  - `"Pencere pencere veya İşlem Çubuğu içeremez: <id>"`
  - `"Sekmeler pencere bileşeni içeremez: <id>"`
  - `"'<id>' birden fazla sekmede veya yerleşimde kullanılamaz."` (unchanged)

  A row-action button may not also be in `moreButtons`: `"Satır işlemi düğmesi İşlem Çubuğu menüsünde kullanılamaz: <id>"`.
- **Collection bindings** (from Task 1):
  - A `list` root must be an `editableGrid` in mode `list`/`matrix`, and a `map` root must be a `customFieldsBlock`. Errors: `"'<sorgu>' sorgusundaki '<param>' parametresi listeli veya varyant kipinde bir düzenlenebilir tabloya bağlanmalıdır."` / `"… bir özel alanlar bloğuna bağlanmalıdır."`.
  - **`list` grid.** Every column root is an item code; a dotted code needs a `map` item. Error: `"'<ızgara>' tablosunun '<kod>' sütunu '<param>' parametresinin alanlarında yok."`.
  - **`matrix` grid.** The items include `code`, `name` and `attributes`.
- **Sequence steps.** Every sequence is checked; a step that fails a check is rejected with the quoted text:
  - at most one step whose operation has a `SourceOperation`: `"Bir kayıt dizisinde kaynak kayıttan başlayan en fazla bir adım olabilir."`;
  - every parameter binding of the form `{{<g>.eklenenSatir.<x>}}` or `{{<g>.silinenSatir.<x>}}` in a query names a `stage` grid, and one query uses one `(grid, list)` pair: `"'<sorgu>' adımı en fazla bir ızgara listesini dolaşabilir."`;
  - such a query is not a `saveQuery`, `deleteQuery` or button `queryId`: `"'<sorgu>' sorgusu ızgara satırlarına bağlı; yalnız kayıt dizisinde kullanılabilir."`;
  - every `x` is a `gridColumns` code or, for `silinenSatir`, any source column (unchecked for SQL sources).

- [ ] **Step 1: Write failing tests** (`TenantCustomPageComponentsFazBTests`; build pages with a small local helper like the Faz A test file):
  - **Column spec:**
    - `Grid_column_vectors_valid_parse`: each `valid[i]` parses, with the expected `code` and `inputType`.
    - `Grid_column_vectors_invalid_rejected`.
  - **Sequence:**
    - `Accepts_actionBar_save_sequence_with_when`.
    - `Rejects_save_sequence_with_read_query`.
    - `Rejects_save_sequence_with_save_query`.
    - `Rejects_sequence_when_referencing_onceki`.
    - `Rejects_sequence_when_step_not_in_sequence`.
    - `Rejects_two_source_backed_steps` (`stok.kart.guncelle` and `stok.kart.pasifeAl`).
    - `Accepts_iterating_step_on_stage_grid` (`birimEkle` with `unitCode` = `{{birimler.eklenenSatir.unitCode}}`).
    - `Rejects_step_iterating_two_lists`.
    - `Rejects_iterating_query_as_save_query`.
    - `Accepts_sequence_button`.
    - `Rejects_sequence_button_with_query_id`.
    - `Accepts_dialog_save_sequence`.
  - **Row actions:**
    - `Accepts_row_actions_on_named_table`.
    - `Rejects_row_actions_on_unnamed_table`.
    - `Rejects_row_action_button_in_more_buttons`.
    - `Rejects_row_action_button_owned_by_tab`.
    - `Rejects_limit_on_server_paged_table`.
    - `Accepts_prompt_on_named_button`.
    - `Rejects_prompt_on_unnamed_button`.
    - `Rejects_prompt_required_without_label`.
  - **Grid:**
    - `Accepts_stage_grid_on_units`.
    - `Rejects_stage_grid_without_source`.
    - `Rejects_grid_without_name`.
    - `Accepts_matrix_grid_bound_to_variants`.
    - `Rejects_matrix_grid_without_prefixes`.
    - `Accepts_list_grid_bound_to_tracking`.
    - `Rejects_list_grid_column_not_in_items` (`foo|Foo|text`).
    - `Rejects_stage_grid_bound_to_list_parameter`.
  - **Custom fields:**
    - `Accepts_custom_fields_block_with_definitions_and_values`.
    - `Rejects_definitions_query_without_required_columns` (`depo.listele`).
    - `Rejects_map_parameter_bound_to_grid`.
  - **Dialog:**
    - `Accepts_dialog_owning_inputs_and_table`.
    - `Rejects_dialog_owning_actionBar`.
    - `Rejects_tab_owning_dialog`.
    - `Rejects_component_in_dialog_and_tab`.
    - `Rejects_open_dialog_button_without_dialog`.
  - **Image and change tracking:**
    - `Accepts_image_with_bound_value`.
    - `Rejects_image_height_out_of_range`.
    - `Accepts_form_card_record_key_and_track_changes`.
  - **Caps and shared props:**
    - `Accepts_120_components_in_v2`.
    - `Keeps_80_components_in_v1`.
    - `Accepts_disabledWhen_on_editable_grid`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageComponentsFazBTests"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror the Faz A structure:
  - a `ValidateFazBProps(...)` called from `ValidateComponent` next to `ValidateFazAProps`;
  - pending lists on `Context` (`PendingDialogRefs`, `PendingRowActions`, `PendingSequences`, `GridModesByName`, `CustomFieldBlocks`);
  - a `ResolveFazBReferences(context, owners, queries, out error)` called at the end of `ResolveLayoutReferences`.
- [ ] **Step 4: Run the tests again,** then `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~PageCondition"`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(api): kayıt dizisi, satır işlemleri, düzenlenebilir tablo, özel alanlar, pencere ve görsel şeması`.

### Task 3: ERP Web — collection parameters and the sequence runner (pure)

**Files:**
- Modify: `frontend/erp-web/src/custom-page/pageBindings.ts` (`coerceParameter`: `list`, `map`)
- Modify: `frontend/erp-web/src/custom-page/erpOperations.ts`:
  - `ErpOperationParameter.items`;
  - the `bodyMap` + declared-map merge in `buildOperationRequest`;
  - `fieldErrorsByParameter` keeps `<mapParam>.<KEY>` and `<listParam>[i].<field>`.
- Create: `frontend/erp-web/src/custom-page/saveSequence.ts`, `frontend/erp-web/src/custom-page/saveSequence.test.ts`
- Test: `frontend/erp-web/src/custom-page/erpOperations.test.ts` (extend). Add a new `pageBindings.test.ts` only if none exists; otherwise extend it.

**Interfaces (Produces):**

```ts
// erpOperations.ts
export type ErpOperationParameter = { name: string; in: "route" | "query" | "body"; type: string; required: boolean;
  items?: { code: string; label: string; dataType: string; required: boolean }[] | null };

// saveSequence.ts
export type SequenceStep = {
  query: PageQueryDefinition; label: string; allowed: boolean;
  /** Write query names in this sequence plus "onceki" that the step's bindings reference (for dependency skips). */
  refs: string[];
  iterate: { grid: string; list: "eklenenSatir" | "silinenSatir"; rows: { key: string; row: Record<string, unknown> }[] } | null;
};
export type SequenceCall = { query: string; label: string; ok: boolean; sonuc?: unknown; error?: string; skipped?: boolean; grid?: string; rowKey?: string };
export type SequenceOutcome =
  | { status: "busy" } | { status: "cancelled" } | { status: "blocked"; message: string }
  | { status: "done"; tone: "success" | "warning" | "error"; message: string; calls: SequenceCall[]; succeeded: number };
export async function runSaveSequence(opts: {
  steps: SequenceStep[]; stopOnError: boolean; lock: { current: boolean }; isPreview: boolean;
  confirm: WriteConfirm; successText: string;
  validate: () => string | null;
  beforeWrite: (firstQuery: PageQueryDefinition) => Promise<{ cancel: true; message: string } | null>;
  /** Optional prompt (row action / button promptLabel); null cancels. Runs after beforeWrite, replaces confirm. */
  prompt?: () => Promise<string | null>;
  /** Resolves step parameters against the current scope plus the overlay (results by name, onceki, grid row, prompt answer). */
  resolve: (query: PageQueryDefinition, overlay: Record<string, unknown>) => Record<string, unknown>;
  write: (query: PageQueryDefinition, values: Record<string, unknown>, confirmWrite: boolean) => Promise<WriteResult>;
  errorText: (cause: unknown) => string;
  afterWrite: (payload: { query: string; sonuc: unknown; adimlar: { query: string; ok: boolean; sonuc?: unknown; hata?: string }[] }) => void;
}): Promise<SequenceOutcome>;
export const NOTHING_TO_SAVE = "Kaydedilecek bir değişiklik yok.";
export const STEP_NOT_ALLOWED = "Bu işlem için yetkiniz yok.";
export function stepLabel(query: PageQueryDefinition, op: ErpOperation | undefined): string; // op.label or query.name
export function iterationOf(query: PageQueryDefinition): { grid: string; list: "eklenenSatir" | "silinenSatir" } | null;
```

**Runner contract.** The runner implements the Wire contract's run order exactly. The caller builds `steps` (already filtered by `sequenceWhen`, with snapshotted rows). A single-query write with a prompt (a row action or a `query` button with `promptLabel`) also goes through `runSaveSequence` with one step, so prompt handling lives in one place.

- [ ] **Step 1: Write failing tests:**
  - **`erpOperations.test.ts`:**
    - `list parameter is written to body as array`.
    - `null map parameter is omitted`.
    - `map parameter merges over body map source`. Source rows: `[{code:"RENK",value:"Mavi"},{code:"BOY",value:"10"}]`. Values: `{id, values:{RENK:"Kırmızı", BOY:null}, EN:"5"}`. The body is `{"values":{"RENK":"Kırmızı","BOY":"10","EN":"5"}}`.
    - `field errors keep map and list keys` (`{"values.RENK":["x"],"tracking[1].trackingCode":["y"]}`).
  - **`pageBindings` coerce tests:**
    - `coerce list drops non-objects and unsafe keys`.
    - `coerce map caps at 40 keys and string values`.
    - `coerce list nested map one level only`.
  - **`saveSequence.test.ts`:**
    - `runs steps in order and binds onceki`: step 2's `id` = `{{onceki.sonuc.id}}` resolves to step 1's response `id`.
    - `named sonuc beats persisted state`.
    - `iterating step runs once per row with fixed onceki`.
    - `zero-row iterating step is skipped and not counted`.
    - `unallowed step with zero rows is skipped`.
    - `unallowed step with rows fails without request` (message `"Bu işlem için yetkiniz yok."`).
    - `stopOnError stops after first failure with pinned message`, in both variants (`Hiçbir değişiklik kaydedilmedi.`, `Önceki 2 işlem kaydedildi; kalan adımlar çalıştırılmadı.`).
    - `continue mode lists failures and skips dependent steps` (`bağlı olduğu adım başarısız`).
    - `validation runs once before beforeSave and blocks everything`.
    - `beforeSave once with first step name; cancel sends nothing`.
    - `confirm once; preview always confirms`.
    - `prompt cancel stops silently; answer reaches overlay`.
    - `busy lock returns busy without calling validate`.
    - `nothing to save message`.
    - `afterWrite once with adimlar; not called when no call succeeded`.
    - `iteration label uses satır i/n`.
    - `error text gets trailing period`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page/saveSequence src/custom-page/erpOperations src/custom-page/pageBindings` in `frontend/erp-web`. Expected: FAIL.
- [ ] **Step 3: Implement.** `runSaveSequence` never calls `runWriteAction`, because that would hit the held lock. It holds `lock.current` itself in `try/finally`.
- [ ] **Step 4: Run** `npx vitest run src/custom-page` and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): liste/eşlem parametreleri ve kayıt dizisi yürütücüsü`.

### Task 4: ERP Web — grid, custom-field and variant pure modules

**Files:**
- Create: `frontend/erp-web/src/inventory/variantDrafts.ts`. Move `variantToken`, `makeVariantDrafts` and `VariantDimensionDraft` out of `InventoryPage.tsx` unchanged, and export them.
- Modify: `frontend/erp-web/src/InventoryPage.tsx`. Only the import: delete the moved code and import from `./inventory/variantDrafts`.
- Create: `frontend/erp-web/src/inventory/variantDrafts.test.ts`
- Create: `frontend/erp-web/src/custom-page/gridState.ts`, `gridState.test.ts`, `gridColumns.vectors.json`
- Create: `frontend/erp-web/src/custom-page/customFields.ts`, `customFields.test.ts`

**Interfaces (Produces):**

```ts
// gridState.ts
export type GridColumn = { code: string; label: string; inputType: "text" | "number" | "date" | "checkbox";
  rules: { required: boolean; unique: boolean; upperCase: boolean; readOnly: boolean; maxLength?: number; min?: number; max?: number; step?: number } };
export function parseGridColumn(text: string): { ok: true; column: GridColumn } | { ok: false; error: string };
export function parseGridColumns(value: unknown): GridColumn[]; // drops invalid, max 12
export type GridDraft = { key: string; cells: Record<string, string | boolean> };
export type GridState = { added: GridDraft[]; removed: string[]; rows: GridDraft[]; /* list/matrix */ sourceKey: string | null; nextKey: number };
export type GridAction =
  | { type: "add" } | { type: "edit"; key: string; code: string; value: string | boolean } | { type: "remove"; key: string }
  | { type: "undoRemove"; key: string } | { type: "reset"; sourceKey: string | null } | { type: "commit"; list: "eklenenSatir" | "silinenSatir"; keys: string[] };
export function gridReducer(state: GridState, action: GridAction, opts: { mode: "stage" | "list" | "matrix"; maxRows: number }): GridState;
/** Cell messages by row key and column code (inputValidation messages + unique/maxRows). */
export function validateGrid(mode: string, columns: GridColumn[], state: GridState, sourceRows: Record<string, unknown>[], rowKey: string): Record<string, Record<string, string>>;
export function gridScope(mode: string, columns: GridColumn[], state: GridState, sourceRows: Record<string, unknown>[], rowKey: string,
  matrix?: { code: string; name: string }): { satirlar: unknown[]; eklenenler: Record<string, unknown>[]; silinenler: Record<string, unknown>[]; eklenenSayisi: number; silinenSayisi: number; degisti: boolean };
/** Iteration rows for a sequence step: added drafts in wire shape, or removed source rows. */
export function iterationRows(list: "eklenenSatir" | "silinenSatir", columns: GridColumn[], state: GridState, sourceRows: Record<string, unknown>[], rowKey: string): { key: string; row: Record<string, unknown> }[];
export const GRID_UNIQUE = "Bu değer başka bir satırda da var.";
export const gridMaxRowsMessage = (n: number) => `En fazla ${n} satır eklenebilir.`;
export const MATRIX_DIMENSION_COLUMNS: GridColumn[]; // name "Özellik adı" (required, maxLength 40), values "Değerler" (required)

// customFields.ts
export type CustomFieldSpec = { code: string; label: string; inputType: "text" | "number" | "date" | "checkbox"; required: boolean; maxLength?: number };
export function customFieldSpecs(definitionRows: Record<string, unknown>[]): CustomFieldSpec[]; // skips isActive === false, max 40
export function customFieldValues(specs: CustomFieldSpec[], valueRows: Record<string, unknown>[], typed: Record<string, string>): Record<string, string>;
export function validateCustomFields(specs: CustomFieldSpec[], values: Record<string, string>): Record<string, string>; // code → message
```

**Wire shape for list rows.**
- Values by column type: text → trimmed string (`upperCase` applied); number → `Number`; date → `YYYY-MM-DD`; checkbox → boolean.
- Empty cells are omitted.
- `a.b` columns are nested into `{ a: { b } }`.
- The cells of a matrix row are `{ name, values }`.

**Vectors** (`gridColumns.vectors.json`, read by Task 2 and by `gridState.test.ts`):

```json
{ "valid": [
    { "text": "unitCode|Birim|text|required,unique,upperCase,maxLength:8", "code": "unitCode", "root": "unitCode", "inputType": "text" },
    { "text": "factorToBase|Katsayı|number|required,min:0.000001,step:0.000001", "code": "factorToBase", "root": "factorToBase", "inputType": "number" },
    { "text": "attributes.Renk|Renk|text|required", "code": "attributes.Renk", "root": "attributes", "inputType": "text" },
    { "text": "expiryDate|Son kullanma|date", "code": "expiryDate", "root": "expiryDate", "inputType": "date" },
    { "text": "aktif|Aktif|checkbox|readOnly", "code": "aktif", "root": "aktif", "inputType": "checkbox" } ],
  "invalid": [ "unitCode|Birim|money", "unitCode||text", "unit code|Birim|text", "unitCode|Birim|text|zorunlu",
    "unitCode|Birim|text|maxLength:abc", "a.b.c|X|text", "attributes.|X|text", "q|Miktar|number|maxLength:4",
    "a|A|text|min:1", "n|N|number|min:5,max:1", "n|N|number|step:0", "t|T|text|maxLength:4001", "u|U|number|upperCase" ] }
```

- [ ] **Step 1: Write failing tests:**
  - **`variantDrafts.test.ts`:**
    - `cartesian product with tokens`: `("TS", "Tişört", [{name:"Renk",values:"Kırmızı, Mavi"},{name:"Beden",values:"S,M"}])` gives 4 drafts, the first `{code:"TS-KIRMIZI-S", name:"Tişört · Renk: Kırmızı · Beden: S", barcode:null, attributes:{Renk:"Kırmızı",Beden:"S"}}`.
    - `caps at 200`.
    - `empty dimensions give none`.
  - **`gridState.test.ts`:**
    - `valid column vectors parse` and `invalid column vectors fail`.
    - `stage add edit remove undo`.
    - `stage remove of added row deletes it`.
    - `maxRows blocks add with message`.
    - `required and unique messages` (unique is case-insensitive after `upperCase`).
    - `list scope nests dotted columns and types values`.
    - `matrix scope equals makeVariantDrafts` (`"TS"`/`"Tişört"`).
    - `iterationRows added in wire shape and removed as source rows`.
    - `commit prunes only given keys`.
    - `reset on new sourceKey clears staged`.
    - `removed key missing from refreshed source is dropped` (`gridScope`/`iterationRows` ignore it, and the reducer prunes it on `reset` with the same `sourceKey`).
  - **`customFields.test.ts`:**
    - `specs map dataType and skip inactive`.
    - `values prefer typed then source then empty`.
    - `required text empty fails, boolean never fails`.
    - `decimal invalid fails with Geçerli bir sayı girin.`.
    - `max 40 fields`.
- [ ] **Step 2: Run** `npx vitest run src/inventory/variantDrafts src/custom-page/gridState src/custom-page/customFields`. Expected: FAIL.
- [ ] **Step 3: Implement.** Cell validation reuses `validateInputValue` and `inputRules`-shaped rules from `inputValidation.ts`.
- [ ] **Step 4: Run** `npx vitest run` (the whole erp-web suite, because `InventoryPage` changed) and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): düzenlenebilir tablo, özel alan ve varyant saf modülleri`.

### Task 5: ERP Web — sequence, row actions, dialog and image at runtime

**Files:**
- Create: `frontend/erp-web/src/custom-page/PageDialog.tsx`, `PageDialog.test.tsx`, `PageImage.tsx`, `PageImage.test.tsx`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`:
  - **`PageRuntime`** gains:
    - `currentScope()`, a ref-based scope;
    - `writeWith(query, values, confirmWrite)` = `runWrite(query, values, confirmWrite)`;
    - `runSequence(source)`;
    - `dialogs`, `openDialog(id)` and `closeDialog(id)`;
    - `rowOwned`, the row-action buttons;
    - `dialogOwned`.
  - **Wiring.**
    - `PageActionCommands` uses the sequence for `saveSequence`.
    - `QueryActionButton` handles `actionType` `sequence`/`openDialog` and `promptLabel`.
    - `QueryTable` gains `rowActions`, `emptyText` and `limit`.
    - New cases `dialog` and `image`.
    - The top-level render skips dialog-owned and row-owned ids.
  - **Validation.** `ancestorsOf` treats a closed dialog as a hidden owner.
  - **Rows.** `select` gains `{ user?: boolean }`, used by Task 6.
- Modify: `frontend/erp-web/src/custom-page/pageActions.ts`:
  - `save` is bound when `saveSequence` is set; the rights check covers every step kind;
  - a `moreButtons` entry whose button has `actionType: "openDialog"` runs `deps.run.button` (no change in shape);
  - `PageActionDeps.queryKind` is reused for the steps.
- Modify: `frontend/erp-web/src/custom-page/layoutRefs.ts`: `dialogOwnedIds(components)`, `rowActionIds(components)`.
- Modify: `frontend/erp-web/src/tenant-custom-page.css`
- Test: `frontend/erp-web/src/custom-page/TenantCustomPageSequence.test.tsx` (new; render `TenantCustomPage` with mocked `../erpApi` as `TenantCustomPageErp.test.tsx` does), `CustomPageTable.test.tsx` (extend), `pageActions.test.ts` (extend), `layoutRefs.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3 (`runSaveSequence`, `iterationOf`, `stepLabel`, collection coercion). Task 4 is not needed here: the grid wiring is Task 6, which supplies `iterationRows` through `PageRuntime.gridIteration(name, list)`. Until then that function returns `[]`.
- Produces:

```ts
export function PageDialog(props: { id: string; title: string; presentation: "dialog" | "drawer"; open: boolean;
  onClose: () => void; renderOwned: (id: string) => ReactNode; ids: string[];
  save?: { label: string; busy: boolean; run: () => void }; status: ActionStatus | null; returnFocus: HTMLElement | null }): JSX.Element | null;
export function PageImage(props: { url: string; alt: string; height: number; fit: "contain" | "cover"; style: CSSProperties }): JSX.Element;
// PageRuntime additions
currentScope: () => PageScope;
writeWith: (query: PageQueryDefinition, values: Record<string, unknown>, confirmWrite: boolean) => Promise<WriteResult>;
gridIteration: (grid: string, list: "eklenenSatir" | "silinenSatir") => { key: string; row: Record<string, unknown> }[];
commitGrid: (grid: string, list: "eklenenSatir" | "silinenSatir", keys: string[]) => void;
openDialog: (id: string, opener: HTMLElement | null) => void; closeDialog: (id: string) => void; dialogs: Record<string, boolean>;
```

**Sequence wiring.** One helper, `startSequence(source)`, where `source` is the actionBar, a button or a dialog. It:
- computes the active steps: `sequenceWhen` via `conditionHolds(cond, currentScope(), true)`, `iterate` rows via `gridIteration`, `allowed` from the catalog, and `refs` from the binding roots;
- calls `runSaveSequence` with `validate = () => runtime.validateForAll(activeQueries)`. `validateForAll` is the union form of Faz A `validateFor`; Task 6 adds grids and blocks to it;
- passes `resolve = (q, overlay) => resolveQueryParameters(q, { ...currentScope(), ...mergeOverlay(currentScope(), overlay) })`, where an overlay entry for a query name merges into that query's state object instead of replacing it;
- ends by calling `commitGrid` per committed row group and rerunning `loadIds ∪ refreshQueries`, then writing the status.

A single `saveQuery`/`queryId` without `saveSequence` and without a prompt keeps the Faz A `runWriteAction` path unchanged.

**Row actions.** `QueryTable` receives `rowActions: { id, label, visible(row), disabled(row) → reason | null, run(row, opener) }[]`.
- **Cells.** The `İşlemler` header and cell are added only when at least one action is visible on some drawn row.
- **Clicks.** A click calls `event.stopPropagation()`, so the row toggle does not also fire. It selects the row with `{ user: true }` and then runs the button with an overlay `{ [tablo]: { seciliSatir: row } }` through `startSequence` (or `openDialog`).
- **Limit.** `limit` slices the drawn rows.
- **Empty text.** `emptyText` replaces `MANUAL_QUERY_IDLE` and `"Gösterilecek kayıt bulunamadı."`.

- [ ] **Step 1: Write failing tests:**
  - **`PageDialog.test.tsx`:**
    - `renders nothing when closed`.
    - `has dialog role labelled by title`.
    - `escape and Kapat call onClose`.
    - `focus first field on open and return on close`.
    - `drawer presentation class`.
  - **`PageImage.test.tsx`:**
    - `https url renders img with no-referrer`.
    - `javascript and data urls show Görsel yok`.
    - `load error shows Görsel yüklenemedi`.
  - **`TenantCustomPageSequence.test.tsx`:**
    - `actionBar sequence runs steps in order with onceki` (asserts the two `api` calls and the success text `"İşlem tamamlandı. (2 işlem)"` composed per the Wire contract).
    - `sequenceWhen skips create on edit`.
    - `persisted sonuc skips create on second save` (`olustur=olustur.sonuc.id == null`).
    - `ctrl+s in dialog runs dialog save only` (wrap in `CommandProvider` + `KeepAliveViews` like `CommandProvider.test.tsx`).
    - `open dialog from moreButtons`.
    - `dialog resetOnOpen clears owned inputs`.
    - `closed dialog inputs are not validated`.
    - `prompt answer binds as yanit and cancel sends nothing`.
    - `sequence button with confirm asks once`.
  - **`CustomPageTable.test.tsx`:**
    - `row action resolves against its row` (row 3 selected, click on row 1 → URL contains row 1's id; the selection is row 1).
    - `row action disabledWhen per row`.
    - `limit draws first rows`.
    - `emptyText replaces idle and empty texts`.
    - `row action click does not toggle row`.
  - **`pageActions.test.ts`:** `save bound by saveSequence needs rights for every kind`.
  - **`layoutRefs.test.ts`:** `dialogOwnedIds and rowActionIds`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page src/TenantCustomPage`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): kayıt dizisi, satır işlemleri, pencere ve görsel bileşenleri`.

### Task 6: ERP Web — editable grid, custom fields block and change tracking at runtime

**Files:**
- Create: `frontend/erp-web/src/custom-page/EditableGrid.tsx`, `EditableGrid.test.tsx`, `CustomFieldsBlock.tsx`, `CustomFieldsBlock.test.tsx`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`:
  - `PageBody` holds `grids: Record<name, GridState>` and `customTyped: Record<name, Record<code, string>>`;
  - `effective()` adds the grid and block scopes;
  - `gridIteration`/`commitGrid` become real;
  - `validateForAll` adds grids and blocks bound by the steps (the error jump covers their tabs);
  - `case "editableGrid"` and `case "customFieldsBlock"`;
  - formCard `recordKey`/`trackChanges`;
  - `isDirty()` and the leave confirmations;
  - Yeni resets the grids, blocks and write `sonuc` values.
- Modify: `frontend/erp-web/src/custom-page/usePageQueries.ts`: add `clearResults(queryNames)`, which resets `sonuc`/`fieldErrors` of write states (for Yeni).
- Modify: `frontend/erp-web/src/tenant-custom-page.css`
- Test: `frontend/erp-web/src/custom-page/TenantCustomPageGrid.test.tsx` (new), `TenantCustomPageChanges.test.tsx` (new)

**Interfaces:**
- Consumes: Task 4 (`gridReducer`, `validateGrid`, `gridScope`, `iterationRows`, `customFieldSpecs`, `customFieldValues`, `validateCustomFields`) and Task 5 (`PageRuntime` additions, `select(..., { user })`, `startSequence`).
- Produces:

```ts
export function EditableGrid(props: { id: string; title: string; mode: "stage" | "list" | "matrix"; columns: GridColumn[];
  state: GridState; sourceRows: Record<string, unknown>[]; rowKey: string; dispatch: (action: GridAction) => void;
  errors: Record<string, Record<string, string>>; fixedRowLabel: string; addLabel: string; maxRows: number;
  disabled: boolean; disabledReason: string; loading: boolean; error?: string; matrixPreviewCount?: number; style: CSSProperties }): JSX.Element;
export function CustomFieldsBlock(props: { id: string; title: string; columns: 1 | 2 | 3; specs: CustomFieldSpec[];
  values: Record<string, string>; onChange: (code: string, value: string) => void; errors: Record<string, string>;
  disabled: boolean; loading: boolean; error?: string; style: CSSProperties }): JSX.Element;
```

**Behavior.**
- **Grid markup.** The grid is a real `<table>`. Each editable cell is an input with `aria-label="<Etiket> (satır <n>)"`, and invalid cells get `aria-invalid` and a message below. The add button is disabled at `maxRows` and when `disabled`; the remove and undo buttons are disabled when `disabled`.
- **Grid reset.** The source `ranWith` key is `JSON.stringify(state.ranWith ?? null)`. A changed key dispatches `reset`.
- **Block keys.** Block inputs use ids `page-cf-<blok>-<CODE>`. Server errors come from the `fieldErrors["<param>.<CODE>"]` of any write that binds `{{<blok>.degerler}}`.
- **`recordKey`.** A `useEffect` per formCard compares the resolved key with the previous one. On change it removes the owned ids from `touched`, `validationErrors` and `lookupState`; the first render only records the key.
- **Row clicks.**
  - `select(table, row, { user: true })` checks `isDirty()`.
  - When dirty, it awaits the confirmation (Wire contract text).
  - When declined, it keeps the selection and emits nothing.
- **Yeni.** Yeni calls `confirmStartNew(isDirty())`. When it continues, Yeni:
  - clears `newInputs` (as before);
  - dispatches `reset` to every grid;
  - clears `customTyped`;
  - calls `clearResults` on the actionBar's write queries.

- [ ] **Step 1: Write failing tests:**
  - **`EditableGrid.test.tsx`:**
    - `stage shows source rows read-only and new rows editable`.
    - `remove marks Silinecek and Geri al restores`.
    - `fixed row label first and not removable`.
    - `add disabled at maxRows`.
    - `cell error shown with aria-invalid`.
    - `matrix shows variant count and 200 note`.
    - `disabled grid shows reason`.
  - **`CustomFieldsBlock.test.tsx`:**
    - `renders inputs by dataType`.
    - `checkbox writes true/false strings`.
    - `required error message`.
    - `empty definitions text`.
  - **`TenantCustomPageGrid.test.tsx`:**
    - `staged units are posted and deleted by sequence then committed`.
    - `retry after partial failure sends only remaining rows` (Review Focus 1).
    - `variants matrix sent in olustur body`.
    - `tracking list sent in hareket.ekle body`.
    - `grid validation blocks sequence and jumps to tab`.
    - `map parameter merges over body map source end to end` (edit: the PUT body).
    - `required custom field blocks save`.
    - `custom field server error shown under field`.
    - `customFields sent on create`.
    - `source change resets staged rows`.
  - **`TenantCustomPageChanges.test.tsx`:**
    - `recordKey change resets owned inputs`.
    - `trackChanges shows change count`.
    - `dirty form confirms row change` (Vazgeç keeps the old selection and the typed text; Devam switches and resets).
    - `refresh-driven selection clear does not confirm`.
    - `Yeni over dirty page confirms and resets grids, blocks and sonuc`.
    - `dirty dialog close confirms`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page src/TenantCustomPage`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): düzenlenebilir tablo, özel alanlar bloğu ve değişiklik izleme`.

### Task 7: Studio — wire fields, collection parameters and Faz B inspector/preview building blocks

New files and page-designer modules only; `CustomPagesPage.tsx` is **not** edited here.

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/erpOperations.ts`:
  - `ErpOperationParameter.items`;
  - `wireParameters` keeps declared `list`/`map` parameters with a non-empty binding;
  - `mergedParameters` keeps their `spec`;
  - new `collectionCandidates(kind, components)` returns the names of eligible grids and blocks.
- Modify: `page-designer/QueriesPanel.tsx`. A `list`/`map` parameter row shows a `<select>` of `collectionCandidates` instead of `BindingInput`, and writes `{{<ad>.satirlar}}`/`{{<ad>.degerler}}`. The option label is `"<ad> (Düzenlenebilir tablo)"` / `"<ad> (Özel alanlar)"`. With no candidate, the hint reads `"Önce sayfaya bir düzenlenebilir tablo ekleyin."` / `"Önce sayfaya bir özel alanlar bloğu ekleyin."`.
- Create: `page-designer/gridColumns.ts`, the twin of the `parseGridColumn` part of erp-web `gridState.ts`.
- Create: `page-designer/SequenceFields.tsx`. It edits:
  - the ordered step list: add from write queries, ↑/↓ and remove;
  - the `Hata olursa dur` toggle (`stopOnError`);
  - a `Koşul` field per step (`sequenceWhen`), with inline `parseCondition` errors and the `onceki` error from Task 2;
  - per step, the hint `"Izgara satırları: her eklenen satır için bir kez çalışır"` when `iterationOf` is non-null.
- Create: `page-designer/RowActionsFields.tsx`. It edits:
  - the row-action buttons, chosen from buttons with an eligible `actionType` that no one else owns (max 4);
  - `Boş liste metni` (`emptyText`);
  - `En fazla satır` (`limit`).
- Create: `page-designer/EditableGridFields.tsx`. It edits:
  - the mode (`Kayda kadar beklet` = stage, `Liste` = list, `Varyant matrisi` = matrix);
  - the source query and `rowKey` (stage);
  - the column editor: the code is picked from the source query columns (stage) or from the bound list parameter items, including `attributes.<ad>` (list); then label, type and rule checkboxes (Zorunlu, Benzersiz, Büyük harf, Salt okunur, En fazla karakter, En az, En fazla, Adım);
  - `maxRows`, `addLabel`, `fixedRowLabel` (BindingInput);
  - `matrixCode`/`matrixName` (BindingInput).
- Create: `page-designer/CustomFieldsBlockFields.tsx`. It edits the definitions and values query pickers and the column count.
- Create: `page-designer/DialogFields.tsx`. It edits:
  - the `contains` picker (the TabsFields candidate logic, extracted into `layoutRefs.ts` as `ownableCandidates`);
  - the presentation (`Pencere`/`Çekmece`);
  - the save path: `saveQuery` select or `SequenceFields`;
  - `saveLabel`, `closeOnSave`, `resetOnOpen`, `refreshQueries`.
- Modify: `page-designer/CanvasPreviews.tsx`. Add:
  - `EditableGridPreview`: header row and two sample rows; stage shows a `Yeni` badge; matrix shows `"<n> varyant oluşturulacak"` from the sample;
  - `CustomFieldsPreview`: definitions preview rows, or three sample fields;
  - `ImagePreview`: the placeholder box with `"Görsel"` and the bound text;
  - `DialogPreview`: a collapsed card `"Pencere: <başlık> · <n> bileşen"`, expanding inline when clicked;
  - `GridPreview` gains an optional `rowActionLabels` column.
- Modify: `page-designer/layoutRefs.ts`: `dialogOwnedIds`, `rowActionIds` (the Task 5 signatures), `ownableCandidates`.

**Interfaces:** Consumes the Wire contract and Task 2's prop rules. Produces the components above, with props-in/onChange-out signatures that Task 8 calls, e.g. `SequenceFields({ value, when, stopOnError, writeQueries, componentsNames, onChange })`.

- [ ] **Step 1: Implement** the above. Studio has no unit test runner; correctness is checked by the build and by Task 9.
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success with no TS errors.
- [ ] **Step 3: Commit** with the message `feat(studio): kayıt dizisi, satır işlemi, tablo, özel alan ve pencere düzenleyicileri`.

### Task 8: Studio — integrate Faz B into the page designer

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - **Types.** `ComponentType` gains `editableGrid`, `customFieldsBlock`, `dialog` and `image`.
  - **Palette:**
    - `{ type: "dialog", label: "Pencere", group: "Tasarım dili", sample: { title: "Pencere", contains: [], presentation: "dialog" } }`
    - `{ type: "editableGrid", label: "Düzenlenebilir tablo", group: "Eylem ve form", sample: { title: "Satırlar", gridMode: "list", gridColumns: ["code|Kod|text|required"] } }`
    - `{ type: "customFieldsBlock", label: "Özel alanlar", group: "Eylem ve form", sample: { title: "Özel alanlar", columns: 2 } }`
    - `{ type: "image", label: "Görsel", group: "Veri", sample: { title: "Görsel", value: "", height: 160 } }`

    The palette refuses to add an `editableGrid` or `customFieldsBlock` without a name. It assigns the first free name (`tablo1`, `ozelAlanlar1`), as inputs get names today.
  - **Keys.** `managedKeys` gains every new prop name from Task 2. `bindableKeys` gains `promptLabel`, `fixedRowLabel`, `matrixCode`, `matrixName` and `recordKey`.
  - **Width.** `defaultSpan`: `editableGrid`, `customFieldsBlock` and `dialog` 12, `image` 3.
  - **Buttons.** The `actionType` options gain `Kayıt dizisi` (sequence) and `Pencere aç` (openDialog, with a dialog select). A `Gerekçe iste` group (`promptLabel`, `promptRequired`) is shown for query/sequence buttons. When the button has no name, it shows the warning `"Gerekçe sorabilmek için düğmeye ad verin."`.
  - **Inspector sections:**
    - actionBar `Komutlar` gains `Kaydet dizisi` (`SequenceFields`), exclusive with `saveQuery`;
    - dataTable gains `Satır eylemleri` (`RowActionsFields`) next to the Faz A `Sayfalama`;
    - `editableGrid` → `EditableGridFields`; `customFieldsBlock` → `CustomFieldsBlockFields`; `dialog` → `DialogFields`;
    - formCard `Form kartı` gains `Kayıt anahtarı` (`recordKey`, BindingInput) with the help text `"Değişince kartın girişleri yeni kaydın değerleriyle yeniden dolar."`, and `Değişiklikleri izle` (`trackChanges`);
    - `image` gets `Görsel bağlantısı` (`value`, BindingInput), `Yükseklik` and `Sığdırma`;
    - `Koşullar` allows `disabledWhen` on `editableGrid`/`customFieldsBlock`.
  - **Canvas.**
    - Dialog-owned and row-action-owned components are not drawn at top level.
    - Dialogs render as `DialogPreview`, expandable in place.
    - Row-action buttons appear as chips in the owning table's `İşlemler` column.
  - **`reconcileLayoutRefs`** drops deleted or ineligible ids from `saveSequence`, `sequenceWhen` (for removed steps), `rowActions`, dialog `contains` (tab rules) and button `dialogId`. When a button's dialog is deleted, it removes `actionType` and `dialogId`. It drops `promptRequired` without `promptLabel`, `stopOnError`/`sequenceWhen` without `saveSequence`, and `saveQuery` when `saveSequence` is set.
  - **`dropQueryReferences`** removes a deleted query from:
    - `saveSequence` and `sequenceWhen`;
    - `sourceQuery`, `definitionsQuery`, `valuesQuery`;
    - a dialog's `saveQuery` and `refreshQueries`.

    A write query turned into a read is also dropped from `saveSequence`.
  - **Binding suggestions:**
    - **Grid:** `{{<ızgara>.satirlar}}`, `.eklenenSayisi`, `.silinenSayisi`, `.degisti`, and `.eklenenSatir.<kod>`/`.silinenSatir.<kod>` per column, detail `"Kayıt dizisinde her satır için"`.
    - **Block:** `{{<blok>.degerler}}`, `.degisti`.
    - **Dialog:** `{{<pencere>.acik}}`.
    - **Prompt:** `{{<düğme>.yanit}}` for buttons with `promptLabel`.
    - **Sequence:** `{{onceki.sonuc.<kod>}}`, group `"Kayıt dizisi"`, detail `"Dizide bir önceki adımın sonucu"`, offered only inside a query parameter of a query that is a sequence step.
  - **Names.** `nameProblem` rejects `onceki`.
- Modify: `page-designer/VariablesPanel.tsx` to list the same new roots.

**Interfaces:** Consumes Task 7.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success.
- [ ] **Step 3: Commit** with the message `feat(studio): Faz B bileşenlerini sayfa tasarımcısına ekle`.

### Task 9: Live verification (QA Test Firma 20261117 only; controller)

Run by the controller after merge and deploy, in the QA tenant only. Build the page `qa-faz-b-bilesenler` on top of the Faz A QA page layout.

**Queries** (about 26, under the 30 cap): `bakiye` (`stok.bakiye.sayfa`), `depolar`, `kart` (`stok.kart.getir`, id `{{liste.seciliSatir.stockItem.id}}`), `olustur`, `guncelle`, `birimler` (`stok.kart.birimleri`), `birimEkle`, `birimEkleYeni`, `birimSil`, `tanimlar` (`stok.ozelAlanTanimlari`), `degerler` (`stok.kart.ozelAlanDegerleri`), `ozelKaydet`, `varyantlar`, `hareketler` (`stok.hareket.listele`), `hareketEkle`, `tersKayit`, `konumlar`, `depoBakiye`, `sonHareketler` (`stok.kart.hareketleri`).

**Components:**
- **Card form.** A formCard with `recordKey: "{{kart.rows[0].id}}"` and `trackChanges`, holding `kod`, `ad` and `birim`.
- **Units.** A stage grid `birimSatirlari` on `birimler`, with:
  - columns `unitCode|Birim|text|required,unique,upperCase,maxLength:8` and `factorToBase|Katsayı|number|required,min:0.000001`;
  - `fixedRowLabel: "Ana birim: {{birimler.meta.baseUnitCode}} (1)"`;
  - `disabledWhen: "kullanici.rol != 'TenantAdmin'"`.
- **Custom fields.** A block `ozel` on `tanimlar`/`degerler`.
- **Variants.** A matrix grid `varyant` (`matrixCode: "{{kod.value}}"`, `matrixName: "{{ad.value}}"`), shown with `visibleWhen: "kart.rows[0].id == null"`.
- **Image.** An `image` bound to `{{gorsel.value}}`.
- **Save sequence on the actionBar:** `[olustur, guncelle, birimEkleYeni, birimEkle, birimSil, ozelKaydet]`, with:
  - `olustur=kart.rows[0].id == null && olustur.sonuc.id == null`;
  - `guncelle=kart.rows[0].id != null`;
  - `birimEkleYeni=kart.rows[0].id == null`;
  - `birimEkle=kart.rows[0].id != null`;
  - `ozelKaydet=kart.rows[0].id != null`.

  `olustur` binds `customFields={{ozel.degerler}}` and `variants={{varyant.satirlar}}`.
- **Movement dialog** `hareketPenceresi`, opened from a `moreButtons` button `Hareketler`. It contains the movement inputs and the `hareketler` table, with a row action `Ters kayıt` that has `promptLabel: "Gerekçe"`, `promptRequired` and `disabledWhen: "hareketTablo.seciliSatir.hasReversal || hareketTablo.seciliSatir.isReversal"`. Its `saveQuery` is `hareketEkle`, with the lot/serial `tracking` list grid visible when `kart.rows[0].trackingMode != 'None'`.
- **Detail tab.** "Hareketler" is a table on `sonHareketler` with `limit: 5` and `emptyText: "Hareket yok."`.

**Verify each of these:**
- Creating a card with 2 units, 2 custom fields and 2×2 variants gives 4 variants. Each code matches the old screen's preview for the same input.
- Editing a card with one unit added and one removed sends a POST and a DELETE, and the custom field PUT keeps unrendered codes.
- Forcing a failing unit (a duplicate code) shows the partial-failure text, and the retry sends only the remaining row.
- A TenantUser saves a card edit; the grid is disabled with its reason.
- Ctrl+S inside the movement dialog posts a movement and does not save the card.
- A reversal asks for a reason, is disabled on already-reversed rows, and refreshes the list.
- Typing on card A and clicking card B asks for confirmation; after "Devam", B's values are shown.
- The image shows a placeholder for an empty or invalid URL.
- Studio shows the new palette items, inspector sections, chips and the `onceki` suggestion, and publishes without schema errors.

Delete the QA page afterwards. Record any parity gap between the old and new stock card screens for Proje 4. The known one is that recipes are not in the catalog yet.

---

## Parallelism

- **Wave 1 (parallel):**
  - Task 1: server catalog and query schema.
  - Task 3: erp-web collections and the sequence runner (pure).
  - Task 4: erp-web grid, custom-field and variant pure modules, plus the vectors file.
  - Task 7: Studio, part one. It needs only the Wire contract and Task 2's rule table, and it touches only Studio page-designer files.

  The file sets are disjoint. Task 4 edits only the import line of `InventoryPage.tsx`.
- **Wave 2:**
  - Task 2 starts after Task 4, because it links Task 4's `gridColumns.vectors.json`, and after Task 1 is merged: both edit `TenantCustomPageSchema.cs` in disjoint regions (Task 1: query methods and `ValidName`; Task 2: component methods and `Context`).
  - Task 5 starts after Task 3.
- **Wave 3:**
  - Task 6 starts after Tasks 4 and 5 (both edit `TenantCustomPage.tsx`).
  - Task 8 starts after Task 7 (it consumes Task 7's editors and previews; only Task 8 edits `CustomPagesPage.tsx`).
- **Last:** Task 9, after all of them are merged and deployed.
