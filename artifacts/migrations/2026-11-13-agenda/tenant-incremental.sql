BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261112063622_AddTenantAgendaItems'
)
BEGIN
    CREATE TABLE [AgendaItems] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [Title] nvarchar(160) NOT NULL,
        [StartsAt] datetimeoffset NOT NULL,
        [Notes] nvarchar(1000) NULL,
        [IsCompleted] bit NOT NULL,
        [CompletedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AgendaItems] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AgendaItems_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261112063622_AddTenantAgendaItems'
)
BEGIN
    CREATE INDEX [IX_AgendaItems_TenantId_UserId_StartsAt] ON [AgendaItems] ([TenantId], [UserId], [StartsAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261112063622_AddTenantAgendaItems'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261112063622_AddTenantAgendaItems', N'10.0.13');
END;

COMMIT;
GO

