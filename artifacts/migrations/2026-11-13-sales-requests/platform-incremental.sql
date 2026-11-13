BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    ALTER TABLE [SalesQuotes] ADD [SourceSalesRequestId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    CREATE TABLE [SalesRequests] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [RequestDate] date NOT NULL,
        [NeededByDate] date NULL,
        [Description] nvarchar(1000) NULL,
        [Status] nvarchar(16) NOT NULL,
        [CancelReason] nvarchar(500) NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesRequests] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesRequests_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SalesRequests_NeededByDate] CHECK ([NeededByDate] IS NULL OR [NeededByDate] >= [RequestDate]),
        CONSTRAINT [FK_SalesRequests_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesRequests_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    CREATE TABLE [SalesRequestLines] (
        [TenantId] uniqueidentifier NOT NULL,
        [SalesRequestId] uniqueidentifier NOT NULL,
        [LineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [EnteredQuantity] decimal(18,4) NULL,
        [EnteredUnitCode] nvarchar(8) NULL,
        CONSTRAINT [PK_SalesRequestLines] PRIMARY KEY ([TenantId], [SalesRequestId], [LineNumber]),
        CONSTRAINT [CK_SalesRequestLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_SalesRequestLines_SalesRequests_TenantId_SalesRequestId] FOREIGN KEY ([TenantId], [SalesRequestId]) REFERENCES [SalesRequests] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesRequestLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.sales-requests.create'', ''create'', N''create · Sales requests'', ''erp.sales-requests''),
    (''erp.sales-requests.delete'', ''delete'', N''delete · Sales requests'', ''erp.sales-requests''),
    (''erp.sales-requests.execute'', ''execute'', N''execute · Sales requests'', ''erp.sales-requests''),
    (''erp.sales-requests.read'', ''read'', N''read · Sales requests'', ''erp.sales-requests''),
    (''erp.sales-requests.update'', ''update'', N''update · Sales requests'', ''erp.sales-requests'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    INSERT INTO [TenantPermissionRules]
        ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
         [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
    SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[Code], 1,
           NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
    FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
    CROSS JOIN [PermissionDefinitions] AS permission
    WHERE permission.[ResourceType] = 'erp.sales-requests'
      AND NOT EXISTS (
          SELECT 1 FROM [TenantPermissionRules] AS existing
          WHERE existing.[TenantId] = tenant.[TenantId]
            AND existing.[SubjectType] = 1
            AND existing.[SubjectRole] = 'TenantUser'
            AND existing.[PermissionCode] = permission.[Code]
      );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesQuotes_TenantId_SourceSalesRequestId] ON [SalesQuotes] ([TenantId], [SourceSalesRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesRequestLines_TenantId_StockItemId] ON [SalesRequestLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesRequests_TenantId_Code] ON [SalesRequests] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesRequests_TenantId_CustomerId] ON [SalesRequests] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesRequests_TenantId_RequestDate_CreatedAt] ON [SalesRequests] ([TenantId], [RequestDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    ALTER TABLE [SalesQuotes] ADD CONSTRAINT [FK_SalesQuotes_SalesRequests_TenantId_SourceSalesRequestId] FOREIGN KEY ([TenantId], [SourceSalesRequestId]) REFERENCES [SalesRequests] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083645_AddSalesRequests'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113083645_AddSalesRequests', N'10.0.13');
END;

COMMIT;
GO

