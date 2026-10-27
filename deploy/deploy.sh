#!/usr/bin/env bash
# Deploys the current (or a given) git revision: pull, back up, build, restart, verify.
# Database migrations run automatically when the api container starts.
# Usage: bash deploy/deploy.sh            # latest commit of the current branch
#        bash deploy/deploy.sh v1.2.0     # a tag or commit (also used for rollback)
# shellcheck source=deploy/common.sh
source "$(dirname "$0")/common.sh"
cd "$APP_DIR"

REF=${1:-}
# Code copied to the server without git (rsync/scp) is deployed as-is.
if [ -d .git ] && [ -n "$(git remote)" ]; then
  log "Fetching code"
  git fetch --tags --prune
  if [ -n "$REF" ]; then git checkout --quiet "$REF"; else git pull --ff-only; fi
  log "Revision: $(git rev-parse --short HEAD) $(git log -1 --format=%s)"
fi

[ -s "$CERTS_DIR/fullchain.pem" ] || die "No certificate in $CERTS_DIR. Run: sudo bash deploy/init-letsencrypt.sh"

log "Backing up the database before deploying"
compose exec -T backup /scripts/backup.sh || echo "    (backup skipped: backup service not running)"

log "Building images"
compose build

log "Starting containers"
compose up -d --remove-orphans

log "Waiting for api, web and nginx to become healthy"
ok=""
for _ in $(seq 1 60); do
  status=$(for s in api web nginx; do
    docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q "$s")" 2>/dev/null || echo missing
  done | sort -u | tr '\n' ' ')
  if [ "$status" = "healthy " ]; then ok=1; break; fi
  sleep 5
done
compose ps
[ -n "$ok" ] || die "Services did not become healthy. Inspect: docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 api web nginx"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/login" || true)
log "https://$DOMAIN/login -> HTTP $code"

docker image prune -f >/dev/null
log "Deploy finished"
