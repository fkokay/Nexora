namespace AIERP.Platform.Domain;

public static class DevelopmentRequestStages
{
    public const string New = "New";
    public const string Staging = "Staging";
    public const string Production = "Production";

    /// <summary>
    /// Derives a request's stage from the deployments reached through its release chain.
    /// Only finished (Succeeded or Superseded) deployments count; Production wins over Staging.
    /// </summary>
    public static string Derive(IEnumerable<(string Environment, string Status)> deployments)
    {
        var stage = New;
        foreach (var (environment, status) in deployments)
        {
            if (status is not (StudioReleaseDeploymentRules.Succeeded or StudioReleaseDeploymentRules.Superseded)) continue;
            if (environment == StudioReleaseDeploymentRules.Production) return Production;
            if (environment == StudioReleaseDeploymentRules.Staging) stage = Staging;
        }
        return stage;
    }
}
