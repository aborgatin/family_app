#!/usr/bin/env bash
# Runs one web test file n times (default 10) to catch a flaky test, printing only the failed runs
# (their vitest output) and a pass count. Exits 1 when any run failed. From any directory:
#
#   scripts/repeat-test.sh web/src/features/lists/categories.test.tsx
#   scripts/repeat-test.sh src/features/lists/categories.test.tsx 30     # from web/
#
# The file is found from the current directory or from web/. Node 22 is found as check.sh finds it.
# A flaky test is fixed test-first: this script red (some runs fail), then green (n/n).
# REPEAT_TEST_DIR replaces web/ as the project to run in (the self-test uses it).
# Self-test: scripts/repeat-test-test.sh
set -euo pipefail

usage() {
  echo "usage: $0 <test file> [runs, default 10]" >&2
  exit 2
}
(($# >= 1 && $# <= 2)) || usage
runs="${2:-10}"
[[ "$runs" =~ ^[1-9][0-9]*$ ]] || usage

scripts="$(cd "$(dirname "$0")" && pwd)"
dir="${REPEAT_TEST_DIR:-$scripts/../web}"
dir="$(cd "$dir" && pwd -P)"

if [[ -f "$1" ]]; then
  file="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
elif [[ -f "$dir/$1" ]]; then
  file="$dir/$1"
else
  echo "repeat-test.sh: $1 not found (from here or from $dir)" >&2
  exit 2
fi
# vitest matches the path as written, so pass it relative to the project.
file="${file#"$dir/"}"

cd "$dir"
passed=0
for ((i = 1; i <= runs; i++)); do
  if out="$("$scripts/with-toolchain.sh" node_modules/.bin/vitest run "$file" 2>&1)"; then
    passed=$((passed + 1))
  else
    echo "=== run $i of $runs failed"
    echo "$out"
  fi
done

echo "$(basename "$file"): $passed/$runs runs passed"
((passed == runs))
