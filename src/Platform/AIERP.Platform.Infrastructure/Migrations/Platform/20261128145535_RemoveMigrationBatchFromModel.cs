using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AIERP.Platform.Infrastructure.Migrations.Platform
{
    /// <inheritdoc />
    public partial class RemoveMigrationBatchFromModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Expand → contract (docs/release-migrations.md): TenantCustomPageRevisions.MigrationBatch sütunu ve
            // (TenantId, MigrationBatch) indeksi bu sürümde kalır; önceki sürüm hâlâ okuyabilir. Kod artık kullanmıyor.
            // Sonraki sürümde elle yazılan bir migration indeksi ve sütunu düşürür.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Expand → contract (docs/release-migrations.md): TenantCustomPageRevisions.MigrationBatch sütunu ve
            // (TenantId, MigrationBatch) indeksi bu sürümde kalır; önceki sürüm hâlâ okuyabilir. Kod artık kullanmıyor.
            // Sonraki sürümde elle yazılan bir migration indeksi ve sütunu düşürür.
        }
    }
}
