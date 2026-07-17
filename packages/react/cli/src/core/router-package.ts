// Which router package does the target app actually use?
//
// react-router-dom v7 re-exports react-router, but ONLY when both resolve to the same
// installed copy. An app declaring both at diverging versions gets TWO copies and therefore
// TWO React contexts: a <Routes> from one cannot see a <BrowserRouter> from the other, and
// React Router cannot throw its "cannot render a <Router> inside another <Router>" error
// because the contexts are unrelated objects. The failure is SILENT.
//
// So we never impose a router package — we adopt the app's. Pure policy; no I/O.

import type { PackageJsonDeps } from "./deps";

export type RouterPackage = "react-router" | "react-router-dom";

export interface RouterPackageChoice {
  pkg: RouterPackage;
  /** Why — surfaced in the CLI summary so the choice is auditable. */
  reason: string;
}

/** An import of the router from `pkg` in `src`, single or double quoted. */
function importsFrom(src: string, pkg: RouterPackage): boolean {
  return new RegExp(`from\\s+['"]${pkg}['"]`).test(src);
}

/**
 * Precedence, most-authoritative first:
 *  1. An existing router import in App.tsx / main.tsx — that IS the context the app renders
 *     into, and matching it is the entire point.
 *  2. package.json: react-router-dom before react-router (the dom package owns the DOM
 *     router; an app with both renders from the dom one).
 *  3. Neither → react-router (greenfield; we install it).
 */
export function detectRouterPackage(input: {
  pkgJson: PackageJsonDeps;
  entrySource: string;
  appSource?: string;
}): RouterPackageChoice {
  const sources = [input.appSource ?? "", input.entrySource];
  for (const [where, src] of [["App.tsx", sources[0]], ["the entry", sources[1]]] as const) {
    if (importsFrom(src, "react-router-dom")) {
      return { pkg: "react-router-dom", reason: `${where} already imports from react-router-dom` };
    }
    if (importsFrom(src, "react-router")) {
      return { pkg: "react-router", reason: `${where} already imports from react-router` };
    }
  }

  const declared = new Set([
    ...Object.keys(input.pkgJson.dependencies ?? {}),
    ...Object.keys(input.pkgJson.devDependencies ?? {}),
  ]);
  if (declared.has("react-router-dom")) {
    return { pkg: "react-router-dom", reason: "package.json declares react-router-dom" };
  }
  if (declared.has("react-router")) {
    return { pkg: "react-router", reason: "package.json declares react-router" };
  }
  return { pkg: "react-router", reason: "no router dependency found — installing react-router" };
}
