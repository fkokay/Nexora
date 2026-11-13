BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113204002_AddSalesInvoiceNotes'
)
BEGIN
    ALTER TABLE [SalesInvoices] ADD [Notes] nvarchar(1000) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113204002_AddSalesInvoiceNotes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113204002_AddSalesInvoiceNotes', N'10.0.13');
END;

COMMIT;
GO

