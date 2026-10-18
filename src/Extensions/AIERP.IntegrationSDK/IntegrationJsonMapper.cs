using System.Text.Json;
using System.Text.Json.Nodes;

namespace AIERP.IntegrationSDK;

/// <summary>Maps a bounded JSON property path from an ERP payload to a provider payload.</summary>
public sealed record IntegrationJsonFieldMapping(string SourcePath, string TargetPath, bool Required = false);

public sealed class IntegrationJsonMappingException(string message) : Exception(message);

/// <summary>
/// Applies operator-owned, declarative object-to-object mappings. If no mappings are configured,
/// the original JSON value is cloned for backward compatibility.
/// </summary>
public static class IntegrationJsonMapper
{
    private const int MaximumMappings = 100;
    private const int MaximumPathLength = 256;
    private const int MaximumPathDepth = 8;

    public static JsonElement Map(JsonElement source, IReadOnlyCollection<IntegrationJsonFieldMapping> mappings)
    {
        ArgumentNullException.ThrowIfNull(mappings);
        if (mappings.Count == 0) return source.Clone();
        if (mappings.Count > MaximumMappings)
            throw new IntegrationJsonMappingException("The integration mapping exceeds the configured field limit.");
        if (source.ValueKind != JsonValueKind.Object)
            throw new IntegrationJsonMappingException("Mapped integration payloads must be JSON objects.");

        var destination = new JsonObject();
        foreach (var mapping in mappings)
        {
            var sourcePath = ParsePath(mapping.SourcePath);
            var targetPath = ParsePath(mapping.TargetPath);
            if (!TryRead(source, sourcePath, out var value))
            {
                if (mapping.Required)
                    throw new IntegrationJsonMappingException("A required source field is missing from the integration payload.");
                continue;
            }

            Write(destination, targetPath, JsonNode.Parse(value.GetRawText()));
        }

        return JsonSerializer.SerializeToElement(destination);
    }

    /// <summary>Validates mapping declarations without reading or transmitting tenant payloads.</summary>
    public static IReadOnlyList<string> Validate(IReadOnlyCollection<IntegrationJsonFieldMapping> mappings)
    {
        ArgumentNullException.ThrowIfNull(mappings);
        var errors = new List<string>();
        if (mappings.Count > MaximumMappings)
        {
            errors.Add("The integration mapping exceeds the configured field limit.");
            return errors;
        }

        var targets = new List<string[]>();
        foreach (var mapping in mappings)
        {
            try
            {
                _ = ParsePath(mapping.SourcePath);
                var target = ParsePath(mapping.TargetPath);
                if (targets.Any(existing => IsPrefix(existing, target) || IsPrefix(target, existing)))
                    errors.Add("Integration mapping target paths must be unique and cannot overlap.");
                else
                    targets.Add(target);
            }
            catch (IntegrationJsonMappingException exception)
            {
                errors.Add(exception.Message);
            }
        }
        return errors;
    }

    private static bool IsPrefix(IReadOnlyList<string> prefix, IReadOnlyList<string> path) =>
        prefix.Count <= path.Count && prefix.Select((segment, index) =>
            string.Equals(segment, path[index], StringComparison.Ordinal)).All(matches => matches);

    private static string[] ParsePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > MaximumPathLength)
            throw new IntegrationJsonMappingException("An integration mapping path is invalid.");

        var segments = path.Split('.');
        if (segments.Length > MaximumPathDepth || segments.Any(segment => !IsPropertyName(segment)))
            throw new IntegrationJsonMappingException("An integration mapping path is invalid.");
        return segments;
    }

    private static bool IsPropertyName(string segment)
    {
        if (segment.Length is < 1 or > 64 || !(char.IsAsciiLetter(segment[0]) || segment[0] == '_')) return false;
        return segment.Skip(1).All(character => char.IsAsciiLetterOrDigit(character) || character is '_' or '-');
    }

    private static bool TryRead(JsonElement source, IReadOnlyList<string> path, out JsonElement value)
    {
        value = source;
        foreach (var segment in path)
        {
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(segment, out value))
            {
                value = default;
                return false;
            }
        }
        return true;
    }

    private static void Write(JsonObject destination, IReadOnlyList<string> path, JsonNode? value)
    {
        var current = destination;
        for (var index = 0; index < path.Count - 1; index++)
        {
            var segment = path[index];
            if (current[segment] is null)
            {
                current[segment] = new JsonObject();
            }
            else if (current[segment] is not JsonObject)
            {
                throw new IntegrationJsonMappingException("Integration mapping target paths overlap.");
            }

            current = (JsonObject)current[segment]!;
        }

        var leaf = path[^1];
        if (current.ContainsKey(leaf))
            throw new IntegrationJsonMappingException("Integration mapping target paths must be unique.");
        current[leaf] = value;
    }
}
