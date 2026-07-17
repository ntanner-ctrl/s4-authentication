#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STUB_DIR="$(mktemp -d)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR" "$WORK_DIR"' EXIT
cat > "$STUB_DIR/aws" <<'STUB'
#!/usr/bin/env bash
# Stub: emulate `describe-stacks --query "...OutputKey=='KEY'..." --output text`
# by switching on the requested key in the args.
args="$*"
case "$args" in
  *"OutputKey=='UserPoolId'"*)       echo "us-east-1_TEST123" ;;
  *"OutputKey=='UserPoolClientId'"*) echo "clientabc123" ;;
  *"OutputKey=='CognitoDomain'"*)    echo "acme-s4-auth.auth.us-east-1.amazoncognito.com" ;;
  *) echo "" ;;
esac
STUB
chmod +x "$STUB_DIR/aws"

run() { PATH="$STUB_DIR:$PATH" bash "$HERE/fetch-config.sh" "$@"; }

# --- default (paste-block) mode ---------------------------------------------
OUT="$(run --stack-name acme-prod-auth)"

echo "$OUT" | grep -q "userPoolId: 'us-east-1_TEST123'" || { echo "FAIL: userPoolId"; exit 1; }
echo "$OUT" | grep -q "clientId: 'clientabc123'"        || { echo "FAIL: clientId"; exit 1; }
echo "$OUT" | grep -q "cognitoDomain: 'acme-s4-auth.auth.us-east-1.amazoncognito.com'" \
  || { echo "FAIL: cognitoDomain"; exit 1; }
echo "PASS: default paste-block mode"

# --- --write SUCCESS case ----------------------------------------------------
# Target carries the three placeholder lines WITH trailing inline comments, plus
# unrelated content that must survive untouched.
TARGET="$WORK_DIR/auth.config.ts"
cat > "$TARGET" <<'TS'
export const authConfig = {
  providers: ['google'],
  userPoolId: '__USER_POOL_ID__', // CFN Output: UserPoolId
  clientId: '__USER_POOL_CLIENT_ID__', // CFN Output: UserPoolClientId
  cognitoDomain: '__COGNITO_HOSTED_DOMAIN__', // CFN Output: CognitoDomain
  postLoginRoute: '/home',
};
TS

run --stack-name acme-prod-auth --write "$TARGET" >/dev/null \
  || { echo "FAIL: --write success exited non-zero"; exit 1; }

grep -q "userPoolId: 'us-east-1_TEST123', // CFN Output: UserPoolId" "$TARGET" \
  || { echo "FAIL: --write userPoolId not replaced or comment lost"; exit 1; }
grep -q "clientId: 'clientabc123', // CFN Output: UserPoolClientId" "$TARGET" \
  || { echo "FAIL: --write clientId not replaced or comment lost"; exit 1; }
grep -q "cognitoDomain: 'acme-s4-auth.auth.us-east-1.amazoncognito.com', // CFN Output: CognitoDomain" "$TARGET" \
  || { echo "FAIL: --write cognitoDomain not replaced or comment lost"; exit 1; }
# Unrelated content preserved.
grep -q "postLoginRoute: '/home'," "$TARGET" || { echo "FAIL: --write clobbered unrelated content"; exit 1; }
grep -q "providers: \['google'\]," "$TARGET" || { echo "FAIL: --write clobbered unrelated content"; exit 1; }
echo "PASS: --write success replaces values + preserves comments and other content"

# --- --write IDEMPOTENCY (second run produces identical file) ----------------
BEFORE="$(cat "$TARGET")"
run --stack-name acme-prod-auth --write "$TARGET" >/dev/null \
  || { echo "FAIL: --write second run exited non-zero"; exit 1; }
AFTER="$(cat "$TARGET")"
[[ "$BEFORE" == "$AFTER" ]] || { echo "FAIL: --write not idempotent"; exit 1; }
echo "PASS: --write idempotent on second run"

# --- --write FAILURE case (target missing the expected lines) ----------------
BADTARGET="$WORK_DIR/unrelated.ts"
cat > "$BADTARGET" <<'TS'
export const somethingElse = { foo: 'bar' };
TS
BAD_BEFORE="$(cat "$BADTARGET")"

set +e
FAIL_OUT="$(run --stack-name acme-prod-auth --write "$BADTARGET" 2>&1)"
RC=$?
set -e

[[ $RC -ne 0 ]] || { echo "FAIL: --write on bad target should exit non-zero"; exit 1; }
echo "$FAIL_OUT" | grep -q "Wrote pool values" \
  && { echo "FAIL: --write on bad target falsely reported success"; exit 1; }
BAD_AFTER="$(cat "$BADTARGET")"
[[ "$BAD_BEFORE" == "$BAD_AFTER" ]] || { echo "FAIL: --write on bad target modified the file"; exit 1; }
echo "PASS: --write failure exits non-zero, no false success, file unchanged"

echo "ALL PASS"
