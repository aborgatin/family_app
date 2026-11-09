#!/usr/bin/env bash
# Error-code guard (CODING_STANDARDS I3): every error code the server can send has a message in the
# web client, and the client maps no code the server no longer sends. Fails when
#   - a code in backend/src/main has no line in the client's maps: ERROR_KEYS / FIELD_ERROR_KEYS
#     (web/src/shared/api/errorMessages.ts) or REJECTION_KEYS (web/src/shared/sync/saveRejection.ts),
#     and isn't in SERVER_ONLY below, or
#   - a client map has a code the server never sends and that isn't in CLIENT_ONLY below.
# Server codes are the dotted string literals in backend/src/main ("list.owner_only", wherever the
# ApiException is built) plus the field codes declared in FieldErrors.java ("required", ...).
# Runs in CI (job `migrations`) and in scripts/check.sh, from any directory:
#
#   scripts/check-error-codes.sh          # this checkout
#   scripts/check-error-codes.sh <root>   # another tree laid out the same way (the self-test)
#
# Self-test: scripts/check-error-codes-test.sh
set -euo pipefail
export LC_ALL=C # sort and comm agree on order on macOS and Linux

root="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
main="$root/backend/src/main"
maps=("$root/web/src/shared/api/errorMessages.ts" "$root/web/src/shared/sync/saveRejection.ts")

# Codes the server sends that rightly show the generic message: a client bug or a server fault the
# Member can do nothing about. One per line: code, then the reason.
SERVER_ONLY="
internal.error       server fault: the generic message is all the Member can use
request.invalid      malformed request: a client bug, not something the Member can fix
method.not_allowed   wrong HTTP method: a client bug
sync.table_unknown   push to an unknown table: a client bug
"

# Codes only the client produces (no server literal). Same format.
CLIENT_ONLY="
network.unavailable  the client's own code for a request that never reached the server
"

codes_of() { awk 'NF { print $1 }' <<<"$1" | sort -u; }

server_codes() {
  {
    # Dotted literals, minus file names ("index.html").
    grep -rhoE '"[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+"' "$main" --include='*.java' |
      tr -d '"' | grep -vE '\.(html|js|css|json|sql|txt|png|svg|ico)$' || true
    # Field codes, dotted or not, declared in FieldErrors.
    find "$main" -name FieldErrors.java -exec \
      sed -nE 's/.*static final String [A-Z_]+ = "([a-z_.]+)";.*/\1/p' {} + || true
  } | sort -u
}

client_codes() {
  # Map entries `'list.owner_only': 'sync.rejected.listOwnerOnly',` or `required: 'errors.…',`, also
  # when Prettier wraps the value onto the next line (\x27 is a single quote).
  perl -0777 -ne 'print "$1\n" while /^[ \t]*\x27?([a-z][a-z0-9_.]*)\x27?:\s*\x27[A-Za-z0-9_.]+\x27,?[ \t]*$/mg' \
    "${maps[@]}" | sort -u
}

server="$(server_codes)"
client="$(client_codes)"
failures=0

unmapped="$(comm -23 <(echo "$server") <(echo "$client") | comm -23 - <(codes_of "$SERVER_ONLY"))"
if [[ -n "$unmapped" ]]; then
  echo "check-error-codes: the server sends codes the web client has no message for (I3):" >&2
  sed 's/^/  /' <<<"$unmapped" >&2
  echo "  Add each to ERROR_KEYS / FIELD_ERROR_KEYS (shared/api/errorMessages.ts) or" >&2
  echo "  REJECTION_KEYS (shared/sync/saveRejection.ts) with an i18n key, or to SERVER_ONLY in" >&2
  echo "  $0 with the reason the generic message is right." >&2
  failures=1
fi

stale="$(comm -13 <(echo "$server") <(echo "$client") | comm -23 - <(codes_of "$CLIENT_ONLY"))"
if [[ -n "$stale" ]]; then
  echo "check-error-codes: the web client maps codes the server never sends:" >&2
  sed 's/^/  /' <<<"$stale" >&2
  echo "  Remove the line (and its i18n key), or add the code to CLIENT_ONLY in $0." >&2
  failures=1
fi

((failures == 0)) && echo "check-error-codes: every server error code has a client message"
exit "$failures"
