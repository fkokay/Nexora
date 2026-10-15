using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AIERP.Platform.Infrastructure;

public sealed class TenantDbContextFactory : IDesignTimeDbContextFactory<TenantDbContext>
{
    public TenantDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Tenant")
            ?? "Server=localhost;Database=AIERPTenantDesign;Integrated Security=True;TrustServerCertificate=True;Encrypt=False";
        return new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connection).Options);
    }
}
