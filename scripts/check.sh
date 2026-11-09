#!/usr/bin/env bash
# Runs every local check in one command, from any directory:
#
#   scripts/check.sh            # migration guard, backend build + tests, all web checks
#   scripts/check.sh --image    # also builds the Docker image and runs scripts/image-smoke-test.sh
#
# Steps: scripts/check-migrations.sh against origin/main; backend `./gradlew spotlessApply build`
# (spotlessApply reformats Java in place, build runs spotlessCheck, Error Prone and the tests);
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

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if ! command -v node >/dev/null || (($(node_major node) < 22)); then
  for d in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin; do
    if [[ -x "$d/node" ]] && (($(node_major "$d/node") >= 22)); then
      PATH="$d:$PATH"
      break
    fi
  done
fi
command -v node >/dev/null && (($(node_major node) >= 22)) ||
  die "Node 22+ not found on PATH or in /opt/homebrew/opt/node@22/bin (brew install node@22)."
export PATH

# Gradle needs a JDK 21: use JAVA_HOME, else the system one, else Homebrew's keg-only openjdk@21
# (the temurin cask needs sudo; the formula doesn't).
if [[ -z "${JAVA_HOME:-}" ]] && ! /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
  for d in /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21; do
    [[ -x "$d/bin/java" ]] && export JAVA_HOME="$d" && break
  done
fi
java_bin="${JAVA_HOME:+$JAVA_HOME/bin/}java"
"$java_bin" -version >/dev/null 2>&1 ||
  die "JDK 21 not found: set JAVA_HOME or brew install openjdk@21."

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
