#!/usr/bin/env bash
# Shared helpers for the deploy/*.sh scripts. Sourced, not executed.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die ".env.production not found. Run: cp .env.production.example .env.production (then edit it)"
if grep -nE '^[A-Z_]+=.*__[A-Za-z_@.]+__' "$ENV_FILE" >&2; then
  die ".env.production still contains __placeholders__ (listed above)"
fi

# Read one value from .env.production without executing the file.
env_get() {
  local v
  v=$(grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)
  v=${v%\"}
  v=${v#\"}
  printf '%s' "$v"
}

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# Resolve a path from .env.production relative to the application directory.
abs_path() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$APP_DIR" "${1#./}" ;;
  esac
}

DOMAIN=$(env_get DOMAIN)
[ -n "$DOMAIN" ] || die "DOMAIN is not set in .env.production"
CERTS_DIR=$(env_get CERTS_DIR)
CERTS_DIR=$(abs_path "${CERTS_DIR:-./infra/certs}")
CERTBOT_WEBROOT=$(env_get CERTBOT_WEBROOT)
CERTBOT_WEBROOT=$(abs_path "${CERTBOT_WEBROOT:-./infra/certbot-www}")
