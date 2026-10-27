#!/bin/sh
# Restores a backup created by backup.sh into TARGET_DB (default: $PGDATABASE).
# DESTRUCTIVE for the target database: existing objects are dropped and recreated.
# Usage (stop the api service first when restoring the live database):
#   docker compose -f docker-compose.prod.yml stop api web
#   docker compose -f docker-compose.prod.yml exec backup /scripts/restore.sh /backups/<file>.dump [target_db]
#   docker compose -f docker-compose.prod.yml start api web
set -eu

file="${1:?usage: restore.sh <backup-file> [target-db]}"
target="${2:-${PGDATABASE:?}}"
: "${PGHOST:=db}"

[ -f "$file" ] || { echo "Backup not found: $file" >&2; exit 1; }
pg_restore --list "$file" >/dev/null

if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$target'" | grep -q 1; then
  createdb "$target"
fi

pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
  --dbname="$target" "$file"
echo "Restored $file into database $target"
psql -d "$target" -tAc "SELECT 'users=' || count(*) FROM users UNION ALL SELECT 'reading_sessions=' || count(*) FROM reading_sessions UNION ALL SELECT 'migrations=' || count(*) FROM _prisma_migrations"
