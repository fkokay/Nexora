using AIERP.AIService.AI;

namespace AIERP.Platform.UnitTests;

public sealed class UiDesignPlanRulesTests
{
    [Fact]
    public void Renderer_generates_responsive_accessible_component_from_allowlisted_schema()
    {
        var plan = new UiDesignPlan("Cari özeti", "Cari kaydını inceleyin.",
            [new UiDesignSection("Genel bilgiler", "Temel cari alanları.", "two-column",
                [new UiDesignElement("text", "Cari kodu", "C-100", []),
                 new UiDesignElement("select", "Durum", "Durum seçin", ["Aktif", "Pasif"]),
                 new UiDesignElement("table", "Son hareketler", null, ["Tarih", "Tutar"])])],
            [new UiDesignAction("Kaydet", "primary")], ["Dar görünümde alanlar tek sütuna geçer."], ["Her form alanı görünür bir etikete sahiptir."]);

        var source = UiDesignPlanRules.RenderReactComponent(plan);

        Assert.Contains("export default function DesignedErpScreen()", source);
        Assert.Contains("htmlFor={\"nds-field-0-0\"}", source);
        Assert.Contains("@media(max-width:720px)", source);
        Assert.Contains("scope=\"col\"", source);
        Assert.Contains("nds-primary", source);
        Assert.DoesNotContain("dangerouslySetInnerHTML", source);
    }

    [Fact]
    public void Renderer_keeps_untrusted_design_strings_inside_javascript_literals()
    {
        var hostile = "</h1><script>alert(1)</script>";
        var plan = new UiDesignPlan(hostile, "Description", [
            new UiDesignSection("Section", "Description", "single", [new UiDesignElement("text", hostile, hostile, [])])],
            [], ["Mobile responsive"], ["Labeled input"]);

        var source = UiDesignPlanRules.RenderReactComponent(plan);

        Assert.Contains("<h1>{" + System.Text.Json.JsonSerializer.Serialize(hostile) + "}</h1>", source);
        Assert.Contains("{" + System.Text.Json.JsonSerializer.Serialize(hostile) + "}", source);
    }

    [Fact]
    public void Validator_rejects_unknown_components_empty_screens_and_excessive_elements()
    {
        var empty = new UiDesignPlan("Title", "", [], [], ["Mobile layout"], ["Labeled controls"]);
        var unsupported = new UiDesignPlan("Title", "", [new UiDesignSection("Section", "", "single",
            [new UiDesignElement("script", "Execute", null, [])])], [], ["Mobile layout"], ["Labeled controls"]);
        var tooMany = new UiDesignPlan("Title", "", Enumerable.Range(0, 5).Select(_ => new UiDesignSection("Section", "", "single",
            Enumerable.Range(0, 10).Select(_ => new UiDesignElement("text", "Field", null, [])).ToArray())).ToArray(),
            [], ["Mobile layout"], ["Labeled controls"]);

        Assert.Throws<AIProviderResponseException>(() => UiDesignPlanRules.Validate(empty));
        Assert.Throws<AIProviderResponseException>(() => UiDesignPlanRules.Validate(unsupported));
        Assert.Throws<AIProviderResponseException>(() => UiDesignPlanRules.Validate(tooMany));
    }
}
