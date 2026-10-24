using AIERP.WorkspaceSandbox;
using System.Security.Cryptography;
using System.Text.Json;

namespace AIERP.Platform.UnitTests;

public sealed class OperatorPackageCacheTests
{
    [Fact]
    public void Copies_only_whitelisted_bounded_cache_contents_into_a_job_owned_directory()
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-package-cache-tests", Guid.NewGuid().ToString("N"));
        var cache = Path.Combine(root, "source", "npm");
        var destination = Path.Combine(root, "job", ".npm-cache");
        Directory.CreateDirectory(Path.Combine(cache, "_cacache"));
        var packageFile = Path.Combine(cache, "_cacache", "package.tgz");
        File.WriteAllText(packageFile, "operator-managed-package-cache");
        WriteManifest(Path.GetDirectoryName(cache)!, "npm", packageFile);
        try
        {
            var copied = OperatorPackageCache.TryCopy(Path.GetDirectoryName(cache)!, "npm", destination, 1024, 100, out var error);

            Assert.True(copied, error);
            Assert.Equal("operator-managed-package-cache", File.ReadAllText(Path.Combine(destination, "_cacache", "package.tgz")));
            File.WriteAllText(Path.Combine(destination, "_cacache", "package.tgz"), "job-local-change");
            Assert.Equal("operator-managed-package-cache", File.ReadAllText(packageFile));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Rejects_unknown_oversized_or_missing_operator_caches()
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-package-cache-tests", Guid.NewGuid().ToString("N"));
        var cache = Path.Combine(root, "source", "go-mod");
        Directory.CreateDirectory(cache);
        var packageFile = Path.Combine(cache, "module.zip");
        File.WriteAllText(packageFile, new string('x', 32));
        WriteManifest(Path.GetDirectoryName(cache)!, "go-mod", packageFile);
        try
        {
            Assert.False(OperatorPackageCache.TryCopy(Path.Combine(root, "source"), "../secret", Path.Combine(root, "unknown"), 1024, 10, out _));
            Assert.False(OperatorPackageCache.TryCopy(Path.Combine(root, "source"), "go-mod", Path.Combine(root, "oversized"), 8, 10, out _));
            Assert.False(OperatorPackageCache.TryCopy(Path.Combine(root, "source"), "cargo-home", Path.Combine(root, "missing"), 1024, 10, out _));
            Assert.False(OperatorPackageCache.TryCopy(Path.Combine(root, "source"), "go-mod", Path.Combine(root, "source", "job-copy"), 1024, 10, out _));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Copies_operator_nuget_packages_into_a_job_owned_feed()
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-package-cache-tests", Guid.NewGuid().ToString("N"));
        var cache = Path.Combine(root, "source", "nuget");
        var destination = Path.Combine(root, "job", ".operator-cache", "nuget");
        Directory.CreateDirectory(cache);
        var packageFile = Path.Combine(cache, "Aierp.Sample.1.0.0.nupkg");
        File.WriteAllText(packageFile, "generated-nupkg");
        WriteManifest(Path.GetDirectoryName(cache)!, "nuget", packageFile);
        try
        {
            var copied = OperatorPackageCache.TryCopy(Path.GetDirectoryName(cache)!, "nuget", destination, 1024, 100, out var error);

            Assert.True(copied, error);
            Assert.Equal("generated-nupkg", File.ReadAllText(Path.Combine(destination, "Aierp.Sample.1.0.0.nupkg")));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Rejects_a_missing_or_tampered_cache_manifest()
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-package-cache-tests", Guid.NewGuid().ToString("N"));
        var cacheRoot = Path.Combine(root, "source");
        var cache = Path.Combine(cacheRoot, "npm");
        var packageFile = Path.Combine(cache, "package.tgz");
        var destination = Path.Combine(root, "job", "npm-cache");
        Directory.CreateDirectory(cache);
        File.WriteAllText(packageFile, "operator-managed-package-cache");
        try
        {
            Assert.False(OperatorPackageCache.TryCopy(cacheRoot, "npm", destination, 1024, 100, out _));
            Assert.False(Directory.Exists(destination));

            WriteManifest(cacheRoot, "npm", packageFile);
            var manifestPath = Path.Combine(cacheRoot, "package-cache-manifest.json");
            using var manifest = JsonDocument.Parse(File.ReadAllText(manifestPath));
            var entry = manifest.RootElement.GetProperty("caches").GetProperty("npm")[0];
            var path = entry.GetProperty("path").GetString();
            var digest = entry.GetProperty("sha256").GetString();
            var wrongDigest = new string(digest![0] == '0' ? '1' : '0', 64);
            WriteRawManifest(cacheRoot, new[] { new { path, sha256 = wrongDigest } });

            Assert.False(OperatorPackageCache.TryCopy(cacheRoot, "npm", destination, 1024, 100, out var error));
            Assert.Contains("manifest", error, StringComparison.OrdinalIgnoreCase);
            Assert.False(Directory.Exists(destination));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Rejects_tampered_unmanifested_duplicate_and_unsafe_manifest_entries()
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-package-cache-tests", Guid.NewGuid().ToString("N"));
        var cacheRoot = Path.Combine(root, "source");
        var cache = Path.Combine(cacheRoot, "npm");
        var packageFile = Path.Combine(cache, "package.tgz");
        Directory.CreateDirectory(cache);
        File.WriteAllText(packageFile, "trusted-content");
        var destination = Path.Combine(root, "job", "tampered");
        WriteManifest(cacheRoot, "npm", packageFile);
        try
        {
            File.WriteAllText(packageFile, "tampered-content");
            Assert.False(OperatorPackageCache.TryCopy(cacheRoot, "npm", destination, 1024, 100, out var tamperError));
            Assert.Contains("manifest", tamperError, StringComparison.OrdinalIgnoreCase);
            Assert.False(Directory.Exists(destination));

            File.WriteAllText(packageFile, "trusted-content");
            File.WriteAllText(Path.Combine(cache, "extra.tgz"), "not-manifested");
            Assert.False(OperatorPackageCache.TryCopy(cacheRoot, "npm", destination, 1024, 100, out var extraError));
            Assert.Contains("manifest", extraError, StringComparison.OrdinalIgnoreCase);
            File.Delete(Path.Combine(cache, "extra.tgz"));

            var manifestPath = Path.Combine(cacheRoot, "package-cache-manifest.json");
            var valid = File.ReadAllText(manifestPath);
            using var document = JsonDocument.Parse(valid);
            var entry = document.RootElement.GetProperty("caches").GetProperty("npm")[0];
            var path = entry.GetProperty("path").GetString();
            var digest = entry.GetProperty("sha256").GetString();

            WriteRawManifest(cacheRoot, new[] { new { path, sha256 = digest }, new { path, sha256 = digest } });
            Assert.False(OperatorPackageCache.TryCopy(cacheRoot, "npm", destination, 1024, 100, out _));
            WriteRawManifest(cacheRoot, new[] { new { path = "../outside", sha256 = digest } });
            Assert.False(OperatorPackageCache.TryCopy(cacheRoot, "npm", destination, 1024, 100, out _));

            WriteManifest(cacheRoot, "npm", packageFile);
            File.Delete(manifestPath);
            Assert.False(OperatorPackageCache.TryCopy(cacheRoot, "npm", destination, 1024, 100, out _));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    private static void WriteManifest(string cacheRoot, string cacheName, string filePath)
    {
        var relativePath = Path.GetRelativePath(Path.Combine(cacheRoot, cacheName), filePath).Replace(Path.DirectorySeparatorChar, '/');
        var digest = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(filePath))).ToLowerInvariant();
        WriteRawManifest(cacheRoot, new[] { new { path = relativePath, sha256 = digest } }, cacheName);
    }

    private static void WriteRawManifest<T>(string cacheRoot, T[] entries, string cacheName = "npm")
    {
        Directory.CreateDirectory(cacheRoot);
        var manifest = new { schemaVersion = 1, caches = new Dictionary<string, T[]> { [cacheName] = entries } };
        File.WriteAllText(Path.Combine(cacheRoot, "package-cache-manifest.json"), JsonSerializer.Serialize(manifest));
    }
}
