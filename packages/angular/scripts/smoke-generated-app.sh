#!/usr/bin/env bash
# smoke-generated-app.sh — e2e: scaffold a stock Ng17 standalone app, install the packed
# schematic, run ng-add, and ng build the result. Catches import/export/Amplify-API drift
# that string-level specs miss. Needs network + @angular/cli. Slow (minutes).
#
# Source package: packages/angular/ (renamed from packages/s4-auth-angular/ 2026-06-17).
# The npm package NAME remains s4-auth-angular — the schematic generator token
# (ng g s4-auth-angular:ng-add) and tarball glob (s4-auth-angular-*.tgz) are UNCHANGED.
set -euo pipefail
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
echo "smoke: working in $WORK"

# 1. Pack the schematic into a tarball.
( cd "$PKG" && npm run build >/dev/null && npm pack --pack-destination "$WORK" >/dev/null )
TARBALL="$(ls "$WORK"/s4-auth-angular-*.tgz 2>/dev/null | head -1)"
[[ -n "$TARBALL" && -f "$TARBALL" ]] || { echo "ERROR: npm pack produced no tarball in $WORK" >&2; exit 1; }

# 2. Scaffold a stock Angular 17 standalone app (no routing prompt; standalone is default).
# CLI pinned to 17 to match the schematics devDependency target (package.json).
( cd "$WORK" && npx --yes @angular/cli@17 new smokeapp \
    --routing --style=css --ssr=false --skip-git --skip-tests --defaults >/dev/null )
APP="$WORK/smokeapp"

# 3. Install the tarball and run the ng-add schematic with sample values.
( cd "$APP" && npm i "$TARBALL" >/dev/null \
    && npx ng g s4-auth-angular:ng-add \
         --user-pool-id=us-east-1_SMOKE --client-id=smokeclient \
         --cognito-domain=smoke.auth.us-east-1.amazoncognito.com --providers=google \
       >/dev/null )

# 4. The real check: the generated tree must compile.
( cd "$APP" && npx ng build >/dev/null )
echo "SMOKE PASS: generated app compiled (ng build succeeded)."
