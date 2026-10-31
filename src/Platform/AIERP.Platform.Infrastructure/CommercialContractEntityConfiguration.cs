using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AIERP.Platform.Infrastructure;

internal sealed class CommercialContractEntityConfiguration : IEntityTypeConfiguration<CommercialContract>
{
    public void Configure(EntityTypeBuilder<CommercialContract> e)
    {
        e.ToTable("CommercialContracts", table =>
        {
            table.HasCheckConstraint("CK_CommercialContracts_EffectiveRange", "[EffectiveThrough] >= [EffectiveFrom]");
            table.HasCheckConstraint("CK_CommercialContracts_Type", "[Type] IN (1,2)");
            table.HasCheckConstraint("CK_CommercialContracts_Status", "[Status] BETWEEN 1 AND 6");
            table.HasCheckConstraint("CK_CommercialContracts_SourceDirection",
                "([Type] = 1 AND [PurchaseSupplierQuoteId] IS NULL AND [PurchaseOrderId] IS NULL) OR ([Type] = 2 AND [SalesQuoteId] IS NULL AND [SalesOrderId] IS NULL)");
        });
        e.HasKey(x => x.Id);
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        e.HasIndex(x => new { x.TenantId, x.CreateIdempotencyKey }).IsUnique();
        e.HasIndex(x => new { x.TenantId, x.Status, x.EffectiveFrom, x.EffectiveThrough });
        e.Property(x => x.Code).HasMaxLength(40).IsRequired();
        e.Property(x => x.CounterpartyNameSnapshot).HasMaxLength(200).IsRequired();
        e.Property(x => x.CurrencyCode).HasMaxLength(3).IsFixedLength().IsRequired();
        e.Property(x => x.Revision).IsConcurrencyToken();
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<CustomerAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.CounterpartyId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<SalesQuote>().WithMany().HasForeignKey(x => new { x.TenantId, x.SalesQuoteId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<SalesOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.SalesOrderId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<PurchaseSupplierQuote>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseSupplierQuoteId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<PurchaseOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.PurchaseOrderId })
            .HasPrincipalKey(x => new { x.TenantId, x.Id }).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CommercialContractStatusTransitionConfiguration : IEntityTypeConfiguration<CommercialContractStatusTransition>
{
    public void Configure(EntityTypeBuilder<CommercialContractStatusTransition> e)
    {
        e.ToTable("CommercialContractStatusTransitions", table =>
        {
            table.HasCheckConstraint("CK_CommercialContractStatusTransitions_Status", "[FromStatus] BETWEEN 1 AND 6 AND [ToStatus] BETWEEN 1 AND 6");
            table.HasCheckConstraint("CK_CommercialContractStatusTransitions_Change", "[FromStatus] <> [ToStatus]");
        });
        e.HasKey(x => x.Id);
        e.HasAlternateKey(x => new { x.TenantId, x.Id });
        e.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
        e.HasIndex(x => new { x.TenantId, x.ContractId, x.ChangedAt });
        e.Property(x => x.Reason).HasMaxLength(500);
        e.HasOne(x => x.Contract).WithMany(x => x.Transitions)
            .HasForeignKey(x => new { x.TenantId, x.ContractId }).HasPrincipalKey(x => new { x.TenantId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
    }
}
