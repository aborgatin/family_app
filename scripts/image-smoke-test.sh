#!/usr/bin/env bash
# Image smoke test (spec #5, Testing, seam 3): starts the built image next to a throwaway
# PostgreSQL 18 and checks it over real HTTP. Used by the CI "image" job; runs locally too:
#
#   docker build -t family-app:local . && scripts/image-smoke-test.sh family-app:local
#
# Add new checks as `check_*` calls at the bottom.
set -euo pipefail

image="${1:?usage: $0 <image>}"
run_id="family-app-smoke-$$"
network="$run_id"
db="$run_id-db"
app="$run_id-app"

cleanup() {
  docker rm -f "$app" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  echo "--- app logs ---" >&2
  docker logs "$app" >&2 || true
  exit 1
}

docker network create "$network" >/dev/null
docker run -d --name "$db" --network "$network" \
  -e POSTGRES_DB=family -e POSTGRES_USER=family -e POSTGRES_PASSWORD=smoke \
  postgres:18 >/dev/null
docker run -d --name "$app" --network "$network" -p 127.0.0.1::8080 \
  -e DATASOURCE_URL="jdbc:postgresql://$db:5432/family" \
  -e DATASOURCE_USERNAME=family -e DATASOURCE_PASSWORD=smoke \
  "$image" >/dev/null

base="http://$(docker port "$app" 8080/tcp | head -n1)"
echo "app at $base"

# The app may exit while Postgres is still starting; give it time, but fail fast if it dies.
health=""
for _ in $(seq 1 90); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$app")" != "true" ]; then
    fail "app container exited"
  fi
  health="$(curl -fsS "$base/actuator/health" 2>/dev/null || true)"
  case "$health" in *'"status":"UP"'*) break ;; esac
  sleep 2
done
case "$health" in
  *'"status":"UP"'*) echo "ok   /actuator/health is UP" ;;
  *) fail "/actuator/health never reported UP (last: ${health:-no response})" ;;
esac

# The built web/index.html mounts the app on <div id="root">.
check_serves_index_html() {
  local path="$1" body
  body="$(curl -fsS "$base$path")" || fail "GET $path did not return 2xx"
  case "$body" in
    *'<div id="root">'*) echo "ok   GET $path returns index.html" ;;
    *) fail "GET $path did not return index.html" ;;
  esac
}

# Spec #5, "Serving the bundle": index.html, the service worker and the manifest are revalidated on
# every load; hashed assets are cached forever.
check_cache_control() {
  local path="$1" expected="$2" headers actual
  headers="$(curl -fsS -o /dev/null -D - "$base$path")" || fail "GET $path did not return 2xx"
  actual="$(printf '%s' "$headers" | tr -d '\r' | sed -n 's/^[Cc]ache-[Cc]ontrol: *//p' | head -n1)"
  case "$actual" in
    "$expected") echo "ok   GET $path has Cache-Control: $actual" ;;
    *) fail "GET $path: expected Cache-Control '$expected', got '${actual:-none}'" ;;
  esac
}

check_index_links_manifest() {
  local body
  body="$(curl -fsS "$base/")" || fail "GET / did not return 2xx"
  case "$body" in
    *'rel="manifest" href="/manifest.webmanifest"'*) echo "ok   index.html links the manifest" ;;
    *) fail "index.html does not link /manifest.webmanifest" ;;
  esac
}

check_manifest() {
  local headers body
  headers="$(curl -fsS -o /dev/null -D - "$base/manifest.webmanifest")" || fail "no manifest"
  case "$(printf '%s' "$headers" | tr -d '\r')" in
    *[Cc]ontent-[Tt]ype:\ application/manifest+json*) ;;
    *) fail "manifest is not served as application/manifest+json" ;;
  esac
  body="$(curl -fsS "$base/manifest.webmanifest")"
  case "$body" in
    *'"name":"Семья"'*'"display":"standalone"'*) echo "ok   manifest names the app «Семья», standalone" ;;
    *) fail "unexpected manifest: $body" ;;
  esac
}

# The first hashed asset index.html references, e.g. /assets/index-AbC123.js.
first_hashed_asset() {
  curl -fsS "$base/" | grep -o '/assets/[^"]*' | head -n1
}

check_serves_index_html /
check_serves_index_html /settings
check_index_links_manifest
check_manifest
check_cache_control / no-cache
check_cache_control /index.html no-cache
check_cache_control /sw.js no-cache
check_cache_control /manifest.webmanifest no-cache
asset="$(first_hashed_asset)"
[ -n "$asset" ] || fail "index.html references no /assets/ file"
check_cache_control "$asset" "max-age=31536000, public, immutable"

echo "image smoke test passed"
