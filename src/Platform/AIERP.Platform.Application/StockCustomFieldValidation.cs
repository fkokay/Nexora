using System.Globalization;
using AIERP.Platform.Domain;

namespace AIERP.Platform.Application;

public static class StockCustomFieldValidation
{
    public static bool TryNormalize(StockItemCustomFieldDefinition definition, string? rawValue, out string normalized)
        => TryNormalize(definition.DataType, definition.MaxLength, rawValue, out normalized);

    public static bool TryNormalize(CustomFieldDataType dataType, int maxLength, string? rawValue, out string normalized)
    {
        normalized = "";
        if (string.IsNullOrWhiteSpace(rawValue)) return true;
        var value = rawValue.Trim();
        switch (dataType)
        {
            case CustomFieldDataType.Text:
                if (value.Length > maxLength || value.Length > 500) return false;
                normalized = value;
                return true;
            case CustomFieldDataType.Decimal:
                if (!decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var number)) return false;
                normalized = number.ToString("G29", CultureInfo.InvariantCulture);
                return true;
            case CustomFieldDataType.Date:
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) return false;
                normalized = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                return true;
            case CustomFieldDataType.Boolean:
                if (!value.Equals("true", StringComparison.OrdinalIgnoreCase) && !value.Equals("false", StringComparison.OrdinalIgnoreCase)) return false;
                normalized = value.ToLowerInvariant();
                return true;
            default:
                return false;
        }
    }
}
