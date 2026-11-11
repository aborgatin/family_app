# Deployment

How the app is built, shipped and run. One installation per Family (ADR-0004). The sources are
`Dockerfile`, `.github/workflows/ci.yml`, `deploy/` and `scripts/`; the header comments of the
scripts are authoritative for their options.

## Image

`Dockerfile` (repo root) builds everything from source; `docker build .` needs no prior local build.

1. `node:22-bookworm-slim`: `npm ci` and `npm run build` in `web/` → `web/dist`.
2. `eclipse-temurin:21-jdk-noble`: copies `web/dist` into `src/main/resources/static/` and
   `web/src/shared/palette/` (read by `build.gradle.kts`), then `./gradlew bootJar`.
3. `eclipse-temurin:21-jre-noble`: runs `java -jar /app/app.jar` as the non-root user `app`, port 8080.

One image serves the API and the web bundle. Program arguments after the image name are passed to
the app, which is how operator commands run ([Password reset](#password-reset)). `.dockerignore`
excludes `.git`, `node_modules`, build output and `docs`.

## CI/CD

`.github/workflows/ci.yml` runs on every pull request and on push to `main`. On a push to `main`
every job runs. On a pull request a **changes** job (`dorny/paths-filter`) decides which of
`backend`, `web` and `image` run, and each of them skips itself with `if:`:

| Job       | Runs on a pull request when changed                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend` | `backend/**`, `web/src/shared/palette/**` (the backend build copies the Child color palette), or `ci.yml`                                                                        |
| `web`     | `web/**` or `ci.yml`                                                                                                                                                             |
| `image`   | `backend/**`, `web/**`, `Dockerfile`, `.dockerignore`, `deploy/**`, `scripts/image-smoke-test.sh`, `scripts/deploy-stack-test.sh`, `scripts/backup-restore-test.sh`, or `ci.yml` |

`migrations` always runs. Never filter with workflow-level `paths:`: a skipped workflow leaves
required checks pending forever, while a skipped job counts as passed (#17). When a job starts
reading a file outside its folder, add that path to its filter. The `if:` conditions fail open: if
**changes** itself fails, `backend`, `web` and `image` run rather than skip, since a skipped required
check would let the PR merge untested.

- **migrations**: `scripts/check-migrations-test.sh` (the guard's self-test), then
  `scripts/check-migrations.sh` against the PR's target branch, or on push to `main` against the
  commit before the push (S5); then `scripts/check-error-codes-test.sh` and
  `scripts/check-error-codes.sh` (every server error code has a client message, I3). The job always
  runs, since a new code can come from either folder.
- **backend**: `spotlessCheck`, `compileJava compileTestJava` (Error Prone, `-Werror`), `test`
  (Testcontainers, Modulith).
- **web**: `npm ci`, `format:check`, `lint`, `typecheck`, `test`, `build`.
- **image**: builds the image (`load: true`, GitHub Actions cache), then
  `scripts/image-smoke-test.sh`, `scripts/deploy-stack-test.sh`, `scripts/backup-restore-test.sh`.
  Only on push to `main` it logs in to GHCR with `GITHUB_TOKEN` (`packages: write`) and pushes.

Locally, `scripts/check.sh` runs the guards, the cheap web checks (format, lint, typecheck), the backend
build and the web tests and build in one command from any directory; `scripts/check.sh --image` also builds the image and runs
`scripts/image-smoke-test.sh`. It fails early when Docker is not running.

Image tags: `ghcr.io/aborgatin/family_app:<full commit SHA>` and `:latest`. Deploy is manual; CI
never touches the server.

Test scripts (each takes an `APP_IMAGE_TAG` or image name and cleans up after itself):

| Script                                 | Checks                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/image-smoke-test.sh <image>`  | image + throwaway PostgreSQL 18: health UP, `/` and `/settings` return `index.html`, manifest, caching headers, `bootstrapRequired: true`                                                  |
| `scripts/deploy-stack-test.sh <tag>`   | the production Compose stack with `DOMAIN=localhost` over real HTTPS through Caddy, real client IPs behind Caddy, data survives `down && up`. Needs host ports 80/443 free                 |
| `scripts/backup-restore-test.sh <tag>` | app + PostgreSQL with a local SFTP container as the Storage Box: backup, pruning, failure exit, cron entry, `--list`, scratch restore, live restore after wiping the volume. No host ports |

## Server layout

- One Hetzner VPS (shared x86, 2 vCPU / 4 GB, Germany, Ubuntu LTS) with Docker Engine and the
  Compose plugin. Firewall: 22, 80, 443.
- A copy of the repository's `deploy/` directory on the server, plus its `.env` (not in git). All
  `docker compose` commands below run in that directory. `backup.sh` and `restore.sh` find the
  Compose file and `.env` next to themselves, so they run from anywhere.
- Docker volumes: `postgres-data` (database), `caddy-data` (certificates, ACME account),
  `caddy-config`. Compose project name `family-app`.
- `deploy/backup.log`: output of the nightly backup cron job.
- A Hetzner Storage Box in Helsinki (a different site from the VPS) receives the nightly dumps.

## Compose services

`deploy/docker-compose.yml` (project `family-app`), all on the network `internal`
(`172.28.14.0/24`). Only Caddy publishes ports.

| Service    | Image                                           | Notes                                                                                                                |
| ---------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `app`      | `ghcr.io/aborgatin/family_app:${APP_IMAGE_TAG}` | waits for `postgres` healthy; healthcheck `curl` on `http://localhost:8080/actuator/health` (start period 90s)       |
| `postgres` | `postgres:18`                                   | volume `postgres-data` at `/var/lib/postgresql` (PG 18 keeps data in `18/docker` below it); `pg_isready` healthcheck |
| `caddy`    | `caddy:2`                                       | ports 80, 443, 443/udp; fixed address `172.28.14.10`; mounts `./Caddyfile`, volumes `caddy-data`, `caddy-config`     |

All three restart `unless-stopped` and get `TZ`. The app's `TRUSTED_PROXIES` is fixed to
`172\.28\.14\.10` (Caddy), so it trusts `X-Forwarded-*` from Caddy only and sees real client IPs
(used by the login limits).

Logs: `docker compose logs [-f] app` (also `postgres`, `caddy`).

Local development uses `deploy/docker-compose.dev.yml` instead: PostgreSQL 18 only, on
`127.0.0.1:5432` (`DEV_DB_PORT` moves it), database/user/password `family`. `scripts/dev.sh`
starts it, the backend and the web dev server in one command (`--fresh-db` backs it up, then
empties it; header of that script, and backend.md "Local development"). `scripts/db.sh "<sql>"` runs a query against it (`-c <container>` for
another PostgreSQL container, `-d <database>` for another database).

## Caddy

`deploy/Caddyfile`:

- Global `email {$ACME_EMAIL}` for the Let's Encrypt account.
- Site `{$DOMAIN}`: automatic HTTPS (a public domain gets a Let's Encrypt certificate, `localhost`
  gets one from Caddy's local CA), HTTP redirected to HTTPS, `encode zstd gzip` for everything but
  the live-update stream, `Strict-Transport-Security "max-age=31536000; includeSubDomains"`,
  `reverse_proxy app:8080`.
- Caddy replaces any client-sent `X-Forwarded-For` with the real client IP.
- **Live updates (SSE, `GET /api/sync/events`)**: `reverse_proxy` flushes `text/event-stream`
  responses at once and has no read timeout by default, so it needs no setting. The stream is left
  out of `encode` (`@compressible not path /api/sync/events`) so no compressor holds back an
  event. The app's 25 s heartbeat keeps the idle connection open. Graceful shutdown doesn't wait
  for open streams: the app ends them when it stops, and the clients reconnect to the new
  container.

## Environment variables

`deploy/.env`, copied from `deploy/.env.example` (placeholders only, A2). Read by Compose and by
the backup scripts (`ENV_FILE` overrides the path; process environment wins over the file).

| Variable                                                            | Example / default                          | Read by                                                                |
| ------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `DOMAIN`                                                            | `family.example.com` (required)            | Caddy site; app links `https://<DOMAIN>/invite/…`, `/reset-password/…` |
| `ACME_EMAIL`                                                        | required                                   | Caddy                                                                  |
| `APP_IMAGE_TAG`                                                     | `latest` or a commit SHA (required)        | `app` image tag                                                        |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`                 | required                                   | `postgres`; mapped to the app's `DATASOURCE_*`                         |
| `SESSION_TIMEOUT`                                                   | `180d`                                     | app: session lifetime (sliding) and cookie `Max-Age`                   |
| `INVITE_TTL`                                                        | `7d`                                       | app                                                                    |
| `PASSWORD_RESET_TTL`                                                | `1h`                                       | app                                                                    |
| `LOGIN_LIMIT_PER_EMAIL`, `LOGIN_LIMIT_PER_IP`, `LOGIN_LIMIT_WINDOW` | `10`, `20`, `15m`                          | app: failed-login limits (in memory)                                   |
| `TZ`                                                                | `Europe/Berlin`                            | all containers; the host must use the same zone for cron               |
| `BACKUP_TARGET`                                                     | `user@host:path`                           | `backup.sh`, `restore.sh`                                              |
| `BACKUP_RETENTION_DAYS`                                             | `90`                                       | `backup.sh`                                                            |
| `BACKUP_TIME`                                                       | `03:30`                                    | `backup.sh --cron-entry`                                               |
| `BACKUP_SSH_KEY`                                                    | `~/.ssh/family_backup`                     | backup scripts                                                         |
| `BACKUP_SSH_PORT`                                                   | `23` (the Storage Box's SSH port)          | backup scripts                                                         |
| `BACKUP_SSH_KNOWN_HOSTS`                                            | `~/.ssh/known_hosts`                       | backup scripts (strict host key checking)                              |

A new app setting needs a line in `.env.example` and in the `app` service's `environment:`.

## Deploy and rollback

Deploy the newest `main` build (with `APP_IMAGE_TAG=latest`):

```sh
docker compose pull && docker compose up -d
```

Flyway migrates the database on app start. Sessions live in PostgreSQL, so nobody is logged out.
The installed PWA picks up the new bundle on its next launch.

Pin or roll back: set `APP_IMAGE_TAG` in `.env` to the full commit SHA of a `main` build, then run
the same command. Migrations only go forward: rolling back past a migration works only if the older
code still runs on the newer schema. If it doesn't, restore the backup taken before the deploy.

GHCR access: the server pulls anonymously once the package is public; otherwise
`docker login ghcr.io` with a read-only token.

## Password reset

No email is sent; the operator creates a one-time link:

```sh
docker compose run --rm app reset-password <member's email>
```

It starts the app without the web server (safe next to the running app), creates the reset, prints
`https://<DOMAIN>/reset-password/<token>` with its expiry and exits 0. Unknown email: a message on
stderr, exit 1. Wrong arguments: usage, exit 2. The link works once, for `PASSWORD_RESET_TTL`;
creating a new one invalidates the Member's older unused links. Completing it sets the new password
and logs the Member out on every device, then logs them in on the current one.

## Backups

`deploy/backup.sh` (shared code in `deploy/backup-common.sh`):

1. `pg_dump --format=custom` inside the running `postgres` container.
2. Upload over SFTP with the dedicated key to `BACKUP_TARGET` as
   `family-YYYYMMDDTHHMMSSZ.dump` (UTC), first as `.part`, then renamed, so a broken upload never
   looks like a dump.
3. Delete dumps on the target older than `BACKUP_RETENTION_DAYS` (by the date in the name; other
   files are left alone).

Any failure exits non-zero and logs `backup failed` on stderr. Host keys are checked strictly
(`StrictHostKeyChecking=yes`), so the target's key must be in `BACKUP_SSH_KNOWN_HOSTS` first.

Nightly run: a host cron entry at `BACKUP_TIME`. Cron uses the host's time zone, so set the host to
`TZ` first (`timedatectl set-timezone Europe/Berlin`), then install the entry:

```sh
(crontab -l 2>/dev/null; deploy/backup.sh --cron-entry) | crontab -
```

The entry appends output to `deploy/backup.log`. Only the database is backed up: keep a copy of
`.env` elsewhere. Caddy certificates are re-issued if lost.

## Restore

`deploy/restore.sh`:

```sh
deploy/restore.sh --list                  # dumps on BACKUP_TARGET, oldest first
deploy/restore.sh --scratch <db> <dump>   # restore into a new database <db>; live data untouched
deploy/restore.sh <dump>                  # replace the live database (asks for confirmation)
```

`<dump>` is a local file or a dump name from `--list` (downloaded first). Restores use
`pg_restore --exit-on-error --single-transaction --no-owner`.

**Check a backup (restore drill):**

1. `deploy/restore.sh --list` and pick the newest dump.
2. `deploy/restore.sh --scratch restore_check <dump>`.
3. Inspect it, e.g.
   `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d restore_check -c "SELECT email FROM member"'`.
4. Drop it: `docker compose exec postgres sh -c 'dropdb -U "$POSTGRES_USER" restore_check'`.

**Replace the live database** (data loss, server rebuild):

1. If the server is new, finish the [set-up checklist](#server-set-up-checklist) up to a running
   stack (`docker compose up -d`), with the same `.env` values as before.
2. `deploy/restore.sh <dump>`, then type the database name to confirm. It stops `app`, drops and
   recreates the database, restores the dump and starts `app`. Everything written after the dump is
   lost.
3. If it fails, the app stays stopped and the log says so: fix the cause and rerun, or
   `docker compose start app`.
4. Open the app. Devices whose sessions are in the dump stay logged in; others log in again.

## Server set-up checklist

1. Buy the domain and pick the app hostname.
2. Create the VPS (see [Server layout](#server-layout)): SSH key, firewall 22/80/443, unattended
   security upgrades, Docker Engine + Compose plugin. Set the host time zone to `TZ`.
3. DNS: A (and AAAA) record for the hostname → VPS IP.
4. GHCR: after the first image push, make the package public, or `docker login ghcr.io` with a
   read-only token on the server.
5. Copy `deploy/` to the server; create `.env` from `.env.example` with real values (strong
   `POSTGRES_PASSWORD`, `DOMAIN`, `ACME_EMAIL`).
6. Storage Box in Helsinki: create a sub-account with an SSH key for backups; put the private key
   at `BACKUP_SSH_KEY`, add the host key to `BACKUP_SSH_KNOWN_HOSTS`
   (`ssh-keyscan -p 23 <host> >> ~/.ssh/known_hosts`), set `BACKUP_TARGET` and
   `BACKUP_SSH_PORT=23`, run `deploy/backup.sh` once by hand, then install the cron entry.
7. First deploy: `docker compose pull && docker compose up -d`; check HTTPS, register the first
   Member at `/setup`, install the app on each phone, send the Invite to the second Member.
8. Restore drill: restore last night's dump into a scratch database (see [Restore](#restore)).
9. GitHub: protect `main`, require the CI checks, allow Actions to write packages.
