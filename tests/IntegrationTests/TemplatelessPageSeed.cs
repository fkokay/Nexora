using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Writes a templateless (legacy) custom page straight into the tenant database. Since 5b-2 a new page can only be created
/// with a template through <c>POST /api/custom-pages/drafts</c>; tests about other behaviour of existing templateless pages
/// seed them here. Production has no such bypass. The definition is stored as given, without schema validation.
/// </summary>
internal static class TemplatelessPageSeed
{
    /// <summary>
    /// Adds the page with a <c>DraftCreated</c> revision (revision 1). When <paramref name="published"/> is true the page is
    /// stored as published with a following <c>Published</c> revision (revision 2), as the publish endpoint would leave it.
    /// </summary>
    public static async Task<Guid> SeedDraftAsync(IServiceProvider services, Guid tenantId, Guid userId, string code, string name,
        string definitionJson, bool published = false) =>
        (await SeedAsync(services, tenantId, userId, code, name, null, definitionJson, published, audit: false)).Id;

    /// <summary>
    /// Sends <c>POST /api/custom-pages/drafts</c> as the client's current test identity. Every check of the endpoint (schema,
    /// write gates, open-draft conflict) still applies; only when the response is the new-page template rejection is the
    /// same templateless page written as an existing legacy row (with the endpoint's revision and audit), and a 201 with the
    /// endpoint's page detail is returned. For tests whose subject is not creating a new page.
    /// </summary>
    public static async Task<HttpResponseMessage> PostDraftAsync(IServiceProvider services, HttpClient client, string code, string name,
        object definition, string? description = null)
    {
        var response = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code, name, description, definition });
        if (response.StatusCode != HttpStatusCode.BadRequest) return response;
        var body = await response.Content.ReadAsStringAsync();
        if (!body.Contains(PageTemplateRules.YeniSayfaKalipli, StringComparison.Ordinal)) return response;

        var tenantId = Guid.Parse(client.DefaultRequestHeaders.GetValues("X-Test-Tenant").Single());
        var userId = Guid.Parse(client.DefaultRequestHeaders.GetValues("X-Test-User").Single());
        var page = await SeedAsync(services, tenantId, userId, code.Trim(), name.Trim(), string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            JsonSerializer.Serialize(definition, JsonSerializerOptions.Web), published: false, audit: true);
        return new HttpResponseMessage(HttpStatusCode.Created) { Content = JsonContent.Create(TenantCustomPageEndpoints.ToDetail(page)) };
    }

    /// <summary>JSON of an anonymous definition object, as <c>PostAsJsonAsync</c> would send it.</summary>
    public static string Json(object definition) => definition is string json ? json : JsonSerializer.Serialize(definition, JsonSerializerOptions.Web);

    private static async Task<TenantCustomPage> SeedAsync(IServiceProvider services, Guid tenantId, Guid userId, string code, string name,
        string? description, string definitionJson, bool published, bool audit)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var now = DateTimeOffset.UtcNow;
        var page = new TenantCustomPage
        {
            TenantId = tenantId, Code = code, Name = name, Description = description, DefinitionJson = definitionJson, Revision = 1,
            CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
        };
        db.TenantCustomPages.Add(page);
        db.TenantCustomPageRevisions.Add(TenantCustomPageEndpoints.RevisionOf(page, userId, "DraftCreated"));
        if (audit) TenantCustomPageEndpoints.AddAudit(db, tenantId, userId, "custom-page.draft-created", code);
        if (published)
        {
            page.IsPublished = true;
            page.Revision = 2;
            db.TenantCustomPageRevisions.Add(TenantCustomPageEndpoints.RevisionOf(page, userId, "Published"));
        }
        await db.SaveChangesAsync();
        return page;
    }
}
