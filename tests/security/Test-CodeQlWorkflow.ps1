[CmdletBinding()]
param([string]$WorkflowPath = (Join-Path $PSScriptRoot '..\..\.github\workflows\codeql.yml'))

$ErrorActionPreference = 'Stop'
$resolved = [IO.Path]::GetFullPath($WorkflowPath)
if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw 'CodeQL workflow file was not found.' }
$workflow = Get-Content -LiteralPath $resolved -Raw
$assertions = [Collections.Generic.List[string]]::new()

if ($workflow -notmatch '(?m)^name:\s*CodeQL\s*$') { throw 'Workflow name must be CodeQL.' }
if ($workflow -notmatch '(?m)^  push:\s*\r?\n    branches:\s*\[master\]') { throw 'CodeQL must analyze pushes to master.' }
if ($workflow -notmatch '(?m)^  pull_request:\s*\r?\n    branches:\s*\[master\]') { throw 'CodeQL must analyze pull requests targeting master.' }
if ($workflow -notmatch '(?m)^  workflow_dispatch:\s*$') { throw 'CodeQL must support a manually triggered first run.' }
$assertions.Add('push, pull request, and manual triggers are configured')

$uses = [regex]::Matches($workflow, '(?m)^\s+uses:\s*([^\s#]+)') | ForEach-Object { $_.Groups[1].Value }
if ($uses.Count -lt 3 -or @($uses | Where-Object { $_ -notmatch '@[0-9a-f]{40}$' }).Count -gt 0) {
    throw 'Every third-party GitHub Action must be pinned to a full 40-character commit SHA.'
}
$assertions.Add("all $($uses.Count) third-party actions use full commit SHA pins")

foreach ($language in @('csharp', 'javascript-typescript')) {
    if ($workflow -notmatch "(?m)^\s+- language:\s*$([regex]::Escape($language))\s*$") {
        throw "The CodeQL language matrix is missing '$language'."
    }
}
$assertions.Add('C# and JavaScript/TypeScript are in the analysis matrix')

if ($workflow -notmatch '(?m)^permissions:\s*\r?\n  contents:\s*read\s*\r?\n  security-events:\s*write\s*$') {
    throw 'Workflow permissions must stay limited to repository reads plus Security Events upload.'
}
if ($workflow -match '(?m)^\s+(?:actions|checks|contents|pull-requests|issues):\s*write\s*$') {
    throw 'Unexpected repository write permission found in CodeQL workflow.'
}
$assertions.Add('workflow permissions are limited to contents read and security event upload; Actions read is omitted')

[pscustomobject]@{
    workflow = [IO.Path]::GetRelativePath((Get-Location).Path, $resolved)
    status = 'passed'
    assertions = @($assertions)
    remoteRunAttempted = $false
} | ConvertTo-Json -Depth 3
