#!/usr/bin/env bash
# Migration guard (CODING_STANDARDS S5): Flyway migrations merged to `main` are append-only.
# Compares the working tree (committed or not, untracked files included) with a base commit and
# fails when
#   - a versioned migration that exists on the base was changed, deleted or renamed, or
#   - a new versioned migration's version is not higher than the highest version on the base.
# Repeatable migrations (R__*.sql) are not checked. Runs in CI (job `migrations`) and locally,
# from any directory inside the repo:
#
#   scripts/check-migrations.sh            # against origin/main (run `git fetch` first)
#   scripts/check-migrations.sh <commit>   # against any commit, branch or tag
#
# Self-test: scripts/check-migrations-test.sh
set -euo pipefail

base="${1:-origin/main}"
dir=backend/src/main/resources/db/migration

cd "$(git rev-parse --show-toplevel)"
if ! git rev-parse --verify -q "$base^{commit}" >/dev/null; then
  echo "check-migrations: unknown base '$base' (try: git fetch origin main)" >&2
  exit 2
fi
merge_base="$(git merge-base "$base" HEAD)"

# Prints the Flyway version of a versioned migration file name (V2_1__x.sql → 2_1), or nothing.
version_of() {
  sed -nE 's/^V([0-9]+([._][0-9]+)*)__.*\.sql$/\1/p' <<<"$(basename "$1")"
}

# Exit 0 when version $1 > $2. Parts split on `.` or `_` compare numerically; missing parts are 0.
version_gt() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    na = split(a, x, /[._]/); nb = split(b, y, /[._]/); n = na > nb ? na : nb
    for (i = 1; i <= n; i++) { p = x[i] + 0; q = y[i] + 0; if (p != q) exit !(p > q) }
    exit 1
  }'
}

errors=0
error() {
  echo "check-migrations: $*" >&2
  errors=$((errors + 1))
}

highest=""
highest_file=""
base_files="$(git ls-tree --name-only "$base" -- "$dir/")"
for f in $base_files; do
  v="$(version_of "$f")"
  [[ -n "$v" ]] || continue
  if [[ -z "$highest" ]] || version_gt "$v" "$highest"; then
    highest="$v"
    highest_file="$f"
  fi
  if [[ -f "$f" ]]; then
    if [[ "$(git rev-parse "$base:$f")" != "$(git hash-object "$f")" ]]; then
      error "$f is merged to $base and was changed. Revert it and add a new migration instead."
    fi
  elif git cat-file -e "$merge_base:$f" 2>/dev/null; then
    error "$f is merged to $base and was deleted or renamed. Restore it and add a new migration instead."
  fi
done

if [[ -d "$dir" ]]; then
  for f in "$dir"/V*.sql; do
    [[ -e "$f" ]] || continue
    grep -qxF "$f" <<<"$base_files" && continue
    v="$(version_of "$f")"
    if [[ -z "$v" ]]; then
      error "$f is not named V<version>__<description>.sql."
    elif [[ -n "$highest" ]] && ! version_gt "$v" "$highest"; then
      error "$f is new, but its version $v is not higher than $highest ($highest_file on $base). Pick a higher version."
    fi
  done
fi

if ((errors)); then
  echo "check-migrations: $errors problem(s); see CODING_STANDARDS.md S5." >&2
  exit 1
fi
echo "check-migrations: OK (highest version on $base: ${highest:-none})"
