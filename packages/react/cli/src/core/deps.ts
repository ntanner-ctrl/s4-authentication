// Runtime-dependency policy: which packages the adapter needs, and which are still missing
// from a target app. Pure — no install side effects (the orchestrator runs the detected
// package manager; smoke-react.sh proves the real install + typecheck).

import type { RouterPackage } from "./router-package";

export interface Dep {
  name: string;
  /** Optional semver range. Omitted = let the package manager resolve "latest". */
  version?: string;
}

/**
 * The three runtime deps the React adapter requires (mirrors smoke-react.sh step 3).
 * The router dep is whichever package the app already uses — never a second one. An app
 * carrying react-router-dom that we also gave react-router would end up with two copies
 * and two React contexts (see router-package.ts).
 */
export function requiredDeps(routerPkg: RouterPackage): Dep[] {
  return [
    { name: "react-oidc-context" },
    { name: "oidc-client-ts" },
    { name: routerPkg, version: "^7" },
  ];
}

export interface PackageJsonDeps {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Return the required deps not already present in dependencies or devDependencies. */
export function missingDeps(pkgJson: PackageJsonDeps, routerPkg: RouterPackage): Dep[] {
  const present = new Set([
    ...Object.keys(pkgJson.dependencies ?? {}),
    ...Object.keys(pkgJson.devDependencies ?? {}),
  ]);
  return requiredDeps(routerPkg).filter((d) => !present.has(d.name));
}

/** Render deps as package-manager install specs, e.g. "react-router@^7". */
export function installSpecs(deps: Dep[]): string[] {
  return deps.map((d) => (d.version ? `${d.name}@${d.version}` : d.name));
}

/** The subset of spawnSync's result this policy needs. */
export interface SpawnResultLike {
  error?: Error;
  status: number | null;
}

/**
 * Did the dependency install fail? `status !== 0` alone already catches every case Node
 * documents for spawnSync: a spawn failure sets `error` and leaves `status` null, and
 * `null !== 0` is true, so a status-only check would still see the failure. The `error`
 * check is deliberate defensive redundancy, not a necessity — it keeps the predicate correct
 * if a result ever carries an error alongside a 0 status, and it expresses intent directly
 * (any error means failure) rather than relying on null happening to be unequal to 0.
 * Extracted from commands.ts so the predicate is unit-testable — the subprocess itself is
 * proven by smoke-react.sh.
 */
export function depInstallFailed(r: SpawnResultLike): boolean {
  return Boolean(r.error) || r.status !== 0;
}
