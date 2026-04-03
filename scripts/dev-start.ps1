$ErrorActionPreference = "Stop"

if (-not (Test-Path "backend/.env")) {
  Copy-Item "backend/.env.example" "backend/.env"
  Write-Host "Created backend/.env from backend/.env.example"
}

if (-not (Test-Path "frontend/.env.local")) {
  Copy-Item "frontend/.env.example" "frontend/.env.local"
  Write-Host "Created frontend/.env.local from frontend/.env.example"
}

docker compose -f docker-compose.dev.yml up -d

Write-Host ""
Write-Host "Services started:"
Write-Host "- Postgres:  localhost:5432"
Write-Host "- Backend:   http://localhost:3001/health"
Write-Host ""
Write-Host "Run frontend in another terminal:"
Write-Host "cd frontend; npm install; npm run dev"

