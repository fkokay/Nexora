# Current EF Core migration scripts

These scripts were regenerated from the current source on 2026-10-19 using EF Core tools 10.0.13 and `dotnet ef migrations script --idempotent --no-build`. They have **not** been applied to any database. The preceding `2026-10-18` package remains preserved as historical evidence and does not include the later Oct 18 Platform and Tenant migrations.

| Context | Migration count | Intended database topology |
|---|---:|---|
| `PlatformDbContext` | 106 | Shared `AIERPPlatform` database when separation is disabled. |
| `TenantDbContext` | 22 | Each provisioned `AIERPTenant_<tenant-guid>` database when separation is enabled. |
| `AIStudioDbContext` | 10 | `AIERPStudio` when separation is enabled. |

Use only the script matching the target database and configured topology. Do not apply Tenant or AIStudio scripts to the shared Platform database. In separated topology, apply Platform to the platform database, Tenant to each provisioned tenant database, and AIStudio to the Studio database. Verify server, database identity, current EF migration history, and separation configuration before execution.

Before any target execution, review the SQL for destructive or long-running DDL, take a full checksum-protected backup to a separate destination, verify it with `RESTORE VERIFYONLY WITH CHECKSUM`, confirm a tested restore path and maintenance/rollback plan, then execute through the approved DBA process. Idempotence uses EF migration history; it does not prove data compatibility, deployment order safety, SQL Server parser acceptance, or recoverability. Keep application migrations disabled on startup for controlled production rollout. Prefer expand/migrate/contract for changes that must work across the rollback window. Application rollback does not reverse committed schema changes; use a compatible forward repair or a separately approved restore with an explicit write-loss decision.

The scripts were generated from source and checked for unique migration history IDs and file hashes. SQL execution, target schema state, data preservation, and host-specific permissions were not verified. Checksums are in `SHA256SUMS.txt`; the manifest records the exact latest migration for each context.
