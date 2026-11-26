using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Sub-project 5a: the six optional props used by the component panels.</summary>
public sealed class TenantCustomPageSchemaComponentPanelTests
{
    private static string Page(object component, int version = 2) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = version,
        ["components"] = new[] { component }
    });

    private static object Comp(string type, object props) => new { id = "c1", type, name = "c1", props };

    private static void Accepted(object component) => Assert.True(TenantCustomPageSchema.Validate(Page(component), out var error), error);

    private static void Rejected(object component, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(Page(component), out var error));
        Assert.Contains(contains, error);
    }

    private const string AlignMessage = "'textAlign' yalnız metin bileşenlerinde start veya center olabilir.";
    private const string ItemsMessage = "Liste, bilgi ve bildirim bileşeni en fazla 40 metin öğesi içerebilir.";
    private const string DismissMessage = "'dismissible' yalnız bildirim ve bilgi kartında true veya false olabilir.";
    private const string CompareMessage = "'compareValue' yalnız göstergede en fazla 200 karakterlik metin olabilir.";
    private const string MetricSizeMessage = "Göstergede 'size' sm veya lg olmalıdır.";
    private const string TotalMessage = "'progressTotal' yalnız ilerleme göstergesinde en fazla 200 karakterlik metin olabilir.";

    [Fact]
    public void Text_align_is_accepted_on_text_components()
    {
        foreach (var type in new[] { "heading", "text", "label", "section" })
            foreach (var align in new[] { "start", "center" })
                Accepted(Comp(type, new { text = "x", textAlign = align }));
    }

    [Fact]
    public void Text_align_is_rejected_on_other_components_and_values()
    {
        Rejected(Comp("metric", new { title = "t", value = "1", textAlign = "center" }), AlignMessage);
        Rejected(Comp("heading", new { text = "x", textAlign = "end" }), AlignMessage);
        Rejected(Comp("heading", new { text = "x", textAlign = 1 }), AlignMessage);
    }

    [Fact]
    public void Items_are_accepted_on_alert_and_card()
    {
        Accepted(Comp("alert", new { text = "x", items = new[] { "a", "b" } }));
        Accepted(Comp("card", new { title = "x", items = new[] { "a" } }));
        Accepted(Comp("list", new { items = new[] { "a" } }));
        Rejected(Comp("heading", new { text = "x", items = new[] { "a" } }), ItemsMessage);
    }

    [Fact]
    public void Items_over_40_are_rejected_with_new_message()
    {
        Accepted(Comp("alert", new { text = "x", items = Enumerable.Repeat("a", 40).ToArray() }));
        // The generic prop check (arrays of at most 40 strings) rejects these first, with its own message.
        Assert.False(TenantCustomPageSchema.Validate(Page(Comp("alert", new { text = "x", items = Enumerable.Repeat("a", 41).ToArray() })), out _));
        Assert.False(TenantCustomPageSchema.Validate(Page(Comp("card", new { title = "x", items = new object[] { "a", 1 } })), out _));
        // A non-array value reaches the items rule and gets the new message.
        Rejected(Comp("alert", new { text = "x", items = "a" }), ItemsMessage);
    }

    [Fact]
    public void Dismissible_must_be_bool_on_alert_or_card()
    {
        Accepted(Comp("alert", new { text = "x", dismissible = true }));
        Accepted(Comp("card", new { title = "x", dismissible = false }));
        Rejected(Comp("alert", new { text = "x", dismissible = "yes" }), DismissMessage);
        Rejected(Comp("heading", new { text = "x", dismissible = true }), DismissMessage);
    }

    [Fact]
    public void Compare_value_and_progress_total_accept_bindings_up_to_200_chars()
    {
        Accepted(Comp("metric", new { title = "t", value = "{{q1.rows[0].a}}", compareValue = "{{q1.rows[0].b}}" }));
        Accepted(Comp("progress", new { value = "{{q1.rows[0].a}}", progressTotal = "{{q1.rows[0].b}}" }));
        var longBinding = "{{q1.rows[0].b}}" + new string('x', 184);
        Assert.Equal(200, longBinding.Length);
        Accepted(Comp("metric", new { title = "t", value = "1", compareValue = longBinding }));
        Rejected(Comp("metric", new { title = "t", value = "1", compareValue = longBinding + "x" }), CompareMessage);
        Rejected(Comp("progress", new { value = "1", progressTotal = longBinding + "x" }), TotalMessage);
        Rejected(Comp("metric", new { title = "t", value = "1", progressTotal = "5" }), TotalMessage);
        Rejected(Comp("progress", new { value = "1", compareValue = "5" }), CompareMessage);
        Rejected(Comp("metric", new { title = "t", value = "1", compareValue = 5 }), CompareMessage);
    }

    [Fact]
    public void Metric_size_accepts_sm_and_lg_only()
    {
        Accepted(Comp("metric", new { title = "t", value = "1", size = "sm" }));
        Accepted(Comp("metric", new { title = "t", value = "1", size = "lg" }));
        Rejected(Comp("metric", new { title = "t", value = "1", size = "md" }), MetricSizeMessage);
        Rejected(Comp("metric", new { title = "t", value = "1", size = "xl" }), MetricSizeMessage);
    }

    [Fact]
    public void Dialog_size_rules_are_unchanged()
    {
        var dialog = new { id = "d1", type = "dialog", name = "d1", props = new { contains = new[] { "c1" }, size = "xl" } };
        var inner = new { id = "c1", type = "text", name = "c1", props = new { text = "x" } };
        var json = JsonSerializer.Serialize(new Dictionary<string, object?> { ["schemaVersion"] = 2, ["components"] = new object[] { dialog, inner } });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        var bad = json.Replace("\"xl\"", "\"huge\"");
        Assert.False(TenantCustomPageSchema.Validate(bad, out error));
        Assert.Contains("'size' sm, md, lg, xl veya full olmalıdır.", error);
    }

    [Fact]
    public void V1_page_with_new_props_is_rejected()
    {
        foreach (var component in new object[]
        {
            Comp("heading", new { text = "x", textAlign = "center" }),
            Comp("alert", new { text = "x", dismissible = true }),
            Comp("metric", new { title = "t", value = "1", compareValue = "2" }),
            Comp("progress", new { value = "1", progressTotal = "2" })
        })
            Assert.False(TenantCustomPageSchema.Validate(Page(component, 1), out _));
    }
}
