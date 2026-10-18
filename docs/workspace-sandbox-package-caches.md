# Workspace Sandbox operator package caches

The isolated Workspace Sandbox has no network interface. Operators may stage packages for dependency-aware tests in `deploy/docker/sandbox-package-cache-runtime/`; Compose mounts that directory read-only at `/package-cache`. Each job copies only the cache it needs into its temporary workspace. Links are rejected, copied caches are capped at 512 MiB by default (configurable up to 1 GiB) and 50,000 filesystem entries, and the job copy is deleted after execution.

Supported cache directories:

- `npm/`: npm cache created from a project with `package-lock.json`. Sandbox test jobs use `npm ci --offline --ignore-scripts`, then run Node's built-in `node --test` runner.
- `python-wheels/`: flat wheelhouse for the root `requirements.txt`. The sandbox uses pip with `--no-index --only-binary=:all:` and installs into the disposable job workspace.
- `go-mod/`: Go module cache (`GOMODCACHE`) prefilled for the project's committed `go.mod` and `go.sum`. Build and test commands keep `GOPROXY=off`.
- `cargo-home/`: Cargo home with registry/index/source caches for the project's committed `Cargo.lock`. Build and test commands keep Cargo offline mode enabled.
- `nuget/`: operator-reviewed `.nupkg` files in a flat local feed. When staged, .NET restore reads new packages from this feed and resolves approved packages already in the image from `/opt/nuget-feed` as a fallback package folder, avoiding a full scan of the image cache. Without a staged feed, the image cache is used as the restore source. Other file types, credentials, and configuration files are rejected.

The sandbox never writes back to the operator cache, runs with `network_mode: none`, and returns `DependencyUnavailable` if the required lockfile or cached package is missing. The Node package lifecycle scripts are disabled during install. Python source distributions are not built; packages must be available as wheels. A missing cache is a supported configuration and leaves dependency-free sandbox jobs available.

Populate and review these directories on the host; the bind mount exposes staged files to new jobs without granting the sandbox write access. Do not put credentials, private registry configuration, or unrelated files in the cache directories.
