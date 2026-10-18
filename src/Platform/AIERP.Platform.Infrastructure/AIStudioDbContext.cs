using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public sealed class AIStudioDbContext(DbContextOptions<AIStudioDbContext> options, IAuditExecutionContext? auditExecutionContext = null)
    : PlatformDbContextBase<AIStudioDbContext>(options, auditExecutionContext)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        var keep = new HashSet<Type>
        {
            typeof(Tenant), typeof(AuditEvent), typeof(DevelopmentRequest), typeof(DevelopmentProject),
            typeof(DevelopmentProjectAccess), typeof(GitHubInstallationAuthorizationState), typeof(DevelopmentWorkspaceRequest),
            typeof(ArchitecturePlanRecord), typeof(AITestPlanRecord), typeof(ReleaseCandidateRecord),
            typeof(ReleaseCandidateReviewRecord), typeof(StudioReleaseVersionRecord), typeof(StudioReleasePackageRecord),
            typeof(StudioReleaseDeploymentRecord), typeof(StudioProductionPromotionApprovalRecord),
            typeof(StudioConversation), typeof(StudioConversationMessage), typeof(StudioKnowledgeDocument), typeof(StudioKnowledgeRefreshConsent),
            typeof(StudioCodeReviewThread), typeof(StudioCodeReviewComment)
        };
        var registered = typeof(PlatformDbContextBase<PlatformDbContext>).GetProperties()
            .Where(p => p.PropertyType.IsGenericType && p.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
            .Select(p => p.PropertyType.GetGenericArguments()[0]).Distinct().ToArray();
        foreach (var type in registered)
            if (!keep.Contains(type) && type != typeof(TenantDatabaseCatalogEntry) && type != typeof(DatabaseSeparationComponentState))
                modelBuilder.Ignore(type);
        modelBuilder.Ignore<TenantDatabaseCatalogEntry>();
        modelBuilder.Ignore<DatabaseSeparationComponentState>();
    }
}
