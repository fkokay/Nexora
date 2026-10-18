# Offline migration history preflight

`tests/deployment/Test-MigrationReleaseReadiness.ps1` checks the current migration package before a DBA schedules it. It verifies the manifest SHA-256 values, the exact context-to-database mapping, migration counts and latest IDs, then compares an operator-exported target `__EFMigrationsHistory` with the release sequence. Unknown/orphan IDs, duplicates, out-of-order histories, stale scripts and wrong topology fail closed.

This is a **history and artifact integrity check only**. It does not connect to SQL Server, inspect the target schema or data, prove lock duration, or establish old/new application compatibility. A passing result is not production approval. Schema/data compatibility still requires applying the exact release scripts to an isolated restore of representative target data, followed by application smoke/data checks and DBA review.

## Prepare target history

The DBA should query each database using the correct context and export the ordered `MigrationId` values. Put all three context keys in `target-history.json`; use an empty array where that context has no target database or no applied migrations. In separated topology, query Platform, every provisioned Tenant database and AIStudio separately, then run preflight for each tenant history file. In shared topology, Tenant and AIStudio should be empty and the Platform history must reflect the shared database's actual EF migration table. Do not combine histories from different databases.

Example shape:

```json
{
  "PlatformDbContext": ["20261014203054_InitialPlatformSchema"],
  "TenantDbContext": [],
  "AIStudioDbContext": []
}
```

Run from the repository root:

```powershell
./tests/deployment/Test-MigrationReleaseReadiness.ps1 `
  -BundlePath ./artifacts/migrations/2026-10-19 `
  -TargetHistoryPath ./path/to/target-history.json
```

The output reports pending migration counts. Preserve it with the release record. The checked-in empty-history fixture validates the package from a clean database; the orphan fixture intentionally models the known legacy Platform history ID and must fail pending DBA reconciliation. Never edit an exported target history to make a check pass.

The current known Platform legacy orphan (`20261015141145_AddGitHubProjectAuthorization`) is absent from current source/package history and is therefore rejected. Resolve its provenance and actual target occurrence with the DBA; do not silently remove the row or claim the current SQL artifact is safe for that target.
