# Deploying to AWS EC2 (Ubuntu + Docker) — pn-seavpov.store

This guide deploys the production stack (`docker-compose.prod.yml`) to one EC2 instance:

```
Internet ──► nginx :80/:443 (TLS, Let's Encrypt) ──► web (Next.js :3000)
                                                 └─► api (Fastify :4010) ──► PostgreSQL 17
                                                       backup (daily pg_dump) ──► ./backups ──► S3 (optional)
```

| Item       | Value                                               |
| ---------- | --------------------------------------------------- |
| Domain     | `pn-seavpov.store` (+ `www.pn-seavpov.store` → 301) |
| Server IP  | `16.176.173.105`                                    |
| DNS host   | Namecheap (`dns1/dns2.registrar-servers.com`)       |
| App folder | `/srv/pn-seavpov`                                   |
| Env file   | `/srv/pn-seavpov/.env.production` (never committed) |

The scripts in `deploy/` do the work; each one can be re-run safely.

| Script                       | Run as | What it does                                                           |
| ---------------------------- | ------ | ---------------------------------------------------------------------- |
| `deploy/server-setup.sh`     | sudo   | Docker + Compose, certbot, ufw (22/80/443), 2 GB swap, auto-updates    |
| `deploy/init-letsencrypt.sh` | sudo   | first build + start, Let's Encrypt certificate, auto-renewal hook      |
| `deploy/bootstrap-admin.sh`  | user   | creates the first administrator from `ADMIN_*`                         |
| `deploy/deploy.sh [ref]`     | user   | git pull (or checkout `ref`), backup, build, restart, wait for healthy |
| `deploy/backup-to-s3.sh`     | user   | copies `backups/*.dump` to S3 (optional, run from cron)                |

## 1. EC2 instance

| Setting   | Recommendation                                                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AMI       | Ubuntu Server 24.04 LTS (x86_64 or arm64)                                                                                                                                                                                                        |
| Type      | `t3.small` (2 GB) minimum — the script adds 2 GB swap for builds; `t3.medium` is more comfortable                                                                                                                                                |
| Disk      | 30 GB gp3                                                                                                                                                                                                                                        |
| Public IP | **Elastic IP** associated to the instance. A plain auto-assigned public IP changes when the instance is stopped/started, which breaks DNS. If `16.176.173.105` is not an Elastic IP yet, allocate one, associate it, and use that address below. |
| IAM role  | optional: S3 write access for off-site backups (§8)                                                                                                                                                                                              |

**Security group (inbound)** — currently only 22 is reachable; add 80 and 443:

| Type  | Port | Source                        |
| ----- | ---- | ----------------------------- |
| SSH   | 22   | _your IP only_ (`x.x.x.x/32`) |
| HTTP  | 80   | `0.0.0.0/0` and `::/0`        |
| HTTPS | 443  | `0.0.0.0/0` and `::/0`        |

Port 80 must stay open: Let's Encrypt validates and renews through it, and nginx redirects it to HTTPS.
PostgreSQL, the API and the web container are never exposed.

## 2. DNS at Namecheap

Namecheap → Domain List → `pn-seavpov.store` → **Advanced DNS**. Delete the parking records
(the `@` URL redirect / A record and the `www` CNAME → `parkingpage.namecheap.com`), then add:

| Type     | Host  | Value            | TTL   |
| -------- | ----- | ---------------- | ----- |
| A Record | `@`   | `16.176.173.105` | 5 min |
| A Record | `www` | `16.176.173.105` | 5 min |

Check from your computer (wait until both return the server IP, usually 5–30 minutes):

```bash
nslookup pn-seavpov.store 8.8.8.8
nslookup www.pn-seavpov.store 8.8.8.8
```

(Using Route 53 instead? Create a hosted zone, set the four Route 53 name servers as _Custom DNS_
in Namecheap, and add the same two A records there.)

## 3. Prepare the server

```bash
ssh -i your-key.pem ubuntu@16.176.173.105

sudo mkdir -p /srv/pn-seavpov && sudo chown ubuntu:ubuntu /srv/pn-seavpov
```

Get the code onto the server — either from Git:

```bash
git clone <repository-url> /srv/pn-seavpov
```

or copy it from your Windows PC (PowerShell, in the project folder; skips local-only folders):

```powershell
tar --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude=.env -czf ..\pn-seavpov.tgz .
scp -i your-key.pem ..\pn-seavpov.tgz ubuntu@16.176.173.105:/srv/pn-seavpov/
ssh -i your-key.pem ubuntu@16.176.173.105 "cd /srv/pn-seavpov && tar -xzf pn-seavpov.tgz && rm pn-seavpov.tgz"
```

Then install Docker and the rest:

```bash
cd /srv/pn-seavpov
sudo bash deploy/server-setup.sh
exit            # log out and in again so the docker group applies
```

## 4. Configure

```bash
ssh -i your-key.pem ubuntu@16.176.173.105
cd /srv/pn-seavpov
cp .env.production.example .env.production && chmod 600 .env.production
nano .env.production
```

Already filled for this deployment: `DOMAIN=pn-seavpov.store`, `APP_ORIGIN=https://pn-seavpov.store`,
`INCLUDE_WWW=true`, `TIME_ZONE=Asia/Phnom_Penh`. You must replace every `__placeholder__`:

| Variable            | Value                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `LETSENCRYPT_EMAIL` | an address that receives certificate-expiry notices               |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32 \| tr -d '/+=' \| cut -c1-32`            |
| `ADMIN_PASSWORD`    | temporary password for the first admin (changed at first sign-in) |
| `SMTP_*` (optional) | for password-reset emails, e.g. Amazon SES SMTP credentials       |

The scripts refuse to run while placeholders remain.

## 5. First start and HTTPS certificate

Once DNS resolves to the server:

```bash
sudo bash deploy/init-letsencrypt.sh            # add --staging for a dry run against LE staging
```

It builds the images (about 5–10 minutes on a small instance), starts everything behind a
temporary self-signed certificate, requests the real certificate for `pn-seavpov.store` and
`www.pn-seavpov.store`, installs it, and installs the renewal hook
`/etc/letsencrypt/renewal-hooks/deploy/pn-seavpov.sh`. Certbot's systemd timer renews
automatically; verify with `sudo certbot renew --dry-run`.

## 6. First administrator

```bash
bash deploy/bootstrap-admin.sh
```

Open <https://pn-seavpov.store/login>, sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`, set a new
password when asked, then clear `ADMIN_PASSWORD=` in `.env.production`. Continue with classes,
categories and students under Administration (`docs/ADMIN_GUIDE.md`). Turn self-registration on
or off in Admin → Settings.

## 7. Updating and rollback

```bash
cd /srv/pn-seavpov
bash deploy/deploy.sh                 # latest commit (git) or the files already copied (scp)
bash deploy/deploy.sh v1.2.0          # a specific tag/commit — also how you roll back
```

`deploy.sh` takes a database backup first, rebuilds, restarts with migrations applied by the api
on start, and waits until api, web and nginx are healthy. When copying code with `scp` instead of
Git, upload the new archive as in §3 and then run `bash deploy/deploy.sh`.

Rollback note: migrations are forward-only. If the release you are leaving added a migration,
restore the backup taken by `deploy.sh` (§8) before starting the older release.

## 8. Backups

- The `backup` container writes `backups/reading_tracker_<UTC>.dump` at start-up and daily at
  02:00 UTC, verifies it, and keeps `BACKUP_RETENTION_DAYS` (14) days.
- Manual: `docker compose -f docker-compose.prod.yml --env-file .env.production exec backup /scripts/backup.sh`
- **Off-server copy to S3 (recommended):**
  1. Create a private S3 bucket (same region as the instance), block public access.
  2. Create an IAM role for EC2 with `s3:PutObject` and `s3:ListBucket` on that bucket; attach it
     to the instance (Actions → Security → Modify IAM role). No access keys on the server.
  3. `sudo snap install aws-cli --classic`; set `S3_BACKUP_BUCKET` and `AWS_REGION` in `.env.production`.
  4. Test `bash deploy/backup-to-s3.sh`, then `crontab -e`:
     `30 2 * * * cd /srv/pn-seavpov && bash deploy/backup-to-s3.sh >> $HOME/s3-backup.log 2>&1`
- Also consider **EBS snapshots** (AWS Data Lifecycle Manager, daily, keep 7).
- Restore: see `docs/DEPLOYMENT.md` §7 (`infra/backup/restore.sh`).

## 9. Day-to-day commands

Run from `/srv/pn-seavpov`; `dc` = `docker compose -f docker-compose.prod.yml --env-file .env.production`
(add `alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'` to `~/.bashrc`).

| Task         | Command                                                             |
| ------------ | ------------------------------------------------------------------- |
| Status       | `dc ps` (all `healthy`)                                             |
| Logs         | `dc logs -f --tail=200 api` (or `web`, `nginx`)                     |
| Restart      | `dc restart api`                                                    |
| Stop / start | `dc down` / `dc up -d` — **never** `down -v` (deletes the database) |
| Disk usage   | `df -h /` · `docker system df`                                      |

All services use `restart: unless-stopped`, so they come back after a reboot.

## 10. Smoke tests (after each deploy)

```bash
curl -sI http://pn-seavpov.store/login | head -3          # 301 → https://pn-seavpov.store/login
curl -sI https://www.pn-seavpov.store/ | grep -i location  # → https://pn-seavpov.store/
curl -sI https://pn-seavpov.store/login | grep -iE 'HTTP|strict-transport'
curl -s -o /dev/null -w '%{http_code}\n' https://pn-seavpov.store/health   # 403 (internal only)
```

Then in a browser: sign in as admin, open Users and Settings; sign in as a test student, start
and stop a short reading session, and check it in History.

## 11. Checklist

- [ ] Elastic IP associated; security group allows 22 (your IP), 80, 443
- [ ] Namecheap parking records removed; `@` and `www` A records → server IP
- [ ] `.env.production` complete, `chmod 600`, no placeholders, strong `POSTGRES_PASSWORD`
- [ ] `init-letsencrypt.sh` succeeded; `sudo certbot renew --dry-run` passes
- [ ] All containers healthy; reboot tested (`sudo reboot`, then `dc ps`)
- [ ] First admin created, password changed, `ADMIN_PASSWORD` cleared
- [ ] Backups present in `backups/`; S3 copy and/or EBS snapshots configured; restore tested
- [ ] Smoke tests pass

## Verification record (local, 2026-10-27)

The same stack and scripts were run on Windows 11 / Docker with `DOMAIN=localhost`, a
self-signed certificate and ports 8081/8443: `deploy.sh` built and started all services
(healthy); `bootstrap-admin.sh` created the admin; the nginx template rendered and passed
`nginx -t`; HTTP → HTTPS and `www` → apex redirects, ACME webroot, HSTS/CSP/X-Frame-Options
(single copies), gzip, immutable static caching, `/health` and `/api/docs` blocked (403);
login through nginx set a `Secure; HttpOnly` cookie, the forced password change applied, a
foreign `Origin` was rejected (403), the real client IP reached the API; `nginx -s reload`
(renewal hook) worked; a backup was written. Scripts pass `bash -n` and ShellCheck 0.10.
**Not run locally:** `server-setup.sh` and the certbot step of `init-letsencrypt.sh` (they need
the Ubuntu server and public DNS) and `backup-to-s3.sh` (needs an S3 bucket).
