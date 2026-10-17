# AIERP Integration SDK

`IERPIntegrationAdapter<TRequest, TResponse>` is the typed contract for adapters that a host runs outside the ERP process. `IntegrationAdapterExecutor` applies the validated `IntegrationRetryPolicy`, enforces the `IntegrationContext.Deadline`, retries only retryable results and transport/time-out failures, and returns a bounded attempt count and sanitized error code. Every retry receives the original tenant, correlation, and idempotency context unchanged; a remote adapter must use the idempotency key with the provider to prevent duplicate side effects.

The SDK also defines `IIntegrationSecretResolver`, so adapter code receives credentials through a host-owned resolver instead of module input. Platform API persists integration operations and encrypted request/results in PlatformDB, deduplicates tenant-scoped idempotency keys for 30 days, and dispatches queued work through the separate IntegrationHost. The queue retries delivery up to three times with one provider idempotency key. A timeout or exhausted retryable error can leave the external side effect uncertain; such operations are marked `Indeterminate` for provider-side reconciliation. Delivery is at least once, so avoiding provider-side duplicates depends on the provider honoring idempotency. Tenant credentials are resolved from host-mounted files. The SDK still does not provide vendor-specific connectors or mappings. No external integration should be reported as active until its provider endpoint, credentials, mapping, and live verification are configured.

Example:

```csharp
var result = await IntegrationAdapterExecutor.ExecuteAsync(
    adapter,
    new IntegrationContext(tenantId, "bank.statement", correlationId, idempotencyKey,
        DateTimeOffset.UtcNow.AddSeconds(30)),
    request,
    new IntegrationRetryPolicy(3, TimeSpan.FromMilliseconds(250), TimeSpan.FromSeconds(2)),
    cancellationToken);
```
