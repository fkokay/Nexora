using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Page write queries against a real tenant database through a write login (db_datareader + db_datawriter), served by
/// the real endpoints. Runs only when AIERP_REPORT_TEST_SQL_CONNECTION_STRING points at a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class CustomPageWriteQuerySqlAcceptanceTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private const string Code = "musteri-duzelt";

    private static object Definition() => new
    {
        schemaVersion = 2,
        queries = new object[]
        {
            new
            {
                id = "adDegistir", name = "adDegistir", kind = "update", runOn = "manual",
                sql = "UPDATE CustomerAccounts SET Name = @ad WHERE Code = @kod",
                parameters = new object[] { new { name = "ad", binding = "{{ad.value}}", type = "text" }, new { name = "kod", binding = "{{kod.value}}", type = "text" } }
            },
            new
            {
                // Gives every customer the same code: violates the unique (TenantId, Code) index when there are two.
                id = "kodlariBirlestir", name = "kodlariBirlestir", kind = "update", runOn = "manual",
                sql = "UPDATE CustomerAccounts SET Code = @kod WHERE Code IS NOT NULL",
                parameters = new object[] { new { name = "kod", binding = "{{kod.value}}", type = "text" } }
            }
        },
        components = new object[]
        {
            new { id = "c1", type = "input", name = "ad", props = new { inputType = "text" } },
            new { id = "c2", type = "input", name = "kod", props = new { inputType = "text" } }
        }
    };

    [SqlServerAcceptanceFact]
    public async Task Write_commits_and_returns_affected_rows()
    {
        await using var database = await WriteTenantDatabase.CreateAsync();
        await using var app = await CustomPageWriteQueryIntegrationTests.StartApplicationAsync(database.Factory);
        using var client = app.GetTestClient();
        await PublishAsync(app, client);

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/adDegistir/run",
            new { parameters = new { ad = "Yeni Ad", kod = "CUST-1" } });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("affectedRows").GetInt32());
        Assert.Equal(["CUST-1:Yeni Ad", "CUST-2:Customer 2"], await database.CustomersAsync());
        var audit = Assert.Single(await WriteAuditsAsync(app));
        Assert.True(audit.Succeeded);
        Assert.Equal(1, audit.AffectedRows);
    }

    [SqlServerAcceptanceFact]
    public async Task Failed_write_rolls_back_and_is_audited()
    {
        await using var database = await WriteTenantDatabase.CreateAsync();
        await using var app = await CustomPageWriteQueryIntegrationTests.StartApplicationAsync(database.Factory);
        using var client = app.GetTestClient();
        await PublishAsync(app, client);

        var response = await client.PostAsJsonAsync($"/api/custom-pages/{Code}/queries/kodlariBirlestir/run",
            new { parameters = new { kod = "AYNI" } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("SQL hatası", await response.Content.ReadAsStringAsync());
        Assert.Equal(["CUST-1:Customer 1", "CUST-2:Customer 2"], await database.CustomersAsync());
        var audit = Assert.Single(await WriteAuditsAsync(app));
        Assert.False(audit.Succeeded);
        Assert.Null(audit.AffectedRows);
        Assert.True(audit.ErrorNumber is 2601 or 2627, $"Beklenmeyen SQL hata numarası: {audit.ErrorNumber}");
        Assert.Contains("AYNI", audit.ParametersJson);
    }

    private static async Task PublishAsync(WebApplication app, HttpClient client)
    {
        CustomPageWriteQueryIntegrationTests.SetIdentity(client, Admin, "TenantAdmin");
        var created = await TemplatelessPageSeed.PostDraftAsync(app.Services, client, Code, "Müşteri düzelt", Definition());
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/custom-pages/{Code}/access", new { mode = "AdminsOnly", expectedRevision = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
    }

    private static async Task<List<TenantCustomPageWriteAudit>> WriteAuditsAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TenantCustomPageWriteAudits.AsNoTracking().ToListAsync();
    }

    /// <summary>A disposable tenant database with two customers and a login that may only read and write data.</summary>
    private sealed class WriteTenantDatabase : IAsyncDisposable
    {
        private readonly string _adminConnection;
        private readonly string _databaseName;
        private readonly string _loginName;
        private string _writeConnection = "";
        public ITenantQueryConnectionFactory Factory { get; }

        private WriteTenantDatabase(string adminConnection)
        {
            _adminConnection = adminConnection;
            var id = Guid.NewGuid();
            _databaseName = $"AIERPTenant_{id:N}";
            _loginName = $"aierp_pagewrite_test_{id:N}";
            Factory = new WriteConnectionFactory(this);
        }

        private string AdminTenantConnection => new SqlConnectionStringBuilder(_adminConnection) { InitialCatalog = _databaseName }.ConnectionString;

        public static async Task<WriteTenantDatabase> CreateAsync()
        {
            var configured = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
            Assert.False(string.IsNullOrWhiteSpace(configured));
            var admin = new SqlConnectionStringBuilder(configured) { InitialCatalog = "master", ConnectTimeout = 15, TrustServerCertificate = true };
            var database = new WriteTenantDatabase(admin.ConnectionString);
            try { await database.InitializeAsync(); }
            catch
            {
                await database.DisposeAsync();
                throw;
            }
            return database;
        }

        private async Task InitializeAsync()
        {
            var tenantId = Guid.NewGuid();
            var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(AdminTenantConnection).Options;
            await using (var db = new TenantDbContext(options))
            {
                Assert.True(await db.Database.EnsureCreatedAsync());
                var tenant = new Tenant { Id = tenantId, Name = "Synthetic page write company", Slug = $"page-write-{tenantId:N}" };
                db.Tenants.Add(tenant);
                for (var index = 1; index <= 2; index++)
                    db.CustomerAccounts.Add(new CustomerAccount { TenantId = tenantId, Tenant = tenant, Code = $"CUST-{index}", Name = $"Customer {index}", Type = CounterpartyType.Customer, CurrencyCode = "TRY" });
                await db.SaveChangesAsync();
            }
            var password = $"Aa1!{Guid.NewGuid():N}";
            await ExecuteAsync(_adminConnection, $"CREATE LOGIN [{_loginName}] WITH PASSWORD = N'{password}', CHECK_POLICY = OFF, DEFAULT_DATABASE = [{_databaseName}];");
            await ExecuteAsync(AdminTenantConnection,
                $"CREATE USER [{_loginName}] FOR LOGIN [{_loginName}]; ALTER ROLE [db_datareader] ADD MEMBER [{_loginName}]; ALTER ROLE [db_datawriter] ADD MEMBER [{_loginName}];");
            _writeConnection = new SqlConnectionStringBuilder(_adminConnection)
            {
                InitialCatalog = _databaseName, IntegratedSecurity = false, UserID = _loginName, Password = password, Pooling = false
            }.ConnectionString;
        }

        public async Task<List<string>> CustomersAsync()
        {
            await using var connection = new SqlConnection(AdminTenantConnection);
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT Code, Name FROM CustomerAccounts ORDER BY Code";
            var rows = new List<string>();
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) rows.Add($"{reader.GetString(0)}:{reader.GetString(1)}");
            return rows;
        }

        public async ValueTask DisposeAsync()
        {
            SqlConnection.ClearAllPools();
            await TryExecuteAsync(_adminConnection,
                $"IF DB_ID(N'{_databaseName}') IS NOT NULL BEGIN ALTER DATABASE [{_databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_databaseName}]; END");
            await TryExecuteAsync(_adminConnection, $"IF SUSER_ID(N'{_loginName}') IS NOT NULL DROP LOGIN [{_loginName}];");
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

        private sealed class WriteConnectionFactory(WriteTenantDatabase database) : ITenantQueryConnectionFactory
        {
            public async Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken)
            {
                Assert.Equal(TenantA, tenantId);
                Assert.Equal(TenantQueryAccess.Write, access);
                var connection = new SqlConnection(database._writeConnection);
                await connection.OpenAsync(cancellationToken);
                return connection;
            }
        }
    }
}
