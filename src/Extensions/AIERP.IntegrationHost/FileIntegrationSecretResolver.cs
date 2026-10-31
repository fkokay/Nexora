using System.Security.Cryptography;
using System.Text;
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
        var tenantDirectory = Path.GetFullPath(Path.Combine(root, tenantId.ToString("D")));
        var path = Path.GetFullPath(Path.Combine(tenantDirectory, secretName!));
        var rootPrefix = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!tenantDirectory.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) ||
            !path.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) ||
            IsReparsePoint(tenantDirectory) || IsReparsePoint(path))
            throw new FileNotFoundException("Integration credential reference is invalid.");
        try
        {
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
                bufferSize: 4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
            if (stream.Length is <= 0 or > MaximumSecretBytes)
                throw new FileNotFoundException("Integration credential is unavailable.");
            using var buffer = new MemoryStream((int)stream.Length);
            var chunk = new byte[4096];
            while (true)
            {
                var read = await stream.ReadAsync(chunk, cancellationToken);
                if (read == 0) break;
                if (buffer.Length + read > MaximumSecretBytes)
                    throw new FileNotFoundException("Integration credential is unavailable.");
                buffer.Write(chunk, 0, read);
            }
            var bytes = buffer.ToArray();
            try
            {
                var secret = new UTF8Encoding(false, true).GetString(bytes);
                if (secret.Length == 0 || secret.Contains('\r') || secret.Contains('\n'))
                    throw new FileNotFoundException("Integration credential is invalid.");
                return secret.AsMemory();
            }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        }
        catch (DecoderFallbackException)
        {
            throw new FileNotFoundException("Integration credential is invalid.");
        }
    }

    private static bool IsReparsePoint(string path)
    {
        try { return (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0; }
        catch (FileNotFoundException) { return false; }
        catch (DirectoryNotFoundException) { return false; }
    }

    [GeneratedRegex("^[a-z][a-z0-9-]{0,63}$", RegexOptions.CultureInvariant)]
    private static partial Regex SecretNamePattern();
}
