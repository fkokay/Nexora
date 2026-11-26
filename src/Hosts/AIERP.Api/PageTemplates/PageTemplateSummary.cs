using System.Text.Json;

namespace AIERP.Api;

/// <summary>Reads the page template (kalıp) and its computed level from a stored definition for catalog lists. Never throws.</summary>
internal static class PageTemplateSummary
{
    public static (string? Template, int? Level) Read(string? definitionJson)
    {
        if (string.IsNullOrWhiteSpace(definitionJson)) return (null, null);
        try
        {
            using var document = JsonDocument.Parse(definitionJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("template", out var template) || template.ValueKind != JsonValueKind.Object
                || !template.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String
                || name.GetString() is not ("list" or "record" or "belge")) return (null, null);
            var level = 1;
            if (root.TryGetProperty("components", out var components) && components.ValueKind == JsonValueKind.Array)
                foreach (var component in components.EnumerateArray())
                {
                    if (component.ValueKind != JsonValueKind.Object || !component.TryGetProperty("props", out var props) || props.ValueKind != JsonValueKind.Object
                        || !props.TryGetProperty("slot", out var slot) || slot.ValueKind != JsonValueKind.String) continue;
                    if (slot.GetString() is "above" or "below") { level = 2; break; }
                }
            return (name.GetString(), level);
        }
        catch (JsonException) { return (null, null); }
    }
}
