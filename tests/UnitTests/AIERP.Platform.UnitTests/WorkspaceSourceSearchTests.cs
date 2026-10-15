namespace AIERP.Platform.UnitTests;

public sealed class WorkspaceSourceSearchTests
{
    [Fact]
    public void Search_finds_literal_text_but_skips_generated_hidden_and_oversized_files()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-search-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "src"));
        Directory.CreateDirectory(Path.Combine(workspace, "node_modules", "pkg"));
        Directory.CreateDirectory(Path.Combine(workspace, ".hidden"));
        File.WriteAllText(Path.Combine(workspace, "src", "OrderService.cs"), "class OrderService\nvoid SaveOrder() { }\n");
        File.WriteAllText(Path.Combine(workspace, "node_modules", "pkg", "service.js"), "SaveOrder()\n");
        File.WriteAllText(Path.Combine(workspace, ".hidden", "notes.md"), "SaveOrder()\n");
        File.WriteAllText(Path.Combine(workspace, "secrets.json"), "SaveOrder()\n");
        File.WriteAllText(Path.Combine(workspace, "large.cs"), new string('x', 65 * 1024) + "SaveOrder()\n");
        try
        {
            var result = WorkspaceSecurity.SearchWorkspace(root, workspaceId, "saveorder");

            Assert.Contains(result.Matches, match => match.Path == "src/OrderService.cs" && match.Line == 2 && match.Excerpt.Contains("SaveOrder", StringComparison.Ordinal));
            Assert.DoesNotContain(result.Matches, match => match.Path.Contains("node_modules", StringComparison.Ordinal));
            Assert.DoesNotContain(result.Matches, match => match.Path.Contains(".hidden", StringComparison.Ordinal));
            Assert.DoesNotContain(result.Matches, match => match.Path.Contains("secret", StringComparison.OrdinalIgnoreCase));
            Assert.DoesNotContain(result.Matches, match => match.Path == "large.cs");
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void Search_caps_results_and_marks_them_truncated()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-search-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        File.WriteAllText(Path.Combine(workspace, "many.cs"), string.Join('\n', Enumerable.Repeat("FindMe();", 40)));
        try
        {
            var result = WorkspaceSecurity.SearchWorkspace(root, workspaceId, "FindMe");
            Assert.Equal(30, result.Matches.Count);
            Assert.True(result.Truncated);
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
