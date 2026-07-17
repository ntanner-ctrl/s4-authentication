"use strict";
// Patch the per-app defaults in the copied auth.config.ts.
//
// Only three fields are per-app surface (auth.config.ts:106,107,113): `providers` (C8),
// `appTitle` (presentation), and `postLoginRoute` (C6). Everything else is STANDARD-bound
// policy and must NOT be edited per app. We rewrite ONLY the value token on each line,
// preserving the trailing `// C8 — ...` comments — a conservative, idempotent string edit
// (not an AST transform; this file's shape is ours and fixed).
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchAuthConfig = void 0;
/** Matches a single-quoted TS string literal, honoring backslash escapes (e.g. \'). */
const TS_STRING = "'(?:[^'\\\\]|\\\\.)*'";
/** Return `src` with the three per-app defaults rewritten. Omitted fields are left as-is. */
function patchAuthConfig(src, patch) {
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
exports.patchAuthConfig = patchAuthConfig;
/** Replace the value token after the captured key prefix. Function form avoids `$` pitfalls. */
function replaceValue(src, re, literal) {
    return src.replace(re, (_match, prefix) => `${prefix}${literal}`);
}
function escapeSingleQuotes(s) {
    return s.replace(/'/g, "\\'");
}
//# sourceMappingURL=patch-config.js.map