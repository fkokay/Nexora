using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using AIERP.Platform.Infrastructure;

namespace AIERP.Platform.UnitTests;

public sealed class ApiKeyCipherTests
{
    private static readonly IConfiguration Configuration = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(0, 32).Select(value => (byte)value).ToArray())
        })
        .Build();

    [Fact]
    public void Tenant_bound_ciphertext_cannot_be_moved_to_another_tenant()
    {
        var ownerTenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var ciphertext = ApiKeyCipher.Encrypt("test-only-key", ownerTenantId, ApiKeyPurpose.OpenAiApiKey, Configuration);

        Assert.StartsWith("v3.", ciphertext, StringComparison.Ordinal);
        Assert.Equal("test-only-key", ApiKeyCipher.Decrypt(ciphertext, ownerTenantId, ApiKeyPurpose.OpenAiApiKey, Configuration));
        Assert.ThrowsAny<CryptographicException>(() => ApiKeyCipher.Decrypt(ciphertext, otherTenantId, ApiKeyPurpose.OpenAiApiKey, Configuration));
    }

    [Fact]
    public void Ciphertext_cannot_be_swapped_between_provider_columns()
    {
        var tenantId = Guid.NewGuid();
        var openAiCiphertext = ApiKeyCipher.Encrypt("test-only-openai-key", tenantId, ApiKeyPurpose.OpenAiApiKey, Configuration);
        var nvidiaCiphertext = ApiKeyCipher.Encrypt("test-only-nvidia-key", tenantId, ApiKeyPurpose.NvidiaApiKey, Configuration);

        Assert.ThrowsAny<CryptographicException>(() => ApiKeyCipher.Decrypt(openAiCiphertext, tenantId, ApiKeyPurpose.NvidiaApiKey, Configuration));
        Assert.ThrowsAny<CryptographicException>(() => ApiKeyCipher.Decrypt(nvidiaCiphertext, tenantId, ApiKeyPurpose.OpenAiApiKey, Configuration));
    }

    [Theory]
    [InlineData(ApiKeyPurpose.OpenAiApiKey, "test-only-openai-key")]
    [InlineData(ApiKeyPurpose.NvidiaApiKey, "test-only-nvidia-key")]
    public void Legacy_provider_ciphertext_remains_readable_and_can_be_migrated(ApiKeyPurpose purpose, string expectedKey)
    {
        var tenantId = Guid.NewGuid();
        var legacyCiphertext = EncryptLegacy(expectedKey);

        Assert.Equal(expectedKey, ApiKeyCipher.Decrypt(legacyCiphertext, tenantId, purpose, Configuration));

        var migratedCiphertext = ApiKeyCipher.ReEncryptForTenant(legacyCiphertext, tenantId, purpose, Configuration);

        Assert.StartsWith("v3.", migratedCiphertext, StringComparison.Ordinal);
        Assert.Equal(expectedKey, ApiKeyCipher.Decrypt(migratedCiphertext, tenantId, purpose, Configuration));
        Assert.Equal(migratedCiphertext, ApiKeyCipher.ReEncryptForTenant(migratedCiphertext, tenantId, purpose, Configuration));
        Assert.ThrowsAny<CryptographicException>(() => ApiKeyCipher.Decrypt(migratedCiphertext, tenantId,
            purpose == ApiKeyPurpose.OpenAiApiKey ? ApiKeyPurpose.NvidiaApiKey : ApiKeyPurpose.OpenAiApiKey, Configuration));
    }

    [Fact]
    public void Tenant_only_v2_ciphertext_remains_readable_and_migration_adds_provider_purpose()
    {
        var tenantId = Guid.NewGuid();
        var legacyCiphertext = EncryptTenantBoundV2("test-only-legacy-v2-key", tenantId);

        Assert.Equal("test-only-legacy-v2-key", ApiKeyCipher.Decrypt(legacyCiphertext, tenantId, ApiKeyPurpose.NvidiaApiKey, Configuration));

        var migratedCiphertext = ApiKeyCipher.ReEncryptForTenant(legacyCiphertext, tenantId, ApiKeyPurpose.NvidiaApiKey, Configuration);

        Assert.StartsWith("v3.", migratedCiphertext, StringComparison.Ordinal);
        Assert.Equal("test-only-legacy-v2-key", ApiKeyCipher.Decrypt(migratedCiphertext, tenantId, ApiKeyPurpose.NvidiaApiKey, Configuration));
        Assert.ThrowsAny<CryptographicException>(() => ApiKeyCipher.Decrypt(migratedCiphertext, tenantId, ApiKeyPurpose.OpenAiApiKey, Configuration));
    }

    [Fact]
    public void Unsupported_numeric_envelope_version_fails_closed()
    {
        Assert.Throws<CryptographicException>(() => ApiKeyCipher.Decrypt("v4.not-a-valid-envelope", Guid.NewGuid(),
            ApiKeyPurpose.OpenAiApiKey, Configuration));
    }

    private static string EncryptLegacy(string value)
        => EncryptEnvelope(value, associatedData: null, prefix: "");

    private static string EncryptTenantBoundV2(string value, Guid tenantId)
        => EncryptEnvelope(value,
            System.Text.Encoding.UTF8.GetBytes($"AIERP:TenantAIProviderSettings:{tenantId:N}:v2"),
            prefix: "v2.");

    private static string EncryptEnvelope(string value, byte[]? associatedData, string prefix)
    {
        var key = Convert.FromBase64String(Configuration["AI:SettingsEncryptionKey"]!);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plaintext = System.Text.Encoding.UTF8.GetBytes(value);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(key, tag.Length);
        if (associatedData is null)
            aes.Encrypt(nonce, plaintext, ciphertext, tag);
        else
            aes.Encrypt(nonce, plaintext, ciphertext, tag, associatedData);
        return prefix + Convert.ToBase64String([.. nonce, .. tag, .. ciphertext]);
    }
}
