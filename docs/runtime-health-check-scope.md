# Runtime health check scope

`/health` is an unauthenticated operational probe. Its JSON `scope` and
`dependencies` fields describe what the current request actually verified; a
`ready` response does not imply that every tenant can serve business requests.
Health output must stay free of tenant identifiers, connection strings,
credentials, Vault paths, and exception details.

## Platform API

The Platform API's `/health` checks connectivity to the Platform metadata
database only. The response uses `scope: platform-database-only` and
`dependency: platform-database`. It deliberately does not read Vault or open a
tenant database. This check is safe to use while tenants are still being
provisioned and is the API's Compose health probe.

## AI Development Service

The AI Development Service first checks Platform database connectivity and
loads the AIStudio tenant catalog. With no tenants and no legacy shared
catalog, the scope is `platform-database-only-no-tenants`. With tenants, it
validates every catalog row for Ready state and canonical database naming,
then reads the Vault credential and checks migration readiness for one
deterministically selected sample tenant. The ready scope is
`platform-all-tenant-catalogs-plus-one-studio-sample`; its dependency list
names that sample probe without returning the tenant identity or credential.
The `/health` request bypasses caller-tenant routing and per-request Studio
migration middleware so this endpoint can execute its own bounded readiness
logic, including during initial startup when no tenant has been selected.

Consequently, a successful AI Service probe does not verify every tenant's
Vault secret, SQL connectivity, or migration state. It verifies catalog shape
for all tenants and the live Vault/SQL/migration path for one sample. Tenant
operations remain the authoritative check for the selected tenant.

## Startup ordering

Keep the Platform API Compose health probe independent of tenant services. The
AI Service starts after the API is healthy, so making API health wait for
AIStudio tenant readiness would create a startup dependency cycle. Tenant
readiness belongs in AI Service and tenant-scoped operations; do not interpret
the API's `ready` status as proof of tenant readiness. Existing health HTTP
status behavior and Compose startup dependencies remain unchanged.
