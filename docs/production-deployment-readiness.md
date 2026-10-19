# Production deployment and recovery readiness

## Deployment paths

Nexora has two different production deployment paths:

- The managed production Compose release deployer builds a versioned Compose package, takes and verifies the complete database backup set, runs its one-shot migrator, then starts the application. If migration may have started, it blocks automatic restart of the previous application because connectivity health does not prove schema compatibility. Its explicit restore operation is destructive to writes after the selected recovery point.
- The standalone [Linux bundle](../deploy/linux/README.md) and [IIS bundle](../deploy/iis/README.md) host Platform API, AI Service and frontends while connecting to an external SQL Server. They do not install SQL Server or run production migrations during install/switch. The database change is a separately reviewed operation using only the script for the configured topology.

Do not transfer the managed Compose migrator's behavior or its local restore evidence to IIS/Linux deployments. Keep startup migrations disabled on production hosts. Application rollback only changes the application version; it does not reverse schema changes.

## Package and schema evidence

The latest offline bundle validation (`docs/deployment-bundle-validation-20261019-audit-followup.json`) passed against `artifacts/linux/local-20261019-audit-followup/aierp-linux-local-20261019-audit-followup.tar.gz` and `artifacts/iis/local-20261019-audit-followup/`. It checked bundle metadata and component coverage, Linux archive and release SHA-256 checksums, environment templates, route configuration, systemd hardening and deployment script syntax. It did not install either bundle on a Linux or Windows Server host.

Current source migrations are in `artifacts/migrations/2026-10-19/`: 106 Platform, 22 Tenant and 10 AIStudio migration IDs. The generated SQL scripts remain unapplied to a production database; the local separated Compose databases have applied those current histories. Production application still requires the target DBA's reviewed staging rehearsal. The older `artifacts/migrations/2026-10-18/` scripts are stale; do not use them for a release against current source. `manifest.json` and `SHA256SUMS.txt` identify the current scripts and latest migration IDs.

Before applying a script on a real database:

1. Confirm the server, database name, separation flag, per-tenant database list and migration history with the database owner.
2. Select Platform for `AIERPPlatform`; select Tenant for every provisioned tenant database only when separation is enabled; select AIStudio for `AIERPStudio` only when separation is enabled. Never apply Tenant or AIStudio scripts to the shared Platform database.
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
- Schema compatibility on a copy of the real migration history and representative data, including the configured shared or separated database topology.

Successful local Compose health probes, SQL restore drills and offline bundle inspection are useful preflight evidence only. They do not establish customer credentials, Windows/Linux host behavior, production data compatibility, off-host backup retention, TLS/DNS, multi-node coordination or customer restore performance. Production release approval requires the host owner and DBA to attach their staging rehearsal, backup/restore evidence and go/no-go decision to the release record.
