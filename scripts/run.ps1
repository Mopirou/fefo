# Builds the frontend (if needed) and starts the FEFO server (HTTPS when certs/ exists).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $root 'backend\node_modules'))) { npm --prefix (Join-Path $root 'backend') install }
if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) { npm --prefix (Join-Path $root 'frontend') install }
if (-not (Test-Path (Join-Path $root 'frontend\dist'))) { npm --prefix (Join-Path $root 'frontend') run build }

node (Join-Path $root 'backend\index.js')
