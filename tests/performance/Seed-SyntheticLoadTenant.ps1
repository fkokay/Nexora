[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][Guid]$TenantId,
    [Parameter(Mandatory = $true)][string]$TenantName,
    [ValidateRange(100, 1000)][int]$RowsPerDataset = 100
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$baseUri = $null
if (-not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref]$baseUri) -or
    -not $baseUri.IsLoopback -or $baseUri.Scheme -notin @('http', 'https') -or
    $baseUri.AbsolutePath -ne '/' -or $baseUri.UserInfo -or $baseUri.Query -or $baseUri.Fragment) {
    throw 'Seed API URL must be an http(s) loopback URL without credentials, path, query, or fragment.'
}

if ($TenantName -cnotmatch '^Synthetic Load Tenant(?: [A-Za-z0-9._-]+)?$') {
    throw 'Expected tenant name must explicitly identify a Synthetic Load Tenant.'
}

$allowlistRaw = [Environment]::GetEnvironmentVariable('AIERP_SEED_ALLOWED_TENANT_IDS')
$allowlistedIds = @($allowlistRaw -split '[,;\s]+' | Where-Object { $_ } | ForEach-Object {
    $parsed = [Guid]::Empty
    if (-not [Guid]::TryParse($_, [ref]$parsed)) { throw 'AIERP_SEED_ALLOWED_TENANT_IDS contains an invalid GUID.' }
    $parsed.ToString('D')
})
if (-not $allowlistRaw -or $allowlistedIds -notcontains $TenantId.ToString('D')) {
    throw 'Tenant ID is not present in AIERP_SEED_ALLOWED_TENANT_IDS. No request was sent.'
}

$email = [Environment]::GetEnvironmentVariable('AIERP_LOADTEST_EMAIL')
$password = [Environment]::GetEnvironmentVariable('AIERP_LOADTEST_PASSWORD')
if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
    throw 'Set AIERP_LOADTEST_EMAIL and AIERP_LOADTEST_PASSWORD in the current process.'
}

$root = $baseUri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
$headers = $null
$selection = $null
$login = $null
$loginBody = $null

function Invoke-SeedApi {
    param([string]$Method, [string]$Path, [object]$Body = $null)
    $request = @{ Method = $Method; Uri = "$script:root$Path"; Headers = $script:headers; ErrorAction = 'Stop' }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Depth 8 -Compress
    }
    try { return Invoke-RestMethod @request }
    catch {
        $status = 0
        try { $status = [int]$_.Exception.Response.StatusCode } catch { }
        throw "Seed API $Method request failed (HTTP $status). Response details were suppressed."
    }
}

function Get-ByCode {
    param([string]$Path, [string]$Code)
    $query = [Uri]::EscapeDataString($Code)
    $page = Invoke-SeedApi -Method Get -Path "$Path`?q=$query&page=1&pageSize=100"
    $matches = @($page.items | Where-Object { $_.code -ceq $Code })
    if ($matches.Count -gt 1) { throw "More than one record matched synthetic code $Code; stopped without writing further records." }
    if ($matches.Count -eq 1) { return $matches[0] }
    return $null
}

function Confirm-ExistingRecord {
    param([object]$Record, [string]$Code, [string]$ExpectedName, [string]$Kind, [string]$ExpectedCustomerId = '')
    if ($Record.name -cne $ExpectedName) { throw "Synthetic code $Code already exists with a different name; no overwrite was attempted." }
    if ($Kind -eq 'customer' -and ($Record.type -cne 'Customer' -or -not $Record.isActive)) {
        throw "Synthetic customer code $Code is not an active customer; stopped without writing further records."
    }
    if ($Kind -eq 'stock' -and ($Record.unitCode -cne 'EA' -or -not $Record.isActive)) {
        throw "Synthetic stock code $Code is inactive or has a different unit; stopped without overwriting it."
    }
    if ($Kind -eq 'opportunity' -and ([string]$Record.customerId -cne $ExpectedCustomerId -or $Record.stage -in @('Won', 'Lost'))) {
        throw "Synthetic opportunity code $Code is closed or references a different customer; stopped without overwriting it."
    }
}

function Ensure-Record {
    param([string]$Path, [string]$Code, [string]$ExpectedName, [hashtable]$Payload,
        [string]$Kind, [string]$ExpectedCustomerId = '')
    $existing = Get-ByCode -Path $Path -Code $Code
    if ($existing) {
        Confirm-ExistingRecord -Record $existing -Code $Code -ExpectedName $ExpectedName -Kind $Kind -ExpectedCustomerId $ExpectedCustomerId
        return $false
    }
    try {
        $null = Invoke-SeedApi -Method Post -Path $Path -Body $Payload
        return $true
    } catch {
        # A concurrent/retried create can race after the lookup; accept only the same stable code/name.
        $existing = Get-ByCode -Path $Path -Code $Code
        if ($existing) {
            Confirm-ExistingRecord -Record $existing -Code $Code -ExpectedName $ExpectedName -Kind $Kind -ExpectedCustomerId $ExpectedCustomerId
            return $false
        }
        throw
    }
}

try {
    $loginBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
    try { $login = Invoke-RestMethod -Method Post -Uri "$root/api/auth/login" -ContentType 'application/json' -Body $loginBody -ErrorAction Stop }
    catch { throw 'Platform login failed. Check the synthetic load-test account and API availability.' }
    finally { $loginBody = $null; $password = $null; $email = $null }

    $tenantMatches = @($login.tenants | Where-Object {
        ([string]$_.id).Equals($TenantId.ToString(), [StringComparison]::OrdinalIgnoreCase) -and
        [string]$_.name -ceq $TenantName -and
        [string]$_.slug -cmatch '^synthetic-load-[0-9a-f]{32}$'
    })
    if ($tenantMatches.Count -ne 1) { throw 'Authenticated account does not contain exactly one tenant matching the allowlisted ID, exact name, and synthetic slug. No tenant was selected.' }

    $selectionBody = @{ tenantId = $TenantId } | ConvertTo-Json -Compress
    try {
        $selection = Invoke-RestMethod -Method Post -Uri "$root/api/auth/select-tenant" -Headers @{ Authorization = "Bearer $($login.accessToken)" } -ContentType 'application/json' -Body $selectionBody -ErrorAction Stop
    } catch { throw 'Synthetic tenant selection failed. No seed records were written.' }
    finally { $selectionBody = $null }
    $headers = @{ Authorization = "Bearer $($selection.accessToken)" }
    $login = $null

    $tenantSuffix = ([string]$tenantMatches[0].slug).Substring('synthetic-load-'.Length).ToUpperInvariant()
    $created = [ordered]@{ stockItems = 0; customerAccounts = 0; crmOpportunities = 0 }

    $customerCode = "L${tenantSuffix}C001"
    $customerName = 'Synthetic load test customer 001'
    $customer = Get-ByCode -Path '/api/customers/' -Code $customerCode
    if ($customer) { Confirm-ExistingRecord -Record $customer -Code $customerCode -ExpectedName $customerName -Kind 'customer' }
    if (-not $customer) {
        $customerPayload = @{ code = $customerCode; name = $customerName; type = 'Customer'; taxNumber = $null; isActive = $true; currencyCode = 'TRY'; paymentTermDays = 0 }
        $customerCreated = Ensure-Record -Path '/api/customers/' -Code $customerCode -ExpectedName $customerName -Payload $customerPayload -Kind 'customer'
        $customer = Get-ByCode -Path '/api/customers/' -Code $customerCode
        if (-not $customer) { throw 'Synthetic customer could not be read after create.' }
        Confirm-ExistingRecord -Record $customer -Code $customerCode -ExpectedName $customerName -Kind 'customer'
        if ($customerCreated) { $created.customerAccounts++ }
    }

    $expectedCloseDate = [DateTime]::UtcNow.AddDays(90).ToString('yyyy-MM-dd')
    for ($i = 1; $i -le $RowsPerDataset; $i++) {
        $sequence = $i.ToString('D3')
        $stockCode = "L${tenantSuffix}S$sequence"
        $stockName = "Synthetic load stock item $sequence"
        $stockPayload = @{ code = $stockCode; name = $stockName; barcode = $null; unitCode = 'EA'; category = 'Synthetic Load'; minimumStock = 0; isActive = $true; trackingMode = 'None' }
        if (Ensure-Record -Path '/api/stock/items/' -Code $stockCode -ExpectedName $stockName -Payload $stockPayload -Kind 'stock') { $created.stockItems++ }

        $opportunityCode = "L${tenantSuffix}O$sequence"
        $opportunityName = "Synthetic load opportunity $sequence"
        $opportunityPayload = @{ code = $opportunityCode; name = $opportunityName; customerId = [string]$customer.id; estimatedValue = 1000; currencyCode = 'TRY'; probabilityPercent = 10; expectedCloseDate = $expectedCloseDate; nextActivityAt = $null; notes = 'Synthetic performance fixture.' }
        if (Ensure-Record -Path '/api/crm/opportunities/' -Code $opportunityCode -ExpectedName $opportunityName -Payload $opportunityPayload -Kind 'opportunity' -ExpectedCustomerId ([string]$customer.id)) { $created.crmOpportunities++ }
    }

    [pscustomobject]@{
        result = 'seed-complete'
        created = $created
        requestedRowsPerDataset = $RowsPerDataset
        tenantGuard = 'allowlisted-id+exact-name+synthetic-slug'
        writes = 'POST only; existing records were left unchanged'
    }
} finally {
    $headers = $null
    $selection = $null
    $login = $null
    $loginBody = $null
    $password = $null
    $email = $null
}
