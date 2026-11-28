using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class JournalVoucherDocumentStandardTests
{
    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    [Fact]
    public void Belge_page_and_legacy_commands_target_the_document_screen()
    {
        var document = SystemPageStandards.All["finance-journal-voucher-document"];
        Assert.Equal(1, document.Version);
        Assert.True(TenantCustomPageSchema.Validate(document.DefinitionJson, out var error), error);
        using var json = JsonDocument.Parse(document.DefinitionJson);
        Assert.Equal("muhasebe.fis", json.RootElement.GetProperty("template").GetProperty("document").GetString());
        Assert.Equal(["code", "entryDate", "accountingBasis", "description"],
            json.RootElement.GetProperty("components")[0].GetProperty("props").GetProperty("fields").EnumerateArray().Select(x => x.GetString()).ToArray());

        var list = SystemPageStandards.All["finance-journal-ledger"];
        Assert.Equal(3, list.Version);
        Assert.NotEmpty(list.Updates);
        var rowOpen = Definition("finance-journal-ledger")["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "acDugmesi")["props"]!.AsObject();
        Assert.Equal("page", (string)rowOpen["actionType"]!);
        Assert.Equal("@finance-journal-voucher-document", (string)rowOpen["pageCode"]!);

        var create = Definition("finance-journal-vouchers")["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "komutlar")["props"]!.AsObject();
        Assert.Equal(2, SystemPageStandards.All["finance-journal-vouchers"].Version);
        Assert.NotEmpty(SystemPageStandards.All["finance-journal-vouchers"].Updates);
        Assert.Equal("@finance-journal-voucher-document", (string)create["newPageCode"]!);
    }
}
