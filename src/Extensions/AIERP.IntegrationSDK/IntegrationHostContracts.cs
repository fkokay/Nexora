using System.Text.Json;

namespace AIERP.IntegrationSDK;

public sealed record IntegrationHostExecuteRequest(
    string? IntegrationCode,
    string? IdempotencyKey,
    string? CorrelationId,
    DateTimeOffset Deadline,
    JsonElement Payload);

public sealed record IntegrationHostExecuteResponse(
    bool Succeeded,
    JsonElement? Value,
    string? ExternalReference,
    string? ErrorCode,
    int Attempts,
    DateTimeOffset ExecutedAt);
