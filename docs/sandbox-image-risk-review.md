# Workspace Sandbox Image Risk Review

Review date: 2026-10-19  
Image reviewed: `docker-workspace-sandbox:latest` (`sha256:5168358c91320d7d484a7c955d6f3941f603d4c70239c2569fe1eec2f6540580`)
Scanner evidence: `docs/container-image-scan-20261019-sandbox-libssh2-r4.json`

## Current digest scan (2026-10-19)

The rebuilt image resolves to `sha256:5168358c91320d7d484a7c955d6f3941f603d4c70239c2569fe1eec2f6540580` (3,715,659,310 bytes). Docker Scout v1.26.0 indexed 1,143 packages and found 27 records: 4 HIGH, 16 MEDIUM, 5 LOW, and 2 unspecified. The updated digest has four HIGH findings across two packages; the two prior `libssh2` HIGH findings are absent.

A fresh package-policy check in a disposable container refreshed the Alpine v3.24 indexes and found no newer `binutils` or `libxml2` candidates than the installed `2.45.1-r1` and `2.13.9-r2`; Alpine edge package pages currently list those same versions as well ([binutils](https://pkgs.alpinelinux.org/package/edge/main/x86_64/binutils), [libxml2](https://pkgs.alpinelinux.org/package/edge/main/x86_64/libxml2)). Docker Scout likewise reports no fixed version for the four remaining HIGH records.

### Upstream-fix follow-up

Upstream fixes are now available even though Alpine has not packaged them: GNU Binutils 2.47 and libxml2 2.15.4. In a disposable, volume-free container, both official source archives were downloaded and their published SHA-256 checksums verified; Binutils 2.47 and libxml2 2.15.4 then compiled and installed under `/usr/local`. This was a compatibility experiment only; it did not alter the image or running Compose service.

The experiment also showed why simply adding those builds to `PATH` is insufficient. In the current sandbox, `gcc -print-prog-name=ld` resolves to `/usr/x86_64-alpine-linux-musl/bin/ld` and the executed `/usr/bin/ld`/`readelf` remain Binutils 2.45.1. Separately, libxml2 2.15.4 has SONAME `libxml2.so.16`, while installed `llvm22-libs` requires `so:libxml2.so.2`; replacing the Alpine library without a compatibility plan would break the Rust/LLVM toolchain. The next remediation must install a package-managed Binutils toolchain selected by GCC and a patched, ABI-compatible libxml2 library (or rebuild/replace its dependent LLVM package), then pass the four-ecosystem sandbox matrix and a fresh digest scan. Do not count an overlaid `/usr/local` build as remediation.

`libssh2` now updates selectively from Alpine edge (`1.11.1-r3` to `1.11.1-r4`), while Cargo remains installed and executable. Alpine's `r4` packaging commit includes patches for CVE-2025-15661 and CVE-2026-66032. A disposable network-enabled container reproduced the upgrade and verified Cargo's version and dynamic `libssh2.so.1` linkage. A separate read-only, network-disabled run of the rebuilt image verified the installed `r4` package and the .NET, Go, Rust/Cargo, Node/npm, and Python toolchains.

The earlier `docs/docker-scout-workspace-sandbox-20261019.sarif.json` covers the pre-update digest (`sha256:9341675d7ea5291ec8b552d55767075bd2b26b79d3ec51c960a2d7f6b383c4a3`). The new JSON report above is the authoritative summary for the rebuilt digest.

## Findings

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

The two `libssh2` findings are remediated on the rebuilt image. Four HIGH findings remain in `binutils` and `libxml2`, which are required by the compiler/linker toolchain. Alpine v3.24/edge still has no fixed package versions, but upstream fixed releases exist; package installation and ABI compatibility are the outstanding work. Keep the Phase 9 security gate open until the actual tools and runtime libraries are replaced compatibly, the offline four-ecosystem acceptance passes, and a fresh scan confirms the findings are gone. This is not a risk acceptance. Local Compose remains on the previously verified digest; the compatibility experiment did not change it. The existing matrix evidence is `docs/workspace-sandbox-package-cache-smoke-20261019-libssh2-r4.json`.

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
