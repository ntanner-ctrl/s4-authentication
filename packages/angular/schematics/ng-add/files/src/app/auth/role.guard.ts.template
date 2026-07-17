/**
 * role.guard.ts — Angular 17 + Amplify v6 adapter
 *
 * OPTIONAL coarse role gate. Intentionally a thin, fail-closed stub.
 *
 * SCOPE (design §1): per-user *data-layer* authorization (Hasura JWT mode,
 * removing the admin secret from bundles) is explicitly OUT OF SCOPE for this
 * framework — it is the repo-owner's responsibility (see STANDARD.md "What is
 * *not* in this contract"). This guard therefore only demonstrates a fail-closed
 * route-level role check against verified token claims; it is NOT a substitute
 * for server/data-layer authz.
 *
 * Mechanism only. The Contract defines no role clause; this realizes the C7
 * fail-closed *posture* for an app that opts into route-level roles.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Factory: guard a route on a required Cognito group.
 *
 * Realizes STANDARD.md C7 (posture) — fail-closed: any error, missing session,
 * or absent group => DENY (redirect to login). There is no "allow on unknown".
 * Group membership is read from `cognito:groups` on the SDK/JWKS-verified access
 * token (C2) — never from a self-decoded token.
 */
export function roleGuard(requiredGroup: string): CanActivateFn {
  return async (): Promise<boolean | UrlTree> => {
    const router = inject(Router);
    try {
      const session = await fetchAuthSession(); // verified + auto-refreshing (C2)
      const accessToken = session.tokens?.accessToken;
      if (!accessToken) {
        return router.createUrlTree(['/login']); // no verified session => deny
      }
      // `cognito:groups` is a verified claim on the validated token (display/authz
      // is permitted here because the token itself is JWKS-verified, satisfying C2).
      const groups = accessToken.payload['cognito:groups'];
      const allowed = Array.isArray(groups) && groups.includes(requiredGroup);
      // C7 — only an explicit, positive membership check returns true.
      return allowed ? true : router.createUrlTree(['/login']);
    } catch {
      // C7 — unknown/error => deny. NB: out of scope per design §1 to enforce
      // data-layer authz; this is route-level only.
      return router.createUrlTree(['/login']);
    }
  };
}
