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
