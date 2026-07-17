#!/usr/bin/env bash
# export.sh — stage the Angular package payload into $1 (a dir the orchestrator owns).
# Called by the top-level scripts/export-main.sh orchestrator.
# Does NOT publish anything — that is the orchestrator's job.
set -euo pipefail
TARGET="${1:?usage: export.sh <target-dir>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PKG="$REPO_ROOT/packages/angular"
MANIFEST="$PKG/scripts/curated-manifest.txt"
[[ -f "$MANIFEST" ]] || { echo "ERROR: manifest not found: $MANIFEST" >&2; exit 1; }

echo "Building Angular schematics (.js)..."
( cd "$PKG" && npm run build >/dev/null )

while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%%#*}"; line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  src="$(printf '%s' "${line%%->*}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  dst="$(printf '%s' "${line#*->}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -z "$src" || -z "$dst" || "$src" == "$line" ]] && { echo "ERROR: malformed manifest line: $raw" >&2; exit 1; }
  abs_src="$REPO_ROOT/$src"
  [[ -e "$abs_src" ]] || { echo "ERROR: manifest source not found: $src" >&2; exit 1; }
  mkdir -p "$(dirname "$TARGET/$dst")"
  cp -R "$abs_src" "$TARGET/$dst"
done < "$MANIFEST"
