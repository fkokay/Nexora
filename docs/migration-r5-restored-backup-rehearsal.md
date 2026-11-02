# r5 rehearsal on restored local database backups

Date: 2026-10-24  
Engine: local Docker SQL Server 2022  
Result: **passed for current local Platform, Tenant, and AIStudio backups**

## Verified backups

The current local Platform, selected Tenant, and AIStudio databases were backed up using `COPY_ONLY`, `CHECKSUM`, and `COMPRESSION`. SQL Server `RESTORE VERIFYONLY WITH CHECKSUM` passed for each, and the backup files remain in the Docker `aierp-production-backups` volume.

| Database | Backup file | SHA-256 |
|---|---|---|
| Platform | `phasecompletion_AIERPPlatform_20261024.bak` | `01a3ee98d617959feb6394d5a224af25a7b531e73b0db934a46c03a2c0d8a83b` |
| Tenant | `phasecompletion_AIERPTenant_20261024.bak` | `145de3cb7a056b2939e36ecff11b7f068d5b2a0c99ca6a39b8005d19e49e83ac` |
| AIStudio | `phasecompletion_AIERPStudio_20261024.bak` | `ce9b33666083ca86ddc066bdf6d5f78a459332d904b89458d81a305cd638a877` |

## Procedure and result

Direct SQL queries exported the live histories as Platform 124, Tenant 44, and AIStudio 10. Exact target-history preflight passed against `artifacts/migrations/2026-10-24-r5/`: the package contains 136/49/11 migrations, with 12/5/1 pending. `dotnet build` of `AIERP.Platform.Infrastructure` passed with zero warnings/errors, and `dotnet ef migrations has-pending-model-changes` reported no model drift for Platform, Tenant, or AIStudio.

The exact r5 Tenant incremental was applied to a restore of the current Tenant backup. Platform and AIStudio scripts are byte-identical to the r4 scripts and were applied to restores of the current Platform and AIStudio backups in the preceding r4 rehearsal; their r5 package hashes match those verified scripts. All three restored histories advanced to their package latest IDs. `DBCC CHECKDB WITH NO_INFOMSGS` passed for each. For Tenant, every existing table's row count matched its source; the direct-cash-budget tables were created empty. Platform row-count differences were limited to the documented additive permission definitions and two sales-promotion read/update role rules. AIStudio had no data-row changes beyond migration history.

## Local development application

After the restore rehearsals, fresh checksum-verified backups of the three live local databases were retained in the Docker backup volume. The exact incremental scripts were applied to the local Compose targets using `sqlcmd -I -b`; the API, AI Service, and Integration Host were stopped during the schema change. Direct SQL verification then showed Platform 136/136, the selected provisioned Tenant 49/49, and AIStudio 11/11, with the expected latest migration IDs. `DBCC CHECKDB WITH NO_INFOMSGS` passed on all three live databases. The new direct-cash-budget and platform administration tables are empty. Post-apply history export is `artifacts/migrations/2026-10-24-r5/target-history-after-local-apply-20261024.json`, and release readiness preflight passed with zero pending migrations for all three contexts. No production database was accessed or changed.

All three uniquely named scratch restores were dropped after verification. No live database migration or production operation was performed. No original or new backup was deleted.

## Limits

This proves the r5 scripts against one current local backup per context and their application to one live local development target per context, including one provisioned Tenant database. It does not prove compatibility with every firm database or establish production compatibility/approval. Production remains unchanged.
