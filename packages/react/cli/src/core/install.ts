// Orchestrate the mechanical core against a fully-resolved config: copy templates, write
// .env.local, patch the copied auth.config.ts, and DECIDE which deps to install.
//
// Deliberately does NOT run the package manager — returning `depsToInstall` + `pkgManager`
// lets the command layer run the subprocess (and lets this function stay hermetic / unit-
// testable). The real install + `tsc --noEmit` are proven by smoke-react.sh (WU6).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyTemplates } from "./copy-templates";
import { mergeEnvLocal, type CognitoConfig } from "./env-local";
import { patchAuthConfig, type AuthConfigPatch } from "./patch-config";
import { detectPackageManager, type PackageManager } from "./pkg-manager";
import { installSpecs, missingDeps, type PackageJsonDeps } from "./deps";
import { rewriteRouterImports, ROUTER_IMPORT_FILES } from "./rewrite-router-imports";
import type { RouterPackage } from "./router-package";

export interface CoreInput {
  /** Absolute target app dir. */
  targetDir: string;
  /** Absolute path to the bundled templates/ dir. */
  templatesDir: string;
  /** Fully-resolved deploy values (prompts already answered). */
  cognito: CognitoConfig;
  /** Per-app auth.config.ts patch. */
  patch: AuthConfigPatch;
  /** Vite target? Controls whether vite-env.d.ts is copied. */
  vite: boolean;
  /** Parsed target package.json (for missing-dep decisions); {} when none. */
  packageJson: PackageJsonDeps;
  /** --force: overwrite owned .env.local keys that disagree. */
  force: boolean;
  /** Router package the app uses — the copied adapter's imports are rewritten to match. */
  routerPackage: RouterPackage;
}

export interface CoreOutput {
  /** Dest paths (relative to targetDir) copied in. */
  copied: string[];
  /** Absolute path of the written .env.local. */
  envPath: string;
  /** Install specs for the deps not already present (empty = nothing to install). */
  depsToInstall: string[];
  /** Detected package manager (the command layer runs its addCommand + depsToInstall). */
  pkgManager: PackageManager;
  /** Owned .env.local keys left untouched because they disagreed (non-force). */
  envConflicts: string[];
  /** True when .env.local existed and a .bak was written. */
  envBackedUp: boolean;
}

/**
 * Has the adapter already been installed here? The copied src/auth.config.ts is the sentinel.
 * The command layer uses this to warn + bail (require --force) before prompting or overwriting,
 * satisfying the cross-cutting idempotency requirement (re-run = no silent clobber).
 */
export function isAlreadyInstalled(targetDir: string): boolean {
  return existsSync(join(targetDir, "src", "auth.config.ts"));
}

export function applyCore(input: CoreInput): CoreOutput {
  // 1. Copy the bundled adapter source into <target>/src/.
  const copied = copyTemplates(input.templatesDir, input.targetDir, { vite: input.vite });

  // 2. Merge the four deploy values into .env.local — NEVER clobber (F3). The file is
  //    git-ignored, so an overwrite is unrecoverable.
  const envPath = join(input.targetDir, ".env.local");
  const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
  const env = mergeEnvLocal(existingEnv, input.cognito, { force: input.force });
  if (env.merged && existingEnv !== null) writeFileSync(`${envPath}.bak`, existingEnv);
  writeFileSync(envPath, env.content);

  // 3. Patch per-app defaults in the COPIED auth.config.ts (the template source stays pristine).
  const cfgPath = join(input.targetDir, "src", "auth.config.ts");
  writeFileSync(cfgPath, patchAuthConfig(readFileSync(cfgPath, "utf8"), input.patch));

  // 3b. Point the COPIED adapter's router imports at the app's router package (F4). Two
  //     router packages at diverging versions are two React contexts — RequireAuth would
  //     never see the app's router.
  if (input.routerPackage !== "react-router") {
    for (const rel of ROUTER_IMPORT_FILES) {
      const abs = join(input.targetDir, rel);
      if (!existsSync(abs)) continue;
      writeFileSync(abs, rewriteRouterImports(readFileSync(abs, "utf8"), input.routerPackage));
    }
  }

  // 4. Decide which deps still need installing; the command layer runs the subprocess.
  const depsToInstall = installSpecs(missingDeps(input.packageJson, input.routerPackage));
  const pkgManager = detectPackageManager(input.targetDir);

  return { copied, envPath, depsToInstall, pkgManager, envConflicts: env.conflicts, envBackedUp: env.merged };
}
