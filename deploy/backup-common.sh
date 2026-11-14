# Shared by backup.sh and restore.sh; sourced, not run.
#
# Settings come from the process environment first, then from the `.env` next to this file (or
# ENV_FILE), the same file docker compose reads. COMPOSE_PROJECT_NAME selects another Compose
# project (used by the tests); by default it is the `name:` in docker-compose.yml.

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${ENV_FILE:-$deploy_dir/.env}"

log() {
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') $(basename "$0"): $*" >&2
}

# setting KEY [DEFAULT]: the value from the environment, else the last KEY= line of the env file.
setting() {
  local key="$1" value
  if [ -n "${!key:-}" ]; then
    echo "${!key}"
    return
  fi
  value="$(grep -E "^${key}=" "$env_file" 2>/dev/null | tail -n1 | cut -d= -f2-)" || true
  value="${value%\"}"
  value="${value#\"}"
  echo "${value:-${2:-}}"
}

compose() {
  docker compose --project-directory "$deploy_dir" --env-file "$env_file" \
    -f "$deploy_dir/docker-compose.yml" "$@"
}

# rclone (in its own container, so nothing is installed on the host) reaches every backup target.
# BACKUP_REMOTES lists them as rclone `remote:path` (remotes defined in BACKUP_RCLONE_CONFIG,
# default rclone.conf next to this file). Each is wrapped in rclone's crypt backend with
# BACKUP_PASSPHRASE, so a target only ever holds encrypted dumps (`<name>.bin`); names stay
# readable. BACKUP_DOCKER_NETWORK runs rclone on that Docker network (used by the tests).
rclone_image="rclone/rclone:1.75.2"

remotes() {
  local list
  list="$(setting BACKUP_REMOTES)"
  [ -n "$list" ] || { log "BACKUP_REMOTES is empty (e.g. BACKUP_REMOTES=\"b2:family-backups r2:family-backups\")"; return 1; }
  # shellcheck disable=SC2086 # a space-separated list
  printf '%s\n' $list
}

# rclone ARGS…: runs rclone with the config and the work directory ($work, at /work) mounted. With
# CRYPT_REMOTE set, the remote `:crypt:` is that remote, encrypted with BACKUP_PASSPHRASE.
rclone() {
  local config network
  config="$(setting BACKUP_RCLONE_CONFIG "$deploy_dir/rclone.conf")"
  [ -r "$config" ] || { log "rclone config $config is missing or unreadable"; return 1; }
  network="$(setting BACKUP_DOCKER_NETWORK)"
  docker run --rm -i --user "$(id -u):$(id -g)" ${network:+--network "$network"} \
    -e HOME=/tmp -e RCLONE_CONFIG=/config/rclone.conf \
    -e RCLONE_CRYPT_REMOTE="${CRYPT_REMOTE:-}" -e RCLONE_CRYPT_PASSWORD="${crypt_password:-}" \
    -e RCLONE_CRYPT_FILENAME_ENCRYPTION=off -e RCLONE_CRYPT_DIRECTORY_NAME_ENCRYPTION=false \
    -v "$config:/config/rclone.conf:ro" -v "$work:/work" \
    "$rclone_image" --contimeout 20s --timeout 60s --retries 2 --low-level-retries 3 "$@"
}

# Sets crypt_password: BACKUP_PASSPHRASE in rclone's obscured form, which its crypt backend takes.
load_passphrase() {
  local passphrase
  passphrase="$(setting BACKUP_PASSPHRASE)"
  [ -n "$passphrase" ] || { log "BACKUP_PASSPHRASE is empty"; return 1; }
  crypt_password="$(printf '%s' "$passphrase" | rclone obscure -)"
}

# Dump file names on one remote, oldest first. Dumps are named family-YYYYMMDDTHHMMSSZ.dump (UTC),
# so name order is time order.
list_dumps() {
  local names
  names="$(CRYPT_REMOTE="$1" rclone lsf --files-only :crypt:)" || return 1
  printf '%s\n' "$names" | { grep -E '^family-[0-9]{8}T[0-9]{6}Z\.dump$' || true; } | sort
}
