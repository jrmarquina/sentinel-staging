#!/usr/bin/env bash
# =============================================================
# Sentinel Public Works — Staging Deploy Script
# Run from the VPS: bash deploy-staging.sh
# Assumes staging repo cloned at /srv/sentinel/staging/municipal-public-works
# =============================================================
set -euo pipefail

REPO_DIR="/srv/sentinel/staging/municipal-public-works"
LOG_DIR="/srv/sentinel/logs"
APP_NAME="sentinel-mpw-staging"
ENV_FILE="/srv/sentinel/staging/.env.staging"
COMPOSE_PROJECT="supabase-staging"

echo "==> [1/6] Pulling latest code from staging branch..."
cd "$REPO_DIR"
git fetch origin
git checkout staging
git pull origin staging 2>/dev/null || echo "  (no git remote — skipping pull)"

echo "==> [2/6] Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> [3/6] Building Next.js app..."
# Load staging env vars so NEXT_PUBLIC_* are baked in at build time
set -a
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
set +a
pnpm --filter web build

echo "==> [4/6] Ensuring log directory exists..."
mkdir -p "$LOG_DIR"

echo "==> [5/6] Reloading staging PM2 process..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  # Start only the staging app from the shared ecosystem config
  pm2 start "$REPO_DIR/ecosystem.config.js" --only "$APP_NAME"
fi
pm2 save

echo "==> [6/6] Restarting staging Supabase stack..."
if [ -f "$ENV_FILE" ]; then
  docker compose \
    -p "$COMPOSE_PROJECT" \
    --env-file "$ENV_FILE" \
    -f "$REPO_DIR/docker-compose.staging.yml" \
    up -d --remove-orphans
else
  echo "  WARNING: $ENV_FILE not found — skipping Supabase restart."
  echo "  Copy .env.staging.template to $ENV_FILE and fill in values first."
fi

echo ""
echo "✓ Staging deploy complete."
echo "✓ Next.js staging: http://localhost:3002  (proxy: staging.yourdomain.com)"
echo "✓ Supabase staging API: http://localhost:8100"
echo "✓ Supabase staging Studio: http://localhost:3004"
echo "✓ Logs: pm2 logs $APP_NAME"
