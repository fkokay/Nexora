using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AIERP.Platform.Infrastructure;

internal sealed class DocumentActivityEntityConfiguration : IEntityTypeConfiguration<TenantDocumentActivity>
{
    public void Configure(EntityTypeBuilder<TenantDocumentActivity> e)
    {
        e.ToTable("TenantDocumentActivities");
        e.HasKey(x => x.Id);
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.HasIndex(x => new { x.TenantId, x.DocumentType, x.DocumentId, x.CreatedAt });
        e.Property(x => x.DocumentType).HasMaxLength(40).IsUnicode(false).IsRequired();
        e.Property(x => x.Transition).HasMaxLength(40).IsUnicode(false).IsRequired();
        e.Property(x => x.Step).HasMaxLength(200).IsRequired();
        e.Property(x => x.Source).HasMaxLength(16).IsUnicode(false).IsRequired();
        e.Property(x => x.Outcome).HasMaxLength(16).IsUnicode(false).IsRequired();
        e.Property(x => x.Message).HasMaxLength(500);
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
    }
}
