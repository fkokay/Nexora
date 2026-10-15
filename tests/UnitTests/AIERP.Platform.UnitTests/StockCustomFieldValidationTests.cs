using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class StockCustomFieldValidationTests
{
    [Theory]
    [InlineData(CustomFieldDataType.Text, 8, "  model-x  ", true, "model-x")]
    [InlineData(CustomFieldDataType.Text, 3, "four", false, "")]
    [InlineData(CustomFieldDataType.Decimal, 0, "001.2500", true, "1.25")]
    [InlineData(CustomFieldDataType.Decimal, 0, "1,5", false, "")]
    [InlineData(CustomFieldDataType.Date, 0, "2026-10-15", true, "2026-10-15")]
    [InlineData(CustomFieldDataType.Date, 0, "15.10.2026", false, "")]
    [InlineData(CustomFieldDataType.Boolean, 0, "TRUE", true, "true")]
    [InlineData(CustomFieldDataType.Boolean, 0, "yes", false, "")]
    public void Values_are_normalized_and_checked_against_the_definition(CustomFieldDataType type, int maxLength,
        string input, bool expectedValid, string expected)
    {
        var field = new StockItemCustomFieldDefinition { DataType = type, MaxLength = maxLength };

        var valid = StockCustomFieldValidation.TryNormalize(field, input, out var actual);

        Assert.Equal(expectedValid, valid);
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Empty_values_clear_a_field()
    {
        var field = new StockItemCustomFieldDefinition { DataType = CustomFieldDataType.Decimal };

        Assert.True(StockCustomFieldValidation.TryNormalize(field, "   ", out var actual));
        Assert.Empty(actual);
    }
}
