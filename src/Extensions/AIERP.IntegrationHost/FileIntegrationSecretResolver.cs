using System.Text.RegularExpressions;
using AIERP.IntegrationSDK;

namespace AIERP.IntegrationHost;

public sealed partial class FileIntegrationSecretResolver(IConfiguration configuration) : IIntegrationSecretResolver
{
    private const int MaximumSecretBytes = 16 * 1024;

    public async ValueTask<ReadOnlyMemory<char>> ResolveAsync(Guid tenantId, IntegrationCredentialReference reference,
        CancellationToken cancellationToken)
    {
        var secretName = reference.SecretName;
        if (tenantId == Guid.Empty || !SecretNamePattern().IsMatch(secretName ?? string.Empty))
            throw new FileNotFoundException("Integration credential reference is invalid.");
        var root = Path.GetFullPath(configuration["IntegrationSecrets:RootPath"] ?? "/run/integration-secrets");
        var path = Path.GetFullPath(Path.Combine(root, tenantId.ToString("D"), secretName!));
        if (!path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new FileNotFoundException("Integration credential reference is invalid.");
        var info = new FileInfo(path);
        if (!info.Exists || info.Length is <= 0 or > MaximumSecretBytes)
            throw new FileNotFoundException("Integration credential is unavailable.");
        var secret = await File.ReadAllTextAsync(path, cancellationToken);
        if (secret.Length == 0 || secret.Contains('\r') || secret.Contains('\n'))
            throw new FileNotFoundException("Integration credential is invalid.");
        return secret.AsMemory();
    }

    [GeneratedRegex("^[a-z][a-z0-9-]{0,63}$", RegexOptions.CultureInvariant)]
    private static partial Regex SecretNamePattern();
}
