using System.Net;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace AIERP.Platform.UnitTests;

public sealed class VaultTenantSqlCredentialStoreTests
{
    private static readonly Guid TenantId = Guid.Parse("5dbd2b8b-0539-4e53-87f3-1bd9eb5da4c9");
    private const string RoleId = "test-role-id";
    private const string SecretId = "test-secret-id";
    private const string Password = "unit-test-password-with-high-entropy";

    [Fact]
    public void Deployment_secret_is_read_from_a_mounted_file_without_needing_an_environment_value()
    {
        var file = Path.Combine(Path.GetTempPath(), $"aierp-secret-{Guid.NewGuid():N}");
        try
        {
            File.WriteAllText(file, "mounted-secret\r\n");
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:TenantSqlCredentialReader:SecretIdFile"] = file
            }).Build();

            Assert.Equal("mounted-secret", DeploymentSecretConfiguration.GetValue(configuration,
                "Vault:TenantSqlCredentialReader:SecretId"));
        }
        finally
        {
            if (File.Exists(file)) File.Delete(file);
        }
    }

    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, "/v1/secret/data/tenants/5dbd2b8b-0539-4e53-87f3-1bd9eb5da4c9/sql/erp", "AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, "/v1/secret/data/tenants/5dbd2b8b-0539-4e53-87f3-1bd9eb5da4c9/sql/ai-studio", "AIERPStudio_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_s_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    public async Task Reader_authenticates_and_reads_only_canonical_component_path(
        TenantSqlDatabaseComponent component, string expectedPath, string expectedDatabase, string expectedUserName)
    {
        var handler = new CapturingHandler(async (request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/approle/login")
            {
                using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
                Assert.Equal(RoleId, body.RootElement.GetProperty("role_id").GetString());
                Assert.Equal(SecretId, body.RootElement.GetProperty("secret_id").GetString());
                return Json("""{"auth":{"client_token":"temporary-vault-token","lease_duration":120}}""");
            }

            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal(expectedPath, request.RequestUri.AbsolutePath);
            Assert.Equal("temporary-vault-token", request.Headers.GetValues("X-Vault-Token").Single());
            return Json($"{{\"data\":{{\"data\":{{\"database\":\"{expectedDatabase}\",\"user\":\"{expectedUserName}\",\"password\":\"{Password}\"}},\"metadata\":{{\"version\":3}}}}}}");
        });
        var reader = CreateReader(handler);

        var credential = await reader.ReadAsync(TenantId, component, TenantSqlCredentialPath.ForTenant(TenantId, component));

        Assert.Equal(expectedDatabase, credential.DatabaseName);
        Assert.Equal(expectedUserName, credential.UserName);
        Assert.Equal(Password, credential.Password);
        Assert.Equal(3, credential.Version);
        Assert.Equal(2, handler.RequestCount);
    }

    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, "/v1/secret/data/tenants/5dbd2b8b-0539-4e53-87f3-1bd9eb5da4c9/sql/erp", "AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, "/v1/secret/data/tenants/5dbd2b8b-0539-4e53-87f3-1bd9eb5da4c9/sql/ai-studio", "AIERPStudio_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_s_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    public async Task Writer_uses_separate_writer_role_and_publishes_component_kv_v2_shape(
        TenantSqlDatabaseComponent component, string expectedPath, string expectedDatabase, string expectedUserName)
    {
        const string writeRole = "provisioner-role";
        const string writeSecret = "provisioner-secret";
        var handler = new CapturingHandler(async (request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/approle/login")
            {
                using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
                Assert.Equal(writeRole, body.RootElement.GetProperty("role_id").GetString());
                Assert.Equal(writeSecret, body.RootElement.GetProperty("secret_id").GetString());
                return Json("""{"auth":{"client_token":"writer-token","lease_duration":120}}""");
            }

            Assert.Equal(expectedPath, request.RequestUri.AbsolutePath);
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("writer-token", request.Headers.GetValues("X-Vault-Token").Single());
            using var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            var data = payload.RootElement.GetProperty("data");
            Assert.Equal(expectedDatabase, data.GetProperty("database").GetString());
            Assert.Equal(expectedUserName, data.GetProperty("user").GetString());
            Assert.Equal(Password, data.GetProperty("password").GetString());
            return Json("{}", HttpStatusCode.OK);
        });
        var writer = new VaultTenantSqlCredentialWriter(new HttpClient(handler), Options.Create(new VaultTenantSqlCredentialWriteOptions
        {
            Address = new Uri("https://vault.example.invalid/"),
            Mount = "secret",
            RoleId = writeRole,
            SecretId = writeSecret
        }));

        await writer.WriteAsync(TenantId, component,
            new TenantSqlCredential(expectedDatabase, expectedUserName, Password, 0));

        Assert.Equal(2, handler.RequestCount);
    }

    [Theory]
    [InlineData("../other/sql")]
    [InlineData("tenants/5dbd2b8b-0539-4e53-87f3-1bd9eb5da4c9/sql/../erp")]
    [InlineData("tenants/5DBD2B8B-0539-4E53-87F3-1BD9EB5DA4C9/sql/erp")]
    [InlineData("tenants/00000000-0000-0000-0000-000000000000/sql/erp")]
    [InlineData("tenants/5dbd2b8b-0539-4e53-87f3-1bd9eb5da4c9/sql/unknown")]
    public async Task Reader_rejects_noncanonical_secret_reference_before_http(string secretReference)
    {
        var handler = new CapturingHandler((_, _) => throw new Xunit.Sdk.XunitException("Vault must not be called for a bad path."));
        var reader = CreateReader(handler);

        await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(TenantId, TenantSqlDatabaseComponent.Erp, secretReference));

        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task Reader_rejects_cross_component_path_before_http()
    {
        var handler = new CapturingHandler((_, _) => throw new Xunit.Sdk.XunitException("Vault must not be called for a cross-component path."));
        var reader = CreateReader(handler);

        await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(
            TenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.AiStudio)));

        Assert.Equal(0, handler.RequestCount);
    }

    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, "AIERPStudio_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_s_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, "AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    public async Task Reader_rejects_cross_component_database_and_username(
        TenantSqlDatabaseComponent requestedComponent, string otherDatabase, string otherUserName)
    {
        var response = $"{{\"data\":{{\"data\":{{\"database\":\"{otherDatabase}\",\"user\":\"{otherUserName}\",\"password\":\"{Password}\"}},\"metadata\":{{\"version\":1}}}}}}";
        var reader = CreateReader(ReaderHandler(response));

        await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(
            TenantId, requestedComponent, TenantSqlCredentialPath.ForTenant(TenantId, requestedComponent)));
    }

    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, "AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_s_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, "AIERPStudio_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    public async Task Reader_rejects_cross_component_username_even_when_database_matches(
        TenantSqlDatabaseComponent requestedComponent, string expectedDatabase, string otherUserName)
    {
        var response = $"{{\"data\":{{\"data\":{{\"database\":\"{expectedDatabase}\",\"user\":\"{otherUserName}\",\"password\":\"{Password}\"}},\"metadata\":{{\"version\":1}}}}}}";
        var reader = CreateReader(ReaderHandler(response));

        await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(
            TenantId, requestedComponent, TenantSqlCredentialPath.ForTenant(TenantId, requestedComponent)));
    }

    [Fact]
    public async Task Reader_rejects_wrong_database_and_empty_credentials()
    {
        foreach (var secret in new[]
        {
            "\"database\":\"AIERPTenant_00000000000000000000000000000000\",\"user\":\"aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9\",\"password\":\"unit-test-password-with-high-entropy\"",
            "\"database\":\"AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9\",\"user\":\"aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9\",\"password\":\" \""
        })
        {
            var handler = ReaderHandler($"{{\"data\":{{\"data\":{{{secret}}},\"metadata\":{{\"version\":1}}}}}}");
            var reader = CreateReader(handler);

            await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(TenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.Erp)));
        }
    }

    [Fact]
    public async Task Vault_error_body_and_credentials_are_not_returned_by_exception()
    {
        const string sensitiveError = "sensitive-login-password-secret-token";
        var handler = new CapturingHandler((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/approle/login"
            ? Json("{\"errors\":[\"" + sensitiveError + "\"]}", HttpStatusCode.Forbidden)
            : Json("{}")));
        var reader = CreateReader(handler);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            reader.ReadAsync(TenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.Erp)));

        Assert.Equal("Vault request failed with HTTP 403.", error.Message);
        Assert.DoesNotContain(sensitiveError, error.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(RoleId, error.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(SecretId, error.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Reader_does_not_send_more_than_one_login_when_token_is_cached()
    {
        var handler = ReaderHandler("""{"data":{"data":{"database":"AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9","user":"aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9","password":"unit-test-password-with-high-entropy"},"metadata":{"version":1}}}""");
        var reader = CreateReader(handler);

        _ = await reader.ReadAsync(TenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.Erp));
        _ = await reader.ReadAsync(TenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.Erp));

        Assert.Equal(3, handler.RequestCount);
    }

    [Fact]
    public async Task Reader_shares_one_app_role_login_across_concurrent_secret_reads()
    {
        var loginCount = 0;
        var response = """{"data":{"data":{"database":"AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9","user":"aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9","password":"unit-test-password-with-high-entropy"},"metadata":{"version":1}}}""";
        var handler = new CapturingHandler(async (request, cancellationToken) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/approle/login")
            {
                Interlocked.Increment(ref loginCount);
                await Task.Delay(25, cancellationToken);
                return Json("""{"auth":{"client_token":"temporary-vault-token","lease_duration":120}}""");
            }

            return Json(response);
        });
        var reader = CreateReader(handler);

        await Task.WhenAll(Enumerable.Range(0, 16).Select(_ => reader.ReadAsync(
            TenantId, TenantSqlDatabaseComponent.Erp,
            TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.Erp))));

        Assert.Equal(1, loginCount);
    }

    [Fact]
    public void Reader_and_writer_registrations_are_singletons_for_app_lifetime()
    {
        var services = new ServiceCollection();
        services.AddVaultTenantSqlCredentialReader(options =>
        {
            options.Address = new Uri("https://vault.example.invalid/");
            options.RoleId = RoleId;
            options.SecretId = SecretId;
        });
        services.AddVaultTenantSqlCredentialWriter(options =>
        {
            options.Address = new Uri("https://vault.example.invalid/");
            options.RoleId = "writer-role";
            options.SecretId = "writer-secret";
        });
        using var provider = services.BuildServiceProvider();

        Assert.Same(provider.GetRequiredService<ITenantSqlCredentialReader>(),
            provider.GetRequiredService<ITenantSqlCredentialReader>());
        Assert.Same(provider.GetRequiredService<ITenantSqlCredentialWriter>(),
            provider.GetRequiredService<ITenantSqlCredentialWriter>());
    }

    [Fact]
    public async Task Reader_rejects_redirect_response_without_disclosing_vault_details()
    {
        var handler = new CapturingHandler((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/approle/login"
            ? Json("""{"auth":{"client_token":"temporary-vault-token","lease_duration":120}}""")
            : new HttpResponseMessage(HttpStatusCode.TemporaryRedirect)
            {
                Headers = { Location = new Uri("https://attacker.example.invalid/capture") }
            }));
        var reader = CreateReader(handler);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            reader.ReadAsync(TenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.Erp)));

        Assert.Equal("Vault request failed with HTTP 307.", error.Message);
        Assert.Equal(2, handler.RequestCount);
    }

    [Fact]
    public async Task Reader_rejects_oversized_vault_body()
    {
        var oversized = "{" + new string('x', 33 * 1024) + "}";
        var handler = new CapturingHandler((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/approle/login"
            ? Json("""{"auth":{"client_token":"temporary-vault-token","lease_duration":120}}""")
            : Json(oversized)));
        var reader = CreateReader(handler);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            reader.ReadAsync(TenantId, TenantSqlDatabaseComponent.Erp, TenantSqlCredentialPath.ForTenant(TenantId, TenantSqlDatabaseComponent.Erp)));

        Assert.Equal("Vault response exceeded the allowed size.", error.Message);
    }

    [Fact]
    public async Task Writer_rejects_mismatched_tenant_database_before_http()
    {
        var handler = new CapturingHandler((_, _) => throw new Xunit.Sdk.XunitException("Vault must not be called for a mismatched database."));
        var writer = new VaultTenantSqlCredentialWriter(new HttpClient(handler), Options.Create(new VaultTenantSqlCredentialWriteOptions
        {
            Address = new Uri("https://vault.example.invalid/"), RoleId = "write-role", SecretId = "write-secret"
        }));

        await Assert.ThrowsAsync<InvalidOperationException>(() => writer.WriteAsync(TenantId, TenantSqlDatabaseComponent.Erp,
            new TenantSqlCredential("AIERPTenant_00000000000000000000000000000000", $"aierp_t_{TenantId:N}", Password, 0)));

        Assert.Equal(0, handler.RequestCount);
    }

    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, "AIERPStudio_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_s_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, "AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    public async Task Writer_rejects_cross_component_database_and_username_before_http(
        TenantSqlDatabaseComponent requestedComponent, string otherDatabase, string otherUserName)
    {
        var handler = new CapturingHandler((_, _) => throw new Xunit.Sdk.XunitException("Vault must not be called for a cross-component identity."));
        var writer = new VaultTenantSqlCredentialWriter(new HttpClient(handler), Options.Create(new VaultTenantSqlCredentialWriteOptions
        {
            Address = new Uri("https://vault.example.invalid/"), RoleId = "write-role", SecretId = "write-secret"
        }));

        await Assert.ThrowsAsync<InvalidOperationException>(() => writer.WriteAsync(TenantId, requestedComponent,
            new TenantSqlCredential(otherDatabase, otherUserName, Password, 0)));

        Assert.Equal(0, handler.RequestCount);
    }

    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, "AIERPTenant_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_s_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, "AIERPStudio_5dbd2b8b05394e5387f31bd9eb5da4c9", "aierp_t_5dbd2b8b05394e5387f31bd9eb5da4c9")]
    public async Task Writer_rejects_cross_component_username_even_when_database_matches_before_http(
        TenantSqlDatabaseComponent requestedComponent, string expectedDatabase, string otherUserName)
    {
        var handler = new CapturingHandler((_, _) => throw new Xunit.Sdk.XunitException("Vault must not be called for a cross-component user."));
        var writer = new VaultTenantSqlCredentialWriter(new HttpClient(handler), Options.Create(new VaultTenantSqlCredentialWriteOptions
        {
            Address = new Uri("https://vault.example.invalid/"), RoleId = "write-role", SecretId = "write-secret"
        }));

        await Assert.ThrowsAsync<InvalidOperationException>(() => writer.WriteAsync(TenantId, requestedComponent,
            new TenantSqlCredential(expectedDatabase, otherUserName, Password, 0)));

        Assert.Equal(0, handler.RequestCount);
    }

    [Theory]
    [InlineData("http://vault.example.invalid/")]
    [InlineData("http://localhost/")]
    public void Rejects_http_without_explicit_local_development_option(string address)
    {
        var readerOptions = new VaultTenantSqlCredentialReadOptions
        {
            Address = new Uri(address), RoleId = RoleId, SecretId = SecretId
        };

        Assert.Throws<InvalidOperationException>(() => new VaultTenantSqlCredentialReader(new HttpClient(new CapturingHandler((_, _) => throw new Xunit.Sdk.XunitException("Unexpected Vault request."))), Options.Create(readerOptions)));
    }

    [Fact]
    public void Rejects_nonlocal_http_even_when_local_development_is_enabled()
    {
        var readerOptions = new VaultTenantSqlCredentialReadOptions
        {
            Address = new Uri("http://vault.example.invalid/"), RoleId = RoleId, SecretId = SecretId,
            AllowHttpForLocalDevelopment = true
        };

        Assert.Throws<InvalidOperationException>(() => new VaultTenantSqlCredentialReader(new HttpClient(new CapturingHandler((_, _) => throw new Xunit.Sdk.XunitException("Unexpected Vault request."))), Options.Create(readerOptions)));
    }

    [Fact]
    public void Allows_http_only_for_explicit_localhost_development()
    {
        var reader = new VaultTenantSqlCredentialReader(new HttpClient(new CapturingHandler((_, _) => Task.FromResult(Json("{}")))),
            Options.Create(new VaultTenantSqlCredentialReadOptions
            {
                Address = new Uri("http://localhost:8200/"), RoleId = RoleId, SecretId = SecretId,
                AllowHttpForLocalDevelopment = true
            }));

        Assert.NotNull(reader);
    }

    private static VaultTenantSqlCredentialReader CreateReader(CapturingHandler handler) => new(new HttpClient(handler),
        Options.Create(new VaultTenantSqlCredentialReadOptions
        {
            Address = new Uri("https://vault.example.invalid/"), Mount = "secret", RoleId = RoleId, SecretId = SecretId
        }));

    private static CapturingHandler ReaderHandler(string dataResponse) => new(async (request, _) =>
    {
        if (request.RequestUri!.AbsolutePath == "/v1/auth/approle/login")
            return Json("""{"auth":{"client_token":"temporary-vault-token","lease_duration":120}}""");
        return Json(dataResponse);
    });

    private static HttpResponseMessage Json(string body, HttpStatusCode statusCode = HttpStatusCode.OK) =>
        new(statusCode) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class CapturingHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            return send(request, cancellationToken);
        }
    }
}
