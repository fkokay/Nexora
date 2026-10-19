namespace AIERP.ReleaseDeployer;

/// <summary>
/// A crash-releasing single-host lock for Deployer replicas sharing one persistent local Docker volume.
/// It is deliberately not advertised as a multi-host/distributed-storage lock.
/// </summary>
public sealed class DistributedDeploymentLock : IAsyncDisposable
{
    private readonly FileStream stream;
    private bool disposed;

    private DistributedDeploymentLock(FileStream stream) => this.stream = stream;

    public static async Task<DistributedDeploymentLock> AcquireAsync(string rootPath, CancellationToken cancellationToken)
    {
        var root = Path.GetFullPath(rootPath);
        ReleaseDeployerPath.AssertNoReparsePoints(root);
        Directory.CreateDirectory(root);
        var lockPath = ReleaseDeployerPath.SafeChild(root, "deployment.lock");
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            FileStream? stream = null;
            try
            {
                stream = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.WriteThrough);
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

    public ValueTask DisposeAsync()
    {
        if (disposed) return ValueTask.CompletedTask;
        disposed = true;
        return stream.DisposeAsync();
    }
}
