namespace AIERP.PluginHost;

/// <summary>Bounds the number of CPU-bound module calls running in this host process.</summary>
public sealed class ModuleInvocationConcurrencyGate : IDisposable
{
    private readonly SemaphoreSlim _semaphore;

    public ModuleInvocationConcurrencyGate(int permitLimit)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(permitLimit);
        _semaphore = new SemaphoreSlim(permitLimit, permitLimit);
    }

    public bool TryAcquire(out IDisposable? lease)
    {
        if (!_semaphore.Wait(0))
        {
            lease = null;
            return false;
        }

        lease = new Lease(_semaphore);
        return true;
    }

    public void Dispose() => _semaphore.Dispose();

    private sealed class Lease(SemaphoreSlim semaphore) : IDisposable
    {
        private SemaphoreSlim? _semaphore = semaphore;

        public void Dispose() => Interlocked.Exchange(ref _semaphore, null)?.Release();
    }
}
