#!/usr/bin/env bash
# Self-test for scripts/check-migrations.sh. Builds throwaway git repos in a temp directory, so it
# needs nothing but git and bash and never touches this checkout. Run from anywhere:
#
#   scripts/check-migrations-test.sh
set -euo pipefail

guard="$(cd "$(dirname "$0")" && pwd)/check-migrations.sh"
dir=backend/src/main/resources/db/migration
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

# A fresh repo whose `main` holds V1, V2 and V2_1; HEAD is the branch `feature` off it.
new_repo() {
  local repo="$tmp/$1"
  git init -q -b main "$repo"
  cd "$repo"
  git config user.email test@example.com
  git config user.name test
  mkdir -p "$dir"
  echo "create table a (id int);" >"$dir/V1__a.sql"
  echo "create table b (id int);" >"$dir/V2__b.sql"
  echo "create table c (id int);" >"$dir/V2_1__c.sql"
  git add . && git commit -qm main
  git checkout -qb feature
}

expect() { # expect pass|fail <name> — runs the guard against `main` in the current repo
  local want="$1" name="$2" out status=0
  out="$("$guard" main 2>&1)" || status=$?
  if { [[ "$want" == pass ]] && ((status == 0)); } || { [[ "$want" == fail ]] && ((status != 0)); }; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected $want, exit $status"
    sed 's/^/     | /' <<<"$out"
    failures=$((failures + 1))
  fi
}

new_repo clean
expect pass "clean branch"

new_repo added
echo "create table d (id int);" >"$dir/V3__d.sql"
git add . && git commit -qm d
expect pass "new migration with a higher version (committed)"

new_repo untracked
echo "create table d (id int);" >"$dir/V3__d.sql"
expect pass "new migration with a higher version (untracked)"

new_repo changed
echo "-- tweak" >>"$dir/V2__b.sql"
git commit -qam tweak
expect fail "changed migration (committed)"

new_repo changed-uncommitted
echo "-- tweak" >>"$dir/V1__a.sql"
expect fail "changed migration (uncommitted)"

new_repo deleted
git rm -q "$dir/V2_1__c.sql" && git commit -qm rm
expect fail "deleted migration"

new_repo renamed
git mv "$dir/V2__b.sql" "$dir/V2__bb.sql" && git commit -qm mv
expect fail "renamed migration"

new_repo taken
echo "create table d (id int);" >"$dir/V2__d.sql"
expect fail "new migration reusing a version"

new_repo lower
echo "create table d (id int);" >"$dir/V2_0_5__d.sql"
expect fail "new migration below the highest version (V2_0_5 < V2_1)"

new_repo numeric
echo "create table d (id int);" >"$dir/V10__d.sql"
expect pass "versions compare numerically (V10 > V2_1)"

new_repo stale
git checkout -q main
echo "create table d (id int);" >"$dir/V3__d.sql"
git add . && git commit -qm "main moves on"
git checkout -q feature
expect pass "branch behind main (main's new migration is not 'deleted')"
echo "create table e (id int);" >"$dir/V3__e.sql"
expect fail "branch behind main takes a version main already used"

new_repo repeatable
echo "create view v as select 1;" >"$dir/R__v.sql"
git add . && git commit -qm r
echo "create view v as select 2;" >"$dir/R__v.sql"
expect pass "repeatable migrations are ignored"

if ((failures)); then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "all checks passed"
