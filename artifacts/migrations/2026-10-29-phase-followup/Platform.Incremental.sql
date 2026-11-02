BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029135328_AddCreditFacilitySecurities'
)
BEGIN
    CREATE TABLE [CreditFacilitySecurities] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CreditFacilityId] uniqueidentifier NOT NULL,
        [Type] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Issuer] nvarchar(160) NOT NULL,
        [Beneficiary] nvarchar(160) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [CommissionAmount] decimal(18,2) NOT NULL,
        [IssueDate] date NOT NULL,
        [ExpiryDate] date NOT NULL,
        [Status] int NOT NULL,
        [Notes] nvarchar(500) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CreditFacilitySecurities] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CreditFacilitySecurities_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_CreditFacilitySecurities_Amounts] CHECK ([Amount] > 0 AND [CommissionAmount] >= 0),
        CONSTRAINT [CK_CreditFacilitySecurities_Dates] CHECK ([ExpiryDate] >= [IssueDate]),
        CONSTRAINT [CK_CreditFacilitySecurities_Status] CHECK ([Status] IN (1,2,3,4)),
        CONSTRAINT [CK_CreditFacilitySecurities_Type] CHECK ([Type] IN (1,2)),
        CONSTRAINT [FK_CreditFacilitySecurities_CreditFacilities_TenantId_CreditFacilityId] FOREIGN KEY ([TenantId], [CreditFacilityId]) REFERENCES [CreditFacilities] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029135328_AddCreditFacilitySecurities'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CreditFacilitySecurities_TenantId_Code] ON [CreditFacilitySecurities] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029135328_AddCreditFacilitySecurities'
)
BEGIN
    CREATE INDEX [IX_CreditFacilitySecurities_TenantId_CreditFacilityId_Status_ExpiryDate] ON [CreditFacilitySecurities] ([TenantId], [CreditFacilityId], [Status], [ExpiryDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029135328_AddCreditFacilitySecurities'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029135328_AddCreditFacilitySecurities', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029184008_AddOrganizationalDefinitionsPermission'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.organizational-definitions.create'', ''create'', N''create · Tenant workplace, branch and factory definitions'', ''erp.organizational-definitions''),
    (''erp.organizational-definitions.delete'', ''delete'', N''delete · Tenant workplace, branch and factory definitions'', ''erp.organizational-definitions''),
    (''erp.organizational-definitions.execute'', ''execute'', N''execute · Tenant workplace, branch and factory definitions'', ''erp.organizational-definitions''),
    (''erp.organizational-definitions.read'', ''read'', N''read · Tenant workplace, branch and factory definitions'', ''erp.organizational-definitions''),
    (''erp.organizational-definitions.update'', ''update'', N''update · Tenant workplace, branch and factory definitions'', ''erp.organizational-definitions'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029184008_AddOrganizationalDefinitionsPermission'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029184008_AddOrganizationalDefinitionsPermission', N'10.0.13');
END;

COMMIT;
GO
