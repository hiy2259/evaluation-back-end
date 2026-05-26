#!/usr/bin/env bash
# Sync shared/types.ts (SOT) to the frontend repo.
# Usage: bash scripts/sync-types.sh [FRONTEND_DIR]
# Default FRONTEND_DIR: ../evaluation-front
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/shared/types.ts"
FRONTEND_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)/evaluation-front}"
DEST="${FRONTEND_DIR}/src/types/shared.ts"

if [ ! -f "$SRC" ]; then
  echo "[sync-types] source missing: $SRC" >&2
  exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "[sync-types] frontend dir missing: $FRONTEND_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp "$SRC" "$DEST"
echo "[sync-types] copied $SRC -> $DEST"
