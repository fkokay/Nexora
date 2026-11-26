using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api.DocumentRules;

/// <summary>
/// The approval a belge kuralı "Onay iste" starts on satış siparişi Onayla: one workflow instance whose steps name their deciders,
/// in rule order, under the tenant's system-managed definition (created on first use; never edited or started by hand).
/// </summary>
internal static class SalesOrderApprovalWorkflow
{
    internal const string SubjectType = "SalesOrder";
    internal const string DefinitionCode = "sys.satis-siparisi-onayi";
    internal const string SystemPrefix = "sys.";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    internal static async Task StartAsync(TenantDbContext db, Guid tenantId, SalesOrder order, IReadOnlyList<DocumentRule> approvals, Guid startedBy,
        CancellationToken ct)
    {
        var definition = await db.TenantWorkflowDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Code == DefinitionCode && x.Status == "Published", ct);
        if (definition is null)
        {
            definition = new TenantWorkflowDefinition
            {
                TenantId = tenantId, Code = DefinitionCode, Name = "Satış siparişi onayı (belge kuralı)",
                Description = "Belge kurallarının Onay iste adımlarıyla sistem tarafından yönetilir.", Version = 1, Status = "Published", StepsJson = "[]"
            };
            db.TenantWorkflowDefinitions.Add(definition);
        }
        var steps = approvals.Select(rule => new TenantWorkflowStep($"Onay: {rule.Code}", "TenantUser", rule.ApproverUserIds)).ToList();
        db.TenantWorkflowInstances.Add(new TenantWorkflowInstance
        {
            TenantId = tenantId, DefinitionId = definition.Id, DefinitionCode = definition.Code, DefinitionName = definition.Name,
            DefinitionVersion = definition.Version, StepsJsonSnapshot = JsonSerializer.Serialize(steps, JsonOptions), SubjectType = SubjectType,
            SubjectTitle = order.Code, SubjectId = order.Id, ContextJson = "{}", StartedByUserId = startedBy
        });
    }

    /// <summary>Closes the order's pending approval (cancel); returns how many were closed.</summary>
    internal static async Task<int> CloseAsync(TenantDbContext db, Guid tenantId, Guid orderId, CancellationToken ct)
    {
        var pending = await db.TenantWorkflowInstances.Where(x => x.TenantId == tenantId && x.SubjectType == SubjectType && x.SubjectId == orderId
            && x.Status == "Pending").ToListAsync(ct);
        foreach (var instance in pending) { instance.Status = "Cancelled"; instance.CompletedAt = DateTimeOffset.UtcNow; }
        return pending.Count;
    }
}
