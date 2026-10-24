using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

namespace AIERP.Api;

internal static class LiveAiEvaluationEndpoints
{
    internal const string TenantUserPolicy = "ai-live-evaluation";

    internal static void ConfigureRateLimiting(RateLimiterOptions options)
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.AddPolicy(TenantUserPolicy, context =>
        {
            var partitionKey = TryGetIdentity(context.User, out var tenantId, out var userId)
                ? $"{tenantId:D}:{userId:D}"
                : $"invalid-auth-context:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown-peer"}";
            return RateLimitPartition.GetFixedWindowLimiter(partitionKey,
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 1,
                    Window = TimeSpan.FromMinutes(10),
                    QueueLimit = 0,
                    AutoReplenishment = true
                });
        });

        // RemoteIpAddress is the socket peer unless trusted-proxy ForwardedHeaders middleware
        // is explicitly configured before rate limiting. Never read X-Forwarded-For directly.
        // This high ceiling limits abusive bursts without replacing the tenant/user budget.
        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            context.Request.Path.Equals("/api/ai-settings/live-evaluation", StringComparison.OrdinalIgnoreCase)
                ? RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown-peer",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 30,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    })
                : RateLimitPartition.GetNoLimiter("no-live-evaluation-ip-limit"));
    }

    internal static void Map(WebApplication app) => app.MapPost("/api/ai-settings/live-evaluation", HandleAsync)
        .RequireAuthorization()
        .RequireRateLimiting(TenantUserPolicy);

    private static async Task<IResult> HandleAsync(global::LiveAiEvaluationRequest request, ClaimsPrincipal principal,
        PlatformDbContext db, IConfiguration configuration, IHttpClientFactory clients, CancellationToken cancellationToken)
    {
        if (!TryGetIdentity(principal, out var tenantId, out var userId)
            || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
        var activeMembership = await db.TenantMemberships.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.UserId == userId && x.Role == "TenantAdmin")
            .Select(x => new { UserIsActive = x.User.IsActive, TenantIsActive = x.Tenant.IsActive })
            .SingleOrDefaultAsync(cancellationToken);
        if (activeMembership is null || !activeMembership.UserIsActive || !activeMembership.TenantIsActive)
            return Results.Forbid();
        if (!configuration.GetValue<bool>("AI:LiveEvaluation:Enabled")) return Results.NotFound();
        if (!LiveAiEvaluation.TryGetCase(request.CaseId, out var evaluationCase))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["caseId"] = ["Unknown synthetic evaluation case."] });

        var settings = await db.TenantAIProviderSettings.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (settings?.Provider != "OpenAI" || string.IsNullOrWhiteSpace(settings.OpenAIKeyCipherText))
            return Results.Problem("A saved OpenAI key is required for this evaluation.", statusCode: StatusCodes.Status409Conflict);
        if (!ApiKeyCipher.IsConfigured(configuration))
            return Results.Problem("The server-side AI key resolver is not configured.", statusCode: StatusCodes.Status503ServiceUnavailable);

        string apiKey;
        try { apiKey = ApiKeyCipher.Decrypt(settings.OpenAIKeyCipherText, tenantId, ApiKeyPurpose.OpenAiApiKey, configuration); }
        catch (Exception ex) when (ex is CryptographicException or FormatException or InvalidOperationException)
        {
            return Results.Problem("The saved OpenAI key could not be resolved.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        var model = string.IsNullOrWhiteSpace(settings.OpenAIModel) ? "gpt-6-astra" : settings.OpenAIModel.Trim();
        if (model.Length > 200)
            return Results.Problem("The configured OpenAI model is invalid.", statusCode: StatusCodes.Status503ServiceUnavailable);

        db.AuditEvents.Add(new AuditEvent
        {
            TenantId = tenantId,
            UserId = userId,
            Action = "ai.live-evaluation.requested",
            Resource = $"{LiveAiEvaluation.EvaluationSetId}:{evaluationCase.Id}"
        });
        await db.SaveChangesAsync(cancellationToken);

        async Task<IResult> FinishAsync(string outcome, IResult result)
        {
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                UserId = userId,
                Action = "ai.live-evaluation." + outcome,
                Resource = $"{LiveAiEvaluation.EvaluationSetId}:{evaluationCase.Id}"
            });
            await db.SaveChangesAsync(CancellationToken.None);
            return result;
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        message.Headers.Accept.ParseAdd("application/json");
        message.Content = new StringContent(LiveAiEvaluation.BuildResponsesRequest(model, evaluationCase), Encoding.UTF8, "application/json");
        try
        {
            using var response = await clients.CreateClient("openai-live-evaluation").SendAsync(message,
                HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var outcome = response.StatusCode == HttpStatusCode.TooManyRequests ? "rate-limited" :
                    response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ? "key-rejected" : "provider-failed";
                return await FinishAsync(outcome, Results.Problem("The live evaluation provider request failed.", statusCode: StatusCodes.Status502BadGateway));
            }

            var bytes = await LiveAiEvaluation.ReadBoundedResponseAsync(response.Content, 256 * 1024, cancellationToken);
            using var document = JsonDocument.Parse(bytes);
            var answer = LiveAiEvaluation.ExtractAnswer(document.RootElement);
            if (answer is null)
                return await FinishAsync("invalid-response", Results.Problem("The provider did not return a completed evaluation answer.", statusCode: StatusCodes.Status502BadGateway));
            return await FinishAsync("completed", Results.Ok(new global::LiveAiEvaluationResponse(
                LiveAiEvaluation.EvaluationSetId, evaluationCase.Id, answer, Store: false, HumanReviewRequired: true)));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidDataException)
        {
            return await FinishAsync("provider-failed", Results.Problem("The live evaluation provider request failed.", statusCode: StatusCodes.Status502BadGateway));
        }
    }

    private static bool TryGetIdentity(ClaimsPrincipal principal, out Guid tenantId, out Guid userId)
    {
        tenantId = Guid.Empty;
        userId = Guid.Empty;
        return Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId)
            && Guid.TryParse(principal.FindFirstValue("sub"), out userId);
    }
}
