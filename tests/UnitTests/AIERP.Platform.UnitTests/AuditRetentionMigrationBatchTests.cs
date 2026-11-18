using AIERP.Platform.Infrastructure.Migrations.AIStudio;
using AIERP.Platform.Infrastructure.Migrations.Tenant;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace AIERP.Platform.UnitTests;

/// <summary>
/// The audit-retention migrations split their SQL on GO lines. A Windows checkout
/// (core.autocrlf) stores the raw string with CRLF line endings, so the split must
/// not depend on the source file's line endings or provisioning fails with
/// "Incorrect syntax near 'GO'".
/// </summary>
public sealed class AuditRetentionMigrationBatchTests
{
    public static TheoryData<Migration> Migrations => new()
    {
        new AddTenantAuditRetentionProcedure(),
        new AddAIStudioAuditRetentionProcedure()
    };

    [Theory]
    [MemberData(nameof(Migrations))]
    public void Up_emits_one_batch_per_object_without_go_separators(Migration migration)
    {
        var operations = migration.UpOperations.OfType<SqlOperation>().ToList();

        Assert.Equal(2, operations.Count);
        Assert.All(operations, operation =>
            Assert.DoesNotMatch(@"(?im)^\s*GO\s*$", operation.Sql));
    }
}
