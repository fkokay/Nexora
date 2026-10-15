using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFxRevaluationVouchers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The preceding relationship-fix migration already included these tables from the current model snapshot.
            migrationBuilder.Sql("IF OBJECT_ID(N'[dbo].[FxRevaluationVouchers]', N'U') IS NULL OR OBJECT_ID(N'[dbo].[FxRevaluationVoucherLines]', N'U') IS NULL THROW 51000, 'FX revaluation tables must exist before this migration.', 1;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // This migration verifies tables owned by the preceding migration; it does not own their lifecycle.
        }
    }
}
