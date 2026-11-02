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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [Tenants] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Slug] nvarchar(100) NOT NULL,
        [IsActive] bit NOT NULL,
        [BaseCurrencyCode] nchar(3) NOT NULL DEFAULT N'TRY',
        [AuditRetentionDays] int NOT NULL DEFAULT 365,
        [AuditLastPurgeAt] datetimeoffset NULL,
        CONSTRAINT [PK_Tenants] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Tenants_AuditRetentionDays] CHECK ([AuditRetentionDays] >= 30 AND [AuditRetentionDays] <= 3650)
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [CustomerCustomFieldDefinitions] (
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
        CONSTRAINT [PK_CustomerCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_CustomerCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        CONSTRAINT [FK_PurchaseRequests_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [IsRequired] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_StockItemCustomFieldDefinitions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StockItemCustomFieldDefinitions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StockItemCustomFieldDefinitions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [TrackingMode] nvarchar(16) NOT NULL DEFAULT N'None',
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_StockItems] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StockItems_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_StockItems_MinimumStockNonNegative] CHECK ([MinimumStock] >= 0),
        CONSTRAINT [FK_StockItems_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [Warehouses] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [IsActive] bit NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_Warehouses] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_Warehouses_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_Warehouses_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [CustomerAccounts] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Code] nvarchar(64) NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Type] int NOT NULL,
        [TaxNumber] nvarchar(32) NULL,
        [GroupId] uniqueidentifier NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [RiskLimit] decimal(18,2) NULL,
        [PaymentTermDays] int NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_CustomerAccounts] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerAccounts_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_CustomerAccounts_CustomerGroups_TenantId_GroupId] FOREIGN KEY ([TenantId], [GroupId]) REFERENCES [CustomerGroups] ([TenantId], [Id]),
        CONSTRAINT [FK_CustomerAccounts_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [ToCurrencyCode] nchar(3) NOT NULL,
        [TransferDate] date NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [DestinationAmount] decimal(18,2) NOT NULL,
        [ExchangeRate] decimal(18,8) NOT NULL,
        [Reference] nvarchar(100) NULL,
        [Description] nvarchar(240) NOT NULL,
        [Status] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_FinancialAccountTransfers] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FinancialAccountTransfers_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_FinancialAccountTransfers_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [CK_FinancialAccountTransfers_DestinationAmountPositive] CHECK ([DestinationAmount] > 0),
        CONSTRAINT [CK_FinancialAccountTransfers_ExchangeRatePositive] CHECK ([ExchangeRate] > 0),
        CONSTRAINT [CK_FinancialAccountTransfers_SameCurrencyRate] CHECK ([CurrencyCode] <> [ToCurrencyCode] OR [ExchangeRate] = 1),
        CONSTRAINT [FK_FinancialAccountTransfers_FinancialAccounts_TenantId_FromAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FromAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransfers_FinancialAccounts_TenantId_ToAccountId_ToCurrencyCode] FOREIGN KEY ([TenantId], [ToAccountId], [ToCurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransfers_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        CONSTRAINT [FK_PurchaseRequestCustomFieldValues_PurchaseRequests_PurchaseRequestId] FOREIGN KEY ([PurchaseRequestId]) REFERENCES [PurchaseRequests] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_PurchaseRequestCustomFieldValues_PurchaseRequests_TenantId_PurchaseRequestId] FOREIGN KEY ([TenantId], [PurchaseRequestId]) REFERENCES [PurchaseRequests] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [IsRequired] bit NOT NULL,
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [FinancialAccountId] uniqueidentifier NULL,
        CONSTRAINT [PK_CustomerCollections] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerCollections_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_CustomerCollections_TenantId_Id_CurrencyCode] UNIQUE ([TenantId], [Id], [CurrencyCode]),
        CONSTRAINT [CK_CustomerCollections_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_CustomerCollections_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerCollections_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerCollections_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [CustomerCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_CustomerCustomFieldValues] PRIMARY KEY ([TenantId], [CustomerId], [DefinitionId]),
        CONSTRAINT [FK_CustomerCustomFieldValues_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CustomerCustomFieldValues_CustomerCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [CustomerCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [PurchaseOrders] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [SupplierId] uniqueidentifier NOT NULL,
        [SourcePurchaseRequestId] uniqueidentifier NULL,
        [SourceSupplierQuoteId] uniqueidentifier NULL,
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
        CONSTRAINT [AK_PurchaseOrders_TenantId_Id_SupplierId] UNIQUE ([TenantId], [Id], [SupplierId]),
        CONSTRAINT [FK_PurchaseOrders_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrders_PurchaseRequests_TenantId_SourcePurchaseRequestId] FOREIGN KEY ([TenantId], [SourcePurchaseRequestId]) REFERENCES [PurchaseRequests] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrders_PurchaseSupplierQuotes_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId] FOREIGN KEY ([TenantId], [SourceSupplierQuoteId], [SourcePurchaseRequestId]) REFERENCES [PurchaseSupplierQuotes] ([TenantId], [Id], [PurchaseRequestId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseOrders_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [DueDate] date NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Status] int NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [DiscountTotal] decimal(18,2) NOT NULL,
        [TaxTotal] decimal(18,2) NOT NULL,
        [GrandTotal] decimal(18,2) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PurchaseInvoices] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseInvoices_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_PurchaseInvoices_TenantId_Id_SupplierId] UNIQUE ([TenantId], [Id], [SupplierId]),
        CONSTRAINT [CK_PurchaseInvoices_GrandTotalPositive] CHECK ([GrandTotal] > 0),
        CONSTRAINT [FK_PurchaseInvoices_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseInvoices_PurchaseOrders_TenantId_PurchaseOrderId_SupplierId] FOREIGN KEY ([TenantId], [PurchaseOrderId], [SupplierId]) REFERENCES [PurchaseOrders] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseInvoices_PurchaseReceipts_TenantId_PurchaseReceiptId_PurchaseOrderId] FOREIGN KEY ([TenantId], [PurchaseReceiptId], [PurchaseOrderId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id], [PurchaseOrderId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseInvoices_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [EnteredQuantity] decimal(18,2) NULL,
        [EnteredUnitCode] nvarchar(max) NULL,
        CONSTRAINT [PK_PurchaseReceiptLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PurchaseReceiptLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_PurchaseReceiptLines_TenantId_ReceiptId_Id] UNIQUE ([TenantId], [ReceiptId], [Id]),
        CONSTRAINT [CK_PurchaseReceiptLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_PurchaseReceiptLines_PurchaseOrderLines_TenantId_PurchaseOrderId_OrderLineNumber] FOREIGN KEY ([TenantId], [PurchaseOrderId], [OrderLineNumber]) REFERENCES [PurchaseOrderLines] ([TenantId], [PurchaseOrderId], [LineNumber]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PurchaseReceiptLines_PurchaseReceipts_TenantId_ReceiptId_PurchaseOrderId] FOREIGN KEY ([TenantId], [ReceiptId], [PurchaseOrderId]) REFERENCES [PurchaseReceipts] ([TenantId], [Id], [PurchaseOrderId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [FinancialAccountId] uniqueidentifier NULL,
        CONSTRAINT [PK_SupplierPayments] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SupplierPayments_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_SupplierPayments_TenantId_Id_CurrencyCode] UNIQUE ([TenantId], [Id], [CurrencyCode]),
        CONSTRAINT [AK_SupplierPayments_TenantId_Id_SupplierId] UNIQUE ([TenantId], [Id], [SupplierId]),
        CONSTRAINT [CK_SupplierPayments_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_SupplierPayments_CustomerAccounts_TenantId_SupplierId] FOREIGN KEY ([TenantId], [SupplierId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierPayments_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierPayments_PurchaseInvoices_TenantId_PurchaseInvoiceId_SupplierId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId], [SupplierId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SupplierPayments_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        CONSTRAINT [AK_SupplierReturns_TenantId_Id_PurchaseInvoiceId] UNIQUE ([TenantId], [Id], [PurchaseInvoiceId]),
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [PurchaseInvoiceLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PurchaseInvoiceId] uniqueidentifier NOT NULL,
        [PurchaseReceiptLineId] uniqueidentifier NOT NULL,
        [PurchaseReceiptId] uniqueidentifier NOT NULL,
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
        CONSTRAINT [AK_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId_Id] UNIQUE ([TenantId], [PurchaseInvoiceId], [Id]),
        CONSTRAINT [CK_PurchaseInvoiceLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_PurchaseInvoiceLines_PurchaseInvoices_TenantId_PurchaseInvoiceId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_PurchaseInvoiceLines_PurchaseReceiptLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId] FOREIGN KEY ([TenantId], [PurchaseReceiptId], [PurchaseReceiptLineId]) REFERENCES [PurchaseReceiptLines] ([TenantId], [ReceiptId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        CONSTRAINT [PK_SalesInvoiceCustomFieldValueRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesInvoiceCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_SalesInvoices_TenantId_InvoiceId] FOREIGN KEY ([TenantId], [InvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceCustomFieldValueRevisions_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [SalesInvoiceCustomFieldValues] (
        [TenantId] uniqueidentifier NOT NULL,
        [InvoiceId] uniqueidentifier NOT NULL,
        [DefinitionId] uniqueidentifier NOT NULL,
        [Value] nvarchar(500) NOT NULL,
        [DefinitionVersion] int NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_SalesInvoiceCustomFieldValues] PRIMARY KEY ([TenantId], [InvoiceId], [DefinitionId]),
        CONSTRAINT [FK_SalesInvoiceCustomFieldValues_SalesInvoiceCustomFieldDefinitions_TenantId_DefinitionId] FOREIGN KEY ([TenantId], [DefinitionId]) REFERENCES [SalesInvoiceCustomFieldDefinitions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesInvoiceCustomFieldValues_SalesInvoices_TenantId_InvoiceId] FOREIGN KEY ([TenantId], [InvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE TABLE [SalesDeliveryLines] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [DeliveryId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [OrderLineNumber] int NOT NULL,
        [ReservationId] uniqueidentifier NULL,
        [StockItemId] uniqueidentifier NOT NULL,
        [StockCode] nvarchar(64) NOT NULL,
        [StockName] nvarchar(200) NOT NULL,
        [UnitCode] nvarchar(8) NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [EnteredQuantity] decimal(18,2) NULL,
        [EnteredUnitCode] nvarchar(max) NULL,
        CONSTRAINT [PK_SalesDeliveryLines] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_SalesDeliveryLines_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_SalesDeliveryLines_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_SalesDeliveryLines_SalesDeliveries_TenantId_DeliveryId_OrderId] FOREIGN KEY ([TenantId], [DeliveryId], [OrderId]) REFERENCES [SalesDeliveries] ([TenantId], [Id], [OrderId]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesDeliveryLines_SalesOrderLines_TenantId_OrderId_OrderLineNumber] FOREIGN KEY ([TenantId], [OrderId], [OrderLineNumber]) REFERENCES [SalesOrderLines] ([TenantId], [OrderId], [LineNumber]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SalesDeliveryLines_SalesOrderReservations_TenantId_ReservationId_OrderId_OrderLineNumber] FOREIGN KEY ([TenantId], [ReservationId], [OrderId], [OrderLineNumber]) REFERENCES [SalesOrderReservations] ([TenantId], [Id], [OrderId], [OrderLineNumber]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [TransferId] uniqueidentifier NULL,
        [RequestId] uniqueidentifier NULL,
        CONSTRAINT [PK_FinancialAccountTransactions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FinancialAccountTransactions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [AK_FinancialAccountTransactions_TenantId_Id_FinancialAccountId_CurrencyCode] UNIQUE ([TenantId], [Id], [FinancialAccountId], [CurrencyCode]),
        CONSTRAINT [CK_FinancialAccountTransactions_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_FinancialAccountTransactions_CustomerCollections_TenantId_CustomerCollectionId_CurrencyCode] FOREIGN KEY ([TenantId], [CustomerCollectionId], [CurrencyCode]) REFERENCES [CustomerCollections] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransactions_FinancialAccountTransactions_TenantId_ReversalOfId] FOREIGN KEY ([TenantId], [ReversalOfId]) REFERENCES [FinancialAccountTransactions] ([TenantId], [Id]),
        CONSTRAINT [FK_FinancialAccountTransactions_FinancialAccountTransfers_TenantId_TransferId] FOREIGN KEY ([TenantId], [TransferId]) REFERENCES [FinancialAccountTransfers] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransactions_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FinancialAccountTransactions_SupplierPayments_TenantId_SupplierPaymentId_CurrencyCode] FOREIGN KEY ([TenantId], [SupplierPaymentId], [CurrencyCode]) REFERENCES [SupplierPayments] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [EnteredQuantity] decimal(18,2) NULL,
        [EnteredUnitCode] nvarchar(max) NULL,
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
        CONSTRAINT [FK_SupplierReturnLines_SupplierReturns_TenantId_SupplierReturnId_PurchaseInvoiceId] FOREIGN KEY ([TenantId], [SupplierReturnId], [PurchaseInvoiceId]) REFERENCES [SupplierReturns] ([TenantId], [Id], [PurchaseInvoiceId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [SalesInvoiceId] uniqueidentifier NULL,
        [CustomerCollectionId] uniqueidentifier NULL,
        [SalesReturnId] uniqueidentifier NULL,
        [PurchaseInvoiceId] uniqueidentifier NULL,
        [SupplierPaymentId] uniqueidentifier NULL,
        [SupplierReturnId] uniqueidentifier NULL,
        CONSTRAINT [PK_CustomerLedgerEntries] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_CustomerLedgerEntries_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_CustomerLedgerEntries_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [FK_CustomerLedgerEntries_CustomerAccounts_TenantId_CustomerId] FOREIGN KEY ([TenantId], [CustomerId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CustomerLedgerEntries_CustomerCollections_TenantId_CustomerCollectionId] FOREIGN KEY ([TenantId], [CustomerCollectionId]) REFERENCES [CustomerCollections] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerLedgerEntries_CustomerLedgerEntries_TenantId_ReversalOfId] FOREIGN KEY ([TenantId], [ReversalOfId]) REFERENCES [CustomerLedgerEntries] ([TenantId], [Id]),
        CONSTRAINT [FK_CustomerLedgerEntries_PurchaseInvoices_TenantId_PurchaseInvoiceId_CustomerId] FOREIGN KEY ([TenantId], [PurchaseInvoiceId], [CustomerId]) REFERENCES [PurchaseInvoices] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerLedgerEntries_SalesInvoices_TenantId_SalesInvoiceId] FOREIGN KEY ([TenantId], [SalesInvoiceId]) REFERENCES [SalesInvoices] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerLedgerEntries_SalesReturns_TenantId_SalesReturnId] FOREIGN KEY ([TenantId], [SalesReturnId]) REFERENCES [SalesReturns] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerLedgerEntries_SupplierPayments_TenantId_SupplierPaymentId_CustomerId] FOREIGN KEY ([TenantId], [SupplierPaymentId], [CustomerId]) REFERENCES [SupplierPayments] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomerLedgerEntries_SupplierReturns_TenantId_SupplierReturnId_CustomerId] FOREIGN KEY ([TenantId], [SupplierReturnId], [CustomerId]) REFERENCES [SupplierReturns] ([TenantId], [Id], [SupplierId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [EnteredQuantity] decimal(18,2) NULL,
        [EnteredUnitCode] nvarchar(max) NULL,
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
        [EnteredQuantity] decimal(18,4) NULL,
        [EnteredUnitCode] nvarchar(8) NULL,
        [UnitCostBase] decimal(18,8) NULL,
        [Description] nvarchar(240) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReversalOfId] uniqueidentifier NULL,
        [SalesDeliveryLineId] uniqueidentifier NULL,
        [SalesReturnLineId] uniqueidentifier NULL,
        [PurchaseReceiptLineId] uniqueidentifier NULL,
        [SupplierReturnLineId] uniqueidentifier NULL,
        [InventoryTransferId] uniqueidentifier NULL,
        CONSTRAINT [PK_InventoryTransactions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_InventoryTransactions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_InventoryTransactions_QuantityPositive] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_InventoryTransactions_InventoryTransactions_TenantId_ReversalOfId] FOREIGN KEY ([TenantId], [ReversalOfId]) REFERENCES [InventoryTransactions] ([TenantId], [Id]),
        CONSTRAINT [FK_InventoryTransactions_InventoryTransfers_TenantId_InventoryTransferId] FOREIGN KEY ([TenantId], [InventoryTransferId]) REFERENCES [InventoryTransfers] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactions_PurchaseReceiptLines_TenantId_PurchaseReceiptLineId] FOREIGN KEY ([TenantId], [PurchaseReceiptLineId]) REFERENCES [PurchaseReceiptLines] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactions_SalesDeliveryLines_TenantId_SalesDeliveryLineId] FOREIGN KEY ([TenantId], [SalesDeliveryLineId]) REFERENCES [SalesDeliveryLines] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactions_SalesReturnLines_TenantId_SalesReturnLineId] FOREIGN KEY ([TenantId], [SalesReturnLineId]) REFERENCES [SalesReturnLines] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactions_StockItems_TenantId_StockItemId] FOREIGN KEY ([TenantId], [StockItemId]) REFERENCES [StockItems] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactions_SupplierReturnLines_TenantId_SupplierReturnLineId] FOREIGN KEY ([TenantId], [SupplierReturnLineId]) REFERENCES [SupplierReturnLines] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_InventoryTransactions_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
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
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_AuditEvents_TenantId_OccurredAt] ON [AuditEvents] ([TenantId], [OccurredAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_FinancialAccountTransactionId] ON [BankStatementLines] ([TenantId], [FinancialAccountTransactionId]) WHERE [FinancialAccountTransactionId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode] ON [BankStatementLines] ([TenantId], [FinancialAccountTransactionId], [FinancialAccountId], [CurrencyCode]) WHERE [FinancialAccountTransactionId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_StatementId_ExternalId] ON [BankStatementLines] ([TenantId], [StatementId], [ExternalId]) WHERE [ExternalId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_BankStatementLines_TenantId_StatementId_FinancialAccountId_CurrencyCode] ON [BankStatementLines] ([TenantId], [StatementId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BankStatementLines_TenantId_StatementId_LineNumber] ON [BankStatementLines] ([TenantId], [StatementId], [LineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_BankStatements_TenantId_AccountId_CurrencyCode] ON [BankStatements] ([TenantId], [AccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BankStatements_TenantId_Code] ON [BankStatements] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BankStatements_TenantId_RequestId] ON [BankStatements] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerAccounts_TenantId_Code] ON [CustomerAccounts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerAccounts_TenantId_GroupId] ON [CustomerAccounts] ([TenantId], [GroupId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerAccounts_TenantId_Name] ON [CustomerAccounts] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerAddresses_TenantId_CustomerId] ON [CustomerAddresses] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCollectionAllocations_TenantId_CustomerCollectionId_SalesInvoiceId] ON [CustomerCollectionAllocations] ([TenantId], [CustomerCollectionId], [SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerCollectionAllocations_TenantId_SalesInvoiceId] ON [CustomerCollectionAllocations] ([TenantId], [SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCollections_TenantId_Code] ON [CustomerCollections] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerCollections_TenantId_CustomerId_CollectionDate_CreatedAt] ON [CustomerCollections] ([TenantId], [CustomerId], [CollectionDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerCollections_TenantId_FinancialAccountId_CurrencyCode] ON [CustomerCollections] ([TenantId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCollections_TenantId_RequestId] ON [CustomerCollections] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [CustomerCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerCustomFieldDefinitions_TenantId_Code] ON [CustomerCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerCustomFieldValueRevisions_TenantId_CustomerId_DefinitionId_CreatedAt] ON [CustomerCustomFieldValueRevisions] ([TenantId], [CustomerId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerCustomFieldValueRevisions_TenantId_DefinitionId] ON [CustomerCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerCustomFieldValues_TenantId_DefinitionId] ON [CustomerCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CustomerGroups_TenantId_Code] ON [CustomerGroups] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_CustomerCollectionId] ON [CustomerLedgerEntries] ([TenantId], [CustomerCollectionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_CustomerId_EntryDate_CreatedAt] ON [CustomerLedgerEntries] ([TenantId], [CustomerId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId] ON [CustomerLedgerEntries] ([TenantId], [PurchaseInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_PurchaseInvoiceId_CustomerId] ON [CustomerLedgerEntries] ([TenantId], [PurchaseInvoiceId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_CustomerLedgerEntries_TenantId_ReversalOfId] ON [CustomerLedgerEntries] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SalesInvoiceId] ON [CustomerLedgerEntries] ([TenantId], [SalesInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SalesReturnId] ON [CustomerLedgerEntries] ([TenantId], [SalesReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierPaymentId] ON [CustomerLedgerEntries] ([TenantId], [SupplierPaymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierPaymentId_CustomerId] ON [CustomerLedgerEntries] ([TenantId], [SupplierPaymentId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierReturnId] ON [CustomerLedgerEntries] ([TenantId], [SupplierReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_CustomerLedgerEntries_TenantId_SupplierReturnId_CustomerId] ON [CustomerLedgerEntries] ([TenantId], [SupplierReturnId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FinancialAccounts_TenantId_Code] ON [FinancialAccounts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_CustomerCollectionId] ON [FinancialAccountTransactions] ([TenantId], [CustomerCollectionId]) WHERE [CustomerCollectionId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_CustomerCollectionId_CurrencyCode] ON [FinancialAccountTransactions] ([TenantId], [CustomerCollectionId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_FinancialAccountId_CurrencyCode] ON [FinancialAccountTransactions] ([TenantId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_FinancialAccountId_TransactionDate_CreatedAt] ON [FinancialAccountTransactions] ([TenantId], [FinancialAccountId], [TransactionDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_RequestId] ON [FinancialAccountTransactions] ([TenantId], [RequestId]) WHERE [RequestId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_ReversalOfId] ON [FinancialAccountTransactions] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_SupplierPaymentId] ON [FinancialAccountTransactions] ([TenantId], [SupplierPaymentId]) WHERE [SupplierPaymentId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransactions_TenantId_SupplierPaymentId_CurrencyCode] ON [FinancialAccountTransactions] ([TenantId], [SupplierPaymentId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FinancialAccountTransactions_TenantId_TransferId_FinancialAccountId] ON [FinancialAccountTransactions] ([TenantId], [TransferId], [FinancialAccountId]) WHERE [TransferId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FinancialAccountTransfers_TenantId_Code] ON [FinancialAccountTransfers] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransfers_TenantId_FromAccountId_CurrencyCode] ON [FinancialAccountTransfers] ([TenantId], [FromAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FinancialAccountTransfers_TenantId_RequestId] ON [FinancialAccountTransfers] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_FinancialAccountTransfers_TenantId_ToAccountId_ToCurrencyCode] ON [FinancialAccountTransfers] ([TenantId], [ToAccountId], [ToCurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FxRevaluationVoucherLines_TenantId_VoucherId_InvoiceId] ON [FxRevaluationVoucherLines] ([TenantId], [VoucherId], [InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FxRevaluationVouchers_TenantId_AsOfDate] ON [FxRevaluationVouchers] ([TenantId], [AsOfDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FxRevaluationVouchers_TenantId_Code] ON [FxRevaluationVouchers] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_AdjustmentId_WarehouseId_StockItemId] ON [InventoryCostAdjustmentLines] ([TenantId], [AdjustmentId], [WarehouseId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_PurchaseReceiptLineId] ON [InventoryCostAdjustmentLines] ([TenantId], [PurchaseReceiptLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_StockItemId] ON [InventoryCostAdjustmentLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustmentLines_TenantId_WarehouseId] ON [InventoryCostAdjustmentLines] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_InventoryCostAdjustments_TenantId_Code] ON [InventoryCostAdjustments] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustments_TenantId_EntryDate_CreatedAt] ON [InventoryCostAdjustments] ([TenantId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryCostAdjustments_TenantId_PurchaseReceiptId] ON [InventoryCostAdjustments] ([TenantId], [PurchaseReceiptId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_InventoryCostAdjustments_TenantId_ReversalOfId] ON [InventoryCostAdjustments] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_InventoryTransactions_TenantId_InventoryTransferId_WarehouseId_StockItemId] ON [InventoryTransactions] ([TenantId], [InventoryTransferId], [WarehouseId], [StockItemId]) WHERE [InventoryTransferId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_PurchaseReceiptLineId] ON [InventoryTransactions] ([TenantId], [PurchaseReceiptLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_InventoryTransactions_TenantId_ReversalOfId] ON [InventoryTransactions] ([TenantId], [ReversalOfId]) WHERE [ReversalOfId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_SalesDeliveryLineId] ON [InventoryTransactions] ([TenantId], [SalesDeliveryLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_SalesReturnLineId] ON [InventoryTransactions] ([TenantId], [SalesReturnLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_StockItemId] ON [InventoryTransactions] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_SupplierReturnLineId] ON [InventoryTransactions] ([TenantId], [SupplierReturnLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_WarehouseId_StockItemId_EntryDate_CreatedAt] ON [InventoryTransactions] ([TenantId], [WarehouseId], [StockItemId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactionTraces_TenantId_InventoryTransactionId] ON [InventoryTransactionTraces] ([TenantId], [InventoryTransactionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactionTraces_TenantId_StockItemId_TrackingCode] ON [InventoryTransactionTraces] ([TenantId], [StockItemId], [TrackingCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_InventoryTransfers_TenantId_Code] ON [InventoryTransfers] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransfers_TenantId_FromWarehouseId] ON [InventoryTransfers] ([TenantId], [FromWarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_InventoryTransfers_TenantId_RequestId] ON [InventoryTransfers] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransfers_TenantId_ToWarehouseId] ON [InventoryTransfers] ([TenantId], [ToWarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_InventoryTransfers_TenantId_TransferDate_CreatedAt] ON [InventoryTransfers] ([TenantId], [TransferDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoiceLines_TenantId_PurchaseInvoiceId] ON [PurchaseInvoiceLines] ([TenantId], [PurchaseInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoiceLines_TenantId_PurchaseReceiptId_PurchaseReceiptLineId] ON [PurchaseInvoiceLines] ([TenantId], [PurchaseReceiptId], [PurchaseReceiptLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseInvoices_TenantId_Code] ON [PurchaseInvoices] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoices_TenantId_PurchaseOrderId_SupplierId] ON [PurchaseInvoices] ([TenantId], [PurchaseOrderId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseInvoices_TenantId_PurchaseReceiptId] ON [PurchaseInvoices] ([TenantId], [PurchaseReceiptId]) WHERE [Status] = 1');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoices_TenantId_PurchaseReceiptId_PurchaseOrderId] ON [PurchaseInvoices] ([TenantId], [PurchaseReceiptId], [PurchaseOrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseInvoices_TenantId_SupplierId_InvoiceDate_CreatedAt] ON [PurchaseInvoices] ([TenantId], [SupplierId], [InvoiceDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseOrderCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseOrderCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseOrderCustomFieldDefinitions_TenantId_Code] ON [PurchaseOrderCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseOrderCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderCustomFieldValueRevisions_TenantId_PurchaseOrderId_DefinitionId_CreatedAt] ON [PurchaseOrderCustomFieldValueRevisions] ([TenantId], [PurchaseOrderId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderCustomFieldValues_TenantId_DefinitionId] ON [PurchaseOrderCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrderLines_TenantId_StockItemId] ON [PurchaseOrderLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_Code] ON [PurchaseOrders] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrders_TenantId_OrderDate_CreatedAt] ON [PurchaseOrders] ([TenantId], [OrderDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_SourcePurchaseRequestId] ON [PurchaseOrders] ([TenantId], [SourcePurchaseRequestId]) WHERE [SourcePurchaseRequestId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_SourceSupplierQuoteId] ON [PurchaseOrders] ([TenantId], [SourceSupplierQuoteId]) WHERE [SourceSupplierQuoteId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PurchaseOrders_TenantId_SourceSupplierQuoteId_SourcePurchaseRequestId] ON [PurchaseOrders] ([TenantId], [SourceSupplierQuoteId], [SourcePurchaseRequestId]) WHERE [SourceSupplierQuoteId] IS NOT NULL AND [SourcePurchaseRequestId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrders_TenantId_SupplierId] ON [PurchaseOrders] ([TenantId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceiptCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseReceiptCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceiptCustomFieldDefinitions_TenantId_Code] ON [PurchaseReceiptCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseReceiptCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptCustomFieldValueRevisions_TenantId_ReceiptId_DefinitionId_CreatedAt] ON [PurchaseReceiptCustomFieldValueRevisions] ([TenantId], [ReceiptId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptCustomFieldValues_TenantId_DefinitionId] ON [PurchaseReceiptCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptLines_TenantId_PurchaseOrderId_OrderLineNumber] ON [PurchaseReceiptLines] ([TenantId], [PurchaseOrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceiptLines_TenantId_ReceiptId_OrderLineNumber] ON [PurchaseReceiptLines] ([TenantId], [ReceiptId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceiptLines_TenantId_ReceiptId_PurchaseOrderId] ON [PurchaseReceiptLines] ([TenantId], [ReceiptId], [PurchaseOrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceipts_TenantId_Code] ON [PurchaseReceipts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceipts_TenantId_PurchaseOrderId_Status_ReceiptDate] ON [PurchaseReceipts] ([TenantId], [PurchaseOrderId], [Status], [ReceiptDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseReceipts_TenantId_RequestId] ON [PurchaseReceipts] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseReceipts_TenantId_WarehouseId] ON [PurchaseReceipts] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseRequestCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseRequestCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseRequestCustomFieldDefinitions_TenantId_Code] ON [PurchaseRequestCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseRequestCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValueRevisions_TenantId_PurchaseRequestId_DefinitionId_CreatedAt] ON [PurchaseRequestCustomFieldValueRevisions] ([TenantId], [PurchaseRequestId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValues_PurchaseRequestId] ON [PurchaseRequestCustomFieldValues] ([PurchaseRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestCustomFieldValues_TenantId_DefinitionId] ON [PurchaseRequestCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequestLines_TenantId_StockItemId] ON [PurchaseRequestLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseRequests_TenantId_Code] ON [PurchaseRequests] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseRequests_TenantId_Status_CreatedAt] ON [PurchaseRequests] ([TenantId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [PurchaseSupplierQuoteCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_Code] ON [PurchaseSupplierQuoteCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_DefinitionId] ON [PurchaseSupplierQuoteCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_QuoteId_DefinitionId_CreatedAt] ON [PurchaseSupplierQuoteCustomFieldValueRevisions] ([TenantId], [QuoteId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteCustomFieldValues_TenantId_DefinitionId] ON [PurchaseSupplierQuoteCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteLines_TenantId_PurchaseRequestId_RequestLineNumber] ON [PurchaseSupplierQuoteLines] ([TenantId], [PurchaseRequestId], [RequestLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuoteLines_TenantId_QuoteId_PurchaseRequestId] ON [PurchaseSupplierQuoteLines] ([TenantId], [QuoteId], [PurchaseRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_PurchaseSupplierQuotes_TenantId_PurchaseRequestId_Status_CreatedAt] ON [PurchaseSupplierQuotes] ([TenantId], [PurchaseRequestId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PurchaseSupplierQuotes_TenantId_SupplierId_Code] ON [PurchaseSupplierQuotes] ([TenantId], [SupplierId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesDeliveries_TenantId_Code] ON [SalesDeliveries] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveries_TenantId_OrderId_Status_DeliveryDate] ON [SalesDeliveries] ([TenantId], [OrderId], [Status], [DeliveryDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesDeliveries_TenantId_RequestId] ON [SalesDeliveries] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveries_TenantId_WarehouseId] ON [SalesDeliveries] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveryLines_TenantId_DeliveryId_OrderId] ON [SalesDeliveryLines] ([TenantId], [DeliveryId], [OrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesDeliveryLines_TenantId_DeliveryId_OrderLineNumber] ON [SalesDeliveryLines] ([TenantId], [DeliveryId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveryLines_TenantId_OrderId_OrderLineNumber] ON [SalesDeliveryLines] ([TenantId], [OrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesDeliveryLines_TenantId_ReservationId_OrderId_OrderLineNumber] ON [SalesDeliveryLines] ([TenantId], [ReservationId], [OrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoiceCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [SalesInvoiceCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoiceCustomFieldDefinitions_TenantId_Code] ON [SalesInvoiceCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValueRevisions_TenantId_DefinitionId] ON [SalesInvoiceCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValueRevisions_TenantId_InvoiceId_DefinitionId_CreatedAt] ON [SalesInvoiceCustomFieldValueRevisions] ([TenantId], [InvoiceId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceCustomFieldValues_TenantId_DefinitionId] ON [SalesInvoiceCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoiceLines_TenantId_DeliveryLineId] ON [SalesInvoiceLines] ([TenantId], [DeliveryLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceLines_TenantId_InvoiceId] ON [SalesInvoiceLines] ([TenantId], [InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoiceLines_TenantId_StockItemId] ON [SalesInvoiceLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoices_TenantId_Code] ON [SalesInvoices] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoices_TenantId_CustomerId] ON [SalesInvoices] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesInvoices_TenantId_DeliveryId] ON [SalesInvoices] ([TenantId], [DeliveryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoices_TenantId_InvoiceDate_CreatedAt] ON [SalesInvoices] ([TenantId], [InvoiceDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesInvoices_TenantId_OrderId] ON [SalesInvoices] ([TenantId], [OrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrderCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [SalesOrderCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrderCustomFieldDefinitions_TenantId_Code] ON [SalesOrderCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesOrderCustomFieldValueRevisions_TenantId_DefinitionId] ON [SalesOrderCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesOrderCustomFieldValueRevisions_TenantId_OrderId_DefinitionId_CreatedAt] ON [SalesOrderCustomFieldValueRevisions] ([TenantId], [OrderId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesOrderCustomFieldValues_TenantId_DefinitionId] ON [SalesOrderCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesOrderLines_TenantId_StockItemId] ON [SalesOrderLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_SalesOrderReservations_TenantId_OrderId_OrderLineNumber] ON [SalesOrderReservations] ([TenantId], [OrderId], [OrderLineNumber]) WHERE [Status] = N''Active''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrderReservations_TenantId_RequestId_OrderId_OrderLineNumber] ON [SalesOrderReservations] ([TenantId], [RequestId], [OrderId], [OrderLineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesOrderReservations_TenantId_WarehouseId_Status] ON [SalesOrderReservations] ([TenantId], [WarehouseId], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrders_TenantId_Code] ON [SalesOrders] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesOrders_TenantId_CustomerId] ON [SalesOrders] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesOrders_TenantId_OrderDate_CreatedAt] ON [SalesOrders] ([TenantId], [OrderDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesOrders_TenantId_QuoteId] ON [SalesOrders] ([TenantId], [QuoteId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesQuoteCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [SalesQuoteCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesQuoteCustomFieldDefinitions_TenantId_Code] ON [SalesQuoteCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteCustomFieldValueRevisions_TenantId_DefinitionId] ON [SalesQuoteCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteCustomFieldValueRevisions_TenantId_QuoteId_DefinitionId_CreatedAt] ON [SalesQuoteCustomFieldValueRevisions] ([TenantId], [QuoteId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteCustomFieldValues_TenantId_DefinitionId] ON [SalesQuoteCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesQuoteLines_TenantId_StockItemId] ON [SalesQuoteLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesQuotes_TenantId_Code] ON [SalesQuotes] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesQuotes_TenantId_CustomerId] ON [SalesQuotes] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesQuotes_TenantId_QuoteDate_CreatedAt] ON [SalesQuotes] ([TenantId], [QuoteDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesReturnLines_TenantId_SalesInvoiceLineId] ON [SalesReturnLines] ([TenantId], [SalesInvoiceLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesReturnLines_TenantId_SalesReturnId] ON [SalesReturnLines] ([TenantId], [SalesReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesReturnLines_TenantId_StockItemId] ON [SalesReturnLines] ([TenantId], [StockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesReturns_TenantId_Code] ON [SalesReturns] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesReturns_TenantId_CustomerId] ON [SalesReturns] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SalesReturns_TenantId_RequestId] ON [SalesReturns] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesReturns_TenantId_SalesInvoiceId_ReturnDate_CreatedAt] ON [SalesReturns] ([TenantId], [SalesInvoiceId], [ReturnDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SalesReturns_TenantId_WarehouseId] ON [SalesReturns] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItemCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [StockItemCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItemCustomFieldDefinitions_TenantId_Code] ON [StockItemCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_StockItemCustomFieldValueRevisions_TenantId_DefinitionId] ON [StockItemCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_StockItemCustomFieldValueRevisions_TenantId_StockItemId_DefinitionId_CreatedAt] ON [StockItemCustomFieldValueRevisions] ([TenantId], [StockItemId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_StockItemCustomFieldValues_TenantId_DefinitionId] ON [StockItemCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_StockItems_TenantId_Barcode] ON [StockItems] ([TenantId], [Barcode]) WHERE [Barcode] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItems_TenantId_Code] ON [StockItems] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_StockItems_TenantId_Name] ON [StockItems] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockItemUnitConversions_TenantId_StockItemId_UnitCode] ON [StockItemUnitConversions] ([TenantId], [StockItemId], [UnitCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierPayments_TenantId_Code] ON [SupplierPayments] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_FinancialAccountId_CurrencyCode] ON [SupplierPayments] ([TenantId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_PurchaseInvoiceId_Status_PaymentDate] ON [SupplierPayments] ([TenantId], [PurchaseInvoiceId], [Status], [PaymentDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_PurchaseInvoiceId_SupplierId] ON [SupplierPayments] ([TenantId], [PurchaseInvoiceId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierPayments_TenantId_RequestId] ON [SupplierPayments] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierPayments_TenantId_SupplierId] ON [SupplierPayments] ([TenantId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierReturnLines_TenantId_PurchaseInvoiceId_PurchaseInvoiceLineId] ON [SupplierReturnLines] ([TenantId], [PurchaseInvoiceId], [PurchaseInvoiceLineId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierReturnLines_TenantId_SupplierReturnId] ON [SupplierReturnLines] ([TenantId], [SupplierReturnId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierReturnLines_TenantId_SupplierReturnId_PurchaseInvoiceId] ON [SupplierReturnLines] ([TenantId], [SupplierReturnId], [PurchaseInvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierReturns_TenantId_Code] ON [SupplierReturns] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_PurchaseInvoiceId_Status_ReturnDate] ON [SupplierReturns] ([TenantId], [PurchaseInvoiceId], [Status], [ReturnDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_PurchaseInvoiceId_SupplierId] ON [SupplierReturns] ([TenantId], [PurchaseInvoiceId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SupplierReturns_TenantId_RequestId] ON [SupplierReturns] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_SupplierId] ON [SupplierReturns] ([TenantId], [SupplierId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_SupplierReturns_TenantId_WarehouseId] ON [SupplierReturns] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantExchangeRates_TenantId_CurrencyCode_RateDate_Revision] ON [TenantExchangeRates] ([TenantId], [CurrencyCode], [RateDate], [Revision]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Tenants_Slug] ON [Tenants] ([Slug]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WarehouseCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version] ON [WarehouseCustomFieldDefinitionRevisions] ([TenantId], [DefinitionId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WarehouseCustomFieldDefinitions_TenantId_Code] ON [WarehouseCustomFieldDefinitions] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_WarehouseCustomFieldValueRevisions_TenantId_DefinitionId] ON [WarehouseCustomFieldValueRevisions] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_WarehouseCustomFieldValueRevisions_TenantId_WarehouseId_DefinitionId_CreatedAt] ON [WarehouseCustomFieldValueRevisions] ([TenantId], [WarehouseId], [DefinitionId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE INDEX [IX_WarehouseCustomFieldValues_TenantId_DefinitionId] ON [WarehouseCustomFieldValues] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Warehouses_TenantId_Code] ON [Warehouses] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193008_InitialTenantDatabase'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015193008_InitialTenantDatabase', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015200000_AddTenantAuditRetentionProcedure'
)
BEGIN
    EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_AuditEvents_AppendOnly ON dbo.AuditEvents AFTER UPDATE, DELETE AS
    BEGIN SET NOCOUNT ON; IF ISNULL(TRY_CONVERT(int, SESSION_CONTEXT(N''AIERP_AuditRetentionPurge'')), 0) <> 1 THROW 51001, ''Audit events are append-only outside retention purge.'', 1; END;')
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015200000_AddTenantAuditRetentionProcedure'
)
BEGIN
    EXEC(N'CREATE OR ALTER PROCEDURE dbo.PurgeExpiredAuditEvents @BatchSize int=500, @TenantId uniqueidentifier=NULL, @MaxRowsPerTenant int=10000, @TotalDeleted int OUTPUT AS
    BEGIN
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF @BatchSize<1 OR @BatchSize>5000 THROW 51002, ''Invalid audit purge batch size.'', 1;
      IF @MaxRowsPerTenant<1 OR @MaxRowsPerTenant>100000 THROW 51003, ''Invalid audit purge row limit.'', 1;
      DECLARE @CurrentTenantId uniqueidentifier, @RetentionDays int, @Cutoff datetimeoffset, @Deleted int, @TenantDeleted int, @Now datetimeoffset;
      SET @TotalDeleted=0;
      BEGIN TRY
        EXEC sys.sp_set_session_context @key=N''AIERP_AuditRetentionPurge'', @value=1;
        DECLARE tenants CURSOR LOCAL FAST_FORWARD FOR SELECT Id, AuditRetentionDays FROM dbo.Tenants WHERE @TenantId IS NULL OR Id=@TenantId;
        OPEN tenants; FETCH NEXT FROM tenants INTO @CurrentTenantId,@RetentionDays;
        WHILE @@FETCH_STATUS=0
        BEGIN
          SET @Cutoff=DATEADD(day,-@RetentionDays,TODATETIMEOFFSET(SYSUTCDATETIME(),''+00:00'')); SET @TenantDeleted=0;
          WHILE @TenantDeleted<@MaxRowsPerTenant
          BEGIN
            BEGIN TRANSACTION;
            DELETE TOP (@BatchSize) FROM dbo.AuditEvents WHERE TenantId=@CurrentTenantId AND OccurredAt<@Cutoff;
            SET @Deleted=@@ROWCOUNT; SET @Now=TODATETIMEOFFSET(SYSUTCDATETIME(),''+00:00'');
            IF @Deleted>0 INSERT dbo.AuditEvents(TenantId,UserId,Action,Resource,OccurredAt) VALUES(@CurrentTenantId,NULL,N''audit.retention.purged'',CONCAT(N''{"cutoffUtc":"'',CONVERT(nvarchar(33),@Cutoff,127),N''","deletedCount":'',@Deleted,N''}''),@Now);
            COMMIT TRANSACTION; SET @TenantDeleted+=@Deleted; SET @TotalDeleted+=@Deleted; IF @Deleted=0 BREAK;
          END;
          UPDATE dbo.Tenants SET AuditLastPurgeAt=TODATETIMEOFFSET(SYSUTCDATETIME(),''+00:00'') WHERE Id=@CurrentTenantId;
          FETCH NEXT FROM tenants INTO @CurrentTenantId,@RetentionDays;
        END;
        CLOSE tenants; DEALLOCATE tenants;
        IF @TenantId IS NULL
        BEGIN
          SET @Cutoff=DATEADD(day,-365,TODATETIMEOFFSET(SYSUTCDATETIME(),''+00:00'')); SET @TenantDeleted=0;
          WHILE @TenantDeleted<@MaxRowsPerTenant
          BEGIN
            BEGIN TRANSACTION;
            DELETE TOP (@BatchSize) FROM dbo.AuditEvents WHERE TenantId IS NULL AND OccurredAt<@Cutoff;
            SET @Deleted=@@ROWCOUNT; SET @Now=TODATETIMEOFFSET(SYSUTCDATETIME(),''+00:00'');
            IF @Deleted>0 INSERT dbo.AuditEvents(TenantId,UserId,Action,Resource,OccurredAt) VALUES(NULL,NULL,N''audit.retention.purged'',CONCAT(N''{"cutoffUtc":"'',CONVERT(nvarchar(33),@Cutoff,127),N''","deletedCount":'',@Deleted,N''}''),@Now);
            COMMIT TRANSACTION; SET @TenantDeleted+=@Deleted; SET @TotalDeleted+=@Deleted; IF @Deleted=0 BREAK;
          END;
        END;
        EXEC sys.sp_set_session_context @key=N''AIERP_AuditRetentionPurge'', @value=NULL;
      END TRY
      BEGIN CATCH
        IF CURSOR_STATUS(''local'',''tenants'')>=0 CLOSE tenants;
        IF CURSOR_STATUS(''local'',''tenants'')>-3 DEALLOCATE tenants;
        IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
        EXEC sys.sp_set_session_context @key=N''AIERP_AuditRetentionPurge'', @value=NULL; THROW;
      END CATCH;
    END;')
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015200000_AddTenantAuditRetentionProcedure'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015200000_AddTenantAuditRetentionProcedure', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
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
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
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
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
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
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
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
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    CREATE UNIQUE INDEX [IX_JournalEntries_TenantId_Code] ON [JournalEntries] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    CREATE UNIQUE INDEX [IX_JournalEntries_TenantId_SourceType_SourceId] ON [JournalEntries] ([TenantId], [SourceType], [SourceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    CREATE INDEX [IX_JournalEntryLines_TenantId_AccountId] ON [JournalEntryLines] ([TenantId], [AccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    CREATE UNIQUE INDEX [IX_JournalEntryLines_TenantId_JournalEntryId_LineNumber] ON [JournalEntryLines] ([TenantId], [JournalEntryId], [LineNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    CREATE INDEX [IX_LedgerAccountMappings_TenantId_AccountId] ON [LedgerAccountMappings] ([TenantId], [AccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    CREATE UNIQUE INDEX [IX_LedgerAccountMappings_TenantId_MappingKey] ON [LedgerAccountMappings] ([TenantId], [MappingKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    CREATE UNIQUE INDEX [IX_LedgerAccounts_TenantId_Code] ON [LedgerAccounts] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016060313_AddTenantLedgerCore'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016060313_AddTenantLedgerCore', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016183926_AddTenantJournalEntryDateIndex'
)
BEGIN
    CREATE INDEX [IX_JournalEntries_TenantId_EntryDate_CreatedAt] ON [JournalEntries] ([TenantId], [EntryDate], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016183926_AddTenantJournalEntryDateIndex'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016183926_AddTenantJournalEntryDateIndex', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
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
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
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
        [RuntimeKind] varchar(40) NULL,
        [RuntimeValidatedAt] datetimeoffset NULL,
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
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE TABLE [PlatformUserRoles] (
        [UserId] uniqueidentifier NOT NULL,
        [Role] varchar(64) NOT NULL,
        [AssignedByUserId] uniqueidentifier NULL,
        [AssignedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PlatformUserRoles] PRIMARY KEY ([UserId], [Role])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
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
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
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
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
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
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
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
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PlatformModulePublisherKeys_Publisher_KeyId] ON [PlatformModulePublisherKeys] ([Publisher], [KeyId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PlatformModuleReleases_ModuleCode_Version] ON [PlatformModuleReleases] ([ModuleCode], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_PlatformModuleReleases_Status_ModuleCode] ON [PlatformModuleReleases] ([Status], [ModuleCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_PlatformUserRoles_Role] ON [PlatformUserRoles] ([Role]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantCustomFormDefinitions_TenantId_Code_Version] ON [TenantCustomFormDefinitions] ([TenantId], [Code], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormDefinitions_TenantId_Status_UpdatedAt] ON [TenantCustomFormDefinitions] ([TenantId], [Status], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormRevisions_TenantId_FormId_Version_CreatedAt] ON [TenantCustomFormRevisions] ([TenantId], [FormId], [Version], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormSubmissions_TenantId_FormId_Status_SubmittedAt] ON [TenantCustomFormSubmissions] ([TenantId], [FormId], [Status], [SubmittedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantCustomFormSubmissions_TenantId_SubmittedByUserId_SubmittedAt] ON [TenantCustomFormSubmissions] ([TenantId], [SubmittedByUserId], [SubmittedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    CREATE INDEX [IX_TenantModuleActivations_TenantId_Version] ON [TenantModuleActivations] ([TenantId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016204116_AddTenantDynamicForms'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016204116_AddTenantDynamicForms', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
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
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
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
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
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
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowActions_TenantId_InstanceId_StepIndex_CreatedAt] ON [TenantWorkflowActions] ([TenantId], [InstanceId], [StepIndex], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantWorkflowDefinitions_TenantId_Code_Version] ON [TenantWorkflowDefinitions] ([TenantId], [Code], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowDefinitions_TenantId_Status_UpdatedAt] ON [TenantWorkflowDefinitions] ([TenantId], [Status], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowInstances_TenantId_DefinitionId] ON [TenantWorkflowInstances] ([TenantId], [DefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowInstances_TenantId_StartedByUserId_StartedAt] ON [TenantWorkflowInstances] ([TenantId], [StartedByUserId], [StartedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
)
BEGIN
    CREATE INDEX [IX_TenantWorkflowInstances_TenantId_Status_StartedAt] ON [TenantWorkflowInstances] ([TenantId], [Status], [StartedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016205117_AddTenantWorkflowEngine'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016205117_AddTenantWorkflowEngine', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
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
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
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
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantBusinessRuleDefinitions_TenantId_Code_Version] ON [TenantBusinessRuleDefinitions] ([TenantId], [Code], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_TenantBusinessRuleDefinitions_TenantId_Trigger_Status] ON [TenantBusinessRuleDefinitions] ([TenantId], [Trigger], [Status]) WHERE [Status] = ''Published''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
)
BEGIN
    CREATE INDEX [IX_TenantBusinessRuleEvaluations_TenantId_CreatedAt] ON [TenantBusinessRuleEvaluations] ([TenantId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantBusinessRuleEvaluations_TenantId_RuleId_EventId] ON [TenantBusinessRuleEvaluations] ([TenantId], [RuleId], [EventId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
)
BEGIN
    CREATE INDEX [IX_TenantBusinessRuleEvaluations_TenantId_WorkflowInstanceId] ON [TenantBusinessRuleEvaluations] ([TenantId], [WorkflowInstanceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016210911_AddTenantBusinessRules'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016210911_AddTenantBusinessRules', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016211618_EnforceSinglePublishedWorkflow'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_TenantWorkflowDefinitions_TenantId_Code] ON [TenantWorkflowDefinitions] ([TenantId], [Code]) WHERE [Status] = ''Published''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016211618_EnforceSinglePublishedWorkflow'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016211618_EnforceSinglePublishedWorkflow', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016212452_AddTenantSavedReports'
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
    WHERE [MigrationId] = N'20261016212452_AddTenantSavedReports'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantSavedReports_TenantId_Name] ON [TenantSavedReports] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016212452_AddTenantSavedReports'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016212452_AddTenantSavedReports', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017031550_AddTenantDashboardWidgets'
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
    WHERE [MigrationId] = N'20261017031550_AddTenantDashboardWidgets'
)
BEGIN
    CREATE INDEX [IX_TenantDashboardWidgets_TenantId_Position] ON [TenantDashboardWidgets] ([TenantId], [Position]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017031550_AddTenantDashboardWidgets'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantDashboardWidgets_TenantId_SavedReportId] ON [TenantDashboardWidgets] ([TenantId], [SavedReportId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017031550_AddTenantDashboardWidgets'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017031550_AddTenantDashboardWidgets', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033639_AddTenantCustomMenuEntries'
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
    WHERE [MigrationId] = N'20261017033639_AddTenantCustomMenuEntries'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantCustomMenuEntries_TenantId_Code] ON [TenantCustomMenuEntries] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033639_AddTenantCustomMenuEntries'
)
BEGIN
    CREATE INDEX [IX_TenantCustomMenuEntries_TenantId_Position] ON [TenantCustomMenuEntries] ([TenantId], [Position]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017033639_AddTenantCustomMenuEntries'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017033639_AddTenantCustomMenuEntries', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017035116_AddTenantSavedViewKind'
)
BEGIN
    ALTER TABLE [TenantSavedReports] ADD [Kind] varchar(12) NOT NULL DEFAULT 'Report';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017035116_AddTenantSavedViewKind'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017035116_AddTenantSavedViewKind', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
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
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
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
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    CREATE UNIQUE INDEX [IX_CrmOpportunities_TenantId_Code] ON [CrmOpportunities] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_CrmOpportunities_TenantId_CustomerId] ON [CrmOpportunities] ([TenantId], [CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_CrmOpportunities_TenantId_NextActivityAt] ON [CrmOpportunities] ([TenantId], [NextActivityAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_CrmOpportunities_TenantId_Stage_ExpectedCloseDate] ON [CrmOpportunities] ([TenantId], [Stage], [ExpectedCloseDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_IntegrationOperations_Status_NextAttemptAt_CreatedAt] ON [IntegrationOperations] ([Status], [NextAttemptAt], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    CREATE UNIQUE INDEX [IX_IntegrationOperations_TenantId_IntegrationCode_IdempotencyKeyHash] ON [IntegrationOperations] ([TenantId], [IntegrationCode], [IdempotencyKeyHash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    CREATE INDEX [IX_IntegrationOperations_TenantId_RequestedByUserId_CreatedAt] ON [IntegrationOperations] ([TenantId], [RequestedByUserId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017104140_AddTenantCrmOpportunities'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017104140_AddTenantCrmOpportunities', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
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
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
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
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
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
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
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
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BillOfMaterialLines_TenantId_BillOfMaterialId_ComponentStockItemId] ON [BillOfMaterialLines] ([TenantId], [BillOfMaterialId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_BillOfMaterialLines_TenantId_ComponentStockItemId] ON [BillOfMaterialLines] ([TenantId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BillOfMaterials_TenantId_Code] ON [BillOfMaterials] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_BillOfMaterials_TenantId_ProductStockItemId_IsActive] ON [BillOfMaterials] ([TenantId], [ProductStockItemId], [IsActive]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrderLines_TenantId_ComponentStockItemId] ON [ManufacturingOrderLines] ([TenantId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingOrderLines_TenantId_ManufacturingOrderId_ComponentStockItemId] ON [ManufacturingOrderLines] ([TenantId], [ManufacturingOrderId], [ComponentStockItemId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrders_TenantId_BillOfMaterialId] ON [ManufacturingOrders] ([TenantId], [BillOfMaterialId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingOrders_TenantId_Code] ON [ManufacturingOrders] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrders_TenantId_Status_PlannedDate] ON [ManufacturingOrders] ([TenantId], [Status], [PlannedDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrders_TenantId_WarehouseId] ON [ManufacturingOrders] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017114846_AddTenantManufacturingOrders'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017114846_AddTenantManufacturingOrders', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
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
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
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
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
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
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
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
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_BillOfMaterialOperations_TenantId_BillOfMaterialId_Sequence] ON [BillOfMaterialOperations] ([TenantId], [BillOfMaterialId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    CREATE INDEX [IX_BillOfMaterialOperations_TenantId_WorkCenterId] ON [BillOfMaterialOperations] ([TenantId], [WorkCenterId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingCapacityAllocations_TenantId_ManufacturingOrderOperationId_ScheduledDate] ON [ManufacturingCapacityAllocations] ([TenantId], [ManufacturingOrderOperationId], [ScheduledDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    CREATE INDEX [IX_ManufacturingCapacityAllocations_TenantId_WorkCenterId_ScheduledDate] ON [ManufacturingCapacityAllocations] ([TenantId], [WorkCenterId], [ScheduledDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingOrderOperations_TenantId_ManufacturingOrderId_Sequence] ON [ManufacturingOrderOperations] ([TenantId], [ManufacturingOrderId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    CREATE INDEX [IX_ManufacturingOrderOperations_TenantId_WorkCenterId_ScheduledStartDate_ScheduledEndDate] ON [ManufacturingOrderOperations] ([TenantId], [WorkCenterId], [ScheduledStartDate], [ScheduledEndDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ManufacturingWorkCenters_TenantId_Code] ON [ManufacturingWorkCenters] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017121951_AddTenantManufacturingRouting'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017121951_AddTenantManufacturingRouting', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [ActualCostBase] decimal(18,4) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [ActualRunMinutes] decimal(12,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [ActualSetupMinutes] decimal(12,2) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [CompletedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [StartedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    ALTER TABLE [ManufacturingOrderOperations] ADD [Status] nvarchar(16) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    EXEC(N'ALTER TABLE [ManufacturingOrderOperations] ADD CONSTRAINT [CK_ManufacturingOrderOperations_Actuals] CHECK (([ActualSetupMinutes] IS NULL OR [ActualSetupMinutes] >= 0) AND ([ActualRunMinutes] IS NULL OR [ActualRunMinutes] >= 0) AND ([ActualCostBase] IS NULL OR [ActualCostBase] >= 0))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017122651_AddTenantManufacturingOperationActuals'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017122651_AddTenantManufacturingOperationActuals', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    ALTER TABLE [StockItems] ADD [ManufacturingLeadTimeDays] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    ALTER TABLE [StockItems] ADD [ProcurementLeadTimeDays] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD [ExpectedReceiptDate] date NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD [TargetWarehouseId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    EXEC(N'ALTER TABLE [StockItems] ADD CONSTRAINT [CK_StockItems_LeadTimesNonNegative] CHECK ([ProcurementLeadTimeDays] >= 0 AND [ManufacturingLeadTimeDays] >= 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    CREATE INDEX [IX_PurchaseOrders_TenantId_TargetWarehouseId_ExpectedReceiptDate] ON [PurchaseOrders] ([TenantId], [TargetWarehouseId], [ExpectedReceiptDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    ALTER TABLE [PurchaseOrders] ADD CONSTRAINT [FK_PurchaseOrders_Warehouses_TenantId_TargetWarehouseId] FOREIGN KEY ([TenantId], [TargetWarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017123905_AddTenantTimePhasedMrp'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017123905_AddTenantTimePhasedMrp', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017124947_AddTenantSalesOrderRequiredDeliveryDate'
)
BEGIN
    ALTER TABLE [SalesOrders] ADD [RequestedDeliveryDate] date NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017124947_AddTenantSalesOrderRequiredDeliveryDate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017124947_AddTenantSalesOrderRequiredDeliveryDate', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017125519_AddTenantMrpPlanSnapshots'
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
    WHERE [MigrationId] = N'20261017125519_AddTenantMrpPlanSnapshots'
)
BEGIN
    CREATE INDEX [IX_MrpPlanSnapshots_TenantId_CreatedAt] ON [MrpPlanSnapshots] ([TenantId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017125519_AddTenantMrpPlanSnapshots'
)
BEGIN
    CREATE INDEX [IX_MrpPlanSnapshots_TenantId_WarehouseId] ON [MrpPlanSnapshots] ([TenantId], [WarehouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017125519_AddTenantMrpPlanSnapshots'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017125519_AddTenantMrpPlanSnapshots', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017130351_AddTenantMrpPlanConversionState'
)
BEGIN
    ALTER TABLE [MrpPlanSnapshots] ADD [ConversionStateJson] nvarchar(max) NOT NULL DEFAULT N'[]';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017130351_AddTenantMrpPlanConversionState'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017130351_AddTenantMrpPlanConversionState', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017212650_AddTenantModelDrift'
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
    WHERE [MigrationId] = N'20261017212650_AddTenantModelDrift'
)
BEGIN
    CREATE INDEX [IX_StudioKnowledgeRefreshConsents_LastRefreshedAt] ON [StudioKnowledgeRefreshConsents] ([LastRefreshedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017212650_AddTenantModelDrift'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioKnowledgeRefreshConsents_TenantId_ProjectId_WorkspaceRequestId] ON [StudioKnowledgeRefreshConsents] ([TenantId], [ProjectId], [WorkspaceRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017212650_AddTenantModelDrift'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017212650_AddTenantModelDrift', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018115254_SetEnteredQuantityPrecisionTenant'
)
BEGIN
    DECLARE @var nvarchar(max);
    SELECT @var = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SupplierReturnLines]') AND [c].[name] = N'EnteredQuantity');
    IF @var IS NOT NULL EXEC(N'ALTER TABLE [SupplierReturnLines] DROP CONSTRAINT ' + @var + ';');
    ALTER TABLE [SupplierReturnLines] ALTER COLUMN [EnteredQuantity] decimal(18,4) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018115254_SetEnteredQuantityPrecisionTenant'
)
BEGIN
    DECLARE @var1 nvarchar(max);
    SELECT @var1 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesReturnLines]') AND [c].[name] = N'EnteredQuantity');
    IF @var1 IS NOT NULL EXEC(N'ALTER TABLE [SalesReturnLines] DROP CONSTRAINT ' + @var1 + ';');
    ALTER TABLE [SalesReturnLines] ALTER COLUMN [EnteredQuantity] decimal(18,4) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018115254_SetEnteredQuantityPrecisionTenant'
)
BEGIN
    DECLARE @var2 nvarchar(max);
    SELECT @var2 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[SalesDeliveryLines]') AND [c].[name] = N'EnteredQuantity');
    IF @var2 IS NOT NULL EXEC(N'ALTER TABLE [SalesDeliveryLines] DROP CONSTRAINT ' + @var2 + ';');
    ALTER TABLE [SalesDeliveryLines] ALTER COLUMN [EnteredQuantity] decimal(18,4) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018115254_SetEnteredQuantityPrecisionTenant'
)
BEGIN
    DECLARE @var3 nvarchar(max);
    SELECT @var3 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[PurchaseReceiptLines]') AND [c].[name] = N'EnteredQuantity');
    IF @var3 IS NOT NULL EXEC(N'ALTER TABLE [PurchaseReceiptLines] DROP CONSTRAINT ' + @var3 + ';');
    ALTER TABLE [PurchaseReceiptLines] ALTER COLUMN [EnteredQuantity] decimal(18,4) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261018115254_SetEnteredQuantityPrecisionTenant'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261018115254_SetEnteredQuantityPrecisionTenant', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020192442_EnforceSinglePublishedCustomForm'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_TenantCustomFormDefinitions_TenantId_Code] ON [TenantCustomFormDefinitions] ([TenantId], [Code]) WHERE [Status] = ''Published''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020192442_EnforceSinglePublishedCustomForm'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261020192442_EnforceSinglePublishedCustomForm', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020201404_AddSavedReportRevisionHistory'
)
BEGIN
    ALTER TABLE [TenantSavedReports] ADD [DefinitionRevision] int NOT NULL DEFAULT 1;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020201404_AddSavedReportRevisionHistory'
)
BEGIN
    CREATE TABLE [TenantSavedReportRevisions] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [SavedReportId] uniqueidentifier NOT NULL,
        [Revision] int NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [Kind] varchar(12) NOT NULL,
        [Source] varchar(40) NOT NULL,
        [DefinitionJson] nvarchar(max) NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_TenantSavedReportRevisions] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_TenantSavedReportRevisions_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_TenantSavedReportRevisions_TenantSavedReports_TenantId_SavedReportId] FOREIGN KEY ([TenantId], [SavedReportId]) REFERENCES [TenantSavedReports] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020201404_AddSavedReportRevisionHistory'
)
BEGIN
    INSERT INTO [TenantSavedReportRevisions] ([Id], [TenantId], [SavedReportId], [Revision], [Name], [Kind], [Source], [DefinitionJson], [CreatedByUserId], [CreatedAt]) SELECT NEWID(), [TenantId], [Id], 1, [Name], [Kind], [Source], [DefinitionJson], [UpdatedByUserId], [UpdatedAt] FROM [TenantSavedReports];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020201404_AddSavedReportRevisionHistory'
)
BEGIN
    CREATE UNIQUE INDEX [IX_TenantSavedReportRevisions_TenantId_SavedReportId_Revision] ON [TenantSavedReportRevisions] ([TenantId], [SavedReportId], [Revision]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020201404_AddSavedReportRevisionHistory'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261020201404_AddSavedReportRevisionHistory', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE TABLE [EmployeeRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PersonnelCode] varchar(40) NOT NULL,
        [FullName] nvarchar(160) NOT NULL,
        [UserId] uniqueidentifier NULL,
        [Department] nvarchar(120) NULL,
        [JobTitle] nvarchar(120) NULL,
        [WorkEmail] nvarchar(254) NULL,
        [HireDate] date NOT NULL,
        [TerminationDate] date NULL,
        [Status] varchar(16) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_EmployeeRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_EmployeeRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_EmployeeRecords_EmploymentDates] CHECK ([TerminationDate] IS NULL OR [TerminationDate] >= [HireDate]),
        CONSTRAINT [FK_EmployeeRecords_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE TABLE [PayrollRuleSets] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [JurisdictionCode] varchar(8) NOT NULL,
        [TaxYear] varchar(4) NOT NULL,
        [EffectiveFrom] date NOT NULL,
        [EffectiveTo] date NULL,
        [Version] int NOT NULL,
        [RulesJson] nvarchar(max) NOT NULL,
        [OfficialSourceUrl] nvarchar(1000) NOT NULL,
        [Status] varchar(16) NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [ApprovedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ApprovedAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_PayrollRuleSets] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PayrollRuleSets_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_PayrollRuleSets_EffectiveDates] CHECK ([EffectiveTo] IS NULL OR [EffectiveTo] >= [EffectiveFrom]),
        CONSTRAINT [FK_PayrollRuleSets_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE TABLE [EmployeeAttendanceRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [EmployeeId] uniqueidentifier NOT NULL,
        [WorkDate] date NOT NULL,
        [WorkedMinutes] int NOT NULL,
        [OvertimeMinutes] int NOT NULL,
        [Note] nvarchar(1000) NULL,
        [RecordedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_EmployeeAttendanceRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_EmployeeAttendanceRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_EmployeeAttendanceRecords_Minutes] CHECK ([WorkedMinutes] BETWEEN 0 AND 1440 AND [OvertimeMinutes] BETWEEN 0 AND 1440),
        CONSTRAINT [FK_EmployeeAttendanceRecords_EmployeeRecords_TenantId_EmployeeId] FOREIGN KEY ([TenantId], [EmployeeId]) REFERENCES [EmployeeRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_EmployeeAttendanceRecords_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE TABLE [EmployeeLeaveRequests] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [EmployeeId] uniqueidentifier NOT NULL,
        [LeaveType] varchar(32) NOT NULL,
        [StartDate] date NOT NULL,
        [EndDate] date NOT NULL,
        [RequestedDays] decimal(8,2) NOT NULL,
        [Note] nvarchar(1000) NULL,
        [Status] varchar(16) NOT NULL,
        [RequestedByUserId] uniqueidentifier NOT NULL,
        [ReviewedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ReviewedAt] datetimeoffset NULL,
        [ReviewNote] nvarchar(1000) NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_EmployeeLeaveRequests] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_EmployeeLeaveRequests_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_EmployeeLeaveRequests_DatesAndDays] CHECK ([EndDate] >= [StartDate] AND [RequestedDays] > 0),
        CONSTRAINT [FK_EmployeeLeaveRequests_EmployeeRecords_TenantId_EmployeeId] FOREIGN KEY ([TenantId], [EmployeeId]) REFERENCES [EmployeeRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_EmployeeLeaveRequests_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE UNIQUE INDEX [IX_EmployeeAttendanceRecords_TenantId_EmployeeId_WorkDate] ON [EmployeeAttendanceRecords] ([TenantId], [EmployeeId], [WorkDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE INDEX [IX_EmployeeLeaveRequests_TenantId_EmployeeId_StartDate_EndDate] ON [EmployeeLeaveRequests] ([TenantId], [EmployeeId], [StartDate], [EndDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE UNIQUE INDEX [IX_EmployeeRecords_TenantId_PersonnelCode] ON [EmployeeRecords] ([TenantId], [PersonnelCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE INDEX [IX_EmployeeRecords_TenantId_Status_FullName] ON [EmployeeRecords] ([TenantId], [Status], [FullName]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_EmployeeRecords_TenantId_UserId] ON [EmployeeRecords] ([TenantId], [UserId]) WHERE [UserId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PayrollRuleSets_TenantId_JurisdictionCode_EffectiveFrom_Version] ON [PayrollRuleSets] ([TenantId], [JurisdictionCode], [EffectiveFrom], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020212558_AddHumanResources'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261020212558_AddHumanResources', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE TABLE [FixedAssets] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [AssetCode] varchar(40) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Category] nvarchar(80) NULL,
        [AcquisitionDate] date NOT NULL,
        [InServiceDate] date NOT NULL,
        [AcquisitionCostBase] decimal(18,2) NOT NULL,
        [ResidualValueBase] decimal(18,2) NOT NULL,
        [UsefulLifeMonths] int NOT NULL,
        [SupplierAccountId] uniqueidentifier NULL,
        [SourceReference] nvarchar(120) NULL,
        [AccumulatedDepreciationBase] decimal(18,2) NOT NULL,
        [Status] varchar(16) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_FixedAssets] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FixedAssets_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_FixedAssets_CostAndLife] CHECK ([AcquisitionCostBase] > 0 AND [ResidualValueBase] >= 0 AND [ResidualValueBase] < [AcquisitionCostBase] AND [UsefulLifeMonths] BETWEEN 1 AND 1200 AND [InServiceDate] >= [AcquisitionDate] AND [AccumulatedDepreciationBase] >= 0 AND [AccumulatedDepreciationBase] <= [AcquisitionCostBase] - [ResidualValueBase]),
        CONSTRAINT [FK_FixedAssets_CustomerAccounts_TenantId_SupplierAccountId] FOREIGN KEY ([TenantId], [SupplierAccountId]) REFERENCES [CustomerAccounts] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FixedAssets_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE TABLE [TenantOperationalSettings] (
        [TenantId] uniqueidentifier NOT NULL,
        [AllowNegativeStock] bit NOT NULL,
        [UpdatedByUserId] uniqueidentifier NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_TenantOperationalSettings] PRIMARY KEY ([TenantId]),
        CONSTRAINT [FK_TenantOperationalSettings_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE TABLE [FixedAssetAssignments] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [AssetId] uniqueidentifier NOT NULL,
        [EmployeeId] uniqueidentifier NOT NULL,
        [AssignedDate] date NOT NULL,
        [ReturnedDate] date NULL,
        [Location] nvarchar(160) NULL,
        [Notes] nvarchar(1000) NULL,
        [AssignedByUserId] uniqueidentifier NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_FixedAssetAssignments] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FixedAssetAssignments_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_FixedAssetAssignments_ReturnDate] CHECK ([ReturnedDate] IS NULL OR [ReturnedDate] >= [AssignedDate]),
        CONSTRAINT [FK_FixedAssetAssignments_EmployeeRecords_TenantId_EmployeeId] FOREIGN KEY ([TenantId], [EmployeeId]) REFERENCES [EmployeeRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FixedAssetAssignments_FixedAssets_TenantId_AssetId] FOREIGN KEY ([TenantId], [AssetId]) REFERENCES [FixedAssets] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE TABLE [FixedAssetDepreciationPostings] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [AssetId] uniqueidentifier NOT NULL,
        [PeriodStart] date NOT NULL,
        [PeriodEnd] date NOT NULL,
        [AmountBase] decimal(18,2) NOT NULL,
        [JournalEntryId] uniqueidentifier NOT NULL,
        [PostedByUserId] uniqueidentifier NOT NULL,
        [PostedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_FixedAssetDepreciationPostings] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_FixedAssetDepreciationPostings_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_FixedAssetDepreciationPostings_PeriodAmount] CHECK ([PeriodEnd] >= [PeriodStart] AND [AmountBase] > 0),
        CONSTRAINT [FK_FixedAssetDepreciationPostings_FixedAssets_TenantId_AssetId] FOREIGN KEY ([TenantId], [AssetId]) REFERENCES [FixedAssets] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_FixedAssetDepreciationPostings_JournalEntries_TenantId_JournalEntryId] FOREIGN KEY ([TenantId], [JournalEntryId]) REFERENCES [JournalEntries] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_FixedAssetAssignments_TenantId_AssetId] ON [FixedAssetAssignments] ([TenantId], [AssetId]) WHERE [ReturnedDate] IS NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE INDEX [IX_FixedAssetAssignments_TenantId_AssetId_ReturnedDate] ON [FixedAssetAssignments] ([TenantId], [AssetId], [ReturnedDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE INDEX [IX_FixedAssetAssignments_TenantId_EmployeeId] ON [FixedAssetAssignments] ([TenantId], [EmployeeId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FixedAssetDepreciationPostings_TenantId_AssetId_PeriodStart] ON [FixedAssetDepreciationPostings] ([TenantId], [AssetId], [PeriodStart]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FixedAssetDepreciationPostings_TenantId_JournalEntryId] ON [FixedAssetDepreciationPostings] ([TenantId], [JournalEntryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE UNIQUE INDEX [IX_FixedAssets_TenantId_AssetCode] ON [FixedAssets] ([TenantId], [AssetCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE INDEX [IX_FixedAssets_TenantId_Status_InServiceDate] ON [FixedAssets] ([TenantId], [Status], [InServiceDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    CREATE INDEX [IX_FixedAssets_TenantId_SupplierAccountId] ON [FixedAssets] ([TenantId], [SupplierAccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020214445_AddTenantOperationalSettings'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261020214445_AddTenantOperationalSettings', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    ALTER TABLE [LedgerAccounts] ADD [StatementSection] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE TABLE [ForeignTradeCases] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [Direction] int NOT NULL,
        [Status] int NOT NULL,
        [PurchaseOrderId] uniqueidentifier NULL,
        [SalesOrderId] uniqueidentifier NULL,
        [ReferenceCode] nvarchar(50) NOT NULL,
        [OriginCountryCode] nvarchar(2) NOT NULL,
        [DestinationCountryCode] nvarchar(2) NOT NULL,
        [IncotermsCode] nvarchar(3) NULL,
        [HarmonizedSystemCode] nvarchar(10) NULL,
        [TransportMode] nvarchar(16) NOT NULL,
        [CarrierReference] nvarchar(100) NULL,
        [CustomsReference] nvarchar(100) NULL,
        [DeclaredValue] decimal(18,2) NOT NULL,
        [CurrencyCode] nvarchar(3) NOT NULL,
        [PlannedShipDate] date NULL,
        [ActualShipDate] date NULL,
        [PlannedArrivalDate] date NULL,
        [ActualArrivalDate] date NULL,
        [Notes] nvarchar(1000) NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_ForeignTradeCases] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_ForeignTradeCases_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_ForeignTradeCases_Direction] CHECK ([Direction] IN (1,2)),
        CONSTRAINT [CK_ForeignTradeCases_OrderLink] CHECK (([Direction] = 1 AND [PurchaseOrderId] IS NOT NULL AND [SalesOrderId] IS NULL) OR ([Direction] = 2 AND [SalesOrderId] IS NOT NULL AND [PurchaseOrderId] IS NULL)),
        CONSTRAINT [CK_ForeignTradeCases_Status] CHECK ([Status] BETWEEN 1 AND 7),
        CONSTRAINT [CK_ForeignTradeCases_Value] CHECK ([DeclaredValue] >= 0),
        CONSTRAINT [FK_ForeignTradeCases_PurchaseOrders_TenantId_PurchaseOrderId] FOREIGN KEY ([TenantId], [PurchaseOrderId]) REFERENCES [PurchaseOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ForeignTradeCases_SalesOrders_TenantId_SalesOrderId] FOREIGN KEY ([TenantId], [SalesOrderId]) REFERENCES [SalesOrders] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ForeignTradeCases_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE TABLE [PaymentInstruments] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [Type] int NOT NULL,
        [Direction] int NOT NULL,
        [Status] int NOT NULL,
        [Code] nvarchar(40) NOT NULL,
        [InstrumentNumber] nvarchar(80) NOT NULL,
        [CounterpartyName] nvarchar(160) NOT NULL,
        [BankName] nvarchar(120) NOT NULL,
        [CurrencyCode] nchar(3) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [IssueDate] date NOT NULL,
        [DueDate] date NOT NULL,
        [PortfolioDate] date NOT NULL,
        [EndorsedTo] nvarchar(160) NULL,
        [EndorsedAt] datetimeoffset NULL,
        [CollectedAt] datetimeoffset NULL,
        [FinancialAccountId] uniqueidentifier NULL,
        [FinancialAccountTransactionId] uniqueidentifier NULL,
        [Notes] nvarchar(500) NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_PaymentInstruments] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PaymentInstruments_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_PaymentInstruments_AmountPositive] CHECK ([Amount] > 0),
        CONSTRAINT [CK_PaymentInstruments_DueDate] CHECK ([DueDate] >= [IssueDate]),
        CONSTRAINT [CK_PaymentInstruments_ValidDirection] CHECK ([Direction] IN (1,2)),
        CONSTRAINT [CK_PaymentInstruments_ValidStatus] CHECK ([Status] IN (1,2,3,4,5)),
        CONSTRAINT [CK_PaymentInstruments_ValidType] CHECK ([Type] IN (1,2)),
        CONSTRAINT [FK_PaymentInstruments_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountTransactionId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccountTransactions] ([TenantId], [Id], [FinancialAccountId], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PaymentInstruments_FinancialAccounts_TenantId_FinancialAccountId_CurrencyCode] FOREIGN KEY ([TenantId], [FinancialAccountId], [CurrencyCode]) REFERENCES [FinancialAccounts] ([TenantId], [Id], [CurrencyCode]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PaymentInstruments_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE TABLE [PaymentInstrumentEvents] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [PaymentInstrumentId] uniqueidentifier NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [EventType] nvarchar(24) NOT NULL,
        [PreviousStatus] int NULL,
        [NewStatus] int NOT NULL,
        [EventDate] date NOT NULL,
        [Note] nvarchar(500) NULL,
        [FinancialAccountTransactionId] uniqueidentifier NULL,
        [CreatedByUserId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_PaymentInstrumentEvents] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_PaymentInstrumentEvents_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [CK_PaymentInstrumentEvents_Status] CHECK ([NewStatus] IN (1,2,3,4,5)),
        CONSTRAINT [FK_PaymentInstrumentEvents_FinancialAccountTransactions_TenantId_FinancialAccountTransactionId] FOREIGN KEY ([TenantId], [FinancialAccountTransactionId]) REFERENCES [FinancialAccountTransactions] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PaymentInstrumentEvents_PaymentInstruments_TenantId_PaymentInstrumentId] FOREIGN KEY ([TenantId], [PaymentInstrumentId]) REFERENCES [PaymentInstruments] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_ForeignTradeCases_TenantId_PurchaseOrderId] ON [ForeignTradeCases] ([TenantId], [PurchaseOrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ForeignTradeCases_TenantId_ReferenceCode] ON [ForeignTradeCases] ([TenantId], [ReferenceCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_ForeignTradeCases_TenantId_SalesOrderId] ON [ForeignTradeCases] ([TenantId], [SalesOrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_ForeignTradeCases_TenantId_Status_UpdatedAt] ON [ForeignTradeCases] ([TenantId], [Status], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_PaymentInstrumentEvents_TenantId_FinancialAccountTransactionId] ON [PaymentInstrumentEvents] ([TenantId], [FinancialAccountTransactionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_PaymentInstrumentEvents_TenantId_PaymentInstrumentId_CreatedAt] ON [PaymentInstrumentEvents] ([TenantId], [PaymentInstrumentId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PaymentInstrumentEvents_TenantId_RequestId] ON [PaymentInstrumentEvents] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PaymentInstruments_TenantId_Code] ON [PaymentInstruments] ([TenantId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_PaymentInstruments_TenantId_FinancialAccountId_CurrencyCode] ON [PaymentInstruments] ([TenantId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_PaymentInstruments_TenantId_FinancialAccountTransactionId_FinancialAccountId_CurrencyCode] ON [PaymentInstruments] ([TenantId], [FinancialAccountTransactionId], [FinancialAccountId], [CurrencyCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PaymentInstruments_TenantId_RequestId] ON [PaymentInstruments] ([TenantId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    CREATE INDEX [IX_PaymentInstruments_TenantId_Status_DueDate] ON [PaymentInstruments] ([TenantId], [Status], [DueDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020221405_AddTenantPaymentsTradeAndStatementCategories'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261020221405_AddTenantPaymentsTradeAndStatementCategories', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020231623_AddTenantCashFlowCategories'
)
BEGIN
    ALTER TABLE [FinancialAccountTransactions] ADD [CashFlowCategory] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020231623_AddTenantCashFlowCategories'
)
BEGIN
    UPDATE [dbo].[FinancialAccountTransactions]
    SET [CashFlowCategory] = CASE
        WHEN [CustomerCollectionId] IS NOT NULL OR [SupplierPaymentId] IS NOT NULL THEN 1
        WHEN [TransferId] IS NOT NULL THEN 4
        WHEN [Description] = N'Açılış bakiyesi' THEN 5
        ELSE [CashFlowCategory]
    END;
    UPDATE reversal
    SET reversal.[CashFlowCategory] = original.[CashFlowCategory]
    FROM [dbo].[FinancialAccountTransactions] reversal
    INNER JOIN [dbo].[FinancialAccountTransactions] original
        ON original.[TenantId] = reversal.[TenantId] AND original.[Id] = reversal.[ReversalOfId]
    WHERE original.[CashFlowCategory] IN (1, 4, 5);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020231623_AddTenantCashFlowCategories'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261020231623_AddTenantCashFlowCategories', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020232726_AddTenantWarehouseLocations'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD [StorageLocationId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020232726_AddTenantWarehouseLocations'
)
BEGIN
    CREATE TABLE [WarehouseLocations] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [WarehouseId] uniqueidentifier NOT NULL,
        [ParentLocationId] uniqueidentifier NULL,
        [Code] nvarchar(40) NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [IsActive] bit NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_WarehouseLocations] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_WarehouseLocations_TenantId_WarehouseId_Id] UNIQUE ([TenantId], [WarehouseId], [Id]),
        CONSTRAINT [FK_WarehouseLocations_WarehouseLocations_TenantId_WarehouseId_ParentLocationId] FOREIGN KEY ([TenantId], [WarehouseId], [ParentLocationId]) REFERENCES [WarehouseLocations] ([TenantId], [WarehouseId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_WarehouseLocations_Warehouses_TenantId_WarehouseId] FOREIGN KEY ([TenantId], [WarehouseId]) REFERENCES [Warehouses] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020232726_AddTenantWarehouseLocations'
)
BEGIN
    CREATE INDEX [IX_InventoryTransactions_TenantId_WarehouseId_StorageLocationId] ON [InventoryTransactions] ([TenantId], [WarehouseId], [StorageLocationId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020232726_AddTenantWarehouseLocations'
)
BEGIN
    CREATE UNIQUE INDEX [IX_WarehouseLocations_TenantId_WarehouseId_Code] ON [WarehouseLocations] ([TenantId], [WarehouseId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020232726_AddTenantWarehouseLocations'
)
BEGIN
    CREATE INDEX [IX_WarehouseLocations_TenantId_WarehouseId_ParentLocationId_Code] ON [WarehouseLocations] ([TenantId], [WarehouseId], [ParentLocationId], [Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020232726_AddTenantWarehouseLocations'
)
BEGIN
    ALTER TABLE [InventoryTransactions] ADD CONSTRAINT [FK_InventoryTransactions_WarehouseLocations_TenantId_WarehouseId_StorageLocationId] FOREIGN KEY ([TenantId], [WarehouseId], [StorageLocationId]) REFERENCES [WarehouseLocations] ([TenantId], [WarehouseId], [Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261020232726_AddTenantWarehouseLocations'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261020232726_AddTenantWarehouseLocations', N'10.0.13');
END;

COMMIT;
GO

