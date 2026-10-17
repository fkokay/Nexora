using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class TenantBusinessRuleEngineTests
{
    [Fact]
    public void MatchesAllTypedConditionsAgainstPurchaseRequestFacts()
    {
        var conditions = new[]
        {
            new TenantBusinessRuleCondition("lineCount", "GreaterThanOrEqual", "5"),
            new TenantBusinessRuleCondition("description", "Contains", "urgent"),
            new TenantBusinessRuleCondition("requestDate", "OnOrAfter", "2026-10-01")
        };
        var facts = new Dictionary<string, string?>
        {
            ["lineCount"] = "6", ["description"] = "Urgent replacement stock", ["requestDate"] = "2026-10-17",
            ["neededByDate"] = "", ["code"] = "PR-100", ["requesterUserId"] = Guid.NewGuid().ToString("D")
        };

        Assert.True(TenantBusinessRuleEngine.Validate(conditions).IsValid);
        Assert.True(TenantBusinessRuleEngine.Matches(conditions, facts));
        Assert.False(TenantBusinessRuleEngine.Matches(conditions, new Dictionary<string, string?>(facts) { ["lineCount"] = "4" }));
    }

    [Fact]
    public void SupportsEmptyOptionalDatesAndInvariantDecimalValidation()
    {
        var emptyDate = new[] { new TenantBusinessRuleCondition("neededByDate", "IsEmpty", "") };
        var invalidDecimal = TenantBusinessRuleEngine.Validate([new TenantBusinessRuleCondition("lineCount", "GreaterThan", "1,5")]);

        Assert.True(TenantBusinessRuleEngine.Matches(emptyDate, new Dictionary<string, string?> { ["neededByDate"] = "" }));
        Assert.False(invalidDecimal.IsValid);
    }

    [Fact]
    public void RejectsUnknownFieldsMalformedDatesAndNullConditionObjects()
    {
        Assert.False(TenantBusinessRuleEngine.Validate([new TenantBusinessRuleCondition("tenantId", "Equals", "other")]).IsValid);
        Assert.False(TenantBusinessRuleEngine.Validate([new TenantBusinessRuleCondition("requestDate", "After", "17/10/2026")]).IsValid);
        Assert.False(TenantBusinessRuleEngine.Validate([new TenantBusinessRuleCondition("description", "Contains", "")]).IsValid);
        Assert.False(TenantBusinessRuleEngine.Validate([null!]).IsValid);
    }

    [Fact]
    public void ValidatesSalesQuoteAcceptedTriggerWithQuoteSpecificFacts()
    {
        var conditions = new[]
        {
            new TenantBusinessRuleCondition("currencyCode", "Equals", "TRY"),
            new TenantBusinessRuleCondition("grandTotal", "GreaterThanOrEqual", "100000"),
            new TenantBusinessRuleCondition("validUntil", "OnOrAfter", "2026-10-01")
        };
        var facts = new Dictionary<string, string?>
        {
            ["currencyCode"] = "TRY", ["grandTotal"] = "125000.50", ["validUntil"] = "2026-10-31",
            ["code"] = "SQ-100", ["customerId"] = Guid.NewGuid().ToString("D"), ["lineCount"] = "3", ["quoteDate"] = "2026-10-17"
        };

        Assert.True(TenantBusinessRuleEngine.Validate(conditions, TenantBusinessRuleEngine.SalesQuoteAccepted).IsValid);
        Assert.True(TenantBusinessRuleEngine.Matches(conditions, facts));
        Assert.False(TenantBusinessRuleEngine.Validate(
            [new TenantBusinessRuleCondition("neededByDate", "IsEmpty", "")], TenantBusinessRuleEngine.SalesQuoteAccepted).IsValid);
        Assert.False(TenantBusinessRuleEngine.Validate(conditions, "unsupported.event").IsValid);
    }

    [Theory]
    [InlineData("large-request-routing", true)]
    [InlineData("Large_Request", false)]
    public void ValidatesBusinessRuleCodes(string code, bool expected) =>
        Assert.Equal(expected, TenantBusinessRuleEngine.IsValidCode(code));
}
