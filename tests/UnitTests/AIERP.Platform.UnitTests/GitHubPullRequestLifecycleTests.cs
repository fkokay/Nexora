using System.Net;
using System.Text;
using AIERP.AIService;

public sealed class GitHubPullRequestLifecycleTests
{
    [Fact]
    public async Task Marks_only_the_requested_pull_request_ready_and_verifies_open_state()
    {
        var handler = new ResponseHandler(request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("graphql", request.RequestUri!.PathAndQuery.TrimStart('/'));
            using var body = System.Text.Json.JsonDocument.Parse(request.Content!.ReadAsStream());
            Assert.Contains("markPullRequestReadyForReview", body.RootElement.GetProperty("query").GetString());
            Assert.Equal("PR_node_42", body.RootElement.GetProperty("variables").GetProperty("pullRequestId").GetString());
            return Json(HttpStatusCode.OK, """
                {"data":{"markPullRequestReadyForReview":{"pullRequest":{"id":"PR_node_42","isDraft":false,"state":"OPEN"}}}}
                """);
        });
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestLifecycle.MarkReadyForReviewAsync(client, "PR_node_42", CancellationToken.None);

        Assert.True(result);
        Assert.Equal(1, handler.RequestCount);
    }

    [Theory]
    [InlineData("{\"errors\":[{\"message\":\"Resource not accessible by integration\"}]}")]
    [InlineData("{\"errors\":{},\"data\":{\"markPullRequestReadyForReview\":{\"pullRequest\":{\"id\":\"PR_node_42\",\"isDraft\":false,\"state\":\"OPEN\"}}}}")]
    [InlineData("{\"data\":{\"markPullRequestReadyForReview\":{\"pullRequest\":{\"id\":\"OTHER\",\"isDraft\":false,\"state\":\"OPEN\"}}}}")]
    [InlineData("{\"data\":{\"markPullRequestReadyForReview\":{\"pullRequest\":{\"id\":\"PR_node_42\",\"isDraft\":true,\"state\":\"OPEN\"}}}}")]
    [InlineData("{\"data\":{\"markPullRequestReadyForReview\":{\"pullRequest\":{\"id\":\"PR_node_42\",\"isDraft\":false,\"state\":\"CLOSED\"}}}}")]
    [InlineData("{\"data\":[]}")]
    [InlineData("{\"data\":{\"markPullRequestReadyForReview\":[]}}")]
    [InlineData("{\"data\":{\"markPullRequestReadyForReview\":{\"pullRequest\":[]}}}")]
    [InlineData("{\"data\":{\"markPullRequestReadyForReview\":{\"pullRequest\":{\"id\":42,\"isDraft\":false,\"state\":\"OPEN\"}}}}")]
    [InlineData("{\"data\":{\"markPullRequestReadyForReview\":{\"pullRequest\":{\"id\":\"PR_node_42\",\"isDraft\":false,\"state\":42}}}}")]
    [InlineData("not-json")]
    public async Task Rejects_graphql_errors_and_unverified_transitions(string payload)
    {
        var handler = new ResponseHandler(_ => Json(HttpStatusCode.OK, payload));
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        var result = await GitHubPullRequestLifecycle.MarkReadyForReviewAsync(client, "PR_node_42", CancellationToken.None);

        Assert.False(result);
    }

    [Fact]
    public async Task Rejects_empty_or_oversized_node_ids_before_network_access()
    {
        var handler = new ResponseHandler(_ => throw new InvalidOperationException("No request is expected."));
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };

        Assert.False(await GitHubPullRequestLifecycle.MarkReadyForReviewAsync(client, " ", CancellationToken.None));
        Assert.False(await GitHubPullRequestLifecycle.MarkReadyForReviewAsync(client, new string('x', 201), CancellationToken.None));
        Assert.Equal(0, handler.RequestCount);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string payload) => new(status)
    {
        Content = new StringContent(payload, Encoding.UTF8, "application/json")
    };

    private sealed class ResponseHandler(Func<HttpRequestMessage, HttpResponseMessage> response) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            return Task.FromResult(response(request));
        }
    }
}
