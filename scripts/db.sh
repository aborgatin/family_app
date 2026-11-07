#!/usr/bin/env bash
# Runs SQL against a PostgreSQL container with psql, so no `docker exec … psql …` compound command
# is needed. Works from any directory.
#
#   scripts/db.sh "SELECT email FROM member"             # local dev database
#   scripts/db.sh -c <container> "SELECT count(*) FROM child"
#   scripts/db.sh -c <container> -d restore_check "SELECT 1"
#
# Default container: the `postgres` service of deploy/docker-compose.dev.yml (start it with
# `docker compose -f deploy/docker-compose.dev.yml up -d`). User and database default to the
# container's POSTGRES_USER / POSTGRES_DB. Extra arguments after the SQL go to psql
# (e.g. `-A -t` for bare output).
set -euo pipefail

usage() {
  echo "usage: $0 [-c <container>] [-d <database>] \"<sql>\" [psql args...]" >&2
  exit 2
}

container=""
database=""
while getopts "c:d:h" opt; do
  case "$opt" in
    c) container="$OPTARG" ;;
    d) database="$OPTARG" ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))
(($# >= 1)) || usage
sql="$1"
shift

docker info >/dev/null 2>&1 || {
  echo "db.sh: Docker is not running." >&2
  exit 1
}

if [[ -z "$container" ]]; then
  root="$(cd "$(dirname "$0")/.." && pwd)"
  container="$(docker compose -f "$root/deploy/docker-compose.dev.yml" ps -q postgres)"
  [[ -n "$container" ]] || {
    echo "db.sh: the dev database is not running. Start it with:" >&2
    echo "  docker compose -f deploy/docker-compose.dev.yml up -d" >&2
    exit 1
  }
fi

# psql runs inside the container, where POSTGRES_USER / POSTGRES_DB are set; the SQL is passed as an
# argument, never through a shell string, so quotes in it need no escaping.
exec docker exec -i -e "DB_NAME=$database" "$container" \
  sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${DB_NAME:-$POSTGRES_DB}" -c "$0" "$@"' \
  "$sql" "$@"
