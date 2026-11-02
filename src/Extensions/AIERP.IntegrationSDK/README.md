# AIERP Integration SDK

`IERPIntegrationAdapter<TRequest, TResponse>` is the typed contract for adapters that a host runs outside the ERP process. `IntegrationAdapterExecutor` applies the validated `IntegrationRetryPolicy`, enforces the `IntegrationContext.Deadline`, retries only retryable results and transport/time-out failures, and returns a bounded attempt count and sanitized error code. Every retry receives the original tenant, correlation, and idempotency context unchanged; a remote adapter must use the idempotency key with the provider to prevent duplicate side effects.

The SDK also defines `IIntegrationSecretResolver`, so adapter code receives credentials through a host-owned resolver instead of module input. Platform API persists integration operations and encrypted request/results in PlatformDB, deduplicates tenant-scoped idempotency keys for 30 days, and dispatches queued work through the separate IntegrationHost. The queue retries delivery up to three times with one provider idempotency key. A timeout or exhausted retryable error can leave the external side effect uncertain; such operations are marked `Indeterminate` for provider-side reconciliation. Delivery is at least once, so avoiding provider-side duplicates depends on the provider honoring idempotency. Tenant credentials are resolved from host-mounted files. The SDK still does not provide vendor-specific connectors or mappings. No external integration should be reported as active until its provider endpoint, credentials, mapping, and live verification are configured.

Electronic document groundwork is defined by `EDocumentSubmissionRequest`, `EDocumentSubmissionResponse`, and `IEDocumentProviderAdapter`. The request envelope supports e-invoice, e-dispatch, and e-archive identifiers and an opaque provider-mappable document object. Tenant administrators can preview the generated source document at `/api/e-documents/source-documents/{documentType}/{documentId}/preview`; this read-only endpoint returns the same provider-neutral envelope used to prepare a submission and does not enqueue or transmit it. The API stores drafts encrypted with status `AwaitingApproval`; a different tenant administrator must approve before the operation becomes deliverable. Preparation and approval are audit logged, and tenant-scoped client and provider idempotency are inherited from the integration queue. Generic execution explicitly rejects the reserved `tr.e-document.submit` integration code so it cannot bypass this approval route. No vendor payload standard, certification, or legal acceptance is implied. A connector still needs its vendor's developer account, sandbox credentials and endpoint, approved field mappings, and end-to-end sandbox evidence before production use.

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
