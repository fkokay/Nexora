using System.Globalization;
using System.Net.Mail;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AIERP.Platform.Application;

public sealed record DynamicFormField(string Code, string Label, string DataType, bool IsRequired,
    int MaxLength = 0, IReadOnlyList<string>? Options = null,
    string? VisibleWhenFieldCode = null, string? VisibleWhenValue = null,
    int MinLength = 0, decimal? MinValue = null, decimal? MaxValue = null,
    string? Placeholder = null, string? HelpText = null, bool IsMultiline = false,
    string? DefaultValue = null, string TextFormat = "None",
    DateOnly? MinDate = null, DateOnly? MaxDate = null,
    string? SectionTitle = null,
    string? RequiredWhenFieldCode = null, string? RequiredWhenValue = null);

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
        foreach (var (field, index) in fields.Select((field, index) => (field, index)))
        {
            if (field is null)
            {
                errors.Add($"Field {index + 1} must be an object.");
                continue;
            }
            if (string.IsNullOrWhiteSpace(field.Code) || field.Code.Length > 40 || !FieldCodeRegex().IsMatch(field.Code))
                errors.Add($"Field code '{field.Code}' is invalid.");
            else if (!codes.Add(field.Code)) errors.Add($"Field code '{field.Code}' is duplicated.");
            if (string.IsNullOrWhiteSpace(field.Label) || field.Label.Trim().Length > 120)
                errors.Add($"Field '{field.Code}' label must contain 1 to 120 characters.");
            if (field.Placeholder?.Length > 120) errors.Add($"Field '{field.Code}' placeholder must be at most 120 characters.");
            if (field.HelpText?.Length > 240) errors.Add($"Field '{field.Code}' help text must be at most 240 characters.");
            if (field.SectionTitle?.Length > 80) errors.Add($"Field '{field.Code}' section title must be at most 80 characters.");
            if (field.SectionTitle is not null && string.IsNullOrWhiteSpace(field.SectionTitle))
                errors.Add($"Field '{field.Code}' section title cannot be blank.");

            switch (field.DataType)
            {
                case "Text":
                    if (field.TextFormat is not ("None" or "Email" or "Url" or "Phone"))
                        errors.Add($"Text field '{field.Code}' has an unsupported validation format.");
                    if (field.TextFormat != "None" && field.IsMultiline)
                        errors.Add($"Formatted text field '{field.Code}' cannot be multiline.");
                    if (field.Placeholder is not null && field.Placeholder.Trim().Length == 0)
                        errors.Add($"Text field '{field.Code}' placeholder cannot be blank.");
                    if (field.MaxLength is < 1 or > 1000) errors.Add($"Text field '{field.Code}' must have a maximum length from 1 to 1000.");
                    if (field.MinLength < 0 || field.MinLength > field.MaxLength) errors.Add($"Text field '{field.Code}' minimum length must be between 0 and its maximum length.");
                    if (field.MinValue is not null || field.MaxValue is not null || field.MinDate is not null || field.MaxDate is not null) errors.Add($"Text field '{field.Code}' cannot have numeric or date limits.");
                    if (field.Options is { Count: > 0 }) errors.Add($"Text field '{field.Code}' cannot have options.");
                    break;
                case "Decimal":
                    if (field.TextFormat != "None") errors.Add($"Decimal field '{field.Code}' cannot have a text validation format.");
                    if (field.IsMultiline) errors.Add($"Decimal field '{field.Code}' cannot be multiline.");
                    if (field.MinLength != 0) errors.Add($"Decimal field '{field.Code}' cannot have a minimum text length.");
                    if (field.MinDate is not null || field.MaxDate is not null) errors.Add($"Decimal field '{field.Code}' cannot have date limits.");
                    if (field.MinValue is not null && field.MaxValue is not null && field.MinValue.Value > field.MaxValue.Value)
                        errors.Add($"Decimal field '{field.Code}' minimum value cannot exceed its maximum value.");
                    if (field.MaxLength != 0 || field.Options is { Count: > 0 }) errors.Add($"Field '{field.Code}' has unsupported type-specific settings.");
                    break;
                case "Date":
                    if (field.MinDate is not null && field.MaxDate is not null && field.MinDate.Value > field.MaxDate.Value)
                        errors.Add($"Date field '{field.Code}' earliest date cannot be after its latest date.");
                    if (field.TextFormat != "None") errors.Add($"Field '{field.Code}' cannot have a text validation format.");
                    if (field.IsMultiline) errors.Add($"Field '{field.Code}' cannot be multiline.");
                    if (field.MinLength != 0 || field.MinValue is not null || field.MaxValue is not null)
                        errors.Add($"Field '{field.Code}' has unsupported type-specific settings.");
                    if (field.MaxLength != 0 || field.Options is { Count: > 0 }) errors.Add($"Field '{field.Code}' has unsupported type-specific settings.");
                    break;
                case "Boolean":
                    if (field.TextFormat != "None") errors.Add($"Field '{field.Code}' cannot have a text validation format.");
                    if (field.IsMultiline) errors.Add($"Field '{field.Code}' cannot be multiline.");
                    if (field.MinLength != 0 || field.MinValue is not null || field.MaxValue is not null || field.MinDate is not null || field.MaxDate is not null)
                        errors.Add($"Field '{field.Code}' has unsupported type-specific settings.");
                    if (field.MaxLength != 0 || field.Options is { Count: > 0 }) errors.Add($"Field '{field.Code}' has unsupported type-specific settings.");
                    break;
                case "Choice":
                    if (field.TextFormat != "None") errors.Add($"Choice field '{field.Code}' cannot have a text validation format.");
                    if (field.IsMultiline) errors.Add($"Choice field '{field.Code}' cannot be multiline.");
                    if (field.MinLength != 0 || field.MinValue is not null || field.MaxValue is not null || field.MinDate is not null || field.MaxDate is not null)
                        errors.Add($"Choice field '{field.Code}' cannot have length or numeric limits.");
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

        var fieldIndexes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < fields.Count; index++)
            if (fields[index] is { } field && !string.IsNullOrWhiteSpace(field.Code))
                fieldIndexes.TryAdd(field.Code, index);
        foreach (var (field, index) in fields.Select((field, index) => (field, index)))
        {
            if (field is null) continue;
            ValidateCondition(field, field.VisibleWhenFieldCode, field.VisibleWhenValue, index, fieldIndexes, fields,
                "visibility", errors);
            ValidateCondition(field, field.RequiredWhenFieldCode, field.RequiredWhenValue, index, fieldIndexes, fields,
                "requiredness", errors);
        }

        foreach (var field in fields.Where(field => field is not null && !string.IsNullOrWhiteSpace(field.DefaultValue)))
        {
            if (string.IsNullOrWhiteSpace(field.Code)) continue;
            var validation = ValidateValues(
                [field with { IsRequired = false, VisibleWhenFieldCode = null, VisibleWhenValue = null,
                    RequiredWhenFieldCode = null, RequiredWhenValue = null }],
                new Dictionary<string, string?> { [field.Code] = field.DefaultValue });
            foreach (var error in validation.Errors)
                errors.Add($"Default value for '{field.Code}' is invalid: {error}");
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
        var inputByCode = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var code in values.Keys)
        {
            if (!fieldsByCode.TryGetValue(code, out var field))
                errors.Add($"Unknown form field '{code}'.");
            else if (!inputByCode.TryAdd(field.Code, values[code]))
                errors.Add($"Form field '{field.Code}' was provided more than once.");
        }

        var normalized = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var field in fields)
        {
            if (!IsVisible(field, normalized, fields))
            {
                normalized[field.Code] = null;
                continue;
            }
            inputByCode.TryGetValue(field.Code, out var rawValue);
            rawValue ??= field.DefaultValue;
            var value = rawValue?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                if (IsRequired(field, normalized, fields)) errors.Add($"Field '{field.Label}' is required.");
                normalized[field.Code] = null;
                continue;
            }

            switch (field.DataType)
            {
                case "Text":
                    if (value.Length > field.MaxLength) errors.Add($"Field '{field.Label}' exceeds its {field.MaxLength} character limit.");
                    else if (value.Length < field.MinLength) errors.Add($"Field '{field.Label}' must contain at least {field.MinLength} characters.");
                    else if (field.TextFormat == "Email"
                        && (!MailAddress.TryCreate(value, out var email) || !string.Equals(email.Address, value, StringComparison.OrdinalIgnoreCase)))
                        errors.Add($"Field '{field.Label}' must be a valid email address.");
                    else if (field.TextFormat == "Url"
                        && (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
                            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)))
                        errors.Add($"Field '{field.Label}' must be a valid HTTP or HTTPS address.");
                    else if (field.TextFormat == "Phone" && !IsValidPhone(value))
                        errors.Add($"Field '{field.Label}' must contain a valid phone number with 7 to 15 digits.");
                    normalized[field.Code] = value;
                    break;
                case "Decimal":
                    if (!decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var number))
                        errors.Add($"Field '{field.Label}' must be a decimal number using '.' as the decimal separator.");
                    else
                    {
                        if (field.MinValue is not null && number < field.MinValue.Value) errors.Add($"Field '{field.Label}' must be at least {field.MinValue.Value.ToString(CultureInfo.InvariantCulture)}.");
                        if (field.MaxValue is not null && number > field.MaxValue.Value) errors.Add($"Field '{field.Label}' must be at most {field.MaxValue.Value.ToString(CultureInfo.InvariantCulture)}.");
                        normalized[field.Code] = number.ToString("G29", CultureInfo.InvariantCulture);
                    }
                    break;
                case "Date":
                    if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                        errors.Add($"Field '{field.Label}' must be a date in YYYY-MM-DD format.");
                    else
                    {
                        if (field.MinDate is not null && date < field.MinDate.Value) errors.Add($"Field '{field.Label}' must be on or after {field.MinDate.Value:yyyy-MM-dd}.");
                        if (field.MaxDate is not null && date > field.MaxDate.Value) errors.Add($"Field '{field.Label}' must be on or before {field.MaxDate.Value:yyyy-MM-dd}.");
                        normalized[field.Code] = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                    }
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

    public static bool IsVisible(DynamicFormField field, IReadOnlyDictionary<string, string?> values,
        IReadOnlyList<DynamicFormField> fields)
    {
        return ConditionMatches(field.VisibleWhenFieldCode, field.VisibleWhenValue, values, fields, noConditionValue: true);
    }

    public static bool IsRequired(DynamicFormField field, IReadOnlyDictionary<string, string?> values,
        IReadOnlyList<DynamicFormField> fields) => field.IsRequired
        || ConditionMatches(field.RequiredWhenFieldCode, field.RequiredWhenValue, values, fields, noConditionValue: false);

    private static bool ConditionMatches(string? sourceCode, string? expectedValue,
        IReadOnlyDictionary<string, string?> values, IReadOnlyList<DynamicFormField> fields, bool noConditionValue)
    {
        if (string.IsNullOrWhiteSpace(sourceCode) || expectedValue is null) return noConditionValue;
        if (!values.TryGetValue(sourceCode, out var value) || value is null) return false;
        var source = fields.FirstOrDefault(x => string.Equals(x.Code, sourceCode, StringComparison.OrdinalIgnoreCase));
        if (source?.DataType == "Decimal"
            && decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var actual)
            && decimal.TryParse(expectedValue.Trim(), NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var expected))
            return actual == expected;
        return string.Equals(value.Trim(), expectedValue.Trim(), StringComparison.Ordinal);
    }

    private static void ValidateCondition(DynamicFormField field, string? sourceCode, string? conditionValue, int index,
        IReadOnlyDictionary<string, int> fieldIndexes, IReadOnlyList<DynamicFormField> fields, string conditionName,
        List<string> errors)
    {
        var hasConditionField = !string.IsNullOrWhiteSpace(sourceCode);
        var hasConditionValue = !string.IsNullOrWhiteSpace(conditionValue);
        if (!hasConditionField && !hasConditionValue) return;
        if (!hasConditionField || !hasConditionValue)
        {
            errors.Add($"Field '{field.Code}' {conditionName} condition must include both a source field and a value.");
            return;
        }
        if (!fieldIndexes.TryGetValue(sourceCode!, out var sourceIndex) || sourceIndex >= index)
        {
            errors.Add($"Field '{field.Code}' {conditionName} condition must reference an earlier field.");
            return;
        }
        var source = fields[sourceIndex];
        if (!string.Equals(sourceCode, source.Code, StringComparison.Ordinal))
        {
            errors.Add($"Field '{field.Code}' {conditionName} condition must use the exact code '{source.Code}'.");
            return;
        }
        if (source.DataType == "Choice" && source.Options?.Contains(conditionValue!, StringComparer.Ordinal) != true)
            errors.Add($"Field '{field.Code}' {conditionName} value must match an option in '{source.Label}'.");
        else if (source.DataType == "Boolean" && conditionValue is not ("true" or "false"))
            errors.Add($"Field '{field.Code}' {conditionName} value for '{source.Label}' must be true or false.");
        else if (source.DataType == "Decimal"
            && !decimal.TryParse(conditionValue, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out _))
            errors.Add($"Field '{field.Code}' {conditionName} value for '{source.Label}' must be a decimal number.");
        else if (source.DataType == "Date"
            && !DateOnly.TryParseExact(conditionValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            errors.Add($"Field '{field.Code}' {conditionName} value for '{source.Label}' must use YYYY-MM-DD.");
    }

    private static bool IsValidPhone(string value)
    {
        var digitCount = 0;
        var plusCount = 0;
        foreach (var character in value)
        {
            if (character is >= '0' and <= '9') digitCount++;
            else if (character == '+') plusCount++;
            else if (character is not (' ' or '(' or ')' or '-' or '.')) return false;
        }
        return digitCount is >= 7 and <= 15 && plusCount <= 1
            && (plusCount == 0 || value.TrimStart().StartsWith('+'));
    }

    [GeneratedRegex("^[a-z][a-z0-9_]{0,39}$", RegexOptions.CultureInvariant)]
    private static partial Regex FieldCodeRegex();
}
