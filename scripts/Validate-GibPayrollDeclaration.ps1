param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('1003A', '1003B')]
    [string] $Form,

    [Parameter(Mandatory = $true)]
    [string] $XmlPath
)

$ErrorActionPreference = 'Stop'
$schemaRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\docs\schemas\gib\ebeyanname-v133-2026-10-02')).Path
$schemaFile = if ($Form -eq '1003A') { 'MUHSGK_21.xsd' } else { 'MUHSGK2_12.xsd' }
$schemaPath = Join-Path $schemaRoot $schemaFile
$inputPath = (Resolve-Path -LiteralPath $XmlPath).Path

# The checked-in XSD package is trusted, while user XML is read with DTDs and
# external resolvers disabled. XmlSchemaSet resolves only the local EBYN.xsd include.
$schemas = [System.Xml.Schema.XmlSchemaSet]::new()
$schemas.XmlResolver = [System.Xml.XmlUrlResolver]::new()
$null = $schemas.Add($null, $schemaPath)
$schemas.Compile()

$issues = [System.Collections.Generic.List[string]]::new()
$settings = [System.Xml.XmlReaderSettings]::new()
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.Schemas = $schemas
$settings.add_ValidationEventHandler([System.Xml.Schema.ValidationEventHandler] {
    param($sender, $eventArgs)
    $exception = $eventArgs.Exception
    $issues.Add("line $($exception.LineNumber), column $($exception.LinePosition): $($eventArgs.Message)")
})

$reader = [System.Xml.XmlReader]::Create($inputPath, $settings)
try {
    while ($reader.Read()) { }
}
finally {
    $reader.Dispose()
}

if ($issues.Count -gt 0) {
    $issues | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    exit 1
}

Write-Output "Valid against local GIB $Form schema $schemaFile. This confirms XSD structure only; it does not confirm GIB business rules, employer eligibility, account mappings, or acceptance."
