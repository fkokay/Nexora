using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// SQL raporlarının gerçek güvenlik sınırı okuma login'inin yetkileridir; bu testler doğrulayıcıyı atlayıp
/// doğrudan okuma bağlantısıyla dener. Yalnız AIERP_REPORT_TEST_SQL_CONNECTION_STRING tek kullanımlık bir
/// SQL Server'a işaret ettiğinde çalışır (login oluşturma yetkisi gerekir).
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class CustomSqlReportSqlAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Read_login_cannot_write_even_if_validator_is_bypassed()
    {
        await using var environment = await ReadOnlyTenantEnvironment.CreateAsync(1);
        var tenant = environment.Tenants[0];
        await using var connection = await environment.Factory.OpenAsync(tenant.TenantId, TenantQueryAccess.Read, CancellationToken.None);
        await using var command = connection.CreateCommand();
        // İzin denetimi kısıt denetiminden önce çalışır; bu yüzden varsayılan değerli INSERT bile 229 ile reddedilir.
        command.CommandText = "INSERT INTO CustomerAccounts DEFAULT VALUES";

        var exception = await Assert.ThrowsAsync<SqlException>(() => command.ExecuteNonQueryAsync());

        Assert.Equal(229, exception.Number);
        command.CommandText = "DELETE FROM CustomerAccounts";
        var deleteException = await Assert.ThrowsAsync<SqlException>(() => command.ExecuteNonQueryAsync());
        Assert.Equal(229, deleteException.Number);
    }

    [SqlServerAcceptanceFact]
    public async Task Read_login_cannot_read_platform_or_other_tenant_database()
    {
        await using var environment = await ReadOnlyTenantEnvironment.CreateAsync(2);
        var tenantA = environment.Tenants[0];
        var tenantB = environment.Tenants[1];

        await Assert.ThrowsAsync<SqlException>(() => CustomSqlReportRunner.ExecuteAsync(
            "SELECT * FROM AIERPPlatform.dbo.Tenants", [(tenantA.TenantId, "A")], environment.Factory, CancellationToken.None));
        await Assert.ThrowsAsync<SqlException>(() => CustomSqlReportRunner.ExecuteAsync(
            $"SELECT * FROM [{tenantB.DatabaseName}].dbo.CustomerAccounts", [(tenantA.TenantId, "A")], environment.Factory, CancellationToken.None));
    }

    [SqlServerAcceptanceFact]
    public async Task Runner_returns_rows_from_tenant_database()
    {
        await using var environment = await ReadOnlyTenantEnvironment.CreateAsync(2);
        var companies = environment.Tenants.Select(tenant => (tenant.TenantId, tenant.CompanyName)).ToArray();

        var result = await CustomSqlReportRunner.ExecuteAsync(
            "SELECT Code AS code, Name AS name FROM CustomerAccounts ORDER BY Code", companies, environment.Factory, CancellationToken.None);

        Assert.False(result.Truncated);
        Assert.Equal(["companyName", "code", "name"], result.Columns.Select(column => column.Code).ToArray());
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal(environment.Tenants.Select(tenant => tenant.CustomerCode), result.Rows.Select(row => (string)row["code"]!));
        Assert.Equal(environment.Tenants.Select(tenant => tenant.CompanyName), result.Rows.Select(row => (string)row["companyName"]!));
    }

    [SqlServerAcceptanceFact]
    public async Task Runner_maps_sql_errors_to_validation_problem()
    {
        await using var environment = await ReadOnlyTenantEnvironment.CreateAsync(1);
        var tenant = environment.Tenants[0];

        var exception = await Assert.ThrowsAsync<SqlException>(() => CustomSqlReportRunner.ExecuteAsync(
            "SELECT * FROM YokTablo", [(tenant.TenantId, tenant.CompanyName)], environment.Factory, CancellationToken.None));
        var mapped = CustomSqlReportRunner.MapError(exception);

        var problem = Assert.IsType<ProblemHttpResult>(mapped);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        Assert.StartsWith("SQL hatası: ", Assert.Single(Assert.IsType<HttpValidationProblemDetails>(problem.ProblemDetails).Errors["sqlQuery"]));
    }

    [SqlServerAcceptanceFact]
    public async Task Runner_rejects_mismatched_columns_across_companies()
    {
        await using var environment = await ReadOnlyTenantEnvironment.CreateAsync(2);
        var companies = environment.Tenants.Select(tenant => (tenant.TenantId, tenant.CompanyName)).ToArray();
        var sql = $"IF DB_NAME() = N'{environment.Tenants[0].DatabaseName}' SELECT 1 AS a ELSE SELECT N'x' AS b";

        var exception = await Assert.ThrowsAsync<CustomSqlColumnMismatchException>(() =>
            CustomSqlReportRunner.ExecuteAsync(sql, companies, environment.Factory, CancellationToken.None));
        var problem = Assert.IsType<ProblemHttpResult>(CustomSqlReportRunner.MapError(exception));

        Assert.Equal("Seçilen firmalarda sorgu farklı sütunlar döndürdü.", Assert.Single(Assert.IsType<HttpValidationProblemDetails>(problem.ProblemDetails).Errors["sqlQuery"]));
    }

    internal sealed record TenantFixture(Guid TenantId, string CompanyName, string DatabaseName, string LoginName, string ReadConnectionString, string CustomerCode);

    /// <summary>Her kiracı için izole ERP veritabanı ve yalnız db_datareader üyesi bir okuma login'i oluşturur.</summary>
    internal sealed class ReadOnlyTenantEnvironment : IAsyncDisposable
    {
        private readonly string _adminConnection;
        public List<TenantFixture> Tenants { get; } = [];
        public ITenantQueryConnectionFactory Factory { get; }

        private ReadOnlyTenantEnvironment(string adminConnection)
        {
            _adminConnection = adminConnection;
            Factory = new FixtureConnectionFactory(this);
        }

        public static async Task<ReadOnlyTenantEnvironment> CreateAsync(int tenantCount)
        {
            var configured = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
            Assert.False(string.IsNullOrWhiteSpace(configured));
            var admin = new SqlConnectionStringBuilder(configured) { InitialCatalog = "master", ConnectTimeout = 15, TrustServerCertificate = true };
            var environment = new ReadOnlyTenantEnvironment(admin.ConnectionString);
            try
            {
                for (var index = 0; index < tenantCount; index++) await environment.AddTenantAsync(index);
            }
            catch
            {
                await environment.DisposeAsync();
                throw;
            }
            return environment;
        }

        private async Task AddTenantAsync(int index)
        {
            var tenantId = Guid.NewGuid();
            var databaseName = $"AIERPTenant_{tenantId:N}";
            var loginName = $"aierp_sqlreport_test_{tenantId:N}";
            var password = $"Aa1!{Guid.NewGuid():N}";
            var customerCode = $"CUST-{index + 1}";
            var adminTenant = new SqlConnectionStringBuilder(_adminConnection) { InitialCatalog = databaseName }.ConnectionString;
            var fixture = new TenantFixture(tenantId, $"Synthetic SQL report company {index + 1}", databaseName, loginName,
                new SqlConnectionStringBuilder(_adminConnection)
                {
                    InitialCatalog = databaseName, IntegratedSecurity = false, UserID = loginName, Password = password, Pooling = false
                }.ConnectionString, customerCode);
            Tenants.Add(fixture);

            var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(adminTenant).Options;
            await using (var db = new TenantDbContext(options))
            {
                Assert.True(await db.Database.EnsureCreatedAsync());
                var tenant = new Tenant { Id = tenantId, Name = fixture.CompanyName, Slug = $"sql-report-{tenantId:N}" };
                db.Tenants.Add(tenant);
                db.CustomerAccounts.Add(new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = customerCode, Name = $"Customer {index + 1}", Type = CounterpartyType.Customer, CurrencyCode = "TRY" });
                await db.SaveChangesAsync();
            }

            await ExecuteAsync(_adminConnection, $"CREATE LOGIN [{loginName}] WITH PASSWORD = N'{password}', CHECK_POLICY = OFF, DEFAULT_DATABASE = [{databaseName}];");
            await ExecuteAsync(adminTenant, $"CREATE USER [{loginName}] FOR LOGIN [{loginName}]; ALTER ROLE [db_datareader] ADD MEMBER [{loginName}];");
        }

        public async ValueTask DisposeAsync()
        {
            SqlConnection.ClearAllPools();
            foreach (var tenant in Tenants)
            {
                await TryExecuteAsync(_adminConnection,
                    $"IF DB_ID(N'{tenant.DatabaseName}') IS NOT NULL BEGIN ALTER DATABASE [{tenant.DatabaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{tenant.DatabaseName}]; END");
                await TryExecuteAsync(_adminConnection, $"IF SUSER_ID(N'{tenant.LoginName}') IS NOT NULL DROP LOGIN [{tenant.LoginName}];");
            }
        }

        private static async Task ExecuteAsync(string connectionString, string sql)
        {
            await using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            await command.ExecuteNonQueryAsync();
        }

        private static async Task TryExecuteAsync(string connectionString, string sql)
        {
            try { await ExecuteAsync(connectionString, sql); }
            catch (SqlException) { /* Temizlik en iyi çabadır; testin asıl sonucunu gölgelememeli. */ }
        }

        private sealed class FixtureConnectionFactory(ReadOnlyTenantEnvironment environment) : ITenantQueryConnectionFactory
        {
            public async Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken)
            {
                Assert.Equal(TenantQueryAccess.Read, access);
                var tenant = environment.Tenants.Single(x => x.TenantId == tenantId);
                var connection = new SqlConnection(tenant.ReadConnectionString);
                await connection.OpenAsync(cancellationToken);
                return connection;
            }
        }
    }
}
