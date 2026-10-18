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
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE TABLE [DevelopmentProjects] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Name] nvarchar(120) NOT NULL,
        [RepositoryUrl] nvarchar(2048) NOT NULL,
        [DefaultBranch] nvarchar(256) NOT NULL,
        [GitHubInstallationId] bigint NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_DevelopmentProjects] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_DevelopmentProjects_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_DevelopmentProjects_Tenants_TenantId] FOREIGN KEY ([TenantId]) REFERENCES [Tenants] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_DevelopmentProjectAccesses_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE TABLE [DevelopmentRequests] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [Title] nvarchar(180) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [Status] nvarchar(40) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DevelopmentRequests] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_DevelopmentRequests_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_DevelopmentRequests_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_GitHubInstallationAuthorizationStates_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE TABLE [DevelopmentWorkspaceRequests] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [DevelopmentRequestId] uniqueidentifier NULL,
        [RequestedByUserId] uniqueidentifier NOT NULL,
        [BranchName] nvarchar(256) NOT NULL,
        [WorkspaceBranchName] nvarchar(256) NULL,
        [Status] nvarchar(32) NOT NULL,
        [ReviewedByUserId] uniqueidentifier NULL,
        [ReviewedAt] datetimeoffset NULL,
        [ReviewNote] nvarchar(500) NULL,
        [CommitSha] nvarchar(64) NULL,
        [ProvisioningError] nvarchar(500) NULL,
        [ProvisionedAt] datetimeoffset NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_DevelopmentWorkspaceRequests] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_DevelopmentWorkspaceRequests_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_DevelopmentWorkspaceRequests_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DevelopmentWorkspaceRequests_DevelopmentRequests_TenantId_DevelopmentRequestId] FOREIGN KEY ([TenantId], [DevelopmentRequestId]) REFERENCES [DevelopmentRequests] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_AITestPlanRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_ArchitecturePlanRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_ReleaseCandidateRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_StudioConversations_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId] FOREIGN KEY ([TenantId], [WorkspaceRequestId]) REFERENCES [DevelopmentWorkspaceRequests] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_ReleaseCandidateReviewRecords_ReleaseCandidateRecords_TenantId_ReleaseCandidateId] FOREIGN KEY ([TenantId], [ReleaseCandidateId]) REFERENCES [ReleaseCandidateRecords] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_StudioReleaseVersionRecords_ReleaseCandidateRecords_TenantId_ReleaseCandidateId] FOREIGN KEY ([TenantId], [ReleaseCandidateId]) REFERENCES [ReleaseCandidateRecords] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_StudioReleasePackageRecords_StudioReleaseVersionRecords_TenantId_ReleaseVersionId] FOREIGN KEY ([TenantId], [ReleaseVersionId]) REFERENCES [StudioReleaseVersionRecords] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE TABLE [StudioReleaseDeploymentRecords] (
        [Id] uniqueidentifier NOT NULL,
        [TenantId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [ReleasePackageId] uniqueidentifier NOT NULL,
        [CreatedByUserId] uniqueidentifier NOT NULL,
        [RollbackOfDeploymentId] uniqueidentifier NULL,
        [RollbackTargetDeploymentId] uniqueidentifier NULL,
        [IdempotencyKey] uniqueidentifier NOT NULL,
        [Environment] nvarchar(16) NOT NULL,
        [Provider] nvarchar(32) NOT NULL,
        [Status] nvarchar(24) NOT NULL,
        [PackageSha256] nvarchar(64) NOT NULL,
        [CommitSha] nvarchar(64) NOT NULL,
        [ProviderDeploymentId] nvarchar(128) NULL,
        [EnvironmentUrl] nvarchar(256) NULL,
        [FailureCode] nvarchar(64) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [StartedAt] datetimeoffset NULL,
        [CompletedAt] datetimeoffset NULL,
        CONSTRAINT [PK_StudioReleaseDeploymentRecords] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_StudioReleaseDeploymentRecords_TenantId_Id] UNIQUE ([TenantId], [Id]),
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_DevelopmentProjects_TenantId_ProjectId] FOREIGN KEY ([TenantId], [ProjectId]) REFERENCES [DevelopmentProjects] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId] FOREIGN KEY ([TenantId], [RollbackOfDeploymentId]) REFERENCES [StudioReleaseDeploymentRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId] FOREIGN KEY ([TenantId], [RollbackTargetDeploymentId]) REFERENCES [StudioReleaseDeploymentRecords] ([TenantId], [Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_StudioReleaseDeploymentRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId] FOREIGN KEY ([TenantId], [ReleasePackageId]) REFERENCES [StudioReleasePackageRecords] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
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
        CONSTRAINT [FK_StudioProductionPromotionApprovalRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId] FOREIGN KEY ([TenantId], [ReleasePackageId]) REFERENCES [StudioReleasePackageRecords] ([TenantId], [Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_AITestPlanRecords_TenantId_ProjectId_CreatedAt] ON [AITestPlanRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_AITestPlanRecords_TenantId_WorkspaceRequestId_CreatedAt] ON [AITestPlanRecords] ([TenantId], [WorkspaceRequestId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_ArchitecturePlanRecords_TenantId_ProjectId_CreatedAt] ON [ArchitecturePlanRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_ArchitecturePlanRecords_TenantId_WorkspaceRequestId_CreatedAt] ON [ArchitecturePlanRecords] ([TenantId], [WorkspaceRequestId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_AuditEvents_TenantId_OccurredAt] ON [AuditEvents] ([TenantId], [OccurredAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_DevelopmentProjectAccesses_TenantId_UserId] ON [DevelopmentProjectAccesses] ([TenantId], [UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_DevelopmentProjects_TenantId_IsActive_CreatedAt] ON [DevelopmentProjects] ([TenantId], [IsActive], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DevelopmentProjects_TenantId_Name] ON [DevelopmentProjects] ([TenantId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_DevelopmentRequests_TenantId_CreatedAt] ON [DevelopmentRequests] ([TenantId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_DevelopmentRequests_TenantId_ProjectId_CreatedAt] ON [DevelopmentRequests] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_DevelopmentRequestId] ON [DevelopmentWorkspaceRequests] ([TenantId], [DevelopmentRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_ProjectId_CreatedAt] ON [DevelopmentWorkspaceRequests] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_DevelopmentWorkspaceRequests_TenantId_Status_CreatedAt] ON [DevelopmentWorkspaceRequests] ([TenantId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_GitHubInstallationAuthorizationStates_ExpiresAt_ConsumedAt] ON [GitHubInstallationAuthorizationStates] ([ExpiresAt], [ConsumedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_GitHubInstallationAuthorizationStates_StateHash] ON [GitHubInstallationAuthorizationStates] ([StateHash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_GitHubInstallationAuthorizationStates_TenantId_ProjectId] ON [GitHubInstallationAuthorizationStates] ([TenantId], [ProjectId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateRecords_TenantId_ProjectId_CreatedAt] ON [ReleaseCandidateRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateRecords_TenantId_WorkspaceRequestId_CreatedAt] ON [ReleaseCandidateRecords] ([TenantId], [WorkspaceRequestId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ReleaseCandidateRecords_TenantId_WorkspaceRequestId_TestJobId] ON [ReleaseCandidateRecords] ([TenantId], [WorkspaceRequestId], [TestJobId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateReviewRecords_TenantId_ProjectId_CreatedAt] ON [ReleaseCandidateReviewRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ReleaseCandidateReviewRecords_TenantId_ReleaseCandidateId] ON [ReleaseCandidateReviewRecords] ([TenantId], [ReleaseCandidateId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_ReleaseCandidateReviewRecords_TenantId_WorkspaceRequestId] ON [ReleaseCandidateReviewRecords] ([TenantId], [WorkspaceRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioConversationMessages_TenantId_ConversationId_CreatedAt] ON [StudioConversationMessages] ([TenantId], [ConversationId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioConversations_TenantId_CreatedByUserId_UpdatedAt] ON [StudioConversations] ([TenantId], [CreatedByUserId], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioConversations_TenantId_ProjectId] ON [StudioConversations] ([TenantId], [ProjectId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioConversations_TenantId_WorkspaceRequestId_UpdatedAt] ON [StudioConversations] ([TenantId], [WorkspaceRequestId], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_ProjectId_Status_CreatedAt] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [ProjectId], [Status], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_ReleasePackageId] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [ReleasePackageId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioProductionPromotionApprovalRecords_TenantId_StagingDeploymentId] ON [StudioProductionPromotionApprovalRecords] ([TenantId], [StagingDeploymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_IdempotencyKey] ON [StudioReleaseDeploymentRecords] ([TenantId], [IdempotencyKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_ProjectId_Environment_CreatedAt] ON [StudioReleaseDeploymentRecords] ([TenantId], [ProjectId], [Environment], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_ReleasePackageId] ON [StudioReleaseDeploymentRecords] ([TenantId], [ReleasePackageId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId] ON [StudioReleaseDeploymentRecords] ([TenantId], [RollbackOfDeploymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId] ON [StudioReleaseDeploymentRecords] ([TenantId], [RollbackTargetDeploymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE INDEX [IX_StudioReleasePackageRecords_TenantId_ProjectId_CreatedAt] ON [StudioReleasePackageRecords] ([TenantId], [ProjectId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleasePackageRecords_TenantId_ReleaseVersionId] ON [StudioReleasePackageRecords] ([TenantId], [ReleaseVersionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleaseVersionRecords_TenantId_ProjectId_Version] ON [StudioReleaseVersionRecords] ([TenantId], [ProjectId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioReleaseVersionRecords_TenantId_ReleaseCandidateId] ON [StudioReleaseVersionRecords] ([TenantId], [ReleaseCandidateId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Tenants_Slug] ON [Tenants] ([Slug]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193036_InitialAIStudioDatabase'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015193036_InitialAIStudioDatabase', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015200001_AddAIStudioAuditRetentionProcedure'
)
BEGIN
    CREATE OR ALTER TRIGGER dbo.TR_AuditEvents_AppendOnly ON dbo.AuditEvents AFTER UPDATE, DELETE AS
    BEGIN SET NOCOUNT ON; IF ISNULL(TRY_CONVERT(int, SESSION_CONTEXT(N'AIERP_AuditRetentionPurge')), 0) <> 1 THROW 51001, 'Audit events are append-only outside retention purge.', 1; END;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015200001_AddAIStudioAuditRetentionProcedure'
)
BEGIN
    CREATE OR ALTER PROCEDURE dbo.PurgeExpiredAuditEvents @BatchSize int=500, @TenantId uniqueidentifier=NULL, @MaxRowsPerTenant int=10000, @TotalDeleted int OUTPUT AS
    BEGIN
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF @BatchSize<1 OR @BatchSize>5000 THROW 51002, 'Invalid audit purge batch size.', 1;
      IF @MaxRowsPerTenant<1 OR @MaxRowsPerTenant>100000 THROW 51003, 'Invalid audit purge row limit.', 1;
      DECLARE @CurrentTenantId uniqueidentifier, @RetentionDays int, @Cutoff datetimeoffset, @Deleted int, @TenantDeleted int, @Now datetimeoffset;
      SET @TotalDeleted=0;
      BEGIN TRY
        EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=1;
        DECLARE tenants CURSOR LOCAL FAST_FORWARD FOR SELECT Id, AuditRetentionDays FROM dbo.Tenants WHERE @TenantId IS NULL OR Id=@TenantId;
        OPEN tenants; FETCH NEXT FROM tenants INTO @CurrentTenantId,@RetentionDays;
        WHILE @@FETCH_STATUS=0
        BEGIN
          SET @Cutoff=DATEADD(day,-@RetentionDays,TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00')); SET @TenantDeleted=0;
          WHILE @TenantDeleted<@MaxRowsPerTenant
          BEGIN
            BEGIN TRANSACTION;
            DELETE TOP (@BatchSize) FROM dbo.AuditEvents WHERE TenantId=@CurrentTenantId AND OccurredAt<@Cutoff;
            SET @Deleted=@@ROWCOUNT; SET @Now=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00');
            IF @Deleted>0 INSERT dbo.AuditEvents(TenantId,UserId,Action,Resource,OccurredAt) VALUES(@CurrentTenantId,NULL,N'audit.retention.purged',CONCAT(N'{"cutoffUtc":"',CONVERT(nvarchar(33),@Cutoff,127),N'","deletedCount":',@Deleted,N'}'),@Now);
            COMMIT TRANSACTION; SET @TenantDeleted+=@Deleted; SET @TotalDeleted+=@Deleted; IF @Deleted=0 BREAK;
          END;
          UPDATE dbo.Tenants SET AuditLastPurgeAt=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00') WHERE Id=@CurrentTenantId;
          FETCH NEXT FROM tenants INTO @CurrentTenantId,@RetentionDays;
        END;
        CLOSE tenants; DEALLOCATE tenants;
        IF @TenantId IS NULL
        BEGIN
          SET @Cutoff=DATEADD(day,-365,TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00')); SET @TenantDeleted=0;
          WHILE @TenantDeleted<@MaxRowsPerTenant
          BEGIN
            BEGIN TRANSACTION;
            DELETE TOP (@BatchSize) FROM dbo.AuditEvents WHERE TenantId IS NULL AND OccurredAt<@Cutoff;
            SET @Deleted=@@ROWCOUNT; SET @Now=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00');
            IF @Deleted>0 INSERT dbo.AuditEvents(TenantId,UserId,Action,Resource,OccurredAt) VALUES(NULL,NULL,N'audit.retention.purged',CONCAT(N'{"cutoffUtc":"',CONVERT(nvarchar(33),@Cutoff,127),N'","deletedCount":',@Deleted,N'}'),@Now);
            COMMIT TRANSACTION; SET @TenantDeleted+=@Deleted; SET @TotalDeleted+=@Deleted; IF @Deleted=0 BREAK;
          END;
        END;
        EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL;
      END TRY
      BEGIN CATCH
        IF CURSOR_STATUS('local','tenants')>=0 CLOSE tenants;
        IF CURSOR_STATUS('local','tenants')>-3 DEALLOCATE tenants;
        IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
        EXEC sys.sp_set_session_context @key=N'AIERP_AuditRetentionPurge', @value=NULL; THROW;
      END CATCH;
    END;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015200001_AddAIStudioAuditRetentionProcedure'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015200001_AddAIStudioAuditRetentionProcedure', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016221736_AddStudioKnowledgeIndex'
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
    WHERE [MigrationId] = N'20261016221736_AddStudioKnowledgeIndex'
)
BEGIN
    CREATE INDEX [IX_StudioKnowledgeDocuments_TenantId_ProjectId_WorkspaceRequestId_Path_IndexedAt] ON [StudioKnowledgeDocuments] ([TenantId], [ProjectId], [WorkspaceRequestId], [Path], [IndexedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016221736_AddStudioKnowledgeIndex'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioKnowledgeDocuments_TenantId_WorkspaceRequestId_Path_ContentSha256] ON [StudioKnowledgeDocuments] ([TenantId], [WorkspaceRequestId], [Path], [ContentSha256]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016221736_AddStudioKnowledgeIndex'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016221736_AddStudioKnowledgeIndex', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223138_AddStudioCodeReviewThreads'
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
    WHERE [MigrationId] = N'20261016223138_AddStudioCodeReviewThreads'
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
    WHERE [MigrationId] = N'20261016223138_AddStudioCodeReviewThreads'
)
BEGIN
    CREATE INDEX [IX_StudioCodeReviewComments_TenantId_ThreadId_CreatedAt] ON [StudioCodeReviewComments] ([TenantId], [ThreadId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223138_AddStudioCodeReviewThreads'
)
BEGIN
    CREATE INDEX [IX_StudioCodeReviewThreads_TenantId_ProjectId_WorkspaceRequestId_Path_LineNumber_Status] ON [StudioCodeReviewThreads] ([TenantId], [ProjectId], [WorkspaceRequestId], [Path], [LineNumber], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223138_AddStudioCodeReviewThreads'
)
BEGIN
    CREATE INDEX [IX_StudioCodeReviewThreads_TenantId_WorkspaceRequestId] ON [StudioCodeReviewThreads] ([TenantId], [WorkspaceRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016223138_AddStudioCodeReviewThreads'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016223138_AddStudioCodeReviewThreads', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubReviewCommentId] bigint NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubSyncedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubBaseBranch] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestNumber] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestState] nvarchar(32) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestUrl] nvarchar(2048) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubRepository] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_StudioCodeReviewComments_GitHubReviewCommentId] ON [StudioCodeReviewComments] ([GitHubReviewCommentId]) WHERE [GitHubReviewCommentId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016224233_AddStudioGitHubReviewSync'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016224233_AddStudioGitHubReviewSync', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016225749_AddStudioGitHubInboundCommentSync'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubAuthorLogin] nvarchar(39) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016225749_AddStudioGitHubInboundCommentSync'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubPullRequestNumber] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016225749_AddStudioGitHubInboundCommentSync'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016225749_AddStudioGitHubInboundCommentSync', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016230441_AddStudioGitHubCommentRepository'
)
BEGIN
    ALTER TABLE [StudioCodeReviewComments] ADD [GitHubRepository] nvarchar(256) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016230441_AddStudioGitHubCommentRepository'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016230441_AddStudioGitHubCommentRepository', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017021814_AddStudioKnowledgeEmbeddings'
)
BEGIN
    ALTER TABLE [StudioKnowledgeDocuments] ADD [EmbeddingJson] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017021814_AddStudioKnowledgeEmbeddings'
)
BEGIN
    ALTER TABLE [StudioKnowledgeDocuments] ADD [EmbeddingModel] nvarchar(100) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017021814_AddStudioKnowledgeEmbeddings'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017021814_AddStudioKnowledgeEmbeddings', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017133602_AddGitHubPullRequestUpdatedAtAIStudio'
)
BEGIN
    ALTER TABLE [ReleaseCandidateRecords] ADD [GitHubPullRequestUpdatedAt] datetimeoffset NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017133602_AddGitHubPullRequestUpdatedAtAIStudio'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017133602_AddGitHubPullRequestUpdatedAtAIStudio', N'10.0.13');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017134712_AddStudioKnowledgeRefreshConsentAIStudio'
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
    WHERE [MigrationId] = N'20261017134712_AddStudioKnowledgeRefreshConsentAIStudio'
)
BEGIN
    CREATE INDEX [IX_StudioKnowledgeRefreshConsents_LastRefreshedAt] ON [StudioKnowledgeRefreshConsents] ([LastRefreshedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017134712_AddStudioKnowledgeRefreshConsentAIStudio'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StudioKnowledgeRefreshConsents_TenantId_ProjectId_WorkspaceRequestId] ON [StudioKnowledgeRefreshConsents] ([TenantId], [ProjectId], [WorkspaceRequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261017134712_AddStudioKnowledgeRefreshConsentAIStudio'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261017134712_AddStudioKnowledgeRefreshConsentAIStudio', N'10.0.13');
END;

COMMIT;
GO

