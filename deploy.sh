#!/usr/bin/env bash
# =============================================================
# Sentinel Public Works — VPS Deploy Script
# Run from the VPS: bash deploy.sh
# Assumes repo already cloned at /srv/sentinel/municipal-public-works
# =============================================================
set -euo pipefail

REPO_DIR="/srv/sentinel/municipal-public-works"
APP_DIR="$REPO_DIR/apps/web"
LOG_DIR="/srv/sentinel/logs"
APP_NAME="sentinel-mpw"

echo "==> [1/5] Pulling latest code..."
cd "$REPO_DIR"
git pull origin main 2>/dev/null || echo "  (no git remote — skipping pull)"

echo "==> [2/5] Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> [3/5] Building Next.js app..."
pnpm --filter web build

echo "==> [4/5] Ensuring log directory exists..."
mkdir -p "$LOG_DIR"

echo "==> [5/5] Reloading PM2 process..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start "$REPO_DIR/ecosystem.config.js"
fi

pm2 save

echo ""
echo "✓ Deploy complete. Check status with: pm2 status"
echo "✓ Logs: pm2 logs $APP_NAME"
