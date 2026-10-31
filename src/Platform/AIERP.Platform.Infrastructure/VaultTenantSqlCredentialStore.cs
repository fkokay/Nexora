using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace AIERP.Platform.Infrastructure;

/// <summary>A tenant database SQL credential resolved from an external secret store.</summary>
public sealed record TenantSqlCredential(string DatabaseName, string UserName, string Password, int Version);

/// <summary>The isolated SQL database belonging to a tenant.</summary>
public enum TenantSqlDatabaseComponent
{
    Erp,
    AiStudio
}

/// <summary>Read-only access to a single tenant's SQL credential.</summary>
public interface ITenantSqlCredentialReader
{
    Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component, string secretReference, CancellationToken cancellationToken = default);
}

/// <summary>Credential publication is intentionally a separate provisioning-only capability.</summary>
public interface ITenantSqlCredentialWriter
{
    Task WriteAsync(Guid tenantId, TenantSqlDatabaseComponent component, TenantSqlCredential credential, CancellationToken cancellationToken = default);
}

public sealed class VaultTenantSqlCredentialReadOptions
{
    public Uri? Address { get; set; }
    public string Mount { get; set; } = "secret";
    public string RoleId { get; set; } = "";
    public string SecretId { get; set; } = "";
    public bool AllowHttpForLocalDevelopment { get; set; }
}

public sealed class VaultTenantSqlCredentialWriteOptions
{
    public Uri? Address { get; set; }
    public string Mount { get; set; } = "secret";
    public string RoleId { get; set; } = "";
    public string SecretId { get; set; } = "";
    public bool AllowHttpForLocalDevelopment { get; set; }
}

/// <summary>Reads a deployment secret from a mounted file when configured, without copying its value into container environment.</summary>
public static class DeploymentSecretConfiguration
{
    public static string? GetValue(IConfiguration configuration, string key)
    {
        var file = configuration[$"{key}File"];
        if (string.IsNullOrWhiteSpace(file)) return configuration[key];
        try
        {
            var value = File.ReadAllText(file).TrimEnd('\r', '\n');
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
        catch (IOException exception)
        {
            throw new InvalidOperationException($"The configured secret file for {key} could not be read.", exception);
        }
        catch (UnauthorizedAccessException exception)
        {
            throw new InvalidOperationException($"The configured secret file for {key} could not be read.", exception);
        }
    }
}

/// <summary>
/// Vault KV v2 adapter for API/runtime reads. Configure this with a read-only AppRole;
/// do not share the provisioning role's credentials with application hosts.
/// </summary>
public sealed class VaultTenantSqlCredentialReader(HttpClient httpClient, IOptions<VaultTenantSqlCredentialReadOptions> options)
    : ITenantSqlCredentialReader, IDisposable
{
    private readonly VaultKvV2Client _client = new(httpClient, options.Value.Address, options.Value.Mount,
        options.Value.RoleId, options.Value.SecretId, options.Value.AllowHttpForLocalDevelopment);

    public async Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component, string secretReference, CancellationToken cancellationToken = default)
    {
        var path = TenantSqlCredentialPath.RequireCanonical(tenantId, component, secretReference);
        var document = await _client.ReadAsync(path, cancellationToken);
        try
        {
            using var json = JsonDocument.Parse(document);
            var data = json.RootElement.GetProperty("data").GetProperty("data");
            var database = data.GetProperty("database").GetString();
            var userName = data.GetProperty("user").GetString();
            var password = data.GetProperty("password").GetString();
            var version = json.RootElement.GetProperty("data").GetProperty("metadata").GetProperty("version").GetInt32();
            var expectedDatabase = TenantSqlCredentialPath.DatabaseName(tenantId, component);
            if (!string.Equals(database, expectedDatabase, StringComparison.Ordinal)
                || !TenantSqlCredentialPath.IsValidUserName(tenantId, component, userName)
                || string.IsNullOrWhiteSpace(password) || password.Length > 512 || version < 1)
                throw new InvalidOperationException("Vault returned an invalid tenant SQL credential.");
            return new TenantSqlCredential(database!, userName!, password, version);
        }
        catch (InvalidOperationException) { throw; }
        catch (Exception exception) when (exception is JsonException or KeyNotFoundException or FormatException)
        {
            throw new InvalidOperationException("Vault returned an invalid tenant SQL credential.");
        }
    }

    public void Dispose() => httpClient.Dispose();
}

/// <summary>Vault KV v2 adapter for the provisioning host only.</summary>
public sealed class VaultTenantSqlCredentialWriter(HttpClient httpClient, IOptions<VaultTenantSqlCredentialWriteOptions> options)
    : ITenantSqlCredentialWriter, IDisposable
{
    private readonly VaultKvV2Client _client = new(httpClient, options.Value.Address, options.Value.Mount,
        options.Value.RoleId, options.Value.SecretId, options.Value.AllowHttpForLocalDevelopment);

    public Task WriteAsync(Guid tenantId, TenantSqlDatabaseComponent component, TenantSqlCredential credential, CancellationToken cancellationToken = default)
    {
        var path = TenantSqlCredentialPath.ForTenant(tenantId, component);
        if (!string.Equals(credential.DatabaseName, TenantSqlCredentialPath.DatabaseName(tenantId, component), StringComparison.Ordinal)
            || !TenantSqlCredentialPath.IsValidUserName(tenantId, component, credential.UserName)
            || string.IsNullOrWhiteSpace(credential.Password) || credential.Password.Length > 512)
            throw new InvalidOperationException("Tenant SQL credential does not match its tenant identity.");
        return _client.WriteAsync(path, credential, cancellationToken);
    }

    public void Dispose() => httpClient.Dispose();
}

public static class VaultTenantSqlCredentialServiceCollectionExtensions
{
    /// <summary>Registers the runtime reader with redirects disabled to prevent forwarding Vault tokens to another origin.</summary>
    public static IServiceCollection AddVaultTenantSqlCredentialReader(
        this IServiceCollection services, Action<VaultTenantSqlCredentialReadOptions> configure)
    {
        services.Configure(configure);
        services.AddHttpClient("VaultTenantSqlCredentialReader")
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            });
        services.AddSingleton<ITenantSqlCredentialReader>(provider => new VaultTenantSqlCredentialReader(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("VaultTenantSqlCredentialReader"),
            provider.GetRequiredService<IOptions<VaultTenantSqlCredentialReadOptions>>()));
        return services;
    }

    /// <summary>Registers the provisioning-only writer with redirects disabled to prevent forwarding Vault tokens to another origin.</summary>
    public static IServiceCollection AddVaultTenantSqlCredentialWriter(
        this IServiceCollection services, Action<VaultTenantSqlCredentialWriteOptions> configure)
    {
        services.Configure(configure);
        services.AddHttpClient("VaultTenantSqlCredentialWriter")
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            });
        services.AddSingleton<ITenantSqlCredentialWriter>(provider => new VaultTenantSqlCredentialWriter(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("VaultTenantSqlCredentialWriter"),
            provider.GetRequiredService<IOptions<VaultTenantSqlCredentialWriteOptions>>()));
        return services;
    }
}

public static class TenantSqlCredentialPath
{
    public static string ForTenant(Guid tenantId, TenantSqlDatabaseComponent component)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        var componentPath = component switch
        {
            TenantSqlDatabaseComponent.Erp => "erp",
            TenantSqlDatabaseComponent.AiStudio => "ai-studio",
            _ => throw new ArgumentOutOfRangeException(nameof(component))
        };
        return $"tenants/{tenantId:D}/sql/{componentPath}";
    }

    public static string DatabaseName(Guid tenantId, TenantSqlDatabaseComponent component) => component switch
    {
        TenantSqlDatabaseComponent.Erp when tenantId != Guid.Empty => $"AIERPTenant_{tenantId:N}",
        TenantSqlDatabaseComponent.AiStudio when tenantId != Guid.Empty => $"AIERPStudio_{tenantId:N}",
        TenantSqlDatabaseComponent.Erp or TenantSqlDatabaseComponent.AiStudio => throw new ArgumentException("Tenant id is required.", nameof(tenantId)),
        _ => throw new ArgumentOutOfRangeException(nameof(component))
    };

    public static bool IsValidUserName(Guid tenantId, TenantSqlDatabaseComponent component, string? userName)
    {
        var expected = component switch
        {
            TenantSqlDatabaseComponent.Erp => $"aierp_t_{tenantId:N}",
            TenantSqlDatabaseComponent.AiStudio => $"aierp_s_{tenantId:N}",
            _ => null
        };
        return tenantId != Guid.Empty && expected is not null && string.Equals(userName, expected, StringComparison.Ordinal);
    }

    public static string RequireCanonical(Guid tenantId, TenantSqlDatabaseComponent component, string secretReference)
    {
        if (tenantId == Guid.Empty || !string.Equals(secretReference, ForTenant(tenantId, component), StringComparison.Ordinal))
            throw new InvalidOperationException("Tenant SQL secret reference does not match the selected tenant.");
        return secretReference;
    }
}

internal sealed class VaultKvV2Client
{
    private const int MaximumResponseBytes = 32 * 1024;
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);
    private readonly HttpClient _httpClient;
    private readonly Uri _address;
    private readonly string _mount;
    private readonly string _roleId;
    private readonly string _secretId;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private CachedToken? _cachedToken;

    public VaultKvV2Client(HttpClient httpClient, Uri? address, string mount, string roleId, string secretId, bool allowHttpForLocalDevelopment)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        if (address is null || !address.IsAbsoluteUri || !string.IsNullOrEmpty(address.UserInfo)
            || !string.IsNullOrEmpty(address.Query) || !string.IsNullOrEmpty(address.Fragment)
            || address.AbsolutePath != "/")
            throw new InvalidOperationException("Vault address must be an absolute origin without credentials, path, query, or fragment.");
        var isLoopback = address.IsLoopback || string.Equals(address.Host, "localhost", StringComparison.OrdinalIgnoreCase);
        if (address.Scheme != Uri.UriSchemeHttps && !(address.Scheme == Uri.UriSchemeHttp && isLoopback && allowHttpForLocalDevelopment))
            throw new InvalidOperationException("Vault must use HTTPS; HTTP is allowed only for explicitly enabled localhost development.");
        if (!Regex.IsMatch(mount ?? "", "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$", RegexOptions.CultureInvariant))
            throw new InvalidOperationException("Vault KV v2 mount is invalid.");
        if (string.IsNullOrWhiteSpace(roleId) || roleId.Length > 512 || string.IsNullOrWhiteSpace(secretId) || secretId.Length > 2048)
            throw new InvalidOperationException("Vault AppRole credentials are not configured.");
        _address = address;
        _mount = mount!;
        _roleId = roleId;
        _secretId = secretId;
    }

    public async Task<string> ReadAsync(string path, CancellationToken cancellationToken)
    {
        var token = await GetTokenAsync(cancellationToken);
        var responseBody = await SendAsync(HttpMethod.Get, BuildKvUri(path), token, null, cancellationToken);
        return responseBody;
    }

    public async Task WriteAsync(string path, TenantSqlCredential credential, CancellationToken cancellationToken)
    {
        var token = await GetTokenAsync(cancellationToken);
        var body = JsonSerializer.Serialize(new
        {
            data = new { database = credential.DatabaseName, user = credential.UserName, password = credential.Password }
        });
        _ = await SendAsync(HttpMethod.Post, BuildKvUri(path), token, body, cancellationToken);
    }

    private async Task<string> GetTokenAsync(CancellationToken cancellationToken)
    {
        var cached = Volatile.Read(ref _cachedToken);
        if (cached is not null && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() < cached.ExpiresAtUnixMilliseconds)
            return cached.Value;
        await _tokenLock.WaitAsync(cancellationToken);
        try
        {
            cached = Volatile.Read(ref _cachedToken);
            if (cached is not null && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() < cached.ExpiresAtUnixMilliseconds)
                return cached.Value;
            var loginBody = JsonSerializer.Serialize(new { role_id = _roleId, secret_id = _secretId });
            var responseBody = await SendAsync(HttpMethod.Post, new Uri(_address, "/v1/auth/approle/login"), null, loginBody, cancellationToken);
            try
            {
                using var json = JsonDocument.Parse(responseBody);
                var auth = json.RootElement.GetProperty("auth");
                var token = auth.GetProperty("client_token").GetString();
                var leaseDuration = auth.GetProperty("lease_duration").GetInt32();
                if (string.IsNullOrWhiteSpace(token) || token.Length > 4096 || leaseDuration < 2)
                    throw new InvalidOperationException("Vault AppRole authentication returned invalid token metadata.");
                var expiresAt = DateTimeOffset.UtcNow.AddSeconds(leaseDuration - 1).ToUnixTimeMilliseconds();
                Volatile.Write(ref _cachedToken, new CachedToken(token, expiresAt));
                return token;
            }
            catch (InvalidOperationException) { throw; }
            catch (Exception exception) when (exception is JsonException or KeyNotFoundException or FormatException)
            {
                throw new InvalidOperationException("Vault AppRole authentication returned an invalid response.");
            }
        }
        finally { _tokenLock.Release(); }
    }

    private sealed record CachedToken(string Value, long ExpiresAtUnixMilliseconds);

    private Uri BuildKvUri(string path)
    {
        var canonical = path.Split('/');
        if (canonical.Length != 4 || canonical[0] != "tenants" || canonical[2] != "sql"
            || !Guid.TryParseExact(canonical[1], "D", out var tenantId) || tenantId == Guid.Empty)
            throw new InvalidOperationException("Vault tenant SQL path is invalid.");
        var component = canonical[3] switch
        {
            "erp" => TenantSqlDatabaseComponent.Erp,
            "ai-studio" => TenantSqlDatabaseComponent.AiStudio,
            _ => throw new InvalidOperationException("Vault tenant SQL path is invalid.")
        };
        if (!string.Equals(path, TenantSqlCredentialPath.ForTenant(tenantId, component), StringComparison.Ordinal))
            throw new InvalidOperationException("Vault tenant SQL path is invalid.");
        return new Uri(_address, $"/v1/{Uri.EscapeDataString(_mount)}/data/{string.Join('/', canonical.Select(Uri.EscapeDataString))}");
    }

    private async Task<string> SendAsync(HttpMethod method, Uri uri, string? token, string? body, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RequestTimeout);
        using var request = new HttpRequestMessage(method, uri);
        if (token is not null) request.Headers.Add("X-Vault-Token", token);
        if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        try
        {
            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"Vault request failed with HTTP {(int)response.StatusCode}.");
            if (response.Content.Headers.ContentLength is > MaximumResponseBytes)
                throw new InvalidOperationException("Vault response exceeded the allowed size.");
            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var output = new MemoryStream();
            var buffer = new byte[4096];
            while (true)
            {
                var read = await stream.ReadAsync(buffer.AsMemory(), timeout.Token);
                if (read == 0) break;
                if (output.Length + read > MaximumResponseBytes)
                    throw new InvalidOperationException("Vault response exceeded the allowed size.");
                output.Write(buffer, 0, read);
            }
            return Encoding.UTF8.GetString(output.ToArray());
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (OperationCanceledException) { throw new InvalidOperationException("Vault request timed out."); }
        catch (HttpRequestException) { throw new InvalidOperationException("Vault request could not be completed."); }
    }
}
