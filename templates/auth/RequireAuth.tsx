/**
 * RequireAuth.tsx — React + react-oidc-context adapter
 *
 * Realizes STANDARD.md C7 — fail-closed route guard, applied by default to every
 * protected route. Realizes C6 — on denial, captures the attempted URL as `returnUrl`
 * so the user is returned there after login. React Router idiom (analog of the Angular
 * functional authGuard, auth.guard.ts).
 *
 * Wire as a layout/element wrapper on protected routes (C7 "on by default"):
 *   <Route element={<RequireAuth><ProtectedLayout/></RequireAuth>}>
 *     <Route path="/home" element={<Home/>} />
 *   </Route>
 *
 * NOTE (C7): there is intentionally NO escape hatch — no query param, env flag, or
 * kill-switch grants access. The ONLY "allow" path is a resolved, authenticated session.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router';

import { authConfig } from '../auth.config';
import { useAuthService } from './useAuthService';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthService();
  const location = useLocation();

  // C7 — UNKNOWN (still resolving) is NOT "allow". Render nothing until resolved; the
  // session is never assumed valid. (A spinner is fine; granting access is not.)
  if (isLoading) {
    return null;
  }

  // C7 — the single allow path.
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // C6 — preserve the deep-linked protected URL as returnUrl; fail closed to /login.
  const returnUrl = location.pathname + location.search;
  return <Navigate to="/login" replace state={{ returnUrl }} />;
}

/**
 * Realizes STANDARD.md C6 — resolve where a freshly-authenticated user lands: their
 * original deep-linked URL (returnUrl), else the single configured postLoginRoute. The
 * returnUrl is read from the OAuth `state` the library round-tripped (set in
 * useAuthService.signIn), with the React Router location state as a same-tab fallback.
 */
export function resolvePostLoginTarget(
  oidcState: unknown,
  routerState: unknown,
): string {
  if (typeof oidcState === 'string' && oidcState.length > 0) {
    return oidcState;
  }
  if (
    routerState &&
    typeof routerState === 'object' &&
    'returnUrl' in routerState &&
    typeof (routerState as { returnUrl: unknown }).returnUrl === 'string'
  ) {
    return (routerState as { returnUrl: string }).returnUrl;
  }
  return authConfig.postLoginRoute;
}
