using Microsoft.Extensions.Configuration;

internal static class LicensingKeyConfiguration
{
    public static string? Read(IConfiguration configuration, string valueKey, string fileKey)
    {
        var value = configuration[valueKey];
        if (!string.IsNullOrWhiteSpace(value)) return value;

        var path = configuration[fileKey];
        if (string.IsNullOrWhiteSpace(path)) return null;

        try
        {
            var file = new FileInfo(path);
            if (!file.Exists || file.Length is <= 0 or > 16_384) return null;
            return File.ReadAllText(path);
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }
}
