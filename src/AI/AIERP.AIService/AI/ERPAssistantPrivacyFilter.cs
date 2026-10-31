using System.Text.RegularExpressions;

namespace AIERP.AIService.AI;

public static partial class ERPAssistantPrivacyFilter
{
    [GeneratedRegex(@"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", RegexOptions.CultureInvariant)]
    private static partial Regex Email();

    [GeneratedRegex(@"\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Iban();

    [GeneratedRegex(@"(?<!\d)(?:\d[\s-]?){10,11}(?!\d)", RegexOptions.CultureInvariant)]
    private static partial Regex LongNumericIdentifier();

    [GeneratedRegex(@"(?<!\d)(?:\+?\d[\s().-]?){10,15}(?!\d)", RegexOptions.CultureInvariant)]
    private static partial Regex PhoneNumber();

    public static string RedactUserText(string text)
    {
        var value = Email().Replace(text, "[redacted-email]");
        value = Iban().Replace(value, "[redacted-iban]");
        value = PhoneNumber().Replace(value, "[redacted-phone]");
        return LongNumericIdentifier().Replace(value, "[redacted-identifier]");
    }
}
