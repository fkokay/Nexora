using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.UnitTests;

public sealed class AIProviderSettingsEncryptionConfigurationTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-base64")]
    [InlineData("AQID")]
    public void Missing_or_invalid_encryption_key_is_reported_as_not_configured(string? value)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AI:SettingsEncryptionKey"] = value
            })
            .Build();

        Assert.False(ApiKeyCipher.IsConfigured(configuration));
    }

    [Fact]
    public void Exactly_256_bit_encryption_key_is_reported_as_configured()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(new byte[32])
            })
            .Build();

        Assert.True(ApiKeyCipher.IsConfigured(configuration));
    }
}
