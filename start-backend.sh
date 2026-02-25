#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/backend"
echo "Starting backend on http://localhost:8000 ..."
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
