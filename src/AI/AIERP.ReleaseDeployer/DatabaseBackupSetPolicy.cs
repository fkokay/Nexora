namespace AIERP.ReleaseDeployer;

/// <summary>Ensures a database-set restore cannot silently leave databases from a different point in time.</summary>
public static class DatabaseBackupSetPolicy
{
    public static bool MatchesCurrentSet(IEnumerable<string> current, IEnumerable<string> backup)
    {
        ArgumentNullException.ThrowIfNull(current);
        ArgumentNullException.ThrowIfNull(backup);

        var currentNames = current.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var backupNames = backup.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return currentNames.Count > 0 && backupNames.Count > 0 && currentNames.SetEquals(backupNames);
    }
}
