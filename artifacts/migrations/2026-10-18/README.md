# Generated EF Core migration scripts

These scripts were generated from the current source with EF Core tools 10.0.13 and `--idempotent`. They have **not** been applied to any database.

| Context | Migration count | Intended database topology |
|---|---:|---|
| `PlatformDbContext` | 104 | Shared local Compose database `AIERPPlatform`; the shared context owns the combined Platform, ERP and Studio schema. |
| `TenantDbContext` | 21 | Per-tenant database only when database separation is enabled and provisioned. |
| `AIStudioDbContext` | 10 | `AIERPStudio` only when database separation is enabled and provisioned. |

Do not apply the Tenant or AIStudio scripts to the shared `AIERPPlatform` database. For any target, first verify its identity and migration history, create and verify a full database backup on a separate destination with enough free space, then apply only the script matching that target. These scripts are idempotent by EF migration history; that does not replace a verified backup or review of destructive DDL.

The local Docker Engine and its SQL target were unavailable during generation. SQL Server execution, SQL parser acceptance against the target version, resulting schema, and data compatibility therefore remain unverified. SHA-256 checksums and source migration counts are recorded in `manifest.json` and `SHA256SUMS.txt`.
