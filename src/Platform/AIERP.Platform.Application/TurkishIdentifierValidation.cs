namespace AIERP.Platform.Application;

/// <summary>
/// Pure checksum validators for Turkish tax/identity numbers and ISO 13616 IBANs.
/// Mirrored client-side in frontend/erp-web/src/customers/identifierValidation.ts; keep both in sync.
/// </summary>
public static class TurkishIdentifierValidation
{
    /// <summary>Validates a 10-digit Turkish tax number (VKN) with the GİB check-digit algorithm.</summary>
    public static bool IsValidVkn(string? value)
    {
        if (value is null || value.Length != 10 || !value.All(char.IsAsciiDigit)) return false;
        var sum = 0;
        for (var i = 0; i < 9; i++)
        {
            var temp = (value[i] - '0' + 9 - i) % 10;
            sum += temp == 9 ? 9 : temp * (1 << (9 - i)) % 9;
        }
        return (10 - sum % 10) % 10 == value[9] - '0';
    }

    /// <summary>Validates an 11-digit Turkish national identity number (TCKN): first digit non-zero, 10th and 11th digit rules.</summary>
    public static bool IsValidTckn(string? value)
    {
        if (value is null || value.Length != 11 || !value.All(char.IsAsciiDigit) || value[0] == '0') return false;
        var d = value.Select(c => c - '0').ToArray();
        var odd = d[0] + d[2] + d[4] + d[6] + d[8];
        var even = d[1] + d[3] + d[5] + d[7];
        var tenth = ((odd * 7 - even) % 10 + 10) % 10;
        if (tenth != d[9]) return false;
        return d.Take(10).Sum() % 10 == d[10];
    }

    /// <summary>Removes whitespace and upper-cases an IBAN; returns null for empty input.</summary>
    public static string? NormalizeIban(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return string.Concat(value.Where(c => !char.IsWhiteSpace(c))).ToUpperInvariant();
    }

    private static readonly IReadOnlyDictionary<string, int> IbanLengths = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["TR"] = 26, ["DE"] = 22, ["GB"] = 22, ["FR"] = 27, ["NL"] = 18, ["IT"] = 27, ["ES"] = 24, ["BE"] = 16,
        ["AT"] = 20, ["CH"] = 21, ["PL"] = 28, ["SE"] = 24, ["DK"] = 18, ["NO"] = 15, ["FI"] = 18, ["IE"] = 22,
        ["PT"] = 25, ["GR"] = 27, ["LU"] = 20, ["CY"] = 28, ["AZ"] = 28, ["GE"] = 22, ["SA"] = 24, ["AE"] = 23,
    };

    /// <summary>
    /// Validates an IBAN (normalized first): country code + two check digits + alphanumeric BBAN,
    /// country-specific length where known (TR = 26) or 15–34 otherwise, and the mod-97 check.
    /// </summary>
    public static bool IsValidIban(string? value)
    {
        var iban = NormalizeIban(value);
        if (iban is null || iban.Length is < 15 or > 34) return false;
        if (!char.IsAsciiLetterUpper(iban[0]) || !char.IsAsciiLetterUpper(iban[1]) || !char.IsAsciiDigit(iban[2]) || !char.IsAsciiDigit(iban[3]))
            return false;
        if (!iban.All(c => char.IsAsciiDigit(c) || char.IsAsciiLetterUpper(c))) return false;
        if (IbanLengths.TryGetValue(iban[..2], out var expected) && iban.Length != expected) return false;
        // TR BBAN: 5-digit bank code + 1 reserve digit + 16 alphanumeric account characters.
        if (iban.StartsWith("TR", StringComparison.Ordinal) && !iban[4..10].All(char.IsAsciiDigit)) return false;

        var remainder = 0;
        foreach (var c in iban[4..] + iban[..4])
        {
            if (char.IsAsciiDigit(c)) remainder = (remainder * 10 + (c - '0')) % 97;
            else remainder = (remainder * 100 + (c - 'A' + 10)) % 97;
        }
        return remainder == 1;
    }
}
