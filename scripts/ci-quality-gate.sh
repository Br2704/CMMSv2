#!/usr/bin/env bash
set -euo pipefail

echo "[backend] typecheck"
(cd backend && npm run typecheck)

echo "[backend] lint"
(cd backend && npm run lint)

echo "[backend] tests"
(cd backend && npm run test)

echo "[frontend] typecheck"
(cd frontend && npm run typecheck)

echo "[frontend] lint"
(cd frontend && npm run lint)

echo "[frontend] tests"
(cd frontend && npm run test)
