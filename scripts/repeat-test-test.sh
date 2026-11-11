#!/usr/bin/env bash
# Self-test for scripts/repeat-test.sh. Runs it on throwaway test files in a temp project that
# borrows web/node_modules (run `npm ci` in web/ first), so it never touches this checkout. Run from
# anywhere:
#
#   scripts/repeat-test-test.sh
set -euo pipefail

scripts="$(cd "$(dirname "$0")" && pwd)"
repeat="$scripts/repeat-test.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ln -s "$scripts/../web/node_modules" "$tmp/node_modules"
failures=0

cat >"$tmp/passes.test.ts" <<'EOF'
import { expect, it } from 'vitest';
it('passes', () => expect(1).toBe(1));
EOF
cat >"$tmp/fails.test.ts" <<'EOF'
import { expect, it } from 'vitest';
it('fails', () => expect('boom').toBe('fine'));
EOF
# Fails on its second run only: a flaky test.
cat >"$tmp/flaky.test.ts" <<'EOF'
import { appendFileSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('fails the second time', () => {
  appendFileSync('runs', 'x');
  expect(readFileSync('runs', 'utf8')).not.toBe('xx');
});
EOF

# expect <exit 0|1> <name> <expected output fragment> <unexpected fragment or ""> <args...>
expect() {
  local want="$1" name="$2" has="$3" hasnt="$4" out status
  shift 4
  set +e
  out="$(cd "$tmp" && REPEAT_TEST_DIR="$tmp" "$repeat" "$@" 2>&1)"
  status=$?
  set -e
  if [[ $status -ne $want ]]; then
    echo "FAIL $name: exit $status, expected $want; output:"
    echo "$out"
    failures=$((failures + 1))
  elif [[ "$out" != *"$has"* ]] || [[ -n "$hasnt" && "$out" == *"$hasnt"* ]]; then
    echo "FAIL $name: output should contain '$has'${hasnt:+ and not '$hasnt'}:"
    echo "$out"
    failures=$((failures + 1))
  else
    echo "ok   $name"
  fi
}

expect 0 passing-prints-only-the-count 'passes.test.ts: 3/3 runs passed' 'RUN' passes.test.ts 3
expect 0 default-is-ten-runs '10/10 runs passed' '' passes.test.ts
expect 1 failing-prints-the-failure 'boom' '' fails.test.ts 2
expect 1 failing-counts-no-passes '0/2 runs passed' '' fails.test.ts 2
expect 1 flaky-names-the-failed-run 'run 2 of 3 failed' 'run 1 of 3 failed' flaky.test.ts 3
rm -f "$tmp/runs"
expect 1 flaky-counts-the-passes '2/3 runs passed' '' flaky.test.ts 3
expect 2 missing-file-is-usage 'not found' '' nothing.test.ts 3
expect 2 bad-count-is-usage 'usage' '' passes.test.ts zero

if [[ $failures -gt 0 ]]; then
  echo "repeat-test-test: $failures case(s) failed" >&2
  exit 1
fi
