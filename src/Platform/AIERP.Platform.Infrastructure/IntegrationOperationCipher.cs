using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.Infrastructure;

/// <summary>Encrypts queued request and provider result bodies with tenant/operation/purpose binding.</summary>
public static class IntegrationOperationCipher
{
    private const int NonceLength = 12;
    private const int TagLength = 16;
    private const string ConfigurationKey = "IntegrationQueue:EncryptionKey";

    public static bool IsConfigured(IConfiguration configuration) => TryGetKey(configuration, out _);

    public static string Encrypt(string value, IConfiguration configuration, Guid tenantId, Guid operationId, string purpose)
    {
        ArgumentNullException.ThrowIfNull(value);
        var key = GetKey(configuration);
        var plaintext = Encoding.UTF8.GetBytes(value);
        var nonce = RandomNumberGenerator.GetBytes(NonceLength);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagLength];
        try
        {
            using var aes = new AesGcm(key, TagLength);
            aes.Encrypt(nonce, plaintext, ciphertext, tag, AssociatedData(tenantId, operationId, purpose));
            return Convert.ToBase64String([.. nonce, .. tag, .. ciphertext]);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
            CryptographicOperations.ZeroMemory(key);
        }
    }

    public static string Decrypt(string value, IConfiguration configuration, Guid tenantId, Guid operationId, string purpose)
    {
        var key = GetKey(configuration);
        byte[]? plaintext = null;
        try
        {
            var packed = Convert.FromBase64String(value);
            if (packed.Length < NonceLength + TagLength) throw new CryptographicException("Integration operation ciphertext is invalid.");
            plaintext = new byte[packed.Length - NonceLength - TagLength];
            using var aes = new AesGcm(key, TagLength);
            aes.Decrypt(packed.AsSpan(0, NonceLength), packed.AsSpan(NonceLength + TagLength),
                packed.AsSpan(NonceLength, TagLength), plaintext, AssociatedData(tenantId, operationId, purpose));
            return Encoding.UTF8.GetString(plaintext);
        }
        finally
        {
            if (plaintext is not null) CryptographicOperations.ZeroMemory(plaintext);
            CryptographicOperations.ZeroMemory(key);
        }
    }

    public static string Sha256Hex(ReadOnlySpan<byte> value) => Convert.ToHexStringLower(SHA256.HashData(value));

    public static string CreateProviderIdempotencyKey(Guid tenantId, string integrationCode, string clientKey)
    {
        var namespaced = Encoding.UTF8.GetBytes($"{tenantId:D}\n{integrationCode}\n{clientKey}");
        return Sha256Hex(namespaced);
    }

    private static byte[] AssociatedData(Guid tenantId, Guid operationId, string purpose)
    {
        if (tenantId == Guid.Empty || operationId == Guid.Empty || purpose is not ("request" or "result"))
            throw new ArgumentException("Integration operation encryption context is invalid.");
        return Encoding.UTF8.GetBytes($"aierp.integration-operation.v1\n{tenantId:D}\n{operationId:D}\n{purpose}");
    }

    private static byte[] GetKey(IConfiguration configuration) => TryGetKey(configuration, out var key)
        ? key
        : throw new InvalidOperationException("IntegrationQueue:EncryptionKey must contain a base64-encoded 256-bit key.");

    private static bool TryGetKey(IConfiguration configuration, out byte[] key)
    {
        try
        {
            key = Convert.FromBase64String(configuration[ConfigurationKey] ?? "");
            return key.Length == 32;
        }
        catch (FormatException)
        {
            key = [];
            return false;
        }
    }
}
