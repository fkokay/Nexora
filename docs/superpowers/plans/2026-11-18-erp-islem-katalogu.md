# ERP İşlem Kataloğu (Proje 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom pages can bind queries to named ERP operations (existing API endpoints) instead of SQL, so pages read and write through ERP business rules.

**Architecture:**
- **Server.** A static catalog (`ErpOperationCatalog`) in `AIERP.Api` describes each operation: name, HTTP method, route template, parameters, result shape and an optional source read. It is exposed at `GET /api/custom-pages/erp-operations`, with a per-user `allowed` flag.
- **Page schema v2.** Page queries may carry `operation` instead of `sql`.
- **ERP Web runtime.** The runtime loads the catalog from the server and calls the real endpoint with the user's token. It maps results into the existing query state, merges write bodies from the source read (read → modify → write), and shows field errors under inputs.
- **Studio.** The Queries panel gains an "ERP işlemi" mode.

**Tech Stack:** .NET 10 minimal API, xUnit (`tests/IntegrationTests`, WebApplicationFactory + InMemory), React + TS, Vitest (erp-web), Studio (`npm run build` = tsc + vite, no test runner).

**Spec:** `docs/superpowers/specs/2026-11-18-uyarlanabilir-erp-design.md` (section "Proje 1").

## Global Constraints

- Operation names are `modul.nesne.eylem` (ASCII letters, `.`), stable forever: never removed or renamed, only added. Sözleşme değişirse yeni ad eklenir.
- No new privilege: the runtime calls existing endpoints with the user's own token. The page never supplies a URL; route and method come only from the server catalog.
- Route parameters: `guid` must match `^[0-9a-fA-F-]{36}$` and `int` must be an integer. Otherwise the call is refused client-side with the message "Geçersiz parametre: <ad>". All route values are `encodeURIComponent`-ed.
- Write operations never run from Studio preview.
- Parameter types are exactly the existing set: `text`, `int`, `decimal`, `date`, `bool`, `guid`.
- UI copy is Turkish.
- An operation query has no `sql` key, and a SQL query has no `operation` key.
- Do not edit `docs/*.json` or `artifacts/`.

## Review Focus

1. A page operation names an unknown or deprecated operation. Expected behavior:
   - On a new publish, the schema rejects it with "ERP işlemi bulunamadı: X".
   - At runtime, the query state shows the same text and no request is sent.
   - Tests: Task 2 (schema) and Task 3 (runtime).
2. A route param bound to a non-GUID value (e.g. user-typed text). The request must not be sent, the error is shown and no path traversal is possible. Test: Task 3 (`buildOperationRequest` rejects `../x`).
3. Update with fields the page did not bind: hidden fields keep the source record's values, and `rowVersion` is taken from the source read. Test: Task 3 (merge).
4. A server 400 with `errors: { "Code": ["..."] }`: the message appears under the input bound to the parameter named `code` (case-insensitive). Test: Task 3 (`fieldErrorsByInput`).
5. The user lacks rights to an operation: the catalog returns `allowed: false`, Studio greys it out, and a runtime 403 shows "Bu işlem için yetkiniz yok." Test: Task 1 (allowed flag for a TenantUser with a Deny rule).

---

## Wire contract (shared by every task)

`GET /api/custom-pages/erp-operations` → `200`:

```json
{ "operations": [ {
  "name": "stok.kart.guncelle", "label": "Stok kartı güncelle", "module": "Stok",
  "kind": "write", "pageKind": "update", "method": "PUT", "route": "/api/stock/items/{id}",
  "parameters": [ { "name": "id", "in": "route", "type": "guid", "required": true },
                  { "name": "name", "in": "body", "type": "text", "required": false } ],
  "result": { "shape": "record", "rowsPath": null, "columns": [ { "code": "id", "label": "Kimlik", "dataType": "guid" } ] },
  "sourceOperation": "stok.kart.getir", "fixedBody": null, "since": "2026-11-18", "deprecated": false, "allowed": true } ] }
```

Field notes:
- `kind` is `read` or `write`.
- `pageKind` is `read` for read operations, and `insert`, `update` or `delete` for write operations.
- `in` is `route`, `query` or `body`.
- `result.shape` is `list`, `record` or `none`.
  - `rowsPath` is the JSON property holding the array for `list`; `null` means the response body is the array.
  - `record` is mapped to a single row.

Page query JSON (schema v2):

```json
{ "id": "q1", "name": "kart", "kind": "update", "operation": "stok.kart.guncelle",
  "parameters": [ { "name": "name", "binding": "{{ad.value}}", "type": "text" } ], "runOn": "manual" }
```

Runtime request building (Task 3):
- **Body.** Start from `{...sourceRecord, ...fixedBody}`, then set every bound `in: "body"` parameter.
- **Route params.** Use the bound value, else the source record's property of the same name (case-insensitive).
- **Query params.** Bound values only; `null` or empty values are skipped.
- **Source record.** Row 0 of the page's read query whose `operation === sourceOperation`.
- **Write results.** The write's JSON body is stored in the query state as `sonuc` and is bindable as `{{kart.sonuc.id}}`.

---

### Task 1: Server catalog, single-item read endpoint, catalog endpoint

**Files:**
- Create: `src/Hosts/AIERP.Api/ErpOperationCatalog.cs`
- Modify: `src/Hosts/AIERP.Api/Program.cs`
  - add `stockItems.MapGet("/{id:guid}", …)` returning `StockItemView`, next to the existing list handler near line 1910;
  - map the catalog endpoint.
- Create: `tests/IntegrationTests/ErpOperationCatalogTests.cs`
- Create: `tests/IntegrationTests/ErpOperationCatalog.names.txt` (one name per line, sorted)

**Interfaces:**
- Produces, in `namespace AIERP.Api`:

```csharp
internal sealed record ErpOperationParameter(string Name, string In, string Type, bool Required);
internal sealed record ErpOperationColumn(string Code, string Label, string DataType);
internal sealed record ErpOperationResult(string Shape, string? RowsPath, IReadOnlyList<ErpOperationColumn> Columns);
internal sealed record ErpOperation(string Name, string Label, string Module, string Kind, string PageKind, string Method, string Route,
    IReadOnlyList<ErpOperationParameter> Parameters, ErpOperationResult Result, string? SourceOperation,
    IReadOnlyDictionary<string, object?>? FixedBody, string Since, bool Deprecated = false);
internal static class ErpOperationCatalog {
    internal static IReadOnlyList<ErpOperation> All { get; }
    internal static bool TryGet(string name, out ErpOperation operation);
}
```

- Endpoint: `GET /api/custom-pages/erp-operations` (it falls under the existing `/api/custom-pages` permission mapping). The response is the wire contract above. `allowed` is computed per operation using `PlatformPermissionCatalog.TryResolve` with a synthetic path built from the route (substitute `00000000-0000-0000-0000-000000000000` for guid params) plus the `IPlatformPermissionAuthorizer` used by other endpoints.

**Initial operations.** Fill columns and body parameters from the C# contracts (`PlatformContracts.cs`: `StockItemView`, `StockItemWriteRequest`, `StockItemUpdateRequest`, `StockItemStateChangeRequest`) using camelCase JSON names. Body parameters cover every scalar field of the request record; required = non-nullable without a default in the write request.

| name | method route | pageKind | result | source / fixedBody |
|---|---|---|---|---|
| `stok.kart.listele` | GET `/api/stock/items` (query `q` text, `page` int, `pageSize` int) | read | list `items` | |
| `stok.kart.getir` | GET `/api/stock/items/{id}` | read | record | |
| `stok.kart.olustur` | POST `/api/stock/items` | insert | record | |
| `stok.kart.guncelle` | PUT `/api/stock/items/{id}` | update | none | `stok.kart.getir` |
| `stok.kart.sil` | DELETE `/api/stock/items/{id}` | delete | none | |
| `stok.kart.pasifeAl` | POST `/api/stock/items/{id}/deactivate` | update | none | `stok.kart.getir`, `{ "confirmation": true }` |
| `stok.kart.aktifEt` | POST `/api/stock/items/{id}/activate` | update | none | `stok.kart.getir` (+ `confirmation:true` if its request has it) |
| `stok.kart.hareketleri` | GET `/api/stock/items/{stockItemId}/transactions` (query `page`, `pageSize`) | read | list (property of `InventoryTransactionPage`) | |
| `stok.kart.varyantlari` | GET `/api/stock/items/{id}/variants` | read | list (`null` path if array) | |
| `stok.kart.ozelAlanDegerleri` | GET `/api/stock/items/{id}/custom-fields` | read | list | |
| `stok.ozelAlanTanimlari` | GET `/api/stock/items/custom-fields` | read | list | |
| `stok.kategoriler` | GET `/api/stock/categories` | read | list | |
| `rapor.<code>` for every `ReportEndpoints.ReportSourcePermissions` key | POST `/api/reports/run` | read | list `rows`, columns from the report source | fixedBody `{ "source": "<code>", "pageSize": 100 }` |

Labels are Turkish:
- Report operations use `"Rapor: " + source label` with module `Raporlar`.
- Stock operations use module `Stok`.

- [ ] **Step 1: Write failing tests** in `ErpOperationCatalogTests`, using the same factory as other integration tests:
  - `Every_operation_matches_a_registered_endpoint`: for each op, some `RouteEndpoint` in `EndpointDataSource` has an `HttpMethodMetadata` containing `op.Method`, and its `RoutePattern.RawText`, with constraints stripped (`{id:guid}` → `{id}`) and the trailing `/` trimmed, equals `op.Route`.
  - `Names_are_append_only`: every line of `ErpOperationCatalog.names.txt` is still in `All`, and every `All` name is in the file. The file is copied to the output directory via the csproj.
  - `Report_operations_match_report_sources`: the set of `rapor.*` operations equals `ReportSourcePermissions.Keys`.
  - `Names_are_unique_and_well_formed`: names are unique and match `^[a-z]+(\.[a-zA-Z]+)+$`; `SourceOperation` refers to an existing read op; `PageKind` is consistent with `Kind`.
  - `Catalog_endpoint_returns_operations_with_allowed_flags`: a TenantAdmin gets `allowed: true` for `stok.kart.sil`. A TenantUser with a tenant Deny rule on `erp.stock-items` delete gets `allowed: false`; follow how existing policy-rule tests seed Deny rules.
  - `Get_stock_item_by_id_returns_view_and_404_for_other_tenant`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~ErpOperationCatalogTests"`. Expected: FAIL (types missing).
- [ ] **Step 3: Implement** the catalog, the endpoint, the `GET /{id:guid}` handler (tenant-scoped, same projection as the list) and the names file.
- [ ] **Step 4: Run the tests again.** Expected: PASS. Then run `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~Permission"` so the permission catalog tests stay green; add a catalog entry there if a test demands one for the new route.
- [ ] **Step 5: Commit** with the message `feat(api): ERP işlem kataloğu ve stok kartı tekil okuma`.

### Task 2: Page schema accepts operation queries

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` (`ValidateQueries`, ~lines 120–183)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageQueries.cs`
  - `PageQuery` gains `string? Operation`;
  - `ReadQueries` reads it;
  - `WithoutQuerySql` keeps `operation`.
- Modify: `src/Hosts/AIERP.Api/CustomPageQueryEndpoints.cs`: the run handler returns `400 { error = "ERP işlemi sayfa üzerinden doğrudan çalıştırılır." }` when `query.Operation is not null`.
- Test: `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs` (add tests)

**Interfaces:**
- Consumes: `ErpOperationCatalog.TryGet`.
- Rules:
  - Allowed keys are `QueryKeys` minus `sql` plus `operation` when `operation` is present; exactly one of `sql` / `operation` must be present.
  - `kind` must equal `op.PageKind`.
  - Every page parameter must exist in `op.Parameters` with the same `Type`.
  - Every `Required` route or body parameter must be bound, except route params of an op with `SourceOperation` (those come from the source).
  - If `op.SourceOperation` is set, some page query must have `operation == op.SourceOperation`.
  - `op.Deprecated` → reject with "ERP işlemi artık kullanılamıyor: X".
  - Unknown op → "ERP işlemi bulunamadı: X".
  - Read/write rules for buttons and actionBar keep working through `QueryKinds`.

- [ ] **Step 1: Write failing tests:**
  - `Accepts_operation_query_and_binds_to_table`: a `stok.kart.listele` read query, a dataTable with `query` = its id, and `runOn: "load"`.
  - `Rejects_unknown_operation`: error contains "ERP işlemi bulunamadı: yok.islem".
  - `Rejects_sql_and_operation_together`.
  - `Rejects_kind_mismatch` (`stok.kart.sil` with kind `update`).
  - `Rejects_parameter_type_mismatch` (`id` as `text`).
  - `Rejects_update_without_source_read_on_page` (`stok.kart.guncelle` alone).
  - `Accepts_update_with_source_read_and_actionBar_save`.
  - `Run_endpoint_rejects_operation_query`: integration test; publish a page, POST to `/queries/{id}/run`, expect 400.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchemaV2Tests|FullyQualifiedName~CustomPageQuery"`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the rules above. Keep the existing SQL path untouched.
- [ ] **Step 4: Run the tests again.** Expected: all PASS. Then run the full IntegrationTests custom-page set: `--filter "FullyQualifiedName~CustomPage"`.
- [ ] **Step 5: Commit** with the message `feat(api): sayfa sorgusu ERP işlemine bağlanabilir`.

### Task 3: ERP Web pure operation module

**Files:**
- Create: `frontend/erp-web/src/custom-page/erpOperations.ts`
- Create: `frontend/erp-web/src/custom-page/erpOperations.test.ts`
- Modify: `frontend/erp-web/src/erpApi.ts`: in `api()`, set `failure.fieldErrors = payload?.errors` when it is an object.

**Interfaces (Produces):**

```ts
export type ErpOperationParameter = { name: string; in: "route" | "query" | "body"; type: string; required: boolean };
export type ErpOperation = { name: string; label: string; module: string; kind: "read" | "write"; pageKind: "read" | "insert" | "update" | "delete";
  method: string; route: string; parameters: ErpOperationParameter[];
  result: { shape: "list" | "record" | "none"; rowsPath: string | null; columns: { code: string; label: string; dataType: string }[] };
  sourceOperation: string | null; fixedBody: Record<string, unknown> | null; since: string; deprecated: boolean; allowed: boolean };
export type OperationRequest = { url: string; method: string; body?: string };
export function buildOperationRequest(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null): OperationRequest; // throws Error("Geçersiz parametre: <ad>")
export function mapOperationResult(op: ErpOperation, json: unknown): { rows: Record<string, unknown>[]; rowCount: number; columns: { code: string; label: string; dataType?: string }[] };
export function fieldErrorsByParameter(op: ErpOperation, fieldErrors: Record<string, string[]> | undefined): Record<string, string>; // parameter name -> joined message, case-insensitive key match
```

`rowCount` is the response's `totalCount` when it is a number, else `rows.length`.

- [ ] **Step 1: Write failing tests** in `erpOperations.test.ts`:
  - **Builds the GET list URL.** Input: `values {q:"ko li", page:2, pageSize:null}`. Expected URL: `/api/stock/items?q=ko+li&page=2`; no body.
  - **Fills route from source when unbound.** `stok.kart.guncelle` with source `{Id:"<guid>", name:"A", rowVersion:"AAA="}` and values `{name:"B"}` gives URL `/api/stock/items/<guid>`. The body JSON equals `{Id:"<guid>", name:"B", rowVersion:"AAA="}`.
  - **Merges fixedBody.** A deactivate op gives a body with `confirmation: true` and the source `rowVersion`.
  - **Rejects bad guid route param.** `id: "../x"` throws "Geçersiz parametre: id".
  - **Rejects a missing required route param** with no source: throws "Geçersiz parametre: id".
  - **Maps list rows.** `rowsPath "items"`, json `{items:[{a:1}], totalCount:7}` gives `rows [{a:1}]`, `rowCount 7`, and columns from the op.
  - **Maps a root array** (`rowsPath null`).
  - **Maps a record** to one row.
  - **Maps shape none** to empty rows.
  - **Maps field errors case-insensitively.** `{Code:["Zorunlu."]}` gives `{code:"Zorunlu."}`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page/erpOperations` in `frontend/erp-web`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Use `URLSearchParams` for the query string, `encodeURIComponent` for route values, and `JSON.stringify` for the body. Send no body for GET and DELETE.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(erp-web): ERP işlemi istek/yanıt eşleme modülü`.

### Task 4: ERP Web runtime integration

**Files:**
- Modify: `frontend/erp-web/src/custom-page/usePageQueries.ts`
- Create: `frontend/erp-web/src/custom-page/useErpOperations.ts`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`: field errors under inputs; pass the catalog in.
- Test: `frontend/erp-web/src/custom-page/usePageQueries.erp.test.tsx`

**Interfaces:**
- Consumes: Task 3 exports.
- Produces:
  - `useErpOperations(token: string, enabled: boolean): { operations: Map<string, ErpOperation> | null; error: string }`. It fetches `/api/custom-pages/erp-operations` once per token, and only when `enabled`.
  - `PageQueryDefinition` gains `operation?: string`; `readPageQueries` reads it.
  - `QueryState` gains `sonuc?: unknown` and `fieldErrors?: Record<string, string>` (keyed by parameter name).
  - `usePageQueries` options gain `operations: Map<string, ErpOperation> | null`.
- Behavior:
  - **Waiting for the catalog.** An operation query whose catalog is not loaded yet is `waiting` (it stays `loading`).
  - **Unknown operation.** State error is "ERP işlemi bulunamadı: X" and no request is sent.
  - **Reads.** `execute` calls `buildOperationRequest(op, values, sourceRow(op))` and `api(url, token, {method, headers, body})`, then fills the state via `mapOperationResult`.
  - **Writes.** `runWrite` does the same and returns `{ affectedRows: 1 }`. It sets `states[name] = { …emptyState(false), ran: true, sonuc: json }`.
  - **Write failures.** It sets `fieldErrors` from `fieldErrorsByParameter(op, failure.fieldErrors)` and rethrows.
  - **Source row.** `sourceRow(op)` is `states[q.name].rows[0]` of the page query whose `operation === op.sourceOperation`.
  - **Preview.** Preview uses the same direct call, but writes are refused when `previewId` is set: they throw "Önizlemede ERP yazma işlemi çalıştırılmaz."
- `TenantCustomPage.tsx` shows the field error under an input: map query `fieldErrors` keys through the query parameters' bindings (`{{<inputName>.value}}`) to input names. Render it as `<small className="tenant-page-input-error">`, reusing existing input error styling if any.

- [ ] **Step 1: Write failing tests** with `renderHook` and a mocked `../erpApi`:
  - `runs operation read query and fills rows`.
  - `waits until catalog loads`.
  - `unknown operation sets error without request`.
  - `write merges source row and stores sonuc`.
  - `write 400 sets fieldErrors and rethrows`.
  - `preview write is refused`.
- [ ] **Step 2: Run** `npx vitest run src/custom-page/usePageQueries.erp`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the SQL path byte-for-byte equivalent.
- [ ] **Step 4: Run** `npx vitest run src/custom-page src/TenantCustomPage` and then `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): özel sayfa ERP işlemlerini çalıştırır`.

### Task 5: Studio — ERP işlemi mode in the Queries panel

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/QueriesPanel.tsx`
  - `PageQuery` gains `operation?: string`;
  - the editor gets a "SQL sorgusu / ERP işlemi" switch.
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/erpOperations.ts`: Studio copy of the `ErpOperation` type plus `loadErpOperations(request)`.
- Modify: `CustomPagesPage.tsx`:
  - load the catalog with the existing `request` helper (`/api/custom-pages/erp-operations`);
  - pass it to `QueriesPanel` and `VariablesPanel`;
  - canvas preview for read operations calls the operation route directly (GET/POST reads only) and never runs writes;
  - on save, strip `sql` from operation queries and drop unbound optional parameters.
- Modify: `page-designer/VariablesPanel.tsx`:
  - list `{{<query>.rows}}` columns from `op.result.columns` for operation queries;
  - list `{{<query>.sonuc.<col>}}` for writes whose shape is `record`.

**ERP işlemi mode UI:**
- **Operation picker.** A searchable select grouped by `module`, showing the `label` with the `name` in muted text. Deprecated operations are hidden. Operations with `allowed: false` are disabled, with the title "Bu işlem için yetkiniz yok".
- **On selecting an operation:**
  - set `kind = op.pageKind` and `runOn` (read → `load`, write → `manual`);
  - generate parameter rows from `op.parameters`, with an empty binding and the type fixed from the catalog;
  - mark required parameters with `*`;
  - for an op with `sourceOperation`, show the note "Bağlanmayan alanlar “<source label>” sorgusundaki kayıttan korunur." If no such source query exists on the page, show a warning with an "Ekle" button that adds the source read query with its `id` param pre-bound to `{{<firstNamedTable>.seciliSatir.id}}`, or left empty if there is no table.
- Required-but-unbound parameters block save with "Zorunlu parametre bağlanmadı: <ad>".

- [ ] **Step 1: Implement** the above (Studio has no unit test runner; correctness is checked by `npm run build` plus a live check in Task 6).
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success with no TS errors.
- [ ] **Step 3: Commit** with the message `feat(studio): sorgular panelinde ERP işlemi seçeneği`.

### Task 6: Live verification (QA Test Firma 20261117 only)

Run by the controller after merge and deploy, in the QA tenant only. Create the page `qa-erp-islemleri` with:
- an actionBar;
- a dataTable `liste` bound to `stok.kart.listele`, with search input `ara` bound to `q`;
- a read query `kart` = `stok.kart.getir` with `id` bound to `{{liste.seciliSatir.id}}`;
- a formCard with input `ad` (defaultValue `{{kart.rows[0].name}}`);
- a write `guncelle` = `stok.kart.guncelle` with `name` bound to `{{ad.value}}`, set as the actionBar's `saveQuery`.

Verify each of these:
- The list loads and search filters it.
- Selecting a row and saving changes the name, and the other fields are unchanged (re-read the record).
- Saving an empty name shows the server error under `ad`.
- `stok.kart.sil` on a card that has movements shows the server's 409 message.
- Studio lists ERP operations and blocks a required unbound parameter.

Restore the test card's original name afterwards.
