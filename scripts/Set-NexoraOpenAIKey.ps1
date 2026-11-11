$ErrorActionPreference = 'Stop'

$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'deploy/docker/.env'
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw 'deploy/docker/.env was not found.'
}

$secureKey = Read-Host 'Paste the replacement OpenAI API key (input is hidden)' -AsSecureString
$keyPointer = [IntPtr]::Zero
$apiKey = $null
try {
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ($apiKey -notmatch '^sk-[A-Za-z0-9_-]{20,1020}$') {
        throw 'The value does not look like an OpenAI API key; .env was not changed.'
    }

    $lines = [System.Collections.Generic.List[string]]::new()
    [System.IO.File]::ReadAllLines($envPath) | ForEach-Object { [void]$lines.Add($_) }
    $indices = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].StartsWith('OPENAI_API_KEY=', [System.StringComparison]::Ordinal)) {
            $indices += $i
        }
    }
    if ($indices.Count -ne 1) {
        throw 'Expected exactly one OPENAI_API_KEY setting; .env was not changed.'
    }

    $lines[$indices[0]] = 'OPENAI_API_KEY=' + $apiKey
    [System.IO.File]::WriteAllText($envPath, [string]::Join("`n", $lines) + "`n", [System.Text.UTF8Encoding]::new($false))
    'OPENAI_API_KEY updated in the gitignored local .env. The key was not printed.'
}
finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    if ($null -ne $secureKey) { $secureKey.Dispose() }
    $apiKey = $null
}
