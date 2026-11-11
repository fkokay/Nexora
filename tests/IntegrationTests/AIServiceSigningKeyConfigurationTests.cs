using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class AIServiceSigningKeyConfigurationTests
{
    private const string UserTokenKey = "synthetic-ai-service-user-token-signing-key-32-bytes";
    private const string RunnerKey = "synthetic-workspace-runner-service-signing-key-32-bytes";

    [Theory]
    [InlineData(UserTokenKey, null, "WorkspaceRunner:SigningKey must differ from Authentication:SigningKey.")]
    [InlineData(null, UserTokenKey, "ReleaseDeployer:SigningKey must differ from Authentication:SigningKey.")]
    [InlineData("too-short-runner-key", null, "WorkspaceRunner:SigningKey must contain at least 32 bytes.")]
    [InlineData(RunnerKey, RunnerKey, "WorkspaceRunner:SigningKey and ReleaseDeployer:SigningKey must differ.")]
    public void AI_service_refuses_service_keys_that_would_let_peers_mint_each_others_tokens(
        string? runnerKey, string? deployerKey, string expectedMessage)
    {
        using var factory = new SigningKeyFactory(runnerKey, deployerKey);
        var exception = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Equal(expectedMessage, exception.Message);
    }

    private sealed class SigningKeyFactory(string? runnerKey, string? deployerKey)
        : WebApplicationFactory<AIERP.AIService.AIServiceEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = UserTokenKey,
                ["WorkspaceRunner:SigningKey"] = runnerKey,
                ["ReleaseDeployer:SigningKey"] = deployerKey
            }));
            return base.CreateHost(builder);
        }
    }
}
