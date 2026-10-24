# CodeQL master alert reassessment (2026-10-23)

## Scope and remote snapshot

The GitHub code-scanning API was queried read-only for open alerts on `refs/heads/master`. Only alert IDs, rule/location, and the most-recent instance commit were selected. It returned 192 open alerts; every returned alert was last analyzed at `6ba1909397c0f59c90cdb3851ad1fce32bea1b82`.

| Alert IDs | Reported rule and locations | Current local assessment |
| --- | --- | --- |
| #1–#186 | `cs/path-injection`; source locations in ReleaseDeployer, WorkspaceRunner, Platform API and PluginHost | The current src-only C# CodeQL snapshot analyzed 525/525 C# source files with the full 59-query suite and reported no `cs/path-injection` result. Current path resolution uses the reviewed root-confinement/reparse-point guards described in the ReleaseDeployer and WorkspaceRunner audits in `codeql-gate-review-20261019.md`. This is local remediation evidence, not a per-alert remote dismissal or proof about the old scanned binaries. |
| #188–#191 | `cs/web/missing-x-frame-options`; four checked-in IIS/Linux verification bundle `web.config` files from `local-20261018-refresh` | Confirmed on those historical package snapshots: their service `web.config` files omit `X-Frame-Options`, and the analyzed source revision predates the shared response-header middleware. They are not false positives. The snapshots are immutable and remain **NO-GO for any deployment**; do not patch them in place because that would invalidate recorded bundle/archive checksums. Accepted remediation is to rebuild packages only after release provenance is approved, using the current source builders, then rerun `Invoke-DeploymentBundleValidation.ps1`; only packages whose active host templates and ASP.NET middleware checks pass can proceed to the separate release approval process. |
| #192–#193 | `cs/web/missing-x-frame-options`; `deploy/iis/templates/ai-service.web.config` and `platform-api.web.config` | Fixed in the current working tree: both templates set `X-Frame-Options: DENY`; both ASP.NET services also apply `UseAierpSecurityHeaders`. Deployment-bundle validation now requires exactly one `DENY` header in every active IIS host config (API, AI service, ERP web, Studio), exactly one in each Linux nginx server block, and the middleware wiring in both service source pipelines. |

## Obsolete package blocker and accepted remediation

The retained `local-20261018-refresh` IIS and Linux package snapshots are obsolete security evidence. The IIS bundle service host configs lack the required frame header. The Linux archive retains the old IIS-only service `web.config` files in addition to its nginx host template; the validator now rejects those stale configs explicitly. Both are hard deployment blockers, even if their checksums and other package checks pass. Keep the package copies and recorded manifests unchanged. Do not copy one platform's config into the other or edit immutable artifacts to make validation pass. The accepted remediation is a provenance-approved source rebuild with the current Windows IIS and Linux publishers, followed by offline validation of both resulting packages. This task updates only validator, source contract tests, and this documentation; no release package was produced and no host was changed.

The snapshot is historical. The query did not change GitHub alert state, and this review did not dismiss alerts, create a pull request, or push commits. GitHub's alert state remains tied to the old analyzed commit until a published revision is scanned.

## Current local high-precision result

The complete local C# source-only SARIF at `.codex-build/codeql-20261023-retry/csharp-full.sarif` contains one result: `cs/user-controlled-bypass` at `src/AI/AIERP.AIService/Program.cs:864`, on `ERPAssistantQuestion.AISharingConfirmed`.

This result is a false positive for an authorization or tenant-isolation bypass. The endpoint resolves the authenticated JWT's tenant and user with `TryScope` before the consent check; authentication middleware validates JWT signature, issuer, audience, and lifetime. The consent flag controls only whether this signed-in caller opts to send their question and authorized read-only context to the configured AI provider. It does not grant permissions: ERP tool calls are made with the caller's bearer token, use a fixed allowlist of read-only tools/routes, and are independently authorized by the destination APIs. The endpoint also rejects a false flag before calling the provider. The frontend defaults the checkbox to unchecked and blocks submission until the user selects it.

Focused evidence is in `ERPAssistantReportAccessTests.Provider_is_not_called_without_explicit_data_sharing_consent`. This does not claim the client-supplied boolean is durable proof of a click. If the product requires an auditable or persistent consent record, that is a separate privacy/product requirement; the flag is not treated as an authorization credential. The result remains in local SARIF and was not suppressed.

## Focused verification

- `WebSecurityHeadersIntegrationTests` checks the three response security headers on success and not-found responses, and now verifies that downstream code cannot weaken `X-Frame-Options: DENY` to `SAMEORIGIN`.
- `Invoke-DeploymentBundleValidation.ps1` checks current packaged IIS service configs for exactly one `X-Frame-Options: DENY` header.
- `Test-DeploymentSecurityHeadersContract.ps1` checks the Windows IIS and Linux source package builder contracts, all active source host templates, both ASP.NET middleware registrations, and validator enforcement. The offline validator fails closed on an old package if any active host is missing its required `DENY` header.
- `ERPAssistantReportAccessTests` exercises the no-consent provider guard and tenant-bound permission behavior.

The updated header integration suite passed 3/3, including the new override regression. The consent/access unit tests passed 10/10.

These local checks do not update the historical GitHub findings or make the retained 2026-10-18 package snapshots safe to deploy.
