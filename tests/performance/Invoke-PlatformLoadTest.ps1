[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:5080',
    [string]$TenantName,
    [ValidateRange(10, 10000)][int]$Requests = 300,
    [ValidateRange(1, 200)][int]$Concurrency = 25,
    [ValidateRange(1, 60000)][int]$P95ThresholdMs = 1000,
    [ValidateRange(0, 100)][double]$MaxErrorRatePercent = 1,
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\..\docs\performance-baseline.json')
)

$ErrorActionPreference = 'Stop'
$email = [Environment]::GetEnvironmentVariable('AIERP_LOADTEST_EMAIL')
$password = [Environment]::GetEnvironmentVariable('AIERP_LOADTEST_PASSWORD')
if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
    throw 'Set AIERP_LOADTEST_EMAIL and AIERP_LOADTEST_PASSWORD in the current process. Credentials are never accepted as command-line arguments or written to the result.'
}

$root = $BaseUrl.TrimEnd('/')
try {
    $loginBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
    $login = Invoke-RestMethod -Method Post -Uri "$root/api/auth/login" -ContentType 'application/json' -Body $loginBody
} catch {
    throw 'Platform login failed. Check the local load-test credentials and API availability.'
} finally {
    $loginBody = $null
}

$tenant = if ($TenantName) { $login.tenants | Where-Object name -eq $TenantName | Select-Object -First 1 } else { $login.tenants | Select-Object -First 1 }
if (-not $tenant) { throw 'The authenticated user has no matching active tenant.' }
try {
    $selectionBody = @{ tenantId = $tenant.id } | ConvertTo-Json -Compress
    $selection = Invoke-RestMethod -Method Post -Uri "$root/api/auth/select-tenant" -Headers @{ Authorization = "Bearer $($login.accessToken)" } -ContentType 'application/json' -Body $selectionBody
} catch {
    throw 'Tenant selection failed. No load was sent.'
} finally {
    $selectionBody = $null
    $login = $null
}

if (-not ('Nexora.PlatformLoad.Sample' -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;
namespace Nexora.PlatformLoad {
    public sealed class Sample {
        public int StatusCode { get; set; }
        public long ElapsedMs { get; set; }
        public string ErrorType { get; set; }
    }
    public sealed class RunResult {
        public Sample[] Samples { get; set; }
        public long WallClockMs { get; set; }
        public int WarmupRequests { get; set; }
    }
    public static class Runner {
        public static async Task<RunResult> RunAsync(string url, string token, int count, int concurrency, int warmupCount) {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var gate = new SemaphoreSlim(concurrency, concurrency);
            var warmup = Enumerable.Range(0, warmupCount).Select(async _ => {
                using var response = await client.GetAsync(url, HttpCompletionOption.ResponseContentRead).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode) throw new InvalidOperationException("Warm-up request failed.");
            }).ToArray();
            await Task.WhenAll(warmup).ConfigureAwait(false);
            var timer = Stopwatch.StartNew();
            var tasks = Enumerable.Range(0, count).Select(async _ => {
                await gate.WaitAsync().ConfigureAwait(false);
                var sample = new Sample();
                var requestTimer = Stopwatch.StartNew();
                try {
                    using var response = await client.GetAsync(url, HttpCompletionOption.ResponseContentRead).ConfigureAwait(false);
                    sample.StatusCode = (int)response.StatusCode;
                } catch (Exception ex) {
                    sample.ErrorType = ex.GetType().Name;
                } finally {
                    requestTimer.Stop();
                    sample.ElapsedMs = requestTimer.ElapsedMilliseconds;
                    gate.Release();
                }
                return sample;
            }).ToArray();
            var samples = await Task.WhenAll(tasks).ConfigureAwait(false);
            timer.Stop();
            return new RunResult { Samples = samples, WallClockMs = timer.ElapsedMilliseconds, WarmupRequests = warmupCount };
        }
    }
}
"@
}

$token = $selection.accessToken
$selection = $null
$run = [Nexora.PlatformLoad.Runner]::RunAsync("$root/api/dashboard", $token, $Requests, $Concurrency, $Concurrency * 2).GetAwaiter().GetResult()
$token = $null
$samples = @($run.Samples)
$successful = @($samples | Where-Object { $_.StatusCode -eq 200 -and -not $_.ErrorType })
$failed = $samples.Count - $successful.Count
$orderedLatencies = @($samples | ForEach-Object { $_.ElapsedMs } | Sort-Object)
$p95Index = [Math]::Max(0, [Math]::Ceiling($orderedLatencies.Count * 0.95) - 1)
$p95 = [long]$orderedLatencies[$p95Index]
$max = [long]$orderedLatencies[-1]
$average = [Math]::Round(($orderedLatencies | Measure-Object -Average).Average, 2)
$errorPercent = [Math]::Round(($failed * 100.0) / $samples.Count, 3)
$throughput = if ($run.WallClockMs -gt 0) { [Math]::Round($samples.Count * 1000.0 / $run.WallClockMs, 2) } else { 0 }
$statuses = @($samples | Group-Object StatusCode, ErrorType | ForEach-Object { [ordered]@{ result = $_.Name; count = $_.Count } })

$result = [ordered]@{
    dateUtc = [DateTime]::UtcNow.ToString('o')
    environment = 'local-docker-compose'
    scenario = 'authenticated-read-only-dashboard-summary'
    endpoint = "$root/api/dashboard"
    requests = $Requests
    concurrency = $Concurrency
    warmupRequests = $run.WarmupRequests
    thresholds = [ordered]@{ p95Milliseconds = $P95ThresholdMs; maxErrorRatePercent = $MaxErrorRatePercent }
    results = [ordered]@{
        successful = $successful.Count
        failed = $failed
        errorRatePercent = $errorPercent
        averageMilliseconds = $average
        p95Milliseconds = $p95
        maxMilliseconds = $max
        throughputRequestsPerSecond = $throughput
        wallClockMilliseconds = $run.WallClockMs
        statuses = $statuses
    }
    notes = 'Single-host local baseline; not a production capacity target. Measured requests are read-only; login and tenant selection are setup calls and are excluded from the measurements. No response bodies, credentials, bearer tokens, user IDs, or tenant IDs are stored.'
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $resolvedOutput
$result.results | ConvertTo-Json -Depth 5
Write-Output "Result written to $resolvedOutput"

if ($p95 -gt $P95ThresholdMs -or $errorPercent -gt $MaxErrorRatePercent) {
    throw "Load-test threshold failed (p95 ${p95}ms; errors ${errorPercent}%)."
}
