#!/usr/bin/env bash
# Self-test for scripts/check-shell.sh. Writes throwaway scripts to a temp directory, so it never
# touches this checkout. Run from anywhere:
#
#   scripts/check-shell-test.sh
set -euo pipefail

guard="$(cd "$(dirname "$0")" && pwd)/check-shell.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

# expect <pass|fail> <name> <script body>
expect() {
  local want="$1" name="$2" file="$tmp/$2.sh"
  printf '%s\n' "$3" >"$file"
  if "$guard" "$file" 2>/dev/null; then got=pass; else got=fail; fi
  if [[ "$got" == "$want" ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected $want, got $got"
    failures=$((failures + 1))
  fi
}

expect fail grep-q-under-pipefail $'set -euo pipefail\ncurl -s x | grep -q y || exit 1'
expect fail grep-qi-under-pipefail $'set -euo pipefail\ncurl -sI x | grep -qi "^hsts:"'
expect fail grep-option-then-q $'set -euo pipefail\nls | grep -E -q y'
expect fail head-under-pipefail $'set -euo pipefail\nport="$(docker port c | head -n1)"'
expect fail bare-head-in-subshell $'set -euo pipefail\nx="$(ls | head)"'
expect pass grep-to-dev-null $'set -euo pipefail\ncurl -s x | grep y >/dev/null || exit 1'
expect pass here-string $'set -euo pipefail\ngrep -q y <<<"$headers"'
expect pass sed-first-line $'set -euo pipefail\nport="$(docker port c | sed -n 1p)"'
expect pass grep-q-on-a-file $'set -euo pipefail\ngrep -q pipefail "$f"'
expect pass comment-line $'set -euo pipefail\n# `curl | grep -q` fails under pipefail'
expect pass no-pipefail $'set -eu\ncurl -s x | grep -q y'
expect pass header-command $'set -euo pipefail\ngit log | heading'

if [[ $failures -gt 0 ]]; then
  echo "check-shell-test: $failures case(s) failed" >&2
  exit 1
fi
