# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nexora: a multi-tenant ERP platform (Cari, Stok & Depo, Satış, Satınalma, Finans/Genel Muhasebe, CRM, Üretim, İK, Dış Ticaret, Duran Varlık…) plus a separately hosted **AI Development Studio** that plans, proposes and applies code changes to tenant projects. Backend is .NET 10 / ASP.NET Core minimal APIs / EF Core on SQL Server; frontends are React + Vite + TypeScript. UI text, README and many domain terms are Turkish.

Authoritative docs: `README.md` (local run), `docs/architecture.md` (service boundaries, SQL topology, security model, limitations), `docs/project-map.md` (service/project map), `docs/phase-status.md` (what is verified vs. remaining), `docs/release-migrations.md` (schema evolution policy).

## Commands

Backend (from repo root, solution is `AIERP.slnx`):

```bash
dotnet build AIERP.slnx
dotnet test AIERP.slnx
dotnet test tests/UnitTests/AIERP.Platform.UnitTests
dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantSelectionIntegrationTests"
dotnet test --filter "FullyQualifiedName~SalesQuoteTests.Some_test_name"
```

Tests are xUnit. Most integration tests host `AIERP.Api` in-process (`WebApplicationFactory<ApiEntryPointMarker>` / `TestServer`) with the EF InMemory provider, so no SQL Server is needed. `*SqlAcceptanceTests` use `[SqlServerAcceptanceFact]` and are **skipped** unless `AIERP_REPORT_TEST_SQL_CONNECTION_STRING` points at a disposable SQL Server; they create isolated Platform/Tenant/Studio databases with separation enabled. `ArchitectureBoundaryTests` enforces layer dependencies (see below), so a forbidden project reference fails the test run.

CI (`.github/workflows/ci.yml`) runs `dotnet test AIERP.slnx --configuration Release -m:1` and `npm ci && npm run build` for both frontends; CodeQL runs separately.

EF Core migrations (tool pinned in `dotnet-tools.json`; run `dotnet tool restore` first). Design-time factories live in Infrastructure, so it is both project and startup project. Three contexts, separate migration folders:

```bash
dotnet ef migrations add <Name> --project src/Platform/AIERP.Platform.Infrastructure --context PlatformDbContext
dotnet ef migrations add <Name> --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext --output-dir Migrations/Tenant
dotnet ef migrations add <Name> --project src/Platform/AIERP.Platform.Infrastructure --context AIStudioDbContext --output-dir Migrations/AIStudio
dotnet ef migrations has-pending-model-changes --project src/Platform/AIERP.Platform.Infrastructure --context TenantDbContext
```

Design-time connection strings come from `ConnectionStrings__Platform` / `ConnectionStrings__Tenant` / `ConnectionStrings__AIStudio`, falling back to a local Integrated Security SQL Server.

Frontends (`frontend/erp-web`, `frontend/development-studio`): `npm ci`, `npm run dev`, `npm run build` (type check + Vite build; there is no lint script). `erp-web` also has Playwright UI-design tests: `npm run test:ui-design` (`tests/ui`, base URL from `NEXORA_UI_BASE_URL`, default `http://127.0.0.1:5173`; starts the dev server itself for local URLs).

Full local stack (SQL Server, Vault, all services; ERP Web :5173, Studio :5174):

```bash
docker compose --env-file deploy/docker/.env -f deploy/docker/docker-compose.yml up --build -d
```

Copy `.env.example` to `deploy/docker/.env` first; `AUTH_SIGNING_KEY`, `WORKSPACE_RUNNER_SIGNING_KEY` and `RELEASE_DEPLOYER_SIGNING_KEY` must be distinct random values or Compose won't start. For ERP Web hot reload, stop the Compose `erp-web` service and run `npm run dev -- --port 5175` in `frontend/erp-web` (the API allows that origin). Compose runs the API with `ASPNETCORE_ENVIRONMENT=Production`; OpenAPI is development-only.

## Architecture

### Projects and boundaries

- `src/Platform/AIERP.Platform.Domain` → `Application` → `Infrastructure` is a clean-architecture stack. Domain and Application must not reference Infrastructure, `AIERP.Api` or `AIERP.AIService`; SDKs in `src/Extensions` must not reference their runtime hosts. Enforced by `tests/UnitTests/.../ArchitectureBoundaryTests.cs`.
- `src/Hosts/AIERP.Api` — ERP Platform API: auth, tenant selection, all ERP workflows, audit, background workers. Older endpoints live in the very large `Program.cs` (~9k lines); newer areas are split into `*Endpoints.cs` files (Finance, FixedAsset, HumanResources, ForeignTrade, CRM, Manufacturing, Reports…) — put new endpoints in such a file.
- `src/Hosts/AIERP.TenantProvisioningWorker` — creates per-tenant ERP and Studio databases and their runtime SQL principals, publishes the credentials to Vault, and applies migrations. Only it holds the provisioning connection.
- `src/AI/AIERP.AIService` — Studio API (projects, access grants, dev requests, AI planning/code proposals, GitHub App/PR publishing); mostly in `Program.cs` (~6k lines). Authenticates users against Platform API tokens.
- `src/AI/AIERP.WorkspaceRunner` — only service that touches source checkouts; no DB, no Docker socket; called by AIService with short-lived, single-workspace/single-operation tokens signed with its own key.
- `src/AI/AIERP.WorkspaceSandbox` — runs approved test/build jobs from a shared queue volume with no network, DB, workspace volume or secrets. Never invokes npm scripts or installs dependencies.
- `src/AI/AIERP.ReleaseDeployer` — the only service with Docker socket access; staging/production Compose deploys, verified SQL backups and restores; has its own signing key.
- `src/Extensions` — `ModuleSDK` (signed declarative module manifests, dependency resolution), `PluginHost` (executes import-free Core WASM modules via a JSON ABI; see `src/Extensions/AIERP.ModuleSDK/README.md`), `IntegrationSDK` + `IntegrationHost` (outbound provider calls; the only place provider credentials exist).

These isolation properties are deliberate security boundaries — don't add DB access, network access, Docker socket, signing keys or credentials to a service that doesn't have them.

### Persistence and tenancy

- SQL topology: `PlatformDbContext` (PlatformDB: identity, tenant registry, memberships, permissions, catalog, audit), plus per tenant an ERP database `AIERPTenant_<tenant-guid>` (`TenantDbContext`) and a Studio database `AIERPStudio_<tenant-guid>` (`AIStudioDbContext`). `Database:SeparationEnabled` is `true` in appsettings and Compose; routing is in `TenantDatabaseRouting`, per-tenant SQL credentials come from Vault (`VaultTenantSqlCredentialStore`). Startup isolation guards (`DatabaseIsolationConfiguration`) fail closed when provider/AppRole/routing config is missing. The legacy shared `AIERPStudio` database is not tenant-isolated; its cutover is not done (see `docs/architecture.md`).
- Entities are in `Domain/Entities.cs`; mappings in `PlatformDbContext.cs` and `*EntityConfiguration.cs`. ERP entity changes generally need both Platform and Tenant migrations.
- Tenant scope comes only from the verified `tenant_id` claim issued at tenant selection — never from request input. Every ERP query must be tenant-scoped.
- Authorization layers: membership role (`TenantAdmin` / `TenantUser`) + route/method permission catalog (`PlatformPermissionCatalog`) + tenant Allow/Deny policy rules (deny wins, TenantAdmin can't be locked out) + row-visibility filters (e.g. `CustomerRowVisibilityEndpointFilter`) + Studio project grants (Viewer/Contributor/Maintainer). New endpoints need a permission catalog entry. Self-approval is blocked in approval workflows.
- Concurrency uses SQL Server `rowversion`. Startup migration is off by default (`Database:ApplyMigrationsOnStartup`); production applies migrations through a controlled release step.
- Migrations must follow expand → migrate → contract (`docs/release-migrations.md`): no renames/drops of objects the previous release still uses.

### ERP domain conventions

These patterns recur across modules — follow them for new workflows:

- **Append-only ledgers.** Customer/supplier movements, stock movements, GL entries, audit events and custom-field value histories are never updated or deleted. Corrections and voids write a *linked reversal* entry. Audit rows are additionally protected by a DB trigger.
- **Void ordering.** Downstream documents must be voided first (e.g. receipt void requires its invoice and payments voided; GL-transferred sources must be reversed before void). Fiscal-year close restricts posting into closed periods — the `*FiscalCloseRouteSqlAcceptanceTests` cover this per source type.
- Stock: negative stock is prevented; quantities/prices are normalized to the stock card base unit while the entered unit is retained; movements snapshot unit cost in tenant base currency.
- Multi-step writes (transfers, deliveries) are transactional and use idempotency keys.
- FX conversion uses the latest manually maintained tenant rate dated on or before the source date; missing rates stay explicitly unconverted.
- Custom field and metadata changes are immutable revisions; restore creates a new revision.
- API writes sanitize resource text (`AuditResourceSanitizer`) and record tenant mutations in audit.

### AI features

AI is off unless a provider is configured (`OPENAI_API_KEY`, or a key saved via Ayarlar → AI sağlayıcı ayarları, encrypted with `AI_SETTINGS_ENCRYPTION_KEY`). Studio actions that share source, apply changes, run tests or deploy each require separate explicit approval and are audited; applied AI code is never executed by the applier. The ERP assistant has offline evaluation sets under `tests/UnitTests/.../EvaluationSets` (see `docs/ai-evaluation.md`).

## Repo notes

- `docs/*.json` and `artifacts/` are recorded evidence (scans, drills, migration scripts) from past verification runs — don't regenerate or edit them as part of unrelated changes.
- `docs/phase-status.md` and the architecture doc distinguish verified from unverified work (e.g. disposable acceptance ≠ production readiness); keep claims there accurate rather than optimistic.
