/**
 * AuthRoot.tsx — React + react-oidc-context adapter
 *
 * The app-bootstrap shim (analog of angular-amplify-v6/auth/provide-auth.ts). Wraps the
 * app tree in react-oidc-context's <AuthProvider>, configured from auth.config.ts (the
 * single per-app config surface). Mechanism only; normative outcomes live in STANDARD.md.
 *
 * Wire it at the app root, ABOVE the router. AuthRoot itself has no router dependency
 * (it renders only react-oidc-context's <AuthProvider>), but RequireAuth/LoginPage/
 * CallbackPage use router hooks, so they must render INSIDE the router — putting AuthRoot
 * above it is what guarantees that ordering:
 *   createRoot(el).render(
 *     <AuthRoot>
 *       <BrowserRouter><AppRoutes /></BrowserRouter>
 *     </AuthRoot>
 *   );
 */
import React from 'react';
import { AuthProvider } from 'react-oidc-context';

import { authConfig, buildOidcConfig } from '../auth.config';

export function AuthRoot({ children }: { children: React.ReactNode }) {
  return <AuthProvider {...buildOidcConfig(authConfig)}>{children}</AuthProvider>;
}
