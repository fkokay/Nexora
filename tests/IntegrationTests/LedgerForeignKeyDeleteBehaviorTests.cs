using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Append-only rows (customer/supplier ledger entries, stock movements, GL entries, audit events, custom field value and
/// definition revisions) must never be removed or rewritten by deleting a parent row. The InMemory provider enforces no
/// foreign keys, so these tests pin the model metadata that the migrations turn into SQL <c>ON DELETE</c> clauses.
/// </summary>
public sealed class LedgerForeignKeyDeleteBehaviorTests
{
    private static readonly Type[] LedgerTypes =
    [
        typeof(CustomerLedgerEntry), typeof(InventoryTransaction), typeof(InventoryTransactionTrace), typeof(JournalEntry),
        typeof(JournalEntryLine), typeof(AuditEvent), typeof(CreditFacilityMovement)
    ];

    public static TheoryData<string> Contexts => new() { nameof(PlatformDbContext), nameof(TenantDbContext) };

    [Theory]
    [MemberData(nameof(Contexts))]
    public void Customer_ledger_entries_and_custom_field_values_do_not_cascade_from_the_customer_card(string context)
    {
        using var db = Create(context);
        var customer = db.Model.FindEntityType(typeof(CustomerAccount))!;
        foreach (var dependent in new[] { typeof(CustomerLedgerEntry), typeof(CustomerCustomFieldValue), typeof(CustomerCustomFieldValueRevision) })
        {
            var fk = Assert.Single(customer.GetReferencingForeignKeys(), x => x.DeclaringEntityType.ClrType == dependent);
            Assert.Equal(DeleteBehavior.Restrict, fk.DeleteBehavior);
        }
        // Optional key (CustomerId is nullable): SQL NO ACTION; the delete endpoint removes the addresses explicitly.
        var address = Assert.Single(customer.GetReferencingForeignKeys(), x => x.DeclaringEntityType.ClrType == typeof(CustomerAddress));
        Assert.Equal(DeleteBehavior.ClientSetNull, address.DeleteBehavior);
    }

    [Theory]
    [MemberData(nameof(Contexts))]
    public void No_foreign_key_of_an_append_only_row_cascades_or_sets_null(string context)
    {
        using var db = Create(context);
        var ledgerTypes = db.Model.GetEntityTypes()
            .Where(x => LedgerTypes.Contains(x.ClrType) || x.ClrType.Name.EndsWith("CustomFieldValueRevision", StringComparison.Ordinal)
                || x.ClrType.Name.EndsWith("CustomFieldDefinitionRevision", StringComparison.Ordinal))
            .ToArray();
        Assert.Contains(ledgerTypes, x => x.ClrType == typeof(CustomerLedgerEntry));
        Assert.Contains(ledgerTypes, x => x.ClrType == typeof(CustomerCustomFieldValueRevision));
        var offending = ledgerTypes.SelectMany(x => x.GetForeignKeys())
            .Where(fk => fk.DeleteBehavior is DeleteBehavior.Cascade or DeleteBehavior.ClientCascade or DeleteBehavior.SetNull)
            .Select(Describe).ToArray();
        Assert.Empty(offending);
    }

    private static string Describe(IForeignKey fk) =>
        $"{fk.DeclaringEntityType.ClrType.Name}({string.Join(",", fk.Properties.Select(p => p.Name))}) -> {fk.PrincipalEntityType.ClrType.Name}: {fk.DeleteBehavior}";

    private static DbContext Create(string context)
    {
        var name = $"ledger-fk-{Guid.NewGuid():N}";
        return context == nameof(PlatformDbContext)
            ? new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(name).Options)
            : new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase(name).Options);
    }
}
