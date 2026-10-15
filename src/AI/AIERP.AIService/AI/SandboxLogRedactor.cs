using System.Text.RegularExpressions;

namespace AIERP.AIService.AI;

public static class SandboxLogRedactor
{
    private const int MaxLogCharacters = 16_000;

    public static string Redact(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var bounded = value.Length > MaxLogCharacters ? value[..MaxLogCharacters] : value;
        bounded = Regex.Replace(bounded, @"(?i)\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b", "[REDACTED_API_KEY]");
        bounded = Regex.Replace(bounded, @"(?i)\bBearer\s+[A-Za-z0-9._~+/-]+=*", "Bearer [REDACTED]");
        bounded = Regex.Replace(bounded, """(?i)(api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token|authorization|token|private[_-]?key|connectionstring)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)""", "$1=[REDACTED]");
        return Regex.Replace(bounded, @"(?i)(https?://)[^/@\s:]+:[^/@\s]+@", "$1[REDACTED]@");
    }
}
