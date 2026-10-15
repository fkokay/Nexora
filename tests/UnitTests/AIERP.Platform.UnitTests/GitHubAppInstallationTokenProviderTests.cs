using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.AIService.AI;
using Microsoft.Extensions.Configuration;
using System.IdentityModel.Tokens.Jwt;

namespace AIERP.Platform.UnitTests;

public sealed class GitHubAppInstallationTokenProviderTests
{
    [Fact]
    public async Task Creates_short_lived_token_scoped_to_one_repository_and_minimum_permissions()
    {
        using var rsa = RSA.Create(2048);
        var handler = new CapturingHandler(async request =>
        {
            Assert.Equal("https://api.github.com/app/installations/12345/access_tokens", request.RequestUri!.AbsoluteUri);
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            var appJwt = new JwtSecurityTokenHandler().ReadJwtToken(request.Headers.Authorization.Parameter);
            Assert.Equal("98765", appJwt.Issuer);
            var issuedAt = Convert.ToInt64(appJwt.Payload["iat"]);
            var expiresAt = Convert.ToInt64(appJwt.Payload["exp"]);
            Assert.True(issuedAt > 0);
            Assert.InRange(expiresAt - issuedAt, 1, 9 * 60);
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            Assert.Equal("Acme/Inventory", json.RootElement.GetProperty("repositories")[0].GetString());
            var permissions = json.RootElement.GetProperty("permissions");
            Assert.Equal("write", permissions.GetProperty("contents").GetString());
            Assert.Equal("write", permissions.GetProperty("pull_requests").GetString());
            Assert.Equal(2, permissions.EnumerateObject().Count());
            return new HttpResponseMessage(HttpStatusCode.Created) { Content = new StringContent("{\"token\":\"ghs_ephemeral-test\"}", Encoding.UTF8, "application/json") };
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GitHub:AppId"] = "98765",
            ["GitHub:PrivateKeyPem"] = rsa.ExportPkcs8PrivateKeyPem()
        }).Build();
        var provider = new GitHubAppInstallationTokenProvider(new HttpClient(handler), configuration);

        var token = await provider.CreateRepositoryTokenAsync(12345, "Acme/Inventory", CancellationToken.None);

        Assert.Equal("ghs_ephemeral-test", token);
        Assert.True(handler.Called);
    }

    [Fact]
    public async Task Does_not_call_github_without_app_configuration()
    {
        var handler = new CapturingHandler(_ => throw new Xunit.Sdk.XunitException("GitHub must not be called."));
        var provider = new GitHubAppInstallationTokenProvider(new HttpClient(handler), new ConfigurationBuilder().Build());

        await Assert.ThrowsAsync<GitHubAppConfigurationException>(() => provider.CreateRepositoryTokenAsync(1, "Acme/Inventory", CancellationToken.None));
        Assert.False(handler.Called);
    }

    private sealed class CapturingHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        public bool Called { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Called = true;
            return send(request);
        }
    }
}
