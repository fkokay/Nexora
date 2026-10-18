namespace AIERP.WorkspaceSandbox;

internal static class OperatorPackageCache
{
    private static readonly HashSet<string> CacheNames = new(StringComparer.Ordinal)
        { "npm", "python-wheels", "go-mod", "cargo-home", "nuget" };

    public static bool TryCopy(string cacheRoot, string cacheName, string destination, long maxBytes, int maxEntries, out string error)
    {
        error = "";
        if (!CacheNames.Contains(cacheName) || maxBytes <= 0 || maxEntries <= 0)
        {
            error = "Package cache request was rejected.";
            return false;
        }

        var source = Path.GetFullPath(Path.Combine(cacheRoot, cacheName));
        var cacheRootFullPath = Path.GetFullPath(cacheRoot).TrimEnd(Path.DirectorySeparatorChar);
        var target = Path.GetFullPath(destination);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var targetPrefix = target.EndsWith(Path.DirectorySeparatorChar) ? target : target + Path.DirectorySeparatorChar;
        if (target.Equals(source, comparison) || target.StartsWith(source + Path.DirectorySeparatorChar, comparison) ||
            target.Equals(cacheRootFullPath, comparison) || target.StartsWith(cacheRootFullPath + Path.DirectorySeparatorChar, comparison) ||
            Path.GetFullPath(target).Equals(Path.GetPathRoot(target), comparison) || source.StartsWith(targetPrefix, comparison))
        {
            error = "Package cache destination was rejected.";
            return false;
        }
        if (!Directory.Exists(source))
        {
            error = "Operator package cache is unavailable.";
            return false;
        }
        if ((File.GetAttributes(source) & FileAttributes.ReparsePoint) != 0)
        {
            error = "Operator package cache contains a link and was rejected.";
            return false;
        }

        var directories = new List<(string FullPath, string RelativePath)>();
        var files = new List<(string FullPath, string RelativePath)>();
        var pending = new Stack<(string FullPath, string RelativePath)>();
        pending.Push((source, ""));
        long totalBytes = 0;
        var entries = 0;
        try
        {
            while (pending.TryPop(out var directory))
            {
                directories.Add(directory);
                foreach (var entry in Directory.EnumerateFileSystemEntries(directory.FullPath))
                {
                    if (++entries > maxEntries)
                    {
                        error = "Operator package cache exceeds the allowed entry limit.";
                        return false;
                    }
                    var attributes = File.GetAttributes(entry);
                    if ((attributes & FileAttributes.ReparsePoint) != 0)
                    {
                        error = "Operator package cache contains a link and was rejected.";
                        return false;
                    }
                    var relative = Path.GetRelativePath(source, entry);
                    if ((attributes & FileAttributes.Directory) != 0)
                    {
                        pending.Push((entry, relative));
                        continue;
                    }

                    var length = new FileInfo(entry).Length;
                    if (length > maxBytes - totalBytes)
                    {
                        error = "Operator package cache exceeds the allowed size limit.";
                        return false;
                    }
                    totalBytes += length;
                    files.Add((entry, relative));
                }
            }

            if (Directory.Exists(target) || File.Exists(target))
            {
                error = "Package cache destination already exists.";
                return false;
            }
            Directory.CreateDirectory(target);
            foreach (var directory in directories.Where(x => x.RelativePath.Length > 0))
                Directory.CreateDirectory(Path.Combine(target, directory.RelativePath));
            foreach (var file in files)
            {
                var output = Path.Combine(target, file.RelativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(output)!);
                File.Copy(file.FullPath, output, overwrite: false);
            }
            return true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            error = "Operator package cache could not be copied.";
            try { if (Directory.Exists(target)) Directory.Delete(target, recursive: true); } catch (IOException) { }
            return false;
        }
    }
}
