using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerCustomFieldHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DefinitionVersion",
                table: "CustomerCustomFieldValues",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "CustomerCustomFieldDefinitions",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "CustomerCustomFieldDefinitionRevisions",
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
                    table.PrimaryKey("PK_CustomerCustomFieldDefinitionRevisions", x => x.Id);
                    table.UniqueConstraint("AK_CustomerCustomFieldDefinitionRevisions_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldDefinitionRevisions_CustomerCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "CustomerCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldDefinitionRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCustomFieldValueRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DefinitionVersion = table.Column<int>(type: "int", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCustomFieldValueRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValueRevisions_CustomerAccounts_TenantId_CustomerId",
                        columns: x => new { x.TenantId, x.CustomerId },
                        principalTable: "CustomerAccounts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValueRevisions_CustomerCustomFieldDefinitions_TenantId_DefinitionId",
                        columns: x => new { x.TenantId, x.DefinitionId },
                        principalTable: "CustomerCustomFieldDefinitions",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerCustomFieldValueRevisions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldDefinitionRevisions_TenantId_DefinitionId_Version",
                table: "CustomerCustomFieldDefinitionRevisions",
                columns: new[] { "TenantId", "DefinitionId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldValueRevisions_TenantId_CustomerId_DefinitionId_CreatedAt",
                table: "CustomerCustomFieldValueRevisions",
                columns: new[] { "TenantId", "CustomerId", "DefinitionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomFieldValueRevisions_TenantId_DefinitionId",
                table: "CustomerCustomFieldValueRevisions",
                columns: new[] { "TenantId", "DefinitionId" });

            migrationBuilder.Sql("""
                EXEC(N'
                UPDATE [dbo].[CustomerCustomFieldDefinitions] SET [Version] = 1 WHERE [Version] = 0;
                UPDATE [dbo].[CustomerCustomFieldValues] SET [DefinitionVersion] = 1 WHERE [DefinitionVersion] = 0;
                INSERT INTO [dbo].[CustomerCustomFieldDefinitionRevisions]
                    ([Id], [TenantId], [DefinitionId], [Version], [Code], [Label], [DataType], [MaxLength], [IsRequired], [IsActive], [ChangeKind], [ChangedByUserId], [CreatedAt])
                SELECT NEWID(), [TenantId], [Id], [Version], [Code], [Label], [DataType], [MaxLength], [IsRequired], [IsActive], N''Baseline'', NULL, [CreatedAt]
                FROM [dbo].[CustomerCustomFieldDefinitions];
                INSERT INTO [dbo].[CustomerCustomFieldValueRevisions]
                    ([Id], [TenantId], [CustomerId], [DefinitionId], [PreviousValue], [NewValue], [DefinitionVersion], [ChangedByUserId], [CreatedAt])
                SELECT NEWID(), [TenantId], [CustomerId], [DefinitionId], NULL, [Value], [DefinitionVersion], NULL, [UpdatedAt]
                FROM [dbo].[CustomerCustomFieldValues];
                ')
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomerCustomFieldDefinitionRevisions");

            migrationBuilder.DropTable(
                name: "CustomerCustomFieldValueRevisions");

            migrationBuilder.DropColumn(
                name: "DefinitionVersion",
                table: "CustomerCustomFieldValues");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "CustomerCustomFieldDefinitions");
        }
    }
}
