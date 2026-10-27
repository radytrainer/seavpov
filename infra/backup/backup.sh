#!/bin/sh
# Creates a compressed PostgreSQL backup (custom format) and removes backups older than
# BACKUP_RETENTION_DAYS. Runs inside the "backup" service of docker-compose.prod.yml
# (daily via the loop in that service) or manually:
#   docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh
set -eu

: "${PGHOST:=db}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=14}"

mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$BACKUP_DIR/${PGDATABASE}_${stamp}.dump"
tmp="$file.partial"

pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$tmp"
# Verify the archive is readable before publishing it.
pg_restore --list "$tmp" >/dev/null
mv "$tmp" "$file"
echo "$(date -u +%FT%TZ) backup written: $file ($(du -h "$file" | cut -f1))"

find "$BACKUP_DIR" -name "${PGDATABASE}_*.dump" -type f -mtime +"$BACKUP_RETENTION_DAYS" -print -delete
