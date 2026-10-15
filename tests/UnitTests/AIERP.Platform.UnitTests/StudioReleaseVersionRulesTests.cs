using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class StudioReleaseVersionRulesTests
{
    [Theory]
    [InlineData("0.0.0")]
    [InlineData("1.2.3")]
    [InlineData("2.0.0-rc.1")]
    [InlineData("1.4.2-alpha.3+build.27")]
    [InlineData("1.0.0+ci-2026.10")]
    public void Accepts_semver_2_release_versions(string version) => Assert.True(StudioReleaseVersionRules.IsValid(version));

    [Theory]
    [InlineData("01.2.3")]
    [InlineData("1.02.3")]
    [InlineData("1.2")]
    [InlineData("1.2.3-01")]
    [InlineData("1.2.3+")]
    [InlineData("v1.2.3")]
    [InlineData("")]
    public void Rejects_invalid_semver_release_versions(string version) => Assert.False(StudioReleaseVersionRules.IsValid(version));
}
