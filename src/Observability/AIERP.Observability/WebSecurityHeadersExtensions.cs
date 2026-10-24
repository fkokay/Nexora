using Microsoft.AspNetCore.Builder;

namespace AIERP.Observability;

/// <summary>Applies browser security headers to backend HTTP responses.</summary>
public static class WebSecurityHeadersExtensions
{
    public static IApplicationBuilder UseAierpSecurityHeaders(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        return app.Use(async (context, next) =>
        {
            context.Response.OnStarting(() =>
            {
                context.Response.Headers["X-Frame-Options"] = "DENY";
                context.Response.Headers["X-Content-Type-Options"] = "nosniff";
                context.Response.Headers["Referrer-Policy"] = "no-referrer";
                return Task.CompletedTask;
            });

            await next();
        });
    }
}
