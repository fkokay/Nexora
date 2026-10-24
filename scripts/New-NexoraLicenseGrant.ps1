param(
  [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
  [Parameter(Mandatory = $true)][string]$KeyId,
  [Parameter(Mandatory = $true)][Guid]$TenantId,
  [Parameter(Mandatory = $true)][ValidateSet('Small', 'Medium', 'Large')][string]$Tier,
  [Parameter(Mandatory = $true)][datetimeoffset]$ExpiresAt,
  [Guid]$LicenseId = [Guid]::NewGuid()
)

$ErrorActionPreference = 'Stop'
if ($ExpiresAt -le [datetimeoffset]::UtcNow) { throw 'ExpiresAt must be a future time.' }
if ($KeyId -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'KeyId may contain only ASCII letters, digits, dash, and underscore.' }
$rsa = [System.Security.Cryptography.RSA]::Create()
try {
  $rsa.ImportFromPem([System.IO.File]::ReadAllText((Resolve-Path $PrivateKeyPath)))
  $grant = [ordered]@{
    schemaVersion = 1
    licenseId = $LicenseId.ToString('D')
    tenantId = $TenantId.ToString('D')
    tier = $Tier
    issuedAt = [datetimeoffset]::UtcNow.ToString('O')
    expiresAt = $ExpiresAt.ToUniversalTime().ToString('O')
  }
  $json = $grant | ConvertTo-Json -Compress
  $payload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json)).TrimEnd('=').Replace('+','-').Replace('/','_')
  $signed = "$KeyId.$payload"
  $signature = [Convert]::ToBase64String($rsa.SignData([System.Text.Encoding]::ASCII.GetBytes($signed), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)).TrimEnd('=').Replace('+','-').Replace('/','_')
  "$signed.$signature"
}
finally { $rsa.Dispose() }
