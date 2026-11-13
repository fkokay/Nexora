SET NOCOUNT ON;
SELECT DB_NAME() AS db, COUNT(*) AS migrations, MAX(MigrationId) AS last_migration FROM __EFMigrationsHistory;
SELECT Code AS permission FROM PermissionDefinitions WHERE ResourceType = 'erp.sales-requests' ORDER BY Code;
SELECT COUNT(*) AS sales_request_rules FROM TenantPermissionRules WHERE PermissionCode LIKE 'erp.sales-requests.%';
SELECT t.name AS tbl, COUNT(c.column_id) AS columns FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id WHERE t.name IN ('SalesRequests', 'SalesRequestLines') GROUP BY t.name;
SELECT COUNT(*) AS quote_source_column FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesQuotes') AND name = 'SourceSalesRequestId';
DBCC CHECKDB WITH PHYSICAL_ONLY, NO_INFOMSGS;
SELECT 'checkdb-done' AS status;
