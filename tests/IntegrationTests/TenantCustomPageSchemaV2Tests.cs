using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class TenantCustomPageSchemaV2Tests
{
    private static string V2(object[]? queries = null, object[]? components = null) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries = queries ?? [],
        components = components ?? []
    });

    private static object Query(string id, string name, string sql, params object[] parameters) =>
        new { id, name, kind = "read", sql, parameters, runOn = "load" };

    private static object Param(string name, string binding, string type = "text") => new { name, binding, type };

    private static void AssertRejected(string json, string? contains = null)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.False(string.IsNullOrWhiteSpace(error));
        if (contains is not null) Assert.Contains(contains, error);
    }

    [Fact]
    public void Accepts_v1_definition_unchanged()
    {
        var json = JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            components = new object[] { new { id = "h1", type = "heading", props = new { title = "Başlık" } } }
        });
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        Assert.Empty(TenantCustomPageQueries.ReadQueries(json));
        Assert.False(TenantCustomPageQueries.HasQueries(json));
    }

    [Fact]
    public void Accepts_v2_with_query_label_input_and_bindings()
    {
        var json = V2(
            [
                Query("q1", "musteriler", "SELECT Code, Name FROM CustomerAccounts WHERE Code = @code", Param("code", "{{arama.value}}")),
                Query("q2", "detay", "SELECT Name FROM CustomerAccounts WHERE Code = @kod", Param("kod", "{{ musteriler.rows[0].Code }}"))
            ],
            [
                new { id = "c1", type = "input", name = "arama", props = new { inputType = "text", placeholder = "Kod ara", defaultValue = "{{bugun}}", label = "Arama" } },
                new { id = "c2", type = "label", name = "baslik", props = new { text = "Merhaba {{kullanici.ad}}, ilk kayıt: {{musteriler.rows[0].Name}}" } },
                new { id = "c3", type = "dataTable", name = "izgara", props = new { query = "q1", title = "Müşteriler" } },
                new { id = "c4", type = "metric", props = new { query = "q2", value = "{{detay.rows[0].Name}}" } },
                new { id = "c5", type = "input", name = "secim", props = new { inputType = "select", optionsQuery = "q1", optionLabelColumn = "Name", optionValueColumn = "Code" } }
            ]);

        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);
        var queries = TenantCustomPageQueries.ReadQueries(json);
        Assert.Equal(["q1", "q2"], queries.Select(x => x.Id));
        Assert.Equal("{{ musteriler.rows[0].Code }}", queries[1].Parameters[0].Binding);
        Assert.Equal("load", queries[0].RunOn);
        Assert.True(TenantCustomPageQueries.HasQueries(json));
    }

    [Fact]
    public void Rejects_bindings_in_v1()
    {
        var json = JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            components = new object[] { new { id = "t1", type = "text", props = new { text = "{{kullanici.ad}}" } } }
        });
        AssertRejected(json);
        // v1 does not know v2-only structure either.
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, queries = Array.Empty<object>(), components = Array.Empty<object>() }));
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { new { id = "l1", type = "label" } } }));
        AssertRejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new object[] { new { id = "h1", type = "heading", name = "x" } } }));
    }

    [Fact]
    public void Rejects_binding_in_non_bindable_prop()
    {
        AssertRejected(V2(components: [new { id = "t1", type = "dataTable", props = new { source = "{{q1.rows}}" } }]));
        AssertRejected(V2(components: [new { id = "t1", type = "heading", props = new { title = "Kırık {{ bağlama" } }]));
        AssertRejected(V2(components: [new { id = "t1", type = "heading", props = new { title = "{{1abc}}" } }]));
    }

    [Fact]
    public void Rejects_non_select_or_invalid_sql()
    {
        AssertRejected(V2([Query("q1", "silme", "DELETE FROM X")]), "SELECT");
        AssertRejected(V2([Query("q1", "yorum", "SELECT 1 -- x")]));
        AssertRejected(V2([Query("q1", "kume", "SELECT '{{x}}' AS a")]));
    }

    [Fact]
    public void Rejects_undeclared_or_unused_sql_parameters()
    {
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x WHERE 1 = @eksik")]), "@eksik");
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x", Param("fazla", "{{bugun}}"))]), "fazla");
        Assert.True(TenantCustomPageSchema.Validate(V2([Query("q1", "a", "SELECT 1 AS x WHERE @Ad = 'y'", Param("ad", "{{bugun}}"))]), out var error), error);
    }

    [Fact]
    public void Rejects_duplicate_or_reserved_names()
    {
        AssertRejected(V2([Query("q1", "kullanici", "SELECT 1 AS x")]), "kullanici");
        AssertRejected(V2([Query("q1", "Bugun", "SELECT 1 AS x")]));
        AssertRejected(V2([Query("q1", "Liste", "SELECT 1 AS x")], [new { id = "c1", type = "dataTable", name = "liste" }]));
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x"), Query("q1", "b", "SELECT 1 AS x")]));
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x WHERE @p = @P", Param("p", "{{bugun}}"), Param("P", "{{bugun}}"))]));
        AssertRejected(V2([Query("q 1", "a", "SELECT 1 AS x")]));
    }

    [Theory]
    [InlineData("__proto__")]
    [InlineData("__PROTO__")]
    [InlineData("constructor")]
    [InlineData("Constructor")]
    [InlineData("prototype")]
    [InlineData("PROTOTYPE")]
    public void Rejects_javascript_object_key_names_for_queries_components_and_parameters(string name)
    {
        AssertRejected(V2([Query("q1", name, "SELECT 1 AS x")]), "ayrılmış");
        AssertRejected(V2(components: [new { id = "c1", type = "input", name, props = new { inputType = "text" } }]), "ayrılmış");
        AssertRejected(V2([Query("q1", "a", $"SELECT 1 AS x WHERE @{name} = 1", Param(name, "{{bugun}}", "int"))]), "ayrılmış");
        Assert.False(TenantCustomPageQueries.IsValidName(name));
        Assert.True(TenantCustomPageQueries.IsValidName(name + "_x"));
    }

    [Fact]
    public void Rejects_cyclic_query_dependencies()
    {
        var json = V2(
        [
            Query("q1", "a", "SELECT 1 AS x WHERE 1 = @p", Param("p", "{{b.rows[0].x}}", "int")),
            Query("q2", "b", "SELECT 1 AS x WHERE 1 = @p", Param("p", "{{a.rows[0].x}}", "int"))
        ]);
        AssertRejected(json, "a → b → a");
        AssertRejected(V2([Query("q1", "kendi", "SELECT 1 AS x WHERE 1 = @p", Param("p", "{{kendi.rows[0].x}}", "int"))]), "kendi → kendi");
    }

    [Fact]
    public void Rejects_unknown_query_reference_in_dataTable_query_prop()
    {
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x")], [new { id = "c1", type = "dataTable", props = new { query = "yok" } }]), "yok");
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x")], [new { id = "c1", type = "input", props = new { inputType = "select", optionsQuery = "yok" } }]));
        AssertRejected(V2([Query("q1", "a", "SELECT 1 AS x")], [new { id = "c1", type = "heading", props = new { query = "q1" } }]));
        AssertRejected(V2(components: [new { id = "c1", type = "input", props = new { inputType = "radio" } }]));
    }

    [Fact]
    public void SqlParameterNames_ignores_strings_brackets_and_system_variables()
    {
        var names = TenantCustomPageQueries.SqlParameterNames(
            "SELECT @a AS [x@y], '@b' AS c, \"@q\" AS d, @@ROWCOUNT AS e, N'it''s @c' AS f FROM T WHERE x = @A OR y = @d_2");
        Assert.Equal(["a", "d_2"], names.Order(StringComparer.Ordinal));
        Assert.Contains("A", names);
        Assert.True(TenantCustomPageQueries.TryParseBindingPath("{{q1.rows[0].Id}}", out var root));
        Assert.Equal("q1", root);
        Assert.False(TenantCustomPageQueries.TryParseBindingPath("{{q1.rows[0].Id}} x", out _));
        Assert.False(TenantCustomPageQueries.TryParseBindingPath("q1.rows", out _));
    }

    [Fact]
    public void Enforces_128KiB_for_v2_and_64KiB_for_v1()
    {
        string Padded(int version, int targetBytes)
        {
            var components = new List<object>();
            var text = new string('a', 1900);
            for (var i = 0; i < 70 && components.Count * 3850 < targetBytes; i++)
                components.Add(new { id = $"t{i}", type = "text", props = new { text, description = text } });
            return version == 1
                ? JsonSerializer.Serialize(new { schemaVersion = 1, components })
                : JsonSerializer.Serialize(new { schemaVersion = 2, queries = Array.Empty<object>(), components });
        }

        var v1Large = Padded(1, 100 * 1024);
        Assert.InRange(System.Text.Encoding.UTF8.GetByteCount(v1Large), 64 * 1024 + 1, 128 * 1024);
        AssertRejected(v1Large, "64 KiB");

        var v2Large = Padded(2, 100 * 1024);
        Assert.True(TenantCustomPageSchema.Validate(v2Large, out var error), error);

        var v2TooLarge = V2(components: [new { id = "t1", type = "text", props = new { text = new string('a', 130 * 1024) } }]);
        AssertRejected(v2TooLarge, "128 KiB");
    }
}
