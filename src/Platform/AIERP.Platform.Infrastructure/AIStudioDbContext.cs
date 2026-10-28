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
            typeof(StudioCodeReviewThread), typeof(StudioCodeReviewComment), typeof(StudioModuleSourceMapping)
        };
        var registered = typeof(PlatformDbContextBase<PlatformDbContext>).GetProperties()
            .Where(p => p.PropertyType.IsGenericType && p.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
            .Select(p => p.PropertyType.GetGenericArguments()[0]).Distinct().ToArray();
        modelBuilder.Entity<CustomerLedgerEntry>().Ignore(x => x.PurchaseInvoiceDraftId);
        modelBuilder.Entity<CustomerLedgerEntry>().Ignore(x => x.PurchaseInvoiceDraft);
        foreach (var type in registered)
            if (!keep.Contains(type) && type != typeof(TenantDatabaseCatalogEntry) && type != typeof(DatabaseSeparationComponentState))
                modelBuilder.Ignore(type);
        // Supplier drafts are tenant-ERP records. Their navigation from the shared
        // ledger entity can otherwise pull them into this allowlisted Studio model.
        modelBuilder.Ignore<PurchaseInvoiceDraft>();
        modelBuilder.Ignore<PurchaseInvoiceDraftLine>();
        // Payroll workplace configuration belongs to tenant ERP databases. These
        // entities are explicitly ignored by PlatformDbContext for the same reason;
        // relationship discovery from Tenant must not add them to the Studio model.
        modelBuilder.Ignore<PayrollEmployeeWorkCalendarOverride>();
        modelBuilder.Ignore<PayrollEmployeeWorkplaceAssignment>();
        modelBuilder.Ignore<WorkplaceDefinition>();
        modelBuilder.Ignore<PayrollPriorEmployerTaxBaseDeclaration>();
        modelBuilder.Ignore<PayrollWorkplaceCalendar>();
        modelBuilder.Ignore<TenantDatabaseCatalogEntry>();
        modelBuilder.Ignore<DatabaseSeparationComponentState>();
    }
}
