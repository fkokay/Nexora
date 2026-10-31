# Post-Docker validation checklist (2026-10-25)

## Status at handoff

The local Docker Compose stack is up after rebuild. A read-only `docker compose ps` check on 2026-10-25 showed Platform API, AI Service, ERP Web, Development Studio, Integration Host, PluginHost, ReleaseDeployer, WorkspaceRunner, and SQL Server healthy. WorkspaceSandbox was running without a reported health status. This is local-development evidence only; it does not validate IIS/Linux hosts, customer staging, production, provider access, or multi-node behavior.

The 2026-10-25 candidate `20261025-bba999b` was rebuilt from clean detached commit `bba999b933048eb8549b12663e57d76ab839c08f`. The cross-package offline validator passed all eight checks; exact local package hashes and limits are in `production-deployment-readiness.md` and the [validation report](deployment-package-validation-20261025-bba999b.json). This does not constitute release-owner approval or real-host validation. The current r5 migration evidence is local: restored-copy rehearsal and local apply passed at Platform/Tenant/AIStudio histories 136/49/11, but no production target was accessed. See `production-deployment-readiness.md`, `production-ha-acceptance-runbook.md`, and `migration-r5-restored-backup-rehearsal.md` for the full procedures.

None of the requested external gates below is evidenced as complete. Track each independently as `NOT RUN`, `PASS`, `FAIL`, or `INCONCLUSIVE`; attach evidence and owner sign-off. Never place credentials, keys, customer data, tax documents, payment data, exploit payloads, or raw provider payloads in repository evidence.

## A. Local team can prepare now

- [ ] **Pin the candidate.** Identify the approved source commit, confirm a clean build workspace, and record local image IDs/digests and Compose health output. Do not promote the current checkout solely because its Compose containers are healthy.
- [x] **Build and validate the local deployment-package candidate.** Version `20261025-bba999b`, built from clean commit `bba999b933048eb8549b12663e57d76ab839c08f`; `Invoke-DeploymentBundleValidation.ps1` passed all eight checks and the Linux AIStudio connection example is present. Local hashes/report are recorded in `production-deployment-readiness.md`.
- [ ] **Approve and promote the deployment package.** A release owner and independent second operator must review the candidate, confirm provenance and authorize staging. The local validation does not establish that approval.
- [ ] **Prepare staging inputs without touching a host.** Confirm the intended IIS and Linux OS/runtime versions, DNS/TLS names, SQL version/topology, separated database inventory, secret delivery, service identities, approved migration package and rollback version. Keep secret values in the approved secret store.
- [ ] **Prepare a GitHub App test plan.** Choose one disposable repository and branch, set up the callback/webhook URL plan, list the required read-only checkout permissions and separately gated write permissions, and define what write the repository owner may authorize. Unit/TestServer coverage is preparation only.
- [ ] **Prepare the penetration-test scope packet.** Name the security owner and tester, staging endpoints/build, test identities, allowed techniques, excluded targets, rate/time limits, stop contact, and finding owners. Existing local smoke/SAST/dependency checks are not a penetration test.
- [ ] **Prepare a synthetic load tenant.** In an isolated disposable stack, seed the synthetic `synthetic-load-<32-hex-guid>` tenant with at least 100 stock items and 100 CRM opportunities; verify the target and row-count preflight. The existing seeded harness accepts only loopback URLs, so an external staging host cannot be passed directly. Keep the run on an isolated local stack or use an operator-approved loopback tunnel/runner that preserves that restriction. If true remote-target load is required, record a harness capability gap; do not silently weaken the URL guard.
- [ ] **Prepare SQL recovery evidence.** Inventory Platform, AIStudio, and every tenant database; collect authoritative target migration histories from the DBA; review the exact r5 package and SQL Server compatibility. Local checksum backups/restored-copy rehearsals are useful preparation but do not prove off-host retention or customer restore time.
- [ ] **Resolve the e-document design gate before scheduling vendor acceptance.** Security/platform owners must decide credential ownership and ingress, protector/key lifecycle, central host-allowlist ownership, provider/mapping configuration ownership and versioning, and redacted audit contract. Current behavior intentionally fails closed for `tr.e-document.submit`; no tenant configuration API or vendor adapter is ready for a tenant-admin sandbox run.

## B. Customer-equivalent staging or external access required

### 1. IIS and Linux host validation — host owners + release owner

- [ ] Promote only the approved, checksum-verified package pair after the local package gate passes.
- [ ] On the IIS staging host, record OS/IIS/.NET Hosting Bundle/URL Rewrite/ARR versions, DNS/TLS, SQL certificate validation, service identities and protected secret ACLs. Install the bundle; check ERP, Studio, API and AI health, SQL readiness, service permissions and an authenticated representative read. Confirm startup migrations are disabled.
- [ ] On the Linux staging host, verify archive SHA-256, runtime/nginx/systemd versions, secret file ownership/modes, TLS and SQL certificate validation. Run package preflight/install; validate nginx, systemd units, both web frontends and API health plus a representative authenticated read.
- [ ] On each staging host only, perform the documented controlled failed-health-switch recovery and manual application rollback. Capture versions/paths, health results, redacted logs and elapsed recovery time. Do not run failure injection on production.
- [ ] Pass only when both intended deployment paths upgrade, recover and roll back on the actual supported host versions, and their owners sign the evidence. If only one path is intended, record that scope explicitly.

**Procedure references:** `production-ha-acceptance-runbook.md` Gates 1–3; `deploy/iis/README.md`; `deploy/linux/README.md`.

### 2. GitHub App E2E — GitHub/repository owner + authorized test operator

- [ ] Install the App on only the disposable repository. Configure its ID/slug, private key and webhook secret through the approved secret store; verify HTTPS callback, Studio redirect and `pull_request` webhook delivery.
- [ ] Complete Studio authorization and confirm project-to-installation binding. Prove checkout uses a repository-scoped Contents-read token.
- [ ] Send signed open, synchronize, closed and merged events; verify each valid transition is applied once and in order, and an invalid signature changes no state.
- [ ] Only after explicit repository-owner authorization for a test write, publish one reviewed disposable candidate; confirm PR create/reuse and ready-for-review behavior. Verify unauthorized repositories and write actions are denied.
- [ ] Record pseudonymous IDs, commit, permissions, webhook event IDs and redacted outcomes. Pass only with no excess scope/duplicate writes and repository-owner sign-off.

Do not broaden installation scope or enable publication as part of preparation.

### 3. Authorized penetration test — security owner + qualified tester

- [ ] Obtain written authorization for exact customer-equivalent staging URLs/IPs, build identity, API/Studio/Marketplace/integration scope, test identities, allowed methods, excluded systems, time window, request limits, emergency stop and data handling.
- [ ] Test tenant isolation, authorization escalation, SSRF/redirect controls, package/signature handling, input/path boundaries and secret exposure. Stop on instability or scope ambiguity.
- [ ] Store the signed full report in the restricted security evidence system. Put only a redacted summary in the release record with finding IDs/severity, owners, remediation state and retest disposition.
- [ ] Pass only when no unresolved Critical/High findings remain unless formally excepted with owner/due date; all findings have dispositions and the security owner signs. Local scans do not satisfy this gate.

### 4. Representative-data read-path load — operations/API owner + DBA

- [ ] Use a dedicated non-production target and synthetic tenant; never use customer data. Confirm the harness can reach the intended target through an approved loopback-only route, credentials are process-scoped, and dataset floors pass before traffic starts.
- [ ] Unless the owner approves different values, run `tests/performance/Invoke-SeededReadPathLoadTest.ps1` with 300 requests per endpoint, concurrency 25, at least 100 stock items and 100 CRM opportunities, p95 at most 1,000 ms, and errors at most 1%.
- [ ] Measure only authenticated GETs for dashboard, stock items and CRM opportunities. Capture API/SQL CPU, memory, connection-pool use, query saturation, latency and errors for the full run. Stop on unexpected writes, cross-tenant access, exposure, or an approved saturation stop limit.
- [ ] Pass only if all preflights/approved thresholds pass and operations signs the metrics. Defaults are development baselines, not an SLA. The current script refuses non-loopback `BaseUrl`; direct use against a remote staging hostname is unsupported.

**Procedure reference:** `tests/performance/README.md` and `tests/performance/Invoke-SeededReadPathLoadTest.ps1`.

### 5. SQL backup/restore and HA — DBA + backup owner + operations owner

- [ ] For the exact intended topology, record `@@SERVERNAME`, SQL version, separation enabled, catalog-to-database mapping and authoritative migration history for Platform, AIStudio and every tenant database.
- [ ] Take checksum-protected full backups for every affected database. Run `RESTORE VERIFYONLY WITH CHECKSUM`; copy the complete set to an independent off-host destination; verify hashes and retention; record backup IDs, sizes, timestamps and restore owner.
- [ ] Restore each database under unique isolated names on a staging SQL instance. Run `DBCC CHECKDB`, verify migration histories and representative application reads, and measure restore duration. Never use production names or `WITH REPLACE` in the drill. `VERIFYONLY` alone is not a restore test.
- [ ] Rehearse the reviewed r5 SQL only on restored copies after target history/prefix checks. If the real history does not match the documented script precondition, stop and have the DBA select and review another package/plan. Do not infer compatibility from connectivity or local 136/49/11 histories.
- [ ] For HA, use the intended multi-node staging topology: prove concurrent promotion exclusion; isolate a lease owner and test stale-fence rejection; remove one API node through the load balancer; perform planned SQL failover; verify reconnect, consistency, alert delivery and agreed RTO/RPO; restore/reconcile roles, releases and locks.
- [ ] Pass backup/recovery only with independent-copy evidence, isolated restore, DBCC and representative reads. Pass HA only with measured recovery objectives, lock/fencing, traffic and SQL failover, alerts, and DBA/operations sign-off. These are separate results.

**Procedure reference:** `production-ha-acceptance-runbook.md` Gates 4–5 and `production-deployment-readiness.md`.

### 6. Certified e-document vendor sandbox — platform/security owners + vendor/business owner

- [ ] First close the five design decisions documented in `e-document-tenant-configuration-design-gaps-20261023.md`: credential storage/handoff; protector and key lifecycle; centrally owned hostname allowlist; tenant/provider/mapping configuration ownership and versioning; and safe audit contract.
- [ ] Implement and review the agreed tenant-admin settings, write-only secret ingress, masking, allowlist, mapping validation and audit behavior. Add and pass tenant isolation, role-denial, ciphertext-at-rest, rejected-host, invalid-mapping, and secret-redaction checks. Saving settings must not call the vendor.
- [ ] Obtain vendor sandbox tenant/account, endpoint/API/schema version, test certificate/credentials, approved synthetic documents, portal reconciliation access and written limits. Confirm sandbox-only host allowlisting and separate test tenants/admins.
- [ ] Exercise synthetic draft/preview; prove the creator cannot approve; approve with a second tenant admin; deliver through the queue; test accepted, rejected, timeout/indeterminate and reconciliation with one stable idempotency key. Check no duplicate operation, cross-tenant access, or live endpoint.
- [ ] Keep provider request/document bodies and credentials out of evidence. Pass only when status mappings match the provider, retries/reconciliation are safe, failure paths are bounded, and vendor/business owners sign.

**Current blocker:** this is not merely an account-access item. The adapter is deliberately fail-closed and tenant configuration ownership/secret lifecycle remain undecided. Do not mark this gate `NOT RUN` as ready-to-execute until those prerequisites are closed; track it as `BLOCKED — DESIGN/IMPLEMENTATION` meanwhile.

## Release evidence index

For every run, record run ID, UTC start/end, approved commit and image/package digests, environment, operator/reviewer pseudonyms, result, evidence reference, deviations and owner sign-off. Keep detailed security/provider/backup materials in their restricted systems and link only redacted summaries. A missing access grant, target, owner decision or evidence remains `NOT RUN` or `BLOCKED`; local Docker health and local restore rehearsals cannot be promoted to external acceptance.
