using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Aranabilir seçim ve ilk seçenek varsayılanı: giriş özellikleri (<c>searchable</c>, <c>defaultFirst</c>, açılır listede
/// <c>optionDescriptionColumn</c>) ve süzgeç alanı öğesinin yedinci bölümü (bayraklar) ile dört sütunlu seçenek kaynağı.
/// </summary>
public sealed class TenantCustomPageSearchableSelectTests
{
    private static string V2(object[] queries, params object[] components) => JsonSerializer.Serialize(new { schemaVersion = 2, queries, components });
    private static readonly object Warehouses = new { id = "q1", name = "depolar", kind = "read", runOn = "load", parameters = Array.Empty<object>(), sql = "SELECT Id, Code, Name FROM Warehouses" };
    private static readonly object Customers = new { id = "q2", name = "musteriler", kind = "read", runOn = "load", parameters = Array.Empty<object>(), sql = "SELECT Code, Name, Type FROM CustomerAccounts" };
    private static readonly object Table = new { id = "t1", type = "dataTable", name = "liste", props = new { query = "q2", columns = new[] { "Code", "Name", "Type" } } };
    private static object Input(object props) => new { id = "i1", type = "input", name = "depo", props };
    private static object Bar(params string[] filters) => new { id = "f1", type = "filterBar", name = "suzgec", props = new { table = "t1", filters } };

    private static void AssertValid(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Accepts_searchable_select_with_description_column_and_first_default()
    {
        AssertValid(V2([Warehouses], Input(new
        {
            inputType = "select", optionsQuery = "q1", optionValueColumn = "Id", optionLabelColumn = "Code", optionDescriptionColumn = "Name",
            searchable = true, defaultFirst = true,
        })));
        AssertValid(V2([Warehouses], Input(new { inputType = "lookup", optionsQuery = "q1", defaultFirst = true })));
        AssertValid(V2([Warehouses], Input(new { inputType = "select", staticOptions = new[] { "a=A" }, searchable = false, defaultFirst = false })));
    }

    [Fact]
    public void Rejects_new_input_props_on_wrong_type_or_value()
    {
        AssertRejected(V2([Warehouses], Input(new { inputType = "lookup", optionsQuery = "q1", searchable = true })), "'searchable' yalnız açılır liste");
        AssertRejected(V2([Warehouses], Input(new { inputType = "text", searchable = true })), "'searchable' yalnız açılır liste");
        AssertRejected(V2([Warehouses], Input(new { inputType = "select", optionsQuery = "q1", searchable = "evet" })), "'searchable' yalnız açılır liste");
        AssertRejected(V2([Warehouses], Input(new { inputType = "text", defaultFirst = true })), "'defaultFirst' yalnız");
        AssertRejected(V2([Warehouses], Input(new { inputType = "checkbox", defaultFirst = true })), "'defaultFirst' yalnız");
        AssertRejected(V2([Warehouses], Input(new { inputType = "select", optionsQuery = "q1", defaultFirst = 1 })), "'defaultFirst' yalnız");
        AssertRejected(V2([Warehouses], Input(new { inputType = "select", optionsQuery = "q1", optionDescriptionColumn = "" })), "'optionDescriptionColumn' 1–128");
        AssertRejected(V2([Warehouses], Input(new { inputType = "text", optionDescriptionColumn = "Name" })), "yalnız arama kutusu");
        AssertRejected(V2([Warehouses], new { id = "h1", type = "heading", props = new { title = "x", searchable = true } }), "'searchable' yalnız açılır liste");
    }

    [Theory]
    [InlineData("Type|select|row||Tür|q1:Id:Code:Name|searchable,defaultFirst")]
    [InlineData("Type|select|row||Tür|q1:Id:Code:Name")]
    [InlineData("Type|select|row||Durum||defaultFirst")]
    [InlineData("Type|auto|more||||searchable")]
    [InlineData("Type|select|row|||q1|")]
    public void Accepts_filter_flags_and_description_column(string entry)
    {
        AssertValid(V2([Warehouses, Customers], Table, Bar(entry)));
    }

    [Theory]
    [InlineData("Type|select|row||Tür|q1|aranabilir", "anahtar|tür|yer|parametre|Etiket|seçenekler|bayraklar")]
    [InlineData("Type|select|row||Tür|q1|searchable,searchable", "anahtar|tür|yer")]
    [InlineData("Type|select|row||Tür|q1|searchable,", "anahtar|tür|yer")]
    [InlineData("Type|select|row||Tür|q1|searchable|x", "anahtar|tür|yer")]
    [InlineData("Type|text|row||Tür||searchable", "yalnız seçim süzgecinde")]
    [InlineData("Type|toggle|row||Tür||defaultFirst", "yalnız seçim süzgecinde")]
    [InlineData("Type|select|row||Tür|q1:Id:Code:Name:Extra", "okuma sorgusu olmalıdır")]
    public void Rejects_malformed_filter_flags(string entry, string contains)
    {
        AssertRejected(V2([Warehouses, Customers], Table, Bar(entry)), contains);
    }
}
