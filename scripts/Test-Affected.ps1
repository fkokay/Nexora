<#
.SYNOPSIS
  Degisikliklerden etkilenen testleri calistirir (push oncesi hizli geri bildirim).
.DESCRIPTION
  Degisen dosyalari (git diff <base>...HEAD + commitlenmemis) toplar; .NET icin ilgili test siniflarini,
  frontend icin vitest related + build calistirir. Tam takim CI'da kosar.
.PARAMETER Base
  Karsilastirma dali (varsayilan origin/master).
.PARAMETER DryRun
  Sadece ne calistirilacagini yazdirir.
#>
[CmdletBinding()]
param(
  [string]$Base = 'origin/master',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root

$changed = @()
$changed += git diff --name-only "$Base...HEAD"
$changed += git diff --name-only HEAD
$changed += git ls-files --others --exclude-standard
$changed = $changed | Where-Object { $_ } | ForEach-Object { $_.Replace('\', '/') } | Sort-Object -Unique

if (-not $changed) { Write-Host 'Degisiklik yok.'; exit 0 }
Write-Host "Degisen dosya sayisi: $($changed.Count)"

$failed = @()
$summary = @()
$MaxClasses = 60

function Get-ClassNames([string]$file) {
  Select-String -Path $file -Pattern '^\s*(public |internal )?(sealed |static |abstract )*(partial )?class\s+([A-Za-z0-9_]+)' |
    ForEach-Object { $_.Matches[0].Groups[4].Value }
}

# ---------- .NET ----------
$srcCs = @($changed | Where-Object { $_ -like 'src/*.cs' })
$testCs = @($changed | Where-Object { $_ -like 'tests/IntegrationTests/*.cs' })
$stdJson = @($changed | Where-Object { $_ -match '^src/Hosts/AIERP\.Api/SystemPages/Standards/(.+)\.json$' })
$needsDotnet = $srcCs.Count -gt 0 -or $testCs.Count -gt 0 -or $stdJson.Count -gt 0
$unitNeeded = @($changed | Where-Object { $_ -like 'src/Platform/*' -or $_ -like 'tests/UnitTests/*' }).Count -gt 0

if ($needsDotnet) {
  $allTestFiles = Get-ChildItem tests/IntegrationTests -Filter *.cs -File
  $classes = New-Object System.Collections.Generic.HashSet[string]
  foreach ($f in $testCs) { if (Test-Path $f) { Get-ClassNames $f | ForEach-Object { [void]$classes.Add($_) } } }

  $needles = @()
  foreach ($f in $srcCs) { $needles += [IO.Path]::GetFileNameWithoutExtension($f) }
  foreach ($f in $stdJson) { $needles += ([regex]::Match($f, '/Standards/(.+)\.json$')).Groups[1].Value }
  # cok kisa/genel adlar (Program gibi) tum takimi tetiklemesin diye atla
  $needles = $needles | Where-Object { $_.Length -ge 5 -and $_ -ne 'Program' } | Sort-Object -Unique
  if ($needles) {
    $rx = ($needles | ForEach-Object { [regex]::Escape($_) }) -join '|'
    foreach ($tf in $allTestFiles) {
      if (Select-String -Path $tf.FullName -Pattern $rx -Quiet) {
        Get-ClassNames $tf.FullName | ForEach-Object { [void]$classes.Add($_) }
      }
    }
  }

  $lockDir = Join-Path $env:LOCALAPPDATA 'Temp\nexora-dotnet-test.lock'
  $runs = @()
  if ($classes.Count -gt $MaxClasses) {
    Write-Host "Etkilenen test sinifi: $($classes.Count) - cok fazla; tam takim onerilir (tum IntegrationTests calistirilacak)."
    $runs += ,@('tests/IntegrationTests', $null)
  } elseif ($classes.Count -gt 0) {
    $filter = ($classes | Sort-Object | ForEach-Object { "FullyQualifiedName~.$_" }) -join '|'
    Write-Host "Etkilenen test siniflari ($($classes.Count)): $(($classes | Sort-Object) -join ', ')"
    $runs += ,@('tests/IntegrationTests', $filter)
  } else {
    Write-Host '.NET: etkilenen integration test sinifi bulunamadi.'
  }
  if ($unitNeeded) { $runs += ,@('tests/UnitTests/AIERP.Platform.UnitTests', $null) }

  foreach ($r in $runs) {
    $cmd = "dotnet test $($r[0])" + $(if ($r[1]) { " --filter `"$($r[1])`"" } else { '' })
    if ($DryRun) { Write-Host "[DryRun] $cmd"; continue }
    while (Test-Path $lockDir) { Start-Sleep -Seconds 20 }
    New-Item -ItemType Directory -Path $lockDir -ErrorAction Stop | Out-Null
    try {
      $a = @('test', $r[0])
      if ($r[1]) { $a += @('--filter', $r[1]) }
      & dotnet @a
      if ($LASTEXITCODE -ne 0) { $failed += "dotnet test $($r[0])" } else { $summary += "OK: dotnet test $($r[0])" }
    } finally {
      Remove-Item $lockDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# ---------- Frontend ----------
foreach ($app in 'erp-web', 'development-studio') {
  $prefix = "frontend/$app/"
  $files = @($changed | Where-Object { $_.StartsWith($prefix) -and $_ -notlike '*/node_modules/*' })
  if ($files.Count -eq 0) { continue }
  $rel = $files | ForEach-Object { $_.Substring($prefix.Length) }
  $src = @($rel | Where-Object { $_ -match '^src/.*\.(ts|tsx)$' -and (Test-Path (Join-Path $root "$prefix$_")) })
  $dir = Join-Path $root "frontend/$app"
  $hasVitest = (Get-Content (Join-Path $dir 'package.json') -Raw) -match '"vitest"'
  if ($DryRun) {
    if ($hasVitest -and $src.Count) { Write-Host "[DryRun] (frontend/$app) npx vitest related $($src -join ' ') --run" }
    Write-Host "[DryRun] (frontend/$app) npm run build"
    continue
  }
  Push-Location $dir
  try {
    if ($hasVitest -and $src.Count) {
      & npx vitest related @src --run
      if ($LASTEXITCODE -ne 0) { $failed += "vitest related ($app)" } else { $summary += "OK: vitest related ($app)" }
    }
    & npm run build
    if ($LASTEXITCODE -ne 0) { $failed += "npm run build ($app)" } else { $summary += "OK: npm run build ($app)" }
  } finally { Pop-Location }
}

# ---------- Ozet ----------
Write-Host ''
Write-Host '=== Ozet ==='
if ($DryRun) { Write-Host 'DryRun: hicbir sey calistirilmadi.'; exit 0 }
if ($summary.Count -eq 0 -and $failed.Count -eq 0) { Write-Host 'Calistirilacak ilgili test/derleme bulunamadi.' }
$summary | ForEach-Object { Write-Host $_ }
if ($failed.Count -gt 0) {
  $failed | ForEach-Object { Write-Host "BASARISIZ: $_" }
  exit 1
}
Write-Host 'Hepsi basarili.'
exit 0
