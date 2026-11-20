using System.Globalization;
using System.Text.RegularExpressions;

/// <summary>
/// Server twin of <c>parseGridColumn</c> in <c>frontend/erp-web/src/custom-page/gridState.ts</c>; both are checked against
/// <c>gridColumns.vectors.json</c>. Strict reading: parts and rule tokens are not trimmed; an empty fourth part, an empty
/// or unknown token, or a rule on the wrong column type is invalid; a repeated rule keeps its last value.
/// A picker column's type is <c>lookup:&lt;queryId&gt;:&lt;valueColumn&gt;:&lt;labelColumn&gt;[:&lt;descriptionColumn&gt;]</c>; it takes
/// only the required, unique and readOnly rules.
/// </summary>
internal static class GridColumnSpec
{
    /// <summary>The option source of a picker (lookup) column; <see cref="DescriptionColumn"/> is null when omitted.</summary>
    internal sealed record Lookup(string QueryId, string ValueColumn, string LabelColumn, string? DescriptionColumn);

    private static readonly TimeSpan RegexTimeout = TimeSpan.FromMilliseconds(100);
    // .NET '$' also matches before a trailing '\n' and '\d' matches non-ASCII digits: '\z' and [0-9] keep JS semantics.
    private static readonly Regex Code = new(@"^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[\p{L}\p{N}_ -]{1,40})?\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex RuleNumber = new(@"^-?[0-9]+(\.[0-9]+)?\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex RuleInteger = new(@"^[0-9]+\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly string[] InputTypes = ["text", "number", "date", "checkbox"];
    private const string LookupPrefix = "lookup:";
    private static readonly Regex LookupQuery = new(@"^[A-Za-z0-9_-]{1,64}\z", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex LookupColumn = new(@"^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[A-Za-z_][A-Za-z0-9_]{0,63})*\z", RegexOptions.CultureInvariant, RegexTimeout);
    private const int MaxLabel = 60;

    /// <summary>Parses "kod|Etiket|tür[|kurallar]" per the Wire contract; false with a Turkish reason otherwise.</summary>
    internal static bool TryParse(string text, out string code, out string inputType, out string? error) =>
        TryParse(text, out code, out inputType, out _, out error);

    /// <summary>As above; <paramref name="lookup"/> is the option source of a picker column, null for the other types.</summary>
    internal static bool TryParse(string text, out string code, out string inputType, out Lookup? lookup, out string? error)
    {
        code = "";
        inputType = "";
        lookup = null;
        error = null;
        if (text is null) { error = "metin değil"; return false; }
        var parts = text.Split('|');
        if (parts.Length is < 3 or > 4) { error = "biçim kod|Etiket|tür[|kurallar] olmalı"; return false; }
        if (!Matches(Code, parts[0])) { error = "kod"; return false; }
        var label = parts[1];
        if (label.Length is < 1 or > MaxLabel || label.All(IsJsWhiteSpace)) { error = "etiket 1-60 karakter olmalı"; return false; }
        var type = parts[2];
        Lookup? source = null;
        if (type.StartsWith(LookupPrefix, StringComparison.Ordinal))
        {
            var lookupParts = type[LookupPrefix.Length..].Split(':');
            if (lookupParts.Length is < 3 or > 4 || !Matches(LookupQuery, lookupParts[0]) || !Matches(LookupColumn, lookupParts[1])
                || !Matches(LookupColumn, lookupParts[2]) || lookupParts.Length == 4 && !Matches(LookupColumn, lookupParts[3]))
            { error = "seçim türü lookup:<sorgu>:<değer>:<etiket>[:<açıklama>] olmalı"; return false; }
            source = new Lookup(lookupParts[0], lookupParts[1], lookupParts[2], lookupParts.Length == 4 ? lookupParts[3] : null);
            type = "lookup";
        }
        else if (!InputTypes.Contains(type, StringComparer.Ordinal)) { error = "tür text, number, date, checkbox ya da lookup olmalı"; return false; }
        double? min = null, max = null;
        if (parts.Length == 4)
        {
            foreach (var token in parts[3].Split(','))
            {
                var colon = token.IndexOf(':');
                var name = colon < 0 ? token : token[..colon];
                var argument = colon < 0 ? null : token[(colon + 1)..];
                if (argument is null && name is "required" or "unique" or "readOnly") continue;
                if (argument is null && name == "upperCase")
                {
                    if (type != "text") { error = "upperCase yalnız text sütununda"; return false; }
                    continue;
                }
                if (argument is not null && name == "maxLength")
                {
                    if (type != "text") { error = "maxLength yalnız text sütununda"; return false; }
                    if (!Matches(RuleInteger, argument)) { error = "maxLength tamsayı olmalı"; return false; }
                    var value = double.Parse(argument, CultureInfo.InvariantCulture);
                    if (value is < 1 or > 4000) { error = "maxLength 1-4000 olmalı"; return false; }
                    continue;
                }
                if (argument is not null && name is "min" or "max" or "step")
                {
                    if (type != "number") { error = $"{name} yalnız number sütununda"; return false; }
                    if (!Matches(RuleNumber, argument)) { error = $"{name} sayı olmalı"; return false; }
                    var value = double.Parse(argument, CultureInfo.InvariantCulture);
                    if (name == "step" && !(value > 0)) { error = "step sıfırdan büyük olmalı"; return false; }
                    if (name == "min") min = value;
                    else if (name == "max") max = value;
                    continue;
                }
                error = $"bilinmeyen kural '{token}'";
                return false;
            }
        }
        if (min is { } low && max is { } high && low > high) { error = "min max'tan büyük olamaz"; return false; }
        code = parts[0];
        inputType = type;
        lookup = source;
        return true;
    }

    /// <summary>The root of a column code: "attributes.Renk" → "attributes".</summary>
    internal static string RootOf(string code)
    {
        var dot = code.IndexOf('.');
        return dot < 0 ? code : code[..dot];
    }

    /// <summary>JavaScript <c>String.prototype.trim</c> whitespace (WhiteSpace and LineTerminator), unlike .NET's set (U+0085).</summary>
    private static bool IsJsWhiteSpace(char c) =>
        c is (char)0x09 or (char)0x0A or (char)0x0B or (char)0x0C or (char)0x0D or (char)0xFEFF or (char)0x2028 or (char)0x2029
        || CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.SpaceSeparator;

    private static bool Matches(Regex pattern, string value)
    {
        try { return pattern.IsMatch(value); }
        catch (RegexMatchTimeoutException) { return false; }
    }
}
