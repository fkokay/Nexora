using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.Infrastructure;

public enum ApiKeyPurpose
{
    OpenAiApiKey,
    NvidiaApiKey
}

public static class ApiKeyCipher
{
    private const string CurrentEnvelopePrefix = "v3.";
    private const string TenantBoundEnvelopePrefix = "v2.";
    private const int NonceSize = 12;
    private const int TagSize = 16;

    public static bool IsConfigured(IConfiguration configuration) => TryGetKey(configuration, out _);

    public static string Encrypt(string value, Guid tenantId, ApiKeyPurpose purpose, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (tenantId == Guid.Empty) throw new ArgumentException("A tenant ID is required to encrypt an API key.", nameof(tenantId));
        _ = GetPurposeName(purpose);

        var key = GetKey(configuration);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var plaintext = System.Text.Encoding.UTF8.GetBytes(value);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSize];
        using var aes = new AesGcm(key, TagSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag, GetAssociatedData(tenantId, purpose));
        return CurrentEnvelopePrefix + Convert.ToBase64String([.. nonce, .. tag, .. ciphertext]);
    }

    public static string Decrypt(string value, Guid tenantId, ApiKeyPurpose purpose, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (tenantId == Guid.Empty) throw new ArgumentException("A tenant ID is required to decrypt an API key.", nameof(tenantId));
        _ = GetPurposeName(purpose);

        var tenantBound = value.StartsWith(CurrentEnvelopePrefix, StringComparison.Ordinal);
        var previousTenantBound = value.StartsWith(TenantBoundEnvelopePrefix, StringComparison.Ordinal);
        if (!tenantBound && !previousTenantBound && value.Length >= 2 && value[0] == 'v' && value[1] is >= '0' and <= '9' && value.Contains('.'))
            throw new CryptographicException("Stored API key ciphertext uses an unsupported envelope version.");

        var key = GetKey(configuration);
        var encoded = tenantBound ? value[CurrentEnvelopePrefix.Length..]
            : previousTenantBound ? value[TenantBoundEnvelopePrefix.Length..]
            : value;
        var packed = Convert.FromBase64String(encoded);
        if (packed.Length < NonceSize + TagSize) throw new CryptographicException("Stored API key ciphertext is invalid.");
        var nonce = packed.AsSpan(0, NonceSize);
        var tag = packed.AsSpan(NonceSize, TagSize);
        var ciphertext = packed.AsSpan(NonceSize + TagSize);
        var plaintext = new byte[ciphertext.Length];
        using var aes = new AesGcm(key, TagSize);
        if (tenantBound)
            aes.Decrypt(nonce, ciphertext, tag, plaintext, GetAssociatedData(tenantId, purpose));
        else if (previousTenantBound)
            aes.Decrypt(nonce, ciphertext, tag, plaintext, GetTenantAssociatedData(tenantId));
        else
            aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return System.Text.Encoding.UTF8.GetString(plaintext);
    }

    /// <summary>
    /// Re-encrypts legacy ciphertext for the supplied tenant and purpose. Current envelopes are
    /// authenticated before being returned unchanged. Callers should persist the result with
    /// an optimistic check against the original ciphertext to avoid overwriting concurrent edits.
    /// </summary>
    public static string ReEncryptForTenant(string value, Guid tenantId, ApiKeyPurpose purpose, IConfiguration configuration)
    {
        var plaintext = Decrypt(value, tenantId, purpose, configuration);
        return value.StartsWith(CurrentEnvelopePrefix, StringComparison.Ordinal)
            ? value
            : Encrypt(plaintext, tenantId, purpose, configuration);
    }

    private static byte[] GetAssociatedData(Guid tenantId, ApiKeyPurpose purpose) =>
        System.Text.Encoding.UTF8.GetBytes($"AIERP:TenantAIProviderSettings:{tenantId:N}:{GetPurposeName(purpose)}:v3");

    private static byte[] GetTenantAssociatedData(Guid tenantId) =>
        System.Text.Encoding.UTF8.GetBytes($"AIERP:TenantAIProviderSettings:{tenantId:N}:v2");

    private static string GetPurposeName(ApiKeyPurpose purpose) => purpose switch
    {
        ApiKeyPurpose.OpenAiApiKey => "openai-api-key",
        ApiKeyPurpose.NvidiaApiKey => "nvidia-api-key",
        _ => throw new ArgumentOutOfRangeException(nameof(purpose), purpose, "Unsupported API key purpose.")
    };

    private static byte[] GetKey(IConfiguration configuration) => TryGetKey(configuration, out var key)
        ? key
        : throw new InvalidOperationException("AI:SettingsEncryptionKey must contain a base64 encoded 256-bit key.");

    private static bool TryGetKey(IConfiguration configuration, out byte[] key)
    {
        try
        {
            key = Convert.FromBase64String(configuration["AI:SettingsEncryptionKey"] ?? "");
            return key.Length == 32;
        }
        catch (FormatException)
        {
            key = [];
            return false;
        }
    }
}
