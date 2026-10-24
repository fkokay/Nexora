[CmdletBinding()]
param(
    [string]$FixturePath = (Join-Path $PSScriptRoot 'fixtures\synthetic-read-path-load.json')
)

$ErrorActionPreference = 'Stop'
$fixture = Get-Content -Raw -LiteralPath $FixturePath | ConvertFrom-Json
if ($fixture.schemaVersion -ne 1 -or -not $fixture.expectedLocalOnly) {
    throw 'The synthetic load fixture must declare schemaVersion 1 and expectedLocalOnly=true.'
}

$portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$portProbe.Start()
$port = ([Net.IPEndPoint]$portProbe.LocalEndpoint).Port
$portProbe.Stop()
$prefix = "http://127.0.0.1:$port/"

if (-not ('Nexora.SyntheticLoad.Api' -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;
namespace Nexora.SyntheticLoad {
    public static class Api {
        private static HttpListener listener;
        private static Task worker;
        private static int stockRows;
        private static int crmRows;
        private static string stockMarker;
        private static string crmMarker;

        public static void Start(string prefix, int stockCount, int crmCount, string stockValue, string crmValue) {
            stockRows = stockCount;
            crmRows = crmCount;
            stockMarker = stockValue;
            crmMarker = crmValue;
            listener = new HttpListener();
            listener.Prefixes.Add(prefix);
            listener.Start();
            worker = Task.Run(async () => {
                while (listener.IsListening) {
                    HttpListenerContext context;
                    try { context = await listener.GetContextAsync().ConfigureAwait(false); }
                    catch (HttpListenerException) { break; }
                    catch (ObjectDisposedException) { break; }
                    _ = Task.Run(() => Handle(context));
                }
            });
        }

        private static void Handle(HttpListenerContext context) {
            try {
                var request = context.Request;
                var path = request.Url.AbsolutePath.TrimEnd('/');
                if (request.HttpMethod == "POST" && path == "/api/auth/login") {
                    using (var reader = new StreamReader(request.InputStream, request.ContentEncoding)) {
                        var body = reader.ReadToEnd();
                        if (!body.Contains("load-test@example.invalid") || !body.Contains("synthetic-load-test-password")) {
                            Write(context, 401, "{}"); return;
                        }
                    }
        Write(context, 200, "{\"accessToken\":\"synthetic-login-token\",\"tenants\":[{\"id\":\"synthetic-tenant-id\",\"name\":\"Synthetic Load Tenant\",\"slug\":\"synthetic-load-00000000000000000000000000000000\"}]}");
                    return;
                }
                if (request.HttpMethod == "POST" && path == "/api/auth/select-tenant") {
                    if (request.Headers["Authorization"] != "Bearer synthetic-login-token") { Write(context, 401, "{}"); return; }
                    Write(context, 200, "{\"accessToken\":\"synthetic-selection-token\"}");
                    return;
                }
                if (request.HttpMethod == "GET") {
                    if (request.Headers["Authorization"] != "Bearer synthetic-selection-token") { Write(context, 401, "{}"); return; }
                    if (path == "/api/dashboard") { Write(context, 200, "{\"summary\":\"synthetic\"}"); return; }
                    if (path == "/api/stock/items") { Write(context, 200, Dataset(stockRows, stockMarker)); return; }
                    if (path == "/api/crm/opportunities") { Write(context, 200, Dataset(crmRows, crmMarker)); return; }
                }
                Write(context, 404, "{}");
            } catch {
                try { Write(context, 500, "{}"); } catch { }
            }
        }

        private static string Dataset(int rows, string marker) {
            return "{\"total\":" + rows + ",\"items\":[{\"code\":\"" + marker + "\"}]}";
        }

        private static void Write(HttpListenerContext context, int status, string body) {
            var bytes = Encoding.UTF8.GetBytes(body);
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            context.Response.ContentLength64 = bytes.Length;
            context.Response.OutputStream.Write(bytes, 0, bytes.Length);
            context.Response.Close();
        }

        public static void Stop() {
            if (listener == null) return;
            listener.Stop();
            listener.Close();
            try { worker?.Wait(TimeSpan.FromSeconds(2)); } catch { }
            listener = null;
        }
    }
}
"@
}

$requestScript = Join-Path $PSScriptRoot 'Invoke-SeededReadPathLoadTest.ps1'
$temporaryReport = Join-Path ([IO.Path]::GetTempPath()) ("nexora-synthetic-load-{0}.json" -f [Guid]::NewGuid().ToString('N'))
$env:AIERP_LOADTEST_EMAIL = [string]$fixture.credentials.email
$env:AIERP_LOADTEST_PASSWORD = [string]$fixture.credentials.password
try {
    [Nexora.SyntheticLoad.Api]::Start(
        $prefix,
        [int]$fixture.datasets.stockItems.rows,
        [int]$fixture.datasets.crmOpportunities.rows,
        [string]$fixture.datasets.stockItems.recordMarker,
        [string]$fixture.datasets.crmOpportunities.recordMarker)

    $pwsh = Join-Path $PSHOME 'pwsh.exe'
    $childOutput = & $pwsh -NoLogo -NoProfile -File $requestScript `
        -BaseUrl "http://127.0.0.1:$port" `
        -TenantSlug ([string]$fixture.syntheticTenant.slug) `
        -RequestsPerEndpoint ([int]$fixture.load.requestsPerEndpoint) `
        -Concurrency ([int]$fixture.load.concurrency) `
        -MinimumRowsPerDataset ([int]$fixture.load.minimumRowsPerDataset) `
        -P95ThresholdMs ([int]$fixture.load.p95ThresholdMs) `
        -MaxErrorRatePercent ([double]$fixture.load.maxErrorRatePercent) `
        -OutputPath $temporaryReport 2>&1
    $childExitCode = $LASTEXITCODE
    if ($childExitCode -ne 0) {
        throw "Seeded read-path harness failed against the synthetic local API (exit $childExitCode): $($childOutput -join ' ')"
    }

    $reportText = Get-Content -Raw -LiteralPath $temporaryReport
    foreach ($secret in @($fixture.credentials.email, $fixture.credentials.password, 'synthetic-login-token', $fixture.syntheticTenant.accessToken, $fixture.syntheticTenant.id, $fixture.syntheticTenant.slug, $fixture.datasets.stockItems.recordMarker, $fixture.datasets.crmOpportunities.recordMarker)) {
        if ($reportText.Contains([string]$secret)) { throw 'The sanitized report contains a synthetic credential, token, tenant identifier, or record value.' }
    }
    $report = $reportText | ConvertFrom-Json
    if ($report.scenario -ne 'authenticated-seeded-read-paths') { throw 'Unexpected report scenario.' }
    if ($report.seededDatasets.Count -ne 2) { throw 'The report must contain both seeded dataset preflight summaries.' }
    if ($report.seededDatasets[0].rows -ne $fixture.datasets.stockItems.rows -or $report.seededDatasets[1].rows -ne $fixture.datasets.crmOpportunities.rows) {
        throw 'The report preflight row counts do not match the synthetic fixture.'
    }
    if ($report.endpoints.Count -ne 3) { throw 'The report must cover dashboard, stock-item, and CRM-opportunity endpoints.' }
    foreach ($endpoint in $report.endpoints) {
        if ($endpoint.requests -ne $fixture.load.requestsPerEndpoint -or $endpoint.successful -ne $fixture.load.requestsPerEndpoint -or $endpoint.failed -ne 0) {
            throw "Synthetic acceptance failed for endpoint $($endpoint.endpoint)."
        }
    }

    [pscustomobject]@{
        result = 'passed'
        environment = 'in-process local synthetic API at 127.0.0.1'
        datasetsPreflighted = $report.seededDatasets.Count
        endpointsAccepted = $report.endpoints.Count
        requestsPerEndpoint = $fixture.load.requestsPerEndpoint
        requestsSucceeded = ($report.endpoints | Measure-Object -Property successful -Sum).Sum
        reportSanitization = 'passed'
    } | Format-List
} finally {
    [Nexora.SyntheticLoad.Api]::Stop()
    Remove-Item Env:\AIERP_LOADTEST_EMAIL, Env:\AIERP_LOADTEST_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temporaryReport -Force -ErrorAction SilentlyContinue
}
