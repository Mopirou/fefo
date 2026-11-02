# Generates a local HTTPS certificate with mkcert (required for camera scan on the phone).
# Prerequisite: mkcert installed (winget install FiloSottile.mkcert).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$certs = Join-Path $root 'certs'
New-Item -ItemType Directory -Force $certs | Out-Null

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1).IPAddress
Write-Host "IP locale detectee: $ip"

mkcert -install
mkcert -key-file (Join-Path $certs 'key.pem') -cert-file (Join-Path $certs 'cert.pem') localhost 127.0.0.1 $ip $env:COMPUTERNAME

Write-Host ""
Write-Host "Certificat genere dans $certs"
Write-Host "Telephone: copier le fichier rootCA.pem situe dans $(mkcert -CAROOT) et l'installer"
Write-Host "(Android: Parametres > Securite > Installer un certificat CA. iPhone: installer le profil puis Reglages > General > Informations > Reglages des certificats > activer).
Puis ouvrir https://${ip}:3100"
