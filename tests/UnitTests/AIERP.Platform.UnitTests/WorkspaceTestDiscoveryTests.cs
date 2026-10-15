namespace AIERP.Platform.UnitTests;

public sealed class WorkspaceTestDiscoveryTests
{
    [Fact]
    public void Discovery_finds_dotnet_and_node_test_manifests_without_scanning_generated_folders()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "tests"));
        Directory.CreateDirectory(Path.Combine(workspace, "node_modules", "fake"));
        File.WriteAllText(Path.Combine(workspace, "tests", "UnitTests.csproj"), "<Project><PropertyGroup><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" Version=\"17.0.0\" /></ItemGroup></Project>");
        File.WriteAllText(Path.Combine(workspace, "package.json"), "{\"scripts\":{\"test\":\"vitest run\"}}");
        File.WriteAllText(Path.Combine(workspace, "tests", "sample.test.js"), "import { test } from 'node:test';");
        File.WriteAllText(Path.Combine(workspace, "node_modules", "fake", "package.json"), "{\"scripts\":{\"test\":\"untrusted\"}}");
        try
        {
            var discovery = WorkspaceSecurity.DiscoverTests(root, workspaceId);

            Assert.Equal(3, discovery.ScannedFiles);
            Assert.False(discovery.Truncated);
            Assert.Contains(discovery.Targets, target => target.Path == "tests/UnitTests.csproj" && target.Ecosystem == ".NET" && target.SuggestedCommand == "dotnet test --no-restore");
            Assert.Contains(discovery.Targets, target => target.Path == "package.json" && target.Ecosystem == "Node.js");
            Assert.DoesNotContain(discovery.Targets, target => target.Path.Contains("node_modules", StringComparison.Ordinal));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void Discovery_ignores_manifests_larger_than_the_read_limit()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        File.WriteAllText(Path.Combine(workspace, "package.json"), "{\"scripts\":{\"test\":\"vitest run\"}}" + new string(' ', 65 * 1024));
        try
        {
            var discovery = WorkspaceSecurity.DiscoverTests(root, workspaceId);
            Assert.Empty(discovery.Targets);
            Assert.Equal(1, discovery.ScannedFiles);
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
