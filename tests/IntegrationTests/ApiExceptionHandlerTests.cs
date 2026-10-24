using System.Text.Json;
using AIERP.Api;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ApiExceptionHandlerTests
{
    [Fact]
    public async Task Unhandled_exception_returns_searchable_trace_id_without_exposing_exception_details()
    {
        const string traceId = "trace-id-for-support-123";
        const string privateDetail = "Sensitive SQL server and credential detail";
        var context = new DefaultHttpContext
        {
            TraceIdentifier = traceId
        };
        await using var responseBody = new MemoryStream();
        context.Response.Body = responseBody;
        var handler = new ApiExceptionHandler(NullLogger<ApiExceptionHandler>.Instance);

        var handled = await handler.TryHandleAsync(context, new InvalidOperationException(privateDetail), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.StartsWith("application/json", context.Response.ContentType, StringComparison.Ordinal);
        responseBody.Position = 0;
        using var response = await JsonDocument.ParseAsync(responseBody);
        var body = response.RootElement.GetRawText();
        Assert.Equal(traceId, response.RootElement.GetProperty("traceId").GetString());
        Assert.Equal("İstek sunucuda tamamlanamadı.", response.RootElement.GetProperty("error").GetString());
        Assert.DoesNotContain(privateDetail, body, StringComparison.Ordinal);
    }
}
