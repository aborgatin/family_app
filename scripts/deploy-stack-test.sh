#!/usr/bin/env bash
# Deploy stack test (spec #5, Deployment): runs the production Compose stack from /deploy
# (app + PostgreSQL 18 + Caddy) with DOMAIN=localhost, so Caddy serves HTTPS with its local CA,
# and checks it over real HTTPS, then restarts it with `down && up` and checks data survived.
# Used by the CI "image" job; runs locally too (needs ports 80 and 443 free):
#
#   docker build -t ghcr.io/aborgatin/family_app:local . && scripts/deploy-stack-test.sh local
#
# The argument is the APP_IMAGE_TAG; the image must exist locally or on GHCR.
set -euo pipefail

tag="${1:?usage: $0 <app-image-tag>}"
deploy_dir="$(cd "$(dirname "$0")/../deploy" && pwd)"
work="$(mktemp -d)"
project="family-app-stack-test-$$"
base="https://localhost"

cat >"$work/.env" <<EOF
DOMAIN=localhost
ACME_EMAIL=ops@example.com
APP_IMAGE_TAG=$tag
POSTGRES_DB=family
POSTGRES_USER=family
POSTGRES_PASSWORD=stack-test
TZ=Europe/Berlin
EOF

compose() {
  docker compose --project-name "$project" --project-directory "$deploy_dir" \
    --env-file "$work/.env" -f "$deploy_dir/docker-compose.yml" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  echo "--- compose logs ---" >&2
  compose logs --no-color --tail 100 >&2 || true
  exit 1
}

start_stack() {
  compose up -d --wait --wait-timeout 180 || fail "stack did not become healthy"
}

psql_value() {
  compose exec -T postgres psql -U family -d family -tAc "$1"
}

# s_client exits non-zero on some OpenSSL/LibreSSL versions even after printing the certificate.
cert_fingerprint() {
  { openssl s_client -connect localhost:443 -servername localhost </dev/null 2>/dev/null || true; } |
    openssl x509 -noout -fingerprint -sha256 || fail "could not read Caddy's certificate"
}

# Caddy may need a moment to issue the local certificate after the containers are healthy.
wait_for_https() {
  local health=""
  for _ in $(seq 1 30); do
    health="$(curl -ksS "$base/actuator/health" 2>/dev/null || true)"
    case "$health" in *'"status":"UP"'*) return 0 ;; esac
    sleep 2
  done
  fail "https://localhost/actuator/health never reported UP (last: ${health:-no response})"
}

check_https_health() {
  wait_for_https
  echo "ok   app reachable over HTTPS through Caddy"
}

check_http_redirects_to_https() {
  local location
  location="$(curl -sS -o /dev/null -w '%{redirect_url}' "http://localhost/")"
  case "$location" in
    https://localhost/*) echo "ok   HTTP redirects to HTTPS" ;;
    *) fail "HTTP did not redirect to HTTPS (got '${location}')" ;;
  esac
}

check_hsts() {
  curl -ksSI "$base/" | grep -qi '^strict-transport-security: max-age=' ||
    fail "no Strict-Transport-Security header"
  echo "ok   HSTS header set"
}

# Checked on the bundle's script: Caddy leaves responses under 512 bytes uncompressed.
check_compression() {
  local encoding script
  script="$(curl -ksS "$base/" | grep -o 'src="/assets/[^"]*\.js"' | head -n1 | cut -d'"' -f2)"
  [ -n "$script" ] || fail "index.html references no /assets/*.js script"
  for encoding in gzip zstd; do
    curl -ksS -o /dev/null -D - -H "Accept-Encoding: $encoding" "$base$script" |
      grep -qi "^content-encoding: $encoding" || fail "response not compressed with $encoding"
  done
  echo "ok   responses compressed with gzip and zstd"
}

check_only_caddy_publishes_ports() {
  local service published
  for service in app postgres; do
    published="$(docker ps --filter "label=com.docker.compose.project=$project" \
      --filter "label=com.docker.compose.service=$service" --format '{{.Ports}}')"
    case "$published" in
      *'->'*) fail "$service publishes a port: $published" ;;
    esac
  done
  echo "ok   only Caddy publishes ports"
}

echo "starting stack ($project, image tag $tag)"
start_stack
check_https_health
check_http_redirects_to_https
check_hsts
check_compression
check_only_caddy_publishes_ports

psql_value "CREATE TABLE stack_test_marker (note text); INSERT INTO stack_test_marker VALUES ('kept');" >/dev/null ||
  fail "could not write a marker row"
fingerprint_before="$(cert_fingerprint)"

echo "restarting stack with down && up"
compose down || fail "compose down failed"
start_stack
wait_for_https

[ "$(psql_value 'SELECT note FROM stack_test_marker')" = "kept" ] || fail "database data lost across down && up"
echo "ok   database data survives down && up"
[ "$(cert_fingerprint)" = "$fingerprint_before" ] || fail "Caddy certificate changed across down && up"
echo "ok   Caddy certificate survives down && up"

echo "deploy stack test passed"
