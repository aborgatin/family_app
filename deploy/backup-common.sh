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

# BACKUP_TARGET is user@host:path (a Storage Box sub-account). Sets target_host and target_dir.
parse_target() {
  local target
  target="$(setting BACKUP_TARGET)"
  case "$target" in
    *@*:*) ;;
    *) log "BACKUP_TARGET must be user@host:path (got '${target}')"; return 1 ;;
  esac
  target_host="${target%%:*}"
  target_dir="${target#*:}"
  target_dir="${target_dir%/}"
  [ -n "$target_dir" ] || target_dir="."
}

# Runs sftp batch commands from stdin against the target with the dedicated backup key.
target_sftp() {
  local known_hosts
  known_hosts="$(setting BACKUP_SSH_KNOWN_HOSTS "$HOME/.ssh/known_hosts")"
  sftp -q -b - -P "$(setting BACKUP_SSH_PORT 22)" \
    -i "$(setting BACKUP_SSH_KEY "$HOME/.ssh/family_backup")" \
    -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 \
    -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" \
    "$target_host"
}

# Dump file names on the target, oldest first. Dumps are named family-YYYYMMDDTHHMMSSZ.dump (UTC),
# so name order is time order.
list_dumps() {
  echo "ls -1 $target_dir" | target_sftp | sed 's|.*/||' |
    grep -E '^family-[0-9]{8}T[0-9]{6}Z\.dump$' | sort
}
