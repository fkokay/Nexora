BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261112063756_AddAgendaPermissions'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] ON;
    EXEC(N'INSERT INTO [PermissionDefinitions] ([Code], [Action], [Description], [ResourceType])
    VALUES (''erp.agenda.create'', ''create'', N''create · Personal agenda entries on the ERP home screen'', ''erp.agenda''),
    (''erp.agenda.delete'', ''delete'', N''delete · Personal agenda entries on the ERP home screen'', ''erp.agenda''),
    (''erp.agenda.execute'', ''execute'', N''execute · Personal agenda entries on the ERP home screen'', ''erp.agenda''),
    (''erp.agenda.read'', ''read'', N''read · Personal agenda entries on the ERP home screen'', ''erp.agenda''),
    (''erp.agenda.update'', ''update'', N''update · Personal agenda entries on the ERP home screen'', ''erp.agenda'')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Code', N'Action', N'Description', N'ResourceType') AND [object_id] = OBJECT_ID(N'[PermissionDefinitions]'))
        SET IDENTITY_INSERT [PermissionDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261112063756_AddAgendaPermissions'
)
BEGIN
    INSERT INTO [TenantPermissionRules]
        ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
         [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
    SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[Code], 1,
           NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
    FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
    CROSS JOIN [PermissionDefinitions] AS permission
    WHERE permission.[ResourceType] = 'erp.agenda'
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
    WHERE [MigrationId] = N'20261112063756_AddAgendaPermissions'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261112063756_AddAgendaPermissions', N'10.0.13');
END;

COMMIT;
GO

