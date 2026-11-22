using AIERP.Platform.Domain;

/// <summary>
/// The <c>type</c> filter of the cari list: one <see cref="CounterpartyType"/> name or a comma-separated list (OR), e.g.
/// <c>Customer,Both</c>. Each part is parsed alone (the enum is not a flags enum, so parsing the whole string would OR the
/// numbers); unknown or undefined parts are ignored, and no valid part means no filter.
/// </summary>
internal static class CounterpartyTypeFilter
{
    public static CounterpartyType[] Parse(string? value) =>
        string.IsNullOrWhiteSpace(value) ? [] : value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(part => Enum.TryParse<CounterpartyType>(part, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed)
                ? (CounterpartyType?)parsed : null)
            .OfType<CounterpartyType>().Distinct().ToArray();
}
