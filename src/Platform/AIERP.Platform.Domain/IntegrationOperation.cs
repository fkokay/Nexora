namespace AIERP.Platform.Domain;

/// <summary>Durable, tenant-scoped integration request and idempotency record.</summary>
public sealed class IntegrationOperation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RequestedByUserId { get; set; }
    public string IntegrationCode { get; set; } = "";
    public string IdempotencyKeyHash { get; set; } = "";
    public string PayloadSha256 { get; set; } = "";
    public string ProviderIdempotencyKey { get; set; } = "";
    public string EncryptedPayload { get; set; } = "";
    public string? EncryptedResult { get; set; }
    public string Status { get; set; } = "Queued";
    public string? ErrorCode { get; set; }
    public int AttemptCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
