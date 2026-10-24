using System.Text.Json;

namespace AIERP.Platform.UnitTests;

public sealed class WorkspaceSandboxJobLifecycleTests
{
    [Fact]
    public async Task Concurrent_expiration_checks_publish_one_result_and_clean_up_the_snapshot()
    {
        var jobDirectory = Path.Combine(Path.GetTempPath(), $"aierp-expired-job-{Guid.NewGuid():N}");
        Directory.CreateDirectory(jobDirectory);
        var job = new WorkspaceSandboxJob(Guid.NewGuid(), Guid.NewGuid(), "tests/test_app.py", new string('a', 40),
            new string('b', 64), false, DateTimeOffset.UtcNow.AddMinutes(-25));
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var resultPath = Path.Combine(jobDirectory, "result.json");
        try
        {
            await File.WriteAllTextAsync(Path.Combine(jobDirectory, "job.json"), JsonSerializer.Serialize(job, options));
            await File.WriteAllTextAsync(Path.Combine(jobDirectory, "started.json"), "{}");
            File.SetLastWriteTimeUtc(Path.Combine(jobDirectory, "started.json"), DateTime.UtcNow.AddMinutes(-11));
            await File.WriteAllBytesAsync(Path.Combine(jobDirectory, "source.zip"), [1, 2, 3]);

            await Task.WhenAll(Enumerable.Range(0, 16).Select(_ =>
                WorkspaceSecurity.ExpireStaleTestJobAsync(jobDirectory, CancellationToken.None)));

            using var result = JsonDocument.Parse(await File.ReadAllTextAsync(resultPath));
            Assert.Equal("QueueExpired", result.RootElement.GetProperty("status").GetString());
            Assert.False(File.Exists(Path.Combine(jobDirectory, "source.zip")));
            Assert.Empty(Directory.GetFiles(jobDirectory, "result.json.runner.*.tmp"));
        }
        finally
        {
            Directory.Delete(jobDirectory, recursive: true);
        }
    }
}
