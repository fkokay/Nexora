using AIERP.AIService.AI;

namespace AIERP.Platform.UnitTests;

public sealed class SandboxLogRedactorTests
{
    [Fact]
    public void Redact_masks_common_secret_shapes_without_dropping_diagnostic_context()
    {
        const string apiKey = "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz";
        const string bearer = "eyJhbGciOiJIUzI1NiJ9.payload.signature";
        const string password = "local-password-value";
        const string urlPassword = "url-password-value";
        var input = $"Build failed at Program.cs:42; api_key=\"{apiKey}\" Authorization: Bearer {bearer}; password: {password}; https://user:{urlPassword}@example.test/repo";

        var result = SandboxLogRedactor.Redact(input);

        Assert.Contains("Build failed at Program.cs:42", result);
        Assert.DoesNotContain(apiKey, result);
        Assert.DoesNotContain(bearer, result);
        Assert.DoesNotContain(password, result);
        Assert.DoesNotContain(urlPassword, result);
    }

    [Fact]
    public void Redact_caps_log_size_and_handles_null()
    {
        Assert.Equal(string.Empty, SandboxLogRedactor.Redact(null));
        Assert.Equal(16_000, SandboxLogRedactor.Redact(new string('x', 16_100)).Length);
    }
}
