namespace AIERP.Platform.Domain;

public static class CustomPageAccessModes
{
    public const string AdminsOnly = "AdminsOnly", AllUsers = "AllUsers", SelectedUsers = "SelectedUsers";

    public static bool IsKnown(string? mode) => mode is AdminsOnly or AllUsers or SelectedUsers;
}

public readonly record struct CustomPageRights(bool View, bool Insert, bool Update, bool Delete)
{
    public static readonly CustomPageRights All = new(true, true, true, true);
    public static readonly CustomPageRights None = default;
}

public static class CustomPageAccessRules
{
    /// <summary>
    /// Computes a user's rights on a custom page. Precedence: a non-member gets nothing (tenant tokens are
    /// only issued from a membership, so this only affects removed members); a TenantAdmin gets everything
    /// and cannot be locked out; a page without an access row is treated as AdminsOnly when its definition contains
    /// SQL queries, otherwise as AllUsers with View only; with an access row the configured mode decides.
    /// </summary>
    public static CustomPageRights Evaluate(TenantCustomPageAccess? access, Guid userId, bool isTenantAdmin, bool isMember,
        bool pageHasQueries)
    {
        if (!isMember) return CustomPageRights.None;
        if (isTenantAdmin) return CustomPageRights.All;
        if (access is null) return pageHasQueries ? CustomPageRights.None : new CustomPageRights(true, false, false, false);
        switch (access.Mode)
        {
            case CustomPageAccessModes.AllUsers:
                return new CustomPageRights(true, access.AllUsersCanInsert, access.AllUsersCanUpdate, access.AllUsersCanDelete);
            case CustomPageAccessModes.SelectedUsers:
                var row = access.Users.FirstOrDefault(x => x.UserId == userId);
                // Write rights are only meaningful together with View.
                return row is null || !row.CanView ? CustomPageRights.None
                    : new CustomPageRights(true, row.CanInsert, row.CanUpdate, row.CanDelete);
            default:
                return CustomPageRights.None;
        }
    }
}
