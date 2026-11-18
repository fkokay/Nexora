using System.Text.RegularExpressions;

/// <summary>
/// The <c>@&lt;screenKey&gt;</c> code namespace that links a firm design (an ordinary <c>TenantCustomPages</c> row) to a
/// standard ERP screen. <see cref="TenantCustomPageEndpoints.ValidCode"/> never accepts these codes, so the custom-page
/// draft endpoint can never create one.
/// </summary>
internal static partial class SystemPageCodes
{
    public const string Prefix = "@";

    /// <summary>True for <c>^@[a-z0-9-]{1,39}$</c> (no trailing newline).</summary>
    public static bool IsSystemCode(string? code) => code is not null && SystemCodePattern().IsMatch(code);

    /// <summary>The page code of a screen key: <c>"@" + screenKey</c>.</summary>
    public static string CodeFor(string screenKey) => Prefix + screenKey;

    /// <summary>The screen key of a system code, or null when <paramref name="code"/> is not a system code.</summary>
    public static string? ScreenKeyOf(string? code) => IsSystemCode(code) ? code![Prefix.Length..] : null;

    [GeneratedRegex(@"^@[a-z0-9-]{1,39}\z", RegexOptions.CultureInvariant)]
    private static partial Regex SystemCodePattern();
}

/// <summary>
/// The current standard version of a screen key, which bounds <c>standardVersion</c> on <c>PUT /api/custom-pages/{id}</c>.
/// Optional in DI: without a registration no value is accepted. The standards set (Task 4) registers an adapter.
/// </summary>
internal interface ISystemPageVersionSource
{
    /// <summary>The current standard version, or null for an unknown screen key.</summary>
    int? CurrentVersion(string screenKey);
}
