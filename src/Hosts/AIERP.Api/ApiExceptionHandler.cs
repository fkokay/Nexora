using Microsoft.AspNetCore.Diagnostics;

namespace AIERP.Api;

internal sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        logger.LogError(exception, "Unhandled API exception. TraceId {TraceId}", httpContext.TraceIdentifier);
        if (httpContext.Response.HasStarted) return false;

        httpContext.Response.Clear();
        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(new
        {
            error = "İstek sunucuda tamamlanamadı.",
            traceId = httpContext.TraceIdentifier
        }, cancellationToken);
        return true;
    }
}
