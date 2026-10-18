using System.Text;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Mvc;

namespace AIERP.AIService;

/// <summary>Maps the signed GitHub webhook boundary separately from its persistence callback.</summary>
public static class GitHubWebhookEndpoint
{
    public static RouteHandlerBuilder MapGitHubWebhook(this IEndpointRouteBuilder endpoints,
        Func<HttpContext, GitHubPullRequestWebhookEvent, string, CancellationToken, Task<IResult>> apply)
    {
        return endpoints.MapPost("/studio/github/webhook", async (HttpRequest request, IConfiguration configuration,
            HttpContext context, CancellationToken cancellationToken) =>
        {
            var secret = configuration["GitHub:WebhookSecret"];
            if (string.IsNullOrWhiteSpace(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
                return Results.Problem("GitHub webhook secret is not configured.", statusCode: StatusCodes.Status503ServiceUnavailable);
            const int maximumBodyBytes = 1024 * 1024;
            if (request.ContentLength is > maximumBodyBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            var deliveryId = request.Headers["X-GitHub-Delivery"].ToString();
            var eventName = request.Headers["X-GitHub-Event"].ToString();
            var signature = request.Headers["X-Hub-Signature-256"].ToString();
            if (deliveryId.Length is < 1 or > 100 || eventName.Length is < 1 or > 50 || signature.Length != 71)
                return Results.BadRequest(new { error = "Required GitHub webhook headers are missing or invalid." });

            await using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            while (true)
            {
                var read = await request.Body.ReadAsync(chunk.AsMemory(), cancellationToken);
                if (read == 0) break;
                if (buffer.Length + read > maximumBodyBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
            }
            var payload = buffer.ToArray();
            if (!GitHubWebhookSecurity.ValidateSignature(secret, signature, payload)) return Results.Unauthorized();
            if (!string.Equals(eventName, "pull_request", StringComparison.Ordinal)) return Results.NoContent();
            if (!GitHubWebhookSecurity.TryParsePullRequestEvent(payload, out var webhook))
                return Results.BadRequest(new { error = "GitHub pull request webhook payload is invalid." });
            if (webhook is null) return Results.NoContent();

            return await apply(context, webhook, deliveryId, cancellationToken);
        });
    }
}
