using AIERP.Observability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace AIERP.Platform.IntegrationTests;

public sealed class WebSecurityHeadersIntegrationTests
{
    [Theory]
    [InlineData("/ok", 200)]
    [InlineData("/not-found", 404)]
    public async Task BackendResponses_IncludeSecurityHeaders(string path, int expectedStatus)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.UseAierpSecurityHeaders();
        app.MapGet("/ok", () => Results.Ok());
        await app.StartAsync();

        using var response = await app.GetTestClient().GetAsync(path);

        Assert.Equal(expectedStatus, (int)response.StatusCode);
        Assert.Equal("DENY", Assert.Single(response.Headers.GetValues("X-Frame-Options")));
        Assert.Equal("nosniff", Assert.Single(response.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("no-referrer", Assert.Single(response.Headers.GetValues("Referrer-Policy")));
    }

    [Fact]
    public async Task BackendResponse_OverridesWeakerFramePolicyWithDeny()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.UseAierpSecurityHeaders();
        app.MapGet("/weak-frame-policy", (HttpContext context) =>
        {
            context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
            return Results.Ok();
        });
        await app.StartAsync();

        using var response = await app.GetTestClient().GetAsync("/weak-frame-policy");

        Assert.Equal("DENY", Assert.Single(response.Headers.GetValues("X-Frame-Options")));
    }
}
