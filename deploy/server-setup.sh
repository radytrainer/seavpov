#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 server (e.g. AWS EC2).
# Installs Docker Engine + Compose plugin, certbot, a firewall, swap and automatic security updates.
# Usage (as a sudo-capable user):  sudo bash deploy/server-setup.sh
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }
TARGET_USER=${SUDO_USER:-ubuntu}
SWAP_SIZE=${SWAP_SIZE:-2G}

echo "==> Updating packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg git ufw certbot unattended-upgrades openssl

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine (official repository)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$TARGET_USER"

# Building the Next.js image needs more memory than a 1-2 GB instance has.
if ! swapon --show | grep -q /swapfile; then
  echo "==> Creating ${SWAP_SIZE} swap file"
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall: allow SSH, HTTP, HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Done. Log out and back in (so '$TARGET_USER' can run docker without sudo), then:"
echo "  cd /srv/pn-seavpov && cp .env.production.example .env.production && nano .env.production"
echo "  sudo bash deploy/init-letsencrypt.sh"
