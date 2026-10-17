using System.Security.Cryptography;
using System.Text.Json;

namespace AIERP.ModuleSDK;

public interface IModulePublisherKeyResolver
{
    ValueTask<string?> GetPublicKeyPemAsync(string publisher, string keyId, CancellationToken cancellationToken);
}

public sealed record SignedModulePackage(
    ModuleManifest Manifest,
    string KeyId,
    string ArtifactSha256,
    string SignatureBase64);

public sealed record ModulePackageVerificationResult(bool IsValid, string? Error);

/// <summary>Verifies the artifact bytes and publisher signature without loading or extracting executable code.</summary>
public static class ModulePackageVerifier
{
    public const long MaximumArtifactBytes = 100L * 1024 * 1024;
    private static readonly JsonSerializerOptions ManifestJsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Creates the exact UTF-8 payload publishers must sign with RSA-PSS/SHA-256.</summary>
    public static byte[] CreateSigningPayload(ModuleManifest manifest, string keyId, string artifactSha256)
    {
        var canonicalManifest = JsonSerializer.Serialize(manifest, ManifestJsonOptions);
        return JsonSerializer.SerializeToUtf8Bytes(new[] { canonicalManifest, keyId, artifactSha256.ToLowerInvariant() });
    }

    public static string SerializeManifest(ModuleManifest manifest) => JsonSerializer.Serialize(manifest, ManifestJsonOptions);

    public static async Task<ModulePackageVerificationResult> VerifyAsync(
        SignedModulePackage? package,
        Stream artifact,
        IModulePublisherKeyResolver keyResolver,
        CancellationToken cancellationToken = default)
    {
        if (package is null) return new(false, "Signed package metadata is required.");
        var manifestResult = ModuleManifestValidator.Validate(package.Manifest);
        if (!manifestResult.IsValid) return new(false, "Module manifest is invalid.");
        if (string.IsNullOrWhiteSpace(package.KeyId) || package.KeyId.Length > 80) return new(false, "Publisher key identifier is invalid.");
        if (!artifact.CanRead) return new(false, "Module artifact stream is not readable.");

        var hash = await ComputeSha256Async(artifact, cancellationToken);
        if (!CryptographicOperations.FixedTimeEquals(
                Convert.FromHexString(hash),
                TryHex(package.ArtifactSha256)))
            return new(false, "Module artifact checksum does not match.");

        byte[] signature;
        try { signature = Convert.FromBase64String(package.SignatureBase64); }
        catch (FormatException) { return new(false, "Module signature is not valid base64."); }

        var publicKeyPem = await keyResolver.GetPublicKeyPemAsync(package.Manifest.Publisher, package.KeyId, cancellationToken);
        if (string.IsNullOrWhiteSpace(publicKeyPem)) return new(false, "Publisher is not trusted.");

        try
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(publicKeyPem);
            var payload = CreateSigningPayload(package.Manifest, package.KeyId, hash);
            return rsa.VerifyData(payload, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss)
                ? new(true, null)
                : new(false, "Publisher signature is invalid.");
        }
        catch (CryptographicException)
        {
            return new(false, "Publisher key or signature is invalid.");
        }
    }

    public static async Task<string> ComputeSha256Async(Stream artifact, CancellationToken cancellationToken = default)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[64 * 1024];
        long totalBytes = 0;
        int read;
        while ((read = await artifact.ReadAsync(buffer, cancellationToken)) > 0)
        {
            totalBytes += read;
            if (totalBytes > MaximumArtifactBytes) throw new InvalidDataException("Module artifact exceeds the maximum allowed size.");
            hash.AppendData(buffer, 0, read);
        }

        return Convert.ToHexStringLower(hash.GetHashAndReset());
    }

    private static byte[] TryHex(string value)
    {
        try { return Convert.FromHexString(value); }
        catch (FormatException) { return []; }
    }
}
