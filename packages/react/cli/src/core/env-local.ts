// Render the target app's .env.local from the four deploy-specific Cognito values.
//
// These four are the ONLY deploy-time-specific values (auth.config.ts:16-20); none are
// secrets (all ship in the browser bundle). Vite git-ignores .env.local by default, and
// statically replaces import.meta.env.VITE_* at build time.

export interface CognitoConfig {
  /** CFN Output: UserPoolId */
  userPoolId: string;
  /** CFN Output: UserPoolClientId */
  clientId: string;
  /** CFN Output: CognitoDomain (bare host, no scheme) */
  cognitoDomain: string;
  /** AWS region of the user pool */
  region: string;
}

/** The four VITE_* keys auth.config.ts reads (vite-env.d.ts), in declaration order. */
export const ENV_KEYS = {
  userPoolId: "VITE_USER_POOL_ID",
  clientId: "VITE_USER_POOL_CLIENT_ID",
  cognitoDomain: "VITE_COGNITO_HOSTED_DOMAIN",
  region: "VITE_AWS_REGION",
} as const;

/** Produce the full .env.local file content (trailing newline included). */
export function renderEnvLocal(cfg: CognitoConfig): string {
  const lines = [
    "# Cognito deploy config — written by @s4/auth-react. Git-ignored by Vite default.",
    `${ENV_KEYS.userPoolId}=${cfg.userPoolId}`,
    `${ENV_KEYS.clientId}=${cfg.clientId}`,
    `${ENV_KEYS.cognitoDomain}=${cfg.cognitoDomain}`,
    `${ENV_KEYS.region}=${cfg.region}`,
  ];
  return lines.join("\n") + "\n";
}

export interface EnvMergeResult {
  /** Full new .env.local content. */
  content: string;
  /** Owned keys present with a different value and left untouched (non-force). */
  conflicts: string[];
  /** True when an existing file was merged → caller should write a .bak first. */
  merged: boolean;
}

/** Owned keys, derived from ENV_KEYS so the merge and the renderer cannot drift. */
const OWNED = Object.values(ENV_KEYS) as string[];

/**
 * `KEY=` or `export KEY=` → "KEY"; anything else (comment, blank, junk) → null.
 *
 * dotenv (which Vite uses to load .env files) strips a leading `export ` prefix, so a
 * developer's `export VITE_AWS_REGION=us-west-2` is a real, valid form of the key and must
 * be recognised as ours — otherwise it's classified "not ours", never marked seen, and the
 * merge appends a second unprefixed line with a different value (silent double-definition,
 * no conflict warning).
 */
function keyOf(line: string): string | null {
  const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return m ? m[1] : null;
}

/** Strip one matching pair of surrounding quotes, mirroring dotenv's quoted-value handling. */
function unquote(value: string): string {
  const m = /^(['"])([\s\S]*)\1$/.exec(value);
  return m ? m[2] : value;
}

/**
 * Merge the four deploy values into an existing .env.local instead of overwriting it.
 *
 * .env.local is git-ignored, so a clobber is UNRECOVERABLE — for many devs it is the only
 * copy of their local API URLs. Policy: never touch a line we don't own; append owned keys
 * that are absent; leave an owned key that disagrees and report it (unless force).
 */
export function mergeEnvLocal(
  existing: string | null,
  cfg: CognitoConfig,
  opts: { force: boolean }
): EnvMergeResult {
  if (existing === null) {
    return { content: renderEnvLocal(cfg), conflicts: [], merged: false };
  }

  const desired: Record<string, string> = {
    [ENV_KEYS.userPoolId]: cfg.userPoolId,
    [ENV_KEYS.clientId]: cfg.clientId,
    [ENV_KEYS.cognitoDomain]: cfg.cognitoDomain,
    [ENV_KEYS.region]: cfg.region,
  };

  const conflicts: string[] = [];
  const seen = new Set<string>();

  const out = existing.split("\n").map((line) => {
    const k = keyOf(line);
    if (!k || !(k in desired)) return line; // not ours — byte-identical
    seen.add(k);
    const current = line.slice(line.indexOf("=") + 1).trim();
    if (unquote(current) === desired[k]) return line;
    if (opts.force) {
      const exportPrefix = /^\s*export\s+/.test(line) ? "export " : "";
      return `${exportPrefix}${k}=${desired[k]}`;
    }
    conflicts.push(k);
    return line;
  });

  const missing = OWNED.filter((k) => !seen.has(k));
  if (missing.length > 0) {
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
    out.push("", "# Cognito deploy config — added by @s4/auth-react.");
    for (const k of missing) out.push(`${k}=${desired[k]}`);
  }

  let content = out.join("\n");
  if (!content.endsWith("\n")) content += "\n";
  return { content, conflicts, merged: true };
}
