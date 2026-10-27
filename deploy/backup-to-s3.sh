#!/usr/bin/env bash
# Copies local database backups (BACKUP_DIR, default ./backups) to Amazon S3 for off-server safety.
# Needs the AWS CLI and an EC2 instance role allowing s3:PutObject + s3:ListBucket on the bucket.
# Usage: bash deploy/backup-to-s3.sh
# Cron (daily 02:30 UTC, after the 02:00 backup):
#   30 2 * * * cd /srv/pn-seavpov && bash deploy/backup-to-s3.sh >> $HOME/s3-backup.log 2>&1
# shellcheck source=deploy/common.sh
source "$(dirname "$0")/common.sh"

BUCKET=$(env_get S3_BACKUP_BUCKET)
PREFIX=$(env_get S3_BACKUP_PREFIX)
PREFIX=${PREFIX:-pn-seavpov/db}
REGION=$(env_get AWS_REGION)
BACKUP_DIR=$(env_get BACKUP_DIR)
BACKUP_DIR=$(abs_path "${BACKUP_DIR:-./backups}")

[ -n "$BUCKET" ] || die "S3_BACKUP_BUCKET is not set in .env.production"
command -v aws >/dev/null || die "AWS CLI not found (sudo snap install aws-cli --classic)"

REGION_ARGS=()
[ -n "$REGION" ] && REGION_ARGS=(--region "$REGION")

log "Syncing $BACKUP_DIR -> s3://$BUCKET/$PREFIX/"
aws s3 sync "$BACKUP_DIR" "s3://$BUCKET/$PREFIX/" --exclude '*' --include '*.dump' \
  "${REGION_ARGS[@]}" --sse AES256 --only-show-errors
log "Done ($(date -u +%FT%TZ))"
