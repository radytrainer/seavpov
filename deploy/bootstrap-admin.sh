#!/usr/bin/env bash
# Creates the first administrator from ADMIN_* in .env.production (it refuses when an
# administrator already exists). Afterwards, clear ADMIN_PASSWORD in .env.production.
# Usage: bash deploy/bootstrap-admin.sh
# shellcheck source=deploy/common.sh
source "$(dirname "$0")/common.sh"

[ -n "$(env_get ADMIN_PASSWORD)" ] || die "Set ADMIN_USERNAME / ADMIN_PASSWORD in .env.production first"
compose exec -T api node dist/seed-production.js
log "Sign in at https://$DOMAIN/login, change the password, then clear ADMIN_PASSWORD in .env.production"
