#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/frontend"
echo "Starting frontend on http://localhost:5173 ..."
npm run dev
