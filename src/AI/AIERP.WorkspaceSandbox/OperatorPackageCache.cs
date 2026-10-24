using System.Security.Cryptography;
using System.Text.Json;

namespace AIERP.WorkspaceSandbox;

internal static class OperatorPackageCache
{
    private const string ManifestFileName = "package-cache-manifest.json";
    private const long MaxManifestBytes = 8 * 1024 * 1024;
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

        var root = Path.GetFullPath(cacheRoot);
        var source = Path.GetFullPath(Path.Combine(root, cacheName));
        var cacheRootFullPath = root.TrimEnd(Path.DirectorySeparatorChar);
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

        try
        {
            if ((File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0 ||
                (File.GetAttributes(source) & FileAttributes.ReparsePoint) != 0)
            {
                error = "Operator package cache contains a link and was rejected.";
                return false;
            }

            var expectedHashes = ReadTrustedManifest(root, cacheName);
            var directories = new List<(string FullPath, string RelativePath)>();
            var files = new List<(string FullPath, string RelativePath, long Length)>();
            var pending = new Stack<(string FullPath, string RelativePath)>();
            pending.Push((source, ""));
            long totalBytes = 0;
            var entries = 0;
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
                    files.Add((entry, relative, length));
                }
            }

            var actualPaths = files.Select(file => ToManifestPath(file.RelativePath)).ToHashSet(StringComparer.Ordinal);
            if (actualPaths.Count != expectedHashes.Count || !actualPaths.SetEquals(expectedHashes.Keys))
            {
                error = "Operator package cache contents do not match the trusted manifest.";
                return false;
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
                bool verified;
                using (var input = new FileStream(file.FullPath, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (var destinationStream = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                using (var sha256 = IncrementalHash.CreateHash(HashAlgorithmName.SHA256))
                {
                    var hash = CopyAndHash(input, destinationStream, sha256, file.Length);
                    verified = CryptographicOperations.FixedTimeEquals(hash, Convert.FromHexString(expectedHashes[ToManifestPath(file.RelativePath)]));
                }
                if (!verified)
                {
                    error = "Operator package cache failed trusted manifest verification.";
                    // The destination stream is closed now, so cleanup also works on Windows.
                    TryDeleteTarget(target);
                    return false;
                }
            }
            return true;
        }
        catch (Exception exception) when (exception is IOException or InvalidDataException or UnauthorizedAccessException or ArgumentException or NotSupportedException or JsonException or FormatException or CryptographicException)
        {
            error = "Operator package cache could not be copied or verified.";
            TryDeleteTarget(target);
            return false;
        }
    }

    private static Dictionary<string, string> ReadTrustedManifest(string cacheRoot, string cacheName)
    {
        var manifestPath = Path.Combine(cacheRoot, ManifestFileName);
        if (!File.Exists(manifestPath) || (File.GetAttributes(manifestPath) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidDataException("Trusted operator package cache manifest is missing or invalid.");
        if (new FileInfo(manifestPath).Length > MaxManifestBytes)
            throw new InvalidDataException("Trusted operator package cache manifest exceeds the allowed size.");

        using var stream = new FileStream(manifestPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        using var document = JsonDocument.Parse(stream, new JsonDocumentOptions { MaxDepth = 8 });
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("schemaVersion", out var schema) ||
            schema.ValueKind != JsonValueKind.Number || schema.GetInt32() != 1 ||
            !root.TryGetProperty("caches", out var caches) || caches.ValueKind != JsonValueKind.Object ||
            !caches.TryGetProperty(cacheName, out var files) || files.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("Trusted operator package cache manifest has an unsupported format.");

        var hashes = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var file in files.EnumerateArray())
        {
            if (file.ValueKind != JsonValueKind.Object || !file.TryGetProperty("path", out var pathElement) || pathElement.ValueKind != JsonValueKind.String ||
                !file.TryGetProperty("sha256", out var hashElement) || hashElement.ValueKind != JsonValueKind.String)
                throw new InvalidDataException("Trusted operator package cache manifest entry is invalid.");

            var path = pathElement.GetString()!;
            var hash = hashElement.GetString()!;
            ValidateManifestPath(path);
            if (hash.Length != 64 || hash.Any(character => !Uri.IsHexDigit(character)) || !hashes.TryAdd(path, hash.ToLowerInvariant()))
                throw new InvalidDataException("Trusted operator package cache manifest entry is invalid.");
        }
        return hashes;
    }

    private static void ValidateManifestPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Contains('\\') || Path.IsPathRooted(path) ||
            path.Split('/').Any(part => part.Length == 0 || part is "." or "..") ||
            !string.Equals(path, ToManifestPath(path), StringComparison.Ordinal))
            throw new InvalidDataException("Trusted operator package cache manifest contains an unsafe path.");
    }

    private static string ToManifestPath(string path) => path.Replace(Path.DirectorySeparatorChar, '/').Replace(Path.AltDirectorySeparatorChar, '/');

    private static byte[] CopyAndHash(Stream input, Stream output, IncrementalHash hashAlgorithm, long expectedLength)
    {
        var buffer = new byte[81920];
        long copied = 0;
        int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            if (read > expectedLength - copied)
                throw new InvalidDataException("Operator package cache changed while it was being copied.");
            hashAlgorithm.AppendData(buffer, 0, read);
            output.Write(buffer, 0, read);
            copied += read;
        }
        if (copied != expectedLength)
            throw new InvalidDataException("Operator package cache changed while it was being copied.");
        return hashAlgorithm.GetHashAndReset();
    }

    private static void TryDeleteTarget(string target)
    {
        try { if (Directory.Exists(target)) Directory.Delete(target, recursive: true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
