using System.Text.Json;
using Xunit;
using Environment = AIERP.Api.IntegrationTests.CustomSqlReportSqlAcceptanceTests.ReadOnlyTenantEnvironment;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Page queries against a real tenant database through the read-only login. Runs only when
/// AIERP_REPORT_TEST_SQL_CONNECTION_STRING points at a disposable SQL Server.
/// </summary>
[Collection("SQL Server acceptance")]
public sealed class CustomPageQuerySqlAcceptanceTests
{
    private static Dictionary<string, JsonElement> Values(object values) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(values))!;

    [SqlServerAcceptanceFact]
    public async Task Parameters_are_sent_as_typed_sql_parameters()
    {
        await using var environment = await Environment.CreateAsync(1);
        var tenant = environment.Tenants[0];
        const string Injection = "'; DROP TABLE CustomerAccounts--";
        PageQueryParameter[] declared = [new("kod", "{{arama.value}}", "text")];

        var (parameters, error) = CustomPageQueryParameters.Build(declared, Values(new { kod = Injection }));
        Assert.Null(error);
        var echoed = await CustomSqlReportRunner.ExecuteSingleAsync("SELECT @kod AS v", parameters!, tenant.TenantId, environment.Factory, CancellationToken.None);
        Assert.Equal(Injection, Assert.Single(echoed.Rows)["v"]);

        (parameters, _) = CustomPageQueryParameters.Build(declared, Values(new { kod = Injection }));
        var none = await CustomSqlReportRunner.ExecuteSingleAsync("SELECT Code FROM CustomerAccounts WHERE Code = @kod", parameters!,
            tenant.TenantId, environment.Factory, CancellationToken.None);
        Assert.Empty(none.Rows);

        // The table is still in place.
        (parameters, _) = CustomPageQueryParameters.Build(declared, Values(new { kod = tenant.CustomerCode }));
        var found = await CustomSqlReportRunner.ExecuteSingleAsync("SELECT Code FROM CustomerAccounts WHERE Code = @kod", parameters!,
            tenant.TenantId, environment.Factory, CancellationToken.None);
        Assert.Equal(tenant.CustomerCode, Assert.Single(found.Rows)["Code"]);
    }

    [SqlServerAcceptanceFact]
    public async Task Run_returns_rows_for_parameterized_query()
    {
        await using var environment = await Environment.CreateAsync(1);
        var tenant = environment.Tenants[0];
        PageQueryParameter[] declared =
        [
            new("kod", "{{a}}", "text"), new("adet", "{{a}}", "int"), new("oran", "{{a}}", "decimal"),
            new("tarih", "{{bugun}}", "date"), new("aktif", "{{a}}", "bool"), new("kimlik", "{{a}}", "guid"), new("bos", "{{a}}", "text")
        ];
        var (parameters, error) = CustomPageQueryParameters.Build(declared, Values(new
        {
            kod = tenant.CustomerCode, adet = 5, oran = "1.5", tarih = "2026-11-16", aktif = true, kimlik = tenant.TenantId, bos = (string?)null
        }));
        Assert.Null(error);

        var result = await CustomSqlReportRunner.ExecuteSingleAsync(
            "SELECT TOP (@adet) Code AS code, Name AS name, @oran * 2 AS iki, @tarih AS gun, @aktif AS aktif, @kimlik AS kimlik, @bos AS bos " +
            "FROM CustomerAccounts WHERE Code = @kod ORDER BY Code",
            parameters!, tenant.TenantId, environment.Factory, CancellationToken.None);

        Assert.False(result.Truncated);
        var row = Assert.Single(result.Rows);
        Assert.Equal(tenant.CustomerCode, row["code"]);
        Assert.Equal(3m, Convert.ToDecimal(row["iki"]));
        Assert.Equal(new DateTime(2026, 11, 16), row["gun"]);
        Assert.Equal(true, row["aktif"]);
        Assert.Equal(tenant.TenantId, row["kimlik"]);
        Assert.Null(row["bos"]);
    }
}
