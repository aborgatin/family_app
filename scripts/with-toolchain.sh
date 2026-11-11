#!/usr/bin/env bash
# Runs one command with JDK 21 and Node 22+ on hand, found as scripts/check.sh finds them
# (scripts/lib/toolchain.sh). The command runs in the current directory, with its arguments and
# exit status unchanged; no `source` or exported PATH needed:
#
#   scripts/with-toolchain.sh ./gradlew test --tests '*ItemSyncTest'   # from backend/
#   scripts/with-toolchain.sh npx vitest run src/features/lists        # from web/
#   ../scripts/with-toolchain.sh npm run typecheck
#
# Fails before running the command, naming the missing tool, when either is not installed.
# Self-test: scripts/with-toolchain-test.sh
set -euo pipefail

(($# >= 1)) || {
  echo "usage: $0 <command> [args...]" >&2
  exit 2
}

source "$(cd "$(dirname "$0")" && pwd)/lib/toolchain.sh"
use_node22 || {
  echo "with-toolchain.sh: Node 22+ not found on PATH or in /opt/homebrew/opt/node@22/bin (brew install node@22)." >&2
  exit 1
}
use_jdk21 || {
  echo "with-toolchain.sh: JDK 21 not found (JAVA_HOME=${JAVA_HOME:-unset}): set JAVA_HOME or brew install openjdk@21." >&2
  exit 1
}
[[ -n "${JAVA_HOME:-}" ]] && PATH="$JAVA_HOME/bin:$PATH"

exec "$@"
