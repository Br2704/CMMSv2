#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
#  Generate cryptographically secure secrets for Docker deployment
#
#  Usage:
#    ./scripts/docker-generate-secrets.sh          (creates .env)
#    ./scripts/docker-generate-secrets.sh --force   (overwrites existing .env)
#
#  Requires: openssl (available on Linux, macOS, Git Bash/WSL on Windows)
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE=".env"
FORCE=false

if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

if [[ -f "$ENV_FILE" && "$FORCE" != "true" ]]; then
  echo "Error: $ENV_FILE already exists."
  echo "  Run with --force to overwrite, or delete it manually."
  exit 1
fi

# Generate cryptographically random strings (base64url-encoded, no padding)
generate_secret() {
  local bytes="${1:-48}"
  openssl rand -base64 "$bytes" | tr '+/' '-_' | tr -d '=' | head -c "$bytes"
}

# Generate a strong alphanumeric password
generate_password() {
  local length="${1:-32}"
  openssl rand -base64 48 | tr -dc 'A-Za-z0-9!@#%^*_+=' | head -c "$length"
}

echo "Generating cryptographic secrets..."

DB_USER="cmms_$(generate_secret 4)"
DB_PASSWORD="$(generate_password 32)"
JWT_SECRET="$(generate_secret 64)"
JWT_REFRESH_SECRET="$(generate_secret 64)"
DATA_ENCRYPTION_KEY="$(generate_secret 32)"
PGADMIN_PASSWORD="$(generate_password 24)"

cat > "$ENV_FILE" <<EOF
# ───────────────────────────────────────────────────────────────
#  CMMS v2 — Docker Environment (auto-generated)
#  Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
#
#  KEEP THIS FILE SECRET. Do not commit to version control.
#  Regenerate with: ./scripts/docker-generate-secrets.sh --force
# ───────────────────────────────────────────────────────────────

# ── Database ───────────────────────────────────────────────────
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_PORT_EXTERNAL=5432

# ── Backend Secrets (base64url-encoded, 64 bytes entropy each) ─
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY}

# ── Frontend ───────────────────────────────────────────────────
FRONTEND_PORT=8081
FRONTEND_URL=http://localhost:8081
APP_CORS_ORIGINS=http://localhost:8081,http://localhost

# ── Backend Port ───────────────────────────────────────────────
BACKEND_PORT=3001

# ── pgAdmin (tools profile only) ───────────────────────────────
PGADMIN_EMAIL=admin@cmms.local
PGADMIN_PASSWORD=${PGADMIN_PASSWORD}
EOF

# Secure the file (owner read/write only)
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo ""
echo "Secrets written to $ENV_FILE (permissions: 600)"
echo ""
echo "Secret strength:"
echo "  DB_PASSWORD ........... ${#DB_PASSWORD} chars (alphanumeric + symbols)"
echo "  JWT_SECRET ............ ${#JWT_SECRET} chars (base64url, ~384 bits entropy)"
echo "  JWT_REFRESH_SECRET .... ${#JWT_REFRESH_SECRET} chars (base64url, ~384 bits entropy)"
echo "  DATA_ENCRYPTION_KEY ... ${#DATA_ENCRYPTION_KEY} chars (base64url, ~192 bits entropy)"
echo ""
echo "Next steps:"
echo "  1. Review $ENV_FILE"
echo "  2. docker compose up -d"
echo ""
echo "WARNING: Do NOT commit $ENV_FILE to git."
