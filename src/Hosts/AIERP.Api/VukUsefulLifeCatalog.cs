using System.Reflection;
using System.Text.Json;

public sealed record VukUsefulLifeCatalogEntry(string Code, string Description, int UsefulLifeYears, decimal NormalRatePercent, int CommuniqueNumber);

public static class VukUsefulLifeCatalog
{
    private const string ResourceName = "AIERP.Api.Data.vuk-useful-life-catalog-2026.json";
    private static readonly Lazy<IReadOnlyList<VukUsefulLifeCatalogEntry>> Entries = new(Load);

    public static IReadOnlyList<VukUsefulLifeCatalogEntry> Search(string? query)
    {
        var entries = Entries.Value;
        if (string.IsNullOrWhiteSpace(query)) return entries;
        var term = query.Trim();
        return entries.Where(x => x.Code.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                                  x.Description.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                                  x.CommuniqueNumber.ToString().Contains(term, StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    private static IReadOnlyList<VukUsefulLifeCatalogEntry> Load()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded VUK useful-life catalog resource '{ResourceName}' is missing.");
        using var document = JsonDocument.Parse(stream);
        var entries = document.RootElement.GetProperty("entries").EnumerateArray().Select(item =>
            new VukUsefulLifeCatalogEntry(
                item.GetProperty("code").GetString()!,
                item.GetProperty("description").GetString()!,
                item.GetProperty("usefulLifeYears").GetInt32(),
                item.GetProperty("normalRatePercent").GetDecimal(),
                item.GetProperty("communiqueNumber").GetInt32()))
            .ToArray();
        if (entries.Length != 672 || entries.Any(x => string.IsNullOrWhiteSpace(x.Code) || string.IsNullOrWhiteSpace(x.Description) || x.UsefulLifeYears is < 1 or > 100 || x.NormalRatePercent is <= 0 or > 100 || x.CommuniqueNumber is < 1 or > 999))
            throw new InvalidOperationException("Embedded VUK useful-life catalog failed its integrity checks.");
        return entries;
    }
}
