using AIERP.Platform.Application;
using Xunit;

namespace AIERP.Platform.UnitTests;

/// <summary>Belge kuralları PR 3, task 2: applying a rule set to the facts of an order.</summary>
public sealed class DocumentRuleEvaluatorTests
{
    private static readonly Guid Mehmet = Guid.NewGuid(), Ayse = Guid.NewGuid();

    private static DocumentRule Rule(string code, string field, string op, string value, DocumentRuleAction action = DocumentRuleAction.Warn,
        int order = 1, bool enabled = true, bool always = false, params Guid[] people) =>
        new(code, order, enabled, always, always ? null : field, always ? null : op, always ? null : value, action,
            action == DocumentRuleAction.Approval ? people : [], action == DocumentRuleAction.Approval ? null : "mesaj " + code);

    private static readonly IReadOnlyDictionary<string, object?> Facts = new Dictionary<string, object?>
    {
        ["grandTotal"] = 120000m, ["lineCount"] = 3m, ["maxLineDiscount"] = 5m, ["customerGroup"] = "Toptan", ["currency"] = "TRY",
        ["salesperson"] = null, ["orderDate"] = new DateOnly(2026, 11, 26), ["deliveryDate"] = new DateOnly(2026, 12, 5)
    };

    private static bool Hits(DocumentRule rule) => DocumentRuleEvaluator.Evaluate([rule], Facts).Matched.Count == 1;

    [Theory]
    [InlineData("grandTotal", "GreaterThan", "100000", true)]
    [InlineData("grandTotal", "GreaterThanOrEqual", "120000", true)]
    [InlineData("grandTotal", "LessThan", "120000", false)]
    [InlineData("grandTotal", "LessThanOrEqual", "120000", true)]
    [InlineData("grandTotal", "Equals", "120000.00", true)]
    [InlineData("grandTotal", "NotEquals", "1", true)]
    [InlineData("customerGroup", "Equals", "toptan", true)]
    [InlineData("customerGroup", "Contains", "opt", true)]
    [InlineData("customerGroup", "NotEquals", "Toptan", false)]
    [InlineData("salesperson", "IsEmpty", "", true)]
    [InlineData("currency", "IsNotEmpty", "", true)]
    [InlineData("deliveryDate", "Before", "2026-12-06", true)]
    [InlineData("deliveryDate", "OnOrAfter", "2026-12-05", true)]
    [InlineData("orderDate", "After", "2026-11-26", false)]
    public void Operators_compare_like_the_business_rule_engine(string field, string op, string value, bool expected) =>
        Assert.Equal(expected, Hits(Rule("k", field, op, value)));

    [Fact]
    public void Missing_fact_never_matches_a_comparison()
    {
        Assert.False(Hits(Rule("k", "discountTotal", "GreaterThan", "0")));
        Assert.True(Hits(Rule("k", "discountTotal", "IsEmpty", "")));
    }

    [Fact]
    public void Always_matches_and_disabled_rules_are_ignored()
    {
        Assert.True(Hits(Rule("k", "", "", "", always: true)));
        Assert.False(Hits(Rule("k", "grandTotal", "GreaterThan", "0", enabled: false)));
    }

    [Fact]
    public void Outcome_splits_blocks_approvals_and_warnings_in_rule_order()
    {
        var outcome = DocumentRuleEvaluator.Evaluate(
        [
            Rule("onay2", "grandTotal", "GreaterThan", "50000", DocumentRuleAction.Approval, order: 3, people: Ayse),
            Rule("uyari", "lineCount", "GreaterThan", "1", order: 2),
            Rule("onay1", "grandTotal", "GreaterThan", "100000", DocumentRuleAction.Approval, order: 1, people: Mehmet),
            Rule("engel", "customerGroup", "Equals", "Kara liste", DocumentRuleAction.Block, order: 4)
        ], Facts);

        Assert.Empty(outcome.Blocks);
        Assert.Equal(["onay1", "onay2"], outcome.Approvals.Select(x => x.Code));
        Assert.Equal(["uyari"], outcome.Warnings.Select(x => x.Code));
        Assert.Equal(["onay1", "uyari", "onay2"], outcome.Matched.Select(x => x.Code));
    }

    [Fact]
    public void Block_is_reported_first()
    {
        var outcome = DocumentRuleEvaluator.Evaluate(
            [Rule("engel", "customerGroup", "Equals", "Toptan", DocumentRuleAction.Block), Rule("uyari", "lineCount", "GreaterThan", "1")], Facts);

        Assert.Equal("engel", outcome.Blocks.Single().Code);
        Assert.Equal("mesaj engel", outcome.Blocks.Single().Message);
    }
}
