using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.IntegrationSDK;

namespace AIERP.IntegrationHost;

public sealed record IntegrationHostHealthSummary(int ConfiguredAdapters, int ValidConfigurationAdapters, int InvalidConfigurationAdapters);

public sealed class IntegrationDispatcher(IConfiguration configuration, IHttpClientFactory clients, IIntegrationSecretResolver secrets)
{
    private const string StripePaymentIntentProvider = "stripe.payment-intent";
    private const string PayPalOrdersV2Provider = "paypal.orders-v2";
    private const string EDocumentIntegrationCode = "tr.e-document.submit";
    private const int MaximumPayloadBytes = 128 * 1024;
    private const int MaximumResponseBytes = 128 * 1024;

    public int ConfiguredCount => configuration.GetSection("Integrations").GetChildren()
        .Count(section => section.GetValue<bool>("Enabled"));

    public IntegrationHostHealthSummary GetHealthSummary()
    {
        var configured = configuration.GetSection("Integrations").GetChildren()
            .Where(section => section.GetValue<bool>("Enabled")).ToArray();
        var ready = configured.Count(IsReadyConfiguration);
        return new IntegrationHostHealthSummary(configured.Length, ready, configured.Length - ready);
    }

    private static bool IsReadyConfiguration(IConfigurationSection section)
    {
        // E-document delivery needs a tenant-owned provider profile and a secure
        // secret handoff contract. Host-wide settings alone must never enable it.
        if (string.Equals(section.Key, EDocumentIntegrationCode, StringComparison.Ordinal)) return false;

        var provider = section["Provider"];
        if (string.IsNullOrWhiteSpace(provider))
        {
            var allowedHosts = section.GetSection("AllowedHosts").Get<string[]>() ?? [];
            if (!TryResolveEndpoint(section["BaseUrl"], section["Path"], allowedHosts, out _)) return false;
        }
        else if (string.Equals(provider, StripePaymentIntentProvider, StringComparison.Ordinal))
        {
            if (string.IsNullOrWhiteSpace(section["CredentialSecretName"])) return false;
        }
        else if (string.Equals(provider, PayPalOrdersV2Provider, StringComparison.Ordinal))
        {
            if (string.IsNullOrWhiteSpace(section["CredentialSecretName"]) || !IsValidPayPalEnvironment(section["Environment"])) return false;
        }
        else return false;

        var retryPolicy = new IntegrationRetryPolicy(
            section.GetValue("Retry:MaximumAttempts", 3),
            TimeSpan.FromMilliseconds(section.GetValue("Retry:InitialDelayMilliseconds", 250)),
            TimeSpan.FromMilliseconds(section.GetValue("Retry:MaximumDelayMilliseconds", 2000)));
        if (retryPolicy.Validate().Count > 0) return false;

        var mappings = section.GetSection("RequestMappings").Get<IntegrationJsonFieldMapping[]>() ?? [];
        var responseMappings = section.GetSection("ResponseMappings").Get<IntegrationJsonFieldMapping[]>() ?? [];
        return HasRequiredEDocumentMappings(section.Key, mappings, responseMappings) &&
            IntegrationJsonMapper.Validate(mappings).Count == 0 &&
            IntegrationJsonMapper.Validate(responseMappings).Count == 0;
    }

    public async Task<(bool Configured, IntegrationExecutionResult<JsonElement>? Result)> ExecuteAsync(
        string integrationCode,
        IntegrationContext context,
        JsonElement payload,
        CancellationToken cancellationToken)
    {
        if (!ModuleCodeRules.IsValid(integrationCode)) return (false, null);
        var section = configuration.GetSection($"Integrations:{integrationCode}");
        if (!section.GetValue<bool>("Enabled")) return (false, null);
        // There is deliberately no e-document tenant-profile/secret-ingress contract
        // yet. Fail closed even if an operator has configured a generic host adapter.
        if (string.Equals(integrationCode, EDocumentIntegrationCode, StringComparison.Ordinal))
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "invalid_integration", 0, TimeSpan.Zero));
        if (payload.ValueKind != JsonValueKind.Object || Encoding.UTF8.GetByteCount(payload.GetRawText()) > MaximumPayloadBytes)
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "validation_failed", 0, TimeSpan.Zero));
        var provider = section["Provider"];
        if (!string.IsNullOrWhiteSpace(provider) && provider is not (StripePaymentIntentProvider or PayPalOrdersV2Provider))
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "invalid_integration", 0, TimeSpan.Zero));
        if (string.Equals(provider, PayPalOrdersV2Provider, StringComparison.Ordinal) && !IsValidPayPalEnvironment(section["Environment"]))
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "invalid_integration", 0, TimeSpan.Zero));
        var responseMappings = section.GetSection("ResponseMappings").Get<IntegrationJsonFieldMapping[]>() ?? [];
        var requestMappings = section.GetSection("RequestMappings").Get<IntegrationJsonFieldMapping[]>() ?? [];
        if (!HasRequiredEDocumentMappings(integrationCode, requestMappings, responseMappings))
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "invalid_integration", 0, TimeSpan.Zero));
        if (IntegrationJsonMapper.Validate(responseMappings).Count > 0)
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "mapping_failed", 0, TimeSpan.Zero));

        Uri? endpoint = null;
        if (string.IsNullOrWhiteSpace(provider))
        {
            var allowedHosts = section.GetSection("AllowedHosts").Get<string[]>() ?? [];
            if (!TryResolveEndpoint(section["BaseUrl"], section["Path"], allowedHosts, out endpoint))
                return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "invalid_integration", 0, TimeSpan.Zero));
        }

        JsonElement providerPayload;
        try
        {
            providerPayload = IntegrationJsonMapper.Map(payload, requestMappings);
        }
        catch (IntegrationJsonMappingException)
        {
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "mapping_failed", 0, TimeSpan.Zero));
        }

        ReadOnlyMemory<char> secret = ReadOnlyMemory<char>.Empty;
        var secretName = section["CredentialSecretName"];
        if (!string.IsNullOrWhiteSpace(secretName))
        {
            try
            {
                secret = await secrets.ResolveAsync(context.TenantId, new IntegrationCredentialReference(secretName), cancellationToken);
            }
            catch (FileNotFoundException)
            {
                return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "authentication_failed", 0, TimeSpan.Zero));
            }
            if (secret.IsEmpty) return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "authentication_failed", 0, TimeSpan.Zero));
        }

        var client = clients.CreateClient("integration-outbound");
        IERPIntegrationAdapter<JsonElement, JsonElement> adapter = provider switch
        {
            StripePaymentIntentProvider => new StripePaymentIntentAdapter(integrationCode, secret, client),
            PayPalOrdersV2Provider => new PayPalOrderAdapter(integrationCode, secret, client, string.Equals(section["Environment"], "live", StringComparison.Ordinal)),
            _ => new ConfiguredHttpJsonAdapter(integrationCode, endpoint!, section["CredentialHeaderName"] ?? "Authorization",
                section["CredentialScheme"] ?? "Bearer", secret, client, MaximumResponseBytes)
        };
        var retryPolicy = new IntegrationRetryPolicy(
            section.GetValue("Retry:MaximumAttempts", 3),
            TimeSpan.FromMilliseconds(section.GetValue("Retry:InitialDelayMilliseconds", 250)),
            TimeSpan.FromMilliseconds(section.GetValue("Retry:MaximumDelayMilliseconds", 2000)));
        var result = await IntegrationAdapterExecutor.ExecuteAsync(adapter, context, providerPayload, retryPolicy, cancellationToken);
        if (result.Succeeded && responseMappings.Length > 0)
        {
            try
            {
                var mapped = IntegrationJsonMapper.Map(result.Value, responseMappings);
                result = result with { Value = mapped };
            }
            catch (IntegrationJsonMappingException)
            {
                result = result with { Succeeded = false, Value = default, ErrorCode = "mapping_failed" };
            }
        }
        return (true, result);
    }

    private static bool HasRequiredEDocumentMappings(
        string integrationCode,
        IReadOnlyCollection<IntegrationJsonFieldMapping> requestMappings,
        IReadOnlyCollection<IntegrationJsonFieldMapping> responseMappings) =>
        !string.Equals(integrationCode, EDocumentIntegrationCode, StringComparison.Ordinal) ||
        (requestMappings.Count > 0 && responseMappings.Count > 0);

    private static bool TryResolveEndpoint(string? baseUrl, string? path, IReadOnlyCollection<string> allowedHosts, out Uri endpoint)
    {
        endpoint = null!;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri) || baseUri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(baseUri.UserInfo) || !string.IsNullOrEmpty(baseUri.Query) || !string.IsNullOrEmpty(baseUri.Fragment) ||
            !allowedHosts.Contains(baseUri.IdnHost, StringComparer.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(path) ||
            path.StartsWith('/') || path.Contains('\\') || path.Contains('?') || path.Contains('#') ||
            path.Split('/').Any(segment => segment is "." or ".." || IsEncodedTraversal(segment)) ||
            !baseUri.AbsolutePath.EndsWith("/", StringComparison.Ordinal)) return false;
        if (!Uri.TryCreate(baseUri, path, out var candidate) || candidate.Scheme != Uri.UriSchemeHttps ||
            !string.Equals(candidate.IdnHost, baseUri.IdnHost, StringComparison.OrdinalIgnoreCase) ||
            !candidate.AbsolutePath.StartsWith(baseUri.AbsolutePath, StringComparison.Ordinal)) return false;
        endpoint = candidate;
        return true;
    }

    private static bool IsEncodedTraversal(string segment)
    {
        if (!segment.Contains('%')) return false;
        try
        {
            var decoded = segment;
            for (var i = 0; i < 3 && decoded.Contains('%'); i++)
            {
                decoded = Uri.UnescapeDataString(decoded);
                if (decoded is "." or ".." || decoded.Contains('/') || decoded.Contains('\\')) return true;
            }
            return decoded is "." or ".." || decoded.Contains('/') || decoded.Contains('\\');
        }
        catch (UriFormatException)
        {
            return true;
        }
    }

    private static bool IsValidPayPalEnvironment(string? environment) => environment is null or "sandbox" or "live";

    private sealed class ConfiguredHttpJsonAdapter(
        string integrationCode,
        Uri endpoint,
        string credentialHeaderName,
        string credentialScheme,
        ReadOnlyMemory<char> secret,
        HttpClient client,
        int maximumResponseBytes) : IERPIntegrationAdapter<JsonElement, JsonElement>
    {
        public string IntegrationCode => integrationCode;

        public async Task<IntegrationResult<JsonElement>> ExecuteAsync(IntegrationContext context, JsonElement request, CancellationToken cancellationToken)
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(request)
            };
            message.Headers.TryAddWithoutValidation("Idempotency-Key", context.IdempotencyKey);
            message.Headers.TryAddWithoutValidation("X-Correlation-ID", context.CorrelationId);
            if (!secret.IsEmpty)
            {
                var credential = new string(secret.Span);
                if (credential.Contains('\r') || credential.Contains('\n'))
                    return new IntegrationResult<JsonElement>(false, default, null, "authentication_failed", false);
                var headerValue = string.Equals(credentialHeaderName, "Authorization", StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(credentialScheme) ? $"{credentialScheme} {credential}" : credential;
                if (!message.Headers.TryAddWithoutValidation(credentialHeaderName, headerValue))
                    return new IntegrationResult<JsonElement>(false, default, null, "authentication_failed", false);
            }

            using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var code = response.StatusCode switch
                {
                    System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden => "authentication_failed",
                    System.Net.HttpStatusCode.TooManyRequests => "rate_limited",
                    System.Net.HttpStatusCode.RequestTimeout => "temporary_unavailable",
                    System.Net.HttpStatusCode.BadRequest => "validation_failed",
                    System.Net.HttpStatusCode.Conflict => "conflict",
                    System.Net.HttpStatusCode.NotFound => "not_found",
                    _ when (int)response.StatusCode >= 500 => "temporary_unavailable",
                    _ => "provider_rejected"
                };
                var retryable = response.StatusCode is System.Net.HttpStatusCode.RequestTimeout or System.Net.HttpStatusCode.TooManyRequests
                    || (int)response.StatusCode >= 500;
                return new IntegrationResult<JsonElement>(false, default, null, code, retryable);
            }

            var bytes = await ReadBoundedAsync(response.Content, maximumResponseBytes, cancellationToken);
            JsonElement responseValue;
            if (bytes.Length == 0) responseValue = JsonSerializer.SerializeToElement<object?>(null);
            else
            {
                using var document = JsonDocument.Parse(bytes);
                responseValue = document.RootElement.Clone();
            }
            var reference = response.Headers.TryGetValues("X-External-Reference", out var values)
                ? values.FirstOrDefault(value => value.Length <= 200 && !value.Any(char.IsControl))
                : null;
            return new IntegrationResult<JsonElement>(true, responseValue, reference, null, false);
        }

        private static async Task<byte[]> ReadBoundedAsync(HttpContent content, int maximumBytes, CancellationToken cancellationToken)
        {
            if (content.Headers.ContentLength is > 0 and var length && length > maximumBytes)
                throw new InvalidDataException("Integration provider response exceeds the configured limit.");
            await using var stream = await content.ReadAsStreamAsync(cancellationToken);
            using var output = new MemoryStream();
            var buffer = new byte[16 * 1024];
            while (true)
            {
                var read = await stream.ReadAsync(buffer, cancellationToken);
                if (read == 0) break;
                if (output.Length + read > maximumBytes) throw new InvalidDataException("Integration provider response exceeds the configured limit.");
                output.Write(buffer, 0, read);
            }
            return output.ToArray();
        }
    }
}

public static class IntegrationExecutionEndpoint
{
    public static void MapIntegrationExecution(this WebApplication app)
    {
        app.MapPost("/internal/integrations/execute", async (
            IntegrationHostExecuteRequest request,
            ClaimsPrincipal caller,
            IntegrationDispatcher dispatcher,
            CancellationToken cancellationToken) =>
        {
            if (!Guid.TryParse(caller.FindFirstValue("tenant_id"), out var tenantId) ||
                !string.Equals(caller.FindFirstValue("integration_code"), request.IntegrationCode, StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(request.IntegrationCode) || string.IsNullOrWhiteSpace(request.IdempotencyKey) ||
                string.IsNullOrWhiteSpace(request.CorrelationId) || request.Payload.ValueKind != JsonValueKind.Object)
                return Results.BadRequest(new { errorCode = "invalid_context" });
            if (request.Deadline <= DateTimeOffset.UtcNow || request.Deadline > DateTimeOffset.UtcNow.AddMinutes(1))
                return Results.BadRequest(new { errorCode = "invalid_deadline" });

            var context = new IntegrationContext(tenantId, request.IntegrationCode, request.CorrelationId,
                request.IdempotencyKey, request.Deadline);
            var (configured, result) = await dispatcher.ExecuteAsync(request.IntegrationCode, context, request.Payload, cancellationToken);
            if (!configured) return Results.NotFound(new { errorCode = "integration_not_configured" });
            if (result is null) return Results.Problem("Adapter sonucu yok.", statusCode: StatusCodes.Status502BadGateway);
            JsonElement? value = result.Value.ValueKind == JsonValueKind.Undefined ? null : result.Value;
            var body = new IntegrationHostExecuteResponse(result.Succeeded, value, result.ExternalReference,
                result.ErrorCode, result.Attempts, DateTimeOffset.UtcNow);
            if (result.Succeeded) return Results.Ok(body);
            return result.ErrorCode switch
            {
                "deadline_exceeded" => Results.Json(body, statusCode: StatusCodes.Status504GatewayTimeout),
                "validation_failed" or "invalid_context" or "invalid_retry_policy" or "invalid_integration" or "mapping_failed" => Results.UnprocessableEntity(body),
                _ => Results.Json(body, statusCode: StatusCodes.Status502BadGateway)
            };
        }).RequireAuthorization("IntegrationExecution").RequireRateLimiting("integration-execute");
    }
}

internal static class ModuleCodeRules
{
    private static readonly Regex Pattern = new("^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$", RegexOptions.CultureInvariant);

    public static bool IsValid(string? value)
    {
        var candidate = value ?? string.Empty;
        return candidate.Length <= 60 && Pattern.IsMatch(candidate);
    }
}
