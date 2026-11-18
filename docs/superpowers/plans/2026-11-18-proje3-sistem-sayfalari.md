# Proje 3 — Sistem Sayfaları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a built-in ERP screen be drawn from a versioned Nexora standard page definition, and let a TenantAdmin edit the firm's own copy in the same Studio designer. The project covers:
- draft, publish, history and restore of the firm's copy;
- "Standarda dön";
- "Yeni" suggestions when the standard gains items;
- a one-time import of today's "Görünümü düzenle" visibility settings.

The project proves the pipeline with **one tiny demo standard**: the Depo Yönetimi list (`inventory-warehouses`, bound to `depo.listele`). The real Stok Kartları definition is Proje 4.

**Architecture:**
- **Server.**
  - Standards are embedded JSON envelopes. `SystemPageStandards` loads and validates them once.
  - Firm copies are ordinary `TenantCustomPages` rows with the code `@<screenKey>`, plus two new nullable columns: `ScreenKey` and `StandardVersion`. Because they are ordinary rows, the existing draft, publish, history, restore, preview, query-run and access code is reused.
  - A new `SystemPageEndpoints.cs` adds only what is specific to system pages: catalog, runtime map, published read, open draft, reset, new items and history by screen key.
- **ERP Web.**
  - `WorkspacePageRouter` consults a runtime map before dispatching a built-in page key.
  - A mapped key renders `TenantCustomPage` in system mode inside the normal ERP frame. Any other key renders the legacy React screen.
  - "Eski ekranda aç" switches that key back to the legacy screen for the session. This is router-local state; the page key is unchanged.
- **Studio.**
  - Built-in cards backed by a standard get "Tasarımcıda aç".
  - `CustomPagesPage` gains a system mode: locked code, reset, remove, history by screen key, and the "Yeni" strip.

**Tech Stack:** .NET 10 minimal API, EF Core (SQL Server, InMemory in tests), xUnit (`tests/IntegrationTests` with WebApplicationFactory + InMemory, and `tests/UnitTests/AIERP.Platform.UnitTests`), React + TS, Vitest (erp-web), Studio (`npm run build` = tsc + vite, no test runner).

**Spec:**
- `docs/superpowers/specs/2026-11-18-sistem-sayfalari-design.md` (this project's addendum; every decision here comes from it).
- `docs/superpowers/specs/2026-11-18-uyarlanabilir-erp-design.md` (Yol haritası 3; decisions 3, 4 and 5).
- `docs/release-migrations.md` and CLAUDE.md for the expand → migrate → contract rule.

**Out of Proje 3:**
- the Stok Kartları standard and its equivalence check (Proje 4);
- page templates (Liste, Kayıt kartı…);
- customization-package export of system pages;
- importing column order, labels or widths;
- contracting `TenantScreenViews`;
- page write rights for a standard without a firm design. Such a standard gives View only, even to a TenantAdmin. This is harmless for the read-only demo, but Proje 4 must check whether the runtime gates operation-backed saves on page rights before the Stok Kartları standard is enabled.

## Global Constraints

- **Expand only.** The migrations only add nullable columns, a CHECK constraint that existing rows satisfy (all `ScreenKey` values are NULL) and a filtered index. Nothing is renamed or dropped. The previous release keeps working against the new schema.
- **Both contexts.** `TenantCustomPage` and `TenantCustomPageRevision` are mapped in both `PlatformDbContext` and `TenantDbContext`, so each change needs a Platform **and** a Tenant migration.
- **Firm design is frozen.**
  - No server path rewrites a published firm design.
  - A standard update reaches a firm only through "Yeni" suggestions or an explicit "Standarda dön".
- **One design per firm per screen.** The code `@<screenKey>` is the only link to a screen, and the existing per-code draft and published indexes enforce it. Endpoints re-check the same rule inside a serializable transaction, because InMemory enforces neither filtered indexes nor CHECK constraints.
- **Standards are data, not logic.** A standard has no SQL query, no code component (no `css`/`javascript`) and only ERP operation queries.
- **Standards are never removed.** Ids are never reused and `version` never decreases.
- **No new privilege.**
  - Writes to firm designs need the `erp.tenant-customizations` action **and** a verified TenantAdmin (`CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync`).
  - Tenant scope comes only from the verified `tenant_id` claim.
  - SQL, write-operation and code rules are the custom-page rules, unchanged.
- **Code namespace.** `TenantCustomPageEndpoints.ValidCode` stays unchanged, so `/api/custom-pages/drafts` can never create a `@` code. A new `SystemPageCodes.IsSystemCode(code)` accepts `^@[a-z0-9-]{1,39}$`.
- **Turkish UI copy.** User-visible copy is Turkish and exactly as pinned in this plan.
- **Protected files.** Do not edit `docs/*.json` or `artifacts/`.

## Review Focus

1. **The legacy screen is never lost by accident.**
   - A failed runtime map renders legacy, and so does a 404 from `/published` when the map is stale.
   - With the switch off, removing the firm design returns the legacy screen.
   - "Eski ekranda aç" always works.

   Tests: Task 5 (`map failure renders legacy`, `stale map 404 falls back to legacy`).
2. **System rows do not leak into custom-page surfaces.** They are absent from menu targets and from the Studio "Özel" list. `/{code}/published` returns 404 for them, and `/drafts` rejects `@` codes. Tests: Task 2.
3. **A TenantUser keeps seeing a system page that has ERP operations.** Without an access row, rights for a system row consider only SQL queries. Test: Task 2 (`System_row_without_access_row_is_visible_to_members_when_it_has_only_operations`).
4. **"Yeni" never re-offers what the firm deleted.** An item is offered only when `since > StandardVersion` and its id is absent from the design. Test: Task 4 vectors.
5. **The import runs once.** The screen-view import runs only when no row with that code has ever existed, archived rows included. A later "Tasarımcıda aç" or "Standarda dön" never re-imports. Test: Task 4 (`Draft_after_archive_does_not_reimport_screen_view`).
6. **Concurrency.** Two admins open "Tasarımcıda aç" at the same moment and get exactly one draft. Test: Task 4 (serializable path) and the SQL acceptance test in Task 2.

---

## Wire contract (shared by every task)

**Standard envelope**, at `src/Hosts/AIERP.Api/SystemPages/Standards/<screenKey>.json`, embedded as a resource:

```json
{
  "screenKey": "inventory-warehouses", "title": "Depo Yönetimi", "description": "Depo tanımlarının listesi.",
  "module": "Stok & Depo", "version": 1, "stage": "preview",
  "items": {
    "component:depoListesi": { "since": 1, "label": "Depo listesi", "requires": ["query:depolar"] },
    "query:depolar": { "since": 1, "label": "Depoları listele" }
  },
  "screenViews": [ { "key": "inventory-warehouses", "component": "depoListesi",
                     "fields": { "code": "code", "name": "name", "status": "isActive" } } ],
  "definition": {
    "schemaVersion": 2,
    "components": [ { "id": "depoListesi", "type": "dataTable", "name": "depoListesi",
      "props": { "title": "Depolar", "query": "depolar", "columns": ["code", "name", "isActive"],
                 "columnFormats": ["code=code", "isActive=status"] } } ],
    "queries": [ { "id": "depolar", "name": "depolar", "kind": "read", "operation": "depo.listele", "parameters": [], "runOn": "load" } ]
  }
}
```

Component and query names share one case-insensitive name set in the schema (`ValidName`), so the table and its query must have different names (`depoListesi` and `depolar`).

**Envelope rules.** The loader enforces these, and Task 1 tests them.
- **`screenKey`.**
  - It matches `^[a-z0-9-]{1,39}$`.
  - It is a page key of `StandardMenuEndpoints` (expose `StandardMenuEndpoints.PageKeys` as `internal`).
  - It equals the file name.
- **Header fields.** `version` is ≥ 1. `stage` is `preview` or `ready`. `title` is 1–120 characters and `module` is 1–60.
- **`items`.**
  - Keys are `component:<id>` or `query:<id>`.
  - The set of keys equals the set of top-level component ids plus query ids. Children of `section`/`card` move with their parent and are not listed.
  - Each item has `1 ≤ since ≤ version`, a 1–80 character `label` and an optional `requires` list of item keys.
- **`definition`.**
  - It passes `TenantCustomPageSchema.Validate`.
  - It has no query with `sql` and no `code` component.
  - For every k in 1..version, the definition restricted to items with `since ≤ k` (plus their `requires`) also passes. Restriction removes the other top-level components and queries, and also removes references to them from layout props of the remaining components: tabs, actionBar and formCard lists.
- **`screenViews[]`.**
  - `key` is a key of the `/api/screen-views/catalog`.
  - `component` is a top-level `dataTable` with a `query`.
  - Each `fields` key is a field key of that catalog entry, and each value is a column code of the bound operation's result.

**`SystemPageStandards.versions.txt`** (`tests/IntegrationTests`, sorted, one `screenKey=version` per line). The current version must be ≥ the recorded version, and every recorded key must still exist.

**Synthetic identity of a standard without a firm design.**
- `id = SystemPageStandards.SyntheticId(screenKey)`: a deterministic name-based GUID (SHA-1 of `"nexora-system-page:" + screenKey`, version-5 layout).
- `revision = version`.
- `code = "@" + screenKey`.

**New and changed fields on existing responses.**
- `GET /api/custom-pages` (`PageSummary`) gains `screenKey: string | null`.
- `GET /api/custom-pages/{id}` (`PageDetail`) gains `screenKey: string | null` and `standardVersion: number | null`.
- `PUT /api/custom-pages/{id}`: `UpdateRequest` gains optional `standardVersion: number | null`.
  - It is accepted only on a system draft.
  - It must satisfy stored ≤ value ≤ current standard version; otherwise 400 `"Standart sürüm değeri geçersiz."`.
  - On any other page it must be `null`.

**New routes** (`/api/system-pages`, group `.RequireAuthorization()`, tag "Tenant System Pages"):

| Route | Gate | Response |
|---|---|---|
| `GET /` | `erp.tenant-customizations` read | `[{ screenKey, title, description, module, version, stage, screenViewKeys: string[], draftId: guid?, publishedId: guid?, standardVersion: int?, newItemCount: int, canEdit: bool }]`. `canEdit` = verified TenantAdmin. |
| `GET /runtime` | `erp.custom-menus` read | `{ screens: { [screenKey]: { mode: "override" \| "standard", revision: int } } }`. A key is listed when it has a published firm row (`override`), or when it has **no published** firm row and is in `SystemPages:StandardEnabled` (`standard`). An open draft alone never changes the mode. |
| `GET /{screenKey}/published` | `erp.custom-menus` read + view right | `PublishedPage` (`id, code, name, description, revision, definitionJson`, which never contains SQL; `forms`; `rights`) + `screenKey`, `source: "override" \| "standard"` and `standardVersion`. It serves the published firm row if one exists, otherwise the standard when the key is enabled (drafts are ignored), otherwise 404. View right: see Permissions below. |
| `POST /{screenKey}/draft` | customizations `create` + verified admin | 200 with the existing open draft, or 201 with a new one: `PageDetail` + `importNotes: string[]`. |
| `POST /{screenKey}/reset` body `{ expectedRevision: int? }` | customizations `update` + verified admin | `PageDetail`. With an open draft, `expectedRevision` must match (409 `"Taslak güncel değil. Son sürümü yeniden yükleyin."`), and the draft's definition is replaced (`ChangeKind = "ResetToStandard"`). Without one, a new draft is created with the same kind. In both cases `StandardVersion` becomes the current version, and nothing is imported. |
| `GET /{screenKey}/new-items` | customizations read | `{ standardVersion, baseVersion, items: [{ key, kind: "component" \| "query", label, since, definition: object, requires: string[] }] }`, computed against the open draft or else the published firm row. With no firm row, `items` is `[]` and `baseVersion` is the current version. |
| `GET /{screenKey}/history` | customizations read | Revisions of every row with code `@<screenKey>`, newest first: `RevisionDetail` + `customPageId`. Query SQL is hidden from non-admins, as in `/api/custom-pages/{id}/history`. |

Every route returns 404 `"Sistem sayfası bulunamadı."` for an unknown `screenKey`. A write without a verified admin returns 403 `"Sistem sayfalarını yalnız firma yöneticisi düzenleyebilir."`.

**Draft open logic** (`POST /{screenKey}/draft`, serializable transaction):
1. An open draft (`!IsPublished && !IsArchived`) exists → 200 with it.
2. A published firm row exists → a new draft copied from it (`ChangeKind = "DraftCreated"`). `StandardVersion` is copied.
3. No row with that code has ever existed, archived rows included → a draft from the standard, with the screen-view import (`ChangeKind = "CreatedFromStandard"`).
4. Otherwise (only archived rows) → a draft from the standard **without** the import (`ChangeKind = "CreatedFromStandard"`).

In all cases `Name` = standard `title`, `Description` = standard `description`, and `ScreenKey` = the key.

**Screen-view import (visibility only).** For each `screenViews[i]` with a published `TenantScreenView` of that key:
- From the target table's `columns`, remove every column whose mapped field has `visible = false`.
- For every hidden or visible field without a mapping, add a note: `"“<alan etiketi>” alanının yeni tasarımda karşılığı yok; aktarılmadı."`.
- If any field's label, position, width or section differs from the catalog default, add the single note: `"Sütun sırası, etiketleri ve genişlikleri aktarılmaz; tasarımcıda düzenleyin."`.
- If every column would be removed, keep the table's columns unchanged and add the note: `"Tüm sütunlar gizli olduğu için görünüm ayarı aktarılmadı."`.

**"Yeni" rule.** An item is offered when both hold:
- `since > baseVersion`;
- its id is absent from the design (top-level component ids, or query ids).

`requires` lists only the required items that are also absent.

**Permissions.**
- **`PlatformPermissionCatalog`.**
  - `/api/system-pages/runtime` and `/api/system-pages/{screenKey}/published` resolve to `erp.custom-menus` read.
  - Every other `/api/system-pages` path resolves to `erp.tenant-customizations` with the method's usual action.
- **View right of a system row.**
  - It comes from `CustomPageAccess.GetRightsAsync`, with `pageHasQueries = TenantCustomPageQueries.HasSqlQueries(definition)`.
  - The same applies on the custom-page query-run path for `@` codes, and in batch evaluation for `@` codes.
  - A standard without a firm row gives `View` to every member and no page write rights.
- **Publishing a system row** needs an access row only when the draft has SQL queries (`"Bu sayfa SQL sorgusu içeriyor; yayımlamadan önce erişimi açıkça seçin."`). Publish, update, delete and restore of a system row also need a verified admin.

---

### Task 1: Server — standard envelopes, loader and demo definition

**Files:**
- Create: `src/Hosts/AIERP.Api/SystemPages/SystemPageStandards.cs`
  - records `SystemPageStandard`, `SystemPageItem`, `SystemPageScreenView`;
  - `IReadOnlyDictionary<string, SystemPageStandard> All`, `TryGet`, `SyntheticId`, `Restrict(standard, version)`;
  - `internal static IReadOnlyList<string> Validate(IEnumerable<(string FileName, string Json)>)`, which returns the errors.
- Create: `src/Hosts/AIERP.Api/SystemPages/Standards/inventory-warehouses.json` (the Wire contract example, verbatim).
- Modify: `src/Hosts/AIERP.Api/AIERP.Api.csproj`, adding `<EmbeddedResource Include="SystemPages\Standards\*.json" />`.
- Modify: `src/Hosts/AIERP.Api/StandardMenuEndpoints.cs`, exposing `internal static IReadOnlySet<string> PageKeys`.
- Modify: `src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs`, exposing `internal static bool TryGetCatalogFields(string key, out IReadOnlyList<(string Key, string Label, bool DefaultVisible)> fields)`. This is a read-only adapter over the existing private catalog.
- Modify: `src/Hosts/AIERP.Api/Program.cs`. Register `builder.Services.AddSingleton<ISystemPageStandardSet, EmbeddedSystemPageStandardSet>();`. After building `app`, touch `SystemPageStandards.All` so that an invalid envelope fails startup.
- Test: `tests/IntegrationTests/SystemPageStandardsTests.cs`, `tests/IntegrationTests/SystemPageStandards.versions.txt` (`inventory-warehouses=1`)

**Interfaces (Produces):**

```csharp
internal sealed record SystemPageItem(string Key, string Kind, string Id, int Since, string Label, IReadOnlyList<string> Requires);
internal sealed record SystemPageScreenView(string Key, string Component, IReadOnlyDictionary<string, string> Fields);
internal sealed record SystemPageStandard(string ScreenKey, string Title, string? Description, string Module, int Version, string Stage,
    IReadOnlyList<SystemPageItem> Items, IReadOnlyList<SystemPageScreenView> ScreenViews, string DefinitionJson);
internal static class SystemPageStandards
{
    public static IReadOnlyDictionary<string, SystemPageStandard> All { get; }   // Lazy; throws InvalidOperationException listing every error
    public static bool TryGet(string screenKey, out SystemPageStandard standard);
    public static Guid SyntheticId(string screenKey);
    public static string Restrict(SystemPageStandard standard, int version);     // definition JSON with only items since ≤ version (+requires)
    internal static IReadOnlyList<string> Validate(IEnumerable<(string FileName, string Json)> files);
}
/// <summary>DI singleton the endpoints read; defaults to <see cref="SystemPageStandards.All"/>. Integration tests replace it
/// through WithWebHostBuilder(ConfigureServices) instead of mutating static state, so parallel xUnit classes never interfere.</summary>
internal interface ISystemPageStandardSet { bool TryGet(string screenKey, out SystemPageStandard standard); IReadOnlyCollection<SystemPageStandard> All { get; } }
internal sealed class EmbeddedSystemPageStandardSet : ISystemPageStandardSet { /* wraps SystemPageStandards */ }
```

- [ ] **Step 1: Write failing tests**:
  - `Embedded_standards_are_valid`: `All` loads; `inventory-warehouses` has version 1 and stage `preview`.
  - `Versions_file_matches`: each recorded key exists, and its current version ≥ the recorded one.
  - `Every_restricted_version_validates`.
  - `SyntheticId_is_stable`: the same key gives the same GUID, and different keys give different GUIDs.
  - Rejection vectors through `Validate`, each asserting its Turkish or English error contains the offending key:
    - a SQL query;
    - a `code` component;
    - an item missing for a top-level id;
    - an extra item;
    - `since > version`;
    - an unknown `requires`;
    - a `screenKey` not in the menu;
    - a file name ≠ `screenKey`;
    - a `screenViews` field not in the catalog;
    - a mapped column not in the operation's result columns;
    - a v1 definition.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPageStandardsTests"`. Expected: FAIL.
- [ ] **Step 3: Implement** the loader and the demo JSON. Result columns come from `ErpOperationCatalog.TryGet(name, out op)` and `op.Result.Columns`.
- [ ] **Step 4: Run** the same filter. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(api): sistem sayfası standart tanımları ve Depo Yönetimi örneği`.

### Task 2: Data model, migrations and custom-page surfaces

**Files:**
- Create: `src/Hosts/AIERP.Api/SystemPages/SystemPageCodes.cs` with `IsSystemCode`, `CodeFor(screenKey)` and `ScreenKeyOf(code)` (this task owns the file).
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs`
  - `TenantCustomPage` gains `public string? ScreenKey { get; set; }` and `public int? StandardVersion { get; set; }`;
  - `TenantCustomPageRevision` gains `public int? StandardVersion { get; set; }`.
- Modify: `src/Platform/AIERP.Platform.Infrastructure/PlatformDbContext.cs` and `TenantDbContext.cs`, identically in both:
  - `ScreenKey` gets `HasMaxLength(40).IsUnicode(false)`;
  - add the check `CK_TenantCustomPages_ScreenKey` = `[ScreenKey] IS NULL OR ([Code] = '@' + [ScreenKey] AND [StandardVersion] IS NOT NULL AND [StandardVersion] >= 1)`;
  - add the index `IX_TenantCustomPages_ScreenKey` on `(TenantId, ScreenKey)` with the filter `[ScreenKey] IS NOT NULL`.
- Create migrations. Run `dotnet tool restore` first. The older `20261104150000_AddTenantCustomPages` has no Designer file, so first run `has-pending-model-changes` **before** editing the model to confirm a clean baseline:

  ```bash
  dotnet ef migrations has-pending-model-changes --project src/Platform/AIERP.Platform.Infrastructure --context PlatformDbContext
  dotnet ef migrations has-pending-model-changes --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext
  dotnet ef migrations add AddSystemPageOverrides --project src/Platform/AIERP.Platform.Infrastructure --context PlatformDbContext
  dotnet ef migrations add AddTenantSystemPageOverrides --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext --output-dir Migrations/Tenant
  ```

  Each generated `Up` must contain only:
  - three `AddColumn` calls (nullable);
  - one `AddCheckConstraint`;
  - one `CreateIndex`.

  Remove anything else and report it. `Down` drops exactly those. Finally, run `has-pending-model-changes` for both contexts and expect no changes.
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs`:
  - **Records.** `PageSummary` and `PageDetail` gain the fields from the Wire contract. `RevisionOf` copies `StandardVersion`.
  - **`/{code}/published`.** Add `&& x.ScreenKey == null` to the query, so it returns 404 for system rows.
  - **`PUT /{id}`.**
    - Accept `standardVersion` per the Wire contract.
    - A system row additionally needs a verified admin.
    - A system row's `Name` must stay 1–120 characters, and its `Code` and `ScreenKey` never change.
  - **Publish.**
    - A system row needs a verified admin.
    - It needs an access row only when `HasSqlQueries` is true; otherwise the current `HasQueries` rule stays for non-system rows.
    - The previous published row is matched by code, as today.
  - **`DELETE /{id}`** of a system row needs a verified admin.
  - **Restore.** The new draft copies `ScreenKey` from the original row and `StandardVersion` from the revision; when the revision has `null`, it uses the row's value. Restore of a system row needs a verified admin.
- Modify: `src/Hosts/AIERP.Api/CustomMenuEndpoints.cs`: `GetTargetsAsync` filters on `x.ScreenKey == null`.
- Modify: `src/Hosts/AIERP.Api/CustomPageAccessEndpoints.cs`:
  - `ValidCode(code) || SystemPageCodes.IsSystemCode(code)` on GET/PUT `/{code}/access`;
  - in the batch `GetRightsAsync`, the "codes with queries" lambda uses `HasSqlQueries` for `@` codes.
- Modify: `src/Hosts/AIERP.Api/CustomPageQueryEndpoints.cs`: for a `@` code, rights use `pageHasQueries = HasSqlQueries`.
- Test: `tests/IntegrationTests/SystemPageStorageIntegrationTests.cs` (InMemory); `tests/IntegrationTests/SystemPageStorageSqlAcceptanceTests.cs` (`[SqlServerAcceptanceFact]`)

**Interfaces:** Consumes nothing from other tasks. Produces `SystemPageCodes`, the entity fields and the extended `PageDetail`, which Task 4 and the frontends use. System rows are seeded directly through `TenantDbContext` in tests until Task 4 lands.

- [ ] **Step 1: Write failing tests** (InMemory, system rows seeded directly):
  - `Custom_page_list_reports_screen_key`;
  - `Menu_targets_exclude_system_rows`;
  - `Published_by_code_returns_404_for_system_row`;
  - `Drafts_endpoint_rejects_at_code`;
  - `System_row_without_access_row_is_visible_to_members_when_it_has_only_operations`, run through `/api/custom-pages/@inventory-warehouses/queries/{id}/run` rights and through the batch rights;
  - `System_row_with_sql_and_no_access_row_is_admin_only`;
  - `Put_standard_version_rules`: lower → 400, above current → 400, on a non-system page → 400, valid → stored;
  - `Restore_keeps_screen_key_and_standard_version`;
  - `TenantUser_cannot_update_publish_delete_or_restore_system_row` (403);
  - `Access_endpoints_accept_system_code`.

  SQL acceptance:
  - `Check_constraint_rejects_mismatched_code`;
  - `Second_open_draft_for_same_screen_key_is_rejected`, through the existing draft index.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPageStorage"`. Expected: FAIL. The acceptance tests are skipped without `AIERP_REPORT_TEST_SQL_CONNECTION_STRING`.
- [ ] **Step 3: Implement** the model, the migrations and the endpoint changes.
- [ ] **Step 4: Run** the filter, then the custom page suites:
  `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPage|FullyQualifiedName~TenantCustomPage|FullyQualifiedName~CustomMenu"`
  and `dotnet test tests/UnitTests/AIERP.Platform.UnitTests`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(data): özel sayfalara sistem sayfası bağlantısı (genişletme migration'ı)`.

### Task 3: Server — screen-view import and "Yeni" computation (pure)

**Files:**
- Create: `src/Hosts/AIERP.Api/SystemPages/SystemPageMerge.cs`
- Test: `tests/IntegrationTests/SystemPageMergeTests.cs`, with test-only envelopes built in code. Tests do not use the embedded set, so they can model version 2 and 3.

**Interfaces (Produces):**

```csharp
internal sealed record ScreenViewFieldState(string Key, string Label, bool Visible, bool DiffersFromDefault);
internal sealed record SystemPageImportResult(string DefinitionJson, IReadOnlyList<string> Notes);
internal sealed record SystemPageNewItem(string Key, string Kind, string Label, int Since, JsonElement Definition, IReadOnlyList<string> Requires);
internal static class SystemPageMerge
{
    // screenViews: screen-view key → published field states (absent key = no published view)
    public static SystemPageImportResult ImportScreenViews(SystemPageStandard standard,
        IReadOnlyDictionary<string, IReadOnlyList<ScreenViewFieldState>> screenViews);
    public static IReadOnlyList<SystemPageNewItem> NewItems(SystemPageStandard standard, string designJson, int baseVersion);
}
```

- [ ] **Step 1: Write failing tests**:
  - `Hidden_mapped_field_removes_column`;
  - `Unmapped_field_adds_note`, with exactly the Wire-contract text and the catalog label "Açıklama" for `availability`;
  - `Label_or_order_change_adds_single_note`;
  - `All_hidden_keeps_columns_and_notes`;
  - `No_published_view_changes_nothing`;
  - `New_item_offered_when_since_above_base_and_absent`;
  - `Deleted_old_item_not_offered`, where `since ≤ base` and the item is absent;
  - `Present_item_not_offered`, where `since > base` and the item is present because the firm added it;
  - `Requires_lists_only_absent_dependencies`;
  - `Base_equal_current_offers_nothing`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPageMergeTests"`. Expected: FAIL.
- [ ] **Step 3: Implement** with `System.Text.Json.Nodes`. Never mutate the standard's JSON; copy it.
- [ ] **Step 4: Run** the same filter. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(api): görünüm ayarı aktarımı ve standart "Yeni" hesabı`.

### Task 4: Server — `/api/system-pages` endpoints and permission mapping

**Files:**
- Create: `src/Hosts/AIERP.Api/SystemPageEndpoints.cs`, exposing `MapSystemPageEndpoints(this WebApplication app)`. It contains all routes of the Wire contract. Reuse these helpers by making them `internal` rather than copying them:
  - `TenantCustomPageEndpoints`: `RevisionOf`, `AddAudit`, `ToDetail`, `QueryPageWriteAllowedAsync`, `QuerySqlVisibleAsync`.
- Modify: `src/Hosts/AIERP.Api/Program.cs`: call `app.MapSystemPageEndpoints();` next to `app.MapTenantCustomPageEndpoints();` (~line 248).
- Modify: `src/Hosts/AIERP.Api/appsettings.json`: add `"SystemPages": { "StandardEnabled": [] }`.
- Modify: `src/Hosts/AIERP.Api/TenantScreenViewEndpoints.cs`: add `internal static Task<IReadOnlyList<ScreenViewFieldState>?> ReadPublishedFieldStatesAsync(TenantDbContext db, Guid tenantId, string screenViewKey, CancellationToken ct)`. It returns `null` without a published view, and otherwise one state per catalog field, built with the existing private `ToView` and catalog (customer custom fields included through `WithCustomerFieldsAsync`). `DiffersFromDefault` is true when the label, position, width or section differs from the catalog default.
- Modify: `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs`: add the `/api/system-pages` branch from the Wire contract.
- **Audit actions:** `system-page.draft-opened`, `system-page.draft-created`, `system-page.reset`. Each uses `Resource = "custom-page:@<screenKey>"`.
- Test: `tests/IntegrationTests/SystemPageEndpointsIntegrationTests.cs`. Add the permission mapping tests to the unit test class that already calls `PlatformPermissionCatalog.TryResolve` (`tests/UnitTests/AIERP.Platform.UnitTests/CustomPageAccessRulesTests.cs` or its neighbour).

**Interfaces:** Consumes Tasks 1–3 (`ISystemPageStandardSet` from DI, `SystemPageMerge`, `SystemPageCodes`). Produces the routes, which Tasks 5–7 call.

- [ ] **Step 1: Write failing tests**:
  - `Catalog_lists_demo_with_status_and_new_count`;
  - `Runtime_map_empty_by_default`;
  - `Runtime_map_lists_standard_when_enabled_in_config` (`SystemPages:StandardEnabled:0 = inventory-warehouses` via `WithWebHostBuilder`);
  - `Runtime_map_lists_override_when_published`;
  - `Published_returns_standard_with_synthetic_id`;
  - `Published_returns_override_without_sql_for_non_admin`;
  - `Published_404_when_neither`;
  - `Open_draft_creates_from_standard_and_imports_visibility`, with a published `inventory-warehouses` screen view that hides `name` and has `availability`, giving columns `["code","isActive"]` and two notes;
  - `Open_draft_is_idempotent`;
  - `Open_draft_from_published_copies_it`;
  - `Draft_after_archive_does_not_reimport_screen_view`;
  - `Reset_replaces_open_draft_and_sets_current_version`;
  - `Reset_with_stale_revision_conflicts`;
  - `Reset_without_draft_creates_one`;
  - `New_items_against_draft`, with a version-2 test standard set registered as `ISystemPageStandardSet` through `WithWebHostBuilder(b => b.ConfigureServices(...))`;
  - `History_spans_rows_after_publish_and_reset`;
  - `TenantUser_cannot_open_reset`, which returns 403 with the Wire-contract text;
  - `Unknown_screen_key_is_404`;
  - permission unit tests: runtime and published resolve to `erp.custom-menus`, the others to `erp.tenant-customizations`.
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SystemPageEndpoints"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Draft open and reset** run in `BeginTransactionAsync(IsolationLevel.Serializable)`, like publish. After the transaction starts, re-check for an open draft. Map a unique-index `DbUpdateException` to 200 with the winner's draft.
- [ ] **Step 4: Run** the filter, then the whole solution, `dotnet test AIERP.slnx`. Expected: PASS, including `ArchitectureBoundaryTests` and any test that checks every endpoint has a permission entry.
- [ ] **Step 5: Commit** with the message `feat(api): sistem sayfası uç noktaları`.

### Task 5: ERP Web — runtime map, routing, system mode and "Eski ekranda aç"

**Files:**
- Create: `frontend/erp-web/src/system-pages/useSystemPageMap.ts`. It exposes:

  ```ts
  useSystemPageMap(token: string, tenantId: string): {
    status: "loading" | "ready" | "failed";
    screens: Record<string, { mode: "override" | "standard"; revision: number }>;
    legacy: ReadonlySet<string>;            // keys the user switched back to the legacy screen in this session
    openLegacy(key: string): void; closeLegacy(key: string): void; dropScreen(key: string): void;
  }
  ```

  - It fetches `/api/system-pages/runtime` once per tenant selection, and `legacy` resets at the same time.
  - On failure the status is `failed` and `screens` is empty.
  - `dropScreen` removes a key from `screens` after a stale-map 404 (see below).
- Modify: `frontend/erp-web/src/App.tsx`. Call `useSystemPageMap` next to the existing tenant state and pass its result to `WorkspacePageRouter` as `systemPages`. **The page key itself is never changed**, so no extra page key reaches App's page state, tab list, title map or the `module:` guard (~line 575).
- Modify: `frontend/erp-web/src/WorkspacePageRouter.tsx`:
  - **Inputs.** It accepts `systemPages` (the hook result).
  - **Mapped keys.** For a key in `systemPages.screens` and not in `systemPages.legacy`, it renders `<TenantCustomPage token={token} systemScreenKey={key} onOpenLegacy={() => systemPages.openLegacy(key)} onSystemPageMissing={() => systemPages.dropScreen(key)} />`.
  - **Keys in `legacy`.** It renders `<LegacyScreenBar onBack={() => systemPages.closeLegacy(key)} />` above the normal legacy dispatch.
  - **While loading.** While the status is `loading`, it shows `"Sayfa yükleniyor…"` for every built-in page key. The client does not know which keys have a standard until the map arrives, and the map is one small request per tenant selection. With status `failed`, every key renders legacy.
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`:
  - **New props.** `systemScreenKey?: string`, `onOpenLegacy?: () => void` and `onSystemPageMissing?: () => void`.
  - **Endpoint.** When `systemScreenKey` is set, the endpoint is `/api/system-pages/${encodeURIComponent(key)}/published`.
  - **Stale map.** A **404** from that endpoint calls `onSystemPageMissing` instead of showing an error, so the router falls back to legacy. This happens when the map is stale, for example when the firm design was removed after the map loaded.
  - **Page code.** It is `page.code` (`@key`), so SQL queries of a firm design run through `/api/custom-pages/%40key/queries/...`.
  - **Header.** It shows a link button "Eski ekranda aç" when `onOpenLegacy` is set.
- Create: `frontend/erp-web/src/system-pages/LegacyScreenBar.tsx`, with the copy "Eski ekran görüntüleniyor." and the button "Yeni tasarıma dön".
- Test: `frontend/erp-web/src/system-pages/systemPageRouting.test.tsx`, mocking `fetch` and lazy screens:
  - `map failure renders legacy`;
  - `override key renders system page from system endpoint`;
  - `standard key renders system page`;
  - `unmapped key renders legacy`;
  - `Eski ekranda aç shows legacy with bar and Yeni tasarıma dön returns`;
  - `stale map 404 falls back to legacy`;
  - `system page query run uses encoded @ code`.

**Interfaces:** Consumes the Wire contract (`/runtime`, `/{key}/published`). It needs no server code to build or test.

- [ ] **Step 1: Write failing tests** (above).
- [ ] **Step 2: Run** `npx vitest run src/system-pages` in `frontend/erp-web`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run build` in `frontend/erp-web`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(erp-web): sistem sayfası yönlendirmesi ve eski ekrana dönüş`.

### Task 6: Studio — system page cards and designer system mode

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/LowCodeDesignerPage.tsx`:
  - **Data.** Fetch `/api/system-pages` alongside the two existing catalogs. If it fails, keep today's cards and set no error.
  - **Lists.** The "Özel sayfalar" list filters out items with a `screenKey`. The custom count and the "Özel" filter count exclude them too.
  - **Built-in card whose key is in some standard's `screenViewKeys`.**
    - Badge "Sistem sayfası"; status `Standart`, `Taslak var` or `Firma tasarımı yayında`; plus an `Önizleme` chip when `stage === "preview"`.
    - The button is "Tasarımcıda aç". It is disabled when `!canEdit`, with the title "Sistem sayfalarını yalnız firma yöneticisi düzenleyebilir.".
    - When it has `newItemCount > 0`, a small "{n} yeni" tag.
  - **Standards matched by no screen-view card** get their own built-in card, with the same content.
  - **Opening.** "Tasarımcıda aç" calls `POST /api/system-pages/{key}/draft`. It then opens `CustomPagesPage` with `initialPageId = detail.id`, `systemScreenKey = key` and `importNotes`.
  - **Other cards** keep "Görünümü düzenle" unchanged.
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - **New props.** `systemScreenKey?: string` and `importNotes?: string[]`.
  - **System mode.**
    - The code field is read-only and shows `@key`.
    - The delete button becomes "Firma tasarımını kaldır". It is shown only on the published row and confirms with: "Firma tasarımı kaldırılsın mı? Ekran, Nexora'nın standart ekranına döner; geçiş tamamlanmamış ekranlarda bu eski ekrandır."
    - The button "Standarda dön" calls `POST /api/system-pages/{key}/reset` with `expectedRevision` of the open draft. It confirms with: "Taslak, Nexora standart tasarımının güncel sürümüyle değiştirilsin mi? Yayımlayana kadar ERP'deki ekran değişmez."
    - History uses `/api/system-pages/{key}/history`. Restore calls `/api/custom-pages/{customPageId}/restore/{revisionId}`.
    - "New draft from published" (today a `POST /drafts`, ~line 770) uses `POST /api/system-pages/{key}/draft` instead.
    - `importNotes` show once as a dismissible notice.
    - The preview-stage warning reads "Bu standart tanım önizleme aşamasında; eski ekranın tüm işlevlerini içermez.".
    - The access panel is shown only when the definition has SQL queries.
  - **Loading.** The page lookup by `initialPageId` must also find system rows; the list endpoint returns them with `screenKey`.
- Modify: the `PageSummary` and `PageDetail` types in the same file gain `screenKey` and `standardVersion`.

**Interfaces:** Consumes the Wire contract. Produces `systemScreenKey` mode, which Task 7 extends.

- [ ] **Step 1: Implement** the above. Studio has no unit test runner; correctness is checked by the build and by Task 8.
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success with no TS errors.
- [ ] **Step 3: Commit** with the message `feat(studio): yerleşik kartlarda "Tasarımcıda aç" ve sistem sayfası kipi`.

### Task 7: Studio — "Yeni" strip with one-click add

**Files:**
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/SystemPageNewItems.tsx`
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - **Fetching.** In system mode, fetch `/api/system-pages/{key}/new-items` after each draft load or save.
  - **Strip.** When `items.length > 0`, show the strip "Nexora standart tasarımında {n} yeni öğe var." Each row shows the label and the kind ("Bileşen" or "Sorgu"), plus an "Ekle" button. The strip also has the button "Tümünü yok say".
  - **"Ekle"** goes through the normal `commit` path, so undo works and the page becomes dirty:
    - a component is appended to `components`;
    - queries are appended to `queries`, followed by each missing `requires` item;
    - an id already used by another component or query is renamed with the existing `newId` helper. References inside the added component are rewritten to the new id.
  - **When every offered item has been added,** the next save sends `standardVersion = standardVersion` from the new-items response.
  - **"Tümünü yok say"** saves the draft with `standardVersion` set to the current version. With unsaved changes, it saves them in the same PUT.
  - **Read-only drafts.** Buttons are disabled when the draft is not editable (`canEdit`).

**Interfaces:** Consumes Task 6's system mode and the Wire contract's `new-items` and `PUT standardVersion`.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success.
- [ ] **Step 3: Commit** with the message `feat(studio): standart tanımdaki yeni öğeler için öneri şeridi`.

### Task 8: Live verification and docs (QA Test Firma 20261117 only; controller)

Run by the controller after merge and deploy. Apply the Platform and Tenant migrations through the controlled release step in `docs/release-migrations.md`: backup, rehearsal, apply, then verify migration counts and the three new columns. Leave `SystemPages:StandardEnabled` empty. Then verify, in the QA tenant only:
- **Before any firm design.** ERP → Depo Yönetimi shows the legacy screen, and `/api/system-pages/runtime` returns `{ screens: {} }`.
- **Opening the designer.**
  - Studio → Sayfalar: the "Depo tanımları" card shows "Sistem sayfası", "Önizleme" and "Tasarımcıda aç".
  - The card has no "Görünümü düzenle".
  - A TenantUser sees the button disabled with the reason.
- **Import.** First publish a screen view for `inventory-warehouses` with "Depo adı" hidden. Then "Tasarımcıda aç" opens the designer with the `depoListesi` table showing `code` and `isActive`, and shows the "Açıklama" note.
- **Publishing.** Publish the firm design. ERP → Depo Yönetimi now renders the page inside the normal frame, and its rows match the legacy list.
- **Legacy fallback.** "Eski ekranda aç" shows the legacy screen with the bar, and "Yeni tasarıma dön" returns.
- **TenantUser.** A TenantUser sees the new page without an access row.
- **"Standarda dön".** It creates a draft, and the ERP screen is unchanged until publish. History shows rows across publish and reset.
- **Removal.** "Firma tasarımını kaldır" returns ERP to the legacy screen.
- **Custom-page surfaces.** The "Özel" list and the menu targets never show `@inventory-warehouses`.

Afterwards, remove the QA firm design and the screen view, and record the evidence in `docs/phase-status.md`. Write "Proje 3: altyapı + Depo Yönetimi önizleme tanımı; QA firmasında doğrulandı; geçiş anahtarı hiçbir ekranda açık değil". Make no production-readiness claim. Add the migration record to `docs/release-migrations.md` in the existing format.

---

## Parallelism

- **Wave 1 (parallel):**
  - Task 1: standards, loader and the DI set.
  - Task 2: data model, migrations, `SystemPageCodes` and custom-page surfaces.
  - Task 5: ERP Web. It needs only the Wire contract and touches only `frontend/erp-web`.
  - Task 6: Studio, part one. It needs only the Wire contract and touches only Studio files.

  Tasks 1 and 2 share no file: only Task 1 edits `Program.cs`, the csproj, `StandardMenuEndpoints.cs` and `TenantScreenViewEndpoints.cs`, and only Task 2 edits Domain, Infrastructure and the custom-page, menu and access endpoint files.
- **Wave 2:**
  - Task 3 starts after Task 1, because it compiles against Task 1's records.
  - Task 7 starts after Task 6, because both edit `CustomPagesPage.tsx`.
- **Wave 3:** Task 4 starts after Tasks 1, 2 and 3 are merged. It edits `Program.cs` and `TenantScreenViewEndpoints.cs` after Task 1, in different members.
- **Last:** Task 8, after all of them are merged and deployed.
