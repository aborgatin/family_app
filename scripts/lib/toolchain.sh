# Finds the toolchain the scripts need, sourced by check.sh, dev.sh, screenshot.sh, with-toolchain.sh
# and repeat-test.sh (Node only).
# Each function puts the tool on PATH / JAVA_HOME (exported) and returns non-zero when not found.

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# Node 22+: the one on PATH, else Homebrew's keg-only node@22.
use_node22() {
  if ! command -v node >/dev/null || (($(node_major node) < 22)); then
    local d
    for d in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin; do
      if [[ -x "$d/node" ]] && (($(node_major "$d/node") >= 22)); then
        PATH="$d:$PATH"
        break
      fi
    done
  fi
  export PATH
  command -v node >/dev/null && (($(node_major node) >= 22))
}

# The major version of a `java` binary (17, 21…), or nothing when it doesn't run.
java_major() {
  "$1" -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | sed -n 1p || true
}

# JDK 21 (Gradle, the backend jar). A JAVA_HOME that is set must be JDK 21 (it is never second-
# guessed); unset, the macOS one (java_home -v 21), else Homebrew's keg-only openjdk@21 (the temurin
# cask needs sudo; the formula doesn't), else `java` on PATH.
use_jdk21() {
  local d
  if [[ -n "${JAVA_HOME:-}" ]]; then
    [[ "$(java_major "$JAVA_HOME/bin/java")" == 21 ]]
    return
  fi
  for d in "$(/usr/libexec/java_home -v 21 2>/dev/null || true)" /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21; do
    if [[ -n "$d" && "$(java_major "$d/bin/java")" == 21 ]]; then
      export JAVA_HOME="$d"
      return 0
    fi
  done
  command -v java >/dev/null && [[ "$(java_major java)" == 21 ]]
}
