using Microsoft.AspNetCore.Diagnostics;

namespace AIERP.Api;

internal sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is TenantStorageQuotaExceededException exceeded)
        {
            httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
            await httpContext.Response.WriteAsJsonAsync(new
            {
                error = "Firma depolama kotası dolu. Yeni kayıt eklemek veya değiştirmek için verileri silin ya da lisans paketini yükseltin.",
                code = "license.storage_limit",
                usedBytes = exceeded.UsedBytes,
                maxBytes = exceeded.MaxBytes
            }, cancellationToken);
            return true;
        }

        if (exception is TenantStorageQuotaUnavailableException unavailable)
        {
            logger.LogWarning("Tenant storage quota verification failed for {TenantId}; a write was rejected. TraceId {TraceId}",
                unavailable.TenantId, httpContext.TraceIdentifier);
            httpContext.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await httpContext.Response.WriteAsJsonAsync(new
            {
                error = "Firma depolama kotası doğrulanamadığı için yazma işlemi yapılamadı.",
                code = "license.storage_unavailable",
                traceId = httpContext.TraceIdentifier
            }, cancellationToken);
            return true;
        }

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
