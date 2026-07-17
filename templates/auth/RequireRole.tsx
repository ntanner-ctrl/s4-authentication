/**
 * RequireRole.tsx — React + react-oidc-context adapter
 *
 * Role/claim guard analog of angular-amplify-v6/auth/role.guard.ts. Composes ON TOP of
 * RequireAuth (authentication first, authorization second). The role decision is made
 * from the VERIFIED id_token claims exposed by the library (auth.user.profile), never a
 * hand-decoded token (C2). Fail-closed (C7): a missing/again-unknown claim denies.
 *
 * Cognito surfaces group membership on the `cognito:groups` claim. Wire as:
 *   <RequireAuth><RequireRole anyOf={['admin']}><AdminLayout/></RequireRole></RequireAuth>
 */
import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from 'react-oidc-context';

import { authConfig } from '../auth.config';

export function RequireRole({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const auth = useAuth();

  // C7 — still resolving is not "allow".
  if (auth.isLoading) {
    return null;
  }

  // C2 — read groups from the verified id_token claims, not a decode.
  const claim = auth.user?.profile['cognito:groups'];
  const groups: string[] = Array.isArray(claim) ? claim.map(String) : [];
  const allowed = anyOf.some((role) => groups.includes(role));

  // C7 — fail closed: unauthenticated OR lacking the role denies. Send to the configured
  // landing (not login) when authenticated-but-unauthorized, to avoid a redirect loop.
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!allowed) {
    return <Navigate to={authConfig.postLoginRoute} replace />;
  }
  return <>{children}</>;
}
