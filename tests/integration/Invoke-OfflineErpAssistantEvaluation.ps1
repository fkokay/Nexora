[CmdletBinding()]
param(
    [string]$ReportPath = (Join-Path $PSScriptRoot '..\UnitTests\AIERP.Platform.UnitTests\TestResults\ai-evaluation\offline-orchestration-report.json')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$project = Join-Path $repoRoot 'tests\UnitTests\AIERP.Platform.UnitTests\AIERP.Platform.UnitTests.csproj'
$datasetPath = Join-Path $repoRoot 'tests\UnitTests\AIERP.Platform.UnitTests\EvaluationSets\erp-assistant-orchestration-v1.json'
$datasetBytes = [System.IO.File]::ReadAllBytes($datasetPath)
$dataset = Get-Content -LiteralPath $datasetPath -Raw | ConvertFrom-Json
$sha256 = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($datasetBytes)).ToLowerInvariant()
$reportFullPath = [System.IO.Path]::GetFullPath($ReportPath)
$resultsDirectory = Join-Path ([System.IO.Path]::GetDirectoryName($reportFullPath)) ('trx-' + [guid]::NewGuid().ToString('N'))
$trxPath = Join-Path $resultsDirectory 'offline-evaluation.trx'

New-Item -ItemType Directory -Path $resultsDirectory -Force | Out-Null
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($reportFullPath)) -Force | Out-Null
$filter = 'FullyQualifiedName~ERPAssistantOrchestrationEvaluationTests|FullyQualifiedName~AIERPAssistantEvaluationContractTests'
& dotnet test $project --no-restore --filter $filter --logger "trx;LogFileName=offline-evaluation.trx" --results-directory $resultsDirectory --verbosity quiet
$testExitCode = $LASTEXITCODE

if (-not (Test-Path -LiteralPath $trxPath)) {
    throw "Offline evaluation did not produce its expected TRX result file (dotnet exit code $testExitCode)."
}

[xml]$trx = Get-Content -LiteralPath $trxPath -Raw
$testResults = @($trx.SelectNodes("//*[local-name()='UnitTestResult']"))
$behaviorTestMap = @{
    'Warehouse_tool_result_is_bounded_by_rows_and_serialized_size' = 'warehouse-result-bounds'
    'Report_schema_tool_returns_only_the_requested_source_fields_and_aggregates' = 'report-schema-source-isolation'
    'Stock_lookup_routes_one_read_only_tool_and_keeps_injected_tool_text_untrusted' = 'stock-lookup-untrusted-tool-output'
    'Customer_name_lookup_can_continue_to_authorized_balance_lookup_in_the_same_answer' = 'customer-search-to-balance'
    'Report_schema_discovery_can_continue_to_a_schema_constrained_report_in_the_same_answer' = 'report-schema-to-query'
    'Purchase_order_fulfillment_semantic_fixture_reconciles_quantities_and_discloses_synthetic_scope' = 'purchase-order-fulfillment-semantic'
    'Unknown_tool_name_is_rejected_before_executor_and_without_retry' = 'unknown-tool-rejected-before-execution'
    'Tool_budget_violation_is_rejected_before_any_read_tool_side_effect' = 'four-call-budget-rejection'
    'Tool_failure_is_sanitized_and_does_not_leak_internal_error_details' = 'tool-failure-sanitization'
    'Provider_429_is_classified_without_body_inspection_or_automatic_retry' = 'provider-429-classification'
    'Versioned_dataset_matches_the_scripted_tool_matrix_and_declares_its_semantic_limit' = 'contract-validation'
    'Live_quality_set_limits_each_case_to_applicable_review_dimensions' = 'live-quality-contract-validation'
}
$scenarioCatalog = @{}
foreach ($scenario in $dataset.cases) {
    $scenarioCatalog[[string]$scenario.id] = [pscustomobject]@{ kind = [string]$scenario.kind; declaredAssertions = @($scenario.assertions) }
}
foreach ($scenario in $dataset.behaviorCases) {
    $scenarioCatalog[[string]$scenario.id] = [pscustomobject]@{ kind = [string]$scenario.kind; declaredAssertions = @($scenario.assertions) }
}
$scenarioCatalog['contract-validation'] = [pscustomobject]@{ kind = 'dataset-contract'; declaredAssertions = @('tool-matrix-matches-executable-cases', 'scenario-ids-unique', 'assertion-contracts-present') }
$scenarioCatalog['live-quality-contract-validation'] = [pscustomobject]@{ kind = 'live-quality-dataset-contract'; declaredAssertions = @('one-request-synthetic-only-limits', 'unique-case-and-rubric-contracts', 'case-specific-applicable-dimensions') }
$cases = foreach ($result in $testResults) {
    $name = [string]$result.GetAttribute('testName')
    $id = $null
    if ($name -match 'caseId:\s*"?([a-z0-9-]+)') { $id = $Matches[1] }
    if (-not $id) {
        foreach ($testName in $behaviorTestMap.Keys) {
            if ($name -match [regex]::Escape($testName)) { $id = $behaviorTestMap[$testName]; break }
        }
    }
    if (-not $id) { $id = 'unmapped-test' }
    $scenario = $scenarioCatalog[$id]
    [pscustomobject]@{
        id = $id
        kind = if ($scenario) { $scenario.kind } else { 'unmapped' }
        outcome = [string]$result.GetAttribute('outcome')
        declaredAssertions = if ($scenario) { @($scenario.declaredAssertions) } else { @() }
    }
}

$declaredIds = @($dataset.cases | ForEach-Object id) + @($dataset.behaviorCases | ForEach-Object id) + @('contract-validation', 'live-quality-contract-validation')
$mappedIds = @($cases | ForEach-Object id)
$unmapped = @($cases | Where-Object id -eq 'unmapped-test')
$missing = @($declaredIds | Where-Object { $_ -notin $mappedIds })
$duplicates = @($mappedIds | Group-Object | Where-Object Count -gt 1)
$total = $cases.Count
$passed = @($cases | Where-Object outcome -eq 'Passed').Count
$failed = @($cases | Where-Object outcome -eq 'Failed').Count
$skipped = @($cases | Where-Object outcome -in @('NotExecuted', 'Skipped')).Count
$report = [ordered]@{
    schemaVersion = '1.0.0'
    generatedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    evaluationSet = [ordered]@{
        id = $dataset.evaluationSetId
        version = $dataset.version
        schemaVersion = $dataset.schemaVersion
        sha256 = $sha256
    }
    execution = [ordered]@{
        mode = 'offline-mocked'
        provider = $dataset.provider
        model = $dataset.model
        externalRequests = 0
        semanticQualityScored = $false
        semanticQualityStatus = 'not-scored-mock-provider'
        testExitCode = $testExitCode
    }
    summary = [ordered]@{ total = $total; passed = $passed; failed = $failed; skipped = $skipped }
    cases = @($cases | Sort-Object id)
    contract = [ordered]@{ unmappedTests = $unmapped.Count; missingCases = $missing; duplicateCaseIds = @($duplicates | ForEach-Object Name) }
}
$json = $report | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($reportFullPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

Write-Output ("Offline evaluation report: {0}" -f $reportFullPath)
Write-Output ("Evaluation set {0} v{1}; sha256={2}" -f $dataset.evaluationSetId, $dataset.version, $sha256)
Write-Output ("Cases: {0} passed, {1} failed, {2} skipped; semantic quality scored: no" -f $passed, $failed, $skipped)

if ($testExitCode -ne 0 -or $unmapped.Count -gt 0 -or $missing.Count -gt 0 -or $duplicates.Count -gt 0 -or $failed -gt 0 -or $skipped -gt 0) {
    throw 'Offline evaluation did not satisfy its complete, mapped case contract. Inspect the report for case IDs and outcomes.'
}
