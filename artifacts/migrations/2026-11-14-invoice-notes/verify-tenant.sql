SET NOCOUNT ON;
SELECT DB_NAME() AS db, COUNT(*) AS migrations, MAX(MigrationId) AS last_migration FROM __EFMigrationsHistory;
SELECT c.name AS col, TYPE_NAME(c.user_type_id) AS type, c.max_length, c.is_nullable FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.SalesInvoices') AND c.name = 'Notes';
SELECT COUNT(*) AS invoice_rows FROM dbo.SalesInvoices;
DBCC CHECKDB WITH PHYSICAL_ONLY, NO_INFOMSGS;
SELECT 'checkdb-done' AS status;
