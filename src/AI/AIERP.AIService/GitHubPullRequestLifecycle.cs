using System.Net.Http.Json;
using System.Text.Json;

namespace AIERP.AIService;

internal static class GitHubPullRequestLifecycle
{
    private const string MarkReadyMutation = "mutation MarkPullRequestReadyForReview($pullRequestId: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) { pullRequest { id isDraft state } } }";

    public static async Task<bool> MarkReadyForReviewAsync(HttpClient github, string nodeId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(nodeId) || nodeId.Length > 200) return false;
        using var response = await github.PostAsJsonAsync("graphql", new
        {
            query = MarkReadyMutation,
            variables = new { pullRequestId = nodeId }
        }, cancellationToken);
        if (!response.IsSuccessStatusCode) return false;

        try
        {
            using var payload = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            var root = payload.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return false;
            if (root.TryGetProperty("errors", out var errors) &&
                (errors.ValueKind != JsonValueKind.Array || errors.GetArrayLength() > 0)) return false;
            if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object ||
                !data.TryGetProperty("markPullRequestReadyForReview", out var mutation) || mutation.ValueKind != JsonValueKind.Object ||
                !mutation.TryGetProperty("pullRequest", out var pullRequest)) return false;
            return pullRequest.ValueKind == JsonValueKind.Object &&
                pullRequest.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString() == nodeId &&
                pullRequest.TryGetProperty("isDraft", out var isDraft) && isDraft.ValueKind == JsonValueKind.False &&
                pullRequest.TryGetProperty("state", out var state) && state.ValueKind == JsonValueKind.String && state.GetString() == "OPEN";
        }
        catch (JsonException) { return false; }
    }
}
