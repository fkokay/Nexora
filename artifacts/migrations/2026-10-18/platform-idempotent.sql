IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE TABLE [AuditEvents] (
        [Id] bigint NOT NULL IDENTITY,
        [TenantId] uniqueidentifier NULL,
        [UserId] uniqueidentifier NULL,
        [Action] nvarchar(120) NOT NULL,
        [Resource] nvarchar(240) NOT NULL,
        [OccurredAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AuditEvents] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE TABLE [DevelopmentRequests] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Title] nvarchar(180) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [Status] nvarchar(40) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DevelopmentRequests] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE TABLE [Tenants] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Slug] nvarchar(100) NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_Tenants] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] uniqueidentifier NOT NULL,
        [Email] nvarchar(320) NOT NULL,
        [DisplayName] nvarchar(160) NOT NULL,
        [PasswordHash] nvarchar(512) NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE TABLE [TenantMemberships] (
        [UserId] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Role] nvarchar(64) NOT NULL,
        CONSTRAINT [PK_TenantMemberships] PRIMARY KEY ([UserId], [TenantId]),
        CONSTRAINT [FK_TenantMemberships_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_TenantMemberships_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE INDEX [IX_AuditEvents_TenantId_OccurredAt] ON [AuditEvents] ([TenantId], [OccurredAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE INDEX [IX_DevelopmentRequests_TenantId_CreatedAt] ON [DevelopmentRequests] ([TenantId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE INDEX [IX_TenantMemberships_TenantId] ON [TenantMemberships] ([TenantId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Tenants_Slug] ON [Tenants] ([Slug]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Email] ON [Users] ([Email]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203054_InitialPlatformSchema'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014203054_InitialPlatformSchema', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203217_AddCustomerAccounts'
)
BEGIN
    CREATE TABLE [CustomerAccounts] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(64) NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Type] int NOT NULL,
        [TaxNumber] nvarchar(32) NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_CustomerAccounts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CustomerAccounts_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203217_AddCustomerAccounts'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerAccounts_TenantId_Code] ON [CustomerAccounts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203217_AddCustomerAccounts'
)
BEGIN
    CREATE INDEX [IX_CustomerAccounts_TenantId_Name] ON [CustomerAccounts] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203217_AddCustomerAccounts'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014203217_AddCustomerAccounts', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    ALTER TABLE [CustomerAccounts] ADD [CurrencyCode] nchar(3) NOT NULL DEFAULT N'TRY';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    ALTER TABLE [CustomerAccounts] ADD [GroupId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    ALTER TABLE [CustomerAccounts] ADD [PaymentTermDays] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    ALTER TABLE [CustomerAccounts] ADD [RiskLimit] decimal(18,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    ALTER TABLE [CustomerAccounts] ADD CONSTRAINT [AK_CustomerAccounts_TenantId_Id] UNIQUE ([TenantId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    CREATE TABLE [CustomerAddresses] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [Kind] int NOT NULL,
        [Label] nvarchar(80) NOT NULL,
        [AddressLine] nvarchar(400) NOT NULL,
        [City] nvarchar(100) NOT NULL,
        [District] nvarchar(100) NULL,
        [PostalCode] nvarchar(20) NULL,
        [CountryCode] nchar(2) NOT NULL,
        [IsDefault] bit NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_CustomerAddresses] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CustomerAddresses_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    CREATE TABLE [CustomerGroups] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_CustomerGroups] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerGroups_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_CustomerGroups_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    CREATE INDEX [IX_CustomerAccounts_TenantId_GroupId] ON [CustomerAccounts] ([TenantId], [GroupId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    CREATE INDEX [IX_CustomerAddresses_TenantId_CustomerId] ON [CustomerAddresses] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerGroups_TenantId_Code] ON [CustomerGroups] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    ALTER TABLE [CustomerAccounts] ADD CONSTRAINT [FK_CustomerAccounts_CustomerGroups_TenantId_GroupId] FOREIGN KEY ([TenantId], [GroupId]) REFERENCES [CustomerGroups] ([TenantId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014204253_AddCustomerGroupsAndAddresses'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014204253_AddCustomerGroupsAndAddresses', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014205202_AddCustomerLedger'
)
BEGIN
    CREATE TABLE [CustomerLedgerEntries] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [EntryDate] date NOT NULL,
        [Direction] int NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Description] nvarchar(240) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReversalOfId] uniqueidentifier NULL,
        CONSTRAINT [PK_CustomerLedgerEntries] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerLedgerEntries_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_CustomerLedgerEntries_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CustomerLedgerEntries_CustomerLedgerEntries_TenantId_ReversalOfId] FOREIGN KEY ([TenantId], [ReversalOfId]) REFERENCES [CustomerLedgerEntries] ([TenantId], [Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014205202_AddCustomerLedger'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_CustomerId_EntryDate_CreatedAt] ON [CustomerLedgerEntries] ([TenantId], [CustomerId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014205202_AddCustomerLedger'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_CustomerLedgerEntries_TenantId_ReversalOfId] ON [CustomerLedgerEntries] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014205202_AddCustomerLedger'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014205202_AddCustomerLedger', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE TABLE [StockItems] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(64) NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Barcode] nvarchar(64) NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Category] nvarchar(120) NULL,
        [MinimumStock] decimal(18,4) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StockItems] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StockItems_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_StockItems_MinimumStockNonNegative] CHECK ([MinimumStock] >= 0),
        CONSTRAINT [FK_StockItems_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE TABLE [Warehouses] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_Warehouses] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_Warehouses_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_Warehouses_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE TABLE [InventoryTransactions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [EntryDate] date NOT NULL,
        [Direction] int NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [Description] nvarchar(240) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReversalOfId] uniqueidentifier NULL,
        CONSTRAINT [PK_InventoryTransactions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_InventoryTransactions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_InventoryTransactions_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_InventoryTransactions_InventoryTransactions_TenantId_ReversalOfId] FOREIGN KEY ([TenantId], [ReversalOfId]) REFERENCES [InventoryTransactions] ([TenantId], [Id]),
        CONSTRAINT [FK_InventoryTransactions_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactions_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_InventoryTransactions_TenantId_ReversalOfId] ON [InventoryTransactions] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_StockItemId] ON [InventoryTransactions] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_WarehouseId_StockItemId_EntryDate_CreatedAt] ON [InventoryTransactions] ([TenantId], [WarehouseId], [StockItemId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_StockItems_TenantId_Barcode] ON [StockItems] ([TenantId], [Barcode]) WHERE [Barcode] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItems_TenantId_Code] ON [StockItems] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE INDEX [IX_StockItems_TenantId_Name] ON [StockItems] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Warehouses_TenantId_Code] ON [Warehouses] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014210341_AddInventory'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014210341_AddInventory', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211013_AddSalesQuotes'
)
BEGIN
    CREATE TABLE [SalesQuotes] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [QuoteDate] date NOT NULL,
        [ValidUntil] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Status] int NOT NULL,
        [Notes] nvarchar(1000) NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesQuotes] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesQuotes_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SalesQuotes_ValidDateRange] CHECK ([ValidUntil] >= [QuoteDate]),
        CONSTRAINT [FK_SalesQuotes_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesQuotes_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211013_AddSalesQuotes'
)
BEGIN
    CREATE TABLE [SalesQuoteLines] (
        [TenantId] uniqueidentifier NOT NULL,
        [QuoteId] uniqueidentifier NOT NULL,
        [LineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_SalesQuoteLines] PRIMARY KEY ([TenantId], [QuoteId], [LineNumber]),
        CONSTRAINT [CK_SalesQuoteLines_DiscountRange] CHECK ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100),
        CONSTRAINT [CK_SalesQuoteLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [CK_SalesQuoteLines_VatRange] CHECK ([VatPercent] >= 0 AND [VatPercent] <= 100),
        CONSTRAINT [FK_SalesQuoteLines_SalesQuotes_TenantId_QuoteId] FOREIGN KEY ([TenantId], [QuoteId]) REFERENCES [SalesQuotes] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesQuoteLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211013_AddSalesQuotes'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteLines_TenantId_StockItemId] ON [SalesQuoteLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211013_AddSalesQuotes'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesQuotes_TenantId_Code] ON [SalesQuotes] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211013_AddSalesQuotes'
)
BEGIN
    CREATE INDEX [IX_SalesQuotes_TenantId_CustomerId] ON [SalesQuotes] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211013_AddSalesQuotes'
)
BEGIN
    CREATE INDEX [IX_SalesQuotes_TenantId_QuoteDate_CreatedAt] ON [SalesQuotes] ([TenantId], [QuoteDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211013_AddSalesQuotes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014211013_AddSalesQuotes', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    CREATE TABLE [SalesOrders] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [QuoteId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [OrderDate] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Status] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesOrders] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesOrders_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesOrders_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrders_SalesQuotes_TenantId_QuoteId] FOREIGN KEY ([TenantId], [QuoteId]) REFERENCES [SalesQuotes] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrders_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    CREATE TABLE [SalesOrderLines] (
        [TenantId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [LineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_SalesOrderLines] PRIMARY KEY ([TenantId], [OrderId], [LineNumber]),
        CONSTRAINT [CK_SalesOrderLines_DiscountRange] CHECK ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100),
        CONSTRAINT [CK_SalesOrderLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [CK_SalesOrderLines_VatRange] CHECK ([VatPercent] >= 0 AND [VatPercent] <= 100),
        CONSTRAINT [FK_SalesOrderLines_SalesOrders_TenantId_OrderId] FOREIGN KEY ([TenantId], [OrderId]) REFERENCES [SalesOrders] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesOrderLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    CREATE INDEX [IX_SalesOrderLines_TenantId_StockItemId] ON [SalesOrderLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrders_TenantId_Code] ON [SalesOrders] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    CREATE INDEX [IX_SalesOrders_TenantId_CustomerId] ON [SalesOrders] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    CREATE INDEX [IX_SalesOrders_TenantId_OrderDate_CreatedAt] ON [SalesOrders] ([TenantId], [OrderDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrders_TenantId_QuoteId] ON [SalesOrders] ([TenantId], [QuoteId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014211618_AddSalesOrders'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014211618_AddSalesOrders', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [SalesDeliveryLineId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE TABLE [SalesDeliveries] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [DeliveryDate] date NOT NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesDeliveries] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesDeliveries_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_SalesDeliveries_TenantId_Id_OrderId] UNIQUE ([TenantId], [Id], [OrderId]),
        CONSTRAINT [FK_SalesDeliveries_SalesOrders_TenantId_OrderId] FOREIGN KEY ([TenantId], [OrderId]) REFERENCES [SalesOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesDeliveries_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesDeliveries_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE TABLE [SalesDeliveryLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DeliveryId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        CONSTRAINT [PK_SalesDeliveryLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesDeliveryLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SalesDeliveryLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId] FOREIGN KEY ([TenantId], [DeliveryId], [OrderId]) REFERENCES [SalesDeliveries] ([TenantId], [Id], [OrderId]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesDeliveryLines_SalesOrderLines_TenantId_OrderId_OrderLineNumber] FOREIGN KEY ([TenantId], [OrderId], [OrderLineNumber]) REFERENCES [SalesOrderLines] ([TenantId], [OrderId], [LineNumber]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_SalesDeliveryLineId] ON [InventoryTransactions] ([TenantId], [SalesDeliveryLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesDeliveries_TenantId_Code] ON [SalesDeliveries] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveries_TenantId_OrderId_Status_DeliveryDate] ON [SalesDeliveries] ([TenantId], [OrderId], [Status], [DeliveryDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesDeliveries_TenantId_RequestId] ON [SalesDeliveries] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveries_TenantId_WarehouseId] ON [SalesDeliveries] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId] ON [SalesDeliveryLines] ([TenantId], [DeliveryId], [OrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesDeliveryLines_TenantId_DeliveryId_OrderLineNumber] ON [SalesDeliveryLines] ([TenantId], [DeliveryId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveryLines_TenantId_OrderId_OrderLineNumber] ON [SalesDeliveryLines] ([TenantId], [OrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD CONSTRAINT [FK_InventoryTransactions_SalesDeliveryLines_TenantId_SalesDeliveryLineId] FOREIGN KEY ([TenantId], [SalesDeliveryLineId]) REFERENCES [SalesDeliveryLines] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014212909_AddSalesDeliveries'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014212909_AddSalesDeliveries', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD [SalesInvoiceId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE TABLE [SalesInvoices] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DeliveryId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [InvoiceDate] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Status] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesInvoices] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesInvoices_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesInvoices_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoices_SalesDeliveries_TenantId_DeliveryId] FOREIGN KEY ([TenantId], [DeliveryId]) REFERENCES [SalesDeliveries] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoices_SalesOrders_TenantId_OrderId] FOREIGN KEY ([TenantId], [OrderId]) REFERENCES [SalesOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoices_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE TABLE [SalesInvoiceLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [InvoiceId] uniqueidentifier NOT NULL,
        [DeliveryLineId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_SalesInvoiceLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesInvoiceLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SalesInvoiceLines_DiscountRange] CHECK ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100),
        CONSTRAINT [CK_SalesInvoiceLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [CK_SalesInvoiceLines_VatRange] CHECK ([VatPercent] >= 0 AND [VatPercent] <= 100),
        CONSTRAINT [FK_SalesInvoiceLines_SalesDeliveryLines_TenantId_DeliveryLineId] FOREIGN KEY ([TenantId], [DeliveryLineId]) REFERENCES [SalesDeliveryLines] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceLines_SalesInvoices_TenantId_InvoiceId] FOREIGN KEY ([TenantId], [InvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesInvoiceLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SalesInvoiceId] ON [CustomerLedgerEntries] ([TenantId], [SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoiceLines_TenantId_DeliveryLineId] ON [SalesInvoiceLines] ([TenantId], [DeliveryLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceLines_TenantId_InvoiceId] ON [SalesInvoiceLines] ([TenantId], [InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceLines_TenantId_StockItemId] ON [SalesInvoiceLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoices_TenantId_Code] ON [SalesInvoices] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE INDEX [IX_SalesInvoices_TenantId_CustomerId] ON [SalesInvoices] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoices_TenantId_DeliveryId] ON [SalesInvoices] ([TenantId], [DeliveryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE INDEX [IX_SalesInvoices_TenantId_InvoiceDate_CreatedAt] ON [SalesInvoices] ([TenantId], [InvoiceDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    CREATE INDEX [IX_SalesInvoices_TenantId_OrderId] ON [SalesInvoices] ([TenantId], [OrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_SalesInvoices_TenantId_SalesInvoiceId] FOREIGN KEY ([TenantId], [SalesInvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014213454_AddSalesInvoices'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014213454_AddSalesInvoices', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD [CustomerCollectionId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE TABLE [CustomerCollections] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [CollectionDate] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [PaymentMethod] nvarchar(40) NOT NULL,
        [Reference] nvarchar(100) NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CustomerCollections] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerCollections_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_CustomerCollections_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_CustomerCollections_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerCollections_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE TABLE [CustomerCollectionAllocations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerCollectionId] uniqueidentifier NOT NULL,
        [SalesInvoiceId] uniqueidentifier NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_CustomerCollectionAllocations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerCollectionAllocations_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_CustomerCollectionAllocations_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_CustomerCollectionAllocations_CustomerCollections_TenantId_CustomerCollectionId] FOREIGN KEY ([TenantId], [CustomerCollectionId]) REFERENCES [CustomerCollections] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CustomerCollectionAllocations_SalesInvoices_TenantId_SalesInvoiceId] FOREIGN KEY ([TenantId], [SalesInvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_CustomerCollectionId] ON [CustomerLedgerEntries] ([TenantId], [CustomerCollectionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCollectionAllocations_TenantId_CustomerCollectionId_SalesInvoiceId] ON [CustomerCollectionAllocations] ([TenantId], [CustomerCollectionId], [SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE INDEX [IX_CustomerCollectionAllocations_TenantId_SalesInvoiceId] ON [CustomerCollectionAllocations] ([TenantId], [SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCollections_TenantId_Code] ON [CustomerCollections] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE INDEX [IX_CustomerCollections_TenantId_CustomerId_CollectionDate_CreatedAt] ON [CustomerCollections] ([TenantId], [CustomerId], [CollectionDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCollections_TenantId_RequestId] ON [CustomerCollections] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_CustomerCollections_TenantId_CustomerCollectionId] FOREIGN KEY ([TenantId], [CustomerCollectionId]) REFERENCES [CustomerCollections] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214103_AddCustomerCollections'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014214103_AddCustomerCollections', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [SalesReturnLineId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD [SalesReturnId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE TABLE [SalesReturns] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [SalesInvoiceId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [ReturnDate] date NOT NULL,
        [Status] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesReturns] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesReturns_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SalesReturns_GrandTotalPositive] CHECK ([GrandTotal] > 0),
        CONSTRAINT [FK_SalesReturns_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesReturns_SalesInvoices_TenantId_SalesInvoiceId] FOREIGN KEY ([TenantId], [SalesInvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesReturns_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesReturns_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE TABLE [SalesReturnLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [SalesReturnId] uniqueidentifier NOT NULL,
        [SalesInvoiceLineId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_SalesReturnLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesReturnLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SalesReturnLines_DiscountRange] CHECK ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100),
        CONSTRAINT [CK_SalesReturnLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [CK_SalesReturnLines_VatRange] CHECK ([VatPercent] >= 0 AND [VatPercent] <= 100),
        CONSTRAINT [FK_SalesReturnLines_SalesInvoiceLines_TenantId_SalesInvoiceLineId] FOREIGN KEY ([TenantId], [SalesInvoiceLineId]) REFERENCES [SalesInvoiceLines] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesReturnLines_SalesReturns_TenantId_SalesReturnId] FOREIGN KEY ([TenantId], [SalesReturnId]) REFERENCES [SalesReturns] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesReturnLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_SalesReturnLineId] ON [InventoryTransactions] ([TenantId], [SalesReturnLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SalesReturnId] ON [CustomerLedgerEntries] ([TenantId], [SalesReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_SalesReturnLines_TenantId_SalesInvoiceLineId] ON [SalesReturnLines] ([TenantId], [SalesInvoiceLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_SalesReturnLines_TenantId_SalesReturnId] ON [SalesReturnLines] ([TenantId], [SalesReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_SalesReturnLines_TenantId_StockItemId] ON [SalesReturnLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesReturns_TenantId_Code] ON [SalesReturns] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_SalesReturns_TenantId_CustomerId] ON [SalesReturns] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesReturns_TenantId_RequestId] ON [SalesReturns] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_SalesReturns_TenantId_SalesInvoiceId_ReturnDate_CreatedAt] ON [SalesReturns] ([TenantId], [SalesInvoiceId], [ReturnDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    CREATE INDEX [IX_SalesReturns_TenantId_WarehouseId] ON [SalesReturns] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_SalesReturns_TenantId_SalesReturnId] FOREIGN KEY ([TenantId], [SalesReturnId]) REFERENCES [SalesReturns] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD CONSTRAINT [FK_InventoryTransactions_SalesReturnLines_TenantId_SalesReturnLineId] FOREIGN KEY ([TenantId], [SalesReturnLineId]) REFERENCES [SalesReturnLines] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014214946_AddSalesReturns'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014214946_AddSalesReturns', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [PurchaseReceiptLineId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE TABLE [PurchaseOrders] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [SupplierId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [OrderDate] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Status] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [Notes] nvarchar(1000) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseOrders] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseOrders_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseOrders_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrders_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE TABLE [PurchaseOrderLines] (
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseOrderId] uniqueidentifier NOT NULL,
        [LineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_PurchaseOrderLines] PRIMARY KEY ([TenantId], [PurchaseOrderId], [LineNumber]),
        CONSTRAINT [CK_PurchaseOrderLines_DiscountRange] CHECK ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100),
        CONSTRAINT [CK_PurchaseOrderLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [CK_PurchaseOrderLines_VatRange] CHECK ([VatPercent] >= 0 AND [VatPercent] <= 100),
        CONSTRAINT [FK_PurchaseOrderLines_PurchaseOrders_TenantId_PurchaseOrderId] FOREIGN KEY ([TenantId], [PurchaseOrderId]) REFERENCES [PurchaseOrders] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_PurchaseOrderLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE TABLE [PurchaseReceipts] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [PurchaseOrderId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [ReceiptDate] date NOT NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseReceipts] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseReceipts_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_PurchaseReceipts_TenantId_Id_PurchaseOrderId] UNIQUE ([TenantId], [Id], [PurchaseOrderId]),
        CONSTRAINT [FK_PurchaseReceipts_PurchaseOrders_TenantId_PurchaseOrderId] FOREIGN KEY ([TenantId], [PurchaseOrderId]) REFERENCES [PurchaseOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseReceipts_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_PurchaseReceipts_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE TABLE [PurchaseReceiptLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ReceiptId] uniqueidentifier NOT NULL,
        [PurchaseOrderId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        CONSTRAINT [PK_PurchaseReceiptLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseReceiptLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_PurchaseReceiptLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_PurchaseReceiptLines_PurchaseOrderLines_TenantId_PurchaseOrderId_OrderLineNumber] FOREIGN KEY ([TenantId], [PurchaseOrderId], [OrderLineNumber]) REFERENCES [PurchaseOrderLines] ([TenantId], [PurchaseOrderId], [LineNumber]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseReceiptLines_PurchaseReceipts_TenantId_ReceiptId_PurchaseOrderId] FOREIGN KEY ([TenantId], [ReceiptId], [PurchaseOrderId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id], [PurchaseOrderId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_PurchaseReceiptLineId] ON [InventoryTransactions] ([TenantId], [PurchaseReceiptLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderLines_TenantId_StockItemId] ON [PurchaseOrderLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_Code] ON [PurchaseOrders] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrders_TenantId_OrderDate_CreatedAt] ON [PurchaseOrders] ([TenantId], [OrderDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrders_TenantId_SupplierId] ON [PurchaseOrders] ([TenantId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptLines_TenantId_PurchaseOrderId_OrderLineNumber] ON [PurchaseReceiptLines] ([TenantId], [PurchaseOrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceiptLines_TenantId_ReceiptId_OrderLineNumber] ON [PurchaseReceiptLines] ([TenantId], [ReceiptId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptLines_TenantId_ReceiptId_PurchaseOrderId] ON [PurchaseReceiptLines] ([TenantId], [ReceiptId], [PurchaseOrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceipts_TenantId_Code] ON [PurchaseReceipts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceipts_TenantId_PurchaseOrderId_Status_ReceiptDate] ON [PurchaseReceipts] ([TenantId], [PurchaseOrderId], [Status], [ReceiptDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceipts_TenantId_RequestId] ON [PurchaseReceipts] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceipts_TenantId_WarehouseId] ON [PurchaseReceipts] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD CONSTRAINT [FK_InventoryTransactions_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId] FOREIGN KEY ([TenantId], [PurchaseReceiptLineId]) REFERENCES [PurchaseReceiptLines] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014215649_AddPurchasingReceipts'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014215649_AddPurchasingReceipts', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD [PurchaseInvoiceId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD [SupplierPaymentId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE TABLE [PurchaseInvoices] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseReceiptId] uniqueidentifier NOT NULL,
        [PurchaseOrderId] uniqueidentifier NOT NULL,
        [SupplierId] uniqueidentifier NOT NULL,
        [Code] nvarchar(64) NOT NULL,
        [InvoiceDate] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Status] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseInvoices] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseInvoices_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_PurchaseInvoices_GrandTotalPositive] CHECK ([GrandTotal] > 0),
        CONSTRAINT [FK_PurchaseInvoices_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId] FOREIGN KEY ([TenantId], [PurchaseReceiptId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseInvoices_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE TABLE [PurchaseInvoiceLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseInvoiceId] uniqueidentifier NOT NULL,
        [PurchaseReceiptLineId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_PurchaseInvoiceLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseInvoiceLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_PurchaseInvoiceLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_PurchaseInvoiceLines_PurchaseInvoices_TenantId_PurchaseInvoiceId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId] FOREIGN KEY ([TenantId], [PurchaseReceiptLineId]) REFERENCES [PurchaseReceiptLines] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE TABLE [SupplierPayments] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [PurchaseInvoiceId] uniqueidentifier NOT NULL,
        [SupplierId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [PaymentDate] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [PaymentMethod] nvarchar(40) NOT NULL,
        [Reference] nvarchar(100) NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SupplierPayments] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SupplierPayments_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SupplierPayments_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_SupplierPayments_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierPayments_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId] ON [CustomerLedgerEntries] ([TenantId], [PurchaseInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierPaymentId] ON [CustomerLedgerEntries] ([TenantId], [SupplierPaymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId] ON [PurchaseInvoiceLines] ([TenantId], [PurchaseInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptLineId] ON [PurchaseInvoiceLines] ([TenantId], [PurchaseReceiptLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseInvoices_TenantId_Code] ON [PurchaseInvoices] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseInvoices_TenantId_PurchaseReceiptId] ON [PurchaseInvoices] ([TenantId], [PurchaseReceiptId]) WHERE [Status] = 1');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoices_TenantId_SupplierId_InvoiceDate_CreatedAt] ON [PurchaseInvoices] ([TenantId], [SupplierId], [InvoiceDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierPayments_TenantId_Code] ON [SupplierPayments] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_PurchaseInvoiceId_Status_PaymentDate] ON [SupplierPayments] ([TenantId], [PurchaseInvoiceId], [Status], [PaymentDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierPayments_TenantId_RequestId] ON [SupplierPayments] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_SupplierId] ON [SupplierPayments] ([TenantId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId] FOREIGN KEY ([TenantId], [SupplierPaymentId]) REFERENCES [SupplierPayments] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220621_AddPurchaseInvoicesAndSupplierPayments'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014220621_AddPurchaseInvoicesAndSupplierPayments', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220845_AddPurchaseInvoiceDueDate'
)
BEGIN
    ALTER TABLE [PurchaseInvoices] ADD [DueDate] date NOT NULL DEFAULT '0001-01-01';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014220845_AddPurchaseInvoiceDueDate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014220845_AddPurchaseInvoiceDueDate', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] DROP CONSTRAINT [FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] DROP CONSTRAINT [FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseInvoiceLines] DROP CONSTRAINT [FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseInvoices] DROP CONSTRAINT [FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [SupplierPayments] DROP CONSTRAINT [FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    DROP INDEX [IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptLineId] ON [PurchaseInvoiceLines];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseInvoiceLines] ADD [PurchaseReceiptId] uniqueidentifier NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [SupplierPayments] ADD CONSTRAINT [AK_SupplierPayments_TenantId_Id_SupplierId] UNIQUE ([TenantId], [Id], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseReceiptLines] ADD CONSTRAINT [AK_PurchaseReceiptLines_TenantId_ReceiptId_Id] UNIQUE ([TenantId], [ReceiptId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD CONSTRAINT [AK_PurchaseOrders_TenantId_Id_SupplierId] UNIQUE ([TenantId], [Id], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseInvoices] ADD CONSTRAINT [AK_PurchaseInvoices_TenantId_Id_SupplierId] UNIQUE ([TenantId], [Id], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_PurchaseInvoiceId_SupplierId] ON [SupplierPayments] ([TenantId], [PurchaseInvoiceId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoices_TenantId_PurchaseOrderId_SupplierId] ON [PurchaseInvoices] ([TenantId], [PurchaseOrderId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoices_TenantId_PurchaseReceiptId_PurchaseOrderId] ON [PurchaseInvoices] ([TenantId], [PurchaseReceiptId], [PurchaseOrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId] ON [PurchaseInvoiceLines] ([TenantId], [PurchaseReceiptId], [PurchaseReceiptLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId_CustomerId] ON [CustomerLedgerEntries] ([TenantId], [PurchaseInvoiceId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierPaymentId_CustomerId] ON [CustomerLedgerEntries] ([TenantId], [SupplierPaymentId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId_CustomerId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId], [CustomerId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId_CustomerId] FOREIGN KEY ([TenantId], [SupplierPaymentId], [CustomerId]) REFERENCES [SupplierPayments] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseInvoiceLines] ADD CONSTRAINT [FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId] FOREIGN KEY ([TenantId], [PurchaseReceiptId], [PurchaseReceiptLineId]) REFERENCES [PurchaseReceiptLines] ([TenantId], [ReceiptId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseInvoices] ADD CONSTRAINT [FK_PurchaseInvoices_PurchaseOrders_TenantId_PurchaseOrderId_SupplierId] FOREIGN KEY ([TenantId], [PurchaseOrderId], [SupplierId]) REFERENCES [PurchaseOrders] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [PurchaseInvoices] ADD CONSTRAINT [FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId_PurchaseOrderId] FOREIGN KEY ([TenantId], [PurchaseReceiptId], [PurchaseOrderId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id], [PurchaseOrderId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    ALTER TABLE [SupplierPayments] ADD CONSTRAINT [FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId], [SupplierId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221032_EnforcePurchaseDocumentOwnership'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014221032_EnforcePurchaseDocumentOwnership', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [SupplierReturnLineId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD [SupplierReturnId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    ALTER TABLE [PurchaseInvoiceLines] ADD CONSTRAINT [AK_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_Id] UNIQUE ([TenantId], [PurchaseInvoiceId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE TABLE [SupplierReturns] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [PurchaseInvoiceId] uniqueidentifier NOT NULL,
        [SupplierId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [ReturnDate] date NOT NULL,
        [Status] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SupplierReturns] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SupplierReturns_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_SupplierReturns_TenantId_Id_SupplierId] UNIQUE ([TenantId], [Id], [SupplierId]),
        CONSTRAINT [CK_SupplierReturns_GrandTotalPositive] CHECK ([GrandTotal] > 0),
        CONSTRAINT [FK_SupplierReturns_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierReturns_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId], [SupplierId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierReturns_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SupplierReturns_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE TABLE [SupplierReturnLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [SupplierReturnId] uniqueidentifier NOT NULL,
        [PurchaseInvoiceId] uniqueidentifier NOT NULL,
        [PurchaseInvoiceLineId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_SupplierReturnLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SupplierReturnLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SupplierReturnLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_SupplierReturnLines_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_PurchaseInvoiceLineId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId], [PurchaseInvoiceLineId]) REFERENCES [PurchaseInvoiceLines] ([TenantId], [PurchaseInvoiceId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId] FOREIGN KEY ([TenantId], [SupplierReturnId]) REFERENCES [SupplierReturns] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_SupplierReturnLineId] ON [InventoryTransactions] ([TenantId], [SupplierReturnLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierReturnId] ON [CustomerLedgerEntries] ([TenantId], [SupplierReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierReturnId_CustomerId] ON [CustomerLedgerEntries] ([TenantId], [SupplierReturnId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_SupplierReturnLines_TenantId_PurchaseInvoiceId_PurchaseInvoiceLineId] ON [SupplierReturnLines] ([TenantId], [PurchaseInvoiceId], [PurchaseInvoiceLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_SupplierReturnLines_TenantId_SupplierReturnId] ON [SupplierReturnLines] ([TenantId], [SupplierReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierReturns_TenantId_Code] ON [SupplierReturns] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_PurchaseInvoiceId_Status_ReturnDate] ON [SupplierReturns] ([TenantId], [PurchaseInvoiceId], [Status], [ReturnDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_PurchaseInvoiceId_SupplierId] ON [SupplierReturns] ([TenantId], [PurchaseInvoiceId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierReturns_TenantId_RequestId] ON [SupplierReturns] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_SupplierId] ON [SupplierReturns] ([TenantId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_WarehouseId] ON [SupplierReturns] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    ALTER TABLE [CustomerLedgerEntries] ADD CONSTRAINT [FK_CustomerLedgerEntries_SupplierReturns_TenantId_SupplierReturnId_CustomerId] FOREIGN KEY ([TenantId], [SupplierReturnId], [CustomerId]) REFERENCES [SupplierReturns] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD CONSTRAINT [FK_InventoryTransactions_SupplierReturnLines_TenantId_SupplierReturnLineId] FOREIGN KEY ([TenantId], [SupplierReturnLineId]) REFERENCES [SupplierReturnLines] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014221938_AddSupplierReturns'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014221938_AddSupplierReturns', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014222323_EnforceSupplierReturnInvoiceOwnership'
)
BEGIN
    ALTER TABLE [SupplierReturnLines] DROP CONSTRAINT [FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014222323_EnforceSupplierReturnInvoiceOwnership'
)
BEGIN
    ALTER TABLE [SupplierReturns] ADD CONSTRAINT [AK_SupplierReturns_TenantId_Id_PurchaseInvoiceId] UNIQUE ([TenantId], [Id], [PurchaseInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014222323_EnforceSupplierReturnInvoiceOwnership'
)
BEGIN
    CREATE INDEX [IX_SupplierReturnLines_TenantId_SupplierReturnId_PurchaseInvoiceId] ON [SupplierReturnLines] ([TenantId], [SupplierReturnId], [PurchaseInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014222323_EnforceSupplierReturnInvoiceOwnership'
)
BEGIN
    ALTER TABLE [SupplierReturnLines] ADD CONSTRAINT [FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId_PurchaseInvoiceId] FOREIGN KEY ([TenantId], [SupplierReturnId], [PurchaseInvoiceId]) REFERENCES [SupplierReturns] ([TenantId], [Id], [PurchaseInvoiceId]) ON DELETE CASCADE;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014222323_EnforceSupplierReturnInvoiceOwnership'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014222323_EnforceSupplierReturnInvoiceOwnership', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    ALTER TABLE [SupplierPayments] ADD [FinancialAccountId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    ALTER TABLE [CustomerCollections] ADD [FinancialAccountId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    ALTER TABLE [SupplierPayments] ADD CONSTRAINT [AK_SupplierPayments_TenantId_Id_CurrencyCode] UNIQUE ([TenantId], [Id], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    ALTER TABLE [CustomerCollections] ADD CONSTRAINT [AK_CustomerCollections_TenantId_Id_CurrencyCode] UNIQUE ([TenantId], [Id], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE TABLE [FinancialAccounts] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Type] int NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_FinancialAccounts] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FinancialAccounts_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_FinancialAccounts_TenantId_Id_CurrencyCode] UNIQUE ([TenantId], [Id], [CurrencyCode]),
        CONSTRAINT [FK_FinancialAccounts_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE TABLE [FinancialAccountTransactions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [FinancialAccountId] uniqueidentifier NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [TransactionDate] date NOT NULL,
        [Direction] int NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Description] nvarchar(240) NOT NULL,
        [Reference] nvarchar(100) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReversalOfId] uniqueidentifier NULL,
        [CustomerCollectionId] uniqueidentifier NULL,
        [SupplierPaymentId] uniqueidentifier NULL,
        CONSTRAINT [PK_FinancialAccountTransactions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FinancialAccountTransactions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_FinancialAccountTransactions_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_FinancialAccountTransactions_CustomerCollections_TenantId_CustomerCollectionId_CurrencyCode] FOREIGN KEY ([TenantId], [CustomerCollectionId], [CurrencyCode]) REFERENCES [CustomerCollections] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransactions_FinancialAccountTransactions_TenantId_ReversalOfId] FOREIGN KEY ([TenantId], [ReversalOfId]) REFERENCES [FinancialAccountTransactions] ([TenantId], [Id]),
        CONSTRAINT [FK_FinancialAccountTransactions_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransactions_SupplierPayments_TenantId_SupplierPaymentId_CurrencyCode] FOREIGN KEY ([TenantId], [SupplierPaymentId], [CurrencyCode]) REFERENCES [SupplierPayments] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_FinancialAccountId_CurrencyCode] ON [SupplierPayments] ([TenantId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE INDEX [IX_CustomerCollections_TenantId_FinancialAccountId_CurrencyCode] ON [CustomerCollections] ([TenantId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FinancialAccounts_TenantId_Code] ON [FinancialAccounts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_CustomerCollectionId] ON [FinancialAccountTransactions] ([TenantId], [CustomerCollectionId]) WHERE [CustomerCollectionId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_CustomerCollectionId_CurrencyCode] ON [FinancialAccountTransactions] ([TenantId], [CustomerCollectionId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_FinancialAccountId_CurrencyCode] ON [FinancialAccountTransactions] ([TenantId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_FinancialAccountId_TransactionDate_CreatedAt] ON [FinancialAccountTransactions] ([TenantId], [FinancialAccountId], [TransactionDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_ReversalOfId] ON [FinancialAccountTransactions] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_SupplierPaymentId] ON [FinancialAccountTransactions] ([TenantId], [SupplierPaymentId]) WHERE [SupplierPaymentId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_SupplierPaymentId_CurrencyCode] ON [FinancialAccountTransactions] ([TenantId], [SupplierPaymentId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    ALTER TABLE [CustomerCollections] ADD CONSTRAINT [FK_CustomerCollections_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    ALTER TABLE [SupplierPayments] ADD CONSTRAINT [FK_SupplierPayments_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223305_AddFinancialAccountsAndCashBankMovements'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014223305_AddFinancialAccountsAndCashBankMovements', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    ALTER TABLE [FinancialAccountTransactions] ADD [RequestId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    ALTER TABLE [FinancialAccountTransactions] ADD [TransferId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    CREATE TABLE [FinancialAccountTransfers] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [FromAccountId] uniqueidentifier NOT NULL,
        [ToAccountId] uniqueidentifier NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [TransferDate] date NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Reference] nvarchar(100) NULL,
        [Description] nvarchar(240) NOT NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_FinancialAccountTransfers] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FinancialAccountTransfers_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_FinancialAccountTransfers_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_FinancialAccountTransfers_FinancialAccounts_TenantId_FromAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FromAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [ToAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransfers_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_RequestId] ON [FinancialAccountTransactions] ([TenantId], [RequestId]) WHERE [RequestId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_TransferId_FinancialAccountId] ON [FinancialAccountTransactions] ([TenantId], [TransferId], [FinancialAccountId]) WHERE [TransferId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FinancialAccountTransfers_TenantId_Code] ON [FinancialAccountTransfers] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransfers_TenantId_FromAccountId_CurrencyCode] ON [FinancialAccountTransfers] ([TenantId], [FromAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FinancialAccountTransfers_TenantId_RequestId] ON [FinancialAccountTransfers] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransfers_TenantId_ToAccountId_CurrencyCode] ON [FinancialAccountTransfers] ([TenantId], [ToAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    ALTER TABLE [FinancialAccountTransactions] ADD CONSTRAINT [FK_FinancialAccountTransactions_FinancialAccountTransfers_TenantId_TransferId] FOREIGN KEY ([TenantId], [TransferId]) REFERENCES [FinancialAccountTransfers] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014223850_AddFinancialTransfersAndManualMovements'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014223850_AddFinancialTransfersAndManualMovements', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    ALTER TABLE [FinancialAccountTransactions] ADD CONSTRAINT [AK_FinancialAccountTransactions_TenantId_Id_FinancialAccountId_CurrencyCode] UNIQUE ([TenantId], [Id], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    CREATE TABLE [BankStatements] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [AccountId] uniqueidentifier NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [StartDate] date NOT NULL,
        [EndDate] date NOT NULL,
        [OpeningBalance] decimal(18,2) NOT NULL,
        [ClosingBalance] decimal(18,2) NOT NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_BankStatements] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_BankStatements_TenantId_Id_AccountId_CurrencyCode] UNIQUE ([TenantId], [Id], [AccountId], [CurrencyCode]),
        CONSTRAINT [FK_BankStatements_FinancialAccounts_TenantId_AccountId_CurrencyCode] FOREIGN KEY ([TenantId], [AccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_BankStatements_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    CREATE TABLE [BankStatementLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [StatementId] uniqueidentifier NOT NULL,
        [FinancialAccountId] uniqueidentifier NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [LineNumber] int NOT NULL,
        [ExternalId] nvarchar(100) NULL,
        [TransactionDate] date NOT NULL,
        [Direction] int NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Description] nvarchar(240) NOT NULL,
        [Reference] nvarchar(100) NULL,
        [FinancialAccountTransactionId] uniqueidentifier NULL,
        [IsBookEntryCreated] bit NOT NULL,
        [MatchedAt] datetimeoffset NULL,
        CONSTRAINT [PK_BankStatementLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_BankStatementLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_BankStatementLines_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_BankStatementLines_BankStatements_TenantId_StatementId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [StatementId], [FinancialAccountId], [CurrencyCode]) REFERENCES [BankStatements] ([TenantId], [Id], [AccountId], [CurrencyCode]) ON DELETE CASCADE,
        CONSTRAINT [FK_BankStatementLines_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountTransactionId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccountTransactions] ([TenantId], [Id], [FinancialAccountId], [CurrencyCode]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_FinancialAccountTransactionId] ON [BankStatementLines] ([TenantId], [FinancialAccountTransactionId]) WHERE [FinancialAccountTransactionId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode] ON [BankStatementLines] ([TenantId], [FinancialAccountTransactionId], [FinancialAccountId], [CurrencyCode]) WHERE [FinancialAccountTransactionId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_StatementId_ExternalId] ON [BankStatementLines] ([TenantId], [StatementId], [ExternalId]) WHERE [ExternalId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    CREATE INDEX [IX_BankStatementLines_TenantId_StatementId_FinancialAccountId_CurrencyCode] ON [BankStatementLines] ([TenantId], [StatementId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_StatementId_LineNumber] ON [BankStatementLines] ([TenantId], [StatementId], [LineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    CREATE INDEX [IX_BankStatements_TenantId_AccountId_CurrencyCode] ON [BankStatements] ([TenantId], [AccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BankStatements_TenantId_Code] ON [BankStatements] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BankStatements_TenantId_RequestId] ON [BankStatements] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014224917_AddBankStatementReconciliation'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014224917_AddBankStatementReconciliation', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    ALTER TABLE [FinancialAccountTransfers] DROP CONSTRAINT [FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_CurrencyCode];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    DROP INDEX [IX_FinancialAccountTransfers_TenantId_ToAccountId_CurrencyCode] ON [FinancialAccountTransfers];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    ALTER TABLE [FinancialAccountTransfers] ADD [DestinationAmount] decimal(18,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    ALTER TABLE [FinancialAccountTransfers] ADD [ExchangeRate] decimal(18,8) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    ALTER TABLE [FinancialAccountTransfers] ADD [ToCurrencyCode] nchar(3) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    UPDATE [FinancialAccountTransfers] SET [ToCurrencyCode] = [CurrencyCode], [DestinationAmount] = [Amount], [ExchangeRate] = 1
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    DECLARE @var nvarchar(max);
    SELECT @var = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[FinancialAccountTransfers]') AND [c].[name] = N'DestinationAmount');
    IF @var IS NOT NULL EXEC(N'ALTER TABLE [FinancialAccountTransfers] DROP CONSTRAINT ' + @var + ';');
    ALTER TABLE [FinancialAccountTransfers] ALTER COLUMN [DestinationAmount] decimal(18,2) NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    DECLARE @var1 nvarchar(max);
    SELECT @var1 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[FinancialAccountTransfers]') AND [c].[name] = N'ExchangeRate');
    IF @var1 IS NOT NULL EXEC(N'ALTER TABLE [FinancialAccountTransfers] DROP CONSTRAINT ' + @var1 + ';');
    ALTER TABLE [FinancialAccountTransfers] ALTER COLUMN [ExchangeRate] decimal(18,8) NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    DECLARE @var2 nvarchar(max);
    SELECT @var2 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[FinancialAccountTransfers]') AND [c].[name] = N'ToCurrencyCode');
    IF @var2 IS NOT NULL EXEC(N'ALTER TABLE [FinancialAccountTransfers] DROP CONSTRAINT ' + @var2 + ';');
    ALTER TABLE [FinancialAccountTransfers] ALTER COLUMN [ToCurrencyCode] nchar(3) NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransfers_TenantId_ToAccountId_ToCurrencyCode] ON [FinancialAccountTransfers] ([TenantId], [ToAccountId], [ToCurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [CK_FinancialAccountTransfers_DestinationAmountPositive] CHECK ([DestinationAmount] > 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [CK_FinancialAccountTransfers_ExchangeRatePositive] CHECK ([ExchangeRate] > 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    EXEC(N'ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [CK_FinancialAccountTransfers_SameCurrencyRate] CHECK ([CurrencyCode] <> [ToCurrencyCode] OR [ExchangeRate] = 1)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    ALTER TABLE [FinancialAccountTransfers] ADD CONSTRAINT [FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_ToCurrencyCode] FOREIGN KEY ([TenantId], [ToAccountId], [ToCurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231139_AddForeignCurrencyTransfers'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014231139_AddForeignCurrencyTransfers', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    DROP INDEX [IX_TenantMemberships_TenantId] ON [TenantMemberships];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    ALTER TABLE [TenantMemberships] ADD CONSTRAINT [AK_TenantMemberships_TenantId_UserId] UNIQUE ([TenantId], [UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    CREATE TABLE [DevelopmentProjects] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [RepositoryUrl] nvarchar(2048) NOT NULL,
        [DefaultBranch] nvarchar(256) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_DevelopmentProjects] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_DevelopmentProjects_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_DevelopmentProjects_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DevelopmentProjects_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    CREATE TABLE [DevelopmentProjectAccesses] (
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [AccessLevel] nvarchar(24) NOT NULL,
        [GrantedByUserId] uniqueidentifier NOT NULL,
        [GrantedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DevelopmentProjectAccesses] PRIMARY KEY ([TenantId], [ProjectId], [UserId]),
        CONSTRAINT [FK_DevelopmentProjectAccesses_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_DevelopmentProjectAccesses_TenantMemberships_TenantId_GrantedByUserId] FOREIGN KEY ([TenantId], [GrantedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DevelopmentProjectAccesses_TenantMemberships_TenantId_UserId] FOREIGN KEY ([TenantId], [UserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    CREATE INDEX [IX_DevelopmentProjectAccesses_TenantId_GrantedByUserId] ON [DevelopmentProjectAccesses] ([TenantId], [GrantedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    CREATE INDEX [IX_DevelopmentProjectAccesses_TenantId_UserId] ON [DevelopmentProjectAccesses] ([TenantId], [UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    CREATE INDEX [IX_DevelopmentProjects_TenantId_CreatedByUserId] ON [DevelopmentProjects] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    CREATE INDEX [IX_DevelopmentProjects_TenantId_IsActive_CreatedAt] ON [DevelopmentProjects] ([TenantId], [IsActive], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DevelopmentProjects_TenantId_Name] ON [DevelopmentProjects] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014231718_AddStudioProjects'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014231718_AddStudioProjects', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014232550_LinkStudioRequestsToProjects'
)
BEGIN
    ALTER TABLE [DevelopmentRequests] ADD [ProjectId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014232550_LinkStudioRequestsToProjects'
)
BEGIN
    CREATE INDEX [IX_DevelopmentRequests_TenantId_ProjectId_CreatedAt] ON [DevelopmentRequests] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014232550_LinkStudioRequestsToProjects'
)
BEGIN
    ALTER TABLE [DevelopmentRequests] ADD CONSTRAINT [FK_DevelopmentRequests_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014232550_LinkStudioRequestsToProjects'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014232550_LinkStudioRequestsToProjects', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014233024_AddWorkspaceApprovalRequests'
)
BEGIN
    CREATE TABLE [DevelopmentWorkspaceRequests] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [RequestedByUserId] uniqueidentifier NOT NULL,
        [BranchName] nvarchar(256) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [ReviewedByUserId] uniqueidentifier NULL,
        [ReviewedAt] datetimeoffset NULL,
        [ReviewNote] nvarchar(500) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DevelopmentWorkspaceRequests] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_DevelopmentWorkspaceRequests_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DevelopmentWorkspaceRequests_TenantMemberships_TenantId_RequestedByUserId] FOREIGN KEY ([TenantId], [RequestedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DevelopmentWorkspaceRequests_TenantMemberships_TenantId_ReviewedByUserId] FOREIGN KEY ([TenantId], [ReviewedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014233024_AddWorkspaceApprovalRequests'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_ProjectId_CreatedAt] ON [DevelopmentWorkspaceRequests] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014233024_AddWorkspaceApprovalRequests'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_RequestedByUserId] ON [DevelopmentWorkspaceRequests] ([TenantId], [RequestedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014233024_AddWorkspaceApprovalRequests'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_ReviewedByUserId] ON [DevelopmentWorkspaceRequests] ([TenantId], [ReviewedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014233024_AddWorkspaceApprovalRequests'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_Status_CreatedAt] ON [DevelopmentWorkspaceRequests] ([TenantId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014233024_AddWorkspaceApprovalRequests'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014233024_AddWorkspaceApprovalRequests', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014234056_AddWorkspaceProvisioningState'
)
BEGIN
    ALTER TABLE [DevelopmentWorkspaceRequests] ADD [CommitSha] nvarchar(64) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014234056_AddWorkspaceProvisioningState'
)
BEGIN
    ALTER TABLE [DevelopmentWorkspaceRequests] ADD [ProvisionedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014234056_AddWorkspaceProvisioningState'
)
BEGIN
    ALTER TABLE [DevelopmentWorkspaceRequests] ADD [ProvisioningError] nvarchar(500) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014234056_AddWorkspaceProvisioningState'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014234056_AddWorkspaceProvisioningState', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015000939_AddArchitecturePlanRecords'
)
BEGIN
    ALTER TABLE [DevelopmentWorkspaceRequests] ADD CONSTRAINT [AK_DevelopmentWorkspaceRequests_TenantId_Id] UNIQUE ([TenantId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015000939_AddArchitecturePlanRecords'
)
BEGIN
    CREATE TABLE [ArchitecturePlanRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [BranchName] nvarchar(256) NOT NULL,
        [CommitSha] nvarchar(64) NOT NULL,
        [Summary] nvarchar(3000) NOT NULL,
        [PlanJson] nvarchar(max) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ArchitecturePlanRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ArchitecturePlanRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ArchitecturePlanRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ArchitecturePlanRecords_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015000939_AddArchitecturePlanRecords'
)
BEGIN
    CREATE INDEX [IX_ArchitecturePlanRecords_TenantId_CreatedByUserId] ON [ArchitecturePlanRecords] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015000939_AddArchitecturePlanRecords'
)
BEGIN
    CREATE INDEX [IX_ArchitecturePlanRecords_TenantId_ProjectId_CreatedAt] ON [ArchitecturePlanRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015000939_AddArchitecturePlanRecords'
)
BEGIN
    CREATE INDEX [IX_ArchitecturePlanRecords_TenantId_WorkspaceRequestId_CreatedAt] ON [ArchitecturePlanRecords] ([TenantId], [WorkspaceRequestId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015000939_AddArchitecturePlanRecords'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015000939_AddArchitecturePlanRecords', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015013010_LinkWorkspaceRequestsToDevelopmentRequests'
)
BEGIN
    ALTER TABLE [DevelopmentWorkspaceRequests] ADD [DevelopmentRequestId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015013010_LinkWorkspaceRequestsToDevelopmentRequests'
)
BEGIN
    ALTER TABLE [DevelopmentRequests] ADD CONSTRAINT [AK_DevelopmentRequests_TenantId_Id] UNIQUE ([TenantId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015013010_LinkWorkspaceRequestsToDevelopmentRequests'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_DevelopmentRequestId] ON [DevelopmentWorkspaceRequests] ([TenantId], [DevelopmentRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015013010_LinkWorkspaceRequestsToDevelopmentRequests'
)
BEGIN
    ALTER TABLE [DevelopmentWorkspaceRequests] ADD CONSTRAINT [FK_DevelopmentWorkspaceRequests_DevelopmentRequests_TenantId_DevelopmentRequestId] FOREIGN KEY ([TenantId], [DevelopmentRequestId]) REFERENCES [DevelopmentRequests] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015013010_LinkWorkspaceRequestsToDevelopmentRequests'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015013010_LinkWorkspaceRequestsToDevelopmentRequests', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015014817_PersistAITestPlans'
)
BEGIN
    CREATE TABLE [AITestPlanRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [BranchName] nvarchar(256) NOT NULL,
        [CommitSha] nvarchar(64) NOT NULL,
        [Summary] nvarchar(2000) NOT NULL,
        [PlanJson] nvarchar(max) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AITestPlanRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AITestPlanRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_AITestPlanRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_AITestPlanRecords_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015014817_PersistAITestPlans'
)
BEGIN
    CREATE INDEX [IX_AITestPlanRecords_TenantId_CreatedByUserId] ON [AITestPlanRecords] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015014817_PersistAITestPlans'
)
BEGIN
    CREATE INDEX [IX_AITestPlanRecords_TenantId_ProjectId_CreatedAt] ON [AITestPlanRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015014817_PersistAITestPlans'
)
BEGIN
    CREATE INDEX [IX_AITestPlanRecords_TenantId_WorkspaceRequestId_CreatedAt] ON [AITestPlanRecords] ([TenantId], [WorkspaceRequestId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015014817_PersistAITestPlans'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015014817_PersistAITestPlans', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015015559_AddWorkspaceBranchName'
)
BEGIN
    ALTER TABLE [DevelopmentWorkspaceRequests] ADD [WorkspaceBranchName] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015015559_AddWorkspaceBranchName'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015015559_AddWorkspaceBranchName', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015022553_AddStudioConversations'
)
BEGIN
    CREATE TABLE [StudioConversations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Title] nvarchar(180) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StudioConversations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StudioConversations_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StudioConversations_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioConversations_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioConversations_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015022553_AddStudioConversations'
)
BEGIN
    CREATE TABLE [StudioConversationMessages] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ConversationId] uniqueidentifier NOT NULL,
        [Role] nvarchar(16) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StudioConversationMessages] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_StudioConversationMessages_StudioConversations_TenantId_ConversationId] FOREIGN KEY ([TenantId], [ConversationId]) REFERENCES [StudioConversations] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015022553_AddStudioConversations'
)
BEGIN
    CREATE INDEX [IX_StudioConversationMessages_TenantId_ConversationId_CreatedAt] ON [StudioConversationMessages] ([TenantId], [ConversationId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015022553_AddStudioConversations'
)
BEGIN
    CREATE INDEX [IX_StudioConversations_TenantId_CreatedByUserId_UpdatedAt] ON [StudioConversations] ([TenantId], [CreatedByUserId], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015022553_AddStudioConversations'
)
BEGIN
    CREATE INDEX [IX_StudioConversations_TenantId_ProjectId] ON [StudioConversations] ([TenantId], [ProjectId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015022553_AddStudioConversations'
)
BEGIN
    CREATE INDEX [IX_StudioConversations_TenantId_WorkspaceRequestId_UpdatedAt] ON [StudioConversations] ([TenantId], [WorkspaceRequestId], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015022553_AddStudioConversations'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015022553_AddStudioConversations', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015050620_AddReleaseCandidateRecords'
)
BEGIN
    CREATE TABLE [ReleaseCandidateRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [TestJobId] uniqueidentifier NOT NULL,
        [BranchName] nvarchar(256) NOT NULL,
        [CommitSha] nvarchar(64) NOT NULL,
        [TestTargetPath] nvarchar(512) NOT NULL,
        [TestSnapshotSha256] nvarchar(64) NOT NULL,
        [TestCompletedAt] datetimeoffset NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ReleaseCandidateRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_ReleaseCandidateRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_ReleaseCandidateRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ReleaseCandidateRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ReleaseCandidateRecords_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015050620_AddReleaseCandidateRecords'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateRecords_TenantId_CreatedByUserId] ON [ReleaseCandidateRecords] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015050620_AddReleaseCandidateRecords'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateRecords_TenantId_ProjectId_CreatedAt] ON [ReleaseCandidateRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015050620_AddReleaseCandidateRecords'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateRecords_TenantId_WorkspaceRequestId_CreatedAt] ON [ReleaseCandidateRecords] ([TenantId], [WorkspaceRequestId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015050620_AddReleaseCandidateRecords'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ReleaseCandidateRecords_TenantId_WorkspaceRequestId_TestJobId] ON [ReleaseCandidateRecords] ([TenantId], [WorkspaceRequestId], [TestJobId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015050620_AddReleaseCandidateRecords'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015050620_AddReleaseCandidateRecords', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015051302_AddReleaseCandidateReviews'
)
BEGIN
    CREATE TABLE [ReleaseCandidateReviewRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [ReleaseCandidateId] uniqueidentifier NOT NULL,
        [ReviewedByUserId] uniqueidentifier NOT NULL,
        [Decision] nvarchar(16) NOT NULL,
        [Note] nvarchar(1000) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ReleaseCandidateReviewRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ReleaseCandidateReviewRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ReleaseCandidateReviewRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ReleaseCandidateReviewRecords_ReleaseCandidateRecords_TenantId_ReleaseCandidateId] FOREIGN KEY ([TenantId], [ReleaseCandidateId]) REFERENCES [ReleaseCandidateRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ReleaseCandidateReviewRecords_TenantMemberships_TenantId_ReviewedByUserId] FOREIGN KEY ([TenantId], [ReviewedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015051302_AddReleaseCandidateReviews'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateReviewRecords_TenantId_ProjectId_CreatedAt] ON [ReleaseCandidateReviewRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015051302_AddReleaseCandidateReviews'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ReleaseCandidateReviewRecords_TenantId_ReleaseCandidateId] ON [ReleaseCandidateReviewRecords] ([TenantId], [ReleaseCandidateId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015051302_AddReleaseCandidateReviews'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateReviewRecords_TenantId_ReviewedByUserId] ON [ReleaseCandidateReviewRecords] ([TenantId], [ReviewedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015051302_AddReleaseCandidateReviews'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateReviewRecords_TenantId_WorkspaceRequestId] ON [ReleaseCandidateReviewRecords] ([TenantId], [WorkspaceRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015051302_AddReleaseCandidateReviews'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015051302_AddReleaseCandidateReviews', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015072350_AddStudioReleaseVersions'
)
BEGIN
    CREATE TABLE [StudioReleaseVersionRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [ReleaseCandidateId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Version] nvarchar(128) NOT NULL,
        [CommitSha] nvarchar(64) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StudioReleaseVersionRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StudioReleaseVersionRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StudioReleaseVersionRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseVersionRecords_ReleaseCandidateRecords_TenantId_ReleaseCandidateId] FOREIGN KEY ([TenantId], [ReleaseCandidateId]) REFERENCES [ReleaseCandidateRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseVersionRecords_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015072350_AddStudioReleaseVersions'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseVersionRecords_TenantId_CreatedByUserId] ON [StudioReleaseVersionRecords] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015072350_AddStudioReleaseVersions'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleaseVersionRecords_TenantId_ProjectId_Version] ON [StudioReleaseVersionRecords] ([TenantId], [ProjectId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015072350_AddStudioReleaseVersions'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleaseVersionRecords_TenantId_ReleaseCandidateId] ON [StudioReleaseVersionRecords] ([TenantId], [ReleaseCandidateId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015072350_AddStudioReleaseVersions'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015072350_AddStudioReleaseVersions', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015074726_AddStudioReleasePackages'
)
BEGIN
    CREATE TABLE [StudioReleasePackageRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [ReleaseVersionId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Version] nvarchar(128) NOT NULL,
        [CommitSha] nvarchar(64) NOT NULL,
        [TestSnapshotSha256] nvarchar(64) NOT NULL,
        [PackageSha256] nvarchar(64) NOT NULL,
        [FileName] nvarchar(180) NOT NULL,
        [SizeBytes] bigint NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StudioReleasePackageRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StudioReleasePackageRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StudioReleasePackageRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleasePackageRecords_StudioReleaseVersionRecords_TenantId_ReleaseVersionId] FOREIGN KEY ([TenantId], [ReleaseVersionId]) REFERENCES [StudioReleaseVersionRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleasePackageRecords_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015074726_AddStudioReleasePackages'
)
BEGIN
    CREATE INDEX [IX_StudioReleasePackageRecords_TenantId_CreatedByUserId] ON [StudioReleasePackageRecords] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015074726_AddStudioReleasePackages'
)
BEGIN
    CREATE INDEX [IX_StudioReleasePackageRecords_TenantId_ProjectId_CreatedAt] ON [StudioReleasePackageRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015074726_AddStudioReleasePackages'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleasePackageRecords_TenantId_ReleaseVersionId] ON [StudioReleasePackageRecords] ([TenantId], [ReleaseVersionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015074726_AddStudioReleasePackages'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015074726_AddStudioReleasePackages', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015081245_AddStudioReleaseDeployments'
)
BEGIN
    CREATE TABLE [StudioReleaseDeploymentRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [ReleasePackageId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [RollbackOfDeploymentId] uniqueidentifier NULL,
        [IdempotencyKey] uniqueidentifier NOT NULL,
        [Environment] nvarchar(16) NOT NULL,
        [Provider] nvarchar(32) NOT NULL,
        [Status] nvarchar(24) NOT NULL,
        [PackageSha256] nvarchar(64) NOT NULL,
        [CommitSha] nvarchar(64) NOT NULL,
        [ProviderDeploymentId] nvarchar(128) NULL,
        [FailureCode] nvarchar(64) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [StartedAt] datetimeoffset NULL,
        [CompletedAt] datetimeoffset NULL,
        CONSTRAINT [PK_StudioReleaseDeploymentRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StudioReleaseDeploymentRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId] FOREIGN KEY ([TenantId], [RollbackOfDeploymentId]) REFERENCES [StudioReleaseDeploymentRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId] FOREIGN KEY ([TenantId], [ReleasePackageId]) REFERENCES [StudioReleasePackageRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015081245_AddStudioReleaseDeployments'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_CreatedByUserId] ON [StudioReleaseDeploymentRecords] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015081245_AddStudioReleaseDeployments'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_IdempotencyKey] ON [StudioReleaseDeploymentRecords] ([TenantId], [IdempotencyKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015081245_AddStudioReleaseDeployments'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_ProjectId_Environment_CreatedAt] ON [StudioReleaseDeploymentRecords] ([TenantId], [ProjectId], [Environment], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015081245_AddStudioReleaseDeployments'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_ReleasePackageId] ON [StudioReleaseDeploymentRecords] ([TenantId], [ReleasePackageId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015081245_AddStudioReleaseDeployments'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId] ON [StudioReleaseDeploymentRecords] ([TenantId], [RollbackOfDeploymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015081245_AddStudioReleaseDeployments'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015081245_AddStudioReleaseDeployments', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015083211_AddStudioReleaseRollbackMetadata'
)
BEGIN
    ALTER TABLE [StudioReleaseDeploymentRecords] ADD [EnvironmentUrl] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015083211_AddStudioReleaseRollbackMetadata'
)
BEGIN
    ALTER TABLE [StudioReleaseDeploymentRecords] ADD [RollbackTargetDeploymentId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015083211_AddStudioReleaseRollbackMetadata'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId] ON [StudioReleaseDeploymentRecords] ([TenantId], [RollbackTargetDeploymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015083211_AddStudioReleaseRollbackMetadata'
)
BEGIN
    ALTER TABLE [StudioReleaseDeploymentRecords] ADD CONSTRAINT [FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId] FOREIGN KEY ([TenantId], [RollbackTargetDeploymentId]) REFERENCES [StudioReleaseDeploymentRecords] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015083211_AddStudioReleaseRollbackMetadata'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015083211_AddStudioReleaseRollbackMetadata', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015085115_AddStudioProductionPromotionApprovals'
)
BEGIN
    CREATE TABLE [StudioProductionPromotionApprovalRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [StagingDeploymentId] uniqueidentifier NOT NULL,
        [ReleasePackageId] uniqueidentifier NOT NULL,
        [RequestedByUserId] uniqueidentifier NOT NULL,
        [ReviewedByUserId] uniqueidentifier NULL,
        [Status] nvarchar(24) NOT NULL,
        [RequestNote] nvarchar(1000) NOT NULL,
        [ReviewNote] nvarchar(1000) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReviewedAt] datetimeoffset NULL,
        CONSTRAINT [PK_StudioProductionPromotionApprovalRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StudioProductionPromotionApprovalRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StudioProductionPromotionApprovalRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioProductionPromotionApprovalRecords_StudioReleaseDeploymentRecords_TenantId_StagingDeploymentId] FOREIGN KEY ([TenantId], [StagingDeploymentId]) REFERENCES [StudioReleaseDeploymentRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioProductionPromotionApprovalRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId] FOREIGN KEY ([TenantId], [ReleasePackageId]) REFERENCES [StudioReleasePackageRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioProductionPromotionApprovalRecords_TenantMemberships_TenantId_RequestedByUserId] FOREIGN KEY ([TenantId], [RequestedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioProductionPromotionApprovalRecords_TenantMemberships_TenantId_ReviewedByUserId] FOREIGN KEY ([TenantId], [ReviewedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015085115_AddStudioProductionPromotionApprovals'
)
BEGIN
    CREATE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_ProjectId_Status_CreatedAt] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [ProjectId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015085115_AddStudioProductionPromotionApprovals'
)
BEGIN
    CREATE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_ReleasePackageId] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [ReleasePackageId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015085115_AddStudioProductionPromotionApprovals'
)
BEGIN
    CREATE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_RequestedByUserId] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [RequestedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015085115_AddStudioProductionPromotionApprovals'
)
BEGIN
    CREATE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_ReviewedByUserId] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [ReviewedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015085115_AddStudioProductionPromotionApprovals'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_StagingDeploymentId] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [StagingDeploymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015085115_AddStudioProductionPromotionApprovals'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015085115_AddStudioProductionPromotionApprovals', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015102339_AddStockCustomFields'
)
BEGIN
    CREATE TABLE [StockItemCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StockItemCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StockItemCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StockItemCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015102339_AddStockCustomFields'
)
BEGIN
    CREATE TABLE [StockItemCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StockItemCustomFieldValues] PRIMARY KEY ([TenantId], [StockItemId], [DefinitionId]),
        CONSTRAINT [FK_StockItemCustomFieldValues_StockItemCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [StockItemCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StockItemCustomFieldValues_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015102339_AddStockCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItemCustomFieldDefinitions_TenantId_Code] ON [StockItemCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015102339_AddStockCustomFields'
)
BEGIN
    CREATE INDEX [IX_StockItemCustomFieldValues_TenantId_DefinitionId] ON [StockItemCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015102339_AddStockCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015102339_AddStockCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015103228_AddStockCustomFieldRevisions'
)
BEGIN
    CREATE TABLE [StockItemCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StockItemCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StockItemCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StockItemCustomFieldDefinitionRevisions_StockItemCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [StockItemCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StockItemCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015103228_AddStockCustomFieldRevisions'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItemCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [StockItemCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015103228_AddStockCustomFieldRevisions'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015103228_AddStockCustomFieldRevisions', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015103924_AddStockCustomFieldValueHistory'
)
BEGIN
    CREATE TABLE [StockItemCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StockItemCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_StockItemCustomFieldValueRevisions_StockItemCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [StockItemCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StockItemCustomFieldValueRevisions_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StockItemCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015103924_AddStockCustomFieldValueHistory'
)
BEGIN
    CREATE INDEX [IX_StockItemCustomFieldValueRevisions_TenantId_DefinitionId] ON [StockItemCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015103924_AddStockCustomFieldValueHistory'
)
BEGIN
    CREATE INDEX [IX_StockItemCustomFieldValueRevisions_TenantId_StockItemId_DefinitionId_CreatedAt] ON [StockItemCustomFieldValueRevisions] ([TenantId], [StockItemId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015103924_AddStockCustomFieldValueHistory'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015103924_AddStockCustomFieldValueHistory', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015105114_AddRequiredStockCustomFields'
)
BEGIN
    ALTER TABLE [StockItemCustomFieldDefinitions] ADD [IsRequired] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015105114_AddRequiredStockCustomFields'
)
BEGIN
    ALTER TABLE [StockItemCustomFieldDefinitionRevisions] ADD [IsRequired] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015105114_AddRequiredStockCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015105114_AddRequiredStockCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015105908_AddStockItemEditingConcurrency'
)
BEGIN
    ALTER TABLE [StockItems] ADD [RowVersion] rowversion NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015105908_AddStockItemEditingConcurrency'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015105908_AddStockItemEditingConcurrency', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015110507_AddCustomerCustomFields'
)
BEGIN
    CREATE TABLE [CustomerCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CustomerCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_CustomerCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015110507_AddCustomerCustomFields'
)
BEGIN
    CREATE TABLE [CustomerCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CustomerCustomFieldValues] PRIMARY KEY ([TenantId], [CustomerId], [DefinitionId]),
        CONSTRAINT [FK_CustomerCustomFieldValues_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CustomerCustomFieldValues_CustomerCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [CustomerCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015110507_AddCustomerCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCustomFieldDefinitions_TenantId_Code] ON [CustomerCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015110507_AddCustomerCustomFields'
)
BEGIN
    CREATE INDEX [IX_CustomerCustomFieldValues_TenantId_DefinitionId] ON [CustomerCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015110507_AddCustomerCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015110507_AddCustomerCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111025_AddRequiredCustomerCustomFields'
)
BEGIN
    ALTER TABLE [CustomerCustomFieldDefinitions] ADD [IsRequired] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111025_AddRequiredCustomerCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015111025_AddRequiredCustomerCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    ALTER TABLE [CustomerCustomFieldValues] ADD [DefinitionVersion] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    ALTER TABLE [CustomerCustomFieldDefinitions] ADD [Version] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    CREATE TABLE [CustomerCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CustomerCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_CustomerCustomFieldDefinitionRevisions_CustomerCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [CustomerCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    CREATE TABLE [CustomerCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CustomerCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CustomerCustomFieldValueRevisions_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerCustomFieldValueRevisions_CustomerCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [CustomerCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [CustomerCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    CREATE INDEX [IX_CustomerCustomFieldValueRevisions_TenantId_CustomerId_DefinitionId_CreatedAt] ON [CustomerCustomFieldValueRevisions] ([TenantId], [CustomerId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    CREATE INDEX [IX_CustomerCustomFieldValueRevisions_TenantId_DefinitionId] ON [CustomerCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    UPDATE [dbo].[CustomerCustomFieldDefinitions] SET [Version] = 1 WHERE [Version] = 0;
    UPDATE [dbo].[CustomerCustomFieldValues] SET [DefinitionVersion] = 1 WHERE [DefinitionVersion] = 0;
    INSERT INTO [dbo].[CustomerCustomFieldDefinitionRevisions]
        ([Id], [TenantId], [DefinitionId], [Version], [Code], [Label], [DataType], [MaxLength], [IsRequired], [IsActive], [ChangeKind], [ChangedByUserId], [CreatedAt])
    SELECT NEWID(), [TenantId], [Id], [Version], [Code], [Label], [DataType], [MaxLength], [IsRequired], [IsActive], N'Baseline', NULL, [CreatedAt]
    FROM [dbo].[CustomerCustomFieldDefinitions];
    INSERT INTO [dbo].[CustomerCustomFieldValueRevisions]
        ([Id], [TenantId], [CustomerId], [DefinitionId], [PreviousValue], [NewValue], [DefinitionVersion], [ChangedByUserId], [CreatedAt])
    SELECT NEWID(), [TenantId], [CustomerId], [DefinitionId], NULL, [Value], [DefinitionVersion], NULL, [UpdatedAt]
    FROM [dbo].[CustomerCustomFieldValues];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015111729_AddCustomerCustomFieldHistory'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015111729_AddCustomerCustomFieldHistory', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [InventoryTransferId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    CREATE TABLE [InventoryTransfers] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [FromWarehouseId] uniqueidentifier NOT NULL,
        [ToWarehouseId] uniqueidentifier NOT NULL,
        [Code] nvarchar(48) NOT NULL,
        [TransferDate] date NOT NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_InventoryTransfers] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_InventoryTransfers_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_InventoryTransfers_Warehouses_TenantId_FromWarehouseId] FOREIGN KEY ([TenantId], [FromWarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransfers_Warehouses_TenantId_ToWarehouseId] FOREIGN KEY ([TenantId], [ToWarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_InventoryTransactions_TenantId_InventoryTransferId_WarehouseId_StockItemId] ON [InventoryTransactions] ([TenantId], [InventoryTransferId], [WarehouseId], [StockItemId]) WHERE [InventoryTransferId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    CREATE UNIQUE INDEX [IX_InventoryTransfers_TenantId_Code] ON [InventoryTransfers] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    CREATE INDEX [IX_InventoryTransfers_TenantId_FromWarehouseId] ON [InventoryTransfers] ([TenantId], [FromWarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    CREATE UNIQUE INDEX [IX_InventoryTransfers_TenantId_RequestId] ON [InventoryTransfers] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    CREATE INDEX [IX_InventoryTransfers_TenantId_ToWarehouseId] ON [InventoryTransfers] ([TenantId], [ToWarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    CREATE INDEX [IX_InventoryTransfers_TenantId_TransferDate_CreatedAt] ON [InventoryTransfers] ([TenantId], [TransferDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD CONSTRAINT [FK_InventoryTransactions_InventoryTransfers_TenantId_InventoryTransferId] FOREIGN KEY ([TenantId], [InventoryTransferId]) REFERENCES [InventoryTransfers] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015112728_AddInventoryTransfers'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015112728_AddInventoryTransfers', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015114920_AddWarehouseRowVersion'
)
BEGIN
    ALTER TABLE [Warehouses] ADD [RowVersion] rowversion NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015114920_AddWarehouseRowVersion'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015114920_AddWarehouseRowVersion', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    CREATE TABLE [PurchaseRequests] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestedByUserId] uniqueidentifier NOT NULL,
        [ReviewedByUserId] uniqueidentifier NULL,
        [Code] nvarchar(40) NOT NULL,
        [RequestDate] date NOT NULL,
        [NeededByDate] date NULL,
        [Description] nvarchar(1000) NOT NULL,
        [Status] nvarchar(16) NOT NULL,
        [ReviewNote] nvarchar(1000) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReviewedAt] datetimeoffset NULL,
        CONSTRAINT [PK_PurchaseRequests] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseRequests_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseRequests_TenantMemberships_RequestedByUserId_TenantId] FOREIGN KEY ([RequestedByUserId], [TenantId]) REFERENCES [TenantMemberships] ([UserId], [TenantId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseRequests_TenantMemberships_ReviewedByUserId_TenantId] FOREIGN KEY ([ReviewedByUserId], [TenantId]) REFERENCES [TenantMemberships] ([UserId], [TenantId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseRequests_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    CREATE TABLE [PurchaseRequestLines] (
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseRequestId] uniqueidentifier NOT NULL,
        [LineNumber] int NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        CONSTRAINT [PK_PurchaseRequestLines] PRIMARY KEY ([TenantId], [PurchaseRequestId], [LineNumber]),
        CONSTRAINT [CK_PurchaseRequestLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_PurchaseRequestLines_PurchaseRequests_TenantId_PurchaseRequestId] FOREIGN KEY ([TenantId], [PurchaseRequestId]) REFERENCES [PurchaseRequests] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_PurchaseRequestLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestLines_TenantId_StockItemId] ON [PurchaseRequestLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequests_RequestedByUserId_TenantId] ON [PurchaseRequests] ([RequestedByUserId], [TenantId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequests_ReviewedByUserId_TenantId] ON [PurchaseRequests] ([ReviewedByUserId], [TenantId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseRequests_TenantId_Code] ON [PurchaseRequests] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequests_TenantId_Status_CreatedAt] ON [PurchaseRequests] ([TenantId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015125105_AddPurchaseRequests'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015125105_AddPurchaseRequests', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130018_LinkPurchaseOrdersToRequests'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD [SourcePurchaseRequestId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130018_LinkPurchaseOrdersToRequests'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_SourcePurchaseRequestId] ON [PurchaseOrders] ([TenantId], [SourcePurchaseRequestId]) WHERE [SourcePurchaseRequestId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130018_LinkPurchaseOrdersToRequests'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD CONSTRAINT [FK_PurchaseOrders_PurchaseRequests_TenantId_SourcePurchaseRequestId] FOREIGN KEY ([TenantId], [SourcePurchaseRequestId]) REFERENCES [PurchaseRequests] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130018_LinkPurchaseOrdersToRequests'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015130018_LinkPurchaseOrdersToRequests', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD [SourceSupplierQuoteId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    CREATE TABLE [PurchaseSupplierQuotes] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseRequestId] uniqueidentifier NOT NULL,
        [SupplierId] uniqueidentifier NOT NULL,
        [Code] nvarchar(64) NOT NULL,
        [QuoteDate] date NOT NULL,
        [ValidUntil] date NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Status] nvarchar(16) NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [Notes] nvarchar(1000) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseSupplierQuotes] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseSupplierQuotes_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_PurchaseSupplierQuotes_TenantId_Id_PurchaseRequestId] UNIQUE ([TenantId], [Id], [PurchaseRequestId]),
        CONSTRAINT [FK_PurchaseSupplierQuotes_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseSupplierQuotes_PurchaseRequests_TenantId_PurchaseRequestId] FOREIGN KEY ([TenantId], [PurchaseRequestId]) REFERENCES [PurchaseRequests] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    CREATE TABLE [PurchaseSupplierQuoteLines] (
        [TenantId] uniqueidentifier NOT NULL,
        [QuoteId] uniqueidentifier NOT NULL,
        [RequestLineNumber] int NOT NULL,
        [PurchaseRequestId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UnitPrice] decimal(18,4) NOT NULL,
        [DiscountPercent] decimal(5,2) NOT NULL,
        [VatPercent] decimal(5,2) NOT NULL,
        [LineSubtotal] decimal(18,2) NOT NULL,
        [DiscountAmount] decimal(18,2) NOT NULL,
        [TaxAmount] decimal(18,2) NOT NULL,
        [LineTotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_PurchaseSupplierQuoteLines] PRIMARY KEY ([TenantId], [QuoteId], [RequestLineNumber]),
        CONSTRAINT [CK_PurchaseSupplierQuoteLines_DiscountRange] CHECK ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100),
        CONSTRAINT [CK_PurchaseSupplierQuoteLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [CK_PurchaseSupplierQuoteLines_VatRange] CHECK ([VatPercent] >= 0 AND [VatPercent] <= 100),
        CONSTRAINT [FK_PurchaseSupplierQuoteLines_PurchaseRequestLines_TenantId_PurchaseRequestId_RequestLineNumber] FOREIGN KEY ([TenantId], [PurchaseRequestId], [RequestLineNumber]) REFERENCES [PurchaseRequestLines] ([TenantId], [PurchaseRequestId], [LineNumber]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseSupplierQuoteLines_PurchaseSupplierQuotes_TenantId_QuoteId_PurchaseRequestId] FOREIGN KEY ([TenantId], [QuoteId], [PurchaseRequestId]) REFERENCES [PurchaseSupplierQuotes] ([TenantId], [Id], [PurchaseRequestId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_SourceSupplierQuoteId] ON [PurchaseOrders] ([TenantId], [SourceSupplierQuoteId]) WHERE [SourceSupplierQuoteId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId] ON [PurchaseOrders] ([TenantId], [SourceSupplierQuoteId], [SourcePurchaseRequestId]) WHERE [SourceSupplierQuoteId] IS NOT NULL AND [SourcePurchaseRequestId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteLines_TenantId_PurchaseRequestId_RequestLineNumber] ON [PurchaseSupplierQuoteLines] ([TenantId], [PurchaseRequestId], [RequestLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteLines_TenantId_QuoteId_PurchaseRequestId] ON [PurchaseSupplierQuoteLines] ([TenantId], [QuoteId], [PurchaseRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuotes_TenantId_PurchaseRequestId_Status_CreatedAt] ON [PurchaseSupplierQuotes] ([TenantId], [PurchaseRequestId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseSupplierQuotes_TenantId_SupplierId_Code] ON [PurchaseSupplierQuotes] ([TenantId], [SupplierId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD CONSTRAINT [FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId] FOREIGN KEY ([TenantId], [SourceSupplierQuoteId], [SourcePurchaseRequestId]) REFERENCES [PurchaseSupplierQuotes] ([TenantId], [Id], [PurchaseRequestId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015130731_AddPurchaseSupplierQuotes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015130731_AddPurchaseSupplierQuotes', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    ALTER TABLE [SalesDeliveryLines] ADD [ReservationId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    CREATE TABLE [SalesOrderReservations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [FulfilledQuantity] decimal(18,4) NOT NULL,
        [Status] nvarchar(16) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReleasedAt] datetimeoffset NULL,
        CONSTRAINT [PK_SalesOrderReservations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesOrderReservations_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_SalesOrderReservations_TenantId_Id_OrderId_OrderLineNumber] UNIQUE ([TenantId], [Id], [OrderId], [OrderLineNumber]),
        CONSTRAINT [CK_SalesOrderReservations_FulfilledRange] CHECK ([FulfilledQuantity] >= 0 AND [FulfilledQuantity] <= [Quantity]),
        CONSTRAINT [CK_SalesOrderReservations_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_SalesOrderReservations_SalesOrderLines_TenantId_OrderId_OrderLineNumber] FOREIGN KEY ([TenantId], [OrderId], [OrderLineNumber]) REFERENCES [SalesOrderLines] ([TenantId], [OrderId], [LineNumber]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrderReservations_SalesOrders_TenantId_OrderId] FOREIGN KEY ([TenantId], [OrderId]) REFERENCES [SalesOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrderReservations_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrderReservations_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveryLines_TenantId_ReservationId_OrderId_OrderLineNumber] ON [SalesDeliveryLines] ([TenantId], [ReservationId], [OrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_SalesOrderReservations_TenantId_OrderId_OrderLineNumber] ON [SalesOrderReservations] ([TenantId], [OrderId], [OrderLineNumber]) WHERE [Status] = N''Active''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrderReservations_TenantId_RequestId_OrderId_OrderLineNumber] ON [SalesOrderReservations] ([TenantId], [RequestId], [OrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    CREATE INDEX [IX_SalesOrderReservations_TenantId_WarehouseId_Status] ON [SalesOrderReservations] ([TenantId], [WarehouseId], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    ALTER TABLE [SalesDeliveryLines] ADD CONSTRAINT [FK_SalesDeliveryLines_SalesOrderReservations_TenantId_ReservationId_OrderId_OrderLineNumber] FOREIGN KEY ([TenantId], [ReservationId], [OrderId], [OrderLineNumber]) REFERENCES [SalesOrderReservations] ([TenantId], [Id], [OrderId], [OrderLineNumber]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015132755_SalesOrderStockReservations'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015132755_SalesOrderStockReservations', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015133733_AddTenantExchangeRates'
)
BEGIN
    ALTER TABLE [Tenants] ADD [BaseCurrencyCode] nchar(3) NOT NULL DEFAULT N'TRY';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015133733_AddTenantExchangeRates'
)
BEGIN
    CREATE TABLE [TenantExchangeRates] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [RateDate] date NOT NULL,
        [Revision] int NOT NULL,
        [Rate] decimal(18,8) NOT NULL,
        [Source] nvarchar(160) NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantExchangeRates] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantExchangeRates_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantExchangeRates_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015133733_AddTenantExchangeRates'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantExchangeRates_TenantId_CurrencyCode_RateDate_Revision] ON [TenantExchangeRates] ([TenantId], [CurrencyCode], [RateDate], [Revision]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015133733_AddTenantExchangeRates'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015133733_AddTenantExchangeRates', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015134918_AddInventoryWeightedAverageCost'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [UnitCostBase] decimal(18,8) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015134918_AddInventoryWeightedAverageCost'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015134918_AddInventoryWeightedAverageCost', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    ALTER TABLE [DevelopmentProjects] ADD [GitHubInstallationId] bigint NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE TABLE [GitHubInstallationAuthorizationStates] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [StateHash] varchar(64) NOT NULL,
        [ExpiresAt] datetimeoffset NOT NULL,
        [ConsumedAt] datetimeoffset NULL,
        CONSTRAINT [PK_GitHubInstallationAuthorizationStates] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_GitHubInstallationAuthorizationStates_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_GitHubInstallationAuthorizationStates_TenantMemberships_TenantId_UserId] FOREIGN KEY ([TenantId], [UserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseRequestCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseRequestCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseRequestCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseRequestCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseRequestCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseRequestCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseRequestCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseRequestCustomFieldDefinitionRevisions_PurchaseRequestCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseRequestCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseRequestCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseRequestCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseRequestId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseRequestCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PurchaseRequestCustomFieldValueRevisions_PurchaseRequestCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseRequestCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseRequestCustomFieldValueRevisions_PurchaseRequests_TenantId_PurchaseRequestId] FOREIGN KEY ([TenantId], [PurchaseRequestId]) REFERENCES [PurchaseRequests] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseRequestCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseRequestCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseRequestId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseRequestCustomFieldValues] PRIMARY KEY ([TenantId], [PurchaseRequestId], [DefinitionId]),
        CONSTRAINT [FK_PurchaseRequestCustomFieldValues_PurchaseRequestCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseRequestCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseRequestCustomFieldValues_PurchaseRequests_TenantId_PurchaseRequestId] FOREIGN KEY ([TenantId], [PurchaseRequestId]) REFERENCES [PurchaseRequests] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE INDEX [IX_GitHubInstallationAuthorizationStates_ExpiresAt_ConsumedAt] ON [GitHubInstallationAuthorizationStates] ([ExpiresAt], [ConsumedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_GitHubInstallationAuthorizationStates_StateHash] ON [GitHubInstallationAuthorizationStates] ([StateHash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE INDEX [IX_GitHubInstallationAuthorizationStates_TenantId_ProjectId] ON [GitHubInstallationAuthorizationStates] ([TenantId], [ProjectId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE INDEX [IX_GitHubInstallationAuthorizationStates_TenantId_UserId] ON [GitHubInstallationAuthorizationStates] ([TenantId], [UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseRequestCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseRequestCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseRequestCustomFieldDefinitions_TenantId_Code] ON [PurchaseRequestCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseRequestCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValueRevisions_TenantId_PurchaseRequestId_DefinitionId_CreatedAt] ON [PurchaseRequestCustomFieldValueRevisions] ([TenantId], [PurchaseRequestId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValues_TenantId_DefinitionId] ON [PurchaseRequestCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015141057_AddPurchaseRequestCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015141057_AddPurchaseRequestCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE TABLE [WarehouseCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_WarehouseCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_WarehouseCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_WarehouseCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE TABLE [WarehouseCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_WarehouseCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_WarehouseCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_WarehouseCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_WarehouseCustomFieldDefinitionRevisions_WarehouseCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [WarehouseCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE TABLE [WarehouseCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_WarehouseCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_WarehouseCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_WarehouseCustomFieldValueRevisions_WarehouseCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [WarehouseCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_WarehouseCustomFieldValueRevisions_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE TABLE [WarehouseCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_WarehouseCustomFieldValues] PRIMARY KEY ([TenantId], [WarehouseId], [DefinitionId]),
        CONSTRAINT [FK_WarehouseCustomFieldValues_WarehouseCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [WarehouseCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_WarehouseCustomFieldValues_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WarehouseCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [WarehouseCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WarehouseCustomFieldDefinitions_TenantId_Code] ON [WarehouseCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE INDEX [IX_WarehouseCustomFieldValueRevisions_TenantId_DefinitionId] ON [WarehouseCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE INDEX [IX_WarehouseCustomFieldValueRevisions_TenantId_WarehouseId_DefinitionId_CreatedAt] ON [WarehouseCustomFieldValueRevisions] ([TenantId], [WarehouseId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    CREATE INDEX [IX_WarehouseCustomFieldValues_TenantId_DefinitionId] ON [WarehouseCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142904_AddWarehouseCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015142904_AddWarehouseCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE TABLE [SalesQuoteCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesQuoteCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesQuoteCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesQuoteCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE TABLE [SalesQuoteCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesQuoteCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesQuoteCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesQuoteCustomFieldDefinitionRevisions_SalesQuoteCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesQuoteCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesQuoteCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE TABLE [SalesQuoteCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [QuoteId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesQuoteCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SalesQuoteCustomFieldValueRevisions_SalesQuoteCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesQuoteCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesQuoteCustomFieldValueRevisions_SalesQuotes_TenantId_QuoteId] FOREIGN KEY ([TenantId], [QuoteId]) REFERENCES [SalesQuotes] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesQuoteCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE TABLE [SalesQuoteCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [QuoteId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesQuoteCustomFieldValues] PRIMARY KEY ([TenantId], [QuoteId], [DefinitionId]),
        CONSTRAINT [FK_SalesQuoteCustomFieldValues_SalesQuoteCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesQuoteCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesQuoteCustomFieldValues_SalesQuotes_TenantId_QuoteId] FOREIGN KEY ([TenantId], [QuoteId]) REFERENCES [SalesQuotes] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesQuoteCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [SalesQuoteCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesQuoteCustomFieldDefinitions_TenantId_Code] ON [SalesQuoteCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteCustomFieldValueRevisions_TenantId_DefinitionId] ON [SalesQuoteCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteCustomFieldValueRevisions_TenantId_QuoteId_DefinitionId_CreatedAt] ON [SalesQuoteCustomFieldValueRevisions] ([TenantId], [QuoteId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteCustomFieldValues_TenantId_DefinitionId] ON [SalesQuoteCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144110_AddSalesQuoteCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015144110_AddSalesQuoteCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE TABLE [SalesOrderCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesOrderCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesOrderCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesOrderCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE TABLE [SalesOrderCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesOrderCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesOrderCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesOrderCustomFieldDefinitionRevisions_SalesOrderCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesOrderCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrderCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE TABLE [SalesOrderCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesOrderCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SalesOrderCustomFieldValueRevisions_SalesOrderCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesOrderCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrderCustomFieldValueRevisions_SalesOrders_TenantId_OrderId] FOREIGN KEY ([TenantId], [OrderId]) REFERENCES [SalesOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrderCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE TABLE [SalesOrderCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesOrderCustomFieldValues] PRIMARY KEY ([TenantId], [OrderId], [DefinitionId]),
        CONSTRAINT [FK_SalesOrderCustomFieldValues_SalesOrderCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesOrderCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesOrderCustomFieldValues_SalesOrders_TenantId_OrderId] FOREIGN KEY ([TenantId], [OrderId]) REFERENCES [SalesOrders] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrderCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [SalesOrderCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrderCustomFieldDefinitions_TenantId_Code] ON [SalesOrderCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesOrderCustomFieldValueRevisions_TenantId_DefinitionId] ON [SalesOrderCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesOrderCustomFieldValueRevisions_TenantId_OrderId_DefinitionId_CreatedAt] ON [SalesOrderCustomFieldValueRevisions] ([TenantId], [OrderId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesOrderCustomFieldValues_TenantId_DefinitionId] ON [SalesOrderCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015144833_AddSalesOrderCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015144833_AddSalesOrderCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseOrderCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseOrderCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseOrderCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseOrderCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseOrderCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseOrderCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseOrderCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseOrderCustomFieldDefinitionRevisions_PurchaseOrderCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseOrderCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrderCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseOrderCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseOrderId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseOrderCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PurchaseOrderCustomFieldValueRevisions_PurchaseOrderCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseOrderCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrderCustomFieldValueRevisions_PurchaseOrders_TenantId_PurchaseOrderId] FOREIGN KEY ([TenantId], [PurchaseOrderId]) REFERENCES [PurchaseOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrderCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseOrderCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseOrderId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseOrderCustomFieldValues] PRIMARY KEY ([TenantId], [PurchaseOrderId], [DefinitionId]),
        CONSTRAINT [FK_PurchaseOrderCustomFieldValues_PurchaseOrderCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseOrderCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrderCustomFieldValues_PurchaseOrders_TenantId_PurchaseOrderId] FOREIGN KEY ([TenantId], [PurchaseOrderId]) REFERENCES [PurchaseOrders] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseOrderCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseOrderCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseOrderCustomFieldDefinitions_TenantId_Code] ON [PurchaseOrderCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseOrderCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderCustomFieldValueRevisions_TenantId_PurchaseOrderId_DefinitionId_CreatedAt] ON [PurchaseOrderCustomFieldValueRevisions] ([TenantId], [PurchaseOrderId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderCustomFieldValues_TenantId_DefinitionId] ON [PurchaseOrderCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015145957_AddPurchaseOrderCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015145957_AddPurchaseOrderCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseSupplierQuoteCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseSupplierQuoteCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseSupplierQuoteCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseSupplierQuoteCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseSupplierQuoteCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [QuoteId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseSupplierQuoteCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldValueRevisions_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseSupplierQuoteCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldValueRevisions_PurchaseSupplierQuotes_TenantId_QuoteId] FOREIGN KEY ([TenantId], [QuoteId]) REFERENCES [PurchaseSupplierQuotes] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseSupplierQuoteCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [QuoteId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseSupplierQuoteCustomFieldValues] PRIMARY KEY ([TenantId], [QuoteId], [DefinitionId]),
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldValues_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseSupplierQuoteCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseSupplierQuoteCustomFieldValues_PurchaseSupplierQuotes_TenantId_QuoteId] FOREIGN KEY ([TenantId], [QuoteId]) REFERENCES [PurchaseSupplierQuotes] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseSupplierQuoteCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_Code] ON [PurchaseSupplierQuoteCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseSupplierQuoteCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_QuoteId_DefinitionId_CreatedAt] ON [PurchaseSupplierQuoteCustomFieldValueRevisions] ([TenantId], [QuoteId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteCustomFieldValues_TenantId_DefinitionId] ON [PurchaseSupplierQuoteCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015150925_AddPurchaseSupplierQuoteCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015150925_AddPurchaseSupplierQuoteCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseReceiptCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseReceiptCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseReceiptCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseReceiptCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseReceiptCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseReceiptCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseReceiptCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_PurchaseReceiptCustomFieldDefinitionRevisions_PurchaseReceiptCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseReceiptCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseReceiptCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseReceiptCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ReceiptId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseReceiptCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PurchaseReceiptCustomFieldValueRevisions_PurchaseReceiptCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseReceiptCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseReceiptCustomFieldValueRevisions_PurchaseReceipts_TenantId_ReceiptId] FOREIGN KEY ([TenantId], [ReceiptId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseReceiptCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE TABLE [PurchaseReceiptCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [ReceiptId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        CONSTRAINT [PK_PurchaseReceiptCustomFieldValues] PRIMARY KEY ([TenantId], [ReceiptId], [DefinitionId]),
        CONSTRAINT [FK_PurchaseReceiptCustomFieldValues_PurchaseReceiptCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [PurchaseReceiptCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseReceiptCustomFieldValues_PurchaseReceipts_TenantId_ReceiptId] FOREIGN KEY ([TenantId], [ReceiptId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceiptCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseReceiptCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceiptCustomFieldDefinitions_TenantId_Code] ON [PurchaseReceiptCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseReceiptCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptCustomFieldValueRevisions_TenantId_ReceiptId_DefinitionId_CreatedAt] ON [PurchaseReceiptCustomFieldValueRevisions] ([TenantId], [ReceiptId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptCustomFieldValues_TenantId_DefinitionId] ON [PurchaseReceiptCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015152242_AddPurchaseReceiptCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015152242_AddPurchaseReceiptCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE TABLE [SalesInvoiceCustomFieldDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [Version] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesInvoiceCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesInvoiceCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE TABLE [SalesInvoiceCustomFieldDefinitionRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Label] nvarchar(120) NOT NULL,
        [DataType] nvarchar(16) NOT NULL,
        [MaxLength] int NOT NULL,
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [ChangeKind] nvarchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesInvoiceCustomFieldDefinitionRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesInvoiceCustomFieldDefinitionRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldDefinitionRevisions_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesInvoiceCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceCustomFieldDefinitionRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE TABLE [SalesInvoiceCustomFieldValueRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [InvoiceId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [PreviousValue] nvarchar(500) NULL,
        [NewValue] nvarchar(500) NULL,
        [DefinitionVersion] int NOT NULL,
        [ChangedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [SalesInvoiceId] uniqueidentifier NULL,
        CONSTRAINT [PK_SalesInvoiceCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesInvoiceCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoices_SalesInvoiceId] FOREIGN KEY ([SalesInvoiceId]) REFERENCES [SalesInvoices] ([Id]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoices_TenantId_InvoiceId] FOREIGN KEY ([TenantId], [InvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE TABLE [SalesInvoiceCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [InvoiceId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [SalesInvoiceId] uniqueidentifier NULL,
        CONSTRAINT [PK_SalesInvoiceCustomFieldValues] PRIMARY KEY ([TenantId], [InvoiceId], [DefinitionId]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldValues_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesInvoiceCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceCustomFieldValues_SalesInvoices_SalesInvoiceId] FOREIGN KEY ([SalesInvoiceId]) REFERENCES [SalesInvoices] ([Id]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldValues_SalesInvoices_TenantId_InvoiceId] FOREIGN KEY ([TenantId], [InvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoiceCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [SalesInvoiceCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoiceCustomFieldDefinitions_TenantId_Code] ON [SalesInvoiceCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValueRevisions_SalesInvoiceId] ON [SalesInvoiceCustomFieldValueRevisions] ([SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValueRevisions_TenantId_DefinitionId] ON [SalesInvoiceCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValueRevisions_TenantId_InvoiceId_DefinitionId_CreatedAt] ON [SalesInvoiceCustomFieldValueRevisions] ([TenantId], [InvoiceId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValues_SalesInvoiceId] ON [SalesInvoiceCustomFieldValues] ([SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValues_TenantId_DefinitionId] ON [SalesInvoiceCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015175748_AddSalesInvoiceCustomFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015175748_AddSalesInvoiceCustomFields', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    DECLARE @hasMismatch bit = 0;
    DECLARE @checkValues nvarchar(max);

    IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValues', N'SalesInvoiceId') IS NOT NULL
    BEGIN
        IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValues', N'InvoiceId') IS NULL
            THROW 51001, 'Sales invoice custom-field migration stopped: InvoiceId is missing.', 1;
        SET @checkValues = N'IF EXISTS (SELECT 1 FROM [dbo].[SalesInvoiceCustomFieldValues] WHERE [SalesInvoiceId] IS NOT NULL AND ([InvoiceId] IS NULL OR [SalesInvoiceId] <> [InvoiceId])) SET @hasMismatch = 1;';
        EXEC sys.sp_executesql @checkValues, N'@hasMismatch bit OUTPUT', @hasMismatch = @hasMismatch OUTPUT;
    END;

    IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValueRevisions', N'SalesInvoiceId') IS NOT NULL
    BEGIN
        IF COL_LENGTH(N'dbo.SalesInvoiceCustomFieldValueRevisions', N'InvoiceId') IS NULL
            THROW 51002, 'Sales invoice custom-field history migration stopped: InvoiceId is missing.', 1;
        SET @checkValues = N'IF EXISTS (SELECT 1 FROM [dbo].[SalesInvoiceCustomFieldValueRevisions] WHERE [SalesInvoiceId] IS NOT NULL AND ([InvoiceId] IS NULL OR [SalesInvoiceId] <> [InvoiceId])) SET @hasMismatch = 1;';
        EXEC sys.sp_executesql @checkValues, N'@hasMismatch bit OUTPUT', @hasMismatch = @hasMismatch OUTPUT;
    END;

    IF @hasMismatch = 1
        THROW 51003, 'Sales invoice custom-field migration stopped: legacy invoice references differ from InvoiceId.', 1;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    ALTER TABLE [SalesInvoiceCustomFieldValueRevisions] DROP CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoices_SalesInvoiceId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    ALTER TABLE [SalesInvoiceCustomFieldValues] DROP CONSTRAINT [FK_SalesInvoiceCustomFieldValues_SalesInvoices_SalesInvoiceId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    DROP INDEX [IX_SalesInvoiceCustomFieldValues_SalesInvoiceId] ON [SalesInvoiceCustomFieldValues];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    DROP INDEX [IX_SalesInvoiceCustomFieldValueRevisions_SalesInvoiceId] ON [SalesInvoiceCustomFieldValueRevisions];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    DECLARE @var3 nvarchar(max);
    SELECT @var3 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesInvoiceCustomFieldValues]') AND [c].[name] = N'SalesInvoiceId');
    IF @var3 IS NOT NULL EXEC(N'ALTER TABLE [SalesInvoiceCustomFieldValues] DROP CONSTRAINT ' + @var3 + ';');
    ALTER TABLE [SalesInvoiceCustomFieldValues] DROP COLUMN [SalesInvoiceId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    DECLARE @var4 nvarchar(max);
    SELECT @var4 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesInvoiceCustomFieldValueRevisions]') AND [c].[name] = N'SalesInvoiceId');
    IF @var4 IS NOT NULL EXEC(N'ALTER TABLE [SalesInvoiceCustomFieldValueRevisions] DROP CONSTRAINT ' + @var4 + ';');
    ALTER TABLE [SalesInvoiceCustomFieldValueRevisions] DROP COLUMN [SalesInvoiceId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    CREATE TABLE [FxRevaluationVouchers] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [AsOfDate] date NOT NULL,
        [BaseCurrencyCode] nchar(3) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        CONSTRAINT [PK_FxRevaluationVouchers] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FxRevaluationVouchers_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_FxRevaluationVouchers_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    CREATE TABLE [FxRevaluationVoucherLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [VoucherId] uniqueidentifier NOT NULL,
        [Direction] int NOT NULL,
        [InvoiceId] uniqueidentifier NOT NULL,
        [InvoiceCode] nvarchar(64) NOT NULL,
        [CounterpartyName] nvarchar(200) NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [OutstandingAmount] decimal(18,2) NOT NULL,
        [InvoiceDateRate] decimal(18,8) NOT NULL,
        [ClosingRate] decimal(18,8) NOT NULL,
        [PreviousAdjustmentBase] decimal(18,2) NOT NULL,
        [TargetAdjustmentBase] decimal(18,2) NOT NULL,
        [AdjustmentBase] decimal(18,2) NOT NULL,
        [DebitAccount] nvarchar(120) NOT NULL,
        [CreditAccount] nvarchar(120) NOT NULL,
        [DebitBaseAmount] decimal(18,2) NOT NULL,
        [CreditBaseAmount] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_FxRevaluationVoucherLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FxRevaluationVoucherLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_FxRevaluationVoucherLines_AmountsNonNegative] CHECK ([OutstandingAmount] >= 0 AND [DebitBaseAmount] >= 0 AND [CreditBaseAmount] >= 0),
        CONSTRAINT [CK_FxRevaluationVoucherLines_Balanced] CHECK ([DebitBaseAmount] = [CreditBaseAmount]),
        CONSTRAINT [FK_FxRevaluationVoucherLines_FxRevaluationVouchers_TenantId_VoucherId] FOREIGN KEY ([TenantId], [VoucherId]) REFERENCES [FxRevaluationVouchers] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FxRevaluationVoucherLines_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValues_PurchaseRequestId] ON [PurchaseRequestCustomFieldValues] ([PurchaseRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FxRevaluationVoucherLines_TenantId_VoucherId_InvoiceId] ON [FxRevaluationVoucherLines] ([TenantId], [VoucherId], [InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FxRevaluationVouchers_TenantId_AsOfDate] ON [FxRevaluationVouchers] ([TenantId], [AsOfDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FxRevaluationVouchers_TenantId_Code] ON [FxRevaluationVouchers] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    ALTER TABLE [PurchaseRequestCustomFieldValues] ADD CONSTRAINT [FK_PurchaseRequestCustomFieldValues_PurchaseRequests_PurchaseRequestId] FOREIGN KEY ([PurchaseRequestId]) REFERENCES [PurchaseRequests] ([Id]) ON DELETE CASCADE;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015180928_FixSalesInvoiceCustomFieldRelationships'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015180928_FixSalesInvoiceCustomFieldRelationships', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015181305_AddFxRevaluationVouchers'
)
BEGIN
    IF OBJECT_ID(N'[dbo].[FxRevaluationVouchers]', N'U') IS NULL OR OBJECT_ID(N'[dbo].[FxRevaluationVoucherLines]', N'U') IS NULL THROW 51000, 'FX revaluation tables must exist before this migration.', 1;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015181305_AddFxRevaluationVouchers'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015181305_AddFxRevaluationVouchers', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [EnteredQuantity] decimal(18,4) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [EnteredUnitCode] nvarchar(8) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE TABLE [InventoryCostAdjustments] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(48) NOT NULL,
        [EntryDate] date NOT NULL,
        [Kind] nvarchar(24) NOT NULL,
        [PurchaseReceiptId] uniqueidentifier NULL,
        [Description] nvarchar(240) NOT NULL,
        [ReversalOfId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        CONSTRAINT [PK_InventoryCostAdjustments] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_InventoryCostAdjustments_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_InventoryCostAdjustments_InventoryCostAdjustments_TenantId_ReversalOfId] FOREIGN KEY ([TenantId], [ReversalOfId]) REFERENCES [InventoryCostAdjustments] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryCostAdjustments_PurchaseReceipts_TenantId_PurchaseReceiptId] FOREIGN KEY ([TenantId], [PurchaseReceiptId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryCostAdjustments_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE TABLE [StockItemUnitConversions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [FactorToBase] decimal(18,8) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StockItemUnitConversions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StockItemUnitConversions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_StockItemUnitConversions_FactorPositive] CHECK ([FactorToBase] > 0),
        CONSTRAINT [FK_StockItemUnitConversions_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE TABLE [InventoryCostAdjustmentLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [AdjustmentId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [PurchaseReceiptLineId] uniqueidentifier NULL,
        [QuantitySnapshot] decimal(18,4) NOT NULL,
        [UnitCostSnapshotBase] decimal(18,8) NULL,
        [AmountBase] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_InventoryCostAdjustmentLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_InventoryCostAdjustmentLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_InventoryCostAdjustmentLines_AmountNonZero] CHECK ([AmountBase] <> 0),
        CONSTRAINT [FK_InventoryCostAdjustmentLines_InventoryCostAdjustments_TenantId_AdjustmentId] FOREIGN KEY ([TenantId], [AdjustmentId]) REFERENCES [InventoryCostAdjustments] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryCostAdjustmentLines_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId] FOREIGN KEY ([TenantId], [PurchaseReceiptLineId]) REFERENCES [PurchaseReceiptLines] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryCostAdjustmentLines_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryCostAdjustmentLines_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_AdjustmentId_WarehouseId_StockItemId] ON [InventoryCostAdjustmentLines] ([TenantId], [AdjustmentId], [WarehouseId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_PurchaseReceiptLineId] ON [InventoryCostAdjustmentLines] ([TenantId], [PurchaseReceiptLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_StockItemId] ON [InventoryCostAdjustmentLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_WarehouseId] ON [InventoryCostAdjustmentLines] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE UNIQUE INDEX [IX_InventoryCostAdjustments_TenantId_Code] ON [InventoryCostAdjustments] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustments_TenantId_EntryDate_CreatedAt] ON [InventoryCostAdjustments] ([TenantId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustments_TenantId_PurchaseReceiptId] ON [InventoryCostAdjustments] ([TenantId], [PurchaseReceiptId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_InventoryCostAdjustments_TenantId_ReversalOfId] ON [InventoryCostAdjustments] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItemUnitConversions_TenantId_StockItemId_UnitCode] ON [StockItemUnitConversions] ([TenantId], [StockItemId], [UnitCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015182345_AddInventoryCostAdjustmentsAndUnitConversions', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [SupplierReturnLines] ADD [EnteredQuantity] decimal(18,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [SupplierReturnLines] ADD [EnteredUnitCode] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [StockItems] ADD [TrackingMode] nvarchar(16) NOT NULL DEFAULT N'None';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [SalesReturnLines] ADD [EnteredQuantity] decimal(18,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [SalesReturnLines] ADD [EnteredUnitCode] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [SalesDeliveryLines] ADD [EnteredQuantity] decimal(18,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [SalesDeliveryLines] ADD [EnteredUnitCode] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [PurchaseReceiptLines] ADD [EnteredQuantity] decimal(18,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    ALTER TABLE [PurchaseReceiptLines] ADD [EnteredUnitCode] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    CREATE TABLE [InventoryTransactionTraces] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [InventoryTransactionId] uniqueidentifier NOT NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [TrackingMode] nvarchar(16) NOT NULL,
        [TrackingCode] nvarchar(80) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [ExpiryDate] date NULL,
        CONSTRAINT [PK_InventoryTransactionTraces] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_InventoryTransactionTraces_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_InventoryTransactionTraces_InventoryTransactions_TenantId_InventoryTransactionId] FOREIGN KEY ([TenantId], [InventoryTransactionId]) REFERENCES [InventoryTransactions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactionTraces_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactionTraces_TenantId_InventoryTransactionId] ON [InventoryTransactionTraces] ([TenantId], [InventoryTransactionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactionTraces_TenantId_StockItemId_TrackingCode] ON [InventoryTransactionTraces] ([TenantId], [StockItemId], [TrackingCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015184304_AddInventoryLotSerialTracking'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015184304_AddInventoryLotSerialTracking', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    CREATE TABLE [PermissionDefinitions] (
        [Code] varchar(120) NOT NULL,
        [ResourceType] varchar(80) NOT NULL,
        [Action] varchar(32) NOT NULL,
        [Description] nvarchar(240) NOT NULL,
        CONSTRAINT [PK_PermissionDefinitions] PRIMARY KEY ([Code])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    CREATE TABLE [TenantPermissionRules] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [SubjectType] int NOT NULL,
        [SubjectRole] varchar(64) NULL,
        [SubjectUserId] uniqueidentifier NULL,
        [PermissionCode] varchar(120) NOT NULL,
        [Effect] int NOT NULL,
        [ResourceType] varchar(80) NULL,
        [AttributeName] varchar(120) NULL,
        [AttributeOperator] int NULL,
        [AttributeValue] nvarchar(500) NULL,
        [IsActive] bit NOT NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantPermissionRules] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantPermissionRules_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_TenantPermissionRules_Attribute] CHECK (([AttributeName] IS NULL AND [AttributeOperator] IS NULL AND [AttributeValue] IS NULL) OR ([AttributeName] IS NOT NULL AND [AttributeOperator] IS NOT NULL AND [AttributeValue] IS NOT NULL)),
        CONSTRAINT [CK_TenantPermissionRules_Subject] CHECK (([SubjectType] = 1 AND [SubjectRole] IS NOT NULL AND [SubjectUserId] IS NULL) OR ([SubjectType] = 2 AND [SubjectRole] IS NULL AND [SubjectUserId] IS NOT NULL)),
        CONSTRAINT [FK_TenantPermissionRules_PermissionDefinitions_PermissionCode] FOREIGN KEY ([PermissionCode]) REFERENCES [PermissionDefinitions] ([Code]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TenantPermissionRules_TenantMemberships_TenantId_CreatedByUserId] FOREIGN KEY ([TenantId], [CreatedByUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TenantPermissionRules_TenantMemberships_TenantId_SubjectUserId] FOREIGN KEY ([TenantId], [SubjectUserId]) REFERENCES [TenantMemberships] ([TenantId], [UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TenantPermissionRules_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.access-control.create'', ''create'', N''create · Tenant permissions and policies'', ''erp.access-control''),
    (''erp.access-control.delete'', ''delete'', N''delete · Tenant permissions and policies'', ''erp.access-control''),
    (''erp.access-control.execute'', ''execute'', N''execute · Tenant permissions and policies'', ''erp.access-control''),
    (''erp.access-control.read'', ''read'', N''read · Tenant permissions and policies'', ''erp.access-control''),
    (''erp.access-control.update'', ''update'', N''update · Tenant permissions and policies'', ''erp.access-control''),
    (''erp.audit-events.create'', ''create'', N''create · Tenant audit history'', ''erp.audit-events''),
    (''erp.audit-events.delete'', ''delete'', N''delete · Tenant audit history'', ''erp.audit-events''),
    (''erp.audit-events.execute'', ''execute'', N''execute · Tenant audit history'', ''erp.audit-events''),
    (''erp.audit-events.read'', ''read'', N''read · Tenant audit history'', ''erp.audit-events''),
    (''erp.audit-events.update'', ''update'', N''update · Tenant audit history'', ''erp.audit-events''),
    (''erp.bank-statements.create'', ''create'', N''create · Bank statements and reconciliation'', ''erp.bank-statements''),
    (''erp.bank-statements.delete'', ''delete'', N''delete · Bank statements and reconciliation'', ''erp.bank-statements''),
    (''erp.bank-statements.execute'', ''execute'', N''execute · Bank statements and reconciliation'', ''erp.bank-statements''),
    (''erp.bank-statements.read'', ''read'', N''read · Bank statements and reconciliation'', ''erp.bank-statements''),
    (''erp.bank-statements.update'', ''update'', N''update · Bank statements and reconciliation'', ''erp.bank-statements''),
    (''erp.customer-collections.create'', ''create'', N''create · Customer collections'', ''erp.customer-collections''),
    (''erp.customer-collections.delete'', ''delete'', N''delete · Customer collections'', ''erp.customer-collections''),
    (''erp.customer-collections.execute'', ''execute'', N''execute · Customer collections'', ''erp.customer-collections''),
    (''erp.customer-collections.read'', ''read'', N''read · Customer collections'', ''erp.customer-collections''),
    (''erp.customer-collections.update'', ''update'', N''update · Customer collections'', ''erp.customer-collections''),
    (''erp.customer-groups.create'', ''create'', N''create · Customer groups'', ''erp.customer-groups''),
    (''erp.customer-groups.delete'', ''delete'', N''delete · Customer groups'', ''erp.customer-groups''),
    (''erp.customer-groups.execute'', ''execute'', N''execute · Customer groups'', ''erp.customer-groups''),
    (''erp.customer-groups.read'', ''read'', N''read · Customer groups'', ''erp.customer-groups''),
    (''erp.customer-groups.update'', ''update'', N''update · Customer groups'', ''erp.customer-groups''),
    (''erp.customers.create'', ''create'', N''create · Customer and supplier accounts'', ''erp.customers''),
    (''erp.customers.delete'', ''delete'', N''delete · Customer and supplier accounts'', ''erp.customers''),
    (''erp.customers.execute'', ''execute'', N''execute · Customer and supplier accounts'', ''erp.customers''),
    (''erp.customers.read'', ''read'', N''read · Customer and supplier accounts'', ''erp.customers''),
    (''erp.customers.update'', ''update'', N''update · Customer and supplier accounts'', ''erp.customers''),
    (''erp.dashboard.create'', ''create'', N''create · ERP dashboard'', ''erp.dashboard''),
    (''erp.dashboard.delete'', ''delete'', N''delete · ERP dashboard'', ''erp.dashboard''),
    (''erp.dashboard.execute'', ''execute'', N''execute · ERP dashboard'', ''erp.dashboard''),
    (''erp.dashboard.read'', ''read'', N''read · ERP dashboard'', ''erp.dashboard''),
    (''erp.dashboard.update'', ''update'', N''update · ERP dashboard'', ''erp.dashboard''),
    (''erp.exchange-rates.create'', ''create'', N''create · Tenant exchange rates'', ''erp.exchange-rates''),
    (''erp.exchange-rates.delete'', ''delete'', N''delete · Tenant exchange rates'', ''erp.exchange-rates''),
    (''erp.exchange-rates.execute'', ''execute'', N''execute · Tenant exchange rates'', ''erp.exchange-rates''),
    (''erp.exchange-rates.read'', ''read'', N''read · Tenant exchange rates'', ''erp.exchange-rates''),
    (''erp.exchange-rates.update'', ''update'', N''update · Tenant exchange rates'', ''erp.exchange-rates''),
    (''erp.finance-accounts.create'', ''create'', N''create · Cash and bank accounts'', ''erp.finance-accounts''),
    (''erp.finance-accounts.delete'', ''delete'', N''delete · Cash and bank accounts'', ''erp.finance-accounts'');
    INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.finance-accounts.execute'', ''execute'', N''execute · Cash and bank accounts'', ''erp.finance-accounts''),
    (''erp.finance-accounts.read'', ''read'', N''read · Cash and bank accounts'', ''erp.finance-accounts''),
    (''erp.finance-accounts.update'', ''update'', N''update · Cash and bank accounts'', ''erp.finance-accounts''),
    (''erp.finance-currency.create'', ''create'', N''create · Tenant base currency'', ''erp.finance-currency''),
    (''erp.finance-currency.delete'', ''delete'', N''delete · Tenant base currency'', ''erp.finance-currency''),
    (''erp.finance-currency.execute'', ''execute'', N''execute · Tenant base currency'', ''erp.finance-currency''),
    (''erp.finance-currency.read'', ''read'', N''read · Tenant base currency'', ''erp.finance-currency''),
    (''erp.finance-currency.update'', ''update'', N''update · Tenant base currency'', ''erp.finance-currency''),
    (''erp.financial-transfers.create'', ''create'', N''create · Financial account transfers'', ''erp.financial-transfers''),
    (''erp.financial-transfers.delete'', ''delete'', N''delete · Financial account transfers'', ''erp.financial-transfers''),
    (''erp.financial-transfers.execute'', ''execute'', N''execute · Financial account transfers'', ''erp.financial-transfers''),
    (''erp.financial-transfers.read'', ''read'', N''read · Financial account transfers'', ''erp.financial-transfers''),
    (''erp.financial-transfers.update'', ''update'', N''update · Financial account transfers'', ''erp.financial-transfers''),
    (''erp.fx-exposure.create'', ''create'', N''create · Foreign currency exposure'', ''erp.fx-exposure''),
    (''erp.fx-exposure.delete'', ''delete'', N''delete · Foreign currency exposure'', ''erp.fx-exposure''),
    (''erp.fx-exposure.execute'', ''execute'', N''execute · Foreign currency exposure'', ''erp.fx-exposure''),
    (''erp.fx-exposure.read'', ''read'', N''read · Foreign currency exposure'', ''erp.fx-exposure''),
    (''erp.fx-exposure.update'', ''update'', N''update · Foreign currency exposure'', ''erp.fx-exposure''),
    (''erp.fx-revaluations.create'', ''create'', N''create · Period-end FX revaluation vouchers'', ''erp.fx-revaluations''),
    (''erp.fx-revaluations.delete'', ''delete'', N''delete · Period-end FX revaluation vouchers'', ''erp.fx-revaluations''),
    (''erp.fx-revaluations.execute'', ''execute'', N''execute · Period-end FX revaluation vouchers'', ''erp.fx-revaluations''),
    (''erp.fx-revaluations.read'', ''read'', N''read · Period-end FX revaluation vouchers'', ''erp.fx-revaluations''),
    (''erp.fx-revaluations.update'', ''update'', N''update · Period-end FX revaluation vouchers'', ''erp.fx-revaluations''),
    (''erp.inventory-cost-adjustments.create'', ''create'', N''create · Inventory landed costs and revaluation'', ''erp.inventory-cost-adjustments''),
    (''erp.inventory-cost-adjustments.delete'', ''delete'', N''delete · Inventory landed costs and revaluation'', ''erp.inventory-cost-adjustments''),
    (''erp.inventory-cost-adjustments.execute'', ''execute'', N''execute · Inventory landed costs and revaluation'', ''erp.inventory-cost-adjustments''),
    (''erp.inventory-cost-adjustments.read'', ''read'', N''read · Inventory landed costs and revaluation'', ''erp.inventory-cost-adjustments''),
    (''erp.inventory-cost-adjustments.update'', ''update'', N''update · Inventory landed costs and revaluation'', ''erp.inventory-cost-adjustments''),
    (''erp.inventory-transfers.create'', ''create'', N''create · Warehouse transfers'', ''erp.inventory-transfers''),
    (''erp.inventory-transfers.delete'', ''delete'', N''delete · Warehouse transfers'', ''erp.inventory-transfers''),
    (''erp.inventory-transfers.execute'', ''execute'', N''execute · Warehouse transfers'', ''erp.inventory-transfers''),
    (''erp.inventory-transfers.read'', ''read'', N''read · Warehouse transfers'', ''erp.inventory-transfers''),
    (''erp.inventory-transfers.update'', ''update'', N''update · Warehouse transfers'', ''erp.inventory-transfers''),
    (''erp.maturities.create'', ''create'', N''create · Receivable and payable maturities'', ''erp.maturities''),
    (''erp.maturities.delete'', ''delete'', N''delete · Receivable and payable maturities'', ''erp.maturities''),
    (''erp.maturities.execute'', ''execute'', N''execute · Receivable and payable maturities'', ''erp.maturities''),
    (''erp.maturities.read'', ''read'', N''read · Receivable and payable maturities'', ''erp.maturities''),
    (''erp.maturities.update'', ''update'', N''update · Receivable and payable maturities'', ''erp.maturities''),
    (''erp.purchase-invoices.create'', ''create'', N''create · Purchase invoices'', ''erp.purchase-invoices''),
    (''erp.purchase-invoices.delete'', ''delete'', N''delete · Purchase invoices'', ''erp.purchase-invoices''),
    (''erp.purchase-invoices.execute'', ''execute'', N''execute · Purchase invoices'', ''erp.purchase-invoices''),
    (''erp.purchase-invoices.read'', ''read'', N''read · Purchase invoices'', ''erp.purchase-invoices'');
    INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.purchase-invoices.update'', ''update'', N''update · Purchase invoices'', ''erp.purchase-invoices''),
    (''erp.purchase-orders.create'', ''create'', N''create · Purchase orders'', ''erp.purchase-orders''),
    (''erp.purchase-orders.delete'', ''delete'', N''delete · Purchase orders'', ''erp.purchase-orders''),
    (''erp.purchase-orders.execute'', ''execute'', N''execute · Purchase orders'', ''erp.purchase-orders''),
    (''erp.purchase-orders.read'', ''read'', N''read · Purchase orders'', ''erp.purchase-orders''),
    (''erp.purchase-orders.update'', ''update'', N''update · Purchase orders'', ''erp.purchase-orders''),
    (''erp.purchase-receipts.create'', ''create'', N''create · Purchase receipts and landed costs'', ''erp.purchase-receipts''),
    (''erp.purchase-receipts.delete'', ''delete'', N''delete · Purchase receipts and landed costs'', ''erp.purchase-receipts''),
    (''erp.purchase-receipts.execute'', ''execute'', N''execute · Purchase receipts and landed costs'', ''erp.purchase-receipts''),
    (''erp.purchase-receipts.read'', ''read'', N''read · Purchase receipts and landed costs'', ''erp.purchase-receipts''),
    (''erp.purchase-receipts.update'', ''update'', N''update · Purchase receipts and landed costs'', ''erp.purchase-receipts''),
    (''erp.purchase-requests.create'', ''create'', N''create · Purchase requests'', ''erp.purchase-requests''),
    (''erp.purchase-requests.delete'', ''delete'', N''delete · Purchase requests'', ''erp.purchase-requests''),
    (''erp.purchase-requests.execute'', ''execute'', N''execute · Purchase requests'', ''erp.purchase-requests''),
    (''erp.purchase-requests.read'', ''read'', N''read · Purchase requests'', ''erp.purchase-requests''),
    (''erp.purchase-requests.update'', ''update'', N''update · Purchase requests'', ''erp.purchase-requests''),
    (''erp.sales-deliveries.create'', ''create'', N''create · Sales deliveries'', ''erp.sales-deliveries''),
    (''erp.sales-deliveries.delete'', ''delete'', N''delete · Sales deliveries'', ''erp.sales-deliveries''),
    (''erp.sales-deliveries.execute'', ''execute'', N''execute · Sales deliveries'', ''erp.sales-deliveries''),
    (''erp.sales-deliveries.read'', ''read'', N''read · Sales deliveries'', ''erp.sales-deliveries''),
    (''erp.sales-deliveries.update'', ''update'', N''update · Sales deliveries'', ''erp.sales-deliveries''),
    (''erp.sales-invoices.create'', ''create'', N''create · Sales invoices'', ''erp.sales-invoices''),
    (''erp.sales-invoices.delete'', ''delete'', N''delete · Sales invoices'', ''erp.sales-invoices''),
    (''erp.sales-invoices.execute'', ''execute'', N''execute · Sales invoices'', ''erp.sales-invoices''),
    (''erp.sales-invoices.read'', ''read'', N''read · Sales invoices'', ''erp.sales-invoices''),
    (''erp.sales-invoices.update'', ''update'', N''update · Sales invoices'', ''erp.sales-invoices''),
    (''erp.sales-orders.create'', ''create'', N''create · Sales orders and reservations'', ''erp.sales-orders''),
    (''erp.sales-orders.delete'', ''delete'', N''delete · Sales orders and reservations'', ''erp.sales-orders''),
    (''erp.sales-orders.execute'', ''execute'', N''execute · Sales orders and reservations'', ''erp.sales-orders''),
    (''erp.sales-orders.read'', ''read'', N''read · Sales orders and reservations'', ''erp.sales-orders''),
    (''erp.sales-orders.update'', ''update'', N''update · Sales orders and reservations'', ''erp.sales-orders''),
    (''erp.sales-quotes.create'', ''create'', N''create · Sales quotes'', ''erp.sales-quotes''),
    (''erp.sales-quotes.delete'', ''delete'', N''delete · Sales quotes'', ''erp.sales-quotes''),
    (''erp.sales-quotes.execute'', ''execute'', N''execute · Sales quotes'', ''erp.sales-quotes''),
    (''erp.sales-quotes.read'', ''read'', N''read · Sales quotes'', ''erp.sales-quotes''),
    (''erp.sales-quotes.update'', ''update'', N''update · Sales quotes'', ''erp.sales-quotes''),
    (''erp.sales-returns.create'', ''create'', N''create · Sales returns'', ''erp.sales-returns''),
    (''erp.sales-returns.delete'', ''delete'', N''delete · Sales returns'', ''erp.sales-returns''),
    (''erp.sales-returns.execute'', ''execute'', N''execute · Sales returns'', ''erp.sales-returns''),
    (''erp.sales-returns.read'', ''read'', N''read · Sales returns'', ''erp.sales-returns''),
    (''erp.sales-returns.update'', ''update'', N''update · Sales returns'', ''erp.sales-returns''),
    (''erp.stock-items.create'', ''create'', N''create · Stock cards and units'', ''erp.stock-items'');
    INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.stock-items.delete'', ''delete'', N''delete · Stock cards and units'', ''erp.stock-items''),
    (''erp.stock-items.execute'', ''execute'', N''execute · Stock cards and units'', ''erp.stock-items''),
    (''erp.stock-items.read'', ''read'', N''read · Stock cards and units'', ''erp.stock-items''),
    (''erp.stock-items.update'', ''update'', N''update · Stock cards and units'', ''erp.stock-items''),
    (''erp.supplier-payments.create'', ''create'', N''create · Supplier payments'', ''erp.supplier-payments''),
    (''erp.supplier-payments.delete'', ''delete'', N''delete · Supplier payments'', ''erp.supplier-payments''),
    (''erp.supplier-payments.execute'', ''execute'', N''execute · Supplier payments'', ''erp.supplier-payments''),
    (''erp.supplier-payments.read'', ''read'', N''read · Supplier payments'', ''erp.supplier-payments''),
    (''erp.supplier-payments.update'', ''update'', N''update · Supplier payments'', ''erp.supplier-payments''),
    (''erp.supplier-quotes.create'', ''create'', N''create · Supplier quotes'', ''erp.supplier-quotes''),
    (''erp.supplier-quotes.delete'', ''delete'', N''delete · Supplier quotes'', ''erp.supplier-quotes''),
    (''erp.supplier-quotes.execute'', ''execute'', N''execute · Supplier quotes'', ''erp.supplier-quotes''),
    (''erp.supplier-quotes.read'', ''read'', N''read · Supplier quotes'', ''erp.supplier-quotes''),
    (''erp.supplier-quotes.update'', ''update'', N''update · Supplier quotes'', ''erp.supplier-quotes''),
    (''erp.supplier-returns.create'', ''create'', N''create · Supplier returns'', ''erp.supplier-returns''),
    (''erp.supplier-returns.delete'', ''delete'', N''delete · Supplier returns'', ''erp.supplier-returns''),
    (''erp.supplier-returns.execute'', ''execute'', N''execute · Supplier returns'', ''erp.supplier-returns''),
    (''erp.supplier-returns.read'', ''read'', N''read · Supplier returns'', ''erp.supplier-returns''),
    (''erp.supplier-returns.update'', ''update'', N''update · Supplier returns'', ''erp.supplier-returns''),
    (''erp.warehouses.create'', ''create'', N''create · Warehouses and stock balances'', ''erp.warehouses''),
    (''erp.warehouses.delete'', ''delete'', N''delete · Warehouses and stock balances'', ''erp.warehouses''),
    (''erp.warehouses.execute'', ''execute'', N''execute · Warehouses and stock balances'', ''erp.warehouses''),
    (''erp.warehouses.read'', ''read'', N''read · Warehouses and stock balances'', ''erp.warehouses''),
    (''erp.warehouses.update'', ''update'', N''update · Warehouses and stock balances'', ''erp.warehouses''),
    (''studio.ai-analysis.create'', ''create'', N''create · AI source and test analysis'', ''studio.ai-analysis''),
    (''studio.ai-analysis.delete'', ''delete'', N''delete · AI source and test analysis'', ''studio.ai-analysis''),
    (''studio.ai-analysis.execute'', ''execute'', N''execute · AI source and test analysis'', ''studio.ai-analysis''),
    (''studio.ai-analysis.read'', ''read'', N''read · AI source and test analysis'', ''studio.ai-analysis''),
    (''studio.ai-analysis.update'', ''update'', N''update · AI source and test analysis'', ''studio.ai-analysis''),
    (''studio.ai-plans.create'', ''create'', N''create · AI test and architecture plans'', ''studio.ai-plans''),
    (''studio.ai-plans.delete'', ''delete'', N''delete · AI test and architecture plans'', ''studio.ai-plans''),
    (''studio.ai-plans.execute'', ''execute'', N''execute · AI test and architecture plans'', ''studio.ai-plans''),
    (''studio.ai-plans.read'', ''read'', N''read · AI test and architecture plans'', ''studio.ai-plans''),
    (''studio.ai-plans.update'', ''update'', N''update · AI test and architecture plans'', ''studio.ai-plans''),
    (''studio.capabilities.create'', ''create'', N''create · Studio capabilities'', ''studio.capabilities''),
    (''studio.capabilities.delete'', ''delete'', N''delete · Studio capabilities'', ''studio.capabilities''),
    (''studio.capabilities.execute'', ''execute'', N''execute · Studio capabilities'', ''studio.capabilities''),
    (''studio.capabilities.read'', ''read'', N''read · Studio capabilities'', ''studio.capabilities''),
    (''studio.capabilities.update'', ''update'', N''update · Studio capabilities'', ''studio.capabilities''),
    (''studio.code-suggestions.create'', ''create'', N''create · AI code suggestions and changes'', ''studio.code-suggestions''),
    (''studio.code-suggestions.delete'', ''delete'', N''delete · AI code suggestions and changes'', ''studio.code-suggestions''),
    (''studio.code-suggestions.execute'', ''execute'', N''execute · AI code suggestions and changes'', ''studio.code-suggestions'');
    INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''studio.code-suggestions.read'', ''read'', N''read · AI code suggestions and changes'', ''studio.code-suggestions''),
    (''studio.code-suggestions.update'', ''update'', N''update · AI code suggestions and changes'', ''studio.code-suggestions''),
    (''studio.conversations.create'', ''create'', N''create · Studio conversations'', ''studio.conversations''),
    (''studio.conversations.delete'', ''delete'', N''delete · Studio conversations'', ''studio.conversations''),
    (''studio.conversations.execute'', ''execute'', N''execute · Studio conversations'', ''studio.conversations''),
    (''studio.conversations.read'', ''read'', N''read · Studio conversations'', ''studio.conversations''),
    (''studio.conversations.update'', ''update'', N''update · Studio conversations'', ''studio.conversations''),
    (''studio.deployments.create'', ''create'', N''create · Staging and production deployments'', ''studio.deployments''),
    (''studio.deployments.delete'', ''delete'', N''delete · Staging and production deployments'', ''studio.deployments''),
    (''studio.deployments.execute'', ''execute'', N''execute · Staging and production deployments'', ''studio.deployments''),
    (''studio.deployments.read'', ''read'', N''read · Staging and production deployments'', ''studio.deployments''),
    (''studio.deployments.update'', ''update'', N''update · Staging and production deployments'', ''studio.deployments''),
    (''studio.production-approvals.create'', ''create'', N''create · Production promotion approvals'', ''studio.production-approvals''),
    (''studio.production-approvals.delete'', ''delete'', N''delete · Production promotion approvals'', ''studio.production-approvals''),
    (''studio.production-approvals.execute'', ''execute'', N''execute · Production promotion approvals'', ''studio.production-approvals''),
    (''studio.production-approvals.read'', ''read'', N''read · Production promotion approvals'', ''studio.production-approvals''),
    (''studio.production-approvals.update'', ''update'', N''update · Production promotion approvals'', ''studio.production-approvals''),
    (''studio.projects.create'', ''create'', N''create · Development projects and members'', ''studio.projects''),
    (''studio.projects.delete'', ''delete'', N''delete · Development projects and members'', ''studio.projects''),
    (''studio.projects.execute'', ''execute'', N''execute · Development projects and members'', ''studio.projects''),
    (''studio.projects.read'', ''read'', N''read · Development projects and members'', ''studio.projects''),
    (''studio.projects.update'', ''update'', N''update · Development projects and members'', ''studio.projects''),
    (''studio.release-candidates.create'', ''create'', N''create · Release candidates and versions'', ''studio.release-candidates''),
    (''studio.release-candidates.delete'', ''delete'', N''delete · Release candidates and versions'', ''studio.release-candidates''),
    (''studio.release-candidates.execute'', ''execute'', N''execute · Release candidates and versions'', ''studio.release-candidates''),
    (''studio.release-candidates.read'', ''read'', N''read · Release candidates and versions'', ''studio.release-candidates''),
    (''studio.release-candidates.update'', ''update'', N''update · Release candidates and versions'', ''studio.release-candidates''),
    (''studio.release-packages.create'', ''create'', N''create · Release packages'', ''studio.release-packages''),
    (''studio.release-packages.delete'', ''delete'', N''delete · Release packages'', ''studio.release-packages''),
    (''studio.release-packages.execute'', ''execute'', N''execute · Release packages'', ''studio.release-packages''),
    (''studio.release-packages.read'', ''read'', N''read · Release packages'', ''studio.release-packages''),
    (''studio.release-packages.update'', ''update'', N''update · Release packages'', ''studio.release-packages''),
    (''studio.requests.create'', ''create'', N''create · Development requests'', ''studio.requests''),
    (''studio.requests.delete'', ''delete'', N''delete · Development requests'', ''studio.requests''),
    (''studio.requests.execute'', ''execute'', N''execute · Development requests'', ''studio.requests''),
    (''studio.requests.read'', ''read'', N''read · Development requests'', ''studio.requests''),
    (''studio.requests.update'', ''update'', N''update · Development requests'', ''studio.requests''),
    (''studio.workspace-files.create'', ''create'', N''create · Project workspace files and source'', ''studio.workspace-files''),
    (''studio.workspace-files.delete'', ''delete'', N''delete · Project workspace files and source'', ''studio.workspace-files''),
    (''studio.workspace-files.execute'', ''execute'', N''execute · Project workspace files and source'', ''studio.workspace-files''),
    (''studio.workspace-files.read'', ''read'', N''read · Project workspace files and source'', ''studio.workspace-files''),
    (''studio.workspace-files.update'', ''update'', N''update · Project workspace files and source'', ''studio.workspace-files'');
    INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''studio.workspace-requests.create'', ''create'', N''create · Project workspace requests'', ''studio.workspace-requests''),
    (''studio.workspace-requests.delete'', ''delete'', N''delete · Project workspace requests'', ''studio.workspace-requests''),
    (''studio.workspace-requests.execute'', ''execute'', N''execute · Project workspace requests'', ''studio.workspace-requests''),
    (''studio.workspace-requests.read'', ''read'', N''read · Project workspace requests'', ''studio.workspace-requests''),
    (''studio.workspace-requests.update'', ''update'', N''update · Project workspace requests'', ''studio.workspace-requests''),
    (''studio.workspace-tests.create'', ''create'', N''create · Workspace tests and builds'', ''studio.workspace-tests''),
    (''studio.workspace-tests.delete'', ''delete'', N''delete · Workspace tests and builds'', ''studio.workspace-tests''),
    (''studio.workspace-tests.execute'', ''execute'', N''execute · Workspace tests and builds'', ''studio.workspace-tests''),
    (''studio.workspace-tests.read'', ''read'', N''read · Workspace tests and builds'', ''studio.workspace-tests''),
    (''studio.workspace-tests.update'', ''update'', N''update · Workspace tests and builds'', ''studio.workspace-tests''),
    (''system.session.create'', ''create'', N''create · User session information'', ''system.session''),
    (''system.session.delete'', ''delete'', N''delete · User session information'', ''system.session''),
    (''system.session.execute'', ''execute'', N''execute · User session information'', ''system.session''),
    (''system.session.read'', ''read'', N''read · User session information'', ''system.session''),
    (''system.session.update'', ''update'', N''update · User session information'', ''system.session'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    INSERT INTO [dbo].[TenantPermissionRules]
        ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
         [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
    SELECT NEWID(), tenant.[Id], 1, 'TenantUser', NULL, permission.[Code], 1,
           NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
    FROM [dbo].[Tenants] AS tenant
    CROSS JOIN [dbo].[PermissionDefinitions] AS permission
    WHERE permission.[ResourceType] NOT IN ('erp.access-control', 'erp.audit-events');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    CREATE INDEX [IX_TenantPermissionRules_PermissionCode] ON [TenantPermissionRules] ([PermissionCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    CREATE INDEX [IX_TenantPermissionRules_TenantId_CreatedByUserId] ON [TenantPermissionRules] ([TenantId], [CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    CREATE INDEX [IX_TenantPermissionRules_TenantId_PermissionCode_IsActive] ON [TenantPermissionRules] ([TenantId], [PermissionCode], [IsActive]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    CREATE INDEX [IX_TenantPermissionRules_TenantId_SubjectRole_PermissionCode_IsActive] ON [TenantPermissionRules] ([TenantId], [SubjectRole], [PermissionCode], [IsActive]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    CREATE INDEX [IX_TenantPermissionRules_TenantId_SubjectUserId_PermissionCode_IsActive] ON [TenantPermissionRules] ([TenantId], [SubjectUserId], [PermissionCode], [IsActive]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015185542_AddTenantPermissionPolicies'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015185542_AddTenantPermissionPolicies', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191405_AddTenantAuditRetention'
)
BEGIN
    ALTER TABLE [Tenants] ADD [AuditLastPurgeAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191405_AddTenantAuditRetention'
)
BEGIN
    ALTER TABLE [Tenants] ADD [AuditRetentionDays] int NOT NULL DEFAULT 365;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191405_AddTenantAuditRetention'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.audit-retention.create'', ''create'', N''create · Tenant audit retention policy'', ''erp.audit-retention''),
    (''erp.audit-retention.delete'', ''delete'', N''delete · Tenant audit retention policy'', ''erp.audit-retention''),
    (''erp.audit-retention.execute'', ''execute'', N''execute · Tenant audit retention policy'', ''erp.audit-retention''),
    (''erp.audit-retention.read'', ''read'', N''read · Tenant audit retention policy'', ''erp.audit-retention''),
    (''erp.audit-retention.update'', ''update'', N''update · Tenant audit retention policy'', ''erp.audit-retention'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191405_AddTenantAuditRetention'
)
BEGIN
    EXEC(N'ALTER TABLE [Tenants] ADD CONSTRAINT [CK_Tenants_AuditRetentionDays] CHECK ([AuditRetentionDays] >= 30 AND [AuditRetentionDays] <= 3650)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191405_AddTenantAuditRetention'
)
BEGIN
    CREATE OR ALTER TRIGGER dbo.TR_AuditEvents_AppendOnly
    ON dbo.AuditEvents
    AFTER UPDATE, DELETE
    AS
    BEGIN
        SET NOCOUNT ON;
        IF ISNULL(TRY_CONVERT(int, SESSION_CONTEXT(N'AIERP_AuditRetentionPurge')), 0) <> 1
            THROW 51001, 'Audit events are append-only outside the retention purge procedure.', 1;
    END;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191405_AddTenantAuditRetention'
)
BEGIN
    CREATE OR ALTER PROCEDURE dbo.PurgeExpiredAuditEvents
        @BatchSize int = 500,
        @TenantId uniqueidentifier = NULL,
        @MaxRowsPerTenant int = 10000,
        @TotalDeleted int OUTPUT
    AS
    BEGIN
        SET NOCOUNT ON;
        SET XACT_ABORT ON;

        IF @BatchSize < 1 OR @BatchSize > 5000
            THROW 51002, 'Batch size must be between 1 and 5000.', 1;
        IF @MaxRowsPerTenant < 1 OR @MaxRowsPerTenant > 100000
            THROW 51003, 'Maximum rows per tenant must be between 1 and 100000.', 1;

        DECLARE @CurrentTenantId uniqueidentifier;
        DECLARE @RetentionDays int;
        DECLARE @Cutoff datetimeoffset;
        DECLARE @Deleted int;
        DECLARE @TenantDeleted int;
        DECLARE @ThisBatch int;
        DECLARE @Now datetimeoffset;
        DECLARE @DeletedRows TABLE (Id bigint NOT NULL);
        SET @TotalDeleted = 0;

        BEGIN TRY
            EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=1;

            DECLARE tenant_cursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT Id, AuditRetentionDays
                FROM dbo.Tenants
                WHERE @TenantId IS NULL OR Id = @TenantId;
            OPEN tenant_cursor;
            FETCH NEXT FROM tenant_cursor INTO @CurrentTenantId, @RetentionDays;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @Cutoff = DATEADD(day, -@RetentionDays, TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00'));
                SET @TenantDeleted = 0;
                WHILE @TenantDeleted < @MaxRowsPerTenant
                BEGIN
                    SET @ThisBatch = CASE WHEN @BatchSize < @MaxRowsPerTenant - @TenantDeleted
                        THEN @BatchSize ELSE @MaxRowsPerTenant - @TenantDeleted END;
                    DELETE TOP (@BatchSize) FROM @DeletedRows;
                    BEGIN TRANSACTION;
                    DELETE TOP (@ThisBatch) FROM dbo.AuditEvents
                        OUTPUT deleted.Id INTO @DeletedRows(Id)
                        WHERE TenantId = @CurrentTenantId AND OccurredAt < @Cutoff;
                    SET @Deleted = @@ROWCOUNT;
                    IF @Deleted > 0
                    BEGIN
                        SET @Now = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');
                        INSERT dbo.AuditEvents (TenantId, UserId, Action, Resource, OccurredAt)
                        VALUES (@CurrentTenantId, NULL, N'audit.retention.purged',
                            CONCAT(N'{"cutoffUtc":"', CONVERT(nvarchar(33), @Cutoff, 127),
                                N'","deletedCount":', @Deleted, N'}'), @Now);
                    END;
                    COMMIT TRANSACTION;
                    SET @TenantDeleted += @Deleted;
                    SET @TotalDeleted += @Deleted;
                    IF @Deleted = 0 BREAK;
                END;
                UPDATE dbo.Tenants SET AuditLastPurgeAt = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')
                    WHERE Id = @CurrentTenantId;
                FETCH NEXT FROM tenant_cursor INTO @CurrentTenantId, @RetentionDays;
            END;
            CLOSE tenant_cursor;
            DEALLOCATE tenant_cursor;

            IF @TenantId IS NULL
            BEGIN
                SET @CurrentTenantId = NULL;
                SET @RetentionDays = 365;
                SET @Cutoff = DATEADD(day, -@RetentionDays, TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00'));
                SET @TenantDeleted = 0;
                WHILE @TenantDeleted < @MaxRowsPerTenant
                BEGIN
                    SET @ThisBatch = CASE WHEN @BatchSize < @MaxRowsPerTenant - @TenantDeleted
                        THEN @BatchSize ELSE @MaxRowsPerTenant - @TenantDeleted END;
                    DELETE TOP (@BatchSize) FROM @DeletedRows;
                    BEGIN TRANSACTION;
                    DELETE TOP (@ThisBatch) FROM dbo.AuditEvents
                        OUTPUT deleted.Id INTO @DeletedRows(Id)
                        WHERE TenantId IS NULL AND OccurredAt < @Cutoff;
                    SET @Deleted = @@ROWCOUNT;
                    IF @Deleted > 0
                    BEGIN
                        SET @Now = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');
                        INSERT dbo.AuditEvents (TenantId, UserId, Action, Resource, OccurredAt)
                        VALUES (NULL, NULL, N'audit.retention.purged',
                            CONCAT(N'{"cutoffUtc":"', CONVERT(nvarchar(33), @Cutoff, 127),
                                N'","deletedCount":', @Deleted, N'}'), @Now);
                    END;
                    COMMIT TRANSACTION;
                    SET @TenantDeleted += @Deleted;
                    SET @TotalDeleted += @Deleted;
                    IF @Deleted = 0 BREAK;
                END;
            END;

            EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL;
        END TRY
        BEGIN CATCH
            IF CURSOR_STATUS('local', 'tenant_cursor') >= 0 CLOSE tenant_cursor;
            IF CURSOR_STATUS('local', 'tenant_cursor') > -3 DEALLOCATE tenant_cursor;
            IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
            EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL;
            THROW;
        END CATCH;
    END;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191405_AddTenantAuditRetention'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015191405_AddTenantAuditRetention', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015192911_AddTenantDatabaseCatalog'
)
BEGIN
    CREATE TABLE [DatabaseSeparationComponentStates] (
        [Component] nvarchar(64) NOT NULL,
        [DatabaseName] nvarchar(128) NOT NULL,
        [State] int NOT NULL,
        [LastError] nvarchar(2000) NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [ReadyAt] datetimeoffset NULL,
        CONSTRAINT [PK_DatabaseSeparationComponentStates] PRIMARY KEY ([Component])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015192911_AddTenantDatabaseCatalog'
)
BEGIN
    CREATE TABLE [TenantDatabaseCatalog] (
        [TenantId] uniqueidentifier NOT NULL,
        [DatabaseName] nvarchar(128) NOT NULL,
        [State] int NOT NULL,
        [LastError] nvarchar(2000) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [ReadyAt] datetimeoffset NULL,
        CONSTRAINT [PK_TenantDatabaseCatalog] PRIMARY KEY ([TenantId]),
        CONSTRAINT [FK_TenantDatabaseCatalog_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015192911_AddTenantDatabaseCatalog'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantDatabaseCatalog_DatabaseName] ON [TenantDatabaseCatalog] ([DatabaseName]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015192911_AddTenantDatabaseCatalog'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015192911_AddTenantDatabaseCatalog', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE TABLE [JournalEntries] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(48) NOT NULL,
        [EntryDate] date NOT NULL,
        [Description] nvarchar(240) NOT NULL,
        [SourceType] varchar(32) NOT NULL,
        [SourceId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_JournalEntries] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_JournalEntries_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_JournalEntries_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE TABLE [LedgerAccounts] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(32) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_LedgerAccounts] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_LedgerAccounts_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_LedgerAccounts_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE TABLE [JournalEntryLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [JournalEntryId] uniqueidentifier NOT NULL,
        [AccountId] uniqueidentifier NOT NULL,
        [LineNumber] int NOT NULL,
        [Description] nvarchar(240) NOT NULL,
        [Debit] decimal(18,2) NOT NULL,
        [Credit] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_JournalEntryLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_JournalEntryLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_JournalEntryLines_OneSidedNonNegative] CHECK ([Debit] >= 0 AND [Credit] >= 0 AND (([Debit] > 0 AND [Credit] = 0) OR ([Credit] > 0 AND [Debit] = 0))),
        CONSTRAINT [FK_JournalEntryLines_JournalEntries_TenantId_JournalEntryId] FOREIGN KEY ([TenantId], [JournalEntryId]) REFERENCES [JournalEntries] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_JournalEntryLines_LedgerAccounts_TenantId_AccountId] FOREIGN KEY ([TenantId], [AccountId]) REFERENCES [LedgerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE TABLE [LedgerAccountMappings] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [MappingKey] varchar(64) NOT NULL,
        [AccountId] uniqueidentifier NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_LedgerAccountMappings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_LedgerAccountMappings_LedgerAccounts_TenantId_AccountId] FOREIGN KEY ([TenantId], [AccountId]) REFERENCES [LedgerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.general-ledger.create'', ''create'', N''create · Tenant chart of accounts, mappings, and journal entries'', ''erp.general-ledger''),
    (''erp.general-ledger.delete'', ''delete'', N''delete · Tenant chart of accounts, mappings, and journal entries'', ''erp.general-ledger''),
    (''erp.general-ledger.execute'', ''execute'', N''execute · Tenant chart of accounts, mappings, and journal entries'', ''erp.general-ledger''),
    (''erp.general-ledger.read'', ''read'', N''read · Tenant chart of accounts, mappings, and journal entries'', ''erp.general-ledger''),
    (''erp.general-ledger.update'', ''update'', N''update · Tenant chart of accounts, mappings, and journal entries'', ''erp.general-ledger'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE UNIQUE INDEX [IX_JournalEntries_TenantId_Code] ON [JournalEntries] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE UNIQUE INDEX [IX_JournalEntries_TenantId_SourceType_SourceId] ON [JournalEntries] ([TenantId], [SourceType], [SourceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE INDEX [IX_JournalEntryLines_TenantId_AccountId] ON [JournalEntryLines] ([TenantId], [AccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE UNIQUE INDEX [IX_JournalEntryLines_TenantId_JournalEntryId_LineNumber] ON [JournalEntryLines] ([TenantId], [JournalEntryId], [LineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE INDEX [IX_LedgerAccountMappings_TenantId_AccountId] ON [LedgerAccountMappings] ([TenantId], [AccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE UNIQUE INDEX [IX_LedgerAccountMappings_TenantId_MappingKey] ON [LedgerAccountMappings] ([TenantId], [MappingKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    CREATE UNIQUE INDEX [IX_LedgerAccounts_TenantId_Code] ON [LedgerAccounts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060607_AddPlatformGeneralLedger'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016060607_AddPlatformGeneralLedger', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016063432_AddTenantAIProviderSettings'
)
BEGIN
    CREATE TABLE [TenantAIProviderSettings] (
        [TenantId] uniqueidentifier NOT NULL,
        [Provider] nvarchar(20) NOT NULL,
        [OpenAIKeyCipherText] nvarchar(2048) NULL,
        [NvidiaKeyCipherText] nvarchar(2048) NULL,
        [NvidiaModel] nvarchar(200) NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantAIProviderSettings] PRIMARY KEY ([TenantId]),
        CONSTRAINT [FK_TenantAIProviderSettings_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016063432_AddTenantAIProviderSettings'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016063432_AddTenantAIProviderSettings', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016064755_AddAiProviderSettingsPermissions'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.ai-settings.create'', ''create'', N''create · Tenant AI provider settings and API credentials'', ''erp.ai-settings''),
    (''erp.ai-settings.delete'', ''delete'', N''delete · Tenant AI provider settings and API credentials'', ''erp.ai-settings''),
    (''erp.ai-settings.execute'', ''execute'', N''execute · Tenant AI provider settings and API credentials'', ''erp.ai-settings''),
    (''erp.ai-settings.read'', ''read'', N''read · Tenant AI provider settings and API credentials'', ''erp.ai-settings''),
    (''erp.ai-settings.update'', ''update'', N''update · Tenant AI provider settings and API credentials'', ''erp.ai-settings'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016064755_AddAiProviderSettingsPermissions'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016064755_AddAiProviderSettingsPermissions', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016070211_AddOpenAIModelSelection'
)
BEGIN
    ALTER TABLE [TenantAIProviderSettings] ADD [OpenAIModel] nvarchar(200) NOT NULL DEFAULT N'gpt-6-astra';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016070211_AddOpenAIModelSelection'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016070211_AddOpenAIModelSelection', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016183933_AddPlatformJournalEntryDateIndex'
)
BEGIN
    CREATE INDEX [IX_JournalEntries_TenantId_EntryDate_CreatedAt] ON [JournalEntries] ([TenantId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016183933_AddPlatformJournalEntryDateIndex'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016183933_AddPlatformJournalEntryDateIndex', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    CREATE TABLE [PlatformModulePublisherKeys] (
        [Id] uniqueidentifier NOT NULL,
        [Publisher] nvarchar(120) NOT NULL,
        [KeyId] varchar(80) NOT NULL,
        [PublicKeyPem] nvarchar(max) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PlatformModulePublisherKeys] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    CREATE TABLE [PlatformModuleReleases] (
        [Id] uniqueidentifier NOT NULL,
        [ModuleCode] varchar(80) NOT NULL,
        [Version] varchar(40) NOT NULL,
        [Publisher] nvarchar(120) NOT NULL,
        [ManifestJson] nvarchar(max) NOT NULL,
        [ArtifactSha256] char(64) NOT NULL,
        [SignatureBase64] varchar(2048) NOT NULL,
        [KeyId] varchar(80) NOT NULL,
        [StorageKey] varchar(80) NOT NULL,
        [Status] varchar(16) NOT NULL,
        [RevocationReason] nvarchar(500) NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [PublishedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [PublishedAt] datetimeoffset NULL,
        [RevokedAt] datetimeoffset NULL,
        CONSTRAINT [PK_PlatformModuleReleases] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    CREATE TABLE [PlatformUserRoles] (
        [UserId] uniqueidentifier NOT NULL,
        [Role] varchar(64) NOT NULL,
        [AssignedByUserId] uniqueidentifier NULL,
        [AssignedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PlatformUserRoles] PRIMARY KEY ([UserId], [Role]),
        CONSTRAINT [FK_PlatformUserRoles_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PlatformModulePublisherKeys_Publisher_KeyId] ON [PlatformModulePublisherKeys] ([Publisher], [KeyId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PlatformModuleReleases_ModuleCode_Version] ON [PlatformModuleReleases] ([ModuleCode], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    CREATE INDEX [IX_PlatformModuleReleases_Status_ModuleCode] ON [PlatformModuleReleases] ([Status], [ModuleCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    CREATE INDEX [IX_PlatformUserRoles_Role] ON [PlatformUserRoles] ([Role]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016193329_AddPlatformModuleCatalog'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016193329_AddPlatformModuleCatalog', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016194610_AddTenantModuleActivations'
)
BEGIN
    CREATE TABLE [TenantModuleActivations] (
        [TenantId] uniqueidentifier NOT NULL,
        [ModuleCode] varchar(80) NOT NULL,
        [Version] varchar(40) NOT NULL,
        [ActivatedByUserId] uniqueidentifier NOT NULL,
        [ActivatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantModuleActivations] PRIMARY KEY ([TenantId], [ModuleCode]),
        CONSTRAINT [FK_TenantModuleActivations_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016194610_AddTenantModuleActivations'
)
BEGIN
    CREATE INDEX [IX_TenantModuleActivations_TenantId_Version] ON [TenantModuleActivations] ([TenantId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016194610_AddTenantModuleActivations'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016194610_AddTenantModuleActivations', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016195411_AddTenantModuleMarketplacePermission'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.tenant-modules.create'', ''create'', N''create · Published extension catalog and tenant module entitlements'', ''erp.tenant-modules''),
    (''erp.tenant-modules.delete'', ''delete'', N''delete · Published extension catalog and tenant module entitlements'', ''erp.tenant-modules''),
    (''erp.tenant-modules.execute'', ''execute'', N''execute · Published extension catalog and tenant module entitlements'', ''erp.tenant-modules''),
    (''erp.tenant-modules.read'', ''read'', N''read · Published extension catalog and tenant module entitlements'', ''erp.tenant-modules''),
    (''erp.tenant-modules.update'', ''update'', N''update · Published extension catalog and tenant module entitlements'', ''erp.tenant-modules'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016195411_AddTenantModuleMarketplacePermission'
)
BEGIN
    INSERT INTO [dbo].[TenantPermissionRules]
        ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect], [ResourceType],
         [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
    SELECT NEWID(), membership.[TenantId], 1, N'TenantUser', NULL, 'erp.tenant-modules.read', 1, NULL,
           NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
    FROM [dbo].[TenantMemberships] AS membership
    WHERE membership.[Role] = N'TenantUser'
      AND NOT EXISTS (
        SELECT 1 FROM [dbo].[TenantPermissionRules] AS existingRule
        WHERE existingRule.[TenantId] = membership.[TenantId]
          AND existingRule.[SubjectType] = 1 AND existingRule.[SubjectRole] = N'TenantUser'
          AND existingRule.[PermissionCode] = 'erp.tenant-modules.read' AND existingRule.[Effect] = 1
      );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016195411_AddTenantModuleMarketplacePermission'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016195411_AddTenantModuleMarketplacePermission', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016201452_AddModuleRuntimeMetadata'
)
BEGIN
    ALTER TABLE [PlatformModuleReleases] ADD [RuntimeKind] varchar(40) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016201452_AddModuleRuntimeMetadata'
)
BEGIN
    ALTER TABLE [PlatformModuleReleases] ADD [RuntimeValidatedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016201452_AddModuleRuntimeMetadata'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016201452_AddModuleRuntimeMetadata', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE TABLE [TenantCustomFormDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Description] nvarchar(500) NULL,
        [Version] int NOT NULL,
        [Status] varchar(16) NOT NULL,
        [FieldsJson] nvarchar(max) NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [UpdatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantCustomFormDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantCustomFormDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantCustomFormDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE TABLE [TenantCustomFormRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [FormId] uniqueidentifier NOT NULL,
        [Version] int NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Description] nvarchar(500) NULL,
        [Status] varchar(16) NOT NULL,
        [FieldsJson] nvarchar(max) NOT NULL,
        [ChangeKind] varchar(24) NOT NULL,
        [ChangedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantCustomFormRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TenantCustomFormRevisions_TenantCustomFormDefinitions_TenantId_FormId] FOREIGN KEY ([TenantId], [FormId]) REFERENCES [TenantCustomFormDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE TABLE [TenantCustomFormSubmissions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [FormId] uniqueidentifier NOT NULL,
        [FormCode] varchar(40) NOT NULL,
        [FormName] nvarchar(120) NOT NULL,
        [FormVersion] int NOT NULL,
        [FieldsJsonSnapshot] nvarchar(max) NOT NULL,
        [ValuesJson] nvarchar(max) NOT NULL,
        [Status] varchar(16) NOT NULL,
        [SubmittedByUserId] uniqueidentifier NOT NULL,
        [SubmittedAt] datetimeoffset NOT NULL,
        [DecidedByUserId] uniqueidentifier NULL,
        [DecidedAt] datetimeoffset NULL,
        [DecisionReason] nvarchar(500) NULL,
        CONSTRAINT [PK_TenantCustomFormSubmissions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantCustomFormSubmissions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantCustomFormSubmissions_TenantCustomFormDefinitions_TenantId_FormId] FOREIGN KEY ([TenantId], [FormId]) REFERENCES [TenantCustomFormDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.custom-forms.create'', ''create'', N''create · Tenant dynamic forms and submissions'', ''erp.custom-forms''),
    (''erp.custom-forms.delete'', ''delete'', N''delete · Tenant dynamic forms and submissions'', ''erp.custom-forms''),
    (''erp.custom-forms.execute'', ''execute'', N''execute · Tenant dynamic forms and submissions'', ''erp.custom-forms''),
    (''erp.custom-forms.read'', ''read'', N''read · Tenant dynamic forms and submissions'', ''erp.custom-forms''),
    (''erp.custom-forms.update'', ''update'', N''update · Tenant dynamic forms and submissions'', ''erp.custom-forms'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantCustomFormDefinitions_TenantId_Code_Version] ON [TenantCustomFormDefinitions] ([TenantId], [Code], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormDefinitions_TenantId_Status_UpdatedAt] ON [TenantCustomFormDefinitions] ([TenantId], [Status], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormRevisions_TenantId_FormId_Version_CreatedAt] ON [TenantCustomFormRevisions] ([TenantId], [FormId], [Version], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormSubmissions_TenantId_FormId_Status_SubmittedAt] ON [TenantCustomFormSubmissions] ([TenantId], [FormId], [Status], [SubmittedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormSubmissions_TenantId_SubmittedByUserId_SubmittedAt] ON [TenantCustomFormSubmissions] ([TenantId], [SubmittedByUserId], [SubmittedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204041_AddTenantDynamicForms'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016204041_AddTenantDynamicForms', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE TABLE [TenantWorkflowDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Description] nvarchar(500) NULL,
        [Version] int NOT NULL,
        [Status] varchar(16) NOT NULL,
        [StepsJson] nvarchar(max) NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [UpdatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantWorkflowDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantWorkflowDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantWorkflowDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE TABLE [TenantWorkflowInstances] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [DefinitionCode] varchar(40) NOT NULL,
        [DefinitionName] nvarchar(120) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [StepsJsonSnapshot] nvarchar(max) NOT NULL,
        [SubjectType] varchar(80) NOT NULL,
        [SubjectTitle] nvarchar(160) NOT NULL,
        [SubjectId] uniqueidentifier NULL,
        [ContextJson] nvarchar(max) NOT NULL,
        [Status] varchar(16) NOT NULL,
        [CurrentStepIndex] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [StartedByUserId] uniqueidentifier NOT NULL,
        [StartedAt] datetimeoffset NOT NULL,
        [CompletedAt] datetimeoffset NULL,
        CONSTRAINT [PK_TenantWorkflowInstances] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantWorkflowInstances_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantWorkflowInstances_TenantWorkflowDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [TenantWorkflowDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE TABLE [TenantWorkflowActions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [InstanceId] uniqueidentifier NOT NULL,
        [StepIndex] int NOT NULL,
        [StepName] nvarchar(120) NOT NULL,
        [Decision] varchar(16) NOT NULL,
        [Comment] nvarchar(500) NULL,
        [ActorUserId] uniqueidentifier NOT NULL,
        [ActorRole] varchar(64) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantWorkflowActions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TenantWorkflowActions_TenantWorkflowInstances_TenantId_InstanceId] FOREIGN KEY ([TenantId], [InstanceId]) REFERENCES [TenantWorkflowInstances] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.workflows.create'', ''create'', N''create · Tenant workflow definitions, instances and approvals'', ''erp.workflows''),
    (''erp.workflows.delete'', ''delete'', N''delete · Tenant workflow definitions, instances and approvals'', ''erp.workflows''),
    (''erp.workflows.execute'', ''execute'', N''execute · Tenant workflow definitions, instances and approvals'', ''erp.workflows''),
    (''erp.workflows.read'', ''read'', N''read · Tenant workflow definitions, instances and approvals'', ''erp.workflows''),
    (''erp.workflows.update'', ''update'', N''update · Tenant workflow definitions, instances and approvals'', ''erp.workflows'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowActions_TenantId_InstanceId_StepIndex_CreatedAt] ON [TenantWorkflowActions] ([TenantId], [InstanceId], [StepIndex], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantWorkflowDefinitions_TenantId_Code_Version] ON [TenantWorkflowDefinitions] ([TenantId], [Code], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowDefinitions_TenantId_Status_UpdatedAt] ON [TenantWorkflowDefinitions] ([TenantId], [Status], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowInstances_TenantId_DefinitionId] ON [TenantWorkflowInstances] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowInstances_TenantId_StartedByUserId_StartedAt] ON [TenantWorkflowInstances] ([TenantId], [StartedByUserId], [StartedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowInstances_TenantId_Status_StartedAt] ON [TenantWorkflowInstances] ([TenantId], [Status], [StartedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205038_AddTenantWorkflowEngine'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016205038_AddTenantWorkflowEngine', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    CREATE TABLE [TenantBusinessRuleDefinitions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Description] nvarchar(500) NULL,
        [Trigger] varchar(64) NOT NULL,
        [Version] int NOT NULL,
        [Status] varchar(16) NOT NULL,
        [ConditionsJson] nvarchar(max) NOT NULL,
        [WorkflowCode] varchar(40) NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [UpdatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantBusinessRuleDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantBusinessRuleDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantBusinessRuleDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    CREATE TABLE [TenantBusinessRuleEvaluations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RuleId] uniqueidentifier NOT NULL,
        [EventId] uniqueidentifier NOT NULL,
        [Matched] bit NOT NULL,
        [WorkflowInstanceId] uniqueidentifier NULL,
        [Details] nvarchar(500) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantBusinessRuleEvaluations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantBusinessRuleEvaluations_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantBusinessRuleEvaluations_TenantBusinessRuleDefinitions_TenantId_RuleId] FOREIGN KEY ([TenantId], [RuleId]) REFERENCES [TenantBusinessRuleDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_TenantBusinessRuleEvaluations_TenantWorkflowInstances_TenantId_WorkflowInstanceId] FOREIGN KEY ([TenantId], [WorkflowInstanceId]) REFERENCES [TenantWorkflowInstances] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.business-rules.create'', ''create'', N''create · Tenant business rule definitions and evaluation history'', ''erp.business-rules''),
    (''erp.business-rules.delete'', ''delete'', N''delete · Tenant business rule definitions and evaluation history'', ''erp.business-rules''),
    (''erp.business-rules.execute'', ''execute'', N''execute · Tenant business rule definitions and evaluation history'', ''erp.business-rules''),
    (''erp.business-rules.read'', ''read'', N''read · Tenant business rule definitions and evaluation history'', ''erp.business-rules''),
    (''erp.business-rules.update'', ''update'', N''update · Tenant business rule definitions and evaluation history'', ''erp.business-rules'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantBusinessRuleDefinitions_TenantId_Code_Version] ON [TenantBusinessRuleDefinitions] ([TenantId], [Code], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_TenantBusinessRuleDefinitions_TenantId_Trigger_Status] ON [TenantBusinessRuleDefinitions] ([TenantId], [Trigger], [Status]) WHERE [Status] = ''Published''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    CREATE INDEX [IX_TenantBusinessRuleEvaluations_TenantId_CreatedAt] ON [TenantBusinessRuleEvaluations] ([TenantId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantBusinessRuleEvaluations_TenantId_RuleId_EventId] ON [TenantBusinessRuleEvaluations] ([TenantId], [RuleId], [EventId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    CREATE INDEX [IX_TenantBusinessRuleEvaluations_TenantId_WorkflowInstanceId] ON [TenantBusinessRuleEvaluations] ([TenantId], [WorkflowInstanceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210832_AddTenantBusinessRules'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016210832_AddTenantBusinessRules', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016211540_EnforceSinglePublishedWorkflow'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_TenantWorkflowDefinitions_TenantId_Code] ON [TenantWorkflowDefinitions] ([TenantId], [Code]) WHERE [Status] = ''Published''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016211540_EnforceSinglePublishedWorkflow'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016211540_EnforceSinglePublishedWorkflow', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016212417_AddTenantSavedReports'
)
BEGIN
    CREATE TABLE [TenantSavedReports] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Source] varchar(40) NOT NULL,
        [DefinitionJson] nvarchar(max) NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [UpdatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantSavedReports] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantSavedReports_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantSavedReports_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016212417_AddTenantSavedReports'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.reports.create'', ''create'', N''create · Tenant report definitions and execution'', ''erp.reports''),
    (''erp.reports.delete'', ''delete'', N''delete · Tenant report definitions and execution'', ''erp.reports''),
    (''erp.reports.execute'', ''execute'', N''execute · Tenant report definitions and execution'', ''erp.reports''),
    (''erp.reports.read'', ''read'', N''read · Tenant report definitions and execution'', ''erp.reports''),
    (''erp.reports.update'', ''update'', N''update · Tenant report definitions and execution'', ''erp.reports'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016212417_AddTenantSavedReports'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantSavedReports_TenantId_Name] ON [TenantSavedReports] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016212417_AddTenantSavedReports'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016212417_AddTenantSavedReports', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016214200_AddAiUiDesignerPermission'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''studio.ai-design.create'', ''create'', N''create · AI ERP screen design proposals'', ''studio.ai-design''),
    (''studio.ai-design.delete'', ''delete'', N''delete · AI ERP screen design proposals'', ''studio.ai-design''),
    (''studio.ai-design.execute'', ''execute'', N''execute · AI ERP screen design proposals'', ''studio.ai-design''),
    (''studio.ai-design.read'', ''read'', N''read · AI ERP screen design proposals'', ''studio.ai-design''),
    (''studio.ai-design.update'', ''update'', N''update · AI ERP screen design proposals'', ''studio.ai-design'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016214200_AddAiUiDesignerPermission'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016214200_AddAiUiDesignerPermission', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016221848_AddStudioKnowledgeIndexPlatform'
)
BEGIN
    CREATE TABLE [StudioKnowledgeDocuments] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [IndexedByUserId] uniqueidentifier NOT NULL,
        [Path] nvarchar(500) NOT NULL,
        [ContentSha256] char(64) NOT NULL,
        [CommitSha] varchar(64) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [IndexedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StudioKnowledgeDocuments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_StudioKnowledgeDocuments_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016221848_AddStudioKnowledgeIndexPlatform'
)
BEGIN
    CREATE INDEX [IX_StudioKnowledgeDocuments_TenantId_ProjectId_WorkspaceRequestId_Path_IndexedAt] ON [StudioKnowledgeDocuments] ([TenantId], [ProjectId], [WorkspaceRequestId], [Path], [IndexedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016221848_AddStudioKnowledgeIndexPlatform'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioKnowledgeDocuments_TenantId_WorkspaceRequestId_Path_ContentSha256] ON [StudioKnowledgeDocuments] ([TenantId], [WorkspaceRequestId], [Path], [ContentSha256]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016221848_AddStudioKnowledgeIndexPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016221848_AddStudioKnowledgeIndexPlatform', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223217_AddStudioCodeReviewThreadsPlatform'
)
BEGIN
    CREATE TABLE [StudioCodeReviewThreads] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Path] nvarchar(500) NOT NULL,
        [LineNumber] int NOT NULL,
        [HeadCommitSha] varchar(64) NOT NULL,
        [Status] varchar(16) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_StudioCodeReviewThreads] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StudioCodeReviewThreads_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StudioCodeReviewThreads_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioCodeReviewThreads_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_StudioCodeReviewThreads_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223217_AddStudioCodeReviewThreadsPlatform'
)
BEGIN
    CREATE TABLE [StudioCodeReviewComments] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ThreadId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Body] nvarchar(4000) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StudioCodeReviewComments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_StudioCodeReviewComments_StudioCodeReviewThreads_TenantId_ThreadId] FOREIGN KEY ([TenantId], [ThreadId]) REFERENCES [StudioCodeReviewThreads] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223217_AddStudioCodeReviewThreadsPlatform'
)
BEGIN
    CREATE INDEX [IX_StudioCodeReviewComments_TenantId_ThreadId_CreatedAt] ON [StudioCodeReviewComments] ([TenantId], [ThreadId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223217_AddStudioCodeReviewThreadsPlatform'
)
BEGIN
    CREATE INDEX [IX_StudioCodeReviewThreads_TenantId_ProjectId_WorkspaceRequestId_Path_LineNumber_Status] ON [StudioCodeReviewThreads] ([TenantId], [ProjectId], [WorkspaceRequestId], [Path], [LineNumber], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223217_AddStudioCodeReviewThreadsPlatform'
)
BEGIN
    CREATE INDEX [IX_StudioCodeReviewThreads_TenantId_WorkspaceRequestId] ON [StudioCodeReviewThreads] ([TenantId], [WorkspaceRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223217_AddStudioCodeReviewThreadsPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016223217_AddStudioCodeReviewThreadsPlatform', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubReviewCommentId] bigint NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubSyncedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubBaseBranch] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestNumber] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestState] nvarchar(32) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestUrl] nvarchar(2048) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubRepository] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_StudioCodeReviewComments_GitHubReviewCommentId] ON [StudioCodeReviewComments] ([GitHubReviewCommentId]) WHERE [GitHubReviewCommentId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224256_AddStudioGitHubReviewSyncPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016224256_AddStudioGitHubReviewSyncPlatform', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016225814_AddStudioGitHubInboundCommentSyncPlatform'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubAuthorLogin] nvarchar(39) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016225814_AddStudioGitHubInboundCommentSyncPlatform'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubPullRequestNumber] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016225814_AddStudioGitHubInboundCommentSyncPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016225814_AddStudioGitHubInboundCommentSyncPlatform', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016230504_AddStudioGitHubCommentRepositoryPlatform'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubRepository] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016230504_AddStudioGitHubCommentRepositoryPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016230504_AddStudioGitHubCommentRepositoryPlatform', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017021842_AddStudioKnowledgeEmbeddingsPlatform'
)
BEGIN
    ALTER TABLE [StudioKnowledgeDocuments] ADD [EmbeddingJson] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017021842_AddStudioKnowledgeEmbeddingsPlatform'
)
BEGIN
    ALTER TABLE [StudioKnowledgeDocuments] ADD [EmbeddingModel] nvarchar(100) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017021842_AddStudioKnowledgeEmbeddingsPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017021842_AddStudioKnowledgeEmbeddingsPlatform', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017031511_AddTenantDashboardWidgets'
)
BEGIN
    CREATE TABLE [TenantDashboardWidgets] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [SavedReportId] uniqueidentifier NOT NULL,
        [Position] int NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantDashboardWidgets] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantDashboardWidgets_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantDashboardWidgets_TenantSavedReports_TenantId_SavedReportId] FOREIGN KEY ([TenantId], [SavedReportId]) REFERENCES [TenantSavedReports] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_TenantDashboardWidgets_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017031511_AddTenantDashboardWidgets'
)
BEGIN
    CREATE INDEX [IX_TenantDashboardWidgets_TenantId_Position] ON [TenantDashboardWidgets] ([TenantId], [Position]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017031511_AddTenantDashboardWidgets'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantDashboardWidgets_TenantId_SavedReportId] ON [TenantDashboardWidgets] ([TenantId], [SavedReportId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017031511_AddTenantDashboardWidgets'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017031511_AddTenantDashboardWidgets', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033549_AddTenantCustomMenuEntries'
)
BEGIN
    CREATE TABLE [TenantCustomMenuEntries] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(40) NOT NULL,
        [Label] nvarchar(80) NOT NULL,
        [TargetPage] varchar(40) NOT NULL,
        [Position] int NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [UpdatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantCustomMenuEntries] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantCustomMenuEntries_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantCustomMenuEntries_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033549_AddTenantCustomMenuEntries'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.custom-menus.create'', ''create'', N''create · Tenant custom navigation entries'', ''erp.custom-menus''),
    (''erp.custom-menus.delete'', ''delete'', N''delete · Tenant custom navigation entries'', ''erp.custom-menus''),
    (''erp.custom-menus.execute'', ''execute'', N''execute · Tenant custom navigation entries'', ''erp.custom-menus''),
    (''erp.custom-menus.read'', ''read'', N''read · Tenant custom navigation entries'', ''erp.custom-menus''),
    (''erp.custom-menus.update'', ''update'', N''update · Tenant custom navigation entries'', ''erp.custom-menus'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033549_AddTenantCustomMenuEntries'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantCustomMenuEntries_TenantId_Code] ON [TenantCustomMenuEntries] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033549_AddTenantCustomMenuEntries'
)
BEGIN
    CREATE INDEX [IX_TenantCustomMenuEntries_TenantId_Position] ON [TenantCustomMenuEntries] ([TenantId], [Position]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033549_AddTenantCustomMenuEntries'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017033549_AddTenantCustomMenuEntries', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017035024_AddTenantSavedViewKind'
)
BEGIN
    ALTER TABLE [TenantSavedReports] ADD [Kind] varchar(12) NOT NULL DEFAULT 'Report';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017035024_AddTenantSavedViewKind'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017035024_AddTenantSavedViewKind', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017051619_AddIntegrationExecutionPermission'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.integrations.create'', ''create'', N''create · Tenant integration execution'', ''erp.integrations''),
    (''erp.integrations.delete'', ''delete'', N''delete · Tenant integration execution'', ''erp.integrations''),
    (''erp.integrations.execute'', ''execute'', N''execute · Tenant integration execution'', ''erp.integrations''),
    (''erp.integrations.read'', ''read'', N''read · Tenant integration execution'', ''erp.integrations''),
    (''erp.integrations.update'', ''update'', N''update · Tenant integration execution'', ''erp.integrations'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017051619_AddIntegrationExecutionPermission'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017051619_AddIntegrationExecutionPermission', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017052400_AddIntegrationOperationQueue'
)
BEGIN
    CREATE TABLE [IntegrationOperations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestedByUserId] uniqueidentifier NOT NULL,
        [IntegrationCode] varchar(80) NOT NULL,
        [IdempotencyKeyHash] varchar(64) NOT NULL,
        [PayloadSha256] varchar(64) NOT NULL,
        [ProviderIdempotencyKey] varchar(64) NOT NULL,
        [EncryptedPayload] nvarchar(max) NOT NULL,
        [EncryptedResult] nvarchar(max) NULL,
        [Status] varchar(24) NOT NULL,
        [ErrorCode] varchar(48) NULL,
        [AttemptCount] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [NextAttemptAt] datetimeoffset NOT NULL,
        [StartedAt] datetimeoffset NULL,
        [CompletedAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_IntegrationOperations] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_IntegrationOperations_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017052400_AddIntegrationOperationQueue'
)
BEGIN
    CREATE INDEX [IX_IntegrationOperations_Status_NextAttemptAt_CreatedAt] ON [IntegrationOperations] ([Status], [NextAttemptAt], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017052400_AddIntegrationOperationQueue'
)
BEGIN
    CREATE UNIQUE INDEX [IX_IntegrationOperations_TenantId_IntegrationCode_IdempotencyKeyHash] ON [IntegrationOperations] ([TenantId], [IntegrationCode], [IdempotencyKeyHash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017052400_AddIntegrationOperationQueue'
)
BEGIN
    CREATE INDEX [IX_IntegrationOperations_TenantId_RequestedByUserId_CreatedAt] ON [IntegrationOperations] ([TenantId], [RequestedByUserId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017052400_AddIntegrationOperationQueue'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017052400_AddIntegrationOperationQueue', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104039_AddCrmOpportunities'
)
BEGIN
    CREATE TABLE [CrmOpportunities] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(40) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [CustomerId] uniqueidentifier NULL,
        [Stage] varchar(20) NOT NULL,
        [EstimatedValue] decimal(18,2) NULL,
        [CurrencyCode] char(3) NOT NULL,
        [ProbabilityPercent] int NOT NULL,
        [ExpectedCloseDate] date NULL,
        [NextActivityAt] datetimeoffset NULL,
        [Notes] nvarchar(2000) NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_CrmOpportunities] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CrmOpportunities_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_CrmOpportunities_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CrmOpportunities_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104039_AddCrmOpportunities'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CrmOpportunities_TenantId_Code] ON [CrmOpportunities] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104039_AddCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_CrmOpportunities_TenantId_CustomerId] ON [CrmOpportunities] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104039_AddCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_CrmOpportunities_TenantId_NextActivityAt] ON [CrmOpportunities] ([TenantId], [NextActivityAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104039_AddCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_CrmOpportunities_TenantId_Stage_ExpectedCloseDate] ON [CrmOpportunities] ([TenantId], [Stage], [ExpectedCloseDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104039_AddCrmOpportunities'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017104039_AddCrmOpportunities', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE TABLE [BillOfMaterials] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(48) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [ProductStockItemId] uniqueidentifier NOT NULL,
        [OutputQuantity] decimal(18,4) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_BillOfMaterials] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_BillOfMaterials_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_BillOfMaterials_OutputQuantityPositive] CHECK ([OutputQuantity] > 0),
        CONSTRAINT [FK_BillOfMaterials_StockItems_TenantId_ProductStockItemId] FOREIGN KEY ([TenantId], [ProductStockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_BillOfMaterials_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE TABLE [BillOfMaterialLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [BillOfMaterialId] uniqueidentifier NOT NULL,
        [ComponentStockItemId] uniqueidentifier NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [ScrapPercent] decimal(9,4) NOT NULL,
        CONSTRAINT [PK_BillOfMaterialLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_BillOfMaterialLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_BillOfMaterialLines_Quantities] CHECK ([Quantity] > 0 AND [ScrapPercent] >= 0 AND [ScrapPercent] <= 100),
        CONSTRAINT [FK_BillOfMaterialLines_BillOfMaterials_TenantId_BillOfMaterialId] FOREIGN KEY ([TenantId], [BillOfMaterialId]) REFERENCES [BillOfMaterials] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_BillOfMaterialLines_StockItems_TenantId_ComponentStockItemId] FOREIGN KEY ([TenantId], [ComponentStockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE TABLE [ManufacturingOrders] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(48) NOT NULL,
        [BillOfMaterialId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [PlannedQuantity] decimal(18,4) NOT NULL,
        [Status] nvarchar(16) NOT NULL,
        [PlannedDate] date NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [CompletedAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_ManufacturingOrders] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_ManufacturingOrders_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_ManufacturingOrders_PlannedQuantityPositive] CHECK ([PlannedQuantity] > 0),
        CONSTRAINT [FK_ManufacturingOrders_BillOfMaterials_TenantId_BillOfMaterialId] FOREIGN KEY ([TenantId], [BillOfMaterialId]) REFERENCES [BillOfMaterials] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ManufacturingOrders_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ManufacturingOrders_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE TABLE [ManufacturingOrderLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ManufacturingOrderId] uniqueidentifier NOT NULL,
        [ComponentStockItemId] uniqueidentifier NOT NULL,
        [ComponentCodeSnapshot] nvarchar(64) NOT NULL,
        [ComponentNameSnapshot] nvarchar(200) NOT NULL,
        [RequiredQuantity] decimal(18,4) NOT NULL,
        CONSTRAINT [PK_ManufacturingOrderLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_ManufacturingOrderLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_ManufacturingOrderLines_RequiredQuantityPositive] CHECK ([RequiredQuantity] > 0),
        CONSTRAINT [FK_ManufacturingOrderLines_ManufacturingOrders_TenantId_ManufacturingOrderId] FOREIGN KEY ([TenantId], [ManufacturingOrderId]) REFERENCES [ManufacturingOrders] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_ManufacturingOrderLines_StockItems_TenantId_ComponentStockItemId] FOREIGN KEY ([TenantId], [ComponentStockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BillOfMaterialLines_TenantId_BillOfMaterialId_ComponentStockItemId] ON [BillOfMaterialLines] ([TenantId], [BillOfMaterialId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_BillOfMaterialLines_TenantId_ComponentStockItemId] ON [BillOfMaterialLines] ([TenantId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BillOfMaterials_TenantId_Code] ON [BillOfMaterials] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_BillOfMaterials_TenantId_ProductStockItemId_IsActive] ON [BillOfMaterials] ([TenantId], [ProductStockItemId], [IsActive]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrderLines_TenantId_ComponentStockItemId] ON [ManufacturingOrderLines] ([TenantId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingOrderLines_TenantId_ManufacturingOrderId_ComponentStockItemId] ON [ManufacturingOrderLines] ([TenantId], [ManufacturingOrderId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrders_TenantId_BillOfMaterialId] ON [ManufacturingOrders] ([TenantId], [BillOfMaterialId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingOrders_TenantId_Code] ON [ManufacturingOrders] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrders_TenantId_Status_PlannedDate] ON [ManufacturingOrders] ([TenantId], [Status], [PlannedDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrders_TenantId_WarehouseId] ON [ManufacturingOrders] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114836_AddManufacturingOrders'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017114836_AddManufacturingOrders', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE TABLE [ManufacturingWorkCenters] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] varchar(48) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [CapacityMinutesPerDay] int NOT NULL,
        [LaborCostPerHourBase] decimal(18,4) NOT NULL,
        [OverheadCostPerHourBase] decimal(18,4) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ManufacturingWorkCenters] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_ManufacturingWorkCenters_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_ManufacturingWorkCenters_Capacity] CHECK ([CapacityMinutesPerDay] > 0 AND [CapacityMinutesPerDay] <= 1440 AND [LaborCostPerHourBase] >= 0 AND [OverheadCostPerHourBase] >= 0),
        CONSTRAINT [FK_ManufacturingWorkCenters_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE TABLE [BillOfMaterialOperations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [BillOfMaterialId] uniqueidentifier NOT NULL,
        [Sequence] int NOT NULL,
        [WorkCenterId] uniqueidentifier NOT NULL,
        [SetupMinutes] decimal(12,2) NOT NULL,
        [RunMinutesPerOutputUnit] decimal(12,4) NOT NULL,
        CONSTRAINT [PK_BillOfMaterialOperations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_BillOfMaterialOperations_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_BillOfMaterialOperations_Minutes] CHECK ([Sequence] > 0 AND [SetupMinutes] >= 0 AND [RunMinutesPerOutputUnit] >= 0 AND ([SetupMinutes] + [RunMinutesPerOutputUnit]) > 0),
        CONSTRAINT [FK_BillOfMaterialOperations_BillOfMaterials_TenantId_BillOfMaterialId] FOREIGN KEY ([TenantId], [BillOfMaterialId]) REFERENCES [BillOfMaterials] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_BillOfMaterialOperations_ManufacturingWorkCenters_TenantId_WorkCenterId] FOREIGN KEY ([TenantId], [WorkCenterId]) REFERENCES [ManufacturingWorkCenters] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE TABLE [ManufacturingOrderOperations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ManufacturingOrderId] uniqueidentifier NOT NULL,
        [Sequence] int NOT NULL,
        [WorkCenterId] uniqueidentifier NOT NULL,
        [WorkCenterCodeSnapshot] varchar(48) NOT NULL,
        [WorkCenterNameSnapshot] nvarchar(160) NOT NULL,
        [SetupMinutes] decimal(12,2) NOT NULL,
        [RunMinutes] decimal(12,2) NOT NULL,
        [LaborCostPerHourBase] decimal(18,4) NOT NULL,
        [OverheadCostPerHourBase] decimal(18,4) NOT NULL,
        [PlannedCostBase] decimal(18,4) NOT NULL,
        [ScheduledStartDate] date NULL,
        [ScheduledEndDate] date NULL,
        CONSTRAINT [PK_ManufacturingOrderOperations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_ManufacturingOrderOperations_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_ManufacturingOrderOperations_MinutesAndCost] CHECK ([Sequence] > 0 AND [SetupMinutes] >= 0 AND [RunMinutes] >= 0 AND [LaborCostPerHourBase] >= 0 AND [OverheadCostPerHourBase] >= 0 AND [PlannedCostBase] >= 0),
        CONSTRAINT [FK_ManufacturingOrderOperations_ManufacturingOrders_TenantId_ManufacturingOrderId] FOREIGN KEY ([TenantId], [ManufacturingOrderId]) REFERENCES [ManufacturingOrders] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_ManufacturingOrderOperations_ManufacturingWorkCenters_TenantId_WorkCenterId] FOREIGN KEY ([TenantId], [WorkCenterId]) REFERENCES [ManufacturingWorkCenters] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE TABLE [ManufacturingCapacityAllocations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ManufacturingOrderOperationId] uniqueidentifier NOT NULL,
        [WorkCenterId] uniqueidentifier NOT NULL,
        [ScheduledDate] date NOT NULL,
        [AllocatedMinutes] decimal(12,2) NOT NULL,
        CONSTRAINT [PK_ManufacturingCapacityAllocations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_ManufacturingCapacityAllocations_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_ManufacturingCapacityAllocations_Minutes] CHECK ([AllocatedMinutes] > 0),
        CONSTRAINT [FK_ManufacturingCapacityAllocations_ManufacturingOrderOperations_TenantId_ManufacturingOrderOperationId] FOREIGN KEY ([TenantId], [ManufacturingOrderOperationId]) REFERENCES [ManufacturingOrderOperations] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_ManufacturingCapacityAllocations_ManufacturingWorkCenters_TenantId_WorkCenterId] FOREIGN KEY ([TenantId], [WorkCenterId]) REFERENCES [ManufacturingWorkCenters] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BillOfMaterialOperations_TenantId_BillOfMaterialId_Sequence] ON [BillOfMaterialOperations] ([TenantId], [BillOfMaterialId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE INDEX [IX_BillOfMaterialOperations_TenantId_WorkCenterId] ON [BillOfMaterialOperations] ([TenantId], [WorkCenterId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingCapacityAllocations_TenantId_ManufacturingOrderOperationId_ScheduledDate] ON [ManufacturingCapacityAllocations] ([TenantId], [ManufacturingOrderOperationId], [ScheduledDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE INDEX [IX_ManufacturingCapacityAllocations_TenantId_WorkCenterId_ScheduledDate] ON [ManufacturingCapacityAllocations] ([TenantId], [WorkCenterId], [ScheduledDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingOrderOperations_TenantId_ManufacturingOrderId_Sequence] ON [ManufacturingOrderOperations] ([TenantId], [ManufacturingOrderId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrderOperations_TenantId_WorkCenterId_ScheduledStartDate_ScheduledEndDate] ON [ManufacturingOrderOperations] ([TenantId], [WorkCenterId], [ScheduledStartDate], [ScheduledEndDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingWorkCenters_TenantId_Code] ON [ManufacturingWorkCenters] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121901_AddManufacturingRouting'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017121901_AddManufacturingRouting', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [ActualCostBase] decimal(18,4) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [ActualRunMinutes] decimal(12,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [ActualSetupMinutes] decimal(12,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [CompletedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [StartedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [Status] nvarchar(16) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    EXEC(N'ALTER TABLE [ManufacturingOrderOperations] ADD CONSTRAINT [CK_ManufacturingOrderOperations_Actuals] CHECK (([ActualSetupMinutes] IS NULL OR [ActualSetupMinutes] >= 0) AND ([ActualRunMinutes] IS NULL OR [ActualRunMinutes] >= 0) AND ([ActualCostBase] IS NULL OR [ActualCostBase] >= 0))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122605_AddManufacturingOperationActuals'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017122605_AddManufacturingOperationActuals', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    ALTER TABLE [StockItems] ADD [ManufacturingLeadTimeDays] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    ALTER TABLE [StockItems] ADD [ProcurementLeadTimeDays] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD [ExpectedReceiptDate] date NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD [TargetWarehouseId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    EXEC(N'ALTER TABLE [StockItems] ADD CONSTRAINT [CK_StockItems_LeadTimesNonNegative] CHECK ([ProcurementLeadTimeDays] >= 0 AND [ManufacturingLeadTimeDays] >= 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrders_TenantId_TargetWarehouseId_ExpectedReceiptDate] ON [PurchaseOrders] ([TenantId], [TargetWarehouseId], [ExpectedReceiptDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD CONSTRAINT [FK_PurchaseOrders_Warehouses_TenantId_TargetWarehouseId] FOREIGN KEY ([TenantId], [TargetWarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123808_AddTimePhasedMrp'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017123808_AddTimePhasedMrp', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017124845_AddSalesOrderRequiredDeliveryDate'
)
BEGIN
    ALTER TABLE [SalesOrders] ADD [RequestedDeliveryDate] date NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017124845_AddSalesOrderRequiredDeliveryDate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017124845_AddSalesOrderRequiredDeliveryDate', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017125509_AddMrpPlanSnapshots'
)
BEGIN
    CREATE TABLE [MrpPlanSnapshots] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [PlanDate] date NOT NULL,
        [IncludesOpenSalesOrders] bit NOT NULL,
        [SupplyCaveat] nvarchar(1000) NOT NULL,
        [ResultJson] nvarchar(max) NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_MrpPlanSnapshots] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_MrpPlanSnapshots_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_MrpPlanSnapshots_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MrpPlanSnapshots_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017125509_AddMrpPlanSnapshots'
)
BEGIN
    CREATE INDEX [IX_MrpPlanSnapshots_TenantId_CreatedAt] ON [MrpPlanSnapshots] ([TenantId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017125509_AddMrpPlanSnapshots'
)
BEGIN
    CREATE INDEX [IX_MrpPlanSnapshots_TenantId_WarehouseId] ON [MrpPlanSnapshots] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017125509_AddMrpPlanSnapshots'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017125509_AddMrpPlanSnapshots', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017130339_AddMrpPlanConversionState'
)
BEGIN
    ALTER TABLE [MrpPlanSnapshots] ADD [ConversionStateJson] nvarchar(max) NOT NULL DEFAULT N'[]';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017130339_AddMrpPlanConversionState'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017130339_AddMrpPlanConversionState', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017133531_AddGitHubPullRequestUpdatedAtPlatform'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestUpdatedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017133531_AddGitHubPullRequestUpdatedAtPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017133531_AddGitHubPullRequestUpdatedAtPlatform', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017134602_AddStudioKnowledgeRefreshConsentPlatform'
)
BEGIN
    CREATE TABLE [StudioKnowledgeRefreshConsents] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WorkspaceRequestId] uniqueidentifier NOT NULL,
        [GrantedByUserId] uniqueidentifier NOT NULL,
        [SelectedPathsJson] nvarchar(max) NOT NULL,
        [GrantedAt] datetimeoffset NOT NULL,
        [LastRefreshedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_StudioKnowledgeRefreshConsents] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_StudioKnowledgeRefreshConsents_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017134602_AddStudioKnowledgeRefreshConsentPlatform'
)
BEGIN
    CREATE INDEX [IX_StudioKnowledgeRefreshConsents_LastRefreshedAt] ON [StudioKnowledgeRefreshConsents] ([LastRefreshedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017134602_AddStudioKnowledgeRefreshConsentPlatform'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioKnowledgeRefreshConsents_TenantId_ProjectId_WorkspaceRequestId] ON [StudioKnowledgeRefreshConsents] ([TenantId], [ProjectId], [WorkspaceRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017134602_AddStudioKnowledgeRefreshConsentPlatform'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017134602_AddStudioKnowledgeRefreshConsentPlatform', N'10.0.13');
END;

COMMIT;
GO

