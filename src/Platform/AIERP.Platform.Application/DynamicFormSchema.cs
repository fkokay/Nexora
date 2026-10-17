using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AIERP.Platform.Application;

public sealed record DynamicFormField(string Code, string Label, string DataType, bool IsRequired,
    int MaxLength = 0, IReadOnlyList<string>? Options = null);

public sealed record DynamicFormValidationResult(IReadOnlyList<DynamicFormField> Fields, IReadOnlyList<string> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

public static partial class DynamicFormSchema
{
    public static DynamicFormValidationResult ValidateFields(IReadOnlyList<DynamicFormField>? fields)
    {
        var errors = new List<string>();
        if (fields is null || fields.Count is < 1 or > 40)
            return new([], ["Form must contain between 1 and 40 fields."]);

        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in fields)
        {
            if (string.IsNullOrWhiteSpace(field.Code) || field.Code.Length > 40 || !FieldCodeRegex().IsMatch(field.Code))
                errors.Add($"Field code '{field.Code}' is invalid.");
            else if (!codes.Add(field.Code)) errors.Add($"Field code '{field.Code}' is duplicated.");
            if (string.IsNullOrWhiteSpace(field.Label) || field.Label.Trim().Length > 120)
                errors.Add($"Field '{field.Code}' label must contain 1 to 120 characters.");

            switch (field.DataType)
            {
                case "Text":
                    if (field.MaxLength is < 1 or > 1000) errors.Add($"Text field '{field.Code}' must have a maximum length from 1 to 1000.");
                    if (field.Options is { Count: > 0 }) errors.Add($"Text field '{field.Code}' cannot have options.");
                    break;
                case "Decimal":
                case "Date":
                case "Boolean":
                    if (field.MaxLength != 0 || field.Options is { Count: > 0 }) errors.Add($"Field '{field.Code}' has unsupported type-specific settings.");
                    break;
                case "Choice":
                    if (field.MaxLength != 0 || field.Options is not { Count: >= 2 and <= 50 })
                        errors.Add($"Choice field '{field.Code}' must have 2 to 50 options.");
                    else if (field.Options.Any(option => string.IsNullOrWhiteSpace(option) || option.Trim().Length > 120)
                        || field.Options.Distinct(StringComparer.OrdinalIgnoreCase).Count() != field.Options.Count)
                        errors.Add($"Choice field '{field.Code}' options must be unique and contain 1 to 120 characters.");
                    break;
                default:
                    errors.Add($"Field '{field.Code}' has an unsupported data type.");
                    break;
            }
        }

        try
        {
            if (JsonSerializer.SerializeToUtf8Bytes(fields).Length > 48 * 1024)
                errors.Add("Form schema exceeds 48 KiB.");
        }
        catch (JsonException) { errors.Add("Form schema cannot be serialized."); }
        return new(fields, errors);
    }

    public static (IReadOnlyDictionary<string, string?>? Values, IReadOnlyList<string> Errors) ValidateValues(
        IReadOnlyList<DynamicFormField> fields, IReadOnlyDictionary<string, string?>? values)
    {
        var errors = new List<string>();
        if (values is null) return (null, ["Form values are required."]);
        var fieldsByCode = fields.ToDictionary(x => x.Code, StringComparer.OrdinalIgnoreCase);
        foreach (var code in values.Keys)
            if (!fieldsByCode.ContainsKey(code)) errors.Add($"Unknown form field '{code}'.");

        var normalized = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var field in fields)
        {
            values.TryGetValue(field.Code, out var rawValue);
            var value = rawValue?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                if (field.IsRequired) errors.Add($"Field '{field.Label}' is required.");
                normalized[field.Code] = null;
                continue;
            }

            switch (field.DataType)
            {
                case "Text":
                    if (value.Length > field.MaxLength) errors.Add($"Field '{field.Label}' exceeds its {field.MaxLength} character limit.");
                    normalized[field.Code] = value;
                    break;
                case "Decimal":
                    if (!decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var number))
                        errors.Add($"Field '{field.Label}' must be a decimal number using '.' as the decimal separator.");
                    else normalized[field.Code] = number.ToString("G29", CultureInfo.InvariantCulture);
                    break;
                case "Date":
                    if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                        errors.Add($"Field '{field.Label}' must be a date in YYYY-MM-DD format.");
                    else normalized[field.Code] = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                    break;
                case "Boolean":
                    if (!bool.TryParse(value, out var boolean)) errors.Add($"Field '{field.Label}' must be true or false.");
                    else normalized[field.Code] = boolean ? "true" : "false";
                    break;
                case "Choice":
                    var option = field.Options?.FirstOrDefault(x => string.Equals(x, value, StringComparison.Ordinal));
                    if (option is null) errors.Add($"Field '{field.Label}' must match one of its declared options.");
                    else normalized[field.Code] = option;
                    break;
            }
        }
        return errors.Count == 0 ? (normalized, []) : (null, errors);
    }

    [GeneratedRegex("^[a-z][a-z0-9_]{0,39}$", RegexOptions.CultureInvariant)]
    private static partial Regex FieldCodeRegex();
}
