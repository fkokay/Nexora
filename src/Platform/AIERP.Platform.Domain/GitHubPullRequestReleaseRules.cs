namespace AIERP.Platform.Domain;

public static class GitHubPullRequestReleaseRules
{
    public static bool CanRelease(ReleaseCandidateRecord candidate)
    {
        ArgumentNullException.ThrowIfNull(candidate);
        if (candidate.GitHubPullRequestNumber is null) return true;
        return string.Equals(candidate.GitHubPullRequestState, "open", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(candidate.GitHubPullRequestState, "merged", StringComparison.OrdinalIgnoreCase);
    }
}
