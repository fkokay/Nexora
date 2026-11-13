SET NOCOUNT ON;
SELECT DB_NAME() AS db, COUNT(*) AS migrations, MAX(MigrationId) AS last_migration FROM __EFMigrationsHistory;
SELECT t.name AS tbl, COUNT(c.column_id) AS columns FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id WHERE t.name IN ('SalesRequests', 'SalesRequestLines') GROUP BY t.name;
SELECT OBJECT_NAME(object_id) AS tbl, name AS idx, is_unique FROM sys.indexes WHERE object_id IN (OBJECT_ID('dbo.SalesRequests'), OBJECT_ID('dbo.SalesRequestLines')) AND name IS NOT NULL ORDER BY 1, 2;
SELECT OBJECT_NAME(parent_object_id) AS tbl, name AS fk, is_disabled, is_not_trusted FROM sys.foreign_keys WHERE parent_object_id IN (OBJECT_ID('dbo.SalesRequests'), OBJECT_ID('dbo.SalesRequestLines')) OR name LIKE '%SalesQuotes%SalesRequest%' ORDER BY 1, 2;
SELECT COUNT(*) AS quote_source_column FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesQuotes') AND name = 'SourceSalesRequestId';
SELECT (SELECT COUNT(*) FROM dbo.SalesRequests) AS request_rows, (SELECT COUNT(*) FROM dbo.SalesQuotes) AS quote_rows;
DBCC CHECKDB WITH PHYSICAL_ONLY, NO_INFOMSGS;
SELECT 'checkdb-done' AS status;
