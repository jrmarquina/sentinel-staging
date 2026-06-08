#!/usr/bin/env bash
# =============================================================
# Sentinel Public Works — Production Deploy Script
# Run from the VPS: bash deploy-prod.sh
# Triggered via: gh workflow run deploy-prod.yml (Claude Code)
#
# VERSION STRATEGY:
#   Production inherits the same version number as the staging
#   build being promoted. This lets you compare at a glance:
#   staging 1.1.0.18 vs prod 1.1.0.15 = 3 builds behind.
# =============================================================
set -euo pipefail

REPO_DIR="/srv/sentinel/municipal-public-works"
LOG_DIR="/srv/sentinel/logs"
APP_NAME="sentinel-mpw"
ENV_FILE="/opt/sentinel/.env"
DB_CONTAINER="supabase-db"
STAGING_BUILD_FILE="/srv/sentinel/staging/build-number.txt"

echo "==> [1/6] Pulling latest code from staging branch..."
cd "$REPO_DIR"
git fetch origin
git checkout staging
git reset --hard origin/staging

echo "==> [2/6] Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> [3/6] Resolving version (matches staging build being promoted)..."

REPO_VERSION_FILE="$REPO_DIR/apps/web/version.txt"
BASE=$(cat "$REPO_VERSION_FILE" 2>/dev/null | tr -d '[:space:]' | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+' || echo "1.1.0")
STAGING_BUILD=$(cat "$STAGING_BUILD_FILE" 2>/dev/null | tr -d '[:space:]' || echo "0")
NEW_VERSION="${BASE}.${STAGING_BUILD}"
echo "  Promoting staging build → production: $NEW_VERSION"

# Regenerate apps/web/.env.local from the prod env file.
# Includes all NEXT_PUBLIC_* (baked into client bundle) and server-side
# admin credentials (Supabase service role, Resend, Cloudflare, B2, etc.).
if [ -f "$ENV_FILE" ]; then
  grep -E '^(NEXT_PUBLIC_|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|GITHUB_TOKEN|GITHUB_REPO|UPTIMEROBOT_API_KEY|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ZONE_ID|CONTABO_|BACKUP_|B2_|NOVU_|TWILIO_|SLACK_|SUPABASE_INTERNAL_URL)' "$ENV_FILE" \
    | grep -v '^NEXT_PUBLIC_APP_VERSION=' \
    > "$REPO_DIR/apps/web/.env.local"
  echo "NEXT_PUBLIC_APP_VERSION=${NEW_VERSION}" >> "$REPO_DIR/apps/web/.env.local"
  awk -F= '{lines[$1]=$0} END{for(k in lines) print lines[k]}' "$REPO_DIR/apps/web/.env.local" > /tmp/env_dedup && mv /tmp/env_dedup "$REPO_DIR/apps/web/.env.local"
  echo "  Wrote apps/web/.env.local (version: $NEW_VERSION)"
fi

# Load prod env vars into shell so build-time env resolution works.
# Line-by-line parsing avoids bash treating values containing / $ ! as commands.
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    [[ -n "$key" ]] && export "$key"="$val"
  done < "$ENV_FILE"
fi

echo "==> [4/6] Applying pending DB migrations to production..."

PSQL="docker exec $DB_CONTAINER psql -U postgres -d postgres"

$PSQL -c "CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());" 2>/dev/null || true

for f in "$REPO_DIR"/supabase/migrations/*.sql; do
  fname=$(basename "$f")
  # Never auto-apply seed/demo/fixture data to the production DB
  if echo "$fname" | grep -qE '_seed|_demo|_fixture'; then
    echo "  Skipping seed migration: $fname"
    $PSQL -c "INSERT INTO _migrations(filename) VALUES ('$fname') ON CONFLICT DO NOTHING;" 2>/dev/null || true
    continue
  fi
  already=$($PSQL -tAc "SELECT COUNT(*) FROM _migrations WHERE filename = '$fname';" 2>/dev/null || echo "0")
  if [ "$already" = "0" ]; then
    echo "  Applying migration: $fname"
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$f" \
      && $PSQL -c "INSERT INTO _migrations(filename) VALUES ('$fname') ON CONFLICT DO NOTHING;" \
      || echo "  ⚠ Migration $fname failed — continuing"
  fi
done

echo "==> [5/6] Building Next.js app ($NEW_VERSION)..."
mkdir -p "$LOG_DIR"
# 2 webpack workers: limits CPU contention with Supabase and staging running in parallel
NODE_OPTIONS="--max-old-space-size=3072" NEXT_WEBPACK_WORKER_THREADS=2 pnpm --filter web build

echo "==> [6/6] Reloading production PM2 process..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start "$REPO_DIR/ecosystem.config.js" --only "$APP_NAME"
fi
pm2 save

sleep 15
if curl -sf http://localhost:3001/api/health; then
  echo ""
  echo "✓ Production health check passed"
else
  echo ""
  echo "⚠ Production health check failed — check pm2 logs $APP_NAME"
  exit 1
fi

echo ""
echo "✓ Production deploy complete: $NEW_VERSION"
echo "✓ Staging version for comparison: $(cat $STAGING_BUILD_FILE 2>/dev/null)"
echo "✓ Logs: pm2 logs $APP_NAME"
