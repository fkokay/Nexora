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

The scripts contain no tenant business data updates and are safe to re-run by EF migration ID, but they are not a substitute for a backup or target identity verification. This bundle is prepared only; no live SQL changes were made during this continuation.
