using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AIERP.IntegrationSDK;

/// <summary>Creates an unconfirmed Stripe PaymentIntent from a narrow, mapped ERP payload.</summary>
public sealed class StripePaymentIntentAdapter : IERPIntegrationAdapter<JsonElement, JsonElement>
{
    private static readonly Uri Endpoint = new("https://api.stripe.com/v1/payment_intents");
    private const int MaximumResponseBytes = 128 * 1024;
    private const long MaximumAmountMinorUnits = 99_999_999;
    private readonly ReadOnlyMemory<char> apiKey;
    private readonly HttpClient client;

    public StripePaymentIntentAdapter(string integrationCode, ReadOnlyMemory<char> apiKey, HttpClient client)
    {
        IntegrationCode = integrationCode;
        this.apiKey = apiKey;
        this.client = client ?? throw new ArgumentNullException(nameof(client));
    }

    public string IntegrationCode { get; }

    public async Task<IntegrationResult<JsonElement>> ExecuteAsync(
        IntegrationContext context,
        JsonElement request,
        CancellationToken cancellationToken)
    {
        if (apiKey.IsEmpty || apiKey.Span.IndexOfAny('\r', '\n') >= 0)
            return Failure("authentication_failed", false);
        if (!TryBuildForm(request, out var form))
            return Failure("validation_failed", false);

        using var message = new HttpRequestMessage(HttpMethod.Post, Endpoint)
        {
            Content = new FormUrlEncodedContent(form)
        };
        var basicCredentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{apiKey}:"));
        message.Headers.Authorization = new AuthenticationHeaderValue("Basic", basicCredentials);
        message.Headers.TryAddWithoutValidation("Idempotency-Key", context.IdempotencyKey);
        message.Headers.TryAddWithoutValidation("X-Correlation-ID", context.CorrelationId);

        using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var code = response.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "authentication_failed",
                HttpStatusCode.TooManyRequests => "rate_limited",
                HttpStatusCode.RequestTimeout => "temporary_unavailable",
                HttpStatusCode.BadRequest => "validation_failed",
                HttpStatusCode.Conflict => "conflict",
                _ when (int)response.StatusCode >= 500 => "temporary_unavailable",
                _ => "provider_rejected"
            };
            var retryable = response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests ||
                (int)response.StatusCode >= 500;
            return Failure(code, retryable);
        }

        try
        {
            var bytes = await ReadBoundedAsync(response.Content, cancellationToken);
            using var document = JsonDocument.Parse(bytes);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !TryString(root, "id", 128, out var id) || !id.StartsWith("pi_", StringComparison.Ordinal) ||
                !TryString(root, "status", 64, out var status) || !IsPaymentIntentStatus(status))
                return Failure("provider_error", false);

            var result = new Dictionary<string, object?> { ["id"] = id, ["status"] = status };
            if (root.TryGetProperty("amount", out var amount) && amount.ValueKind == JsonValueKind.Number && amount.TryGetInt64(out var amountValue))
                result["amount"] = amountValue;
            if (TryString(root, "currency", 3, out var currency)) result["currency"] = currency;

            return new IntegrationResult<JsonElement>(true, JsonSerializer.SerializeToElement(result), id, null, false);
        }
        catch (Exception exception) when (exception is JsonException or InvalidDataException)
        {
            return Failure("provider_error", false);
        }
    }

    private static bool TryBuildForm(JsonElement request, out List<KeyValuePair<string, string>> form)
    {
        form = [];
        if (request.ValueKind != JsonValueKind.Object) return false;
        foreach (var property in request.EnumerateObject())
            if (property.Name is not ("amount" or "currency" or "customer" or "description" or "metadata")) return false;

        if (!request.TryGetProperty("amount", out var amount) || amount.ValueKind != JsonValueKind.Number ||
            !amount.TryGetInt64(out var amountValue) || amountValue is < 1 or > MaximumAmountMinorUnits ||
            !TryString(request, "currency", 3, out var currency) ||
            currency.Length != 3 || currency.Any(character => character is < 'a' or > 'z')) return false;

        form.Add(new("amount", amountValue.ToString(CultureInfo.InvariantCulture)));
        form.Add(new("currency", currency));
        if (request.TryGetProperty("customer", out var customer))
        {
            if (customer.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(customer.GetString()) ||
                customer.GetString()!.Length > 200 || customer.GetString()!.Any(char.IsControl)) return false;
            form.Add(new("customer", customer.GetString()!));
        }
        if (request.TryGetProperty("description", out var description))
        {
            if (description.ValueKind != JsonValueKind.String || description.GetString()!.Length > 500 ||
                description.GetString()!.Any(char.IsControl)) return false;
            form.Add(new("description", description.GetString()!));
        }
        if (request.TryGetProperty("metadata", out var metadata))
        {
            if (metadata.ValueKind != JsonValueKind.Object || metadata.EnumerateObject().Count() > 50) return false;
            foreach (var property in metadata.EnumerateObject())
            {
                if (property.Name.Length is < 1 or > 40 || property.Name.Any(char.IsControl) ||
                    property.Value.ValueKind != JsonValueKind.String || property.Value.GetString()!.Length > 500)
                    return false;
                form.Add(new($"metadata[{property.Name}]", property.Value.GetString()!));
            }
        }
        return true;
    }

    private static bool TryString(JsonElement source, string name, int maximumLength, out string value)
    {
        value = string.Empty;
        if (!source.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.String) return false;
        var candidate = property.GetString();
        if (string.IsNullOrWhiteSpace(candidate) || candidate.Length > maximumLength || candidate.Any(char.IsControl)) return false;
        value = candidate;
        return true;
    }

    private static bool IsPaymentIntentStatus(string status) => status is
        "requires_payment_method" or "requires_confirmation" or "requires_action" or
        "processing" or "requires_capture" or "canceled" or "succeeded";

    private static async Task<byte[]> ReadBoundedAsync(HttpContent content, CancellationToken cancellationToken)
    {
        if (content.Headers.ContentLength is > MaximumResponseBytes) throw new InvalidDataException("Payment provider response exceeded the configured limit.");
        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[16 * 1024];
        while (true)
        {
            var read = await stream.ReadAsync(buffer, cancellationToken);
            if (read == 0) break;
            if (output.Length + read > MaximumResponseBytes) throw new InvalidDataException("Payment provider response exceeded the configured limit.");
            output.Write(buffer, 0, read);
        }
        return output.ToArray();
    }

    private static IntegrationResult<JsonElement> Failure(string code, bool retryable) =>
        new(false, default, null, code, retryable);
}
