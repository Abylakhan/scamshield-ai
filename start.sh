#!/usr/bin/env bash
# One-command local launch: installs dependencies if needed, builds the frontend,
# and serves the whole app (API + UI) from http://localhost:8000
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

PY="${PYTHON:-python3.12}"
if [ ! -d "$ROOT/backend/.venv" ]; then
  "$PY" -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
[ -f "$ROOT/backend/.env" ] || cp "$ROOT/.env.example" "$ROOT/backend/.env"

if [ ! -d "$ROOT/frontend/node_modules" ]; then (cd "$ROOT/frontend" && npm install); fi
(cd "$ROOT/frontend" && npm run build)

cd "$ROOT/backend"
echo "ScamShield AI → http://localhost:8000   (API docs: http://localhost:8000/docs)"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
