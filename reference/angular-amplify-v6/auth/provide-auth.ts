/**
 * provide-auth.ts — Angular 17 + Amplify v6 adapter
 *
 * The app-bootstrap shim. Fills the call site that `auth.config.ts` documents
 * but does not itself provide ("Call once at app bootstrap:
 * Amplify.configure(buildAmplifyConfig(authConfig))" — auth.config.ts:189).
 * Mechanism only (the Amplify v6 configure call + Angular DI plumbing); the
 * normative outcomes live in STANDARD.md.
 *
 * Wire it into the root ApplicationConfig:
 *   export const appConfig: ApplicationConfig = {
 *     providers: [provideAuth(), provideRouter(routes), ...],
 *   };
 *
 * The `s4-auth-angular` ng-add schematic derives its template from THIS file and
 * inserts `provideAuth()` into the consumer's app.config.ts automatically. A
 * future React adapter (reference/react-oidc/) owns its OWN bootstrap shim
 * in its own idiom — this is mechanism, not contract, so it does not move when a
 * stack is added.
 */
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { defaultStorage } from 'aws-amplify/utils';

import { authConfig, buildAmplifyConfig } from '../auth.config';

/**
 * Configures the Amplify v6 client from `auth.config.ts` (the single per-app
 * config surface) and returns Angular EnvironmentProviders for the root config.
 *
 * The auth services are `providedIn: 'root'`, so no providers are registered
 * today; returning EnvironmentProviders keeps the bootstrap call-site stable if
 * DI registrations are added later (e.g. an auth HTTP interceptor).
 */
export function provideAuth(): EnvironmentProviders {
  Amplify.configure(buildAmplifyConfig(authConfig));
  // C2 — token storage = localStorage (the fleet default: persistent, multi-tab session
  // that survives reload). This is Amplify v6's default; set explicitly so the C2 choice
  // is auditable in code rather than an inherited library default. `sessionStorage` (from
  // aws-amplify/utils) is the acceptable alternative for a tab-scoped session.
  cognitoUserPoolsTokenProvider.setKeyValueStorage(defaultStorage);
  return makeEnvironmentProviders([]);
}
