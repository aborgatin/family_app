#!/usr/bin/env bash
# Restores a dump made by backup.sh into the running stack (spec #5, Backups).
#
#   deploy/restore.sh --list                          "<remote> <dump>" for each target, oldest first
#   deploy/restore.sh [--from <remote>] <dump>        replace the live database (asks first)
#   deploy/restore.sh [--from <remote>] --scratch <db> <dump>   restore into a new database <db>
#
# <dump> is a local pg_dump file, or the name of a dump on a target (as --list prints it), which is
# downloaded and decrypted first: from <remote>, or else from the first of BACKUP_REMOTES that has
# it. Same settings as backup.sh (deploy/.env).
#
# Replacing the live database stops the app, drops and recreates the database, restores the dump
# and starts the app again. Everything written since the dump is lost, so it asks the operator to
# type the database name to confirm. A scratch restore leaves the live database and the app alone,
# for checking a dump; drop it afterwards with
#
#   docker compose exec postgres sh -c 'dropdb -U "$POSTGRES_USER" <db>'
set -euo pipefail

# shellcheck source=deploy/backup-common.sh
. "$(dirname "$0")/backup-common.sh"

usage() {
  sed -n '4,6p' "$0" | sed 's/^# *//' >&2
  exit 2
}

# Runs a command in the postgres container as POSTGRES_USER; "$@" is appended to the shell
# command, so callers quote values themselves.
in_postgres() {
  compose exec -T postgres sh -c "$*" </dev/null
}

# Echoes a local path to the chosen dump, downloading it when it is a name: from $from, or else
# from the first remote that has it.
fetch_dump() {
  local dump="$1" remote
  if [ -f "$dump" ]; then
    echo "$dump"
    return
  fi
  [[ "$dump" =~ ^family-[0-9]{8}T[0-9]{6}Z\.dump$ ]] || { log "no such file or dump name: $dump"; return 1; }
  load_passphrase
  for remote in ${from:-$(remotes)}; do
    log "downloading $dump from $remote"
    if CRYPT_REMOTE="$remote" rclone copyto ":crypt:$dump" "/work/$dump" </dev/null && [ -s "$work/$dump" ]; then
      echo "$work/$dump"
      return
    fi
    log "could not download $dump from $remote"
  done
  log "$dump is on none of the targets"
  return 1
}

# Every target's dumps; a target that can't be listed is logged and the others are still listed.
list_all() {
  local remote dumps failed=0
  load_passphrase
  for remote in $(remotes); do
    if dumps="$(list_dumps "$remote" </dev/null)"; then
      [ -z "$dumps" ] || printf '%s\n' "$dumps" | sed "s|^|$remote |"
    else
      log "could not list $remote"
      failed=1
    fi
  done
  return "$failed"
}

restore_into() {
  local db="$1" file="$2"
  log "restoring $(basename "$file") into database $db"
  # shellcheck disable=SC2016 # expanded by the container's shell
  compose exec -T postgres sh -c \
    'exec pg_restore --exit-on-error --single-transaction --no-owner -U "$POSTGRES_USER" -d "$1"' \
    restore "$db" <"$file"
}

scratch_restore() {
  local db="$1" file="$2" live
  live="$(live_db)"
  [[ "$db" =~ ^[a-z_][a-z0-9_]*$ ]] || { log "scratch database name must be [a-z_][a-z0-9_]*"; return 1; }
  [ "$db" != "$live" ] || { log "scratch database must not be the live database $db"; return 1; }
  in_postgres "createdb -U \"\$POSTGRES_USER\" $db"
  restore_into "$db" "$file"
  log "restored into scratch database $db; the live database is unchanged"
}

live_db() {
  # shellcheck disable=SC2016 # expanded by the container's shell
  in_postgres 'echo "$POSTGRES_DB"'
}

live_restore() {
  local file="$1" db answer
  db="$(live_db)"
  echo "This replaces database '$db' with $(basename "$file")." >&2
  echo "Everything written after that dump is lost, and the app is stopped meanwhile." >&2
  printf "Type the database name (%s) to continue: " "$db" >&2
  read -r answer || answer=""
  [ "$answer" = "$db" ] || { log "not confirmed; nothing changed"; return 1; }

  log "stopping the app"
  compose stop app
  # From here a failure leaves the app stopped; the log says so, and the restore can be rerun.
  trap 'log "restore failed; the app is stopped, rerun the restore or start it with: docker compose start app"; rm -rf "$work"' EXIT
  log "recreating database $db"
  in_postgres "dropdb -U \"\$POSTGRES_USER\" --force $db && createdb -U \"\$POSTGRES_USER\" $db"
  restore_into "$db" "$file"
  log "starting the app"
  compose start app
  trap 'rm -rf "$work"' EXIT
  log "restore done"
}

from=""
if [ "${1:-}" = "--from" ]; then
  [ $# -ge 2 ] || usage
  from="$2"
  shift 2
fi
[ $# -ge 1 ] || usage
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

case "$1" in
  --list)
    [ $# -eq 1 ] || usage
    list_all
    ;;
  --scratch)
    [ $# -eq 3 ] || usage
    file="$(fetch_dump "$3")"
    scratch_restore "$2" "$file"
    ;;
  -*) usage ;;
  *)
    [ $# -eq 1 ] || usage
    file="$(fetch_dump "$1")"
    live_restore "$file"
    ;;
esac
