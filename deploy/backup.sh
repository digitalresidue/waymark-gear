#!/usr/bin/env bash
# Nightly backup: database dump + uploaded photos, kept locally and copied
# off the server with rclone (configure a remote named "offsite" first:
# `rclone config` — Backblaze B2, S3, DigitalOcean Spaces and others work).
#
# install.sh sets this up to run every night at 03:15 (/etc/cron.d/waymark)
# and `waymark backup` runs it now; `waymark offsite` sets up the copy.
#
# Restore: `waymark restore <file>` (see INSTALL.md, "Backups").

set -euo pipefail

DIR="${WAYMARK_DIR:-/opt/waymark}"
cd "$DIR"
STAMP=$(date +%F)
DEST="$DIR/backups"
KEEP_DAYS=14
mkdir -p "$DEST"

docker compose -f docker-compose.prod.yml exec -T db \
    pg_dump -U waymark -d waymark --no-owner --clean --if-exists | gzip > "$DEST/waymark-db-$STAMP.sql.gz"

docker run --rm -v waymark_userimages:/images:ro -v "$DEST":/out alpine \
    tar -czf "/out/waymark-images-$STAMP.tar.gz" -C /images .

find "$DEST" -name 'waymark-*' -mtime +"$KEEP_DAYS" -delete

if command -v rclone >/dev/null && rclone listremotes | grep -q '^offsite:'; then
    rclone copy "$DEST" offsite:waymark-backups --max-age 25h
fi

echo "$(date -Is) backup ok: $(cd "$DEST" && echo waymark-*-"$STAMP".*)"
