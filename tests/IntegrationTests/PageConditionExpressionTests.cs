using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>The server parser must accept and reject exactly what the client parser (conditions.ts) does.</summary>
public sealed class PageConditionExpressionTests
{
    private static JsonElement Vectors()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "PageConditionVectors.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Valid_vectors_parse_with_expected_roots()
    {
        var valid = Vectors().GetProperty("syntax").GetProperty("valid").EnumerateArray().ToList();
        Assert.NotEmpty(valid);
        foreach (var vector in valid)
        {
            var text = vector.GetProperty("text").GetString()!;
            Assert.True(PageConditionExpression.TryParse(text, out var roots, out var error), $"{text}: {error}");
            if (vector.TryGetProperty("roots", out var expected))
                Assert.Equal(expected.EnumerateArray().Select(x => x.GetString()!).ToList(), roots.ToList());
        }
    }

    [Fact]
    public void Invalid_vectors_are_rejected()
    {
        var invalid = Vectors().GetProperty("syntax").GetProperty("invalid").EnumerateArray().ToList();
        Assert.NotEmpty(invalid);
        foreach (var vector in invalid)
        {
            var text = vector.ValueKind == JsonValueKind.String ? vector.GetString()! : vector.GetProperty("text").GetString()!;
            Assert.False(PageConditionExpression.TryParse(text, out _, out var error), $"kabul edilmemeliydi: {text}");
            Assert.False(string.IsNullOrWhiteSpace(error));
        }
    }

    [Fact]
    public void Eval_vector_texts_parse()
    {
        // The server never evaluates; every evaluation vector must still be syntactically valid on both sides.
        foreach (var vector in Vectors().GetProperty("eval").EnumerateArray())
        {
            var text = vector.GetProperty("text").GetString()!;
            Assert.True(PageConditionExpression.TryParse(text, out _, out var error), $"{text}: {error}");
        }
    }

    [Fact]
    public void Rejects_301_characters()
    {
        var accepted = "a.value == '" + new string('x', 100) + "' || " + string.Join(" || ", Enumerable.Repeat("bb.value", 1));
        accepted += new string(' ', PageConditionExpression.MaxLength - accepted.Length);
        Assert.Equal(300, accepted.Length);
        Assert.True(PageConditionExpression.TryParse(accepted, out _, out var error), error);
        Assert.False(PageConditionExpression.TryParse(accepted + " ", out _, out error));
        Assert.Contains("300", error);
    }

    [Theory]
    [InlineData("((((((((a.value))))))))")]
    [InlineData("a.value == '" + "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" + "'")]
    [InlineData("a.value == -1.5")]
    [InlineData("a.rows[1234].x\t&&\r\n!b.value")]
    [InlineData("null")]
    public void Accepts_boundary_cases(string text)
    {
        Assert.True(PageConditionExpression.TryParse(text, out _, out var error), error);
    }

    [Theory]
    [InlineData("(((((((((a.value)))))))))")]
    [InlineData("a.value == '" + "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" + "'")]
    [InlineData("1abc")]
    [InlineData("true.x")]
    [InlineData("a.value == !b.value")]
    [InlineData("a.rows[12345]")]
    [InlineData("a.value\u00a0== 1")]
    [InlineData("a.value == \u0661")]
    [InlineData("(a.value")]
    [InlineData("--1")]
    [InlineData("a.value in [b.value]")]
    [InlineData("a.value == b.value == c")]
    public void Rejects_boundary_cases(string text)
    {
        Assert.False(PageConditionExpression.TryParse(text, out _, out _), text);
    }

    [Fact]
    public void Roots_are_distinct_in_order()
    {
        Assert.True(PageConditionExpression.TryParse("b.x == 1 && a.y || b.z && kullanici.rol", out var roots, out _));
        Assert.Equal(["b", "a", "kullanici"], roots);
    }
}
