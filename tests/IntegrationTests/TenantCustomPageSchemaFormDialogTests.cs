using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Proje 4: the actionBar <c>formDialog</c> prop, the record dialog that Yeni (F2) and Aç (Enter) open.</summary>
public sealed class TenantCustomPageSchemaFormDialogTests
{
    private const string WrongTypeText = "'formDialog' yalnız İşlem Çubuğu'nda kullanılabilir.";
    private const string NotDialogText = "'formDialog' sayfadaki bir pencere kimliği olmalıdır: ";

    private static string V2(params object[] extra) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = new object[]
        {
            new { id = "kartlar", name = "kartlar", kind = "read", operation = "stok.kart.listele", runOn = "load",
                parameters = new object[] { new { name = "q", binding = "{{arama.value}}", type = "text" } } }
        },
        components = new object[]
        {
            new { id = "arama", type = "input", name = "arama", props = new { inputType = "text" } },
            new { id = "kod", type = "input", name = "kod", props = new { inputType = "text" } },
            new { id = "liste", type = "dataTable", name = "liste", props = new { query = "kartlar" } },
            new { id = "kartPenceresi", type = "dialog", name = "kartPenceresi", props = new { title = "Stok kartı", contains = new[] { "kod" } } },
            new { id = "ac", type = "button", props = new { label = "Aç", actionType = "openDialog", dialogId = "kartPenceresi" } },
        }.Concat(extra).ToArray()
    });

    private static object ActionBar(object props) => new { id = "komutlar", type = "actionBar", props };

    private static void AssertRejected(string json, string expected)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Equal(expected, error);
    }

    [Fact]
    public void Accepts_form_dialog_on_action_bar()
    {
        // The dialog stays openable by a button as well: formDialog does not own it.
        var json = V2(ActionBar(new { formDialog = "kartPenceresi", newInputs = new[] { "kod" }, focusInput = "arama", exportTable = "liste" }));
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
    }

    [Fact]
    public void Rejects_form_dialog_on_other_type()
    {
        AssertRejected(V2(new { id = "b2", type = "button", props = new { label = "Yeni", formDialog = "kartPenceresi" } }), WrongTypeText);
        AssertRejected(V2(new { id = "d2", type = "dialog", props = new { contains = new[] { "arama" }, formDialog = "kartPenceresi" } }), WrongTypeText);
    }

    [Fact]
    public void Rejects_form_dialog_unknown_id()
    {
        AssertRejected(V2(ActionBar(new { formDialog = "yokPencere" })), NotDialogText + "yokPencere");
        AssertRejected(V2(ActionBar(new { formDialog = "" })), NotDialogText + "?");
        AssertRejected(V2(ActionBar(new { formDialog = 3 })), NotDialogText + "?");
    }

    [Fact]
    public void Rejects_form_dialog_pointing_to_non_dialog()
    {
        AssertRejected(V2(ActionBar(new { formDialog = "liste" })), NotDialogText + "liste");
        AssertRejected(V2(ActionBar(new { formDialog = "kod" })), NotDialogText + "kod");
    }

    [Fact]
    public void Rejects_form_dialog_in_version_1()
    {
        var json = JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            components = new object[] { new { id = "komutlar", type = "heading", props = new { text = "x", formDialog = "kartPenceresi" } } }
        });
        Assert.False(TenantCustomPageSchema.Validate(json, out _));
    }
}
