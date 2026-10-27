#!/usr/bin/env bash
# First start + Let's Encrypt certificate for $DOMAIN (and www.$DOMAIN when INCLUDE_WWW=true):
#  1. writes a temporary self-signed certificate so nginx can start,
#  2. builds and starts the whole stack,
#  3. obtains the real certificate with certbot (webroot challenge served by nginx),
#  4. installs a renewal hook that copies renewed certificates and reloads nginx.
# Prerequisite: DNS A record(s) for the domain point at this server's Elastic IP.
# Usage: sudo bash deploy/init-letsencrypt.sh [--staging]
# shellcheck source=deploy/common.sh
source "$(dirname "$0")/common.sh"

[ "$(id -u)" -eq 0 ] || die "Run with sudo (certbot writes to /etc/letsencrypt)"
command -v certbot >/dev/null || die "certbot is not installed (run deploy/server-setup.sh first)"

STAGING=()
[ "${1:-}" = "--staging" ] && STAGING=(--staging)
EMAIL=$(env_get LETSENCRYPT_EMAIL)
[ -n "$EMAIL" ] || die "LETSENCRYPT_EMAIL is not set in .env.production"
DOMAINS=(-d "$DOMAIN")
[ "$(env_get INCLUDE_WWW)" = "true" ] && DOMAINS+=(-d "www.$DOMAIN")

log "Checking DNS for $DOMAIN"
PUBLIC_IP=$(curl -fsS --max-time 5 https://checkip.amazonaws.com || true)
RESOLVED=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
echo "    server public IP: ${PUBLIC_IP:-unknown}; $DOMAIN resolves to: ${RESOLVED:-nothing}"
if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "$RESOLVED" ]; then
  echo "    WARNING: DNS does not point at this server yet; certbot will fail until it does."
fi

mkdir -p "$CERTS_DIR" "$CERTBOT_WEBROOT"
if [ ! -s "$CERTS_DIR/fullchain.pem" ]; then
  log "Creating a temporary self-signed certificate"
  openssl req -x509 -nodes -newkey rsa:2048 -days 2 -subj "/CN=$DOMAIN" \
    -keyout "$CERTS_DIR/privkey.pem" -out "$CERTS_DIR/fullchain.pem" >/dev/null 2>&1
  chmod 644 "$CERTS_DIR/privkey.pem" "$CERTS_DIR/fullchain.pem"
fi

log "Building images and starting the stack (the first build takes several minutes)"
compose up -d --build

log "Waiting for nginx to become healthy"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q nginx)" 2>/dev/null)" = "healthy" ] && break
  sleep 5
done

log "Requesting certificate"
certbot certonly --webroot -w "$CERTBOT_WEBROOT" "${DOMAINS[@]}" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring "${STAGING[@]}"

log "Installing renewal hook"
HOOK=/etc/letsencrypt/renewal-hooks/deploy/pn-seavpov.sh
mkdir -p "$(dirname "$HOOK")"
{
  echo '#!/bin/sh'
  echo '# Installed by deploy/init-letsencrypt.sh: copy renewed certificates and reload nginx.'
  echo 'set -e'
  echo "cp -L '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' '$CERTS_DIR/fullchain.pem'"
  echo "cp -L '/etc/letsencrypt/live/$DOMAIN/privkey.pem' '$CERTS_DIR/privkey.pem'"
  # nginx in the container runs its workers as a non-root user but reads keys as root at start/reload.
  echo "chmod 644 '$CERTS_DIR/fullchain.pem'"
  echo "chmod 600 '$CERTS_DIR/privkey.pem'"
  echo "docker compose -f '$COMPOSE_FILE' --env-file '$ENV_FILE' exec -T nginx nginx -s reload"
} > "$HOOK"
chmod 755 "$HOOK"
"$HOOK"

log "Done: https://$DOMAIN"
echo "    Next: bash deploy/bootstrap-admin.sh   (creates the first administrator)"
echo "    Check renewal: sudo certbot renew --dry-run"
