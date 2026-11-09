#!/usr/bin/env bash
# Self-test for scripts/check-error-codes.sh. Builds throwaway trees in a temp directory with the
# files the guard reads, so it never touches this checkout. Run from anywhere:
#
#   scripts/check-error-codes-test.sh
set -euo pipefail

guard="$(cd "$(dirname "$0")" && pwd)/check-error-codes.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

# A tree whose server sends list.owner_only (built over two lines), auth.required, internal.error
# (SERVER_ONLY) and the field code `required`; the client maps all but internal.error, plus
# network.unavailable (CLIENT_ONLY).
new_tree() {
  local tree="$tmp/$1"
  mkdir -p "$tree/backend/src/main/java/app" "$tree/web/src/shared/api" "$tree/web/src/shared/sync"
  cat >"$tree/backend/src/main/java/app/ListService.java" <<'EOF'
class ListService {
  ApiException ownerOnly() {
    return new ApiException(
        HttpStatus.FORBIDDEN, "list.owner_only");
  }
  String page() { return "index.html"; }
}
EOF
  cat >"$tree/backend/src/main/java/app/Errors.java" <<'EOF'
class Errors {
  ApiException a() { return new ApiException(HttpStatus.UNAUTHORIZED, "auth.required"); }
  ApiException b() { return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "internal.error"); }
}
EOF
  cat >"$tree/backend/src/main/java/app/FieldErrors.java" <<'EOF'
class FieldErrors {
  public static final String REQUIRED = "required";
}
EOF
  cat >"$tree/web/src/shared/api/errorMessages.ts" <<'EOF'
const ERROR_KEYS = {
  'network.unavailable': 'errors.networkUnavailable',
  'auth.required': 'errors.authRequired',
};
const FIELD_ERROR_KEYS = {
  required: 'errors.field.required',
};
EOF
  cat >"$tree/web/src/shared/sync/saveRejection.ts" <<'EOF'
const REJECTION_KEYS = {
  'list.owner_only': 'sync.rejected.listOwnerOnly',
} as const;
EOF
  echo "$tree"
}

expect() { # expect pass|fail <name> <tree>
  local want="$1" name="$2" tree="$3" out status=0
  out="$("$guard" "$tree" 2>&1)" || status=$?
  if { [[ "$want" == pass ]] && ((status == 0)); } || { [[ "$want" == fail ]] && ((status != 0)); }; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected $want, exit $status"
    sed 's/^/     | /' <<<"$out"
    failures=$((failures + 1))
  fi
}

tree="$(new_tree mapped)"
expect pass "every code mapped (multi-line ApiException, file names ignored, SERVER_ONLY, CLIENT_ONLY)" "$tree"

tree="$(new_tree wrapped)"
cat >"$tree/web/src/shared/sync/saveRejection.ts" <<'EOF'
const REJECTION_KEYS = {
  'list.owner_only':
    'sync.rejected.listOwnerOnly',
} as const;
EOF
expect pass "a map entry Prettier wrapped onto two lines" "$tree"

tree="$(new_tree unmapped)"
cat >>"$tree/backend/src/main/java/app/Errors.java" <<'EOF'
class More { ApiException c() { return new ApiException(HttpStatus.FORBIDDEN, "list.kind_immutable"); } }
EOF
expect fail "a server code with no client message" "$tree"

tree="$(new_tree unmapped-field)"
cat >"$tree/backend/src/main/java/app/FieldErrors.java" <<'EOF'
class FieldErrors {
  public static final String REQUIRED = "required";
  public static final String TOO_LONG = "too_long";
}
EOF
expect fail "a field code with no client message" "$tree"

tree="$(new_tree stale)"
cat >"$tree/web/src/shared/api/errorMessages.ts" <<'EOF'
const ERROR_KEYS = {
  'network.unavailable': 'errors.networkUnavailable',
  'auth.required': 'errors.authRequired',
  'child.deleted': 'errors.childDeleted',
};
const FIELD_ERROR_KEYS = {
  required: 'errors.field.required',
};
EOF
expect fail "a client code the server never sends" "$tree"

if ((failures > 0)); then
  echo "check-error-codes-test: $failures case(s) failed" >&2
  exit 1
fi
echo "check-error-codes-test: all cases passed"
