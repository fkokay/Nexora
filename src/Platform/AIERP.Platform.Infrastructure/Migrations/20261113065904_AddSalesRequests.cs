using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSalesRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SourceSalesRequestId",
                table: "SalesQuotes",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SalesRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    RequestDate = table.Column<DateOnly>(type: "date", nullable: false),
                    NeededByDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CancelReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesRequests", x => x.Id);
                    table.UniqueConstraint("AK_SalesRequests_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_SalesRequests_NeededByDate", "[NeededByDate] IS NULL OR [NeededByDate] >= [RequestDate]");
                    table.ForeignKey(
                        name: "FK_SalesRequests_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesRequests_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesRequestLines",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineNumber = table.Column<int>(type: "int", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StockName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    EnteredQuantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: true),
                    EnteredUnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesRequestLines", x => new { x.TenantId, x.SalesRequestId, x.LineNumber });
                    table.CheckConstraint("CK_SalesRequestLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_SalesRequestLines_SalesRequests_TenantId_SalesRequestId",
                        columns: x => new { x.TenantId, x.SalesRequestId },
                        principalTable: "SalesRequests",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SalesRequestLines_StockItems_TenantId_StockItemId",
                        columns: x => new { x.TenantId, x.StockItemId },
                        principalTable: "StockItems",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "PermissionDefinitions",
                columns: new[] { "Code", "Action", "Description", "ResourceType" },
                values: new object[,]
                {
                    { "erp.sales-requests.create", "create", "create · Sales requests", "erp.sales-requests" },
                    { "erp.sales-requests.delete", "delete", "delete · Sales requests", "erp.sales-requests" },
                    { "erp.sales-requests.execute", "execute", "execute · Sales requests", "erp.sales-requests" },
                    { "erp.sales-requests.read", "read", "read · Sales requests", "erp.sales-requests" },
                    { "erp.sales-requests.update", "update", "update · Sales requests", "erp.sales-requests" }
                });

            // Mevcut firmalarda TenantUser rolüne, yeni firmalardaki varsayılanla aynı izinler verilir (AddCrmOpportunityPermissions ile aynı kalıp).
            migrationBuilder.Sql("""
                INSERT INTO [TenantPermissionRules]
                    ([Id], [TenantId], [SubjectType], [SubjectRole], [SubjectUserId], [PermissionCode], [Effect],
                     [ResourceType], [AttributeName], [AttributeOperator], [AttributeValue], [IsActive], [CreatedByUserId], [CreatedAt])
                SELECT NEWID(), tenant.[TenantId], 1, 'TenantUser', NULL, permission.[Code], 1,
                       NULL, NULL, NULL, NULL, 1, NULL, SYSUTCDATETIME()
                FROM (SELECT DISTINCT [TenantId] FROM [TenantMemberships] WHERE [Role] = 'TenantUser') AS tenant
                CROSS JOIN [PermissionDefinitions] AS permission
                WHERE permission.[ResourceType] = 'erp.sales-requests'
                  AND NOT EXISTS (
                      SELECT 1 FROM [TenantPermissionRules] AS existing
                      WHERE existing.[TenantId] = tenant.[TenantId]
                        AND existing.[SubjectType] = 1
                        AND existing.[SubjectRole] = 'TenantUser'
                        AND existing.[PermissionCode] = permission.[Code]
                        AND existing.[Effect] = 1
                        AND existing.[IsActive] = 1
                  );
                """);

            migrationBuilder.CreateIndex(
                name: "IX_SalesQuotes_TenantId_SourceSalesRequestId",
                table: "SalesQuotes",
                columns: new[] { "TenantId", "SourceSalesRequestId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesRequestLines_TenantId_StockItemId",
                table: "SalesRequestLines",
                columns: new[] { "TenantId", "StockItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesRequests_TenantId_Code",
                table: "SalesRequests",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesRequests_TenantId_CustomerId",
                table: "SalesRequests",
                columns: new[] { "TenantId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_SalesRequests_TenantId_RequestDate_CreatedAt",
                table: "SalesRequests",
                columns: new[] { "TenantId", "RequestDate", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_SalesQuotes_SalesRequests_TenantId_SourceSalesRequestId",
                table: "SalesQuotes",
                columns: new[] { "TenantId", "SourceSalesRequestId" },
                principalTable: "SalesRequests",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesQuotes_SalesRequests_TenantId_SourceSalesRequestId",
                table: "SalesQuotes");

            migrationBuilder.DropTable(
                name: "SalesRequestLines");

            migrationBuilder.DropTable(
                name: "SalesRequests");

            migrationBuilder.DropIndex(
                name: "IX_SalesQuotes_TenantId_SourceSalesRequestId",
                table: "SalesQuotes");

            migrationBuilder.Sql("DELETE FROM [TenantPermissionRules] WHERE [SubjectType] = 1 AND [SubjectRole] = 'TenantUser' AND [PermissionCode] LIKE 'erp.sales-requests.%';");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.sales-requests.create");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.sales-requests.delete");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.sales-requests.execute");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.sales-requests.read");

            migrationBuilder.DeleteData(
                table: "PermissionDefinitions",
                keyColumn: "Code",
                keyValue: "erp.sales-requests.update");

            migrationBuilder.DropColumn(
                name: "SourceSalesRequestId",
                table: "SalesQuotes");
        }
    }
}
