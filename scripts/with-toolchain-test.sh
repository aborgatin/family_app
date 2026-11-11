#!/usr/bin/env bash
# Self-test for scripts/with-toolchain.sh. Runs it from a temp directory, so it never touches this
# checkout. Needs JDK 21 and Node 22 installed (as scripts/check.sh does). Run from anywhere:
#
#   scripts/with-toolchain-test.sh
set -euo pipefail

wrapper="$(cd "$(dirname "$0")" && pwd)/with-toolchain.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

ok() { echo "ok   $1"; }
fail() {
  echo "FAIL $1: $2"
  failures=$((failures + 1))
}

# A command runs in the caller's directory, with Java and Node 22 on hand.
if out="$(cd "$tmp" && "$wrapper" sh -c 'pwd; java -version 2>&1; node -p process.versions.node' 2>&1)"; then
  [[ "$out" == *"$(cd "$tmp" && pwd -P)"* || "$out" == *"$tmp"* ]] && ok runs-in-callers-directory ||
    fail runs-in-callers-directory "pwd was not $tmp: $out"
  [[ "$out" == *'version "21'* ]] && ok java-21-on-path || fail java-21-on-path "$out"
  [[ "$(sed -n '$p' <<<"$out")" == 2[2-9].* || "$(sed -n '$p' <<<"$out")" == [3-9][0-9].* ]] &&
    ok node-22-on-path || fail node-22-on-path "$out"
else
  fail runs-a-command "exit $?: $out"
fi

# The command's exit status and arguments come through unchanged.
set +e
(cd "$tmp" && "$wrapper" sh -c 'exit 7') >/dev/null 2>&1
status=$?
set -e
[[ $status -eq 7 ]] && ok exit-status-passes-through || fail exit-status-passes-through "got $status"
out="$("$wrapper" printf '%s|' 'a b' "c'd" 2>&1)" || true
[[ "$out" == "a b|c'd|" ]] && ok arguments-unchanged || fail arguments-unchanged "$out"

# A missing tool stops it before the command runs, with a message naming the tool.
set +e
out="$(JAVA_HOME="$tmp/no-jdk" "$wrapper" touch "$tmp/ran" 2>&1)"
status=$?
set -e
if [[ $status -ne 0 && "$out" == *"JDK 21"* && ! -e "$tmp/ran" ]]; then
  ok missing-jdk-fails-clearly
else
  fail missing-jdk-fails-clearly "exit $status, output: $out"
fi

# A JAVA_HOME with another JDK is refused, naming the version it found.
mkdir -p "$tmp/otherjdk/bin"
printf '%s\n' '#!/bin/sh' "echo 'openjdk version \"17.0.2\" 2022-01-18' >&2" >"$tmp/otherjdk/bin/java"
chmod +x "$tmp/otherjdk/bin/java"
set +e
out="$(JAVA_HOME="$tmp/otherjdk" "$wrapper" touch "$tmp/ran" 2>&1)"
status=$?
set -e
if [[ $status -ne 0 && "$out" == *"JDK 21"* && "$out" == *"JDK 17"* && ! -e "$tmp/ran" ]]; then
  ok jdk-17-is-refused
else
  fail jdk-17-is-refused "exit $status, output: $out"
fi

# No command is a usage error.
set +e
"$wrapper" >/dev/null 2>&1
status=$?
set -e
[[ $status -eq 2 ]] && ok no-command-is-usage || fail no-command-is-usage "got $status"

if [[ $failures -gt 0 ]]; then
  echo "with-toolchain-test: $failures case(s) failed" >&2
  exit 1
fi
