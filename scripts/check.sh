#!/usr/bin/env bash
# Runs every local check in one command, from any directory:
#
#   scripts/check.sh            # migration and error-code guards, backend build + tests, web checks
#   scripts/check.sh --image    # also builds the Docker image and runs scripts/image-smoke-test.sh
#
# Steps: scripts/check-migrations.sh against origin/main; scripts/check-error-codes.sh (I3) and its
# self-test; scripts/check-shell.sh (pipes under pipefail) and its self-test; backend `./gradlew spotlessApply build` (spotlessApply reformats Java in place, build
# runs spotlessCheck, Error Prone and the tests);
# web `npm ci` (only when node_modules is missing or stale), `format:check`, `lint`, `typecheck`,
# `test`, `build`. Stops at the first failing step and names it. Needs Docker running (backend
# tests use Testcontainers) and Node 22+ (found on PATH or in Homebrew's keg-only node@22).
# CI runs the same checks as separate jobs (.github/workflows/ci.yml).
set -euo pipefail

usage() {
  echo "usage: $0 [--image]" >&2
  exit 2
}
image=false
case "${1:-}" in
  "") ;;
  --image) image=true ;;
  *) usage ;;
esac
(($# <= 1)) || usage

root="$(cd "$(dirname "$0")/.." && pwd)"

die() {
  echo "check.sh: $*" >&2
  exit 1
}

# --- preconditions: fail before spending minutes on a build ---------------------------------------
docker info >/dev/null 2>&1 ||
  die "Docker is not running (backend tests and --image need it). Start Docker Desktop / the daemon and retry."

source "$root/scripts/lib/toolchain.sh"
use_node22 || die "Node 22+ not found on PATH or in /opt/homebrew/opt/node@22/bin (brew install node@22)."
use_jdk21 || die "JDK 21 not found: set JAVA_HOME or brew install openjdk@21."

# --- steps ----------------------------------------------------------------------------------------
current=""
trap '[[ -n "$current" ]] && echo "check.sh: FAILED at: $current" >&2' EXIT
step() {
  current="$1"
  echo
  echo "=== $1"
}

step "migration guard"
(cd "$root" && scripts/check-migrations.sh)

step "error-code guard"
"$root/scripts/check-error-codes-test.sh" | { grep -v '^ok ' || true; }
"$root/scripts/check-error-codes.sh"

step "shell guard"
"$root/scripts/check-shell-test.sh" | { grep -v '^ok ' || true; }
"$root/scripts/check-shell.sh"

step "toolchain wrapper self-test"
"$root/scripts/with-toolchain-test.sh" | { grep -v '^ok ' || true; }

step "backend: spotlessApply build"
(cd "$root/backend" && ./gradlew spotlessApply build)

cd "$root/web"
if [[ ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json ]]; then
  step "web: npm ci"
  npm ci
fi
for script in format:check lint typecheck test build; do
  step "web: $script"
  npm run "$script"
done

if $image; then
  tag="family-app:check"
  step "image: docker build"
  docker build -t "$tag" "$root"
  step "image: smoke test"
  "$root/scripts/image-smoke-test.sh" "$tag"
fi

current=""
echo
echo "check.sh: all checks passed"
