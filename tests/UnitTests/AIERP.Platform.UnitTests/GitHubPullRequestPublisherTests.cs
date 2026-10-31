using System.Net;
using System.Text;
using AIERP.AIService;

public sealed class GitHubPullRequestPublisherTests
{
    [Fact]
    public async Task Reuses_the_open_pr_created_by_a_concurrent_publish_request()
    {
        var handler = new SequenceHandler(
            _ => Json(HttpStatusCode.OK, "[]"),
            request =>
            {
                Assert.Equal(HttpMethod.Post, request.Method);
                return Json(HttpStatusCode.UnprocessableEntity, "{\"message\":\"A pull request already exists for this head branch.\"}");
            },
            request =>
            {
                Assert.Equal(HttpMethod.Get, request.Method);
                Assert.Contains("head=Acme%3Acodex%2Fstudio-123", request.RequestUri!.Query, StringComparison.OrdinalIgnoreCase);
                Assert.Contains("base=main", request.RequestUri.Query, StringComparison.OrdinalIgnoreCase);
                return Json(HttpStatusCode.OK, """[{"number":42,"html_url":"https://github.com/Acme/ERP/pull/42","state":"open","draft":true,"head":{"sha":"0123456789abcdef0123456789abcdef01234567"},"updated_at":"2026-10-18T10:00:00Z"}]""");
            });
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestPublisher.PublishAsync(client, "Acme", "ERP", "codex/studio-123", "main",
            "Studio change", "Description", CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.False(result.Created);
        Assert.Equal(42, result.PullRequest!.Number);
        Assert.Equal(3, handler.RequestCount);
    }

    [Fact]
    public async Task Returns_an_existing_open_pr_without_creating_another()
    {
        var handler = new SequenceHandler(_ => Json(HttpStatusCode.OK,
            """[{"number":17,"html_url":"https://github.com/Acme/ERP/pull/17","state":"open","draft":true,"head":{"sha":"0123456789abcdef0123456789abcdef01234567"},"updated_at":"2026-10-18T10:00:00Z"}]"""));
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestPublisher.PublishAsync(client, "Acme", "ERP", "codex/studio-123", "main",
            "Studio change", "Description", CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.False(result.Created);
        Assert.Equal(17, result.PullRequest!.Number);
        Assert.Equal(1, handler.RequestCount);
    }

    [Theory]
    [InlineData("closed", "https://github.com/Acme/ERP/pull/17")]
    [InlineData("open", "http://github.com/Acme/ERP/pull/17")]
    [InlineData("open", "https://github.com.example/Acme/ERP/pull/17")]
    public async Task Does_not_reuse_pr_with_unverified_state_or_url(string state, string url)
    {
        var handler = new SequenceHandler(_ => Json(HttpStatusCode.OK,
            $"[{{\"number\":17,\"html_url\":\"{url}\",\"state\":\"{state}\",\"draft\":true}}]"));
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestPublisher.PublishAsync(client, "Acme", "ERP", "codex/studio-123", "main",
            "Studio change", "Description", CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Null(result.PullRequest);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task Rejects_malformed_open_pr_lookup_without_trying_to_create()
    {
        var handler = new SequenceHandler(_ => Json(HttpStatusCode.OK, "not-json"));
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestPublisher.PublishAsync(client, "Acme", "ERP", "codex/studio-123", "main",
            "Studio change", "Description", CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task Rejects_successful_create_response_that_is_not_an_open_draft()
    {
        var handler = new SequenceHandler(
            _ => Json(HttpStatusCode.OK, "[]"),
            _ => Json(HttpStatusCode.Created,
                "{\"number\":18,\"html_url\":\"https://github.com/Acme/ERP/pull/18\",\"state\":\"open\",\"draft\":false}"));
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestPublisher.PublishAsync(client, "Acme", "ERP", "codex/studio-123", "main",
            "Studio change", "Description", CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Null(result.PullRequest);
    }

    [Fact]
    public async Task Rejects_malformed_successful_create_response_without_throwing()
    {
        var handler = new SequenceHandler(
            _ => Json(HttpStatusCode.OK, "[]"),
            _ => Json(HttpStatusCode.Created, "not-json"));
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestPublisher.PublishAsync(client, "Acme", "ERP", "codex/studio-123", "main",
            "Studio change", "Description", CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Null(result.PullRequest);
        Assert.Equal("GitHub geçersiz PR yanıtı döndürdü.", result.Failure);
        Assert.Equal(2, handler.RequestCount);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string payload) => new(status)
    {
        Content = new StringContent(payload, Encoding.UTF8, "application/json")
    };

    private sealed class SequenceHandler(params Func<HttpRequestMessage, HttpResponseMessage>[] responses) : HttpMessageHandler
    {
        private int _index;
        public int RequestCount => _index;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var index = Interlocked.Increment(ref _index) - 1;
            if (index >= responses.Length) throw new InvalidOperationException("Unexpected HTTP request.");
            return Task.FromResult(responses[index](request));
        }
    }
}
