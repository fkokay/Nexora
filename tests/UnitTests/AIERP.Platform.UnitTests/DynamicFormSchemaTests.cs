using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class DynamicFormSchemaTests
{
    [Fact]
    public void ValidatesTypedFormFieldsAndNormalizesSubmittedValues()
    {
        var fields = new[]
        {
            new DynamicFormField("summary", "Summary", "Text", true, 80),
            new DynamicFormField("amount", "Amount", "Decimal", true),
            new DynamicFormField("due_date", "Due date", "Date", false),
            new DynamicFormField("urgent", "Urgent", "Boolean", true),
            new DynamicFormField("category", "Category", "Choice", true, Options: ["Support", "Finance"])
        };

        var schema = DynamicFormSchema.ValidateFields(fields);
        var submission = DynamicFormSchema.ValidateValues(fields, new Dictionary<string, string?>
        {
            ["summary"] = "  Review invoice  ", ["amount"] = "12.50", ["due_date"] = "2026-10-20",
            ["urgent"] = "TRUE", ["category"] = "Finance"
        });

        Assert.True(schema.IsValid, string.Join("; ", schema.Errors));
        Assert.Empty(submission.Errors);
        Assert.Equal("Review invoice", submission.Values!["summary"]);
        Assert.Equal("12.5", submission.Values["amount"]);
        Assert.Equal("true", submission.Values["urgent"]);
    }

    [Fact]
    public void RejectsUnknownFieldsMissingRequiredValuesAndInvalidTypedValues()
    {
        var fields = new[]
        {
            new DynamicFormField("quantity", "Quantity", "Decimal", true),
            new DynamicFormField("state", "State", "Choice", true, Options: ["Open", "Closed"])
        };

        var result = DynamicFormSchema.ValidateValues(fields, new Dictionary<string, string?>
        {
            ["quantity"] = "1,5", ["state"] = "Other", ["unexpected"] = "value"
        });

        Assert.Null(result.Values);
        Assert.Equal(3, result.Errors.Count);
    }

    [Fact]
    public void RejectsDuplicateCodesAndUnsupportedFieldTypes()
    {
        var result = DynamicFormSchema.ValidateFields([
            new DynamicFormField("serial", "Serial", "Text", false, 30),
            new DynamicFormField("serial", "Duplicate", "Unsupported", false)
        ]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("duplicated", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(result.Errors, error => error.Contains("unsupported", StringComparison.OrdinalIgnoreCase));
    }
}
