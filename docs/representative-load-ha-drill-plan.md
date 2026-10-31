# Representative-data load and HA drill preparation

Status: **prepared; no live drill run**. This plan is for an isolated, disposable staging stack only. Do not point it at production, a remote Docker context, a shared developer database, or a customer tenant. A real disruption or SQL write/failover requires a DBA and service/operations owner approved maintenance window and explicit go/no-go.

## Findings and current limits

- `tests/performance/Invoke-SeededReadPathLoadTest.ps1` is an authenticated, GET-only workload for dashboard, stock items and CRM opportunities. It enforces an HTTP(S) loopback URL, exact `synthetic-load-<32 hex>` tenant namespace, and minimum row count (default 100 each) before load. Defaults: 300 requests per endpoint, concurrency 25, p95 <= 1,000 ms, errors <= 1%. Credentials are process environment only; output is aggregate and redacted.
- `tests/performance/Invoke-SyntheticReadPathLoadAcceptance.ps1` tests the harness against a loopback mock; it is not API capacity evidence and does not seed ERP data. `tests/performance/fixtures/synthetic-read-path-load.json` is mock response data only. `tests/performance/Seed-SyntheticLoadTenant.ps1` provides a repeatable API-only create path for an explicitly synthetic tenant. It requires a loopback API URL, an environment allowlist containing the supplied tenant ID, exact synthetic tenant name and synthetic slug checks before tenant selection, and creates only missing stable-code stock, customer and opportunity rows. Existing rows are never updated or deleted. A representative dataset and dedicated disposable tenant remain prerequisites.
- `docs/performance-stress-20261018-current.json` is a historical local dashboard-only baseline (1,000 requests / concurrency 100, p95 816 ms, 0% errors). It is not equivalent to the three-endpoint scenario or an SLA.
- `docs/production-ha-acceptance-runbook.md` Gate 5 describes the intended multi-node exercise. `docs/architecture.md` states current Compose is single-host and has no HA profile, multi-host lock/fencing, SQL failover, replicated storage or traffic draining. Thus no actual HA/failover is currently executable on the local Compose topology. A graceful SQL container restart is recovery evidence, not failover.
- Existing recovery evidence is local only: `docs/recovery-drill.json`, `docs/separated-recovery-drill.json`, and `docs/sql-restart-recovery-drill.json`. It does not establish production recoverability or HA.

## Gate A — disposable synthetic dataset and read load

1. Provision an isolated Compose/project and SQL data volume dedicated to the drill. Confirm the Docker context is local, the compose project name is unique, and the API is bound to loopback. Do not reuse production volumes or credentials. Generate a random synthetic tenant slug `synthetic-load-<32 lowercase hex>`, a clearly synthetic tenant name, synthetic-only identities/data, and record its tenant GUID in the operator-controlled `AIERP_SEED_ALLOWED_TENANT_IDS` environment allowlist.
2. Use `tests/performance/Seed-SyntheticLoadTenant.ps1` as documented in `tests/performance/README.md`. It requires the allowlisted tenant ID and exact name plus synthetic slug to match the authenticated tenant before selection. It creates at least 100 stock items and open CRM opportunities via API and one supporting customer. It uses stable tenant-specific codes, skips exact existing code/name pairs, stops on collisions, and never updates or deletes. Review its aggregate create counts and run the GET row-count preflight (>=100 stock items and >=100 CRM opportunities) before load.
3. Confirm API/SQL health, tenant slug, row-count preflight, monitoring scrape freshness, and a clean starting report path. Agree a stop threshold and target profile before sending requests. Default baseline profile:

```powershell
$env:AIERP_LOADTEST_EMAIL = '<synthetic tenant user>'
$env:AIERP_LOADTEST_PASSWORD = '<synthetic tenant password>'
try {
  .\tests\performance\Invoke-SeededReadPathLoadTest.ps1 `
    -BaseUrl 'http://127.0.0.1:5080' `
    -TenantSlug 'synthetic-load-<32-hex-guid>' `
    -RequestsPerEndpoint 300 -Concurrency 25 `
    -MinimumRowsPerDataset 100 `
    -P95ThresholdMs 1000 -MaxErrorRatePercent 1 `
    -OutputPath '<evidence>\performance-seeded-read-baseline.json'
} finally {
  Remove-Item Env:\AIERP_LOADTEST_EMAIL, Env:\AIERP_LOADTEST_PASSWORD -ErrorAction SilentlyContinue
}
```

4. Capture same-window API/SQL CPU and memory, SQL connection/pool and blocking/saturation indicators, request rate, errors, and monitoring scrape age. Evaluate per-endpoint p95 and aggregate error rate against the pre-agreed targets. Stop on any unexpected write, sustained error threshold breach, saturation, health loss, or data outside the synthetic tenant. The harness's default p95/error thresholds are development baselines, not an SLA.
5. Save the sanitized JSON and redacted monitoring snapshots. Verify no credentials, tokens, tenant/user IDs, or business row values appear. Record run ID, compose project identity, image digests, dataset row counts, profile, start/end UTC, threshold outcomes, and operator sign-off.

Rollback/cleanup: stop the workload (it has no write phase), retain the approved aggregate evidence, then remove only the uniquely named disposable project and its dedicated volumes using the owner-reviewed teardown procedure. If any accidental write is observed, stop immediately, preserve forensic metadata, and discard/recreate the disposable database from its pre-run snapshot; do not attempt cleanup against any shared or production target.

No seed or record cleanup was performed while preparing this plan. Seeded ERP records, if later created through an approved path, are removed only by disposing of the uniquely named disposable database/project under the reviewed teardown procedure; this plan does not authorize row-level deletion.

## Gate B — HA/failover staging exercise

This gate is **not runnable against current Nexora Compose**. First provision the intended customer-equivalent staging topology: at least two application/deployer nodes, shared lease/coordination with fencing, load balancer/health-aware drain, SQL primary/secondary with stable endpoint, independent backups, monitoring/on-call route, and synthetic-only traffic/data. DBA and service/operations owners must approve the window, target, expected impact, RTO/RPO and abort authority. No such approval or topology is implied by this preparation.

Use `docs/production-ha-acceptance-runbook.md` Gate 5 in order. Pre-capture healthy node/SQL roles, release IDs, lock/fence state, traffic and latency/error baseline. Measure and retain UTC timestamps for:

- Concurrent promotion attempt: operation IDs, lease owner, rejection of the second publisher.
- Lease-owner isolation/takeover: lease expiry, new fence token, and stale-token rejection after old owner returns.
- One API node drain/removal: probe transition, in-flight request outcomes, remaining-node service, and alert delivery.
- Planned SQL failover: role transition, client reconnect, application readiness, synthetic consistency sentinel, RTO and RPO.
- Restoration: original roles/nodes returned, active release IDs and leases reconciled, health and monitoring stable.

Pass only against pre-approved numeric RTO/RPO and interruption/error limits, with all six evidence areas above and DBA plus operations sign-off. Any stale-owner publish, missing alert, consistency mismatch, unexplained write, failed health, or exceeded target is a stop/NO-GO.

Rollback: use the database team's tested failback/recovery procedure and load-balancer runbook; re-enable/drain nodes only after role, fencing and data consistency are verified. If failback is unsafe, keep traffic on the healthy serving side and invoke the approved incident plan. Do not improvise SQL role reversal or restore over an active database. Backup IDs/hashes and restore owner must be recorded before the window; retain the pre-drill restore point until sign-off and retention approval.

## Evidence checklist / go-no-go

- [ ] Isolated disposable stack, local Docker context, unique volume/project and synthetic tenant verified
- [ ] Synthetic fixture counts >= 100 stock items and >= 100 CRM opportunities; load preflight passed
- [ ] Load report has 900 measured GETs total (300 per endpoint), p95 <= approved target, error rate <= approved target
- [ ] Concurrent resource/SQL saturation observations and monitoring snapshots attached
- [ ] Report redaction checked; no credentials, tokens, identifiers or row values retained
- [ ] Pre-drill backup/snapshot, independent-copy/hash check, restore owner and cleanup/rollback procedure recorded
- [ ] Multi-node topology, fencing, traffic manager, SQL failover, alert route and synthetic sentinel are available
- [ ] DBA/service owner approved maintenance window, target, RTO/RPO, abort authority and rollback plan
- [ ] Node/lease/fencing, traffic failover, SQL failover, alerts, restore/reconciliation, measured RTO/RPO evidenced
- [ ] DBA and operations/service owners signed the result

Decision: **NO-GO for a real failover today** until the topology and owner-approved window exist. The load harness is ready for an isolated synthetic tenant once its row-count preflight passes. This document prepares the procedure; it records no new live measurements and grants no production authorization.
