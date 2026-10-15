using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class StudioReleaseDeploymentRulesTests
{
    [Theory]
    [InlineData("Staging")]
    [InlineData("Production")]
    public void Supports_only_named_deployment_environments(string environment) =>
        Assert.True(StudioReleaseDeploymentRules.IsSupportedEnvironment(environment));

    [Theory]
    [InlineData("Development")]
    [InlineData("staging")]
    [InlineData("")]
    public void Rejects_unknown_deployment_environments(string environment) =>
        Assert.False(StudioReleaseDeploymentRules.IsSupportedEnvironment(environment));

    [Theory]
    [InlineData("Queued", "Building")]
    [InlineData("Queued", "Failed")]
    [InlineData("Building", "Deploying")]
    [InlineData("Building", "Failed")]
    [InlineData("Deploying", "Succeeded")]
    [InlineData("Deploying", "Failed")]
    [InlineData("Succeeded", "Destroyed")]
    [InlineData("Failed", "Destroyed")]
    public void Allows_only_forward_deployment_transitions(string current, string next) =>
        Assert.True(StudioReleaseDeploymentRules.CanTransition(current, next));

    [Theory]
    [InlineData("Succeeded", "Deploying")]
    [InlineData("Failed", "Building")]
    [InlineData("Queued", "Succeeded")]
    [InlineData("Deploying", "Queued")]
    [InlineData("Destroyed", "Succeeded")]
    public void Rejects_retries_and_backward_transitions(string current, string next) =>
        Assert.False(StudioReleaseDeploymentRules.CanTransition(current, next));

    [Fact]
    public void Production_requires_the_same_package_to_succeed_in_staging()
    {
        var tenant = Guid.NewGuid(); var project = Guid.NewGuid(); var package = Guid.NewGuid();
        var staging = new StudioReleaseDeploymentRecord { TenantId = tenant, ProjectId = project, ReleasePackageId = package, Environment = "Staging", Status = "Succeeded" };

        Assert.True(StudioReleaseDeploymentRules.CanPromoteToProduction(tenant, project, package, [staging]));
        Assert.False(StudioReleaseDeploymentRules.CanPromoteToProduction(Guid.NewGuid(), project, package, [staging]));
        Assert.False(StudioReleaseDeploymentRules.CanPromoteToProduction(tenant, Guid.NewGuid(), package, [staging]));
        Assert.False(StudioReleaseDeploymentRules.CanPromoteToProduction(tenant, project, Guid.NewGuid(), [staging]));
        staging.Status = "Failed";
        Assert.False(StudioReleaseDeploymentRules.CanPromoteToProduction(tenant, project, package, [staging]));
    }

    [Fact]
    public void Rollback_requires_an_earlier_successful_deployment_in_the_same_scope()
    {
        var earlier = new StudioReleaseDeploymentRecord { TenantId = Guid.NewGuid(), ProjectId = Guid.NewGuid(), Environment = "Staging", Status = "Succeeded", CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-5) };
        var active = new StudioReleaseDeploymentRecord { TenantId = earlier.TenantId, ProjectId = earlier.ProjectId, Environment = "Staging", Status = "Succeeded", CreatedAt = DateTimeOffset.UtcNow };

        Assert.True(StudioReleaseDeploymentRules.CanRollback(active, earlier));
        Assert.False(StudioReleaseDeploymentRules.CanRollback(earlier, active));
        Assert.False(StudioReleaseDeploymentRules.CanRollback(active, active));
        earlier.ProjectId = Guid.NewGuid();
        Assert.False(StudioReleaseDeploymentRules.CanRollback(active, earlier));
    }

    [Fact]
    public void Production_approval_requires_a_successful_staging_deployment_and_independent_reviewer()
    {
        var requester = Guid.NewGuid();
        var approval = new StudioProductionPromotionApprovalRecord { RequestedByUserId = requester };
        var staging = new StudioReleaseDeploymentRecord { Environment = "Staging", Status = "Succeeded" };

        Assert.True(StudioReleaseDeploymentRules.CanRequestProductionApproval(staging));
        staging.Status = "Superseded";
        Assert.True(StudioReleaseDeploymentRules.CanRequestProductionApproval(staging));
        staging.Status = "Destroyed";
        Assert.False(StudioReleaseDeploymentRules.CanRequestProductionApproval(staging));
        staging.Status = "Failed";
        Assert.False(StudioReleaseDeploymentRules.CanRequestProductionApproval(staging));
        staging.Status = "Succeeded";
        staging.Environment = "Production";
        Assert.False(StudioReleaseDeploymentRules.CanRequestProductionApproval(staging));
        Assert.False(StudioReleaseDeploymentRules.CanReviewProductionApproval(approval, requester));
        Assert.True(StudioReleaseDeploymentRules.CanReviewProductionApproval(approval, Guid.NewGuid()));
        Assert.False(StudioReleaseDeploymentRules.CanReviewProductionApproval(approval, Guid.Empty));
        Assert.True(StudioReleaseDeploymentRules.CanTransitionProductionApproval("AwaitingReview", "Approved"));
        Assert.True(StudioReleaseDeploymentRules.CanTransitionProductionApproval("AwaitingReview", "Rejected"));
        Assert.False(StudioReleaseDeploymentRules.CanTransitionProductionApproval("Approved", "Rejected"));
        Assert.False(StudioReleaseDeploymentRules.CanTransitionProductionApproval("Rejected", "Approved"));
    }
}
