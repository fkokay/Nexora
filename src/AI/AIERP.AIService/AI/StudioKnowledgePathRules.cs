namespace AIERP.AIService.AI;

internal static class StudioKnowledgePathRules
{
    private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cs", ".csx", ".razor", ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss",
        ".sql", ".py", ".go", ".rs", ".java", ".md", ".json", ".xml", ".yml", ".yaml",
        ".proto", ".graphql", ".graphqls", ".gql", ".prisma", ".wsdl", ".xsd", ".thrift", ".avsc", ".avdl"
    };

    public static bool IsSafeKnowledgePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 500) return false;
        var normalized = path.Replace('\\', '/');
        var segments = normalized.Split('/');
        var name = segments.Last();
        return !normalized.StartsWith("/", StringComparison.Ordinal) &&
            !normalized.Contains(':') && !normalized.Any(char.IsControl) &&
            !segments.Any(part => part.Length == 0 || part is "." or ".." or ".git" or "node_modules" or "bin" or "obj") &&
            !segments.Any(part => part.StartsWith(".env", StringComparison.OrdinalIgnoreCase)) &&
            !normalized.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !normalized.Contains("credential", StringComparison.OrdinalIgnoreCase) &&
            !name.StartsWith("appsettings", StringComparison.OrdinalIgnoreCase) &&
            !name.Equals(".npmrc", StringComparison.OrdinalIgnoreCase) &&
            !name.Equals(".pypirc", StringComparison.OrdinalIgnoreCase) &&
            !name.Contains("id_rsa", StringComparison.OrdinalIgnoreCase) &&
            SupportedExtensions.Contains(Path.GetExtension(normalized));
    }
}
