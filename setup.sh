#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
#  CMMS v2 — One-command environment setup (Bash)
#  Usage:  chmod +x setup.sh && ./setup.sh
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# ── 1. Create .env from .env.example if missing ────────────────
if [ ! -f "$ENV_FILE" ]; then
  if [ ! -f "$ENV_EXAMPLE" ]; then
    echo "Error: $ENV_EXAMPLE not found. Are you in the project root?"
    exit 1
  fi
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "✔  Created $ENV_FILE from $ENV_EXAMPLE"
else
  echo "ℹ  $ENV_FILE already exists — skipping copy."
fi

# ── 2. Generate random hex strings ──────────────────────────────
random_hex() {
  local length="${1:-32}"
  # Use multiple approaches for portability
  if command -v openssl &>/dev/null; then
    openssl rand -hex "$((length / 2))" 2>/dev/null | cut -c1-"$length"
  elif command -v node &>/dev/null; then
    node -e "console.log(require('crypto').randomBytes($((length / 2))).toString('hex').slice(0, $length))"
  else
    # Fallback using /dev/urandom
    od -An -tx1 -N"$((length / 2))" /dev/urandom | tr -d ' \n' | cut -c1-"$length"
  fi
}

# ── 3. Replace placeholder values ──────────────────────────────
# Arrays of (placeholder, length) pairs — compatible with Bash 3+
PLACEHOLDERS=(
  "changeme_db_password_32chars_min"
  "changeme_jwt_secret_32chars_min"
  "changeme_refresh_secret_32chars_min"
  "changeme_encryption_key_32chars_min"
  "changeme_admin_password_16chars"
)
LENGTHS=(32 32 32 32 16)

for i in "${!PLACEHOLDERS[@]}"; do
  placeholder="${PLACEHOLDERS[$i]}"
  length="${LENGTHS[$i]}"
  if grep -qF "$placeholder" "$ENV_FILE" 2>/dev/null; then
    new_value=$(random_hex "$length")
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/$placeholder/$new_value/g" "$ENV_FILE"
    else
      sed -i "s/$placeholder/$new_value/g" "$ENV_FILE"
    fi
    echo "  ✔  Replaced $placeholder"
  fi
done

echo ""
echo "✔  All secrets generated in $ENV_FILE"

# ── 4. Print summary ───────────────────────────────────────────
DB_USER=$(grep "^DB_USER=" "$ENV_FILE" | cut -d= -f2)
DB_NAME=$(grep "^DB_NAME=" "$ENV_FILE" | cut -d= -f2)
DB_PORT=$(grep "^DB_PORT_EXTERNAL=" "$ENV_FILE" | cut -d= -f2)

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              CMMS v2 — Ready to launch!                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Database:  postgresql://${DB_USER}@localhost:${DB_PORT}/${DB_NAME}"
echo "  Backend:   http://localhost:3001"
echo "  Frontend:  http://localhost:8081"
echo ""
echo "  Next steps:"
echo ""
echo "    1. Build & start the stack"
echo "       docker compose up --build -d"
echo ""
echo "    2. Open the app"
echo "       http://localhost:8081"
echo ""
echo "  To stop everything:"
echo "       docker compose down"
echo ""
