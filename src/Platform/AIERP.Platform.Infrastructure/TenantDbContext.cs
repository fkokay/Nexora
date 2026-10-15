using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public sealed class TenantDbContext(DbContextOptions<TenantDbContext> options, IAuditExecutionContext? auditExecutionContext = null)
    : PlatformDbContextBase<TenantDbContext>(options, auditExecutionContext)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        var studioEntities = new[]
        {
            typeof(AppUser), typeof(TenantMembership), typeof(PermissionDefinition), typeof(TenantPermissionRule),
            typeof(DevelopmentRequest), typeof(DevelopmentProject), typeof(DevelopmentProjectAccess),
            typeof(GitHubInstallationAuthorizationState), typeof(DevelopmentWorkspaceRequest), typeof(ArchitecturePlanRecord),
            typeof(AITestPlanRecord), typeof(ReleaseCandidateRecord), typeof(ReleaseCandidateReviewRecord),
            typeof(StudioReleaseVersionRecord), typeof(StudioReleasePackageRecord), typeof(StudioReleaseDeploymentRecord),
            typeof(StudioProductionPromotionApprovalRecord), typeof(StudioConversation), typeof(StudioConversationMessage),
            typeof(TenantDatabaseCatalogEntry), typeof(DatabaseSeparationComponentState)
        };
        foreach (var type in studioEntities) modelBuilder.Ignore(type);
    }
}
