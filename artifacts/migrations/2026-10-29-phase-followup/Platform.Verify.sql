SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=N'20261029135328_AddCreditFacilitySecurities') THROW 51200, 'Platform credit security migration missing.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=N'20261029184008_AddOrganizationalDefinitionsPermission') THROW 51201, 'Organizational definitions permission migration missing.', 1;
IF OBJECT_ID(N'dbo.CreditFacilitySecurities', N'U') IS NULL THROW 51202, 'Platform credit securities table missing.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.PermissionDefinitions WHERE ResourceType=N'erp.organizational-definitions' AND Action=N'read') THROW 51203, 'Organizational definitions read permission missing.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.PermissionDefinitions WHERE ResourceType=N'erp.organizational-definitions' AND Action=N'create') THROW 51204, 'Organizational definitions create permission missing.', 1;
SELECT DB_NAME() AS DatabaseName, COUNT(*) AS MigrationCount, MAX(MigrationId) AS LatestMigration FROM dbo.__EFMigrationsHistory;
