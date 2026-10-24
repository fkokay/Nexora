using System.Net;
using System.Net.Http.Json;

namespace AIERP.AIService;

internal sealed record GitHubPullRequestPublishResult(
    global::GitHubPullRequestResponse? PullRequest,
    bool Created,
    string? Failure)
{
    public bool Succeeded => PullRequest is not null && Failure is null;
}

/// <summary>
/// Publishes a draft PR idempotently. GitHub can reject a concurrent duplicate
/// create with 422 after the initial open-PR lookup returned no match; in that
/// case, re-read the exact head/base pair and reuse the PR created by the race.
/// </summary>
internal static class GitHubPullRequestPublisher
{
    public static async Task<GitHubPullRequestPublishResult> PublishAsync(
        HttpClient github,
        string owner,
        string repository,
        string headBranch,
        string baseBranch,
        string title,
        string body,
        CancellationToken cancellationToken)
    {
        var repositoryPath = $"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repository)}/pulls";
        var lookupPath = BuildLookupPath(repositoryPath, owner, headBranch, baseBranch);
        var existing = await FindOpenPullRequestAsync(github, lookupPath, cancellationToken);
        if (existing.LookupFailed)
            return new(null, false, "Dal gönderildi ancak açık PR durumu okunamadı.");
        if (IsValid(existing.PullRequest)) return new(existing.PullRequest, false, null);

        using var createResponse = await github.PostAsJsonAsync(repositoryPath,
            new { title, body, head = headBranch, @base = baseBranch, draft = true }, cancellationToken);
        if (createResponse.StatusCode == HttpStatusCode.UnprocessableEntity)
        {
            // Another request may have created this same PR between lookup and POST.
            var afterConflict = await FindOpenPullRequestAsync(github, lookupPath, cancellationToken);
            if (IsValid(afterConflict.PullRequest)) return new(afterConflict.PullRequest, false, null);
        }
        else if (createResponse.IsSuccessStatusCode)
        {
            global::GitHubPullRequestResponse? created;
            try
            {
                created = await createResponse.Content.ReadFromJsonAsync<global::GitHubPullRequestResponse>(cancellationToken: cancellationToken);
            }
            catch (System.Text.Json.JsonException)
            {
                return new(null, false, "GitHub geçersiz PR yanıtı döndürdü.");
            }

            if (IsValid(created) && created!.Draft) return new(created, true, null);
            return new(null, false, "GitHub geçersiz PR yanıtı döndürdü.");
        }

        return new(null, false, "Dal gönderildi ancak GitHub PR oluşturmayı reddetti.");
    }

    private static string BuildLookupPath(string repositoryPath, string owner, string headBranch, string baseBranch) =>
        $"{repositoryPath}?state=open&head={Uri.EscapeDataString($"{owner}:{headBranch}")}&base={Uri.EscapeDataString(baseBranch)}";

    private static async Task<(global::GitHubPullRequestResponse? PullRequest, bool LookupFailed)> FindOpenPullRequestAsync(
        HttpClient github, string lookupPath, CancellationToken cancellationToken)
    {
        using var response = await github.GetAsync(lookupPath, cancellationToken);
        if (!response.IsSuccessStatusCode) return (null, true);
        try
        {
            var openPullRequests = await response.Content.ReadFromJsonAsync<List<global::GitHubPullRequestResponse>>(cancellationToken: cancellationToken) ?? [];
            if (openPullRequests.Count == 0) return (null, false);
            var matchingPullRequest = openPullRequests.FirstOrDefault(IsValid);
            return matchingPullRequest is null ? (null, true) : (matchingPullRequest, false);
        }
        catch (System.Text.Json.JsonException) { return (null, true); }
    }

    private static bool IsValid(global::GitHubPullRequestResponse? pullRequest) =>
        pullRequest is { Number: > 0, State: "open" } &&
        Uri.TryCreate(pullRequest.HtmlUrl, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps &&
        string.Equals(uri.Host, "github.com", StringComparison.OrdinalIgnoreCase);
}
