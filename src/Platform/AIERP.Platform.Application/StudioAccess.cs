namespace AIERP.Platform.Application;

public static class StudioRoles
{
    public const string Consultant = "Consultant";
    public const string Developer = "Developer";
    public const string None = "None";

    public static bool IsValid(string? value) =>
        value is null or Consultant or Developer or None;
}

public sealed record StudioAccess(bool IsAdmin, string WorkRole)
{
    public IReadOnlyList<string> MenuRoles =>
        IsAdmin ? ["Admin", StudioRoles.Developer, StudioRoles.Consultant]
        : WorkRole == StudioRoles.Developer ? [StudioRoles.Developer]
        : WorkRole == StudioRoles.Consultant ? [StudioRoles.Consultant]
        : [];

    public bool CanWriteCode => IsAdmin || WorkRole == StudioRoles.Developer;
}

public static class StudioAccessResolver
{
    public static StudioAccess Resolve(string membershipRole, string? studioRole, bool hasProjectGrant)
    {
        var isAdmin = membershipRole == "TenantAdmin";
        var defaultRole = isAdmin || membershipRole == "TenantDeveloper" || hasProjectGrant
            ? StudioRoles.Developer
            : StudioRoles.Consultant;
        var workRole = studioRole is not null && StudioRoles.IsValid(studioRole) ? studioRole : defaultRole;
        return new StudioAccess(isAdmin, workRole);
    }
}
