$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\..\deploy\iis\BundleValidation.psm1') -Force
$createdCertificates = [Collections.Generic.List[string]]::new()

function New-TestCertificate([string[]]$DnsName) {
    $certificate = New-SelfSignedCertificate -Subject "CN=$($DnsName[0])" -DnsName $DnsName `
        -CertStoreLocation 'Cert:\CurrentUser\My' -NotBefore (Get-Date).AddDays(-1) -NotAfter (Get-Date).AddDays(30)
    $createdCertificates.Add($certificate.Thumbprint)
    return $certificate
}

try {
    $bothHosts = New-TestCertificate @('erp.example.test', 'studio.example.test')
    Assert-IisCertificateCoverage -Certificate $bothHosts -HostName 'erp.example.test' -StudioHostName 'studio.example.test'

    try {
        Assert-IisCertificateCoverage -Certificate $bothHosts -HostName 'erp.example.test' -StudioHostName 'other.example.test'
        throw 'A certificate missing the Studio DNS SAN was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch "does not cover HTTPS host 'other.example.test'") { throw } }

    $wildcard = New-TestCertificate @('*.example.test')
    Assert-IisCertificateCoverage -Certificate $wildcard -HostName 'erp.example.test' -StudioHostName 'studio.example.test'
    if (Test-IisCertificateDnsName -CertificateDnsName '*.example.test' -HostName 'deep.erp.example.test') {
        throw 'A wildcard certificate was incorrectly allowed to cover multiple hostname labels.'
    }

    try {
        Assert-IisCertificateCoverage -Certificate $bothHosts -HostName 'erp.example.test' -StudioHostName 'studio.example.test' -UtcNow $bothHosts.NotAfter.ToUniversalTime().AddDays(1)
        throw 'An expired certificate was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch 'currently valid and not expired') { throw } }

    try {
        Assert-IisCertificateCoverage -Certificate $bothHosts -HostName 'erp.example.test' -StudioHostName 'studio.example.test' -UtcNow $bothHosts.NotBefore.ToUniversalTime().AddDays(-1)
        throw 'A not-yet-valid certificate was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch 'currently valid and not expired') { throw } }

    Write-Output 'IIS certificate validation smoke passed: both SANs, one-label wildcard, missing host, expiry and not-yet-valid cases.'
}
finally {
    foreach ($thumbprint in $createdCertificates) {
        Remove-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint" -Force -ErrorAction SilentlyContinue
    }
    Remove-Module BundleValidation -ErrorAction SilentlyContinue
}
