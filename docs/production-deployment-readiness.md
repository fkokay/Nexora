# Production deployment and recovery readiness

## Legacy shared database cutover

The application runtime no longer supports shared company data. A legacy deployment must be migrated during an approved maintenance window before installing this release. Changing `Database__SeparationEnabled` is only configuration; it does not move records. After isolated database copies are verified, a separate operator-only purge is required before cutover is complete. Preserve a checksum-verified full backup as an offline recovery artifact; the active `AIERPPlatform` database must contain platform metadata but no active tenant operational rows.

1. Rehearse from a restored copy of the latest full `AIERPPlatform` backup. Confirm every tenant row and company-owned record can be associated with exactly one tenant; resolve orphaned or ambiguous records before cutover.
2. Stop all Platform API, AI Service and other application writers. Create a checksum full backup of PlatformDB and verify it with `RESTORE VERIFYONLY WITH CHECKSUM`; set `Database:SeparationBackupPath` to that exact file.
3. Run the current API migration/provisioning binary once with `Database:SeparationEnabled=true`, Platform/Tenant/AIStudio connection strings and the verified backup path using `--migrate-only`. It applies the context migrations, provisions `AIERPTenant_<tenant-guid>` databases, copies matching tenant rows with IDs preserved, provisions `AIERPStudio`, and marks entries Ready only after row-count/FK verification.
4. Run `--verify-separation`; review Ready status, exact database names, copied row counts, and trusted foreign keys.
5. While writers remain stopped, take a new checksum full backup of the now-migrated Platform database, verify it with `RESTORE VERIFYONLY WITH CHECKSUM`, and configure `Database:SeparationBackupPath` to this exact backup. Run `--legacy-tenant-data-purge-preview`; inspect only the table and row counts it reports. Resolve any unregistered tenant rows before continuing.
6. After reviewing the preview and confirming the recovery backup, run `--purge-legacy-tenant-data --confirm-legacy-tenant-data-purge=I_HAVE_VERIFIED_BACKUP_AND_COPIES`. The command rechecks every registered tenant’s canonical Ready database, AIERPStudio readiness, exact source/destination row values (bidirectional comparison over every comparable non-computed, non-rowversion column), and the fresh backup before it starts. It holds source and destination table locks from comparison through purge, then transactionally deletes only rows from tenant-scoped operational tables mapped by `TenantDbContext`, preserves Platform tenant/user/membership/catalog metadata, checks constraints, and refuses to commit unless those operational tables are empty. AuditEvents deletion is enabled only inside the purge transaction through the same SQL session-context gate used by audit retention. Start the new API and AI Service only after the purge succeeds.

On any failure, keep writers stopped. The purge transaction rolls back as one unit; repair the topology or copy mismatch and retry only from a new verified backup. The backup intentionally retains the pre-purge operational rows as an offline recovery artifact. Do not re-enable shared runtime or treat the backup as an active company database.

For local Docker, `deploy/docker/Enable-TenantDatabaseSeparation.ps1 -Apply -PurgeLegacyTenantData` automates this sequence. Without `-PurgeLegacyTenantData`, it leaves the API and AI Service stopped and the cutover incomplete for operator review. IIS and Linux installations must use the same reviewed one-off migration and purge commands before their install/switch; their installers intentionally do not migrate or purge data. This operation was not run against a live database as part of this source change.

## Deployment paths

Nexora has two different production deployment paths:

- The managed production Compose release deployer builds a versioned Compose package, takes and verifies the complete database backup set, runs its one-shot migrator, then starts the application. Restore now requires the selected backup to contain exactly the current database-name set and rechecks that set after application writers stop. If migration may have started, it blocks automatic restart of the previous application because connectivity health does not prove schema compatibility. Its explicit restore operation is destructive to writes after the selected recovery point.
- The standalone [Linux bundle](../deploy/linux/README.md) and [IIS bundle](../deploy/iis/README.md) host Platform API, AI Service and frontends while connecting to an external SQL Server. They do not install SQL Server or run production migrations during install/switch. The database change is a separately reviewed operation using only the script for the configured topology.

Do not transfer the managed Compose migrator's behavior or its local restore evidence to IIS/Linux deployments. Keep startup migrations disabled on production hosts. Application rollback only changes the application version; it does not reverse schema changes.

## Package and schema evidence

The newest local IIS/Linux package artifacts available are version `20261022-source-r1`, under `artifacts/deployment-source-20261022-r1/`. The IIS manifest integrity check passed with 206 entries and the Linux archive sidecar SHA-256 matched. A fresh cross-package validation on 2026-10-23 failed: the Linux `config/platform-api.env.example` in the archive omits `ConnectionStrings__AIStudio`, which the current source validator requires. Treat this package as NO-GO for staging until both bundles are rebuilt from an approved clean commit (or receive approved provenance) and the same validator passes. The previous report that recorded 196 extracted Linux release files and passing installer/config smoke is historical and does not override this failure. These packages were assembled from a dirty Windows checkout using Git Bash, so their base Git revision does not identify the complete source. The Linux package is framework-dependent. No Windows IIS or Linux host installation/runtime validation was performed, and no deployment occurred. Older `local-preflight-20261022-r2`, IIS v24 and Linux v16 packages are historical snapshots.

The latest source-generated migration package is `artifacts/migrations/2026-10-23-r4/`: 136 Platform, 48 Tenant and 11 AIStudio migrations. Its manifest is `generated-not-applied`; Platform and Tenant scripts were regenerated after correcting context ownership, and independent static review confirmed that platform session/provisioning tables are confined to Platform while purchase delivery and invoice draft tables are confined to Tenant. Package checksums and manifest hashes match. During earlier source verification, `dotnet ef migrations list` was run once and may have read `__EFMigrationsHistory`; its reported all-Pending Platform result is not target-history evidence. No writes or migrations were applied, and r4 has not been rehearsed. Its incrementals use the last documented r3 prefixes and contain 12 Platform, 4 Tenant and 1 AIStudio migrations beyond those prefixes. The last locally applied and verified package remains `artifacts/migrations/2026-10-22-r3/` at its documented histories 124/44/10. The r3 baseline does not establish current local or production database history. Resolve the candidate’s migration-history evidence gap with an authoritative target-history export, then review and rehearse r4 against an isolated verified restore before release. Production remains unchanged; production-target staging rehearsal is required.

Before applying a script on a real database:

1. Confirm the server and database names, mandatory isolation setting (`true`), every tenant catalog/database pair, and separate migration histories with the database owner.
2. Select Platform for `AIERPPlatform`, Tenant for every `AIERPTenant_<tenant-guid>` database, and AIStudio for `AIERPStudio`. This release requires isolated databases; never apply Tenant or AIStudio scripts to the shared Platform source database.
3. Review generated SQL for destructive, blocking or data-conversion operations. Validate it against the target SQL Server version and a recent isolated copy of the target data.
4. Take checksum-protected backups for the full affected database set, copy them to an independent destination and verify them with `RESTORE VERIFYONLY WITH CHECKSUM`. Record backup IDs, file hashes and the restore owner.
5. Apply in an approved maintenance window using the DBA's controlled process. Check migration history, application readiness and representative data before switching traffic. Retain the prior application package and verified backups through the rollback window.

For changes that must support both old and new application versions, use expand/migrate/contract. Add compatible schema first; deploy code that supports both representations; backfill in bounded restartable batches; validate; switch reads/writes; remove old schema only in a later release after the rollback window closes. If a migration may have committed and the prior version is incompatible, prefer a reviewed forward fix. Restore only after an incident owner records the recovery point and explicitly accepts the lost-write interval.

## Real-host installation gate

Before customer production, rehearse each intended deployment path on its own staging host using the customer-equivalent OS, SQL Server version, topology and secret delivery process. Confirm:

- DNS, trusted TLS certificate, ingress/reverse proxy rules, firewall and browser/API origins for ERP and Studio.
- .NET 10 Hosting Bundle on IIS or .NET 10 ASP.NET Core Runtime, nginx and systemd on Linux; URL Rewrite/ARR and IIS app pool startup on Windows.
- Protected secrets, least-privilege SQL accounts, certificate validation, signing-key agreement between services, and all external support-service URLs required by enabled features.
- Upgrade from the prior release, failed health-check recovery, manual application rollback, backup verification and isolated database restore. Validate permissions for service identities, backup destinations, log paths and release directories.
- Schema compatibility on a copy of the real migration history and representative data, using the mandatory separated database topology. A legacy shared database may be rehearsed only as a migration source, not as a target runtime topology.

Successful local Compose health probes, SQL restore drills and offline bundle inspection are useful preflight evidence only. They do not establish customer credentials, Windows/Linux host behavior, production data compatibility, off-host backup retention, TLS/DNS, multi-node coordination or customer restore performance. Production release approval requires the host owner and DBA to attach their staging rehearsal, backup/restore evidence and go/no-go decision to the release record.

## Phases 7–9 external evidence checklist

Complete these checks in the customer-equivalent staging environment and attach the evidence to the release record. Mark a check complete only when the named owner has run it against the intended topology; local fixtures and Compose drills do not satisfy these gates.

### Release and database operations

- [ ] Release owner records the package ID, version, commit SHA, checksum, target environment and expected active deployment ID; a second operator reviews the promotion.
- [ ] Host owner runs the Linux or IIS bundle on the actual supported OS and records upgrade, health-failure recovery, manual application rollback, service-account permissions and log/release-directory behavior.
- [ ] DBA confirms database topology and migration history, reviews generated SQL, and rehearses it on a recent isolated copy using the target SQL Server version and representative data.
- [ ] DBA records checksummed backups for every affected database, verifies an independent off-host copy, then times an isolated restore and validates DBCC plus representative application reads.
- [ ] Operations owner verifies monitoring/alert delivery, maintenance-window ownership, incident escalation and the manual decision path when a migration may have changed schema.
- [ ] For more than one deployer node, operations verifies shared-lock correctness and fencing during concurrent promotion and node failure; single-node local tests do not prove this.

### Extensions and payment providers

- [ ] Marketplace owner verifies publisher identity/trust roots, signing-key rotation/revocation handling, entitlement changes and audit events using the production-equivalent catalog configuration.
- [ ] Host owner verifies tenant secret mount permissions, backup/rotation procedure and that secrets are absent from logs, metrics, package artifacts and support bundles.
- [ ] Integration owner runs Stripe test-mode and PayPal sandbox transactions with approved test accounts; verifies configured endpoint allowlists, idempotent retries, timeout behavior, response mapping and provider error handling. PayPal order approval/capture remains a separate explicitly authorized business flow.
- [ ] Provider owner confirms the exact live endpoint/API version and required credentials before enabling live traffic, then runs the vendor's approved non-destructive verification and records the resulting request IDs without storing credentials or payment data.

### Enterprise security and capacity

- [ ] Security owner completes an authenticated penetration test of the deployed API, Studio, Marketplace and integration execution boundary, including tenant isolation, role/permission escalation, SSRF/redirect controls, package/signature handling and secret exposure; attach findings and remediation disposition.
- [ ] Operations owner provisions representative seeded test tenants, verifies dataset preflight counts, then runs the approved read-only load profile at target concurrency and records latency, errors, resource use and database saturation. Do not run it against customer data without a separately approved plan.
- [ ] Platform owner rehearses the intended high-availability/failover path, including SQL recovery, deployer coordination, traffic health checks and recovery-time objectives; local single-node restore evidence is insufficient.
- [ ] Security owner checks the exact release commit against the required hosted code-scanning gate and records remaining default-branch or image findings with an owner and disposition.
