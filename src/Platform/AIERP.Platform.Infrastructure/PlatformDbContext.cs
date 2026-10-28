using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public abstract class PlatformDbContextBase<TContext> : DbContext where TContext : DbContext
{
    protected readonly IAuditExecutionContext? auditExecutionContext;

    protected PlatformDbContextBase(DbContextOptions<TContext> options, IAuditExecutionContext? auditExecutionContext = null)
        : base(options) => this.auditExecutionContext = auditExecutionContext;

    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<PlatformUserRole> PlatformUserRoles => Set<PlatformUserRole>();
    public DbSet<PlatformRefreshSession> PlatformRefreshSessions => Set<PlatformRefreshSession>();
    public DbSet<PlatformAdminRefreshSession> PlatformAdminRefreshSessions => Set<PlatformAdminRefreshSession>();
    public DbSet<PlatformModulePublisherKey> PlatformModulePublisherKeys => Set<PlatformModulePublisherKey>();
    public DbSet<PlatformModuleRelease> PlatformModuleReleases => Set<PlatformModuleRelease>();
    public DbSet<TenantModuleActivation> TenantModuleActivations => Set<TenantModuleActivation>();
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<TenantLicense> TenantLicenses => Set<TenantLicense>();
    public DbSet<TenantAIProviderSettings> TenantAIProviderSettings => Set<TenantAIProviderSettings>();
    public DbSet<TenantDatabaseCatalogEntry> TenantDatabaseCatalog => Set<TenantDatabaseCatalogEntry>();
    public DbSet<TenantProvisioningJob> TenantProvisioningJobs => Set<TenantProvisioningJob>();
    public DbSet<DatabaseSeparationComponentState> DatabaseSeparationComponentStates => Set<DatabaseSeparationComponentState>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<PermissionDefinition> PermissionDefinitions => Set<PermissionDefinition>();
    public DbSet<TenantPermissionRule> TenantPermissionRules => Set<TenantPermissionRule>();
    public DbSet<TenantCustomFormDefinition> TenantCustomFormDefinitions => Set<TenantCustomFormDefinition>();
    public DbSet<TenantCustomFormRevision> TenantCustomFormRevisions => Set<TenantCustomFormRevision>();
    public DbSet<TenantCustomFormSubmission> TenantCustomFormSubmissions => Set<TenantCustomFormSubmission>();
    public DbSet<TenantScreenView> TenantScreenViews => Set<TenantScreenView>();
    public DbSet<TenantScreenViewRevision> TenantScreenViewRevisions => Set<TenantScreenViewRevision>();
    public DbSet<TenantWorkflowDefinition> TenantWorkflowDefinitions => Set<TenantWorkflowDefinition>();
    public DbSet<TenantWorkflowInstance> TenantWorkflowInstances => Set<TenantWorkflowInstance>();
    public DbSet<TenantWorkflowAction> TenantWorkflowActions => Set<TenantWorkflowAction>();
    public DbSet<TenantBusinessRuleDefinition> TenantBusinessRuleDefinitions => Set<TenantBusinessRuleDefinition>();
    public DbSet<TenantBusinessRuleEvaluation> TenantBusinessRuleEvaluations => Set<TenantBusinessRuleEvaluation>();
    public DbSet<TenantSavedReport> TenantSavedReports => Set<TenantSavedReport>();
    public DbSet<TenantSavedReportRevision> TenantSavedReportRevisions => Set<TenantSavedReportRevision>();
    public DbSet<TenantDashboardWidget> TenantDashboardWidgets => Set<TenantDashboardWidget>();
    public DbSet<TenantCustomMenuEntry> TenantCustomMenuEntries => Set<TenantCustomMenuEntry>();
    public DbSet<TenantExchangeRate> TenantExchangeRates => Set<TenantExchangeRate>();
    public DbSet<FxRevaluationVoucher> FxRevaluationVouchers => Set<FxRevaluationVoucher>();
    public DbSet<FxRevaluationVoucherLine> FxRevaluationVoucherLines => Set<FxRevaluationVoucherLine>();
    public DbSet<LedgerAccount> LedgerAccounts => Set<LedgerAccount>();
    public DbSet<CreditFacility> CreditFacilities => Set<CreditFacility>();
    public DbSet<CreditFacilitySchedule> CreditFacilitySchedules => Set<CreditFacilitySchedule>();
    public DbSet<CreditFacilityMovement> CreditFacilityMovements => Set<CreditFacilityMovement>();
    public DbSet<LedgerAccountMapping> LedgerAccountMappings => Set<LedgerAccountMapping>();
    public DbSet<TenantBudgetPlan> TenantBudgetPlans => Set<TenantBudgetPlan>();
    public DbSet<TenantBudgetLine> TenantBudgetLines => Set<TenantBudgetLine>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalEntryLine> JournalEntryLines => Set<JournalEntryLine>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<IntegrationOperation> IntegrationOperations => Set<IntegrationOperation>();
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
    public DbSet<StudioKnowledgeDocument> StudioKnowledgeDocuments => Set<StudioKnowledgeDocument>();
    public DbSet<StudioKnowledgeRefreshConsent> StudioKnowledgeRefreshConsents => Set<StudioKnowledgeRefreshConsent>();
    public DbSet<StudioModuleSourceMapping> StudioModuleSourceMappings => Set<StudioModuleSourceMapping>();
    public DbSet<StudioCodeReviewThread> StudioCodeReviewThreads => Set<StudioCodeReviewThread>();
    public DbSet<StudioCodeReviewComment> StudioCodeReviewComments => Set<StudioCodeReviewComment>();
    public DbSet<CustomerAccount> CustomerAccounts => Set<CustomerAccount>();
    public DbSet<CrmOpportunity> CrmOpportunities => Set<CrmOpportunity>();
    public DbSet<CustomerCustomFieldDefinition> CustomerCustomFieldDefinitions => Set<CustomerCustomFieldDefinition>();
    public DbSet<CustomerCustomFieldDefinitionRevision> CustomerCustomFieldDefinitionRevisions => Set<CustomerCustomFieldDefinitionRevision>();
    public DbSet<CustomerCustomFieldValue> CustomerCustomFieldValues => Set<CustomerCustomFieldValue>();
    public DbSet<CustomerCustomFieldValueRevision> CustomerCustomFieldValueRevisions => Set<CustomerCustomFieldValueRevision>();
    public DbSet<CustomerGroup> CustomerGroups => Set<CustomerGroup>();
    public DbSet<CustomerAddress> CustomerAddresses => Set<CustomerAddress>();
    public DbSet<CustomerLocationProvince> CustomerLocationProvinces => Set<CustomerLocationProvince>();
    public DbSet<CustomerLocationDistrict> CustomerLocationDistricts => Set<CustomerLocationDistrict>();
    public DbSet<CustomerLedgerEntry> CustomerLedgerEntries => Set<CustomerLedgerEntry>();
    public DbSet<StockItem> StockItems => Set<StockItem>();
    public DbSet<StockItemCategory> StockItemCategories => Set<StockItemCategory>();
    public DbSet<BillOfMaterial> BillOfMaterials => Set<BillOfMaterial>();
    public DbSet<BillOfMaterialLine> BillOfMaterialLines => Set<BillOfMaterialLine>();
    public DbSet<ManufacturingWorkCenter> ManufacturingWorkCenters => Set<ManufacturingWorkCenter>();
    public DbSet<ManufacturingWorkCenterCapacityOverride> ManufacturingWorkCenterCapacityOverrides => Set<ManufacturingWorkCenterCapacityOverride>();
    public DbSet<ManufacturingSetupTransitionRule> ManufacturingSetupTransitionRules => Set<ManufacturingSetupTransitionRule>();
    public DbSet<BillOfMaterialOperation> BillOfMaterialOperations => Set<BillOfMaterialOperation>();
    public DbSet<BillOfMaterialOperationWorkCenterOption> BillOfMaterialOperationWorkCenterOptions => Set<BillOfMaterialOperationWorkCenterOption>();
    public DbSet<ManufacturingOrder> ManufacturingOrders => Set<ManufacturingOrder>();
    public DbSet<MrpPlanSnapshot> MrpPlanSnapshots => Set<MrpPlanSnapshot>();
    public DbSet<ManufacturingOrderLine> ManufacturingOrderLines => Set<ManufacturingOrderLine>();
    public DbSet<ManufacturingOrderOperation> ManufacturingOrderOperations => Set<ManufacturingOrderOperation>();
    public DbSet<ManufacturingOrderOperationWorkCenterOption> ManufacturingOrderOperationWorkCenterOptions => Set<ManufacturingOrderOperationWorkCenterOption>();
    public DbSet<ManufacturingCapacityAllocation> ManufacturingCapacityAllocations => Set<ManufacturingCapacityAllocation>();
    public DbSet<StockItemUnitConversion> StockItemUnitConversions => Set<StockItemUnitConversion>();
    public DbSet<StockItemCustomFieldDefinition> StockItemCustomFieldDefinitions => Set<StockItemCustomFieldDefinition>();
    public DbSet<StockItemCustomFieldDefinitionRevision> StockItemCustomFieldDefinitionRevisions => Set<StockItemCustomFieldDefinitionRevision>();
    public DbSet<StockItemCustomFieldValue> StockItemCustomFieldValues => Set<StockItemCustomFieldValue>();
    public DbSet<StockItemCustomFieldValueRevision> StockItemCustomFieldValueRevisions => Set<StockItemCustomFieldValueRevision>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<WarehouseLocation> WarehouseLocations => Set<WarehouseLocation>();
    public DbSet<WarehouseCustomFieldDefinition> WarehouseCustomFieldDefinitions => Set<WarehouseCustomFieldDefinition>();
    public DbSet<WarehouseCustomFieldDefinitionRevision> WarehouseCustomFieldDefinitionRevisions => Set<WarehouseCustomFieldDefinitionRevision>();
    public DbSet<WarehouseCustomFieldValue> WarehouseCustomFieldValues => Set<WarehouseCustomFieldValue>();
    public DbSet<WarehouseCustomFieldValueRevision> WarehouseCustomFieldValueRevisions => Set<WarehouseCustomFieldValueRevision>();
    public DbSet<InventoryTransfer> InventoryTransfers => Set<InventoryTransfer>();
    public DbSet<InventoryTransaction> InventoryTransactions => Set<InventoryTransaction>();
    public DbSet<InventoryTransactionTrace> InventoryTransactionTraces => Set<InventoryTransactionTrace>();
    public DbSet<InventoryCostAdjustment> InventoryCostAdjustments => Set<InventoryCostAdjustment>();
    public DbSet<InventoryCostAdjustmentLine> InventoryCostAdjustmentLines => Set<InventoryCostAdjustmentLine>();
    public DbSet<SalesQuote> SalesQuotes => Set<SalesQuote>();
    public DbSet<SalesPromotionCampaign> SalesPromotionCampaigns => Set<SalesPromotionCampaign>();
    public DbSet<SalesPromotionApplication> SalesPromotionApplications => Set<SalesPromotionApplication>();
    public DbSet<SalesQuoteLine> SalesQuoteLines => Set<SalesQuoteLine>();
    public DbSet<SalesQuoteCustomFieldDefinition> SalesQuoteCustomFieldDefinitions => Set<SalesQuoteCustomFieldDefinition>();
    public DbSet<SalesQuoteCustomFieldDefinitionRevision> SalesQuoteCustomFieldDefinitionRevisions => Set<SalesQuoteCustomFieldDefinitionRevision>();
    public DbSet<SalesQuoteCustomFieldValue> SalesQuoteCustomFieldValues => Set<SalesQuoteCustomFieldValue>();
    public DbSet<SalesQuoteCustomFieldValueRevision> SalesQuoteCustomFieldValueRevisions => Set<SalesQuoteCustomFieldValueRevision>();
    public DbSet<SalesOrder> SalesOrders => Set<SalesOrder>();
    public DbSet<SalesOrderCustomFieldDefinition> SalesOrderCustomFieldDefinitions => Set<SalesOrderCustomFieldDefinition>();
    public DbSet<SalesOrderCustomFieldDefinitionRevision> SalesOrderCustomFieldDefinitionRevisions => Set<SalesOrderCustomFieldDefinitionRevision>();
    public DbSet<SalesOrderCustomFieldValue> SalesOrderCustomFieldValues => Set<SalesOrderCustomFieldValue>();
    public DbSet<SalesOrderCustomFieldValueRevision> SalesOrderCustomFieldValueRevisions => Set<SalesOrderCustomFieldValueRevision>();
    public DbSet<SalesOrderLine> SalesOrderLines => Set<SalesOrderLine>();
    public DbSet<SalesOrderReservation> SalesOrderReservations => Set<SalesOrderReservation>();
    public DbSet<SalesDelivery> SalesDeliveries => Set<SalesDelivery>();
    public DbSet<SalesDeliveryLine> SalesDeliveryLines => Set<SalesDeliveryLine>();
    public DbSet<SalesInvoice> SalesInvoices => Set<SalesInvoice>();
    public DbSet<SalesInvoiceCustomFieldDefinition> SalesInvoiceCustomFieldDefinitions => Set<SalesInvoiceCustomFieldDefinition>();
    public DbSet<SalesInvoiceCustomFieldDefinitionRevision> SalesInvoiceCustomFieldDefinitionRevisions => Set<SalesInvoiceCustomFieldDefinitionRevision>();
    public DbSet<SalesInvoiceCustomFieldValue> SalesInvoiceCustomFieldValues => Set<SalesInvoiceCustomFieldValue>();
    public DbSet<SalesInvoiceCustomFieldValueRevision> SalesInvoiceCustomFieldValueRevisions => Set<SalesInvoiceCustomFieldValueRevision>();
    public DbSet<SalesInvoiceLine> SalesInvoiceLines => Set<SalesInvoiceLine>();
    public DbSet<CustomerCollection> CustomerCollections => Set<CustomerCollection>();
    public DbSet<CustomerCollectionAllocation> CustomerCollectionAllocations => Set<CustomerCollectionAllocation>();
    public DbSet<SalesReturn> SalesReturns => Set<SalesReturn>();
    public DbSet<SalesReturnLine> SalesReturnLines => Set<SalesReturnLine>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderCustomFieldDefinition> PurchaseOrderCustomFieldDefinitions => Set<PurchaseOrderCustomFieldDefinition>();
    public DbSet<PurchaseOrderCustomFieldDefinitionRevision> PurchaseOrderCustomFieldDefinitionRevisions => Set<PurchaseOrderCustomFieldDefinitionRevision>();
    public DbSet<PurchaseOrderCustomFieldValue> PurchaseOrderCustomFieldValues => Set<PurchaseOrderCustomFieldValue>();
    public DbSet<PurchaseOrderCustomFieldValueRevision> PurchaseOrderCustomFieldValueRevisions => Set<PurchaseOrderCustomFieldValueRevision>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<PurchaseRequest> PurchaseRequests => Set<PurchaseRequest>();
    public DbSet<PurchaseRequestLine> PurchaseRequestLines => Set<PurchaseRequestLine>();
    public DbSet<PurchaseRequestCustomFieldDefinition> PurchaseRequestCustomFieldDefinitions => Set<PurchaseRequestCustomFieldDefinition>();
    public DbSet<PurchaseRequestCustomFieldDefinitionRevision> PurchaseRequestCustomFieldDefinitionRevisions => Set<PurchaseRequestCustomFieldDefinitionRevision>();
    public DbSet<PurchaseRequestCustomFieldValue> PurchaseRequestCustomFieldValues => Set<PurchaseRequestCustomFieldValue>();
    public DbSet<PurchaseRequestCustomFieldValueRevision> PurchaseRequestCustomFieldValueRevisions => Set<PurchaseRequestCustomFieldValueRevision>();
    public DbSet<PurchaseSupplierQuote> PurchaseSupplierQuotes => Set<PurchaseSupplierQuote>();
    public DbSet<PurchaseSupplierQuoteLine> PurchaseSupplierQuoteLines => Set<PurchaseSupplierQuoteLine>();
    public DbSet<PurchaseSupplierQuoteCustomFieldDefinition> PurchaseSupplierQuoteCustomFieldDefinitions => Set<PurchaseSupplierQuoteCustomFieldDefinition>();
    public DbSet<PurchaseSupplierQuoteCustomFieldDefinitionRevision> PurchaseSupplierQuoteCustomFieldDefinitionRevisions => Set<PurchaseSupplierQuoteCustomFieldDefinitionRevision>();
    public DbSet<PurchaseSupplierQuoteCustomFieldValue> PurchaseSupplierQuoteCustomFieldValues => Set<PurchaseSupplierQuoteCustomFieldValue>();
    public DbSet<PurchaseSupplierQuoteCustomFieldValueRevision> PurchaseSupplierQuoteCustomFieldValueRevisions => Set<PurchaseSupplierQuoteCustomFieldValueRevision>();
    public DbSet<PurchaseReceipt> PurchaseReceipts => Set<PurchaseReceipt>();
    public DbSet<PurchaseReceiptLine> PurchaseReceiptLines => Set<PurchaseReceiptLine>();
    public DbSet<PurchaseDeliveryNote> PurchaseDeliveryNotes => Set<PurchaseDeliveryNote>();
    public DbSet<PurchaseDeliveryNoteLine> PurchaseDeliveryNoteLines => Set<PurchaseDeliveryNoteLine>();
    public DbSet<PurchaseReceiptCustomFieldDefinition> PurchaseReceiptCustomFieldDefinitions => Set<PurchaseReceiptCustomFieldDefinition>();
    public DbSet<PurchaseReceiptCustomFieldDefinitionRevision> PurchaseReceiptCustomFieldDefinitionRevisions => Set<PurchaseReceiptCustomFieldDefinitionRevision>();
    public DbSet<PurchaseReceiptCustomFieldValue> PurchaseReceiptCustomFieldValues => Set<PurchaseReceiptCustomFieldValue>();
    public DbSet<PurchaseReceiptCustomFieldValueRevision> PurchaseReceiptCustomFieldValueRevisions => Set<PurchaseReceiptCustomFieldValueRevision>();
    public DbSet<PurchaseInvoice> PurchaseInvoices => Set<PurchaseInvoice>();
    public DbSet<PurchaseInvoiceLine> PurchaseInvoiceLines => Set<PurchaseInvoiceLine>();
    public DbSet<SupplierPayment> SupplierPayments => Set<SupplierPayment>();
    public DbSet<SupplierReturn> SupplierReturns => Set<SupplierReturn>();
    public DbSet<SupplierReturnLine> SupplierReturnLines => Set<SupplierReturnLine>();
    public DbSet<FinancialAccount> FinancialAccounts => Set<FinancialAccount>();
    public DbSet<EmployeeRecord> EmployeeRecords => Set<EmployeeRecord>();
    public DbSet<EmployeeLeaveRequest> EmployeeLeaveRequests => Set<EmployeeLeaveRequest>();
    public DbSet<EmployeeAttendanceRecord> EmployeeAttendanceRecords => Set<EmployeeAttendanceRecord>();
    public DbSet<PayrollRuleSet> PayrollRuleSets => Set<PayrollRuleSet>();
    public DbSet<PayrollCompensationRecord> PayrollCompensationRecords => Set<PayrollCompensationRecord>();
    public DbSet<PayrollRunSnapshot> PayrollRunSnapshots => Set<PayrollRunSnapshot>();
    public DbSet<PayrollRunCalculation> PayrollRunCalculations => Set<PayrollRunCalculation>();
    public DbSet<FixedAsset> FixedAssets => Set<FixedAsset>();
    public DbSet<FixedAssetDepreciationPosting> FixedAssetDepreciationPostings => Set<FixedAssetDepreciationPosting>();
    public DbSet<FixedAssetDisposal> FixedAssetDisposals => Set<FixedAssetDisposal>();
    public DbSet<FixedAssetAssignment> FixedAssetAssignments => Set<FixedAssetAssignment>();
    public DbSet<TenantOperationalSettings> TenantOperationalSettings => Set<TenantOperationalSettings>();
    public DbSet<FinancialAccountTransaction> FinancialAccountTransactions => Set<FinancialAccountTransaction>();
    public DbSet<FinancialAccountTransfer> FinancialAccountTransfers => Set<FinancialAccountTransfer>();
    public DbSet<BankStatement> BankStatements => Set<BankStatement>();
    public DbSet<BankStatementLine> BankStatementLines => Set<BankStatementLine>();
    public DbSet<PaymentInstrument> PaymentInstruments => Set<PaymentInstrument>();
    public DbSet<PaymentInstrumentEvent> PaymentInstrumentEvents => Set<PaymentInstrumentEvent>();

    public override int SaveChanges() => SaveChanges(true);

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnsurePayrollRunSnapshotsImmutable();
        AddFallbackMutationAuditEvents();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        SaveChangesAsync(true, cancellationToken);

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        EnsurePayrollRunSnapshotsImmutable();
        AddFallbackMutationAuditEvents();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void EnsurePayrollRunSnapshotsImmutable()
    {
        if (ChangeTracker.Entries<PayrollRunSnapshot>().Any(x => x.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Payroll run snapshots are immutable; create a new draft or a separately approved correction record.");
        foreach (var entry in ChangeTracker.Entries<PayrollRunCalculation>().Where(x => x.State is EntityState.Modified or EntityState.Deleted))
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Payroll calculation results are immutable and cannot be deleted.");
            var allowed = new HashSet<string>(StringComparer.Ordinal) { nameof(PayrollRunCalculation.Status), nameof(PayrollRunCalculation.ApprovedByUserId), nameof(PayrollRunCalculation.RejectedByUserId), nameof(PayrollRunCalculation.FinalizedByUserId), nameof(PayrollRunCalculation.ApprovedAt), nameof(PayrollRunCalculation.RejectedAt), nameof(PayrollRunCalculation.FinalizedAt), nameof(PayrollRunCalculation.RowVersion) };
            if (entry.Properties.Any(p => p.IsModified && !allowed.Contains(p.Metadata.Name)))
                throw new InvalidOperationException("Payroll calculation result content is immutable; only its approval state may change.");
        }
    }

    private void AddFallbackMutationAuditEvents()
    {
        foreach (var auditEvent in AuditEvents.Local.Where(x => Entry(x).State == EntityState.Added))
        {
            auditEvent.Action = AuditResourceSanitizer.Sanitize(auditEvent.Action, 120);
            auditEvent.Resource = AuditResourceSanitizer.Sanitize(auditEvent.Resource);
        }
        var changes = ChangeTracker.Entries()
            .Where(x => x.Entity is not AuditEvent && x.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .Select(entry => new { Entry = entry, TenantProperty = entry.Metadata.FindProperty("TenantId") })
            .Where(x => x.TenantProperty is not null)
            .Select(x => new
            {
                x.Entry,
                TenantId = x.Entry.Property("TenantId").CurrentValue as Guid? ??
                    (x.Entry.Property("TenantId").CurrentValue is Guid id ? id : (Guid?)null)
            })
            .Where(x => x.TenantId is not null)
            .ToList();
        if (changes.Count == 0) return;

        foreach (var group in changes.GroupBy(x => x.TenantId!.Value))
        {
            if (AuditEvents.Local.Any(x => x.TenantId == group.Key)) continue;
            var entityTypes = group.Select(x => x.Entry.Metadata.ClrType.Name).Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal).ToArray();
            var resource = $"entities={string.Join(',', entityTypes)};count={group.Count()}";
            AuditEvents.Add(new AuditEvent
            {
                TenantId = group.Key,
                UserId = auditExecutionContext?.UserId,
                Action = AuditResourceSanitizer.Sanitize($"{auditExecutionContext?.Source ?? "platform"}.mutation", 120),
                Resource = AuditResourceSanitizer.Sanitize(resource)
            });
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Company operation policies live with the isolated tenant database, not the platform catalog.
        modelBuilder.Ignore<TenantOperationalSettings>();
        modelBuilder.Ignore<TenantBudgetPlan>();
        modelBuilder.Ignore<TenantBudgetLine>();
        modelBuilder.Ignore<CustomerLocationProvince>();
        modelBuilder.Ignore<CustomerLocationDistrict>();
        modelBuilder.Entity<AppUser>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.DisplayName).HasMaxLength(160);
            e.Property(x => x.PasswordHash).HasMaxLength(512);
        });
        modelBuilder.Entity<PlatformUserRole>(e =>
        {
            e.HasKey(x => new { x.UserId, x.Role });
            e.Property(x => x.Role).HasMaxLength(64).IsUnicode(false);
            e.HasIndex(x => x.Role);
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<PlatformRefreshSession>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.UserId, x.TenantId, x.ExpiresAt });
            e.Property(x => x.TokenHash).HasMaxLength(64).IsUnicode(false).IsFixedLength();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<PlatformAdminRefreshSession>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.UserId, x.ExpiresAt });
            e.Property(x => x.TokenHash).HasMaxLength(64).IsUnicode(false).IsFixedLength();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<PlatformModulePublisherKey>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Publisher, x.KeyId }).IsUnique();
            e.Property(x => x.Publisher).HasMaxLength(120);
            e.Property(x => x.KeyId).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.PublicKeyPem).HasMaxLength(4096);
        });
        modelBuilder.Entity<PlatformModuleRelease>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.ModuleCode, x.Version }).IsUnique();
            e.HasIndex(x => new { x.Status, x.ModuleCode });
            e.Property(x => x.ModuleCode).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.Version).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.Publisher).HasMaxLength(120);
            e.Property(x => x.ManifestJson).HasMaxLength(65536);
            e.Property(x => x.ArtifactSha256).HasMaxLength(64).IsUnicode(false).IsFixedLength();
            e.Property(x => x.SignatureBase64).HasMaxLength(2048).IsUnicode(false);
            e.Property(x => x.KeyId).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.StorageKey).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.RuntimeKind).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.RevocationReason).HasMaxLength(500);
        });
        modelBuilder.Entity<TenantModuleActivation>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.ModuleCode });
            e.Property(x => x.ModuleCode).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.Version).HasMaxLength(40).IsUnicode(false);
            e.HasIndex(x => new { x.TenantId, x.Version });
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Tenant>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Slug).HasMaxLength(100);
            e.Property(x => x.BaseCurrencyCode).HasMaxLength(3).IsFixedLength().HasDefaultValue("TRY");
            e.Property(x => x.AuditRetentionDays).HasDefaultValue(365);
            e.ToTable(t => t.HasCheckConstraint("CK_Tenants_AuditRetentionDays", "[AuditRetentionDays] >= 30 AND [AuditRetentionDays] <= 3650"));
        });
        modelBuilder.Entity<TenantLicense>(e =>
        {
            e.HasKey(x => x.TenantId);
            e.HasIndex(x => x.LicenseId).IsUnique();
            e.Property(x => x.Tier).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.GrantSha256).HasMaxLength(64).IsUnicode(false).IsFixedLength();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_TenantLicenses_Tier", "[Tier] IN ('Small','Medium','Large')"));
            e.HasOne<Tenant>().WithOne().HasForeignKey<TenantLicense>(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<TenantAIProviderSettings>(e =>
        {
            e.HasKey(x => x.TenantId);
            e.Property(x => x.Provider).HasMaxLength(20);
            e.Property(x => x.OpenAIKeyCipherText).HasMaxLength(2048);
            e.Property(x => x.OpenAIModel).HasMaxLength(200).HasDefaultValue("gpt-6-astra");
            e.Property(x => x.NvidiaKeyCipherText).HasMaxLength(2048);
            e.Property(x => x.NvidiaModel).HasMaxLength(200);
            e.HasOne<Tenant>().WithOne().HasForeignKey<TenantAIProviderSettings>(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<TenantDatabaseCatalogEntry>(e =>
        {
            e.HasKey(x => x.TenantId);
            e.HasIndex(x => x.DatabaseName).IsUnique();
            e.Property(x => x.DatabaseName).HasMaxLength(128);
            e.Property(x => x.State).HasConversion<int>();
            e.Property(x => x.LastError).HasMaxLength(2000);
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<DatabaseSeparationComponentState>(e =>
        {
            e.HasKey(x => x.Component);
            e.Property(x => x.Component).HasMaxLength(64);
            e.Property(x => x.DatabaseName).HasMaxLength(128);
            e.Property(x => x.State).HasConversion<int>();
            e.Property(x => x.LastError).HasMaxLength(2000);
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
        modelBuilder.Entity<FxRevaluationVoucher>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.AsOfDate }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.BaseCurrencyCode).HasMaxLength(3).IsFixedLength();
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<FxRevaluationVoucherLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.VoucherId, x.InvoiceId }).IsUnique();
            e.Property(x => x.InvoiceCode).HasMaxLength(64);
            e.Property(x => x.CounterpartyName).HasMaxLength(200);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.OutstandingAmount).HasPrecision(18, 2);
            e.Property(x => x.InvoiceDateRate).HasPrecision(18, 8);
            e.Property(x => x.ClosingRate).HasPrecision(18, 8);
            e.Property(x => x.PreviousAdjustmentBase).HasPrecision(18, 2);
            e.Property(x => x.TargetAdjustmentBase).HasPrecision(18, 2);
            e.Property(x => x.AdjustmentBase).HasPrecision(18, 2);
            e.Property(x => x.DebitAccount).HasMaxLength(120);
            e.Property(x => x.CreditAccount).HasMaxLength(120);
            e.Property(x => x.DebitBaseAmount).HasPrecision(18, 2);
            e.Property(x => x.CreditBaseAmount).HasPrecision(18, 2);
            e.HasOne(x => x.Voucher).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.VoucherId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_FxRevaluationVoucherLines_AmountsNonNegative", "[OutstandingAmount] >= 0 AND [DebitBaseAmount] >= 0 AND [CreditBaseAmount] >= 0");
                t.HasCheckConstraint("CK_FxRevaluationVoucherLines_Balanced", "[DebitBaseAmount] = [CreditBaseAmount]");
            });
        });
        modelBuilder.Entity<LedgerAccount>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(32);
            e.Property(x => x.Name).HasMaxLength(160);
            e.Property(x => x.StatementSection).HasConversion<int>().HasDefaultValue(LedgerAccountStatementSection.Unclassified);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<LedgerAccountMapping>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.MappingKey }).IsUnique();
            e.Property(x => x.MappingKey).HasMaxLength(64).IsUnicode(false);
            e.HasOne<LedgerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.AccountId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<JournalEntry>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.SourceType, x.SourceId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.EntryDate, x.CreatedAt });
            e.Property(x => x.Code).HasMaxLength(48);
            e.Property(x => x.Description).HasMaxLength(240);
            e.Property(x => x.SourceType).HasMaxLength(32).IsUnicode(false);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<JournalEntryLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.JournalEntryId, x.LineNumber }).IsUnique();
            e.Property(x => x.Description).HasMaxLength(240);
            e.Property(x => x.Debit).HasPrecision(18, 2);
            e.Property(x => x.Credit).HasPrecision(18, 2);
            e.HasOne<JournalEntry>().WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.JournalEntryId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<LedgerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.AccountId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_JournalEntryLines_OneSidedNonNegative", "[Debit] >= 0 AND [Credit] >= 0 AND (([Debit] > 0 AND [Credit] = 0) OR ([Credit] > 0 AND [Debit] = 0))"));
        });
        modelBuilder.Entity<TenantMembership>(e =>
        {
            e.HasKey(x => new { x.UserId, x.TenantId });
            e.Property(x => x.Role).HasMaxLength(64);
            e.HasOne(x => x.User).WithMany(x => x.Memberships).HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Tenant).WithMany(x => x.Memberships).HasForeignKey(x => x.TenantId);
        });
        modelBuilder.Entity<PermissionDefinition>(e =>
        {
            e.HasKey(x => x.Code);
            e.Property(x => x.Code).HasMaxLength(120).IsUnicode(false);
            e.Property(x => x.ResourceType).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.Action).HasMaxLength(32).IsUnicode(false);
            e.Property(x => x.Description).HasMaxLength(240);
            e.HasData(PlatformPermissionCatalog.Definitions.Select(x => new PermissionDefinition
            {
                Code = x.Code,
                ResourceType = x.ResourceType,
                Action = x.Action,
                Description = x.Description
            }));
        });
        modelBuilder.Entity<TenantPermissionRule>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.PermissionCode, x.IsActive });
            e.HasIndex(x => new { x.TenantId, x.SubjectRole, x.PermissionCode, x.IsActive });
            e.HasIndex(x => new { x.TenantId, x.SubjectUserId, x.PermissionCode, x.IsActive });
            e.Property(x => x.SubjectRole).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.PermissionCode).HasMaxLength(120).IsUnicode(false);
            e.Property(x => x.ResourceType).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.AttributeName).HasMaxLength(120).IsUnicode(false);
            e.Property(x => x.AttributeValue).HasMaxLength(500);
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Permission).WithMany().HasForeignKey(x => x.PermissionCode)
                .HasPrincipalKey(x => x.Code).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.SubjectUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.CreatedByUserId })
                .HasPrincipalKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_TenantPermissionRules_Subject", "([SubjectType] = 1 AND [SubjectRole] IS NOT NULL AND [SubjectUserId] IS NULL) OR ([SubjectType] = 2 AND [SubjectRole] IS NULL AND [SubjectUserId] IS NOT NULL)");
                t.HasCheckConstraint("CK_TenantPermissionRules_Attribute", "([AttributeName] IS NULL AND [AttributeOperator] IS NULL AND [AttributeValue] IS NULL) OR ([AttributeName] IS NOT NULL AND [AttributeOperator] IS NOT NULL AND [AttributeValue] IS NOT NULL)");
            });
        });
        modelBuilder.Entity<AuditEvent>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.OccurredAt });
            e.Property(x => x.Action).HasMaxLength(120);
            e.Property(x => x.Resource).HasMaxLength(240);
        });
        modelBuilder.Entity<IntegrationOperation>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.IntegrationCode, x.IdempotencyKeyHash }).IsUnique();
            e.HasIndex(x => new { x.Status, x.NextAttemptAt, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.RequestedByUserId, x.CreatedAt });
            e.Property(x => x.IntegrationCode).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.IdempotencyKeyHash).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.PayloadSha256).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.ProviderIdempotencyKey).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.EncryptedPayload).HasColumnType("nvarchar(max)");
            e.Property(x => x.EncryptedResult).HasColumnType("nvarchar(max)");
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false);
            e.Property(x => x.ErrorCode).HasMaxLength(48).IsUnicode(false);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantProvisioningJob>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TenantId).IsUnique();
            e.HasIndex(x => x.IdempotencyKeyHash).IsUnique();
            e.HasIndex(x => new { x.Status, x.NextAttemptAt, x.CreatedAt });
            e.Property(x => x.IdempotencyKeyHash).HasMaxLength(64).IsUnicode(false).IsFixedLength();
            e.Property(x => x.PayloadSha256).HasMaxLength(64).IsUnicode(false).IsFixedLength();
            e.Property(x => x.Status).HasConversion<int>();
            e.Property(x => x.LeaseOwner).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.ErrorCode).HasMaxLength(80).IsUnicode(false);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
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
            e.Property(x => x.GitHubPullRequestUrl).HasMaxLength(2048);
            e.Property(x => x.GitHubRepository).HasMaxLength(256);
            e.Property(x => x.GitHubBaseBranch).HasMaxLength(256);
            e.Property(x => x.GitHubPullRequestState).HasMaxLength(32);
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
        modelBuilder.Entity<StudioKnowledgeDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.WorkspaceRequestId, x.Path, x.IndexedAt });
            e.HasIndex(x => new { x.TenantId, x.WorkspaceRequestId, x.Path, x.ContentSha256 }).IsUnique();
            e.Property(x => x.Path).HasMaxLength(500);
            e.Property(x => x.ContentSha256).HasMaxLength(64).IsUnicode(false).IsFixedLength();
            e.Property(x => x.CommitSha).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.Content).HasColumnType("nvarchar(max)");
            e.Property(x => x.EmbeddingModel).HasMaxLength(100);
            e.Property(x => x.EmbeddingJson).HasColumnType("nvarchar(max)");
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<StudioKnowledgeRefreshConsent>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.WorkspaceRequestId }).IsUnique();
            e.HasIndex(x => x.LastRefreshedAt);
            e.Property(x => x.SelectedPathsJson).HasMaxLength(12000);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<StudioModuleSourceMapping>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ModuleCode }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ProjectId });
            e.Property(x => x.ModuleCode).HasMaxLength(60).IsUnicode(false);
            e.Property(x => x.Ref).HasMaxLength(256);
            e.Property(x => x.PathAllowlistJson).HasMaxLength(12000);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<StudioCodeReviewThread>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.WorkspaceRequestId, x.Path, x.LineNumber, x.Status });
            e.Property(x => x.Path).HasMaxLength(500);
            e.Property(x => x.HeadCommitSha).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<DevelopmentProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DevelopmentWorkspaceRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceRequestId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<StudioCodeReviewComment>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.ThreadId, x.CreatedAt });
            e.Property(x => x.Body).HasMaxLength(4000);
            e.Property(x => x.GitHubAuthorLogin).HasMaxLength(39);
            e.Property(x => x.GitHubPullRequestNumber);
            e.Property(x => x.GitHubRepository).HasMaxLength(256);
            e.HasIndex(x => x.GitHubReviewCommentId).IsUnique().HasFilter("[GitHubReviewCommentId] IS NOT NULL");
            e.HasOne<StudioCodeReviewThread>().WithMany().HasForeignKey(x => new { x.TenantId, x.ThreadId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<CustomerAccount>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Name });
            e.HasIndex(x => new { x.TenantId, x.ParentCompanyId });
            e.Property(x => x.Code).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.TaxNumber).HasMaxLength(32);
            e.Property(x => x.IdentityNumber).HasMaxLength(11).IsUnicode(false);
            e.Property(x => x.TaxOffice).HasMaxLength(120);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.RiskLimit).HasPrecision(18, 2);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne(x => x.Tenant).WithMany(x => x.Customers).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.Group).WithMany(x => x.Customers).HasForeignKey(x => new { x.TenantId, x.GroupId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false);
            e.HasOne(x => x.ParentCompany).WithMany(x => x.Subsidiaries).HasForeignKey(x => new { x.TenantId, x.ParentCompanyId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<EmployeeRecord>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.PersonnelCode }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.UserId }).IsUnique().HasFilter("[UserId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.Status, x.FullName });
            e.Property(x => x.PersonnelCode).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.FullName).HasMaxLength(160);
            e.Property(x => x.Department).HasMaxLength(120);
            e.Property(x => x.JobTitle).HasMaxLength(120);
            e.Property(x => x.WorkEmail).HasMaxLength(254);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_EmployeeRecords_EmploymentDates", "[TerminationDate] IS NULL OR [TerminationDate] >= [HireDate]"));
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<EmployeeLeaveRequest>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.StartDate, x.EndDate });
            e.Property(x => x.LeaveType).HasMaxLength(32).IsUnicode(false);
            e.Property(x => x.RequestedDays).HasPrecision(8, 2);
            e.Property(x => x.Note).HasMaxLength(1000);
            e.Property(x => x.ReviewNote).HasMaxLength(1000);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_EmployeeLeaveRequests_DatesAndDays", "[EndDate] >= [StartDate] AND [RequestedDays] > 0"));
            e.HasOne<EmployeeRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.EmployeeId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<EmployeeAttendanceRecord>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.WorkDate }).IsUnique();
            e.Property(x => x.Note).HasMaxLength(1000);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_EmployeeAttendanceRecords_Minutes", "[WorkedMinutes] BETWEEN 0 AND 1440 AND [OvertimeMinutes] BETWEEN 0 AND 1440"));
            e.HasOne<EmployeeRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.EmployeeId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PayrollEmployeeWorkplaceAssignment>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom }).IsUnique().HasFilter("[Status] = 'Approved'");
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom, x.Status });
            e.Property(x => x.WorkplaceCode).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_PayrollEmployeeWorkplaceAssignments_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
            });
            e.HasOne<EmployeeRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.EmployeeId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PayrollWorkplaceCalendar>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WorkplaceCode, x.EffectiveFrom, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.WorkplaceCode, x.EffectiveFrom }).IsUnique().HasFilter("[Status] = 'Approved'");
            e.HasIndex(x => new { x.TenantId, x.WorkplaceCode, x.EffectiveFrom, x.Status });
            e.Property(x => x.WorkplaceCode).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.Property(x => x.WeeklyMinutesJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.DateOverridesJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.PolicyReference).HasMaxLength(200).IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_PayrollWorkplaceCalendars_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
            });
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PayrollEmployeeWorkCalendarOverride>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom }).IsUnique().HasFilter("[Status] = 'Approved'");
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom, x.Status });
            e.Property(x => x.WeeklyMinutesJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.DateOverridesJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.PolicyReference).HasMaxLength(200).IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_PayrollEmployeeWorkCalendarOverrides_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
            });
            e.HasOne<EmployeeRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.EmployeeId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PayrollRuleSet>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.JurisdictionCode, x.EffectiveFrom, x.Version }).IsUnique();
            e.Property(x => x.JurisdictionCode).HasMaxLength(8).IsUnicode(false);
            e.Property(x => x.TaxYear).HasMaxLength(4).IsUnicode(false);
            e.Property(x => x.RulesJson).HasColumnType("nvarchar(max)");
            e.Property(x => x.OfficialSourceUrl).HasMaxLength(1000);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_PayrollRuleSets_EffectiveDates", "[EffectiveTo] IS NULL OR [EffectiveTo] >= [EffectiveFrom]"));
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PayrollCompensationRecord>(e =>
        {
            e.ToTable("PayrollCompensationRecords", t =>
            {
                t.HasCheckConstraint("CK_PayrollCompensationRecords_TargetKind", "[TargetKind] IN ('Gross','Net')");
                t.HasCheckConstraint("CK_PayrollCompensationRecords_Amount", "[Amount] > 0");
                t.HasCheckConstraint("CK_PayrollCompensationRecords_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom }).IsUnique().HasFilter("[Status] = 'Approved'");
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.EffectiveFrom, x.Status });
            e.Property(x => x.TargetKind).HasMaxLength(8).IsUnicode(false).IsRequired();
            e.Property(x => x.Amount).HasPrecision(18, 4);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsUnicode(false).IsFixedLength().IsRequired();
            e.Property(x => x.PayBasisCode).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<EmployeeRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.EmployeeId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PayrollRunSnapshot>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
            e.Property(x => x.PeriodKind).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.ProfileCode).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.SnapshotJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.SnapshotSha256).HasMaxLength(64).IsUnicode(false).IsFixedLength().IsRequired();
            e.Property(x => x.BlockersJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_PayrollRunSnapshots_Period", "[PeriodEnd] >= [PeriodStart]");
                t.HasCheckConstraint("CK_PayrollRunSnapshots_PeriodKind", "[PeriodKind] IN ('CalendarMonth','EmployerDefined')");
                t.HasCheckConstraint("CK_PayrollRunSnapshots_Status", "[Status] IN ('Blocked')");
                t.HasCheckConstraint("CK_PayrollRunSnapshots_Hash", "LEN([SnapshotSha256]) = 64");
            });
        });
        modelBuilder.Entity<PayrollRunCalculation>(e =>
        {
            e.ToTable("PayrollRunCalculations", t =>
            {
                t.HasCheckConstraint("CK_PayrollRunCalculations_Version", "[Version] >= 1");
                t.HasCheckConstraint("CK_PayrollRunCalculations_Status", "[Status] IN ('PendingApproval','Approved','Rejected','Finalized')");
                t.HasCheckConstraint("CK_PayrollRunCalculations_SnapshotHash", "LEN([RunSnapshotSha256]) = 64");
                t.HasCheckConstraint("CK_PayrollRunCalculations_ResultHash", "LEN([ResultSha256]) = 64");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.RunId, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.RunId, x.Status });
            e.Property(x => x.RunSnapshotSha256).HasMaxLength(64).IsUnicode(false).IsFixedLength().IsRequired();
            e.Property(x => x.ResultSha256).HasMaxLength(64).IsUnicode(false).IsFixedLength().IsRequired();
            e.Property(x => x.ResultJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<PayrollRunSnapshot>().WithMany().HasForeignKey(x => new { x.TenantId, x.RunId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PayrollPriorEmployerTaxBaseDeclaration>(e =>
        {
            e.ToTable("PayrollPriorEmployerTaxBaseDeclarations", t =>
            {
                t.HasCheckConstraint("CK_PayrollPriorEmployerTaxBaseDeclarations_Year", "[TaxYear] BETWEEN 2000 AND 2100");
                t.HasCheckConstraint("CK_PayrollPriorEmployerTaxBaseDeclarations_Kind", "[DeclarationKind] IN ('HasPriorEmployer','NoPriorEmployer')");
                t.HasCheckConstraint("CK_PayrollPriorEmployerTaxBaseDeclarations_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.TaxYear, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.EmployeeId, x.TaxYear, x.Status });
            e.Property(x => x.DeclarationKind).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.BaseEntriesJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.EvidenceReference).HasMaxLength(300).IsRequired();
            e.Property(x => x.Status).HasMaxLength(24).IsUnicode(false).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<EmployeeRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.EmployeeId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<FixedAsset>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.AssetCode }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.InServiceDate });
            e.Property(x => x.AssetCode).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.Name).HasMaxLength(160);
            e.Property(x => x.Category).HasMaxLength(80);
            e.Property(x => x.AcquisitionCostBase).HasPrecision(18, 2);
            e.Property(x => x.ResidualValueBase).HasPrecision(18, 2);
            e.Property(x => x.AccumulatedDepreciationBase).HasPrecision(18, 2);
            e.Property(x => x.SourceReference).HasMaxLength(120);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_FixedAssets_CostAndLife", "[AcquisitionCostBase] > 0 AND [ResidualValueBase] >= 0 AND [ResidualValueBase] < [AcquisitionCostBase] AND [UsefulLifeMonths] BETWEEN 1 AND 1200 AND [InServiceDate] >= [AcquisitionDate] AND [AccumulatedDepreciationBase] >= 0 AND [AccumulatedDepreciationBase] <= [AcquisitionCostBase] - [ResidualValueBase]"));
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<CustomerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.SupplierAccountId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseInvoice>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseInvoiceId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<FixedAssetDepreciationPosting>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.AssetId, x.PeriodStart }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.JournalEntryId }).IsUnique();
            e.Property(x => x.AmountBase).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_FixedAssetDepreciationPostings_PeriodAmount", "[PeriodEnd] >= [PeriodStart] AND [AmountBase] > 0"));
            e.HasOne<FixedAsset>().WithMany().HasForeignKey(x => new { x.TenantId, x.AssetId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<JournalEntry>().WithMany().HasForeignKey(x => new { x.TenantId, x.JournalEntryId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<FixedAssetDisposal>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.AssetId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
            e.Property(x => x.Reason).HasMaxLength(500).IsRequired();
            e.Property(x => x.ProceedsBase).HasPrecision(18, 2);
            e.Property(x => x.PostedAccumulatedDepreciationBase).HasPrecision(18, 2);
            e.Property(x => x.ScheduleAccumulatedDepreciationBase).HasPrecision(18, 2);
            e.Property(x => x.BookValueBase).HasPrecision(18, 2);
            e.Property(x => x.GainLossBase).HasPrecision(18, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_FixedAssetDisposals_Amounts", "[ProceedsBase] >= 0 AND [PostedAccumulatedDepreciationBase] >= 0 AND [ScheduleAccumulatedDepreciationBase] >= 0 AND [BookValueBase] >= 0 AND [GainLossBase] = [ProceedsBase] - [BookValueBase]"));
            e.HasOne<FixedAsset>().WithMany().HasForeignKey(x => new { x.TenantId, x.AssetId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<FixedAssetAssignment>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.AssetId, x.ReturnedDate });
            e.HasIndex(x => new { x.TenantId, x.AssetId }).IsUnique().HasFilter("[ReturnedDate] IS NULL");
            e.Property(x => x.Location).HasMaxLength(160);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_FixedAssetAssignments_ReturnDate", "[ReturnedDate] IS NULL OR [ReturnedDate] >= [AssignedDate]"));
            e.HasOne<FixedAsset>().WithMany().HasForeignKey(x => new { x.TenantId, x.AssetId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<EmployeeRecord>().WithMany().HasForeignKey(x => new { x.TenantId, x.EmployeeId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CrmOpportunity>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Stage, x.ExpectedCloseDate });
            e.HasIndex(x => new { x.TenantId, x.NextActivityAt });
            e.Property(x => x.Code).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.Name).HasMaxLength(160);
            e.Property(x => x.Stage).HasConversion<string>().HasMaxLength(20).IsUnicode(false);
            e.Property(x => x.EstimatedValue).HasPrecision(18, 2);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength().IsUnicode(false);
            e.Property(x => x.ProbabilityPercent);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
            e.Property(x => x.Latitude).HasPrecision(9, 6);
            e.Property(x => x.Longitude).HasPrecision(9, 6);
            e.ToTable(t => t.HasCheckConstraint("CK_CustomerAddresses_Coordinates", "([Latitude] IS NULL AND [Longitude] IS NULL) OR ([Latitude] BETWEEN -90 AND 90 AND [Longitude] BETWEEN -180 AND 180)"));
            e.HasOne(x => x.Customer).WithMany(x => x.Addresses).HasForeignKey(x => new { x.TenantId, x.CustomerId }).HasPrincipalKey(x => new { x.TenantId, x.Id });
        });
        modelBuilder.Entity<CustomerLocationProvince>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Name).IsUnique();
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.HasData(TurkeyLocationSeedData.Provinces);
        });
        modelBuilder.Entity<CustomerLocationDistrict>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.ProvinceId, x.Name }).IsUnique();
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.HasOne(x => x.Province).WithMany(x => x.Districts).HasForeignKey(x => x.ProvinceId).OnDelete(DeleteBehavior.Restrict);
            e.HasData(TurkeyLocationSeedData.Districts);
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
            e.HasIndex(x => new { x.TenantId, x.PurchaseInvoiceDraftId }).IsUnique().HasFilter("[PurchaseInvoiceDraftId] IS NOT NULL");
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
            e.HasOne(x => x.PurchaseInvoiceDraft).WithOne(x => x.LedgerEntry).HasForeignKey<CustomerLedgerEntry>(x => new { x.TenantId, x.PurchaseInvoiceDraftId }).HasPrincipalKey<PurchaseInvoiceDraft>(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
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
            e.ToTable(t => t.HasCheckConstraint("CK_StockItems_LeadTimesNonNegative", "[ProcurementLeadTimeDays] >= 0 AND [ManufacturingLeadTimeDays] >= 0"));
            e.Property(x => x.TrackingMode).HasConversion<string>().HasMaxLength(16).HasDefaultValue(InventoryTrackingMode.None);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_StockItems_MinimumStockNonNegative", "[MinimumStock] >= 0"));
            e.HasOne(x => x.Tenant).WithMany(x => x.StockItems).HasForeignKey(x => x.TenantId);
        });
        modelBuilder.Entity<StockItemCategory>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.Name }).IsUnique();
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<StockItemUnitConversion>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.StockItemId, x.UnitCode }).IsUnique();
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.Property(x => x.FactorToBase).HasPrecision(18, 8);
            e.HasOne<StockItem>().WithMany(x => x.UnitConversions).HasForeignKey(x => new { x.TenantId, x.StockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_StockItemUnitConversions_FactorPositive", "[FactorToBase] > 0"));
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
        modelBuilder.Entity<WorkplaceDefinition>(e =>
        {
            e.ToTable("WorkplaceDefinitions", table => table.HasCheckConstraint("CK_WorkplaceDefinitions_Kind", "[Kind] IN ('Workplace','Branch','Factory')"));
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.Kind).HasMaxLength(20).IsUnicode(false).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
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
        modelBuilder.Entity<WarehouseLocation>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.WarehouseId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WarehouseId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.WarehouseId, x.ParentLocationId, x.Code });
            e.Property(x => x.Code).HasMaxLength(40).IsRequired();
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ParentLocation).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId, x.ParentLocationId })
                .HasPrincipalKey(x => new { x.TenantId, x.WarehouseId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<WarehouseCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<WarehouseCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<WarehouseCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<WarehouseCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.WarehouseId, x.DefinitionId });
            e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<WarehouseCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<WarehouseCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.WarehouseId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500);
            e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<WarehouseCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
            e.HasIndex(x => new { x.TenantId, x.ManufacturingOrderId, x.Direction, x.ReversalOfId });
            e.HasIndex(x => new { x.TenantId, x.InventoryTransferId, x.WarehouseId, x.StockItemId }).IsUnique().HasFilter("[InventoryTransferId] IS NOT NULL");
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.EnteredQuantity).HasPrecision(18, 4);
            e.Property(x => x.EnteredUnitCode).HasMaxLength(8);
            e.Property(x => x.UnitCostBase).HasPrecision(18, 8);
            e.Property(x => x.Description).HasMaxLength(240);
            e.ToTable(t => { t.HasCheckConstraint("CK_InventoryTransactions_QuantityPositive", "[Quantity] > 0"); });
            e.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.StorageLocation).WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId, x.StorageLocationId })
                .HasPrincipalKey(x => new { x.TenantId, x.WarehouseId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.StockItem).WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ReversalOf).WithOne(x => x.ReversalEntry).HasForeignKey<InventoryTransaction>(x => new { x.TenantId, x.ReversalOfId }).HasPrincipalKey<InventoryTransaction>(x => new { x.TenantId, x.Id }).IsRequired(false);
            e.HasOne(x => x.SalesDeliveryLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.SalesDeliveryLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SalesReturnLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.SalesReturnLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PurchaseReceiptLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SupplierReturnLine).WithMany(x => x.InventoryTransactions).HasForeignKey(x => new { x.TenantId, x.SupplierReturnLineId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ManufacturingOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.ManufacturingOrderId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.InventoryTransfer).WithMany().HasForeignKey(x => new { x.TenantId, x.InventoryTransferId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<InventoryTransactionTrace>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.StockItemId, x.TrackingCode });
            e.HasIndex(x => new { x.TenantId, x.InventoryTransactionId });
            e.Property(x => x.TrackingCode).HasMaxLength(80);
            e.Property(x => x.TrackingMode).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.HasOne(x => x.InventoryTransaction).WithMany(x => x.Tracking)
                .HasForeignKey(x => new { x.TenantId, x.InventoryTransactionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_InventoryTransactionTraces_QuantityPositive", "[Quantity] > 0"));
        });
        modelBuilder.Entity<InventoryCostAdjustment>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.EntryDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.PurchaseReceiptId });
            e.HasIndex(x => new { x.TenantId, x.ReversalOfId }).IsUnique().HasFilter("[ReversalOfId] IS NOT NULL");
            e.Property(x => x.Code).HasMaxLength(48);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.Description).HasMaxLength(240);
            e.HasOne<PurchaseReceipt>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<InventoryCostAdjustment>().WithMany().HasForeignKey(x => new { x.TenantId, x.ReversalOfId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<InventoryCostAdjustmentLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.AdjustmentId, x.WarehouseId, x.StockItemId });
            e.HasIndex(x => new { x.TenantId, x.PurchaseReceiptLineId });
            e.Property(x => x.QuantitySnapshot).HasPrecision(18, 4);
            e.Property(x => x.UnitCostSnapshotBase).HasPrecision(18, 8);
            e.Property(x => x.AmountBase).HasPrecision(18, 2);
            e.HasOne(x => x.Adjustment).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.AdjustmentId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.StockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseReceiptLine>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptLineId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_InventoryCostAdjustmentLines_AmountNonZero", "[AmountBase] <> 0"));
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
        modelBuilder.Entity<SalesQuoteCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesQuoteCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120);
            e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16); e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<SalesQuoteCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesQuoteCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.QuoteId, x.DefinitionId }); e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne<SalesQuote>().WithMany().HasForeignKey(x => new { x.TenantId, x.QuoteId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<SalesQuoteCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesQuoteCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasIndex(x => new { x.TenantId, x.QuoteId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500); e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne<SalesQuote>().WithMany().HasForeignKey(x => new { x.TenantId, x.QuoteId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SalesQuoteCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesPromotionCampaign>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.IsActive, x.EffectiveFrom, x.EffectiveThrough });
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SalesPromotionCampaigns_DiscountRange", "[DiscountPercent] > 0 AND [DiscountPercent] <= 100");
                t.HasCheckConstraint("CK_SalesPromotionCampaigns_EffectiveRange", "[EffectiveThrough] >= [EffectiveFrom]");
            });
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesPromotionApplication>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CampaignId, x.QuoteId }).IsUnique();
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2); e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.HasOne<SalesPromotionCampaign>().WithMany().HasForeignKey(x => new { x.TenantId, x.CampaignId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SalesQuote>().WithMany().HasForeignKey(x => new { x.TenantId, x.QuoteId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
        modelBuilder.Entity<SalesOrderCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesOrderCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16); e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<SalesOrderCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesOrderCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.OrderId, x.DefinitionId }); e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne<SalesOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.OrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<SalesOrderCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesOrderCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasIndex(x => new { x.TenantId, x.OrderId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500); e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne<SalesOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.OrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SalesOrderCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
            e.Property(x => x.EnteredQuantity).HasPrecision(18, 4);
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
        modelBuilder.Entity<SalesInvoiceCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesInvoiceCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16); e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<SalesInvoiceCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesInvoiceCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.InvoiceId, x.DefinitionId }); e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne<SalesInvoice>().WithMany(x => x.CustomFieldValues).HasForeignKey(x => new { x.TenantId, x.InvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<SalesInvoiceCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<SalesInvoiceCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasIndex(x => new { x.TenantId, x.InvoiceId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500); e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne<SalesInvoice>().WithMany(x => x.CustomFieldValueRevisions).HasForeignKey(x => new { x.TenantId, x.InvoiceId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SalesInvoiceCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
            e.Property(x => x.EnteredQuantity).HasPrecision(18, 4);
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
            e.HasOne<PurchaseRequest>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseRequestId })
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
        modelBuilder.Entity<PurchaseSupplierQuoteCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseSupplierQuoteCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16); e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<PurchaseSupplierQuoteCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseSupplierQuoteCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.QuoteId, x.DefinitionId }); e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne(x => x.Quote).WithMany(x => x.CustomFieldValues).HasForeignKey(x => new { x.TenantId, x.QuoteId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<PurchaseSupplierQuoteCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseSupplierQuoteCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasIndex(x => new { x.TenantId, x.QuoteId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500); e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne(x => x.Quote).WithMany(x => x.CustomFieldValueRevisions).HasForeignKey(x => new { x.TenantId, x.QuoteId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseSupplierQuoteCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
            e.HasIndex(x => new { x.TenantId, x.TargetWarehouseId, x.ExpectedReceiptDate });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.HasOne(x => x.Tenant).WithMany(x => x.PurchaseOrders).HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.TargetWarehouse).WithMany().HasForeignKey(x => new { x.TenantId, x.TargetWarehouseId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
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
        modelBuilder.Entity<PurchaseOrderCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseOrderCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16); e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<PurchaseOrderCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseOrderCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.PurchaseOrderId, x.DefinitionId }); e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne(x => x.PurchaseOrder).WithMany(x => x.CustomFieldValues).HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<PurchaseOrderCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseOrderCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasIndex(x => new { x.TenantId, x.PurchaseOrderId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500); e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne(x => x.PurchaseOrder).WithMany(x => x.CustomFieldValueRevisions).HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseOrderCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
        modelBuilder.Entity<PurchaseReceiptCustomFieldDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseReceiptCustomFieldDefinitionRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id }); e.HasIndex(x => new { x.TenantId, x.DefinitionId, x.Version }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40); e.Property(x => x.Label).HasMaxLength(120); e.Property(x => x.DataType).HasConversion<string>().HasMaxLength(16); e.Property(x => x.ChangeKind).HasMaxLength(24);
            e.HasOne<PurchaseReceiptCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseReceiptCustomFieldValue>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.ReceiptId, x.DefinitionId }); e.Property(x => x.Value).HasMaxLength(500);
            e.HasOne(x => x.Receipt).WithMany(x => x.CustomFieldValues).HasForeignKey(x => new { x.TenantId, x.ReceiptId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<PurchaseReceiptCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseReceiptCustomFieldValueRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasIndex(x => new { x.TenantId, x.ReceiptId, x.DefinitionId, x.CreatedAt });
            e.Property(x => x.PreviousValue).HasMaxLength(500); e.Property(x => x.NewValue).HasMaxLength(500);
            e.HasOne(x => x.Receipt).WithMany(x => x.CustomFieldValueRevisions).HasForeignKey(x => new { x.TenantId, x.ReceiptId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseReceiptCustomFieldDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
            e.Property(x => x.EnteredQuantity).HasPrecision(18, 4);
            e.ToTable(t => t.HasCheckConstraint("CK_PurchaseReceiptLines_QuantityPositive", "[Quantity] > 0"));
            e.HasOne(x => x.Receipt).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.ReceiptId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.PurchaseOrderId }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.OrderLine).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId, x.OrderLineNumber }).HasPrincipalKey(x => new { x.TenantId, x.PurchaseOrderId, x.LineNumber }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseDeliveryNote>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasAlternateKey(x => new { x.TenantId, x.Id, x.PurchaseOrderId });
            e.HasIndex(x => new { x.TenantId, x.PurchaseOrderId, x.DocumentNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PurchaseOrderId, x.DocumentDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.PurchaseReceiptId }).IsUnique().HasFilter("[PurchaseReceiptId] IS NOT NULL");
            e.Property(x => x.DocumentNumber).HasMaxLength(80);
            e.HasOne(x => x.PurchaseOrder).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PurchaseReceipt).WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.PurchaseOrderId }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseDeliveryNoteLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.DeliveryNoteId, x.OrderLineNumber }).IsUnique();
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitCode).HasMaxLength(8);
            e.ToTable(t => t.HasCheckConstraint("CK_PurchaseDeliveryNoteLines_QuantityPositive", "[Quantity] > 0"));
            e.HasOne(x => x.DeliveryNote).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.DeliveryNoteId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id, x.PurchaseOrderId }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<PurchaseOrderLine>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId, x.OrderLineNumber }).HasPrincipalKey(x => new { x.TenantId, x.PurchaseOrderId, x.LineNumber }).OnDelete(DeleteBehavior.Restrict);
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
            e.Property(x => x.EnteredQuantity).HasPrecision(18, 4);
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
        modelBuilder.Entity<PaymentInstrument>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.DueDate });
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.InstrumentNumber).HasMaxLength(80);
            e.Property(x => x.CounterpartyName).HasMaxLength(160);
            e.Property(x => x.BankName).HasMaxLength(120);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.HasIndex(x => new { x.TenantId, x.CounterpartyAccountId });
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.EndorsedTo).HasMaxLength(160);
            e.Property(x => x.Notes).HasMaxLength(500);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_PaymentInstruments_AmountPositive", "[Amount] > 0");
                t.HasCheckConstraint("CK_PaymentInstruments_DueDate", "[DueDate] >= [IssueDate]");
                t.HasCheckConstraint("CK_PaymentInstruments_ValidType", "[Type] IN (1,2)");
                t.HasCheckConstraint("CK_PaymentInstruments_ValidDirection", "[Direction] IN (1,2)");
                t.HasCheckConstraint("CK_PaymentInstruments_ValidStatus", "[Status] IN (1,2,3,4,5)");
            });
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.CounterpartyAccount).WithMany().HasForeignKey(x => new { x.TenantId, x.CounterpartyAccountId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.FinancialAccount).WithMany().HasForeignKey(x => new { x.TenantId, x.FinancialAccountId, x.CurrencyCode })
                .HasPrincipalKey(x => new { x.TenantId, x.Id, x.CurrencyCode }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.FinancialAccountTransaction).WithMany().HasForeignKey(x => new { x.TenantId, x.FinancialAccountTransactionId, x.FinancialAccountId, x.CurrencyCode })
                .HasPrincipalKey(x => new { x.TenantId, x.Id, x.FinancialAccountId, x.CurrencyCode }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PaymentInstrumentEvent>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.PaymentInstrumentId, x.CreatedAt });
            e.Property(x => x.EventType).HasMaxLength(24);
            e.Property(x => x.Note).HasMaxLength(500);
            e.ToTable(t => t.HasCheckConstraint("CK_PaymentInstrumentEvents_Status", "[NewStatus] IN (1,2,3,4,5)"));
            e.HasOne(x => x.PaymentInstrument).WithMany(x => x.Events).HasForeignKey(x => new { x.TenantId, x.PaymentInstrumentId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<FinancialAccountTransaction>().WithMany().HasForeignKey(x => new { x.TenantId, x.FinancialAccountTransactionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CreditFacility>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.MaturityDate });
            e.Property(x => x.Code).HasMaxLength(40).IsRequired();
            e.Property(x => x.LenderName).HasMaxLength(160).IsRequired();
            e.Property(x => x.FacilityType).HasMaxLength(24).IsRequired();
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.ApprovedLimit).HasPrecision(18, 2);
            e.Property(x => x.AnnualInterestRatePercent).HasPrecision(9, 4);
            e.Property(x => x.Status).HasConversion<int>();
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_CreditFacilities_ApprovedLimit", "[ApprovedLimit] > 0");
                t.HasCheckConstraint("CK_CreditFacilities_ValidDates", "[MaturityDate] IS NULL OR [MaturityDate] >= [StartDate]");
                t.HasCheckConstraint("CK_CreditFacilities_Rate", "[AnnualInterestRatePercent] IS NULL OR [AnnualInterestRatePercent] >= 0");
                t.HasCheckConstraint("CK_CreditFacilities_Status", "[Status] IN (1,2)");
            });
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CreditFacilitySchedule>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CreditFacilityId, x.DueDate });
            e.Property(x => x.PrincipalAmount).HasPrecision(18, 2);
            e.Property(x => x.InterestAmount).HasPrecision(18, 2);
            e.Property(x => x.FeeAmount).HasPrecision(18, 2);
            e.Property(x => x.Status).HasConversion<int>();
            e.Property(x => x.Notes).HasMaxLength(500);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_CreditFacilitySchedules_Amounts", "[PrincipalAmount] >= 0 AND [InterestAmount] >= 0 AND [FeeAmount] >= 0 AND ([PrincipalAmount] + [InterestAmount] + [FeeAmount]) > 0");
                t.HasCheckConstraint("CK_CreditFacilitySchedules_Status", "[Status] IN (1,2,3)");
                t.HasCheckConstraint("CK_CreditFacilitySchedules_PaidDate", "([Status] = 2 AND [PaidDate] IS NOT NULL) OR ([Status] <> 2 AND [PaidDate] IS NULL)");
            });
            e.HasOne(x => x.CreditFacility).WithMany(x => x.Schedule)
                .HasForeignKey(x => new { x.TenantId, x.CreditFacilityId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CreditFacilityMovement>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.CreditFacilityId, x.TransactionDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.CreditFacilityScheduleId })
                .HasFilter("[CreditFacilityScheduleId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.ReversesMovementId }).IsUnique()
                .HasFilter("[ReversesMovementId] IS NOT NULL");
            e.Property(x => x.Type).HasConversion<int>();
            e.Property(x => x.PrincipalAmount).HasPrecision(18, 2);
            e.Property(x => x.InterestAmount).HasPrecision(18, 2);
            e.Property(x => x.FeeAmount).HasPrecision(18, 2);
            e.Property(x => x.Notes).HasMaxLength(500);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_CreditFacilityMovements_Amounts", "[PrincipalAmount] > 0 AND [InterestAmount] >= 0 AND [FeeAmount] >= 0");
                t.HasCheckConstraint("CK_CreditFacilityMovements_Type", "[Type] IN (1,2,3)");
                t.HasCheckConstraint("CK_CreditFacilityMovements_Drawdown", "[Type] <> 1 OR ([InterestAmount] = 0 AND [FeeAmount] = 0)");
                t.HasCheckConstraint("CK_CreditFacilityMovements_Reversal", "([Type] = 3 AND [ReversesMovementId] IS NOT NULL AND [CreditFacilityScheduleId] IS NULL) OR ([Type] <> 3 AND [ReversesMovementId] IS NULL)");
            });
            e.HasOne(x => x.CreditFacility).WithMany(x => x.Movements)
                .HasForeignKey(x => new { x.TenantId, x.CreditFacilityId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.FinancialAccountTransaction).WithMany()
                .HasForeignKey(x => new { x.TenantId, x.FinancialAccountTransactionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreditFacilitySchedule).WithMany()
                .HasForeignKey(x => new { x.TenantId, x.CreditFacilityScheduleId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ReversesMovement).WithMany(x => x.Reversals)
                .HasForeignKey(x => new { x.TenantId, x.ReversesMovementId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantCustomFormDefinition>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).HasFilter("[Status] = 'Published'").IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.UpdatedAt });
            e.Property(x => x.Code).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Description).HasMaxLength(500);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.FieldsJson).HasColumnType("nvarchar(max)");
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantCustomFormRevision>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TenantId, x.FormId, x.Version, x.CreatedAt });
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Description).HasMaxLength(500);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.FieldsJson).HasColumnType("nvarchar(max)");
            e.Property(x => x.ChangeKind).HasMaxLength(24).IsUnicode(false);
            e.HasOne(x => x.Form).WithMany().HasForeignKey(x => new { x.TenantId, x.FormId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantCustomFormSubmission>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.FormId, x.Status, x.SubmittedAt });
            e.HasIndex(x => new { x.TenantId, x.SubmittedByUserId, x.SubmittedAt });
            e.Property(x => x.FormCode).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.FormName).HasMaxLength(120);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.FieldsJsonSnapshot).HasColumnType("nvarchar(max)");
            e.Property(x => x.ValuesJson).HasColumnType("nvarchar(max)");
            e.Property(x => x.DecisionReason).HasMaxLength(500);
            e.HasOne(x => x.Form).WithMany().HasForeignKey(x => new { x.TenantId, x.FormId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantWorkflowDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Code }).HasFilter("[Status] = 'Published'").IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.UpdatedAt });
            e.Property(x => x.Code).HasMaxLength(40).IsUnicode(false); e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Description).HasMaxLength(500); e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.StepsJson).HasColumnType("nvarchar(max)");
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantWorkflowInstance>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Status, x.StartedAt });
            e.HasIndex(x => new { x.TenantId, x.StartedByUserId, x.StartedAt });
            e.Property(x => x.DefinitionCode).HasMaxLength(40).IsUnicode(false); e.Property(x => x.DefinitionName).HasMaxLength(120);
            e.Property(x => x.SubjectType).HasMaxLength(80).IsUnicode(false); e.Property(x => x.SubjectTitle).HasMaxLength(160);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false); e.Property(x => x.StepsJsonSnapshot).HasColumnType("nvarchar(max)");
            e.Property(x => x.ContextJson).HasColumnType("nvarchar(max)");
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne(x => x.Definition).WithMany().HasForeignKey(x => new { x.TenantId, x.DefinitionId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantWorkflowAction>(e =>
        {
            e.HasKey(x => x.Id); e.HasIndex(x => new { x.TenantId, x.InstanceId, x.StepIndex, x.CreatedAt });
            e.Property(x => x.StepName).HasMaxLength(120); e.Property(x => x.Decision).HasMaxLength(16).IsUnicode(false);
            e.Property(x => x.Comment).HasMaxLength(500); e.Property(x => x.ActorRole).HasMaxLength(64).IsUnicode(false);
            e.HasOne(x => x.Instance).WithMany().HasForeignKey(x => new { x.TenantId, x.InstanceId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantBusinessRuleDefinition>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code, x.Version }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Trigger, x.Status }).HasFilter("[Status] = 'Published'").IsUnique();
            e.Property(x => x.Code).HasMaxLength(40).IsUnicode(false); e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Description).HasMaxLength(500); e.Property(x => x.Trigger).HasMaxLength(64).IsUnicode(false);
            e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false); e.Property(x => x.WorkflowCode).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.ConditionsJson).HasColumnType("nvarchar(max)");
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantBusinessRuleEvaluation>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.RuleId, x.EventId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
            e.Property(x => x.Details).HasMaxLength(500);
            e.HasOne(x => x.Rule).WithMany().HasForeignKey(x => new { x.TenantId, x.RuleId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.WorkflowInstance).WithMany().HasForeignKey(x => new { x.TenantId, x.WorkflowInstanceId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantScreenView>(e =>
        {
            e.ToTable("TenantScreenViews", table => table.HasCheckConstraint("CK_TenantScreenViews_Revision", "[Revision] >= 1"));
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ScreenKey, x.IsPublished }).IsUnique().HasFilter("[IsPublished] = 1");
            e.HasIndex(x => new { x.TenantId, x.ScreenKey, x.UpdatedAt });
            e.Property(x => x.ScreenKey).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.LayoutJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.Revision).IsConcurrencyToken();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantScreenViewRevision>(e =>
        {
            e.ToTable("TenantScreenViewRevisions", table => table.HasCheckConstraint("CK_TenantScreenViewRevisions_Revision", "[Revision] >= 1"));
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ScreenViewId, x.Revision }).IsUnique();
            e.Property(x => x.ScreenKey).HasMaxLength(40).IsUnicode(false).IsRequired();
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.LayoutJson).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.ChangeKind).HasMaxLength(32).IsUnicode(false).IsRequired();
            e.HasOne(x => x.ScreenView).WithMany(x => x.Revisions).HasForeignKey(x => new { x.TenantId, x.ScreenViewId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<TenantSavedReport>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Name }).IsUnique();
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Kind).HasMaxLength(12).IsUnicode(false).HasDefaultValue("Report");
            e.Property(x => x.Source).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.DefinitionJson).HasColumnType("nvarchar(max)");
            e.Property(x => x.DefinitionRevision).HasDefaultValue(1).IsConcurrencyToken();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantSavedReportRevision>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.SavedReportId, x.Revision }).IsUnique();
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Kind).HasMaxLength(12).IsUnicode(false);
            e.Property(x => x.Source).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.DefinitionJson).HasColumnType("nvarchar(max)");
            e.HasOne(x => x.SavedReport).WithMany(x => x.Revisions).HasForeignKey(x => new { x.TenantId, x.SavedReportId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<TenantDashboardWidget>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.SavedReportId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Position });
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SavedReport).WithMany().HasForeignKey(x => new { x.TenantId, x.SavedReportId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<TenantCustomMenuEntry>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Position });
            e.Property(x => x.Code).HasMaxLength(40).IsUnicode(false);
            e.Property(x => x.Label).HasMaxLength(80);
            e.Property(x => x.TargetPage).HasMaxLength(40).IsUnicode(false);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<BillOfMaterial>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ProductStockItemId, x.IsActive });
            e.Property(x => x.Code).HasMaxLength(48).IsUnicode(false);
            e.Property(x => x.Name).HasMaxLength(160);
            e.Property(x => x.OutputQuantity).HasPrecision(18, 4);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_BillOfMaterials_OutputQuantityPositive", "[OutputQuantity] > 0"));
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProductStockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ManufacturingWorkCenter>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(48).IsUnicode(false);
            e.Property(x => x.Name).HasMaxLength(160);
            e.Property(x => x.WorkingDaysMask).HasDefaultValue(127);
            e.Property(x => x.ShiftStartMinuteOfDay).HasDefaultValue(480);
            e.Property(x => x.ShiftEndMinuteOfDay).HasDefaultValue(960);
            e.Property(x => x.LaborCostPerHourBase).HasPrecision(18, 4);
            e.Property(x => x.OverheadCostPerHourBase).HasPrecision(18, 4);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_ManufacturingWorkCenters_Capacity", "[CapacityMinutesPerDay] > 0 AND [CapacityMinutesPerDay] <= 1440 AND [LaborCostPerHourBase] >= 0 AND [OverheadCostPerHourBase] >= 0");
                t.HasCheckConstraint("CK_ManufacturingWorkCenters_WorkingDaysMask", "[WorkingDaysMask] BETWEEN 0 AND 127");
                t.HasCheckConstraint("CK_ManufacturingWorkCenters_ShiftWindow", "[ShiftStartMinuteOfDay] BETWEEN 0 AND 1439 AND [ShiftEndMinuteOfDay] BETWEEN 1 AND 1440 AND [ShiftEndMinuteOfDay] > [ShiftStartMinuteOfDay]");
            });
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ManufacturingWorkCenterCapacityOverride>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WorkCenterId, x.WorkDate }).IsUnique();
            e.Property(x => x.Note).HasMaxLength(200);
            e.ToTable(t => t.HasCheckConstraint("CK_ManufacturingWorkCenterCapacityOverrides_Capacity", "[CapacityMinutes] BETWEEN 0 AND 1440"));
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<ManufacturingSetupTransitionRule>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WorkCenterId, x.FromSetupFamilyCode, x.ToSetupFamilyCode }).IsUnique();
            e.Property(x => x.FromSetupFamilyCode).HasMaxLength(48).IsUnicode(false);
            e.Property(x => x.ToSetupFamilyCode).HasMaxLength(48).IsUnicode(false);
            e.Property(x => x.SetupMinutes).HasPrecision(12, 2);
            e.ToTable(t => t.HasCheckConstraint("CK_ManufacturingSetupTransitionRules_SetupMinutes", "[SetupMinutes] >= 0"));
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<BillOfMaterialOperation>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.BillOfMaterialId, x.Sequence }).IsUnique();
            e.Property(x => x.SetupMinutes).HasPrecision(12, 2);
            e.Property(x => x.RunMinutesPerOutputUnit).HasPrecision(12, 4);
            e.Property(x => x.PlannedEnergyKwhPerOutput).HasPrecision(14, 3).HasDefaultValue(0m);
            e.Property(x => x.PlannedEnergyCostPerKwhBase).HasPrecision(18, 6).HasDefaultValue(0m);
            e.Property(x => x.SetupFamilyCode).HasMaxLength(48).IsUnicode(false).HasDefaultValue("");
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_BillOfMaterialOperations_Minutes", "[Sequence] > 0 AND [SetupMinutes] >= 0 AND [RunMinutesPerOutputUnit] >= 0 AND ([SetupMinutes] + [RunMinutesPerOutputUnit]) > 0");
                t.HasCheckConstraint("CK_BillOfMaterialOperations_PlannedEnergy", "[PlannedEnergyKwhPerOutput] >= 0 AND [PlannedEnergyCostPerKwhBase] >= 0");
            });
            e.HasOne<BillOfMaterial>().WithMany(x => x.Operations).HasForeignKey(x => new { x.TenantId, x.BillOfMaterialId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<BillOfMaterialOperationWorkCenterOption>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.BillOfMaterialOperationId, x.WorkCenterId });
            e.HasIndex(x => new { x.TenantId, x.BillOfMaterialOperationId, x.IsPreferred }).IsUnique().HasFilter("[IsPreferred] = 1");
            e.HasOne<BillOfMaterialOperation>().WithMany(x => x.EligibleWorkCenters)
                .HasForeignKey(x => new { x.TenantId, x.BillOfMaterialOperationId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<BillOfMaterialLine>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.BillOfMaterialId, x.ComponentStockItemId }).IsUnique();
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.ScrapPercent).HasPrecision(9, 4);
            e.Property(x => x.StandardUnitCostBase).HasPrecision(18, 4).HasDefaultValue(0m);
            e.ToTable(t => t.HasCheckConstraint("CK_BillOfMaterialLines_Quantities", "[Quantity] > 0 AND [ScrapPercent] >= 0 AND [ScrapPercent] <= 100 AND [StandardUnitCostBase] >= 0"));
            e.HasOne<BillOfMaterial>().WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.BillOfMaterialId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.ComponentStockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ManufacturingOrder>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.PlannedDate });
            e.Property(x => x.Code).HasMaxLength(48).IsUnicode(false);
            e.Property(x => x.PlannedQuantity).HasPrecision(18, 4);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.ToTable(t => t.HasCheckConstraint("CK_ManufacturingOrders_PlannedQuantityPositive", "[PlannedQuantity] > 0"));
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<BillOfMaterial>().WithMany().HasForeignKey(x => new { x.TenantId, x.BillOfMaterialId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<MrpPlanSnapshot>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
            e.Property(x => x.SupplyCaveat).HasMaxLength(1000);
            e.Property(x => x.ResultJson).HasColumnType("nvarchar(max)");
            e.Property(x => x.ConversionStateJson).HasColumnType("nvarchar(max)");
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ManufacturingOrderLine>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ManufacturingOrderId, x.ComponentStockItemId }).IsUnique();
            e.Property(x => x.ComponentCodeSnapshot).HasMaxLength(64);
            e.Property(x => x.ComponentNameSnapshot).HasMaxLength(200);
            e.Property(x => x.RequiredQuantity).HasPrecision(18, 4);
            e.Property(x => x.StandardUnitCostBaseSnapshot).HasPrecision(18, 4).HasDefaultValue(0m);
            e.Property(x => x.PlannedCostBase).HasPrecision(18, 4).HasDefaultValue(0m);
            e.ToTable(t => t.HasCheckConstraint("CK_ManufacturingOrderLines_RequiredQuantityPositive", "[RequiredQuantity] > 0 AND [StandardUnitCostBaseSnapshot] >= 0 AND [PlannedCostBase] >= 0"));
            e.HasOne<ManufacturingOrder>().WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.ManufacturingOrderId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<StockItem>().WithMany().HasForeignKey(x => new { x.TenantId, x.ComponentStockItemId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ManufacturingOrderOperation>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ManufacturingOrderId, x.Sequence }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.WorkCenterId, x.ScheduledStartDate, x.ScheduledEndDate });
            e.Property(x => x.WorkCenterCodeSnapshot).HasMaxLength(48).IsUnicode(false);
            e.Property(x => x.WorkCenterNameSnapshot).HasMaxLength(160);
            e.Property(x => x.SetupMinutes).HasPrecision(12, 2);
            e.Property(x => x.RunMinutes).HasPrecision(12, 2);
            e.Property(x => x.SetupFamilyCodeSnapshot).HasMaxLength(48).IsUnicode(false).HasDefaultValue("");
            e.Property(x => x.SequenceSetupMinutes).HasPrecision(12, 2).HasDefaultValue(0m);
            e.Property(x => x.SetupTransitionRulesSnapshotJson).HasColumnType("nvarchar(max)").HasDefaultValue("[]");
            e.Property(x => x.LaborCostPerHourBase).HasPrecision(18, 4);
            e.Property(x => x.OverheadCostPerHourBase).HasPrecision(18, 4);
            e.Property(x => x.PlannedEnergyQuantityKwh).HasPrecision(14, 3).HasDefaultValue(0m);
            e.Property(x => x.PlannedEnergyCostPerKwhBase).HasPrecision(18, 6).HasDefaultValue(0m);
            e.Property(x => x.PlannedEnergyCostBase).HasPrecision(18, 4).HasDefaultValue(0m);
            e.Property(x => x.PlannedCostBase).HasPrecision(18, 4);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ActualSetupMinutes).HasPrecision(12, 2);
            e.Property(x => x.ActualRunMinutes).HasPrecision(12, 2);
            e.Property(x => x.ActualEnergyQuantityKwh).HasPrecision(14, 3);
            e.Property(x => x.ActualEnergyCostPerKwhBase).HasPrecision(18, 6);
            e.Property(x => x.ActualEnergyCostBase).HasPrecision(18, 4);
            e.Property(x => x.ActualCostBase).HasPrecision(18, 4);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_ManufacturingOrderOperations_MinutesAndCost", "[Sequence] > 0 AND [SetupMinutes] >= 0 AND [RunMinutes] >= 0 AND [LaborCostPerHourBase] >= 0 AND [OverheadCostPerHourBase] >= 0 AND [PlannedCostBase] >= 0");
                t.HasCheckConstraint("CK_ManufacturingOrderOperations_PlannedEnergy", "[PlannedEnergyQuantityKwh] >= 0 AND [PlannedEnergyCostPerKwhBase] >= 0 AND [PlannedEnergyCostBase] >= 0");
                t.HasCheckConstraint("CK_ManufacturingOrderOperations_Actuals", "([ActualSetupMinutes] IS NULL OR [ActualSetupMinutes] >= 0) AND ([ActualRunMinutes] IS NULL OR [ActualRunMinutes] >= 0) AND ([ActualEnergyQuantityKwh] IS NULL OR [ActualEnergyQuantityKwh] >= 0) AND ([ActualEnergyCostPerKwhBase] IS NULL OR [ActualEnergyCostPerKwhBase] >= 0) AND ([ActualEnergyCostBase] IS NULL OR [ActualEnergyCostBase] >= 0) AND ([ActualCostBase] IS NULL OR [ActualCostBase] >= 0)");
            });
            e.HasOne<ManufacturingOrder>().WithMany(x => x.Operations).HasForeignKey(x => new { x.TenantId, x.ManufacturingOrderId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ManufacturingOrderOperationWorkCenterOption>(e =>
        {
            e.HasKey(x => new { x.TenantId, x.ManufacturingOrderOperationId, x.WorkCenterId });
            e.HasIndex(x => new { x.TenantId, x.ManufacturingOrderOperationId, x.IsPreferred }).IsUnique().HasFilter("[IsPreferred] = 1");
            e.HasOne<ManufacturingOrderOperation>().WithMany(x => x.EligibleWorkCenters)
                .HasForeignKey(x => new { x.TenantId, x.ManufacturingOrderOperationId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ManufacturingCapacityAllocation>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ManufacturingOrderOperationId, x.ScheduledDate }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.WorkCenterId, x.ScheduledDate });
            e.Property(x => x.AllocatedMinutes).HasPrecision(12, 2);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_ManufacturingCapacityAllocations_Minutes", "[AllocatedMinutes] > 0");
                t.HasCheckConstraint("CK_ManufacturingCapacityAllocations_TimeRange", "[StartMinuteOfDay] BETWEEN 0 AND 1439 AND [EndMinuteOfDay] BETWEEN 1 AND 1440 AND [EndMinuteOfDay] > [StartMinuteOfDay]");
            });
            e.HasOne<ManufacturingOrderOperation>().WithMany().HasForeignKey(x => new { x.TenantId, x.ManufacturingOrderOperationId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}

public sealed class PlatformDbContext(DbContextOptions<PlatformDbContext> options, IAuditExecutionContext? auditExecutionContext = null)
    : PlatformDbContextBase<PlatformDbContext>(options, auditExecutionContext)
{
    public DbSet<TenantCompanyProfile> TenantCompanyProfiles => Set<TenantCompanyProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        // Tenant operational records belong to each isolated tenant database.
        modelBuilder.Ignore<PurchaseDeliveryNote>();
        modelBuilder.Ignore<PurchaseDeliveryNoteLine>();
        modelBuilder.Ignore<PayrollCompensationRecord>();
        modelBuilder.Ignore<PayrollPriorEmployerTaxBaseDeclaration>();
        modelBuilder.Ignore<PayrollRunSnapshot>();
        modelBuilder.Ignore<PayrollRunCalculation>();
        modelBuilder.Ignore<PayrollEmployeeWorkplaceAssignment>();
        modelBuilder.Ignore<WorkplaceDefinition>();
        modelBuilder.Ignore<PayrollWorkplaceCalendar>();
        modelBuilder.Ignore<PayrollEmployeeWorkCalendarOverride>();
        // Standalone supplier invoice drafts and their ledger relation live only in
        // physically isolated tenant databases; do not discover them through ledger navigations here.
        modelBuilder.Entity<CustomerLedgerEntry>().Ignore(x => x.PurchaseInvoiceDraftId);
        modelBuilder.Entity<CustomerLedgerEntry>().Ignore(x => x.PurchaseInvoiceDraft);
        modelBuilder.Ignore<PurchaseInvoiceDraft>();
        modelBuilder.Ignore<PurchaseInvoiceDraftLine>();
        modelBuilder.Entity<TenantCompanyProfile>(e =>
        {
            e.ToTable("TenantCompanyProfiles");
            e.HasKey(x => x.TenantId);
            e.Property(x => x.LegalName).HasMaxLength(200).IsRequired();
            e.Property(x => x.TaxOffice).HasMaxLength(100);
            e.Property(x => x.TaxNumber).HasMaxLength(10).IsUnicode(false);
            e.HasOne<Tenant>().WithOne().HasForeignKey<TenantCompanyProfile>(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
