using AIERP.Platform.Domain;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace AIERP.Platform.Infrastructure;

public static class TenantDatabaseRouting
{
    public const string ConnectionItemKey = "AIERP.TenantDatabaseConnection";
    public const string StudioConnectionItemKey = "AIERP.AIStudioConnection";
    public const string TenantSelectionRequiredKey = "AIERP.TenantSelectionRequired";

    public static string Resolve(HttpContext? context)
    {
        var tenantId = ResolveTenantId(context);
        var connection = context?.Items[ConnectionItemKey] as string
            ?? throw new InvalidOperationException("A Ready tenant database connection was not resolved for this request.");
        var databaseName = new SqlConnectionStringBuilder(connection).InitialCatalog;
        if (!string.Equals(databaseName, $"AIERPTenant_{tenantId:N}", StringComparison.Ordinal))
            throw new InvalidOperationException("The resolved database does not match the selected tenant.");
        return connection;
    }

    public static string ResolveStudio(HttpContext? context)
    {
        _ = ResolveTenantId(context);
        var connection = context?.Items[StudioConnectionItemKey] as string
            ?? throw new InvalidOperationException("The Ready AIStudio database connection was not resolved for this request.");
        if (!string.Equals(new SqlConnectionStringBuilder(connection).InitialCatalog, "AIERPStudio", StringComparison.Ordinal))
            throw new InvalidOperationException("The resolved database is not the AIStudio database.");
        return connection;
    }

    private static Guid ResolveTenantId(HttpContext? context)
    {
        var raw = context?.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(raw, out var tenantId))
            throw new InvalidOperationException("A tenant selection is required to resolve a separated database connection.");
        return tenantId;
    }

    public static async Task ResolveRequestAsync(HttpContext context, IServiceProvider services, string tenantRuntimeConnection)
    {
        var raw = context.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(raw, out var tenantId))
        {
            if (context.User.Identity?.IsAuthenticated == true && RequiresTenantScope(context.Request.Path))
                context.Items[TenantSelectionRequiredKey] = true;
            return;
        }
        using var scope = services.CreateScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var entry = await platform.TenantDatabaseCatalog.AsNoTracking().Where(x => x.TenantId == tenantId).SingleOrDefaultAsync(context.RequestAborted);
        if (entry is null || entry.State != TenantDatabaseProvisioningState.Ready)
        {
            context.Items["AIERP.TenantDatabaseUnavailable"] = true;
            return;
        }
        var expectedDatabaseName = $"AIERPTenant_{tenantId:N}";
        if (!string.Equals(entry.DatabaseName, expectedDatabaseName, StringComparison.Ordinal))
        {
            context.Items["AIERP.TenantDatabaseUnavailable"] = true;
            return;
        }
        var builder = new SqlConnectionStringBuilder(tenantRuntimeConnection) { InitialCatalog = entry.DatabaseName };
        context.Items[ConnectionItemKey] = builder.ConnectionString;
    }

    private static bool RequiresTenantScope(PathString path) =>
        path.StartsWithSegments("/studio", StringComparison.OrdinalIgnoreCase)
        || (path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWithSegments("/api/auth", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWithSegments("/api/platform", StringComparison.OrdinalIgnoreCase));

    public static async Task ResolveAIStudioRequestAsync(HttpContext context, IServiceProvider services, string studioConnection)
    {
        var raw = context.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(raw, out var tenantId))
        {
            if (context.User.Identity?.IsAuthenticated == true && RequiresTenantScope(context.Request.Path))
                context.Items[TenantSelectionRequiredKey] = true;
            return;
        }
        using var scope = services.CreateScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var state = await platform.DatabaseSeparationComponentStates.AsNoTracking()
            .Where(x => x.Component == "AIStudio").SingleOrDefaultAsync(context.RequestAborted);
        if (state is null || state.State != TenantDatabaseProvisioningState.Ready)
        {
            context.Items["AIERP.AIStudioDatabaseUnavailable"] = true;
            return;
        }
        if (!string.Equals(state.DatabaseName, "AIERPStudio", StringComparison.Ordinal))
        {
            context.Items["AIERP.AIStudioDatabaseUnavailable"] = true;
            return;
        }
        var builder = new SqlConnectionStringBuilder(studioConnection) { InitialCatalog = state.DatabaseName };
        context.Items[StudioConnectionItemKey] = builder.ConnectionString;
    }
}
