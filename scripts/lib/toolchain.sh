# Finds the toolchain the scripts need, sourced by scripts/check.sh and scripts/screenshot.sh.
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

# JDK 21 (Gradle, the backend jar): JAVA_HOME, else the system one, else Homebrew's keg-only
# openjdk@21 (the temurin cask needs sudo; the formula doesn't).
use_jdk21() {
  local d
  if [[ -z "${JAVA_HOME:-}" ]]; then
    d="$(/usr/libexec/java_home -v 21 2>/dev/null)" && export JAVA_HOME="$d"
  fi
  if [[ -z "${JAVA_HOME:-}" ]]; then
    for d in /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21; do
      [[ -x "$d/bin/java" ]] && export JAVA_HOME="$d" && break
    done
  fi
  "${JAVA_HOME:+$JAVA_HOME/bin/}java" -version >/dev/null 2>&1
}
