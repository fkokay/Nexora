using AIERP.AIService.AI;

namespace AIERP.Platform.UnitTests;

public sealed class CodeSourcePolicyTests
{
    [Theory]
    [InlineData("src/Orders/OrderService.cs")]
    [InlineData("frontend/src/Orders.tsx")]
    public void Allows_supported_source_paths(string path) => Assert.True(CodeSourcePolicy.IsEligibleFilePath(path));

    [Theory]
    [InlineData("../appsettings.Production.json")]
    [InlineData("src/.env.cs")]
    [InlineData("secrets/token.cs")]
    [InlineData("private/credentials.cs")]
    [InlineData("src/certificate.pem")]
    [InlineData("src/notes.md")]
    [InlineData("C:/repo/Example.cs")]
    [InlineData("src\\Example.cs")]
    public void Rejects_paths_outside_the_source_policy(string path) => Assert.False(CodeSourcePolicy.IsEligibleFilePath(path));
}
