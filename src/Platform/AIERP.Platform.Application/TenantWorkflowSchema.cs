using System.Text.Json;
using System.Text.RegularExpressions;

namespace AIERP.Platform.Application;

/// <summary>
/// One sequential step. <see cref="ApproverUserIds"/> (system workflows only, e.g. a belge kuralı "Onay iste") names the deciders:
/// then only a listed user other than the starter decides, whatever their role.
/// </summary>
public sealed record TenantWorkflowStep(string Name, string ApproverRole, IReadOnlyList<Guid>? ApproverUserIds = null);
public sealed record TenantWorkflowSchemaResult(IReadOnlyList<TenantWorkflowStep> Steps, IReadOnlyList<string> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

public sealed record TenantWorkflowDecisionResult(bool IsAllowed, string Status, int CurrentStepIndex, bool IsComplete, string? Error);

public static partial class TenantWorkflowSchema
{
    private static readonly HashSet<string> Roles = new(StringComparer.Ordinal)
        { "TenantAdmin", "TenantDeveloper", "TenantUser" };

    public static TenantWorkflowSchemaResult Validate(IReadOnlyList<TenantWorkflowStep>? steps)
    {
        if (steps is null || steps.Count is < 1 or > 20)
            return new([], ["Workflow must have between 1 and 20 sequential approval steps."]);
        var errors = new List<string>();
        var normalized = new List<TenantWorkflowStep>(steps.Count);
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (step, index) in steps.Select((step, index) => (step, index)))
        {
            if (step is null)
            {
                errors.Add($"Step {index + 1} must be an object.");
                continue;
            }
            if (string.IsNullOrWhiteSpace(step.Name) || step.Name.Trim().Length > 120)
                errors.Add($"Step {index + 1} name must contain 1 to 120 characters.");
            else if (!names.Add(step.Name.Trim())) errors.Add($"Step name '{step.Name.Trim()}' is duplicated.");
            if (!Roles.Contains(step.ApproverRole)) errors.Add($"Step {index + 1} has an unsupported approver role.");
            if (step.ApproverUserIds is not null) errors.Add($"Step {index + 1} cannot name approvers; only system workflows do.");
            normalized.Add(step with { Name = step.Name?.Trim() ?? "" });
        }
        if (errors.Count > 0) return new([], errors);
        if (JsonSerializer.SerializeToUtf8Bytes(normalized).Length > 16 * 1024)
            errors.Add("Workflow definition exceeds 16 KiB.");
        return new(errors.Count == 0 ? normalized : [], errors);
    }

    public static bool IsValidCode(string? code) => !string.IsNullOrWhiteSpace(code)
        && code.Trim().Length <= 40 && WorkflowCodeRegex().IsMatch(code.Trim());

    public static TenantWorkflowDecisionResult Decide(string status, IReadOnlyList<TenantWorkflowStep> steps, int currentStepIndex,
        Guid actorUserId, Guid startedByUserId, string actorRole, string decision, bool allowRequesterDecision = false,
        bool allowRequesterRoleOverride = false)
    {
        if (status != "Pending") return new(false, status, currentStepIndex, false, "Only pending workflows can be decided.");
        // A step that names its deciders: only a listed user other than the starter decides; no role or admin override applies.
        if (currentStepIndex >= 0 && currentStepIndex < steps.Count && steps[currentStepIndex].ApproverUserIds is { Count: > 0 } people)
        {
            if (actorUserId == startedByUserId) return new(false, status, currentStepIndex, false, "The requester cannot decide their own workflow.");
            if (!people.Contains(actorUserId)) return new(false, status, currentStepIndex, false, "The user is not assigned to the current workflow step.");
            allowRequesterDecision = false;
            allowRequesterRoleOverride = true;
        }
        if (actorUserId == startedByUserId && !allowRequesterDecision) return new(false, status, currentStepIndex, false, "The requester cannot decide their own workflow.");
        if (steps.Count == 0 || currentStepIndex < 0 || currentStepIndex >= steps.Count)
            return new(false, status, currentStepIndex, false, "The current workflow step is invalid.");
        if (actorRole != "TenantAdmin" && actorRole != steps[currentStepIndex].ApproverRole && !allowRequesterRoleOverride)
            return new(false, status, currentStepIndex, false, "The user is not assigned to the current workflow step.");
        if (decision == "Rejected") return new(true, "Rejected", currentStepIndex, true, null);
        if (decision != "Approved") return new(false, status, currentStepIndex, false, "Decision must be Approved or Rejected.");
        var nextIndex = currentStepIndex + 1;
        var isComplete = nextIndex >= steps.Count;
        return new(true, isComplete ? "Approved" : "Pending", isComplete ? currentStepIndex : nextIndex, isComplete, null);
    }

    [GeneratedRegex("^[a-z][a-z0-9_-]{0,39}$", RegexOptions.CultureInvariant)]
    private static partial Regex WorkflowCodeRegex();
}
