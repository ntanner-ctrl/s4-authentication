#!/usr/bin/env bash
# smoke-react.sh — end-to-end smoke for the @s4/auth-react npx CLI (WU6).
#
# Builds the CLI once, then drives the REAL `dist/bin.js` against four targets — the paths a
# vusion-style dev actually hits — and asserts the spec's WU6 acceptance criteria:
#   1. greenfield (empty dir)      → scaffold + install + wire; `npm run build` (tsc + vite) green,
#                                     entry routed to /login.
#   2. brownfield (vusion shape)   → routerless main.tsx wrapped in the auth router; App.tsx UNTOUCHED.
#   3. router in App.tsx (Shape 2) → entry wired, App.tsx's <BrowserRouter> unwrapped + App.tsx.bak
#                                     written, adapter imports adopt react-router-dom; build green.
#                                     This is the F5 headline case — the one that used to double-router.
#   4. router in entry (Shape 3)   → entry rebuilt around the existing router, App.tsx UNTOUCHED; build
#                                     green. React Router's own quickstart layout.
#   5. unsupported shape (data)    → createBrowserRouter data mode → entry left BYTE-IDENTICAL +
#                                     bail-to-checklist printed (an auth boundary: when in doubt, mutate
#                                     nothing). A genuinely unhandled shape, unlike 3/4.
#   6. idempotency (re-run)        → exits non-zero, warns "already installed", clobbers nothing.
#
# Needs network + node/npm/npx. Takes several minutes (one scaffold + four npm installs).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CLI="$REPO_ROOT/packages/react/cli"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
echo "smoke-react: working in $WORK"

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }
sha()  { sha256sum "$1" | cut -d' ' -f1; }

# Build the CLI under test (bundle adapter from reference/ -> templates/, then tsc -> dist/).
echo "== building @s4/auth-react CLI =="
( cd "$CLI" && npm ci --silent && npm run build >/dev/null )
BIN="$CLI/dist/bin.js"
[[ -f "$BIN" ]] || fail "CLI build produced no $BIN"

# Non-secret placeholder Cognito values — fully non-interactive with --yes (required values via
# flags; optional providers/route fall back to template defaults).
COG=(--user-pool-id us-east-1_SMOKEpool
     --client-id smokeClientId0000000000000
     --cognito-domain smoke.auth.us-east-1.amazoncognito.com
     --region us-east-1)

# ---------------------------------------------------------------------------------------------
echo "== scenario 1: greenfield (empty dir) — scaffold + install + wire, build green =="
G="$WORK/greenfield"
OUT1="$(node "$BIN" "$G" --yes "${COG[@]}" 2>&1)"; echo "$OUT1"

[[ -f "$G/src/auth.config.ts" ]] || fail "[1] adapter not copied (no src/auth.config.ts)"
grep -q "VITE_USER_POOL_ID" "$G/.env.local" || fail "[1] .env.local missing VITE_USER_POOL_ID"
grep -q "RequireAuth" "$G/src/main.tsx"      || fail "[1] entry not wired (no RequireAuth)"
grep -q '"/login"' "$G/src/main.tsx"         || fail "[1] entry has no /login route"
# A scaffolded app must be recognized as greenfield — show the "boots to /login" summary, not the
# brownfield "replace your existing login" checklist (guards the create-vite pristine detector).
echo "$OUT1" | grep -q "Boots to /login" || fail "[1] greenfield summary missing — scaffold misclassified as brownfield?"
echo "$OUT1" | grep -q "REQUIRED next"   && fail "[1] greenfield run printed the BROWNFIELD checklist"
# tsc -b + vite build (create-vite's own build script) — the real typecheck+build gate.
( cd "$G" && npm run build ) || fail "[1] greenfield app failed to typecheck/build"
echo "  [1] OK — scaffolded, classified greenfield, wired, builds, routed to /login"

# ---------------------------------------------------------------------------------------------
echo "== scenario 2: brownfield vusion-shape — routerless main.tsx gets wrapped, App.tsx untouched =="
B="$WORK/brownfield"; mkdir -p "$B/src"
cat > "$B/package.json" <<'JSON'
{
  "name": "brownfield-fixture",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "build": "tsc -b && vite build" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
JSON
# Vite config + tsconfig so the CLI classifies this as a real Vite + TS app (not pristine).
cat > "$B/vite.config.ts" <<'TS'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
TS
cat > "$B/tsconfig.json" <<'JSON'
{ "compilerOptions": { "target": "ES2020", "lib": ["ES2020", "DOM", "DOM.Iterable"], "jsx": "react-jsx", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "skipLibCheck": true, "noUnusedLocals": true } }
JSON
cat > "$B/index.html" <<'HTML'
<!doctype html><html><body><div id="root"></div>
<script type="module" src="/src/main.tsx"></script></body></html>
HTML
# Routerless entry — vusion's actual shape: createRoot(...).render(<App />), no router.
cat > "$B/src/main.tsx" <<'TSX'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
TSX
# A non-pristine App (no "Vite + React" marker) so it classifies as a brownfield app.
cat > "$B/src/App.tsx" <<'TSX'
import { useState } from 'react'

export default function App() {
  const [isLoggedIn] = useState(false)
  return <div>{isLoggedIn ? 'home' : 'please log in'}</div>
}
TSX
APP_BEFORE="$(sha "$B/src/App.tsx")"

node "$BIN" "$B" --yes "${COG[@]}"

grep -q "RequireAuth"              "$B/src/main.tsx" || fail "[2] main.tsx not wrapped (no RequireAuth)"
grep -q '"/login"'                 "$B/src/main.tsx" || fail "[2] main.tsx missing /login route"
grep -q '"/auth/callback"'         "$B/src/main.tsx" || fail "[2] main.tsx missing /auth/callback route"
grep -q "BrowserRouter"            "$B/src/main.tsx" || fail "[2] main.tsx missing BrowserRouter"
[[ "$(sha "$B/src/App.tsx")" == "$APP_BEFORE" ]] || fail "[2] App.tsx was mutated — codemod must touch ONLY the entry"
echo "  [2] OK — entry wrapped, App.tsx byte-identical"

# ---------------------------------------------------------------------------------------------
echo "== scenario 3: router in App.tsx (Shape 2) — entry wired, App.tsx BrowserRouter unwrapped, build green =="
S2="$WORK/router-in-app"; mkdir -p "$S2/src"
# package.json declares react-router-dom (the app's router) so the installer adopts it (F4) and the
# post-unwrap App.tsx typechecks against it.
cat > "$S2/package.json" <<'JSON'
{
  "name": "router-in-app-fixture",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "build": "tsc -b && vite build" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^7.1.0" },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
JSON
cp "$B/vite.config.ts" "$S2/vite.config.ts"
cp "$B/tsconfig.json" "$S2/tsconfig.json"
cp "$B/index.html" "$S2/index.html"
# The F5 headline layout: bare createRoot(<App/>) entry, router lives ONE LEVEL DOWN in App.tsx.
cat > "$S2/src/main.tsx" <<'TSX'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
TSX
cat > "$S2/src/App.tsx" <<'TSX'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function Home() {
  return <div>home</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
TSX

node "$BIN" "$S2" --yes "${COG[@]}"

grep -q "RequireAuth"        "$S2/src/main.tsx" || fail "[3] entry not wired (no RequireAuth)"
grep -q '"/auth/callback"'   "$S2/src/main.tsx" || fail "[3] entry missing /auth/callback route"
grep -q 'react-router-dom'   "$S2/src/main.tsx" || fail "[3] entry did not adopt the app's router package (F4)"
# Check the JSX TAG, not the bare word: the (now-unused) import line still names BrowserRouter.
grep -q "<BrowserRouter"     "$S2/src/App.tsx"  && fail "[3] App.tsx still renders a <BrowserRouter> — unwrap failed → double router"
[[ -f "$S2/src/App.tsx.bak" ]]                  || fail "[3] no App.tsx.bak — the app's original file must be backed up before mutation"
grep -q "<BrowserRouter"     "$S2/src/App.tsx.bak" || fail "[3] App.tsx.bak should hold the ORIGINAL (with the <BrowserRouter> tag)"
grep -q "from 'react-router-dom'" "$S2/src/auth/RequireAuth.tsx" || fail "[3] adapter imports not rewritten to react-router-dom (F4)"
( cd "$S2" && npm run build ) || fail "[3] wired Shape-2 app failed to typecheck/build — the unwrap produced invalid output"
echo "  [3] OK — entry wired, App.tsx unwrapped (single router), .bak saved, build green"

# ---------------------------------------------------------------------------------------------
echo "== scenario 4: router in entry (Shape 3) — entry rebuilt, App.tsx untouched, build green =="
S3="$WORK/router-in-entry"; mkdir -p "$S3/src"
# Own fresh package.json — NOT a copy of $S2's, which scenario 3's install mutated (added the
# adapter deps). Copying a post-install manifest into a node_modules-less dir makes the installer
# skip `npm install` (deps "already present"), leaving tsc uninstalled.
cat > "$S3/package.json" <<'JSON'
{
  "name": "router-in-entry-fixture",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "build": "tsc -b && vite build" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^7.1.0" },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
JSON
cp "$B/vite.config.ts" "$S3/vite.config.ts"
cp "$B/tsconfig.json" "$S3/tsconfig.json"
cp "$B/index.html" "$S3/index.html"
# React Router's own quickstart: the router lives IN the entry, wrapping <App/>.
cat > "$S3/src/main.tsx" <<'TSX'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
TSX
cat > "$S3/src/App.tsx" <<'TSX'
import { Routes, Route } from 'react-router-dom'

function Home() {
  return <div>home</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
TSX
APP3_BEFORE="$(sha "$S3/src/App.tsx")"

node "$BIN" "$S3" --yes "${COG[@]}"

grep -q "RequireAuth"      "$S3/src/main.tsx" || fail "[4] entry not wired (no RequireAuth)"
grep -q "AuthRoot"         "$S3/src/main.tsx" || fail "[4] entry missing AuthRoot"
[[ "$(sha "$S3/src/App.tsx")" == "$APP3_BEFORE" ]] || fail "[4] App.tsx was mutated — Shape 3 rebuilds ONLY the entry"
[[ ! -f "$S3/src/App.tsx.bak" ]] || fail "[4] Shape 3 wrote an App.tsx.bak — it must not touch App.tsx"
( cd "$S3" && npm run build ) || fail "[4] wired Shape-3 app failed to typecheck/build"
echo "  [4] OK — entry rebuilt around the router, App.tsx untouched, build green"

# ---------------------------------------------------------------------------------------------
echo "== scenario 5: genuinely unsupported (data-mode router) — zero mutation + checklist =="
U="$WORK/unsupported"; mkdir -p "$U/src"
cp "$B/package.json" "$U/package.json"
cp "$B/vite.config.ts" "$U/vite.config.ts"
cp "$B/tsconfig.json" "$U/tsconfig.json"
cp "$B/index.html" "$U/index.html"
cp "$B/src/App.tsx" "$U/src/App.tsx"
# Data-mode createBrowserRouter is a shape the taxonomy deliberately does NOT handle → bail, mutate nothing.
cat > "$U/src/main.tsx" <<'TSX'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'

const router = createBrowserRouter([{ path: '/', element: <App /> }])
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
TSX
MAIN_BEFORE="$(sha "$U/src/main.tsx")"

OUT5="$(node "$BIN" "$U" --yes "${COG[@]}" 2>&1)"; echo "$OUT5"

[[ "$(sha "$U/src/main.tsx")" == "$MAIN_BEFORE" ]] || fail "[5] entry was mutated — unsupported shape MUST be left untouched"
[[ ! -f "$U/src/App.tsx.bak" ]] || fail "[5] bail path wrote an App.tsx.bak — it must mutate nothing"
echo "$OUT5" | grep -qi "not auto-wired" || fail "[5] expected a bail-to-checklist message ('not auto-wired')"
echo "  [5] OK — entry untouched, checklist printed"

# ---------------------------------------------------------------------------------------------
echo "== scenario 6: idempotency — re-run on an installed app no-ops, clobbers nothing =="
CONFIG_BEFORE="$(sha "$G/src/auth.config.ts")"
set +e
OUT4="$(node "$BIN" "$G" --yes "${COG[@]}" 2>&1)"; CODE4=$?
set -e
echo "$OUT4"
[[ "$CODE4" -ne 0 ]] || fail "[6] re-run should exit non-zero (already installed)"
echo "$OUT4" | grep -qi "already installed" || fail "[6] expected an 'already installed' warning"
[[ "$(sha "$G/src/auth.config.ts")" == "$CONFIG_BEFORE" ]] || fail "[6] re-run clobbered src/auth.config.ts"
echo "  [6] OK — re-run bailed cleanly, no clobber"

echo ""
echo "SMOKE PASS: all 6 @s4/auth-react CLI scenarios green."
