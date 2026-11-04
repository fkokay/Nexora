using System.Text.Json;

/// <summary>Small declarative schema guard. Definitions contain inert data only, never markup or executable expressions.</summary>
internal static class TenantCustomPageSchema
{
    private const int MaxBytes = 64 * 1024;
    private const int MaxComponents = 80;
    private static readonly HashSet<string> ComponentTypes = new(StringComparer.Ordinal)
    { "heading", "text", "metric", "card", "section", "divider", "spacer", "button", "dataTable", "form" };
    private static readonly HashSet<string> RootKeys = new(StringComparer.Ordinal) { "schemaVersion", "components" };
    private static readonly HashSet<string> ComponentKeys = new(StringComparer.Ordinal) { "id", "type", "props", "children" };
    private static readonly HashSet<string> SafeProps = new(StringComparer.Ordinal)
    { "title", "text", "label", "value", "description", "variant", "size", "icon", "source", "columns", "format", "target", "required", "placeholder" };

    public static bool Validate(string json, out string? error)
    {
        error = null;
        if (System.Text.Encoding.UTF8.GetByteCount(json) > MaxBytes) { error = "Sayfa tanımı 64 KiB sınırını aşıyor."; return false; }
        try
        {
            using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 8 });
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !OnlyKeys(root, RootKeys) || !root.TryGetProperty("schemaVersion", out var version) || version.GetInt32() != 1
                || !root.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array || components.GetArrayLength() > MaxComponents)
            { error = "Tanım schemaVersion:1 ve en fazla 80 bileşenli components dizisi içermelidir."; return false; }
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var component in components.EnumerateArray())
                if (!ValidateComponent(component, ids, 0, out error)) return false;
            return true;
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or FormatException)
        { error = "Sayfa tanımı geçerli JSON/schema değil."; return false; }
    }

    private static bool ValidateComponent(JsonElement component, HashSet<string> ids, int depth, out string? error)
    {
        error = null;
        if (depth > 4 || component.ValueKind != JsonValueKind.Object || !OnlyKeys(component, ComponentKeys)
            || !component.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String
            || !component.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String)
        { error = "Bileşen biçimi geçersiz veya iç içe geçme sınırı aşıldı."; return false; }
        var idText = id.GetString()!; var typeText = type.GetString()!;
        if (idText.Length is < 1 or > 64 || !idText.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') || !ids.Add(idText))
        { error = "Bileşen kimlikleri benzersiz, kısa ve yalnızca harf/rakam/-/_ içermelidir."; return false; }
        if (!ComponentTypes.Contains(typeText)) { error = $"İzin verilmeyen bileşen türü: {typeText}."; return false; }
        if (component.TryGetProperty("props", out var props))
        {
            if (props.ValueKind != JsonValueKind.Object || props.EnumerateObject().Count() > 16 || !OnlyKeys(props, SafeProps))
            { error = "Bileşen özellikleri izin verilen statik alanlarla sınırlıdır."; return false; }
            foreach (var prop in props.EnumerateObject())
                if (!SafeValue(prop.Value, 0)) { error = $"'{prop.Name}' özelliği yalnızca sınırlı statik metin/sayı/bool/dizi/değer içerebilir."; return false; }
        }
        if (component.TryGetProperty("children", out var children))
        {
            if (typeText is not ("section" or "card") || children.ValueKind != JsonValueKind.Array || children.GetArrayLength() > MaxComponents)
            { error = "Yalnızca section/card bileşenleri alt bileşen alabilir."; return false; }
            foreach (var child in children.EnumerateArray()) if (!ValidateComponent(child, ids, depth + 1, out error)) return false;
        }
        return true;
    }

    private static bool SafeValue(JsonElement element, int depth)
    {
        if (depth > 2) return false;
        return element.ValueKind switch
        {
            JsonValueKind.String => (element.GetString()?.Length ?? 0) <= 2000 && !ContainsExecutableText(element.GetString()!),
            JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null => true,
            JsonValueKind.Array => element.GetArrayLength() <= 40 && element.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String && SafeValue(x, depth + 1)),
            _ => false
        };
    }
    private static bool ContainsExecutableText(string text) => text.Contains("<", StringComparison.Ordinal) || text.Contains(">", StringComparison.Ordinal)
        || text.Contains("javascript:", StringComparison.OrdinalIgnoreCase) || text.Contains("data:", StringComparison.OrdinalIgnoreCase)
        || text.Contains("{{", StringComparison.Ordinal) || text.Contains("}}", StringComparison.Ordinal);
    private static bool OnlyKeys(JsonElement element, HashSet<string> allowed) => element.EnumerateObject().All(p => allowed.Contains(p.Name));
}
