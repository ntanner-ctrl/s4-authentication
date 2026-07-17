/**
 * vite-env.d.ts — minimal ambient `import.meta.env` typing for the isolated
 * typecheck harness.
 *
 * Real consumer apps get `ImportMetaEnv` from `vite/client` (referenced in their
 * own `vite-env.d.ts`). This reference module has no Vite dependency and its
 * tsconfig sets `"types": []`, so it declares just the four `VITE_*` keys that
 * `auth.config.ts` reads — enough to keep `npm run typecheck` green in isolation.
 * The CLI never overwrites an app's existing `vite-env.d.ts` — it copies this file's
 * ambient declarations to `s4-auth-env.d.ts` alongside it instead, so the app's
 * `vite/client` reference and its own env keys survive and TypeScript interface
 * merging combines the two files' `ImportMetaEnv` declarations.
 */
interface ImportMetaEnv {
  readonly VITE_USER_POOL_ID?: string;
  readonly VITE_USER_POOL_CLIENT_ID?: string;
  readonly VITE_COGNITO_HOSTED_DOMAIN?: string;
  readonly VITE_AWS_REGION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
