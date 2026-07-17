/**
 * useIdleTimeout.ts — React + react-oidc-context adapter
 *
 * Realizes STANDARD.md C3 (idle timeout) — 30 minutes (authConfig.session.idleTimeout)
 * with no user activity triggers a complete logout (via C4). Activity resets the timer.
 * react-oidc-context has no idle timeout, so this is hand-authored (analog of the Angular
 * service's startIdleWatch, auth.service.ts:330-349). Silent refresh (the other half of
 * C3) is handled by the library's automaticSilentRenew, not here.
 *
 * Usage — mount once inside an authenticated layout:
 *   function ProtectedLayout() {
 *     const { logout } = useAuthService();
 *     useIdleTimeout(logout);
 *     return <Outlet />;
 *   }
 */
import { useEffect, useRef } from 'react';

import { authConfig } from '../auth.config';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

export function useIdleTimeout(onIdle: () => void): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle; // always call the latest logout without re-arming listeners

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      // 30 min elapsed with no activity -> complete logout (C4).
      timer = setTimeout(() => onIdleRef.current(), authConfig.session.idleTimeout);
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // arm immediately

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);
}
