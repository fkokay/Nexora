# Nexora Project Map

Use this page as the starting point when locating code for a change. It is a navigation aid; `docs/architecture.md` defines service boundaries and security rules, while `docs/phase-status.md` and the dated decision/readiness records describe delivery status.

## Product at a glance

Nexora contains two separately hosted web applications backed by several .NET services:

- **ERP Web** is the authenticated ERP user interface.
- **Development Studio** is the tenant-scoped AI development workspace.
- **Platform API** owns authentication, tenant selection, ERP workflows, platform data, and platform audit events.
- **AI Development Service** owns Studio APIs and coordinates with the isolated Workspace Runner.
- **Tenant Provisioning Worker** creates tenant databases and supporting credentials.
- **Workspace Runner** performs tightly scoped operations on approved project checkouts.
- **Workspace Sandbox** runs bounded, explicitly approved build/test jobs outside the checkout.

See [architecture.md](architecture.md) before changing service communication, tenant isolation, workspace execution, or release behavior.

## Repository layout

| Path | Responsibility | Start here |
| --- | --- | --- |
| `src/Hosts/AIERP.Api/` | ASP.NET Core ERP/platform HTTP host, startup, middleware, endpoint registration and routes | `Program.cs`, then the relevant `*Endpoints.cs` file |
| `src/Hosts/AIERP.TenantProvisioningWorker/` | Background tenant provisioning host | Worker entry point and provisioning orchestration |
| `src/Platform/AIERP.Platform.Domain/` | Core entities and domain rules | `Entities.cs` and focused `*Entities.cs` files |
| `src/Platform/AIERP.Platform.Application/` | Shared application contracts, validation, permissions, schemas and calculations | Relevant contract/rule/calculator file |
| `src/Platform/AIERP.Platform.Infrastructure/` | EF Core contexts, persistence, tenant routing, encryption, provisioning and migrations | `PlatformDbContext.cs`, `TenantDbContext.cs`, `AIStudioDbContext.cs`, then the matching migration |
| `src/AI/AIERP.AIService/` | Tenant-scoped Development Studio API and AI orchestration | `Program.cs`, endpoint/service files |
| `src/AI/AIERP.WorkspaceRunner/` | Authorized checkout, file, Git and test-snapshot operations | Runner host and workspace operation handlers |
| `src/AI/AIERP.WorkspaceSandbox/` | Isolated job consumer and fixed build/test execution | Sandbox host and job handlers |
| `src/AI/AIERP.ReleaseDeployer/` | Approved package deployment orchestration | Deployer entry point and release workflow |
| `src/Extensions/` | Module/integration SDKs and their hosts | `AIERP.ModuleSDK`, `AIERP.IntegrationSDK`, `AIERP.IntegrationHost`, `AIERP.PluginHost` |
| `src/Observability/AIERP.Observability/` | Shared logging, tracing and metrics support | Observability registration and telemetry helpers |
| `frontend/erp-web/` | React + TypeScript ERP client | `src/App.tsx` (app shell and shared request helper), `src/authApi.ts`, feature page/component files |
| `frontend/development-studio/` | React + TypeScript Studio client, Monaco editor and project tools | `src/App.tsx`, `src/api.ts`, Studio feature components |
| `tests/UnitTests/AIERP.Platform.UnitTests/` | Domain/application and isolated component tests | Test file matching the rule or contract |
| `tests/IntegrationTests/` | API, AI Service, database-boundary and host integration tests | Test file matching the endpoint/workflow |
| `tests/security/`, `tests/deployment/`, `tests/recovery/`, `tests/performance/`, `tests/sandbox/` | Focused security, packaging, recovery, load and sandbox acceptance scripts | The matching `README.md` or `Invoke-*`/`Test-*` script |
| `deploy/` | Docker, Linux, IIS, SQL and operational deployment assets | `deploy/docker/docker-compose.yml` and platform-specific guides |
| `docs/` | Architecture, operations, decisions, evaluations and readiness records | `architecture.md`, `phase-status.md`, then topic-specific guide |
| `scripts/` | Repository and remote-operation PowerShell utilities | The script matching the operation |
| `.github/workflows/` | CI and security automation | `ci.yml`, `codeql.yml` |

## Common change paths

### ERP feature or API behavior

1. Find the API route in `src/Hosts/AIERP.Api/Program.cs` or its focused endpoint file.
2. Put reusable contracts, validation, permissions, or calculations in `AIERP.Platform.Application`; keep persistent entities in `AIERP.Platform.Domain`.
3. Use `AIERP.Platform.Infrastructure` for database mapping and persistence. Tenant-owned records belong in the tenant context; platform identity/registry data belongs in the platform context.
4. Add or update the matching API integration test and, when the rule is independently testable, a unit test.
5. For schema changes, add an EF Core migration and update its model snapshot through the established migration workflow.
6. Update the matching ERP page/component and shared request helper in `frontend/erp-web/src/App.tsx` (or `authApi.ts` for authentication) when the user interface changes.

### Studio or AI workspace feature

1. Trace the Studio UI from `frontend/development-studio/src/App.tsx` and its API client.
2. Trace the HTTP operation in `src/AI/AIERP.AIService/`.
3. Keep repository checkout and file operations in `AIERP.WorkspaceRunner`; keep execution of approved jobs in `AIERP.WorkspaceSandbox`.
4. Preserve explicit user approval, tenant/project authorization, bounded inputs, audit behavior, and the isolation rules in `docs/architecture.md`.
5. Cover service/API behavior in `tests/IntegrationTests/`; use sandbox acceptance scripts for execution-boundary changes.

### Deployment, security, or operations change

Start in the relevant `deploy/` subtree, then check matching scripts and acceptance coverage under `tests/`. Consult the platform-specific README and architecture/readiness documents before changing production or tenant-database workflows.

## Build and verification entry points

- Solution: `AIERP.slnx` (targets .NET 10).
- CI runs `dotnet test AIERP.slnx --configuration Release --verbosity minimal -m:1`.
- Each frontend has its own `package.json`; CI installs its lockfile with `npm ci` and runs `npm run build`.
- Focused PowerShell acceptance and operational scripts live under `tests/` and `deploy/`; use the script README for required environment and impact.

Only run checks relevant to the change. Some acceptance scripts require Docker, SQL, external credentials, or a disposable environment; inspect their prerequisites before use.

## Working-tree note

This map describes the repository's stable source layout, not generated output or temporary build artifacts. Keep it updated when top-level service boundaries or major source areas move; update detailed operational status in the relevant status/readiness document instead of copying it here.
