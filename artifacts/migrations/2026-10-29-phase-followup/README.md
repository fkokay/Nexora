# 2026-10-29 phase follow-up migration bundle

This bundle contains idempotent incremental EF SQL scripts for the remote development Platform database and the active development tenant. It was generated from the repository migrations and the known remote migration baselines.

## Included changes

- Platform: credit facility securities plus `erp.organizational-definitions` permission definitions.
- Tenant: credit facility securities table, checks, indexes, and tenant-scoped FK.

## Apply order

1. Back up both target databases.
2. Connect to the intended Platform database and run `Platform.Preflight.sql`. Check the reported database name and migration baseline.
3. Apply `Platform.Incremental.sql`, then run `Platform.Verify.sql`.
4. Connect to the intended development tenant database and run `Tenant.Preflight.sql`. Check the reported database name and migration baseline.
5. Apply `Tenant.Incremental.sql`, then run `Tenant.Verify.sql`.
6. Deploy the matching API image only after database verification; do not expose credentials or connection strings in logs.

The scripts contain no tenant business data updates and are safe to re-run by EF migration ID, but they are not a substitute for a backup or target identity verification.

## Remote development application record

Applied on 2026-10-29 after identifying the active `Nexora Demo` development tenant and checking both migration baselines:

- Platform database: `AIERPPlatform`; baseline `20261029100432_AddAttendanceApprovalV2`; target `20261029184008_AddOrganizationalDefinitionsPermission` verified.
- Active tenant database: `AIERPTenant_207af7e7d83f41c288d7cba5856f1109`; baseline `20261029100426_AddAttendanceApprovalV2`; target `20261029134657_AddCreditFacilitySecurities` verified.
- COPY_ONLY, CHECKSUM backups were created under `/var/opt/mssql/backups/` as `AIERPPlatform-pre-20261029.bak` and `AIERPTenant_207af7e7d83f41c288d7cba5856f1109-pre-20261029.bak`; both passed `RESTORE VERIFYONLY WITH CHECKSUM`.
- Platform and tenant verification scripts succeeded after application.
- The matching Platform API image was built from clean pushed commit `c7e43bcc` through the `nexora-remote` Docker context and deployed using `up -d --no-deps platform-api`; no dependency or other service was recreated. The API container became healthy, and public ERP/Studio `/health` endpoints returned HTTP 200 with `platform-database-only` readiness.
- The checked-out local worktree contains unrelated user edits; none were included in the API build or deployment.
