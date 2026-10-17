using System.Text.Json;
using System.Text.RegularExpressions;

namespace AIERP.Platform.Application;

public sealed record TenantWorkflowStep(string Name, string ApproverRole);
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
        Guid actorUserId, Guid startedByUserId, string actorRole, string decision)
    {
        if (status != "Pending") return new(false, status, currentStepIndex, false, "Only pending workflows can be decided.");
        if (actorUserId == startedByUserId) return new(false, status, currentStepIndex, false, "The requester cannot decide their own workflow.");
        if (steps.Count == 0 || currentStepIndex < 0 || currentStepIndex >= steps.Count)
            return new(false, status, currentStepIndex, false, "The current workflow step is invalid.");
        if (actorRole != "TenantAdmin" && actorRole != steps[currentStepIndex].ApproverRole)
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
