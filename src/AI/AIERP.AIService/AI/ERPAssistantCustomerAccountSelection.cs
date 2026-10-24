using System.Text.Json;

namespace AIERP.AIService.AI;

/// <summary>
/// Requires a current, caller-authorized account search to return exactly one row
/// before the assistant may read that account's balance.
/// </summary>
internal sealed class ERPAssistantCustomerAccountSelection
{
    private Guid? _selectedAccountId;
    private bool _requiresClarification;

    public bool TryRememberUniqueSearchResult(JsonElement accountPage)
    {
        if (_requiresClarification)
        {
            _selectedAccountId = null;
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
            _requiresClarification = true;
            return false;
        }

        if (_selectedAccountId is Guid previousAccountId && previousAccountId != accountId)
        {
            _selectedAccountId = null;
            _requiresClarification = true;
            return false;
        }

        _selectedAccountId = accountId;
        return true;
    }

    public bool CanReadBalance(Guid accountId) => accountId != Guid.Empty && _selectedAccountId == accountId;
}
