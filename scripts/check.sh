#!/usr/bin/env bash
# Runs every local check in one command, from any directory:
#
#   scripts/check.sh            # guards, cheap web checks, backend build + tests, web tests + build
#   scripts/check.sh --image    # also builds the Docker image and runs scripts/image-smoke-test.sh
#
# Steps, cheapest first so a slip fails in seconds, not after the backend build:
#   1. guards, each after its self-test: scripts/check-migrations.sh against origin/main,
#      check-error-codes.sh (I3), check-shell.sh (pipes under pipefail), check-doc-index.sh (doc
#      indexes), check-screens.sh (real clicks), and the with-toolchain.sh self-test;
#   2. web `npm ci` (only when node_modules is missing or stale), the repeat-test.sh self-test,
#      `npm run format` (Prettier writes in place, as spotlessApply does for Java; CI runs
#      format:check), `lint`, `typecheck`;
#   3. backend `./gradlew spotlessApply build` (spotlessApply reformats Java in place, build runs
#      spotlessCheck, Error Prone and the tests);
#   4. web `test`, `build`.
# Stops at the first failing step and names it. Needs Docker running (backend tests use
# Testcontainers), JDK 21 and Node 22+ (found as scripts/with-toolchain.sh finds them). CI runs the
# same checks as separate jobs (.github/workflows/ci.yml).
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

step "doc index guard"
"$root/scripts/check-doc-index-test.sh" | { grep -v '^ok ' || true; }
"$root/scripts/check-doc-index.sh"

step "screenshot guard (real clicks)"
"$root/scripts/check-screens-test.sh" | { grep -v '^ok ' || true; }
"$root/scripts/check-screens.sh"

step "toolchain wrapper self-test"
"$root/scripts/with-toolchain-test.sh" | { grep -v '^ok ' || true; }

cd "$root/web"
if [[ ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json ]]; then
  step "web: npm ci"
  npm ci
fi
step "repeat-test.sh self-test"
"$root/scripts/repeat-test-test.sh" | { grep -v '^ok ' || true; }
# Cheap web steps before the backend build; format writes in place (CI runs format:check).
for script in format lint typecheck; do
  step "web: $script"
  npm run "$script"
done

step "backend: spotlessApply build"
(cd "$root/backend" && ./gradlew spotlessApply build)

cd "$root/web"
for script in test build; do
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
