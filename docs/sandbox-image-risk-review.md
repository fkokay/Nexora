# Workspace Sandbox Image Risk Review

Review date: 2026-10-19  
Image reviewed: `docker-workspace-sandbox:latest` (`sha256:9341675d7ea5291ec8b552d55767075bd2b26b79d3ec51c960a2d7f6b383c4a3`)  
Scanner evidence: `docs/docker-scout-workspace-sandbox-20261019.sarif.json`

## Current digest scan (2026-10-19)

The running `docker-workspace-sandbox:latest` resolves to `sha256:9341675d7ea5291ec8b552d55767075bd2b26b79d3ec51c960a2d7f6b383c4a3` (3,703,190,906 bytes; 19 layers). Docker Scout v1.26.0 indexed 1,158 packages and wrote the full report to `docs/docker-scout-workspace-sandbox-20261019.sarif.json`. It found 34 vulnerability records, including the same six HIGH findings listed below. For each of those six, the current report says `Fixed version: not fixed`.

Scout identifies Alpine 3.24.2 as up to date and provides no base-tag recommendation. The installed-package reverse dependency graph confirms `binutils` is required by GCC/build-base, `libxml2` by LLVM 22, and `libssh2` by Cargo. No package was removed or image rebuilt during this scan.

The earlier `docs/docker-scout-workspace-sandbox-current.sarif.json` covers the previous digest; the 2026-10-19 report above is the authoritative scan for the current digest.

## Findings

Docker Scout reports six HIGH findings in three Alpine packages. It reports no fixed version for the installed versions:

| Package | Installed version | CVE | Notes |
|---|---:|---|---|
| `binutils` | `2.45.1-r1` | CVE-2025-69649 | Malformed ELF input can crash `readelf`. |
| `binutils` | `2.45.1-r1` | CVE-2025-69650 | Malformed ELF relocation input can terminate `readelf`. |
| `binutils` | `2.45.1-r1` | CVE-2026-6846 | Crafted XCOFF input can trigger a heap buffer overflow in the linker. |
| `libxml2` | `2.13.9-r2` | CVE-2026-86140 | `xmlSnprintfElements` has a stack buffer overflow. |
| `libssh2` | `1.11.1-r3` | CVE-2025-15661 | Malformed SFTP link responses can cause a heap over-read. |
| `libssh2` | `1.11.1-r3` | CVE-2026-66032 | Malformed SFTP responses can cause a double free. |

## Exposure and existing controls

The sandbox runs without network access, with a read-only root filesystem, a temporary filesystem for job extraction, a read-only operator package cache, a PID limit of 256, 2 GiB memory and 2 CPU limits, `no-new-privileges`, and a reduced capability set (`DAC_OVERRIDE`, `KILL`, `SETPCAP`, `SETUID`, `SETGID`). Before invoking repository-controlled build/test tools, the worker starts them with UID/GID 65532, clears supplementary groups and bounding/inheritable/ambient capabilities, and places them in a process group for timeout termination. The worker itself still runs as root to preserve this process-identity boundary. `CHOWN` was removed after source inspection found no corresponding use in the worker. A trial removal of `DAC_OVERRIDE` caused the root worker to fail cleanup of a Node.js-created file owned by UID 65532; it remains enabled. The four-ecosystem acceptance is recorded in `docs/workspace-sandbox-package-cache-smoke.json`. The shared job volume is initialized for Workspace Runner's UID/GID 1654 by a short-lived Compose initializer with only `CHOWN` and `FOWNER` capabilities.

Archive extraction, project inspection, and job coordination run as root inside the constrained container, while test code runs with the separate unprivileged UID 65532. This remains an explicit residual risk; network isolation, read-only mounts, the read-only root filesystem, and the reduced capability set limit its scope. These boundaries do not remove the vulnerable packages or establish that exploitation is impossible.

## Disposition

No vulnerable compiler, linker, XML or SSH packages were removed because the current sandbox depends on the native toolchain and the source package checks found no fixed Alpine versions. This is a documented residual risk, not a risk acceptance. Keep the Phase 9 gate open until the packages are fixed/replaced and the image is rescanned, or the accountable platform owner explicitly accepts the residual risk.

## References

- [Ubuntu CVE-2025-69649](https://ubuntu.com/security/CVE-2025-69649)
- [Ubuntu CVE-2025-69650](https://ubuntu.com/security/CVE-2025-69650)
- [Ubuntu CVE-2026-6846](https://ubuntu.com/security/CVE-2026-6846)
- [Ubuntu CVE-2026-86140](https://ubuntu.com/security/CVE-2026-86140)
- [Ubuntu CVE-2025-15661](https://ubuntu.com/security/CVE-2025-15661)
- [Ubuntu USN-8722-1, libssh2 vulnerabilities](https://ubuntu.com/security/notices/USN-8722-1)
