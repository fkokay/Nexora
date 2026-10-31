using Microsoft.Extensions.Configuration;
using Microsoft.Data.SqlClient;

namespace AIERP.Platform.Infrastructure;

/// <summary>Shared startup contract for hosts that access company-owned operational data.</summary>
public static class DatabaseIsolationConfiguration
{
    public static string RequirePlatformOnlyMigration(IConfiguration configuration)
    {
        const string serviceName = "Platform-only migration";
        // This path must be enabled by the deployment environment itself. An
        // appsettings default is not an operator confirmation of DB isolation.
        var separationEnabled = Environment.GetEnvironmentVariable("Database__SeparationEnabled");
        if (!string.Equals(separationEnabled, "true", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"{serviceName} requires the deployment environment variable Database__SeparationEnabled=true.");
        var confirmedTarget = Environment.GetEnvironmentVariable("AIERP_PLATFORM_MIGRATION_TARGET");
        if (!string.Equals(confirmedTarget, "AIERPPlatform", StringComparison.Ordinal))
            throw new InvalidOperationException($"{serviceName} requires AIERP_PLATFORM_MIGRATION_TARGET=AIERPPlatform in the deployment environment.");

        var connectionString = configuration.GetConnectionString("Platform");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException($"{serviceName} requires ConnectionStrings:Platform.");

        SqlConnectionStringBuilder platform;
        try { platform = new SqlConnectionStringBuilder(connectionString); }
        catch (ArgumentException ex) { throw new InvalidOperationException($"{serviceName} requires a valid ConnectionStrings:Platform SQL Server connection string.", ex); }
        if (string.IsNullOrWhiteSpace(platform.DataSource) || string.IsNullOrWhiteSpace(platform.InitialCatalog)
            || !string.IsNullOrWhiteSpace(platform.AttachDBFilename))
            throw new InvalidOperationException($"{serviceName} requires ConnectionStrings:Platform to name a server and database directly.");
        if (!string.Equals(platform.InitialCatalog, "AIERPPlatform", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"{serviceName} only permits the AIERPPlatform database as its migration target.");
        if (platform.IntegratedSecurity || HasDuplicateCredentialAliases(connectionString))
            throw new InvalidOperationException($"{serviceName} requires a single SQL-authentication credential pair and does not permit integrated authentication or duplicate credential aliases.");
        if (!string.Equals(platform.UserID, "aierp_platform_migrator", StringComparison.Ordinal)
            || string.IsNullOrWhiteSpace(platform.Password))
            throw new InvalidOperationException($"{serviceName} requires the configured aierp_platform_migrator credential; server administrator credentials are not accepted.");

        foreach (var name in new[] { "Tenant", "AIStudio" })
        {
            var otherConnectionString = configuration.GetConnectionString(name);
            if (string.IsNullOrWhiteSpace(otherConnectionString)) continue;
            SqlConnectionStringBuilder other;
            try { other = new SqlConnectionStringBuilder(otherConnectionString); }
            catch (ArgumentException ex) { throw new InvalidOperationException($"{serviceName} received an invalid ConnectionStrings:{name} value.", ex); }
            if (string.Equals(platform.DataSource, other.DataSource, StringComparison.OrdinalIgnoreCase)
                && string.Equals(platform.InitialCatalog, other.InitialCatalog, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"{serviceName} refuses to migrate Platform because ConnectionStrings:{name} targets the same database.");
        }

        return connectionString;
    }

    private static bool HasDuplicateCredentialAliases(string connectionString)
    {
        // SqlClient resolves aliases such as User ID/UID and Password/PWD to
        // the same setting. Inspect only keys here because its builder retains
        // the final value and would hide an earlier, conflicting alias.
        var credentialGroups = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var start = 0;
        var quote = '\0';
        for (var index = 0; index <= connectionString.Length; index++)
        {
            if (index < connectionString.Length)
            {
                var current = connectionString[index];
                if (quote != '\0')
                {
                    if (current == quote)
                    {
                        if (index + 1 < connectionString.Length && connectionString[index + 1] == quote)
                        {
                            index++;
                            continue;
                        }
                        quote = '\0';
                    }
                    continue;
                }

                if (current is '\'' or '"')
                {
                    quote = current;
                    continue;
                }
                if (current != ';') continue;
            }

            var segment = connectionString.AsSpan(start, index - start);
            var equals = segment.IndexOf('=');
            if (equals >= 0)
            {
                var key = segment[..equals].Trim().ToString();
                var group = key.ToUpperInvariant() switch
                {
                    "USER ID" or "UID" or "USER" or "USERNAME" => "user",
                    "PASSWORD" or "PWD" => "password",
                    _ => null
                };
                if (group is not null)
                {
                    credentialGroups.TryGetValue(group, out var count);
                    credentialGroups[group] = count + 1;
                    if (count > 0) return true;
                }
            }
            start = index + 1;
        }

        return false;
    }

    public static void RequireTenantCredentialIsolation(string serviceName, IConfiguration configuration,
        bool requireProvisioningWriter = false)
    {
        if (!bool.TryParse(configuration["Database:SeparationEnabled"], out var enabled) || !enabled)
            throw new InvalidOperationException($"{serviceName} requires Database:SeparationEnabled=true before tenant database routing can start.");

        var vaultAddressValue = configuration["Vault:Address"];
        if (!Uri.TryCreate(vaultAddressValue, UriKind.Absolute, out var vaultAddress)
            || (vaultAddress.Scheme != Uri.UriSchemeHttps && vaultAddress.Scheme != Uri.UriSchemeHttp)
            || !string.IsNullOrEmpty(vaultAddress.UserInfo) || !string.IsNullOrEmpty(vaultAddress.Query)
            || !string.IsNullOrEmpty(vaultAddress.Fragment) || vaultAddress.AbsolutePath != "/")
            throw new InvalidOperationException($"{serviceName} requires Vault:Address to be an absolute HTTP(S) URL without embedded credentials or query parameters.");

        var allowLocalHttp = configuration.GetValue<bool>("Vault:AllowHttpForLocalDevelopment");
        var isDevelopment = string.Equals(configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase)
            || string.Equals(configuration["DOTNET_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
        if (vaultAddress.Scheme == Uri.UriSchemeHttp && (!allowLocalHttp || !isDevelopment))
            throw new InvalidOperationException($"{serviceName} permits an HTTP Vault endpoint only for explicitly opted-in Development environments.");

        var mount = configuration["Vault:Mount"] ?? "secret";
        if (!System.Text.RegularExpressions.Regex.IsMatch(mount, "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$", System.Text.RegularExpressions.RegexOptions.CultureInvariant))
            throw new InvalidOperationException($"{serviceName} requires a valid Vault KV v2 mount name.");

        RequireAppRole("TenantSqlCredentialReader", "reader");
        if (requireProvisioningWriter) RequireAppRole("TenantSqlCredentialWriter", "provisioning writer");

        void RequireAppRole(string role, string purpose)
        {
            if (string.IsNullOrWhiteSpace(DeploymentSecretConfiguration.GetValue(configuration, $"Vault:{role}:RoleId"))
                || string.IsNullOrWhiteSpace(DeploymentSecretConfiguration.GetValue(configuration, $"Vault:{role}:SecretId")))
                throw new InvalidOperationException($"{serviceName} requires a dedicated Vault AppRole {purpose} (Vault:{role}:RoleId and SecretId).");
        }
    }

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
