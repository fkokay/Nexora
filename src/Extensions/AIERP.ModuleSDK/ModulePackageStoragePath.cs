namespace AIERP.ModuleSDK;

/// <summary>Builds module-package paths while rejecting lexical escapes and existing reparse points.</summary>
public static class ModulePackageStoragePath
{
    public static string ResolvePackage(string root, string sha256)
    {
        if (!ModuleManifestValidator.IsValidSha256(sha256))
            throw new InvalidDataException("Modül paketi özeti geçersiz.");
        return ResolveChild(root, $"{sha256.ToLowerInvariant()}.zip");
    }

    public static string ResolveChild(string root, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(root);
        ArgumentException.ThrowIfNullOrWhiteSpace(relativePath);
        var normalized = relativePath.Replace('\\', '/');
        if (Path.IsPathRooted(relativePath) || normalized.StartsWith('/') || normalized.Contains(':') ||
            normalized.Split('/').Any(part => part is "" or "." or ".."))
            throw new InvalidDataException("Modül paketi yolu geçersiz.");

        var fullRoot = Path.GetFullPath(root);
        var child = Path.GetFullPath(Path.Combine(fullRoot, relativePath));
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var rootPrefix = Path.EndsInDirectorySeparator(fullRoot) ? fullRoot : fullRoot + Path.DirectorySeparatorChar;
        if (!child.StartsWith(rootPrefix, comparison)) throw new InvalidDataException("Modül paketi yolu geçersiz.");
        AssertNoReparsePoints(fullRoot);
        AssertNoReparsePoints(child);
        return child;
    }

    public static void AssertNoReparsePoints(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var pathRoot = Path.GetPathRoot(fullPath) ?? throw new InvalidDataException("Modül paketi yolu geçersiz.");
        var current = pathRoot;
        foreach (var segment in fullPath[pathRoot.Length..].Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            if (segment.Length == 0) continue;
            current = Path.Combine(current, segment);
            try
            {
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("Modül deposunda sembolik bağlantı veya yeniden ayrıştırma noktası kabul edilmez.");
            }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
        }
    }
}
