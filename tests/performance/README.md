# Platform API load baseline

For the combined representative-data load and HA/failover preparation checklist, see [`docs/representative-load-ha-drill-plan.md`](../../docs/representative-load-ha-drill-plan.md). The HA section is gated on a real multi-node staging topology and DBA/service-owner approved maintenance window.

Run the authenticated local read-path baseline after the Compose Platform API and SQL Server are healthy:

```powershell
$env:AIERP_LOADTEST_EMAIL = '<local tenant user>'
$env:AIERP_LOADTEST_PASSWORD = '<local password>'
try {
  .\tests\performance\Invoke-PlatformLoadTest.ps1
} finally {
  Remove-Item Env:\AIERP_LOADTEST_EMAIL, Env:\AIERP_LOADTEST_PASSWORD -ErrorAction SilentlyContinue
}
```

Do not pass credentials as arguments, place them in the script, or commit them. The script authenticates once, selects the first active tenant unless `-TenantName` is supplied, concurrently warms the same HTTP connection pool, and then sends 300 authenticated `GET /api/dashboard` requests at concurrency 25. The measured endpoint is read-only; login and tenant selection are setup calls and create only their normal audit events.

The default local acceptance thresholds are p95 latency at or below 1,000 ms and error rate at or below 1%. They are development baselines, not production SLAs. Override request count, concurrency, or thresholds explicitly when investigating capacity. The JSON artifact contains timing and status aggregates only; it excludes credentials, tokens, tenant/user IDs, and response bodies.

## Prometheus runtime scrape acceptance

With the local Compose monitoring profile running, verify all four configured application targets are freshly scraped and the Platform API exposes an observed request-duration histogram:

```powershell
.\tests\performance\Invoke-PrometheusRuntimeAcceptance.ps1
```

The default report is `docs/prometheus-runtime-acceptance.json`. It records only target health, scrape age, and metric-presence booleans. It is local monitoring evidence, not an availability or alert-delivery test.

## Seeded tenant read-path scenario

### Prepare an isolated synthetic tenant

`Seed-SyntheticLoadTenant.ps1` prepares at least 100 stock items and 100 open CRM opportunities through the Platform API. It creates one synthetic customer account because each opportunity must reference a customer. Stock, customer, and opportunity codes are stable for the selected synthetic tenant, so reruns skip matching records and create only missing records. It uses POST only; it never updates or deletes rows. A code collision with a different name stops the run.

The API contract is `POST /api/stock/items/` with `StockItemWriteRequest`, `POST /api/customers/` with `CustomerWriteRequest`, and `POST /api/crm/opportunities/` with `CrmOpportunityWriteRequest`. Each has a corresponding paged GET used to look up the stable code. CRM requires a valid customer ID in the selected tenant. The create endpoints reject duplicate codes; the script handles that race only after rereading and confirming the same synthetic code/name.

Run only against a dedicated disposable Compose stack with the API bound to loopback, a synthetic load-test account, and permissions to create stock items, customer accounts, and CRM opportunities. Before tenant selection, the script requires the tenant ID in `AIERP_SEED_ALLOWED_TENANT_IDS`, the exact expected name to start with `Synthetic Load Tenant`, and the authenticated tenant slug to match `synthetic-load-<32 lowercase hex>`. The base URL must be an HTTP(S) loopback URL. This three-part tenant check is required; never add a customer or shared tenant ID to the allowlist.

Set credentials and the owner-approved synthetic tenant ID allowlist in the current PowerShell process, then supply the exact tenant identity shown by the API:

```powershell
$env:AIERP_LOADTEST_EMAIL = '<synthetic tenant user>'
$env:AIERP_LOADTEST_PASSWORD = '<synthetic tenant password>'
$env:AIERP_SEED_ALLOWED_TENANT_IDS = '<synthetic tenant GUID>'
try {
  .\tests\performance\Seed-SyntheticLoadTenant.ps1 `
    -BaseUrl 'http://127.0.0.1:5080' `
    -TenantId '<same synthetic tenant GUID>' `
    -TenantName 'Synthetic Load Tenant'
} finally {
  Remove-Item Env:\AIERP_LOADTEST_EMAIL, Env:\AIERP_LOADTEST_PASSWORD, Env:\AIERP_SEED_ALLOWED_TENANT_IDS -ErrorAction SilentlyContinue
}
```

Credentials are read only from process environment variables and are not accepted as arguments or written to output. The script suppresses API response bodies in errors and reports aggregate create counts only. It performs no cleanup. To discard seeded rows, dispose of the dedicated synthetic database/project using its separately reviewed teardown procedure.

### Run the read-path scenario

After the seed script succeeds, run the multi-endpoint read-path scenario:

```powershell
try {
  .\tests\performance\Invoke-SeededReadPathLoadTest.ps1 -TenantSlug 'synthetic-load-<32-hex-guid>'
} finally {
  Remove-Item Env:\AIERP_LOADTEST_EMAIL, Env:\AIERP_LOADTEST_PASSWORD -ErrorAction SilentlyContinue
}
```

This uses the same process-scoped credential variables described above. The API URL must be loopback-only, and `-TenantSlug` is required and must exactly match a synthetic tenant slug in the `synthetic-load-<32-hex-guid>` namespace; the script never defaults to the first tenant. Before sending load it checks that the selected tenant has at least 100 stock items and 100 CRM opportunities; use `-MinimumRowsPerDataset` to set a different explicit floor. If either dataset is below the floor, it stops before load. It then measures only authenticated `GET` requests to the dashboard, stock-item list and CRM opportunity list. No fixture data is created, no row values are written to the report, and the API query endpoints do not create business records. Use a dedicated local load-test tenant in an isolated disposable database stack that has been seeded independently; this scenario is not a production SLA.

To exercise the harness and its preflight/sanitization contract without a seeded database or API data, run its synthetic acceptance fixture:

```powershell
.\tests\performance\Invoke-SyntheticReadPathLoadAcceptance.ps1
```

This starts an in-process mock API bound to `127.0.0.1`, with synthetic credentials, tenant metadata, and stock/CRM record markers from `fixtures/synthetic-read-path-load.json`. It runs the regular load script against that mock and verifies both row-count gates, all three GET endpoints, successful request counts, and removal of credentials, tokens, tenant IDs, and record values from the report. It sends no requests to Compose or other live services and removes its temporary report when complete. The result checks the load harness contract; it is not an ERP API performance measurement.

The mock fixture above provides canned response counts only; it cannot prepare ERP data. The API seed path above is restricted to an allowlisted, explicitly synthetic tenant on loopback. Do not create records in a shared or remote tenant. The disposable-only preparation status, minimum dataset (100 stock items and 100 CRM opportunities), cleanup boundary, and drill acceptance metrics are tracked in [`docs/representative-load-ha-drill-plan.md`](../../docs/representative-load-ha-drill-plan.md).
