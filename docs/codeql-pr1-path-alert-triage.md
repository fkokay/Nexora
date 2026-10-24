# PR #1 CodeQL path-alert triage

Reviewed: 2026-10-19
Repository: `fkokay/Nexora`
CodeQL workflow run: [39231391715](https://github.com/fkokay/Nexora/actions/runs/39231391715)
Analyzed pull-request merge commit: `e281acb4f0fb56021c817f28cfeb478470e45057`

## Decision

The CodeQL analysis succeeded, but GitHub Advanced Security's pull-request check reported 12 new `cs/path-injection` alerts (alert IDs 196–207). Source review found the flagged filesystem operations are bounded by existing validation and containment checks. These are false positives caused by CodeQL not recognizing the project-specific path guards; they are not accepted vulnerabilities or blanket suppressions. The individual PR-only alerts were reviewed against the source flows and regression tests before dismissal.

The analysis does not close the separate alerts already open against `master`. Those still require their own source-by-source triage.

## Source-flow evidence

| Alert IDs | Flagged sink | Source and validation evidence |
|---|---|---|
| 196–204 | ReleaseDeployer path checks, directory/file creation, temporary extraction, backup existence checks | Deployment request IDs are strongly typed GUIDs and validated before use; Compose database names are restricted to fixed AIERP names or the Tenant GUID pattern. Backup and release paths are constructed beneath configured roots. `ReleaseDeployerPath.SafeChild` rejects rooted paths, separators that escape the root, `.`/`..`, colon/device aliases, verifies the canonical child prefix, and rejects existing reparse points. Archive entries must match the hash-verified package's manifest; paths are normalized, duplicate/unexpected entries are rejected, and each file's length and SHA-256 are checked before the same-directory temporary file is atomically moved into place. |
| 197–198 | `File.GetAttributes` in `ReleaseDeployerPath.AssertNoReparsePoints` and `Directory.CreateDirectory` during restore | The request-derived paths reaching the helper are generated from validated IDs, or are canonical children returned by `SafeChild`. The attribute lookup only checks path ancestors for reparse points; it does not read file contents or write outside the validated root. |
| 205, 207 | Module-package path inspection and creation | The package checksum must be a 64-character hexadecimal SHA-256. Package storage roots come from service configuration. `ModulePackageStoragePath.ResolveChild` rejects rooted/traversal paths, checks canonical containment under the root and rejects existing reparse points. The API verifies package bytes, manifest and publisher signature before storage. |
| 206 | WorkspaceRunner `File.GetAttributes` during reparse-point inspection | Workspace/job identifiers are GUIDs. Caller-selected relative paths reject rooted paths, backslashes, colons, control characters, excessive lengths and sensitive files. Storage child names reject separators, colons, `.` and `..`; resolved paths must remain beneath the canonical workspace root and may not contain reparse points. |

## Regression coverage

- `ReleaseDeployerOrchestrationAcceptanceTests` covers traversal rejection, symlink/reparse ancestors, Windows device-name aliases, and safe child resolution.
- `WorkspaceExplorerSecurityTests` covers workspace child traversal and reparse-point rejection.
- `PluginHostTests.ModulePackageStoragePath_RejectsTraversalAndReparsePointAncestors` covers module-store traversal and reparse-point rejection.
- The analyzed PR's .NET CI passed 64 integration and 425 unit tests. Both frontend CI builds and both hosted CodeQL language analyses passed.

## Scope limits

This decision applies only to the 12 alerts for the PR analysis above. It does not dismiss or resolve the 195 alerts against the existing `master` analysis, the four HIGH WorkspaceSandbox package findings, or any future result whose source flow differs. Re-run hosted CodeQL after the PR source changes and verify the PR check result.
