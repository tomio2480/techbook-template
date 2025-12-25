#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "Installing dependencies..."
npm ci

echo "Building PDF..."
npm run build

echo "Build complete! Output: dist/"
ls -la dist/
