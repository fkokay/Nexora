using System.Security.Claims;
using AIERP.Platform.Application;

namespace AIERP.Api.DocumentModels;

/// <summary>What every document model shares about its transition buttons: the permission check.</summary>
internal static class DocumentModelPermissions
{
    /// <summary>
    /// Keeps the transitions the user may run: the document's own <paramref name="candidates"/> (decided by its state chain) pass only when the
    /// tenant's permission rules allow <c>execute</c> on <paramref name="resourceType"/> for this record (status, and the customer when the
    /// document has one).
    /// </summary>
    internal static async Task<IReadOnlyList<string>> ExecutableAsync(IPlatformPermissionAuthorizer authorizer, ClaimsPrincipal principal, Guid tenantId,
        string resourceType, Guid recordId, string status, Guid? customerId, List<string> candidates, CancellationToken ct)
    {
        if (candidates.Count == 0) return candidates;
        var role = principal.FindFirstValue("role") ?? "";
        if (!Guid.TryParse(principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return [];
        var execute = PlatformPermissionCatalog.Definitions.Single(x => x.ResourceType == resourceType && x.Action == "execute");
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role,
            ["resource.type"] = execute.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"),
            ["resource.route.id"] = recordId.ToString("D"), ["resource.status"] = status,
            ["request.method"] = "POST", ["request.action"] = "execute"
        };
        if (customerId is { } customer) attributes["resource.customerId"] = customer.ToString("D");
        return await authorizer.IsAllowedAsync(tenantId, userId, role, new ResolvedPlatformPermission(execute, attributes), ct) ? candidates : [];
    }
}
