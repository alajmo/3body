#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${1:-}"

if [[ -z "$TARGET_HOST" ]]; then
  echo "usage: deploy/deploy.sh user@host" >&2
  exit 1
fi

FRONTEND_DIR="${FRONTEND_DIR:-src/frontend/dist}"
BACKEND_BIN="${BACKEND_BIN:-src/backend/dist/3body-server}"
WEB_ROOT="${WEB_ROOT:-/var/www/3body}"
BIN_TARGET="${BIN_TARGET:-/usr/local/bin/3body-server}"
SERVICE_NAME="${SERVICE_NAME:-3body-server}"

rsync -av --delete "$FRONTEND_DIR"/ "$TARGET_HOST:$WEB_ROOT/"
rsync -av "$BACKEND_BIN" "$TARGET_HOST:$BIN_TARGET"
ssh "$TARGET_HOST" "sudo systemctl restart $SERVICE_NAME"
