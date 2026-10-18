using System.Reflection;

namespace AIERP.Platform.UnitTests;

public sealed class ArchitectureBoundaryTests
{
    [Theory]
    [InlineData("AIERP.Platform.Domain", "AIERP.Platform.Application")]
    [InlineData("AIERP.Platform.Domain", "AIERP.Platform.Infrastructure")]
    [InlineData("AIERP.Platform.Domain", "AIERP.Api")]
    [InlineData("AIERP.Platform.Domain", "AIERP.AIService")]
    [InlineData("AIERP.Platform.Application", "AIERP.Platform.Infrastructure")]
    [InlineData("AIERP.Platform.Application", "AIERP.Api")]
    [InlineData("AIERP.Platform.Application", "AIERP.AIService")]
    public void Core_layers_do_not_depend_on_outer_layers(string sourceAssembly, string forbiddenAssembly)
    {
        var source = Assembly.Load(sourceAssembly);

        Assert.DoesNotContain(source.GetReferencedAssemblies(),
            reference => string.Equals(reference.Name, forbiddenAssembly, StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("AIERP.ModuleSDK", "AIERP.Api")]
    [InlineData("AIERP.ModuleSDK", "AIERP.AIService")]
    [InlineData("AIERP.ModuleSDK", "AIERP.PluginHost")]
    [InlineData("AIERP.IntegrationSDK", "AIERP.Api")]
    [InlineData("AIERP.IntegrationSDK", "AIERP.AIService")]
    [InlineData("AIERP.IntegrationSDK", "AIERP.IntegrationHost")]
    public void Extension_contracts_do_not_depend_on_runtime_hosts(string sourceAssembly, string forbiddenAssembly)
    {
        var source = Assembly.Load(sourceAssembly);

        Assert.DoesNotContain(source.GetReferencedAssemblies(),
            reference => string.Equals(reference.Name, forbiddenAssembly, StringComparison.Ordinal));
    }
}
