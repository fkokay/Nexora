using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public sealed record StudioKnowledgeRefreshResult(bool Success, int Updated, int StatusCode, string? Error);

public static class StudioKnowledgeAutoRefresher
{
    public static async Task<StudioKnowledgeRefreshResult> RefreshAsync(Guid tenantId, Guid projectId, Guid requestId, Guid userId,
        AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration,
        Func<IConfiguration, Guid, string, string> createRunnerToken, CancellationToken cancellationToken)
    {
        var consent = await db.StudioKnowledgeRefreshConsents.SingleOrDefaultAsync(x =>
            x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId, cancellationToken);
        if (consent is null) return new(true, 0, 200, null);
        string[] paths;
        try { paths = JsonSerializer.Deserialize<string[]>(consent.SelectedPathsJson) ?? []; }
        catch (JsonException) { return new(false, 0, 500, "Bilgi tabanı yenileme izni okunamadı."); }
        if (paths.Length is < 1 or > 50 || paths.Distinct(StringComparer.OrdinalIgnoreCase).Count() != paths.Length ||
            paths.Any(path => !StudioKnowledgePathRules.IsSafeKnowledgePath(path)))
            return new(false, 0, 409, "Otomatik yenileme kaynak izinleri geçersiz; proje yöneticisinin izni yeniden tanımlaması gerekiyor.");
        if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
            return new(false, 0, 503, "Workspace Runner yapılandırılmamış.");

        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = runnerUri;
        var latestRows = await db.StudioKnowledgeDocuments.AsNoTracking().Where(x => x.TenantId == tenantId &&
            x.ProjectId == projectId && x.WorkspaceRequestId == requestId && paths.Contains(x.Path))
            .OrderByDescending(x => x.IndexedAt).ThenByDescending(x => x.Id).ToListAsync(cancellationToken);
        var latestByPath = latestRows.GroupBy(x => x.Path, StringComparer.Ordinal).ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);
        var changed = new List<StudioKnowledgeDocument>();
        var nextPaths = new List<string>(paths.Length);
        var totalBytes = 0;
        foreach (var path in paths)
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{requestId:D}/file-content?path={Uri.EscapeDataString(path)}");
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", createRunnerToken(configuration, requestId, "workspace.read-file"));
            HttpResponseMessage response;
            try { response = await client.SendAsync(message, cancellationToken); }
            catch (HttpRequestException) { return new(false, 0, 502, "Workspace Runner seçilmiş bilgi tabanı kaynağına erişemedi."); }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return new(false, 0, 504, "Bilgi tabanı otomatik yenilemesi zaman aşımına uğradı."); }
            using (response)
            {
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                AddTombstone(path);
                continue;
            }
            if (!response.IsSuccessStatusCode)
                return new(false, 0, 502, "Workspace Runner seçilmiş bilgi tabanı kaynağını yenileyemedi.");
            var source = await response.Content.ReadFromJsonAsync<RunnerFileContent>(cancellationToken: cancellationToken);
            if (source is null || source.SizeBytes < 0 || source.Content is null || Encoding.UTF8.GetByteCount(source.Content) > 128 * 1024 ||
                !string.Equals(source.Path, path, StringComparison.Ordinal) || !StudioKnowledgePathRules.IsSafeKnowledgePath(source.Path))
                return new(false, 0, 413, "Otomatik yenileme kaynağı okunamadı veya 128 KiB/dosya güvenlik sınırını aştı.");
            totalBytes += Encoding.UTF8.GetByteCount(source.Content);
            if (totalBytes > 512 * 1024) return new(false, 0, 413, "Otomatik yenileme kaynakları toplam 512 KiB sınırını aşıyor.");
            if (StudioApprovedHistoryKnowledge.ContainsPotentialSecret(source.Content))
            {
                AddTombstone(path);
                continue;
            }
            nextPaths.Add(path);
            var sha = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(source.Content))).ToLowerInvariant();
            if (latestByPath.TryGetValue(path, out var latest) && string.Equals(latest.ContentSha256, sha, StringComparison.OrdinalIgnoreCase)) continue;
            changed.Add(new StudioKnowledgeDocument { TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = requestId,
                IndexedByUserId = userId, Path = path, ContentSha256 = sha, CommitSha = "working-tree", Content = source.Content });
            }
        }

        if (changed.Count > 0) await CreateEmbeddingsAsync(changed, aiProvider, cancellationToken);
        db.StudioKnowledgeDocuments.AddRange(changed);
        if (nextPaths.Count == 0)
            db.StudioKnowledgeRefreshConsents.Remove(consent);
        else
        {
            consent.SelectedPathsJson = JsonSerializer.Serialize(nextPaths);
            consent.LastRefreshedAt = DateTimeOffset.UtcNow;
        }
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.knowledge.auto-refreshed",
            Resource = $"{requestId:D}:updated={changed.Count}:sources={nextPaths.Count}" });
        await db.SaveChangesAsync(cancellationToken);
        return new(true, changed.Count, 200, null);

        void AddTombstone(string path)
        {
            var tombstoneSha = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("AIERP-KNOWLEDGE-SOURCE-REMOVED"))).ToLowerInvariant();
            if (latestByPath.TryGetValue(path, out var latest) && string.Equals(latest.ContentSha256, tombstoneSha, StringComparison.OrdinalIgnoreCase)) return;
            changed.Add(new StudioKnowledgeDocument { TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = requestId,
                IndexedByUserId = userId, Path = path, ContentSha256 = tombstoneSha, CommitSha = "working-tree", Content = "" });
        }
    }

    private static async Task CreateEmbeddingsAsync(IReadOnlyList<StudioKnowledgeDocument> documents, IAIModelProvider aiProvider, CancellationToken cancellationToken)
    {
        var chunkSets = documents.Select(document => StudioKnowledgeEmbeddings.Chunk(document.Content)).ToArray();
        var allChunks = chunkSets.SelectMany(chunks => chunks).ToArray();
        if (allChunks.Length == 0) return;
        var vectors = new List<float[]>(allChunks.Length);
        string? model = null;
        try
        {
            for (var offset = 0; offset < allChunks.Length; offset += 64)
            {
                var batch = await aiProvider.CreateStudioEmbeddingsAsync(allChunks.Skip(offset).Take(64).Select(chunk => chunk.Text).ToArray(), cancellationToken);
                if (batch is null) return;
                if (model is not null && !string.Equals(model, batch.Model, StringComparison.Ordinal)) return;
                model = batch.Model;
                vectors.AddRange(batch.Vectors);
            }
            if (vectors.Count != allChunks.Length || model is null) return;
            var vectorOffset = 0;
            for (var i = 0; i < documents.Count; i++)
            {
                var count = chunkSets[i].Count;
                documents[i].EmbeddingModel = model;
                documents[i].EmbeddingJson = StudioKnowledgeEmbeddings.SerializeVectors(chunkSets[i], vectors.Skip(vectorOffset).Take(count).ToArray());
                vectorOffset += count;
            }
        }
        catch (Exception error) when (error is AIProviderNotConfiguredException or AIProviderRateLimitException or AIProviderResponseException or HttpRequestException or TaskCanceledException)
        {
            if (cancellationToken.IsCancellationRequested) throw;
            // Keep the current source snapshot usable through keyword retrieval during provider outages.
        }
    }
}
