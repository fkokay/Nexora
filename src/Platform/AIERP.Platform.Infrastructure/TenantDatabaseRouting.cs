using AIERP.Platform.Domain;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace AIERP.Platform.Infrastructure;

public static class TenantDatabaseRouting
{
    public const string TenantCredentialIsolationRequiredMessage =
        "Tenant SQL credential isolation is not configured. Per-tenant runtime credentials and an approved secret provider are required before company database routing can be enabled.";
    public const string ConnectionItemKey = "AIERP.TenantDatabaseConnection";
    public const string StudioConnectionItemKey = "AIERP.AIStudioConnection";
    public const string TenantSelectionRequiredKey = "AIERP.TenantSelectionRequired";
    public const string GitHubCallbackTenantIdKey = "AIERP.GitHubCallbackTenantId";

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
        var tenantId = ResolveStudioTenantId(context);
        var connection = context?.Items[StudioConnectionItemKey] as string
            ?? throw new InvalidOperationException("The Ready AIStudio database connection was not resolved for this request.");
        if (!string.Equals(new SqlConnectionStringBuilder(connection).InitialCatalog,
                TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio), StringComparison.Ordinal))
            throw new InvalidOperationException("The resolved database is not the AIStudio database.");
        return connection;
    }

    public static string StudioComponentKey(Guid tenantId) =>
        tenantId == Guid.Empty ? throw new ArgumentException("Tenant id is required.", nameof(tenantId)) : $"AIStudio:{tenantId:N}";

    private static Guid ResolveTenantId(HttpContext? context)
    {
        var raw = context?.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(raw, out var tenantId))
            throw new InvalidOperationException("A tenant selection is required to resolve a separated database connection.");
        return tenantId;
    }

    private static Guid ResolveStudioTenantId(HttpContext? context)
    {
        var raw = context?.User.FindFirst("tenant_id")?.Value;
        if (Guid.TryParse(raw, out var tenantId)) return tenantId;
        if (context?.Request.Path.Equals("/studio/github/setup-callback", StringComparison.OrdinalIgnoreCase) == true
            && context.Items[GitHubCallbackTenantIdKey] is Guid callbackTenantId && callbackTenantId != Guid.Empty)
            return callbackTenantId;
        throw new InvalidOperationException("A tenant selection is required to resolve a separated database connection.");
    }

    public static async Task ResolveRequestAsync(HttpContext context, IServiceProvider services, string tenantRuntimeConnection)
    {
        // Platform APIs and authentication endpoints use the shared platform database.
        // Do not make those routes depend on tenant database provisioning or Vault.
        if (!RequiresTenantScope(context.Request.Path)) return;

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
        try
        {
            var credentialReader = scope.ServiceProvider.GetRequiredService<ITenantSqlCredentialReader>();
            var secretReference = TenantSqlCredentialPath.ForTenant(tenantId, TenantSqlDatabaseComponent.Erp);
            var credential = await credentialReader.ReadAsync(tenantId, TenantSqlDatabaseComponent.Erp, secretReference, context.RequestAborted);
            if (!string.Equals(credential.DatabaseName, expectedDatabaseName, StringComparison.Ordinal)
                || !TenantSqlCredentialPath.IsValidUserName(tenantId, TenantSqlDatabaseComponent.Erp, credential.UserName))
            {
                context.Items["AIERP.TenantDatabaseUnavailable"] = true;
                return;
            }
            context.Items[ConnectionItemKey] = BuildTenantConnectionString(tenantRuntimeConnection, tenantId, credential);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            // Fail closed without returning Vault/SQL diagnostics to the caller.
            context.Items["AIERP.TenantDatabaseUnavailable"] = true;
        }
    }

    private static bool RequiresTenantScope(PathString path) =>
        path.StartsWithSegments("/studio", StringComparison.OrdinalIgnoreCase)
        || (path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWithSegments("/api/auth", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWithSegments("/api/platform", StringComparison.OrdinalIgnoreCase));

    public static string BuildTenantConnectionString(string connectionTemplate, Guid tenantId, TenantSqlCredential credential)
        => BuildComponentConnectionString(connectionTemplate, tenantId, TenantSqlDatabaseComponent.Erp, credential);

    public static string BuildComponentConnectionString(string connectionTemplate, Guid tenantId,
        TenantSqlDatabaseComponent component, TenantSqlCredential credential)
    {
        var expectedDatabase = TenantSqlCredentialPath.DatabaseName(tenantId, component);
        if (tenantId == Guid.Empty
            || !string.Equals(credential.DatabaseName, expectedDatabase, StringComparison.Ordinal)
            || !TenantSqlCredentialPath.IsValidUserName(tenantId, component, credential.UserName)
            || string.IsNullOrWhiteSpace(credential.Password))
            throw new InvalidOperationException("Tenant SQL credential does not match the selected tenant.");

        var builder = new SqlConnectionStringBuilder(connectionTemplate)
        {
            InitialCatalog = expectedDatabase,
            IntegratedSecurity = false,
            UserID = credential.UserName,
            Password = credential.Password,
            PersistSecurityInfo = false
        };
        return builder.ConnectionString;
    }

    public static async Task ResolveAIStudioRequestAsync(HttpContext context, IServiceProvider services, string studioConnection)
    {
        var raw = context.User.FindFirst("tenant_id")?.Value;
        var hasTenant = Guid.TryParse(raw, out var tenantId);
        if (!hasTenant && context.Request.Path.Equals("/studio/github/setup-callback", StringComparison.OrdinalIgnoreCase)
            && context.Items[GitHubCallbackTenantIdKey] is Guid callbackTenantId && callbackTenantId != Guid.Empty)
        {
            tenantId = callbackTenantId;
            hasTenant = true;
        }
        if (!hasTenant)
        {
            if (context.User.Identity?.IsAuthenticated == true && RequiresTenantScope(context.Request.Path))
                context.Items[TenantSelectionRequiredKey] = true;
            return;
        }
        using var scope = services.CreateScope();
        var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var component = StudioComponentKey(tenantId);
        var state = await platform.DatabaseSeparationComponentStates.AsNoTracking()
            .Where(x => x.Component == component).SingleOrDefaultAsync(context.RequestAborted);
        if (state is null || state.State != TenantDatabaseProvisioningState.Ready)
        {
            context.Items["AIERP.AIStudioDatabaseUnavailable"] = true;
            return;
        }
        var expectedDatabaseName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio);
        if (!string.Equals(state.DatabaseName, expectedDatabaseName, StringComparison.Ordinal))
        {
            context.Items["AIERP.AIStudioDatabaseUnavailable"] = true;
            return;
        }
        try
        {
            var credentialReader = scope.ServiceProvider.GetRequiredService<ITenantSqlCredentialReader>();
            var secretReference = TenantSqlCredentialPath.ForTenant(tenantId, TenantSqlDatabaseComponent.AiStudio);
            var credential = await credentialReader.ReadAsync(tenantId, TenantSqlDatabaseComponent.AiStudio, secretReference, context.RequestAborted);
            if (!string.Equals(credential.DatabaseName, expectedDatabaseName, StringComparison.Ordinal)
                || !TenantSqlCredentialPath.IsValidUserName(tenantId, TenantSqlDatabaseComponent.AiStudio, credential.UserName))
            {
                context.Items["AIERP.AIStudioDatabaseUnavailable"] = true;
                return;
            }
            context.Items[StudioConnectionItemKey] = BuildComponentConnectionString(studioConnection, tenantId,
                TenantSqlDatabaseComponent.AiStudio, credential);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            context.Items["AIERP.AIStudioDatabaseUnavailable"] = true;
        }
    }
}
