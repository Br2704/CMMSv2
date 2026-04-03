#!/usr/bin/env bash
set -euo pipefail

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from backend/.env.example"
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.example frontend/.env.local
  echo "Created frontend/.env.local from frontend/.env.example"
fi

docker compose -f docker-compose.dev.yml up -d

cat <<'EOF'

Services started:
- Postgres:  localhost:5432
- Backend:   http://localhost:3001/health

Run frontend in another terminal:
cd frontend && npm install && npm run dev
EOF

