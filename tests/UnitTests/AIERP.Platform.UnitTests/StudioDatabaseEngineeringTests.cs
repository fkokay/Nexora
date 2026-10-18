using System.Net;
using System.Text;
using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace AIERP.Platform.UnitTests;

public sealed class StudioDatabaseEngineeringTests
{
    [Theory]
    [InlineData("db/schema.sql")]
    [InlineData("db/schema.prisma")]
    [InlineData("contracts/openapi.yaml")]
    [InlineData("contracts/service.proto")]
    [InlineData("contracts/schema.graphql")]
    [InlineData("contracts/service.wsdl")]
    [InlineData("contracts/service.xsd")]
    [InlineData("contracts/events.avsc")]
    [InlineData("contracts/events.avdl")]
    [InlineData("contracts/service.thrift")]
    public void SchemaPathRules_accept_database_and_api_contract_formats(string path) =>
        Assert.True(StudioDatabaseEngineeringRules.IsSupportedSchemaPath(path));

    [Theory]
    [InlineData("../outside/schema.sql")]
    [InlineData("keys/provider-secret.wsdl")]
    [InlineData("bin/schema.json")]
    [InlineData("build/output.dll")]
    public void SchemaPathRules_reject_unsafe_or_unsupported_paths(string path) =>
        Assert.False(StudioDatabaseEngineeringRules.IsSupportedSchemaPath(path));

    [Theory]
    [InlineData("SELECT Id FROM dbo.Customers WHERE TenantId = @TenantId")]
    [InlineData("WITH ActiveRows AS (SELECT Id FROM dbo.Customers) SELECT Id FROM ActiveRows")]
    public void ReadOnlySqlValidator_accepts_single_select_queries(string sql) =>
        StudioDatabaseEngineeringRules.ValidateReadOnlySql(sql);

    [Theory]
    [InlineData("DELETE FROM dbo.Customers")]
    [InlineData("SELECT 1; DROP TABLE dbo.Customers")]
    [InlineData("SELECT * FROM dbo.Customers -- ignore tenant filter")]
    [InlineData("SELECT * INTO #CustomerCopy FROM dbo.Customers")]
    [InlineData("SELECT * FROM OPENQUERY(RemoteDb, 'SELECT 1')")]
    [InlineData("SELECT NEXT VALUE FOR dbo.CustomerSequence")]
    [InlineData("EXEC sp_executesql N'SELECT 1'")]
    [InlineData("BACKUP DATABASE a TO DISK = 'x'")]
    public void ReadOnlySqlValidator_rejects_mutation_multiple_statements_and_comments(string sql) =>
        Assert.Throws<AIProviderResponseException>(() => StudioDatabaseEngineeringRules.ValidateReadOnlySql(sql));

    [Fact]
    public void PlanValidator_rejects_missing_sections_and_mutating_query_suggestions()
    {
        var missing = new DatabaseEngineeringPlan("A plan", [], [], [], [], [], [], null!);
        Assert.Throws<AIProviderResponseException>(() => StudioDatabaseEngineeringRules.Validate(missing));
        var unsafeQuery = new DatabaseEngineeringPlan("A plan", [new DatabaseQuerySuggestion("Mutate", "DELETE FROM dbo.Customers")], [], [], [], [], [], []);
        Assert.Throws<AIProviderResponseException>(() => StudioDatabaseEngineeringRules.Validate(unsafeQuery));
    }

    [Fact]
    public async Task DatabaseEngineer_uses_explicit_schema_context_and_returns_unexecuted_plan()
    {
        var responseJson = """
        {"status":"completed","output":[{"content":[{"type":"output_text","text":"{\"summary\":\"Tenant-scoped query plan\",\"readOnlySqlQueries\":[{\"purpose\":\"Inspect recent rows\",\"sql\":\"SELECT Id FROM dbo.Customers WHERE TenantId = @TenantId\"}],\"migrationDesign\":[\"Add a nullable field after compatibility review.\"],\"indexRecommendations\":[\"Consider (TenantId, CreatedAt) after measuring query plans.\"],\"performanceAnalysis\":[\"No runtime measurements were supplied.\"],\"integrityChecks\":[\"Verify tenant foreign keys before rollout.\"],\"assumptions\":[\"The table has a TenantId column.\"],\"risks\":[\"Index cost depends on write volume.\"]}"}]}]}
        """;
        string sentBody = "";
        var handler = new StubHttpMessageHandler(async (request, cancellationToken) =>
        {
            Assert.Equal("https://api.openai.com/v1/responses", request.RequestUri!.ToString());
            sentBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(responseJson, Encoding.UTF8, "application/json") };
        });
        using var http = new HttpClient(handler);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AI:OpenAI:ApiKey"] = "test-key"
        }).Build();
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var platformDb = new PlatformDbContext(options);
        var provider = new OpenAIResponsesProvider(http, configuration, platformDb, new HttpContextAccessor());

        var plan = await provider.CreateDatabaseEngineeringPlanAsync("review customer table", "Nexora", "main",
            [new CodeSourceFile("db/Customer.sql", "CREATE TABLE dbo.Customers (TenantId uniqueidentifier NOT NULL)", "abc")], CancellationToken.None);

        Assert.Equal("Tenant-scoped query plan", plan.Summary);
        Assert.Single(plan.ReadOnlySqlQueries);
        using var body = JsonDocument.Parse(sentBody);
        Assert.False(body.RootElement.GetProperty("store").GetBoolean());
        Assert.Contains("readOnlySqlQueries", sentBody, StringComparison.Ordinal);
        Assert.Contains("untrusted data", sentBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("CREATE TABLE dbo.Customers", sentBody, StringComparison.Ordinal);
    }

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => handler(request, cancellationToken);
    }
}
