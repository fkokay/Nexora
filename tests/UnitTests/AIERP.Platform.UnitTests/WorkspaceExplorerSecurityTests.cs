using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;

namespace AIERP.Platform.UnitTests;

public sealed class WorkspaceExplorerSecurityTests
{
    [Fact]
    public void Workspace_branch_name_is_deterministic_and_safe_for_each_workspace_id()
    {
        var workspaceId = Guid.Parse("3d83b909-f7f6-4e43-beb7-739a7ac4b84e");

        var branchName = WorkspaceSecurity.GetWorkspaceBranchName(workspaceId);

        Assert.Equal("aierp/workspace-3d83b909f7f64e43beb7739a7ac4b84e", branchName);
        Assert.True(WorkspaceSecurity.IsValidBranchName(branchName));
    }

    [Fact]
    public async Task Ensuring_workspace_branch_preserves_existing_checkout_changes_and_is_idempotent()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(root);
        Directory.CreateDirectory(workspace);
        try
        {
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["init", workspace], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "config", "user.name", "AIERP Test"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "config", "user.email", "aierp-test@example.invalid"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            var sourcePath = Path.Combine(workspace, "Sample.cs");
            File.WriteAllText(sourcePath, "class Sample { }\n");
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "add", "--", "Sample.cs"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "commit", "-m", "base"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            File.WriteAllText(sourcePath, "class Sample { public int Value => 1; }\n");

            var first = await WorkspaceSecurity.EnsureWorkspaceBranchAsync(root, workspaceId, CancellationToken.None);
            var second = await WorkspaceSecurity.EnsureWorkspaceBranchAsync(root, workspaceId, CancellationToken.None);

            Assert.Equal($"aierp/workspace-{workspaceId:N}", first.BranchName);
            Assert.Equal(first.CommitSha, second.CommitSha);
            Assert.Equal(first.BranchName, second.BranchName);
            Assert.Equal("class Sample { public int Value => 1; }\n", File.ReadAllText(sourcePath));
            File.WriteAllText(Path.Combine(workspace, "New File.ts"), "export const value = 1;\n");
            var initialSummary = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(root, workspaceId, CancellationToken.None);
            Assert.NotNull(initialSummary);
            Assert.Equal(2, initialSummary.TotalChangedFiles);
            Assert.Contains(initialSummary.Files, file => file.Path == "Sample.cs" && file.Status == "Modified");
            Assert.Contains(initialSummary.Files, file => file.Path == "New File.ts" && file.Status == "Untracked");
            var trackedDiff = await WorkspaceSecurity.GetWorkspaceGitDiffAsync(root, workspaceId, "Sample.cs", CancellationToken.None);
            Assert.Null(trackedDiff.Error);
            Assert.Equal("class Sample { }\n", trackedDiff.Diff!.BaseContent);
            Assert.Equal("class Sample { public int Value => 1; }\n", trackedDiff.Diff.CurrentContent);
            var createdDiff = await WorkspaceSecurity.GetWorkspaceGitDiffAsync(root, workspaceId, "New File.ts", CancellationToken.None);
            Assert.Null(createdDiff.Error);
            Assert.Equal("", createdDiff.Diff!.BaseContent);
            Assert.Equal("export const value = 1;\n", createdDiff.Diff.CurrentContent);
            File.Delete(sourcePath);
            var deletedDiff = await WorkspaceSecurity.GetWorkspaceGitDiffAsync(root, workspaceId, "Sample.cs", CancellationToken.None);
            Assert.Null(deletedDiff.Error);
            Assert.Equal("Deleted", deletedDiff.Diff!.Status);
            Assert.Equal("class Sample { }\n", deletedDiff.Diff.BaseContent);
            Assert.Equal("", deletedDiff.Diff.CurrentContent);
            var largePath = Path.Combine(workspace, "Large.txt");
            File.WriteAllText(largePath, new string('x', 128 * 1024 + 1));
            Assert.Equal("too_large", (await WorkspaceSecurity.GetWorkspaceGitDiffAsync(root, workspaceId, "Large.txt", CancellationToken.None)).Error);
            File.Delete(largePath);
            var binaryPath = Path.Combine(workspace, "Binary.dat");
            await File.WriteAllBytesAsync(binaryPath, [0, 1, 2, 3]);
            Assert.Equal("binary", (await WorkspaceSecurity.GetWorkspaceGitDiffAsync(root, workspaceId, "Binary.dat", CancellationToken.None)).Error);
            File.Delete(binaryPath);
            for (var index = 0; index < 205; index++) File.WriteAllText(Path.Combine(workspace, $"Fixture-{index:D3}.txt"), "fixture");
            var summary = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(root, workspaceId, CancellationToken.None);
            Assert.NotNull(summary);
            Assert.Equal(first.BranchName, summary.BranchName);
            Assert.Equal(first.CommitSha, summary.HeadCommitSha);
            Assert.Equal(207, summary.TotalChangedFiles);
            Assert.Equal(200, summary.Files.Count);
            Assert.True(summary.Truncated);
            Assert.Contains("Sample.cs", (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "status", "--short"], TimeSpan.FromSeconds(10), CancellationToken.None)).Output);
        }
        finally
        {
            foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal);
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("feature/workspace-browser", true)]
    [InlineData("../outside", false)]
    [InlineData("feature\\outside", false)]
    [InlineData(".git/config", false)]
    public void Workspace_path_resolution_rejects_traversal_and_git_metadata(string path, bool valid)
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "feature"));
        Directory.CreateDirectory(Path.Combine(workspace, "feature", "workspace-browser"));
        try
        {
            var resolved = WorkspaceSecurity.TryResolveDirectory(root, workspaceId, path, out var directory, out _);
            Assert.Equal(valid, resolved);
            if (valid) Assert.Equal(Path.Combine(workspace, "feature", "workspace-browser"), directory);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void Workspace_path_resolution_rejects_symbolic_link_directories()
    {
        if (OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        var outside = Path.Combine(root, "outside");
        Directory.CreateDirectory(outside);
        Directory.CreateSymbolicLink(Path.Combine(workspace, "linked"), outside);
        try
        {
            Assert.False(WorkspaceSecurity.TryResolveDirectory(root, workspaceId, "linked", out _, out _));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Theory]
    [InlineData("feature/workspace-browser/readme.txt", true)]
    [InlineData("../outside.txt", false)]
    [InlineData(".git/config", false)]
    [InlineData("feature/missing.txt", false)]
    public void Workspace_file_resolution_only_returns_regular_files_inside_the_checkout(string path, bool valid)
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        var folder = Path.Combine(workspace, "feature", "workspace-browser");
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "readme.txt"), "safe text");
        try
        {
            var resolved = WorkspaceSecurity.TryResolveFile(root, workspaceId, path, out var filePath, out _);
            Assert.Equal(valid, resolved);
            if (valid) Assert.Equal(Path.Combine(folder, "readme.txt"), filePath);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void Workspace_file_resolution_rejects_symbolic_link_files()
    {
        if (OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "src"));
        var outside = Path.Combine(root, "outside.txt");
        File.WriteAllText(outside, "outside");
        File.CreateSymbolicLink(Path.Combine(workspace, "src", "outside.txt"), outside);
        try
        {
            Assert.False(WorkspaceSecurity.TryResolveFile(root, workspaceId, "src/outside.txt", out _, out _));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void Workspace_analysis_counts_source_files_and_skips_generated_and_git_directories()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "src"));
        Directory.CreateDirectory(Path.Combine(workspace, "node_modules", "pkg"));
        File.WriteAllText(Path.Combine(workspace, "AIERP.slnx"), "");
        File.WriteAllText(Path.Combine(workspace, "src", "Program.cs"), "class Program {}");
        File.WriteAllText(Path.Combine(workspace, "src", "App.tsx"), "export {};");
        File.WriteAllText(Path.Combine(workspace, ".git", "config"), "");
        File.WriteAllText(Path.Combine(workspace, "node_modules", "pkg", "index.js"), "");
        try
        {
            var analysis = WorkspaceSecurity.AnalyzeWorkspace(root, workspaceId);
            Assert.Equal(3, analysis.ScannedFiles);
            Assert.Contains("AIERP.slnx", analysis.EntryPoints);
            Assert.Contains(analysis.Technologies, item => item.Name == "C#" && item.FileCount == 1);
            Assert.Contains(analysis.Technologies, item => item.Name == "TypeScript" && item.FileCount == 1);
            Assert.DoesNotContain(analysis.EntryPoints, path => path.Contains("node_modules", StringComparison.OrdinalIgnoreCase));
            Assert.False(analysis.Truncated);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task Apply_file_content_replaces_only_when_the_original_hash_matches_and_preserves_bom()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "src"));
        var path = Path.Combine(workspace, "src", "Example.cs");
        var originalBytes = new byte[] { 0xEF, 0xBB, 0xBF }.Concat(Encoding.UTF8.GetBytes("class Old {}\n")).ToArray();
        await File.WriteAllBytesAsync(path, originalBytes);
        try
        {
            var expected = Convert.ToHexString(SHA256.HashData(originalBytes));
            var changeId = Guid.NewGuid();
            var applied = await WorkspaceSecurity.ApplyFileContentAsync(root, workspaceId, changeId, "src/Example.cs", expected,
                "class New {}\n", CancellationToken.None);

            Assert.True(applied.Applied);
            var current = await File.ReadAllBytesAsync(path);
            Assert.True(current.AsSpan().StartsWith(new byte[] { 0xEF, 0xBB, 0xBF }));
            Assert.Equal("class New {}\n", new UTF8Encoding(false, true).GetString(current).TrimStart('\uFEFF'));
            Assert.Equal(Convert.ToHexString(SHA256.HashData(current)), applied.Sha256);

            var history = await WorkspaceSecurity.GetChangesAsync(root, workspaceId, CancellationToken.None);
            var change = Assert.Single(history.Changes);
            Assert.Equal(changeId, change.Id);
            Assert.True(change.IsCurrent);
            var diff = await WorkspaceSecurity.GetChangeDiffAsync(root, workspaceId, changeId, CancellationToken.None);
            Assert.NotNull(diff);
            Assert.Contains("class Old", diff.OriginalContent);
            Assert.Contains("class New", diff.CurrentContent);

            var restored = await WorkspaceSecurity.RestoreChangeAsync(root, workspaceId, changeId, applied.Sha256!, CancellationToken.None);
            Assert.True(restored.Restored);
            Assert.Equal(expected, restored.Sha256);
            Assert.Equal(originalBytes, await File.ReadAllBytesAsync(path));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task Apply_file_content_rejects_stale_or_unsafe_targets_without_changing_the_checkout()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "src"));
        var path = Path.Combine(workspace, "src", "Example.cs");
        await File.WriteAllTextAsync(path, "class Current {}\n");
        try
        {
            var stale = await WorkspaceSecurity.ApplyFileContentAsync(root, workspaceId, Guid.NewGuid(), "src/Example.cs", new string('0', 64),
                "class Proposed {}\n", CancellationToken.None);
            var unsafePath = await WorkspaceSecurity.ApplyFileContentAsync(root, workspaceId, Guid.NewGuid(), "../outside.cs", new string('0', 64),
                "class Proposed {}\n", CancellationToken.None);

            Assert.False(stale.Applied);
            Assert.Equal("stale", stale.Error);
            Assert.False(unsafePath.Applied);
            Assert.Equal("invalid_path", unsafePath.Error);
            Assert.Equal("class Current {}\n", await File.ReadAllTextAsync(path));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task Change_history_restores_versions_in_reverse_order_and_refuses_stale_overwrites()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "src"));
        var path = Path.Combine(workspace, "src", "Example.cs");
        await File.WriteAllTextAsync(path, "class Base {}\n");
        try
        {
            var baseSha = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(path)));
            var firstId = Guid.NewGuid();
            var first = await WorkspaceSecurity.ApplyFileContentAsync(root, workspaceId, firstId, "src/Example.cs", baseSha,
                "class First {}\n", CancellationToken.None);
            var secondId = Guid.NewGuid();
            var second = await WorkspaceSecurity.ApplyFileContentAsync(root, workspaceId, secondId, "src/Example.cs", first.Sha256!,
                "class Second {}\n", CancellationToken.None);

            var history = await WorkspaceSecurity.GetChangesAsync(root, workspaceId, CancellationToken.None);
            Assert.Equal(2, history.Changes.Count);
            Assert.Contains(history.Changes, item => item.Id == secondId && item.IsCurrent);
            Assert.Contains(history.Changes, item => item.Id == firstId && !item.IsCurrent);

            var restoreSecond = await WorkspaceSecurity.RestoreChangeAsync(root, workspaceId, secondId, second.Sha256!, CancellationToken.None);
            Assert.True(restoreSecond.Restored);
            Assert.Equal("class First {}\n", await File.ReadAllTextAsync(path));
            var afterSecondRestore = await WorkspaceSecurity.GetChangesAsync(root, workspaceId, CancellationToken.None);
            Assert.Contains(afterSecondRestore.Changes, item => item.Id == firstId && item.IsCurrent);

            await File.WriteAllTextAsync(path, "class ManualEdit {}\n");
            var staleRestore = await WorkspaceSecurity.RestoreChangeAsync(root, workspaceId, firstId, first.Sha256!, CancellationToken.None);
            Assert.False(staleRestore.Restored);
            Assert.Equal("stale", staleRestore.Error);
            Assert.Equal("class ManualEdit {}\n", await File.ReadAllTextAsync(path));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task New_source_file_is_created_only_at_an_unused_safe_path_and_restore_removes_it()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(Path.Combine(workspace, ".git"));
        Directory.CreateDirectory(Path.Combine(workspace, "src"));
        var path = Path.Combine(workspace, "src", "Created.cs");
        try
        {
            Assert.True(WorkspaceSecurity.TryResolveNewFile(root, workspaceId, "src/Created.cs", out _, out _));
            var changeId = Guid.NewGuid();
            var created = await WorkspaceSecurity.CreateFileContentAsync(root, workspaceId, changeId, "src/Created.cs",
                "namespace Sample;\npublic sealed class Created {}\n", CancellationToken.None);
            Assert.True(created.Applied);
            Assert.True(File.Exists(path));

            var history = await WorkspaceSecurity.GetChangesAsync(root, workspaceId, CancellationToken.None);
            var change = Assert.Single(history.Changes);
            Assert.True(change.WasCreated);
            Assert.True(change.IsCurrent);
            var diff = await WorkspaceSecurity.GetChangeDiffAsync(root, workspaceId, changeId, CancellationToken.None);
            Assert.NotNull(diff);
            Assert.True(diff.WasCreated);
            Assert.Empty(diff.OriginalContent);
            Assert.Contains("class Created", diff.CurrentContent);

            var duplicate = await WorkspaceSecurity.CreateFileContentAsync(root, workspaceId, Guid.NewGuid(), "src/Created.cs",
                "public sealed class Overwrite {}", CancellationToken.None);
            Assert.False(duplicate.Applied);
            Assert.Equal("file_exists", duplicate.Error);
            Assert.Contains("class Created", await File.ReadAllTextAsync(path));

            var simultaneous = await Task.WhenAll(
                WorkspaceSecurity.CreateFileContentAsync(root, workspaceId, Guid.NewGuid(), "src/Concurrent.cs", "class First {}", CancellationToken.None),
                WorkspaceSecurity.CreateFileContentAsync(root, workspaceId, Guid.NewGuid(), "src/Concurrent.cs", "class Second {}", CancellationToken.None));
            Assert.Single(simultaneous, result => result.Applied);
            Assert.Single(simultaneous, result => result.Error == "file_exists");
            var concurrentContent = await File.ReadAllTextAsync(Path.Combine(workspace, "src", "Concurrent.cs"));
            Assert.Contains(concurrentContent, new[] { "class First {}", "class Second {}" });

            await File.WriteAllTextAsync(path, "class ManualEdit {}\n");
            var staleRestore = await WorkspaceSecurity.RestoreChangeAsync(root, workspaceId, changeId, created.Sha256!, CancellationToken.None);
            Assert.False(staleRestore.Restored);
            Assert.Equal("stale", staleRestore.Error);
            Assert.Equal("class ManualEdit {}\n", await File.ReadAllTextAsync(path));

            await File.WriteAllTextAsync(path, "namespace Sample;\npublic sealed class Created {}\n");

            var restored = await WorkspaceSecurity.RestoreChangeAsync(root, workspaceId, changeId, created.Sha256!, CancellationToken.None);
            Assert.True(restored.Restored);
            Assert.False(File.Exists(path));
            var restoredDiff = await WorkspaceSecurity.GetChangeDiffAsync(root, workspaceId, changeId, CancellationToken.None);
            Assert.NotNull(restoredDiff);
            Assert.True(restoredDiff.IsRestored);
            Assert.Empty(restoredDiff.CurrentContent);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Theory]
    [InlineData("src/Example.cs", true)]
    [InlineData("src/.env.cs", false)]
    [InlineData("secrets/Token.ts", false)]
    [InlineData("src/settings.json", false)]
    [InlineData("../outside.cs", false)]
    public void Writable_source_policy_is_limited_to_safe_source_file_paths(string path, bool expected) =>
        Assert.Equal(expected, WorkspaceSecurity.IsWritableSourcePath(path));

    [Fact]
    public void Runner_service_token_is_scoped_by_service_and_workspace_claims()
    {
        var workspaceId = Guid.NewGuid();
        var valid = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("sub", "AIERP.AIService"),
            new Claim("service", "AIERP.AIService"),
            new Claim("workspace_id", workspaceId.ToString("D"))
        ]));
        var wrongWorkspace = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("service", "AIERP.AIService"),
            new Claim("workspace_id", Guid.NewGuid().ToString("D"))
        ]));
        var wrongService = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("service", "OtherService"),
            new Claim("workspace_id", workspaceId.ToString("D"))
        ]));

        Assert.True(WorkspaceSecurity.IsWorkspaceScopedServiceCaller(valid, workspaceId));
        Assert.False(WorkspaceSecurity.IsWorkspaceScopedServiceCaller(wrongWorkspace, workspaceId));
        Assert.False(WorkspaceSecurity.IsWorkspaceScopedServiceCaller(wrongService, workspaceId));
    }
}
