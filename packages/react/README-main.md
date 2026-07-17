# s4-auth-react

Standardized S4 authentication for **React + Vite** apps — Cognito via
[`react-oidc-context`](https://github.com/authts/react-oidc-context) + `oidc-client-ts` +
[React Router v7](https://reactrouter.com/), installed by **one `npx` command**. This `react`
branch is a **built, installable package** with everything at its root; it is regenerated per
release and is not where development happens (development lives on `main`).

> The auth contract this implements is [`STANDARD.md`](./STANDARD.md).

## Install (one command)

One auto-detecting command. It inspects the target directory and picks the path itself —
**empty** dir → scaffold a fresh Vite app then install; **existing app** → inject auth into it.

```bash
# add auth to the app in the current directory (pinned to a release tag — reproducible,
# the right posture for an auth boundary):
npx git+https://github.com/ntanner-ctrl/s4-authentication.git#react-v0.3.2 . \
  --user-pool-id us-east-1_xxxxxxxxx \
  --client-id xxxxxxxxxxxxxxxxxxxxxxxxxx \
  --cognito-domain your-prefix.auth.us-east-1.amazoncognito.com \
  --region us-east-1

#   …or track the branch tip for the latest build:  …git#react . --user-pool-id …
#   …or scaffold a brand-new app:                    …git#react ./my-new-app --user-pool-id …
```

What a run looks like (existing app):

```
┌  s4-auth-react
●  target: /home/me/my-app [app, vite, ts]
◇  Copied 5 adapter items into src/ and wrote .env.local.
◇  Installing deps (npm): react-oidc-context oidc-client-ts react-router@^7
◇  Wired the auth router into src/main.tsx.
◆  Done
│  Automated: adapter source → src/, .env.local, auth.config.ts defaults, deps, router.
│  REQUIRED next (the codemod can't — these live in your app code):
│    1. Replace or bridge your existing login (README "Brownfield: additional required steps").
│    2. Arm idle-logout in your app shell:
│         const { logout } = useAuthService(); useIdleTimeout(logout);
│    3. Audit your logout for app-state teardown.
└  s4-auth-react
```

Drop `--region`/etc. to be prompted instead. Omit the Cognito values entirely for a fully
interactive run; pass `--yes` to accept defaults and skip the optional prompts (requires the four
Cognito values as flags).

## Need a Cognito pool first? (greenfield)

Already have a pool? Reuse it — its four values are all in the Cognito console. Otherwise the
template + deploy/destroy scripts (PowerShell + shell) live in [`infra/cognito/`](./infra/cognito/);
deploy it and its CFN `Outputs` supply the four values below. **None are secrets** — all four ship
in the browser bundle.

| Flag | CFN Output | Example |
|---|---|---|
| `--user-pool-id` | `UserPoolId` | `us-east-1_xxxxxxxxx` |
| `--client-id` | `UserPoolClientId` | `xxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `--cognito-domain` | `CognitoDomain` (bare host, no scheme) | `your-prefix.auth.us-east-1.amazoncognito.com` |
| `--region` | — | `us-east-1` |

The installer writes them into `.env.local` (git-ignored by Vite's default `*.local`), so they
stay out of version control. On a non-Vite target it writes them as literals into `auth.config.ts`
instead.

## What the installer does

- **Copies** the adapter into `src/` — `auth.config.ts`, `auth/` (AuthRoot, RequireAuth, RequireRole,
  useAuthService, useIdleTimeout), `login/` (LoginPage, CallbackPage), `auth.css`, `vite-env.d.ts`.
- **Installs** `react-oidc-context`, `oidc-client-ts`, `react-router@^7` via the detected package
  manager (npm/pnpm/yarn/bun), skipping any already present.
- **Writes** `.env.local` from the four Cognito values and patches per-app defaults in
  `auth.config.ts` (`providers`, `appTitle`, `postLoginRoute`).
- **Wires the router** into the app entry (`src/main.tsx`) — but only when it recognizes the shape:
  a routerless `createRoot(...).render(<App/>)` entry is wrapped so `RequireAuth` becomes the sole
  front door (public `/login` + `/auth/callback`, everything else gated). Any other shape is **left
  untouched** and a wire-by-hand checklist is printed (an auth boundary — when in doubt, mutate
  nothing).

It is **idempotent**: a re-run on an installed app bails with a warning rather than clobbering edits
(pass `--force` to overwrite).

## Options

```
target-dir              Install into this dir (default ".").
--user-pool-id <id>     Cognito User Pool ID           (else prompted)
--client-id <id>        Cognito app client ID          (else prompted)
--cognito-domain <d>    Cognito hosted domain, no scheme (else prompted)
--region <r>            AWS region                     (else prompted)
--providers <list>      Comma-separated IdPs, e.g. google,microsoft (default google)
--app-title <title>     Login-card heading (C8)
--post-login-route <r>  Route to land on after login (default /home)
--yes                   Accept defaults / skip optional prompts
--force                 Overwrite an existing install
-h, --help              Show help     -v, --version   Print version
```

## Brownfield: additional required steps

The installer does the mechanical 90%. For an **existing app** three steps remain — they live in
the app's own code, so no codemod can do them. The run prints them too.

1. **Replace or bridge the existing login.** Locating the app's current login + auth-gate is the one
   irreducible human step.
   - **Replace (preferred):** delete the hand-rolled login + gate; `RequireAuth` now gates everything.
   - **Bridge (fallback):** if a gate can't be removed yet, mirror the module session into the flag it
     reads, so the app doesn't show its own login *after* a successful module login:
     ```tsx
     // inside a component under <RequireAuth>
     import { useAuth } from 'react-oidc-context';
     import { useEffect } from 'react';
     const { isAuthenticated } = useAuth();
     useEffect(() => { if (isAuthenticated) setIsLoggedIn(true); }, [isAuthenticated]);
     ```
2. **Arm idle-logout** once, in the authenticated shell — the first two statements of the component
   that renders for signed-in users (e.g. `App`, above any `return`):
   ```tsx
   const { logout } = useAuthService();
   useIdleTimeout(logout);
   ```
3. **Audit logout for app-state teardown.** Cognito `/logout` ends the session but not in-memory
   state (Redux/Zustand/`useState`). A logout that **redirects to `/login`** (unmounts the tree) is
   safe — React discards state. A **soft logout** that stays mounted must reset any global user store
   itself, or stale UI leaks.

## Unsupported router shape → wire by hand

If the entry already has a router (`<Routes>`, `createBrowserRouter`) the installer prints a
checklist and changes nothing. Wire it by hand: render `AuthRoot` above the router, add the two
public routes, and gate the rest with `RequireAuth`.

```tsx
import { AuthRoot } from './auth/AuthRoot';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './login/LoginPage';
import { CallbackPage } from './login/CallbackPage';

<AuthRoot>                                   {/* provider sits ABOVE the router */}
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />            {/* public */}
      <Route path="/auth/callback" element={<CallbackPage />} /> {/* public — no auth */}
      <Route element={<RequireAuth><ProtectedLayout /></RequireAuth>}>
        {/* move EVERY existing route in here — a layout route, so no per-route edits */}
        <Route path="/" element={<Home />} />
      </Route>
    </Routes>
  </BrowserRouter>
</AuthRoot>
```

`ProtectedLayout` is the authenticated shell (nav + `<Outlet/>`); arm idle-logout inside it
(`useIdleTimeout(useAuthService().logout)`). For React Router **data mode** (`createBrowserRouter`),
put `AuthRoot` inside the `App` that renders `<RouterProvider>`, gate the group with the route
`element` (not a `loader` — a loader runs outside React and can't read auth), and move every route
into `children`.

## Verify

- `npm run build` — no missing-import errors.
- A protected route while logged out redirects to `/login`.
- Signing in lands on `postLoginRoute` (or the originally-requested route); logging out returns to
  `/login` and the protected route no longer renders.

## Behavior to expect (not bugs)

- **`/oauth2/revoke` → 400 in the console is normal.** Cognito revokes only the refresh token; the
  module swallows the 400 and the `/logout` redirect ends the session regardless.
- **Re-login after logout can be silent.** If upstream Google SSO is still live, the next sign-in
  completes with no prompt — federation working, not a failed logout (C4). Force a fresh prompt on
  shared terminals with `extraQueryParams: { prompt: 'login' }` in `auth.config.ts`.
- **The session survives a page reload.** Tokens live in `localStorage` (C2 default, DR-0006) — by
  design. For a session that shouldn't outlive the tab, switch `userStore` to `sessionStorage`.
