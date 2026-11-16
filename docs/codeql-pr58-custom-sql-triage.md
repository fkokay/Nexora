# CodeQL triage — PR #58 custom SQL reports

Date: 2026-11-16 · Branch: `claude/salt-okunur-sql-raporlari`

## Alert #262 `cs/sql-injection` — `src/Hosts/AIERP.Api/CustomSqlReportRunner.cs` (`command.CommandText = sql`)

**Finding.** The SQL text of a `customSql` report, which arrives in the request body, is executed as `CommandText`.

**Assessment: intended behaviour (accepted risk), not an injection defect.**

Executing administrator-written SQL is the feature itself. It was designed in `docs/superpowers/specs/2026-11-16-salt-okunur-sql-raporlari-design.md` and the user approved it. There is no surrounding query that the input could escape from; the whole statement is the input.

The risk is bounded by layered controls rather than by parameterisation:

1. **Who can run it.**
   - Only `TenantAdmin` can execute it (`ReportEndpoints.RunAsync`/`ExportAsync`).
   - For multi-company runs, the caller must be `TenantAdmin` in **every** selected company (`CustomSqlReportRunner.AuthorizeCompaniesAsync`).
   - Authorization runs before any connection is opened.
   - Tests: `CustomSqlReportIntegrationTests`.
2. **Database principal.** The statement runs on a dedicated per-tenant login `aierp_tr_<tenant>`, opened through the fail-closed `TenantQueryConnectionFactory`.
   - The login is a member of `db_datareader` only. The grant script and provisioning `THROW` if it holds any other role or an explicit permission, and provisioning verifies this live.
   - Its default database is the tenant's own ERP database, and provisioning verifies that it cannot open other databases.
3. **Server-level hardening (DBA step in `docs/tenant-query-credentials.md`).** `DENY VIEW ANY DATABASE` and `DENY EXECUTE` on `xp_dirtree`, `xp_fileexist` and `xp_subdirs`.
4. **Early validator (`TryValidateReadOnlySql`).** Accepts a single `SELECT`/`WITH` only, and rejects:
   - DDL and DML, `EXEC`, `xp_` procedures, `INTO`, `OPENROWSET`, comments and multiple statements;
   - catalog and database-enumeration identifiers.

   The validator gives early feedback; the security boundary is items 2–3.
5. **Resource and abuse bounds.**
   - 30 s per statement and a 60 s total deadline.
   - At most 5,000 rows, 4,000 characters per cell and 10,000,000 characters per response; the command is cancelled when a cap is hit.
   - Execution is audited: the SQL length is logged, never the SQL text.

**Residual risk.** A `TenantAdmin` can read any table in their own tenant database, including data that application-level row-visibility rules would hide. This is accepted by design, because the user chose administrator-authored SQL. No cross-tenant read path exists, provided the provisioning and DBA steps are applied.

**Action.** Dismiss as "won't fix — used by design" with a comment pointing to this file. This needs repository-owner approval.

## Alert #261 `cs/cleartext-storage-of-sensitive-information` — `TenantDatabaseProvisioner.cs` (provisioning failure log)

**Finding.** The failure log for existing-tenant query-credential provisioning included the redacted exception message (`FormatSafeMigrationError`).

**Action: fixed.** The log now records only the tenant id, the exception type and the SQL error number. SQL login errors can echo credential material, so the message is no longer logged.
