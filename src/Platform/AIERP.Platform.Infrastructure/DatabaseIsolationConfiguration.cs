using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.Infrastructure;

/// <summary>Shared startup contract for hosts that access company-owned operational data.</summary>
public static class DatabaseIsolationConfiguration
{
    public static void RequireEnabled(IConfiguration configuration, string serviceName, params string[] requiredConnectionStrings)
    {
        var configured = configuration["Database:SeparationEnabled"];
        if (!bool.TryParse(configured, out var enabled) || !enabled)
            throw new InvalidOperationException($"{serviceName} requires Database:SeparationEnabled=true. Shared company databases are not supported; migrate legacy data with the documented backup-and-copy workflow before starting this version.");

        foreach (var name in requiredConnectionStrings)
        {
            if (string.IsNullOrWhiteSpace(configuration.GetConnectionString(name)))
                throw new InvalidOperationException($"{serviceName} requires ConnectionStrings:{name} when company database isolation is enabled.");
        }
    }
}
