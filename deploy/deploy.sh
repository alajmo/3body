#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${1:-}"

if [[ -z "$TARGET_HOST" ]]; then
  echo "usage: deploy/deploy.sh user@host" >&2
  exit 1
fi

FRONTEND_DIR="${FRONTEND_DIR:-src/frontend/dist}"
BACKEND_BIN="${BACKEND_BIN:-src/backend/dist/3body-server}"
TUNING_FILE="${TUNING_FILE:-.data/editor-tuning.json}"
APP_ROOT="${APP_ROOT:-/home/samir/3body}"
WEB_ROOT="${WEB_ROOT:-$APP_ROOT/web}"
BIN_TARGET="${BIN_TARGET:-$APP_ROOT/bin/3body-server}"
DATA_DIR="${DATA_DIR:-$APP_ROOT/data}"
SERVICE_NAME="${SERVICE_NAME:-3body-server}"

ssh "$TARGET_HOST" "mkdir -p $WEB_ROOT $APP_ROOT/bin $DATA_DIR"
rsync -av --delete "$FRONTEND_DIR"/ "$TARGET_HOST:$WEB_ROOT/"
rsync -av "$BACKEND_BIN" "$TARGET_HOST:$BIN_TARGET"
rsync -av "$TUNING_FILE" "$TARGET_HOST:$DATA_DIR/editor-tuning.json"
ssh "$TARGET_HOST" "sudo systemctl restart $SERVICE_NAME"
