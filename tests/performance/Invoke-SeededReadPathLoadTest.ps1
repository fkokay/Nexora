[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:5080',
    [string]$TenantName,
    [ValidateRange(10, 10000)][int]$RequestsPerEndpoint = 300,
    [ValidateRange(1, 200)][int]$Concurrency = 25,
    [ValidateRange(1, 1000000)][int]$MinimumRowsPerDataset = 100,
    [ValidateRange(1, 60000)][int]$P95ThresholdMs = 1000,
    [ValidateRange(0, 100)][double]$MaxErrorRatePercent = 1,
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\..\docs\performance-seeded-read-baseline.json')
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
    $password = $null
    $email = $null
}

$tenant = if ($TenantName) { $login.tenants | Where-Object name -eq $TenantName | Select-Object -First 1 } else { $login.tenants | Select-Object -First 1 }
if (-not $tenant) { $login = $null; throw 'The authenticated user has no matching active tenant.' }
$token = $login.accessToken
try {
    $selectionBody = @{ tenantId = $tenant.id } | ConvertTo-Json -Compress
    $selection = Invoke-RestMethod -Method Post -Uri "$root/api/auth/select-tenant" -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $selectionBody
} catch {
    throw 'Tenant selection failed. No load was sent.'
} finally {
    $selectionBody = $null
    $tenant = $null
    $login = $null
    $token = $null
}

$headers = @{ Authorization = "Bearer $($selection.accessToken)" }
$seededDatasets = @(
    [ordered]@{ name = 'stockItems'; path = '/api/stock/items/?page=1&pageSize=50' },
    [ordered]@{ name = 'crmOpportunities'; path = '/api/crm/opportunities/?page=1&pageSize=50' }
)
$preflight = [Collections.Generic.List[object]]::new()
$preflightFailures = [Collections.Generic.List[string]]::new()
foreach ($dataset in $seededDatasets) {
    try {
        $probe = Invoke-RestMethod -Method Get -Uri "$root$($dataset.path.Replace('pageSize=50', 'pageSize=1'))" -Headers $headers
        $rowCount = [long]$probe.total
        $preflight.Add([ordered]@{ dataset = $dataset.name; rows = $rowCount; minimumRows = $MinimumRowsPerDataset })
        $probe = $null
    } catch {
        $headers = $null
        $selection = $null
        $statusCode = 0
        try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
        throw "Seeded data preflight failed for $($dataset.name) (HTTP $statusCode). No load was sent. Check the selected tenant and API availability."
    }
    if ($rowCount -lt $MinimumRowsPerDataset) {
        $preflightFailures.Add("$($dataset.name)=$rowCount")
    }
}
if ($preflightFailures.Count -gt 0) {
    $headers = $null
    $selection = $null
    throw "Seeded data preflight failed ($($preflightFailures -join ', ')); at least $MinimumRowsPerDataset rows per dataset are required. No load was sent."
}

if (-not ('Nexora.SeededLoad.Sample' -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;
namespace Nexora.SeededLoad {
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

$endpointDefinitions = [ordered]@{ dashboard = '/api/dashboard' }
foreach ($dataset in $seededDatasets) { $endpointDefinitions[$dataset.name] = $dataset.path }
$results = [Collections.Generic.List[object]]::new()
foreach ($entry in $endpointDefinitions.GetEnumerator()) {
    $run = [Nexora.SeededLoad.Runner]::RunAsync("$root$($entry.Value)", $selection.accessToken, $RequestsPerEndpoint, $Concurrency, $Concurrency * 2).GetAwaiter().GetResult()
    $samples = @($run.Samples)
    $successful = @($samples | Where-Object { $_.StatusCode -eq 200 -and -not $_.ErrorType })
    $failed = $samples.Count - $successful.Count
    $latencies = @($samples | ForEach-Object { $_.ElapsedMs } | Sort-Object)
    $p95 = [long]$latencies[[Math]::Max(0, [Math]::Ceiling($latencies.Count * 0.95) - 1)]
    $max = [long]$latencies[-1]
    $errorPercent = [Math]::Round(($failed * 100.0) / $samples.Count, 3)
    $results.Add([ordered]@{
        endpoint = $entry.Key
        path = $entry.Value
        requests = $RequestsPerEndpoint
        successful = $successful.Count
        failed = $failed
        errorRatePercent = $errorPercent
        averageMilliseconds = [Math]::Round(($latencies | Measure-Object -Average).Average, 2)
        p95Milliseconds = $p95
        maxMilliseconds = $max
        throughputRequestsPerSecond = if ($run.WallClockMs -gt 0) { [Math]::Round($samples.Count * 1000.0 / $run.WallClockMs, 2) } else { 0 }
        wallClockMilliseconds = $run.WallClockMs
        warmupRequests = $run.WarmupRequests
        statuses = @($samples | Group-Object StatusCode, ErrorType | ForEach-Object { [ordered]@{ result = $_.Name; count = $_.Count } })
    })
}
$selection = $null
$headers = $null

$result = [ordered]@{
    dateUtc = [DateTime]::UtcNow.ToString('o')
    environment = 'local-docker-compose'
    scenario = 'authenticated-seeded-read-paths'
    requestsPerEndpoint = $RequestsPerEndpoint
    concurrency = $Concurrency
    minimumRowsPerSeededDataset = $MinimumRowsPerDataset
    seededDatasets = @($preflight)
    thresholds = [ordered]@{ p95Milliseconds = $P95ThresholdMs; maxErrorRatePercent = $MaxErrorRatePercent }
    endpoints = @($results)
    notes = 'Single-host local baseline, not a production capacity target. Seeded row counts are preflighted before load. Every measured route is GET-only; login and tenant selection setup is excluded. No response bodies, credentials, tokens, user IDs, or tenant IDs are stored.'
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $resolvedOutput
$results | Select-Object endpoint,requests,successful,failed,errorRatePercent,p95Milliseconds,maxMilliseconds,throughputRequestsPerSecond | Format-Table -AutoSize
Write-Output "Result written to $resolvedOutput"

$thresholdFailures = @($results | Where-Object { $_.p95Milliseconds -gt $P95ThresholdMs -or $_.errorRatePercent -gt $MaxErrorRatePercent })
if ($thresholdFailures.Count -gt 0) { throw 'One or more seeded read-path load thresholds failed. See the sanitized JSON summary.' }
