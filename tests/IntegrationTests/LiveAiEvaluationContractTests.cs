using System.Text.Json;
using AIERP.Api;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class LiveAiEvaluationContractTests
{
    [Fact]
    public void Only_fixed_synthetic_cases_can_create_store_false_tool_free_request()
    {
        Assert.Equal(5, LiveAiEvaluation.AllCases.Count);
        Assert.False(LiveAiEvaluation.TryGetCase("custom prompt", out _));
        Assert.False(LiveAiEvaluation.TryGetCase(null, out _));

        foreach (var evaluationCase in LiveAiEvaluation.AllCases)
        {
            using var document = JsonDocument.Parse(LiveAiEvaluation.BuildResponsesRequest("gpt-test", evaluationCase));
            var root = document.RootElement;
            Assert.Equal("gpt-test", root.GetProperty("model").GetString());
            Assert.False(root.GetProperty("store").GetBoolean());
            Assert.Equal(700, root.GetProperty("max_output_tokens").GetInt32());
            Assert.False(root.TryGetProperty("tools", out _));
            Assert.False(root.TryGetProperty("tool_choice", out _));
            Assert.False(root.TryGetProperty("previous_response_id", out _));
            Assert.Equal(JsonValueKind.String, root.GetProperty("input").ValueKind);
            Assert.Contains(evaluationCase.Prompt, root.GetProperty("input").GetString());
            Assert.Contains(evaluationCase.SyntheticFacts, root.GetProperty("input").GetString());
        }
    }

    [Fact]
    public void Extract_answer_accepts_only_completed_bounded_text_response()
    {
        using var completed = JsonDocument.Parse("""
            {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"17"}]}]}
            """);
        Assert.Equal("17", LiveAiEvaluation.ExtractAnswer(completed.RootElement));

        using var incomplete = JsonDocument.Parse("""
            {"status":"in_progress","output":[{"type":"message","content":[{"type":"output_text","text":"17"}]}]}
            """);
        Assert.Null(LiveAiEvaluation.ExtractAnswer(incomplete.RootElement));
    }
}
