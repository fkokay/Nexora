using System.Text.Json;

namespace AIERP.AIService.AI;

public sealed record StudioKnowledgeTextChunk(int StartLine, string Text);
public sealed record StudioKnowledgeStoredVector(int StartLine, float[] Vector);
public sealed record StudioKnowledgeMatch(int StartLine, string Text, double Score);

/// <summary>Deterministic, line-addressable chunks and bounded cosine ranking for Studio RAG.</summary>
public static class StudioKnowledgeEmbeddings
{
    public const int ChunkCharacterLimit = 2800;
    public const int VectorDimension = 1536;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<StudioKnowledgeTextChunk> Chunk(string content)
    {
        var lines = content.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Split('\n');
        var chunks = new List<StudioKnowledgeTextChunk>();
        var current = new System.Text.StringBuilder();
        var startLine = 1;

        for (var lineIndex = 0; lineIndex < lines.Length; lineIndex++)
        {
            var line = lines[lineIndex];
            if (line.Length == 0 && current.Length == 0) continue;
            for (var offset = 0; offset < Math.Max(line.Length, 1); offset += ChunkCharacterLimit)
            {
                var part = line.Length == 0 ? "" : line.Substring(offset, Math.Min(ChunkCharacterLimit, line.Length - offset));
                var additionLength = part.Length + (current.Length == 0 ? 0 : 1);
                if (current.Length > 0 && current.Length + additionLength > ChunkCharacterLimit)
                {
                    AddChunk(chunks, startLine, current);
                    current.Clear();
                }
                if (current.Length == 0) startLine = lineIndex + 1;
                else current.Append('\n');
                current.Append(part);
            }
        }

        if (current.Length > 0) AddChunk(chunks, startLine, current);
        return chunks;
    }

    public static string SerializeVectors(IReadOnlyList<StudioKnowledgeTextChunk> chunks, IReadOnlyList<float[]> vectors)
    {
        if (chunks.Count != vectors.Count || vectors.Any(vector => vector.Length != VectorDimension))
            throw new ArgumentException("Embedding vector count or dimension is invalid.", nameof(vectors));
        return JsonSerializer.Serialize(chunks.Select((chunk, index) => new StudioKnowledgeStoredVector(chunk.StartLine, vectors[index])), JsonOptions);
    }

    public static IReadOnlyList<StudioKnowledgeStoredVector> DeserializeVectors(string? json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Length > 4 * 1024 * 1024) return [];
        try
        {
            var vectors = JsonSerializer.Deserialize<StudioKnowledgeStoredVector[]>(json, JsonOptions) ?? [];
            return vectors.Length <= 512 && vectors.All(item => item.StartLine > 0 && item.Vector is { Length: VectorDimension } &&
                item.Vector.All(float.IsFinite)) ? vectors : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static IReadOnlyList<StudioKnowledgeMatch> Rank(string content,
        IReadOnlyList<StudioKnowledgeStoredVector> vectors, ReadOnlySpan<float> queryVector, int limit = 3)
    {
        if (queryVector.Length != VectorDimension) return [];
        var query = queryVector.ToArray();
        if (!query.All(float.IsFinite)) return [];
        var chunks = Chunk(content);
        if (chunks.Count != vectors.Count) return [];
        return chunks.Select((chunk, index) => new StudioKnowledgeMatch(chunk.StartLine, chunk.Text,
                CosineSimilarity(query, vectors[index].Vector)))
            .Where(match => match.Score >= 0.2)
            .OrderByDescending(match => match.Score)
            .Take(Math.Clamp(limit, 1, 10))
            .ToArray();
    }

    private static double CosineSimilarity(ReadOnlySpan<float> left, ReadOnlySpan<float> right)
    {
        if (left.Length != right.Length || right.Length != VectorDimension) return 0;
        double dot = 0, leftNorm = 0, rightNorm = 0;
        for (var i = 0; i < left.Length; i++)
        {
            dot += left[i] * right[i];
            leftNorm += left[i] * left[i];
            rightNorm += right[i] * right[i];
        }
        return leftNorm == 0 || rightNorm == 0 ? 0 : dot / Math.Sqrt(leftNorm * rightNorm);
    }

    private static void AddChunk(List<StudioKnowledgeTextChunk> chunks, int startLine, System.Text.StringBuilder text)
    {
        if (!string.IsNullOrWhiteSpace(text.ToString())) chunks.Add(new StudioKnowledgeTextChunk(startLine, text.ToString()));
    }
}
