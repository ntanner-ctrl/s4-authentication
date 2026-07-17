# Adoption Guide

**Status:** normative companion to `/STANDARD.md`.

How a team slots its app into conformance with the Auth Contract
(`/STANDARD.md`), plus **Adaptation Notes** for apps that can't drop in the
reference adapter as-is. The Contract says *what* must hold; this guide is the
*how-to-get-there* for the supported stack.

- **You are conforming to** the Contract (`/STANDARD.md`) — the stack-agnostic
  *port*. Verify with `docs/CONFORMANCE.md`.
- **You consume** two reference artifacts:
  - `infra/cognito/` — the Cognito CFN module.
  - `reference/angular-amplify-v6/` — the Angular 17 + Amplify v6 *adapter*.
- **Where your app diverges**, route it through §4 (the three kinds of
  exception) — do not silently fork.

> **Mental model.** The adapter is **one** realization of the
> Contract, not the Contract. If your stack isn't Angular 17, you either follow
> an **Adaptation Note** (§5) or write a sibling adapter
> (`reference/<your-stack>/`) — you never edit the port to fit your stack.

---

## 0. Prerequisites

- An AWS account with permission to deploy the CFN stack, and the **org
  CloudFormation toolkit** (the module is authored to its conventions and
  validated against its `E9001`/`E9002` cfn-lint rules — `infra/cognito/README.md:48-53`).
- Google (and/or Microsoft/Entra) OAuth **client credentials**, sourced into
  **SSM Parameter Store / Secrets Manager** — never committed
  (`infra/cognito/README.md:55-60`).
- The consuming app on **Angular 17 + Amplify v6** for a drop-in. Other Angular
  versions → §5. Other frameworks → write a sibling adapter.

---

## 1. Stand up Cognito (`infra/cognito/`)

**One generalized `template.yaml`; provider mix is config, not code** (C8).
You do **not** pick a template — you pick a config preset and supply
credentials.

1. **Choose your provider mix** by copying the matching preset from
   `infra/cognito/envs/`:
   - `google-only.example.json` — Google only
   - `microsoft-only.example.json` — Microsoft (Entra) only
   - `both.example.json` — both

   Supplying or omitting each credential set is the whole switch
   (`infra/cognito/README.md:24-34`): both creds → `[COGNITO, Microsoft, Google]`,
   one set → that one provider.

2. **Set the deploy-time parameters** (`template.yaml:20-115`):

   | Parameter | What it is | Notes |
   |-----------|-----------|-------|
   | `Client` / `Environment` | toolkit naming/tags | drives `${Client}-${Environment}-auth-*` |
   | `CallbackDomain` | your app's host (no scheme) | **drives the app↔Cognito URL seam — see §2.2** |
   | `CognitoDomainPrefix` | hosted-UI domain prefix | becomes `<prefix>.auth.<region>.amazoncognito.com` |
   | `GoogleClientId` / `GoogleClientSecret` | Google OAuth creds | secret is `NoEcho`; from SSM/Secrets Manager |
   | `AzureClientId` / `AzureTenantId` / `AzureClientSecret` | Entra creds | omit for Google-only |
   | `EnableAdminScope` | opt-in `aws.cognito.signin.user.admin` | **leave `false`** unless your app calls Cognito user APIs client-side (C8 — see §4.1) |
   | `ServiceTag` / `OwnerTag` | toolkit tags | E9001 |

3. **Deploy**, then read the stack **Outputs** (`template.yaml:305-330`) — these
   feed §2.

> **Do not re-accumulate the URL sprawl.** A per-customer stack registers
> **exactly** its app's real routes (`template.yaml:258-271`:
> `/auth/callback` + `/login`). The shared multi-product app-client "rat-king"
> is the anti-pattern this isolation exists to kill — keep your allow-lists
> minimal.

---

## 2. Wire Cognito → `auth.config.ts`

`reference/angular-amplify-v6/auth.config.ts` is the **typed binding** of the
Contract's Config Vocabulary (`STANDARD.md` "Config Vocabulary"). Only the
deploy-time placeholders change per app; everything else is policy bound to the
Contract — **do not** edit the TTLs or invent new fields.

### 2.1 CFN Output → config field (the CFN→app direction)

| `auth.config.ts` field | Placeholder in the file | **CFN Output** | Source |
|------------------------|-------------------------|----------------|--------|
| `userPoolId` | `__USER_POOL_ID__` | **`UserPoolId`** | `template.yaml:306` |
| `clientId` | `__USER_POOL_CLIENT_ID__` | **`UserPoolClientId`** | `template.yaml:318` |
| `cognitoDomain` | `__COGNITO_HOSTED_DOMAIN__` | **`CognitoDomain`** | `template.yaml:324` |

> ⚠ **Output name.** It is `CognitoDomain` (not `CognitoHostedDomain` — an
> earlier comment in the adapter said the latter; this has been corrected).
> Bare host, no scheme.

The remaining fields are **not** from CFN — they are Contract-bound config you
set deliberately:

| Field | Set it to | Clause |
|-------|-----------|:------:|
| `providers` | your mix, e.g. `['google']` or `['google','microsoft']` — **must match what you deployed in §1** | C8 |
| `scopes` | baseline `['openid','email','profile']`; add `'aws.cognito.signin.user.admin'` **only if** you set `EnableAdminScope=true` | C8 |
| `postLoginRoute` | your single landing route (default `/home`) | C6 |
| `session.{accessTtl,refreshTtl,idleTimeout}` | **leave as the Contract figures** (60 m / 1 d / 30 m) — these mirror the app-client TTLs so the silent-refresh scheduler knows when to act | C3 |

> **Provider mix must agree on both sides.** `providers` in `auth.config.ts`
> (what the app *renders/initiates*) must match the credentials you supplied in
> §1 (what Cognito *accepts*). A provider in config but not in the pool → a
> dead login button; the reverse → an unreachable IdP.

### 2.2 App URLs → app-client (the app→Cognito direction — the half people forget)

Cognito **rejects** any OAuth redirect whose URL isn't pre-registered on the
app-client. The adapter's URLs must appear in the CFN allow-lists, both keyed off
the `CallbackDomain` parameter you set in §1:

| Adapter emits | Defined at | Must be registered in | CFN (driven by `CallbackDomain`) |
|---------------|-----------|------------------------|-----------------------------------|
| `redirectSignIn` = `/auth/callback` | `auth.config.ts:155` | `CallbackURLs` | `template.yaml:262` |
| `logout_uri` = `/login` | `auth.config.ts:134,152` | `LogoutURLs` | `template.yaml:271` |

> **This seam breaks logout silently if misaligned.** The adapter's post-logout
> target is `/login`; the CFN now registers `/login` to match (it previously
> registered `/auth/login`, a fossil that would make the hosted `/logout`
> reject the `logout_uri` — this has been fixed). If you change the adapter's
> login route, change `LogoutURLs` to match, and vice versa. Keep them
> identical.

---

## 3. Consume the adapter (`reference/angular-amplify-v6/`)

The adapter realizes every clause; the per-clause "how" is its README
(`reference/angular-amplify-v6/README.md:21-31`). To adopt:

1. **Copy** `auth.config.ts`, `login/`, and `auth/` into your app; fill the §2
   placeholders.

2. **Wire the routes** (`auth/auth.guard.ts:8-12`):
   ```ts
   { path: 'login', component: LoginComponent },
   { path: 'auth/callback', component: CallbackComponent },   // C5/C6 landing
   { path: '', canActivate: [authGuard], children: [ /* protected */ ] }, // C7
   ```
   Guards are **on by default, fail-closed** (C7) — apply `authGuard` to every
   protected subtree; do not add an escape-hatch flag.

3. **⚠ Include the OAuth listener import — the #1 consuming-app gotcha.**
   The redirect page **must execute**:
   ```ts
   import 'aws-amplify/auth/enable-oauth-listener';
   ```
   The adapter does this in `CallbackComponent` (`login/callback.component.ts:30`),
   but it is **side-effect-only** — if your build **tree-shakes** it, or the
   `/auth/callback` route is **lazy-loaded** so the import hasn't run when Cognito
   redirects back, Amplify **never consumes the `code`/`state`** and login hangs
   on the callback with no error. Verify the import is **eagerly** evaluated on
   the redirect route (`auth/auth.service.ts:17` notes the same requirement).

4. **Provider mix is the only login-UI switch** (C8): `LoginComponent` renders
   exactly `authConfig.providers` (`README.md:30`). No per-app template edits to
   add/remove a provider.

---

## 4. Three kinds of exception (do not conflate — design spec §7)

When your app can't match the Contract or the reference, classify the gap —
each kind calls for different follow-up (record it, follow the adaptation
note, or fix it), and conflating them makes a deliberate choice look like an
unresolved bug.

### 4.1 Sanctioned config deviation — *allowed*

A **business reason** exists and the Contract makes it configurable.
→ **Record it** in your own project notes (so it reads as deliberate, not
drift). Examples:

- A **Microsoft-only** (or Google-only) product — provider mix is config (C8).
- A **different `postLoginRoute`** — the landing route is config (C6); only the
  *mechanism* is standardized, not the value.
- The **admin scope**, where the app genuinely calls Cognito user APIs from the
  client → set `EnableAdminScope=true` + add the scope to `auth.config.ts`. This
  is sanctioned **iff** actually used — otherwise dropping it is correct.

### 4.2 Environmental adaptation — *technical, not a defect*

It can't drop in as-is for a **technical** reason (e.g. a different Angular
version). → Follow the **Adaptation Note** in §5. We provide the path; you (a
dev) execute it. We do **not** bloat the reference with multi-version support.

### 4.3 Drift — *no reason, just un-reverted*

No business or technical reason — an accident. → It is **not** an exception;
fix it. Track it in your own notes as fix-when-convenient (e.g. a stub logout,
a commented-out guard, a non-standard scope set).

---

## 5. Adaptation Notes

### 5.1 Angular 14 (`rds-cloud-frontend`)

The reference targets **Angular 17** idioms. On Angular 14, substitute the
structural equivalents — the **auth logic is unchanged**; only the framework
wiring differs:

| Ng17 idiom in the reference | Where | Ng14 substitution |
|-----------------------------|-------|-------------------|
| Functional `CanActivateFn` guards (`authGuard`, `roleGuard`) | `auth/auth.guard.ts`, `auth/role.guard.ts` | If your Angular predates functional guards, wrap the same logic in a class-based `CanActivate` guard (`@Injectable` implementing `CanActivate`); the verified-session / fail-closed branches are identical. |
| Standalone components + `provideRouter` bootstrap | `login/*`, route config | If your app is NgModule-based, declare `LoginComponent`/`CallbackComponent` in an `NgModule` and register routes via `RouterModule.forRoot/forChild`. |
| Amplify **v6** client SDK | `auth.config.ts`, `auth/auth.service.ts` | Amplify v6 is framework-version-agnostic — it runs on Ng14. **Do not** stay on Amplify v5; v5's API differs and v5 is on the EOL path. |
| `signal()` reactive state | `auth/auth.service.ts`, `login/login.component.ts` | `BehaviorSubject` (read via `.value` or the `async` pipe) — signals are Ng16+. |
| `takeUntilDestroyed(this.destroyRef)` subscription teardown | `auth/auth.service.ts`, `login/callback.component.ts` | Keep the `Subscription` and unsubscribe in `ngOnDestroy` — `DestroyRef`/`takeUntilDestroyed` are Ng16+. |
| `@if` / `@for` template control flow | `login/login.component.ts` | `*ngIf` / `*ngFor` (add a `trackBy` where `@for`'s `track` was) — built-in control flow is Ng17+. |

> **Build note (Ng14 + Amplify v6):** expect `TS2307: Cannot find module
> 'node:stream'` on first build — `@smithy/types` (a v6 AWS-SDK transitive dep)
> ships `.d.ts` files with `node:`-prefixed imports that an old `@types/node`
> (≤12) cannot resolve. Set `"skipLibCheck": true` in `tsconfig.json`.
> Observed in the rds-cloud dry run ("New friction found DURING wiring" #2).

> **rds-cloud carries two *separate* gaps — keep them distinct.** The Ng14
> structure is an **adaptation** (this note). Its **implicit OAuth flow** is
> **drift** (§4.3) — a security defect to fix by moving to code+PKCE via the
> adapter, *independent* of the version work. Don't let the adaptation excuse
> the drift.

*(No other Adaptation Notes are open. A non-Angular stack is not an adaptation —
it is a new sibling adapter under `reference/<stack>/`.)*

---

## 6. Verify conformance

Run `docs/CONFORMANCE.md` against your app: 🔍 static greps, ⚙️ app-client/config
inspection, 👁 behavioral checks. Every 🔍/⚙️ must pass and every 👁 must be
observed (C5.1–C5.3/C5.4b and C6 especially are behavioral — no static check
can score them; you must observe them at runtime. C5.4a is the exception: it
is ⚙ config and authoritative — run it **before** the C5.4b walk, which is
smoke only).

A failing check is, by definition, **exactly one** of: a **sanctioned deviation**
(§4.1 — record it), an **adaptation** (§4.2 — note applied), or **drift**
(§4.3 — fix it).

> **On the 🔍 greps.** They match raw text including comments, so a hit is a
> **prompt to inspect**, not an automatic fail. The path to hardening them into
> comment-aware / AST checks is in `docs/CONFORMANCE.md` "Hardening the 🔍
> checks."

---

## 7. Before you roll this out org-wide

Three items are **ratification gates**, not adoption steps — a human confirms
them before the Contract's tightened defaults go across products: the **C8
admin-scope drop** is safe for your app, the **shared-domain logout blast
radius** (single-logout SSO across co-located apps) is the desired UX, and the
**deployed runtime TTLs** are cross-checked against the Contract (60 m / 1 d /
30 m) in the AWS console. Confirm those there.
