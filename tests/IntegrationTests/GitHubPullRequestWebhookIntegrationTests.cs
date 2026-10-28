using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.AIService;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class GitHubPullRequestWebhookIntegrationTests
{
    private const string Secret = "test-webhook-signing-secret-at-least-32-bytes";
    private const string TestedSha = "0123456789abcdef0123456789abcdef01234567";
    private const string ChangedSha = "abcdef0123456789abcdef0123456789abcdef01";

    [Fact]
    public void Older_webhook_snapshot_cannot_regress_newer_pull_request_state_or_tested_head()
    {
        var latest = DateTimeOffset.Parse("2026-10-19T10:05:00Z");
        var candidate = new ReleaseCandidateRecord
        {
            TenantId = Guid.NewGuid(), GitHubRepository = "nexora/erp", GitHubPullRequestNumber = 42,
            CommitSha = TestedSha, GitHubPullRequestState = "open", GitHubPullRequestUpdatedAt = latest
        };
        var stale = new GitHubPullRequestWebhookEvent("nexora/erp", 42, "closed", "closed",
            latest.AddMinutes(-1), ChangedSha);

        var applied = GitHubPullRequestStateSynchronizer.TryApply(candidate, stale, "stale-delivery", out var audit);

        Assert.False(applied);
        Assert.Null(audit);
        Assert.Equal("open", candidate.GitHubPullRequestState);
        Assert.Equal(latest, candidate.GitHubPullRequestUpdatedAt);
        Assert.True(AIERP.Platform.Domain.GitHubPullRequestReleaseRules.CanRelease(candidate));
    }

    [Fact]
    public async Task Signed_route_tracks_pull_request_lifecycle_and_rejects_invalid_signature()
    {
        var options = new DbContextOptionsBuilder<AIStudioDbContext>()
            .UseInMemoryDatabase($"github-webhook-{Guid.NewGuid():N}").Options;
        await using var studioDb = new AIStudioDbContext(options);
        var tenantId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        studioDb.DevelopmentProjects.Add(new DevelopmentProject
        {
            Id = projectId,
            TenantId = tenantId,
            CreatedByUserId = Guid.NewGuid(),
            Name = "Webhook integration project",
            RepositoryUrl = "https://github.com/nexora/erp",
            DefaultBranch = "main",
            GitHubInstallationId = 12345
        });
        studioDb.ReleaseCandidateRecords.Add(new ReleaseCandidateRecord
        {
            TenantId = tenantId, ProjectId = projectId, GitHubRepository = "nexora/erp", GitHubPullRequestNumber = 42,
            CommitSha = TestedSha, GitHubPullRequestState = "draft"
        });
        await studioDb.SaveChangesAsync();

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["GitHub:WebhookSecret"] = Secret });
        builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("github-webhook", limiter =>
        {
            limiter.PermitLimit = 30;
            limiter.Window = TimeSpan.FromMinutes(1);
            limiter.QueueLimit = 0;
        }));
        await using var app = builder.Build();
        app.UseRateLimiter();
        var callbackCount = 0;
        app.MapGitHubWebhook(async (_, webhook, deliveryId, cancellationToken) =>
        {
            Interlocked.Increment(ref callbackCount);
            var changed = await GitHubPullRequestStateSynchronizer.ApplyAsync(studioDb, webhook, deliveryId, cancellationToken);
            return Results.Ok(new { updated = changed });
        }).RequireRateLimiting("github-webhook");
        await app.StartAsync();

        using var client = app.GetTestClient();
        var time = DateTimeOffset.Parse("2026-10-18T10:00:00Z");
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "opened", "open", false, true, TestedSha, time)).StatusCode);
        Assert.Equal("draft", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);

        time = time.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "ready_for_review", "open", false, false, TestedSha, time)).StatusCode);
        Assert.Equal("open", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);

        time = time.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "synchronize", "open", false, false, ChangedSha, time)).StatusCode);
        var candidate = await studioDb.ReleaseCandidateRecords.SingleAsync();
        Assert.Equal("head-changed", candidate.GitHubPullRequestState);
        Assert.False(AIERP.Platform.Domain.GitHubPullRequestReleaseRules.CanRelease(candidate));

        time = time.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "synchronize", "open", false, false, TestedSha, time)).StatusCode);
        Assert.Equal("open", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);

        time = time.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "closed", "closed", false, false, TestedSha, time)).StatusCode);
        Assert.Equal("closed", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);

        time = time.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "reopened", "open", false, false, TestedSha, time)).StatusCode);
        Assert.Equal("open", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);

        time = time.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "closed", "closed", true, false, TestedSha, time)).StatusCode);
        Assert.Equal("merged", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);

        time = time.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, "reopened", "open", false, false, TestedSha, time)).StatusCode);
        Assert.Equal("merged", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);

        var callbackCountBeforeInvalidSignature = callbackCount;
        var invalidResponse = await SendAsync(client, "synchronize", "open", false, false, ChangedSha, time.AddMinutes(1), corruptSignature: true);
        Assert.Equal(HttpStatusCode.Unauthorized, invalidResponse.StatusCode);
        Assert.Equal("merged", (await studioDb.ReleaseCandidateRecords.SingleAsync()).GitHubPullRequestState);
        Assert.Equal(callbackCountBeforeInvalidSignature, callbackCount);
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, string action, string state,
        bool merged, bool draft, string headSha, DateTimeOffset updatedAt, bool corruptSignature = false)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            action,
            installation = new { id = 12345L },
            repository = new { full_name = "nexora/erp" },
            pull_request = new { number = 42, state, merged, draft, updated_at = updatedAt, head = new { sha = headSha } }
        });
        var digest = HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), payload);
        if (corruptSignature) digest[0] ^= 0xff;
        using var request = new HttpRequestMessage(HttpMethod.Post, "/studio/github/webhook")
        {
            Content = new ByteArrayContent(payload)
        };
        request.Headers.Add("X-GitHub-Delivery", Guid.NewGuid().ToString("D"));
        request.Headers.Add("X-GitHub-Event", "pull_request");
        request.Headers.Add("X-Hub-Signature-256", $"sha256={Convert.ToHexString(digest).ToLowerInvariant()}");
        return await client.SendAsync(request);
    }
}
