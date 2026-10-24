param(
  [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
  [Parameter(Mandatory = $true)][string]$PublicKeyPath
)

$ErrorActionPreference = 'Stop'
$rsa = [System.Security.Cryptography.RSA]::Create(3072)
try {
  $privatePath = [System.IO.Path]::GetFullPath($PrivateKeyPath)
  $publicPath = [System.IO.Path]::GetFullPath($PublicKeyPath)
  New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($privatePath)) | Out-Null
  New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($publicPath)) | Out-Null
  [System.IO.File]::WriteAllText($privatePath, $rsa.ExportPkcs8PrivateKeyPem(), [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($publicPath, $rsa.ExportSubjectPublicKeyInfoPem(), [System.Text.UTF8Encoding]::new($false))
  Write-Host "Public key: $PublicKeyPath"
  Write-Host "Private key: $PrivateKeyPath (keep offline; never commit or deploy it)"
}
finally { $rsa.Dispose() }
