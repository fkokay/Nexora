# CodeQL gate review (2026-10-19)

## Result

There is no CodeQL gate configured on the remote `fkokay/Nexora` repository at the reviewed `master` revision. The working tree contains `.github/workflows/codeql.yml`, but Git reports it as untracked, so GitHub does not have this workflow and it cannot be dispatched remotely from the current repository state.

## Evidence

- Remote repository: `fkokay/Nexora`, public, default branch `master`.
- Remote `master` commit: `24a4a436ae8d2bca6dcbdb883ed1832853ff9b58` (`edit`); this matches local `HEAD` and `origin/master`.
- GitHub REST `GET /repos/fkokay/Nexora/actions/workflows`: `total_count: 0`, `workflows: []`.
- GitHub REST `GET /repos/fkokay/Nexora/actions/runs?per_page=10`: `total_count: 0`, `workflow_runs: []`.
- GitHub REST `GET /repos/fkokay/Nexora/contents/.github/workflows`: HTTP 404 (`Not Found`).
- GitHub REST `GET /repos/fkokay/Nexora/code-scanning/alerts?per_page=100`: HTTP 401 (`Requires authentication`). No alert count or alert content could be verified.
- GitHub REST `GET /repos/fkokay/Nexora/branches/master/protection`: HTTP 401 (`Requires authentication`). Required status checks and branch protection could not be verified.
- At the time of the initial review, neither `gh` nor `codeql` was installed in the available shell. The CodeQL CLI has since been installed locally (details below); `gh` and authenticated GitHub access remain unavailable. No GitHub connector is available in this task. The workflow dispatch API also requires an existing remote workflow and authenticated access.
- Existing `docs/dotnet-static-analysis.json` records a successful built-in .NET analyzer run on 2026-10-17. It is limited to C#/.NET SDK analyzers and explicitly does not represent CodeQL, cross-language SAST, dependency scanning, dynamic analysis, or penetration testing.

## Local workflow review

The untracked `.github/workflows/codeql.yml` proposes CodeQL analysis for C# (`autobuild`) and JavaScript/TypeScript (`none`) on pushes, pull requests to `master`, a weekly schedule, and manual dispatch. It uses read-only contents permission plus security-events write permission, and pins the Actions by commit SHA. This is a candidate local configuration only; no remote run or uploaded SARIF exists from this review.

Even after this workflow is added to the remote repository, a workflow run alone does not establish that its checks block merges. The repository's required status checks could not be inspected without authenticated access. Confirm that the `Analyze (csharp)` and `Analyze (javascript-typescript)` checks are required for `master` before describing CodeQL as an enforced merge gate.


## CodeQL CLI installation update (2026-10-19)

- Installed the official Windows CodeQL bundle `v2.27.2` to `%LOCALAPPDATA%\Programs\CodeQL\2.27.2\codeql`.
- Verified the downloaded archive against the release SHA-256 `c4834b337e2db85bdd4e7e97455319ff70d28f06abb2987eff9ec0f62d51dcea`.
- Added the versioned CLI directory to the user `PATH` and created a `codeql.cmd` shim in the existing user npm command directory so `codeql` resolves in this shell.
- Verified `codeql version` reports `2.27.2` and `codeql resolve languages` lists both `csharp` and `javascript`.
- This fixes local CLI discovery; it does not create a database, scan Nexora, or change the remote workflow. There is no root `LICENSE` file in this checkout. The CodeQL CLI distribution states that CLI analysis is for OSI-approved open-source codebases or academic research, and excludes automated/CI/CD use; a local Nexora database was therefore not created. See the [official CodeQL CLI binaries repository](https://github.com/github/codeql-cli-binaries).
## Blocker and next verification

Remote execution is blocked by two observed conditions: the remote repository currently has no Actions workflow to dispatch, and the available environment has no authenticated GitHub CLI/session for dispatching a workflow or reading code-scanning alerts and branch protection. No code was committed, pushed, or uploaded.

After an authorized maintainer publishes the workflow and provides an authenticated GitHub session, verify the latest run for both matrix languages, then read the repository's code-scanning alerts and required status checks. Until those checks are complete, this review cannot report remote CodeQL results or a merge-enforced gate.
