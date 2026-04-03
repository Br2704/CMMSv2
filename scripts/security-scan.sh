#!/usr/bin/env sh
set -eu

echo "Running frontend secret scan..."
node ./scripts/check-frontend-secrets.js

echo "Running backend dependency audit..."
(cd ./backend && npm audit --audit-level=high)

echo "Running frontend dependency audit..."
(cd ./frontend && npm audit --audit-level=high)

echo "Security scan completed."
