namespace AIERP.AIService.AI;

/// <summary>
/// Provides a deterministic first-pass classification so infrastructure failures are not
/// mistaken for source defects during AI-assisted repair.
/// </summary>
public static class SandboxFailureTriage
{
    public static bool RequiresAiAnalysis(SandboxFailureTriageResult triage) => triage.SourceRepairCandidate;

    public static SandboxFailureTriageResult Classify(string operation, string status, string? message, string? output)
    {
        var text = string.Concat(message, "\n", output);
        if (status.Equals("DependencyUnavailable", StringComparison.OrdinalIgnoreCase) ||
            (ContainsAny(text, "package ") && ContainsAny(text, " does not exist")) ||
            ContainsAny(text, "NU1301", "NU1101", "NU1102", "npm ERR!", "ERR_MODULE_NOT_FOUND", "ModuleNotFoundError", "No matching distribution found", "no matching package", "failed to download", "failed to lookup module",
                "Could not resolve all files for configuration", "Could not resolve dependencies for project", "Could not resolve \"", "Failed to resolve import",
                "no required module provides package", "go: updates to go.mod needed", "failed to select a version for",
                "Could not find artifact", "Could not find group:", "cannot access ",
                "can't find crate for", "cannot find package ", "No package metadata was found for",
                "unable to find valid certification path", "Temporary failure in name resolution", "ECONNRESET", "EAI_AGAIN"))
            return new("dependency", "Bağımlılık veya çevrimdışı paket kaynağı eksik.", false,
                "Önce onaylı paket önbelleğini/lock dosyasını doğrulayın; bağımlılık hazır olmadan kaynak kodu onarmayın.");

        if (status is "TimedOut" or "QueueExpired" ||
            status.Equals("TimedOut", StringComparison.OrdinalIgnoreCase) || status.Equals("QueueExpired", StringComparison.OrdinalIgnoreCase))
            return new("execution-limit", "Sandbox işi zaman sınırına ulaştı.", false,
                "Kuyruk ve çalışma süresini inceleyip işi daha sonra yeniden çalıştırın; bu sonuç tek başına kod kusuru göstermez.");

        if (status.Equals("Rejected", StringComparison.OrdinalIgnoreCase) || status.Equals("SandboxError", StringComparison.OrdinalIgnoreCase))
            return new("sandbox-configuration", "İş sandbox tarafından reddedildi veya sandbox hatası oluştu.", false,
                "Sandbox hedefi ve servis sağlığını inceleyin; bu sonuçtan kod değişikliği önermeyin.");

        if (ContainsAny(text, "error CS", " error TS", "SyntaxError", "IndentationError", "TabError", "Syntax Error", "syntax error", "undefined reference", "undefined:",
                "cannot find symbol", "declared and not used", "cannot use", "no new variables on left side of :=",
                "too many arguments", "not enough arguments", "has no field or method", "could not compile", "error[E",
                "Expected \"}\" but found", "Expected \")\" but found", "Expected \"]\" but found", "Expected \";\" but found",
                "illegal start of", "reached end of file while parsing", "';' expected", "not a statement",
                "incompatible types:", "bad operand types for binary operator", "cannot be applied to given types", "no suitable method found for"))
            return new("source-diagnostic", "Çıktıda derleyici veya sözdizimi tanısı bulundu.", true,
                "Tanıdaki dosya ve satırı çalışma dalındaki güncel içerikle eşleştirip yalnız ilgili dosya için onarım önerisi hazırlayın.");

        if (operation.Equals("test", StringComparison.OrdinalIgnoreCase) && status.Equals("Failed", StringComparison.OrdinalIgnoreCase))
            return new("test-failure", "Testler başarısız oldu; bunun nedenini test çıktısı belirlemelidir.", true,
                "İlk başarısız test ve assertion çıktısını inceleyin; beklenen davranış onaylanmadan testi gevşetmeyin.");

        return new("unknown", "Mevcut durum ve çıktı güvenilir bir arıza sınıflandırması için yeterli değil.", false,
            "Önce sandbox çıktısını ve çalıştırılan commit'i inceleyin; otomatik kaynak onarımına geçmeyin.");
    }

    private static bool ContainsAny(string value, params string[] markers) =>
        markers.Any(marker => value.Contains(marker, StringComparison.OrdinalIgnoreCase));
}

public sealed record SandboxFailureTriageResult(string Category, string Summary, bool SourceRepairCandidate, string NextStep);
