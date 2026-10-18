using System.Collections.Frozen;

namespace AIERP.ModuleSDK;

/// <summary>Public contracts for the host-owned, read-only operations available to signed modules.</summary>
public sealed record ModuleDataCapabilityDefinition(
    string Code,
    string Description,
    string RequiredInputField,
    string ResultDescription,
    bool SupportsLimit);

public static class ModuleDataCapabilityCatalog
{
    private static readonly ModuleDataCapabilityDefinition[] Definitions =
    [
        new("customers.search", "Search active customer accounts", "term", "Customer code, name, and currency", SupportsLimit: true),
        new("customers.balance.read", "Read one tenant-owned customer ledger balance", "customer-code", "Currency, debit, credit, balance side, and risk limit", SupportsLimit: false),
        new("suppliers.search", "Search active supplier accounts", "term", "Supplier code, name, and currency", SupportsLimit: true),
        new("inventory.availability.search", "Search active stock availability", "term", "Code, name, unit, on-hand, reserved, and available quantity", SupportsLimit: true)
    ];

    public static IReadOnlyDictionary<string, ModuleDataCapabilityDefinition> All { get; } =
        Definitions.ToFrozenDictionary(definition => definition.Code, StringComparer.Ordinal);

    public static bool TryGet(string? code, out ModuleDataCapabilityDefinition definition) =>
        All.TryGetValue(code ?? string.Empty, out definition!);
}
