# Proje 2 Faz A — Eksik Bileşenler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the stock pilot what it needs first:
- the missing ERP operations, including a per-card warehouse balance endpoint;
- shaped operation results (flattened nested rows and bindable response metadata);
- conditional visibility and disabling;
- tabs;
- a lookup input;
- a server-paged table;
- input validation.

**Architecture:**
- **Server.** `ErpOperationCatalog` gains 11 operations and three additive wire fields: `routeVariants`, `result.flatten`/`result.metaPaths`, and `bodyMap`. A new `GET /api/stock/items/{id}/balances` serves G9. `TenantCustomPageSchema` validates the new component props, and a small C# parser (`PageConditionExpression`) checks `visibleWhen`/`disabledWhen`.
- **ERP Web.** Two new pure modules: `conditions.ts` (parse and evaluate) and `inputValidation.ts`. Two new components: `PageTabs` and `LookupInput`. The other changes are thin wiring in `TenantCustomPage.tsx` and `usePageQueries.ts`.
- **Studio.** The palette, inspector, canvas preview and variables learn the same props.
- **Client-side checks are UX only.** Conditions and validation run in the browser; server rights and rules are unchanged.

**Tech Stack:** .NET 10 minimal API, xUnit (`tests/IntegrationTests`, WebApplicationFactory + InMemory; `tests/UnitTests/AIERP.Platform.UnitTests`), React + TS, Vitest (erp-web), Studio (`npm run build` = tsc + vite, no test runner).

**Spec:**
- `docs/superpowers/specs/2026-11-18-uyarlanabilir-erp-design.md` (Yol haritası 2).
- `docs/superpowers/specs/2026-11-18-stok-esdegerlik-envanteri.md` (section 5: G1, G3, G9 and components 1, 2, 3, 8, plus the small additions; section 6).
- Builds on Proje 1, `docs/superpowers/plans/2026-11-18-erp-islem-katalogu.md`: the catalog, operation queries, `mapOperationResult`, `runWrite`, `sonuc` and `fieldErrors`.

**Out of Faz A** (later Proje 2 phases): G8 `saveSequence` (multi-operation save), `editableGrid`, `customFieldsBlock`, `dependentList` with reasons, `imageField`, formCard change tracking, the reason-asking confirm dialog, `uretim.recete.listele`, category and custom-field definition operations, lot/serial `tracking` lists in `stok.hareket.ekle`, and per-command conditions on the actionBar.

## Global Constraints

- **Operation names.** Names are `modul.nesne.eylem`, stable forever, only added (Proje 1 rule). Every new name goes into `tests/IntegrationTests/ErpOperationCatalog.names.txt`, kept sorted.
- **Additive changes only.** Existing operations, existing props and the v1 schema behave exactly as before. New wire fields are always present:
  - `routeVariants` is `[]` by default;
  - `flatten` and `metaPaths` are `[]` by default;
  - `bodyMap` is `null` by default.
- **No new privilege.** A condition, a disabled state or a client-side validation never replaces a server check. The server still enforces rights, rules and validation.
- **Turkish UI copy.** User-visible copy is Turkish and exactly as pinned in this plan.
- **Query debounce.** Search-driven parameters (lookup search, table search) use the existing single `QUERY_DEBOUNCE_MS = 300` in `usePageQueries`; no second timer is stacked. This replaces the inventory's 250 ms, because 250 + 300 would wait 550 ms.
- **Upper-casing.** `upperCase` uses JS `toUpperCase()`, matching the server's `ToUpperInvariant`. Never use `toLocaleUpperCase("tr-TR")` (it maps i → İ).
- **Props limit.** The per-component props limit rises from 30 to 40 in v2 only; v1 stays 30.
- **Ownership by id, not nesting.** Tabs own components by id, like `formCard.inputs`. `children` stays legal only on `section`/`card`, the JSON `MaxDepth = 8` is unchanged, and Studio's canvas stays flat.
- **Protected files.** Do not edit `docs/*.json` or `artifacts/`.

## Review Focus

1. **Lookup default outside the first result page.** An edit form presets a lookup to a value that is not in the first page of results. The input shows the raw value; it is not cleared and is not marked invalid. Test: Task 6 (`lookup keeps preset value label`).
2. **Condition on data that has not loaded yet.** For example `kart.rows[0].trackingMode == 'Lot'` before `kart` loads. The path resolves to `null`, nothing throws, and the result is deterministic (false). Test: Task 4 vector.
3. **Search changes on a later page.** The user is on page 5 of a server-paged table and types a search. The next request uses `page=1`, and the in-flight page-5 response is dropped. Test: Task 6 (`search resets page and drops stale page`).
4. **Invalid save from another tab.** Save is pressed while tab 2 is active and an invalid input is on tab 1. The write is not sent, tab 1 becomes active and the input gets focus. Test: Task 5 (`invalid save jumps to first tab with error`).
5. **Custom field values from a different card.** A custom-field values read was loaded for card A, but the save targets card B. Two checks prevent the write:
   - the schema requires identical `id` bindings on the write and its `bodyMap` source query;
   - the runtime refuses when the source rows are not loaded.

   Tests: Task 1 (`Rejects_body_map_write_with_different_id_binding`) and Task 3 (`bodyMap without loaded source throws`).

---

## Wire contract (shared by every task)

`GET /api/custom-pages/erp-operations` entries gain these fields. Everything from Proje 1 is unchanged.

```json
{ "name": "stok.bakiye.sayfa", "route": "/api/warehouses/balances/page",
  "routeVariants": [ { "route": "/api/warehouses/{warehouseId}/balances/page", "when": "warehouseId" } ],
  "result": { "shape": "list", "rowsPath": "items", "columns": [ { "code": "balance.code", "label": "Kod", "dataType": "text" } ],
              "flatten": ["balance", "stockItem"], "metaPaths": ["page", "pageSize", "totalCount", "belowMinimumCount"] },
  "bodyMap": null }
```

```json
{ "name": "stok.kart.ozelAlanKaydet",
  "bodyMap": { "property": "values", "sourceOperation": "stok.kart.ozelAlanDegerleri", "keyColumn": "code", "valueColumn": "value" } }
```

**Route choice.**
- The runtime uses the first `routeVariants[i]` whose `when` parameter has a non-empty value; otherwise it uses `route`.
- The `when` parameter is a `route` parameter with `required: false`.
- Route placeholders, `missingRouteValue` and `sourceRecordError` use the chosen route.

**Flatten.**
- For each name in `flatten`, every scalar property `k` of `row[name]` is copied to `row["name.k"]`. A value is scalar when it is not an object or an array.
- The nested object is kept. A cell reads `row["balance.code"]`, and a binding `{{liste.seciliSatir.balance.code}}` resolves through the nested object to the same value.
- Rows are copied, never mutated.
- Catalog column codes of a flattened operation are the dotted keys.

**Meta.**
- `metaPaths` are top-level property names of the response object; dotted paths are not supported.
- They are copied into `QueryState.meta` and bind as `{{q.meta.totalCount}}`.
- A response that is not an object gives `meta = {}`.

**Body map.**
- The page may bind parameters that the operation does not declare when the operation has a `bodyMap`. Such a parameter must:
  - be named `^[A-Z][A-Z0-9_]{0,39}$` (the custom field code);
  - have type `text`;
  - not collide case-insensitively with a declared parameter.
- The request body is `{ <property>: { ...fromSourceRows, ...boundMapValues } }`. Here `fromSourceRows = { row[keyColumn]: row[valueColumn] }` over all rows of the page's read query whose `operation === bodyMap.sourceOperation`.
- A bound map value of `null`/`undefined` keeps the source value; `""` clears it (Proje 1 null rule).
- Declared body parameters are applied as in Proje 1.

**Condition grammar** (`visibleWhen`, `disabledWhen`; the server parses it, the client parses and evaluates it):

```
expr    := and ( "||" and )*
and     := unary ( "&&" unary )*
unary   := "!" unary | cmp
cmp     := operand [ ( "==" | "!=" ) operand | "in" "[" literal ( "," literal )* "]" ]
operand := path | literal | "(" expr ")"
literal := 'text' | "text" | number | true | false | null
path    := binding PATH (pageBindings.ts / TryParseBindingPath), root not a keyword
number  := -?\d+(\.\d+)?
```

**Lexical limits.**
- Strings have no escapes, are at most 100 characters, and may not contain their own quote character.
- Keywords are `true false null in`.
- The whole expression is at most 300 characters, with at most 8 levels of parentheses.
- Server error: `"'<prop>' koşulu geçersiz: <neden>"`.
- The root of every path must be a page name (component or query) or a reserved name (`kullanici`, `bugun`, `sayilar`). Otherwise the server rejects it with `"'<prop>' koşulu sayfada olmayan bir ada başvuruyor: <kök>"`.

**Evaluation semantics.**
- **Normalization.** Each operand is normalized first:
  - `undefined`, `null` and `""` become `null`;
  - a number stays a number and a boolean stays a boolean;
  - a string matching `^-?\d+(\.\d+)?$` becomes a number;
  - the strings `"true"` and `"false"` become booleans;
  - any other string stays a string;
  - objects and arrays become `null`.
- **`==` / `!=`** compare the normalized values strictly.
- **`in [...]`** is true when any listed literal is `==` the operand.
- **A bare operand or `!`** uses truthiness: anything except `null`, `false` and `0` is true.
- **Unparsable text** (old or bad data) falls back to visible and enabled.

**Session.** `kullanici.rol` is the token payload's `role` claim. When the claim is an array, the first element is used; when it is missing, `""`.

---

### Task 1: Server — catalog additions, warehouse balances per card, additive wire fields

**Files:**
- Modify: `src/Hosts/AIERP.Api/ErpOperationCatalog.cs`
  - records (see Interfaces);
  - `Read`/`Write` helpers take a `module` argument;
  - `Columns<T>(string? prefix = null)`;
  - new label keys;
  - `RequiredPermissions` checks the base route and every variant;
  - the view carries the new fields.
- Create: `src/Hosts/AIERP.Api/StockItemBalanceEndpoints.cs`. It exposes `MapStockItemBalanceEndpoints(this RouteGroupBuilder stockItems)`, which maps `GET /{id:guid}/balances`.
- Modify: `src/Hosts/AIERP.Api/Program.cs`
  - call `stockItems.MapStockItemBalanceEndpoints();` after the units handlers (~line 2416);
  - the `/balances/page` handlers (~2896, ~2964) get the defaults `bool belowMinimumOnly = false, int page = 1, int pageSize = 25`. Today these non-nullable query parameters are required, so a request without them fails with 400.
- Modify: `src/Platform/AIERP.Platform.Application/PlatformContracts.cs`: add `StockItemWarehouseBalanceView`.
- Modify: `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs`: a GET path matching `^/api/stock/items/[0-9a-fA-F-]{36}/balances$` resolves to `erp.warehouses`, not `erp.stock-items`. It exposes warehouse balances, and a user denied warehouses must not read them through `/api/stock`.
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`: `ValidateOperationQuery` and `ValidateQueries` only, for the body-map rule.
- Modify: `tests/IntegrationTests/ErpOperationCatalog.names.txt`, `tests/IntegrationTests/ErpOperationCatalogTests.cs`, `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs`
- Test (unit): add to the test class under `tests/UnitTests/AIERP.Platform.UnitTests` that already calls `PlatformPermissionCatalog.TryResolve` (e.g. `CustomPageAccessRulesTests.cs`).

**Interfaces (Produces):**

```csharp
public sealed record StockItemWarehouseBalanceView(Guid WarehouseId, string WarehouseCode, string WarehouseName, decimal QuantityOnHand,
    decimal ReservedQuantity, decimal AvailableQuantity, decimal ValuationAmountBase, decimal UnvaluedQuantity, string BaseCurrencyCode);

internal sealed record ErpOperationRouteVariant(string Route, string When);
internal sealed record ErpOperationBodyMap(string Property, string SourceOperation, string KeyColumn, string ValueColumn);
internal sealed record ErpOperationResult(string Shape, string? RowsPath, IReadOnlyList<ErpOperationColumn> Columns)
{ public IReadOnlyList<string> Flatten { get; init; } = []; public IReadOnlyList<string> MetaPaths { get; init; } = []; }
// ErpOperation gains: public IReadOnlyList<ErpOperationRouteVariant> RouteVariants { get; init; } = []; public ErpOperationBodyMap? BodyMap { get; init; }
// ErpOperationView gains RouteVariants and BodyMap (wire: routeVariants, bodyMap).
```

**New operations.** Module `Stok` unless marked Depo. Columns come from `Columns<T>()`, body parameters from `BodyParameters<T>()`, and route parameters from `Route()`, which is required guid unless noted.

| name | method route | pageKind | parameters | result |
|---|---|---|---|---|
| `stok.bakiye.sayfa` | GET `/api/warehouses/balances/page`; variant `/api/warehouses/{warehouseId}/balances/page` when `warehouseId` | read | route `warehouseId` (guid, **not required**); query `q` text, `belowMinimumOnly` bool, `page` int, `pageSize` int | list `items`; `flatten [balance, stockItem]`; `metaPaths [page, pageSize, totalCount, belowMinimumCount]`; columns `Columns<InventoryBalanceView>("balance")` + `Columns<StockItemView>("stockItem")` minus `stockItem.code`, `stockItem.name`, `stockItem.unitCode`, `stockItem.minimumStock` |
| `depo.listele` (Depo) | GET `/api/warehouses` | read | — | list `null`, `WarehouseView` |
| `depo.konumlari` (Depo) | GET `/api/warehouses/{warehouseId}/locations` | read | route `warehouseId` | list `null`, `WarehouseLocationView` |
| `stok.kart.birimleri` | GET `/api/stock/items/{id}/units` | read | `id` | list `conversions`; `metaPaths [baseUnitCode]`; `StockItemUnitConversionView` |
| `stok.kart.birimEkle` | POST `/api/stock/items/{id}/units` | insert | `id` + `BodyParameters<StockItemUnitConversionWriteRequest>(sourceBacked: false)` | record `StockItemUnitConversionView`; `requiresTenantAdmin` |
| `stok.kart.birimSil` | DELETE `/api/stock/items/{id}/units/{conversionId}` | delete | `id`, `conversionId` | none; `requiresTenantAdmin` |
| `stok.kart.ozelAlanKaydet` | PUT `/api/stock/items/{id}/custom-fields` | update | `id` (required, no `SourceOperation`) | list `null`, `StockCustomFieldValueView`; `bodyMap (values, stok.kart.ozelAlanDegerleri, code, value)` |
| `stok.hareket.listele` | GET `/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions` | read | `warehouseId`, `stockItemId`, query `page`, `pageSize` | list `items`; `metaPaths [page, pageSize, totalCount]`; `InventoryTransactionView` |
| `stok.hareket.ekle` | POST same route | insert | both routes + `BodyParameters<InventoryTransactionWriteRequest>(sourceBacked: false)` (`tracking` is a list and is skipped: lot/serial movements are out of Faz A) | record `InventoryTransactionView` |
| `stok.hareket.tersKayit` | POST `/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions/{entryId}/reverse` | insert (a reversal writes a new entry) | three routes + body `reason` (required) | record `InventoryTransactionView` |
| `stok.kart.depoBakiyeleri` | GET `/api/stock/items/{id}/balances` | read | `id` | list `null`, `StockItemWarehouseBalanceView` |

**New label keys** (Turkish). `Label()` throws at static init for a missing key.

| key | label |
|---|---|
| `stockItemId` | Stok kartı kimliği |
| `quantityOnHand` | Eldeki miktar |
| `belowMinimum` | Minimum altında |
| `reservedQuantity` | Rezerve miktar |
| `availableQuantity` | Kullanılabilir miktar |
| `valuationAmountBase` | Stok değeri |
| `unvaluedQuantity` | Maliyetsiz miktar |
| `baseCurrencyCode` | Ana para birimi |
| `factorToBase` | Ana birim katsayısı |
| `parentLocationId` | Üst konum |

A prefixed column takes the label of its inner code.

**Endpoint behavior.** `GET /api/stock/items/{id}/balances`:
- **Not found.** Returns 404 when the item is not in the caller's tenant.
- **Rows.** Otherwise one row per **active** warehouse of the tenant, ordered by warehouse code, zero rows included.
- **Figures.** Each figure uses the same formulas as `GET /api/warehouses/{warehouseId}/balances`:
  - signed receipt/issue sum;
  - active sales reservations;
  - `available = max(0, onHand - reserved)`;
  - valuation plus `InventoryCostAdjustmentLines`;
  - unvalued quantity.
- **Queries.** Use grouped queries by `WarehouseId` (one per source table), not a loop of per-warehouse calls.

- [ ] **Step 1: Write failing tests:**
  - **In `ErpOperationCatalogTests`:**
    - `Names_are_unique_and_well_formed` (amend). Today it asserts every `route` parameter is `Required` and appears in `op.Route`, which `stok.bakiye.sayfa` would fail. The new rule:
      - a route parameter named by some `RouteVariants[i].When` must be **not** required and must appear in that variant's route;
      - every other route parameter keeps the old assertion;
      - the placeholder loop also covers variant routes.
    - `Every_operation_matches_a_registered_endpoint` (extend): every `RouteVariants[i].Route` is also a registered endpoint for `op.Method`; each `When` names a non-required `route` parameter of the op, and that parameter appears in the variant route but not in the base route.
    - `Names_are_append_only`: passes once the 11 names are added to the file.
    - `Depo_operations_use_depo_module`: every `depo.*` op has `Module == "Depo"`.
    - `Flatten_and_meta_are_consistent`: for every op, each `Flatten` entry is the prefix of at least one column code (`code.StartsWith(name + ".")`). `MetaPaths` and `Flatten` are empty for all Proje 1 ops.
    - `Body_map_source_is_a_read_operation`: the `BodyMap.SourceOperation` of `stok.kart.ozelAlanKaydet` is an existing read op whose columns contain `KeyColumn` and `ValueColumn`.
    - `Catalog_endpoint_returns_new_fields`: the JSON for `stok.bakiye.sayfa` has `routeVariants[0].when == "warehouseId"`, `result.flatten == ["balance","stockItem"]` and `bodyMap == null`. `stok.kart.listele` has `routeVariants == []`, `result.metaPaths == []`.
    - `Unit_writes_require_tenant_admin`: a TenantUser gets `allowed:false` for `stok.kart.birimEkle` and `stok.kart.birimSil`.
    - `Stock_item_balances_return_active_warehouses`: seed 2 active warehouses and 1 inactive, a receipt of 5 in warehouse A, and an issue of 2 in A. Expect 2 rows; A has `quantityOnHand 3`, B has 0; the inactive warehouse is absent. A different tenant's item id gives 404.
    - `Stock_item_balances_follow_warehouse_permission`: a TenantUser with a tenant Deny rule on `erp.warehouses` read gets 403 from `GET /api/stock/items/{id}/balances`, and `allowed:false` for `stok.kart.depoBakiyeleri` and `stok.bakiye.sayfa`. Follow the existing Deny seeding in `Catalog_endpoint_returns_operations_with_allowed_flags`.
    - `Balance_page_defaults_when_query_omitted`: `GET /api/warehouses/balances/page` without a query string returns 200 with `page 1`, `pageSize 25`.
  - **In the unit permission test class:** `Stock_item_balances_route_resolves_to_warehouses_permission`. `TryResolve("/api/stock/items/<guid>/balances", "GET", "/api/stock/items/{id:guid}/balances", …)` resolves to `erp.warehouses`. `/api/stock/items/<guid>/units` still resolves to `erp.stock-items`.
  - **In `TenantCustomPageSchemaV2Tests`** (the operation-query rule):
    - `Accepts_body_map_write_with_custom_field_parameters`. Page:
      - read `degerler` = `stok.kart.ozelAlanDegerleri` with `id` = `{{liste.seciliSatir.id}}`;
      - write `alanlar` = `stok.kart.ozelAlanKaydet` with `id` = `{{liste.seciliSatir.id}}` and `RENK` (text) = `{{renk.value}}`.

      Expect valid.
    - `Rejects_body_map_parameter_with_lowercase_name` (`renk`): error contains "'renk' parametresi 'stok.kart.ozelAlanKaydet' işleminde tanımlı değil".
    - `Rejects_body_map_parameter_of_non_text_type` (`RENK` as `int`): error contains "türü text olmalıdır".
    - `Rejects_body_map_write_without_source_read`: error contains "'stok.kart.ozelAlanDegerleri' okuma sorgusu olmalıdır".
    - `Rejects_body_map_write_with_different_id_binding`: the source query's `id` is `{{liste.seciliSatir.id}}` and the write's is `{{kart.rows[0].id}}`. Error text: `"'alanlar' sorgusu: 'id' bağlaması 'stok.kart.ozelAlanDegerleri' sorgusununkiyle aynı olmalıdır."`
    - `Accepts_balance_page_without_warehouse_binding`: `stok.bakiye.sayfa` with only `q` bound is valid.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~ErpOperationCatalogTests|FullyQualifiedName~TenantCustomPageSchemaV2Tests"` and `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~Stock_item_balances_route"`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - **Schema rule.** In `ValidateOperationQuery`, an undeclared page parameter is accepted only under the Wire-contract body-map conditions; the existing error text stays for everything else.
  - **Body-map source.** `bodyMap.SourceOperation` joins `pendingSources`. When the pending sources are resolved, each route parameter shared by the write and its body-map source must have the same `binding` string. That check needs the parameters of both queries, so keep the `PageQuery` list.
- [ ] **Step 4: Run the tests again.** Expected: PASS. Then run `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~Permission|FullyQualifiedName~ArchitectureBoundary"` and `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~Inventory"`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(api): stok pilotu için ERP işlemleri ve kart bazında depo bakiyeleri`.

### Task 2: Server — component schema for conditions, tabs, lookup, paging and validation

**Files:**
- Create: `src/Hosts/AIERP.Api/PageConditionExpression.cs`
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`
  - component validation only, not the query methods Task 1 touches;
  - new prop names go into `SafePropsV2`;
  - `disabledReason` goes into `BindableProps` and into `MessageLimits` with limit 200;
  - `lookup` goes into `InputTypes`;
  - the v2 props cap is 40;
  - the v2 query limit `MaxQueries` rises from 20 to 30. The stock pilot needs about 21 queries, and the 80-component cap applies to the whole page because tabs own components by id;
  - `Context` gains `TopLevelIds`, pending tab refs, pending condition roots, pending paged tables and `QueryById` (from `ValidateQueries`' result list).
- Modify: `tests/IntegrationTests/AIERP.Api.IntegrationTests.csproj` (next to the existing `names.txt` item): `<None Include="..\..\frontend\erp-web\src\custom-page\conditions.vectors.json" Link="PageConditionVectors.json" CopyToOutputDirectory="PreserveNewest" />`
- Create: `tests/IntegrationTests/PageConditionExpressionTests.cs`, `tests/IntegrationTests/TenantCustomPageComponentsFazATests.cs` (a new file, so it does not collide with Task 1's edits in `TenantCustomPageSchemaV2Tests.cs`)

**Interfaces:**
- Consumes: the vectors file from Task 4 (`conditions.vectors.json`, shape below).
- Produces:

```csharp
internal static class PageConditionExpression
{
    internal const int MaxLength = 300;
    /// <summary>Parses per the Wire-contract grammar; roots are the first identifiers of every path, in order, distinct.</summary>
    internal static bool TryParse(string text, out IReadOnlyList<string> roots, out string? error);
}
```

**Prop rules** (v2 only; each violation is rejected with the quoted Turkish text; "id" means a component id):

| prop | allowed on | rule / error |
|---|---|---|
| `visibleWhen` | every v2 type | string, `TryParse` ok, roots resolved after the loop (Wire contract errors) |
| `disabledWhen` | `button`, `input` | as above; elsewhere `"'disabledWhen' yalnız düğme ve giriş bileşenlerinde kullanılabilir."` |
| `disabledReason` | `button`, `input`, only with `disabledWhen` | bindable, ≤ 200; without `disabledWhen`: `"'disabledReason' için 'disabledWhen' de tanımlı olmalıdır."` |
| `tabs` | `tabs` (new type in `ComponentTypesV2`; props required) | 1–8 strings `^[^=,]{1,40}=([A-Za-z0-9_-]{1,64}(,[A-Za-z0-9_-]{1,64}){0,19})?$`; else `"'tabs' 1–8 adet Etiket=kimlik,kimlik öğesi içermelidir."` |
| `defaultTab` | `tabs` | int `0..tabs.Length-1`; else `"'defaultTab' sekme sırası (0'dan başlar) olmalıdır."` |
| `optionDescriptionColumn` | `input` with `inputType` `lookup` | 1–128 chars |
| `minChars` | lookup | int 0–5 |
| `staticOptions` | lookup | ≤ 20 strings `^[^=]{0,128}=[^=]{1,60}$`; else `"'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır."` |
| `allowClear` | lookup | bool |
| `optionsQuery` | `select` and `lookup` | unchanged rule; a lookup needs `optionsQuery` or `staticOptions`: `"Arama kutusu için seçenek sorgusu veya sabit seçenek gerekli."` |
| `paging` | `dataTable` | `"server"` only |
| `pageParam`, `pageSizeParam`, `pageSize`, `searchInput`, `footerMeta` | `dataTable` with `paging: "server"` | otherwise `"'<prop>' yalnız sunucu sayfalı (paging: server) veri listesinde kullanılabilir."` |
| `pageSize` | paged table | int 5–100 (default 25) |
| `footerMeta` | paged table | ≤ 6 strings `^[A-Za-z_][A-Za-z0-9_]{0,63}=[^=]{1,60}$`; every key in the operation's `Result.MetaPaths`; else `"'footerMeta' anahtarı işlemin üst bilgileri arasında yok: <anahtar>"` |
| `required`, `upperCase` | `input` | bool; `upperCase` only on text inputs |
| `min`, `max` | `input` `number` (number) or `date` (`YYYY-MM-DD` string) | else `"'<prop>' yalnız sayı veya tarih girişinde kullanılabilir."`; `min <= max` |
| `step` | `input` `number` | number > 0 and ≤ 1000000 |
| `maxLength` | `input` `text` | int 1–4000 |
| `pattern` | `input` `text` | string ≤ 200 that compiles as `new Regex(pattern, RegexOptions.None, RegexTimeout)`; else `"'pattern' geçerli bir düzenli ifade değil."` |
| `patternMessage` | `input` with `pattern` | static string ≤ 120 |

**Paged table resolution.** Paged tables are resolved after the loop. A paged table must:
- have a `name`;
- have a `query` that is an operation query;
- have its operation declare int `query` parameters named `pageParam` (default `"page"`) and `pageSizeParam` (default `"pageSize"`);
- bind those parameters on the page query to exactly `{{<tableName>.sayfa}}` and `{{<tableName>.sayfaBoyutu}}`.

Errors:
- `"Sunucu sayfalı liste adlı ve ERP işlemine bağlı olmalıdır: <id>"`
- `"'<tablo>' listesinin '<param>' parametresi {{<tablo>.sayfa}} ile bağlanmalıdır."` (or `sayfaBoyutu`)

`searchInput` must name a text input that no formCard, facetPanel or tab owns. The table owns it, so it cannot also have another owner.

**Tab resolution.** Tabs are resolved after the loop. Every owned id must:
- exist;
- be in the root `components` array;
- not be `tabs` or `actionBar`;
- not be an input owned by formCard/facetPanel or used as a table's `searchInput`;
- belong to at most one tab.

Errors:
- `"Sekmenin bileşeni sayfada yok: <id>"`
- `"Sekmeler yalnız üst düzey bileşenleri içerebilir: <id>"`
- `"'<id>' birden fazla sekmede veya yerleşimde kullanılamaz."`

- [ ] **Step 1: Write failing tests:**
  - **`PageConditionExpressionTests`:**
    - `Valid_vectors_parse_with_expected_roots`: every `syntax.valid[i]` parses, and `roots` equals `syntax.valid[i].roots`.
    - `Invalid_vectors_are_rejected`: every `syntax.invalid[i]` fails.
    - `Rejects_301_characters`.
  - **`TenantCustomPageComponentsFazATests`:**
    - `Accepts_visibleWhen_on_any_component` (heading with `kullanici.rol == 'TenantAdmin'`).
    - `Rejects_visibleWhen_with_unknown_root` (`yok.value == 1`, error contains "sayfada olmayan bir ada başvuruyor: yok").
    - `Rejects_disabledWhen_on_heading`.
    - `Rejects_disabledReason_without_disabledWhen`.
    - `Accepts_tabs_owning_top_level_formCard_and_table`.
    - `Rejects_tab_owning_child_of_section`.
    - `Rejects_component_in_two_tabs`.
    - `Rejects_tabs_owning_actionBar`.
    - `Rejects_defaultTab_out_of_range`.
    - `Accepts_lookup_with_static_options_only`.
    - `Rejects_lookup_without_options`.
    - `Rejects_minChars_on_text_input`.
    - `Accepts_server_paged_table_on_balance_page`. The table is named `liste` on `stok.bakiye.sayfa`, with `page` = `{{liste.sayfa}}`, `pageSize` = `{{liste.sayfaBoyutu}}`, `footerMeta: ["belowMinimumCount=Minimum altı"]` and `searchInput` set to a text input.
    - `Rejects_paged_table_with_wrong_page_binding`.
    - `Rejects_paged_table_on_sql_query`.
    - `Rejects_footerMeta_key_not_in_metaPaths` (`foo=Bar`).
    - `Rejects_paging_props_without_server_paging`.
    - `Accepts_validation_props_on_number_and_text_inputs`.
    - `Rejects_maxLength_on_number_input`.
    - `Rejects_invalid_pattern` (`"("`).
    - `Rejects_min_greater_than_max`.
    - `Accepts_40_props_in_v2`.
    - `Accepts_30_queries_in_v2`.
    - `Rejects_31_queries_in_v2` (error contains "en fazla 30 sorgu").
    - `Keeps_30_props_limit_in_v1`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~PageConditionExpressionTests|FullyQualifiedName~TenantCustomPageComponentsFazATests"`. Expected: FAIL.
- [ ] **Step 3: Implement** `PageConditionExpression` as a hand-written recursive-descent parser; regex alone is not enough for the nesting limit. Then add the prop rules and the post-loop resolutions above.
- [ ] **Step 4: Run the tests again,** then `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage"`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(api): koşul, sekme, arama kutusu, sayfalı liste ve doğrulama özellikleri şeması`.

### Task 3: ERP Web — operation runtime: route variants, flatten, meta, body map

**Files:**
- Modify: `frontend/erp-web/src/custom-page/erpOperations.ts`, `frontend/erp-web/src/custom-page/usePageQueries.ts`
- Test: `frontend/erp-web/src/custom-page/erpOperations.test.ts`, `frontend/erp-web/src/custom-page/usePageQueries.erp.test.tsx` (extend)

**Interfaces (Produces):**

```ts
export type ErpOperation = /* Proje 1 */ & {
  routeVariants?: { route: string; when: string }[];
  bodyMap?: { property: string; sourceOperation: string; keyColumn: string; valueColumn: string } | null;
  result: { /* Proje 1 */ flatten?: string[]; metaPaths?: string[] };
}; // missing or null fields are treated as [] / null (an older server)
export function chooseRoute(op: ErpOperation, values: Record<string, unknown>): string;
export function buildOperationRequest(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null,
  mapSourceRows?: Record<string, unknown>[] | null): OperationRequest; // throws "Kaynak kayıt yüklenmedi; önce bir kayıt seçin." when op.bodyMap && !mapSourceRows
export function mapOperationResult(op: ErpOperation, json: unknown): { rows; rowCount; columns; meta: Record<string, unknown> };
// QueryState gains: meta?: Record<string, unknown>
```

`missingRouteValue` and `sourceRecordError` use `chooseRoute(op, values)`. In `usePageQueries`:
- **`mapSourceRows(op)`.** Returns `states[q.name].rows` of the page read query whose `operation === op.bodyMap.sourceOperation`, when that state has `ran && !loading`; otherwise `null`.
- **Write guard.** `runOperationWrite` passes `mapSourceRows(op)`, and refuses with "Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin." while that source is loading.
- **Read states.** Read states store `meta`.

- [ ] **Step 1: Write failing tests:**
  - **`erpOperations.test.ts`:**
    - `chooses variant route when warehouseId set`: `{warehouseId:"<guid>", q:"a"}` gives `/api/warehouses/<guid>/balances/page?q=a`. The value must not also appear in the query string.
    - `chooses base route for empty warehouseId`: `{warehouseId:""}` gives `/api/warehouses/balances/page` ("Tüm depolar").
    - `missingRouteValue is false for unset optional variant param`.
    - `flattens nested rows and keeps nested objects`: `{items:[{balance:{code:"A",quantityOnHand:3}, stockItem:{id:"x", tags:["t"]}}]}` gives a row with `row["balance.code"]==="A"`, `row["stockItem.id"]==="x"`, no `row["stockItem.tags"]`, and `row.balance.code==="A"`. The input object is unchanged.
    - `copies metaPaths into meta`: `{items:[], totalCount:7, belowMinimumCount:2, extra:1}` gives `meta {totalCount:7, belowMinimumCount:2}`; a non-object json gives `meta {}`.
    - `ops without new fields still map` (Proje 1 fixture without `flatten`/`metaPaths`/`routeVariants`).
    - `bodyMap merges source rows and bound values`. Source rows: `[{code:"RENK",value:"Mavi"},{code:"BOY",value:"10"}]`. Values: `{id:"<guid>", RENK:"Kırmızı", BOY:null}`. The body is `{"values":{"RENK":"Kırmızı","BOY":"10"}}` and the URL is `/api/stock/items/<guid>/custom-fields`.
    - `bodyMap without loaded source throws` (`mapSourceRows` null): throws "Kaynak kayıt yüklenmedi; önce bir kayıt seçin.".
  - **`usePageQueries.erp.test.tsx`:**
    - `read state exposes meta`: `scope.<name>.meta.totalCount === 7`.
    - `body map write waits for source rows`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page/erpOperations src/custom-page/usePageQueries.erp` in `frontend/erp-web`. Expected: FAIL.
- [ ] **Step 3: Implement.** Undeclared values go into the map only when `op.bodyMap` is set; without one they are ignored, as in Proje 1.
- [ ] **Step 4: Run** `npx vitest run src/custom-page` and then `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): ERP işlemi yol seçenekleri, düzleştirme, üst bilgi ve gövde eşlemesi`.

### Task 4: ERP Web — pure condition and validation modules

**Files:**
- Create: `frontend/erp-web/src/custom-page/conditions.ts`, `frontend/erp-web/src/custom-page/conditions.test.ts`, `frontend/erp-web/src/custom-page/conditions.vectors.json`
- Create: `frontend/erp-web/src/custom-page/inputValidation.ts`, `frontend/erp-web/src/custom-page/inputValidation.test.ts`

**Interfaces (Produces):**

```ts
// conditions.ts
export type ConditionNode =
  | { kind: "or" | "and"; items: ConditionNode[] } | { kind: "not"; item: ConditionNode }
  | { kind: "cmp"; op: "==" | "!="; left: ConditionNode; right: ConditionNode } | { kind: "in"; item: ConditionNode; list: ConditionNode[] }
  | { kind: "path"; path: string } | { kind: "literal"; value: string | number | boolean | null };
export function parseCondition(text: string): { ok: true; node: ConditionNode; roots: string[] } | { ok: false; error: string };
export function evaluateCondition(node: ConditionNode, scope: PageScope): boolean;
/** Unparsable or non-string text returns `fallback`. */
export function conditionHolds(text: unknown, scope: PageScope, fallback: boolean): boolean;

// inputValidation.ts
export type InputRules = { required: boolean; min?: number | string; max?: number | string; step?: number; maxLength?: number;
  pattern?: string; patternMessage?: string; upperCase: boolean };
export function inputRules(props: Record<string, unknown>): InputRules;
export function validateInputValue(inputType: string, rules: InputRules, raw: string | boolean): string | null;
export function applyTyping(rules: InputRules, text: string): string; // upperCase via toUpperCase(); never truncates
/** Input names bound as `{{<name>.value}}` by the query's parameters, in parameter order. */
export function boundInputNames(query: { parameters: { binding: string }[] }): string[];
export const VALIDATION_BLOCKED = "Formda düzeltilmesi gereken alanlar var.";
```

**Validation messages** (exact; `{x}` is `String(x)`). Checks run in this order, and the first failing check returns:

| check | message |
|---|---|
| required and empty (checkbox: `false`) | `Bu alan zorunludur.` |
| number not parsable | `Geçerli bir sayı girin.` |
| number `< min` | `En az {min} olmalıdır.` |
| number `> max` | `En fazla {max} olmalıdır.` |
| date `< min` | `En erken {min} olabilir.` |
| date `> max` | `En geç {max} olabilir.` |
| step | `Değer {step} adımlarına uymalıdır.` (passes when `abs(v/step - round(v/step)) < 1e-9`) |
| length `> maxLength` | `En fazla {maxLength} karakter girilebilir.` |
| pattern fails | `patternMessage` or `Değer beklenen biçimde değil.` |

An empty, non-required value passes every check. The pattern is tested as `new RegExp("^(?:" + pattern + ")$", "u")`; a pattern that does not compile is skipped.

**Vectors file** (`conditions.vectors.json`). Task 2 reads only `syntax`:

```json
{ "syntax": {
    "valid": [
      { "text": "kullanici.rol == 'TenantAdmin'", "roots": ["kullanici"] },
      { "text": "liste.seciliSatir.balance.belowMinimum", "roots": ["liste"] },
      { "text": "!(ad.value == '') && kart.rows[0].trackingMode in ['Lot', 'Serial']", "roots": ["ad", "kart"] },
      { "text": "yon.value != \"Receipt\" || miktar.value == 0", "roots": ["yon", "miktar"] },
      { "text": "x.value == null", "roots": ["x"] } ],
    "invalid": [ "", "ad.value ==", "ad.value = 1", "ad.value < 3", "in == 1", "'abc", "ad.value in []", "((((((((((a.value))))))))))", "a.value && || b.value" ] },
  "eval": [
    { "text": "kullanici.rol == 'TenantAdmin'", "scope": { "kullanici": { "rol": "TenantAdmin" } }, "expected": true },
    { "text": "kart.rows[0].trackingMode == 'Lot'", "scope": {}, "expected": false },
    { "text": "miktar.value == 5", "scope": { "miktar": { "value": "5" } }, "expected": true },
    { "text": "aktif.value", "scope": { "aktif": { "value": "false" } }, "expected": false },
    { "text": "ad.value == null", "scope": { "ad": { "value": "" } }, "expected": true },
    { "text": "!liste.seciliSatir", "scope": { "liste": { "seciliSatir": null } }, "expected": true },
    { "text": "k.value in ['Lot','Serial']", "scope": { "k": { "value": "Serial" } }, "expected": true } ] }
```

- [ ] **Step 1: Write failing tests:**
  - **`conditions.test.ts`:**
    - `valid syntax vectors parse with roots`.
    - `invalid syntax vectors fail`.
    - `eval vectors`.
    - `conditionHolds falls back on unparsable text` (`conditionHolds("a ==", {}, true) === true`, and the same with `false`).
    - `rejects 301 characters`.
  - **`inputValidation.test.ts`:** one test per message row above, using the exact strings, plus:
    - `empty optional value passes`;
    - `applyTyping upper-cases with invariant rules` (`applyTyping({upperCase:true,…}, "istif") === "ISTIF"`);
    - `invalid pattern is skipped`;
    - `boundInputNames ignores non-value bindings` (`[{binding:"{{ad.value}}"},{binding:"{{liste.seciliSatir.id}}"}]` gives `["ad"]`).
- [ ] **Step 2: Run** `npx vitest run src/custom-page/conditions src/custom-page/inputValidation`. Expected: FAIL.
- [ ] **Step 3: Implement.** Paths resolve through `resolvePath` from `pageBindings.ts`.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(erp-web): koşul ifadesi ve giriş doğrulama modülleri`.

### Task 5: ERP Web — conditions, validation, role and tabs at runtime

**Files:**
- Create: `frontend/erp-web/src/custom-page/PageTabs.tsx`, `frontend/erp-web/src/custom-page/PageTabs.test.tsx`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`
  - `sessionUser` adds `rol`;
  - `renderComponent` applies `visibleWhen` first;
  - buttons and inputs get `disabledWhen`;
  - `PageInput` gets the validation attributes and messages;
  - a `case "tabs"`;
  - the top-level render skips tab-owned ids;
  - `PageRuntime` gains `validationErrors`, `validateFor`, `errorJump`.
- Modify: `frontend/erp-web/src/custom-page/layoutRefs.ts`: `parseTabs`, `tabOwnedIds`.
- Modify: `frontend/erp-web/src/custom-page/writeAction.ts`: the opts gain `validate?: () => string | null`. It runs before the confirm dialog; a non-null result returns `{ ok: false, error }` and skips both confirm and `write`. Proje 2b adds `beforeWrite` to the same function. These are separate hooks; when both exist, `validate` runs first.
- Modify: `frontend/erp-web/src/custom-page/pageActions.ts`: a moreButtons button that is hidden by `visibleWhen` is omitted. One disabled by `disabledWhen` becomes a command with `disabledReason` set to its bound `disabledReason`, or "Bu işlem şu anda kullanılamaz.".
- Modify: `frontend/erp-web/src/tenant-custom-page.css`
- Test: `frontend/erp-web/src/custom-page/TenantCustomPageConditions.test.tsx`, `writeAction.test.ts` (extend), `pageActions.test.ts` (extend), `layoutRefs.test.ts` (extend)

**Interfaces:**
- Consumes: Task 4 (`conditionHolds`, `inputRules`, `validateInputValue`, `applyTyping`, `boundInputNames`, `VALIDATION_BLOCKED`).
- Produces:

```ts
// layoutRefs.ts
export function parseTabs(value: unknown): { label: string; ids: string[] }[]; // drops malformed items, max 8 tabs / 20 ids
export function tabOwnedIds(components: { id: string; type: string; props?: Record<string, unknown> }[]): Set<string>;
// PageTabs.tsx
export function PageTabs(props: { id: string; tabs: { label: string; ids: string[] }[]; defaultTab: number;
  renderOwned: (id: string) => ReactNode; errorCounts: number[]; jumpTo: { tab: number; signal: number } | null; style: CSSProperties }): JSX.Element;
```

**Tabs behavior.**
- **Width.** `visualStyle` gives `tabs` a default span of 12, the same as `formCard`.
- **Markup.** `role="tablist"`; each tab is a `button` with `role="tab"`, `aria-selected` and `aria-controls`. Panels have `role="tabpanel"`.
- **All panels mounted.** Every panel is rendered; inactive panels get the `hidden` attribute, so inputs keep their state and validation sees them.
- **Keyboard.** ArrowLeft/ArrowRight cycle the tabs, Home/End jump to the ends, and focus moves with the selection.
- **Error marker.** A tab with `errorCounts[i] > 0` gets the class `is-error` and a badge showing the count.
- **Error jump.** When `jumpTo.signal` changes, that tab becomes active. Then, after paint, the first `.tenant-page-input.is-invalid input, select` inside it is focused.

**Validation behavior.**
- **Which inputs.** `validateFor(query)` checks the inputs named by `boundInputNames(query)`. It skips inputs whose `visibleWhen` is false, inputs whose `disabledWhen` is true, and inputs owned by a hidden tabs/formCard.
- **On failure.** It stores the messages in `validationErrors` (by input id) and computes the first tab (in tab order) that owns an invalid input, directly or through an owned formCard. It then bumps `errorJump` and returns `VALIDATION_BLOCKED`.
- **Wiring.** Both write paths pass `validate: () => runtime.validateFor(query)`: `QueryActionButton` and `PageActionCommands.writeThroughBar`.
- **Messages under inputs.** A client validation message takes precedence over the server field error. It is shown after blur or after a blocked write, and clears on the next change that makes the value valid.
- **Attributes.** `PageInput` sets `required`, `min`, `max`, `step` (when given; otherwise `any` for number) and `maxLength`. The wrapper gets the class `is-invalid` and the control gets `aria-invalid`. `upperCase` is applied in `onChange` through `applyTyping`.

**Conditions behavior.**
- **`visibleWhen` false.** The component renders `null`. This also applies inside formCard, tabs and moreButtons. An actionBar with a false `visibleWhen` registers no commands.
- **`disabledWhen` true.** A button gets `disabled` and `title={disabledReason}`, plus `<small className="tenant-page-disabled-reason">{disabledReason}</small>` when a reason is set. An input gets `disabled`.
- **Scope.** Conditions evaluate against `runtime.scope`.

- [ ] **Step 1: Write failing tests:**
  - **`PageTabs.test.tsx`:**
    - `renders all panels and hides inactive`.
    - `arrow keys move selection`.
    - `shows error badge`.
    - `jumpTo activates tab and focuses first invalid input`.
  - **`TenantCustomPageConditions.test.tsx`** (render a v2 page through the exported runtime pieces, or `TenantCustomPage` with mocked `../erpApi`, as `TenantCustomPageErp.test.tsx` does):
    - `kullanici.rol comes from token role claim`: a token payload `{sub:"u", role:"TenantUser"}` means a heading with `visibleWhen: "kullanici.rol == 'TenantAdmin'"` is absent.
    - `disabledWhen disables button and shows reason`.
    - `invalid save jumps to first tab with error`. Setup: tabs `["Genel=kod", "Diğer=not"]`; required input `kod` on tab 0; tab 1 active; actionBar `saveQuery` is a write binding `{{kod.value}}`. Triggering save gives: no `api` call, "Bu alan zorunludur." under `kod`, tab 0 `aria-selected="true"`, and `document.activeElement` is the `kod` input.
    - `hidden input is not validated`: a required input with a false `visibleWhen` does not block the write.
    - `upperCase input upper-cases typing`.
  - **`writeAction.test.ts`:** `validate blocks before confirm and write`. Neither `confirmDialog` nor `write` is called, and the result is `{ok:false, error:"Formda düzeltilmesi gereken alanlar var."}`.
  - **`pageActions.test.ts`:** `hidden more button is omitted, disabled one carries reason`.
  - **`layoutRefs.test.ts`:** `parseTabs drops malformed items`, `tabOwnedIds collects ids`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page src/TenantCustomPage`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` (the whole erp-web suite) and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): koşullu görünürlük, giriş doğrulama ve sekmeler`.

### Task 6: ERP Web — lookup input and server-paged table

**Files:**
- Create: `frontend/erp-web/src/custom-page/LookupInput.tsx`, `frontend/erp-web/src/custom-page/LookupInput.test.tsx`
- Create: `frontend/erp-web/src/custom-page/PagedTableFooter.tsx`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`
  - `PageInput` delegates `inputType === "lookup"` to `LookupInput`;
  - `effective()` adds `search` and `seciliSatir` for lookups and `sayfa`/`sayfaBoyutu` for paged tables;
  - `PageBody` holds `lookupState` and `tablePages`;
  - `QueryTable` gains `paging`.
- Modify: `frontend/erp-web/src/custom-page/layoutRefs.ts`: `tableSearchInputIds` (these ids are not drawn at top level).
- Modify: `frontend/erp-web/src/tenant-custom-page.css`
- Test: `frontend/erp-web/src/custom-page/CustomPageTable.test.tsx` (extend), `LookupInput.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`QueryState.meta`, `rowCount` = `totalCount`), Task 5 (`PageRuntime`, condition and validation wiring; lookups support `required` only).
- Produces:

```ts
export function LookupInput(props: { inputId: string; label: string; raw: string; onChange: (value: string, row: Record<string, unknown> | null) => void;
  onSearch: (text: string) => void; options: { value: string; label: string; description: string; row: Record<string, unknown> | null }[];
  loading: boolean; error?: string; allowClear: boolean; disabled: boolean; placeholder: string }): JSX.Element;
export function lookupOptions(props: Record<string, unknown>, state: QueryState | undefined, search: string, serverSearch: boolean)
  : { value: string; label: string; description: string; row: Record<string, unknown> | null }[];
export function PagedTableFooter(props: { page: number; pageSize: number; total: number; meta: { label: string; value: string }[];
  onPage: (page: number) => void }): JSX.Element;
```

**Lookup.**
- **Scope.** The lookup exposes:
  - `{{<ad>.value}}`: the chosen value;
  - `{{<ad>.search}}`: the typed text when its length is ≥ `minChars` (default 1), else `null`;
  - `{{<ad>.seciliSatir}}`: the chosen option row, or `null` for a static or unknown option.
- **Server or client search.** It is a server search when any parameter of `optionsQuery` binds `{{<ad>.search}}`; then the options are the query rows. Otherwise it filters client-side: a row matches when its label or description, lower-cased with `toLocaleLowerCase("tr-TR")`, contains the search text. Use client search for `depo.listele`, which has no search parameter.
- **Static options.** `staticOptions` come first and are always filtered client-side. An entry such as `"=Tüm depolar"` has the empty value.
- **List size.** At most 50 options are shown.
- **Displayed label.**
  - It is the label stored at selection time.
  - A value set from outside (default value, `setInput`) uses the matching static or row label.
  - When no label matches, the raw value is shown and is never cleared.
- **Keyboard.** The input has `role="combobox"`, `aria-expanded` and `aria-controls`, and the list is a `role="listbox"` of `role="option"` items. Keys:
  - ArrowDown/ArrowUp move the highlight;
  - Enter selects;
  - Escape closes the list and restores the label;
  - blur closes the list.
- **Copy.** "Aranıyor…" while loading, "Sonuç bulunamadı." when empty, and the clear button has `aria-label="Temizle"`. Clearing sets the value to `""` and `seciliSatir` to `null`.

**Paged table.**
- **Scope.** `scope[<tablo>] = { seciliSatir, sayfa, sayfaBoyutu }`, with `sayfa` starting at 1 and `sayfaBoyutu` = `pageSize` or 25.
- **Page reset.** The page resets to 1 when `searchInput`'s value changes, and when the resolved values of the table's query change in anything other than the two page parameters. The existing sequence check drops stale responses.
- **Search box.** The `searchInput` is rendered in the table header.
- **Footer.**
  - The count reads `"{from}–{to} / {total}"`, numbers formatted `tr-TR`; with no rows it reads `"0 / 0"`.
  - The pager buttons are "Önceki" and "Sonraki", disabled at the bounds, with the text `"Sayfa {p} / {pages}"`.
  - Each `footerMeta` item is shown as `"Etiket: değer"` from `state.meta`.
- **Truncation.** The "İlk 5.000 satır…" notice is never shown for a paged table.
- **Totals.** The column totals label becomes `"Sayfa toplamı · {n} kayıt"`.
- **Export.** In `PageActionCommands.exportTable` (`TenantCustomPage.tsx`, not `pageActions.ts`), the `state.truncated` warning is **replaced** for a paged table, because a paged result is always "truncated". The table exports the visible page and reports `"Yalnız görünen sayfa aktarıldı ({n} satır)."`

- [ ] **Step 1: Write failing tests:**
  - **`LookupInput.test.tsx`:**
    - `server search binds search text`: typing "ab" with `minChars: 2` makes `scope.depo.search === "ab"`; typing "a" makes it `null`. Use the mocked `api` and fake timers past 300 ms.
    - `client filter for query without search binding`.
    - `static empty option selects empty value` ("Tüm depolar").
    - `keyboard select and escape`.
    - `allowClear clears value and row`.
    - `lookup keeps preset value label`: defaultValue `"D9"` not in the rows shows "D9".
  - **`CustomPageTable.test.tsx`:**
    - `server paged table sends page and pageSize`.
    - `footer shows range and total` (`"26–50 / 340"`, `"Sayfa 2 / 14"`).
    - `search resets page and drops stale page`. Go to page 5, type a search, and resolve the page-5 response last: rows come from the page-1 response and the request URL had `page=1`.
    - `footerMeta renders meta values`.
    - `no truncation notice for paged table`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page/LookupInput src/custom-page/CustomPageTable`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): arama kutusu ve sunucu sayfalı liste`.

### Task 7: Studio — wire fields, variables, conditions, validation props, tabs

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/erpOperations.ts`
  - the type gains `routeVariants`, `bodyMap`, `result.flatten` and `result.metaPaths`;
  - `buildReadRequest` chooses the route like `chooseRoute`;
  - `mapReadResult` flattens and returns `meta`.
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/conditions.ts`: a Studio copy of `parseCondition` (same grammar, used for inline syntax errors).
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/ConditionFields.tsx`: the "Koşullar" inspector body.
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/TabsFields.tsx`: the tab list editor (label, component picker, ordering, default tab).
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/layoutRefs.ts` (`parseTabs`, `tabOwnedIds`), `CanvasPreviews.tsx` (`TabsPreview`)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - **Types.** `ComponentType` gains `"tabs"`.
  - **Palette.** New item `{ type: "tabs", label: "Sekmeler", group: "Tasarım dili", sample: { tabs: ["Genel=", "Ayrıntı="], defaultTab: 0 } }`.
  - **Keys.** `managedKeys` gains every new prop name from Task 2, and `bindableKeys` gains `disabledReason`.
  - **Width.** The canvas default span for `tabs` is 12.
  - **`reconcileLayoutRefs`.** For tabs it drops ids that are deleted, ineligible (Task 2 tab rule) or already owned; it clamps `defaultTab`; and it drops `disabledReason` when there is no `disabledWhen`.
  - **Session.** `sessionUser` adds `rol` from the `role` prop.
  - **Binding suggestions.** Add `kullanici.rol` ("Oturumdaki kullanıcının rolü", group "Oturum"). For operation queries, add `{{<q>.meta.<key>}}` for each `metaPaths` key; flattened column codes appear under `seciliSatir`/`rows` like other columns.
  - **Inspector sections.**
    - "Koşullar" on every component: `visibleWhen`; plus `disabledWhen` and `disabledReason` on button and input. Inline syntax and unknown-root errors use the Wire-contract error texts.
    - In the "Giriş" section, "Doğrulama" fields by input type: Zorunlu, En az, En fazla, Adım, En fazla karakter, Biçim (düzenli ifade), Biçim hatası mesajı, Büyük harfe çevir.
    - A "Sekmeler" section for tabs.
  - **Canvas.**
    - Tab-owned components are not drawn at top level. They render inside `TabsPreview` under the default or clicked tab.
    - A component with `visibleWhen` shows a small "Koşullu" chip on the canvas; it is never hidden in the designer.
  - **Save.** Operation queries keep undeclared `bodyMap` parameters (names `^[A-Z][A-Z0-9_]{0,39}$`) instead of dropping them in `wireParameters`.
- Modify: `page-designer/erpOperations.ts`:
  - `wireParameters` keeps a non-empty-bound parameter not declared by the op when `op.bodyMap` is set and the name matches `^[A-Z][A-Z0-9_]{0,39}$`;
  - `mergedParameters` appends those rows after the catalog rows, typed `text`, so the panel does not drop them.

  Today both functions drop undeclared parameters.
- Modify: `page-designer/QueriesPanel.tsx`: for an op with `bodyMap`, show an "Özel alan ekle" row that adds a `text` parameter (uppercase code) with an empty binding, and the note "Bağlanmayan özel alanlar “<kaynak etiketi>” sorgusundaki değerleriyle korunur."

**Interfaces:** Consumes the Wire contract and Task 2's prop rules. Produces the Studio `parseTabs`/`tabOwnedIds`, with the same signatures as Task 5.

- [ ] **Step 1: Implement** the above. Studio has no unit test runner; correctness is checked by the build and by Task 9.
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success with no TS errors.
- [ ] **Step 3: Commit** with the message `feat(studio): koşullar, doğrulama özellikleri, sekmeler ve işlem üst bilgileri`.

### Task 8: Studio — lookup input and server-paged table

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - **Input type.** `inputTypeOptions` gains `{ value: "lookup", label: "Arama kutusu" }`.
  - **Lookup inspector fields:** Seçenek sorgusu, Etiket sütunu, Değer sütunu, Açıklama sütunu, En az karakter, Temizlenebilir. They also show the help text "Sunucuda aramak için sorgunun arama parametresini {{<ad>.search}} ile bağlayın; bağlamazsanız sonuçlar tarayıcıda süzülür."
  - **Lookup binding suggestions:** `{{<ad>.search}}` and `{{<ad>.seciliSatir.<sütun>}}`.
  - **Lookup canvas preview:** a text box with a search icon and the first three options.
  - **`dropQueryReferences`** clears lookup-only props when the options query is removed.
  - **dataTable "Sayfalama" section.**
    - The "Sunucu sayfalı" toggle is enabled only when the table is named and bound to an operation query whose op has int query params `page`/`pageSize`.
    - When turned on, it sets `paging`, `pageParam`, `pageSizeParam` and `pageSize: 25`, and writes the bindings `{{<tablo>.sayfa}}` / `{{<tablo>.sayfaBoyutu}}` into that query's parameters.
    - When turned off, it removes the paging props and those two bindings.
    - The section also offers the page-size field (5–100), a "Arama girişi" picker (unowned text inputs), and a `footerMeta` editor listing the op's `metaPaths`.
  - **Paged-table binding suggestions:** `{{<tablo>.sayfa}}` and `{{<tablo>.sayfaBoyutu}}`.
  - **Paged-table canvas preview:** `GridPreview` shows the footer as "1–25 / <preview rowCount>" with disabled pager buttons.
  - **`reconcileLayoutRefs`** removes the `searchInput` when its input is deleted or owned elsewhere, and removes `footerMeta` keys the op no longer offers.
- Modify: `page-designer/CanvasPreviews.tsx` (lookup preview; `GridPreview` footer), `page-designer/LayoutFields.tsx` (reuse `InputPicker` for the search input)

**Interfaces:** Consumes Task 7 (Studio catalog type with `metaPaths`) and Task 2's prop rules.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success.
- [ ] **Step 3: Commit** with the message `feat(studio): arama kutusu ve sunucu sayfalı liste`.

### Task 9: Live verification (QA Test Firma 20261117 only; controller)

Run by the controller after merge and deploy, in the QA tenant only. Create the page `qa-faz-a-bilesenler` with these components:
- **Depo lookup `depo`:** `optionsQuery` = `depo.listele` (client filter) and `staticOptions ["=Tüm depolar"]`.
- **Search input `ara`.**
- **Paged table `liste`:** on `stok.bakiye.sayfa`, with `warehouseId` = `{{depo.value}}`, `q` = `{{ara.value}}`, `searchInput: ara`, and `footerMeta ["belowMinimumCount=Minimum altı"]`.
- **Metric:** with the text `{{bakiye.meta.totalCount}}` (`bakiye` is the table's read query, `stok.bakiye.sayfa`).
- **Tabs `Özet` / `Depolar`.** "Depolar" holds a table on `stok.kart.depoBakiyeleri` with `id` = `{{liste.seciliSatir.stockItem.id}}`.
- **Delete button:** `actionType: "query"` on a write query `sil` = `stok.kart.sil` with `id` = `{{liste.seciliSatir.stockItem.id}}`, and `disabledWhen: "kullanici.rol != 'TenantAdmin'"` and the reason "Yalnız yönetici silebilir.".
- **Form:** a required `kod` input with `upperCase` and `maxLength 64` on tab Özet. The actionBar `saveQuery` is `guncelle` = `stok.kart.guncelle`, with `code` = `{{kod.value}}`. Its source read is `kart` = `stok.kart.getir`, with `id` = `{{liste.seciliSatir.stockItem.id}}`.

Verify each of these:
- Changing the depot switches the route (network tab).
- "Tüm depolar" uses the base route.
- Search resets to page 1.
- The footer total matches the old Stok Kartları screen.
- The per-warehouse table matches the old detail panel's Depolar tab.
- A TenantUser sees the delete button disabled with the reason.
- Saving with an empty `kod` while on tab "Depolar" jumps to "Özet" and shows "Bu alan zorunludur." without a request.
- Studio shows the new palette item, the inspector sections and the `meta` variables, and publishes without schema errors.

Delete the QA page afterwards.

---

## Parallelism

- **Wave 1 (parallel):**
  - Task 1: server catalog.
  - Task 3: erp-web operation runtime.
  - Task 4: erp-web pure modules.
  - Task 7: Studio, part one. It needs only the Wire contract and Task 2's rule table, and it touches only Studio files.
- **Wave 2:**
  - Task 2 starts after Task 4 (it links Task 4's vectors file). It can run alongside Task 1, but both edit `TenantCustomPageSchema.cs` in disjoint regions (Task 1: query methods; Task 2: component methods and `Context`), so merge Task 1 first.
  - Task 5 starts after Tasks 3 and 4.
- **Wave 3:**
  - Task 6 starts after Task 5 (both edit `TenantCustomPage.tsx`).
  - Task 8 starts after Task 7 (both edit `CustomPagesPage.tsx`).
- **Last:** Task 9, after all of them are merged and deployed.
