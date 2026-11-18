using System.Globalization;

namespace AIERP.ReleaseDeployer;

/// <summary>
/// Records how long each release step takes so operators can see where a
/// deployment spends its time. Step names are fixed identifiers chosen by the
/// deployer (never request data or command output), so the summary is safe to
/// log and to return in job output.
/// </summary>
public sealed class DeploymentStepTimer
{
    private readonly TimeProvider clock;
    private readonly long started;
    private readonly List<(string Step, TimeSpan Duration)> steps = [];

    public DeploymentStepTimer(TimeProvider? clock = null)
    {
        this.clock = clock ?? TimeProvider.System;
        started = this.clock.GetTimestamp();
    }

    public IReadOnlyList<(string Step, TimeSpan Duration)> Steps => steps;

    public TimeSpan Elapsed => clock.GetElapsedTime(started);

    /// <summary>Runs <paramref name="action"/> and records its duration, also when it throws.</summary>
    public async Task<T> TimeAsync<T>(string step, Func<Task<T>> action)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(step);
        ArgumentNullException.ThrowIfNull(action);
        var stepStarted = clock.GetTimestamp();
        try { return await action(); }
        finally { steps.Add((step, clock.GetElapsedTime(stepStarted))); }
    }

    public async Task TimeAsync(string step, Func<Task> action) =>
        await TimeAsync<bool>(step, async () => { await action(); return true; });

    /// <summary>One line such as <c>config=0.4s build:platform-api=195.0s up=12.3s total=208.1s</c>.</summary>
    public string Summary() =>
        string.Join(' ', steps.Select(x => $"{x.Step}={Format(x.Duration)}").Append($"total={Format(Elapsed)}"));

    private static string Format(TimeSpan duration) =>
        duration.TotalSeconds.ToString("0.0", CultureInfo.InvariantCulture) + "s";
}
