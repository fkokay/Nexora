SET NOCOUNT ON;
SELECT DB_NAME() AS db, COUNT(*) AS migrations, MAX(MigrationId) AS last_migration FROM __EFMigrationsHistory;
SELECT COUNT(*) AS agenda_permission_definitions FROM PermissionDefinitions WHERE ResourceType = 'erp.agenda';
SELECT COUNT(*) AS agenda_rules, COUNT(DISTINCT TenantId) AS tenants_with_rules FROM TenantPermissionRules WHERE PermissionCode LIKE 'erp.agenda.%';
DBCC CHECKDB WITH PHYSICAL_ONLY, NO_INFOMSGS;
SELECT 'checkdb-done' AS status;
