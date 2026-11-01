using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded account-name/code lookup that never exposes IDs or balances.</summary>
internal static class ERPAssistantLedgerAccountTools
{
    private const string PermissionPath = "/api/finance/general-ledger";
    private const int MaxResults = 10;

    public static bool TryValidateSearchTerm(string? value, out string term)
    {
        term = value?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(PermissionPath, "GET", PermissionPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.general-ledger.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeAccounts(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("totalCount", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("accounts", out var accounts) || accounts.ValueKind != JsonValueKind.Array ||
            accounts.GetArrayLength() > MaxResults || accounts.GetArrayLength() > total)
            throw new JsonException("Ledger-account search returned an invalid bounded result shape.");

        var projected = accounts.EnumerateArray().Select(account => new
        {
            code = RequiredString(account, "code", 32),
            name = RequiredString(account, "name", 160),
            active = RequiredBoolean(account, "isActive"),
            statementSection = RequiredString(account, "statementSection", 32)
        }).ToArray();
        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, accounts = projected });
    }

    private static string RequiredString(JsonElement element, string name, int maxLength)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(value.GetString()) || value.GetString()!.Length > maxLength)
            throw new JsonException($"Ledger-account result has invalid {name}.");
        return value.GetString()!;
    }

    private static bool RequiredBoolean(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException($"Ledger-account result has invalid {name}.");
        return value.GetBoolean();
    }
}
