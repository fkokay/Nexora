using AIERP.Platform.Application;
using Xunit;

namespace AIERP.Platform.UnitTests;

/// <summary>Belge kuralları PR 3, task 4: a workflow step that names its deciders (Onay iste kuralı).</summary>
public sealed class TenantWorkflowPeopleStepTests
{
    private static readonly Guid Starter = Guid.NewGuid(), Mehmet = Guid.NewGuid(), Ayse = Guid.NewGuid(), Admin = Guid.NewGuid();
    private static readonly TenantWorkflowStep[] Steps =
        [new("Onay: buyukTutar", "TenantUser", [Mehmet, Starter]), new("Onay: ikinci", "TenantUser", [Ayse])];

    private static TenantWorkflowDecisionResult Decide(Guid actor, string role, int step = 0, string decision = "Approved", bool allowRequester = true) =>
        TenantWorkflowSchema.Decide("Pending", Steps, step, actor, Starter, role, decision, allowRequesterDecision: allowRequester, allowRequesterRoleOverride: true);

    [Fact]
    public void Listed_person_decides_whatever_their_role()
    {
        Assert.True(Decide(Mehmet, "TenantDeveloper").IsAllowed);
        Assert.Equal(1, Decide(Mehmet, "TenantUser").CurrentStepIndex);
        Assert.True(Decide(Ayse, "TenantUser", step: 1).IsComplete);
    }

    [Fact]
    public void Starter_cannot_decide_even_when_listed_and_allowed()
    {
        var result = Decide(Starter, "TenantUser");
        Assert.False(result.IsAllowed);
        Assert.Equal("The requester cannot decide their own workflow.", result.Error);
    }

    [Fact]
    public void Unlisted_person_cannot_decide_even_as_tenant_admin()
    {
        Assert.Equal("The user is not assigned to the current workflow step.", Decide(Admin, "TenantAdmin").Error);
        Assert.Equal("The user is not assigned to the current workflow step.", Decide(Ayse, "TenantUser", step: 0).Error);
    }

    [Fact]
    public void People_steps_are_not_allowed_in_user_defined_workflows()
    {
        var result = TenantWorkflowSchema.Validate([new TenantWorkflowStep("Adım", "TenantUser", [Mehmet])]);
        Assert.False(result.IsValid);
        Assert.True(TenantWorkflowSchema.Validate([new TenantWorkflowStep("Adım", "TenantUser")]).IsValid);
    }
}
