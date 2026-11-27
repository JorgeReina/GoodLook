[CmdletBinding()]
param(
    [ValidateSet('mysql', 'mariadb')]
    [string]$Dialect = 'mysql',

    [ValidateSet('test', 'interactive')]
    [string]$Mode = 'test'
)

$ErrorActionPreference = 'Stop'
$backend = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $backend
try {
    if ($Mode -eq 'test') {
        & node --import tsx db/demo-local.mjs $Dialect.ToLowerInvariant() $Mode.ToLowerInvariant()
    } else {
        & node db/demo-local.mjs $Dialect.ToLowerInvariant() $Mode.ToLowerInvariant()
    }
    if ($LASTEXITCODE -ne 0) {
        throw 'Demo local: isolated runtime failed.'
    }
} finally {
    Pop-Location
}
