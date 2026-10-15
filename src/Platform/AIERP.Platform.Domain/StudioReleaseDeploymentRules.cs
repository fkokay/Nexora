namespace AIERP.Platform.Domain;

public static class StudioReleaseDeploymentRules
{
    public const string Staging = "Staging";
    public const string Production = "Production";
    public const string Queued = "Queued";
    public const string Building = "Building";
    public const string Deploying = "Deploying";
    public const string Succeeded = "Succeeded";
    public const string Failed = "Failed";
    public const string Destroyed = "Destroyed";
    public const string Superseded = "Superseded";
    public const string AwaitingReview = "AwaitingReview";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";

    public static bool IsSupportedEnvironment(string? environment) => environment is Staging or Production;

    public static bool CanTransition(string? current, string? next) => (current, next) switch
    {
        (Queued, Building) => true,
        (Queued, Failed) => true,
        (Building, Deploying) => true,
        (Building, Failed) => true,
        (Deploying, Succeeded) => true,
        (Deploying, Failed) => true,
        (Succeeded, Destroyed) => true,
        (Succeeded, Superseded) => true,
        (Failed, Destroyed) => true,
        _ => false
    };

    public static bool CanPromoteToProduction(Guid tenantId, Guid projectId, Guid packageId,
        IEnumerable<StudioReleaseDeploymentRecord> deployments) => deployments.Any(deployment =>
        deployment.TenantId == tenantId && deployment.ProjectId == projectId && deployment.ReleasePackageId == packageId &&
        deployment.Environment == Staging && deployment.Status is Succeeded or Superseded);

    public static bool CanRollback(StudioReleaseDeploymentRecord activeDeployment, StudioReleaseDeploymentRecord rollbackTarget) =>
        activeDeployment.Id != rollbackTarget.Id && activeDeployment.TenantId == rollbackTarget.TenantId &&
        activeDeployment.ProjectId == rollbackTarget.ProjectId && activeDeployment.Environment == rollbackTarget.Environment &&
        activeDeployment.Status == Succeeded && rollbackTarget.Status is Succeeded or Superseded && rollbackTarget.CreatedAt < activeDeployment.CreatedAt;

    public static bool CanRequestProductionApproval(StudioReleaseDeploymentRecord stagingDeployment) =>
        stagingDeployment.Environment == Staging && stagingDeployment.Status is Succeeded or Superseded;

    public static bool CanReviewProductionApproval(StudioProductionPromotionApprovalRecord request, Guid reviewerUserId) =>
        request.Status == AwaitingReview && request.RequestedByUserId != reviewerUserId && reviewerUserId != Guid.Empty;

    public static bool CanTransitionProductionApproval(string? current, string? next) =>
        current == AwaitingReview && next is Approved or Rejected;
}
