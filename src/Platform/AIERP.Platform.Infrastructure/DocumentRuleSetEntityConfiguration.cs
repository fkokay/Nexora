using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AIERP.Platform.Infrastructure;

internal sealed class DocumentRuleSetEntityConfiguration : IEntityTypeConfiguration<TenantDocumentRuleSet>
{
    public void Configure(EntityTypeBuilder<TenantDocumentRuleSet> e)
    {
        e.ToTable("TenantDocumentRuleSets");
        e.HasKey(x => x.Id);
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.HasIndex(x => new { x.TenantId, x.Document, x.Transition, x.Version }).IsUnique();
        // One draft and one published set per document transition (publishing archives the previous one).
        e.HasIndex(x => new { x.TenantId, x.Document, x.Transition, x.Status }).IsUnique().HasFilter("[Status] IN ('Draft', 'Published')");
        e.Property(x => x.Document).HasMaxLength(40).IsUnicode(false).IsRequired();
        e.Property(x => x.Transition).HasMaxLength(40).IsUnicode(false).IsRequired();
        e.Property(x => x.Status).HasMaxLength(16).IsUnicode(false).IsRequired();
        e.Property(x => x.RulesJson).HasMaxLength(32000).IsRequired();
        e.Property(x => x.RowVersion).IsRowVersion();
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
    }
}
