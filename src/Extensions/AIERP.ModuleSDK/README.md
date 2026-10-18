# AIERP WebAssembly Module Contract

Tenant modules run in `AIERP.PluginHost` as WebAssembly Core modules. Managed .NET assemblies and arbitrary ZIP contents are not loaded. The signed ZIP must contain exactly one root file named `module.wasm` (maximum 8 MiB; maximum ZIP size 25 MiB).

## Guest ABI

The module must export:

- `memory`: the guest linear memory.
- `aierp_alloc(i32 byteLength) -> i32`: returns a byte offset for the host's UTF-8 JSON request.
- `aierp_invoke(i32 requestPointer, i32 requestLength) -> i64`: handles the request and returns a packed output range. The high 32 bits are the output pointer and the low 32 bits are the output byte length.

The request is UTF-8 JSON with `tenantId`, `moduleCode`, `moduleVersion`, `action`, and `data`. The response must be one UTF-8 JSON value. Keep any returned range inside exported memory. The action is limited to 80 characters by the API. A future SDK can provide language-specific bindings; for now a module author must implement this narrow ABI in their WASM toolchain.

## Sandbox limits

The host rejects all module imports. WASI, host callbacks, ERP database handles, filesystem access, and network access are unavailable. Runtime limits are 64 MiB linear memory, one instance/memory/table, 1 MiB stack, 20 million fuel units per invocation, 256 KiB serialized input, and 512 KiB output. A module that traps, exceeds fuel, returns an invalid pointer/length, or emits invalid JSON fails the invocation.

## Publisher signing

Create a `ModuleManifest` that passes `ModuleManifestValidator`, package the compiled bytes as `module.wasm`, and compute lowercase SHA-256 over the complete ZIP. Sign the exact UTF-8 bytes returned by `ModulePackageVerifier.CreateSigningPayload(manifest, keyId, artifactSha256)` using RSA-PSS with SHA-256. Submit the manifest, key id, hash, base64 signature, and ZIP to the platform catalog. The publisher's public key must first be trusted by a platform administrator. The API verifies the signature and package contents, then PluginHost validates the WASM ABI before the release can be used.

## Invocation

After a published release is enabled for a tenant, members other than the protected TenantAdmin role need both the menu entry's declared module permission and the generic `erp.tenant-modules.execute` permission. TenantAdmins retain the existing administrator bypass. TenantAdmins manage module permission Allow/Deny rules in ERP **İzin politikaları**. Each permission is represented as `erp.module.{moduleCode}.{permissionCode}`; ABAC conditions can also use `resource.route.moduleCode` and `resource.route.menuEntryCode`. The API filters inaccessible menu entries and repeats the check when invoked. Optional `view` and `dataCapabilities` manifest properties are omitted from canonical JSON when null, preserving signatures from packages that predate these fields.

### Declarative menu UI

A signed menu entry may include a bounded `view` schema. The ERP host renders native, accessible form controls and result tables from this schema; it never accepts markup, scripts, component names, or arbitrary routes as UI instructions. Omitting `view` preserves the legacy JSON editor and JSON result behavior.

```json
{
  "code": "tickets.search",
  "label": "Ticket search",
  "route": "/tickets",
  "permissionCode": "tickets.read",
  "view": {
    "inputMode": "form",
    "inputFields": [
      { "code": "term", "label": "Customer", "type": "text", "required": true, "maxLength": 100 },
      { "code": "limit", "label": "Maximum results", "type": "number" }
    ],
    "resultMode": "table",
    "dataCapabilities": ["customers.search"],
    "resultColumns": [
      { "code": "code", "label": "Ticket", "type": "text" },
      { "code": "status", "label": "Status", "type": "text" }
    ]
  }
}
```

Input can use `json` or `form` mode; form fields support text, number, boolean, date, and select with at most 50 options. Results can use `json` or `table` mode; table responses are a root array or an object with a `rows` or `items` array. At most 32 form fields and 32 result columns are allowed. All labels and cell values are rendered as text. A malformed table response falls back to JSON output.

### Host-mediated ERP data

A module can request only fixed host operations that are both supported by the platform and declared in its signed manifest. Each capability references a separately declared module permission. The API checks that permission and tenant ABAC policy for every request, executes a tenant-scoped query, and passes the bounded result to the sandbox. Modules still have no database, network, or host API access.

Currently supported capability:

The SDK exposes the immutable `ModuleDataCapabilityCatalog.All` registry with each capability's code, purpose, required form field, result contract, and whether a bounded `limit` is supported. The manifest validator uses this catalog to validate module views; the API still dispatches each code to a fixed tenant-scoped implementation.

| Code | Query | Returned fields |
| --- | --- | --- |
| `customers.search` | `term` (2–100 characters), optional `limit` (1–25; default 10) | Active customer/Both accounts matching code or name: `id`, `code`, `name`, `currencyCode` |
| `customers.balance.read` | Exact `customerCode` (1–64 characters), supplied by the required `customer-code` form field | Existing ERP ledger balance, side, customer currency and risk limit; tenant ABAC is checked for the resolved customer record |
| `suppliers.search` | `term` (2–100 characters), optional `limit` (1–25; default 10) | Active supplier/Both accounts matching code or name: `id`, `code`, `name`, `currencyCode` |
| `inventory.availability.search` | `term` (2–100 characters), optional `limit` (1–25; default 10) | Active stock items matching code, name or barcode: `id`, `code`, `name`, `unitCode`, tenant-wide `onHand`, active unfulfilled `reserved`, and `available` |

Declare each operation in top-level `dataCapabilities` and include its referenced permission in `permissions`; for example, `"dataCapabilities": [{"code":"customers.search","permissionCode":"customer.read"},{"code":"customers.balance.read","permissionCode":"customer.balance.read"},{"code":"suppliers.search","permissionCode":"supplier.read"},{"code":"inventory.availability.search","permissionCode":"stock.read"}]`. A menu `view` selects which of those operations its form requests with its `dataCapabilities` property. Search views require a required text field named `term` and may include an optional numeric `limit`; balance views require a required text field named `customer-code`, which the ERP client maps to the bounded `customerCode` query. The API rejects capability requests that are not declared by both the module and the specific menu view. Customer search results are checked one record at a time with `resource.customerId`, `resource.customerType`, and `resource.customerActive`; supplier search uses `resource.supplierId`, `resource.supplierType`, and `resource.supplierActive`; inventory search uses `resource.stockItemId`, `resource.stockCode`, and `resource.stockActive`. Denied records are omitted from search results. Customer balances use the same domain calculator as the ERP balance endpoint and receive the customer-level ABAC check after resolving the tenant-owned account.

```json
{
  "action": "tickets.search",
  "input": { "status": "Open" },
  "capabilities": [
    { "code": "customers.search", "query": { "term": "Acme", "limit": 10 } }
  ]
}
```

When capabilities are requested, the WASM guest receives `data.input` unchanged and `data.capabilities` as a result list keyed by capability code. Without a capability request, the existing `data` payload is unchanged. At most four distinct capabilities and 4 KiB per query are accepted; unknown operations, extra query fields, denied permissions, and cross-tenant rows do not return data. Capability denial is audited without logging the query or results.

```http
POST /api/tenant/modules/{moduleCode}/invoke
Authorization: Bearer <tenant access token>
Content-Type: application/json

{"action":"tickets.list","input":{"value":1}}
```

The `action` must equal a menu entry `code` from the signed manifest. The API checks tenant activation, publisher signature, and both ABAC gates, then sends a one-minute internal token bound to that tenant, module version, artifact hash, and invocation operation. The separate `AIERP.PluginHost` has its own signing key. Modules receive tenant metadata and may receive host-injected data only for fixed, manifest-declared capabilities that pass their own permission/ABAC check. Modules cannot query databases, use the network, or call host APIs directly. The manifest's route remains descriptive metadata; the ERP screen is rendered from the safe `view` contract above.
