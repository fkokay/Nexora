# Default-branch CodeQL command-line alert triage

Reviewed: 2026-10-19
Repository: `fkokay/Nexora`
Alert: [#187 — Uncontrolled command line](https://github.com/fkokay/Nexora/security/code-scanning/187)
Analyzed commit: `6ba1909397c0f59c90cdb3851ad1fce32bea1b82`

## Decision

Alert #187 is a false positive for shell command injection. `WorkspaceSecurity.RunGit` starts the fixed executable `git` with `UseShellExecute = false` and adds each argument separately through `ProcessStartInfo.ArgumentList`; .NET escapes each item rather than concatenating user input into a shell command. The user-controlled values passed to Git are separately constrained by workspace GUIDs, validated branch names and relative-path checks; commit messages occupy the value position following the fixed `-m` option. Git's external protocol helper is disabled for network operations.

Microsoft documents that [`ArgumentList` escapes each supplied argument](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.argumentlist?view=net-10.0) and recommends it over constructing `Arguments`. Existing `WorkspaceExplorerSecurityTests` and `WorkspaceApprovedCommitTests` exercise workspace Git operations and path/branch boundaries.

Focused verification on 2026-10-19 passed both test classes: 33 passed, 0 failed, 0 skipped.

This triage applies only to alert #187 and the analyzed helper. It does not dismiss any path-injection, user-controlled-bypass, clickjacking, or future command-line finding.
