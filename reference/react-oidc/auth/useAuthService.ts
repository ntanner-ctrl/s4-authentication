/**
 * useAuthService.ts — React + react-oidc-context adapter
 *
 * Thin wrapper over react-oidc-context's useAuth() that realizes the runtime auth
 * outcomes of STANDARD.md. Mechanism only. Analog of angular-amplify-v6/auth/auth.service.ts.
 *
 * useAuth() surface verified via Context7 /authts/react-oidc-context (2026-06-17):
 * { isAuthenticated, isLoading, user, error, signinRedirect, signoutRedirect,
 *   removeUser, revokeTokens }.
 */
import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';

import {
  authConfig,
  cognitoLogoutUrl,
  COGNITO_IDP,
  type Provider,
} from '../auth.config';

export interface AuthService {
  /** C2/C7 — truth from the library's verified session, never a hand-decode. */
  isAuthenticated: boolean;
  /** True until the session is resolved on load — guards must treat this as "unknown". */
  isLoading: boolean;
  /** Non-trust display fields only (e.g. greeting). Never gate access on these. */
  email?: string;
  userId?: string;
  /** C1/C8 — start Authorization Code + PKCE for a configured provider. */
  signIn: (provider: Provider, returnUrl?: string) => Promise<void>;
  /** C4 — complete logout: revoke + clear + Cognito /logout redirect. */
  logout: () => Promise<void>;
  /** C2 — access token from the verified session (null when none). */
  getAccessToken: () => string | null;
  getIdToken: () => string | null;
}

export function useAuthService(): AuthService {
  const auth = useAuth();

  const signIn = useCallback(
    async (provider: Provider, returnUrl?: string) => {
      // Defense in depth for C8 — refuse a provider not enabled by config.
      if (!authConfig.providers.includes(provider)) {
        throw new Error(`Provider "${provider}" is not enabled in auth.config.`);
      }
      // C1 — code+PKCE (oidc-client-ts default). C8 — identity_provider selects the IdP
      // at the hosted UI so the user skips the Cognito chooser. C6 — returnUrl rides in
      // `state` and is read back by resolvePostLoginTarget after the callback.
      await auth.signinRedirect({
        extraQueryParams: { identity_provider: COGNITO_IDP[provider] },
        state: returnUrl ?? authConfig.postLoginRoute,
      });
    },
    [auth],
  );

  const logout = useCallback(async () => {
    // C4 — ALL THREE steps, no stub:
    //  1. Global revoke at the provider. CONFIRMED at runtime (PoC 2026-06-17):
    //     Cognito's /oauth2/revoke supports ONLY the refresh token — an access-token
    //     revoke returns 400 `unsupported_token_type`. We therefore revoke the refresh
    //     token specifically; the default ['access_token','refresh_token'] would 400 on
    //     the first type and skip the refresh one. Still best-effort: step 3's /logout
    //     redirect ends the IdP session, so a session cannot silently re-enter even if
    //     this fails.
    try {
      await auth.revokeTokens(['refresh_token']);
    } catch {
      /* best-effort; step 3 still ends the IdP session */
    }
    //  2. Clear all locally stored tokens/session state.
    try {
      await auth.removeUser();
    } catch {
      /* fall through — step 3 leaves no usable session */
    }
    //  3. Redirect through Cognito hosted /logout so the IdP session ends. Hand-built
    //     URL (spec §4.1 — Cognito's non-standard logout params). This navigation is
    //     the single redirect path; there is no competing handler.
    window.location.assign(cognitoLogoutUrl());
  }, [auth]);

  // C2 — tokens come ONLY from the library's verified User object, never a bare decode.
  const getAccessToken = useCallback(
    () => auth.user?.access_token ?? null,
    [auth],
  );
  const getIdToken = useCallback(() => auth.user?.id_token ?? null, [auth]);

  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    // `profile` is the SDK-parsed payload of an already-verified id_token — DISPLAY only.
    email: typeof auth.user?.profile.email === 'string' ? auth.user.profile.email : undefined,
    userId: auth.user?.profile.sub,
    signIn,
    logout,
    getAccessToken,
    getIdToken,
  };
}
