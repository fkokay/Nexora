using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.Infrastructure;

public static class ApiKeyCipher
{
    private const int NonceSize = 12;
    private const int TagSize = 16;

    public static bool IsConfigured(IConfiguration configuration) => TryGetKey(configuration, out _);

    public static string Encrypt(string value, IConfiguration configuration)
    {
        var key = GetKey(configuration);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var plaintext = System.Text.Encoding.UTF8.GetBytes(value);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSize];
        using var aes = new AesGcm(key, TagSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);
        return Convert.ToBase64String([.. nonce, .. tag, .. ciphertext]);
    }

    public static string Decrypt(string value, IConfiguration configuration)
    {
        var key = GetKey(configuration);
        var packed = Convert.FromBase64String(value);
        if (packed.Length < NonceSize + TagSize) throw new CryptographicException("Stored API key ciphertext is invalid.");
        var nonce = packed.AsSpan(0, NonceSize);
        var tag = packed.AsSpan(NonceSize, TagSize);
        var ciphertext = packed.AsSpan(NonceSize + TagSize);
        var plaintext = new byte[ciphertext.Length];
        using var aes = new AesGcm(key, TagSize);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return System.Text.Encoding.UTF8.GetString(plaintext);
    }

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
