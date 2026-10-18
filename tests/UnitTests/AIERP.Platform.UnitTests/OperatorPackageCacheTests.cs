using AIERP.WorkspaceSandbox;

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
        File.WriteAllText(Path.Combine(cache, "module.zip"), new string('x', 32));
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
        File.WriteAllText(Path.Combine(cache, "Aierp.Sample.1.0.0.nupkg"), "generated-nupkg");
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
}
