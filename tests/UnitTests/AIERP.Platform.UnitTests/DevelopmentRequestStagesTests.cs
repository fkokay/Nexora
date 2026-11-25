using AIERP.Platform.Domain;
using Xunit;

namespace AIERP.Platform.UnitTests;

public sealed class DevelopmentRequestStagesTests
{
    [Fact]
    public void No_deployments_is_new() =>
        Assert.Equal("New", DevelopmentRequestStages.Derive([]));

    [Fact]
    public void Succeeded_staging_is_staging() =>
        Assert.Equal("Staging", DevelopmentRequestStages.Derive([("Staging", "Succeeded")]));

    [Fact]
    public void Production_beats_staging_and_superseded_counts() =>
        Assert.Equal("Production", DevelopmentRequestStages.Derive([("Staging", "Succeeded"), ("Production", "Superseded")]));

    [Fact]
    public void Failed_deployment_does_not_count() =>
        Assert.Equal("New", DevelopmentRequestStages.Derive([("Production", "Failed")]));
}
