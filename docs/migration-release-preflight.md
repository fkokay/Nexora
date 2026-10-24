# Offline migration history preflight

`tests/deployment/Test-MigrationReleaseReadiness.ps1` checks the current migration package before a DBA schedules it. It verifies the manifest SHA-256 values, the exact context-to-database mapping, migration counts and latest IDs, then compares an operator-exported target `__EFMigrationsHistory` with the release sequence. Unknown/orphan IDs, duplicates, out-of-order histories, stale scripts and wrong topology fail closed.

This is a **history and artifact integrity check only**. It does not connect to SQL Server, inspect the target schema or data, prove lock duration, or establish old/new application compatibility. A passing result is not production approval. Schema/data compatibility still requires applying the exact release scripts to an isolated restore of representative target data, followed by application smoke/data checks and DBA review.

## Prepare target history

The DBA should query each database using the correct context and export the ordered `MigrationId` values. Put all three context keys in `target-history.json`; use an empty array where that context has no target database or no applied migrations. The supported topology separates Platform, each provisioned Tenant database and AIStudio; query those databases separately, then run preflight for each tenant history file. Shared company-data databases are unsupported. Never combine histories from different databases.

Example shape:

```json
{
  "PlatformDbContext": ["20261014203054_InitialPlatformSchema"],
  "TenantDbContext": [],
  "AIStudioDbContext": []
}
```

Run from the repository root. The contract smoke test discovers the newest generated bundle manifest by `generatedAtUtc`; it no longer defaults to a historical 2026-10-19 snapshot. For an operator preflight, use the exact package selected for the release. **r3 is the last locally verified and applied package.** Current-source candidate `2026-10-23-r4` contains 136 Platform, 48 Tenant and 11 AIStudio migrations and is generated-not-applied. Its incrementals are based on the last documented r3 prefix, with 12/4/1 migrations respectively; obtain and validate authoritative target histories before use. During earlier source verification, a `dotnet ef migrations list` invocation may have read `__EFMigrationsHistory`; its all-Pending Platform result is not target-history evidence. No migrations were applied and r4 has not been rehearsed. A passing history preflight alone does not change that status.

```powershell
./tests/deployment/Test-MigrationReleaseReadiness.ps1 `
  -BundlePath ./artifacts/migrations/2026-10-23-r4 `
  -TargetHistoryPath ./path/to/target-history.json
```

This command checks target history against the generated current-source package. Do not apply this package to a shared or production database based only on this result; first rehearse the exact scripts on an isolated representative restore and record the schema, data, application-smoke and DBA outcomes.

The output reports pending migration counts. Preserve it with the release record. The checked-in empty-history fixture validates the package from a clean database; the legacy Platform history fixture confirms that the recovered no-op migration ID is recognized in sequence. Never edit an exported target history to make a check pass.

The former Platform orphan (`20261015141145_AddGitHubProjectAuthorization`) is recovered from Git history, restored as an empty no-op migration, and included in the regenerated current Platform bundle. The actual local Platform history now matches the bundle's first 108 migration IDs; its row was retained without modification.

Local separated-database inspection on 2026-10-20 confirmed the Platform orphan row is present with `ProductVersion` `10.0.13`: after the local saved-report revision migrations, Compose history is 109 Platform, 24 Tenant and 10 AIStudio migrations. The exact historical source and designer were recovered from Git commit `0b40fa9`; the migration's `Up` and `Down` methods are empty, so it changes no schema or data. The single-published-custom-form filtered unique index is present in both local PlatformDB and separated TenantDB, with zero duplicate groups before application and checksum-verified backups. The two saved-report revision migrations were also applied to those local databases after database identity, backup hash and checksum verification; their history IDs and expected schema were verified. The full Platform and Tenant idempotent scripts each ran twice on disposable SQL Server databases. The offline history preflight reports no pending migrations, and the bundle checksums match. This does not apply the bundle to production or prove compatibility with production data; that still requires the target DBA's isolated rehearsal.
