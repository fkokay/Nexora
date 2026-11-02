using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddWorkCenterCalendarsPromotionsAndProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "WorkingDaysMask",
                table: "ManufacturingWorkCenters",
                type: "int",
                nullable: false,
                defaultValue: 127);

            migrationBuilder.CreateTable(
                name: "ManufacturingWorkCenterCapacityOverrides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkCenterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WorkDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CapacityMinutes = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManufacturingWorkCenterCapacityOverrides", x => x.Id);
                    table.UniqueConstraint("AK_ManufacturingWorkCenterCapacityOverrides_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ManufacturingWorkCenterCapacityOverrides_Capacity", "[CapacityMinutes] BETWEEN 0 AND 1440");
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenterCapacityOverrides_ManufacturingWorkCenters_TenantId_WorkCenterId",
                        columns: x => new { x.TenantId, x.WorkCenterId },
                        principalTable: "ManufacturingWorkCenters",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ManufacturingWorkCenterCapacityOverrides_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OperationalProjects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    CustomerAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    BudgetAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CurrencyCode = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalProjects", x => x.Id);
                    table.UniqueConstraint("AK_OperationalProjects_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_OperationalProjects_BudgetAmount", "[BudgetAmount] >= 0");
                    table.CheckConstraint("CK_OperationalProjects_DateRange", "[StartDate] IS NULL OR [EndDate] IS NULL OR [EndDate] >= [StartDate]");
                    table.CheckConstraint("CK_OperationalProjects_Status", "[Status] BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "FK_OperationalProjects_CustomerAccounts_TenantId_CustomerAccountId",
                        columns: x => new { x.TenantId, x.CustomerAccountId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OperationalProjects_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesPromotionCampaigns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveThrough = table.Column<DateOnly>(type: "date", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesPromotionCampaigns", x => x.Id);
                    table.UniqueConstraint("AK_SalesPromotionCampaigns_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesPromotionCampaigns_DiscountRange", "[DiscountPercent] > 0 AND [DiscountPercent] <= 100");
                    table.CheckConstraint("CK_SalesPromotionCampaigns_EffectiveRange", "[EffectiveThrough] >= [EffectiveFrom]");
                    table.ForeignKey(
                        name: "FK_SalesPromotionCampaigns_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OperationalProjectTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PlannedHours = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalProjectTasks", x => x.Id);
                    table.UniqueConstraint("AK_OperationalProjectTasks_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_OperationalProjectTasks_DateRange", "[StartDate] IS NULL OR [EndDate] IS NULL OR [EndDate] >= [StartDate]");
                    table.CheckConstraint("CK_OperationalProjectTasks_PlannedHours", "[PlannedHours] >= 0");
                    table.CheckConstraint("CK_OperationalProjectTasks_Status", "[Status] BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "FK_OperationalProjectTasks_OperationalProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "OperationalProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalesPromotionApplications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CampaignId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    AppliedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AppliedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesPromotionApplications", x => x.Id);
                    table.UniqueConstraint("AK_SalesPromotionApplications_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_SalesPromotionApplications_SalesPromotionCampaigns_TenantId_CampaignId",
                        columns: x => new { x.TenantId, x.CampaignId },
                        principalTable: "SalesPromotionCampaigns",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesPromotionApplications_SalesQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "SalesQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesPromotionApplications_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OperationalProjectResourceAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EmployeeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResourceName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    PlannedHours = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                    PlannedHourlyCost = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    CurrencyCode = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalProjectResourceAllocations", x => x.Id);
                    table.UniqueConstraint("AK_OperationalProjectResourceAllocations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_OperationalProjectResourceAllocations_PlannedHourlyCost", "[PlannedHourlyCost] IS NULL OR [PlannedHourlyCost] >= 0");
                    table.CheckConstraint("CK_OperationalProjectResourceAllocations_PlannedHours", "[PlannedHours] > 0");
                    table.ForeignKey(
                        name: "FK_OperationalProjectResourceAllocations_OperationalProjectTasks_TenantId_TaskId",
                        columns: x => new { x.TenantId, x.TaskId },
                        principalTable: "OperationalProjectTasks",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OperationalProjectResourceAllocations_OperationalProjects_TenantId_ProjectId",
                        columns: x => new { x.TenantId, x.ProjectId },
                        principalTable: "OperationalProjects",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManufacturingWorkCenters_WorkingDaysMask",
                table: "ManufacturingWorkCenters",
                sql: "[WorkingDaysMask] BETWEEN 0 AND 127");

            migrationBuilder.CreateIndex(
                name: "IX_ManufacturingWorkCenterCapacityOverrides_TenantId_WorkCenterId_WorkDate",
                table: "ManufacturingWorkCenterCapacityOverrides",
                columns: new[] { "TenantId", "WorkCenterId", "WorkDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjectResourceAllocations_TenantId_ProjectId_CreatedAt",
                table: "OperationalProjectResourceAllocations",
                columns: new[] { "TenantId", "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjectResourceAllocations_TenantId_TaskId",
                table: "OperationalProjectResourceAllocations",
                columns: new[] { "TenantId", "TaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjects_TenantId_Code",
                table: "OperationalProjects",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjects_TenantId_CustomerAccountId",
                table: "OperationalProjects",
                columns: new[] { "TenantId", "CustomerAccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjects_TenantId_Status_UpdatedAt",
                table: "OperationalProjects",
                columns: new[] { "TenantId", "Status", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalProjectTasks_TenantId_ProjectId_Code",
                table: "OperationalProjectTasks",
                columns: new[] { "TenantId", "ProjectId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionApplications_TenantId_CampaignId_QuoteId",
                table: "SalesPromotionApplications",
                columns: new[] { "TenantId", "CampaignId", "QuoteId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionApplications_TenantId_QuoteId",
                table: "SalesPromotionApplications",
                columns: new[] { "TenantId", "QuoteId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionCampaigns_TenantId_Code",
                table: "SalesPromotionCampaigns",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesPromotionCampaigns_TenantId_IsActive_EffectiveFrom_EffectiveThrough",
                table: "SalesPromotionCampaigns",
                columns: new[] { "TenantId", "IsActive", "EffectiveFrom", "EffectiveThrough" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ManufacturingWorkCenterCapacityOverrides");

            migrationBuilder.DropTable(
                name: "OperationalProjectResourceAllocations");

            migrationBuilder.DropTable(
                name: "SalesPromotionApplications");

            migrationBuilder.DropTable(
                name: "OperationalProjectTasks");

            migrationBuilder.DropTable(
                name: "SalesPromotionCampaigns");

            migrationBuilder.DropTable(
                name: "OperationalProjects");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ManufacturingWorkCenters_WorkingDaysMask",
                table: "ManufacturingWorkCenters");

            migrationBuilder.DropColumn(
                name: "WorkingDaysMask",
                table: "ManufacturingWorkCenters");
        }
    }
}
