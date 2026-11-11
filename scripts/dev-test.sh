#!/usr/bin/env bash
# Self-test for scripts/dev.sh's new-migration gate. Copies dev.sh into throwaway git repos in a
# temp directory and points Docker at a socket that doesn't exist, so it never touches this
# checkout, Docker or any database: a run that passes the gate stops at "Docker is not running".
# Run from anywhere:
#
#   scripts/dev-test.sh
set -euo pipefail

scripts="$(cd "$(dirname "$0")" && pwd)"
dir=backend/src/main/resources/db/migration
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

# A fresh repo whose origin/main holds V1; HEAD is the branch `feature` off it, with dev.sh.
new_repo() {
  local repo="$tmp/$1"
  git init -q -b main "$repo"
  mkdir -p "$repo/$dir" "$repo/scripts/lib"
  cp "$scripts/dev.sh" "$repo/scripts/"
  cp "$scripts/lib/toolchain.sh" "$repo/scripts/lib/"
  echo "create table a (id int);" >"$repo/$dir/V1__a.sql"
  git -C "$repo" add .
  git -C "$repo" -c user.email=t@example.com -c user.name=t commit -qm main
  git -C "$repo" update-ref refs/remotes/origin/main main
  git -C "$repo" checkout -qb feature
  echo "$repo"
}

# expect <name> <expected output fragment> <repo> [dev.sh args...]: dev.sh must fail with it.
expect() {
  local name="$1" has="$2" repo="$3" out
  shift 3
  out="$(DOCKER_HOST=unix:///nonexistent/docker.sock "$repo/scripts/dev.sh" "$@" 2>&1)" && {
    echo "FAIL $name: dev.sh succeeded: $out"
    failures=$((failures + 1))
    return
  }
  if [[ "$out" == *"$has"* ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: output should contain '$has': $out"
    failures=$((failures + 1))
  fi
}

repo="$(new_repo same)"
expect no-new-migration-passes-the-gate 'Docker is not running' "$repo"

repo="$(new_repo committed)"
echo "create table b (id int);" >"$repo/$dir/V2__b.sql"
git -C "$repo" add .
git -C "$repo" -c user.email=t@example.com -c user.name=t commit -qm b
expect new-migration-is-refused 'V2__b.sql' "$repo"
expect refusal-names-the-flag '--allow-new-migrations' "$repo"
expect refused-with-fresh-db-too '--allow-new-migrations' "$repo" --fresh-db
expect the-flag-passes-the-gate 'Docker is not running' "$repo" --allow-new-migrations

repo="$(new_repo untracked)"
echo "create table c (id int);" >"$repo/$dir/V2__c.sql"
expect untracked-migration-is-refused 'V2__c.sql' "$repo"

repo="$(new_repo no-base)"
git -C "$repo" update-ref -d refs/remotes/origin/main
expect unknown-base-is-refused 'git fetch origin main' "$repo"

if [[ $failures -gt 0 ]]; then
  echo "dev-test: $failures case(s) failed" >&2
  exit 1
fi
