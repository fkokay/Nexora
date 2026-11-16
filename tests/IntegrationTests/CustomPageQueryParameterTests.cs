using System.Data;
using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CustomPageQueryParameterTests
{
    private static Dictionary<string, JsonElement> Values(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void Build_converts_each_type_and_rejects_bad_values()
    {
        PageQueryParameter[] declared =
        [
            new("t", "{{a}}", "text"), new("i", "{{a}}", "int"), new("d", "{{a}}", "decimal"),
            new("dt", "{{a}}", "date"), new("b", "{{a}}", "bool"), new("g", "{{a}}", "guid")
        ];
        var guid = Guid.NewGuid();
        var (parameters, error) = CustomPageQueryParameters.Build(declared,
            Values($$"""{"t":"'; DROP TABLE x--","i":"42","d":12.5,"dt":"2026-11-16","b":true,"g":"{{guid}}"}"""));
        Assert.Null(error);
        var byName = parameters!.ToDictionary(x => x.ParameterName);
        Assert.Equal((SqlDbType.NVarChar, 4000), (byName["@t"].SqlDbType, byName["@t"].Size));
        Assert.Equal("'; DROP TABLE x--", byName["@t"].Value);
        Assert.Equal((SqlDbType.Int, (object)42), (byName["@i"].SqlDbType, byName["@i"].Value));
        Assert.Equal((SqlDbType.Decimal, (byte)38, (byte)10), (byName["@d"].SqlDbType, byName["@d"].Precision, byName["@d"].Scale));
        Assert.Equal(12.5m, byName["@d"].Value);
        Assert.Equal(SqlDbType.Date, byName["@dt"].SqlDbType);
        Assert.Equal(new DateTime(2026, 11, 16), byName["@dt"].Value);
        Assert.Equal((SqlDbType.Bit, (object)true), (byName["@b"].SqlDbType, byName["@b"].Value));
        Assert.Equal((SqlDbType.UniqueIdentifier, (object)guid), (byName["@g"].SqlDbType, byName["@g"].Value));

        // Strings for numbers use the invariant culture; null becomes DBNull for every type.
        Assert.Equal(-3.25m, CustomPageQueryParameters.Build([new("d", "{{a}}", "decimal")], Values("""{"d":"-3.25"}""")).Parameters![0].Value);
        foreach (var parameter in declared)
            Assert.Equal(DBNull.Value, CustomPageQueryParameters.Build([parameter], Values($$"""{"{{parameter.Name}}":null}""")).Parameters![0].Value);

        AssertError(new("i", "{{a}}", "int"), """{"i":"12a"}""", "'i' parametresi tam sayı olmalı.");
        AssertError(new("i", "{{a}}", "int"), """{"i":1.5}""", "'i' parametresi tam sayı olmalı.");
        AssertError(new("d", "{{a}}", "decimal"), """{"d":"1,5"}""", "'d' parametresi ondalık sayı olmalı.");
        AssertError(new("dt", "{{a}}", "date"), """{"dt":"16.11.2026"}""", "'dt' parametresi");
        AssertError(new("b", "{{a}}", "bool"), """{"b":"true"}""", "'b' parametresi");
        AssertError(new("g", "{{a}}", "guid"), """{"g":"x"}""", "'g' parametresi");
        AssertError(new("t", "{{a}}", "text"), """{"t":5}""", "'t' parametresi");
        AssertError(new("t", "{{a}}", "text"), $$"""{"t":"{{new string('a', 4001)}}"}""", "'t' parametresi");
        AssertError(new("t", "{{a}}", "text"), "{}", "'t' parametresi eksik.");
        AssertError(new("t", "{{a}}", "text"), """{"t":"x","fazla":1}""", "'fazla' parametresi bu sorguda tanımlı değil.");
        // Names must match exactly.
        AssertError(new("t", "{{a}}", "text"), """{"T":"x"}""", "'T' parametresi bu sorguda tanımlı değil.");

        // Each call builds fresh SqlParameter instances (a parameter can belong to one command only).
        var first = CustomPageQueryParameters.Build([new("t", "{{a}}", "text")], Values("""{"t":"x"}""")).Parameters![0];
        var second = CustomPageQueryParameters.Build([new("t", "{{a}}", "text")], Values("""{"t":"x"}""")).Parameters![0];
        Assert.NotSame(first, second);
    }

    private static void AssertError(PageQueryParameter parameter, string json, string expected)
    {
        var (parameters, error) = CustomPageQueryParameters.Build([parameter], Values(json));
        Assert.Null(parameters);
        Assert.Contains(expected, error);
    }
}
