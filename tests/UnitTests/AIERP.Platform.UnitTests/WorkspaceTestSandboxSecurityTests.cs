using System.IO.Compression;

namespace AIERP.Platform.UnitTests;

public sealed class WorkspaceTestSandboxSecurityTests
{
    [Theory]
    [InlineData("tests/UnitTests.csproj", true)]
    [InlineData("../outside.csproj", false)]
    [InlineData("tests\\UnitTests.csproj", false)]
    [InlineData(".hidden/UnitTests.csproj", false)]
    [InlineData("node_modules/Example.csproj", false)]
    [InlineData("tests/credentials.csproj", false)]
    [InlineData("tests/ApiPassword.csproj", false)]
    [InlineData("tests/not-a-test.txt", false)]
    public void Dotnet_test_target_paths_are_bounded(string path, bool expected)
        => Assert.Equal(expected, WorkspaceSecurity.IsSafeDotNetTestTarget(path));

    [Theory]
    [InlineData("Main.java", true)]
    [InlineData("tests/Main.java", true)]
    [InlineData("../Main.java", false)]
    [InlineData("tests\\Main.java", false)]
    [InlineData(".hidden/Main.java", false)]
    [InlineData("tests/credentials/Main.java", false)]
    [InlineData("tests/ApiPassword.java", false)]
    [InlineData("tests/Main.class", false)]
    public void Plain_java_targets_reject_unsafe_paths(string path, bool expected)
        => Assert.Equal(expected, TestJobWorker.IsSafePlainJavaTarget(path));

    [Fact]
    public void Plain_java_test_harness_requires_matching_public_class_and_main_method()
    {
        const string valid = "package sample.tests; public final class SmokeTest { public static void main(String[] args) { if (1 != 1) throw new AssertionError(); } }";
        Assert.True(TestJobWorker.TryGetPlainJavaTestMainClass("sample/tests/SmokeTest.java", valid, out var mainClass));
        Assert.Equal("sample.tests.SmokeTest", mainClass);
        Assert.False(TestJobWorker.TryGetPlainJavaTestMainClass("sample/tests/SmokeTest.java", "class SmokeTest { public static void main(String[] args) {} }", out _));
        Assert.False(TestJobWorker.TryGetPlainJavaTestMainClass("sample/tests/SmokeTest.java", "public class SmokeTest { public void main(String[] args) {} }", out _));
        Assert.False(TestJobWorker.TryGetPlainJavaTestMainClass("sample/tests/Other.java", "public class SmokeTest { public static void main(String[] args) {} }", out _));
        Assert.False(TestJobWorker.TryGetPlainJavaTestMainClass("sample/tests/SmokeTest.java", new string('x', 65 * 1024), out _));
    }

    [Fact]
    public void Plain_java_commands_are_dependency_free_and_resource_bounded()
    {
        var compile = TestJobWorker.CreatePlainJavaCompileArguments("Main.java", "/tmp/classes", "/tmp/empty-sourcepath");
        Assert.Contains("--release", compile);
        Assert.Contains("21", compile);
        Assert.Contains("-proc:none", compile);
        Assert.Contains("-implicit:none", compile);
        Assert.Contains("-J-Xmx512m", compile);
        Assert.DoesNotContain(compile, value => value.Contains("maven", StringComparison.OrdinalIgnoreCase) || value.Contains("gradle", StringComparison.OrdinalIgnoreCase));
        var run = TestJobWorker.CreatePlainJavaRunArguments("/tmp/classes", "sample.SmokeTest", "/tmp/java-tmp");
        Assert.Contains("--limit-modules", run);
        Assert.Contains("java.base", run);
        Assert.Contains("-Xmx512m", run);
        Assert.Contains("-ea", run);
    }

    [Fact]
    public async Task Test_snapshot_skips_git_hidden_generated_and_secret_paths()
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-test-snapshot-" + Guid.NewGuid().ToString("N"));
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        var zip = Path.Combine(root, "snapshot.zip");
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "tests"));
        Directory.CreateDirectory(Path.Combine(workspace, "bin"));
        Directory.CreateDirectory(Path.Combine(workspace, ".hidden"));
        await File.WriteAllTextAsync(Path.Combine(workspace, "tests", "UnitTests.csproj"), "<Project />");
        await File.WriteAllTextAsync(Path.Combine(workspace, "tests", "Example.cs"), "public sealed class Example {}");
        await File.WriteAllTextAsync(Path.Combine(workspace, ".env"), "secret=value");
        await File.WriteAllTextAsync(Path.Combine(workspace, "ApiPassword.cs"), "secret");
        await File.WriteAllTextAsync(Path.Combine(workspace, ".git", "config"), "git-secret");
        await File.WriteAllTextAsync(Path.Combine(workspace, "bin", "output.dll"), "generated");
        await File.WriteAllTextAsync(Path.Combine(workspace, ".hidden", "source.cs"), "hidden");

        try
        {
            await WorkspaceSecurity.CreateTestSnapshotAsync(root, workspaceId, "tests/UnitTests.csproj", zip, CancellationToken.None);
            using var archive = ZipFile.OpenRead(zip);
            var paths = archive.Entries.Select(entry => entry.FullName).ToHashSet(StringComparer.Ordinal);
            Assert.Contains("tests/UnitTests.csproj", paths);
            Assert.Contains("tests/Example.cs", paths);
            Assert.DoesNotContain(paths, path => path.Contains(".git", StringComparison.Ordinal));
            Assert.DoesNotContain(paths, path => path.Contains("bin/", StringComparison.Ordinal));
            Assert.DoesNotContain(paths, path => path.Contains(".hidden", StringComparison.Ordinal));
            Assert.DoesNotContain(paths, path => path.Contains("Password", StringComparison.OrdinalIgnoreCase));
            Assert.DoesNotContain(paths, path => path.Contains(".env", StringComparison.OrdinalIgnoreCase));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Archive_extraction_rejects_existing_symlink_ancestors()
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-test-archive-link-" + Guid.NewGuid().ToString("N"));
        var destination = Path.Combine(root, "destination");
        var outside = Path.Combine(root, "outside");
        var archivePath = Path.Combine(root, "snapshot.zip");
        Directory.CreateDirectory(destination);
        Directory.CreateDirectory(outside);
        try
        {
            try { Directory.CreateSymbolicLink(Path.Combine(destination, "linked"), outside); }
            catch (Exception exception) when (exception is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
            {
                return; // Windows environments without symlink privileges cannot exercise this filesystem case.
            }

            using (var archive = ZipFile.Open(archivePath, ZipArchiveMode.Create))
            using (var entry = archive.CreateEntry("linked/payload.txt").Open())
            using (var writer = new StreamWriter(entry))
                writer.Write("must not be written through the link");

            var extractionException = Assert.ThrowsAny<Exception>(() => TestJobWorker.ExtractArchive(archivePath, destination));

            Assert.Contains("symbolic link or reparse point", extractionException.Message, StringComparison.Ordinal);
            Assert.False(File.Exists(Path.Combine(outside, "payload.txt")));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("../escaped.txt")]
    [InlineData("..\\escaped.txt")]
    [InlineData("/escaped.txt")]
    [InlineData("C:/escaped.txt")]
    public void Archive_extraction_rejects_traversal_and_rooted_paths(string entryName)
    {
        var root = Path.Combine(Path.GetTempPath(), "aierp-test-archive-path-" + Guid.NewGuid().ToString("N"));
        var destination = Path.Combine(root, "destination");
        var archivePath = Path.Combine(root, "snapshot.zip");
        var escapedPath = Path.Combine(root, "escaped.txt");
        Directory.CreateDirectory(destination);
        try
        {
            using (var archive = ZipFile.Open(archivePath, ZipArchiveMode.Create))
            using (var entry = archive.CreateEntry(entryName).Open())
            using (var writer = new StreamWriter(entry))
                writer.Write("must remain inside the snapshot");

            var exception = Assert.ThrowsAny<Exception>(() => TestJobWorker.ExtractArchive(archivePath, destination));
            Assert.Contains("unsafe path", exception.Message, StringComparison.Ordinal);

            Assert.False(File.Exists(escapedPath));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }
}
