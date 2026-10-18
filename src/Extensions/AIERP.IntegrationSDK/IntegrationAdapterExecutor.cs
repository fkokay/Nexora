using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text.RegularExpressions;

namespace AIERP.IntegrationSDK;

public sealed record IntegrationExecutionResult<T>(
    bool Succeeded,
    T? Value,
    string? ExternalReference,
    string? ErrorCode,
    int Attempts,
    TimeSpan Duration);

/// <summary>Runs a typed adapter with bounded retry and deadline handling. Adapters must reuse the supplied idempotency key on every attempt.</summary>
public static partial class IntegrationAdapterExecutor
{
    public const string TelemetryName = "AIERP.IntegrationSDK";
    public static readonly ActivitySource ActivitySource = new(TelemetryName);
    public static readonly Meter Meter = new(TelemetryName);
    private static readonly Counter<long> Executions = Meter.CreateCounter<long>("aierp.integration.executions", "{execution}");
    private static readonly Histogram<double> ExecutionDuration = Meter.CreateHistogram<double>("aierp.integration.execution.duration", "ms");

    private static readonly HashSet<string> SafeProviderErrorCodes = new(StringComparer.Ordinal)
    {
        "adapter_failed", "adapter_error", "provider_error", "provider_rejected", "authentication_failed", "rate_limited",
        "validation_failed", "conflict", "not_found", "temporary_unavailable", "transport_error", "timeout"
    };

    public static async Task<IntegrationExecutionResult<TResponse>> ExecuteAsync<TRequest, TResponse>(
        IERPIntegrationAdapter<TRequest, TResponse> adapter,
        IntegrationContext context,
        TRequest request,
        IntegrationRetryPolicy retryPolicy,
        CancellationToken cancellationToken = default,
        Func<TimeSpan, CancellationToken, Task>? delayAsync = null,
        Func<double>? jitter = null)
    {
        ArgumentNullException.ThrowIfNull(context);
        using var activity = ActivitySource.StartActivity("integration.execute", ActivityKind.Client);
        var stopwatch = Stopwatch.StartNew();
        activity?.SetTag("integration.code", context.IntegrationCode);
        IntegrationExecutionResult<TResponse> result;
        try
        {
            result = await ExecuteCoreAsync(adapter, context, request, retryPolicy, cancellationToken, delayAsync, jitter);
        }
        catch (OperationCanceledException)
        {
            RecordTelemetry(activity, context.IntegrationCode, "cancelled", "cancelled", 0, stopwatch.Elapsed);
            throw;
        }
        catch
        {
            RecordTelemetry(activity, context.IntegrationCode, "failed", "executor_error", 0, stopwatch.Elapsed);
            throw;
        }

        var outcome = result.Succeeded ? "succeeded" : "failed";
        RecordTelemetry(activity, context.IntegrationCode, outcome, result.ErrorCode, result.Attempts, result.Duration);
        return result;
    }

    private static void RecordTelemetry(Activity? activity, string? integrationCode, string outcome, string? errorCode, int attempts, TimeSpan duration)
    {
        var tags = new TagList
        {
            { "integration.code", integrationCode ?? "unknown" },
            { "outcome", outcome }
        };
        if (!string.IsNullOrWhiteSpace(errorCode)) tags.Add("error.code", errorCode);
        Executions.Add(1, tags);
        ExecutionDuration.Record(duration.TotalMilliseconds, tags);

        activity?.SetTag("integration.outcome", outcome);
        activity?.SetTag("integration.attempts", attempts);
        if (!string.IsNullOrWhiteSpace(errorCode)) activity?.SetTag("error.code", errorCode);
        if (outcome != "succeeded") activity?.SetStatus(ActivityStatusCode.Error, errorCode ?? outcome);
    }

    private static async Task<IntegrationExecutionResult<TResponse>> ExecuteCoreAsync<TRequest, TResponse>(
        IERPIntegrationAdapter<TRequest, TResponse> adapter,
        IntegrationContext context,
        TRequest request,
        IntegrationRetryPolicy retryPolicy,
        CancellationToken cancellationToken,
        Func<TimeSpan, CancellationToken, Task>? delayAsync,
        Func<double>? jitter)
    {
        ArgumentNullException.ThrowIfNull(adapter);
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(retryPolicy);
        if (!IntegrationCodePattern().IsMatch(context.IntegrationCode ?? string.Empty) ||
            !string.Equals(adapter.IntegrationCode, context.IntegrationCode, StringComparison.Ordinal))
            return Failed<TResponse>("invalid_integration", 0, TimeSpan.Zero);
        if (context.TenantId == Guid.Empty || !IsSafeToken(context.CorrelationId, 128) || !IsSafeToken(context.IdempotencyKey, 128))
            return Failed<TResponse>("invalid_context", 0, TimeSpan.Zero);
        var policyErrors = retryPolicy.Validate();
        if (policyErrors.Count > 0) return Failed<TResponse>("invalid_retry_policy", 0, TimeSpan.Zero);
        if (context.Deadline <= DateTimeOffset.UtcNow) return Failed<TResponse>("deadline_exceeded", 0, TimeSpan.Zero);

        delayAsync ??= Task.Delay;
        jitter ??= Random.Shared.NextDouble;
        var stopwatch = Stopwatch.StartNew();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var remaining = context.Deadline - DateTimeOffset.UtcNow;
        deadline.CancelAfter(remaining);

        for (var attempt = 1; attempt <= retryPolicy.MaximumAttempts; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (DateTimeOffset.UtcNow >= context.Deadline)
                return Failed<TResponse>("deadline_exceeded", attempt - 1, stopwatch.Elapsed);

            IntegrationResult<TResponse> result;
            try
            {
                result = await adapter.ExecuteAsync(context, request, deadline.Token);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (OperationCanceledException) when (DateTimeOffset.UtcNow >= context.Deadline)
            {
                return Failed<TResponse>("deadline_exceeded", attempt, stopwatch.Elapsed);
            }
            catch (HttpRequestException)
            {
                result = new IntegrationResult<TResponse>(false, default, null, "transport_error", true);
            }
            catch (TimeoutException)
            {
                result = new IntegrationResult<TResponse>(false, default, null, "timeout", true);
            }
            catch (OperationCanceledException)
            {
                result = new IntegrationResult<TResponse>(false, default, null, "timeout", true);
            }
            catch
            {
                // Never expose adapter exception messages: they may contain request data or credentials.
                result = new IntegrationResult<TResponse>(false, default, null, "adapter_error", false);
            }

            if (result.Succeeded)
                return new(true, result.Value, result.ExternalReference, null, attempt, stopwatch.Elapsed);
            if (!result.IsRetryable || attempt == retryPolicy.MaximumAttempts)
                return new(false, default, null, NormalizeErrorCode(result.ErrorCode), attempt, stopwatch.Elapsed);

            var wait = GetRetryDelay(retryPolicy, attempt, jitter);
            var timeLeft = context.Deadline - DateTimeOffset.UtcNow;
            if (timeLeft <= TimeSpan.Zero) return Failed<TResponse>("deadline_exceeded", attempt, stopwatch.Elapsed);
            if (wait > timeLeft) wait = timeLeft;
            try
            {
                await delayAsync(wait, deadline.Token);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (OperationCanceledException)
            {
                return Failed<TResponse>("deadline_exceeded", attempt, stopwatch.Elapsed);
            }
        }

        return Failed<TResponse>("adapter_failed", retryPolicy.MaximumAttempts, stopwatch.Elapsed);
    }

    private static TimeSpan GetRetryDelay(IntegrationRetryPolicy policy, int failedAttempt, Func<double> jitter)
    {
        var multiplier = Math.Pow(2, Math.Max(0, failedAttempt - 1));
        var exponentialTicks = Math.Min((double)policy.MaximumDelay.Ticks, policy.InitialDelay.Ticks * multiplier);
        var jitterFactor = Math.Clamp(jitter(), 0, 1) * 0.2;
        var ticks = Math.Min(policy.MaximumDelay.Ticks, exponentialTicks + (long)(exponentialTicks * jitterFactor));
        return TimeSpan.FromTicks((long)ticks);
    }

    private static bool IsSafeToken(string? value, int maximumLength) =>
        !string.IsNullOrWhiteSpace(value) && value.Length <= maximumLength &&
        value.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or ':' or '-');

    private static string NormalizeErrorCode(string? value) =>
        value is not null && SafeProviderErrorCodes.Contains(value) ? value : "provider_error";

    private static IntegrationExecutionResult<T> Failed<T>(string errorCode, int attempts, TimeSpan duration) =>
        new(false, default, null, errorCode, attempts, duration);

    [GeneratedRegex("^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex IntegrationCodePattern();
}
