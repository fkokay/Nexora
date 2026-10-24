using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace AIERP.IntegrationSDK;

/// <summary>Creates a single PayPal Orders v2 order. It never approves or captures the order.</summary>
public sealed class PayPalOrderAdapter : IERPIntegrationAdapter<JsonElement, JsonElement>
{
    private static readonly Uri SandboxEndpoint = new("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    private static readonly Uri LiveEndpoint = new("https://api-m.paypal.com/v2/checkout/orders");
    private const int MaximumResponseBytes = 128 * 1024;
    private const decimal MaximumAmount = 9_999_999.99m;
    private readonly ReadOnlyMemory<char> accessToken;
    private readonly Uri endpoint;
    private readonly HttpClient client;

    public PayPalOrderAdapter(string integrationCode, ReadOnlyMemory<char> accessToken, HttpClient client, bool liveEnvironment = false)
    {
        IntegrationCode = integrationCode;
        this.accessToken = accessToken;
        endpoint = liveEnvironment ? LiveEndpoint : SandboxEndpoint;
        this.client = client ?? throw new ArgumentNullException(nameof(client));
    }

    public string IntegrationCode { get; }

    public async Task<IntegrationResult<JsonElement>> ExecuteAsync(
        IntegrationContext context,
        JsonElement request,
        CancellationToken cancellationToken)
    {
        if (!IsSafeAccessToken(accessToken.Span))
            return Failure("authentication_failed", false);
        if (!TryBuildBody(request, out var body))
            return Failure("validation_failed", false);

        using var message = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", new string(accessToken.Span));
        message.Headers.TryAddWithoutValidation("PayPal-Request-Id", CreateProviderRequestId(context));
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
                !TryString(root, "id", 128, out var id) || !IsOrderId(id) ||
                !TryString(root, "status", 32, out var status) || status != "CREATED" ||
                !TryString(root, "intent", 16, out var intent) || intent != "CAPTURE")
                return Failure("provider_error", false);

            // Deliberately return only an opaque order reference, safe state, and the invoice ID
            // that this request supplied. Omit links, payer data, amounts, and other provider fields.
            var safeResult = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["id"] = id,
                ["status"] = status,
                ["intent"] = intent
            };
            if (TryReadMatchingInvoiceId(root, request, out var invoiceId))
                safeResult["invoiceId"] = invoiceId;
            var result = JsonSerializer.SerializeToElement(safeResult);
            return new IntegrationResult<JsonElement>(true, result, id, null, false);
        }
        catch (Exception exception) when (exception is JsonException or InvalidDataException)
        {
            return Failure("provider_error", false);
        }
    }

    private static bool TryBuildBody(JsonElement request, out string body)
    {
        body = string.Empty;
        if (request.ValueKind != JsonValueKind.Object) return false;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in request.EnumerateObject())
            if (property.Name is not ("amount" or "currency" or "description" or "invoiceId") || !seen.Add(property.Name)) return false;

        if (!TryString(request, "amount", 16, out var amountText) || !TryParseAmount(amountText, out var amount) ||
            !TryString(request, "currency", 3, out var currency) || currency.Length != 3 ||
            currency.Any(character => character is < 'A' or > 'Z')) return false;

        var purchaseUnit = new Dictionary<string, object?>
        {
            ["amount"] = new { currency_code = currency, value = amount.ToString("0.##", CultureInfo.InvariantCulture) }
        };
        if (request.TryGetProperty("description", out var description))
        {
            if (description.ValueKind != JsonValueKind.String || description.GetString()!.Length > 127 ||
                description.GetString()!.Any(char.IsControl)) return false;
            purchaseUnit["description"] = description.GetString();
        }
        if (request.TryGetProperty("invoiceId", out var invoiceId))
        {
            if (invoiceId.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(invoiceId.GetString()) ||
                invoiceId.GetString()!.Length > 127 || invoiceId.GetString()!.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not ('-' or '_' or '.')))
                return false;
            purchaseUnit["invoice_id"] = invoiceId.GetString();
        }

        body = JsonSerializer.Serialize(new { intent = "CAPTURE", purchase_units = new[] { purchaseUnit } });
        return true;
    }

    private static string CreateProviderRequestId(IntegrationContext context)
    {
        var material = Encoding.UTF8.GetBytes($"{context.TenantId:D}|{context.IntegrationCode}|{context.IdempotencyKey}");
        return Convert.ToHexString(SHA256.HashData(material).AsSpan(0, 16)).ToLowerInvariant();
    }

    private static bool IsOrderId(string id) => id.Length is >= 1 and <= 128 && id.All(char.IsAsciiLetterOrDigit);

    private static bool TryReadMatchingInvoiceId(JsonElement response, JsonElement request, out string invoiceId)
    {
        invoiceId = string.Empty;
        if (!request.TryGetProperty("invoiceId", out var requested) || requested.ValueKind != JsonValueKind.String ||
            !response.TryGetProperty("purchase_units", out var purchaseUnits) ||
            purchaseUnits.ValueKind != JsonValueKind.Array || purchaseUnits.GetArrayLength() != 1)
            return false;

        var purchaseUnit = purchaseUnits[0];
        if (purchaseUnit.ValueKind != JsonValueKind.Object ||
            !TryString(purchaseUnit, "invoice_id", 127, out var returned) ||
            returned.Length == 0 || returned.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not ('-' or '_' or '.')) ||
            !string.Equals(requested.GetString(), returned, StringComparison.Ordinal))
            return false;

        invoiceId = returned;
        return true;
    }

    private static bool TryParseAmount(string text, out decimal amount)
    {
        amount = 0;
        var separator = text.IndexOf('.');
        var whole = separator < 0 ? text : text[..separator];
        var fraction = separator < 0 ? string.Empty : text[(separator + 1)..];
        if (whole.Length is < 1 or > 7 || (whole.Length > 1 && whole[0] == '0') ||
            whole.Any(character => character is < '0' or > '9') ||
            (separator >= 0 && (fraction.Length is < 1 or > 2 || fraction.Any(character => character is < '0' or > '9'))) ||
            !decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount))
            return false;
        return amount > 0 && amount <= MaximumAmount;
    }

    private static bool IsSafeAccessToken(ReadOnlySpan<char> token)
    {
        if (token.IsEmpty || token.Length > 16 * 1024) return false;
        foreach (var character in token)
            if (!char.IsAsciiLetterOrDigit(character) && character is not ('-' or '.' or '_' or '~' or '+' or '/' or '='))
                return false;
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

    private static async Task<byte[]> ReadBoundedAsync(HttpContent content, CancellationToken cancellationToken)
    {
        if (content.Headers.ContentLength is > MaximumResponseBytes)
            throw new InvalidDataException("Payment provider response exceeded the configured limit.");
        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[16 * 1024];
        while (true)
        {
            var read = await stream.ReadAsync(buffer, cancellationToken);
            if (read == 0) break;
            if (output.Length + read > MaximumResponseBytes)
                throw new InvalidDataException("Payment provider response exceeded the configured limit.");
            output.Write(buffer, 0, read);
        }
        return output.ToArray();
    }

    private static IntegrationResult<JsonElement> Failure(string code, bool retryable) =>
        new(false, default, null, code, retryable);
}
