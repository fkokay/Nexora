using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Hosting;

const string cutoverArgument = "--migrate-existing-tenant-sql-credentials";
const string stoppedServicesConfirmation = "--confirm-api-ai-studio-stopped";
const string migrateExistingErpTenantArgument = "--migrate-existing-erp-tenant";
var runExistingCredentialCutover = args.Contains(cutoverArgument, StringComparer.Ordinal);
var servicesStoppedConfirmed = args.Contains(stoppedServicesConfirmation, StringComparer.Ordinal);
var migrateExistingErpTenantIndex = Array.IndexOf(args, migrateExistingErpTenantArgument);
Guid? migrateExistingErpTenantId = null;
if (migrateExistingErpTenantIndex >= 0)
{
    if (migrateExistingErpTenantIndex != 0 || args.Length != 2
        || !Guid.TryParse(args[1], out var parsedTenantId) || parsedTenantId == Guid.Empty)
        throw new ArgumentException($"Usage: {migrateExistingErpTenantArgument} <tenant-guid>");
    migrateExistingErpTenantId = parsedTenantId;
}
var builder = Host.CreateApplicationBuilder(args.Where(argument =>
    !string.Equals(argument, cutoverArgument, StringComparison.Ordinal)
    && !string.Equals(argument, stoppedServicesConfirmation, StringComparison.Ordinal)
    && !string.Equals(argument, migrateExistingErpTenantArgument, StringComparison.Ordinal)
    && !(migrateExistingErpTenantId.HasValue && Guid.TryParse(argument, out var parsed) && parsed == migrateExistingErpTenantId.Value)).ToArray());
var platformConnection = DeploymentSecretConfiguration.GetValue(builder.Configuration, "ConnectionStrings:Provisioning")
    ?? throw new InvalidOperationException("ConnectionStrings:Provisioning is required.");
if (string.IsNullOrWhiteSpace(new SqlConnectionStringBuilder(platformConnection).InitialCatalog))
    throw new InvalidOperationException("ConnectionStrings:Provisioning must specify the Platform database.");
DatabaseIsolationConfiguration.RequireTenantCredentialIsolation("Tenant Provisioning Worker", builder.Configuration,
    requireProvisioningWriter: true);

builder.Services.AddVaultTenantSqlCredentialReader(options =>
{
    if (Uri.TryCreate(builder.Configuration["Vault:Address"], UriKind.Absolute, out var address)) options.Address = address;
    options.Mount = builder.Configuration["Vault:Mount"] ?? "secret";
    options.RoleId = DeploymentSecretConfiguration.GetValue(builder.Configuration, "Vault:TenantSqlCredentialReader:RoleId") ?? "";
    options.SecretId = DeploymentSecretConfiguration.GetValue(builder.Configuration, "Vault:TenantSqlCredentialReader:SecretId") ?? "";
    options.AllowHttpForLocalDevelopment = builder.Configuration.GetValue<bool>("Vault:AllowHttpForLocalDevelopment");
});
builder.Services.AddVaultTenantSqlCredentialWriter(options =>
{
    if (Uri.TryCreate(builder.Configuration["Vault:Address"], UriKind.Absolute, out var address)) options.Address = address;
    options.Mount = builder.Configuration["Vault:Mount"] ?? "secret";
    options.RoleId = DeploymentSecretConfiguration.GetValue(builder.Configuration, "Vault:TenantSqlCredentialWriter:RoleId") ?? "";
    options.SecretId = DeploymentSecretConfiguration.GetValue(builder.Configuration, "Vault:TenantSqlCredentialWriter:SecretId") ?? "";
    options.AllowHttpForLocalDevelopment = builder.Configuration.GetValue<bool>("Vault:AllowHttpForLocalDevelopment");
});

if (!runExistingCredentialCutover && !migrateExistingErpTenantId.HasValue)
{
    builder.Services.AddSingleton<TenantProvisioningWorker>();
    builder.Services.AddHostedService(services => services.GetRequiredService<TenantProvisioningWorker>());
}

var host = builder.Build();
if (runExistingCredentialCutover)
{
    if (!servicesStoppedConfirmed)
        throw new InvalidOperationException($"Existing tenant SQL credential cutover also requires {stoppedServicesConfirmation}; stop Platform API, AI Service, and tenant-aware workers first.");

    var reader = host.Services.GetRequiredService<ITenantSqlCredentialReader>();
    var writer = host.Services.GetRequiredService<ITenantSqlCredentialWriter>();
    var provisioner = new TenantDatabaseProvisioner(platformConnection,
        builder.Configuration["Database:SeparationBackupPath"], writer, reader);
    var result = await provisioner.MigrateExistingReadyTenantCredentialsAsync();
    Console.WriteLine($"Vault credential cutover verified: ERP databases={result.ErpDatabaseCount}; AI Studio databases={result.AiStudioDatabaseCount}.");
    return;
}

if (migrateExistingErpTenantId is { } tenantId)
{
    var reader = host.Services.GetRequiredService<ITenantSqlCredentialReader>();
    var writer = host.Services.GetRequiredService<ITenantSqlCredentialWriter>();
    var provisioner = new TenantDatabaseProvisioner(platformConnection,
        builder.Configuration["Database:SeparationBackupPath"], writer, reader);
    // ProvisionAsync detects an existing Ready catalog entry and takes its guarded
    // migration-only path. It does not invoke the AI Studio provisioning flow.
    await provisioner.ProvisionAsync(tenantId, sourceDatabaseWasCreatedDuringCurrentBootstrap: true);
    Console.WriteLine($"ERP tenant database migration completed and isolation verified for tenant {tenantId:D}.");
    return;
}

await host.RunAsync();
