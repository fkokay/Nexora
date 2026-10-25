namespace AIERP.ReleaseDeployer;

/// <summary>Resolves deployer-owned paths while rejecting lexical escapes and existing reparse points.</summary>
public static class ReleaseDeployerPath
{
    /// <summary>Converts a parsed identifier into the only permitted filename representation.</summary>
    public static string SafeGuidSegment(Guid value)
    {
        var segment = Path.GetFileName(value.ToString("N"));
        if (!System.Text.RegularExpressions.Regex.IsMatch(segment, "^[0-9a-f]{32}$", System.Text.RegularExpressions.RegexOptions.CultureInvariant))
            throw new InvalidDataException("Dağıtım kimliği geçersiz.");
        return segment;
    }

    public static string SafeChild(string root, string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(root);
        ArgumentException.ThrowIfNullOrWhiteSpace(relativePath);

        var normalized = relativePath.Replace('\\', '/');
        if (Path.IsPathRooted(relativePath) || normalized.StartsWith('/') || normalized.Contains(':') ||
            normalized.Split('/').Any(part => part is "" or "." or ".." ||
                OperatingSystem.IsWindows() && (part.EndsWith(' ') || part.EndsWith('.') || IsWindowsDeviceName(part))))
            throw new InvalidDataException("Dağıtım dosya yolu geçersiz.");

        var fullRoot = Path.GetFullPath(root);
        var child = Path.GetFullPath(Path.Combine(fullRoot, relativePath));
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var rootPrefix = Path.EndsInDirectorySeparator(fullRoot) ? fullRoot : fullRoot + Path.DirectorySeparatorChar;
        if (!child.StartsWith(rootPrefix, comparison))
            throw new InvalidDataException("Dağıtım dosya yolu geçersiz.");

        AssertNoReparsePoints(fullRoot);
        AssertNoReparsePoints(child);
        return child;
    }

    private static bool IsWindowsDeviceName(string segment)
    {
        // Win32 reserves these names even when an extension is present (for
        // example NUL.txt). A colon check alone does not protect this alias set.
        var deviceBase = segment.Split('.', 2)[0];
        if (deviceBase.Equals("CON", StringComparison.OrdinalIgnoreCase) ||
            deviceBase.Equals("PRN", StringComparison.OrdinalIgnoreCase) ||
            deviceBase.Equals("AUX", StringComparison.OrdinalIgnoreCase) ||
            deviceBase.Equals("NUL", StringComparison.OrdinalIgnoreCase) ||
            deviceBase.Equals("CONIN$", StringComparison.OrdinalIgnoreCase) ||
            deviceBase.Equals("CONOUT$", StringComparison.OrdinalIgnoreCase)) return true;

        if (deviceBase.Length == 4 &&
            (deviceBase.StartsWith("COM", StringComparison.OrdinalIgnoreCase) || deviceBase.StartsWith("LPT", StringComparison.OrdinalIgnoreCase)))
        {
            var suffix = deviceBase[3];
            return suffix is >= '1' and <= '9' or '\u00b9' or '\u00b2' or '\u00b3';
        }

        return false;
    }

    public static void AssertNoReparsePoints(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var pathRoot = Path.GetPathRoot(fullPath) ?? throw new InvalidDataException("Dağıtım dosya yolu geçersiz.");
        var current = pathRoot;
        foreach (var segment in fullPath[pathRoot.Length..].Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            if (segment.Length == 0) continue;
            current = Path.Combine(current, segment);
            try
            {
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("Dağıtım yolunda sembolik bağlantı veya yeniden ayrıştırma noktası kabul edilmez.");
            }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
        }
    }
}
