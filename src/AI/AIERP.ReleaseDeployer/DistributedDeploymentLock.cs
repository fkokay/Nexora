using System.Globalization;

namespace AIERP.ReleaseDeployer;

/// <summary>
/// A crash-releasing single-host lock for Deployer replicas sharing one persistent local Docker volume.
/// It is deliberately not advertised as a multi-host/distributed-storage lock.
/// </summary>
public sealed class DistributedDeploymentLock : IAsyncDisposable
{
    private const string ProductionLockRoot = "/deployer-state";
    private const string TestLockDirectoryName = "nexora-release-deployer-tests";
    private readonly FileStream stream;
    private bool disposed;

    private DistributedDeploymentLock(FileStream stream) => this.stream = stream;

    public static Task<DistributedDeploymentLock> AcquireAsync(CancellationToken cancellationToken)
        => AcquireAtRootAsync(GetLockRoot(), cancellationToken);

    internal static Task<DistributedDeploymentLock> AcquireForTestAsync(CancellationToken cancellationToken)
        => AcquireAtRootAsync(GetTestLockRoot(), cancellationToken);

    internal static async Task<DistributedDeploymentLock> AcquireCoreAsync(Func<FileStream> openLockFile, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(openLockFile);
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            FileStream? stream = null;
            try
            {
                stream = openLockFile();
                if (stream.Length == 0)
                {
                    stream.WriteByte(0);
                    stream.Flush(flushToDisk: true);
                }
                return new DistributedDeploymentLock(stream);
            }
            catch (IOException)
            {
                if (stream is not null) await stream.DisposeAsync();
                await Task.Delay(TimeSpan.FromMilliseconds(250), cancellationToken);
            }
            catch
            {
                if (stream is not null) await stream.DisposeAsync();
                throw;
            }
        }
    }

    private static async Task<DistributedDeploymentLock> AcquireAtRootAsync(string root, CancellationToken cancellationToken)
    {
        ReleaseDeployerPath.AssertNoReparsePoints(root);
        Directory.CreateDirectory(root);
        ReleaseDeployerPath.AssertNoReparsePoints(root);
        var lockPath = ReleaseDeployerPath.SafeChild(root, "deployment.lock");
        return await AcquireCoreAsync(
            () => new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.WriteThrough),
            cancellationToken);
    }

    private static string GetLockRoot()
        => string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Test", StringComparison.OrdinalIgnoreCase)
            ? GetTestLockRoot()
            : ProductionLockRoot;

    private static string GetTestLockRoot()
        => Path.Combine(Path.GetTempPath(), TestLockDirectoryName, Environment.ProcessId.ToString(CultureInfo.InvariantCulture));

    public ValueTask DisposeAsync()
    {
        if (disposed) return ValueTask.CompletedTask;
        disposed = true;
        return stream.DisposeAsync();
    }
}
