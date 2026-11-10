#!/usr/bin/env bash
# Shell guard: in a script with `set -o pipefail`, a pipe must not feed a reader that exits before
# the end of its input (`… | grep -q …`, `… | head …`). When the reader exits early, the writer
# gets SIGPIPE or a write error (curl exit 23), and pipefail fails the whole pipe at random: the
# deploy stack test went red this way (CI run 42814399651). Use a reader that consumes everything:
#
#   … | grep -q x      →  … | grep x >/dev/null      (or capture first, then grep -q x <<<"$var")
#   … | head -n1       →  … | sed -n 1p
#
# Checks every tracked *.sh file that sets pipefail, except its own self-test (whose cases quote the
# pattern); comment lines are skipped. Runs in CI (job `migrations`) and in scripts/check.sh, from
# any directory inside the repo:
#
#   scripts/check-shell.sh            # the tracked scripts of this checkout
#   scripts/check-shell.sh <file>...  # just these files (the self-test uses this)
#
# Self-test: scripts/check-shell-test.sh
set -euo pipefail

if [[ $# -gt 0 ]]; then
  files=("$@")
else
  cd "$(git rev-parse --show-toplevel)"
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(git ls-files '*.sh' ':!scripts/check-shell-test.sh')
fi

early_exit='\|[[:space:]]*(grep[[:space:]]+(-[[:alnum:]]+[[:space:]]+)*-[[:alnum:]]*q|head([[:space:]]|\)|$))'
found=0
for f in "${files[@]}"; do
  grep -q 'pipefail' "$f" || continue
  while IFS= read -r hit; do
    echo "$f:$hit" >&2
    found=1
  done < <(grep -nE "$early_exit" "$f" | grep -vE '^[0-9]+:[[:space:]]*#' || true)
done

if [[ $found -eq 1 ]]; then
  echo "check-shell: a pipe into grep -q or head under pipefail fails at random; use grep … >/dev/null or sed -n 1p (see the header of scripts/check-shell.sh)" >&2
  exit 1
fi
