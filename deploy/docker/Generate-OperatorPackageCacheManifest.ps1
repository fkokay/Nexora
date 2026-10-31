[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$CacheRoot,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$ManifestPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cacheNames = @('npm', 'python-wheels', 'go-mod', 'cargo-home', 'nuget')
$manifestFileName = 'package-cache-manifest.json'
$resolvedRoot = [IO.Path]::GetFullPath($CacheRoot)
if (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container)) {
    throw "Operator package-cache root does not exist: $resolvedRoot"
}

$rootItem = Get-Item -LiteralPath $resolvedRoot -Force
if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Operator package-cache root cannot be a link: $resolvedRoot"
}

$expectedManifestPath = [IO.Path]::GetFullPath((Join-Path $resolvedRoot $manifestFileName))
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = $expectedManifestPath
} else {
    $ManifestPath = [IO.Path]::GetFullPath($ManifestPath)
    $pathComparison = if ([OperatingSystem]::IsWindows()) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if (-not [string]::Equals($ManifestPath, $expectedManifestPath, $pathComparison)) {
        throw "Manifest output must be the runtime root file: $expectedManifestPath"
    }
}

if (Test-Path -LiteralPath $ManifestPath) {
    throw "Manifest already exists; refusing to overwrite it: $ManifestPath"
}

$caches = [ordered]@{}
foreach ($cacheName in $cacheNames) {
    $cachePath = [IO.Path]::GetFullPath((Join-Path $resolvedRoot $cacheName))
    $entries = [Collections.Generic.List[object]]::new()

    if (Test-Path -LiteralPath $cachePath) {
        $cacheItem = Get-Item -LiteralPath $cachePath -Force
        if (-not $cacheItem.PSIsContainer -or ($cacheItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Cache path must be a real directory, not a file or link: $cachePath"
        }

        $pending = [Collections.Generic.Stack[string]]::new()
        $pending.Push($cachePath)
        $files = [Collections.Generic.List[string]]::new()
        while ($pending.Count -gt 0) {
            $current = $pending.Pop()
            foreach ($item in Get-ChildItem -LiteralPath $current -Force) {
                if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                    throw "Package-cache manifest cannot include links: $($item.FullName)"
                }
                if ($item.PSIsContainer) {
                    $pending.Push($item.FullName)
                } else {
                    $files.Add($item.FullName)
                }
            }
        }

        $files.Sort([StringComparer]::Ordinal)
        foreach ($filePath in $files) {
            $relativePath = [IO.Path]::GetRelativePath($cachePath, $filePath).Replace([IO.Path]::DirectorySeparatorChar, '/')
            if ([IO.Path]::AltDirectorySeparatorChar -ne [IO.Path]::DirectorySeparatorChar) {
                $relativePath = $relativePath.Replace([IO.Path]::AltDirectorySeparatorChar, '/')
            }
            $entries.Add([ordered]@{
                path   = $relativePath
                sha256 = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
            })
        }
    }

    $caches[$cacheName] = @($entries.ToArray())
}

$manifest = [ordered]@{
    schemaVersion = 1
    caches        = $caches
}
$json = ($manifest | ConvertTo-Json -Depth 6) + "`n"
$utf8 = [Text.UTF8Encoding]::new($false)
$stream = $null
$createdManifest = $false
try {
    # CreateNew makes the no-overwrite rule safe against another writer racing this script.
    $stream = [IO.File]::Open($ManifestPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $createdManifest = $true
    $writer = [IO.StreamWriter]::new($stream, $utf8)
    try {
        $writer.Write($json)
    } finally {
        $writer.Dispose()
        $stream = $null
    }
} catch {
    if ($null -ne $stream) {
        $stream.Dispose()
    }
    if ($createdManifest -and (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        Remove-Item -LiteralPath $ManifestPath -Force -ErrorAction SilentlyContinue
    }
    throw
}

$fileCount = 0
foreach ($cacheName in $cacheNames) { $fileCount += $caches[$cacheName].Count }
Write-Output "Manifest written: $ManifestPath ($fileCount files across $($cacheNames.Count) cache types)."
