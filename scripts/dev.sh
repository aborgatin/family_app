#!/usr/bin/env bash
# Starts the app locally from this checkout in one command, from any directory:
#
#   scripts/dev.sh              # dev PostgreSQL, backend (port 8080) and Vite (port 5173)
#   scripts/dev.sh --fresh-db   # the same, after backing up the dev database and emptying it
#
# Starts the `postgres` service of deploy/docker-compose.dev.yml (data kept in its volume), then the
# backend (`./gradlew bootRun` against it; Flyway migrates it to this branch's latest version) and
# Vite (`npm run dev --host`, proxying /api to the backend), with JDK 21 and Node 22 found as
# check.sh finds them. Waits until both answer, prints the local and network URLs and the log
# files, then runs until Ctrl-C (or a kill), which stops the backend and Vite; the database keeps
# running. An agent runs it in the background and reads the URLs from its output.
#
# --fresh-db backs the dev database up first, to a path it prints
# (~/.cache/family-app/dev-db-backups/), then drops everything in it. Restore a backup with:
#
#   docker exec -i "$(docker compose -f deploy/docker-compose.dev.yml ps -q postgres)" \
#     pg_restore -U family -d family --clean --if-exists <backup.dump
#
# COMPOSE_PROJECT_NAME and DEV_DB_PORT (default 5432) select another dev database, e.g. a throwaway
# one: COMPOSE_PROJECT_NAME=family-app-try DEV_DB_PORT=55432 scripts/dev.sh --fresh-db
set -euo pipefail

usage() {
  echo "usage: $0 [--fresh-db]" >&2
  exit 2
}
fresh=false
case "${1:-}" in
  "") ;;
  --fresh-db) fresh=true ;;
  *) usage ;;
esac
(($# <= 1)) || usage

root="$(cd "$(dirname "$0")/.." && pwd)"
compose=(docker compose -f "$root/deploy/docker-compose.dev.yml")
db_port="${DEV_DB_PORT:-5432}"
backend_port=8080
web_port=5173
logs="${XDG_CACHE_HOME:-$HOME/.cache}/family-app/dev-logs"

die() {
  echo "dev.sh: $*" >&2
  exit 1
}

# --- preconditions --------------------------------------------------------------------------------
docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop / the daemon and retry."
source "$root/scripts/lib/toolchain.sh"
use_node22 || die "Node 22+ not found on PATH or in /opt/homebrew/opt/node@22/bin (brew install node@22)."
use_jdk21 || die "JDK 21 not found: set JAVA_HOME or brew install openjdk@21."
for port in "$backend_port" "$web_port"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    die "port $port is already in use (another dev.sh?): $(lsof -nP -iTCP:"$port" -sTCP:LISTEN | sed -n 2p)"
  fi
done

# --- database -------------------------------------------------------------------------------------
echo "dev.sh: starting the dev database (port $db_port)"
DEV_DB_PORT="$db_port" "${compose[@]}" up -d --wait postgres >/dev/null
container="$("${compose[@]}" ps -q postgres)"
[[ -n "$container" ]] || die "the dev database container did not start"

psql_in_db() {
  docker exec -i "$container" sh -c 'exec psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

if $fresh; then
  backups="${XDG_CACHE_HOME:-$HOME/.cache}/family-app/dev-db-backups"
  mkdir -p "$backups"
  backup="$backups/dev-$(date +%Y%m%d-%H%M%S).dump"
  docker exec "$container" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$backup" ||
    die "backup failed; the database was not emptied"
  echo "dev.sh: backed up the dev database to $backup"
  psql_in_db -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  echo "dev.sh: emptied the dev database (the backend recreates it on start)"
fi

# --- backend and Vite -----------------------------------------------------------------------------
mkdir -p "$logs"
backend_log="$logs/backend.log"
web_log="$logs/web.log"

if [[ ! -f "$root/web/node_modules/.package-lock.json" || "$root/web/package-lock.json" -nt "$root/web/node_modules/.package-lock.json" ]]; then
  echo "dev.sh: npm ci in web/"
  (cd "$root/web" && npm ci --silent)
fi

# Each runs in its own process group (job control), so stopping it stops its children too
# (Gradle's JVM, Vite's esbuild).
set -m
pids=()
stop() {
  trap - EXIT INT TERM
  local pid
  for pid in "${pids[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  echo "dev.sh: stopped the backend and Vite (the dev database keeps running)"
}
trap stop EXIT
trap 'exit 130' INT TERM

echo "dev.sh: starting the backend (log: $backend_log)"
(cd "$root/backend" &&
  DATASOURCE_URL="jdbc:postgresql://localhost:$db_port/family" \
    DATASOURCE_USERNAME=family DATASOURCE_PASSWORD=family \
    exec ./gradlew bootRun --console=plain) >"$backend_log" 2>&1 &
pids+=($!)
backend_pid=$!

echo "dev.sh: starting Vite (log: $web_log)"
(cd "$root/web" && exec npm run dev -- --host --port "$web_port" --strictPort) >"$web_log" 2>&1 &
pids+=($!)
web_pid=$!

# --- wait until both answer -----------------------------------------------------------------------
answers() { curl -fsS -o /dev/null --max-time 2 "$1" 2>/dev/null; }
deadline=$((SECONDS + 300))
until answers "http://localhost:$backend_port/actuator/health" && answers "http://localhost:$web_port/"; do
  kill -0 "$backend_pid" 2>/dev/null || { tail -n 30 "$backend_log" >&2; die "the backend stopped (log: $backend_log)"; }
  kill -0 "$web_pid" 2>/dev/null || { tail -n 30 "$web_log" >&2; die "Vite stopped (log: $web_log)"; }
  ((SECONDS < deadline)) || die "the backend or Vite did not answer within 5 minutes (logs: $logs)"
  sleep 2
done

ip="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo
echo "dev.sh: the app is running"
echo "  Local:    http://localhost:$web_port/"
[[ -n "$ip" ]] && echo "  Network:  http://$ip:$web_port/"
echo "  Backend:  http://localhost:$backend_port/ (logs: $logs)"
echo "  Stop with Ctrl-C."

# Runs until interrupted, or until either process exits.
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do sleep 2; done
die "the backend or Vite exited (logs: $logs)"
