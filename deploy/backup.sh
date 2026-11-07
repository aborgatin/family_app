#!/usr/bin/env bash
# Nightly database backup (spec #5, Backups). Dumps the database with pg_dump (custom format) inside
# the running `postgres` container, uploads it over SFTP with the dedicated backup key to
# BACKUP_TARGET (user@host:path on the Storage Box) as family-YYYYMMDDTHHMMSSZ.dump (UTC), then
# deletes dumps there older than BACKUP_RETENTION_DAYS (default 90).
#
# Settings (in deploy/.env): BACKUP_TARGET, BACKUP_RETENTION_DAYS, BACKUP_SSH_KEY (default
# ~/.ssh/family_backup), BACKUP_SSH_PORT (default 22), BACKUP_SSH_KNOWN_HOSTS (default
# ~/.ssh/known_hosts; the target's host key must already be in it).
#
# Exits non-zero and logs a "backup failed" line on stderr when any step fails.
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

backup() {
  local days name dump old
  days="$(setting BACKUP_RETENTION_DAYS 90)"
  [[ "$days" =~ ^[0-9]+$ ]] || { log "BACKUP_RETENTION_DAYS must be a number (got '${days}')"; return 1; }
  parse_target

  name="family-$(date -u +%Y%m%dT%H%M%SZ).dump"
  dump="$work/$name"
  log "dumping database to $name"
  # shellcheck disable=SC2016 # expanded by the container's shell
  compose exec -T postgres sh -c 'exec pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$dump"
  [ -s "$dump" ] || { log "pg_dump produced an empty file"; return 1; }

  # Upload under a temporary name and rename, so a broken upload never looks like a dump.
  log "uploading $name ($(wc -c <"$dump" | tr -d ' ') bytes) to $target_host:$target_dir"
  printf '%s\n' "-mkdir $target_dir" "put $dump $target_dir/$name.part" \
    "rename $target_dir/$name.part $target_dir/$name" | target_sftp >/dev/null

  old="$(list_dumps | awk -v cutoff="family-$(cutoff "$days").dump" '$0 < cutoff')"
  if [ -n "$old" ]; then
    log "pruning dumps older than $days days: $(echo "$old" | tr '\n' ' ')"
    echo "$old" | sed "s|^|rm $target_dir/|" | target_sftp >/dev/null
  fi
  log "backup done: $name"
}

if [ "${1:-}" = "--cron-entry" ]; then
  cron_entry
  exit
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# A plain subshell keeps `set -e` active inside backup (an `if` or `||` would turn it off).
set +e
(
  set -e
  backup
)
status=$?
if [ "$status" -ne 0 ]; then
  log "backup failed (exit $status)"
  exit 1
fi
