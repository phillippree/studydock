#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script creates a macOS disk image and must run on macOS." >&2
  exit 1
fi

if [[ ! -x "node_modules/.bin/electron-builder" ]]; then
  echo "Project dependencies are missing. Run 'npm ci' first." >&2
  exit 1
fi

npm run build
npx electron-builder --mac dmg

echo "StudyDock disk image created in: $PROJECT_ROOT/release/"
