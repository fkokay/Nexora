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
    public const string LegacyModeUnavailableKey = "AIERP.DatabaseModeUnavailable";

    public static string Resolve(HttpContext? context, string legacyConnection, bool separated)
    {
        if (!separated) return legacyConnection;
        return context?.Items[ConnectionItemKey] as string
            ?? throw new InvalidOperationException("A Ready tenant database connection was not resolved for this request.");
    }

    public static string ResolveStudio(HttpContext? context, string legacyConnection, bool separated)
    {
        if (!separated) return legacyConnection;
        return context?.Items[StudioConnectionItemKey] as string
            ?? throw new InvalidOperationException("The Ready AIStudio database connection was not resolved for this request.");
    }

    public static async Task ResolveRequestAsync(HttpContext context, IServiceProvider services, string legacyConnection, bool separated)
    {
        if (!separated)
        {
            using var legacyScope = services.CreateScope();
            var legacyPlatform = legacyScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            if (await legacyPlatform.TenantDatabaseCatalog.AsNoTracking().AnyAsync(x => x.State == TenantDatabaseProvisioningState.Ready, context.RequestAborted))
                context.Items[LegacyModeUnavailableKey] = true;
            return;
        }
        var raw = context.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(raw, out var tenantId)) return;
        using var scope = services.CreateScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var entry = await platform.TenantDatabaseCatalog.AsNoTracking().Where(x => x.TenantId == tenantId).SingleOrDefaultAsync(context.RequestAborted);
        if (entry is null || entry.State != TenantDatabaseProvisioningState.Ready)
        {
            context.Items["AIERP.TenantDatabaseUnavailable"] = true;
            return;
        }
        var builder = new SqlConnectionStringBuilder(legacyConnection) { InitialCatalog = entry.DatabaseName };
        context.Items[ConnectionItemKey] = builder.ConnectionString;
    }

    public static async Task ResolveAIStudioRequestAsync(HttpContext context, IServiceProvider services, string legacyConnection, bool separated)
    {
        if (!separated)
        {
            using var legacyScope = services.CreateScope();
            var legacyPlatform = legacyScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            if (await legacyPlatform.DatabaseSeparationComponentStates.AsNoTracking().AnyAsync(x => x.Component == "AIStudio" && x.State == TenantDatabaseProvisioningState.Ready, context.RequestAborted))
                context.Items[LegacyModeUnavailableKey] = true;
            return;
        }
        var raw = context.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(raw, out var tenantId)) return;
        using var scope = services.CreateScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var state = await platform.DatabaseSeparationComponentStates.AsNoTracking()
            .Where(x => x.Component == "AIStudio").SingleOrDefaultAsync(context.RequestAborted);
        if (state is null || state.State != TenantDatabaseProvisioningState.Ready)
        {
            context.Items["AIERP.AIStudioDatabaseUnavailable"] = true;
            return;
        }
        var builder = new SqlConnectionStringBuilder(legacyConnection) { InitialCatalog = state.DatabaseName };
        context.Items[StudioConnectionItemKey] = builder.ConnectionString;
    }
}
