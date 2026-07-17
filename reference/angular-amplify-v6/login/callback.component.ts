/**
 * callback.component.ts — Angular 17 + Amplify v6 adapter
 *
 * The OAuth redirect target (`/auth/callback`). Amplify v6 consumes the
 * `code`/`state` in the URL ASYNCHRONOUSLY and signals completion via the Hub
 * `signedIn` / `signInWithRedirect` events (handled in AuthService). This
 * component's job is purely the C5/C6 landing:
 *
 *   - C5: replace the callback URL OUT of history with `replaceUrl:true` so Back
 *         cannot re-fire the already-redeemed authorization code.
 *   - C6: send the user to their returnUrl (from the OAuth customOAuthState the
 *         service captured) or the single configured postLoginRoute; fail-closed
 *         to /login otherwise (C7).
 *
 * RACE FIX: the landing navigation is driven off the service's `signedIn$`
 * (which fires only AFTER Amplify has consumed the code and the session is
 * verified), NOT off ngOnInit alone. Resolving the target purely in ngOnInit
 * raced the asynchronous code consumption and intermittently bounced verified
 * users to /login while replacing history.
 *
 * REQUIRED IMPORT: `aws-amplify/auth/enable-oauth-listener` MUST execute on this
 * redirect-landing page (imported below). Without it Amplify v6 never consumes
 * the `code`/`state` and the Hub events never fire. Verified via Context7
 * /aws-amplify/docs (external-identity-providers). In a multi-entry app, ensure
 * this module is loaded on the redirect route specifically.
 *
 * Mechanism only. Route it as:
 *   { path: 'auth/callback', component: CallbackComponent }
 */
import 'aws-amplify/auth/enable-oauth-listener';

import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';

import {
  navigateReplacingCallback,
  resolvePostLoginTarget,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <main class="callback" role="status" aria-live="polite">
      <p>Completing sign-in…</p>
    </main>
  `,
  styles: [
    `
      .callback {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 50vh;
        font-family: system-ui, sans-serif;
        color: #555;
      }
    `,
  ],
})
export class CallbackComponent implements OnInit {
  /** If neither success nor failure fires within this window, bail to /login. */
  private static readonly STALL_TIMEOUT_MS = 15_000;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private landed = false;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // C5 RACE FIX — wait for the service to signal that Amplify has finished
    // consuming the code/state and the session is verified, THEN land.
    this.auth.signedIn$
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.land());

    // Failure path — Amplify rejected the returned code/state. Fail closed but
    // VISIBLY: land on /login with the error surfaced (LoginComponent renders
    // the `error` query param), replacing history (C5).
    this.auth.signInFailed$
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => void this.landOnLoginWithError(message));

    // Stall watchdog — covers the silent no-event cases: a flow not initiated
    // by this app (no inflight OAuth state, Amplify does nothing at all) or a
    // landing navigation cancelled by a downstream route guard. Cleared on a
    // successful landing and on component destroy (a guard may have redirected
    // the user elsewhere itself).
    this.stallTimer = setTimeout(() => {
      void this.landOnLoginWithError('Sign-in did not complete. Please try again.');
    }, CallbackComponent.STALL_TIMEOUT_MS);
    this.destroyRef.onDestroy(() => {
      if (this.stallTimer) clearTimeout(this.stallTimer);
    });

    // Defensive fallback: if the page was reached already-authenticated (e.g. a
    // stale callback URL revisited where no new event will fire), don't hang.
    // Fail-closed semantics still hold — resolvePostLoginTarget re-checks the
    // verified session and routes unauthenticated users to /login (C7).
    void this.auth.isAuthenticated().then((ok) => {
      if (ok) void this.land();
    });
  }

  private async land(): Promise<void> {
    if (this.landed) return; // guard against event + fallback double-firing
    this.landed = true;

    // C6 — decide the landing route from the captured customOAuthState returnUrl
    // or postLoginRoute (fail-closed to /login if no verified session — C7).
    const target = await resolvePostLoginTarget(this.route.snapshot, this.auth);

    // C5 — replace history so the consumed callback URL is unreachable via Back.
    const ok = await navigateReplacingCallback(this.router, target);
    if (ok) {
      if (this.stallTimer) clearTimeout(this.stallTimer);
    } else {
      // A downstream route guard cancelled the landing WITHOUT redirecting.
      // Re-arm so the stall watchdog (or a later event) can still move the
      // user off this page instead of stranding them on the spinner.
      this.landed = false;
    }
  }

  private async landOnLoginWithError(message: string): Promise<void> {
    if (this.landed) return;
    this.landed = true;
    if (this.stallTimer) clearTimeout(this.stallTimer);

    await this.router.navigate(['/login'], {
      queryParams: { error: message },
      replaceUrl: true, // C5 — the consumed callback URL must not survive in history
    });
  }
}
