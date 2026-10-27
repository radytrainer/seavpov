# Production deployment (OVHcloud)

> **Deploying pn-seavpov.store on AWS?** Follow [DEPLOY_AWS.md](DEPLOY_AWS.md) — it uses the
> scripts in `deploy/`, which automate §1, §4 and §5 below. The nginx site config is now the
> template `infra/nginx/templates/app.conf.template`, filled from `DOMAIN` in `.env.production`.

This guide deploys the stack in `docker-compose.prod.yml` on a single Linux VPS:
**nginx** (TLS, headers, gzip) → **web** (Next.js) and **api** (Fastify) → **PostgreSQL 17**,
plus a **backup** container that writes daily `pg_dump` archives.

> Status: the production images, compose file, TLS proxy, health checks, migrations, backups
> and restore were built and verified locally (self-signed certificate, see "Verification
> record"). Provisioning the OVHcloud server, DNS and the real certificate require the
> institution's accounts and must be done by an administrator following the steps below.

## 1. Server

| Item     | Recommendation                                                                         |
| -------- | -------------------------------------------------------------------------------------- |
| Product  | OVHcloud VPS (e.g. 2 vCPU, 4 GB RAM, 80 GB SSD) — enough for several thousand students |
| OS       | Ubuntu 24.04 LTS                                                                       |
| Software | Docker Engine + Compose plugin, `certbot`, `ufw`                                       |
| Firewall | allow 22 (SSH, preferably restricted to admin IPs), 80, 443; deny everything else      |
| Backups  | enable OVHcloud automated VPS backups **and** copy `backups/` off-server (§7)          |

```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER            # log out/in afterwards
sudo apt -y install certbot ufw
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
sudo timedatectl set-timezone UTC         # containers store UTC; the app uses TIME_ZONE for display
```

## 2. DNS

In the OVHcloud control panel (Web Cloud → Domains → DNS zone) create:

| Type | Name                                | Target              |
| ---- | ----------------------------------- | ------------------- |
| A    | `reading` (→ `reading.example.edu`) | VPS IPv4            |
| AAAA | `reading`                           | VPS IPv6 (optional) |

Wait until `dig +short reading.example.edu` returns the VPS address.

## 3. Get the code and configure

```bash
sudo mkdir -p /srv/reading-tracker && sudo chown $USER /srv/reading-tracker
git clone <repository-url> /srv/reading-tracker && cd /srv/reading-tracker
cp .env.production.example .env.production && chmod 600 .env.production
nano .env.production    # APP_ORIGIN, strong POSTGRES_PASSWORD, ADMIN_*, SMTP_*, TIME_ZONE
```

Generate secrets with `openssl rand -base64 32`. Never commit `.env.production`.
`APP_ORIGIN` must be the exact public URL (e.g. `https://reading.example.edu`); it is used for the
CSRF origin check and password-reset links.

## 4. TLS certificate (Let's Encrypt)

nginx needs a certificate to start, so the first issuance uses a temporary self-signed one:

```bash
mkdir -p infra/certs infra/certbot-www
openssl req -x509 -nodes -newkey rsa:2048 -days 2 -subj "/CN=localhost" \
  -keyout infra/certs/privkey.pem -out infra/certs/fullchain.pem
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

sudo certbot certonly --webroot -w /srv/reading-tracker/infra/certbot-www \
  -d reading.example.edu --email it@example.edu --agree-tos --no-eff-email
```

Install the certificate and reload nginx with a deploy hook (also used for renewals):

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reading-tracker.sh >/dev/null <<'EOF'
#!/bin/sh
cp -L /etc/letsencrypt/live/reading.example.edu/fullchain.pem /srv/reading-tracker/infra/certs/
cp -L /etc/letsencrypt/live/reading.example.edu/privkey.pem /srv/reading-tracker/infra/certs/
docker compose -f /srv/reading-tracker/docker-compose.prod.yml exec -T nginx nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reading-tracker.sh
sudo /etc/letsencrypt/renewal-hooks/deploy/reading-tracker.sh   # install the first certificate now
sudo certbot renew --dry-run    # certbot's systemd timer renews automatically
```

## 5. First start and administrator

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps        # all "healthy"
docker compose -f docker-compose.prod.yml --env-file .env.production exec api node dist/seed-production.js
```

The bootstrap creates the first administrator from `ADMIN_*` (only if no administrator exists).
Sign in at `https://reading.example.edu`, change the temporary password, then **remove
`ADMIN_PASSWORD` from `.env.production`**. Create classes, categories and import students from
the Administration pages (see `docs/ADMIN_GUIDE.md`).

## 6. Operations

| Task              | Command (from `/srv/reading-tracker`, prefix `docker compose -f docker-compose.prod.yml --env-file .env.production`) |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Status / health   | `ps` · internal: `exec api wget -qO- http://127.0.0.1:4010/health/ready`                                             |
| Logs              | `logs -f --tail=200 api` (json-file driver, rotated at 10 MB × 5 files per container)                                |
| Restart a service | `restart api` (all services use `restart: unless-stopped` and come back after reboots)                               |
| Stop everything   | `down` (**never** add `-v` — it deletes the database volume)                                                         |

### Updating / database migrations

1. `git fetch && git checkout <release-tag>`
2. Take a manual backup (§7).
3. `up -d --build` — the api container runs `prisma migrate deploy` before starting. Migrations
   are committed SQL files in `apps/api/prisma/migrations`; each runs once, in order, and is
   recorded in `_prisma_migrations`. The api will not start if a migration fails.
4. Check `ps` (healthy) and sign in.

Tag images per release (`IMAGE_TAG=2026.10.1` in `.env.production`) so the previous images
remain available.

### Rollback

- **Application only** (no schema change in the release): set `IMAGE_TAG` back to the previous
  tag (or check out the previous tag) and `up -d`.
- **Release included a migration**: migrations are forward-only. Either deploy a fix-forward
  migration, or restore the backup taken before the update (§7) and then start the previous
  release. Restoring loses data written after the backup — announce a maintenance window.

## 7. Backups and restore

The `backup` service writes `backups/reading_tracker_<UTC timestamp>.dump` (PostgreSQL custom
format, compressed) at start-up and daily at ~02:00 UTC, verifies each archive with
`pg_restore --list`, and deletes archives older than `BACKUP_RETENTION_DAYS` (default 14).

- **Manual backup:** `exec backup /scripts/backup.sh`
- **Off-site copy (required):** sync `backups/` to OVHcloud Object Storage or another host daily,
  e.g. `rclone sync /srv/reading-tracker/backups ovh-s3:reading-backups` from cron.
- **Test restore (monthly):** restore into a scratch database and check the counts:
  `exec backup /scripts/restore.sh /backups/<file>.dump restore_check`
  then `exec db dropdb -U <POSTGRES_USER> restore_check`.
- **Restore the live database:**
  ```bash
  … stop api web
  … exec backup /scripts/restore.sh /backups/<file>.dump
  … start api web
  ```

## 8. Production checklist

- [ ] DNS points to the VPS; HTTPS works with a valid certificate; HTTP redirects to HTTPS
- [ ] `.env.production` filled, `chmod 600`, not in Git; strong `POSTGRES_PASSWORD`
- [ ] `APP_ORIGIN` equals the public URL; `TIME_ZONE` correct (also set in Admin → Settings)
- [ ] All containers healthy; `restart: unless-stopped`; server reboot tested
- [ ] First admin created, password changed, `ADMIN_PASSWORD` removed from the env file
- [ ] SMTP configured, or password resets handled by administrators
- [ ] Backup written in `backups/`; off-site sync configured; restore test done
- [ ] Firewall allows only 22/80/443; PostgreSQL is not exposed (no `ports:` on `db`)
- [ ] `certbot renew --dry-run` succeeds
- [ ] Smoke tests below pass

## 9. Smoke tests (after every deployment)

```bash
curl -sI http://reading.example.edu/login | head -1                  # 301 to https
curl -sI https://reading.example.edu/login | grep -i strict-transport # HSTS present
curl -s -o /dev/null -w '%{http_code}\n' https://reading.example.edu/health   # 403 (internal only)
```

Then in a browser: sign in as admin, open Users and Settings; sign in as a test student, start
and finish a 1-minute session, and confirm it appears in History.

## Verification record (local, 2026-10-27)

Run on Windows 11 / Docker 29 with a self-signed certificate on ports 8081/8443:

| Check                                                                     | Result |
| ------------------------------------------------------------------------- | ------ |
| Images build (`api`, `web`)                                               | pass   |
| All services healthy (`db`, `api`, `web`, `nginx`, `backup`)              | pass   |
| Migrations applied on start; first-admin bootstrap                        | pass   |
| HTTP → HTTPS redirect; HSTS, CSP, X-Frame-Options, nosniff; gzip          | pass   |
| `/health`, `/api/docs` blocked externally (403)                           | pass   |
| Session cookie `Secure`; forced password change enforced by API           | pass   |
| Browser pass (admin pages) — no console/CSP errors                        | pass   |
| Data persists after `down` + `up` (volume kept); sessions survive restart | pass   |
| Backup written and verified; restore into separate DB matches live counts | pass   |
