/**
 * auth.guard.ts — Angular 17 + Amplify v6 adapter
 *
 * Standalone functional guards (CanActivateFn) realizing the routing-side outcomes
 * of the Auth Contract (STANDARD.md). Mechanism only (Angular Router idioms,
 * replaceUrl). Wire `authGuard` onto every protected route (C7 "on by default").
 *
 *   const routes: Routes = [
 *     { path: 'login', component: LoginComponent },
 *     { path: 'auth/callback', component: CallbackComponent }, // C5/C6 landing
 *     { path: '', canActivate: [authGuard], children: [ ...protected... ] }, // C7
 *   ];
 */
import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

import { authConfig } from '../auth.config';
import { AuthService } from './auth.service';

/**
 * Realizes STANDARD.md C7 — fail-closed authentication guard, applied by default
 * to every protected route. Realizes STANDARD.md C6 — on denial, captures the
 * attempted URL as `returnUrl` so the user is returned there after login.
 *
 * NOTE (C7): there is intentionally no escape hatch — no query param, env flag,
 * or kill-switch grants access. The ONLY "allow" path is a verified session.
 */
export const authGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);

  try {
    // Truth comes from a SDK/JWKS-verified session (C2), not a local flag.
    const ok = await auth.isAuthenticated();
    if (ok) {
      return true;
    }
    // C6 — preserve the deep-linked protected URL as returnUrl.
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  } catch {
    // Realizes STANDARD.md C7 — unknown/error => DENY. The error branch never
    // returns `true`; it redirects to login.
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }
};

/**
 * Realizes STANDARD.md C6 — resolve where a freshly-authenticated user should land:
 * their original deep-linked URL (`returnUrl`), else the single configured
 * `authConfig.postLoginRoute`. Fail-closed: if the session is not verified,
 * target is `/login` (C7).
 *
 * C6 SOURCE-OF-TRUTH (fix): the returnUrl is read from `AuthService.takeReturnUrl()`,
 * which the service populated from the OAuth `customOAuthState` Hub event
 * (`payload.data`). Amplify v6 does NOT expose customState on a query param — it
 * consumes the raw OAuth `state` internally as a CSRF token — so reading
 * `queryParamMap.get('state')` was wrong. An explicit `?returnUrl` (e.g. a
 * same-tab deep link that never left the app) is still honored as a fallback.
 *
 * Called by `CallbackComponent` AFTER the service's `signedIn$` fires, so the
 * session is already verified — no race. C5's history replacement is the
 * imperative `navigateReplacingCallback`.
 */
export async function resolvePostLoginTarget(
  route: ActivatedRouteSnapshot,
  auth: AuthService,
): Promise<string> {
  // C7 — fail closed if the session is not verified at this point.
  if (!(await auth.isAuthenticated())) {
    return '/login';
  }

  // C6 — returnUrl from the customOAuthState the service captured, else an
  // explicit ?returnUrl, else the single configured landing route.
  return (
    auth.takeReturnUrl() ??
    route.queryParamMap.get('returnUrl') ??
    authConfig.postLoginRoute
  );
}

/**
 * Realizes STANDARD.md C5 — the history *replacement* itself.
 *
 * The honest Angular mechanism for C5 is an imperative replacing navigation:
 * returning a redirect `UrlTree` from a guard does NOT guarantee the consumed
 * callback URL is dropped from history. `replaceUrl:true` does. After this runs,
 * pressing Back will not re-fire the callback (no re-submission of an
 * already-redeemed authorization code). A React adapter would use
 * `navigate(target, { replace: true })`.
 */
export function navigateReplacingCallback(router: Router, target: string): Promise<boolean> {
  return router.navigate([target], { replaceUrl: true });
}
