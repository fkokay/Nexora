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
Integrations__bank.statement__RequestMappings__0__SourcePath: document.number
Integrations__bank.statement__RequestMappings__0__TargetPath: statement.reference
Integrations__bank.statement__RequestMappings__0__Required: "true"
Integrations__bank.statement__ResponseMappings__0__SourcePath: accepted
Integrations__bank.statement__ResponseMappings__0__TargetPath: result.success
```

When `RequestMappings` is configured, only the listed fields are sent to the provider; unlisted ERP fields are omitted. Source and target paths use dot-separated JSON object properties, with a maximum of 100 mappings and eight path segments. Required source fields fail before any outbound request. With no mappings, the JSON object is passed through unchanged for backward compatibility. Map only fields required by the provider and never map credentials into the payload.

The built-in Stripe adapter is selected explicitly with `Provider: stripe.payment-intent`; it does not accept a caller-supplied URL. Configure a tenant-scoped secret and map only the payment amount in minor units, lowercase ISO currency code, and any approved metadata:

```yaml
Integrations__stripe.payment-intent__Enabled: "true"
Integrations__stripe.payment-intent__Provider: stripe.payment-intent
Integrations__stripe.payment-intent__CredentialSecretName: stripe-api
Integrations__stripe.payment-intent__RequestMappings__0__SourcePath: order.amountMinor
Integrations__stripe.payment-intent__RequestMappings__0__TargetPath: amount
Integrations__stripe.payment-intent__RequestMappings__0__Required: "true"
Integrations__stripe.payment-intent__RequestMappings__1__SourcePath: order.currency
Integrations__stripe.payment-intent__RequestMappings__1__TargetPath: currency
Integrations__stripe.payment-intent__RequestMappings__1__Required: "true"
Integrations__stripe.payment-intent__RequestMappings__2__SourcePath: order.number
Integrations__stripe.payment-intent__RequestMappings__2__TargetPath: metadata.order_id
Integrations__stripe.payment-intent__RequestMappings__2__Required: "true"
Integrations__stripe.payment-intent__ResponseMappings__0__SourcePath: id
Integrations__stripe.payment-intent__ResponseMappings__0__TargetPath: payment.providerId
Integrations__stripe.payment-intent__ResponseMappings__0__Required: "true"
Integrations__stripe.payment-intent__ResponseMappings__1__SourcePath: status
Integrations__stripe.payment-intent__ResponseMappings__1__TargetPath: payment.status
```

Store the tenant's sandbox key in `deploy/docker/integration-secrets/<tenant-guid>/stripe-api`. The adapter sends it with HTTP Basic authentication and forwards the stable provider idempotency key. It creates an unconfirmed PaymentIntent and never returns Stripe's `client_secret`; this does not confirm or capture a payment. Use only Stripe test-mode credentials until an operator has validated the mapping and reconciliation flow in the provider sandbox. No Stripe account or live call is part of the default Compose setup.

The built-in PayPal adapter is selected explicitly with `Provider: paypal.orders-v2`. It defaults to the fixed PayPal sandbox Orders v2 endpoint; `Environment: live` selects the one fixed production endpoint and any other value is rejected. Its secret must be a tenant-scoped PayPal OAuth access token (not a client secret); it is sent only as a bearer credential to the selected fixed endpoint. The adapter accepts only an amount string, uppercase three-letter currency, optional description, and optional invoice ID. It creates one `CAPTURE` intent order using a tenant/integration-scoped stable `PayPal-Request-Id`; it does not follow approval links, redirect a payer, approve, or capture. Only the order ID, `CREATED` status, and `CAPTURE` intent are returned. Configure the PayPal sandbox host/token through the operator's secret/configuration process before use; no PayPal account, credential, or live request is included by default.

```yaml
Integrations__paypal.orders-v2__Enabled: "true"
Integrations__paypal.orders-v2__Provider: paypal.orders-v2
Integrations__paypal.orders-v2__Environment: sandbox
Integrations__paypal.orders-v2__CredentialSecretName: paypal-oauth-access-token
Integrations__paypal.orders-v2__RequestMappings__0__SourcePath: order.total
Integrations__paypal.orders-v2__RequestMappings__0__TargetPath: amount
Integrations__paypal.orders-v2__RequestMappings__0__Required: "true"
Integrations__paypal.orders-v2__RequestMappings__1__SourcePath: order.currency
Integrations__paypal.orders-v2__RequestMappings__1__TargetPath: currency
Integrations__paypal.orders-v2__RequestMappings__1__Required: "true"
Integrations__paypal.orders-v2__RequestMappings__2__SourcePath: order.number
Integrations__paypal.orders-v2__RequestMappings__2__TargetPath: invoiceId
Integrations__paypal.orders-v2__RequestMappings__2__Required: "true"
Integrations__paypal.orders-v2__ResponseMappings__0__SourcePath: id
Integrations__paypal.orders-v2__ResponseMappings__0__TargetPath: payment.providerId
Integrations__paypal.orders-v2__ResponseMappings__0__Required: "true"
Integrations__paypal.orders-v2__ResponseMappings__1__SourcePath: status
Integrations__paypal.orders-v2__ResponseMappings__1__TargetPath: payment.status
```

`ResponseMappings` applies the same bounded path rules to a successful provider response before the result returns to the ERP. When configured, only selected provider fields are returned under the declared ERP target paths; missing required response fields fail with the sanitized `mapping_failed` code. Invalid response mapping declarations are rejected before an outbound request, preventing configuration errors from causing provider-side effects. Without response mappings, the provider JSON response passes through unchanged. The health summary validates both request and response mappings without contacting providers.

`BaseUrl` must end at a directory boundary (for example, `https://provider.example/v1/`) and `Path` must be relative to that directory. Literal, encoded, and double-encoded dot segments, encoded path separators, backslashes, literal query strings, and fragments are rejected, and the resolved path must remain beneath the configured base path. Only HTTPS is accepted. The exact IDN hostname must appear in `AllowedHosts`. Adapter code is fixed host behavior; callers cannot choose a URL, HTTP method, header name, or secret reference.

Place the corresponding tenant credential in `deploy/docker/integration-secrets/<tenant-guid>/bank-api`. The file must contain one line, be non-empty, and be no larger than 16 KiB. The directory is mounted read-only and excluded from version control. Restart the host after changing its adapter configuration. Never place credentials in source control, request JSON, browser storage, or logs.

Requests and responses are limited to 128 KiB, per-host outbound connections time out after 5 seconds, and the HTTP client timeout is 35 seconds. Redirects and cookies are disabled. Transient provider outcomes use the bounded `IntegrationRetryPolicy`; each attempt forwards the same provider idempotency key and correlation ID. The provider must honor that key to avoid duplicate external effects.

The Platform API persists requests/results in an encrypted SQL queue and deduplicates tenant-scoped client idempotency keys for 30 days. It returns `202` plus an operation ID; clients poll `GET /api/integrations/operations/{operationId}`. Delivery is at least once and retries forward one stable tenant-namespaced provider key. A timeout or exhausted retryable result can leave an external side effect uncertain; the operation is marked `Indeterminate` and requires provider-side reconciliation before a new key is used. Keep `INTEGRATION_QUEUE_ENCRYPTION_KEY` backed up and stable; changing it without re-encrypting queued/result rows makes those rows unreadable. No real provider, credential, mapping, or live execution is included by default. Treat `configuredAdapters: 0` as unavailable and verify any operator configuration against the provider's sandbox before enabling production traffic.

## Prometheus and runtime acceptance

The optional Compose `monitoring` profile scrapes this host at `integration-host:8080/metrics` over the dedicated internal `integration-metrics` network. Prometheus is not attached to the provider egress network. The `PrometheusBusinessMetricsBridge` exports only these adapter metrics:

- `aierp_integration_executions_total{outcome=...}`
- `aierp_integration_execution_duration_seconds_{bucket,sum,count}{outcome=...}`

Outcome is one of `succeeded`, `failed`, or `cancelled`. Integration codes, tenant IDs, payloads, correlation/idempotency keys, credentials, external references, and exception text are not labels. The default local Compose stack has no adapter configured, so the scrape target can be healthy while these business series remain absent until an approved sandbox adapter is executed. ERP assistant metrics are exported by AI Service with allowlisted tool and outcome labels.

Runtime scrape acceptance is still pending a healthy Docker Engine. After Docker recovers, start the normal stack with the `monitoring` profile and verify in Prometheus that `up{job="aierp-integration-host"}` is `1` and that the IntegrationHost target is `UP` in `/targets`. Then execute one configured sandbox adapter through the authenticated Platform API and confirm one increment of `aierp_integration_executions_total` and one observation in `aierp_integration_execution_duration_seconds_count`. Exercise one success and one sanitized failure/cancellation outcome, then inspect the series to confirm only the outcome label is present. Repeat for an ERP assistant tool and confirm its tool name is an allowlisted value. Check that the existing 5xx/scrape alert rules remain loaded. A target `UP` check alone does not prove business telemetry; both target reachability and generated series are required.
