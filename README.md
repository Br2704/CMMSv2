# TamOptiX CMMS Platform

CMMSv2 is a full-stack CMMS platform for multi-organization and multi-plant maintenance operations. The codebase includes a React frontend, Express backend, PostgreSQL persistence, Docker deployment, RBAC, notifications, QR-based asset access, audit logging, and PWA support.

## Primary Documentation

The single consolidated project handover, architecture summary, and ISO 27001 / security-improvement plan is now maintained in:

- [FINAL_PROJECT_DOCUMENTATION.md](/d:/CMMSv2/FINAL_PROJECT_DOCUMENTATION.md)

## Quick Start

Create env files:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Run the production-style stack:

```powershell
docker compose -f docker-compose.prod.yml --profile proxy up --build -d
```

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
