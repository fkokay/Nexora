using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.AIStudio
{
    /// <inheritdoc />
    public partial class InitialAIStudioDatabase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Action = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Resource = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tenants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    BaseCurrencyCode = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false, defaultValue: "TRY"),
                    AuditRetentionDays = table.Column<int>(type: "int", nullable: false, defaultValue: 365),
                    AuditLastPurgeAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tenants", x => x.Id);
                    table.CheckConstraint("CK_Tenants_AuditRetentionDays", "[AuditRetentionDays] >= 30 AND [AuditRetentionDays] <= 3650");
                });

            migrationBuilder.CreateTable(
                name: "DevelopmentProjects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    RepositoryUrl = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: false),
                    DefaultBranch = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    GitHubInstallationId = table.Column<long>(type: "bigint", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DevelopmentProjects", x => x.Id);
                    table.UniqueConstraint("AK_DevelopmentProjects_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_DevelopmentProjects_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DevelopmentProjectAccesses",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccessLevel = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    GrantedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GrantedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DevelopmentProjectAccesses", x => new { x.TenantId, x.ProjectId, x.UserId });
                    table.ForeignKey(
                        name: "FK_DevelopmentProjectAccesses_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DevelopmentRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(180)", maxLength: 180, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DevelopmentRequests", x => x.Id);
                    table.UniqueConstraint("AK_DevelopmentRequests_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_DevelopmentRequests_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GitHubInstallationAuthorizationStates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StateHash = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ConsumedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GitHubInstallationAuthorizationStates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GitHubInstallationAuthorizationStates_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DevelopmentWorkspaceRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DevelopmentRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    WorkspaceBranchName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ProvisioningError = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ProvisionedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DevelopmentWorkspaceRequests", x => x.Id);
                    table.UniqueConstraint("AK_DevelopmentWorkspaceRequests_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_DevelopmentWorkspaceRequests_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DevelopmentWorkspaceRequests_DevelopmentRequests_TenantId_DevelopmentRequestId",
                        columns: x => new { x.TenantId, x.DevelopmentRequestId },
                        principalTable: "DevelopmentRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AITestPlanRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    PlanJson = table.Column<string>(type: "nvarchar(max)", maxLength: 64000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AITestPlanRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AITestPlanRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AITestPlanRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ArchitecturePlanRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(3000)", maxLength: 3000, nullable: false),
                    PlanJson = table.Column<string>(type: "nvarchar(max)", maxLength: 64000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArchitecturePlanRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArchitecturePlanRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ArchitecturePlanRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ReleaseCandidateRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TestJobId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BranchName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TestTargetPath = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                    TestSnapshotSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TestCompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReleaseCandidateRecords", x => x.Id);
                    table.UniqueConstraint("AK_ReleaseCandidateRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudioConversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(180)", maxLength: 180, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioConversations", x => x.Id);
                    table.UniqueConstraint("AK_StudioConversations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioConversations_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioConversations_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ReleaseCandidateReviewRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkspaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleaseCandidateId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Decision = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReleaseCandidateReviewRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateReviewRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateReviewRecords_DevelopmentWorkspaceRequests_TenantId_WorkspaceRequestId",
                        columns: x => new { x.TenantId, x.WorkspaceRequestId },
                        principalTable: "DevelopmentWorkspaceRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReleaseCandidateReviewRecords_ReleaseCandidateRecords_TenantId_ReleaseCandidateId",
                        columns: x => new { x.TenantId, x.ReleaseCandidateId },
                        principalTable: "ReleaseCandidateRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudioReleaseVersionRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleaseCandidateId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioReleaseVersionRecords", x => x.Id);
                    table.UniqueConstraint("AK_StudioReleaseVersionRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioReleaseVersionRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleaseVersionRecords_ReleaseCandidateRecords_TenantId_ReleaseCandidateId",
                        columns: x => new { x.TenantId, x.ReleaseCandidateId },
                        principalTable: "ReleaseCandidateRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudioConversationMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Content = table.Column<string>(type: "nvarchar(max)", maxLength: 8000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioConversationMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioConversationMessages_StudioConversations_TenantId_ConversationId",
                        columns: x => new { x.TenantId, x.ConversationId },
                        principalTable: "StudioConversations",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudioReleasePackageRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleaseVersionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TestSnapshotSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PackageSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(180)", maxLength: 180, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioReleasePackageRecords", x => x.Id);
                    table.UniqueConstraint("AK_StudioReleasePackageRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioReleasePackageRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleasePackageRecords_StudioReleaseVersionRecords_TenantId_ReleaseVersionId",
                        columns: x => new { x.TenantId, x.ReleaseVersionId },
                        principalTable: "StudioReleaseVersionRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudioReleaseDeploymentRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleasePackageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RollbackOfDeploymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RollbackTargetDeploymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IdempotencyKey = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Environment = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    PackageSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ProviderDeploymentId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    EnvironmentUrl = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    FailureCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioReleaseDeploymentRecords", x => x.Id);
                    table.UniqueConstraint("AK_StudioReleaseDeploymentRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId",
                        columns: x => new { x.TenantId, x.RollbackOfDeploymentId },
                        principalTable: "StudioReleaseDeploymentRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId",
                        columns: x => new { x.TenantId, x.RollbackTargetDeploymentId },
                        principalTable: "StudioReleaseDeploymentRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioReleaseDeploymentRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId",
                        columns: x => new { x.TenantId, x.ReleasePackageId },
                        principalTable: "StudioReleasePackageRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudioProductionPromotionApprovalRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StagingDeploymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReleasePackageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    RequestNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ReviewNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioProductionPromotionApprovalRecords", x => x.Id);
                    table.UniqueConstraint("AK_StudioProductionPromotionApprovalRecords_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_DevelopmentProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "DevelopmentProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_StudioReleaseDeploymentRecords_TenantId_StagingDeploymentId",
                        columns: x => new { x.TenantId, x.StagingDeploymentId },
                        principalTable: "StudioReleaseDeploymentRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudioProductionPromotionApprovalRecords_StudioReleasePackageRecords_TenantId_ReleasePackageId",
                        columns: x => new { x.TenantId, x.ReleasePackageId },
                        principalTable: "StudioReleasePackageRecords",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AITestPlanRecords_TenantId_ProjectId_CreatedAt",
                table: "AITestPlanRecords",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AITestPlanRecords_TenantId_WorkspaceRequestId_CreatedAt",
                table: "AITestPlanRecords",
                columns: new[] { "TenantId", "WorkspaceRequestId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ArchitecturePlanRecords_TenantId_ProjectId_CreatedAt",
                table: "ArchitecturePlanRecords",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ArchitecturePlanRecords_TenantId_WorkspaceRequestId_CreatedAt",
                table: "ArchitecturePlanRecords",
                columns: new[] { "TenantId", "WorkspaceRequestId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEvents_TenantId_OccurredAt",
                table: "AuditEvents",
                columns: new[] { "TenantId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentProjectAccesses_TenantId_UserId",
                table: "DevelopmentProjectAccesses",
                columns: new[] { "TenantId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentProjects_TenantId_IsActive_CreatedAt",
                table: "DevelopmentProjects",
                columns: new[] { "TenantId", "IsActive", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentProjects_TenantId_Name",
                table: "DevelopmentProjects",
                columns: new[] { "TenantId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentRequests_TenantId_CreatedAt",
                table: "DevelopmentRequests",
                columns: new[] { "TenantId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentRequests_TenantId_ProjectId_CreatedAt",
                table: "DevelopmentRequests",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_DevelopmentRequestId",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "DevelopmentRequestId" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_ProjectId_CreatedAt",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DevelopmentWorkspaceRequests_TenantId_Status_CreatedAt",
                table: "DevelopmentWorkspaceRequests",
                columns: new[] { "TenantId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GitHubInstallationAuthorizationStates_ExpiresAt_ConsumedAt",
                table: "GitHubInstallationAuthorizationStates",
                columns: new[] { "ExpiresAt", "ConsumedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GitHubInstallationAuthorizationStates_StateHash",
                table: "GitHubInstallationAuthorizationStates",
                column: "StateHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GitHubInstallationAuthorizationStates_TenantId_ProjectId",
                table: "GitHubInstallationAuthorizationStates",
                columns: new[] { "TenantId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateRecords_TenantId_ProjectId_CreatedAt",
                table: "ReleaseCandidateRecords",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateRecords_TenantId_WorkspaceRequestId_CreatedAt",
                table: "ReleaseCandidateRecords",
                columns: new[] { "TenantId", "WorkspaceRequestId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateRecords_TenantId_WorkspaceRequestId_TestJobId",
                table: "ReleaseCandidateRecords",
                columns: new[] { "TenantId", "WorkspaceRequestId", "TestJobId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateReviewRecords_TenantId_ProjectId_CreatedAt",
                table: "ReleaseCandidateReviewRecords",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateReviewRecords_TenantId_ReleaseCandidateId",
                table: "ReleaseCandidateReviewRecords",
                columns: new[] { "TenantId", "ReleaseCandidateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReleaseCandidateReviewRecords_TenantId_WorkspaceRequestId",
                table: "ReleaseCandidateReviewRecords",
                columns: new[] { "TenantId", "WorkspaceRequestId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioConversationMessages_TenantId_ConversationId_CreatedAt",
                table: "StudioConversationMessages",
                columns: new[] { "TenantId", "ConversationId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioConversations_TenantId_CreatedByUserId_UpdatedAt",
                table: "StudioConversations",
                columns: new[] { "TenantId", "CreatedByUserId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioConversations_TenantId_ProjectId",
                table: "StudioConversations",
                columns: new[] { "TenantId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioConversations_TenantId_WorkspaceRequestId_UpdatedAt",
                table: "StudioConversations",
                columns: new[] { "TenantId", "WorkspaceRequestId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_ProjectId_Status_CreatedAt",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "ProjectId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_ReleasePackageId",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "ReleasePackageId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioProductionPromotionApprovalRecords_TenantId_StagingDeploymentId",
                table: "StudioProductionPromotionApprovalRecords",
                columns: new[] { "TenantId", "StagingDeploymentId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_IdempotencyKey",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_ProjectId_Environment_CreatedAt",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "ProjectId", "Environment", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_ReleasePackageId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "ReleasePackageId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_RollbackOfDeploymentId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "RollbackOfDeploymentId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseDeploymentRecords_TenantId_RollbackTargetDeploymentId",
                table: "StudioReleaseDeploymentRecords",
                columns: new[] { "TenantId", "RollbackTargetDeploymentId" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleasePackageRecords_TenantId_ProjectId_CreatedAt",
                table: "StudioReleasePackageRecords",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleasePackageRecords_TenantId_ReleaseVersionId",
                table: "StudioReleasePackageRecords",
                columns: new[] { "TenantId", "ReleaseVersionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseVersionRecords_TenantId_ProjectId_Version",
                table: "StudioReleaseVersionRecords",
                columns: new[] { "TenantId", "ProjectId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioReleaseVersionRecords_TenantId_ReleaseCandidateId",
                table: "StudioReleaseVersionRecords",
                columns: new[] { "TenantId", "ReleaseCandidateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_Slug",
                table: "Tenants",
                column: "Slug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AITestPlanRecords");

            migrationBuilder.DropTable(
                name: "ArchitecturePlanRecords");

            migrationBuilder.DropTable(
                name: "AuditEvents");

            migrationBuilder.DropTable(
                name: "DevelopmentProjectAccesses");

            migrationBuilder.DropTable(
                name: "GitHubInstallationAuthorizationStates");

            migrationBuilder.DropTable(
                name: "ReleaseCandidateReviewRecords");

            migrationBuilder.DropTable(
                name: "StudioConversationMessages");

            migrationBuilder.DropTable(
                name: "StudioProductionPromotionApprovalRecords");

            migrationBuilder.DropTable(
                name: "StudioConversations");

            migrationBuilder.DropTable(
                name: "StudioReleaseDeploymentRecords");

            migrationBuilder.DropTable(
                name: "StudioReleasePackageRecords");

            migrationBuilder.DropTable(
                name: "StudioReleaseVersionRecords");

            migrationBuilder.DropTable(
                name: "ReleaseCandidateRecords");

            migrationBuilder.DropTable(
                name: "DevelopmentWorkspaceRequests");

            migrationBuilder.DropTable(
                name: "DevelopmentRequests");

            migrationBuilder.DropTable(
                name: "DevelopmentProjects");

            migrationBuilder.DropTable(
                name: "Tenants");
        }
    }
}
