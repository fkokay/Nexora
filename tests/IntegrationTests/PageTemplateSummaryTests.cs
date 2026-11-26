using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class PageTemplateSummaryTests
{
    [Fact]
    public void List_template_without_extra_areas_is_level_one()
    {
        var json = """{"schemaVersion":2,"template":{"name":"list"},"queries":[],"components":[{"id":"liste","type":"dataTable","props":{"slot":"list"}}]}""";
        Assert.Equal(("list", 1), PageTemplateSummary.Read(json));
    }

    [Theory]
    [InlineData("above")]
    [InlineData("below")]
    public void List_template_with_above_or_below_component_is_level_two(string slot)
    {
        var json = """{"schemaVersion":2,"template":{"name":"list"},"queries":[],"components":[{"id":"liste","type":"dataTable","props":{"slot":"list"}},{"id":"x","type":"text","props":{"slot":"SLOT"}}]}"""
            .Replace("SLOT", slot);
        Assert.Equal(("list", 2), PageTemplateSummary.Read(json));
    }

    [Fact]
    public void Record_template_without_extra_areas_is_level_one()
    {
        var json = """{"schemaVersion":2,"template":{"name":"record"},"queries":[],"components":[{"id":"ozet","type":"recordHeader","props":{"slot":"summary"}},{"id":"sekmeler","type":"tabs","props":{"slot":"tabs","tabs":["Genel="]}}]}""";
        Assert.Equal(("record", 1), PageTemplateSummary.Read(json));
    }

    [Theory]
    [InlineData("above")]
    [InlineData("below")]
    public void Record_template_with_above_or_below_component_is_level_two(string slot)
    {
        var json = """{"schemaVersion":2,"template":{"name":"record"},"queries":[],"components":[{"id":"ozet","type":"recordHeader","props":{"slot":"summary"}},{"id":"x","type":"text","props":{"slot":"SLOT"}}]}"""
            .Replace("SLOT", slot);
        Assert.Equal(("record", 2), PageTemplateSummary.Read(json));
    }

    [Fact]
    public void Legacy_definition_has_no_template()
        => Assert.Equal((null, null), PageTemplateSummary.Read("""{"schemaVersion":2,"queries":[],"components":[]}"""));

    [Theory]
    [InlineData("not json")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("[1]")]
    [InlineData("""{"template":{"name":"card"}}""")]
    [InlineData("""{"template":"list"}""")]
    public void Invalid_or_unknown_input_never_throws_and_has_no_template(string? json)
        => Assert.Equal((null, null), PageTemplateSummary.Read(json));
}
