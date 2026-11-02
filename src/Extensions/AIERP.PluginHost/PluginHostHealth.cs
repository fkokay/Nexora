namespace AIERP.PluginHost;

/// <summary>Reports whether the local package mount can serve module artifacts without exposing its path.</summary>
public static class PluginHostHealth
{
    public static bool IsPackageStoreReadable(string configuredRoot)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(configuredRoot)) return false;
            var root = Path.GetFullPath(configuredRoot);
            if (!Directory.Exists(root)) return false;

            // The package mount is intentionally read-only. Enumerating it verifies that the service identity
            // can actually read the mounted directory without requiring write access or opening a package.
            using var entries = Directory.EnumerateFileSystemEntries(root).GetEnumerator();
            _ = entries.MoveNext();
            return true;
        }
        catch (Exception exception) when (exception is ArgumentException or IOException or UnauthorizedAccessException or NotSupportedException or System.Security.SecurityException)
        {
            return false;
        }
    }
}
