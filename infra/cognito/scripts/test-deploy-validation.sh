#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# With NO IdP credentials, deploy must refuse BEFORE calling aws (exit 2, clear msg).
set +e
OUT="$(bash "$HERE/deploy.sh" --client acme --environment dev \
  --callback-domain acme.example.net --domain-prefix acme-s4-auth \
  --owner ops@acme.com --dry-run 2>&1)"
RC=$?
set -e
[[ $RC -eq 2 ]] || { echo "FAIL: expected exit 2 for no-IdP, got $RC"; exit 1; }
echo "$OUT" | grep -qi "at least one" || { echo "FAIL: missing IdP-required message"; exit 1; }
echo "PASS"
