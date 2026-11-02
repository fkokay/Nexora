namespace AIERP.Platform.Domain;

public enum TenantProvisioningJobStatus
{
    Queued = 1,
    Running = 2,
    Completed = 3,
    Failed = 4
}

/// <summary>Durable control record for asynchronous tenant database provisioning.</summary>
public sealed class TenantProvisioningJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid RequestedByUserId { get; set; }
    public string IdempotencyKeyHash { get; set; } = "";
    public string PayloadSha256 { get; set; } = "";
    public TenantProvisioningJobStatus Status { get; set; } = TenantProvisioningJobStatus.Queued;
    public int AttemptCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    public string? LeaseOwner { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? ErrorCode { get; set; }
    public byte[] RowVersion { get; set; } = [];
}
