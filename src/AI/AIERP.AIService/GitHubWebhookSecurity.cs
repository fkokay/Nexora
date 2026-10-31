using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public sealed record GitHubPullRequestWebhookEvent(string Repository, int Number, string State, string Action,
    DateTimeOffset UpdatedAt, string? HeadSha = null, long? InstallationId = null);

public static class GitHubWebhookSecurity
{
    private static readonly HashSet<string> SupportedActions = new(StringComparer.Ordinal)
    {
        "opened", "reopened", "synchronize", "closed", "ready_for_review", "converted_to_draft"
    };

    public static bool ValidateSignature(string secret, string signatureHeader, ReadOnlySpan<byte> body)
    {
        if (string.IsNullOrWhiteSpace(secret) || Encoding.UTF8.GetByteCount(secret) < 32 ||
            signatureHeader.Length != 71 || !signatureHeader.StartsWith("sha256=", StringComparison.Ordinal)) return false;
        byte[] supplied;
        try { supplied = Convert.FromHexString(signatureHeader.AsSpan(7)); }
        catch (FormatException) { return false; }
        if (supplied.Length != 32) return false;
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), body);
        return CryptographicOperations.FixedTimeEquals(expected, supplied);
    }

    public static bool TryParsePullRequestEvent(ReadOnlySpan<byte> body, out GitHubPullRequestWebhookEvent? parsed)
    {
        parsed = null;
        try
        {
            using var document = JsonDocument.Parse(body.ToArray());
            var root = document.RootElement;
            if (!root.TryGetProperty("action", out var actionElement) || actionElement.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(actionElement.GetString())) return false;
            if (!SupportedActions.Contains(actionElement.GetString()!)) return true;
            if (!root.TryGetProperty("installation", out var installationElement) ||
                !installationElement.TryGetProperty("id", out var installationIdElement) ||
                !installationIdElement.TryGetInt64(out var installationId) || installationId <= 0) return false;
            if (!root.TryGetProperty("repository", out var repositoryElement) ||
                !repositoryElement.TryGetProperty("full_name", out var nameElement) || nameElement.ValueKind != JsonValueKind.String) return false;
            var repository = nameElement.GetString();
            if (string.IsNullOrWhiteSpace(repository) || repository.Length > 256 || repository.Split('/').Length != 2) return false;
            if (!root.TryGetProperty("pull_request", out var pullRequest) ||
                !pullRequest.TryGetProperty("number", out var numberElement) || !numberElement.TryGetInt32(out var number) || number <= 0 ||
                !pullRequest.TryGetProperty("state", out var stateElement) || stateElement.ValueKind != JsonValueKind.String ||
                !pullRequest.TryGetProperty("updated_at", out var updatedElement) || !updatedElement.TryGetDateTimeOffset(out var updatedAt)) return false;
            var isMerged = pullRequest.TryGetProperty("merged", out var mergedElement) && mergedElement.ValueKind == JsonValueKind.True;
            var isDraft = pullRequest.TryGetProperty("draft", out var draftElement) && draftElement.ValueKind == JsonValueKind.True;
            if (!pullRequest.TryGetProperty("head", out var headElement) ||
                !headElement.TryGetProperty("sha", out var headShaElement) || headShaElement.ValueKind != JsonValueKind.String) return false;
            var headSha = headShaElement.GetString();
            if (headSha is null || headSha.Length is < 40 or > 64 || headSha.Any(character => !Uri.IsHexDigit(character))) return false;
            var state = isMerged ? "merged" : isDraft ? "draft" : stateElement.GetString();
            if (state is not ("open" or "closed" or "merged" or "draft")) return false;
            parsed = new GitHubPullRequestWebhookEvent(repository, number, state, actionElement.GetString()!, updatedAt, headSha, installationId);
            return true;
        }
        catch (JsonException) { return false; }
        catch (InvalidOperationException) { return false; }
    }
}
