# Production release migrations

## Current deployment behavior

For an upgrade from an existing production release, the deployer first stops `platform-api`, `ai-service` and `platform-migrator`. It enumerates the AIERP databases, creates a SQL Server `WITH CHECKSUM` backup for each, verifies each with `RESTORE VERIFYONLY`, and stores a database-set manifest. It refuses to start the new Compose release when it cannot create and verify the complete set. The one-shot `platform-migrator` runs before `platform-api` is allowed to start.

Before Compose is invoked, the deployer persists `may_have_run` and `pending_operator_review` in `migration-rollback.json`. An interrupted or failed deployment after that marker is treated as potentially migrated: automatic restart of the old app is blocked because the health probe only establishes connectivity, not schema compatibility. No database restore is attempted by the failed-deployment path. A failed initial deployment also keeps its SQL named volume.

The authenticated production restore endpoint requires the `release.production.restore` scope and concurrency metadata for the active release. It verifies the requested backup set and target package, takes and verifies a safety backup of the current database set, stops application services, restores every database in the selected set, starts the selected prior package and waits for health. If recovery fails after stopping the app, it attempts to restore the safety backup and restart the current package. Treat this operation as destructive: writes made after the chosen backup are replaced by that backup. Require an incident owner, a recorded recovery point and an explicit restore decision before invoking it.

## Schema evolution policy

Use an expand/migrate/contract sequence for changes that must support both the currently active and next application versions:

1. **Expand:** add nullable columns, tables, indexes or compatible APIs. Do not rename or remove objects used by the old version in this release.
2. **Deploy and backfill:** deploy code that can read old and new representations; backfill in bounded, restartable batches and record progress. Keep writes compatible with both versions while the transition is active.
3. **Switch reads and writes:** after data validation, make the new representation authoritative. Retain the old representation for at least the rollback window.
4. **Contract later:** remove legacy columns or constraints only in a later release after the rollback window closes and usage checks confirm no old application depends on them.

If a migration is not backward compatible or a safe forward fix is not available, stop automatic rollback. Assess the migration history and application state. Prefer a reviewed forward repair when it preserves accepted writes. Use the production restore endpoint only when the business owner accepts losing writes after that backup and the selected package has been verified against that database snapshot. Record the request/approval, deployment and backup IDs, package digest, pre- and post-restore health, and any lost-write interval in the incident record. Do not infer compatibility from a green connectivity health check.

## Operator recovery procedure

1. Freeze further releases and record the failed deployment ID, `migration-rollback.json`, active deployment pointer and service logs. Preserve the current databases before manual intervention.
2. Determine whether the migrator started and which migration IDs committed in Platform, Tenant and AIStudio databases. Compare those histories with the failed package and candidate prior package; establish whether a forward fix or a restore is appropriate.
3. Confirm the matching database-set manifest and backup files exist. Verify every database backup with SQL Server `RESTORE VERIFYONLY WITH CHECKSUM`. For a recovery drill, restore into isolated temporary database names and run `DBCC CHECKDB`; never overwrite live databases during the drill.
4. For a forward repair, prepare and review a new package whose migration is safe against the observed partial/current schema. Keep the existing verified backup set until the release and data checks pass.
5. For a point-in-time release restore, obtain explicit business-owner approval for the data-loss window, verify the prior package digest and backup deployment ID, then call the authenticated restore operation using the current expected-active deployment ID and a unique operation/idempotency ID. Confirm all restored databases and the selected app are healthy, then reconcile the active pointer and migration record.
6. If the restore endpoint cannot complete or its recovery attempt fails, keep releases frozen, retain both the original recovery backup and pre-restore safety backup, and escalate for SQL-level recovery. Do not delete volumes or backup files while investigating.

## Verification and evidence

The current source migrations were regenerated as idempotent, **unapplied** SQL in `artifacts/migrations/2026-10-19/`. They contain 106 Platform, 22 Tenant and 10 AIStudio migrations. The earlier `artifacts/migrations/2026-10-18/` package is retained as historical evidence and is stale for current source: it predates the Oct 18 Platform CRM permission and Tenant quantity precision migrations. Use the current package only after database identity, topology, migration history, SQL review and verified-backup checks.

The local separated-database restore drill verifies checksum-protected Platform, Tenant and AIStudio backups by restoring to temporary databases, running `DBCC CHECKDB` and comparing user-table counts; its report is `docs/separated-recovery-drill.json`. The local graceful SQL restart drill verifies three separated databases and the Compose services recover without running migrations; see `docs/sql-restart-recovery-drill.json`. The offline deployment bundle check passed for the available Linux archive and IIS bundle, including archive/file hashes, package manifests, routing configuration, environment templates and script syntax. The local Compose API, AI Service and SQL Server health probes also returned ready during this review. These are local recovery and packaging checks, not production-target migration, Windows IIS/Linux host behavior, data compatibility or full release failure-injection evidence.

The release deployer unit tests cover migration-aware restart policy and rollback-state serialization. A local SQL restore failure drill is recorded in `docs/local-release-failure-drill.json`; it does not exercise the authenticated production Compose deploy/restore endpoints end to end. Failure injection for production Compose orchestration, including partial migration and failed restore recovery, remains outstanding. Production-target operations, IIS/Linux staging installation, and hosted/multi-node deployment have not been verified.

## Local Compose limits

Docker Engine and Compose are available in this workspace. The local SQL Server, separated-database backups, migration application and recovery drills have been exercised; the local ERP, Studio and API health endpoints were also verified. This environment is not connected to a production host. Local results do not establish production credentials, external secret management, hosted/multi-node coordination, production data compatibility or production-target restore behavior. Run destructive restore and failure-injection scenarios only against isolated disposable data unless an approved production recovery is explicitly underway.
