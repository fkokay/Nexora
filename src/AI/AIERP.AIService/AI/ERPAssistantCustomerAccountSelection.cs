using System.Text.Json;

namespace AIERP.AIService.AI;

/// <summary>
/// Requires a current, caller-authorized account search to return exactly one row
/// before the assistant may read that account's balance.
/// </summary>
internal sealed class ERPAssistantCustomerAccountSelection
{
    private Guid? _selectedAccountId;
    private string? _selectedAccountCode;
    private string? _selectedAccountType;
    private bool _requiresClarification;

    public bool TryRememberUniqueSearchResult(JsonElement accountPage)
    {
        if (_requiresClarification)
        {
            _selectedAccountId = null;
            _selectedAccountCode = null;
            _selectedAccountType = null;
            return false;
        }

        if (accountPage.ValueKind != JsonValueKind.Object
            || !accountPage.TryGetProperty("totalCount", out var totalCountElement)
            || totalCountElement.ValueKind != JsonValueKind.Number
            || !totalCountElement.TryGetInt32(out var totalCount)
            || totalCount != 1
            || !accountPage.TryGetProperty("items", out var itemsElement)
            || itemsElement.ValueKind != JsonValueKind.Array
            || itemsElement.GetArrayLength() != 1)
        {
            _selectedAccountId = null;
            _selectedAccountCode = null;
            _selectedAccountType = null;
            _requiresClarification = true;
            return false;
        }

        var item = itemsElement[0];
        if (item.ValueKind != JsonValueKind.Object
            || !item.TryGetProperty("id", out var idElement)
            || idElement.ValueKind != JsonValueKind.String
            || !Guid.TryParse(idElement.GetString(), out var accountId)
            || accountId == Guid.Empty)
        {
            _selectedAccountId = null;
            _selectedAccountCode = null;
            _selectedAccountType = null;
            _requiresClarification = true;
            return false;
        }

        if (_selectedAccountId is Guid previousAccountId && previousAccountId != accountId)
        {
            _selectedAccountId = null;
            _selectedAccountCode = null;
            _selectedAccountType = null;
            _requiresClarification = true;
            return false;
        }

        _selectedAccountId = accountId;
        _selectedAccountCode = item.TryGetProperty("code", out var codeElement) && codeElement.ValueKind == JsonValueKind.String
            ? codeElement.GetString()?.Trim()
            : null;
        _selectedAccountType = item.TryGetProperty("type", out var typeElement)
            ? typeElement.ValueKind == JsonValueKind.String ? typeElement.GetString() : typeElement.ValueKind == JsonValueKind.Number ? typeElement.GetRawText() : null
            : null;
        return true;
    }

    public bool CanReadBalance(Guid accountId) => accountId != Guid.Empty && _selectedAccountId == accountId;

    public bool TryGetSelectedCustomerCode(Guid accountId, out string customerCode)
    {
        customerCode = string.Empty;
        if (!CanReadBalance(accountId) || string.IsNullOrWhiteSpace(_selectedAccountCode) ||
            !IsCustomerOrBoth(_selectedAccountType)) return false;

        customerCode = _selectedAccountCode;
        return true;
    }

    public bool TryGetSelectedSupplierCode(Guid accountId, out string supplierCode)
    {
        supplierCode = string.Empty;
        if (!CanReadBalance(accountId) || string.IsNullOrWhiteSpace(_selectedAccountCode) ||
            !IsSupplier(_selectedAccountType)) return false;

        supplierCode = _selectedAccountCode;
        return true;
    }

    private static bool IsCustomerOrBoth(string? value) => value?.Trim() switch
    {
        "Customer" or "Both" or "1" or "3" => true,
        _ => false
    };

    private static bool IsSupplier(string? value) => value?.Trim() switch
    {
        "Supplier" or "Both" or "2" or "3" => true,
        _ => false
    };
}
