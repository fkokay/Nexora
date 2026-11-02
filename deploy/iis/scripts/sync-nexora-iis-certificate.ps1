$ErrorActionPreference = 'Stop'

$domains = @(
    'nexoraerp.ozgurteknolojiyazilim.com',
    'nexorastudio.ozgurteknolojiyazilim.com',
    'nexoraapi.ozgurteknolojiyazilim.com'
)
$site = 'Nexora-Docker-Ingress'
$logPath = 'C:\Nexora\private\certificate-sync.log'

Import-Module WebAdministration
$now = Get-Date
$certificate = Get-ChildItem 'Cert:\LocalMachine\WebHosting' |
    Sort-Object NotAfter -Descending |
    Where-Object {
        $candidate = $_
        if ($candidate.NotAfter -le $now.AddDays(14)) { return $false }
        $dnsNames = @($candidate.DnsNameList | ForEach-Object { $_.Unicode })
        return (($domains | Where-Object { $dnsNames -notcontains $_ }).Count -eq 0)
    } |
    Select-Object -First 1

if (-not $certificate) {
    throw 'No valid certificate covering all Nexora ingress domains was found.'
}

foreach ($domain in $domains) {
    $binding = Get-WebBinding -Name $site -Protocol https |
        Where-Object { $_.bindingInformation -eq "*:443:$domain" } |
        Select-Object -First 1
    if (-not $binding) { throw "HTTPS binding missing for $domain" }
    if ($binding.certificateHash -ne $certificate.Thumbprint) {
        $binding.AddSslCertificate($certificate.Thumbprint, 'WebHosting')
    }
}

"$(Get-Date -Format o) synced thumbprint $($certificate.Thumbprint), expires $($certificate.NotAfter.ToString('o'))" |
    Add-Content -Path $logPath
