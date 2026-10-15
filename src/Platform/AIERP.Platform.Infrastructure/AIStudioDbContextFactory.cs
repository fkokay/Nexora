using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AIERP.Platform.Infrastructure;

public sealed class AIStudioDbContextFactory : IDesignTimeDbContextFactory<AIStudioDbContext>
{
    public AIStudioDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__AIStudio")
            ?? "Server=localhost;Database=AIERPStudioDesign;Integrated Security=True;TrustServerCertificate=True;Encrypt=False";
        return new AIStudioDbContext(new DbContextOptionsBuilder<AIStudioDbContext>().UseSqlServer(connection).Options);
    }
}
