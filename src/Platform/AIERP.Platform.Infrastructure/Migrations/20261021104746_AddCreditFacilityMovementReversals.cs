using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCreditFacilityMovementReversals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CreditFacilityMovements_TenantId_CreditFacilityScheduleId",
                table: "CreditFacilityMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CreditFacilityMovements_Type",
                table: "CreditFacilityMovements");

            migrationBuilder.AddColumn<Guid>(
                name: "ReversesMovementId",
                table: "CreditFacilityMovements",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilityMovements_TenantId_CreditFacilityScheduleId",
                table: "CreditFacilityMovements",
                columns: new[] { "TenantId", "CreditFacilityScheduleId" },
                filter: "[CreditFacilityScheduleId] IS NOT NULL");

            migrationBuilder.Sql("EXEC(N'CREATE UNIQUE INDEX [IX_CreditFacilityMovements_TenantId_ReversesMovementId] ON [CreditFacilityMovements] ([TenantId], [ReversesMovementId]) WHERE [ReversesMovementId] IS NOT NULL')");
            migrationBuilder.Sql("EXEC(N'ALTER TABLE [CreditFacilityMovements] ADD CONSTRAINT [CK_CreditFacilityMovements_Reversal] CHECK (([Type] = 3 AND [ReversesMovementId] IS NOT NULL AND [CreditFacilityScheduleId] IS NULL) OR ([Type] <> 3 AND [ReversesMovementId] IS NULL))')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CreditFacilityMovements_Type",
                table: "CreditFacilityMovements",
                sql: "[Type] IN (1,2,3)");

            migrationBuilder.Sql("EXEC(N'ALTER TABLE [CreditFacilityMovements] ADD CONSTRAINT [FK_CreditFacilityMovements_CreditFacilityMovements_TenantId_ReversesMovementId] FOREIGN KEY ([TenantId], [ReversesMovementId]) REFERENCES [CreditFacilityMovements] ([TenantId], [Id]) ON DELETE NO ACTION')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CreditFacilityMovements_CreditFacilityMovements_TenantId_ReversesMovementId",
                table: "CreditFacilityMovements");

            migrationBuilder.DropIndex(
                name: "IX_CreditFacilityMovements_TenantId_CreditFacilityScheduleId",
                table: "CreditFacilityMovements");

            migrationBuilder.DropIndex(
                name: "IX_CreditFacilityMovements_TenantId_ReversesMovementId",
                table: "CreditFacilityMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CreditFacilityMovements_Reversal",
                table: "CreditFacilityMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CreditFacilityMovements_Type",
                table: "CreditFacilityMovements");

            migrationBuilder.DropColumn(
                name: "ReversesMovementId",
                table: "CreditFacilityMovements");

            migrationBuilder.CreateIndex(
                name: "IX_CreditFacilityMovements_TenantId_CreditFacilityScheduleId",
                table: "CreditFacilityMovements",
                columns: new[] { "TenantId", "CreditFacilityScheduleId" },
                unique: true,
                filter: "[CreditFacilityScheduleId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CreditFacilityMovements_Type",
                table: "CreditFacilityMovements",
                sql: "[Type] IN (1,2)");
        }
    }
}
