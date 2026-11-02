using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class TenantWorkflowSchemaTests
{
    [Fact]
    public void AcceptsSequentialRoleApprovalStepsAndTrimsNames()
    {
        var result = TenantWorkflowSchema.Validate([
            new TenantWorkflowStep("  Manager review ", "TenantAdmin"),
            new TenantWorkflowStep("Finance review", "TenantDeveloper")
        ]);

        Assert.True(result.IsValid, string.Join("; ", result.Errors));
        Assert.Equal("Manager review", result.Steps[0].Name);
        Assert.Equal("TenantDeveloper", result.Steps[1].ApproverRole);
    }

    [Fact]
    public void RejectsDuplicateNamesUnsupportedRolesAndOversizedStepCount()
    {
        var duplicateAndRole = TenantWorkflowSchema.Validate([
            new TenantWorkflowStep("Review", "TenantAdmin"),
            new TenantWorkflowStep("review", "PlatformSuperAdmin")
        ]);
        var tooMany = TenantWorkflowSchema.Validate(Enumerable.Range(0, 21)
            .Select(index => new TenantWorkflowStep($"Review {index}", "TenantAdmin")).ToArray());

        Assert.False(duplicateAndRole.IsValid);
        Assert.Contains(duplicateAndRole.Errors, error => error.Contains("duplicated", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(duplicateAndRole.Errors, error => error.Contains("unsupported", StringComparison.OrdinalIgnoreCase));
        Assert.False(tooMany.IsValid);
    }

    [Theory]
    [InlineData("purchase-approval", true)]
    [InlineData("Aproval", false)]
    [InlineData("-approval", false)]
    public void ValidatesDefinitionCodes(string code, bool expected) =>
        Assert.Equal(expected, TenantWorkflowSchema.IsValidCode(code));

    [Fact]
    public void ApprovalsAdvanceOnlyForAssignedRoleAndCannotBeSelfApproved()
    {
        var steps = new[] { new TenantWorkflowStep("Manager", "TenantAdmin"), new TenantWorkflowStep("Finance", "TenantDeveloper") };
        var user = Guid.NewGuid(); var requester = Guid.NewGuid();

        var denied = TenantWorkflowSchema.Decide("Pending", steps, 0, user, requester, "TenantDeveloper", "Approved");
        var selfDecision = TenantWorkflowSchema.Decide("Pending", steps, 0, requester, requester, "TenantAdmin", "Approved");
        var adminSelfDecision = TenantWorkflowSchema.Decide("Pending", steps, 0, requester, requester, "TenantAdmin", "Approved", allowRequesterDecision: true);
        var advanced = TenantWorkflowSchema.Decide("Pending", steps, 0, user, requester, "TenantAdmin", "Approved");
        var completed = TenantWorkflowSchema.Decide("Pending", steps, 1, user, requester, "TenantDeveloper", "Approved");

        Assert.False(denied.IsAllowed);
        Assert.False(selfDecision.IsAllowed);
        Assert.True(adminSelfDecision.IsAllowed);
        Assert.True(advanced.IsAllowed);
        Assert.Equal("Pending", advanced.Status);
        Assert.Equal(1, advanced.CurrentStepIndex);
        Assert.True(completed.IsComplete);
        Assert.Equal("Approved", completed.Status);
    }

    [Fact]
    public void RejectsNullStepsAsValidationErrors()
    {
        var result = TenantWorkflowSchema.Validate([null!]);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("must be an object", StringComparison.OrdinalIgnoreCase));
    }
}
