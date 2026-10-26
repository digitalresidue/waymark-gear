#!/usr/bin/env bash
# Nightly backup: database dump + uploaded photos, kept locally and copied
# off the server with rclone (configure a remote named "offsite" first:
# `rclone config` — Backblaze B2, S3, DigitalOcean Spaces and others work).
#
# Install on the server:
#   sudo cp backup.sh /opt/waymark/ && sudo chmod 700 /opt/waymark/backup.sh
#   sudo crontab -e   ->   15 3 * * * /opt/waymark/backup.sh >> /var/log/waymark-backup.log 2>&1
#
# Restore a database dump:
#   gunzip -c waymark-db-YYYY-MM-DD.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T db psql -U waymark -d waymark

set -euo pipefail

cd /opt/waymark
STAMP=$(date +%F)
DEST=/opt/waymark/backups
KEEP_DAYS=14
mkdir -p "$DEST"

docker compose -f docker-compose.prod.yml exec -T db \
    pg_dump -U waymark -d waymark --no-owner | gzip > "$DEST/waymark-db-$STAMP.sql.gz"

docker run --rm -v waymark_userimages:/images:ro -v "$DEST":/out alpine \
    tar -czf "/out/waymark-images-$STAMP.tar.gz" -C /images .

find "$DEST" -name 'waymark-*' -mtime +"$KEEP_DAYS" -delete

if command -v rclone >/dev/null && rclone listremotes | grep -q '^offsite:'; then
    rclone copy "$DEST" offsite:waymark-backups --max-age 25h
fi

echo "$(date -Is) backup ok: $(ls -1 "$DEST" | grep "$STAMP" | tr '\n' ' ')"
