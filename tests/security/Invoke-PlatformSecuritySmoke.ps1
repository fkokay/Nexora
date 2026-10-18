[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:5080',
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\..\docs\security-smoke.json')
)

$ErrorActionPreference = 'Stop'
$email = [Environment]::GetEnvironmentVariable('AIERP_SECURITY_TEST_EMAIL')
$password = [Environment]::GetEnvironmentVariable('AIERP_SECURITY_TEST_PASSWORD')
if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
    throw 'Set AIERP_SECURITY_TEST_EMAIL and AIERP_SECURITY_TEST_PASSWORD in the current process. Credentials are not accepted as arguments or written to the report.'
}

$root = $BaseUrl.TrimEnd('/')
$client = [System.Net.Http.HttpClient]::new()
$checks = [System.Collections.Generic.List[object]]::new()

function Send-Request([string]$Path, [string]$Method = 'GET', [string]$Token, [string]$Body, [string]$TenantHeader) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), "$root$Path")
    if ($Token) { $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Token) }
    if ($TenantHeader) { $request.Headers.TryAddWithoutValidation('X-Tenant-Id', $TenantHeader) | Out-Null }
    if ($Body) { $request.Content = [System.Net.Http.StringContent]::new($Body, [System.Text.Encoding]::UTF8, 'application/json') }
    try {
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $headerNames = @($response.Headers | ForEach-Object { $_.Key }) + @($response.Content.Headers | ForEach-Object { $_.Key })
            return [pscustomobject]@{
                Status = [int]$response.StatusCode
                Content = $content
                HasAuthorizationResponseHeader = $headerNames -contains 'Authorization'
            }
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

function Assert-Status([string]$Name, [int]$Actual, [int]$Expected) {
    $passed = $Actual -eq $Expected
    $checks.Add([ordered]@{ name = $Name; expectedStatus = $Expected; actualStatus = $Actual; passed = $passed })
    if (-not $passed) { throw "Security smoke check '$Name' expected HTTP $Expected and received HTTP $Actual." }
}

try {
    $health = Send-Request '/health'
    Assert-Status 'platform-health' $health.Status 200

    $anonymousDashboard = Send-Request '/api/dashboard'
    Assert-Status 'anonymous-dashboard-denied' $anonymousDashboard.Status 401
    $invalidBearerDashboard = Send-Request '/api/dashboard' 'GET' 'not-a-valid-token'
    Assert-Status 'invalid-bearer-dashboard-denied' $invalidBearerDashboard.Status 401

    $anonymousIntegration = Send-Request '/api/integrations/netsis/execute' 'POST' $null '{"payload":{}}'
    Assert-Status 'anonymous-integration-execution-denied' $anonymousIntegration.Status 401

    $protectedReads = @(
        @{ name = 'report-catalog'; path = '/api/reports/catalog' },
        @{ name = 'workflow-definitions'; path = '/api/workflows/definitions' },
        @{ name = 'business-rule-catalog'; path = '/api/business-rules/catalog' },
        @{ name = 'custom-forms'; path = '/api/custom-forms/' },
        @{ name = 'dashboard-widgets'; path = '/api/dashboard/widgets/' },
        @{ name = 'crm-opportunities'; path = '/api/crm/opportunities/' },
        @{ name = 'manufacturing-work-centers'; path = '/api/manufacturing/work-centers/' },
        @{ name = 'sales-orders'; path = '/api/sales/orders/' },
        @{ name = 'integration-operations'; path = '/api/integrations/operations' },
        @{ name = 'tenant-marketplace'; path = '/api/tenant/modules/' },
        @{ name = 'access-control-members'; path = '/api/access-control/members' }
    )
    foreach ($probe in $protectedReads) {
        $response = Send-Request $probe.path
        Assert-Status "anonymous-$($probe.name)-denied" $response.Status 401
    }

    try {
        $loginPayload = @{ email = $email; password = $password } | ConvertTo-Json -Compress
        $loginResponse = $client.PostAsync("$root/api/auth/login", [System.Net.Http.StringContent]::new($loginPayload, [System.Text.Encoding]::UTF8, 'application/json')).GetAwaiter().GetResult()
        try {
            if (-not $loginResponse.IsSuccessStatusCode) { throw 'Load-test account authentication failed.' }
            $login = $loginResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        } finally { $loginResponse.Dispose(); $loginPayload = $null }
    } catch { throw 'Security smoke authentication failed. No further authenticated checks were sent.' }

    $tenant = $login.tenants | Select-Object -First 1
    if (-not $tenant) { throw 'The authenticated user has no active tenant.' }
    $selectBody = @{ tenantId = $tenant.id } | ConvertTo-Json -Compress
    $selectedResponse = Send-Request '/api/auth/select-tenant' 'POST' $login.accessToken $selectBody
    if ($selectedResponse.Status -lt 200 -or $selectedResponse.Status -ge 300) { throw 'Tenant selection failed. No further authenticated checks were sent.' }
    $selection = $selectedResponse.Content | ConvertFrom-Json
    $selectBody = $null
    $login = $null

    $me = Send-Request '/api/auth/me' 'GET' $selection.accessToken
    Assert-Status 'tenant-session-authenticated' $me.Status 200
    $spoofedTenantId = [guid]::NewGuid().ToString('D')
    $meWithSpoofedTenant = Send-Request '/api/auth/me' 'GET' $selection.accessToken $null $spoofedTenantId
    Assert-Status 'tenant-header-spoof-does-not-break-authentication' $meWithSpoofedTenant.Status 200
    $claimTenantId = ($me.Content | ConvertFrom-Json).tenantId
    $spoofedRequestTenantId = ($meWithSpoofedTenant.Content | ConvertFrom-Json).tenantId
    $tenantHeaderIgnored = $claimTenantId -eq $spoofedRequestTenantId -and $spoofedRequestTenantId -ne $spoofedTenantId
    $checks.Add([ordered]@{ name = 'tenant-context-comes-from-authenticated-claim'; expected = $true; actual = $tenantHeaderIgnored; passed = $tenantHeaderIgnored })
    if (-not $tenantHeaderIgnored) { throw 'The client-supplied tenant header changed the authenticated tenant context.' }

    $invalidQuery = Send-Request '/api/reports/?kind=Invalid' 'GET' $selection.accessToken
    Assert-Status 'authenticated-invalid-query-is-client-error' $invalidQuery.Status 400
    $tokenEchoed = $invalidQuery.Content.Contains($selection.accessToken, [StringComparison]::Ordinal)
    $checks.Add([ordered]@{ name = 'bearer-token-not-echoed-in-error'; expected = $false; actual = $tokenEchoed; passed = -not $tokenEchoed })
    if ($tokenEchoed -or $invalidQuery.HasAuthorizationResponseHeader) { throw 'The error response exposed an authorization credential.' }

    $report = [ordered]@{
        dateUtc = [DateTime]::UtcNow.ToString('o')
        environment = 'local-docker-compose'
        checks = $checks
        passed = $checks.Count
        failed = 0
        notes = 'Statuses and security assertions only; credentials, tokens, user IDs, tenant IDs, and response bodies are not stored.'
    }
    $resolved = [System.IO.Path]::GetFullPath($OutputPath)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolved)) | Out-Null
    $report | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $resolved
    $report | ConvertTo-Json -Depth 8
    Write-Output "Result written to $resolved"
} finally {
    $selection = $null
    $client.Dispose()
}
