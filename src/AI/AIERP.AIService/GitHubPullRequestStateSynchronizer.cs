using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class GitHubPullRequestStateSynchronizer
{
    public static bool ApplyVerifiedSnapshot(ReleaseCandidateRecord candidate, string state, bool draft, string? headSha,
        DateTimeOffset? updatedAt)
    {
        if (candidate.GitHubPullRequestNumber is null || string.IsNullOrWhiteSpace(candidate.CommitSha) ||
            string.IsNullOrWhiteSpace(headSha) ||
            !string.Equals(candidate.CommitSha, headSha, StringComparison.OrdinalIgnoreCase) ||
            updatedAt is { } snapshotUpdatedAt && candidate.GitHubPullRequestUpdatedAt is { } currentUpdatedAt && snapshotUpdatedAt < currentUpdatedAt)
            return false;

        candidate.GitHubPullRequestState = draft ? "draft" : state;
        if (updatedAt is { } verifiedUpdatedAt) candidate.GitHubPullRequestUpdatedAt = verifiedUpdatedAt;
        return true;
    }

    public static async Task<int> ApplyAsync(AIStudioDbContext db, GitHubPullRequestWebhookEvent webhook, string deliveryId,
        CancellationToken cancellationToken = default)
    {
        // Never let an unscoped event update every project that happens to use
        // the same repository/PR number. The HTTP parser requires this value,
        // but keep the persistence boundary fail-closed as well.
        if (!webhook.InstallationId.HasValue || webhook.InstallationId.Value <= 0) return 0;
        // Repository names are case-insensitive on GitHub, while database collation can vary.
        var candidatesQuery = db.ReleaseCandidateRecords.Where(x => x.GitHubPullRequestNumber == webhook.Number);
        var projectIds = await db.DevelopmentProjects.AsNoTracking()
            .Where(x => x.GitHubInstallationId == webhook.InstallationId)
            .Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        if (projectIds.Length == 0) return 0;
        candidatesQuery = candidatesQuery.Where(x => projectIds.Contains(x.ProjectId));
        var candidates = await candidatesQuery.ToListAsync(cancellationToken);
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
            string.Equals(candidate.GitHubPullRequestState, "merged", StringComparison.OrdinalIgnoreCase)) return false;
        // A linked release candidate may only be marked releasable when the event
        // proves its current PR head is the exact commit that was tested.
        if (string.IsNullOrWhiteSpace(candidate.CommitSha) || string.IsNullOrWhiteSpace(webhook.HeadSha)) return false;
        var state = string.Equals(candidate.CommitSha, webhook.HeadSha, StringComparison.OrdinalIgnoreCase)
            ? webhook.State
            : "head-changed";
        var stateChanged = !string.Equals(candidate.GitHubPullRequestState, state, StringComparison.OrdinalIgnoreCase);
        // GitHub's updated_at values have second-level precision. Distinct events
        // in the same second can share a timestamp, so reject older events and
        // same-state redeliveries while still applying a real equal-time transition.
        if (candidate.GitHubPullRequestUpdatedAt is { } currentUpdatedAt &&
            (webhook.UpdatedAt < currentUpdatedAt || webhook.UpdatedAt == currentUpdatedAt && !stateChanged)) return false;
        candidate.GitHubPullRequestState = state;
        candidate.GitHubPullRequestUpdatedAt = webhook.UpdatedAt;
        if (stateChanged)
            audit = new AuditEvent { TenantId = candidate.TenantId, UserId = null,
                Action = "studio.github.pull-request.state-synced", Resource = $"{candidate.Id:D}:{webhook.Number}:{webhook.State}:{deliveryId}" };
        return true;
    }
}
