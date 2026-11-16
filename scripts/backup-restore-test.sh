#!/usr/bin/env bash
# Backup and restore test (spec #5, Backups): runs the production Compose stack from /deploy (app +
# PostgreSQL 18; Caddy is not started, so no host ports are needed) and a throwaway SFTP server
# whose folders stand in for the backup targets (B2 and R2 in production; rclone reaches every kind
# the same way), then drives deploy/backup.sh and deploy/restore.sh the way the operator does:
# create data, back up, wipe the database volume, restore, check the data is back.
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
network="family-app-backup-net-$$"
passphrase="backup-test-passphrase"
rclone_image="$(sed -n 's/^rclone_image="\(.*\)"$/\1/p' "$deploy_dir/backup-common.sh")"

compose() {
  docker compose --project-name "$project" --project-directory "$deploy_dir" \
    --env-file "$work/.env" -f "$deploy_dir/docker-compose.yml" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$target_name" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
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

# The SFTP server: a dedicated user with only our public key. rclone reaches it on its own Docker
# network (BACKUP_DOCKER_NETWORK) as `target:<folder>`.
start_target() {
  ssh-keygen -q -t ed25519 -N '' -C family-backup-test -f "$work/backup_key"
  docker build -q -t "$target_image" - >/dev/null <<'EOF'
FROM alpine:3.22
RUN apk add --no-cache openssh-server openssh-sftp-server \
 && adduser -D backup && passwd -u backup >/dev/null \
 && ssh-keygen -A \
 && mkdir -p /home/backup/.ssh \
 && chown -R backup:backup /home/backup
CMD ["/bin/sh", "-c", "cat /run/authorized_keys > /home/backup/.ssh/authorized_keys && chown backup:backup /home/backup/.ssh/authorized_keys && chmod 600 /home/backup/.ssh/authorized_keys && exec /usr/sbin/sshd -D -e"]
EOF
  docker network create "$network" >/dev/null
  docker run -d --name "$target_name" --network "$network" \
    -v "$work/backup_key.pub:/run/authorized_keys:ro" "$target_image" >/dev/null
  for _ in $(seq 1 30); do
    if docker exec "$target_name" nc -z 127.0.0.1 22 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  fail "SFTP target did not start"
}

# rclone.conf: `target` is the SFTP server, `broken` a port on it where nothing listens.
write_rclone_conf() {
  local key_pem
  key_pem="$(awk '{printf "%s\\n", $0}' "$work/backup_key")"
  {
    printf '[target]\ntype = sftp\nhost = %s\nuser = backup\nkey_pem = %s\nknown_hosts_file = none\n\n' \
      "$target_name" "$key_pem"
    printf '[broken]\ntype = sftp\nhost = %s\nport = 1\nuser = backup\nkey_pem = %s\nknown_hosts_file = none\n' \
      "$target_name" "$key_pem"
  } >"$work/rclone.conf"
  chmod 600 "$work/rclone.conf"
}

write_env() {
  cat >"$work/.env" <<EOF
DOMAIN=localhost
ACME_EMAIL=ops@example.com
APP_IMAGE_TAG=$tag
POSTGRES_DB=family
POSTGRES_USER=family
POSTGRES_PASSWORD=backup-test
BACKUP_REMOTES="target:first target:second"
BACKUP_RCLONE_CONFIG=$work/rclone.conf
BACKUP_PASSPHRASE=$passphrase
BACKUP_DOCKER_NETWORK=$network
BACKUP_RETENTION_DAYS=90
BACKUP_TIME=03:30
TZ=Europe/Berlin
EOF
  cat "$deploy_dir/../scripts/lib/dev-secrets.env" >>"$work/.env"
}

# Files in one folder on the SFTP server, as stored (encrypted dumps end in .bin).
target_ls() {
  docker exec "$target_name" sh -c "ls -1 /home/backup/$1 2>/dev/null" || true
}

# An encrypted file named $2 in folder $1, put there through rclone's crypt as backup.sh does.
target_put_dump() {
  local password
  password="$(printf '%s' "$passphrase" | docker run --rm -i "$rclone_image" obscure -)"
  echo fake >"$work/fake.dump"
  docker run --rm --user "$(id -u):$(id -g)" --network "$network" -e HOME=/tmp \
    -e RCLONE_CONFIG=/work/rclone.conf -e RCLONE_CRYPT_REMOTE="target:$1" \
    -e RCLONE_CRYPT_PASSWORD="$password" -e RCLONE_CRYPT_FILENAME_ENCRYPTION=off \
    -v "$work:/work" "$rclone_image" copyto /work/fake.dump ":crypt:$2"
}

target_put_plain() {
  docker exec -u backup "$target_name" sh -c "mkdir -p /home/backup/$1 && echo fake > /home/backup/$1/$2"
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
write_rclone_conf
write_env
start_stack

psql_value "CREATE TABLE backup_test_marker (note text); INSERT INTO backup_test_marker VALUES ('kept');" >/dev/null ||
  fail "could not write a marker row"
migrations="$(psql_value "SELECT string_agg(version, ',' ORDER BY installed_rank) FROM flyway_schema_history")"

# Pruning: a dump older than BACKUP_RETENTION_DAYS goes, a recent one and unrelated files stay.
recent="family-$(date -u +%Y%m%dT%H%M%SZ | sed 's/T.*/T000000Z/').dump"
target_put_dump first family-20200101T033000Z.dump >/dev/null 2>&1 || fail "could not put an old dump on the target"
target_put_dump first "$recent" >/dev/null 2>&1 || fail "could not put a recent dump on the target"
target_put_plain first notes.txt

backup >"$work/backup.log" 2>&1 || { cat "$work/backup.log" >&2; fail "backup.sh exited non-zero"; }
first="$(target_ls first)"
new_dump="$(echo "$first" | sed -n 's/\.bin$//p' | grep -E '^family-[0-9]{8}T[0-9]{6}Z\.dump$' | grep -vx "$recent" | grep -v '^family-2020' || true)"
[ -n "$new_dump" ] || { cat "$work/backup.log" >&2; fail "no new dump on the first target (has: $first)"; }
target_ls second | grep -x "$new_dump.bin" >/dev/null || fail "no $new_dump on the second target"
echo "ok   backup uploads the dump to every target in BACKUP_REMOTES ($new_dump)"
[ "$(docker exec "$target_name" head -c 5 "/home/backup/first/$new_dump.bin")" != PGDMP ] ||
  fail "the dump on the target is not encrypted"
if docker exec "$target_name" grep -q backup_test_marker "/home/backup/first/$new_dump.bin"; then
  fail "the dump on the target contains plain text"
fi
echo "ok   dumps on the targets are encrypted"
echo "$first" | grep -x family-20200101T033000Z.dump.bin >/dev/null && fail "old dump was not pruned"
echo "$first" | grep -x "$recent.bin" >/dev/null || fail "recent dump was pruned"
echo "$first" | grep -x notes.txt >/dev/null || fail "unrelated file was pruned"
echo "ok   backup prunes dumps older than BACKUP_RETENTION_DAYS, keeps the rest"

# Failure: an unreachable target makes the backup exit non-zero with a log line naming it, and the
# other targets still get the dump.
if BACKUP_REMOTES="broken:first target:third" backup >"$work/fail.log" 2>&1; then
  fail "backup.sh exited 0 with an unreachable target"
fi
grep -q 'backup failed: broken:first' "$work/fail.log" ||
  { cat "$work/fail.log" >&2; fail "no 'backup failed: broken:first' log line"; }
target_ls third | grep -E '^family-[0-9]{8}T[0-9]{6}Z\.dump\.bin$' >/dev/null ||
  { cat "$work/fail.log" >&2; fail "the reachable target got no dump"; }
echo "ok   an unreachable target fails the backup, logged by name; the others still get the dump"

[ "$(backup --cron-entry)" = "30 3 * * * $deploy_dir/backup.sh >>$deploy_dir/backup.log 2>&1" ] ||
  fail "unexpected cron entry: $(backup --cron-entry)"
echo "ok   cron entry runs at BACKUP_TIME"

listed="$(restore --list)" || fail "restore --list failed"
echo "$listed" | grep -x "target:first $new_dump" >/dev/null ||
  fail "restore --list does not show $new_dump on target:first (got: $listed)"
echo "$listed" | grep -x "target:second $new_dump" >/dev/null ||
  fail "restore --list does not show $new_dump on target:second (got: $listed)"
echo "ok   restore --list shows the dumps on every target"

# The wrong passphrase can't read a dump.
if BACKUP_PASSPHRASE=wrong restore --scratch family_wrong_passphrase "$new_dump" >"$work/wrong.log" 2>&1; then
  fail "restore succeeded with the wrong BACKUP_PASSPHRASE"
fi
echo "ok   restore fails with the wrong BACKUP_PASSPHRASE"

# Restore into a scratch database leaves the live one alone; --from picks the target.
restore --from target:second --scratch family_restore_check "$new_dump" >"$work/scratch.log" 2>&1 ||
  { cat "$work/scratch.log" >&2; fail "restore into a scratch database failed"; }
grep -q "downloading $new_dump from target:second" "$work/scratch.log" ||
  { cat "$work/scratch.log" >&2; fail "restore --from did not download from target:second"; }
[ "$(psql_value 'SELECT note FROM backup_test_marker' family_restore_check)" = "kept" ] ||
  fail "scratch database lacks the backed-up data"
echo "ok   restore into a scratch database, from the target named with --from"

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
[ "$(psql_value "SELECT string_agg(version, ',' ORDER BY installed_rank) FROM flyway_schema_history")" = "$migrations" ] ||
  fail "Flyway history differs after restore"
compose up -d --wait --wait-timeout 180 app >/dev/null 2>&1 || fail "app is not healthy after restore"
echo "ok   wipe, restore: data is back and the app is healthy"

echo "backup/restore test passed"
