#!/usr/bin/env bash
# Self-test for scripts/check-doc-index.sh. Writes throwaway docs to a temp directory, so it never
# touches this checkout. Run from anywhere:
#
#   scripts/check-doc-index-test.sh
set -euo pipefail

guard="$(cd "$(dirname "$0")" && pwd)/check-doc-index.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

# expect <pass|fail> <name> <doc body>
expect() {
  local want="$1" name="$2" file="$tmp/$2.md"
  printf '%s\n' "$3" >"$file"
  if "$guard" "$file" 2>/dev/null; then got=pass; else got=fail; fi
  if [[ "$got" == "$want" ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected $want, got $got"
    failures=$((failures + 1))
  fi
}

head=$'# Doc\n\nIntro.\n\n## Contents\n'
good_index=$'- [Stack](#stack): what it runs on\n- [Local store and sync](#local-store-and-sync): Dexie and the engine\n- [Home «Дети» and the Child page](#home-дети-and-the-child-page): the Children'
body=$'\n## Stack\n\nText.\n\n## Local store and sync\n\n### A subsection\n\n```md\n## Not a heading\n```\n\n## Home «Дети» and the Child page\n\nText.'

expect pass matches "$head$good_index$body"
expect fail no-index "# Doc$body"
expect fail missing-entry "$head"$'- [Stack](#stack): what it runs on\n- [Local store and sync](#local-store-and-sync): Dexie'"$body"
expect fail extra-entry "$head$good_index"$'\n- [Gone](#gone): a section since removed'"$body"
expect fail wrong-order "$head"$'- [Local store and sync](#local-store-and-sync): Dexie\n- [Stack](#stack): what it runs on\n- [Home «Дети» and the Child page](#home-дети-and-the-child-page): the Children'"$body"
expect fail no-summary "$head"$'- [Stack](#stack)\n- [Local store and sync](#local-store-and-sync): Dexie\n- [Home «Дети» and the Child page](#home-дети-and-the-child-page): the Children'"$body"
expect fail wrong-anchor "$head"$'- [Stack](#the-stack): what it runs on\n- [Local store and sync](#local-store-and-sync): Dexie\n- [Home «Дети» and the Child page](#home-дети-and-the-child-page): the Children'"$body"
old='## Stack'
expect fail renamed-heading "$head$good_index${body/"$old"/## Tech stack}"

if [[ $failures -gt 0 ]]; then
  echo "check-doc-index-test: $failures case(s) failed" >&2
  exit 1
fi
