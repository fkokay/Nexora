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
            Assert.Contains(discovery.Targets, target => target.Path == "tests/UnitTests.csproj" && target.Ecosystem == ".NET" && target.SuggestedCommand.StartsWith("dotnet test --no-restore", StringComparison.Ordinal));
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

    [Fact]
    public void Discovery_lists_each_python_test_file_and_ignores_non_python_test_names()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-python-tests-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "tests", "unit"));
        File.WriteAllText(Path.Combine(workspace, "tests", "test_orders.py"), "def test_orders(): pass\n");
        File.WriteAllText(Path.Combine(workspace, "tests", "unit", "orders_test.py"), "def test_order(): pass\n");
        File.WriteAllText(Path.Combine(workspace, "test_readme.md"), "not a Python test\n");
        try
        {
            var discovery = WorkspaceSecurity.DiscoverTests(root, workspaceId);
            var pythonTargets = discovery.Targets.Where(target => target.Ecosystem == "Python").ToList();

            Assert.Equal(2, pythonTargets.Count);
            Assert.Contains(pythonTargets, target => target.Path == "tests/test_orders.py" && target.CanTest);
            Assert.Contains(pythonTargets, target => target.Path == "tests/unit/orders_test.py" && target.CanTest);
            Assert.DoesNotContain(pythonTargets, target => target.Path == "test_readme.md");
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void Discovery_exposes_fixed_offline_build_targets_for_supported_languages()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-build-discovery-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "tests"));
        File.WriteAllText(Path.Combine(workspace, "package.json"), "{}");
        File.WriteAllText(Path.Combine(workspace, "app.js"), "const ready = true;");
        File.WriteAllText(Path.Combine(workspace, "test_sample.py"), "def test_ok(): assert True");
        File.WriteAllText(Path.Combine(workspace, "go.mod"), "module example.local/app\n\ngo 1.20\n");
        File.WriteAllText(Path.Combine(workspace, "app_test.go"), "package app\nimport \"testing\"\nfunc TestOK(t *testing.T) {}\n");
        File.WriteAllText(Path.Combine(workspace, "Cargo.toml"), "[package]\nname = \"sample\"\nversion = \"0.1.0\"\nedition = \"2021\"\n");
        File.WriteAllText(Path.Combine(workspace, "src.rs"), "fn main() {}\n");
        File.WriteAllText(Path.Combine(workspace, "tests", "sample.rs"), "#[test] fn works() {}\n");
        Directory.CreateDirectory(Path.Combine(workspace, "java", "src"));
        File.WriteAllText(Path.Combine(workspace, "java", "src", "SmokeCheck.java"), "package checks; public class SmokeCheck { public static void main(String[] args) { if (1 + 1 != 2) throw new AssertionError(); } }");
        File.WriteAllText(Path.Combine(workspace, "java", "src", "Library.java"), "public class Library { public int sum(int a, int b) { return a + b; } }");
        try
        {
            var targets = WorkspaceSecurity.DiscoverTests(root, workspaceId).Targets;

            Assert.Contains(targets, target => target.Path == "package.json" && target.Ecosystem == "Node.js" && target.CanBuild && target.CanTest == false);
            Assert.Contains(targets, target => target.Path == "test_sample.py" && target.Ecosystem == "Python" && target.CanBuild && target.CanTest);
            Assert.Contains(targets, target => target.Path == "go.mod" && target.Ecosystem == "Go" && target.CanBuild && target.CanTest == false);
            Assert.Contains(targets, target => target.Path == "Cargo.toml" && target.Ecosystem == "Rust" && target.CanBuild && target.CanTest);
            Assert.Contains(targets, target => target.Path == "java/src/SmokeCheck.java" && target.Ecosystem == "Java" && target.CanBuild && target.CanTest);
            Assert.Contains(targets, target => target.Path == "java/src/Library.java" && target.Ecosystem == "Java" && target.CanBuild && !target.CanTest);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Theory]
    [InlineData("go.mod", true)]
    [InlineData("services/api/go.mod", true)]
    [InlineData("../go.mod", false)]
    [InlineData(".hidden/go.mod", false)]
    [InlineData("services/passwords/go.mod", false)]
    [InlineData("services/api/go.sum", false)]
    public void Go_build_targets_are_limited_to_safe_module_manifests(string path, bool expected)
        => Assert.Equal(expected, WorkspaceSecurity.IsSafeGoBuildTarget(path));

    [Theory]
    [InlineData("Main.java", true)]
    [InlineData("src/Main.java", true)]
    [InlineData("../Main.java", false)]
    [InlineData(".hidden/Main.java", false)]
    [InlineData("src/passwords/Main.java", false)]
    [InlineData("src\\Main.java", false)]
    [InlineData("src/Main.class", false)]
    public void Java_targets_are_limited_to_safe_source_paths(string path, bool expected)
        => Assert.Equal(expected, WorkspaceSecurity.IsSafeJavaTarget(path));
}
