// Resolve install config from CLI flags (the non-interactive path). Whatever the flags don't
// supply for the four REQUIRED Cognito values is reported in `missingCognito` so the command
// layer can prompt for exactly those (or error under --yes). Pure: no prompting here.

import type { CognitoConfig } from "./env-local";
import type { AuthConfigPatch } from "./patch-config";

/** A required Cognito value: its CLI flag, its config key, and its interactive prompt label. */
export interface CognitoField {
  /** Flag name as parsed by args.ts (dashes kept), e.g. "user-pool-id". */
  flag: string;
  key: keyof CognitoConfig;
  /** Prompt shown when the flag is absent (command layer). */
  label: string;
}

/** Single source of truth for the four required Cognito values (flag parsing + prompts). */
export const COGNITO_FIELDS: readonly CognitoField[] = [
  { flag: "user-pool-id", key: "userPoolId", label: "Cognito User Pool ID (CFN Output: UserPoolId)" },
  { flag: "client-id", key: "clientId", label: "Cognito app client ID (CFN Output: UserPoolClientId)" },
  { flag: "cognito-domain", key: "cognitoDomain", label: "Cognito hosted domain, no scheme (CFN Output: CognitoDomain)" },
  { flag: "region", key: "region", label: "AWS region (e.g. us-east-1)" },
];

export interface ResolvedConfig {
  /** The four deploy values supplied via flags (may be partial). */
  cognito: Partial<CognitoConfig>;
  /** Optional per-app auth.config.ts patch from flags. */
  patch: AuthConfigPatch;
  /** Flag names of the required Cognito values still missing — the prompt list. */
  missingCognito: string[];
}

export function resolveFromFlags(flags: Record<string, string>): ResolvedConfig {
  const cognito: Partial<CognitoConfig> = {};
  const missingCognito: string[] = [];
  for (const { flag, key } of COGNITO_FIELDS) {
    const value = flags[flag]?.trim();
    if (value) {
      cognito[key] = value;
    } else {
      missingCognito.push(flag);
    }
  }

  const patch: AuthConfigPatch = {};
  const providers = flags["providers"]?.trim();
  if (providers) {
    patch.providers = providers.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const appTitle = flags["app-title"]?.trim();
  if (appTitle) {
    patch.appTitle = appTitle;
  }
  const postLoginRoute = flags["post-login-route"]?.trim();
  if (postLoginRoute) {
    patch.postLoginRoute = postLoginRoute;
  }

  return { cognito, patch, missingCognito };
}
