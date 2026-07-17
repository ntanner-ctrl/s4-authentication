// Point the COPIED adapter's router imports at the package the app actually uses.
//
// The adapter source imports from 'react-router' (reference/react-oidc/auth/RequireAuth.tsx:18,
// auth/RequireRole.tsx:13, login/LoginPage.tsx:17, login/CallbackPage.tsx:15). On an app whose
// router is react-router-dom at a different resolved version, those are DIFFERENT module
// instances with different React contexts — RequireAuth's useLocation would never see the
// app's router. Rewrite the copied files (never the template source).
//
// Pure: caller reads/writes. Mirrors patch-config.ts.

import type { RouterPackage } from "./router-package";

/** Copied adapter files that import router primitives — paths relative to the target dir. */
export const ROUTER_IMPORT_FILES: string[] = [
  "src/auth/RequireAuth.tsx",
  "src/auth/RequireRole.tsx",
  "src/login/LoginPage.tsx",
  "src/login/CallbackPage.tsx",
];

/** Rewrite `from 'react-router'` → `from '<routerPkg>'`. No-op when routerPkg is react-router. */
export function rewriteRouterImports(src: string, routerPkg: RouterPackage): string {
  if (routerPkg === "react-router") return src;
  return src.replace(/(from\s+)(['"])react-router\2/g, `$1$2${routerPkg}$2`);
}
