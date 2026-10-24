# Release Deployer path hardening — 2026-10-19

## Finding

Release Deployer already canonicalized child paths and rejected archive entries with rooted paths, traversal segments, duplicate names, unexpected files, symlink records, or invalid hashes. The canonical child check did not inspect pre-existing path components for filesystem reparse points. A pre-planted symlink/junction under a managed release directory could therefore redirect a later recursive delete or file creation if another principal could modify the deployer's storage volume.

## Change

- Added `ReleaseDeployerPath.SafeChild`, which rejects rooted and traversal paths, enforces canonical containment using the host OS path comparer, and checks all existing components from the filesystem root for reparse points.
- Routed archive extraction and production copy paths through the same resolver; copy operations also inspect source entries and destination roots.
- Added a regression for traversal plus symlinked root and descendant paths. On Windows without symlink privileges, the symlink portion is skipped; traversal remains asserted.

The deployer storage volumes must remain writable only by the deployer and trusted operators. Component checks reduce pre-existing-link attacks but cannot eliminate a time-of-check/time-of-use race against a concurrent process that can mutate those volumes.

## Verification

- Focused reparse/traversal test: 1 passed.
- `ReleaseDeployerOrchestrationAcceptanceTests`: 2 passed, including staging and production Compose failure/success paths with a fake Docker executable.
- Release build of `AIERP.ReleaseDeployer`: 0 warnings, 0 errors.
- Offline deployment bundle validation: all 5 check groups passed, including 168 exact Linux package checksums, IIS bundle checks, PowerShell/Bash syntax and configuration semantics.
- `git diff --check`: passed (Git emitted only configured LF-to-CRLF notices).

This change does not resolve the open CodeQL path alerts by itself. Remote alert triage, full CodeQL scan after publishing the change, and authenticated end-to-end GitHub App/release tests remain outstanding.
