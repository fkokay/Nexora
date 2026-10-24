using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(args);
var platformConnection = builder.Configuration.GetConnectionString("Provisioning")
    ?? throw new InvalidOperationException("ConnectionStrings:Provisioning is required.");
if (string.IsNullOrWhiteSpace(new SqlConnectionStringBuilder(platformConnection).InitialCatalog))
    throw new InvalidOperationException("ConnectionStrings:Provisioning must specify the Platform database.");

builder.Services.AddSingleton<TenantProvisioningWorker>();
builder.Services.AddHostedService(services => services.GetRequiredService<TenantProvisioningWorker>());
await builder.Build().RunAsync();
