namespace AIERP.ReleaseDeployer;

/// <summary>
/// Keeps generated ReleaseDeployer deployments disabled until their stack has
/// the synthetic-tenant provisioning and isolated Vault lifecycle required
/// for tenant isolation. This is a preflight, not a claim that the current
/// template is tenant-isolated.
/// </summary>
public static class TenantSqlVaultStagingPolicy
{
    private static readonly string[] RequiredComposeMarkers =
    [
        "tenant-provisioning-worker:",
        "ConnectionStrings__ProvisioningFile:",
        "Vault__TenantSqlCredentialWriter__RoleIdFile:",
        "Vault__TenantSqlCredentialWriter__SecretIdFile:",
        "Vault__TenantSqlCredentialReader__RoleIdFile:",
        "Vault__TenantSqlCredentialReader__SecretIdFile:",
        "Vault__CaCertificateFile:",
        "Vault__Address:",
        "AIERP_STAGING_TENANT_ID"
    ];

    private static readonly string[] ForbiddenComposeMarkers =
    [
        "aierp_data_runtime",
        "AIERP_DATA_RUNTIME_PASSWORD",
        "VAULT_TOKEN"
    ];

    public static IReadOnlyList<string> MissingRequirements(string compose)
    {
        ArgumentNullException.ThrowIfNull(compose);
        var missing = RequiredComposeMarkers
            .Where(marker => !compose.Contains(marker, StringComparison.Ordinal))
            .ToList();
        missing.AddRange(ForbiddenComposeMarkers
            .Where(marker => compose.Contains(marker, StringComparison.OrdinalIgnoreCase))
            .Select(marker => $"forbidden:{marker}"));
        return missing;
    }

    public static bool IsEnabled(bool explicitlyEnabled, bool syntheticIdentityLifecycleImplemented, string compose) =>
        explicitlyEnabled && syntheticIdentityLifecycleImplemented && MissingRequirements(compose).Count == 0;

    public static bool CanUseUnsafeAcceptanceFixture(string? environmentName, bool explicitlyEnabled, bool fakeDockerEnabled) =>
        explicitlyEnabled && fakeDockerEnabled && string.Equals(environmentName, "Test", StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// Resolves the durable synthetic identity for a staging project. The owner tenant
/// is never reused; once chosen, the encrypted deployment record owns the mapping.
/// </summary>
public static class StagingTenantIdentity
{
    public static Guid Resolve(Guid ownerTenantId, Guid? persistedSyntheticTenantId)
    {
        if (ownerTenantId == Guid.Empty)
            throw new ArgumentException("A staging deployment owner tenant is required.", nameof(ownerTenantId));

        if (persistedSyntheticTenantId is Guid persisted && persisted != Guid.Empty)
        {
            if (persisted == ownerTenantId)
                throw new InvalidOperationException("The synthetic staging tenant cannot reuse the deployment owner tenant.");
            return persisted;
        }

        Guid syntheticTenantId;
        do syntheticTenantId = Guid.NewGuid();
        while (syntheticTenantId == ownerTenantId);
        return syntheticTenantId;
    }
}

/// <summary>
/// Verifies that the isolated bootstrap tenant was actually provisioned before
/// ReleaseDeployer reports a staging deployment as ready. Container health alone
/// only proves that the Platform database and frontend respond.
/// </summary>
public static class StagingProvisioningReadiness
{
    public const string ReadyMarker = "NEXORA_STAGING_PROVISIONED";
    public const string PendingMarker = "NEXORA_STAGING_PENDING";

    public static string BuildSql(Guid tenantId)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Staging tenant id is required.", nameof(tenantId));
        var canonicalId = tenantId.ToString("N");
        var sql = $"""
            SET NOCOUNT ON;
            DECLARE @tenantId uniqueidentifier = '{tenantId:D}';
            DECLARE @tenantDatabase nvarchar(128) = N'AIERPTenant_{canonicalId}';
            DECLARE @studioDatabase nvarchar(128) = N'AIERPStudio_{canonicalId}';
            DECLARE @studioComponent nvarchar(64) = N'AIStudio:{canonicalId}';
            SELECT CASE WHEN EXISTS
            (
                SELECT 1
                FROM dbo.Tenants AS [tenant]
                INNER JOIN dbo.TenantDatabaseCatalog AS [erp]
                    ON [erp].TenantId = [tenant].Id
                INNER JOIN dbo.DatabaseSeparationComponentStates AS [studio]
                    ON [studio].Component = @studioComponent
                INNER JOIN dbo.TenantProvisioningJobs AS [job]
                    ON [job].TenantId = [tenant].Id
                WHERE [tenant].Id = @tenantId
                  AND [tenant].IsActive = 1
                  AND [erp].DatabaseName = @tenantDatabase
                  AND [erp].State = 3
                  AND [studio].DatabaseName = @studioDatabase
                  AND [studio].State = 3
                  AND [job].Status = 3
                  AND [job].CompletedAt IS NOT NULL
            ) THEN N'{ReadyMarker}' ELSE N'{PendingMarker}' END;
            """;
        return sql;
    }

    public static bool IsReadyOutput(string? sqlcmdOutput) =>
        sqlcmdOutput?.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(line => string.Equals(line, ReadyMarker, StringComparison.Ordinal)) == true;
}
