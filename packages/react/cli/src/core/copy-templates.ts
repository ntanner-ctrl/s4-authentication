// Copy the bundled adapter templates into the target app's src/, mirroring curated-manifest.txt.
//
// The bundled templates/ dir (built by scripts/bundle.sh from reference/react-oidc/) holds the
// five adapter items at its root. This maps them under <target>/src/. vite-env.d.ts is skipped
// for non-Vite targets (a Vite app gets ImportMetaEnv from vite/client; a non-Vite app would
// get a duplicate/irrelevant ambient decl).

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface CopyOptions {
  /** When false, vite-env.d.ts is not copied (non-Vite target). */
  vite: boolean;
}

/** One entry of the bundled-templates → target-src mapping. */
export interface TemplateItem {
  /** Path relative to the templates/ dir. */
  from: string;
  /** Path relative to the target dir. */
  to: string;
  /** True for vite-env.d.ts — skipped on non-Vite targets. */
  viteOnly?: boolean;
  /**
   * When `to` already exists, write here instead. F6: the adapter's vite-env.d.ts declares
   * ImportMetaEnv for the four VITE_* keys; the app's declares its own PLUS the
   * `vite/client` reference for the whole app. Interface merging needs BOTH files to
   * exist — overwriting destroys the app's and leaves nothing to merge with.
   */
  fallbackTo?: string;
}

/** The five adapter items, mirroring packages/react/scripts/curated-manifest.txt. */
export const TEMPLATE_ITEMS: TemplateItem[] = [
  { from: "auth.config.ts", to: "src/auth.config.ts" },
  { from: "auth", to: "src/auth" },
  { from: "login", to: "src/login" },
  { from: "auth.css", to: "src/auth.css" },
  { from: "vite-env.d.ts", to: "src/vite-env.d.ts", viteOnly: true, fallbackTo: "src/s4-auth-env.d.ts" },
];

/**
 * Copy each applicable template item from `templatesDir` into `targetDir`.
 * Returns the list of destination paths (relative to targetDir) actually written.
 */
export function copyTemplates(templatesDir: string, targetDir: string, opts: CopyOptions): string[] {
  const written: string[] = [];
  for (const item of TEMPLATE_ITEMS) {
    if (item.viteOnly && !opts.vite) continue;
    const to = item.fallbackTo && existsSync(join(targetDir, item.to)) ? item.fallbackTo : item.to;
    const src = join(templatesDir, item.from);
    const dst = join(targetDir, to);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true }); // recursive handles both files and dirs (auth/, login/)
    written.push(to);
  }
  return written;
}
