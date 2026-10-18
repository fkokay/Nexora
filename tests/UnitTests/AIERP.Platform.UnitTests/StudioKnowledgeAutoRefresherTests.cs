using System.Net;
using System.Text;
using System.Text.Json;
using AIERP.AIService;
using AIERP.AIService.AI;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.UnitTests;

public sealed class StudioKnowledgeAutoRefresherTests
{
    [Fact]
    public async Task Refresh_reads_only_consented_workspace_paths_and_saves_changed_snapshot()
    {
        var (db, tenantId, projectId, requestId, userId) = await CreateContextAsync();
        await SeedConsentAsync(db, tenantId, projectId, requestId, "src/allowed.cs");
        string? requestedPath = null;
        var clients = new StubHttpClientFactory((request, _) =>
        {
            requestedPath = Uri.UnescapeDataString(request.RequestUri!.Query[6..]);
            return Task.FromResult(FileResponse("src/allowed.cs", "public sealed class Current {}"));
        });
        var provider = new FakeAIModelProvider();

        var result = await RefreshAsync(db, tenantId, projectId, requestId, userId, clients, provider);

        Assert.True(result.Success);
        Assert.Equal(1, result.Updated);
        Assert.Equal("src/allowed.cs", requestedPath);
        var document = await db.StudioKnowledgeDocuments.SingleAsync();
        Assert.Equal("public sealed class Current {}", document.Content);
        Assert.Equal("working-tree", document.CommitSha);
        Assert.Contains("public sealed class Current {}", Assert.Single(provider.EmbeddedInputs));
        Assert.InRange((await db.StudioKnowledgeRefreshConsents.SingleAsync()).LastRefreshedAt, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task Refresh_tombstones_missing_source_and_removes_its_persistent_consent()
    {
        var (db, tenantId, projectId, requestId, userId) = await CreateContextAsync();
        await SeedConsentAsync(db, tenantId, projectId, requestId, "src/removed.cs");
        db.StudioKnowledgeDocuments.Add(new StudioKnowledgeDocument
        {
            TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = requestId, IndexedByUserId = userId,
            Path = "src/removed.cs", ContentSha256 = Sha("old source"), CommitSha = "working-tree", Content = "old source"
        });
        await db.SaveChangesAsync();
        var clients = new StubHttpClientFactory((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)));

        var result = await RefreshAsync(db, tenantId, projectId, requestId, userId, clients, new FakeAIModelProvider());

        Assert.True(result.Success);
        Assert.Equal(1, result.Updated);
        Assert.Empty(await db.StudioKnowledgeRefreshConsents.ToListAsync());
        var latest = await db.StudioKnowledgeDocuments.OrderByDescending(x => x.IndexedAt).ThenByDescending(x => x.Id).FirstAsync();
        Assert.Empty(latest.Content);
        Assert.NotEqual(Sha("old source"), latest.ContentSha256);
        Assert.Contains(await db.AuditEvents.ToListAsync(), item => item.Action == "studio.knowledge.auto-refreshed");
    }

    [Fact]
    public async Task Refresh_fails_closed_on_runner_error_without_changing_snapshot_or_consent()
    {
        var (db, tenantId, projectId, requestId, userId) = await CreateContextAsync();
        var consent = await SeedConsentAsync(db, tenantId, projectId, requestId, "src/current.cs");
        var old = new StudioKnowledgeDocument
        {
            TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = requestId, IndexedByUserId = userId,
            Path = "src/current.cs", ContentSha256 = Sha("old source"), CommitSha = "working-tree", Content = "old source"
        };
        db.StudioKnowledgeDocuments.Add(old);
        await db.SaveChangesAsync();
        var lastRefresh = consent.LastRefreshedAt;
        var auditCount = await db.AuditEvents.CountAsync();
        var clients = new StubHttpClientFactory((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)));

        var result = await RefreshAsync(db, tenantId, projectId, requestId, userId, clients, new FakeAIModelProvider());

        Assert.False(result.Success);
        Assert.Equal(502, result.StatusCode);
        Assert.Single(await db.StudioKnowledgeDocuments.ToListAsync());
        Assert.Equal("old source", (await db.StudioKnowledgeDocuments.SingleAsync()).Content);
        Assert.Equal(lastRefresh, (await db.StudioKnowledgeRefreshConsents.SingleAsync()).LastRefreshedAt);
        Assert.Equal(auditCount, await db.AuditEvents.CountAsync());
    }

    [Fact]
    public async Task Refresh_does_not_call_runner_when_no_consent_exists()
    {
        var (db, tenantId, projectId, requestId, userId) = await CreateContextAsync();
        var clients = new StubHttpClientFactory((_, _) => throw new Xunit.Sdk.XunitException("Runner must not be called without consent."));

        var result = await RefreshAsync(db, tenantId, projectId, requestId, userId, clients, new FakeAIModelProvider());

        Assert.True(result.Success);
        Assert.Equal(0, result.Updated);
    }

    private static async Task<(AIStudioDbContext Db, Guid TenantId, Guid ProjectId, Guid RequestId, Guid UserId)> CreateContextAsync()
    {
        var options = new DbContextOptionsBuilder<AIStudioDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AIStudioDbContext(options);
        var tenantId = Guid.NewGuid();
        db.Tenants.Add(new Tenant { Id = tenantId, Name = "Tenant", Slug = Guid.NewGuid().ToString("N") });
        await db.SaveChangesAsync();
        return (db, tenantId, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
    }

    private static async Task<StudioKnowledgeRefreshConsent> SeedConsentAsync(AIStudioDbContext db, Guid tenantId, Guid projectId, Guid requestId, params string[] paths)
    {
        var consent = new StudioKnowledgeRefreshConsent
        {
            TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = requestId, GrantedByUserId = Guid.NewGuid(),
            SelectedPathsJson = JsonSerializer.Serialize(paths)
        };
        db.StudioKnowledgeRefreshConsents.Add(consent);
        await db.SaveChangesAsync();
        return consent;
    }

    private static Task<StudioKnowledgeRefreshResult> RefreshAsync(AIStudioDbContext db, Guid tenantId, Guid projectId, Guid requestId,
        Guid userId, IHttpClientFactory clients, IAIModelProvider provider) => StudioKnowledgeAutoRefresher.RefreshAsync(
            tenantId, projectId, requestId, userId, db, clients, provider,
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["WorkspaceRunner:BaseUrl"] = "http://runner" }).Build(),
            (_, _, _) => "test-token", CancellationToken.None);

    private static HttpResponseMessage FileResponse(string path, string content) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(new { path, content, sizeBytes = Encoding.UTF8.GetByteCount(content), sha256 = Sha(content) }), Encoding.UTF8, "application/json")
    };

    private static string Sha(string value) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private sealed class StubHttpClientFactory(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new StubHttpMessageHandler(handler));
    }

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => handler(request, cancellationToken);
    }

    private sealed class FakeAIModelProvider : IAIModelProvider
    {
        public List<string> EmbeddedInputs { get; } = [];
        public Task<string> ReplyToERPDataQuestionAsync(string question, IReadOnlyList<StudioChatTurn> history, CancellationToken cancellationToken, Func<string, string, CancellationToken, Task<string>> executeReadOnlyTool) => throw new NotImplementedException();
        public Task<StudioEmbeddingBatch?> CreateStudioEmbeddingsAsync(IReadOnlyList<string> inputs, CancellationToken cancellationToken)
        {
            EmbeddedInputs.AddRange(inputs);
            return Task.FromResult<StudioEmbeddingBatch?>(null);
        }
        public Task<string> ReplyToStudioChatAsync(string projectName, string branchName, IReadOnlyList<StudioChatTurn> history, CancellationToken cancellationToken, Func<string, Task>? onDelta = null, string? knowledgeContext = null) => throw new NotImplementedException();
        public Task<string> AnalyzeStudioSourceAsync(string question, string projectName, string branchName, IReadOnlyList<StudioCodeContext> sources, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<StudioCodeReview> ReviewStudioDiffAsync(string projectName, string branchName, StudioDiffContext diff, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<StudioPullRequestDraft> CreateStudioPullRequestDraftAsync(StudioPullRequestContext context, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<ArchitecturePlan> CreateArchitecturePlanAsync(string request, string projectName, string branchName, IReadOnlyList<ArchitectureTechnology> technologies, IReadOnlyList<string> entryPoints, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<UiDesignPlan> CreateUiDesignPlanAsync(string request, string projectName, string branchName, string targetPath, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<AITestPlan> CreateTestPlanAsync(string request, string projectName, string branchName, IReadOnlyList<AITestTarget> targets, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<DatabaseEngineeringPlan> CreateDatabaseEngineeringPlanAsync(string request, string projectName, string branchName, IReadOnlyList<CodeSourceFile> schemaSources, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<CodeSuggestion> CreateCodeSuggestionAsync(string request, string projectName, string branchName, string filePath, string sourceContent, CancellationToken cancellationToken, bool createNewFile = false) => throw new NotImplementedException();
        public Task<MultiFileCodeSuggestion> CreateMultiFileCodeSuggestionAsync(string request, string projectName, string branchName, IReadOnlyList<CodeSourceFile> sources, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<SandboxErrorAnalysis> AnalyzeSandboxErrorAsync(string projectName, string branchName, SandboxErrorContext error, CancellationToken cancellationToken) => throw new NotImplementedException();
    }
}
