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

        Assert.Equal("1.0.0", set.SchemaVersion);
        Assert.Equal("erp-assistant-orchestration", set.EvaluationSetId);
        Assert.Equal(declaredCases, executableCases);
        Assert.Equal(allIds.Length, allIds.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(11, allIds.Length);
        Assert.False(set.Scoring.SemanticQualityScored);
        Assert.False(set.Scoring.LiveProviderRequired);
        Assert.Equal(5, set.Scoring.RubricForFutureLiveEvaluation.Count);

        output.WriteLine("evaluationSet={0}@{1}; schema={2}; sha256={3}; cases={4}; execution=offline-mocked; semanticQualityScored=false",
            set.EvaluationSetId, set.Version, set.SchemaVersion, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), allIds.Length);
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

    private sealed record EvaluationCase(string Id, string ExpectedTool, string Arguments);

    private sealed record BehaviorCase(string Id);
}
