SET NOCOUNT ON;
SELECT DB_NAME() AS db, COUNT(*) AS migrations, MAX(MigrationId) AS last_migration FROM __EFMigrationsHistory;
SELECT COUNT(*) AS agenda_columns FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AgendaItems');
SELECT name AS agenda_index FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.AgendaItems') AND name IS NOT NULL;
SELECT name AS fk, is_disabled, is_not_trusted FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.AgendaItems');
SELECT COUNT(*) AS agenda_rows FROM dbo.AgendaItems;
DBCC CHECKDB WITH PHYSICAL_ONLY, NO_INFOMSGS;
SELECT 'checkdb-done' AS status;
