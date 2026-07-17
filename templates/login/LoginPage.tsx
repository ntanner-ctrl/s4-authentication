/**
 * LoginPage.tsx — React + react-oidc-context adapter
 *
 * The in-app login card. Renders ONE button per enabled provider (C8 — the button set
 * is derived from authConfig.providers, never hardcoded/forked). Clicking starts the
 * code+PKCE redirect for that provider (C1) carrying the returnUrl (C6).
 *
 * Realizes C5 (login idempotence): if already authenticated, this route forwards to the
 * post-login target WITHOUT re-initiating sign-in and WITHOUT stacking history (replace).
 *
 * Ships the standardized branded card (`auth.css`) — gradient page, white card, inlined
 * provider marks — matching angular-amplify-v6/login so both adapters present the SAME
 * login across the fleet. A consumer MAY restyle with its own design system, but the
 * provider-loop + signIn wiring is the part that must not be forked.
 */
import { type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router';

import '../auth.css';
import { authConfig, type Provider } from '../auth.config';
import { resolvePostLoginTarget } from '../auth/RequireAuth';
import { useAuthService } from '../auth/useAuthService';

const PROVIDER_LABEL: Record<Provider, string> = {
  google: 'Continue with Google',
  microsoft: 'Continue with Microsoft',
};

/* Official provider marks, inlined (no external image hosts — login must render on
   offline/kiosk networks). aria-hidden: the button text already names the provider. */
const PROVIDER_LOGO: Record<Provider, ReactElement> = {
  google: (
    <svg className="auth-login__logo" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" />
      <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </svg>
  ),
  microsoft: (
    <svg className="auth-login__logo" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  ),
};

export function LoginPage() {
  const { isAuthenticated, isLoading, signIn } = useAuthService();
  const location = useLocation();

  if (isLoading) {
    return <div className="auth-login__status">Checking authentication…</div>;
  }

  // C5 (login idempotence) — authenticated visit forwards without re-initiating auth,
  // replacing the login history entry.
  if (isAuthenticated) {
    const target = resolvePostLoginTarget(undefined, location.state);
    return <Navigate to={target} replace />;
  }

  const returnUrl =
    (location.state &&
      typeof location.state === 'object' &&
      'returnUrl' in location.state &&
      typeof (location.state as { returnUrl: unknown }).returnUrl === 'string'
      ? (location.state as { returnUrl: string }).returnUrl
      : undefined) ?? undefined;

  return (
    <div className="auth-login">
      <main className="auth-login__card" role="main">
        <h1 className="auth-login__title">{authConfig.appTitle ?? 'Sign in'}</h1>
        <div className="auth-login__providers">
          {/* C8 — one button per ENABLED provider, from config. */}
          {authConfig.providers.map((provider) => (
            <button
              key={provider}
              type="button"
              className={`auth-login__btn auth-login__btn--${provider}`}
              onClick={() => void signIn(provider, returnUrl)}
            >
              {PROVIDER_LOGO[provider]}
              <span>{PROVIDER_LABEL[provider]}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
