#!/usr/bin/env bash
# Screenshot guard: the screenshot routes interact as a person does, with Playwright's real
# clicks, taps and keys, never a faked one: no `dispatchEvent`, no `force: true`, no click inside
# `page.evaluate(…)`, `$eval(…)` or an `{eval: '…'}` step. A real click goes through layout (what
# is on top, where the target is); a faked one hides the bug that made the real click miss (#87:
# the row opened on focus and moved the Done circle, cb54171). A step that works only faked is a
# bug to report or fix. Comments are skipped. Runs in CI (job `migrations`) and in
# scripts/check.sh, from anywhere:
#
#   scripts/check-screens.sh            # scripts/screenshot/screens.mjs and helpers.mjs
#   scripts/check-screens.sh <file>...  # just these files (the self-test uses this)
#
# Self-test: scripts/check-screens-test.sh
set -euo pipefail

if [[ $# -gt 0 ]]; then
  files=("$@")
else
  dir="$(cd "$(dirname "$0")/screenshot" && pwd)"
  files=("$dir/screens.mjs" "$dir/helpers.mjs")
fi

found=0
for f in "${files[@]}"; do
  problems="$(perl -0777 -ne '
    # Blank out comments, keeping line breaks so line numbers still match.
    s{(/\*.*?\*/)}{ (my $c = $1) =~ s/[^\n]//g; $c }gse;
    s{^([ \t]*)//[^\n]*}{$1}gm;
    my $text = $_;
    sub line_of { my $pos = shift; return 1 + (substr($text, 0, $pos) =~ tr/\n//) }
    while ($text =~ /\bdispatchEvent\b/g) { print line_of($-[0]), ": dispatchEvent fakes the event\n" }
    while ($text =~ /\bforce\s*:\s*true\b/g) { print line_of($-[0]), ": force: true skips the checks a real click makes\n" }
    # The argument list of every evaluate( / $eval( / $$eval( call, paren-balanced.
    while ($text =~ /(?:\bevaluate|\$\$?eval)\s*\(/g) {
      my ($start, $depth, $i) = ($-[0], 1, pos($text));
      while ($depth > 0 && $i < length $text) {
        my $ch = substr($text, $i++, 1);
        $depth++ if $ch eq "(";
        $depth-- if $ch eq ")";
      }
      print line_of($start), ": a click inside evaluate is not a real click\n"
        if substr($text, $start, $i - $start) =~ /\bclick\s*\(/;
      pos($text) = $start + 1;
    }
    # {eval: "…"} steps.
    while ($text =~ /\beval\s*:\s*(["\x27`])(.*?)(?<!\\)\1/gs) {
      my ($at, $code) = ($-[0], $2);
      print line_of($at), ": a click inside an eval step is not a real click\n" if $code =~ /\bclick\s*\(/;
    }
  ' "$f")"
  if [[ -n "$problems" ]]; then
    sed "s|^|$f:|" <<<"$problems" >&2
    found=1
  fi
done

if [[ $found -eq 1 ]]; then
  echo "check-screens: interact with real Playwright clicks, taps and keys; a step that works only faked is a bug to report or fix (see the header of scripts/check-screens.sh)" >&2
  exit 1
fi
