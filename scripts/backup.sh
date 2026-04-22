#!/bin/bash
# =============================================================
# Sentinel Public Works — Nightly Backup Script
# Cron: 0 2 * * * /opt/sentinel/scripts/backup.sh >> /var/log/sentinel-backup.log 2>&1
# Retention: 30 daily, stored in Backblaze B2
# =============================================================
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/sentinel-backups"
BACKUP_FILE="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz.gpg"
MIN_SIZE_BYTES=10000   # Alert if backup is smaller than 10 KB — indicates silent failure

# Load environment
if [ -f /opt/sentinel/.env ]; then
  source /opt/sentinel/.env
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# ─── Database dump ────────────────────────────────────────────
pg_dump "$DATABASE_URL" \
  | gzip \
  | gpg --batch --yes --symmetric --passphrase "$BACKUP_PASSPHRASE" \
  > "$BACKUP_FILE"

# ─── Size sanity check ────────────────────────────────────────
ACTUAL_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE")
if [ "$ACTUAL_SIZE" -lt "$MIN_SIZE_BYTES" ]; then
  echo "[$(date)] ERROR: Backup file suspiciously small ($ACTUAL_SIZE bytes). Aborting upload."
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "[$(date)] Backup size: $ACTUAL_SIZE bytes. Uploading to B2..."

# ─── Upload to Backblaze B2 ───────────────────────────────────
rclone copy "$BACKUP_FILE" "b2:$B2_BUCKET_NAME/db/" \
  --b2-account "$B2_KEY_ID" \
  --b2-key "$B2_APPLICATION_KEY"

echo "[$(date)] Database backup uploaded: db_${TIMESTAMP}.sql.gz.gpg"

# ─── Storage backup (incremental) ─────────────────────────────
# Adjust the Docker volume path to match your Supabase compose setup
STORAGE_PATH="/var/lib/docker/volumes/supabase_storage/_data"
if [ -d "$STORAGE_PATH" ]; then
  rclone sync "$STORAGE_PATH" "b2:$B2_BUCKET_NAME/storage/" \
    --b2-account "$B2_KEY_ID" \
    --b2-key "$B2_APPLICATION_KEY" \
    --transfers 10
  echo "[$(date)] Storage sync complete."
fi

# ─── Cleanup local temp file ──────────────────────────────────
rm -f "$BACKUP_FILE"

# ─── Retention: keep last 30 daily backups ────────────────────
# B2 lifecycle rules handle retention — configure in B2 bucket settings:
# Keep versions for 30 days, then auto-delete old versions.

echo "[$(date)] Backup complete."
