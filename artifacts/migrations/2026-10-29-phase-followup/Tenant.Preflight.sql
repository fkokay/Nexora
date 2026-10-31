SET NOCOUNT ON;
IF DB_NAME() IS NULL THROW 51100, 'Connect to the intended tenant database first.', 1;
IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NULL THROW 51101, 'Tenant EF migration history is missing.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=N'20261029100426_AddAttendanceApprovalV2') THROW 51102, 'Tenant migration baseline mismatch.', 1;
IF EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=N'20261029134657_AddCreditFacilitySecurities') THROW 51103, 'Tenant target migration is already applied; verify instead.', 1;
IF OBJECT_ID(N'dbo.CreditFacilities', N'U') IS NULL THROW 51104, 'CreditFacilities table is missing.', 1;
SELECT DB_NAME() AS DatabaseName, COUNT(*) AS MigrationCount, MAX(MigrationId) AS LatestMigration FROM dbo.__EFMigrationsHistory;
