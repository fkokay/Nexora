using System.Security.Cryptography;
using System.Text;

namespace AIERP.Platform.UnitTests;

public sealed class WorkspaceApprovedCommitTests
{
    [Fact]
    public async Task Commit_includes_only_the_current_approved_file_and_leaves_workspace_clean()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(workspace);
        try
        {
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["init", workspace], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "config", "user.name", "AIERP Test"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "config", "user.email", "aierp-test@example.invalid"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            var sourcePath = Path.Combine(workspace, "Sample.cs");
            const string original = "class Sample { }\n";
            const string updated = "class Sample { public int Value => 1; }\n";
            await File.WriteAllTextAsync(sourcePath, original);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "add", "--", "Sample.cs"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "commit", "-m", "base"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            var branch = await WorkspaceSecurity.EnsureWorkspaceBranchAsync(root, workspaceId, CancellationToken.None);
            Assert.NotNull(branch.CommitSha);
            var changeId = Guid.NewGuid();
            var sourceHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(original)));
            var applied = await WorkspaceSecurity.ApplyFileContentAsync(root, workspaceId, changeId, "Sample.cs", sourceHash, updated, CancellationToken.None);
            Assert.True(applied.Applied);

            var result = await WorkspaceSecurity.CommitApprovedChangesAsync(root, workspaceId, branch.CommitSha,
                "Apply approved Sample.cs update", [new WorkspaceApprovedCommitFile(changeId, "Sample.cs", applied.Sha256)], CancellationToken.None);

            Assert.Null(result.Error);
            Assert.NotEqual(branch.CommitSha, result.CommitSha);
            Assert.Equal(["Sample.cs"], result.Files);
            var status = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(root, workspaceId, CancellationToken.None);
            Assert.NotNull(status);
            Assert.Equal(result.CommitSha, status.HeadCommitSha);
            Assert.Equal(0, status.TotalChangedFiles);
            var committed = await WorkspaceSecurity.RunGit(root, ["-C", workspace, "show", "HEAD:Sample.cs"], TimeSpan.FromSeconds(10), CancellationToken.None);
            Assert.Equal(updated, committed.Output);
        }
        finally
        {
            foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal);
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Commit_rejects_a_workspace_file_without_an_approved_change_record()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-workspaces-{Guid.NewGuid():N}");
        var workspaceId = Guid.NewGuid();
        var workspace = Path.Combine(root, workspaceId.ToString("N"));
        Directory.CreateDirectory(workspace);
        try
        {
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["init", workspace], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "config", "user.name", "AIERP Test"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "config", "user.email", "aierp-test@example.invalid"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            var baseline = Path.Combine(workspace, "Sample.cs");
            await File.WriteAllTextAsync(baseline, "class Sample { }\n");
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "add", "--", "Sample.cs"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            Assert.Equal(0, (await WorkspaceSecurity.RunGit(root, ["-C", workspace, "commit", "-m", "base"], TimeSpan.FromSeconds(10), CancellationToken.None)).ExitCode);
            var branch = await WorkspaceSecurity.EnsureWorkspaceBranchAsync(root, workspaceId, CancellationToken.None);
            await File.WriteAllTextAsync(Path.Combine(workspace, "Unexpected.cs"), "class Unexpected { }\n");

            var result = await WorkspaceSecurity.CommitApprovedChangesAsync(root, workspaceId, branch.CommitSha,
                "Commit only approved files", [new WorkspaceApprovedCommitFile(Guid.NewGuid(), "Sample.cs", new string('A', 64))], CancellationToken.None);

            Assert.Equal("unapproved_changes", result.Error);
            var status = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(root, workspaceId, CancellationToken.None);
            Assert.NotNull(status);
            Assert.Equal(branch.CommitSha, status.HeadCommitSha);
        }
        finally
        {
            foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal);
            Directory.Delete(root, recursive: true);
        }
    }
}
