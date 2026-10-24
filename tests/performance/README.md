# Platform API load baseline

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

For a tenant with representative data already seeded, run the multi-endpoint read-path scenario:

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
