namespace AIERP.AIService.AI;

internal static class CodeSourcePolicy
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cs", ".csx", ".razor", ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss", ".sql", ".py", ".go", ".rs", ".java"
    };

    internal static bool IsEligibleFilePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 500 || path.StartsWith('/') || path.Contains('\\') ||
            path.Contains(':') || path.Any(char.IsControl)) return false;
        var segments = path.Split('/');
        if (segments.Any(segment => string.IsNullOrWhiteSpace(segment) || segment is "." or ".." || segment.StartsWith('.') ||
            segment.Contains("secret", StringComparison.OrdinalIgnoreCase) || segment.Contains("credential", StringComparison.OrdinalIgnoreCase))) return false;
        return AllowedExtensions.Contains(Path.GetExtension(path));
    }
}
