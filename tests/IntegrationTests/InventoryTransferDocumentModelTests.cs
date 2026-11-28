using System.Net;
using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class InventoryTransferDocumentModelTests
{
    [Fact]
    public async Task Model_and_sample_expose_existing_create_void_operations_and_read_only_states()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);
        using var modelResponse = await client.GetAsync("/api/document-models/stok.transfer");
        using var model = JsonDocument.Parse(await modelResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, modelResponse.StatusCode);
        var root = model.RootElement;
        Assert.Equal("stok.transfer", root.GetProperty("code").GetString());
        Assert.Equal("depo.transfer.olustur", root.GetProperty("createOperation").GetString());
        Assert.Equal("", root.GetProperty("updateOperation").GetString());
        Assert.Equal(["Posted", "Voided"], root.GetProperty("states").EnumerateArray().Select(x => x.GetProperty("code").GetString()!).ToArray());
        Assert.Equal("depo.transfer.iptal", root.GetProperty("transitions")[0].GetProperty("operation").GetString());

        using var sampleResponse = await client.GetAsync("/api/document-models/stok.transfer/sample");
        using var sample = JsonDocument.Parse(await sampleResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, sampleResponse.StatusCode);
        Assert.Equal("TRF-ORNEK-0001", sample.RootElement.GetProperty("transfer").GetProperty("transfer").GetProperty("code").GetString());
        Assert.Equal(2, sample.RootElement.GetProperty("totals").GetProperty("lineCount").GetInt32());
        Assert.Equal(["iptal"], sample.RootElement.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()!).ToArray());
    }

    [Fact]
    public async Task Unknown_sample_state_is_rejected()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);
        using var bad = await client.GetAsync("/api/document-models/stok.transfer/sample?state=Unknown");
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }
}
