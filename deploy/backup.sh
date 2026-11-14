#!/usr/bin/env bash
# Nightly database backup (spec #5, Backups). Dumps the database with pg_dump (custom format) inside
# the running `postgres` container, then for each target in BACKUP_REMOTES: uploads it encrypted
# (with BACKUP_PASSPHRASE) as family-YYYYMMDDTHHMMSSZ.dump (UTC; stored as `.dump.bin`) and deletes
# dumps there older than BACKUP_RETENTION_DAYS (default 90). Uploads go through rclone in a
# container; see backup-common.sh for the settings.
#
# A failing target doesn't stop the others: every target is tried, then the script exits non-zero
# and logs "backup failed: <remote>" on stderr for each one that failed.
#
# Installed by the operator as a host cron entry at BACKUP_TIME in the server's TZ; print the
# entry with `deploy/backup.sh --cron-entry` (see that function below).
set -euo pipefail

# shellcheck source=deploy/backup-common.sh
. "$(dirname "$0")/backup-common.sh"

# Prints the crontab line for BACKUP_TIME (HH:MM). Cron uses the host's time zone, so the host
# must run in TZ (`timedatectl set-timezone Europe/Berlin`). Install with
#
#   (crontab -l 2>/dev/null; deploy/backup.sh --cron-entry) | crontab -
cron_entry() {
  local time hour minute
  time="$(setting BACKUP_TIME 03:30)"
  [[ "$time" =~ ^([01]?[0-9]|2[0-3]):([0-5][0-9])$ ]] || {
    log "BACKUP_TIME must be HH:MM (got '${time}')"
    return 1
  }
  hour="$((10#${BASH_REMATCH[1]}))"
  minute="$((10#${BASH_REMATCH[2]}))"
  echo "$minute $hour * * * $deploy_dir/backup.sh >>$deploy_dir/backup.log 2>&1"
}

# The UTC timestamp (as in dump names) BACKUP_RETENTION_DAYS ago; GNU date on the server, BSD
# date on macOS.
cutoff() {
  local days="$1"
  date -u -d "-$days days" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -v "-${days}d" +%Y%m%dT%H%M%SZ
}

dump_database() {
  name="family-$(date -u +%Y%m%dT%H%M%SZ).dump"
  log "dumping database to $name"
  # shellcheck disable=SC2016 # expanded by the container's shell
  compose exec -T postgres sh -c 'exec pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$work/$name"
  [ -s "$work/$name" ] || { log "pg_dump produced an empty file"; return 1; }
}

# upload REMOTE: the dump to one target, then prune that target.
upload() {
  local remote="$1" old
  # Upload under a temporary name and rename, so a broken upload never looks like a dump.
  log "uploading $name ($(wc -c <"$work/$name" | tr -d ' ') bytes) to $remote"
  CRYPT_REMOTE="$remote" rclone copyto "/work/$name" ":crypt:$name.part"
  CRYPT_REMOTE="$remote" rclone moveto ":crypt:$name.part" ":crypt:$name"

  old="$(list_dumps "$remote" | awk -v cutoff="family-$(cutoff "$days").dump" '$0 < cutoff')"
  if [ -n "$old" ]; then
    log "pruning dumps on $remote older than $days days: $(echo "$old" | tr '\n' ' ')"
    echo "$old" | CRYPT_REMOTE="$remote" rclone delete :crypt: --files-from -
  fi
  log "backup done: $name on $remote"
}

if [ "${1:-}" = "--cron-entry" ]; then
  cron_entry
  exit
fi

work="$(mktemp -d)"
# Any failure, here or in a target below, ends with a "backup failed" line.
trap 'status=$?; rm -rf "$work"; [ "$status" -eq 0 ] || log "backup failed (exit $status)"' EXIT

days="$(setting BACKUP_RETENTION_DAYS 90)"
[[ "$days" =~ ^[0-9]+$ ]] || { log "BACKUP_RETENTION_DAYS must be a number (got '${days}')"; exit 1; }
remotes >"$work/remotes"
load_passphrase
dump_database

failed=0
while read -r remote; do
  # A plain subshell keeps `set -e` active inside upload (an `if` or `||` would turn it off).
  set +e
  (
    set -e
    upload "$remote"
  ) </dev/null
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    log "backup failed: $remote (exit $status)"
    failed=1
  fi
done <"$work/remotes"
exit "$failed"
