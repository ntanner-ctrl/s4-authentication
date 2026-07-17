/**
 * CallbackPage.tsx — React + react-oidc-context adapter
 *
 * The /auth/callback landing. react-oidc-context consumes the ?code/?state automatically
 * and runs onSigninCallback (auth.config.ts) to scrub the params from the URL — that is
 * C5's history replacement, library-provided. This component only:
 *   - shows a wait-state while the library resolves the code (auth.isLoading),
 *   - on success, navigates to the C6 target with REPLACE (so the callback entry is not
 *     in history — reinforces C5),
 *   - on failure, fails closed VISIBLY to /login with a message (never strands the user).
 *
 * Analog of angular-amplify-v6/login/callback.component.ts.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from 'react-oidc-context';

import '../auth.css';
import { resolvePostLoginTarget } from '../auth/RequireAuth';

export function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isLoading) {
      return;
    }
    if (auth.isAuthenticated) {
      // C6 — returnUrl rode in the OAuth `state`; else the configured landing.
      const target = resolvePostLoginTarget(auth.user?.state, undefined);
      // C5 — replace so Back does not return to the consumed callback URL.
      navigate(target, { replace: true });
    } else if (auth.error) {
      // Fail closed, VISIBLY (C7 spirit): land on /login with the error, replacing history.
      navigate('/login', { replace: true, state: { error: auth.error.message } });
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error, auth.user, navigate]);

  if (auth.error) {
    return <div className="auth-callback__error">Sign-in failed: {auth.error.message}</div>;
  }
  return <div className="auth-callback__status">Completing sign-in…</div>;
}
