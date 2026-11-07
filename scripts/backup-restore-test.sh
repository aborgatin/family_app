#!/usr/bin/env bash
# Backup and restore test (spec #5, Backups): runs the production Compose stack from /deploy (app +
# PostgreSQL 18; Caddy is not started, so no host ports are needed) and a throwaway SFTP server
# standing in for the Storage Box, then drives deploy/backup.sh and deploy/restore.sh the way the
# operator does: create data, back up, wipe the database volume, restore, check the data is back.
#
#   scripts/backup-restore-test.sh <app-image-tag>
#
# The argument is the APP_IMAGE_TAG; the image must exist locally or on GHCR.
set -euo pipefail

tag="${1:?usage: $0 <app-image-tag>}"
deploy_dir="$(cd "$(dirname "$0")/../deploy" && pwd)"
work="$(mktemp -d)"
project="family-app-backup-test-$$"
target_name="family-app-backup-target-$$"
target_image="family-app-backup-target:test"

compose() {
  docker compose --project-name "$project" --project-directory "$deploy_dir" \
    --env-file "$work/.env" -f "$deploy_dir/docker-compose.yml" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$target_name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  echo "--- compose logs ---" >&2
  compose logs --no-color --tail 50 >&2 || true
  exit 1
}

psql_value() {
  compose exec -T postgres psql -U family -d "${2:-family}" -tAc "$1"
}

# The SFTP target: a dedicated user with only our public key, like a Storage Box sub-account.
start_target() {
  ssh-keygen -q -t ed25519 -N '' -C family-backup-test -f "$work/backup_key"
  docker build -q -t "$target_image" - >/dev/null <<'EOF'
FROM alpine:3.22
RUN apk add --no-cache openssh-server openssh-sftp-server \
 && adduser -D backup && passwd -u backup >/dev/null \
 && ssh-keygen -A \
 && mkdir -p /home/backup/.ssh /home/backup/backups \
 && chown -R backup:backup /home/backup
CMD ["/bin/sh", "-c", "cat /run/authorized_keys > /home/backup/.ssh/authorized_keys && chown backup:backup /home/backup/.ssh/authorized_keys && chmod 600 /home/backup/.ssh/authorized_keys && exec /usr/sbin/sshd -D -e"]
EOF
  docker run -d --name "$target_name" -p 127.0.0.1::22 \
    -v "$work/backup_key.pub:/run/authorized_keys:ro" "$target_image" >/dev/null
  target_port="$(docker port "$target_name" 22/tcp | head -n1 | sed 's/.*://')"
  for _ in $(seq 1 30); do
    if ssh-keyscan -p "$target_port" 127.0.0.1 >"$work/known_hosts" 2>/dev/null && [ -s "$work/known_hosts" ]; then
      return 0
    fi
    sleep 1
  done
  fail "SFTP target did not start"
}

target_ls() {
  docker exec "$target_name" ls -1 /home/backup/backups
}

target_touch() {
  docker exec -u backup "$target_name" sh -c "echo fake > /home/backup/backups/$1"
}

write_env() {
  cat >"$work/.env" <<EOF
DOMAIN=localhost
ACME_EMAIL=ops@example.com
APP_IMAGE_TAG=$tag
POSTGRES_DB=family
POSTGRES_USER=family
POSTGRES_PASSWORD=backup-test
BACKUP_TARGET=backup@127.0.0.1:backups
BACKUP_SSH_PORT=$target_port
BACKUP_SSH_KEY=$work/backup_key
BACKUP_SSH_KNOWN_HOSTS=$work/known_hosts
BACKUP_RETENTION_DAYS=90
BACKUP_TIME=03:30
TZ=Europe/Berlin
EOF
}

# The scripts run as the operator runs them, pointed at this test's .env and Compose project.
backup() {
  ENV_FILE="$work/.env" COMPOSE_PROJECT_NAME="$project" "$deploy_dir/backup.sh" "$@"
}

restore() {
  ENV_FILE="$work/.env" COMPOSE_PROJECT_NAME="$project" "$deploy_dir/restore.sh" "$@"
}

start_stack() {
  compose up -d --wait --wait-timeout 180 app >"$work/up.log" 2>&1 ||
    { tail -5 "$work/up.log" >&2; fail "app and postgres did not become healthy"; }
}

echo "starting SFTP target and stack ($project, image tag $tag)"
start_target
write_env
start_stack

psql_value "CREATE TABLE backup_test_marker (note text); INSERT INTO backup_test_marker VALUES ('kept');" >/dev/null ||
  fail "could not write a marker row"

# Pruning: a dump older than BACKUP_RETENTION_DAYS goes, a recent one and unrelated files stay.
recent="family-$(date -u +%Y%m%dT%H%M%SZ | sed 's/T.*/T000000Z/').dump"
target_touch family-20200101T033000Z.dump
target_touch "$recent"
target_touch notes.txt

backup >"$work/backup.log" 2>&1 || { cat "$work/backup.log" >&2; fail "backup.sh exited non-zero"; }
dumps="$(target_ls)"
new_dump="$(echo "$dumps" | grep -E '^family-[0-9]{8}T[0-9]{6}Z\.dump$' | grep -vx "$recent" | grep -v '^family-2020' || true)"
[ -n "$new_dump" ] || fail "no new dump on the target (has: $dumps)"
echo "ok   backup uploads a dump to BACKUP_TARGET ($new_dump)"
echo "$dumps" | grep -qx family-20200101T033000Z.dump && fail "old dump was not pruned"
echo "$dumps" | grep -qx "$recent" || fail "recent dump was pruned"
echo "$dumps" | grep -qx notes.txt || fail "unrelated file was pruned"
echo "ok   backup prunes dumps older than BACKUP_RETENTION_DAYS, keeps the rest"

# Failure: an unreachable target makes the backup exit non-zero with a log line.
if BACKUP_SSH_PORT=1 backup >"$work/fail.log" 2>&1; then
  fail "backup.sh exited 0 with an unreachable target"
fi
grep -q 'backup failed' "$work/fail.log" || { cat "$work/fail.log" >&2; fail "no 'backup failed' log line"; }
echo "ok   backup exits non-zero and logs 'backup failed' when the upload fails"

[ "$(backup --cron-entry)" = "30 3 * * * $deploy_dir/backup.sh >>$deploy_dir/backup.log 2>&1" ] ||
  fail "unexpected cron entry: $(backup --cron-entry)"
echo "ok   cron entry runs at BACKUP_TIME"

restore --list | grep -qx "$new_dump" || fail "restore --list does not show $new_dump"
echo "ok   restore --list shows the dumps on BACKUP_TARGET"

# Restore into a scratch database leaves the live one alone.
restore --scratch family_restore_check "$new_dump" >"$work/scratch.log" 2>&1 ||
  { cat "$work/scratch.log" >&2; fail "restore into a scratch database failed"; }
[ "$(psql_value 'SELECT note FROM backup_test_marker' family_restore_check)" = "kept" ] ||
  fail "scratch database lacks the backed-up data"
echo "ok   restore into a scratch database"

# Wipe: lose the database volume entirely, as if the server were rebuilt.
compose down --volumes >/dev/null 2>&1 || fail "compose down failed"
start_stack
[ -z "$(psql_value "SELECT to_regclass('backup_test_marker')")" ] || fail "database was not wiped"

# Overwriting the live database asks first; anything but the database name aborts.
if echo no | restore "$new_dump" >"$work/abort.log" 2>&1; then
  fail "restore went ahead without confirmation"
fi
grep -q 'not confirmed' "$work/abort.log" || { cat "$work/abort.log" >&2; fail "restore did not abort for lack of confirmation"; }
[ -z "$(psql_value "SELECT to_regclass('backup_test_marker')")" ] || fail "aborted restore changed the database"
echo "ok   restore asks for confirmation before overwriting the live database"

echo family | restore "$new_dump" >"$work/restore.log" 2>&1 ||
  { cat "$work/restore.log" >&2; fail "restore into the live database failed"; }
[ "$(psql_value 'SELECT note FROM backup_test_marker')" = "kept" ] || fail "data is not back after restore"
compose up -d --wait --wait-timeout 180 app >/dev/null 2>&1 || fail "app is not healthy after restore"
echo "ok   wipe, restore: data is back and the app is healthy"

echo "backup/restore test passed"
