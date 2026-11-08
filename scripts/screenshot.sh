#!/usr/bin/env bash
# Screenshots of the web app at 390px touch and 1280px mouse, in light and dark, from this checkout:
#
#   scripts/screenshot.sh --out <dir>                       # every screen in scripts/screenshot/screens.mjs
#   scripts/screenshot.sh --out <dir> --only settings,child # just these routes
#
# Starts its own database, backend and Vite on free ports, seeds data through the API and tears
# everything down after. Needs Docker, Node 22+, Java and Google Chrome. Options and the screens
# file format: scripts/screenshot/README.md.
set -euo pipefail

dir="$(cd "$(dirname "$0")/screenshot" && pwd)"

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if ! command -v node >/dev/null || (($(node_major node) < 22)); then
  for d in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin; do
    [[ -x "$d/node" ]] && export PATH="$d:$PATH" && break
  done
fi

lock="$dir/node_modules/.package-lock.json"
if [[ ! -f "$lock" || "$dir/package-lock.json" -nt "$lock" ]]; then
  (cd "$dir" && npm ci --silent)
fi

exec node "$dir/shoot.mjs" "$@"
