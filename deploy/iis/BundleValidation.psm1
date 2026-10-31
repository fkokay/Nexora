Set-StrictMode -Version Latest

function Assert-IisBundleIntegrity {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$BundlePath)

    $root = (Resolve-Path -LiteralPath $BundlePath -ErrorAction Stop).Path
    $rootItem = Get-Item -LiteralPath $root -Force
    if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'IIS bundle root must not be a reparse point.' }
    $manifestPath = Join-Path $root 'bundle.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'IIS bundle manifest bundle.json is missing.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.product -ne 'Nexora AI ERP IIS Bundle' -or
        [string]$manifest.version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$' -or
        $manifest.configuration -ne 'Release' -or $manifest.targetFramework -ne 'net10.0' -or
        $manifest.hostingModel -ne 'framework-dependent IIS ANCM out-of-process') {
        throw 'IIS bundle manifest metadata is invalid.'
    }
    $requiredComponents = @('platform-api','ai-service','erp-web','development-studio')
    $components = @($manifest.components | Sort-Object)
    if (($components -join ',') -ne (($requiredComponents | Sort-Object) -join ',')) {
        throw 'IIS bundle manifest must declare each required component exactly once.'
    }
    if ($null -eq $manifest.files -or @($manifest.files).Count -eq 0) {
        throw 'IIS bundle manifest has no file checksums.'
    }

    $allEntries = @(Get-ChildItem -LiteralPath $root -Force -Recurse)
    foreach ($entry in $allEntries) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "IIS bundle contains a reparse point: $($entry.FullName)"
        }
    }

    $listed = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($item in @($manifest.files)) {
        $relative = [string]$item.path
        if ([string]::IsNullOrWhiteSpace($relative) -or $relative -notmatch '^[A-Za-z0-9._/-]+$' -or $relative.Contains('\') -or $relative.Contains(':') -or
            [IO.Path]::IsPathRooted($relative) -or $relative.Split('/') -contains '..' -or $relative.Split('/') -contains '.' -or
            $relative.StartsWith('/') -or $relative.EndsWith('/')) {
            throw "IIS bundle manifest contains an unsafe path: $relative"
        }
        if ($relative -eq 'bundle.json') { throw 'IIS bundle manifest must not list itself.' }
        if (-not $listed.Add($relative)) { throw "IIS bundle manifest contains a duplicate path: $relative" }
        if ([string]$item.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "IIS bundle checksum is malformed: $relative" }
        $file = Join-Path $root ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "IIS bundle file is missing: $relative" }
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
        if ($actual -ne [string]$item.sha256) { throw "IIS bundle checksum mismatch: $relative" }
    }

    $actualFiles = @(Get-ChildItem -LiteralPath $root -File -Force -Recurse |
        ForEach-Object { [IO.Path]::GetRelativePath($root, $_.FullName).Replace('\', '/') } |
        Where-Object { $_ -ne 'bundle.json' })
    foreach ($relative in $actualFiles) {
        if (-not $listed.Contains($relative)) { throw "IIS bundle contains an unmanifested file: $relative" }
    }
    if ($listed.Count -ne $actualFiles.Count) { throw 'IIS bundle checksum manifest contains an unexpected file count.' }

    $requiredFiles = @(
        'platform-api/AIERP.Api.dll','platform-api/web.config',
        'ai-service/AIERP.AIService.dll','ai-service/web.config',
        'erp-web/index.html','erp-web/web.config',
        'development-studio/index.html','development-studio/web.config',
        'Install-IisBundle.ps1','Switch-IisRelease.ps1','Rollback-IisBundle.ps1','Test-IisHealth.ps1',
        'BundleValidation.psm1','README.md','secrets.example.psd1'
    )
    foreach ($relative in $requiredFiles) {
        if (-not $listed.Contains($relative)) { throw "IIS bundle is missing a required checksummed file: $relative" }
    }
    return $manifest
}

function Get-IisCertificateDnsNames {
    [CmdletBinding()]
    param([Parameter(Mandatory)][System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate)

    $extension = $Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' } | Select-Object -First 1
    if ($null -eq $extension) { return @() }
    $bytes = $extension.RawData
    if ($bytes.Length -lt 2 -or $bytes[0] -ne 0x30) { throw 'The selected certificate contains a malformed subject alternative name extension.' }

    $readLength = {
        param([byte[]]$Data, [ref]$Offset)
        if ($Offset.Value -ge $Data.Length) { throw 'The selected certificate contains a malformed subject alternative name extension.' }
        $first = [int]$Data[$Offset.Value]
        $Offset.Value++
        if (($first -band 0x80) -eq 0) { return $first }
        $count = $first -band 0x7f
        if ($count -eq 0 -or $count -gt 4 -or $Offset.Value + $count -gt $Data.Length) { throw 'The selected certificate contains an invalid subject alternative name length.' }
        $length = 0
        for ($index = 0; $index -lt $count; $index++) {
            $length = ($length * 256) + [int]$Data[$Offset.Value]
            $Offset.Value++
        }
        return $length
    }

    $offset = 1
    $sequenceLength = & $readLength $bytes ([ref]$offset)
    if ($sequenceLength -ne ($bytes.Length - $offset)) { throw 'The selected certificate contains an invalid subject alternative name sequence.' }
    $end = $offset + $sequenceLength
    $names = [Collections.Generic.List[string]]::new()
    while ($offset -lt $end) {
        $tag = [int]$bytes[$offset]
        $offset++
        $valueLength = & $readLength $bytes ([ref]$offset)
        if ($valueLength -lt 0 -or $offset + $valueLength -gt $end) { throw 'The selected certificate contains an invalid subject alternative name entry.' }
        if ($tag -eq 0x82) {
            if ($valueLength -eq 0) { throw 'The selected certificate contains an empty DNS subject alternative name.' }
            $value = [Text.StringBuilder]::new()
            for ($index = $offset; $index -lt ($offset + $valueLength); $index++) {
                if ($bytes[$index] -gt 0x7f) { throw 'The selected certificate contains a non-ASCII DNS subject alternative name.' }
                [void]$value.Append([char]$bytes[$index])
            }
            $names.Add($value.ToString())
        }
        $offset += $valueLength
    }
    return $names.ToArray()
}

function Test-IisCertificateDnsName {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$CertificateDnsName, [Parameter(Mandatory)][string]$HostName)

    $dnsName = $CertificateDnsName.TrimEnd('.').ToLowerInvariant()
    $host = $HostName.TrimEnd('.').ToLowerInvariant()
    if ($dnsName.StartsWith('*.', [StringComparison]::Ordinal)) {
        $suffix = $dnsName.Substring(2)
        if (-not $host.EndsWith(".$suffix", [StringComparison]::Ordinal)) { return $false }
        $prefixLength = $host.Length - $suffix.Length - 1
        if ($prefixLength -le 0) { return $false }
        return $host.Substring(0, $prefixLength).IndexOf('.') -lt 0
    }
    return [string]::Equals($dnsName, $host, [StringComparison]::Ordinal)
}

function Assert-IisCertificateCoverage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate,
        [Parameter(Mandatory)][string]$HostName,
        [Parameter(Mandatory)][string]$StudioHostName,
        [DateTime]$UtcNow = [DateTime]::UtcNow
    )

    if (-not $Certificate.HasPrivateKey) { throw 'The selected LocalMachine\My certificate must include its private key.' }
    $now = $UtcNow.ToUniversalTime()
    if ($now -lt $Certificate.NotBefore.ToUniversalTime() -or $now -gt $Certificate.NotAfter.ToUniversalTime()) {
        throw 'The selected LocalMachine\My certificate must be currently valid and not expired.'
    }
    $dnsNames = @(Get-IisCertificateDnsNames -Certificate $Certificate)
    if ($dnsNames.Count -eq 0) { throw 'The selected certificate must contain DNS subject alternative names for both HTTPS hosts.' }
    foreach ($host in @($HostName, $StudioHostName)) {
        $covered = $false
        foreach ($dnsName in $dnsNames) {
            if (Test-IisCertificateDnsName -CertificateDnsName $dnsName -HostName $host) { $covered = $true; break }
        }
        if (-not $covered) { throw "The selected certificate does not cover HTTPS host '$host' in its DNS subject alternative names." }
    }
}

Export-ModuleMember -Function Assert-IisBundleIntegrity, Assert-IisCertificateCoverage, Get-IisCertificateDnsNames, Test-IisCertificateDnsName
