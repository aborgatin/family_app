#!/usr/bin/env bash
# Doc index guard: each large doc agents read starts with a `## Contents` section listing every
# `##` heading, in order, as `- [Heading](#anchor): one line on what it covers`, so an agent reads
# the index and then only the sections for its area (the M4 retro, #94). Fails when the index and
# the headings differ (missing, extra, out of order, wrong anchor, no summary). Headings inside
# code fences don't count. Runs in CI (job `migrations`) and in scripts/check.sh, from anywhere:
#
#   scripts/check-doc-index.sh            # every docs/architecture/*.md and docs/design.md
#   scripts/check-doc-index.sh <file>...  # just these files (the self-test uses this)
#
# Self-test: scripts/check-doc-index-test.sh
set -euo pipefail

if [[ $# -gt 0 ]]; then
  files=("$@")
else
  cd "$(cd "$(dirname "$0")/.." && pwd)"
  files=(docs/architecture/*.md docs/design.md)
fi

found=0
for f in "${files[@]}"; do
  # Prints one line per problem; GitHub's anchor: lower case, punctuation dropped, spaces to `-`.
  problems="$(perl -CSD -Mutf8 -ne '
    BEGIN { @headings = (); @entries = (); $fence = 0; $in = 0; $has = 0 }
    if (/^```/) { $fence = !$fence; next }
    next if $fence;
    if (/^## (.+?)\s*$/) {
      if ($1 eq "Contents") { $in = 1; $has = 1; next }
      $in = 0;
      push @headings, $1;
      next;
    }
    if ($in && /^- /) {
      if (/^- \[(.+?)\]\(#([^)]+)\): \S/) { push @entries, [$1, $2] }
      else { chomp; print "index line without `- [Heading](#anchor): summary`: $_\n" }
    }
    END {
      print "no `## Contents` index\n" unless $has;
      for my $i (0 .. ($#headings > $#entries ? $#headings : $#entries)) {
        my $h = $headings[$i];
        my ($e, $a) = @{ $entries[$i] // [] };
        if (!defined $e) { print "heading `## $h` is missing from the index\n"; next }
        if (!defined $h) { print "index entry `$e` has no `##` heading\n"; next }
        if ($h ne $e) { print "index entry ".($i + 1)." is `$e`, the heading is `## $h`\n"; next }
        (my $slug = lc $h) =~ s/[^\p{L}\p{N}\s_-]//g;
        $slug =~ s/\s/-/g;
        print "index entry `$e` links #$a, the heading is #$slug\n" if $a ne $slug;
      }
    }' "$f")"
  if [[ -n "$problems" ]]; then
    sed "s|^|$f: |" <<<"$problems" >&2
    found=1
  fi
done

if [[ $found -eq 1 ]]; then
  echo "check-doc-index: update the doc's \`## Contents\` index to match its \`##\` headings (see the header of scripts/check-doc-index.sh)" >&2
  exit 1
fi
