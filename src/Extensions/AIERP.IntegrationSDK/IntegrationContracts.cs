namespace AIERP.IntegrationSDK;

public sealed record IntegrationContext(
    Guid TenantId,
    string IntegrationCode,
    string CorrelationId,
    string IdempotencyKey,
    DateTimeOffset Deadline);

public sealed record IntegrationCredentialReference(string SecretName);

public sealed record IntegrationRetryPolicy(int MaximumAttempts, TimeSpan InitialDelay, TimeSpan MaximumDelay)
{
    public IReadOnlyList<string> Validate()
    {
        var errors = new List<string>();
        if (MaximumAttempts is < 1 or > 8) errors.Add("MaximumAttempts must be between 1 and 8.");
        if (InitialDelay < TimeSpan.Zero || InitialDelay > TimeSpan.FromMinutes(1)) errors.Add("InitialDelay must be between zero and one minute.");
        if (MaximumDelay < InitialDelay || MaximumDelay > TimeSpan.FromMinutes(5)) errors.Add("MaximumDelay must be at least InitialDelay and no more than five minutes.");
        return errors;
    }
}

public sealed record IntegrationResult<T>(
    bool Succeeded,
    T? Value,
    string? ExternalReference,
    string? ErrorCode,
    bool IsRetryable);

/// <summary>Adapter contract. Implementations are hosted outside the ERP process.</summary>
public interface IERPIntegrationAdapter<TRequest, TResponse>
{
    string IntegrationCode { get; }

    Task<IntegrationResult<TResponse>> ExecuteAsync(
        IntegrationContext context,
        TRequest request,
        CancellationToken cancellationToken);
}

public interface IIntegrationSecretResolver
{
    ValueTask<ReadOnlyMemory<char>> ResolveAsync(
        Guid tenantId,
        IntegrationCredentialReference reference,
        CancellationToken cancellationToken);
}
