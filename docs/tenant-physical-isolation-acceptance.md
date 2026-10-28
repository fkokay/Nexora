# Physical tenant database isolation and migration acceptance

This is the evidence record and runbook for tenant-per-database isolation. The acceptance may use the explicitly named `docker-compose.tenant-isolation-acceptance.yml` on `nexora-remote` only: it creates a unique temporary SQL Server, Vault, network, and volume with no published ports or application mounts, then removes them. Never use the production Compose file, persistent SQL/Vault services, application volumes, development data, or any non-disposable target for this test. This does not authorize migration or configuration changes on a persistent target.

## Existing evidence and limits

- On 2026-10-27, the two-tenant SQL/Vault acceptance was rerun on `nexora-remote` in a newly generated disposable Compose project: **1/1 passed** in 8m11s. The run created two tenant ERP and AI Studio databases through the API/Worker provisioning path, round-tripped tenant credentials through temporary Vault AppRoles, and verified per-tenant sentinel access plus denial of the other tenant and Platform database. The stack used an isolated internal network and unique SQL volume, with no published ports or persistent application mounts. All containers, network, volume, and the test image were removed; a post-cleanup container inventory showed the persistent Nexora services still running. This is repeat disposable acceptance evidence only; production DBA approval, persistent-host configuration, legacy shared-login retirement, and existing-data cutover remain separate gates.
- `TenantDatabaseRouting.ResolveRequestAsync` accepts the signed `tenant_id` claim, checks a `Ready` Platform catalog entry, enforces the deterministic `AIERPTenant_{tenant-guid}` name, and fails closed otherwise. `TenantSelectionEndpoints` issues that claim in the tenant-selected access token.
- `TenantDatabaseProvisioner` provisions separate tenant databases and unique SQL logins, writes each credential to Vault and reads it back before marking the catalog Ready. Each login is granted access only in its own tenant database. The separation verifier checks tenant identity rows, out-of-scope `TenantId` rows, and trusted foreign keys.
- On 2026-10-26, the opt-in acceptance ran against a unique disposable remote SQL Server and Vault: **1/1 passed**. It submitted two tenant-create requests through the actual API endpoint using a synthetic test principal, replayed each `Idempotency-Key`, started the actual Worker, and verified both jobs reached Completed/Ready and activated their tenants. It created two synthetic tenant databases and logins, round-tripped both credentials through Vault reader/writer AppRoles, read each tenant sentinel using its own login, and verified each login could not read the other tenant or Platform database. Temporary containers, network, SQL volume, and test image were removed afterward.
- A remote disposable acceptance on 2026-10-26 also seeded a `Running` job with an expired lease to model a worker crash, and injected a single transient Vault write failure. The actual worker reclaimed the expired lease and retried the Vault failure; attempt counts were checked, including the overlap when both affected one job. Both SQL/Vault isolation checks passed (**1/1**). This surfaced a SQL principal check that attempted to convert a tenant login name to `smallint`; the check now compares matching database/server principal SIDs through SQL catalog views, and role membership is read from `sys.database_role_members`. The temporary containers, network, SQL volume, and test image were removed.
- The 2026-10-26 remote disposable acceptance now also calls the real tenant-selection endpoint for both tenants, validates the returned signed JWT through the real bearer-validation middleware, routes a protected sentinel request through `TenantDatabaseRouting` and Vault-backed SQL credential lookup, and confirms a modified JWT signature is rejected with **401**. This passes the application code path with a temporary acceptance signing key and a synthetic principal; it does **not** verify production signing-key custody, production API configuration, or a persistent host.
- The later 2026-10-26 acceptance also exercised the Worker-created per-tenant AI Studio databases: it read each tenant's Studio sentinel with its own Vault-backed SQL credential and denied access to the other Studio/Platform databases. Fresh ERP + Studio provisioning/migration and signed API tenant routing are accepted only on the disposable target. Legacy data copy/restore, production Vault policy/secret configuration, the production provisioning SQL role, existing-target grant inventory and the global `aierp_data_runtime` template credential remain open. A production-host acceptance and remaining deployment/DBA gates are separate requirements.
- `docs/migration-r5-restored-backup-rehearsal.md` records checksum-verified backup/restore and migration rehearsals for one local Tenant database. It does not cover two separate tenant targets or a remote/production target.
- An earlier isolation audit's shared-login finding is superseded for **new ERP tenant provisioning** by the two-tenant SQL/Vault acceptance above. Existing tenant databases and any grants on persistent targets have not been inventoried or changed.
- **Current status: isolated provisioning passed on disposable SQL/Vault; persistent rollout remains NO-GO.** No production SQL login, database, Vault role, or app container was changed by the acceptance run.

## Disposable SQL acceptance matrix

Create a fresh SQL Server 2022 disposable instance with no mounted application or production volumes. Provision two synthetic tenants A and B through the normal Platform API flow and confirm distinct database names `AIERPTenant_<A-guid>` and `AIERPTenant_<B-guid>`. The accepted queue/routing test uses a synthetic test principal and an ephemeral acceptance signing key; it validates enqueue/idempotency/Worker completion, obtains signed tokens from the real tenant-selection endpoint, validates and routes them through the real API middleware, and rejects a tampered signature. It does not prove production signing-key custody/configuration or create business records through authenticated tenant APIs. Save only synthetic tenant IDs, database names, request paths/statuses, migration IDs, and query outcomes; never save bearer tokens or connection secrets.

| Check | Evidence required | Pass condition |
|---|---|---|
| Physical separation | `sys.databases` names and database IDs from SQL administrator session | Platform, A, and B are distinct databases; A and B have distinct database IDs |
| Signed context | Authenticate/select A and B separately through `/api/auth/login` and `/api/auth/select-tenant`; call a tenant API with the returned access token | A token has A's signed `tenant_id`; B token has B's; tokens are not edited or hand-crafted |
| Route selection | Call the same read endpoint with each token and record returned synthetic sentinel | A sees only A's sentinel; B sees only B's sentinel |
| Cross-tenant denial | With A's token request B's synthetic record by ID and call any tenant-scoped route with an invalid/absent tenant token | Foreign record is indistinguishable from missing (normally 404); missing/invalid context is denied (normally 401/403); no B sentinel is returned |
| Runtime isolation | Run the probes below as the actual application runtime identity against Platform, ERP A/B, and Studio A/B | Tenant A's ERP/Studio identities must access only their corresponding DBs. Independently prove the shared `aierp_data_runtime` connection template is absent or denied in all tenant DBs; do not infer its grants from tenant-specific login probes. |
| Per-target migration preflight | Export exact `__EFMigrationsHistory` arrays for Platform, A, B, and AIStudio separately; run `Test-MigrationReleaseReadiness.ps1` once per target-history file against the reviewed bundle | Every ID is a known ordered prefix, context/database mapping and checksums pass; pending IDs are explicit for that target |
| Per-target backup | Before any rehearsal/apply, take a distinct checksum backup for each target; run `RESTORE VERIFYONLY WITH CHECKSUM` and restore to uniquely named scratch DBs | Each source, backup filename, SHA-256, verification result, and restore target are recorded; no script runs migration against the source |
| Migration rehearsal | Apply the exact per-context incremental to restored scratch copies only; verify history, `DBCC CHECKDB`, and synthetic row counts | All checks pass on each restored copy; retain logs and backup hashes for owner review |

Newly provisioned ERP tenant SQL logins now encode the tenant boundary, and the negative SQL connection checks passed for two synthetic tenants. Do not extend this result to existing production tenants or claim HTTP cross-tenant acceptance: those require separate live-safe evidence and DBA review. SQL sysadmin/provisioning credentials and host administrators remain privileged boundaries.

## Operator commands (disposable host only)

Use the exact approved bundle path and an exported target-history JSON produced from direct SQL queries. The history export must contain all three context keys (`PlatformDbContext`, `TenantDbContext`, `AIStudioDbContext`); the TenantDbContext list must come from the specific tenant database being checked. Do not reuse one tenant's history export for another.

```powershell
# Offline/static checks; these commands do not connect to SQL Server.
pwsh -NoProfile -File tests/deployment/Test-MigrationReleaseReadiness.ps1 `
  -BundlePath artifacts/migrations/<reviewed-bundle> `
  -TargetHistoryPath <A-history.json>
pwsh -NoProfile -File tests/deployment/Test-MigrationReleaseReadiness.ps1 `
  -BundlePath artifacts/migrations/<reviewed-bundle> `
  -TargetHistoryPath <B-history.json>
```

For each disposable source database, use an administrator session to create a distinct backup file on the SQL Server backup volume, then verify it:

```sql
BACKUP DATABASE [AIERPTenant_<tenant-guid>]
TO DISK = N'<unique-disposable-backup-path>.bak'
WITH COPY_ONLY, CHECKSUM, COMPRESSION, INIT;
RESTORE VERIFYONLY
FROM DISK = N'<unique-disposable-backup-path>.bak'
WITH CHECKSUM;
```

Calculate and record SHA-256 outside SQL Server after copying the backup to the controlled evidence location. Restore each backup under a unique scratch name and apply only the reviewed Tenant incremental to that restored copy. These backup/migration rehearsals must use an explicitly disposable SQL target; the remote acceptance Compose stack is not the target for persistent backup or migration work. Do not invoke `Enable-TenantDatabaseSeparation.ps1 -Apply` for this acceptance: that script is a shared-to-separated cutover workflow and can change persistent state.

For runtime identity probes, retrieve the tenant's **temporary acceptance** credential from the Vault reader and connect separately to its own, unrelated, and Platform databases. Never copy credentials into the evidence record. Example read-only probe for an authorized own-database connection:

```sql
SELECT DB_NAME() AS CurrentDatabase, SUSER_SNAME() AS LoginName, USER_NAME() AS DatabaseUser;
SELECT HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'SELECT') AS CanSelect,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS CanInsert,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS HasControl;
```

Also query `sys.database_principals` / `sys.database_role_members` as DBA to verify each tenant login is absent from Platform and unrelated tenant DBs and is not `db_owner`, `db_securityadmin`, or `db_ddladmin` in its own DB. A login connection attempt is a stronger proof than `HAS_PERMS_BY_NAME` for databases where the login is not mapped: capture that it fails for Platform and the unrelated tenant. Do not grant the tenant login access merely to run a negative probe.

## Rollout gate and ownership

Before any persistent-target rollout, the release owner must pin the exact reviewed package/hash and name each intended target. The application/database owner must first resolve the shared-runtime-login design gap and provide code/configuration plus disposable SQL evidence for tenant-specific SQL authorization. Then the DBA must export current history independently for Platform, AIStudio, and every tenant database; verify target identity and backup destination; create and checksum a fresh backup for each database; restore/rehearse each backup in isolation; compare schema/data expectations; and return migration IDs, backup hashes, restore/DBCC results, and runtime-principal checks. The application owner must then approve per-target pending migrations and a maintenance/rollback window. No production migration proceeds until those owner/DBA records exist and the target has been explicitly identified.
