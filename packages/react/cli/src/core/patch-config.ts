// Patch the per-app defaults in the copied auth.config.ts.
//
// Only three fields are per-app surface (auth.config.ts:106,107,113): `providers` (C8),
// `appTitle` (presentation), and `postLoginRoute` (C6). Everything else is STANDARD-bound
// policy and must NOT be edited per app. We rewrite ONLY the value token on each line,
// preserving the trailing `// C8 — ...` comments — a conservative, idempotent string edit
// (not an AST transform; this file's shape is ours and fixed).

export interface AuthConfigPatch {
  /** C8 enabled IdPs, e.g. ['google','microsoft']. */
  providers?: string[];
  /** Login-card heading. */
  appTitle?: string;
  /** C6 post-login landing route. */
  postLoginRoute?: string;
}

/** Matches a single-quoted TS string literal, honoring backslash escapes (e.g. \'). */
const TS_STRING = "'(?:[^'\\\\]|\\\\.)*'";

/** Return `src` with the three per-app defaults rewritten. Omitted fields are left as-is. */
export function patchAuthConfig(src: string, patch: AuthConfigPatch): string {
  let out = src;

  if (patch.providers !== undefined) {
    const literal = `[${patch.providers.map((p) => `'${p}'`).join(", ")}]`;
    // Replace only the array value; the line's trailing // C8 comment is left intact.
    out = replaceValue(out, /(^[ \t]*providers:[ \t]*)\[[^\]]*\]/m, literal);
  }
  if (patch.appTitle !== undefined) {
    const literal = `'${escapeSingleQuotes(patch.appTitle)}'`;
    out = replaceValue(out, new RegExp(`(^[ \\t]*appTitle:[ \\t]*)${TS_STRING}`, "m"), literal);
  }
  if (patch.postLoginRoute !== undefined) {
    const literal = `'${escapeSingleQuotes(patch.postLoginRoute)}'`;
    out = replaceValue(out, new RegExp(`(^[ \\t]*postLoginRoute:[ \\t]*)${TS_STRING}`, "m"), literal);
  }

  return out;
}

/** Replace the value token after the captured key prefix. Function form avoids `$` pitfalls. */
function replaceValue(src: string, re: RegExp, literal: string): string {
  return src.replace(re, (_match, prefix: string) => `${prefix}${literal}`);
}

function escapeSingleQuotes(s: string): string {
  return s.replace(/'/g, "\\'");
}
