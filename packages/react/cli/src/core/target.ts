// Target-directory classification (WU3). Decides the install path:
//   empty          → scaffold a fresh create-vite react-ts app, then install
//   pristine-vite  → an UNMODIFIED create-vite default → skip scaffold, install (greenfield)
//   app            → a real app with content → brownfield install
//
// Pure: classifyTarget only reads the directory. The create-vite scaffold subprocess lives in
// the command layer (and is proven by smoke-react.sh, WU6). Also the single home for the small
// dir-inspection helpers (package.json read, Vite/TypeScript detection) the command layer needs.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAlreadyInstalled } from "./install";
import type { PackageJsonDeps } from "./deps";

export type TargetClass = "empty" | "pristine-vite" | "app";

export interface TargetInfo {
  targetClass: TargetClass;
  /** Vite app? (dep or vite.config.*). Controls vite-env.d.ts copy + greenfield shape. */
  vite: boolean;
  /** TypeScript app? (typescript dep or tsconfig.json). */
  typescript: boolean;
  /** Parsed target package.json ({} when none) — reused by the install core's dep decisions. */
  packageJson: PackageJsonDeps;
}

/** Dir entries that don't count as "content" when deciding emptiness. */
const IGNORABLE_ENTRIES = new Set([".git", ".DS_Store", "Thumbs.db", ".gitkeep", ".idea", ".vscode"]);

/**
 * Markers of an UNMODIFIED create-vite react(-ts) demo App. The template was redesigned in
 * create-vite 7 — the long-standing "Vite + React" heading is gone — so we also match the bundled
 * demo-logo import, which has stayed put across template generations. Either present = still the
 * untouched demo (greenfield); an App edited away from the demo matches neither and is treated as a
 * real app (conservative: better to under-claim pristine than generate over real code).
 */
const VITE_TEMPLATE_MARKERS = ["Vite + React", "assets/react.svg"];

export function classifyTarget(dir: string): TargetInfo {
  const packageJson = readPackageJson(dir);

  if (!existsSync(dir) || isEffectivelyEmpty(dir)) {
    return { targetClass: "empty", vite: false, typescript: false, packageJson };
  }

  const vite = detectVite(dir, packageJson);
  const typescript = detectTypeScript(dir, packageJson);
  // Pristine only if it's Vite, the adapter isn't already here, and App still matches the template.
  const pristine = vite && !isAlreadyInstalled(dir) && looksPristineVite(dir);

  return { targetClass: pristine ? "pristine-vite" : "app", vite, typescript, packageJson };
}

export function readPackageJson(dir: string): PackageJsonDeps {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return {};
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJsonDeps;
  } catch {
    return {}; // malformed → treat as no deps known (downstream install surfaces it)
  }
}

export function detectVite(dir: string, pkg: PackageJsonDeps): boolean {
  if ("vite" in allDeps(pkg)) return true;
  return ["vite.config.ts", "vite.config.js", "vite.config.mjs"].some((f) => existsSync(join(dir, f)));
}

export function detectTypeScript(dir: string, pkg: PackageJsonDeps): boolean {
  if ("typescript" in allDeps(pkg)) return true;
  return existsSync(join(dir, "tsconfig.json"));
}

function allDeps(pkg: PackageJsonDeps): Record<string, string> {
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
}

function isEffectivelyEmpty(dir: string): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return true; // unreadable/nonexistent → treat as empty (scaffold surfaces real errors)
  }
  return entries.every((e) => IGNORABLE_ENTRIES.has(e));
}

/**
 * Does this look like an UNMODIFIED create-vite scaffold? The default App carries the very stable
 * "Vite + React" heading across template versions. An edited App is conservatively treated as a
 * real app (brownfield) so WU5 bails-to-checklist rather than generating over real code.
 */
function looksPristineVite(dir: string): boolean {
  for (const appFile of ["src/App.tsx", "src/App.jsx"]) {
    const abs = join(dir, appFile);
    if (!existsSync(abs)) continue;
    try {
      const src = readFileSync(abs, "utf8");
      return VITE_TEMPLATE_MARKERS.some((marker) => src.includes(marker));
    } catch {
      return false;
    }
  }
  return false;
}
