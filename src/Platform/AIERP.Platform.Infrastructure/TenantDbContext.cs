using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.Infrastructure;

public sealed class TenantDbContext(DbContextOptions<TenantDbContext> options, IAuditExecutionContext? auditExecutionContext = null)
    : PlatformDbContextBase<TenantDbContext>(options, auditExecutionContext)
{
    /// <summary>The signed-in tenant identity when this context serves an HTTP request.</summary>
    public Guid? ExecutionTenantId => auditExecutionContext?.TenantId;

    public DbSet<ManufacturingWorkCenterAnnualCapacityRule> ManufacturingWorkCenterAnnualCapacityRules => Set<ManufacturingWorkCenterAnnualCapacityRule>();
    public DbSet<ManufacturingWorkCenterShiftRotation> ManufacturingWorkCenterShiftRotations => Set<ManufacturingWorkCenterShiftRotation>();
    public DbSet<ManufacturingWorkCenterShiftRotationDay> ManufacturingWorkCenterShiftRotationDays => Set<ManufacturingWorkCenterShiftRotationDay>();
    public DbSet<OperationalProject> OperationalProjects => Set<OperationalProject>();
    public DbSet<OperationalProjectTask> OperationalProjectTasks => Set<OperationalProjectTask>();
    public DbSet<OperationalProjectResourceAllocation> OperationalProjectResourceAllocations => Set<OperationalProjectResourceAllocation>();
    public DbSet<OperationalProjectTimeEntry> OperationalProjectTimeEntries => Set<OperationalProjectTimeEntry>();
    public DbSet<PurchaseInvoiceDraft> PurchaseInvoiceDrafts => Set<PurchaseInvoiceDraft>();
    public DbSet<PurchaseInvoiceDraftLine> PurchaseInvoiceDraftLines => Set<PurchaseInvoiceDraftLine>();
    public DbSet<DirectCashBudgetPlan> DirectCashBudgetPlans => Set<DirectCashBudgetPlan>();
    public DbSet<DirectCashBudgetLine> DirectCashBudgetLines => Set<DirectCashBudgetLine>();
    public DbSet<PayrollEmployeeWorkplaceAssignment> PayrollEmployeeWorkplaceAssignments => Set<PayrollEmployeeWorkplaceAssignment>();
    public DbSet<WorkplaceDefinition> WorkplaceDefinitions => Set<WorkplaceDefinition>();
    public DbSet<PayrollWorkplaceCalendar> PayrollWorkplaceCalendars => Set<PayrollWorkplaceCalendar>();
    public DbSet<PayrollEmployeeWorkCalendarOverride> PayrollEmployeeWorkCalendarOverrides => Set<PayrollEmployeeWorkCalendarOverride>();
    public DbSet<PayrollPriorEmployerTaxBaseDeclaration> PayrollPriorEmployerTaxBaseDeclarations => Set<PayrollPriorEmployerTaxBaseDeclaration>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<ManufacturingWorkCenterAnnualCapacityRule>(e =>
        {
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WorkCenterId, x.Month, x.Day }).IsUnique();
            e.Property(x => x.Note).HasMaxLength(200);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_ManufacturingWorkCenterAnnualCapacityRules_MonthDay", "([Month] BETWEEN 1 AND 12) AND ([Day] BETWEEN 1 AND 31) AND NOT ([Month] IN (4, 6, 9, 11) AND [Day] = 31) AND NOT ([Month] = 2 AND [Day] > 29)");
                t.HasCheckConstraint("CK_ManufacturingWorkCenterAnnualCapacityRules_Capacity", "[CapacityMinutes] BETWEEN 0 AND 1440");
            });
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<ManufacturingWorkCenterShiftRotation>(e =>
        {
            e.ToTable("ManufacturingWorkCenterShiftRotations", t =>
                t.HasCheckConstraint("CK_ManufacturingWorkCenterShiftRotations_DateRange", "[EffectiveToDate] IS NULL OR [EffectiveToDate] >= [EffectiveFromDate]"));
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.WorkCenterId, x.EffectiveFromDate }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.WorkCenterId, x.EffectiveToDate });
            e.Property(x => x.Note).HasMaxLength(200);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ManufacturingWorkCenter>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkCenterId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<ManufacturingWorkCenterShiftRotationDay>(e =>
        {
            e.ToTable("ManufacturingWorkCenterShiftRotationDays", t =>
            {
                t.HasCheckConstraint("CK_ManufacturingWorkCenterShiftRotationDays_Index", "[DayIndex] BETWEEN 0 AND 365");
                t.HasCheckConstraint("CK_ManufacturingWorkCenterShiftRotationDays_Capacity", "[CapacityMinutes] BETWEEN 0 AND 1440");
                t.HasCheckConstraint("CK_ManufacturingWorkCenterShiftRotationDays_ShiftWindow", "[ShiftStartMinuteOfDay] BETWEEN 0 AND 1439 AND [ShiftEndMinuteOfDay] BETWEEN 1 AND 1440 AND [ShiftEndMinuteOfDay] > [ShiftStartMinuteOfDay]");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ShiftRotationId, x.DayIndex }).IsUnique();
            e.HasOne<ManufacturingWorkCenterShiftRotation>().WithMany(x => x.Days)
                .HasForeignKey(x => new { x.TenantId, x.ShiftRotationId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        // License grants are platform-owned and enforced through the platform catalog;
        // a tenant database must never receive a shadow license copy.
        modelBuilder.Ignore<TenantLicense>();
        modelBuilder.Ignore<PlatformRefreshSession>();
        modelBuilder.Ignore<PlatformAdminRefreshSession>();
        modelBuilder.Ignore<TenantProvisioningJob>();
        modelBuilder.Entity<TenantOperationalSettings>(e =>
        {
            e.HasKey(x => x.TenantId);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithOne().HasForeignKey<TenantOperationalSettings>(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
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
        modelBuilder.Entity<TenantBudgetPlan>(e =>
        {
            e.ToTable("TenantBudgetPlans", table =>
                table.HasCheckConstraint("CK_TenantBudgetPlans_FiscalYear", "[FiscalYear] BETWEEN 2000 AND 2100"));
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.FiscalYear, x.CreatedAt });
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsRequired();
            e.Property(x => x.Status).HasConversion<int>();
            e.Property(x => x.Revision).IsConcurrencyToken();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<TenantBudgetLine>(e =>
        {
            e.ToTable("TenantBudgetLines", table => table.HasCheckConstraint("CK_TenantBudgetLines_PlannedAmount", "[PlannedAmount] >= 0"));
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.BudgetPlanId, x.AccountId, x.PeriodStart }).IsUnique();
            e.Property(x => x.PlannedAmount).HasPrecision(18, 2);
            e.Property(x => x.Notes).HasMaxLength(240);
            e.HasOne(x => x.BudgetPlan).WithMany(x => x.Lines)
                .HasForeignKey(x => new { x.TenantId, x.BudgetPlanId }).HasPrincipalKey(x => new { x.TenantId, x.Id })
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => new { x.TenantId, x.AccountId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<DirectCashBudgetPlan>(e =>
        {
            e.ToTable("DirectCashBudgetPlans", table =>
                table.HasCheckConstraint("CK_DirectCashBudgetPlans_FiscalYear", "[FiscalYear] BETWEEN 2000 AND 2100"));
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.FiscalYear, x.CurrencyCode }).IsUnique().HasFilter("[Status] = 2");
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsUnicode(false).IsRequired();
            e.Property(x => x.Status).HasConversion<int>();
            e.Property(x => x.Revision).IsConcurrencyToken();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<DirectCashBudgetLine>(e =>
        {
            e.ToTable("DirectCashBudgetLines", table =>
            {
                table.HasCheckConstraint("CK_DirectCashBudgetLines_Direction", "[Direction] IN (1,2)");
                table.HasCheckConstraint("CK_DirectCashBudgetLines_Amount", "[Amount] >= 0");
            });
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.PlanId, x.PeriodStart });
            e.Property(x => x.Direction).HasConversion<int>();
            e.Property(x => x.Category).HasMaxLength(40).IsRequired();
            e.Property(x => x.Description).HasMaxLength(240).IsRequired();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.HasOne(x => x.Plan).WithMany(x => x.Lines).HasForeignKey(x => new { x.TenantId, x.PlanId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<ForeignTradeCase>(e =>
        {
            e.ToTable("ForeignTradeCases", table =>
            {
                table.HasCheckConstraint("CK_ForeignTradeCases_Direction", "[Direction] IN (1,2)");
                table.HasCheckConstraint("CK_ForeignTradeCases_Status", "[Status] BETWEEN 1 AND 7");
                table.HasCheckConstraint("CK_ForeignTradeCases_OrderLink", "([Direction] = 1 AND [PurchaseOrderId] IS NOT NULL AND [SalesOrderId] IS NULL) OR ([Direction] = 2 AND [SalesOrderId] IS NOT NULL AND [PurchaseOrderId] IS NULL)");
                table.HasCheckConstraint("CK_ForeignTradeCases_Value", "[DeclaredValue] >= 0");
                table.HasCheckConstraint("CK_ForeignTradeCases_InventoryDocumentDirection", "([PurchaseReceiptId] IS NULL OR ([Direction] = 1 AND [SalesDeliveryId] IS NULL)) AND ([SalesDeliveryId] IS NULL OR ([Direction] = 2 AND [PurchaseReceiptId] IS NULL))");
                table.HasCheckConstraint("CK_ForeignTradeCases_InventoryAudit", "([PurchaseReceiptId] IS NULL AND [SalesDeliveryId] IS NULL AND [InventoryDocumentLinkedAt] IS NULL AND [InventoryDocumentLinkedByUserId] IS NULL) OR (([PurchaseReceiptId] IS NOT NULL OR [SalesDeliveryId] IS NOT NULL) AND [InventoryDocumentLinkedAt] IS NOT NULL)");
            });
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ReferenceCode }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.UpdatedAt });
            e.HasIndex(x => new { x.TenantId, x.PurchaseReceiptId }).IsUnique().HasFilter("[PurchaseReceiptId] IS NOT NULL");
            e.HasIndex(x => new { x.TenantId, x.SalesDeliveryId }).IsUnique().HasFilter("[SalesDeliveryId] IS NOT NULL");
            e.Property(x => x.ReferenceCode).HasMaxLength(50).IsRequired();
            e.Property(x => x.OriginCountryCode).HasMaxLength(2).IsRequired();
            e.Property(x => x.DestinationCountryCode).HasMaxLength(2).IsRequired();
            e.Property(x => x.IncotermsCode).HasMaxLength(3);
            e.Property(x => x.HarmonizedSystemCode).HasMaxLength(10);
            e.Property(x => x.TransportMode).HasMaxLength(16).IsRequired();
            e.Property(x => x.CarrierReference).HasMaxLength(100);
            e.Property(x => x.CustomsReference).HasMaxLength(100);
            e.Property(x => x.DeclaredValue).HasPrecision(18, 2);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsRequired();
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SalesOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.SalesOrderId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PurchaseReceipt>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseReceiptId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SalesDelivery>().WithMany().HasForeignKey(x => new { x.TenantId, x.SalesDeliveryId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<OperationalProject>(e =>
        {
            e.ToTable("OperationalProjects", table =>
            {
                table.HasCheckConstraint("CK_OperationalProjects_Status", "[Status] BETWEEN 1 AND 5");
                table.HasCheckConstraint("CK_OperationalProjects_BudgetAmount", "[BudgetAmount] >= 0");
                table.HasCheckConstraint("CK_OperationalProjects_DateRange", "[StartDate] IS NULL OR [EndDate] IS NULL OR [EndDate] >= [StartDate]");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status, x.UpdatedAt });
            e.Property(x => x.Code).HasMaxLength(40).IsRequired(); e.Property(x => x.Name).HasMaxLength(160).IsRequired();
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsUnicode(false).IsRequired(); e.Property(x => x.BudgetAmount).HasPrecision(18, 2);
            e.Property(x => x.Status).HasConversion<int>(); e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<CustomerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.CustomerAccountId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<OperationalProjectTask>(e =>
        {
            e.ToTable("OperationalProjectTasks", table =>
            {
                table.HasCheckConstraint("CK_OperationalProjectTasks_Status", "[Status] BETWEEN 1 AND 5");
                table.HasCheckConstraint("CK_OperationalProjectTasks_PlannedHours", "[PlannedHours] >= 0");
                table.HasCheckConstraint("CK_OperationalProjectTasks_DateRange", "[StartDate] IS NULL OR [EndDate] IS NULL OR [EndDate] >= [StartDate]");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40).IsRequired(); e.Property(x => x.Name).HasMaxLength(160).IsRequired();
            e.Property(x => x.PlannedHours).HasPrecision(12, 2); e.Property(x => x.Status).HasConversion<int>();
            e.HasOne<OperationalProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<OperationalProjectResourceAllocation>(e =>
        {
            e.ToTable("OperationalProjectResourceAllocations", table =>
            {
                table.HasCheckConstraint("CK_OperationalProjectResourceAllocations_PlannedHours", "[PlannedHours] > 0");
                table.HasCheckConstraint("CK_OperationalProjectResourceAllocations_PlannedHourlyCost", "[PlannedHourlyCost] IS NULL OR [PlannedHourlyCost] >= 0");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.CreatedAt });
            e.Property(x => x.ResourceName).HasMaxLength(120).IsRequired(); e.Property(x => x.PlannedHours).HasPrecision(12, 2);
            e.Property(x => x.PlannedHourlyCost).HasPrecision(18, 2); e.Property(x => x.CurrencyCode).HasMaxLength(3).IsUnicode(false).IsRequired();
            e.Property(x => x.Notes).HasMaxLength(500);
            e.HasOne<OperationalProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<OperationalProjectTask>().WithMany().HasForeignKey(x => new { x.TenantId, x.TaskId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<OperationalProjectTimeEntry>(e =>
        {
            e.ToTable("OperationalProjectTimeEntries", table =>
            {
                table.HasCheckConstraint("CK_OperationalProjectTimeEntries_Hours", "[Hours] > 0 AND [Hours] <= 24");
            });
            e.HasKey(x => x.Id); e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.ProjectId, x.WorkDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.UserId, x.WorkDate });
            e.Property(x => x.Hours).HasPrecision(5, 2); e.Property(x => x.Description).HasMaxLength(500);
            e.HasOne<OperationalProject>().WithMany().HasForeignKey(x => new { x.TenantId, x.ProjectId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<OperationalProjectTask>().WithMany().HasForeignKey(x => new { x.TenantId, x.TaskId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseInvoiceDraft>(e =>
        {
            e.ToTable("PurchaseInvoiceDrafts", t =>
            {
                t.HasCheckConstraint("CK_PurchaseInvoiceDrafts_DueDate", "[DueDate] IS NULL OR [DueDate] >= [InvoiceDate]");
                t.HasCheckConstraint("CK_PurchaseInvoiceDrafts_Amounts", "[Subtotal] >= 0 AND [DiscountTotal] >= 0 AND [TaxTotal] >= 0 AND [GrandTotal] >= 0");
                t.HasCheckConstraint("CK_PurchaseInvoiceDrafts_Status", "[Status] IN (1, 2)");
                t.HasCheckConstraint("CK_PurchaseInvoiceDrafts_Posting", "([Status] = 1 AND [PostedAt] IS NULL AND [PostedByUserId] IS NULL) OR ([Status] = 2 AND [PostedAt] IS NOT NULL AND [PostedByUserId] IS NOT NULL)");
            });
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.RequestId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.SupplierId, x.InvoiceDate, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.SupplierId, x.NormalizedInvoiceNumber }).IsUnique().HasFilter("[Status] = 2");
            e.Property(x => x.InvoiceNumber).HasMaxLength(100).IsRequired();
            e.Property(x => x.NormalizedInvoiceNumber).HasMaxLength(100).IsRequired();
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength();
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            e.Property(x => x.TaxTotal).HasPrecision(18, 2);
            e.Property(x => x.GrandTotal).HasPrecision(18, 2);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => new { x.TenantId, x.SupplierId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PurchaseInvoiceDraftLine>(e =>
        {
            e.ToTable("PurchaseInvoiceDraftLines", t =>
                t.HasCheckConstraint("CK_PurchaseInvoiceDraftLines_Amounts", "[Subtotal] >= 0 AND [DiscountAmount] >= 0 AND [TaxAmount] >= 0 AND [Total] >= 0"));
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.TenantId, x.Id });
            e.HasIndex(x => new { x.TenantId, x.PurchaseInvoiceDraftId, x.LineNumber }).IsUnique();
            e.Property(x => x.Description).HasMaxLength(240).IsRequired();
            e.Property(x => x.UnitCode).HasMaxLength(12);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 4);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.Total).HasPrecision(18, 2);
            e.Property(x => x.VatRate).HasPrecision(5, 2);
            e.HasOne<LedgerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.ExpenseAccountId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PurchaseInvoiceDraft).WithMany(x => x.Lines)
                .HasForeignKey(x => new { x.TenantId, x.PurchaseInvoiceDraftId })
                .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        });
        var studioEntities = new[]
        {
            typeof(AppUser), typeof(TenantMembership), typeof(PermissionDefinition), typeof(TenantPermissionRule),
            typeof(DevelopmentRequest), typeof(DevelopmentProject), typeof(DevelopmentProjectAccess),
            typeof(GitHubInstallationAuthorizationState), typeof(DevelopmentWorkspaceRequest), typeof(ArchitecturePlanRecord),
            typeof(AITestPlanRecord), typeof(ReleaseCandidateRecord), typeof(ReleaseCandidateReviewRecord),
            typeof(StudioReleaseVersionRecord), typeof(StudioReleasePackageRecord), typeof(StudioReleaseDeploymentRecord),
            typeof(StudioProductionPromotionApprovalRecord), typeof(StudioConversation), typeof(StudioConversationMessage), typeof(StudioKnowledgeDocument),
            typeof(StudioCodeReviewThread), typeof(StudioCodeReviewComment), typeof(TenantAIProviderSettings),
            typeof(TenantDatabaseCatalogEntry), typeof(DatabaseSeparationComponentState)
        };
        foreach (var type in studioEntities) modelBuilder.Ignore(type);
        modelBuilder.ApplyConfiguration(new CommercialContractEntityConfiguration());
        modelBuilder.ApplyConfiguration(new CommercialContractStatusTransitionConfiguration());
    }
}
