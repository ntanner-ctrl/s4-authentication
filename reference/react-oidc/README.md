# `reference/react-oidc/` — S4 Auth Contract, React adapter

The React binding of [`STANDARD.md`](../../STANDARD.md), built on
[`react-oidc-context`](https://github.com/authts/react-oidc-context) +
`oidc-client-ts` + [React Router v7](https://reactrouter.com/) (works in both
declarative and data modes — both import from `react-router`). Sibling of
`reference/angular-amplify-v6/`.
This is **canonical source to copy from**, not an installable package — it
type-checks in isolation (`npm run typecheck`) but does not boot. Runtime
behavior was validated when apps adopted it (see "Runtime-verified").

## Files
| File | Realizes |
|---|---|
| `auth.config.ts` | Config Vocabulary binding; Cognito authority + `/logout` URL |
| `auth/AuthRoot.tsx` | `<AuthProvider>` bootstrap |
| `auth/useAuthService.ts` | signIn (C1/C8), logout (C4), token getters (C2) |
| `auth/useIdleTimeout.ts` | C3 idle timeout |
| `auth/RequireAuth.tsx` | C7 fail-closed guard, C6 returnUrl |
| `auth/RequireRole.tsx` | claim-based authz on verified token |
| `login/LoginPage.tsx` | C8 provider-from-config card |
| `login/CallbackPage.tsx` | C5 callback history replacement, C6 landing |
| `auth.css` | Standardized branded login card (gradient page, card, inlined provider marks) — matches the Angular adapter |

## Clause coverage
| Clause | How |
|---|---|
| C1 code+PKCE/S256 | oidc-client-ts default; implicit never used |
| C2 JWKS verify + storage | library validates id_token vs issuer JWKS; `userStore` = `localStorage` (fleet default; survives reload) |
| C3 silent refresh | `automaticSilentRenew` |
| C3 idle timeout | `useIdleTimeout` (hand-authored) |
| C4 complete logout | `revokeTokens(['refresh_token'])` + `removeUser` + Cognito `/logout` redirect |
| C5 callback history | `onSigninCallback` replaceState + callback replace-nav |
| C6 post-login route | `resolvePostLoginTarget` + returnUrl in OAuth `state` |
| C7 fail-closed guards | `RequireAuth` (no kill-switch) |
| C8 providers/scopes | config-driven `scope` + per-provider `identity_provider` |

## Configure
`auth.config.ts` needs four deploy-specific values from your Cognito stack's CFN
`Outputs`. None are secrets — all four ship in the browser bundle. Supply them
**one** of three ways. Pick one; do **not** do both.

**Option A — Vite env vars (recommended).** Create a single `.env.local` in your
project root with the four `VITE_*` vars below. `auth.config.ts` reads
`import.meta.env.VITE_*` at build time. One file is enough: `.env.local` is
git-ignored by the default Vite `.gitignore` (the `*.local` rule), so it stays out
of version control — a plain `.env` would be committed, so prefer `.env.local`.

```dotenv
# .env.local — values from your Cognito stack's CFN Outputs
VITE_USER_POOL_ID=us-east-1_xxxxxxxxx                                   # Output: UserPoolId
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx                     # Output: UserPoolClientId
VITE_COGNITO_HOSTED_DOMAIN=REPLACE-ME.auth.us-east-1.amazoncognito.com  # Output: CognitoDomain (bare host, no scheme)
VITE_AWS_REGION=us-east-1
```

> **`VITE_COGNITO_HOSTED_DOMAIN` is the Cognito hosted-UI domain — copy the `CognitoDomain`
> Output verbatim.** Its prefix is whatever the pool was created with; it is **not** your app's
> subdomain, so don't infer it or append an environment suffix like `-staging`. A wrong host
> breaks **only** `/logout` (login resolves its endpoint from OIDC discovery and is immune to a
> bad hosted domain), so the typo ships silently and only surfaces at logout/idle-timeout.

**Option B — hand-edit the literals (no env file).** Don't want a `.env` file?
Edit the four `__PLACEHOLDER__` literals directly in `auth.config.ts` (lines
108-111): `__USER_POOL_ID__`, `__USER_POOL_CLIENT_ID__`, `__COGNITO_HOSTED_DOMAIN__`,
`__AWS_REGION__`. On a **non-Vite** app (CRA / Next / etc.) this is the *only*
option — `import.meta.env` won't exist, so also delete `vite-env.d.ts`.

**Option C — platform / CI build env vars (Amplify, Vercel, Netlify, GitHub Actions).** When a
host builds the app from your repo, *it* supplies the values — there is no file in the tree.
Set the same four `VITE_*` names in the platform's build-environment settings; Vite inlines any
`VITE_`-prefixed `process.env` var at build time, identical to a `.env` file. This path is
**required, not optional, for hosted builds**: `.env*.local` (Option A) is git-ignored, so a host
cloning from git never sees it. Two traps:
- **Values bake in at _build_ time.** After changing one, trigger a **rebuild/redeploy** — a
  running deployment keeps the old values, and an already-open browser tab keeps the old bundle
  until it is reloaded against the new build.
- **AWS Amplify scopes vars by branch.** A variable set for a specific branch overrides the
  *All branches* value for that branch — by scope, **not** list order. Edit the branch-scoped
  entry (and fix the *All branches* default too, so branches without an override don't inherit a
  stale value).

Same four values whichever you pick: each literal is just the fallback an unset env var
resolves to (`env.VITE_X ?? '__X__'`), so a missing var surfaces as the obvious
`__PLACEHOLDER__` rather than a silent wrong value. If you use Option A, **leave
the literals as placeholders** — a set env var wins over the literal.

**Set these per app:** `providers` / `scopes` / `appTitle` (C8) **and
`postLoginRoute`** — the route to land on after login. It defaults to `/home`;
change it to a route that actually exists in your app, or post-login users land on
a dead URL. **Everything else in `authConfig` is STANDARD-bound policy** — treat the
TTL/idle figures as owned by STANDARD.md C3, not per-app knobs.

## Integrate
The module is **copy-in source** — you copy the files into your app; there is no
npm package to install. Four steps: bring the files in, install their
dependencies, wire them into your routes, then deal with any existing login.

### Step 1 — Copy the module into your project
Copy these from `reference/react-oidc/` into your app's `src/`, preserving the
folder layout:

| Copy this | To |
|---|---|
| `auth.config.ts` | `src/auth.config.ts` |
| `auth/` — AuthRoot, useAuthService, useIdleTimeout, RequireAuth, RequireRole | `src/auth/` |
| `login/` — LoginPage, CallbackPage | `src/login/` |
| `auth.css` | `src/auth.css` — the branded card styling; `LoginPage`/`CallbackPage` import it (no extra wiring) |
| `vite-env.d.ts` | `src/vite-env.d.ts` — Vite only; skip on non-Vite (see Configure Option B) |

Adjust the relative import paths if your `src/` layout differs.

### Step 2 — Install the runtime dependencies
**Do not skip this** — the copied files are **not** vendored with their
dependencies (the copy-in model means you don't inherit the module's
`package.json`). Until you install them, every adapter file fails to resolve
`react-oidc-context` / `oidc-client-ts` and the app won't boot:
```sh
npm install react-oidc-context oidc-client-ts
# plus React Router v7, if your app doesn't already have it:
npm install react-router@^7
```
After this, `RequireAuth`, `AuthRoot`, `LoginPage`, `CallbackPage` exist in *your*
tree and their imports resolve.

### Step 3 — Wire it into your routes
`RequireAuth` (`src/auth/RequireAuth.tsx`) must become your app's **sole** front
door. In your **router-root file** — the one that renders your router
(`<BrowserRouter>` or, in data mode, `<RouterProvider>`), often `App.tsx` or
`main.tsx` — import the pieces, then pick the shape that matches your app:
```tsx
// Adapter pieces — new to your file, add these as-is:
import { AuthRoot } from './auth/AuthRoot';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './login/LoginPage';
import { CallbackPage } from './login/CallbackPage';
import { useIdleTimeout } from './auth/useIdleTimeout';
import { useAuthService } from './auth/useAuthService';

// ProtectedLayout (below) also needs `Outlet` from react-router. Any app with a
// router ALREADY imports from 'react-router' — add `Outlet` to that existing line.
// Do NOT add a second `import { Outlet } from 'react-router'`: a duplicate import
// is a parse error (`Identifier 'Outlet' has already been declared`).
import { Outlet } from 'react-router';
```

**First, write `ProtectedLayout` (all three shapes below use it).** It is the
authenticated "shell" — the chrome (nav, etc.) every signed-in page shares — and
the one place the idle-logout timer arms. You write it once; copy this and drop
your real nav into it:
```tsx
// ProtectedLayout — renders ONLY for an authenticated user, because every shape
// below renders it INSIDE <RequireAuth>. Two React Router concepts:
//   • <Outlet/> is a placeholder: whichever child route matched the URL renders
//     in its spot, so the nav chrome stays put while the page body swaps.
//   • useIdleTimeout(logout) lives here (not higher up) so the 30-min idle-logout
//     (STANDARD.md C3) arms once, for the authenticated portion of the app only.
function ProtectedLayout() {
  const { logout } = useAuthService();
  useIdleTimeout(logout);
  return (
    <>
      <nav style={{ display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid #ccc' }}>
        {/* ...your app's real nav links go here... */}
        <button onClick={() => logout()} style={{ marginLeft: 'auto' }}>Log out</button>
      </nav>
      <main style={{ padding: 16 }}>
        <Outlet />
      </main>
    </>
  );
}
```
If your app already has a top-level layout/shell component, you don't need a second
one — just add `const { logout } = useAuthService(); useIdleTimeout(logout);` to it
and make sure it renders below `<RequireAuth>`.

Now pick the shape that matches your app:

**(a) Greenfield — no router yet.** Wrap from scratch:
```tsx
createRoot(el).render(
  <AuthRoot>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route element={<RequireAuth><ProtectedLayout /></RequireAuth>}>
          <Route path="/home" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AuthRoot>
);
// ProtectedLayout is the component shown above (renders <Outlet/>, arms idle-logout).
```

**(b) App already has React Router (the realistic fleet case).** You already
render `<BrowserRouter>`/`<Routes>` somewhere — often `App.tsx`. Open that file
and **merge** the four module pieces into the existing tree:
```tsx
// BEFORE — your existing App.tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes>
</BrowserRouter>

// AFTER — adapter merged in
<AuthRoot>                                   {/* provider sits ABOVE the router */}
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />            {/* public */}
      <Route path="/auth/callback" element={<CallbackPage />} /> {/* public — reachable WITHOUT auth */}
      <Route element={<RequireAuth><ProtectedLayout /></RequireAuth>}>
        <Route path="/" element={<Home />} />          {/* your existing routes, */}
        <Route path="/dashboard" element={<Dashboard />} />  {/* now protected */}
      </Route>
    </Routes>
  </BrowserRouter>
</AuthRoot>
// ProtectedLayout is the component shown above.
```
Wrapping the protected group as a **layout route** means your existing child
routes need no per-route edits.

**(c) App uses React Router v7 *data mode* (`createBrowserRouter`).** Your routes
are plain **objects**, not JSX `<Route>` elements, and you render `<RouterProvider>`.
Merge the adapter into your router-definition file (often `App.tsx` or `router.tsx`):
```tsx
// BEFORE — your existing data-mode router + root
const router = createBrowserRouter([
  { element: <RootLayout />, children: [
    { path: '/', element: <Home /> },
    { path: '/about', element: <About /> },
    { path: '/dashboard', element: <Dashboard /> },
  ] },
]);
export default function App() {
  return <RouterProvider router={router} />;
}

// AFTER — adapter merged in (RootLayout is gone — ProtectedLayout replaces it)
const router = createBrowserRouter([
  { path: '/login',         element: <LoginPage /> },              // public
  { path: '/auth/callback', element: <CallbackPage /> },           // public — reachable WITHOUT auth
  {
    element: <RequireAuth><ProtectedLayout /></RequireAuth>,       // gate the whole group
    children: [
      { path: '/',          element: <Home /> },                  // KEEP every route you
      { path: '/about',     element: <About /> },                 // already had — move them
      { path: '/dashboard', element: <Dashboard /> },             // ALL here, now protected
    ],
  },
]);
export default function App() {
  return (
    <AuthRoot>                              {/* provider wraps the router */}
      <RouterProvider router={router} />
    </AuthRoot>
  );
}
```
Two edits people miss here:
- **Delete your old layout** (the `RootLayout` in BEFORE) — `ProtectedLayout` replaces it.
  Leaving it behind is an unused-symbol build error under create-vite's `noUnusedLocals`.
- **Move *every* existing route** into the `children` array — the three above are
  illustrative, not the full list; a route you forget to copy silently disappears.

`AuthRoot` goes **wherever you render `<RouterProvider>`** — inside the `App`
component, **not** in a separate `createRoot(...).render(...)` call (that's in
`main.tsx`, and you leave it alone). The gating object has no `path` of its own:
it's the data-mode **layout route**, the exact analog of `(b)`'s
`<Route element={...}>` wrapper; its `children` render in `ProtectedLayout`'s `<Outlet/>`.

> **Gate with the component, not a loader.** Data mode's headline feature is route
> `loader`s, so the instinct is to guard auth in a loader. **Don't.** A loader runs
> *before render, outside React*, so it cannot call `useAuth`/`useAuthService` — those
> read React context, where react-oidc-context holds the **validated** session. A loader
> *could* read a raw token straight from `localStorage` (C2), but gating on a raw,
> unverified token violates STANDARD.md C2 (trust requires JWKS validation), and
> re-implementing that check in a loader forks the auth logic. So gate with
> `<RequireAuth>` as the route-object `element` (above) — never in a loader.

The login ships the standardized branded card (`auth.css`, matching the Angular adapter:
gradient page, white card, inlined Google/Microsoft marks). Restyle it with your design
system (e.g. Radix/shadcn) if you want — but do not fork the provider-loop or the
signIn/logout wiring.

### Step 4 — Replace or bridge your existing login (skip if you have none)
**No existing login** — e.g. a fresh app that only had public routes? **Skip this
step.** `RequireAuth` is already your only gate.

Otherwise, locating your app's current login component + auth-gate is the one
**irreducible human step** — no codemod can guess it; the rest is mechanical. Then
choose Replace or Bridge:

**Replace (preferred).** Delete the app's hand-rolled login + auth-gate and let
`RequireAuth` gate everything. Strictly better when possible: it removes duplicate
(often unverified) auth code. *(Replacing a hand-rolled login with the adapter has
closed a real gap before — a prior app's login hand-decoded the JWT with no
signature check; the module validates against the issuer JWKS.)*

**Bridge (fallback).** If the app **self-gates on an internal auth boolean** you
can't remove yet, mirror the module session into that flag so the app doesn't show
its own login *after* a successful module login:
```tsx
// inside a component under <RequireAuth>
const { isAuthenticated } = useAuth(); // from react-oidc-context
useEffect(() => { if (isAuthenticated) setIsLoggedIn(true); }, [isAuthenticated]);
```
This is **required, not optional polish**, for any app that double-gates: an
additive `RequireAuth` wrapper alone leaves the app's own gate showing its login
post-auth.

### Audit your logout for app-state teardown
When you delegate logout to the module's `logout()`, check whether your **old**
logout handler also tore down **app** state (cleared stores, reset selection atoms)
— not just auth tokens. The module's `logout()` redirects through Cognito
`/logout`, which ends the session but does **not** reset app state. Safe **iff**
your app fully unmounts on logout (e.g. `RequireAuth`'s redirect to `/login`
unmounts the tree, so component/atom state resets naturally). If your app does a
**soft** logout (stays mounted on a route), port those resets into an
`onRemoveUser` hook or a post-logout step, or stale UI state leaks. *(a real
soft-logout app left selection state populated after logout until its handler
reset those atoms — an easy gap to miss.)*

### Logout behavior to expect (not bugs)
- **`/oauth2/revoke` → 400 on Cognito is normal.** "Global revoke" = **refresh-token**
  revocation only; Cognito rejects access-token revoke (`unsupported_token_type`).
  The module revokes the refresh token and swallows the rest; the `/logout`
  redirect ends the session regardless.
- **Re-login after logout can be silent.** If the user's upstream Google SSO is
  still live, the next sign-in completes with **no visible prompt** — federation
  working, not a failed logout (STANDARD.md C4 Bounds). To force a fresh credential
  prompt on a shared terminal where multiple people each sign in, initiate sign-in
  with `extraQueryParams: { prompt: 'login' }` — the standard OIDC remedy.

## Runtime-verified (PoC 2026-06-17, test pool `us-east-1_Hzo7R6XQY`)
The former verified-pending items are now closed against a live pool:
- **C4 Cognito `/logout` params — PASS.** `client_id`+`logout_uri` accepted; 302 →
  `/login`. (The discovery doc *does* advertise `end_session_endpoint`; the reason
  to hand-build is the non-standard params — see `cognitoLogoutUrl()`.)
- **C3 silent renew — PASS.** Background `grant_type=refresh_token` → fresh tokens,
  no redirect.
- **C4 global revoke — refresh-token only.** Access-token revoke → 400
  `unsupported_token_type`; `useAuthService.logout()` revokes the refresh token,
  and the `/logout` redirect ends the session regardless.
- **Google IdP — PASS.** code+S256, `identity_provider=Google`, callback scrubbed,
  app behind `RequireAuth`.
- **Microsoft IdP — unverified-by-design** (test pool lacks it); config-bound, same
  posture as STANDARD.md C5.
- **Federated re-login may be silent** (upstream Google SSO) — expected, not a C4
  defect (STANDARD.md C4 Bounds; remedy under "Logout behavior to expect" above).
