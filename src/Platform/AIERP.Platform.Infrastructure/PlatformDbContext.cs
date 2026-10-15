using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public sealed class PlatformDbContext(DbContextOptions<PlatformDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<TenantExchangeRate> TenantExchangeRates => Set<TenantExchangeRate>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<DevelopmentRequest> DevelopmentRequests => Set<DevelopmentRequest>();
    public DbSet<DevelopmentProject> DevelopmentProjects => Set<DevelopmentProject>();
    public DbSet<DevelopmentProjectAccess> DevelopmentProjectAccesses => Set<DevelopmentProjectAccess>();
    public DbSet<GitHubInstallationAuthorizationState> GitHubInstallationAuthorizationStates => Set<GitHubInstallationAuthorizationState>();
    public DbSet<DevelopmentWorkspaceRequest> DevelopmentWorkspaceRequests => Set<DevelopmentWorkspaceRequest>();
    public DbSet<ArchitecturePlanRecord> ArchitecturePlanRecords => Set<ArchitecturePlanRecord>();
    public DbSet<AITestPlanRecord> AITestPlanRecords => Set<AITestPlanRecord>();
    public DbSet<ReleaseCandidateRecord> ReleaseCandidateRecords => Set<ReleaseCandidateRecord>();
    public DbSet<ReleaseCandidateReviewRecord> ReleaseCandidateReviewRecords => Set<ReleaseCandidateReviewRecord>();
    public DbSet<StudioReleaseVersionRecord> StudioReleaseVersionRecords => Set<StudioReleaseVersionRecord>();
    public DbSet<StudioReleasePackageRecord> StudioReleasePackageRecords => Set<StudioReleasePackageRecord>();
    public DbSet<StudioReleaseDeploymentRecord> StudioReleaseDeploymentRecords => Set<StudioReleaseDeploymentRecord>();
    public DbSet<StudioProductionPromotionApprovalRecord> StudioProductionPromotionApprovalRecords => Set<StudioProductionPromotionApprovalRecord>();
    public DbSet<StudioConversation> StudioConversations => Set<StudioConversation>();
    public DbSet<StudioConversationMessage> StudioConversationMessages => Set<StudioConversationMessage>();
    public DbSet<CustomerAccount> CustomerAccounts => Set<CustomerAccount>();
    public DbSet<CustomerCustomFieldDefinition> CustomerCustomFieldDefinitions => Set<CustomerCustomFieldDefinition>();
    public DbSet<CustomerCustomFieldDefinitionRevision> CustomerCustomFieldDefinitionRevisions => Set<CustomerCustomFieldDefinitionRevision>();
    public DbSet<CustomerCustomFieldValue> CustomerCustomFieldValues => Set<CustomerCustomFieldValue>();
    public DbSet<CustomerCustomFieldValueRevision> CustomerCustomFieldValueRevisions => Set<CustomerCustomFieldValueRevision>();
    public DbSet<CustomerGroup> CustomerGroups => Set<CustomerGroup>();
    public DbSet<CustomerAddress> CustomerAddresses => Set<CustomerAddress>();
    public DbSet<CustomerLedgerEntry> CustomerLedgerEntries => Set<CustomerLedgerEntry>();
    public DbSet<StockItem> StockItems => Set<StockItem>();
    public DbSet<StockItemCustomFieldDefinition> StockItemCustomFieldDefinitions => Set<StockItemCustomFieldDefinition>();
    public DbSet<StockItemCustomFieldDefinitionRevision> StockItemCustomFieldDefinitionRevisions => Set<StockItemCustomFieldDefinitionRevision>();
    public DbSet<StockItemCustomFieldValue> StockItemCustomFieldValues => Set<StockItemCustomFieldValue>();
    public DbSet<StockItemCustomFieldValueRevision> StockItemCustomFieldValueRevisions => Set<StockItemCustomFieldValueRevision>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<InventoryTransfer> InventoryTransfers => Set<InventoryTransfer>();
    public DbSet<InventoryTransaction> InventoryTransactions => Set<InventoryTransaction>();
    public DbSet<SalesQuote> SalesQuotes => Set<SalesQuote>();
    public DbSet<SalesQuoteLine> SalesQuoteLines => Set<SalesQuoteLine>();
    public DbSet<SalesOrder> SalesOrders => Set<SalesOrder>();
    public DbSet<SalesOrderLine> SalesOrderLines => Set<SalesOrderLine>();
    public DbSet<SalesOrderReservation> SalesOrderReservations => Set<SalesOrderReservation>();
    public DbSet<SalesDelivery> SalesDeliveries => Set<SalesDelivery>();
    public DbSet<SalesDeliveryLine> SalesDeliveryLines => Set<SalesDeliveryLine>();
    public DbSet<SalesInvoice> SalesInvoices => Set<SalesInvoice>();
    public DbSet<SalesInvoiceLine> SalesInvoiceLines => Set<SalesInvoiceLine>();
    public DbSet<CustomerCollection> CustomerCollections => Set<CustomerCollection>();
    public DbSet<CustomerCollectionAllocation> CustomerCollectionAllocations => Set<CustomerCollectionAllocation>();
    public DbSet<SalesReturn> SalesReturns => Set<SalesReturn>();
    public DbSet<SalesReturnLine> SalesReturnLines => Set<SalesReturnLine>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<PurchaseRequest> PurchaseRequests => Set<PurchaseRequest>();
    public DbSet<PurchaseRequestLine> PurchaseRequestLines => Set<PurchaseRequestLine>();
    public DbSet<PurchaseRequestCustomFieldDefinition> PurchaseRequestCustomFieldDefinitions => Set<PurchaseRequestCustomFieldDefinition>();
    public DbSet<PurchaseRequestCustomFieldDefinitionRevision> PurchaseRequestCustomFieldDefinitionRevisions => Set<PurchaseRequestCustomFieldDefinitionRevision>();
    public DbSet<PurchaseRequestCustomFieldValue> PurchaseRequestCustomFieldValues => Set<PurchaseRequestCustomFieldValue>();
    public DbSet<PurchaseRequestCustomFieldValueRevision> PurchaseRequestCustomFieldValueRevisions => Set<PurchaseRequestCustomFieldValueRevision>();
    public DbSet<PurchaseSupplierQuote> PurchaseSupplierQuotes => Set<PurchaseSupplierQuote>();
    public DbSet<PurchaseSupplierQuoteLine> PurchaseSupplierQuoteLines => Set<PurchaseSupplierQuoteLine>();
    public DbSet<PurchaseReceipt> PurchaseReceipts => Set<PurchaseReceipt>();
    public DbSet<PurchaseReceiptLine> PurchaseReceiptLines => Set<PurchaseReceiptLine>();
    public DbSet<PurchaseInvoice> PurchaseInvoices => Set<PurchaseInvoice>();
    public DbSet<PurchaseInvoiceLine> PurchaseInvoiceLines => Set<PurchaseInvoiceLine>();
    public DbSet<SupplierPayment> SupplierPayments => Set<SupplierPayment>();
    public DbSet<SupplierReturn> SupplierReturns => Set<SupplierReturn>();
    public DbSet<SupplierReturnLine> SupplierReturnLines => Set<SupplierReturnLine>();
    public DbSet<FinancialAccount> FinancialAccounts => Set<FinancialAccount>();
    public DbSet<FinancialAccountTransaction> FinancialAccountTransactions => Set<FinancialAccountTransaction>();
    public DbSet<FinancialAccountTransfer> FinancialAccountTransfers => Set<FinancialAccountTransfer>();
    public DbSet<BankStatement> BankStatements => Set<BankStatement>();
    public DbSet<BankStatementLine> BankStatementLines => Set<BankStatementLine>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.DisplayName).HasMaxLength(160);
            e.Property(x => x.PasswordHash).HasMaxLength(512);
        });
        modelBuilder.Entity<Tenant>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Slug).HasMaxLength(100);
            e.Property(x => x.BaseCurrencyCode).HasMaxLength(3).IsFixedLength().HasDefaultValue("TRY");
        });
        modelBuilder.Entity<TenantExchangeRate>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CurrencyCode, x.RateDate, x.Revision }).IsUnique();
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Rate).HasPrecision(18, 8);
            e.Property(x => x.Source).HasMaxLength(160);
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<TenantMembership>(e =>
        {
            e.HasKey(x => new { x.UserId, x.TenantId });
            e.Property(x => x.Role).HasMaxLength(64);
            e.HasOne(x => x.User).WithMany(x => x.Memberships).HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Tenant).WithMany(x => x.Memberships).HasForeignKey(x => x.TenantId);
        });
        modelBuilder.Entity<AuditEvent>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.OccurredAt });
            e.Property(x => x.Action).HasMaxLength(120);
            e.Property(x => x.Resource).HasMaxLength(240);
        });
        modelBuilder.Entity<DevelopmentRequest>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.Property(x => x.Title).HasMaxLength(180);
            e.Property(x => x.Status).HasMaxLength(40);
            e.HasOne(x => x.Project).WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<DevelopmentProject>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Name }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.IsActive, x.CreatedAt });
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.RepositoryUrl).HasMaxLength(2048);
            e.Property(x => x.DefaultBranch).HasMaxLength(256);
            e.Property(x => x.GitHubInstallationId);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<GitHubInstallationAuthorizationState>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.StateHash).IsUnique();
            e.HasIndex(x => new { x.ExpiresAt, x.ConsumedAt });
            e.Property(x => x.StateHash).HasMaxLength(64).IsUnicode(false);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.UserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<DevelopmentProjectAccess>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.ProjectId, x.UserId });
            e.HasIndex(x => new { x.TenantId, x.UserId });
            e.Property(x => x.AccessLevel).HasMaxLength(24);
            e.HasOne(x => x.Project).WithMany(x => x.AccessGrants)
                .HasForeignKey(x => new { x.TenantId, x.ProjectId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.UserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.GrantedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<DevelopmentWorkspaceRequest>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.Status, x.CreatedAt });
            e.Property(x => x.BranchName).HasMaxLength(256);
            e.Property(x => x.WorkspaceBranchName).HasMaxLength(256);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.ReviewNote).HasMaxLength(500);
            e.Property(x => x.CommitSha).HasMaxLength(64);
            e.Property(x => x.ProvisioningError).HasMaxLength(500);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.DevelopmentRequest).WithMany().HasForeignKey(x => new { x.TenantId, x.DevelopmentRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.RequestedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReviewedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ArchitecturePlanRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.WorkspaceRequestId, x.CreatedAt });
            e.Property(x => x.BranchName).HasMaxLength(256);
            e.Property(x => x.CommitSha).HasMaxLength(64);
            e.Property(x => x.Summary).HasMaxLength(3000);
            e.Property(x => x.PlanJson).HasMaxLength(64000);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentWorkspaceRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<AITestPlanRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.WorkspaceRequestId, x.CreatedAt });
            e.Property(x => x.BranchName).HasMaxLength(256);
            e.Property(x => x.CommitSha).HasMaxLength(64);
            e.Property(x => x.Summary).HasMaxLength(2000);
            e.Property(x => x.PlanJson).HasMaxLength(64000);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentWorkspaceRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ReleaseCandidateRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.WorkspaceRequestId, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.WorkspaceRequestId, x.TestJobId }).IsUnique();
            e.Property(x => x.BranchName).HasMaxLength(256);
            e.Property(x => x.CommitSha).HasMaxLength(64);
            e.Property(x => x.TestTargetPath).HasMaxLength(512);
            e.Property(x => x.TestSnapshotSha256).HasMaxLength(64);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentWorkspaceRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StudioReleaseVersionRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ReleaseCandidateId }).IsUnique();
            e.Property(x => x.Version).HasMaxLength(128);
            e.Property(x => x.CommitSha).HasMaxLength(64);
            e.HasOne<ReleaseCandidateRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReleaseCandidateId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StudioReleasePackageRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ReleaseVersionId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.Property(x => x.Version).HasMaxLength(128);
            e.Property(x => x.CommitSha).HasMaxLength(64);
            e.Property(x => x.TestSnapshotSha256).HasMaxLength(64);
            e.Property(x => x.PackageSha256).HasMaxLength(64);
            e.Property(x => x.FileName).HasMaxLength(180);
            e.HasOne<StudioReleaseVersionRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReleaseVersionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StudioReleaseDeploymentRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.Environment, x.CreatedAt });
            e.Property(x => x.Environment).HasMaxLength(16);
            e.Property(x => x.Provider).HasMaxLength(32);
            e.Property(x => x.Status).HasMaxLength(24);
            e.Property(x => x.PackageSha256).HasMaxLength(64);
            e.Property(x => x.CommitSha).HasMaxLength(64);
            e.Property(x => x.ProviderDeploymentId).HasMaxLength(128);
            e.Property(x => x.EnvironmentUrl).HasMaxLength(256);
            e.Property(x => x.FailureCode).HasMaxLength(64);
            e.HasOne<StudioReleasePackageRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReleasePackageId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StudioReleaseDeploymentRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.RollbackOfDeploymentId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StudioReleaseDeploymentRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.RollbackTargetDeploymentId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ReleaseCandidateReviewRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ReleaseCandidateId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.Property(x => x.Decision).HasMaxLength(16);
            e.Property(x => x.Note).HasMaxLength(1000);
            e.HasOne<ReleaseCandidateRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReleaseCandidateId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentWorkspaceRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReviewedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StudioProductionPromotionApprovalRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.StagingDeploymentId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.Status, x.CreatedAt });
            e.Property(x => x.Status).HasMaxLength(24);
            e.Property(x => x.RequestNote).HasMaxLength(1000);
            e.Property(x => x.ReviewNote).HasMaxLength(1000);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StudioReleaseDeploymentRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.StagingDeploymentId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StudioReleasePackageRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReleasePackageId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.RequestedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReviewedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StudioConversation>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WorkspaceRequestId, x.UpdatedAt });
            e.HasIndex(x => new { x.TenantId, x.CreatedByUserId, x.UpdatedAt });
            e.Property(x => x.Title).HasMaxLength(180);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentWorkspaceRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StudioConversationMessage>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ConversationId, x.CreatedAt });
            e.Property(x => x.Role).HasMaxLength(16);
            e.Property(x => x.Content).HasMaxLength(8000);
            e.HasOne<StudioConversation>().WithMany().HasForeignKey(x => new { x.TenantId, x.ConversationId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<CustomerAccount>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Name });
            e.Property(x => x.Code).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.TaxNumber).HasMaxLength(32);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.RiskLimit).HasPrecision(18, 2);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne(x => x.Tenant).WithMany(x => x.Customers).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Group).WithMany(x => x.Customers).HasForeignKey(x => new { x.TenantId, x.GroupId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false);
        });
        modelBuilder.Entity<CustomerCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CustomerCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<CustomerCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CustomerCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.CustomerId, x.DefinitionId });
            e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne<CustomerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<CustomerCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CustomerCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.CustomerId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500);
            e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne<CustomerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<CustomerCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CustomerGroup>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Name).HasMaxLength(120);
            e.HasOne(x => x.Tenant).WithMany(x => x.CustomerGroups).HasForeignKey(x => x.TenantId);
        });
        modelBuilder.Entity<CustomerAddress>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.CustomerId });
            e.Property(x => x.Label).HasMaxLength(80);
            e.Property(x => x.AddressLine).HasMaxLength(400);
            e.Property(x => x.City).HasMaxLength(100);
            e.Property(x => x.District).HasMaxLength(100);
            e.Property(x => x.PostalCode).HasMaxLength(20);
            e.Property(x => x.CountryCode).HasMaxLength(2).IsFixedLength();
            e.HasOne(x => x.Customer).WithMany(x => x.Addresses).HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id });
        });
        modelBuilder.Entity<CustomerLedgerEntry>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CustomerId, x.EntryDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.ReversalOfId }).IsUnique().HasFilter("[ReversalOfId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.SalesInvoiceId });
            e.HasIndex(x => new { x.TenantId, x.CustomerCollectionId });
            e.HasIndex(x => new { x.TenantId, x.SalesReturnId });
            e.HasIndex(x => new { x.TenantId, x.PurchaseInvoiceId });
            e.HasIndex(x => new { x.TenantId, x.SupplierPaymentId });
            e.HasIndex(x => new { x.TenantId, x.SupplierReturnId });
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Description).HasMaxLength(240);
            e.ToTable(t => t.HasCheckConstraint("CK_CustomerLedgerEntries_AmountPositive", "[Amount] > 0"));
            e.HasOne(x => x.Customer).WithMany(x => x.LedgerEntries).HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id });
            e.HasOne(x => x.ReversalOf).WithOne(x => x.ReversalEntry).HasForeignKey<CustomerLedgerEntry>(x => new { x.TenantId, x.ReversalOfId }).HasPrincipalKey<CustomerLedgerEntry>(x => new { x.TenantId, x.Id }).IsRequired(false);
            e.HasOne(x => x.SalesInvoice).WithMany(x => x.LedgerEntries).HasForeignKey(x => new { x.TenantId, x.SalesInvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CustomerCollection).WithMany(x => x.LedgerEntries).HasForeignKey(x => new { x.TenantId, x.CustomerCollectionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SalesReturn).WithMany(x => x.LedgerEntries).HasForeignKey(x => new { x.TenantId, x.SalesReturnId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PurchaseInvoice).WithMany(x => x.LedgerEntries).HasForeignKey(x => new { x.TenantId, x.PurchaseInvoiceId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.SupplierId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SupplierPayment).WithMany(x => x.LedgerEntries).HasForeignKey(x => new { x.TenantId, x.SupplierPaymentId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.SupplierId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SupplierReturn).WithMany(x => x.LedgerEntries).HasForeignKey(x => new { x.TenantId, x.SupplierReturnId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.SupplierId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StockItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Barcode }).IsUnique().HasFilter("[Barcode] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.Name });
            e.Property(x => x.Code).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Barcode).HasMaxLength(64);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Category).HasMaxLength(120);
            e.Property(x => x.MinimumStock).HasPrecision(18, 4);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_StockItems_MinimumStockNonNegative", "[MinimumStock] >= 0"));
            e.HasOne(x => x.Tenant).WithMany(x => x.StockItems).HasForeignKey(x => x.TenantId);
        });
        modelBuilder.Entity<StockItemCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StockItemCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<StockItemCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StockItemCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.StockItemId, x.DefinitionId });
            e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<StockItemCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StockItemCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.StockItemId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500);
            e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StockItemCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<Warehouse>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne(x => x.Tenant).WithMany(x => x.Warehouses).HasForeignKey(x => x.TenantId);
        });
        modelBuilder.Entity<InventoryTransfer>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.TransferDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(48);
            e.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.FromWarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.ToWarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<InventoryTransaction>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WarehouseId, x.StockItemId, x.EntryDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.ReversalOfId }).IsUnique().HasFilter("[ReversalOfId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.SalesDeliveryLineId });
            e.HasIndex(x => new { x.TenantId, x.SalesReturnLineId });
            e.HasIndex(x => new { x.TenantId, x.PurchaseReceiptLineId });
            e.HasIndex(x => new { x.TenantId, x.SupplierReturnLineId });
            e.HasIndex(x => new { x.TenantId, x.InventoryTransferId, x.WarehouseId, x.StockItemId }).IsUnique().HasFilter("[InventoryTransferId] IS NOT NULL");
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitCostBase).HasPrecision(18, 8);
            e.Property(x => x.Description).HasMaxLength(240);
            e.ToTable(t => { t.HasCheckConstraint("CK_InventoryTransactions_QuantityPositive", "[Quantity] > 0"); });
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.StockItem).WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ReversalOf).WithOne(x => x.ReversalEntry).HasForeignKey<InventoryTransaction>(x => new { x.TenantId, x.ReversalOfId }).HasPrincipalKey<InventoryTransaction>(x => new { x.TenantId, x.Id }).IsRequired(false);
            e.HasOne(x => x.SalesDeliveryLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.SalesDeliveryLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SalesReturnLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.SalesReturnLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PurchaseReceiptLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SupplierReturnLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.SupplierReturnLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.InventoryTransfer).WithMany().HasForeignKey(x => new { x.TenantId, x.InventoryTransferId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesQuote>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.QuoteDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_SalesQuotes_ValidDateRange", "[ValidUntil] >= [QuoteDate]"));
            e.HasOne(x => x.Tenant).WithMany(x => x.SalesQuotes).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesQuoteLine>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.QuoteId, x.LineNumber });
            e.HasIndex(x => new { x.TenantId, x.StockItemId });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SalesQuoteLines_QuantityPositive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_SalesQuoteLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                t.HasCheckConstraint("CK_SalesQuoteLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
            });
            e.HasOne(x => x.Quote).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.QuoteId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.StockItem).WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesOrder>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.QuoteId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.OrderDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.HasOne(x => x.Tenant).WithMany(x => x.SalesOrders).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Quote).WithOne(x => x.Order).HasForeignKey<SalesOrder>(x => new { x.TenantId, x.QuoteId }).HasPrincipalKey<SalesQuote>(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesOrderLine>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.OrderId, x.LineNumber });
            e.HasIndex(x => new { x.TenantId, x.StockItemId });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SalesOrderLines_QuantityPositive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_SalesOrderLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                t.HasCheckConstraint("CK_SalesOrderLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
            });
            e.HasOne(x => x.Order).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.OrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.StockItem).WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesOrderReservation>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.OrderId, x.OrderLineNumber });
            e.HasIndex(x => new { x.TenantId, x.RequestId, x.OrderId, x.OrderLineNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.OrderId, x.OrderLineNumber }).IsUnique().HasFilter("[Status] = N'Active'");
            e.HasIndex(x => new { x.TenantId, x.WarehouseId, x.Status });
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.FulfilledQuantity).HasPrecision(18, 4);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SalesOrderReservations_QuantityPositive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_SalesOrderReservations_FulfilledRange", "[FulfilledQuantity] >= 0 AND [FulfilledQuantity] <= [Quantity]");
            });
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Order).WithMany(x => x.Reservations).HasForeignKey(x => new { x.TenantId, x.OrderId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.OrderLine).WithMany().HasForeignKey(x => new { x.TenantId, x.OrderId, x.OrderLineNumber })
                .HasPrincipalKey(x => new { x.TenantId, x.OrderId, x.LineNumber }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesDelivery>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.OrderId });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.OrderId, x.Status, x.DeliveryDate });
            e.Property(x => x.Code).HasMaxLength(40);
            e.HasOne(x => x.Tenant).WithMany(x => x.SalesDeliveries).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Order).WithMany(x => x.Deliveries).HasForeignKey(x => new { x.TenantId, x.OrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesDeliveryLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DeliveryId, x.OrderLineNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.OrderId, x.OrderLineNumber });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.ToTable(t => t.HasCheckConstraint("CK_SalesDeliveryLines_QuantityPositive", "[Quantity] > 0"));
            e.HasOne(x => x.Delivery).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.DeliveryId, x.OrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.OrderId }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.OrderLine).WithMany().HasForeignKey(x => new { x.TenantId, x.OrderId, x.OrderLineNumber }).HasPrincipalKey(x => new { x.TenantId, x.OrderId, x.LineNumber }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Reservation).WithMany().HasForeignKey(x => new { x.TenantId, x.ReservationId, x.OrderId, x.OrderLineNumber })
                .HasPrincipalKey(x => new { x.TenantId, x.Id, x.OrderId, x.OrderLineNumber }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesInvoice>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.DeliveryId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.InvoiceDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.HasOne(x => x.Tenant).WithMany(x => x.SalesInvoices).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Delivery).WithOne(x => x.Invoice).HasForeignKey<SalesInvoice>(x => new { x.TenantId, x.DeliveryId }).HasPrincipalKey<SalesDelivery>(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Order).WithMany().HasForeignKey(x => new { x.TenantId, x.OrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesInvoiceLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DeliveryLineId }).IsUnique();
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SalesInvoiceLines_QuantityPositive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_SalesInvoiceLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                t.HasCheckConstraint("CK_SalesInvoiceLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
            });
            e.HasOne(x => x.Invoice).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.InvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.DeliveryLine).WithOne(x => x.InvoiceLine).HasForeignKey<SalesInvoiceLine>(x => new { x.TenantId, x.DeliveryLineId }).HasPrincipalKey<SalesDeliveryLine>(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CustomerCollection>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.CurrencyCode });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.CustomerId, x.CollectionDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.PaymentMethod).HasMaxLength(40);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.ToTable(t => t.HasCheckConstraint("CK_CustomerCollections_AmountPositive", "[Amount] > 0"));
            e.HasOne(x => x.Tenant).WithMany(x => x.CustomerCollections).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.FinancialAccount).WithMany().HasForeignKey(x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CustomerCollectionAllocation>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CustomerCollectionId, x.SalesInvoiceId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.SalesInvoiceId });
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_CustomerCollectionAllocations_AmountPositive", "[Amount] > 0"));
            e.HasOne(x => x.CustomerCollection).WithMany(x => x.Allocations).HasForeignKey(x => new { x.TenantId, x.CustomerCollectionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.SalesInvoice).WithMany().HasForeignKey(x => new { x.TenantId, x.SalesInvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesReturn>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.SalesInvoiceId, x.ReturnDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_SalesReturns_GrandTotalPositive", "[GrandTotal] > 0"));
            e.HasOne(x => x.Tenant).WithMany(x => x.SalesReturns).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.SalesInvoice).WithMany(x => x.Returns).HasForeignKey(x => new { x.TenantId, x.SalesInvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesReturnLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.SalesReturnId });
            e.HasIndex(x => new { x.TenantId, x.SalesInvoiceLineId });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SalesReturnLines_QuantityPositive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_SalesReturnLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                t.HasCheckConstraint("CK_SalesReturnLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
            });
            e.HasOne(x => x.SalesReturn).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.SalesReturnId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.SalesInvoiceLine).WithMany().HasForeignKey(x => new { x.TenantId, x.SalesInvoiceLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseRequest>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Description).HasMaxLength(1000);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ReviewNote).HasMaxLength(1000);
            e.HasOne(x => x.Tenant).WithMany(x => x.PurchaseRequests).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.RequestedBy).WithMany().HasForeignKey(x => new { x.RequestedByUserId, x.TenantId })
                .HasPrincipalKey(x => new { x.UserId, x.TenantId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ReviewedBy).WithMany().HasForeignKey(x => new { x.ReviewedByUserId, x.TenantId })
                .HasPrincipalKey(x => new { x.UserId, x.TenantId }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseRequestCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseRequestCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<PurchaseRequestCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseRequestCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.PurchaseRequestId, x.DefinitionId });
            e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne<PurchaseRequest>().WithMany(x => x.CustomFieldValues).HasForeignKey(x => new { x.TenantId, x.PurchaseRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseRequestCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseRequestCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.PurchaseRequestId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500);
            e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne<PurchaseRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseRequestCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseRequestLine>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.PurchaseRequestId, x.LineNumber });
            e.HasIndex(x => new { x.TenantId, x.StockItemId });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.ToTable(t => t.HasCheckConstraint("CK_PurchaseRequestLines_QuantityPositive", "[Quantity] > 0"));
            e.HasOne(x => x.PurchaseRequest).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.PurchaseRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.StockItem).WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseSupplierQuote>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.PurchaseRequestId });
            e.HasIndex(x => new { x.TenantId, x.SupplierId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PurchaseRequestId, x.Status, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(64);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasOne(x => x.PurchaseRequest).WithMany(x => x.SupplierQuotes).HasForeignKey(x => new { x.TenantId, x.PurchaseRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => new { x.TenantId, x.SupplierId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseSupplierQuoteLine>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.QuoteId, x.RequestLineNumber });
            e.HasIndex(x => new { x.TenantId, x.PurchaseRequestId, x.RequestLineNumber });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_PurchaseSupplierQuoteLines_QuantityPositive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_PurchaseSupplierQuoteLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                t.HasCheckConstraint("CK_PurchaseSupplierQuoteLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
            });
            e.HasOne(x => x.Quote).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.QuoteId, x.PurchaseRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id, x.PurchaseRequestId }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.RequestLine).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseRequestId, x.RequestLineNumber })
                .HasPrincipalKey(x => new { x.TenantId, x.PurchaseRequestId, x.LineNumber }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseOrder>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.SupplierId });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.OrderDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.HasOne(x => x.Tenant).WithMany(x => x.PurchaseOrders).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => new { x.TenantId, x.SupplierId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SourcePurchaseRequest).WithOne(x => x.PurchaseOrder)
                .HasForeignKey<PurchaseOrder>(x => new { x.TenantId, x.SourcePurchaseRequestId })
                .HasPrincipalKey<PurchaseRequest>(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.TenantId, x.SourcePurchaseRequestId }).IsUnique().HasFilter("[SourcePurchaseRequestId] IS NOT NULL");
            e.HasOne(x => x.SourceSupplierQuote).WithOne(x => x.PurchaseOrder)
                .HasForeignKey<PurchaseOrder>(x => new { x.TenantId, x.SourceSupplierQuoteId, x.SourcePurchaseRequestId })
                .HasPrincipalKey<PurchaseSupplierQuote>(x => new { x.TenantId, x.Id, x.PurchaseRequestId }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.TenantId, x.SourceSupplierQuoteId }).IsUnique().HasFilter("[SourceSupplierQuoteId] IS NOT NULL");
        });
        modelBuilder.Entity<PurchaseOrderLine>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.PurchaseOrderId, x.LineNumber });
            e.HasIndex(x => new { x.TenantId, x.StockItemId });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_PurchaseOrderLines_QuantityPositive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_PurchaseOrderLines_DiscountRange", "[DiscountPercent] >= 0 AND [DiscountPercent] <= 100");
                t.HasCheckConstraint("CK_PurchaseOrderLines_VatRange", "[VatPercent] >= 0 AND [VatPercent] <= 100");
            });
            e.HasOne(x => x.PurchaseOrder).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.StockItem).WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseReceipt>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.PurchaseOrderId });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PurchaseOrderId, x.Status, x.ReceiptDate });
            e.Property(x => x.Code).HasMaxLength(40);
            e.HasOne(x => x.Tenant).WithMany(x => x.PurchaseReceipts).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.PurchaseOrder).WithMany(x => x.Receipts).HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseReceiptLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.ReceiptId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ReceiptId, x.OrderLineNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PurchaseOrderId, x.OrderLineNumber });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.ToTable(t => t.HasCheckConstraint("CK_PurchaseReceiptLines_QuantityPositive", "[Quantity] > 0"));
            e.HasOne(x => x.Receipt).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.ReceiptId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.PurchaseOrderId }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.OrderLine).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId, x.OrderLineNumber }).HasPrincipalKey(x => new { x.TenantId, x.PurchaseOrderId, x.LineNumber }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseInvoice>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.SupplierId });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PurchaseReceiptId }).IsUnique().HasFilter("[Status] = 1");
            e.HasIndex(x => new { x.TenantId, x.SupplierId, x.InvoiceDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(64);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_PurchaseInvoices_GrandTotalPositive", "[GrandTotal] > 0"));
            e.HasOne(x => x.Tenant).WithMany(x => x.PurchaseInvoices).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.PurchaseReceipt).WithMany(x => x.Invoices).HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.PurchaseOrderId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PurchaseOrder).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId, x.SupplierId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.SupplierId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => new { x.TenantId, x.SupplierId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseInvoiceLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.PurchaseInvoiceId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.PurchaseInvoiceId });
            e.HasIndex(x => new { x.TenantId, x.PurchaseReceiptId, x.PurchaseReceiptLineId });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_PurchaseInvoiceLines_QuantityPositive", "[Quantity] > 0"));
            e.HasOne(x => x.PurchaseInvoice).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.PurchaseInvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.PurchaseReceiptLine).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptId, x.PurchaseReceiptLineId }).HasPrincipalKey(x => new { x.TenantId, x.ReceiptId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SupplierPayment>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.SupplierId });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.CurrencyCode });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PurchaseInvoiceId, x.Status, x.PaymentDate });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.PaymentMethod).HasMaxLength(40);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.ToTable(t => t.HasCheckConstraint("CK_SupplierPayments_AmountPositive", "[Amount] > 0"));
            e.HasOne(x => x.Tenant).WithMany(x => x.SupplierPayments).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.PurchaseInvoice).WithMany(x => x.Payments).HasForeignKey(x => new { x.TenantId, x.PurchaseInvoiceId, x.SupplierId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.SupplierId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => new { x.TenantId, x.SupplierId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.FinancialAccount).WithMany().HasForeignKey(x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SupplierReturn>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.SupplierId });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.PurchaseInvoiceId });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PurchaseInvoiceId, x.Status, x.ReturnDate });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_SupplierReturns_GrandTotalPositive", "[GrandTotal] > 0"));
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.PurchaseInvoice).WithMany(x => x.Returns).HasForeignKey(x => new { x.TenantId, x.PurchaseInvoiceId, x.SupplierId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.SupplierId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => new { x.TenantId, x.SupplierId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SupplierReturnLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.SupplierReturnId });
            e.HasIndex(x => new { x.TenantId, x.PurchaseInvoiceId, x.PurchaseInvoiceLineId });
            e.Property(x => x.StockCode).HasMaxLength(64);
            e.Property(x => x.StockName).HasMaxLength(200);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.VatPercent).HasPrecision(5, 2);
            e.Property(x => x.LineSubtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_SupplierReturnLines_QuantityPositive", "[Quantity] > 0"));
            e.HasOne(x => x.SupplierReturn).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.SupplierReturnId, x.PurchaseInvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.PurchaseInvoiceId }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.PurchaseInvoiceLine).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseInvoiceId, x.PurchaseInvoiceLineId }).HasPrincipalKey(x => new { x.TenantId, x.PurchaseInvoiceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<FinancialAccount>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.CurrencyCode });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.HasOne(x => x.Tenant).WithMany(x => x.FinancialAccounts).HasForeignKey(x => x.TenantId);
        });
        modelBuilder.Entity<FinancialAccountTransfer>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.ToCurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.DestinationAmount).HasPrecision(18, 2);
            e.Property(x => x.ExchangeRate).HasPrecision(18, 8);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.Property(x => x.Description).HasMaxLength(240);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_FinancialAccountTransfers_AmountPositive", "[Amount] > 0");
                t.HasCheckConstraint("CK_FinancialAccountTransfers_DestinationAmountPositive", "[DestinationAmount] > 0");
                t.HasCheckConstraint("CK_FinancialAccountTransfers_ExchangeRatePositive", "[ExchangeRate] > 0");
                t.HasCheckConstraint("CK_FinancialAccountTransfers_SameCurrencyRate", "[CurrencyCode] <> [ToCurrencyCode] OR [ExchangeRate] = 1");
            });
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            e.HasOne<FinancialAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.FromAccountId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<FinancialAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.ToAccountId, x.ToCurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<BankStatement>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.AccountId, x.CurrencyCode });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.OpeningBalance).HasPrecision(18, 2);
            e.Property(x => x.ClosingBalance).HasPrecision(18, 2);
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Account).WithMany(x => x.BankStatements).HasForeignKey(x => new { x.TenantId, x.AccountId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<BankStatementLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.StatementId, x.LineNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.StatementId, x.ExternalId }).IsUnique().HasFilter("[ExternalId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.FinancialAccountTransactionId }).IsUnique().HasFilter("[FinancialAccountTransactionId] IS NOT NULL");
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.ExternalId).HasMaxLength(100);
            e.Property(x => x.Description).HasMaxLength(240);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.ToTable(t => t.HasCheckConstraint("CK_BankStatementLines_AmountPositive", "[Amount] > 0"));
            e.HasOne(x => x.Statement).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.StatementId, x.FinancialAccountId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.AccountId, x.CurrencyCode }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.FinancialAccountTransaction).WithOne(x => x.BankStatementMatch).HasForeignKey<BankStatementLine>(x => new { x.TenantId, x.FinancialAccountTransactionId, x.FinancialAccountId, x.CurrencyCode }).HasPrincipalKey<FinancialAccountTransaction>(x => new { x.TenantId, x.Id, x.FinancialAccountId, x.CurrencyCode }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<FinancialAccountTransaction>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.FinancialAccountId, x.CurrencyCode });
            e.HasIndex(x => new { x.TenantId, x.FinancialAccountId, x.TransactionDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.ReversalOfId }).IsUnique().HasFilter("[ReversalOfId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.CustomerCollectionId }).IsUnique().HasFilter("[CustomerCollectionId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.SupplierPaymentId }).IsUnique().HasFilter("[SupplierPaymentId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.TransferId, x.FinancialAccountId }).IsUnique().HasFilter("[TransferId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique().HasFilter("[RequestId] IS NOT NULL");
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Description).HasMaxLength(240);
            e.Property(x => x.Reference).HasMaxLength(100);
            e.ToTable(t => t.HasCheckConstraint("CK_FinancialAccountTransactions_AmountPositive", "[Amount] > 0"));
            e.HasOne(x => x.FinancialAccount).WithMany(x => x.Transactions).HasForeignKey(x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ReversalOf).WithOne(x => x.ReversalEntry).HasForeignKey<FinancialAccountTransaction>(x => new { x.TenantId, x.ReversalOfId }).HasPrincipalKey<FinancialAccountTransaction>(x => new { x.TenantId, x.Id }).IsRequired(false);
            e.HasOne(x => x.CustomerCollection).WithMany(x => x.FinancialTransactions).HasForeignKey(x => new { x.TenantId, x.CustomerCollectionId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SupplierPayment).WithMany(x => x.FinancialTransactions).HasForeignKey(x => new { x.TenantId, x.SupplierPaymentId, x.CurrencyCode }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Transfer).WithMany(x => x.Transactions).HasForeignKey(x => new { x.TenantId, x.TransferId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
