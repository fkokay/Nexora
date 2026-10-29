using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Tenant
{
    /// <inheritdoc />
    public partial class AddAttendanceApprovalV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApprovalStatus",
                table: "EmployeeAttendanceRecords",
                type: "varchar(24)",
                unicode: false,
                maxLength: 24,
                nullable: false,
                defaultValue: "PendingApproval");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ApprovedAt",
                table: "EmployeeAttendanceRecords",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedByUserId",
                table: "EmployeeAttendanceRecords",
                type: "uniqueidentifier",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovalStatus",
                table: "EmployeeAttendanceRecords");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "EmployeeAttendanceRecords");

            migrationBuilder.DropColumn(
                name: "ApprovedByUserId",
                table: "EmployeeAttendanceRecords");
        }
    }
}
