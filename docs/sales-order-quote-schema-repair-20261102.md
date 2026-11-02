# Standalone sales order schema repair — 2026-11-02

The reported persistence failure was SQL Server error 515: `SalesOrders.QuoteId`
was NOT NULL in `AIERPTenant_207af7e7d83f41c288d7cba5856f1109` although the API
and model support standalone orders. Its unique tenant/quote index was unfiltered.

A COPY_ONLY, CHECKSUM backup was created and passed RESTORE VERIFYONLY WITH CHECKSUM:
`/var/opt/mssql/backups/sales-order-quote-fix-375845C8-FA15-4105-87AA-D167CE08D566.bak`.

A transaction changed only QuoteId nullability and recreated the unique index with
`WHERE QuoteId IS NOT NULL`. The first attempt failed because sqlcmd had
QUOTED_IDENTIFIER off; that transaction rolled back. The retry with the required
filtered-index SET options succeeded. No migration history rows were fabricated.

Verification read back nullable=1 and the filtered unique index. A separate
transaction successfully inserted two standalone order headers copied from an
existing order, using new IDs/codes and null QuoteId, then rolled back both rows.
This verifies the reported database constraint; it is not an end-to-end UI test.

The idempotent EnsureStandaloneSalesOrders tenant migration preserves the repair
in the normal migration path. Other pending tenant migrations were not applied
by this targeted repair. The frontend trace-message deduplication is a local
source change and requires a separate frontend deployment.
