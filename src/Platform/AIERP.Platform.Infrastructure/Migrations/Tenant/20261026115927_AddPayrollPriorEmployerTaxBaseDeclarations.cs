using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    public partial class AddPayrollPriorEmployerTaxBaseDeclarations : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PayrollPriorEmployerTaxBaseDeclarations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaxYear = table.Column<int>(type: "int", nullable: false),
                    DeclarationKind = table.Column<string>(type: "varchar(24)", unicode: false, maxLength: 24, nullable: false),
                    BaseEntriesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EvidenceReference = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "varchar(24)", unicode: false, maxLength: 24, nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RejectedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RejectedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollPriorEmployerTaxBaseDeclarations", x => x.Id);
                    table.UniqueConstraint("AK_PayrollPriorEmployerTaxBaseDeclarations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PayrollPriorEmployerTaxBaseDeclarations_Year", "[TaxYear] BETWEEN 2000 AND 2100");
                    table.CheckConstraint("CK_PayrollPriorEmployerTaxBaseDeclarations_Kind", "[DeclarationKind] IN ('HasPriorEmployer','NoPriorEmployer')");
                    table.CheckConstraint("CK_PayrollPriorEmployerTaxBaseDeclarations_Status", "[Status] IN ('PendingApproval','Approved','Rejected')");
                    table.ForeignKey("FK_PayrollPriorEmployerTaxBaseDeclarations_EmployeeRecords_TenantId_EmployeeId",
                        x => new { x.TenantId, x.EmployeeId }, "EmployeeRecords", new[] { "TenantId", "Id" }, onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_PayrollPriorEmployerTaxBaseDeclarations_Tenants_TenantId",
                        x => x.TenantId, "Tenants", "Id", onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(name: "IX_PayrollPriorEmployerTaxBaseDeclarations_TenantId_EmployeeId_TaxYear_Version",
                table: "PayrollPriorEmployerTaxBaseDeclarations", columns: new[] { "TenantId", "EmployeeId", "TaxYear", "Version" }, unique: true);
            migrationBuilder.CreateIndex(name: "IX_PayrollPriorEmployerTaxBaseDeclarations_TenantId_EmployeeId_TaxYear_Status",
                table: "PayrollPriorEmployerTaxBaseDeclarations", columns: new[] { "TenantId", "EmployeeId", "TaxYear", "Status" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "PayrollPriorEmployerTaxBaseDeclarations");
        }
    }
}
