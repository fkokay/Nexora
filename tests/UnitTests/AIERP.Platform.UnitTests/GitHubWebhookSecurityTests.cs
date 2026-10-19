using System.Security.Cryptography;
using System.Text;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public sealed class GitHubWebhookSecurityTests
{
    private const string Secret = "test-webhook-signing-secret-at-least-32-bytes";

    [Theory]
    [InlineData(null, null, true)]
    [InlineData(42, "open", true)]
    [InlineData(42, "merged", true)]
    [InlineData(42, "closed", false)]
    [InlineData(42, "draft", false)]
    [InlineData(42, null, false)]
    [InlineData(42, "unknown", false)]
    public void Release_candidate_requires_an_open_or_merged_linked_pull_request(int? pullRequestNumber, string? state, bool expected)
    {
        var candidate = new ReleaseCandidateRecord
        {
            GitHubPullRequestNumber = pullRequestNumber,
            GitHubPullRequestState = state
        };

        Assert.Equal(expected, GitHubPullRequestReleaseRules.CanRelease(candidate));
    }

    [Fact]
    public void Validates_github_sha256_hmac_and_rejects_modified_or_weak_signatures()
    {
        var body = Encoding.UTF8.GetBytes("{\"action\":\"closed\"}");
        var signature = "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), body)).ToLowerInvariant();

        Assert.True(GitHubWebhookSecurity.ValidateSignature(Secret, signature, body));
        Assert.False(GitHubWebhookSecurity.ValidateSignature(Secret, signature, Encoding.UTF8.GetBytes("{}")));
        Assert.False(GitHubWebhookSecurity.ValidateSignature("weak", signature, body));
        Assert.False(GitHubWebhookSecurity.ValidateSignature(Secret, "sha256=not-hex", body));
    }

    [Fact]
    public void Parses_only_supported_pull_request_actions_and_uses_merged_state()
    {
        const string payload = """
            {"action":"closed","repository":{"full_name":"nexora/erp"},"pull_request":{"number":42,"state":"closed","merged":true,"updated_at":"2026-10-17T10:00:00Z","head":{"sha":"0123456789abcdef0123456789abcdef01234567"}}}
            """;
        Assert.True(GitHubWebhookSecurity.TryParsePullRequestEvent(Encoding.UTF8.GetBytes(payload), out var parsed));
        Assert.Equal(new GitHubPullRequestWebhookEvent("nexora/erp", 42, "merged", "closed", DateTimeOffset.Parse("2026-10-17T10:00:00Z"), "0123456789abcdef0123456789abcdef01234567"), parsed);

        const string ignored = """
            {"action":"edited","repository":{"full_name":"nexora/erp"},"pull_request":{"number":42,"state":"open","merged":false,"updated_at":"2026-10-17T10:00:00Z","head":{"sha":"0123456789abcdef0123456789abcdef01234567"}}}
            """;
        Assert.True(GitHubWebhookSecurity.TryParsePullRequestEvent(Encoding.UTF8.GetBytes(ignored), out var ignoredEvent));
        Assert.Null(ignoredEvent);
        Assert.False(GitHubWebhookSecurity.TryParsePullRequestEvent(Encoding.UTF8.GetBytes("{}"), out _));
    }

    [Fact]
    public void Parses_draft_pull_request_state_and_ready_for_review_as_open()
    {
        const string draft = """
            {"action":"converted_to_draft","repository":{"full_name":"nexora/erp"},"pull_request":{"number":42,"state":"open","draft":true,"merged":false,"updated_at":"2026-10-17T10:00:00Z","head":{"sha":"0123456789abcdef0123456789abcdef01234567"}}}
            """;
        Assert.True(GitHubWebhookSecurity.TryParsePullRequestEvent(Encoding.UTF8.GetBytes(draft), out var parsedDraft));
        Assert.Equal("draft", parsedDraft!.State);

        const string ready = """
            {"action":"ready_for_review","repository":{"full_name":"nexora/erp"},"pull_request":{"number":42,"state":"open","draft":false,"merged":false,"updated_at":"2026-10-17T10:01:00Z","head":{"sha":"0123456789abcdef0123456789abcdef01234567"}}}
            """;
        Assert.True(GitHubWebhookSecurity.TryParsePullRequestEvent(Encoding.UTF8.GetBytes(ready), out var parsedReady));
        Assert.Equal("open", parsedReady!.State);
    }

    [Fact]
    public void Pull_request_sync_rejects_stale_events_and_keeps_merge_terminal()
    {
        var updatedAt = DateTimeOffset.Parse("2026-10-17T10:00:00Z");
        var candidate = new AIERP.Platform.Domain.ReleaseCandidateRecord
        {
            TenantId = Guid.NewGuid(), GitHubRepository = "nexora/erp", GitHubPullRequestNumber = 42,
            GitHubPullRequestState = "open", GitHubPullRequestUpdatedAt = updatedAt,
            CommitSha = "0123456789abcdef0123456789abcdef01234567"
        };
        var stale = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "closed", "closed", updatedAt.AddMinutes(-1), candidate.CommitSha);
        Assert.False(GitHubPullRequestStateSynchronizer.TryApply(candidate, stale, "delivery-stale", out _));
        Assert.Equal("open", candidate.GitHubPullRequestState);

        var current = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "merged", "closed", updatedAt.AddMinutes(1), candidate.CommitSha);
        Assert.True(GitHubPullRequestStateSynchronizer.TryApply(candidate, current, "delivery-current", out var audit));
        Assert.Equal("merged", candidate.GitHubPullRequestState);
        Assert.Equal("studio.github.pull-request.state-synced", audit!.Action);
        Assert.False(GitHubPullRequestStateSynchronizer.TryApply(candidate, current, "delivery-replay", out _));

        var laterReopen = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "open", "reopened", updatedAt.AddHours(1), candidate.CommitSha);
        Assert.False(GitHubPullRequestStateSynchronizer.TryApply(candidate, laterReopen, "delivery-reopen", out _));
        Assert.Equal("merged", candidate.GitHubPullRequestState);
    }

    [Fact]
    public void Pull_request_sync_applies_distinct_same_second_transition_but_ignores_same_state_redelivery()
    {
        var updatedAt = DateTimeOffset.Parse("2026-10-19T10:00:00Z");
        var testedCommit = "0123456789abcdef0123456789abcdef01234567";
        var candidate = new ReleaseCandidateRecord
        {
            TenantId = Guid.NewGuid(), GitHubRepository = "nexora/erp", GitHubPullRequestNumber = 42,
            GitHubPullRequestState = "draft", GitHubPullRequestUpdatedAt = updatedAt, CommitSha = testedCommit
        };
        var ready = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "open", "ready_for_review", updatedAt, testedCommit);

        Assert.True(GitHubPullRequestStateSynchronizer.TryApply(candidate, ready, "delivery-ready", out var audit));
        Assert.Equal("open", candidate.GitHubPullRequestState);
        Assert.Equal("studio.github.pull-request.state-synced", audit!.Action);

        Assert.False(GitHubPullRequestStateSynchronizer.TryApply(candidate, ready, "delivery-redelivery", out var replayAudit));
        Assert.Null(replayAudit);
        Assert.Equal("open", candidate.GitHubPullRequestState);
    }

    [Fact]
    public void Verified_live_review_snapshot_advances_watermark_and_rejects_late_webhook()
    {
        var testedCommit = "0123456789abcdef0123456789abcdef01234567";
        var candidate = new ReleaseCandidateRecord
        {
            CommitSha = testedCommit,
            GitHubRepository = "nexora/erp",
            GitHubPullRequestNumber = 42,
            GitHubPullRequestState = "draft",
            GitHubPullRequestUpdatedAt = DateTimeOffset.Parse("2026-10-19T09:00:00Z")
        };

        Assert.True(GitHubPullRequestStateSynchronizer.ApplyVerifiedSnapshot(candidate, "open", false, testedCommit,
            DateTimeOffset.Parse("2026-10-19T10:00:00Z")));
        Assert.Equal("open", candidate.GitHubPullRequestState);
        Assert.Equal(DateTimeOffset.Parse("2026-10-19T10:00:00Z"), candidate.GitHubPullRequestUpdatedAt);

        var lateWebhook = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "draft", "converted_to_draft",
            DateTimeOffset.Parse("2026-10-19T09:30:00Z"), testedCommit);
        Assert.False(GitHubPullRequestStateSynchronizer.TryApply(candidate, lateWebhook, "delivery-late", out _));
        Assert.Equal("open", candidate.GitHubPullRequestState);
    }

    [Fact]
    public void Verified_live_snapshot_rejects_a_changed_head()
    {
        var candidate = new ReleaseCandidateRecord
        {
            CommitSha = "0123456789abcdef0123456789abcdef01234567",
            GitHubPullRequestNumber = 42,
            GitHubPullRequestState = "open"
        };

        Assert.False(GitHubPullRequestStateSynchronizer.ApplyVerifiedSnapshot(candidate, "open", false,
            "abcdef0123456789abcdef0123456789abcdef01", DateTimeOffset.Parse("2026-10-19T10:00:00Z")));
        Assert.Equal("open", candidate.GitHubPullRequestState);
        Assert.Null(candidate.GitHubPullRequestUpdatedAt);
    }

    [Fact]
    public void Pull_request_sync_rejects_missing_head_sha_for_linked_release_candidate()
    {
        var updatedAt = DateTimeOffset.Parse("2026-10-17T10:00:00Z");
        var testedCommit = "0123456789abcdef0123456789abcdef01234567";
        var candidate = new ReleaseCandidateRecord
        {
            CommitSha = testedCommit,
            GitHubRepository = "nexora/erp",
            GitHubPullRequestNumber = 42,
            GitHubPullRequestState = "head-changed",
            GitHubPullRequestUpdatedAt = updatedAt
        };
        var unverifiable = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "open", "synchronize", updatedAt.AddMinutes(1));

        Assert.False(GitHubPullRequestStateSynchronizer.TryApply(candidate, unverifiable, "delivery-no-head", out var audit));
        Assert.Null(audit);
        Assert.Equal("head-changed", candidate.GitHubPullRequestState);
        Assert.Equal(updatedAt, candidate.GitHubPullRequestUpdatedAt);
        Assert.False(GitHubPullRequestReleaseRules.CanRelease(candidate));
    }

    [Fact]
    public void Pull_request_head_must_match_tested_candidate_commit_for_release()
    {
        var testedCommit = "0123456789abcdef0123456789abcdef01234567";
        var candidate = new ReleaseCandidateRecord
        {
            CommitSha = testedCommit,
            GitHubRepository = "nexora/erp",
            GitHubPullRequestNumber = 42,
            GitHubPullRequestState = "open"
        };
        var changedHead = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "open", "synchronize",
            DateTimeOffset.Parse("2026-10-17T10:01:00Z"), "abcdef0123456789abcdef0123456789abcdef01");

        Assert.True(GitHubPullRequestStateSynchronizer.TryApply(candidate, changedHead, "delivery-head-change", out var audit));
        Assert.Equal("head-changed", candidate.GitHubPullRequestState);
        Assert.Equal("studio.github.pull-request.state-synced", audit!.Action);
        Assert.False(GitHubPullRequestReleaseRules.CanRelease(candidate));

        var restoredHead = changedHead with { UpdatedAt = changedHead.UpdatedAt.AddMinutes(1), HeadSha = testedCommit };
        Assert.True(GitHubPullRequestStateSynchronizer.TryApply(candidate, restoredHead, "delivery-head-restored", out _));
        Assert.Equal("open", candidate.GitHubPullRequestState);
        Assert.True(GitHubPullRequestReleaseRules.CanRelease(candidate));
    }

    [Fact]
    public async Task Pull_request_sync_matches_repository_names_case_insensitively()
    {
        var options = new DbContextOptionsBuilder<AIStudioDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new AIStudioDbContext(options);
        db.ReleaseCandidateRecords.Add(new AIERP.Platform.Domain.ReleaseCandidateRecord
        {
            TenantId = Guid.NewGuid(), GitHubRepository = "Nexora/ERP", GitHubPullRequestNumber = 42,
            GitHubPullRequestState = "open", GitHubPullRequestUpdatedAt = DateTimeOffset.Parse("2026-10-17T10:00:00Z"),
            CommitSha = "0123456789abcdef0123456789abcdef01234567"
        });
        await db.SaveChangesAsync();

        var webhook = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "closed", "closed", DateTimeOffset.Parse("2026-10-17T10:01:00Z"), "0123456789abcdef0123456789abcdef01234567");
        var changed = await GitHubPullRequestStateSynchronizer.ApplyAsync(db, webhook, "delivery-case");

        Assert.Equal(1, changed);
        Assert.Equal("closed", (await db.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);
    }
}
