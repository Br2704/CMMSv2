# ───────────────────────────────────────────────────────────────────
#  Generate cryptographically secure secrets for Docker deployment
#
#  Usage:
#    .\scripts\docker-generate-secrets.ps1          (creates .env)
#    .\scripts\docker-generate-secrets.ps1 -Force    (overwrites existing .env)
# ───────────────────────────────────────────────────────────────────
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$EnvFile = ".env"

if ((Test-Path $EnvFile) -and -not $Force) {
    Write-Host "Error: $EnvFile already exists." -ForegroundColor Red
    Write-Host "  Run with -Force to overwrite, or delete it manually."
    exit 1
}

# Cryptographically secure random byte generator
function Get-SecureRandomBytes {
    param([int]$Length)
    $bytes = New-Object byte[] $Length
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return $bytes
}

# Generate base64url-encoded secret (no padding)
function Get-SecureSecret {
    param([int]$ByteLength = 48)
    $bytes = Get-SecureRandomBytes -Length $ByteLength
    $base64 = [Convert]::ToBase64String($bytes)
    return $base64.Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

# Generate strong alphanumeric password with symbols
function Get-SecurePassword {
    param([int]$Length = 32)
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%^*_+='
    $bytes = Get-SecureRandomBytes -Length ($Length * 2)
    $result = New-Object System.Text.StringBuilder
    foreach ($b in $bytes) {
        if ($result.Length -ge $Length) { break }
        $idx = $b % $chars.Length
        [void]$result.Append($chars[$idx])
    }
    return $result.ToString()
}

Write-Host "Generating cryptographic secrets..." -ForegroundColor Cyan

$DbUser = "cmms_" + (Get-SecureSecret -ByteLength 4)
$DbPassword = Get-SecurePassword -Length 32
$JwtSecret = Get-SecureSecret -ByteLength 64
$JwtRefreshSecret = Get-SecureSecret -ByteLength 64
$DataEncryptionKey = Get-SecureSecret -ByteLength 32
$PgAdminPassword = Get-SecurePassword -Length 24

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss 'UTC'")

$content = @"
# ───────────────────────────────────────────────────────────────
#  CMMS v2 — Docker Environment (auto-generated)
#  Generated: $timestamp
#
#  KEEP THIS FILE SECRET. Do not commit to version control.
#  Regenerate with: .\scripts\docker-generate-secrets.ps1 -Force
# ───────────────────────────────────────────────────────────────

# ── Database ───────────────────────────────────────────────────
DB_USER=$DbUser
DB_PASSWORD=$DbPassword
DB_PORT_EXTERNAL=5432

# ── Backend Secrets (base64url-encoded, high entropy) ──────────
JWT_SECRET=$JwtSecret
JWT_REFRESH_SECRET=$JwtRefreshSecret
DATA_ENCRYPTION_KEY=$DataEncryptionKey

# ── Frontend ───────────────────────────────────────────────────
FRONTEND_PORT=8081
FRONTEND_URL=http://localhost:8081
APP_CORS_ORIGINS=http://localhost:8081,http://localhost

# ── Backend Port ───────────────────────────────────────────────
BACKEND_PORT=3001

# ── pgAdmin (tools profile only) ───────────────────────────────
PGADMIN_EMAIL=admin@cmms.local
PGADMIN_PASSWORD=$PgAdminPassword
"@

# Write with UTF-8 encoding (no BOM)
[System.IO.File]::WriteAllText($EnvFile, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Secrets written to $EnvFile" -ForegroundColor Green
Write-Host ""
Write-Host "Secret strength:" -ForegroundColor Yellow
Write-Host "  DB_PASSWORD ........... $($DbPassword.Length) chars (alphanumeric + symbols)"
Write-Host "  JWT_SECRET ............ $($JwtSecret.Length) chars (base64url, ~384 bits entropy)"
Write-Host "  JWT_REFRESH_SECRET .... $($JwtRefreshSecret.Length) chars (base64url, ~384 bits entropy)"
Write-Host "  DATA_ENCRYPTION_KEY ... $($DataEncryptionKey.Length) chars (base64url, ~192 bits entropy)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review $EnvFile"
Write-Host "  2. docker compose up -d"
Write-Host ""
Write-Host "WARNING: Do NOT commit $EnvFile to git." -ForegroundColor Red
