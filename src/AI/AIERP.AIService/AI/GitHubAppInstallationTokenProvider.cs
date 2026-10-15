using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace AIERP.AIService.AI;

public sealed class GitHubAppConfigurationException : Exception { }
public sealed class GitHubIntegrationException(string message) : Exception(message);

public sealed class GitHubAppInstallationTokenProvider(HttpClient httpClient, IConfiguration configuration)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<string> CreateRepositoryTokenAsync(long installationId, string repository, CancellationToken cancellationToken)
        => await CreateRepositoryTokenAsync(installationId, repository, true, cancellationToken);

    public async Task<string> CreateRepositoryReadTokenAsync(long installationId, string repository, CancellationToken cancellationToken)
        => await CreateRepositoryTokenAsync(installationId, repository, false, cancellationToken);

    private async Task<string> CreateRepositoryTokenAsync(long installationId, string repository, bool canWrite, CancellationToken cancellationToken)
    {
        var appId = configuration["GitHub:AppId"];
        var privateKeyPem = configuration["GitHub:PrivateKeyPem"];
        if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(privateKeyPem))
            throw new GitHubAppConfigurationException();
        if (installationId <= 0 || string.IsNullOrWhiteSpace(repository) || repository.Length > 200 || repository.Any(char.IsControl))
            throw new GitHubIntegrationException("GitHub installation or repository is invalid.");

        using var rsa = RSA.Create();
        try { rsa.ImportFromPem(privateKeyPem); }
        catch (Exception ex) when (ex is CryptographicException or ArgumentException) { throw new GitHubAppConfigurationException(); }
        var now = DateTimeOffset.UtcNow;
        var credentials = new SigningCredentials(new RsaSecurityKey(rsa), SecurityAlgorithms.RsaSha256);
        var payload = new JwtPayload
        {
            ["iss"] = appId,
            ["iat"] = now.AddSeconds(-30).ToUnixTimeSeconds(),
            ["exp"] = now.AddMinutes(8).ToUnixTimeSeconds()
        };
        var appJwt = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(new JwtHeader(credentials), payload));
        var repositoryParts = repository.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (repositoryParts.Length != 2 || repositoryParts.Any(part => part.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_' or '.'))))
            throw new GitHubIntegrationException("GitHub repository is invalid.");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.github.com/app/installations/{installationId}/access_tokens");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", appJwt);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.UserAgent.ParseAdd("AIERP-Development-Studio/1.0");
        request.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
        request.Content = new StringContent(JsonSerializer.Serialize(new
        {
            repositories = new[] { repositoryParts[1] },
            permissions = canWrite
                ? new Dictionary<string, string> { ["contents"] = "write", ["pull_requests"] = "write" }
                : new Dictionary<string, string> { ["contents"] = "read" }
        }, JsonOptions), Encoding.UTF8, "application/json");
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        var responseText = await ReadBoundedAsync(response.Content, 16 * 1024, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new GitHubIntegrationException("GitHub could not authorize this repository installation.");
        using var json = JsonDocument.Parse(responseText);
        if (!json.RootElement.TryGetProperty("token", out var token) || token.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(token.GetString()))
            throw new GitHubIntegrationException("GitHub returned an invalid installation token response.");
        return token.GetString()!;
    }

    private static async Task<string> ReadBoundedAsync(HttpContent content, int maxBytes, CancellationToken cancellationToken)
    {
        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[4096];
        int read;
        while ((read = await stream.ReadAsync(buffer, cancellationToken)) > 0)
        {
            if (output.Length + read > maxBytes) throw new GitHubIntegrationException("GitHub response exceeded the allowed limit.");
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        return Encoding.UTF8.GetString(output.ToArray());
    }
}

