[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:5080',
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\..\docs\sql-report-acceptance.json')
)

$ErrorActionPreference = 'Stop'
$email = [Environment]::GetEnvironmentVariable('AIERP_SECURITY_TEST_EMAIL')
$password = [Environment]::GetEnvironmentVariable('AIERP_SECURITY_TEST_PASSWORD')
if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
    throw 'Set AIERP_SECURITY_TEST_EMAIL and AIERP_SECURITY_TEST_PASSWORD in the current process. Credentials are not accepted as arguments or written to the report.'
}

$root = $BaseUrl.TrimEnd('/')
$client = [System.Net.Http.HttpClient]::new()
$checks = [Collections.Generic.List[object]]::new()
$skippedChecks = [Collections.Generic.List[object]]::new()
$pagingSource = $null
$pagingColumn = $null

function Send-ApiRequest([string]$Path, [string]$Method = 'GET', [string]$Token, [string]$Body) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), "$root$Path")
    if ($Token) { $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Token) }
    if ($Body) { $request.Content = [System.Net.Http.StringContent]::new($Body, [Text.Encoding]::UTF8, 'application/json') }
    try {
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            return [pscustomobject]@{
                Status = [int]$response.StatusCode
                Content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            }
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

function Assert-Check([string]$Name, [bool]$Passed, [string]$Details) {
    $checks.Add([ordered]@{ name = $Name; passed = $Passed; details = $Details })
    if (-not $Passed) { throw "SQL report acceptance check '$Name' failed: $Details" }
}

try {
    $loginBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
    $loginResponse = Send-ApiRequest '/api/auth/login' 'POST' $null $loginBody
    $loginBody = $null
    if ($loginResponse.Status -ne 200) { throw 'Configured acceptance account authentication failed; no report requests were sent.' }
    $login = $loginResponse.Content | ConvertFrom-Json
    $tenant = $login.tenants | Select-Object -First 1
    if (-not $tenant) { throw 'The configured acceptance account has no active tenant.' }

    $selectionBody = @{ tenantId = $tenant.id } | ConvertTo-Json -Compress
    $selectionResponse = Send-ApiRequest '/api/auth/select-tenant' 'POST' $login.accessToken $selectionBody
    $selectionBody = $null
    $login = $null
    if ($selectionResponse.Status -ne 200) { throw 'Tenant selection failed; no report requests were sent.' }
    $selection = $selectionResponse.Content | ConvertFrom-Json

    $catalogResponse = Send-ApiRequest '/api/reports/catalog' 'GET' $selection.accessToken $null
    if ($catalogResponse.Status -ne 200) { throw "Report catalog returned HTTP $($catalogResponse.Status)." }
    $catalog = @($catalogResponse.Content | ConvertFrom-Json)
    $stockSource = $catalog | Where-Object code -eq 'stockItems' | Select-Object -First 1
    Assert-Check 'tenant-report-catalog' ($null -ne $stockSource) 'Authenticated tenant catalog exposes stockItems.'
    $financialSource = $catalog | Where-Object code -eq 'financialAccountTransactions' | Select-Object -First 1
    Assert-Check 'tenant-financial-transaction-report-catalog' ($null -ne $financialSource) 'Authenticated tenant catalog exposes financialAccountTransactions.'
    $salesQuoteSource = $catalog | Where-Object code -eq 'salesQuotes' | Select-Object -First 1
    Assert-Check 'tenant-sales-quote-report-catalog' ($null -ne $salesQuoteSource) 'Authenticated tenant catalog exposes salesQuotes.'
    $crmOpportunitySource = $catalog | Where-Object code -eq 'crmOpportunities' | Select-Object -First 1
    Assert-Check 'tenant-crm-opportunity-report-catalog' ($null -ne $crmOpportunitySource) 'Authenticated tenant catalog exposes crmOpportunities.'
    $supplierPaymentSource = $catalog | Where-Object code -eq 'supplierPayments' | Select-Object -First 1
    Assert-Check 'tenant-supplier-payment-report-catalog' ($null -ne $supplierPaymentSource) 'Authenticated tenant catalog exposes supplierPayments.'
    $customerLedgerSource = $catalog | Where-Object code -eq 'customerLedgerEntries' | Select-Object -First 1
    Assert-Check 'tenant-customer-ledger-report-catalog' ($null -ne $customerLedgerSource) 'Authenticated tenant catalog exposes customerLedgerEntries.'
    $bankStatementLineSource = $catalog | Where-Object code -eq 'bankStatementLines' | Select-Object -First 1
    Assert-Check 'tenant-bank-statement-line-report-catalog' ($null -ne $bankStatementLineSource) 'Authenticated tenant catalog exposes bankStatementLines.'
    if ($bankStatementLineSource) {
        $bankLineColumnCodes = @($bankStatementLineSource.columns | ForEach-Object code)
        Assert-Check 'tenant-bank-statement-line-report-columns' (
            $bankLineColumnCodes -contains 'statementCode' -and $bankLineColumnCodes -contains 'transactionDate' -and
            $bankLineColumnCodes -contains 'amount' -and $bankLineColumnCodes -contains 'isMatched' -and
            $bankLineColumnCodes -contains 'matchedAt'
        ) 'Authenticated tenant catalog exposes the bank-line identity, amount, match status and reconciliation timestamp fields.'
    }

    $namedSources = @('stockItems', 'financialAccountTransactions', 'salesQuotes', 'crmOpportunities', 'supplierPayments', 'customerLedgerEntries')
    foreach ($source in $catalog | Where-Object { $_.code -notin $namedSources }) {
        $firstColumn = $source.columns | Select-Object -First 1
        if (-not $firstColumn -or [string]::IsNullOrWhiteSpace($firstColumn.code)) {
            Assert-Check "catalog-report-columns-$($source.code)" $false 'Every catalog source must expose a selectable report column.'
            continue
        }

        $smokeRequest = @{
            source = $source.code; columns = @($firstColumn.code); filters = @()
            sortBy = $firstColumn.code; descending = $false; page = 1; pageSize = 1
        } | ConvertTo-Json -Depth 5 -Compress
        $smokeResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $smokeRequest
        $smokeRequest = $null
        if ($smokeResponse.Status -ne 200) { throw "SQL-backed report source '$($source.code)' returned HTTP $($smokeResponse.Status)." }
        $smokeResult = $smokeResponse.Content | ConvertFrom-Json
        $smokeValid = $smokeResult.source -eq $source.code -and $smokeResult.columns.Count -eq 1 -and $smokeResult.rows.Count -le 1 -and $smokeResult.totalCount -ge $smokeResult.rows.Count
        Assert-Check "sql-report-source-$($source.code)" $smokeValid "Tenant SQL query returned $($smokeResult.rows.Count) bounded row(s); business row data is not retained."
        if ($null -eq $pagingSource -and $smokeResult.totalCount -ge 2) {
            $pagingSource = $source.code
            $pagingColumn = $firstColumn.code
        }
        $smokeResult = $null
    }

    $detailRequest = @{
        source = 'stockItems'; columns = @('code','onHand','reserved','available'); filters = @()
        sortBy = 'code'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $detailResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $detailRequest
    if ($detailResponse.Status -ne 200) { throw "SQL-backed stock report returned HTTP $($detailResponse.Status). Response content is omitted to protect tenant data." }
    $detail = $detailResponse.Content | ConvertFrom-Json
    $detailValid = $detail.source -eq 'stockItems' -and $detail.columns.Count -eq 4 -and $detail.rows.Count -le 20 -and $detail.totalCount -ge $detail.rows.Count
    Assert-Check 'sql-stock-balance-detail' $detailValid "Tenant SQL query returned $($detail.rows.Count) bounded rows and $($detail.totalCount) total rows; row data is not retained."

    $bankStatementLineRequest = @{
        source = 'bankStatementLines'; columns = @('statementCode','lineNumber','transactionDate','direction','currencyCode','amount','isMatched','transactionId','matchedAt')
        filters = @(@{ field = 'isMatched'; operator = 'equals'; value = 'false' })
        sortBy = 'transactionDate'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 6 -Compress
    $bankStatementLineResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $bankStatementLineRequest
    $bankStatementLineRequest = $null
    if ($bankStatementLineResponse.Status -ne 200) { throw "SQL-backed bank statement line report returned HTTP $($bankStatementLineResponse.Status). Response content is omitted to protect tenant data." }
    $bankStatementLines = $bankStatementLineResponse.Content | ConvertFrom-Json
    $bankStatementLineRowsValid = @($bankStatementLines.rows | Where-Object { $_.isMatched -ne $false }).Count -eq 0
    $bankStatementLineValid = $bankStatementLines.source -eq 'bankStatementLines' -and $bankStatementLines.columns.Count -eq 9 -and
        $bankStatementLines.rows.Count -le 20 -and $bankStatementLines.totalCount -ge $bankStatementLines.rows.Count -and $bankStatementLineRowsValid
    Assert-Check 'sql-bank-statement-line-filtered-detail' $bankStatementLineValid "Tenant SQL query returned $($bankStatementLines.rows.Count) bounded unmatched line row(s) and $($bankStatementLines.totalCount) total matching rows; row data is not retained."
    $bankStatementLines = $null

    $bankStatementLineExportRequest = @{
        source = 'bankStatementLines'; columns = @('statementCode','lineNumber','transactionDate','direction','currencyCode','amount','isMatched')
        filters = @(@{ field = 'isMatched'; operator = 'equals'; value = 'false' })
        sortBy = 'transactionDate'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 6 -Compress
    $bankStatementLineExportResponse = Send-ApiRequest '/api/reports/export' 'POST' $selection.accessToken $bankStatementLineExportRequest
    $bankStatementLineExportRequest = $null
    if ($bankStatementLineExportResponse.Status -ne 200) { throw "SQL-backed bank statement line CSV returned HTTP $($bankStatementLineExportResponse.Status). Response content is omitted to protect tenant data." }
    $bankStatementLineCsvHeader = ($bankStatementLineExportResponse.Content -split '\r?\n', 2)[0]
    Assert-Check 'sql-bank-statement-line-csv' ($bankStatementLineCsvHeader -match 'Ekstre kodu' -and $bankStatementLineCsvHeader -match 'Hareket tarihi' -and $bankStatementLineCsvHeader -match 'Tutar') 'SQL-backed bank statement line export returned the expected localized CSV columns; row contents are not retained.'

    $groupRequest = @{
        source = 'stockItems'; columns = @('trackingMode'); filters = @()
        sortBy = 'trackingMode'; descending = $false; page = 1; pageSize = 20
        groupByFields = @('trackingMode'); aggregate = 'count'
    } | ConvertTo-Json -Depth 5 -Compress
    $groupResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $groupRequest
    if ($groupResponse.Status -ne 200) { throw "SQL-backed stock grouping returned HTTP $($groupResponse.Status): $($groupResponse.Content)" }
    $grouped = $groupResponse.Content | ConvertFrom-Json
    $groupedValid = $grouped.source -eq 'stockItems' -and $grouped.aggregate -eq 'count' -and $grouped.totalGroups -ge $grouped.groups.Count -and $grouped.groups.Count -le 20
    Assert-Check 'sql-stock-grouped-aggregate' $groupedValid "Tenant SQL grouping returned $($grouped.groups.Count) bounded groups and $($grouped.totalGroups) total groups; values are not retained."

    if ($grouped.groups.Count -gt 0) {
        $firstGroup = $grouped.groups[0]
        $groupValue = if ($firstGroup.groupValues -and $firstGroup.groupValues.Count -gt 0) { $firstGroup.groupValues[0] } else { $firstGroup.groupValue }
        $groupFilter = if ($null -eq $groupValue) {
            @{ field = 'trackingMode'; operator = 'isNull'; value = '' }
        } else {
            @{ field = 'trackingMode'; operator = 'equals'; value = [string]$groupValue }
        }
        $drillRequest = @{
            source = 'stockItems'; columns = @('code','trackingMode','onHand'); filters = @($groupFilter)
            sortBy = 'code'; descending = $false; page = 1; pageSize = 20
        } | ConvertTo-Json -Depth 5 -Compress
        $drillResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $drillRequest
        $drillRequest = $null
        if ($drillResponse.Status -ne 200) { throw "SQL-backed stock group drill-down returned HTTP $($drillResponse.Status). Response content is omitted to protect tenant data." }
        $drill = $drillResponse.Content | ConvertFrom-Json
        $drillMatchesGroup = @($drill.rows | Where-Object { if ($null -eq $groupValue) { $null -ne $_.trackingMode } else { [string]$_.trackingMode -ne [string]$groupValue } }).Count -eq 0
        $drillValid = $drill.source -eq 'stockItems' -and $drill.columns.Count -eq 3 -and $drill.rows.Count -le 20 -and
            $drill.totalCount -eq $firstGroup.rowCount -and $drillMatchesGroup
        Assert-Check 'sql-stock-null-aware-group-drilldown' $drillValid "Tenant SQL drill-down matched the selected group's count; row data is not retained."
        $drill = $null
    } else {
        Assert-Check 'sql-stock-null-aware-group-drilldown' $false 'Representative stock data must include at least one tracking-mode group.'
    }

    if ($pagingSource) {
        $pagedRequest = @{
            source = $pagingSource; columns = @($pagingColumn); filters = @()
            sortBy = $pagingColumn; descending = $false; page = 1; pageSize = 1
        } | ConvertTo-Json -Depth 5 -Compress
        $pageOneResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $pagedRequest
        if ($pageOneResponse.Status -ne 200) { throw "SQL-backed report paging for '$pagingSource' returned HTTP $($pageOneResponse.Status)." }
        $pageOne = $pageOneResponse.Content | ConvertFrom-Json
        $pageTwoRequest = @{
            source = $pagingSource; columns = @($pagingColumn); filters = @()
            sortBy = $pagingColumn; descending = $false; page = 2; pageSize = 1
        } | ConvertTo-Json -Depth 5 -Compress
        $pageTwoResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $pageTwoRequest
        if ($pageTwoResponse.Status -ne 200) { throw "SQL-backed report second page for '$pagingSource' returned HTTP $($pageTwoResponse.Status)." }
        $pageTwo = $pageTwoResponse.Content | ConvertFrom-Json
        $pagingValid = $pageOne.rows.Count -eq 1 -and $pageTwo.rows.Count -eq 1 -and $pageOne.page -eq 1 -and $pageTwo.page -eq 2 -and
            $pageOne.totalCount -eq $pageTwo.totalCount -and $pageOne.rows[0].$pagingColumn -ne $pageTwo.rows[0].$pagingColumn
        Assert-Check "sql-report-deterministic-paging-$pagingSource" $pagingValid "Tenant SQL pages for '$pagingSource' are bounded, ordered and disjoint; row values are not retained."
        $pageTwo = $null
    } else {
        $skippedChecks.Add([ordered]@{ name = 'sql-report-deterministic-paging'; reason = 'No tenant report source contains two rows, so a SQL second-page request cannot be verified with current local data.' })
    }
    $pageOne = $null
    $pagedRequest = $null

    $salesQuoteRequest = @{
        source = 'salesQuotes'; columns = @('code','customerName','quoteDate','currencyCode','status','grandTotal','orderCode'); filters = @()
        sortBy = 'quoteDate'; descending = $true; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $salesQuoteResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $salesQuoteRequest
    $salesQuoteRequest = $null
    if ($salesQuoteResponse.Status -ne 200) { throw "SQL-backed sales quote report returned HTTP $($salesQuoteResponse.Status)." }
    $salesQuotes = $salesQuoteResponse.Content | ConvertFrom-Json
    $salesQuoteValid = $salesQuotes.source -eq 'salesQuotes' -and $salesQuotes.columns.Count -eq 7 -and $salesQuotes.rows.Count -le 20 -and $salesQuotes.totalCount -ge $salesQuotes.rows.Count
    Assert-Check 'sql-sales-quote-detail' $salesQuoteValid "Tenant SQL query returned $($salesQuotes.rows.Count) bounded rows and $($salesQuotes.totalCount) total rows; quote data is not retained."
    $salesQuotes = $null

    $salesQuoteExportRequest = @{
        source = 'salesQuotes'; columns = @('code','customerName','currencyCode','grandTotal','orderCode'); filters = @()
        sortBy = 'code'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $salesQuoteExportResponse = Send-ApiRequest '/api/reports/export' 'POST' $selection.accessToken $salesQuoteExportRequest
    $salesQuoteExportRequest = $null
    if ($salesQuoteExportResponse.Status -ne 200) { throw "SQL-backed sales quote CSV returned HTTP $($salesQuoteExportResponse.Status)." }
    $salesQuoteCsvHeader = ($salesQuoteExportResponse.Content -split '\r?\n', 2)[0]
    Assert-Check 'sql-sales-quote-csv' ($salesQuoteCsvHeader -match 'Teklif kodu' -and $salesQuoteCsvHeader -match 'Müşteri adı' -and $salesQuoteCsvHeader -match 'Para birimi') 'SQL-backed sales quote export returned the expected CSV header; row contents are not retained.'

    $salesQuoteGroupRequest = @{
        source = 'salesQuotes'; columns = @('status'); filters = @()
        sortBy = 'status'; descending = $false; page = 1; pageSize = 20
        groupByFields = @('status'); aggregate = 'count'
    } | ConvertTo-Json -Depth 5 -Compress
    $salesQuoteGroupResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $salesQuoteGroupRequest
    $salesQuoteGroupRequest = $null
    Assert-Check 'sales-quote-grouping-rejected' ($salesQuoteGroupResponse.Status -eq 400) 'The API rejects grouping for sales quote reports to preserve quote-level traceability.'

    $crmOpportunityRequest = @{
        source = 'crmOpportunities'; columns = @('code','name','customerCode','customerName','stage','estimatedValue','currencyCode','probabilityPercent','expectedCloseDate')
        filters = @(@{ field = 'stage'; operator = 'equals'; value = 'Prospecting' })
        sortBy = 'expectedCloseDate'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 6 -Compress
    $crmOpportunityResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $crmOpportunityRequest
    $crmOpportunityRequest = $null
    if ($crmOpportunityResponse.Status -ne 200) { throw "SQL-backed CRM opportunity report returned HTTP $($crmOpportunityResponse.Status)." }
    $crmOpportunities = $crmOpportunityResponse.Content | ConvertFrom-Json
    $crmRowsValid = @($crmOpportunities.rows | Where-Object { $_.stage -ne 'Prospecting' }).Count -eq 0
    $crmOpportunityValid = $crmOpportunities.source -eq 'crmOpportunities' -and $crmOpportunities.columns.Count -eq 9 -and
        $crmOpportunities.rows.Count -le 20 -and $crmOpportunities.totalCount -ge $crmOpportunities.rows.Count -and $crmRowsValid
    Assert-Check 'sql-crm-opportunity-filtered-detail' $crmOpportunityValid "Tenant SQL query returned $($crmOpportunities.rows.Count) filtered bounded rows and $($crmOpportunities.totalCount) total rows; opportunity data is not retained."
    $crmOpportunities = $null

    $crmOpportunityExportRequest = @{
        source = 'crmOpportunities'; columns = @('code','name','customerName','stage','estimatedValue','currencyCode'); filters = @()
        sortBy = 'code'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $crmOpportunityExportResponse = Send-ApiRequest '/api/reports/export' 'POST' $selection.accessToken $crmOpportunityExportRequest
    $crmOpportunityExportRequest = $null
    if ($crmOpportunityExportResponse.Status -ne 200) { throw "SQL-backed CRM opportunity CSV returned HTTP $($crmOpportunityExportResponse.Status)." }
    $crmOpportunityCsvHeader = ($crmOpportunityExportResponse.Content -split '\r?\n', 2)[0]
    Assert-Check 'sql-crm-opportunity-csv' ($crmOpportunityCsvHeader -match 'Fırsat kodu' -and $crmOpportunityCsvHeader -match 'Müşteri adı' -and $crmOpportunityCsvHeader -match 'Para birimi') 'SQL-backed CRM opportunity export returned the expected CSV header; row contents are not retained.'

    $crmOpportunityGroupRequest = @{
        source = 'crmOpportunities'; columns = @('stage'); filters = @()
        sortBy = 'stage'; descending = $false; page = 1; pageSize = 20
        groupByFields = @('stage'); aggregate = 'count'
    } | ConvertTo-Json -Depth 5 -Compress
    $crmOpportunityGroupResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $crmOpportunityGroupRequest
    $crmOpportunityGroupRequest = $null
    Assert-Check 'crm-opportunity-grouping-rejected' ($crmOpportunityGroupResponse.Status -eq 400) 'The API rejects CRM opportunity grouping to avoid currency-unsafe estimated-value aggregates.'

    $financialRequest = @{
        source = 'financialAccountTransactions'; columns = @('accountCode','accountName','currencyCode','amount','transactionDate','direction','sourceType','sourceCode','reversalOfId')
        filters = @(); sortBy = 'transactionDate'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $financialResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $financialRequest
    $financialRequest = $null
    if ($financialResponse.Status -ne 200) { throw "SQL-backed financial transaction report returned HTTP $($financialResponse.Status)." }
    $financial = $financialResponse.Content | ConvertFrom-Json
    $financialValid = $financial.source -eq 'financialAccountTransactions' -and $financial.columns.Count -eq 9 -and $financial.rows.Count -le 20 -and $financial.totalCount -ge $financial.rows.Count
    Assert-Check 'sql-financial-transaction-detail' $financialValid "Tenant SQL query returned $($financial.rows.Count) bounded rows and $($financial.totalCount) total rows; financial row data is not retained."
    $financial = $null

    $financialExportRequest = @{
        source = 'financialAccountTransactions'; columns = @('accountCode','currencyCode','amount','sourceType'); filters = @()
        sortBy = 'accountCode'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $financialExportResponse = Send-ApiRequest '/api/reports/export' 'POST' $selection.accessToken $financialExportRequest
    $financialExportRequest = $null
    if ($financialExportResponse.Status -ne 200) { throw "SQL-backed financial transaction CSV returned HTTP $($financialExportResponse.Status)." }
    $financialCsv = $financialExportResponse.Content
    $financialCsvHeader = ($financialCsv -split '\r?\n', 2)[0]
    Assert-Check 'sql-financial-transaction-csv' ($financialCsvHeader -match 'Hesap kodu' -and $financialCsvHeader -match 'Para birimi' -and $financialCsvHeader -match 'Kaynak türü') 'SQL-backed financial export returned the expected CSV header; row contents are not retained.'
    $financialCsv = $null

    $financialGroupRequest = @{
        source = 'financialAccountTransactions'; columns = @('currencyCode'); filters = @()
        sortBy = 'currencyCode'; descending = $false; page = 1; pageSize = 20
        groupByFields = @('currencyCode'); aggregate = 'count'
    } | ConvertTo-Json -Depth 5 -Compress
    $financialGroupResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $financialGroupRequest
    $financialGroupRequest = $null
    Assert-Check 'financial-transaction-grouping-rejected' ($financialGroupResponse.Status -eq 400) 'The API rejects grouping for transaction reports to prevent cross-currency aggregation.'

    $supplierPaymentRequest = @{
        source = 'supplierPayments'; columns = @('code','invoiceCode','supplierCode','supplierName','paymentDate','currencyCode','amount','paymentMethod','reference','status','accountCode')
        filters = @(); sortBy = 'paymentDate'; descending = $true; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $supplierPaymentResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $supplierPaymentRequest
    $supplierPaymentRequest = $null
    if ($supplierPaymentResponse.Status -ne 200) { throw "SQL-backed supplier payment report returned HTTP $($supplierPaymentResponse.Status)." }
    $supplierPayments = $supplierPaymentResponse.Content | ConvertFrom-Json
    $supplierPaymentValid = $supplierPayments.source -eq 'supplierPayments' -and $supplierPayments.columns.Count -eq 11 -and $supplierPayments.rows.Count -le 20 -and $supplierPayments.totalCount -ge $supplierPayments.rows.Count
    Assert-Check 'sql-supplier-payment-detail' $supplierPaymentValid "Tenant SQL query returned $($supplierPayments.rows.Count) bounded rows and $($supplierPayments.totalCount) total rows; payment details are not retained."
    $supplierPayments = $null

    $supplierPaymentExportRequest = @{
        source = 'supplierPayments'; columns = @('code','invoiceCode','supplierName','paymentDate','currencyCode','amount','status'); filters = @()
        sortBy = 'paymentDate'; descending = $true; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $supplierPaymentExportResponse = Send-ApiRequest '/api/reports/export' 'POST' $selection.accessToken $supplierPaymentExportRequest
    $supplierPaymentExportRequest = $null
    if ($supplierPaymentExportResponse.Status -ne 200) { throw "SQL-backed supplier payment CSV returned HTTP $($supplierPaymentExportResponse.Status)." }
    $supplierPaymentCsvHeader = ($supplierPaymentExportResponse.Content -split '\r?\n', 2)[0]
    Assert-Check 'sql-supplier-payment-csv' ($supplierPaymentCsvHeader -match 'Ödeme kodu' -and $supplierPaymentCsvHeader -match 'Alış faturası' -and $supplierPaymentCsvHeader -match 'Para birimi') 'SQL-backed supplier payment export returned the expected CSV header; row contents are not retained.'

    $supplierPaymentGroupRequest = @{
        source = 'supplierPayments'; columns = @('status'); filters = @()
        sortBy = 'status'; descending = $false; page = 1; pageSize = 20
        groupByFields = @('status'); aggregate = 'count'
    } | ConvertTo-Json -Depth 5 -Compress
    $supplierPaymentGroupResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $supplierPaymentGroupRequest
    $supplierPaymentGroupRequest = $null
    Assert-Check 'supplier-payment-grouping-rejected' ($supplierPaymentGroupResponse.Status -eq 400) 'The API rejects supplier payment grouping to prevent cross-currency totals.'

    $customerLedgerRequest = @{
        source = 'customerLedgerEntries'; columns = @('entryDate','customerCode','counterpartyType','direction','amount','currencyCode','sourceType','sourceCode','reversalOfId')
        filters = @(@{ field = 'sourceType'; operator = 'equals'; value = 'SalesInvoice' })
        sortBy = 'sourceCode'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 6 -Compress
    $customerLedgerResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $customerLedgerRequest
    $customerLedgerRequest = $null
    if ($customerLedgerResponse.Status -ne 200) { throw "SQL-backed customer ledger report returned HTTP $($customerLedgerResponse.Status)." }
    $customerLedger = $customerLedgerResponse.Content | ConvertFrom-Json
    $customerLedgerLinksValid = $customerLedger.rows.Count -gt 0 -and @($customerLedger.rows | Where-Object { [string]::IsNullOrWhiteSpace($_.sourceCode) }).Count -eq 0
    $customerLedgerValid = $customerLedger.source -eq 'customerLedgerEntries' -and $customerLedger.columns.Count -eq 9 -and $customerLedger.rows.Count -le 20 -and $customerLedger.totalCount -ge $customerLedger.rows.Count -and $customerLedgerLinksValid
    Assert-Check 'sql-customer-ledger-filtered-detail' $customerLedgerValid "Tenant SQL query returned $($customerLedger.rows.Count) bounded filtered rows and $($customerLedger.totalCount) total rows; ledger data is not retained."
    $customerLedger = $null

    $customerLedgerExportRequest = @{
        source = 'customerLedgerEntries'; columns = @('customerCode','counterpartyType','currencyCode','sourceType','sourceCode');
        filters = @(@{ field = 'sourceType'; operator = 'equals'; value = 'SalesInvoice' }); sortBy = 'sourceCode'; descending = $false; page = 1; pageSize = 20
    } | ConvertTo-Json -Depth 5 -Compress
    $customerLedgerExportResponse = Send-ApiRequest '/api/reports/export' 'POST' $selection.accessToken $customerLedgerExportRequest
    $customerLedgerExportRequest = $null
    if ($customerLedgerExportResponse.Status -ne 200) { throw "SQL-backed customer ledger CSV returned HTTP $($customerLedgerExportResponse.Status)." }
    $customerLedgerCsvHeader = ($customerLedgerExportResponse.Content -split '\r?\n', 2)[0]
    $customerLedgerCsvRows = @($customerLedgerExportResponse.Content -split '\r?\n' | Select-Object -Skip 1 | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
    Assert-Check 'sql-customer-ledger-csv' ($customerLedgerCsvHeader -match 'Cari kodu' -and $customerLedgerCsvHeader -match 'Cari türü' -and $customerLedgerCsvHeader -match 'Belge türü' -and $customerLedgerCsvRows -gt 0) 'SQL-backed customer ledger export returned linked invoice rows and the expected headers; row contents are not retained.'

    $customerLedgerGroupRequest = @{
        source = 'customerLedgerEntries'; columns = @('currencyCode'); filters = @()
        sortBy = 'currencyCode'; descending = $false; page = 1; pageSize = 20
        groupByFields = @('currencyCode'); aggregate = 'count'
    } | ConvertTo-Json -Depth 5 -Compress
    $customerLedgerGroupResponse = Send-ApiRequest '/api/reports/run' 'POST' $selection.accessToken $customerLedgerGroupRequest
    $customerLedgerGroupRequest = $null
    Assert-Check 'customer-ledger-grouping-rejected' ($customerLedgerGroupResponse.Status -eq 400) 'The API rejects grouping of ledger entries to preserve currency and reversal traceability.'

    $report = [ordered]@{
        completedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
        environment = 'local-docker-compose'
        provider = 'SQL Server through Platform API'
        checks = $checks
        passed = $checks.Count
        failed = 0
        skipped = $skippedChecks.Count
        skippedChecks = $skippedChecks
        notes = 'Read-only report queries can emit normal metadata-only audit events. Credentials, bearer tokens, tenant identifiers, source records, and response bodies are not stored or printed on failures.'
    }
    $resolved = [IO.Path]::GetFullPath($OutputPath)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolved)) | Out-Null
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolved -Encoding utf8
    $report | ConvertTo-Json -Depth 8
    Write-Output "Result written to $resolved"
} finally {
    $login = $null
    $selection = $null
    $email = $null
    $password = $null
    $client.Dispose()
}
