using System.Text.RegularExpressions;

namespace AIERP.Platform.Application;

public static partial class AuditResourceSanitizer
{
    private static readonly Regex EmailPattern = new(
        @"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex UrlCredentialPattern = new(
        @"(?i)(https?://)[^/@\s:]+(?::[^/@\s]*)?@", RegexOptions.CultureInvariant);
    private static readonly Regex SecretAssignmentPattern = new(
        @"(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\b\s*[:=]\s*[^,;\s]+",
        RegexOptions.CultureInvariant);
    private static readonly Regex BearerPattern = new(
        @"(?i)\bBearer\s+[A-Za-z0-9._~+/-]+=*", RegexOptions.CultureInvariant);
    private static readonly Regex ProviderTokenPattern = new(
        @"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b",
        RegexOptions.CultureInvariant);

    public static string Sanitize(string? value, int maxLength = 240)
    {
        if (string.IsNullOrEmpty(value) || maxLength <= 0) return string.Empty;
        var sanitized = UrlCredentialPattern.Replace(value, "$1[REDACTED]@");
        sanitized = SecretAssignmentPattern.Replace(sanitized, "$1=[REDACTED]");
        sanitized = BearerPattern.Replace(sanitized, "Bearer [REDACTED]");
        sanitized = ProviderTokenPattern.Replace(sanitized, "[REDACTED]");
        sanitized = EmailPattern.Replace(sanitized, "[REDACTED-EMAIL]");
        return sanitized.Length <= maxLength ? sanitized : sanitized[..maxLength];
    }
}
