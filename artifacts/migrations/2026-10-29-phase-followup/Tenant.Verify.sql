SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=N'20261029134657_AddCreditFacilitySecurities') THROW 51300, 'Tenant credit security migration missing.', 1;
IF OBJECT_ID(N'dbo.CreditFacilitySecurities', N'U') IS NULL THROW 51301, 'Tenant credit securities table missing.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_CreditFacilitySecurities_CreditFacilities_TenantId_CreditFacilityId' AND is_disabled=0 AND is_not_trusted=0) THROW 51302, 'Tenant scoped credit facility FK missing or untrusted.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_CreditFacilitySecurities_Amounts' AND is_disabled=0 AND is_not_trusted=0) THROW 51303, 'Amount check missing or untrusted.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_CreditFacilitySecurities_Dates' AND is_disabled=0 AND is_not_trusted=0) THROW 51304, 'Date check missing or untrusted.', 1;
SELECT DB_NAME() AS DatabaseName, COUNT(*) AS MigrationCount, MAX(MigrationId) AS LatestMigration FROM dbo.__EFMigrationsHistory;
