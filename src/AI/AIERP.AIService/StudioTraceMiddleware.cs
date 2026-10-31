using Microsoft.AspNetCore.Http;

namespace AIERP.AIService;

/// <summary>
/// Adds a safe support identifier to Studio API responses and hides unexpected server details.
/// </summary>
public sealed class StudioTraceMiddleware(RequestDelegate next, ILogger<StudioTraceMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/studio", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var traceId = Guid.NewGuid().ToString("N");
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Trace-Id"] = traceId;
            return Task.CompletedTask;
        });

        var responseBody = context.Response.Body;
        await using var bufferedBody = new MemoryStream();
        context.Response.Body = bufferedBody;

        try
        {
            await next(context);
        }
        catch (Exception exception) when (!context.RequestAborted.IsCancellationRequested)
        {
            logger.LogError(exception, "Unhandled Studio API error. TraceId: {TraceId}", traceId);
            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            bufferedBody.SetLength(0);
        }

        if (context.Response.StatusCode is StatusCodes.Status401Unauthorized or StatusCodes.Status500InternalServerError)
        {
            var status = context.Response.StatusCode;
            context.Response.Clear();
            context.Response.StatusCode = status;
            bufferedBody.SetLength(0);
            await WriteSafeErrorAsync(context, traceId, status,
                status == StatusCodes.Status401Unauthorized ? "Yetkilendirme başarısız." : "Sunucu hatası.");
        }

        context.Response.Body = responseBody;
        bufferedBody.Position = 0;
        await bufferedBody.CopyToAsync(responseBody, context.RequestAborted);
    }

    private static Task WriteSafeErrorAsync(HttpContext context, string traceId, int status, string title) =>
        context.Response.WriteAsJsonAsync(new { title, status, traceId }, context.RequestAborted);
}
