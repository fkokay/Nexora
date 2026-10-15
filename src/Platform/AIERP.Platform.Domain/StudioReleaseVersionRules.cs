using System.Text.RegularExpressions;

namespace AIERP.Platform.Domain;

public static class StudioReleaseVersionRules
{
    private static readonly Regex SemVer = new(
        @"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled | RegexOptions.NonBacktracking, TimeSpan.FromMilliseconds(100));

    public static bool IsValid(string? version) =>
        !string.IsNullOrWhiteSpace(version) && version.Length <= 128 && SemVer.IsMatch(version);
}
