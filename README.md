# TamOptiX CMMS Platform

CMMSv2 is a full-stack CMMS platform for multi-organization and multi-plant maintenance operations. The codebase includes a React frontend, Express backend, PostgreSQL persistence, Docker deployment, RBAC, notifications, QR-based asset access, audit logging, and PWA support.

## Primary Documentation

The single consolidated project handover, architecture summary, and ISO 27001 / security-improvement plan is now maintained in:

- [FINAL_PROJECT_DOCUMENTATION.md](/d:/CMMSv2/FINAL_PROJECT_DOCUMENTATION.md)

## Quick Start

### One-command setup (recommended)

From the repository root, run the setup script to auto-generate a `.env` file with secure secrets:

**PowerShell:**
```powershell
.\setup.ps1
```

**Bash:**
```bash
chmod +x setup.sh && ./setup.sh
```

What it does:
- Copies `.env.example` → `.env` (if not already present)
- Replaces all `changeme_*` placeholders with cryptographically secure random values
- Prints connection details and next steps

Then start the production stack (frontend + backend + PostgreSQL):

```powershell
docker compose up --build -d
```

Open the app at [http://localhost:8081](http://localhost:8081).

### Manual setup

```powershell
Copy-Item .env.example .env
# Then manually edit .env with your own secrets
```

Database setup:

- Select the database engine and default app database name in [backend/src/config/database.selection.ts](backend/src/config/database.selection.ts).
- Configure only connection credentials in [backend/.env.example](backend/.env.example) copied to `backend/.env`.

Run the production-style stack:

```powershell
docker compose -f docker-compose.prod.yml up --build -d
```

Run the single production Docker stack from the repository root:

```powershell
docker compose up --build -d
```

This starts only the frontend, backend, and PostgreSQL database services.

## Access From Other Devices On Same Network

Yes, Docker can expose this app on your LAN. Run the stack on your host machine, then open the host IP from another device connected to the same Wi-Fi/LAN.

Get your host LAN IP (PowerShell):

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress
```

Production-style (recommended):

```powershell
$env:APP_BASE_URL = "http://<HOST_LAN_IP>"
$env:APP_CORS_ORIGINS = "http://<HOST_LAN_IP>,http://<HOST_LAN_IP>:8080,http://localhost,http://localhost:8080,http://127.0.0.1,http://127.0.0.1:8080"
docker compose -f docker-compose.prod.yml up --build -d
```

Open from another device:

- http://<HOST_LAN_IP>

Development with frontend in Docker:

```powershell
docker compose -f docker-compose.dev.yml --profile ui up --build -d
```

Open from another device:

- http://<HOST_LAN_IP>:5173

If access still fails, allow inbound TCP ports 80, 8080, 5173, and 3001 in Windows Firewall for private networks.

Frontend validation:

```powershell
cd frontend
npm run typecheck
npm run build
```

Backend validation:

```powershell
cd backend
npm run typecheck
npm run build
```
