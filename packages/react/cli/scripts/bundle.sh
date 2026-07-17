#!/usr/bin/env bash
# bundle.sh — copy the canonical adapter source into the CLI's templates/ dir at build time,
# so the published CLI is self-contained.
#
# SINGLE SOURCE OF TRUTH: the adapter is bundled FROM reference/react-oidc/ — never hand-forked
# into the CLI. Re-runnable: templates/ is wiped and rebuilt on each invocation.
#
# Mirrors packages/react/scripts/export.sh conventions (set -euo pipefail, git-rooted paths,
# fail-fast on a missing source). templates/ is a build artifact and is gitignored.
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/reference/react-oidc"
CLI="$REPO_ROOT/packages/react/cli"
DST="$CLI/templates"

[[ -d "$SRC" ]] || { echo "ERROR: adapter source not found: $SRC" >&2; exit 1; }

# What gets bundled: the adapter source files only — not node_modules, lockfile, or the
# reference harness's package.json/tsconfig (the CLI synthesizes target config itself).
ITEMS=(
  "auth.config.ts"
  "auth"
  "login"
  "auth.css"
  "vite-env.d.ts"
)

rm -rf "$DST"
mkdir -p "$DST"

for item in "${ITEMS[@]}"; do
  abs_src="$SRC/$item"
  [[ -e "$abs_src" ]] || { echo "ERROR: expected adapter item not found: reference/react-oidc/$item" >&2; exit 1; }
  cp -R "$abs_src" "$DST/$item"
done

echo "bundled adapter source -> packages/react/cli/templates/ (from reference/react-oidc/)"
