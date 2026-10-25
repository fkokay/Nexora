using System.Security.Cryptography;
using System.Text.Json;
using Xunit.Abstractions;

namespace AIERP.Platform.UnitTests;

/// <summary>Checks that the versioned offline evaluation contract stays aligned with the executable scripted scenarios.</summary>
public sealed class AIERPAssistantEvaluationContractTests(ITestOutputHelper output)
{
    [Fact]
    public void Versioned_dataset_matches_the_scripted_tool_matrix_and_declares_its_semantic_limit()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "EvaluationSets", "erp-assistant-orchestration-v1.json");
        var bytes = File.ReadAllBytes(path);
        var set = JsonSerializer.Deserialize<EvaluationSet>(bytes, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(set);

        var executableCases = ERPAssistantOrchestrationEvaluationTests.AllowedToolCases
            .Select(item => new { Id = (string)item[0], Tool = (string)item[1], Arguments = (string)item[2] })
            .OrderBy(item => item.Id, StringComparer.Ordinal)
            .ToArray();
        var declaredCases = set.Cases
            .Select(item => new { item.Id, Tool = item.ExpectedTool, Arguments = item.Arguments })
            .OrderBy(item => item.Id, StringComparer.Ordinal)
            .ToArray();
        var allIds = set.Cases.Select(item => item.Id).Concat(set.BehaviorCases.Select(item => item.Id)).ToArray();
        var declaredScenarios = set.Cases.Select(item => (item.Id, item.Assertions))
            .Concat(set.BehaviorCases.Select(item => (item.Id, item.Assertions))).ToArray();

        Assert.Equal("1.0.0", set.SchemaVersion);
        Assert.Equal("erp-assistant-orchestration", set.EvaluationSetId);
        Assert.Equal(declaredCases, executableCases);
        foreach (var reportCase in set.Cases.Where(item => item.ExpectedTool == "generate_report"))
            AssertStrictReportArguments(reportCase.Arguments);
        Assert.Equal(allIds.Length, allIds.Distinct(StringComparer.Ordinal).Count());
        Assert.All(declaredScenarios, scenario =>
        {
            Assert.NotEmpty(scenario.Assertions);
            Assert.Equal(scenario.Assertions.Count, scenario.Assertions.Distinct(StringComparer.Ordinal).Count());
        });
        Assert.Equal(27, allIds.Length);
        Assert.False(set.Scoring.SemanticQualityScored);
        Assert.False(set.Scoring.LiveProviderRequired);
        Assert.Equal(5, set.Scoring.RubricForFutureLiveEvaluation.Count);

        output.WriteLine("evaluationSet={0}@{1}; schema={2}; sha256={3}; cases={4}; execution=offline-mocked; semanticQualityScored=false",
            set.EvaluationSetId, set.Version, set.SchemaVersion, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), allIds.Length);
    }

    [Fact]
    public void Live_quality_set_limits_each_case_to_applicable_review_dimensions()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "EvaluationSets", "erp-assistant-live-quality-v1.json");
        var bytes = File.ReadAllBytes(path);
        var set = JsonSerializer.Deserialize<LiveEvaluationSet>(bytes, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(set);
        Assert.Equal("erp-assistant-live-quality", set.EvaluationSetId);
        Assert.Equal("1.2.1", set.Version);
        Assert.Equal(1, set.Execution.MaximumExternalRequests);
        Assert.False(set.Execution.AutomaticRetries);
        Assert.False(set.Execution.ToolsEnabled);
        Assert.False(set.Execution.TenantDataAllowed);
        Assert.False(set.Execution.Store);
        Assert.Equal(2, set.ReviewPolicy.MinimumReviewers);
        Assert.True(set.ReviewPolicy.IndependentReviewRequired);
        Assert.Equal("human", set.ReviewPolicy.ReviewerNature);
        Assert.True(set.ReviewPolicy.IdentityAttestationRequired);
        Assert.True(set.ReviewPolicy.TwoDistinctPeopleRequired);
        Assert.True(set.ReviewPolicy.AdjudicatorMustDifferFromReviewers);
        Assert.True(set.ReviewPolicy.ReviewersMustApprove);
        Assert.True(set.ReviewPolicy.AdjudicatorMustApproveWhenRequired);
        Assert.Equal("third-reviewer-adjudication", set.ReviewPolicy.DisagreementResolution);

        var rubricIds = set.Rubric.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
        Assert.Equal(5, rubricIds.Count);
        Assert.All(set.Rubric, item =>
        {
            Assert.Equal(new[] { 0, 1, 2 }, item.Scale);
            Assert.Equal(2, item.PassAt);
        });
        Assert.Equal(set.Cases.Count, set.Cases.Select(item => item.Id).Distinct(StringComparer.Ordinal).Count());
        Assert.All(set.Cases, item =>
        {
            Assert.NotEmpty(item.CriticalChecks);
            Assert.NotEmpty(item.ApplicableRubricDimensions);
            Assert.Equal(item.ApplicableRubricDimensions.Count, item.ApplicableRubricDimensions.Distinct(StringComparer.Ordinal).Count());
            Assert.All(item.ApplicableRubricDimensions, dimension => Assert.Contains(dimension, rubricIds));
        });

        Assert.Equal(new[] { "factual-grounding", "intent-relevance" },
            set.Cases.Single(item => item.Id == "inventory-arithmetic").ApplicableRubricDimensions);
        Assert.Contains("instruction-boundary",
            set.Cases.Single(item => item.Id == "untrusted-fact-injection").ApplicableRubricDimensions);
        Assert.DoesNotContain("instruction-boundary",
            set.Cases.Single(item => item.Id == "inventory-arithmetic").ApplicableRubricDimensions);
        Assert.Contains("uncertainty-and-refusal",
            set.Cases.Single(item => item.Id == "missing-fact-uncertainty").ApplicableRubricDimensions);

        output.WriteLine("evaluationSet={0}@{1}; sha256={2}; cases={3}; rubricDimensions={4}; execution=one-request-synthetic-only",
            set.EvaluationSetId, set.Version, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), set.Cases.Count, rubricIds.Count);
    }

    [Fact]
    public void Live_review_contract_requires_two_independent_reviewers_and_third_party_adjudication()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "EvaluationSets", "erp-assistant-live-quality-v1.json");
        var set = JsonSerializer.Deserialize<LiveEvaluationSet>(File.ReadAllBytes(path), new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(set);
        Assert.Equal(2, set.ReviewPolicy.MinimumReviewers);
        Assert.True(set.ReviewPolicy.IndependentReviewRequired);
        Assert.Equal("human", set.ReviewPolicy.ReviewerNature);
        Assert.True(set.ReviewPolicy.IdentityAttestationRequired);
        Assert.True(set.ReviewPolicy.TwoDistinctPeopleRequired);
        Assert.Equal("third-reviewer-adjudication", set.ReviewPolicy.DisagreementResolution);
        Assert.True(set.ReviewPolicy.AdjudicatorMustDifferFromReviewers);
        Assert.True(set.ReviewPolicy.ReviewersMustApprove);
        Assert.True(set.ReviewPolicy.AdjudicatorMustApproveWhenRequired);
        Assert.False(set.Execution.Store);
        Assert.False(set.Execution.TenantDataAllowed);
        Assert.False(set.Execution.AutomaticRetries);
        Assert.Equal(1, set.Execution.MaximumExternalRequests);
    }

    private sealed record EvaluationSet(
        string SchemaVersion,
        string EvaluationSetId,
        string Version,
        string Purpose,
        string Provider,
        string Model,
        EvaluationScoring Scoring,
        IReadOnlyList<EvaluationCase> Cases,
        IReadOnlyList<BehaviorCase> BehaviorCases);

    private sealed record EvaluationScoring(
        bool SemanticQualityScored,
        bool LiveProviderRequired,
        IReadOnlyList<RubricItem> RubricForFutureLiveEvaluation);

    private sealed record RubricItem(string Id, string Scale, int PassAt, string Description);

    private sealed record LiveEvaluationSet(
        string EvaluationSetId,
        string Version,
        LiveExecution Execution,
        IReadOnlyList<LiveEvaluationCase> Cases,
        IReadOnlyList<LiveRubricItem> Rubric,
        LiveReviewPolicy ReviewPolicy);

    private sealed record LiveReviewPolicy(
        int MinimumReviewers,
        bool IndependentReviewRequired,
        string ReviewerNature,
        bool IdentityAttestationRequired,
        bool TwoDistinctPeopleRequired,
        string DisagreementResolution,
        bool AdjudicatorMustDifferFromReviewers,
        bool ReviewersMustApprove,
        bool AdjudicatorMustApproveWhenRequired);

    private sealed record LiveExecution(
        int MaximumExternalRequests,
        bool AutomaticRetries,
        bool ToolsEnabled,
        bool TenantDataAllowed,
        bool Store,
        int MaximumOutputTokens);

    private sealed record LiveEvaluationCase(
        string Id,
        IReadOnlyList<string> CriticalChecks,
        IReadOnlyList<string> ApplicableRubricDimensions);

    private sealed record LiveRubricItem(string Id, IReadOnlyList<int> Scale, int PassAt, string Description);

    private sealed record EvaluationCase(string Id, string ExpectedTool, string Arguments, IReadOnlyList<string> Assertions);

    private sealed record BehaviorCase(string Id, IReadOnlyList<string> Assertions);

    private static void AssertStrictReportArguments(string arguments)
    {
        using var document = JsonDocument.Parse(arguments);
        var root = document.RootElement;
        Assert.Equal(JsonValueKind.Object, root.ValueKind);
        Assert.Equal(new[] { "columns", "descending", "filters", "sortBy", "source" },
            root.EnumerateObject().Select(property => property.Name).OrderBy(name => name, StringComparer.Ordinal));
        Assert.All(new[] { "source", "sortBy" }, property => Assert.False(string.IsNullOrWhiteSpace(root.GetProperty(property).GetString())));
        Assert.True(root.GetProperty("descending").ValueKind is JsonValueKind.True or JsonValueKind.False);

        var columns = root.GetProperty("columns").EnumerateArray().Select(column => column.GetString()).ToArray();
        Assert.InRange(columns.Length, 1, 10);
        Assert.Contains(root.GetProperty("sortBy").GetString(), columns);

        var filters = root.GetProperty("filters").EnumerateArray();
        Assert.InRange(filters.Count(), 0, 5);
        foreach (var filter in filters)
        {
            Assert.Equal(new[] { "field", "operator", "value" },
                filter.EnumerateObject().Select(property => property.Name).OrderBy(name => name, StringComparer.Ordinal));
            Assert.Contains(filter.GetProperty("operator").GetString(), new[] { "equals", "contains", "gt", "gte", "lt", "lte", "isNull" });
        }
    }
}
