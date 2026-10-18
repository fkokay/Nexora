using AIERP.AIService.AI;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Net;
using System.Text;

namespace AIERP.Platform.UnitTests;

public sealed class StudioKnowledgeEmbeddingsTests
{
    [Theory]
    [InlineData("contracts/openapi.yaml")]
    [InlineData("contracts/service.proto")]
    [InlineData("contracts/schema.graphql")]
    [InlineData("contracts/schema.graphqls")]
    [InlineData("contracts/query.gql")]
    [InlineData("contracts/legacy.wsdl")]
    [InlineData("contracts/schema.xsd")]
    [InlineData("contracts/customer.thrift")]
    [InlineData("contracts/customer.avsc")]
    [InlineData("contracts/customer.avdl")]
    [InlineData("database/schema.prisma")]
    [InlineData("tests/OrdersTests.cs")]
    public void KnowledgePathRules_AcceptApiContractsSchemasAndTestSources(string path)
    {
        Assert.True(StudioKnowledgePathRules.IsSafeKnowledgePath(path));
    }

    [Theory]
    [InlineData(".env.local")]
    [InlineData("src/provider-secret.graphql")]
    [InlineData("contracts/provider-secret.wsdl")]
    [InlineData("src/appsettings.Production.json")]
    [InlineData("node_modules/pkg/schema.graphql")]
    [InlineData("../outside/service.proto")]
    [InlineData("keys/id_rsa.prisma")]
    [InlineData("C:\\workspace\\source.cs")]
    [InlineData("src/./Orders.cs")]
    [InlineData("src//Orders.cs")]
    public void KnowledgePathRules_RejectSensitiveOrEscapingPaths(string path)
    {
        Assert.False(StudioKnowledgePathRules.IsSafeKnowledgePath(path));
    }

    [Fact]
    public void Chunk_preserves_start_line_and_bounds_text_size()
    {
        var content = string.Join('\n', new string('a', StudioKnowledgeEmbeddings.ChunkCharacterLimit), "second line");

        var chunks = StudioKnowledgeEmbeddings.Chunk(content);

        Assert.Equal(2, chunks.Count);
        Assert.Equal(1, chunks[0].StartLine);
        Assert.Equal(2, chunks[1].StartLine);
        Assert.All(chunks, chunk => Assert.InRange(chunk.Text.Length, 1, StudioKnowledgeEmbeddings.ChunkCharacterLimit));
    }

    [Fact]
    public void Rank_returns_the_closest_chunk_with_its_source_line()
    {
        var content = string.Join('\n', new string('a', StudioKnowledgeEmbeddings.ChunkCharacterLimit), "relevant source");
        var vectors = new[]
        {
            new StudioKnowledgeStoredVector(1, UnitVector(0)),
            new StudioKnowledgeStoredVector(2, UnitVector(1))
        };

        var matches = StudioKnowledgeEmbeddings.Rank(content, vectors, UnitVector(1));

        var match = Assert.Single(matches);
        Assert.Equal(2, match.StartLine);
        Assert.Equal("relevant source", match.Text);
        Assert.Equal(1d, match.Score, precision: 6);
    }

    [Fact]
    public void Serialize_and_deserialize_reject_wrong_dimensions()
    {
        var chunks = StudioKnowledgeEmbeddings.Chunk("one chunk");
        var json = StudioKnowledgeEmbeddings.SerializeVectors(chunks, [UnitVector(0)]);

        var stored = Assert.Single(StudioKnowledgeEmbeddings.DeserializeVectors(json));

        Assert.Equal(1, stored.StartLine);
        Assert.Equal(StudioKnowledgeEmbeddings.VectorDimension, stored.Vector.Length);
        Assert.Empty(StudioKnowledgeEmbeddings.DeserializeVectors("[{\"startLine\":1,\"vector\":[1]}]"));
    }

    [Fact]
    public void Approved_history_is_stable_bounded_and_carries_review_context()
    {
        var candidateId = Guid.Parse("efbf463c-1d45-43d5-bac4-60955839800d");
        var history = new ApprovedDevelopmentHistory(candidateId, "feature/invoices", "abc123", "tests/Invoices.csproj",
            DateTimeOffset.Parse("2026-10-17T09:00:00Z"), DateTimeOffset.Parse("2026-10-17T10:00:00Z"),
            "Invoice approval", "Require a second reviewer for large invoices.", "Verified the tenant boundary and test results.");

        var content = StudioApprovedHistoryKnowledge.Build(history);

        Assert.Equal($"approved-history/{candidateId:D}.md", StudioApprovedHistoryKnowledge.Path(candidateId));
        Assert.Contains("Commit: abc123", content, StringComparison.Ordinal);
        Assert.Contains("Invoice approval", content, StringComparison.Ordinal);
        Assert.Contains("Verified the tenant boundary", content, StringComparison.Ordinal);
        Assert.Equal(content, StudioApprovedHistoryKnowledge.Build(history));
        Assert.Equal(StudioApprovedHistoryKnowledge.Sha256(content), StudioApprovedHistoryKnowledge.Sha256(StudioApprovedHistoryKnowledge.Build(history)));
        Assert.Contains("untrusted data", content, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("api_key = 'abcdef1234567890'")]
    [InlineData("sk-proj-12345678901234567890")]
    [InlineData("-----BEGIN PRIVATE KEY-----")]
    public void Approved_history_secret_scanner_rejects_potential_secrets(string content) =>
        Assert.True(StudioApprovedHistoryKnowledge.ContainsPotentialSecret(content));

    [Fact]
    public async Task OpenAI_embedding_provider_uses_bounded_configured_model_and_validates_response()
    {
        var sentBody = "";
        var handler = new StubHttpMessageHandler(async (request, cancellationToken) =>
        {
            Assert.Equal("https://api.openai.com/v1/embeddings", request.RequestUri!.ToString());
            Assert.Equal("Bearer test-key", request.Headers.Authorization!.ToString());
            sentBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            using var json = System.Text.Json.JsonDocument.Parse(sentBody);
            Assert.Equal("text-embedding-3-small", json.RootElement.GetProperty("model").GetString());
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent($"{{\"data\":[{{\"index\":0,\"embedding\":[{string.Join(',', Enumerable.Repeat("0.25", StudioKnowledgeEmbeddings.VectorDimension))}]}}]}}", Encoding.UTF8, "application/json")
            };
        });
        using var http = new HttpClient(handler);
        var settings = new Dictionary<string, string?>
        {
            ["AI:OpenAI:ApiKey"] = "test-key",
            ["AI:OpenAI:EmbeddingModel"] = "text-embedding-3-small"
        };
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var platformDb = new PlatformDbContext(options);
        var provider = new OpenAIResponsesProvider(http, configuration, platformDb, new HttpContextAccessor());

        var batch = await provider.CreateStudioEmbeddingsAsync(["A small authorized source chunk"], CancellationToken.None);

        Assert.NotNull(batch);
        Assert.Equal("text-embedding-3-small", batch.Model);
        Assert.Equal(StudioKnowledgeEmbeddings.VectorDimension, Assert.Single(batch.Vectors).Length);
        Assert.Contains("A small authorized source chunk", sentBody, StringComparison.Ordinal);
    }

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => handler(request, cancellationToken);
    }

    private static float[] UnitVector(int index)
    {
        var vector = new float[StudioKnowledgeEmbeddings.VectorDimension];
        vector[index] = 1;
        return vector;
    }
}
