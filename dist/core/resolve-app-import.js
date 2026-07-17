"use strict";
// F5 regression guard: resolveAppPath (commands.ts) used to grab the FIRST relative default
// import in the entry, on the assumption that's always the app component. That assumption
// breaks the moment another relative default import (a store, a theme, a config) precedes the
// App import — the planner then reads the WRONG file, sees no <BrowserRouter> in it, classifies
// the app as routerless, and wraps the entry — while the real App.tsx still owns its own router.
// Silent double-router: exactly the defect this whole fix cycle exists to eliminate.
//
// The fix: don't guess "first import" — resolve the SAME component the entry actually renders.
Object.defineProperty(exports, "__esModule", { value: true });
exports.appImportSpecifier = void 0;
const router_wire_1 = require("./router-wire");
/** JSX tags that can wrap the real app root but are never themselves the app. */
const NON_APP_TAGS = new Set(["StrictMode", "BrowserRouter", "Routes", "Route"]);
/**
 * The relative module specifier the entry imports its ROOT rendered component from, or null.
 *
 * Correctness: we must resolve the SAME component the entry renders — not merely the first
 * relative import. Reading the wrong file makes the router planner misclassify the app's shape
 * and silently double-router it (the F5 failure this whole cycle fixes). So: find the component
 * identifier in the createRoot(...).render(...) call, then return the specifier of the matching
 * `import <Ident> from '<relative>'`. No render call, no capitalized component, or no matching
 * relative default import → null (the caller then bails rather than guessing).
 */
function appImportSpecifier(entrySource) {
    // Same recognizability bar router-wire.ts applies before it will act on an entry: exactly one
    // createRoot( occurrence AND a CREATE_ROOT_RENDER match. Anything looser risks matching the
    // wrong call in a file with more than one createRoot( text occurrence.
    const matches = entrySource.match(/createRoot\s*\(/g) ?? [];
    const m = router_wire_1.CREATE_ROOT_RENDER.exec(entrySource);
    if (matches.length !== 1 || !m)
        return null;
    const rawChild = m[2].trim();
    // Walk capitalized opening tags in the rendered child, in order, skipping wrapper tags
    // (StrictMode) and router primitives (in case a Shape-3 entry is passed in) to find the root
    // app component identifier — e.g. <StrictMode><App /></StrictMode> → "App".
    let ident = null;
    for (const tagMatch of rawChild.matchAll(/<([A-Z]\w*)/g)) {
        if (!NON_APP_TAGS.has(tagMatch[1])) {
            ident = tagMatch[1];
            break;
        }
    }
    if (!ident)
        return null;
    // Exact identifier match (not substring): the \s+ on both sides of <Ident> means "AppFoo" or
    // "MyApp" can never satisfy an "App" search — whitespace must immediately follow the name.
    const importRe = new RegExp(`import\\s+${ident}\\s+from\\s+['"](\\.[^'"]+)['"]`);
    const im = importRe.exec(entrySource);
    return im ? im[1] : null;
}
exports.appImportSpecifier = appImportSpecifier;
//# sourceMappingURL=resolve-app-import.js.map