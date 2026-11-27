using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Kalıp özellikleri 2: pencere tablosunda satır eylemi, Kayıt kartında bağımlı seçici / koşullu bölüm.</summary>
public sealed class TenantCustomPageSchemaTemplateFeatures2Tests
{
    private static string SatirEylemYeri(string id) => $"Satır işlemi düğmesi pencerenin içindeki bir veri listesinin 'rowActions' listesinde olmalı: {id}.";

    private static readonly object[] Queries =
    [
        new { id = "kalemler", name = "kalemler", kind = "read", sql = "SELECT 1 AS y", parameters = Array.Empty<object>(), runOn = "load" },
        new { id = "ilceler", name = "ilceler", kind = "read", sql = "SELECT 1 AS id, 'a' AS name", runOn = "load",
            parameters = new object[] { new { name = "il", binding = "{{il.value}}", type = "text" } } }
    ];

    private static string Page(string template, object[] components) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2, ["template"] = new { name = template }, ["queries"] = Queries, ["components"] = components
    });

    private static object C(string id, string type, string slot, Dictionary<string, object?>? extra = null)
    {
        var props = new Dictionary<string, object?> { ["slot"] = slot };
        if (extra is not null) foreach (var (key, value) in extra) props[key] = value;
        return new { id, type, name = id, props };
    }

    private static Dictionary<string, object?> P(params (string Key, object? Value)[] items) => items.ToDictionary(x => x.Key, x => x.Value);

    private static object[] RecordBase(object[] sectionInputs, string tabs = "Genel=b1", Dictionary<string, object?>? section = null) =>
    [
        C("kart", "recordHeader", "summary", P(("title", "Kart"))),
        C("kartSekmeleri", "tabs", "tabs", P(("tabs", new[] { tabs }))),
        C("b1", "formCard", "section", section is null ? P(("inputs", new[] { "il", "ilce" })) : P(("inputs", new[] { "il", "ilce" })).Concat(section).ToDictionary(x => x.Key, x => x.Value)),
        .. sectionInputs
    ];

    private static object[] PickerInputs() =>
    [
        C("il", "input", "field", P(("label", "İl"), ("inputType", "select"), ("staticOptions", new[] { "Ankara=06", "İzmir=35" }), ("clearsOnChange", new[] { "ilce" }))),
        C("ilce", "input", "field", P(("label", "İlçe"), ("inputType", "select"), ("optionsQuery", "ilceler"), ("optionLabelColumn", "name"),
            ("optionValueColumn", "id"), ("disabledWhen", "il.value == ''"), ("disabledReason", "Önce il seçin.")))
    ];

    private static object[] WindowWithRowTable(string buttonSlot) =>
    [
        C("pencere", "dialog", "dialogs", P(("title", "Rota"), ("presentation", "dialog"), ("size", "lg"), ("contains", new[] { "rota" }))),
        C("rota", "dataTable", "dialog", P(("query", "kalemler"), ("rowActions", new[] { "baslat" }))),
        C("baslat", "button", buttonSlot, P(("label", "Başlat"), ("actionType", "query"), ("queryId", "kalemler")))
    ];

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string expected)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Equal(expected, error);
    }

    [Fact]
    public void Record_window_table_accepts_row_action_in_rowActions_slot() =>
        Accepted(Page("record", [.. RecordBase(PickerInputs()), .. WindowWithRowTable("rowActions")]));

    [Fact]
    public void Free_window_table_accepts_row_action_in_rowActions_slot() =>
        Accepted(Page("free", [C("blok", "section", "block", P(("title", "B"), ("members", Array.Empty<string>()))), .. WindowWithRowTable("rowActions")]));

    [Fact]
    public void Row_action_button_not_wired_to_a_window_table_is_rejected() =>
        Rejected(Page("record", [.. RecordBase(PickerInputs()), C("yalniz", "button", "rowActions", P(("label", "X"), ("actionType", "query"), ("queryId", "kalemler")))]),
            SatirEylemYeri("yalniz"));

    [Fact]
    public void Record_dependent_picker_and_conditional_section_are_accepted() =>
        Accepted(Page("record", [.. RecordBase(PickerInputs(), section: P(("visibleWhen", "il.value != ''"))), ]));
}
