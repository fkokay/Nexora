using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class GitHubPullRequestStateSynchronizer
{
    public static async Task<int> ApplyAsync(AIStudioDbContext db, GitHubPullRequestWebhookEvent webhook, string deliveryId,
        CancellationToken cancellationToken = default)
    {
        // Repository names are case-insensitive on GitHub, while database collation can vary.
        var candidates = await db.ReleaseCandidateRecords.Where(x => x.GitHubPullRequestNumber == webhook.Number)
            .ToListAsync(cancellationToken);
        var changed = 0;
        foreach (var candidate in candidates)
        {
            if (!TryApply(candidate, webhook, deliveryId, out var audit)) continue;
            if (audit is not null) db.AuditEvents.Add(audit);
            changed++;
        }
        if (changed > 0) await db.SaveChangesAsync(cancellationToken);
        return changed;
    }

    public static bool TryApply(ReleaseCandidateRecord candidate, GitHubPullRequestWebhookEvent webhook, string deliveryId, out AuditEvent? audit)
    {
        audit = null;
        if (!string.Equals(candidate.GitHubRepository, webhook.Repository, StringComparison.OrdinalIgnoreCase) ||
            candidate.GitHubPullRequestNumber != webhook.Number ||
            string.Equals(candidate.GitHubPullRequestState, "merged", StringComparison.OrdinalIgnoreCase) ||
            candidate.GitHubPullRequestUpdatedAt is { } currentUpdatedAt && webhook.UpdatedAt <= currentUpdatedAt) return false;
        // A linked release candidate may only be marked releasable when the event
        // proves its current PR head is the exact commit that was tested.
        if (string.IsNullOrWhiteSpace(candidate.CommitSha) || string.IsNullOrWhiteSpace(webhook.HeadSha)) return false;
        var state = string.Equals(candidate.CommitSha, webhook.HeadSha, StringComparison.OrdinalIgnoreCase)
            ? webhook.State
            : "head-changed";
        var stateChanged = !string.Equals(candidate.GitHubPullRequestState, state, StringComparison.OrdinalIgnoreCase);
        candidate.GitHubPullRequestState = state;
        candidate.GitHubPullRequestUpdatedAt = webhook.UpdatedAt;
        if (stateChanged)
            audit = new AuditEvent { TenantId = candidate.TenantId, UserId = null,
                Action = "studio.github.pull-request.state-synced", Resource = $"{candidate.Id:D}:{webhook.Number}:{webhook.State}:{deliveryId}" };
        return true;
    }
}
