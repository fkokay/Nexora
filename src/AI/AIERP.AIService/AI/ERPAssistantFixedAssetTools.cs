using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>
/// Narrow read access for fixed-asset questions. The assistant only receives a
/// bounded summary and never receives supplier, invoice, or internal identifiers.
/// </summary>
internal static class ERPAssistantFixedAssetTools
{
    public static bool TryValidateSearchTerm(string? input, out string term)
    {
        term = input?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        const string path = "/api/fixed-assets";
        if (!PlatformPermissionCatalog.TryResolve(path, "GET", path, new Dictionary<string, string?>(), tenantId, userId, role,
                out var permission) || permission is null || permission.Permission.Code != "erp.fixed-assets.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeSearchResult(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("items", out var itemsElement) ||
            itemsElement.ValueKind != JsonValueKind.Array || itemsElement.GetArrayLength() > 25 ||
            !root.TryGetProperty("totalCount", out var totalElement) || !totalElement.TryGetInt32(out var totalCount) || totalCount < 0)
            throw new JsonException("Fixed-asset response exceeded the bounded result shape.");

        var items = itemsElement.EnumerateArray().Select(item =>
        {
            var code = GetString(item, "assetCode");
            var name = GetString(item, "name");
            if (code is null || name is null || !TryGetDecimal(item, "acquisitionCostBase", out var acquisitionCost) ||
                !TryGetDecimal(item, "accumulatedDepreciationBase", out var accumulatedDepreciation))
                throw new JsonException("Fixed-asset response contains invalid fields.");

            var status = GetString(item, "status");
            return new
            {
                code = code[..Math.Min(code.Length, 40)],
                name = name[..Math.Min(name.Length, 120)],
                category = GetString(item, "category") is { } category ? category[..Math.Min(category.Length, 80)] : null,
                status = status is "Active" or "Disposed" ? status : "Unknown",
                acquisitionDate = GetString(item, "acquisitionDate"),
                acquisitionCostBase = acquisitionCost,
                accumulatedDepreciationBase = accumulatedDepreciation,
                bookValueBase = acquisitionCost - accumulatedDepreciation
            };
        }).ToArray();

        return JsonSerializer.Serialize(new { totalCount, returned = items.Length, items });
    }

    private static string? GetString(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;

    private static bool TryGetDecimal(JsonElement item, string property, out decimal result) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out result)
            ? true : Fail(out result);

    private static bool Fail<T>(out T value) { value = default!; return false; }
}
