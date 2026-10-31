namespace AIERP.ModuleSDK;

/// <summary>
/// Serializes package upload/validation/registration for the same content hash within
/// one API process. Fixed stripes keep the coordinator's memory use bounded.
/// </summary>
public static class ModulePackageUploadCoordinator
{
    private static readonly SemaphoreSlim[] Gates = Enumerable.Range(0, 64)
        .Select(_ => new SemaphoreSlim(1, 1)).ToArray();

    public static async ValueTask<IDisposable> AcquireAsync(string artifactSha256, CancellationToken cancellationToken = default)
    {
        if (!ModuleManifestValidator.IsValidSha256(artifactSha256))
            throw new InvalidDataException("Modül paketi özeti geçersiz.");
        var stripe = Convert.FromHexString(artifactSha256)[0] % Gates.Length;
        var gate = Gates[stripe];
        await gate.WaitAsync(cancellationToken);
        return new GateLease(gate);
    }

    /// <summary>Deletes a package only when the caller created its destination in this upload.</summary>
    public static bool DeleteOwnedPackage(string root, string artifactSha256, bool createdByThisUpload)
    {
        if (!createdByThisUpload) return false;
        var path = ModulePackageStoragePath.ResolvePackage(root, artifactSha256);
        if (!File.Exists(path)) return false;
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidDataException("Modül paket deposunda sembolik bağlantı kabul edilmez.");
        File.Delete(path);
        return true;
    }

    private sealed class GateLease(SemaphoreSlim gate) : IDisposable
    {
        private SemaphoreSlim? _gate = gate;

        public void Dispose() => Interlocked.Exchange(ref _gate, null)?.Release();
    }
}
