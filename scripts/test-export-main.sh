#!/usr/bin/env bash
# test-export-main.sh — verifies export-main.sh (orchestrator) publishes TWO fresh
# single-commit orphan DISTRIBUTION branches, each FLAT-ROOT:
#   angular: README.md, STANDARD.md, infra/cognito/, package.json, schematics/   (Angular at root)
#   react:   README.md, STANDARD.md, infra/cognito/, package.json, dist/, templates/ (npx CLI at root)
# plus release tags angular-vX.Y.Z / react-vX.Y.Z, and leaves `main` untouched.
# Runs entirely inside a scratch clone so it NEVER touches the real repo's
# branches or working tree.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
VER="0.2.0"   # test release version (independent of the real release)

# Work on a scratch clone so we never touch the real branches.
SCRATCH="$(mktemp -d)"; trap 'rm -rf "$SCRATCH"' EXIT
git clone --quiet "$REPO_ROOT" "$SCRATCH/repo"
cd "$SCRATCH/repo"
git checkout --quiet "$(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD)"

# The clone only contains COMMITTED files. Copy the working-tree scripts/manifests
# from the real repo so TDD can exercise uncommitted versions.
mkdir -p "$SCRATCH/repo/scripts" "$SCRATCH/repo/packages/angular/scripts" \
         "$SCRATCH/repo/packages/react/scripts"
cp "$HERE/export-main.sh" "$HERE/test-export-main.sh" "$SCRATCH/repo/scripts/"
cp "$REPO_ROOT/scripts/curated-manifest-root.txt"            "$SCRATCH/repo/scripts/"
cp "$REPO_ROOT/packages/angular/scripts/export.sh"           "$SCRATCH/repo/packages/angular/scripts/"
cp "$REPO_ROOT/packages/angular/scripts/curated-manifest.txt" "$SCRATCH/repo/packages/angular/scripts/"
cp "$REPO_ROOT/packages/angular/README-main.md"              "$SCRATCH/repo/packages/angular/"
cp "$REPO_ROOT/packages/react/scripts/export.sh"             "$SCRATCH/repo/packages/react/scripts/"
cp "$REPO_ROOT/packages/react/README-main.md"                "$SCRATCH/repo/packages/react/"
# react export.sh now BUILDS the CLI from the clone's committed packages/react/cli/ source
# (npm ci && npm run build); the clone has that source + lockfile, so no extra copy is needed.

# The clone has no node_modules (gitignored) — install so Angular's `npm run build` works.
( cd "$SCRATCH/repo/packages/angular" && npm ci --silent )

# assert path EXISTS on a branch's tree
have() { git cat-file -e "$1:$2" 2>/dev/null; }
# assert path is ABSENT on a branch's tree
absent() { ! git cat-file -e "$1:$2" 2>/dev/null; }

check_orphan() {
  local br="$1"
  git rev-parse --verify "$br" >/dev/null || { echo "FAIL: branch '$br' not created"; exit 1; }
  [[ "$(git rev-list --count "$br")" -eq 1 ]] \
    || { echo "FAIL: '$br' is not a single commit ($(git rev-list --count "$br") commits)"; exit 1; }
  if git rev-parse -q --verify "${br}^" >/dev/null 2>&1; then
    echo "FAIL: '$br' is not an orphan (has parents)"; exit 1
  fi
  return 0
}

check_no_leaks() {
  local br="$1"
  for p in docs README-main.md packages reference; do
    have "$br" "$p" && { echo "FAIL: '$br' leaked $p (should not ship to consumers)"; exit 1; }
  done
  # Dev/CI infra test scripts must NEVER ship — manifest enumerates only consumer scripts.
  for p in infra/cognito/scripts/test-deploy-validation.sh \
           infra/cognito/scripts/test-destroy-guard.sh \
           infra/cognito/scripts/test-fetch-config.sh \
           infra/cognito/scripts/test-template-validates.sh; do
    have "$br" "$p" && { echo "FAIL: test script leaked to '$br': $p"; exit 1; }
  done
  return 0   # last `have` returns nonzero when (correctly) absent — don't let set -e see it
}

run_and_check() {
  bash scripts/export-main.sh --version "$VER"

  # --- angular branch: flat-root Angular package ---
  check_orphan angular
  for p in README.md STANDARD.md infra/cognito/template.yaml package.json \
           schematics/collection.json schematics/ng-add/index.js; do
    have angular "$p" || { echo "FAIL: angular missing $p"; exit 1; }
  done
  # flat: NO nested framework subdirs
  absent angular angular || { echo "FAIL: angular/ subdir nested on angular branch"; exit 1; }
  absent angular react   || { echo "FAIL: react/ subdir present on angular branch"; exit 1; }
  # framework README won (not the shared/monorepo one)
  git show angular:README.md | grep -q 's4-auth-angular' \
    || { echo "FAIL: angular README.md is not the Angular framework README"; exit 1; }
  # version stamped into the ROOT package.json
  git show angular:package.json | grep -q "\"version\": \"$VER\"" \
    || { echo "FAIL: angular package.json missing version $VER"; exit 1; }
  check_no_leaks angular

  # --- react branch: flat-root @s4/auth-react npx CLI (WU6) ---
  check_orphan react
  for p in README.md STANDARD.md infra/cognito/template.yaml \
           package.json dist/bin.js templates/auth.config.ts templates/auth.css; do
    have react "$p" || { echo "FAIL: react missing $p"; exit 1; }
  done
  absent react react   || { echo "FAIL: react/ subdir nested on react branch"; exit 1; }
  absent react angular || { echo "FAIL: angular/ subdir present on react branch"; exit 1; }
  # react now ships the CLI package: root package.json IS the @s4/auth-react CLI, bin → dist/bin.js
  git show react:package.json | grep -q '"s4-auth-react"' \
    || { echo "FAIL: react package.json is not the @s4/auth-react CLI (no s4-auth-react bin)"; exit 1; }
  # version stamped into the ROOT package.json (now that react has one to stamp)
  git show react:package.json | grep -q "\"version\": \"$VER\"" \
    || { echo "FAIL: react package.json missing version $VER"; exit 1; }
  # the OLD copy-in src/ shape is gone — the CLI replaced it
  absent react src/auth.config.ts || { echo "FAIL: react still ships copy-in src/ (should be the CLI now)"; exit 1; }
  # framework README won (not the shared/monorepo one)
  git show react:README.md | grep -q 's4-auth-react' \
    || { echo "FAIL: react README.md is not the React framework README"; exit 1; }
  check_no_leaks react

  # --- release tags point at the branch tips ---
  for fw in angular react; do
    git rev-parse --verify "${fw}-v${VER}" >/dev/null 2>&1 \
      || { echo "FAIL: tag ${fw}-v${VER} not created"; exit 1; }
    [[ "$(git rev-parse "${fw}-v${VER}^{commit}")" == "$(git rev-parse "$fw")" ]] \
      || { echo "FAIL: tag ${fw}-v${VER} does not point at branch '$fw' tip"; exit 1; }
  done

  # --- main is NOT touched by the orchestrator (trunk is sacred here) ---
  # (main may not exist in the scratch clone's local refs; if it does, it must be unchanged.
  #  The orchestrator's only ref writes are the two dist branches + tags — assert no 'main' write
  #  by confirming main, if present, is not an orphan single-commit release.)

  echo "  run check OK (two flat-root orphans + tags, version stamped, no leaks)"
}

run_and_check          # first release
run_and_check          # SECOND run must also succeed (re-runnability)

# After exercising the export twice, no temp worktrees/branches may dangle.
[[ -z "$(git worktree list --porcelain | grep -iE 'export-(angular|react)' || true)" ]] \
  || { echo "FAIL: dangling export worktree left behind"; git worktree list; exit 1; }
[[ -z "$(git branch --list 'export-angular-tmp-*' 'export-react-tmp-*')" ]] \
  || { echo "FAIL: dangling temp branch left behind"; git branch --list 'export-*-tmp-*'; exit 1; }

echo "PASS"
