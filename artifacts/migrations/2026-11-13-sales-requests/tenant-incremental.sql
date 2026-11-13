BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    ALTER TABLE [SalesQuotes] ADD [SourceSalesRequestId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
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
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
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
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesQuotes_TenantId_SourceSalesRequestId] ON [SalesQuotes] ([TenantId], [SourceSalesRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesRequestLines_TenantId_StockItemId] ON [SalesRequestLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesRequests_TenantId_Code] ON [SalesRequests] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesRequests_TenantId_CustomerId] ON [SalesRequests] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    CREATE INDEX [IX_SalesRequests_TenantId_RequestDate_CreatedAt] ON [SalesRequests] ([TenantId], [RequestDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    ALTER TABLE [SalesQuotes] ADD CONSTRAINT [FK_SalesQuotes_SalesRequests_TenantId_SourceSalesRequestId] FOREIGN KEY ([TenantId], [SourceSalesRequestId]) REFERENCES [SalesRequests] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083656_AddTenantSalesRequests'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113083656_AddTenantSalesRequests', N'10.0.13');
END;

COMMIT;
GO

