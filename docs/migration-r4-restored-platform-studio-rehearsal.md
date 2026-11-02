# r4 rehearsal on restored local Platform and AIStudio backups

Date: 2026-10-24  
Engine: local Docker SQL Server 2022  
Result: **passed on current local Platform and AIStudio backups**

## Backup and isolation

Created `COPY_ONLY`, `CHECKSUM`, `COMPRESSION` backups from the current Compose databases:

| Database | Backup | SHA-256 |
|---|---|---|
| Platform | `phasecompletion_AIERPPlatform_20261024.bak` | `01a3ee98d617959feb6394d5a224af25a7b531e73b0db934a46c03a2c0d8a83b` |
| AIStudio | `phasecompletion_AIERPStudio_20261024.bak` | `ce9b33666083ca86ddc066bdf6d5f78a459332d904b89458d81a305cd638a877` |

SQL Server `RESTORE VERIFYONLY WITH CHECKSUM` passed for both files. The files remain in the Docker `aierp-production-backups` volume. Before the rehearsal, direct SQL queries confirmed current live histories of 124 Platform, 44 Tenant, and 10 AIStudio migrations. The backup restores were isolated as `NexoraR4PlatformRestore_20261024` and `NexoraR4StudioRestore_20261024`; no migration was applied to a live database.

## Procedure and result

Restored both backups, then applied the exact r4 `platform-incremental.sql` and `aistudio-incremental.sql` files using SQLCMD with `QUOTED_IDENTIFIER` enabled. Platform advanced to 136 migrations through `20261023240000_AddTenantProvisioningJobsAndPlatformAdminRefreshSessions`; AIStudio advanced to 11 through `20261023150000_AddStudioModuleSourceMappings`.

`DBCC CHECKDB WITH NO_INFOMSGS` passed for both restored databases. Comparing row counts for source and restored databases showed no differences in existing application tables other than expected additive permission data: Platform gained 56 permission definitions and two role-level `Allow` rules for `erp.sales-promotions.read` and `erp.sales-promotions.update`. The migrations created empty `PlatformAdminRefreshSessions`, `TenantProvisioningJobs`, `TenantCompanyProfiles`, and `StudioModuleSourceMappings` tables. All other pre-existing table row counts matched. The original Platform and AIStudio histories remained 124 and 10.

The uniquely named scratch databases were dropped after verification. The source databases and retained backups were not changed. A fresh live-history export passed `Test-MigrationReleaseReadiness.ps1`: exact prefix and checksum checks passed, with 12/4/1 pending Platform/Tenant/AIStudio migrations.

## Limits

This proves the r4 Platform and AIStudio incremental scripts against the current local backups, plus the prior documented Tenant restored-backup rehearsal. It does not apply r4 to the running development databases, rehearse every tenant backup, establish production compatibility, or constitute DBA approval. Production remains unchanged.
