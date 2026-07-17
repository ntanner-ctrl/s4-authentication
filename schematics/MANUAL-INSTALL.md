# Manual install (copy / paste / edit)

The [`README`](../README.md) install path runs the `ng-add` schematic, which wires
everything automatically. This guide is the **same install done by hand** — for
seeing every change, or when a project's layout differs from what the schematic
expects.

It targets **Angular 14+** apps in either bootstrap style — **standalone**
(`app.config.ts` + `app.routes.ts` exporting a `routes` array) **or NgModule**
(`app.module.ts` + `app-routing.module.ts` with a `const routes: Routes = […]`).
Steps 4 and 5 below show exactly where `provideAuth()` and the two routes go in
each style.

> **Shortcut — let the tool show the changes first.** Running
> `ng g s4-auth-angular:ng-add --dry-run` prints every file it *would* create and
> every edit it *would* make, **without writing anything** — the authoritative,
> always-current version of the steps below for a specific project. Use it when a
> layout doesn't match the assumptions here.

Everything the schematic does is in `schematics/ng-add/index.js` — the five steps
below mirror it one-to-one.

---

## 1. Add the runtime dependency

The scaffolded code uses the **Amplify v6** modular API. The `^6.17.0` caret stays
within 6.x (latest 6.18.0) and blocks an automatic jump to a future `7.0.0` major —
the kind of breaking change the v5→v6 rewrite was (per `schematics/ng-add/index.js`,
which adds `aws-amplify@^6.17.0`):

```bash
npm i aws-amplify@^6.17.0
```

## 2. Copy the auth source into `src/app/`

Copy these files from `schematics/ng-add/files/src/app/` into the project's
`src/app/`, **dropping the `.template` extension** from each:

| Copy from (`schematics/ng-add/files/src/app/…`) | To (`src/app/…`) |
|---|---|
| `auth.config.ts.template`          | `auth.config.ts` |
| `auth/provide-auth.ts.template`    | `auth/provide-auth.ts` |
| `auth/auth.service.ts.template`    | `auth/auth.service.ts` |
| `auth/auth.guard.ts.template`      | `auth/auth.guard.ts` |
| `auth/role.guard.ts.template`      | `auth/role.guard.ts` |
| `login/login.component.ts.template`    | `login/login.component.ts` |
| `login/callback.component.ts.template` | `login/callback.component.ts` |

These files become part of the app — edit them freely. (The `enable-oauth-listener`
import at the top of `callback.component.ts` is required — do not remove it; without
it Amplify v6 never consumes the `code`/`state`.)

## 3. Fill in the pool values

**`src/app/auth.config.ts` is the only file with placeholders.** The schematic
substitutes these tokens; by hand, replace each `<%= … %>` with the matching value:

| Placeholder | Replace with | Source |
|---|---|---|
| `<%= userPoolId %>`   | the Cognito user pool id        | CFN Output `UserPoolId` |
| `<%= clientId %>`     | the Cognito app-client id       | CFN Output `UserPoolClientId` |
| `<%= cognitoDomain %>`| hosted domain, **no scheme** (e.g. `<prefix>.auth.us-east-1.amazoncognito.com`) | CFN Output `CognitoDomain` |
| `[<%= providersLiteral %>]` | the enabled IdPs as a quoted list, e.g. `['google']` or `['google', 'microsoft']` (C8) | product decision |
| `'<%= appTitle %>'`   | login-card heading, or `'Sign in'` to keep the default | product decision |

No pool yet? See the greenfield section in the [`README`](../README.md)
(`infra/cognito/`) — deploy the template, then read the three values from its
`Outputs`.

The other values in `auth.config.ts` (`scopes`, `postLoginRoute`, `session.*`)
are **policy bound to `STANDARD.md`**, not per-deploy settings — change them only
deliberately (e.g. opt into the admin scope per C8, or set the landing route per
C6). They are not placeholders.

## 4. Register `provideAuth()` at bootstrap

In `src/app/app.config.ts`, add `provideAuth()` to the root `providers` array:

```ts
import { provideAuth } from './auth/provide-auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAuth(),
    provideRouter(routes),
    // …existing providers
  ],
};
```

This calls `Amplify.configure(...)` once at startup from `auth.config.ts`.

> **NgModule app?** Add `provideAuth()` to the root `AppModule`'s `providers`
> array instead of `app.config.ts` (it returns `EnvironmentProviders`, valid in
> `@NgModule({ providers: [...] })` since Angular 14.1). The schematic's `ng-add`
> does this automatically; this note is for the by-hand path.

## 5. Add the auth routes

In `src/app/app.routes.ts`, add the `login` and `auth/callback` routes to the
`routes` array (the schematic inserts them at the head, via
`schematics/ng-add/add-routes.js`):

```ts
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  { path: 'auth/callback', loadComponent: () => import('./login/callback.component').then((m) => m.CallbackComponent) },
  // …existing routes
];
```

> **NgModule app?** Add the same two entries to the `routes` array in
> `app-routing.module.ts` instead of `app.routes.ts`. The `loadComponent` form
> works as-is because the scaffolded `LoginComponent`/`CallbackComponent` are
> `standalone: true` (valid in NgModule routing since Angular 14.1).

---

## Then: guard the protected routes (C7)

Installing the files doesn't protect anything on its own. Apply `authGuard` to
every route that requires a session — guarding is **on by default,
fail-closed** (`STANDARD.md` C7):

```ts
import { authGuard } from './auth/auth.guard';

// …
{ path: '', canActivate: [authGuard], children: [ /* …protected routes… */ ] },
```

For coarse role gating on a Cognito group, `roleGuard('group-name')` is provided
(`auth/role.guard.ts`) — note it is route-level only; per-user data-layer
authorization is out of scope (see `STANDARD.md`, "What is *not* in this
contract").

## Verify

- `ng build` compiles with no missing-import errors.
- Visiting a guarded route while logged out redirects to `/login`.
- Signing in returns to the target (or `postLoginRoute`), and **Back does
  not re-fire the callback** (C5).
