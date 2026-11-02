using System.Text;
using AIERP.IntegrationHost;
using AIERP.IntegrationSDK;
using AIERP.Observability;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 160 * 1024);
builder.Services.AddAierpHttpMetrics();
builder.Services.AddHostedService<PrometheusBusinessMetricsBridge>();
var signingKey = builder.Configuration["IntegrationHost:SigningKey"];
if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
    throw new InvalidOperationException("IntegrationHost:SigningKey must contain at least 32 bytes.");
builder.Services.AddSingleton<IIntegrationSecretResolver, FileIntegrationSecretResolver>();
builder.Services.AddSingleton<IntegrationDispatcher>();
builder.Services.AddHttpClient("integration-outbound", client => client.Timeout = TimeSpan.FromSeconds(35))
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        UseCookies = false,
        ConnectTimeout = TimeSpan.FromSeconds(5),
        PooledConnectionLifetime = TimeSpan.FromMinutes(2)
    });
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = builder.Configuration["IntegrationHost:Issuer"] ?? "AIERP",
        ValidateAudience = true, ValidAudience = builder.Configuration["IntegrationHost:Audience"] ?? "AIERP.IntegrationHost",
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(5)
    };
});
builder.Services.AddAuthorization(options => options.AddPolicy("IntegrationExecution", policy => policy.RequireAuthenticatedUser()
    .RequireClaim("service", "AIERP.Api").RequireClaim("operation", "integration.execute")
    .RequireClaim("tenant_id").RequireClaim("integration_code")));
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("integration-execute", limiter =>
{
    limiter.PermitLimit = 6;
    limiter.Window = TimeSpan.FromSeconds(10);
    limiter.QueueLimit = 0;
}));
var app = builder.Build();
app.UseAierpSecurityHeaders();
app.UseAierpHttpMetrics();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapGet("/health", (IntegrationDispatcher dispatcher) =>
{
    var summary = dispatcher.GetHealthSummary();
    return Results.Ok(new
    {
        status = summary.InvalidConfigurationAdapters == 0 ? "healthy" : "degraded",
        service = "integration-host",
        configuredAdapters = summary.ConfiguredAdapters,
        validConfigurationAdapters = summary.ValidConfigurationAdapters,
        invalidConfigurationAdapters = summary.InvalidConfigurationAdapters
    });
});
app.MapIntegrationExecution();
app.MapAierpMetrics();
app.Run();

public partial class Program;
