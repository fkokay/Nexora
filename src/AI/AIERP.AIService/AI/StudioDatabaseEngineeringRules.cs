using System.Text.RegularExpressions;

namespace AIERP.AIService.AI;

public static partial class StudioDatabaseEngineeringRules
{
    private static readonly Regex ForbiddenSqlTokens = ForbiddenSqlTokenRegex();
    private static readonly HashSet<string> SupportedSchemaExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".sql", ".prisma", ".cs", ".json", ".xml", ".csproj", ".md", ".yaml", ".yml",
        ".proto", ".graphql", ".graphqls", ".gql", ".wsdl", ".xsd", ".thrift", ".avsc", ".avdl"
    };

    public static bool IsSupportedSchemaPath(string path) =>
        StudioKnowledgePathRules.IsSafeKnowledgePath(path) && SupportedSchemaExtensions.Contains(Path.GetExtension(path));

    public static void Validate(DatabaseEngineeringPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);
        if (plan.ReadOnlySqlQueries is null || plan.MigrationDesign is null || plan.IndexRecommendations is null ||
            plan.PerformanceAnalysis is null || plan.IntegrityChecks is null || plan.Assumptions is null || plan.Risks is null)
            throw new AIProviderResponseException("Database engineering plan contains missing sections.");
        RequireText(plan.Summary, 3000, "summary");
        if (plan.ReadOnlySqlQueries.Count > 8 || plan.MigrationDesign.Count > 12 || plan.IndexRecommendations.Count > 12 ||
            plan.PerformanceAnalysis.Count > 12 || plan.IntegrityChecks.Count > 12 || plan.Assumptions.Count > 12 || plan.Risks.Count > 12)
            throw new AIProviderResponseException("Database engineering plan contains too many recommendations.");
        foreach (var query in plan.ReadOnlySqlQueries)
        {
            if (query is null) throw new AIProviderResponseException("Database engineering plan contains an empty query.");
            RequireText(query.Purpose, 500, "query purpose");
            RequireText(query.Sql, 4000, "read-only SQL");
            ValidateReadOnlySql(query.Sql);
        }
        ValidateTextList(plan.MigrationDesign, 1200, "migration design");
        ValidateTextList(plan.IndexRecommendations, 1200, "index recommendation");
        ValidateTextList(plan.PerformanceAnalysis, 1200, "performance analysis");
        ValidateTextList(plan.IntegrityChecks, 1200, "integrity check");
        ValidateTextList(plan.Assumptions, 1000, "assumption");
        ValidateTextList(plan.Risks, 1000, "risk");
    }

    public static void ValidateReadOnlySql(string sql)
    {
        var normalized = sql.TrimStart();
        if (!(normalized.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase) || normalized.StartsWith("WITH", StringComparison.OrdinalIgnoreCase)) ||
            sql.Contains(';') || sql.Contains("--", StringComparison.Ordinal) || sql.Contains("/*", StringComparison.Ordinal) ||
            ForbiddenSqlTokens.IsMatch(sql))
            throw new AIProviderResponseException("Database engineering SQL suggestions must be a single read-only SELECT query.");
    }

    private static void ValidateTextList(IReadOnlyList<string>? values, int maxLength, string field)
    {
        if (values is null) throw new AIProviderResponseException($"Database engineering plan is missing {field} recommendations.");
        foreach (var value in values) RequireText(value, maxLength, field);
    }

    private static void RequireText(string? value, int maxLength, string field)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > maxLength)
            throw new AIProviderResponseException($"Database engineering plan contains an invalid {field}.");
    }

    [GeneratedRegex(@"\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|EXEC(?:UTE)?|TRUNCATE|GRANT|REVOKE|DBCC|BACKUP|RESTORE|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|WAITFOR|INTO)\b|\bNEXT\s+VALUE\s+FOR\b|\bxp_[a-z0-9_]+\b|\bsp_executesql\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ForbiddenSqlTokenRegex();
}
