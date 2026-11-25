using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class StudioAccessTests
{
    [Theory]
    [InlineData("TenantAdmin", null, false)]
    [InlineData("TenantAdmin", "None", false)]
    [InlineData("TenantAdmin", "Consultant", false)]
    public void Tenant_admin_is_never_locked_out(string membershipRole, string? studioRole, bool grant)
    {
        var access = StudioAccessResolver.Resolve(membershipRole, studioRole, grant);

        Assert.True(access.IsAdmin);
        Assert.True(access.CanWriteCode);
        Assert.Equal(new[] { "Admin", "Developer", "Consultant" }, access.MenuRoles);
    }

    [Theory]
    [InlineData("TenantUser", null, false, "Consultant")]
    [InlineData("TenantUser", null, true, "Developer")]
    [InlineData("TenantDeveloper", null, false, "Developer")]
    [InlineData("TenantDeveloper", "Consultant", true, "Consultant")]
    [InlineData("TenantUser", "None", true, "None")]
    [InlineData("TenantUser", "Developer", false, "Developer")]
    public void Work_role_resolves_from_explicit_value_then_defaults(string membershipRole, string? studioRole, bool grant, string expected)
    {
        var access = StudioAccessResolver.Resolve(membershipRole, studioRole, grant);

        Assert.False(access.IsAdmin);
        Assert.Equal(expected, access.WorkRole);
        Assert.Equal(expected == "Developer", access.CanWriteCode);
    }

    [Theory]
    [InlineData("Consultant", new[] { "Consultant" })]
    [InlineData("Developer", new[] { "Developer" })]
    [InlineData("None", new string[0])]
    public void Menu_roles_follow_work_role(string workRole, string[] expected)
    {
        Assert.Equal(expected, new StudioAccess(false, workRole).MenuRoles);
    }

    [Theory]
    [InlineData("Admin", false)]
    [InlineData("developer", false)]
    [InlineData("Developer", true)]
    [InlineData("Consultant", true)]
    [InlineData("None", true)]
    [InlineData(null, true)]
    public void Studio_role_validation_is_case_sensitive_and_allows_null(string? value, bool valid)
    {
        Assert.Equal(valid, StudioRoles.IsValid(value));
    }
}
