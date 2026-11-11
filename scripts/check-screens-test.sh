#!/usr/bin/env bash
# Self-test for scripts/check-screens.sh. Writes throwaway screens files to a temp directory, so it
# never touches this checkout. Run from anywhere:
#
#   scripts/check-screens-test.sh
set -euo pipefail

guard="$(cd "$(dirname "$0")" && pwd)/check-screens.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

# expect <pass|fail> <name> <screens.mjs body>
expect() {
  local want="$1" name="$2" file="$tmp/$2.mjs"
  printf '%s\n' "$3" >"$file"
  if "$guard" "$file" 2>/dev/null; then got=pass; else got=fail; fi
  if [[ "$got" == "$want" ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected $want, got $got"
    failures=$((failures + 1))
  fi
}

expect fail dispatch-event $'steps: [async (page) => {\n  await page.locator(\'role=checkbox\').dispatchEvent(\'click\');\n}]'
expect fail force-true $'await page.locator(\'role=checkbox\').click({ force: true });'
expect fail force-true-no-space $'await row.tap({force:true});'
expect fail click-in-evaluate $'await page.evaluate(() => document.querySelector(\'button\').click());'
expect fail click-in-multiline-evaluate $'await page.evaluate(() => {\n  const b = document.querySelector(\'button\');\n  b.click();\n});'
expect fail click-in-eval-step $'steps: [{ eval: "document.querySelector(\'button\').click()" }]'
expect fail click-in-dollar-eval $'await page.$eval(\'button\', (b) => b.click());'
expect pass real-click $'await page.locator(\'role=button[name="Удалить"]\').click();\nawait page.evaluate(() => window.scrollBy(0, 200));'
expect pass eval-step-without-click $'steps: [{ eval: "window.scrollTo(0, 120)" }, { click: \'role=button\' }]'
expect pass force-false $'await row.click({ force: false });'
expect pass comment-mentions-it $'// a dispatchEvent or { force: true } click hides a layout bug\nawait row.click();'

if [[ $failures -gt 0 ]]; then
  echo "check-screens-test: $failures case(s) failed" >&2
  exit 1
fi
