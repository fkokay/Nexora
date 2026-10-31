using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddPurchaseDeliveryNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PurchaseDeliveryNotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DocumentNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    DocumentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseDeliveryNotes", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseDeliveryNotes_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.UniqueConstraint("AK_PurchaseDeliveryNotes_TenantId_Id_PurchaseOrderId", x => new { x.TenantId, x.Id, x.PurchaseOrderId });
                    table.ForeignKey(
                        name: "FK_PurchaseDeliveryNotes_PurchaseOrders_TenantId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseOrderId },
                        principalTable: "PurchaseOrders",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseDeliveryNotes_PurchaseReceipts_TenantId_PurchaseReceiptId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.PurchaseReceiptId, x.PurchaseOrderId },
                        principalTable: "PurchaseReceipts",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseOrderId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseDeliveryNotes_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseDeliveryNoteLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryNoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderLineNumber = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    UnitCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseDeliveryNoteLines", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseDeliveryNoteLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PurchaseDeliveryNoteLines_QuantityPositive", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseDeliveryNoteLines_PurchaseDeliveryNotes_TenantId_DeliveryNoteId_PurchaseOrderId",
                        columns: x => new { x.TenantId, x.DeliveryNoteId, x.PurchaseOrderId },
                        principalTable: "PurchaseDeliveryNotes",
                        principalColumns: new[] { "TenantId", "Id", "PurchaseOrderId" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseDeliveryNoteLines_PurchaseOrderLines_TenantId_PurchaseOrderId_OrderLineNumber",
                        columns: x => new { x.TenantId, x.PurchaseOrderId, x.OrderLineNumber },
                        principalTable: "PurchaseOrderLines",
                        principalColumns: new[] { "TenantId", "PurchaseOrderId", "LineNumber" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseDeliveryNoteLines_TenantId_DeliveryNoteId_OrderLineNumber",
                table: "PurchaseDeliveryNoteLines",
                columns: new[] { "TenantId", "DeliveryNoteId", "OrderLineNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseDeliveryNoteLines_TenantId_DeliveryNoteId_PurchaseOrderId",
                table: "PurchaseDeliveryNoteLines",
                columns: new[] { "TenantId", "DeliveryNoteId", "PurchaseOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseDeliveryNoteLines_TenantId_PurchaseOrderId_OrderLineNumber",
                table: "PurchaseDeliveryNoteLines",
                columns: new[] { "TenantId", "PurchaseOrderId", "OrderLineNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseDeliveryNotes_TenantId_PurchaseOrderId_DocumentDate_CreatedAt",
                table: "PurchaseDeliveryNotes",
                columns: new[] { "TenantId", "PurchaseOrderId", "DocumentDate", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseDeliveryNotes_TenantId_PurchaseOrderId_DocumentNumber",
                table: "PurchaseDeliveryNotes",
                columns: new[] { "TenantId", "PurchaseOrderId", "DocumentNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseDeliveryNotes_TenantId_PurchaseReceiptId",
                table: "PurchaseDeliveryNotes",
                columns: new[] { "TenantId", "PurchaseReceiptId" },
                unique: true,
                filter: "[PurchaseReceiptId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseDeliveryNotes_TenantId_PurchaseReceiptId_PurchaseOrderId",
                table: "PurchaseDeliveryNotes",
                columns: new[] { "TenantId", "PurchaseReceiptId", "PurchaseOrderId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PurchaseDeliveryNoteLines");

            migrationBuilder.DropTable(
                name: "PurchaseDeliveryNotes");
        }
    }
}
