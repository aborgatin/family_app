#!/usr/bin/env bash
# Screenshots of the web app at 390px touch and 1280px mouse, in light and dark, from this checkout:
#
#   scripts/screenshot.sh --out <dir>                       # every screen in scripts/screenshot/screens.mjs
#   scripts/screenshot.sh --out <dir> --only settings,child # just these routes
#
# Starts its own database, backend and Vite on free ports, seeds data through the API and tears
# everything down after. Needs Docker, Node 22+, JDK 21 (both found as check.sh finds them,
# scripts/lib/toolchain.sh) and Google Chrome. Options and the screens file format:
# scripts/screenshot/README.md.
set -euo pipefail

dir="$(cd "$(dirname "$0")/screenshot" && pwd)"

source "$dir/../lib/toolchain.sh"
use_node22 || { echo "screenshot.sh: Node 22+ not found (brew install node@22)." >&2; exit 1; }
use_jdk21 || { echo "screenshot.sh: JDK 21 not found: set JAVA_HOME or brew install openjdk@21." >&2; exit 1; }

lock="$dir/node_modules/.package-lock.json"
if [[ ! -f "$lock" || "$dir/package-lock.json" -nt "$lock" ]]; then
  (cd "$dir" && npm ci --silent)
fi

exec node "$dir/shoot.mjs" "$@"
