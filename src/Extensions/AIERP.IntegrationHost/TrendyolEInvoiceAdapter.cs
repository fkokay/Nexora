using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.IntegrationSDK;

namespace AIERP.IntegrationHost;

internal sealed class TrendyolEInvoiceAdapter(
    ReadOnlyMemory<char> credentialsJson,
    TrendyolEInvoiceMappingProfile profile,
    HttpClient client) : IERPIntegrationAdapter<JsonElement, JsonElement>
{
    private const string ReservedIntegrationCode = "tr.e-document.submit";
    private const string Gateway = "https://stage-apigateway.trendyolefaturam.com/";
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    public string IntegrationCode => ReservedIntegrationCode;

    public async Task<IntegrationResult<JsonElement>> ExecuteAsync(IntegrationContext context, JsonElement payload, CancellationToken cancellationToken)
    {
        if (payload.ValueKind != JsonValueKind.Object)
            return Failure("validation_failed", false);
        if (payload.TryGetProperty("action", out var action) && action.ValueKind == JsonValueKind.String && action.GetString() == "get-status")
        {
            if (!payload.TryGetProperty("documentType", out var typeValue) || typeValue.ValueKind != JsonValueKind.String ||
                typeValue.GetString() is not ("e-invoice" or "e-archive" or "e-dispatch") ||
                !payload.TryGetProperty("documentUuid", out var uuidValue) || uuidValue.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(uuidValue.GetString(), out var documentUuid) || documentUuid == Guid.Empty ||
                !Guid.TryParse(context.CorrelationId, out var operationId) || operationId != documentUuid)
                return Failure("validation_failed", false);
            return await GetStatusAsync(documentUuid, typeValue.GetString()!, cancellationToken);
        }
        EDocumentSubmissionRequest? request;
        try { request = JsonSerializer.Deserialize<EDocumentSubmissionRequest>(payload.GetRawText(), WebJson); }
        catch (JsonException) { return Failure("validation_failed", false); }
        if (request is null || request.DocumentType is not ("e-invoice" or "e-archive"))
            return Failure("unsupported_document_type", false);
        if (!Guid.TryParse(context.CorrelationId, out var expectedInvoiceUuid) || expectedInvoiceUuid == Guid.Empty)
            return Failure("invalid_context", false);

        JsonElement outgoing;
        try { outgoing = TrendyolEInvoiceWirePayloadBuilder.Build(request, profile, expectedInvoiceUuid); }
        catch (InvalidOperationException) { return Failure("validation_failed", false); }

        TrendyolCredentials? credentials;
        try { credentials = JsonSerializer.Deserialize<TrendyolCredentials>(credentialsJson.Span, WebJson); }
        catch (JsonException) { return Failure("authentication_failed", false); }
        if (credentials is null || string.IsNullOrWhiteSpace(credentials.Email) || string.IsNullOrWhiteSpace(credentials.Password))
            return Failure("authentication_failed", false);

        using var signInRequest = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(Gateway), "api/auth/signin"))
        {
            Content = JsonContent.Create(new { email = credentials.Email, password = credentials.Password }, options: WebJson)
        };
        using var signInResponse = await SendAsync(signInRequest, cancellationToken);
        if (!signInResponse.IsSuccessStatusCode)
            return Failure(signInResponse.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ? "authentication_failed" : "temporary_unavailable",
                signInResponse.StatusCode is not (HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden));
        if (!signInResponse.Headers.TryGetValues("x-access-token", out var tokenValues))
            return Failure("authentication_failed", false);
        var accessToken = tokenValues.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(accessToken) || accessToken.Length > 16_384 || accessToken.Any(char.IsControl))
            return Failure("authentication_failed", false);

        using var invoiceRequest = new HttpRequestMessage(HttpMethod.Post,
            new Uri(new Uri(Gateway), "api/invoice/documents/outgoing-einvoice"))
        {
            Content = JsonContent.Create(outgoing, options: WebJson)
        };
        invoiceRequest.Headers.TryAddWithoutValidation("x-access-token", accessToken);
        using var invoiceResponse = await SendAsync(invoiceRequest, cancellationToken);
        if (!invoiceResponse.IsSuccessStatusCode)
        {
            var ambiguous = (int)invoiceResponse.StatusCode >= 500 || invoiceResponse.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests;
            return Failure(ambiguous ? "temporary_unavailable" : invoiceResponse.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "authentication_failed",
                HttpStatusCode.Conflict => "conflict",
                HttpStatusCode.UnprocessableEntity or HttpStatusCode.BadRequest => "validation_failed",
                _ => "provider_rejected"
            }, ambiguous);
        }

        try
        {
            var bytes = await ReadBoundedAsync(invoiceResponse.Content, 128 * 1024, cancellationToken);
            using var responseDocument = JsonDocument.Parse(bytes);
            var value = responseDocument.RootElement.Clone();
            var expectedScenario = outgoing.GetProperty("invoiceInfo").GetProperty("invoiceType").GetString();
            if (value.ValueKind != JsonValueKind.Object ||
                !value.TryGetProperty("invoiceUuid", out var responseInvoiceUuid) ||
                responseInvoiceUuid.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(responseInvoiceUuid.GetString(), out var parsedInvoiceUuid) || parsedInvoiceUuid != expectedInvoiceUuid ||
                !value.TryGetProperty("scenario", out var responseScenario) || responseScenario.ValueKind != JsonValueKind.String ||
                responseScenario.GetString() != expectedScenario)
                return Failure("provider_error", true);
            var externalReference = parsedInvoiceUuid.ToString("D");
            return new IntegrationResult<JsonElement>(true, value, externalReference, null, false);
        }
        catch (JsonException) { return Failure("provider_error", true); }
        catch (InvalidDataException) { return Failure("provider_error", true); }
    }

    public async Task<IntegrationResult<JsonElement>> GetStatusAsync(Guid documentUuid, string documentType, CancellationToken cancellationToken)
    {
        if (documentUuid == Guid.Empty || documentType is not ("e-invoice" or "e-archive" or "e-dispatch"))
            return Failure("validation_failed", false);
        TrendyolCredentials? credentials;
        try { credentials = JsonSerializer.Deserialize<TrendyolCredentials>(credentialsJson.Span, WebJson); }
        catch (JsonException) { return Failure("authentication_failed", false); }
        if (credentials is null || string.IsNullOrWhiteSpace(credentials.Email) || string.IsNullOrWhiteSpace(credentials.Password))
            return Failure("authentication_failed", false);

        using var signInRequest = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(Gateway), "api/auth/signin"))
        {
            Content = JsonContent.Create(new { email = credentials.Email, password = credentials.Password }, options: WebJson)
        };
        using var signInResponse = await SendAsync(signInRequest, cancellationToken);
        if (!signInResponse.IsSuccessStatusCode)
            return Failure(signInResponse.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ? "authentication_failed" : "temporary_unavailable",
                signInResponse.StatusCode is not (HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden));
        if (!signInResponse.Headers.TryGetValues("x-access-token", out var tokenValues))
            return Failure("authentication_failed", false);
        var accessToken = tokenValues.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(accessToken) || accessToken.Length > 16_384 || accessToken.Any(char.IsControl))
            return Failure("authentication_failed", false);

        var statusPath = documentType == "e-dispatch"
            ? "api/invoice/documents/outgoing-despatch-advice/status/"
            : "api/invoice/documents/outgoing-einvoice/status/";
        using var statusRequest = new HttpRequestMessage(HttpMethod.Get,
            new Uri(new Uri(Gateway), $"{statusPath}{documentUuid:D}"));
        statusRequest.Headers.TryAddWithoutValidation("x-access-token", accessToken);
        using var statusResponse = await SendAsync(statusRequest, cancellationToken);
        if (!statusResponse.IsSuccessStatusCode)
        {
            var ambiguous = (int)statusResponse.StatusCode >= 500 || statusResponse.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests;
            return Failure(ambiguous ? "temporary_unavailable" : statusResponse.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "authentication_failed",
                HttpStatusCode.NotFound => "provider_status_not_found",
                _ => "provider_rejected"
            }, ambiguous);
        }

        try
        {
            var bytes = await ReadBoundedAsync(statusResponse.Content, 32 * 1024, cancellationToken);
            using var responseDocument = JsonDocument.Parse(bytes);
            var value = responseDocument.RootElement;
            var uuidProperty = documentType == "e-dispatch" ? "despatchAdviceUuid" : "invoiceUuid";
            if (value.ValueKind != JsonValueKind.Object ||
                !value.TryGetProperty(uuidProperty, out var responseUuid) || responseUuid.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(responseUuid.GetString(), out var parsedUuid) || parsedUuid != documentUuid ||
                !value.TryGetProperty("status", out var providerStatus) || !providerStatus.TryGetInt32(out var statusCode) ||
                statusCode is not (10 or 20 or 29 or 30 or 40 or 50 or 100 or 105 or 200 or 205 or 305 or 405))
                return Failure("provider_error", true);

            int? gibStatusCode = value.TryGetProperty("gibStatusCode", out var gib) && gib.TryGetInt32(out var parsedGib) ? parsedGib : null;
            var gibStatus = value.TryGetProperty("gibStatus", out var gibText) && gibText.ValueKind == JsonValueKind.String
                ? gibText.GetString() : null;
            if (gibStatus is not (null or "REPORTED" or "READY_TO_BE_REPORTED")) return Failure("provider_error", true);
            string? replyLookupStatus = null;
            JsonElement? sentReply = null;
            if (documentType == "e-invoice" && statusCode == 50)
            {
                var reply = await GetSentReplyAsync(documentUuid, accessToken, cancellationToken);
                replyLookupStatus = reply.Status;
                sentReply = reply.Value;
            }
            var result = JsonSerializer.SerializeToElement(new
            {
                documentType,
                documentUuid = parsedUuid,
                status = statusCode,
                gibStatusCode,
                gibStatus,
                replyLookupStatus,
                sentReply
            }, WebJson);
            return new IntegrationResult<JsonElement>(true, result, parsedUuid.ToString("D"), null, false);
        }
        catch (JsonException) { return Failure("provider_error", true); }
        catch (InvalidDataException) { return Failure("provider_error", true); }
    }

    private async Task<(string Status, JsonElement? Value)> GetSentReplyAsync(
        Guid invoiceUuid, string accessToken, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get,
            new Uri(new Uri(Gateway), $"api/invoice/documents/sent-reply/{profile.CompanyId}/{invoiceUuid:D}"));
        request.Headers.TryAddWithoutValidation("x-access-token", accessToken);
        using var response = await SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return ("not_found", null);
        if (!response.IsSuccessStatusCode) return ("unavailable", null);

        try
        {
            var bytes = await ReadBoundedAsync(response.Content, 32 * 1024, cancellationToken);
            using var document = JsonDocument.Parse(bytes);
            var value = document.RootElement;
            if (value.ValueKind != JsonValueKind.Object ||
                !value.TryGetProperty("invoiceUuid", out var responseUuid) || responseUuid.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(responseUuid.GetString(), out var parsedUuid) || parsedUuid != invoiceUuid ||
                !value.TryGetProperty("responseType", out var responseType) || responseType.ValueKind != JsonValueKind.String ||
                responseType.GetString() is not ("APPROVED" or "AUTO_APPROVED" or "DENIED" or "RETURNED"))
                return ("invalid_response", null);

            var issuedAt = value.TryGetProperty("issuedAt", out var issuedAtValue) && issuedAtValue.ValueKind == JsonValueKind.String &&
                DateTimeOffset.TryParse(issuedAtValue.GetString(), System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.RoundtripKind, out var parsedIssuedAt)
                ? parsedIssuedAt : (DateTimeOffset?)null;
            return ("found", JsonSerializer.SerializeToElement(new
            {
                responseType = responseType.GetString(),
                issuedAt,
                replyStatus = value.TryGetProperty("replyStatus", out var replyStatusValue) && replyStatusValue.TryGetInt32(out var parsedReplyStatus)
                    ? parsedReplyStatus : (int?)null,
                gibStatus = value.TryGetProperty("gibStatus", out var gibStatusValue) && gibStatusValue.TryGetInt32(out var parsedGibStatus)
                    ? parsedGibStatus : (int?)null
            }, WebJson));
        }
        catch (JsonException) { return ("invalid_response", null); }
        catch (InvalidDataException) { return ("invalid_response", null); }
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        try { return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken); }
        catch (HttpRequestException) { return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable); }
    }

    private static async Task<byte[]> ReadBoundedAsync(HttpContent content, int maximumBytes, CancellationToken cancellationToken)
    {
        if (content.Headers.ContentLength is long contentLength && contentLength > maximumBytes) throw new InvalidDataException();
        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        while (true)
        {
            var read = await stream.ReadAsync(chunk, cancellationToken);
            if (read == 0) break;
            if (buffer.Length + read > maximumBytes) throw new InvalidDataException();
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }

    private static IntegrationResult<JsonElement> Failure(string code, bool retryable) =>
        new(false, default, null, code, retryable);

    private sealed record TrendyolCredentials(string Email, string Password);
}
