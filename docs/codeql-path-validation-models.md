# CodeQL models for validated path resolvers

The custom model pack at `.github/codeql/extensions/nexora-path-validation-models` teaches C# CodeQL that selected path values are safe only after strict formatting or the repository's validated path-resolution methods have accepted them. It models no query exclusions and does not dismiss repository alerts.

The model scope is intentionally limited to:

- `Guid.ToString` output, whose standard format output cannot contain a path separator or traversal segment.
- `ReleaseDeployerPath.SafeChild`, which rejects rooted/empty/dot segments, canonicalizes the result, enforces root containment, and checks existing reparse points.
- `ModulePackageStoragePath.ResolveChild` and `ResolvePackage`, which validate archive digest or relative path, enforce canonical root containment, and check reparse points.
- `WorkspaceSecurity.TryResolveStorageChild`, `TryResolveDirectory`, `TryResolveFile`, and `TryResolveNewFile`, whose successful `true` result is returned only after containment, syntax, existence, and reparse-point checks appropriate to each operation.

The matching security tests are in `WorkspaceExplorerSecurityTests`, `ReleaseDeployerOrchestrationAcceptanceTests`, and `PluginHostTests`. Keep those tests aligned with the resolver contracts. If a resolver stops enforcing its documented checks, remove or narrow its CodeQL model before changing the implementation. The GitHub CodeQL workflow remains on the standard security query suite; the pack only models these proven sanitizers.

CodeQL data-extension model packs are a public-preview mechanism and may change. This repository-level pack must be checked in the hosted C# analysis logs after changes to the action/query-pack version. Its presence is not evidence that every path alert is resolved; the PR SARIF and gate results remain authoritative.
