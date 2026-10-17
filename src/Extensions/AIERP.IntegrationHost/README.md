# AIERP Integration Host

This process executes bounded integration requests outside the Platform API and ERP module runtime. It accepts only short-lived JWTs issued by the Platform API for service `AIERP.Api`, operation `integration.execute`, one tenant, and one integration code. It has no database or Docker Engine access.

## Local Compose configuration

The checked-in Compose stack starts the host with no external adapters configured. To enable an operator-managed JSON-over-HTTPS endpoint, add configuration to the host service in the local Compose environment, for example:

```yaml
Integrations__bank.statement__Enabled: "true"
Integrations__bank.statement__BaseUrl: https://api.example.invalid/v1/
Integrations__bank.statement__Path: statements
Integrations__bank.statement__AllowedHosts__0: api.example.invalid
Integrations__bank.statement__CredentialSecretName: bank-api
Integrations__bank.statement__Retry__MaximumAttempts: "3"
```

`Path` must be relative and cannot change the configured host or URL query. Only HTTPS is accepted. The exact IDN hostname must appear in `AllowedHosts`. Adapter code is fixed host behavior; callers cannot choose a URL, HTTP method, header name, or secret reference.

Place the corresponding tenant credential in `deploy/docker/integration-secrets/<tenant-guid>/bank-api`. The file must contain one line, be non-empty, and be no larger than 16 KiB. The directory is mounted read-only and excluded from version control. Restart the host after changing its adapter configuration. Never place credentials in source control, request JSON, browser storage, or logs.

Requests and responses are limited to 128 KiB, per-host outbound connections time out after 5 seconds, and the HTTP client timeout is 35 seconds. Redirects and cookies are disabled. Transient provider outcomes use the bounded `IntegrationRetryPolicy`; each attempt forwards the same provider idempotency key and correlation ID. The provider must honor that key to avoid duplicate external effects.

The Platform API persists requests/results in an encrypted SQL queue and deduplicates tenant-scoped client idempotency keys for 30 days. It returns `202` plus an operation ID; clients poll `GET /api/integrations/operations/{operationId}`. Delivery is at least once and retries forward one stable tenant-namespaced provider key. A timeout or exhausted retryable result can leave an external side effect uncertain; the operation is marked `Indeterminate` and requires provider-side reconciliation before a new key is used. Keep `INTEGRATION_QUEUE_ENCRYPTION_KEY` backed up and stable; changing it without re-encrypting queued/result rows makes those rows unreadable. No real provider, credential, mapping, or live execution is included by default. Treat `configuredAdapters: 0` as unavailable and verify any operator configuration against the provider's sandbox before enabling production traffic.
