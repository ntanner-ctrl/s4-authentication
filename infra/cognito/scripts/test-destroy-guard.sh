#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Stub aws: any invocation prints AWS-CALLED so we can assert the guard fires
# BEFORE any aws call (the gate must short-circuit on confirm-name mismatch).
STUB_DIR="$(mktemp -d)"; trap 'rm -rf "$STUB_DIR"' EXIT
cat > "$STUB_DIR/aws" <<'STUB'
#!/usr/bin/env bash
echo "AWS-CALLED" >&2; exit 0
STUB
chmod +x "$STUB_DIR/aws"

# assert_guard <label> <args...> — expects exit 3 and NO aws call.
assert_guard() {
  local label="$1"; shift
  set +e
  local out rc
  out="$(PATH="$STUB_DIR:$PATH" bash "$HERE/destroy.sh" "$@" 2>&1)"
  rc=$?
  set -e
  [[ $rc -eq 3 ]] || { echo "FAIL [$label]: expected exit 3, got $rc"; exit 1; }
  echo "$out" | grep -q "AWS-CALLED" && { echo "FAIL [$label]: aws was called despite guard"; exit 1; }
  echo "ok: $label"
}

# prod with a WRONG confirmation name must refuse (exit 3) and never call aws.
assert_guard "prod + wrong --confirm-name" \
  --client acme --environment prod --confirm-name WRONG

# Uniform gate: a NON-prod env with a wrong --confirm-name must ALSO refuse.
assert_guard "staging + wrong --confirm-name" \
  --client acme --environment staging --confirm-name WRONG

# Uniform gate: a NON-prod env with a MISSING --confirm-name must ALSO refuse.
assert_guard "dev + missing --confirm-name" \
  --client acme --environment dev

echo "PASS"
