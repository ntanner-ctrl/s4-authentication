/**
 * auth.config.ts — React + react-oidc-context adapter
 *
 * TYPED BINDING of the STANDARD.md "Config Vocabulary" table (the machine-readable
 * half of the port). The *names and meanings* are defined in STANDARD.md; this file
 * is their React/oidc-client-ts *encoding*. Sibling adapter: reference/angular-amplify-v6/
 * binds the SAME vocabulary in the Amplify idiom.
 *
 * Anti-drift rule (STANDARD.md "Config Vocabulary"): everything a value can express
 * lives here; behavioral policy that code can't express lives in STANDARD.md. The
 * normative TTL figures (60 min / 1 day / 30 min) are owned by STANDARD.md C3; this
 * file binds to them and annotates each with the clause it realizes — it is not a
 * competing source of truth.
 *
 * VALUES SOURCED FROM THE COGNITO CFN `Outputs` (infra/cognito/). The four
 * deploy-specific values are injected from `import.meta.env.VITE_*` at build time
 * (the happy path — see README §Configure), falling back to the `__..__` literals
 * for a hand-edit when env wiring doesn't fit an app. These four are the ONLY
 * deploy-time-specific things; everything else is STANDARD-bound policy.
 *
 * Library facts verified via Context7 /authts/react-oidc-context (2026-06-17):
 * AuthProviderProps extends oidc-client-ts UserManagerSettings (authority, client_id,
 * redirect_uri, post_logout_redirect_uri, scope, automaticSilentRenew, userStore,
 * extraQueryParams) plus provider callbacks (onSigninCallback, onRemoveUser).
 */
import { WebStorageStateStore } from 'oidc-client-ts';
import type { AuthProviderProps } from 'react-oidc-context';

/** The set of IdPs this adapter knows how to render + initiate (C8). */
export type Provider = 'google' | 'microsoft';

/**
 * Cognito hosted-UI `identity_provider` literals. Our lowercase vocabulary names map
 * to the provider names as REGISTERED IN THE COGNITO POOL. Kept in the adapter
 * (mechanism), not in STANDARD.md. Realizes C8 — provider identity is config-driven.
 *   - 'Google' is the built-in social provider name.
 *   - 'Microsoft' is the name a custom OIDC/SAML Entra provider is registered under
 *     (must match the pool's IdP name exactly). verified-pending for the MS path.
 */
export const COGNITO_IDP: Record<Provider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

/** Typed binding of the STANDARD.md Config Vocabulary table. */
export interface AuthConfig {
  /** Vocab `providers` — enabled IdPs. Drives C8. Login renders only these. */
  providers: Provider[];
  /**
   * Optional login-card heading. INTENTIONALLY out-of-vocabulary (not in STANDARD.md's
   * Config Vocabulary) — it is presentation-only branding, a config edit, never a fork.
   */
  appTitle?: string;
  /** Vocab `userPoolId` — Cognito user pool id. Drives C1–C4. CFN Output: `UserPoolId`. */
  userPoolId: string;
  /** Vocab `clientId` — Cognito app-client id. Drives C1. CFN Output: `UserPoolClientId`. */
  clientId: string;
  /**
   * Vocab `cognitoDomain` — hosted domain for /authorize and /logout. Drives C1, C4.
   * CFN Output: `CognitoDomain`. Bare host, no scheme.
   */
  cognitoDomain: string;
  /** AWS region of the user pool — needed to build the OIDC issuer/authority. */
  region: string;
  /**
   * Vocab `scopes` — OAuth scopes. Drives C8. Baseline ['openid','email','profile'].
   * 'aws.cognito.signin.user.admin' is opt-in (add ONLY where the app calls Cognito
   * user APIs client-side).
   */
  scopes: string[];
  /** Vocab `postLoginRoute` — single configurable post-login landing. Drives C6. */
  postLoginRoute: string;
  /** Vocab `session.*` — lifetime knobs. Drives C3. */
  session: {
    /** Access/ID TTL. STANDARD.md C3 = 60 min. CFN: AccessTokenValidity/IdTokenValidity. */
    accessTtl: number; // ms
    /** Refresh TTL. STANDARD.md C3 = 1 day. CFN: RefreshTokenValidity. */
    refreshTtl: number; // ms
    /** Idle logout. STANDARD.md C3 = 30 min. Enforced client-side (no CFN field). */
    idleTimeout: number; // ms
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Deploy-specific values, env-injected (happy path) with a hand-edit fallback.
 * Vite statically replaces `import.meta.env.VITE_*` at build time, so an UNSET var
 * surfaces as the obvious `__PLACEHOLDER__` rather than a silent wrong value. None
 * of the four are secrets (all ship in the browser bundle) — the choice is
 * ergonomics, not security ([[react-oidc-config-convention]]). The `?? {}` keeps a
 * non-Vite host (SSR/test) from throwing on a missing `import.meta.env`; copying
 * into a non-Vite app, delete `vite-env.d.ts` and hand-edit the literals below.
 */
const env: ImportMetaEnv = import.meta.env ?? ({} as ImportMetaEnv);

/**
 * The active config instance. Deploy fields are env-injected CFN Outputs (above);
 * everything else is policy bound to STANDARD.md and must NOT be edited per app.
 * Changing `providers`/`scopes` here is the WHOLE mechanism for C8 — no code fork.
 */
export const authConfig: AuthConfig = {
  providers: ['google'], // C8 — set to ['google','microsoft'] etc.
  appTitle: 'Sign in',
  userPoolId: env.VITE_USER_POOL_ID ?? '__USER_POOL_ID__', // CFN Output: UserPoolId
  clientId: env.VITE_USER_POOL_CLIENT_ID ?? '__USER_POOL_CLIENT_ID__', // CFN Output: UserPoolClientId
  cognitoDomain: env.VITE_COGNITO_HOSTED_DOMAIN ?? '__COGNITO_HOSTED_DOMAIN__', // CFN Output: CognitoDomain
  region: env.VITE_AWS_REGION ?? '__AWS_REGION__',
  scopes: ['openid', 'email', 'profile'], // C8 baseline; admin scope opt-in
  postLoginRoute: '/home', // C6 — single configurable landing
  session: {
    // FLAG (2026-06-24): accessTtl/refreshTtl are DEAD config here — no runtime code
    // reads them. They're enforced by Cognito (infra/cognito/template.yaml:341-347:
    // AccessTokenValidity/RefreshTokenValidity); these literals are an undocumented
    // mirror. Editing them changes nothing — change the CFN + redeploy. Dual source of
    // truth, drift hazard left intentionally unresolved. Only idleTimeout is load-bearing
    // (read by useIdleTimeout.ts — client-side, no CFN field exists for it).
    accessTtl: 60 * MIN, // C3: 60 min — informational; enforced by CFN, not read at runtime
    refreshTtl: DAY, // C3: 1 day — informational; enforced by CFN, not read at runtime
    idleTimeout: 30 * MIN, // C3: 30 min idle logout — LIVE: read by useIdleTimeout.ts
  },
};

/** App origin, SSR-safe fallback for the reference. */
function appOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
}

/**
 * The OIDC issuer/authority. For Cognito this is the user-pool issuer
 * (`https://cognito-idp.<region>.amazonaws.com/<userPoolId>`), NOT the hosted domain.
 * oidc-client-ts fetches `<authority>/.well-known/openid-configuration` from here to
 * resolve the authorize/token/jwks endpoints. Realizes C2 (JWKS lookup) + C1.
 */
export function cognitoAuthority(config: AuthConfig = authConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

/** Post-logout landing (must be in the app-client LogoutURLs). Realizes C4 destination. */
export function postLogoutUrl(config: AuthConfig = authConfig): string {
  void config; // reserved for per-config overrides (mirrors angular-amplify-v6)
  return `${appOrigin()}/login`;
}

/**
 * Cognito hosted `/logout` URL. Realizes C4 step 3.
 *
 * WHY HAND-BUILT (the Cognito friction, spec §4.1): Cognito's `/logout` takes
 * NON-standard params — `client_id` + `logout_uri` instead of the OIDC-standard
 * `id_token_hint` + `post_logout_redirect_uri` — so oidc-client-ts `signoutRedirect()`
 * cannot target it correctly EVEN THOUGH this pool's discovery doc advertises
 * `end_session_endpoint`. The non-standard params, not a missing endpoint, are the
 * reason the adapter builds the URL explicitly. (Angular's Amplify built this URL
 * internally — auth.service.ts:267-281; the React stack makes us build it.) CONFIRMED
 * at runtime (PoC 2026-06-17, pool us-east-1_Hzo7R6XQY): the param shape is accepted —
 * `/logout` 302s to `logout_uri` and ends the Cognito session.
 */
export function cognitoLogoutUrl(config: AuthConfig = authConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: postLogoutUrl(config),
  });
  return `https://${config.cognitoDomain}/logout?${params.toString()}`;
}

/**
 * Derive react-oidc-context `AuthProviderProps` from `authConfig`.
 *
 * Realizes:
 *  - C1 — oidc-client-ts defaults to Authorization Code + PKCE(S256); the implicit
 *    grant (`response_type` of `token`) is NEVER selected. We do not set response_type to
 *    anything but the default 'code'.
 *  - C2 — `userStore` is `localStorage` (the fleet default: persistent, multi-tab
 *    session, survives reload). oidc-client-ts validates the id_token against the issuer
 *    JWKS (sig/iss/aud/exp). Swap to `window.sessionStorage` for a tab-scoped session.
 *  - C3 — `automaticSilentRenew: true` (refresh-token grant; CONFIRMED vs Cognito, PoC 2026-06-17).
 *  - C5 — `onSigninCallback` scrubs ?code/?state from the URL via history.replaceState.
 *  - C8 — `scope` from config. (Per-IdP `identity_provider` is passed at signIn time,
 *    see useAuthService.signIn, so a single client supports the configured provider mix.)
 */
export function buildOidcConfig(config: AuthConfig = authConfig): AuthProviderProps {
  return {
    authority: cognitoAuthority(config),
    client_id: config.clientId,
    redirect_uri: `${appOrigin()}/auth/callback`, // C5 callback target
    post_logout_redirect_uri: postLogoutUrl(), // C4 landing
    scope: config.scopes.join(' '), // C8
    automaticSilentRenew: true, // C3 silent refresh
    userStore: new WebStorageStateStore({ store: window.localStorage }), // C2 — fleet default
    // C5 — strip the OAuth params from the URL after a successful sign-in.
    onSigninCallback: () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    },
  };
}
