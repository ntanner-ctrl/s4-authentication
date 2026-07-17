#!/usr/bin/env bash
# export.sh — stage the React installer payload (the @s4/auth-react npx CLI) into $1.
# Called by the top-level scripts/export-main.sh orchestrator. Does NOT publish — that is
# the orchestrator's job (it commits $1 as a flat-root orphan + tag).
#
# WU6: the `react` distribution branch ships the BUNDLED npx CLI at its root, NOT the raw
# copy-in source it used to. `npx git+<repo>#react` installs the repo ROOT of the ref and runs
# the package `bin`, so the root must be a resolvable npm package: package.json (bin → dist/bin.js)
# + the built dist/ + the adapter templates/ bundled from reference/react-oidc/. We therefore
# BUILD the CLI here and stage its published artifacts — consumers run it with zero build step.
#
# Mirrors the repo's staging conventions: set -euo pipefail, git-rooted paths, fail-fast on a
# missing input or a missing post-build artifact.
set -euo pipefail
TARGET="${1:?usage: export.sh <target-dir>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
CLI="$REPO_ROOT/packages/react/cli"
README="$REPO_ROOT/packages/react/README-main.md"

[[ -d "$CLI" ]]    || { echo "ERROR: CLI package not found: $CLI" >&2; exit 1; }
[[ -f "$README" ]] || { echo "ERROR: React README not found: $README" >&2; exit 1; }

# 1. Build the CLI: bundle.sh copies the adapter FROM reference/react-oidc/ -> templates/ (single
#    source of truth, never forked), then tsc emits dist/. `npm ci` for a reproducible release
#    build — devDeps (typescript) are needed only to build here; the shipped package needs none.
echo "[react] building @s4/auth-react CLI (npm ci && npm run build)…"
( cd "$CLI" && npm ci && npm run build )

# 2. Stage the published payload at the target ROOT (flat layout npm/npx needs): the npm manifest
#    + lockfile, the built bin (dist/), and the bundled adapter (templates/). package.json's
#    "files" is ["dist","templates"]; we add the lockfile for a reproducible consumer install.
for item in package.json package-lock.json dist templates; do
  src="$CLI/$item"
  [[ -e "$src" ]] || { echo "ERROR: expected CLI payload missing after build: $item" >&2; exit 1; }
  rm -rf "$TARGET/$item"
  cp -R "$src" "$TARGET/$item"
done

# 3. Framework README at root. Overwrites the shared-root README the orchestrator stages first —
#    each distribution branch is a self-contained, framework-specific home.
cp "$README" "$TARGET/README.md"

echo "[react] staged @s4/auth-react CLI payload at $TARGET (package.json + dist + templates + README)"
