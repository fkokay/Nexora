SET NOCOUNT ON;
IF DB_NAME() IS NULL THROW 51000, 'Connect to the intended Platform database first.', 1;
IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NULL THROW 51001, 'Platform EF migration history is missing.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=N'20261029100432_AddAttendanceApprovalV2') THROW 51002, 'Platform migration baseline mismatch.', 1;
IF EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=N'20261029184008_AddOrganizationalDefinitionsPermission') THROW 51003, 'Platform target migration is already applied; verify instead.', 1;
IF OBJECT_ID(N'dbo.PermissionDefinitions', N'U') IS NULL THROW 51004, 'PermissionDefinitions table is missing.', 1;
SELECT DB_NAME() AS DatabaseName, COUNT(*) AS MigrationCount, MAX(MigrationId) AS LatestMigration FROM dbo.__EFMigrationsHistory;
