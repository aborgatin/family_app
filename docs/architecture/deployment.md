# Deployment

How the app is built, shipped and run. One installation per Family (ADR-0004). The sources are
`Dockerfile`, `.github/workflows/ci.yml`, `deploy/` and `scripts/`; the header comments of the
scripts are authoritative for their options.

## Contents

Read this index, then only the sections for your area (`scripts/check-doc-index.sh` keeps it in
step with the headings).

- [Image](#image): the multi-stage `Dockerfile`, what each stage builds
- [CI/CD](#cicd): the CI jobs, which run on a pull request, `scripts/check.sh` locally, image tags
- [Server layout](#server-layout): the VPS, the `deploy/` copy and `.env` on it
- [Compose services](#compose-services): the services of `deploy/docker-compose.yml`, logs, and the local dev database (`docker-compose.dev.yml`, `scripts/dev.sh`)
- [Caddy](#caddy): HTTPS, redirects, compression, headers in `deploy/Caddyfile`
- [Environment variables](#environment-variables): every `deploy/.env` setting and what reads it
- [Deploy and rollback](#deploy-and-rollback): pulling a new image, rolling back to a tag
- [Adding an Announcement to a release](#adding-an-announcement-to-a-release): the «Что нового» catalog, when an entry is sent, the empty-catalog-first rule
- [Password reset](#password-reset): the operator's one-time reset link
- [Push keys (VAPID)](#push-keys-vapid): generating the key pair push messages need, once per installation
- [Backups](#backups): `deploy/backup.sh`, the B2 and R2 targets, encryption, pruning, cron
- [Restore](#restore): `deploy/restore.sh`, listing and restoring a dump
- [Server set-up checklist](#server-set-up-checklist): first-time set-up of the server, in order

## Image

`Dockerfile` (repo root) builds everything from source; `docker build .` needs no prior local build.

1. `node:22-bookworm-slim`: `npm ci` and `npm run build` in `web/` → `web/dist`.
2. `eclipse-temurin:21-jdk-noble`: copies `web/dist` into `src/main/resources/static/` and
   `web/src/shared/palette/` (read by `build.gradle.kts`), then `./gradlew bootJar`.
3. `eclipse-temurin:21-jre-noble`: runs `java -jar /app/app.jar` as the non-root user `app`, port 8080.

One image serves the API and the web bundle. Program arguments after the image name are passed to
the app, which is how operator commands run ([Password reset](#password-reset)). `.dockerignore`
excludes `.git`, `node_modules`, build output and `docs`.

Stages 1 and 2 run on the build machine's platform (`FROM --platform=$BUILDPLATFORM`), since the
bundle and the jar are the same on every CPU; stage 3 is built per target platform, linux/amd64 or
linux/arm64 (see `publish` in [CI/CD](#cicd)).

## CI/CD

`.github/workflows/ci.yml` runs on every pull request and on push to `main`. On a push to `main`
every job runs. On a pull request a **changes** job (`dorny/paths-filter`) decides which of
`backend`, `web`, `image` and `image-arm64` run, and each of them skips itself with `if:`:

| Job                    | Runs on a pull request when changed                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend`              | `backend/**`, `web/src/shared/palette/**` (the backend build copies the Child color palette), or `ci.yml`                                                                        |
| `web`                  | `web/**` or `ci.yml`                                                                                                                                                             |
| `image`, `image-arm64` | `backend/**`, `web/**`, `Dockerfile`, `.dockerignore`, `deploy/**`, `scripts/image-smoke-test.sh`, `scripts/deploy-stack-test.sh`, `scripts/backup-restore-test.sh`, or `ci.yml` |

`migrations` always runs. Never filter with workflow-level `paths:`: a skipped workflow leaves
required checks pending forever, while a skipped job counts as passed (#17). When a job starts
reading a file outside its folder, add that path to its filter. The `if:` conditions fail open: if
**changes** itself fails, `backend`, `web`, `image` and `image-arm64` run rather than skip, since a
skipped required check would let the PR merge untested.

- **migrations**: `scripts/check-migrations-test.sh` (the guard's self-test), then
  `scripts/check-migrations.sh` against the PR's target branch, or on push to `main` against the
  commit before the push (S5); then `scripts/check-error-codes-test.sh` and
  `scripts/check-error-codes.sh` (every server error code has a client message, I3). The job always
  runs, since a new code can come from either folder.
- **backend**: `spotlessCheck`, `compileJava compileTestJava` (Error Prone, `-Werror`), `test`
  (Testcontainers, Modulith).
- **web**: `npm ci`, `format:check`, `lint`, `typecheck`, `test`, `build`.
- **image**: builds the linux/amd64 image (`load: true`, GitHub Actions cache), then
  `scripts/image-smoke-test.sh`, `scripts/deploy-stack-test.sh`, `scripts/backup-restore-test.sh`.
- **image-arm64**: builds the linux/arm64 image natively on an ARM runner (`ubuntu-24.04-arm`) and
  runs `scripts/image-smoke-test.sh` on it. The VPS is ARM64.
- **publish**: only on push to `main`, after `image` and `image-arm64` pass. Logs in to GHCR with
  `GITHUB_TOKEN` (`packages: write`) and pushes one multi-platform image (linux/amd64 and
  linux/arm64) under both tags; `docker compose pull` picks the server's platform. Only the runtime
  stage is built for arm64 here, under QEMU (see [Image](#image)).

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
| `scripts/backup-restore-test.sh <tag>` | app + PostgreSQL with folders on a local SFTP container as the targets: backup to every target, encryption, pruning, one failing target, cron entry, `--list`, wrong passphrase, scratch restore, live restore after wiping the volume. No host ports |

## Server layout

- One Hetzner VPS (Cost-Optimized ARM64, 2 vCPU / 4 GB / 40 GB, Nuremberg, Ubuntu 26.04 LTS) with
  Docker Engine and the Compose plugin. Firewall: 22, 80, 443 (TCP) and 443 (UDP, HTTP/3).
- A copy of the repository's `deploy/` directory on the server, plus its `.env` (not in git). All
  `docker compose` commands below run in that directory. `backup.sh` and `restore.sh` find the
  Compose file and `.env` next to themselves, so they run from anywhere.
- Docker volumes: `postgres-data` (database), `caddy-data` (certificates, ACME account),
  `caddy-config`. Compose project name `family-app`.
- `deploy/backup.log`: output of the nightly backup cron job.
- `deploy/rclone.conf` (not in git, mode 600): the keys for the backup targets.
- Backblaze B2 (EU Central) and Cloudflare R2 (Eastern North America) each receive the nightly
  dumps, encrypted: two other companies at two other sites.

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
starts it, the backend and the web dev server in one command (flags in the header of that script
and backend.md "Local development"). `scripts/db.sh "<sql>"` runs a query against it (`-c <container>` for
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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`                             | required; see [Push keys](#push-keys-vapid) | app: signs and encrypts push messages                                  |
| `VAPID_SUBJECT`                                                     | `mailto:you@example.com` (required)        | app: the contact push services may use                                 |
| `REMINDER_MORNING_TIME`                                             | `09:00`                                    | app: when a Due date without a time is due, in `TZ`                    |
| `TZ`                                                                | `Europe/Berlin`                            | all containers; the host must use the same zone for cron               |
| `BACKUP_REMOTES`                                                    | `"b2:<bucket> r2:<bucket>"` (required)     | `backup.sh`, `restore.sh`: rclone targets, space-separated             |
| `BACKUP_PASSPHRASE`                                                 | required                                   | backup scripts: encrypts the dumps (rclone crypt)                      |
| `BACKUP_RCLONE_CONFIG`                                              | `deploy/rclone.conf`                       | backup scripts                                                         |
| `BACKUP_DOCKER_NETWORK`                                             | none                                       | backup scripts: Docker network for rclone (the test uses it)           |
| `BACKUP_RETENTION_DAYS`                                             | `90`                                       | `backup.sh`                                                            |
| `BACKUP_TIME`                                                       | `03:30`                                    | `backup.sh --cron-entry`                                               |

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

## Adding an Announcement to a release

An Announcement («Что нового», spec #120) is one push to every Member with the Notifications
switch on, telling them what is new. The catalog is
`backend/src/main/resources/announcements.json`, a JSON array in sending order:

```json
[
  {
    "id": "medical-cards",
    "title": "Новое: медицинские карты",
    "body": "Прививки, анализы и визиты к врачу для каждого ребёнка"
  }
]
```

- **Adding one**: append an entry to the array in the release's PR. `id` is any text never used
  before; `title` and `body` are the push's text exactly as written (Russian, no prefix); `url` is
  the app screen a tap opens, a path such as `/settings`, or left out for Home, `/`.
- **When it is sent**: on the first scheduler step after the new image starts (within a minute of
  `docker compose up -d`), once, with a 7-day TTL so a phone that is off for a few days still gets
  it. There are no quiet hours: deploy when a push is welcome. A Member whose switch is off then
  never gets it, even after turning it on. A failed push is not retried.
- **Once per installation**: the server records each `id` it has handled (`announcement_sent`,
  V19), so a restart, a second step, or a rollback followed by a redeploy does not send it again.
  Editing or deleting an entry that was already sent changes nothing; giving it a new `id` sends it
  again as a new Announcement.
- **A new installation** sends none of the catalog: its first scheduler step ever records every
  entry as handled. Only entries added after that are sent.
- **Empty catalog first**: the release that introduced Announcements shipped an **empty** catalog,
  so that every phone had a service worker that reads the `announcement` payload before the first
  one was sent. A future new kind of push message follows the same rule: ship the worker that reads
  it one release before anything sends it.

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

## Push keys (VAPID)

Push messages (Notifications, Reminders and Announcements) are signed with the installation's
VAPID key pair. The app does not start without `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and a
`mailto:` `VAPID_SUBJECT` (the message names the missing one), and Compose refuses to start without
them in `.env`. Generate the pair once, before the first deploy that needs it, with the image
itself:

```sh
docker run --rm ghcr.io/aborgatin/family_app:latest generate-vapid-keys
```

It prints `VAPID_PUBLIC_KEY=…` and `VAPID_PRIVATE_KEY=…` (P-256, base64url) and exits 0; it starts
nothing and needs no database or `.env`, so it is run with `docker run`, not `docker compose`
(Compose would refuse the `.env` without the keys). Paste the two lines into `.env` and set
`VAPID_SUBJECT=mailto:<your email>`. Keep the pair: browsers subscribe with the public key, so a new
pair silently stops every existing subscription until each device subscribes again. The private
key is a secret, like `POSTGRES_PASSWORD`. Local runs and the image tests use the fixed, non-secret
pair in `scripts/lib/dev-vapid-keys.env`, never in production.

## Backups

`deploy/backup.sh` (shared code in `deploy/backup-common.sh`):

1. `pg_dump --format=custom` inside the running `postgres` container.
2. For each target in `BACKUP_REMOTES`, in order: upload the dump as
   `family-YYYYMMDDTHHMMSSZ.dump` (UTC), first as `.part`, then renamed, so a broken upload never
   looks like a dump; then delete dumps there older than `BACKUP_RETENTION_DAYS` (by the date in
   the name; other files are left alone).

Uploads go through rclone (`rclone/rclone`, pinned in `backup-common.sh`) in a container, so
nothing is installed on the host; its remotes and keys are in `deploy/rclone.conf` (copy
`rclone.conf.example`). Every target is wrapped in rclone's crypt backend with `BACKUP_PASSPHRASE`:
dumps are encrypted and authenticated on the server, stored as `<name>.bin`, and only the names stay
readable. Without the passphrase no dump can be restored, so keep it, with `.env` and
`rclone.conf`, in a password manager. By hand: `rclone copy` through a `crypt` remote with
`filename_encryption = off` and the same passphrase.

A failing target doesn't stop the others. Any failure exits non-zero and logs `backup failed` on
stderr, with `backup failed: <remote>` for each target that failed.

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
deploy/restore.sh --list                  # "<remote> <dump>" on every target, oldest first
deploy/restore.sh --scratch <db> <dump>   # restore into a new database <db>; live data untouched
deploy/restore.sh <dump>                  # replace the live database (asks for confirmation)
```

`<dump>` is a local file or a dump name from `--list`, downloaded and decrypted first: from the
first target in `BACKUP_REMOTES` that has it, or from the one given with `--from <remote>` before
the other arguments (`deploy/restore.sh --from r2:family-backups --scratch restore_check <dump>`). Restores use
`pg_restore --exit-on-error --single-transaction --no-owner`.

**Check a backup (restore drill):**

1. `deploy/restore.sh --list` and pick the newest dump.
2. `deploy/restore.sh --from <remote> --scratch restore_check <dump>`, once for each target (drop
   `restore_check` in between), so both copies are known to work.
3. Check the Members and Children are there, and the row counts match the live database (run the
   same query with `-d "$POSTGRES_DB"`):
   `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d restore_check -c "SELECT email FROM member" -c "SELECT name FROM child" -c "SELECT (SELECT count(*) FROM list) lists, (SELECT count(*) FROM item) items"'`.
   To test with today's data rather than last night's, run `deploy/backup.sh` by hand first.
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
   `POSTGRES_PASSWORD`, `DOMAIN`, `ACME_EMAIL`, the VAPID pair from
   [Push keys](#push-keys-vapid) and `VAPID_SUBJECT`).
6. Backup targets: a Backblaze B2 bucket (EU Central) with an application key for that bucket only,
   and a Cloudflare R2 bucket with an API token for that bucket only. Fill `rclone.conf` from
   `rclone.conf.example` (`chmod 600`), set `BACKUP_REMOTES` and `BACKUP_PASSPHRASE`, run
   `deploy/backup.sh` once by hand, check `deploy/restore.sh --list`, then install the cron entry.
7. First deploy: `docker compose pull && docker compose up -d`; check HTTPS, register the first
   Member at `/setup`, install the app on each phone, send the Invite to the second Member.
8. Restore drill: restore last night's dump into a scratch database (see [Restore](#restore)).
9. GitHub: protect `main`, require the CI checks, allow Actions to write packages.
