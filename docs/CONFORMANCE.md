# Conformance Checklist

**Status:** normative companion to `/STANDARD.md`.

This is the **enforcement** layer. `STANDARD.md` states the rules; this file
makes checking them **mechanical**. Run these checks against a target repo (an
adopter's app, or an adapter under `reference/`) to assess conformance.

Each check cites its clause. Checks are typed:

- 🔍 **static** — runnable now via grep/AST against source. Automatable in CI.
- ⚙️ **config** — inspect the Cognito app-client config / CFN (`infra/cognito/`)
  or the adapter's bound `auth.config` values.
- 👁 **behavioral** — observe at runtime (manual or e2e); the *mechanism* is
  stack-specific so the check is on observed behavior, not source.

> Grep patterns below are **prescriptive templates** — adjust the path/idiom to
> the target stack. A 🔍 check that is impossible to express for a given stack
> escalates to 👁.

---

## C1 — Authorization Code + PKCE (S256)

- [ ] **C1.1** 🔍 No implicit flow. The string `response_type=token` appears
      nowhere in source or built config.
      `grep -rEn "response_type=token" <repo>` → **expect no matches**.
- [ ] **C1.2** 👁 Authorization redirect uses `response_type=code` and includes
      `code_challenge` + `code_challenge_method=S256`. *(Inspect the redirect to
      the IdP `/authorize` endpoint in network trace.)*

## C2 — Token storage & validation

- [ ] **C2.1** 🔍 No trust decision from an unverified decode. Find raw decodes
      and confirm none feeds auth/role logic:
      `grep -rEn "atob\(|jwt[-_]?decode|JSON\.parse\(.*atob" <repo>` → each hit
      is display-only, never gating a guard/role.
- [ ] **C2.2** 🔍 Token verification resolves JWKS and checks `iss`/`aud`/`exp`
      (look for a JWKS-backed verifier, not a hand-rolled decode).
- [ ] **C2.3** 🔍 Tokens are not placed in a store weaker than `localStorage`,
      and any cookie use is `Secure`+`HttpOnly`+`SameSite`.
      `grep -rEn "document\.cookie|sessionStorage" <repo>` → review each.

## C3 — Session lifetime

- [ ] **C3.1** ⚙️ Cognito app-client: `AccessTokenValidity`/`IdTokenValidity` =
      **60 min**, `RefreshTokenValidity` = **1 d** (with matching
      `TokenValidityUnits`). *(Inspect `infra/cognito/template-parts/app-client.yaml`
      or the deployed client.)*
- [ ] **C3.2** ⚙️ Adapter config binds `session.accessTtl=60m`,
      `session.refreshTtl=1d`, `session.idleTimeout=30m`.
- [ ] **C3.3** 👁 A session left idle 30 min is logged out; under active use the
      hour boundary refreshes silently (no surprise re-login).

## C4 — Complete logout

- [ ] **C4.1** 🔍 No stub logout. Logout handler performs work (global sign-out
      call + storage clear + redirect to Cognito `/logout`), not a no-op.
      `grep -rEn "logout|signOut" <repo>` → each handler does all three steps.
- [ ] **C4.2** 👁 After logout: local token storage empty **and** a protected
      route demands full re-auth (no silent re-entry).

## C5 — Callback history & back-button

- [ ] **C5.1** 👁 After login, **Back** does not return to / re-fire the OAuth
      callback (callback URL replaced out of history).
- [ ] **C5.2** 👁 While logged out, **Back** from a protected page lands on
      login — no protected-content flash, no callback re-fire.
- [ ] **C5.3** 👁 While logged in, navigating to the login route forwards — to
      the pending `returnUrl` if present, else the configured post-login
      route — **without re-initiating the auth flow** (no authorization
      request in the network log, no auth-flow error in the console) and
      **without stacking a history entry** (Back from the destination does
      not land on the login route).
- [ ] **C5.4a** ⚙ **(authoritative)** The app-client's
      `SupportedIdentityProviders` lists no `COGNITO` (= **C8.3**,
      cross-reference — not a separate config rule). This is what makes the
      external-history residual benign: no page in the back-stack
      re-traversal chain can render the **Cognito-native** credential form
      (the pool's own username/password). It does NOT govern the external
      IdPs' own sign-in pages — Google/Microsoft legitimately present their
      credential UI on re-auth, account switching, or policy challenge; that
      is federation working, not a violation. Verify:
      `aws cognito-idp describe-user-pool-client` → provider list.
- [ ] **C5.4b** 👁 *(smoke, non-authoritative)* Re-engaging the IdP page from
      the back-stack completes federated sign-in or returns to the app —
      never a **Cognito-native** username/password form (a hosted page
      offering "sign in with your email and password" against the pool
      itself). The external IdP's own credential pages are conformant. Run
      only with C5.4a already verified (IdP SSO auto-complete makes this
      walk alone unfalsifiable). A cookied multi-account browser exercises
      the account-chooser landing; a fresh/private profile exercises the
      direct hosted-page landing.

## C6 — Post-login redirect

- [ ] **C6.1** 🔍 Landing route is read from config (`postLoginRoute`), not a
      hardcoded literal. `grep -rEn "navigate\(|redirect|router" <repo>` →
      post-login target traces to config.
- [ ] **C6.2** 👁 Deep-link to a protected URL while logged out returns the user
      to **that** URL after login (`returnUrl`).

## C7 — Route guards: on by default, fail-closed

- [ ] **C7.1** 🔍 No protected route lacks a guard (enumerate routes; every
      non-public route has a guard attached).
- [ ] **C7.2** 🔍 No guard returns "allow" on the unknown/error branch.
      Review each guard's default/else path → must deny.
- [ ] **C7.3** 🔍 No prod bypass. Search for kill-switch params/flags:
      `grep -rEn "bypass|siteguid|skipAuth|disableGuard|noauth" <repo>` →
      **expect no production-reachable match**.

## C8 — Provider configuration & scopes

- [ ] **C8.1** 🔍 Enabled providers come from the `providers` config item; no IdP
      is hardcoded such that changing the mix needs a code edit.
- [ ] **C8.2** 🔍 Scopes equal baseline `openid email profile` unless
      `aws.cognito.signin.user.admin` is explicitly opted in via config.
      `grep -rEn "scope|aws\.cognito\.signin\.user\.admin" <repo>` → review.
- [ ] **C8.3** 🔍 A federated-only app-client MUST NOT list `COGNITO` in
      `SupportedIdentityProviders` — listing it surfaces the native
      username/password form on any hosted/managed login page and is
      inconsistent with the federated-only stance (`ExplicitAuthFlows` =
      `ALLOW_REFRESH_TOKEN_AUTH` only).
      `grep -nE "SupportedIdentityProviders" -A4 infra/cognito/template.yaml` →
      confirm no `- COGNITO` entry.

---

## Scoring

### Known limitation of the 🔍 greps

The grep templates match **raw text**, including comments and prose — a code
comment that *mentions* `response_type=token` or "bypass" will trip a check that
the actual code passes. When automating in CI, scope greps to source and
exclude comments (e.g. strip comment lines first, or use an AST/lint rule rather
than `grep`). Until then, a 🔍 hit is a **prompt to inspect**, not an automatic
fail. (Found while building the Angular adapter, which had to reword comments to
avoid self-reporting as non-conformant — a future conformance pass should harden
these into AST-based checks.)

### Hardening the 🔍 checks

The raw greps are **prescriptive templates for a first pass**, not the final
enforcement. Each escalates along the same ladder — **raw grep → scoped grep →
AST/lint rule** — trading effort for precision. Harden in this order; stop at the
rung that removes the false positives for your stack.

1. **Scope the grep** (cheap, removes most noise). Restrict to source, exclude
   comments and strings before matching. E.g. for C1.1:
   ```bash
   # strip // line-comments, then match — a comment mentioning the token no longer trips it
   grep -rEn --include='*.ts' -v '^\s*//' <repo>/src | grep -E "response_type=token"
   ```
   This is what made the Angular adapter pass C1.1/C7.3 without rewording code
   (the limitation noted above).

2. **Promote to a lint/AST rule** (durable, CI-grade) for the checks that are
   *semantic*, not textual — where "does this string appear" can't express the
   rule:
   - **C2.1 / C7.2** (no **trust decision** from an unverified decode; no guard
     branch returns `allow` on the error/unknown case) — these need the **AST**:
     a decode is only a violation if its result *flows into* an auth/role
     decision, and a guard is only a violation if its `else`/`catch` path
     *returns truthy*. Grep can find the decode/guard; only a rule can judge the
     data-flow. Implement as an ESLint rule (`@typescript-eslint` AST) or a
     `ts-morph` script asserting: every `CanActivateFn`/guard's failure branch
     returns a `UrlTree`/`false`, never `true`.
   - **C6.1 / C8.1** (landing route and provider set come from **config**, not a
     literal) — an AST check that the value traces to `authConfig.*`, not a
     string/array literal at the call site.

3. **Keep the 👁 behavioral checks behavioral.** C1.2, C3.3, C4.2, C5.1-C5.3,
   C5.4b, C6.2 are runtime outcomes; the hardening target for these is an
   **e2e test** (Playwright/Cypress) asserting the observable behavior
   (callback not in history, idle logout fires, protected route demands
   re-auth), not a static rule. Do not try to grep your way to a 👁 check.
   *(C5.4a is the deliberate exception in the C5 block: it is ⚙ config and
   **is** the authoritative re-traversal check — the 👁 C5.4b walk is smoke
   on top of it, never a substitute.)*

**Suggested CI shape:** scoped-grep rungs as a fast pre-commit gate; the AST/lint
rungs in CI as hard fails; the e2e rung in a nightly/integration suite. A 🔍 that
cannot be expressed for a given stack **escalates to 👁** (per the header rule) —
do not delete the check, move it down the ladder.

> **Scope for this pass.** Sub-project D documents the *approach* (this section).
> The runnable ESLint/`ts-morph` rules and the e2e suite are a follow-up — they
> are tooling, beyond D's docs scope. The ladder above is the spec for that work.

### Scoring

A repo is **conformant** when every 🔍 and ⚙️ check passes and every 👁 check is
verified. Record the disposition of any failing check in your own project
notes / deviation log: it is either a **sanctioned deviation** (business
reason — record it) or **drift** (no reason — fix-when-convenient). Keep the
assessment scorecard there too, as the baseline snapshot to carry forward.
