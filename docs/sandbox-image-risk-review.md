# Workspace Sandbox Image Risk Review

Review date: 2026-10-20
Image reviewed: `docker-workspace-sandbox:latest` (`sha256:17a655fb993cf13e2d052a222571e0d5d4dff70a0a553afab4caa251727ab6e1`)
Scanner evidence: `docs/docker-scout-workspace-sandbox-20261020-running-status.json` and `docs/docker-scout-workspace-sandbox-20261020-running.sarif.json`

## Current runtime and scan (2026-10-20)

The running Compose container `docker-workspace-sandbox-1` and local tag `docker-workspace-sandbox:latest` both resolve to image ID `sha256:17a655fb993cf13e2d052a222571e0d5d4dff70a0a553afab4caa251727ab6e1`. This matches the final remediated candidate scan: Docker Scout indexed 1,159 packages and reported two setuptools SBOM records (one HIGH and one MEDIUM). Package-path review found that the image vendors `pkg_resources` only; the affected `PackageIndex` and sdist `FileList` implementations are absent. These are recorded as non-applicable SBOM findings, not as fixed or as a zero-finding scan. The freshly generated runtime status and SARIF evidence are `docs/docker-scout-workspace-sandbox-20261020-running-status.json` and `docs/docker-scout-workspace-sandbox-20261020-running.sarif.json`; the SARIF hash matches the prior candidate scan for the same digest.

Read-only inspection of the running image confirmed Binutils 2.47, libxml2 2.13.9-r3, libssh2 1.11.1-r4, GNU patch 2.8, Go 1.26.9, Rust 1.96.1, Node.js 24.18.1, and Python 3.14.8. The corresponding network-disabled package-cache matrix passed 4/4 ecosystems. The sandbox container remained running during this inspection; no application data volume was changed.

## Superseded digest scans (2026-10-19 to 2026-10-20)

The rebuilt image resolves to `sha256:5168358c91320d7d484a7c955d6f3941f603d4c70239c2569fe1eec2f6540580` (3,715,659,310 bytes). Docker Scout v1.26.0 indexed 1,143 packages and found 27 records: 4 HIGH, 16 MEDIUM, 5 LOW, and 2 unspecified. The updated digest has four HIGH findings across two packages; the two prior `libssh2` HIGH findings are absent.

A fresh package-policy check in a disposable container refreshed the Alpine v3.24 indexes and found no newer `binutils` or `libxml2` candidates than the installed `2.45.1-r1` and `2.13.9-r2`; Alpine edge package pages currently list those same versions as well ([binutils](https://pkgs.alpinelinux.org/package/edge/main/x86_64/binutils), [libxml2](https://pkgs.alpinelinux.org/package/edge/main/x86_64/libxml2)). Docker Scout likewise reports no fixed version for the four remaining HIGH records.

### Upstream-fix follow-up

Upstream fixes are now available even though Alpine has not packaged them: GNU Binutils 2.47 and libxml2 2.15.4. In a disposable, volume-free container, both official source archives were downloaded and their published SHA-256 checksums verified; Binutils 2.47 and libxml2 2.15.4 then compiled and installed under `/usr/local`. This was a compatibility experiment only; it did not alter the image or running Compose service.

The experiment also showed why simply adding those builds to `PATH` is insufficient. In the current sandbox, `gcc -print-prog-name=ld` resolves to `/usr/x86_64-alpine-linux-musl/bin/ld` and the executed `/usr/bin/ld`/`readelf` remain Binutils 2.45.1. Separately, libxml2 2.15.4 has SONAME `libxml2.so.16`, while installed `llvm22-libs` requires `so:libxml2.so.2`; replacing the Alpine library without a compatibility plan would break the Rust/LLVM toolchain. The next remediation must install a package-managed Binutils toolchain selected by GCC and a patched, ABI-compatible libxml2 library (or rebuild/replace its dependent LLVM package), then pass the four-ecosystem sandbox matrix and a fresh digest scan. Do not count an overlaid `/usr/local` build as remediation.

### Binutils linker-selection experiment (2026-10-20)

An isolated, disposable container downloaded GNU Binutils 2.47 from the GNU FTP release mirror and verified the release-published SHA-256 (`154ab23b60070e8f27013c22977f1129425d67d1e8acd6e13010e617811e4cff`). The source compiled for `x86_64-alpine-linux-musl`; the installed target-prefixed linker and `readelf` both reported GNU Binutils 2.47. A separate disposable probe confirmed GCC invokes an `ld` found through `COMPILER_PATH` as well as through `-B`; an earlier real-toolchain link used `-B/opt/binutils-2.47/x86_64-alpine-linux-musl/bin` and reported GNU ld 2.47. This establishes a viable GCC linker-selection mechanism, but not a package upgrade or CVE remediation. The disposable containers were removed; the running image, Compose containers, and volumes were unchanged. Replacing the vulnerable APK ownership, keeping GCC's `binutils` dependency satisfied, the `readelf` functionality checks, the four-ecosystem matrix, and a fresh vulnerability scan remain required before claiming remediation.

`libssh2` now updates selectively from Alpine edge (`1.11.1-r3` to `1.11.1-r4`), while Cargo remains installed and executable. Alpine's `r4` packaging commit includes patches for CVE-2025-15661 and CVE-2026-66032. A disposable network-enabled container reproduced the upgrade and verified Cargo's version and dynamic `libssh2.so.1` linkage. A separate read-only, network-disabled run of the rebuilt image verified the installed `r4` package and the .NET, Go, Rust/Cargo, Node/npm, and Python toolchains.

The earlier `docs/docker-scout-workspace-sandbox-20261019.sarif.json` covers the pre-update digest (`sha256:9341675d7ea5291ec8b552d55767075bd2b26b79d3ec51c960a2d7f6b383c4a3`). The new JSON report above is the authoritative summary for the rebuilt digest.

## Findings on the superseded digest

Docker Scout reports four remaining HIGH findings and no fixed Alpine version for the installed `binutils` and `libxml2` packages:

| Package | Installed version | CVE | Notes |
|---|---:|---|---|
| `binutils` | `2.45.1-r1` | CVE-2025-69649 | Malformed ELF input can crash `readelf`. |
| `binutils` | `2.45.1-r1` | CVE-2025-69650 | Malformed ELF relocation input can terminate `readelf`. |
| `binutils` | `2.45.1-r1` | CVE-2026-6846 | Crafted XCOFF input can trigger a heap buffer overflow in the linker. |
| `libxml2` | `2.13.9-r2` | CVE-2026-86140 | `xmlSnprintfElements` has a stack buffer overflow. |

The earlier six-HIGH review listed CVE-2025-15661 and CVE-2026-66032 for `libssh2` `1.11.1-r3`. Both were removed from the current digest scan after updating to `1.11.1-r4`.

## Exposure and existing controls

The sandbox runs without network access, with a read-only root filesystem, a temporary filesystem for job extraction, a read-only operator package cache, a PID limit of 256, 2 GiB memory and 2 CPU limits, `no-new-privileges`, and a reduced capability set (`DAC_OVERRIDE`, `KILL`, `SETPCAP`, `SETUID`, `SETGID`). Before invoking repository-controlled build/test tools, the worker starts them with UID/GID 65532, clears supplementary groups and bounding/inheritable/ambient capabilities, and places them in a process group for timeout termination. The worker itself still runs as root to preserve this process-identity boundary. `CHOWN` was removed after source inspection found no corresponding use in the worker. A trial removal of `DAC_OVERRIDE` caused the root worker to fail cleanup of a Node.js-created file owned by UID 65532; it remains enabled. The four-ecosystem acceptance is recorded in `docs/workspace-sandbox-package-cache-smoke.json`. The shared job volume is initialized for Workspace Runner's UID/GID 1654 by a short-lived Compose initializer with only `CHOWN` and `FOWNER` capabilities.

Archive extraction, project inspection, and job coordination run as root inside the constrained container, while test code runs with the separate unprivileged UID 65532. This remains an explicit residual risk; network isolation, read-only mounts, the read-only root filesystem, and the reduced capability set limit its scope. These boundaries do not remove the vulnerable packages or establish that exploitation is impossible.

## Disposition

The `binutils` and `libxml2` findings in the table apply to the superseded `sha256:5168358c91320d7d484a7c955d6f3941f603d4c70239c2569fe1eec2f6540580` image. The running Compose service now uses the remediated `sha256:17a655fb993cf13e2d052a222571e0d5d4dff70a0a553afab4caa251727ab6e1` candidate, where the final scan contains only the two explicitly triaged setuptools SBOM records. Do not report that scan as zero findings. The offline four-ecosystem acceptance and runtime package inspection passed; continue to retain the residual root worker and SBOM dispositions for review. The existing matrix evidence is `docs/workspace-sandbox-remediated-offline-matrix-20261020.json`.

## References

- [Ubuntu CVE-2025-69649](https://ubuntu.com/security/CVE-2025-69649)
- [Ubuntu CVE-2025-69650](https://ubuntu.com/security/CVE-2025-69650)
- [Ubuntu CVE-2026-6846](https://ubuntu.com/security/CVE-2026-6846)
- [Ubuntu CVE-2026-86140](https://ubuntu.com/security/CVE-2026-86140)
- [Ubuntu CVE-2025-15661](https://ubuntu.com/security/CVE-2025-15661)
- [Ubuntu USN-8722-1, libssh2 vulnerabilities](https://ubuntu.com/security/notices/USN-8722-1)
- [Alpine aports `libssh2` r4 security-patch commit](https://gitlab.alpinelinux.org/alpine/aports/-/commit/315a222d1f21561dc0bcb3451a6fc94ae1dbb191)
- [GNU Binutils 2.47 release](https://sourceware.org/pipermail/binutils/2026-July/150520.html)
- [libxml2 2.15.4 release archive and published checksum](https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.4.sha256sum)
- [libxml2 CVE-2026-86140 upstream fix](https://gitlab.gnome.org/GNOME/libxml2/-/commit/d1686f91dbda141a752200419d35639fd6b38340)

## Final remediated candidate and local rollout (2026-10-20)

The final candidate `nexora-workspace-sandbox-remediated:local` has image ID `sha256:17a655fb993cf13e2d052a222571e0d5d4dff70a0a553afab4caa251727ab6e1` (3,766,276,901 bytes). Docker Scout v1.26.0 indexed 1,159 packages. Its two remaining records both refer to setuptools 70.3.0 in pip's vendored SBOM: HIGH CVE-2025-47273 and MEDIUM CVE-2026-59890. The image vendors only pip's `pkg_resources` subset; `setuptools/package_index.py` (`PackageIndex`) and the setuptools sdist `FileList` implementation are absent from the image. These two records are therefore assessed as not applicable to the shipped code, not as scanner-clean or fixed package findings. This exact image ID is running locally as `docker-workspace-sandbox:latest`. The package-path checks and full SARIF are recorded in `docs/docker-scout-workspace-sandbox-20261020-remediated-final-status.json` and `docs/docker-scout-workspace-sandbox-20261020-remediated-final.sarif.json`.

The network-disabled, read-only four-ecosystem package-cache matrix passed Node.js, Go, Rust, and .NET (4/4); exact evidence is `docs/workspace-sandbox-remediated-offline-matrix-20261020.json`. The .NET case emitted NU1603 because only compatible newer test SDK/runner packages were present in the offline cache. The running local Compose `workspace-sandbox` was promoted to the candidate digest and started successfully. It retains `network=none`, a read-only root, the existing read-only runtime package-cache bind, and the existing `docker_aierp-test-jobs` volume. There were no queued jobs at rollout. The prior image is retained as `docker-workspace-sandbox:rollback-20261020`. No SQL or other application data volume was changed.

The Sandbox package-remediation gate has a documented non-applicable SBOM disposition for the two residual setuptools entries. The Scout result still contains those records; do not describe it as zero findings.
