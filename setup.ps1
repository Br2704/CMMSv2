<#
.SYNOPSIS
  CMMS v2 — One-command environment setup
.DESCRIPTION
  Copies .env.example to .env (if not already present) and replaces all
  placeholder passwords with cryptographically generated secure values.
  Then prints connection info and instructions to start.

.EXAMPLE
  .\setup.ps1
#>

$ErrorActionPreference = "Stop"

# ── 1. Generate random hex strings ──────────────────────────────
function New-RandomHex([int]$length = 32) {
  $bytes = [byte[]]::new($length)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

$envFile       = ".env"
$envExample    = ".env.example"

# ── 2. Create .env from .env.example if missing ────────────────
if (-not (Test-Path $envFile)) {
  if (-not (Test-Path $envExample)) {
    Write-Error "$envExample not found. Are you in the project root?"
    exit 1
  }
  Copy-Item $envExample $envFile
  Write-Host "✔  Created $envFile from $envExample`n" -ForegroundColor Green
} else {
  Write-Host "ℹ  $envFile already exists — skipping copy.`n" -ForegroundColor Yellow
}

# ── 3. Replace placeholder values with secure auto-generated strings ──
$content = Get-Content $envFile -Raw

# Only replace values that still have the "changeme_" marker
$replacements = @(
  @{ placeholder = "changeme_db_password_32chars_min";   length = 32 },
  @{ placeholder = "changeme_jwt_secret_32chars_min";    length = 32 },
  @{ placeholder = "changeme_refresh_secret_32chars_min"; length = 32 },
  @{ placeholder = "changeme_encryption_key_32chars_min"; length = 32 },
  @{ placeholder = "changeme_admin_password_16chars";     length = 16 }
)

foreach ($r in $replacements) {
  if ($content -match [regex]::Escape($r.placeholder)) {
    $newValue = New-RandomHex -length $r.length
    $content  = $content -replace [regex]::Escape($r.placeholder), $newValue
    Write-Host "  ✔  Replaced $($r.placeholder)" -ForegroundColor Gray
  }
}

Set-Content -Path $envFile -Value $content
Write-Host "`n✔  All secrets generated in $envFile" -ForegroundColor Green

# ── 4. Print summary & next steps ──────────────────────────────
$dbUser   = Select-String -Path $envFile -Pattern "^DB_USER=(.+)"     | ForEach-Object { $_.Matches.Groups[1].Value }
$dbName   = Select-String -Path $envFile -Pattern "^DB_NAME=(.+)"     | ForEach-Object { $_.Matches.Groups[1].Value }
$dbPort   = Select-String -Path $envFile -Pattern "^DB_PORT_EXTERNAL=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }

Write-Host @"

╔══════════════════════════════════════════════════════════╗
║              CMMS v2 — Ready to launch!                 ║
╚══════════════════════════════════════════════════════════╝

  Database:  postgresql://${dbUser}@localhost:${dbPort}/${dbName}
  Backend:   http://localhost:3001
  Frontend:  http://localhost:8081

  Next steps:

    1. Build & start the stack
       docker compose up --build -d

    2. Open the app
       http://localhost:8081

  To stop everything:
       docker compose down

"@
