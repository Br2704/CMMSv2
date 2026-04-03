$ErrorActionPreference = "Stop"

Write-Host "[backend] typecheck"
Push-Location backend
npm run typecheck
Pop-Location

Write-Host "[backend] lint"
Push-Location backend
npm run lint
Pop-Location

Write-Host "[backend] tests"
Push-Location backend
npm run test
Pop-Location

Write-Host "[frontend] typecheck"
Push-Location frontend
npm run typecheck
Pop-Location

Write-Host "[frontend] lint"
Push-Location frontend
npm run lint
Pop-Location

Write-Host "[frontend] tests"
Push-Location frontend
npm run test
Pop-Location
