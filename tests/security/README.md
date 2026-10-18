# Platform API security smoke

Run against a healthy local Compose API:

```powershell
$env:AIERP_SECURITY_TEST_EMAIL = '<local tenant user>'
$env:AIERP_SECURITY_TEST_PASSWORD = '<local password>'
try {
  .\tests\security\Invoke-PlatformSecuritySmoke.ps1
} finally {
  Remove-Item Env:\AIERP_SECURITY_TEST_EMAIL, Env:\AIERP_SECURITY_TEST_PASSWORD -ErrorAction SilentlyContinue
}
```

The smoke verifies API health, anonymous denial for tenant dashboard and integration execution, successful tenant-session selection, validation of an authenticated invalid report query, and that the resulting error neither echoes the bearer token nor includes an `Authorization` response header. It stores only status codes and pass/fail assertions. It is a local regression smoke, not a substitute for SAST, dependency scanning, penetration testing, or a production security assessment.

Run the repeatable .NET source-analysis build with `./tests/security/Invoke-DotnetStaticAnalysis.ps1`. It enables the .NET SDK's `latest-all` built-in analyzers for all C# projects in `AIERP.slnx` without restoring packages and writes counts/rule IDs (no source snippets) to `docs/dotnet-static-analysis.json`. This does not scan TypeScript/JavaScript, Dockerfiles, or infrastructure configuration and is not a dedicated cross-language SAST, dynamic scan, or penetration test.

Run the dependency advisory scan separately with `./tests/security/Invoke-DependencyAudit.ps1`. It checks all NuGet packages in `AIERP.slnx`, including transitive references, and runs `npm audit` for both frontends. Results contain counts and scan scope only. This still does not scan container images or source code for broader vulnerability classes.

Run `./tests/security/Test-ReleaseDeployerComposeVersion.ps1` for a Docker-free regression check that the ReleaseDeployer pins Docker Compose to a full commit SHA and keeps its source tag at or above v5.1.0, the first fixed version for CVE-2025-15558 (GO-2026-4610). The Oct 17, 2026 image scan still reports this finding against the then-built image; this source check does not rescan or certify any existing image. Rebuild and rescan the ReleaseDeployer image before treating the image finding as cleared.
