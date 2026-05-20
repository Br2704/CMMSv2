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

docker compose --profile dev up -d

cat <<'EOF'

Services started:
- Postgres:  localhost:5432
- Backend:   http://localhost:3001/health
- Frontend:  http://localhost:5173

To also start tools (pgadmin):
  docker compose --profile dev --profile tools up -d

For production stack:
  docker compose --profile production up -d --build
EOF

