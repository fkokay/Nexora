using System.Net;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class JournalVoucherDocumentModelTests
{
    [Fact]
    public async Task Model_and_sample_describe_a_read_only_posted_voucher_and_balanced_lines()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var model = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-models/muhasebe.fis"));
        Assert.Equal("muhasebe.fis", model.GetProperty("code").GetString());
        Assert.Equal(["code", "entryDate", "accountingBasis", "description"], model.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Equal(["accountId", "description", "debit", "credit"], model.GetProperty("lineColumns").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToArray());
        Assert.Empty(model.GetProperty("transitions").EnumerateArray());
        Assert.Equal("finans.fis.olustur", model.GetProperty("createOperation").GetString());
        Assert.Equal("finans.fis.belge", model.GetProperty("loadOperation").GetString());

        var sampleResponse = await client.GetAsync("/api/document-models/muhasebe.fis/sample?state=Posted");
        Assert.Equal(HttpStatusCode.OK, sampleResponse.StatusCode);
        var sample = await SalesOrderApiFactory.ReadJsonAsync(sampleResponse);
        Assert.Equal(0m, sample.GetProperty("difference").GetDecimal());
        Assert.Equal(1500m, sample.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(1500m, sample.GetProperty("totalCredit").GetDecimal());
    }
}
