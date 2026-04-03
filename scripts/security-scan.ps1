$ErrorActionPreference = "Stop"

Write-Host "Running frontend secret scan..."
node .\scripts\check-frontend-secrets.js

Write-Host "Running backend dependency audit..."
Push-Location .\backend
npm audit --audit-level=high
Pop-Location

Write-Host "Running frontend dependency audit..."
Push-Location .\frontend
npm audit --audit-level=high
Pop-Location

Write-Host "Security scan completed."
