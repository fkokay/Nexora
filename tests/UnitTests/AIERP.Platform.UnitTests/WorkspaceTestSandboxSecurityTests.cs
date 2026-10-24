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
}
