# s4-auth-angular

Standardized S4 authentication for **Angular 14+** apps — **standalone or NgModule** (auto-detected) — Cognito + Amplify v6,
installed via the Angular CLI. This `angular` branch is a **built, installable package** with
everything at its root; it is regenerated per release and is not where development happens
(development lives on `main`).

> The auth contract this implements is [`STANDARD.md`](./STANDARD.md).

## Install (git-URL, two steps)

```bash
# 1. add the Angular package — pinned to a release tag (reproducible; recommended for auth)
npm i git+https://github.com/ntanner-ctrl/s4-authentication.git#angular-v0.3.1

#    …or track the branch tip for the latest build:
#    npm i git+https://github.com/ntanner-ctrl/s4-authentication.git#angular

# 2. run the installer schematic (prompts for pool values, or pass flags)
ng g s4-auth-angular:ng-add \
  --user-pool-id=us-east-1_xxxx \
  --client-id=xxxxxxxxxxxxxxxxxxxxxx \
  --cognito-domain=your-prefix.auth.us-east-1.amazoncognito.com \
  --providers=google
```

This scaffolds the auth source into `src/app/` (you own and may edit it), inserts
`provideAuth()` into the root config (`app.config.ts` for standalone apps, `AppModule`
for NgModule apps — auto-detected), adds the `login` + `auth/callback` routes (into
`app.routes.ts` or `app-routing.module.ts`), and adds `aws-amplify@^6.17.0`.

> Prefer to wire it in by hand? See [`schematics/MANUAL-INSTALL.md`](./schematics/MANUAL-INSTALL.md).

## Need a Cognito pool first? (greenfield)

The pool/template lives in [`infra/cognito/`](./infra/cognito/). Deploy it, then bridge its
outputs into your config one of two ways:

- **Paste-block (default):** after deploy, read the stack's `AuthConfigBlock` output and paste
  the three values into `src/app/auth.config.ts`.
- **Fetch-helper (opt-in):** `infra/cognito/scripts/fetch-config.sh` (or `.ps1`) runs read-only
  `describe-stacks` and writes them for you.

Deploy/destroy scripts (PowerShell + shell) are in `infra/cognito/scripts/`.
