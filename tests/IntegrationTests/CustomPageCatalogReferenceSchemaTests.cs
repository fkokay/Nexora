using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Page queries that reference a catalog data source or action: key sets, kind/type agreement and the no-catalog rule.</summary>
public sealed class CustomPageCatalogReferenceSchemaTests
{
    internal static readonly CatalogBundle Catalog = new(
    [
        new CatalogItem("cariler", "Cari hesaplar", "dataSource", "read", "SELECT Code, Name FROM CustomerAccounts WHERE Name LIKE @q", null,
            [new CatalogParameter("q", "text")], [new CatalogColumn("Code", "Kod", "text", true)], null, null, null),
        new CatalogItem("stokKartlari", "Stok kartları", "dataSource", "read", null, "stok.kart.listele", [], [], null, null, null),
        new CatalogItem("cariSil", "Sil", "action", "delete", null, "cari.sil", [], [], null, "row", "Cari silinsin mi?"),
    ]);

    internal static object Reference(string key, string code, string kind = "read", object[]? parameters = null, string runOn = "load") =>
        new Dictionary<string, object>
        {
            ["id"] = "q1", ["name"] = "liste", ["kind"] = kind, [key] = code, ["runOn"] = runOn,
            ["parameters"] = parameters ?? [new { name = "q", binding = "{{arama.value}}", type = "text" }],
        };

    internal static string Page(params object[] queries) => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        queries,
        components = new object[] { new { id = "c1", type = "input", name = "arama", props = new { inputType = "text" } } }
    });

    private static bool Validate(string json, CatalogBundle? catalog, out string? error) =>
        TenantCustomPageSchema.Validate(json, out error, null, ErpOperationCatalog.TryGet, catalog);

    private static string Reject(string json, CatalogBundle? catalog = null)
    {
        Assert.False(Validate(json, catalog ?? Catalog, out var error));
        Assert.False(string.IsNullOrWhiteSpace(error));
        return error!;
    }

    [Fact]
    public void Accepts_data_source_reference_with_matching_parameters()
    {
        var json = Page(Reference("dataSource", "cariler"));
        Assert.True(Validate(json, Catalog, out var error), error);
        var query = Assert.Single(TenantCustomPageQueries.ReadQueries(json));
        Assert.Equal("cariler", query.DataSource);
        Assert.Null(query.Action);
        Assert.Null(query.Operation);
        Assert.Equal([("q1", "cariler", "dataSource")], TenantCustomPageQueries.CatalogReferences(json));
        Assert.True(TenantCustomPageQueries.HasCatalogReferences(json));
    }

    [Fact]
    public void Accepts_operation_backed_references_with_operation_parameter_rules()
    {
        Assert.True(Validate(Page(Reference("dataSource", "stokKartlari")), Catalog, out var error), error);
        var action = Reference("action", "cariSil", "delete", [new { name = "id", binding = "{{arama.value}}", type = "guid" }], "manual");
        var json = Page(action);
        Assert.True(Validate(json, Catalog, out error), error);
        Assert.Equal([("q1", "cariSil", "action")], TenantCustomPageQueries.CatalogReferences(json));

        // The operation's own parameter rules apply: an undeclared parameter and a missing required one are rejected.
        Assert.Contains("'yok' parametresi", Reject(Page(Reference("dataSource", "stokKartlari", parameters: [new { name = "yok", binding = "{{arama.value}}", type = "text" }]))));
        Assert.Contains("'id' parametresi bağlanmalıdır", Reject(Page(Reference("action", "cariSil", "delete", [], "manual"))));
    }

    [Fact]
    public void Rejects_unknown_catalog_code()
    {
        Assert.Contains("yok", Reject(Page(Reference("dataSource", "yok"))));
    }

    [Fact]
    public void Rejects_data_source_code_used_as_action()
    {
        Reject(Page(Reference("action", "cariler", "delete", runOn: "manual")));
        Reject(Page(Reference("dataSource", "cariSil", "delete", [new { name = "id", binding = "{{arama.value}}", type = "guid" }], "manual")));
    }

    [Fact]
    public void Rejects_kind_mismatch()
    {
        Assert.Contains("tür", Reject(Page(Reference("action", "cariSil", "update", [new { name = "id", binding = "{{arama.value}}", type = "guid" }], "manual"))));
    }

    [Fact]
    public void Rejects_parameter_type_mismatch()
    {
        Reject(Page(Reference("dataSource", "cariler", parameters: [new { name = "q", binding = "{{arama.value}}", type = "int" }])));
        // Names must match too: missing, extra and differently named parameters are rejected.
        Reject(Page(Reference("dataSource", "cariler", parameters: [])));
        Reject(Page(Reference("dataSource", "cariler", parameters: [new { name = "q", binding = "{{arama.value}}", type = "text" }, new { name = "x", binding = "{{arama.value}}", type = "text" }])));
        Reject(Page(Reference("dataSource", "cariler", parameters: [new { name = "z", binding = "{{arama.value}}", type = "text" }])));
        // Bindings keep today's rules.
        Reject(Page(Reference("dataSource", "cariler", parameters: [new { name = "q", binding = "sabit", type = "text" }])));
    }

    [Fact]
    public void Rejects_sql_and_data_source_together()
    {
        var withSql = (Dictionary<string, object>)Reference("dataSource", "cariler");
        withSql["sql"] = "SELECT 1 AS X";
        Reject(Page(withSql));
        var withAction = (Dictionary<string, object>)Reference("dataSource", "cariler");
        withAction["action"] = "cariSil";
        Reject(Page(withAction));
        var withOperation = (Dictionary<string, object>)Reference("dataSource", "cariler");
        withOperation["operation"] = "stok.kart.listele";
        Reject(Page(withOperation));
        // Keys of a reference query are a closed set.
        var extra = (Dictionary<string, object>)Reference("dataSource", "cariler");
        extra["extra"] = 1;
        Reject(Page(extra));
    }

    [Fact]
    public void Rejects_reference_without_active_catalog()
    {
        Assert.False(Validate(Page(Reference("dataSource", "cariler")), null, out var error));
        Assert.Equal("Sayfa katalog öğesine başvuruyor ama etkin katalog sürümü yok.", error);
        // The overloads without a catalog behave as "no active release".
        Assert.False(TenantCustomPageSchema.Validate(Page(Reference("dataSource", "cariler")), out error));
        Assert.Equal("Sayfa katalog öğesine başvuruyor ama etkin katalog sürümü yok.", error);
    }

    [Fact]
    public void Definition_without_references_validates_as_before()
    {
        var standard = SystemPageStandards.All["customers"].DefinitionJson;
        Assert.True(Validate(standard, null, out var error), error);
        Assert.True(Validate(standard, Catalog, out error), error);
        Assert.False(TenantCustomPageQueries.HasCatalogReferences(standard));
        Assert.Empty(TenantCustomPageQueries.CatalogReferences(standard));
        Assert.All(TenantCustomPageQueries.ReadQueries(standard), x => Assert.True(x.DataSource is null && x.Action is null));
    }

    [Fact]
    public async Task Catalog_store_reads_only_the_active_valid_release_of_the_tenant()
    {
        var tenant = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase($"catalog-store-{Guid.NewGuid():N}").Options;
        await using var db = new TenantDbContext(options);
        Assert.Null(await TenantCatalogStore.ActiveAsync(db, tenant, ErpOperationCatalog.TryGet, CancellationToken.None));

        const string bundle = """{ "schemaVersion": 1, "dataSources": [ { "code": "cariler", "label": "Cari", "source": { "sql": "SELECT Code FROM CustomerAccounts" } } ] }""";
        db.TenantCatalogReleases.Add(Release(tenant, "1.0.0", "Superseded", """{ "schemaVersion": 1 }"""));
        db.TenantCatalogReleases.Add(Release(Guid.NewGuid(), "1.0.0", "Active", """{ "schemaVersion": 1 }"""));
        await db.SaveChangesAsync();
        Assert.Null(await TenantCatalogStore.ActiveAsync(db, tenant, ErpOperationCatalog.TryGet, CancellationToken.None));

        db.TenantCatalogReleases.Add(Release(tenant, "1.1.0", "Active", bundle));
        await db.SaveChangesAsync();
        var active = await TenantCatalogStore.ActiveAsync(db, tenant, ErpOperationCatalog.TryGet, CancellationToken.None);
        Assert.Equal("cariler", Assert.Single(active!.Items).Code);

        // A stored bundle that today's parser rejects is treated as no active catalog.
        var invalidTenant = Guid.NewGuid();
        db.TenantCatalogReleases.Add(Release(invalidTenant, "1.0.0", "Active", """{ "schemaVersion": 1, "extra": true }"""));
        await db.SaveChangesAsync();
        Assert.Null(await TenantCatalogStore.ActiveAsync(db, invalidTenant, ErpOperationCatalog.TryGet, CancellationToken.None));
    }

    internal static TenantCatalogRelease Release(Guid tenant, string version, string status, string bundleJson) => new()
    {
        TenantId = tenant, Version = version, Status = status, BundleJson = bundleJson,
        BundleSha256 = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(bundleJson))),
        CreatedByUserId = Guid.NewGuid(),
    };
}
