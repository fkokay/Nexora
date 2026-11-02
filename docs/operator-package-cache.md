# Operator package-cache manifest

Workspace Sandbox reads package caches from a single host directory. Docker Compose mounts `WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH` (default `deploy/docker/sandbox-package-cache-runtime`) at `/package-cache` as read-only. The manifest must live at the root of that directory:

```text
sandbox-package-cache-runtime/
├── package-cache-manifest.json
├── npm/
├── python-wheels/
├── go-mod/
├── cargo-home/
└── nuget/
```

The supported cache directories can be empty or absent. The manifest still lists all five cache names. It contains `schemaVersion: 1` and, for each cache, a sorted array of file paths relative to that cache directory with a lowercase SHA-256 digest:

```json
{
  "schemaVersion": 1,
  "caches": {
    "npm": [
      { "path": "_cacache/content-v2/sha512/example", "sha256": "<64 lowercase hexadecimal characters>" }
    ],
    "python-wheels": [],
    "go-mod": [],
    "cargo-home": [],
    "nuget": []
  }
}
```

## Generate after staging

Only a trusted operator should stage, review, and write these files. Do not allow application users, sandbox jobs, or untrusted build steps to modify the cache directory or manifest. The runtime bind mount is read-only, but that does not protect the host directory from other host processes.

After populating the cache directories, review their contents and generate the manifest from the repository root:

```powershell
pwsh -File deploy/docker/Generate-OperatorPackageCacheManifest.ps1 `
  -CacheRoot deploy/docker/sandbox-package-cache-runtime
```

The script writes only `package-cache-manifest.json` at the supplied cache root and prints that exact path. It sorts cache file paths ordinally, calculates SHA-256 digests, and rejects links, non-directory cache entries, or an existing manifest. It will not replace a manifest in place. To refresh a cache, create and review a new cache-root directory, then generate the manifest there before switching the operator's configured path; keep the prior reviewed directory available for rollback. Avoid deleting the prior directory until the updated cache has been accepted.

When Compose uses a custom cache location, pass that exact host directory to `-CacheRoot` and set `WORKSPACE_SANDBOX_PACKAGE_CACHE_PATH` to the same directory for Compose. The manifest must remain at that root as `package-cache-manifest.json`; the script rejects a different output path.

## Fail-closed behavior

Before copying a cache into an isolated job, the worker requires a valid root manifest, an exact match between the listed and actual files, safe relative paths, and matching SHA-256 digests. Missing or malformed manifests, linked entries, added or removed files, or changed file contents cause the cache copy to be rejected. The job reports dependency data as unavailable and does not use that cache for package installation or build. Regenerate and review the manifest after every cache addition, removal, or replacement.

The manifest is an integrity check against accidental or post-review file changes; it is not a digital signature. Its trust depends on controlling who can write both the manifest and the cache root. Do not treat it as proof of authenticity if an untrusted actor can replace both.
