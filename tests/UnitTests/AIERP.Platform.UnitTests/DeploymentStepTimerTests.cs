using AIERP.ReleaseDeployer;

namespace AIERP.Platform.UnitTests;

public sealed class DeploymentStepTimerTests
{
    private sealed class ManualClock : TimeProvider
    {
        public long Ticks { get; set; }
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => Ticks;
        public void Advance(TimeSpan by) => Ticks += by.Ticks;
    }

    [Fact]
    public async Task Summary_lists_each_step_in_order_with_its_duration_and_the_total()
    {
        var clock = new ManualClock();
        var timer = new DeploymentStepTimer(clock);

        var exitCode = await timer.TimeAsync("config", () => { clock.Advance(TimeSpan.FromMilliseconds(400)); return Task.FromResult(0); });
        await timer.TimeAsync("build:platform-api", () => { clock.Advance(TimeSpan.FromSeconds(195)); return Task.CompletedTask; });
        clock.Advance(TimeSpan.FromSeconds(1)); // time between steps still counts towards the total

        Assert.Equal(0, exitCode);
        Assert.Equal("config=0.4s build:platform-api=195.0s total=196.4s", timer.Summary());
    }

    [Fact]
    public async Task A_failing_step_is_still_recorded_so_failed_releases_show_where_time_went()
    {
        var clock = new ManualClock();
        var timer = new DeploymentStepTimer(clock);

        await Assert.ThrowsAsync<OperationCanceledException>(() => timer.TimeAsync<int>("up+health", () =>
        {
            clock.Advance(TimeSpan.FromSeconds(240));
            throw new OperationCanceledException("Docker command timed out.");
        }));

        var step = Assert.Single(timer.Steps);
        Assert.Equal("up+health", step.Step);
        Assert.Equal(TimeSpan.FromSeconds(240), step.Duration);
    }

    [Fact]
    public void Summary_uses_invariant_number_format()
    {
        var previous = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("tr-TR");
            var clock = new ManualClock();
            var timer = new DeploymentStepTimer(clock);
            clock.Advance(TimeSpan.FromMilliseconds(1500));
            Assert.Equal("total=1.5s", timer.Summary());
        }
        finally { System.Globalization.CultureInfo.CurrentCulture = previous; }
    }
}
