using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchaseSupplierQuoteCustomFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldDefinitions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldDefinitions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DataType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MaxLength = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ChangeKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseSupplierQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValueRevisions_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseSupplierQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValueRevisions_PurchaseSupplierQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseSupplierQuoteCustomFieldValues",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseSupplierQuoteCustomFieldValues", x => new { x.TenantId, x.QuoteId, x.DefinitionId });
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValues_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "PurchaseSupplierQuoteCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseSupplierQuoteCustomFieldValues_PurchaseSupplierQuotes_TenantId_QuoteId",
                        columns: x => new { x.TenantId, x.QuoteId },
                        principalTable: "PurchaseSupplierQuotes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "PurchaseSupplierQuoteCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldDefinitions_TenantId_Code",
                table: "PurchaseSupplierQuoteCustomFieldDefinitions",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "PurchaseSupplierQuoteCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldValueRevisions_TenantId_QuoteId_DefinitionId_CreatedAt",
                table: "PurchaseSupplierQuoteCustomFieldValueRevisions",
                columns: new[] { "TenantId", "QuoteId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseSupplierQuoteCustomFieldValues_TenantId_DefinitionId",
                table: "PurchaseSupplierQuoteCustomFieldValues",
                columns: new[] { "TenantId", "DefinitionId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldValueRevisions");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldValues");

            migrationBuilder.DropTable(
                name: "PurchaseSupplierQuoteCustomFieldDefinitions");
        }
    }
}
