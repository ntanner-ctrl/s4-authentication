"use strict";
// Target-directory classification (WU3). Decides the install path:
//   empty          → scaffold a fresh create-vite react-ts app, then install
//   pristine-vite  → an UNMODIFIED create-vite default → skip scaffold, install (greenfield)
//   app            → a real app with content → brownfield install
//
// Pure: classifyTarget only reads the directory. The create-vite scaffold subprocess lives in
// the command layer (and is proven by smoke-react.sh, WU6). Also the single home for the small
// dir-inspection helpers (package.json read, Vite/TypeScript detection) the command layer needs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectTypeScript = exports.detectVite = exports.readPackageJson = exports.classifyTarget = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const install_1 = require("./install");
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
function classifyTarget(dir) {
    const packageJson = readPackageJson(dir);
    if (!(0, node_fs_1.existsSync)(dir) || isEffectivelyEmpty(dir)) {
        return { targetClass: "empty", vite: false, typescript: false, packageJson };
    }
    const vite = detectVite(dir, packageJson);
    const typescript = detectTypeScript(dir, packageJson);
    // Pristine only if it's Vite, the adapter isn't already here, and App still matches the template.
    const pristine = vite && !(0, install_1.isAlreadyInstalled)(dir) && looksPristineVite(dir);
    return { targetClass: pristine ? "pristine-vite" : "app", vite, typescript, packageJson };
}
exports.classifyTarget = classifyTarget;
function readPackageJson(dir) {
    const pkgPath = (0, node_path_1.join)(dir, "package.json");
    if (!(0, node_fs_1.existsSync)(pkgPath))
        return {};
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(pkgPath, "utf8"));
    }
    catch {
        return {}; // malformed → treat as no deps known (downstream install surfaces it)
    }
}
exports.readPackageJson = readPackageJson;
function detectVite(dir, pkg) {
    if ("vite" in allDeps(pkg))
        return true;
    return ["vite.config.ts", "vite.config.js", "vite.config.mjs"].some((f) => (0, node_fs_1.existsSync)((0, node_path_1.join)(dir, f)));
}
exports.detectVite = detectVite;
function detectTypeScript(dir, pkg) {
    if ("typescript" in allDeps(pkg))
        return true;
    return (0, node_fs_1.existsSync)((0, node_path_1.join)(dir, "tsconfig.json"));
}
exports.detectTypeScript = detectTypeScript;
function allDeps(pkg) {
    return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
}
function isEffectivelyEmpty(dir) {
    let entries;
    try {
        entries = (0, node_fs_1.readdirSync)(dir);
    }
    catch {
        return true; // unreadable/nonexistent → treat as empty (scaffold surfaces real errors)
    }
    return entries.every((e) => IGNORABLE_ENTRIES.has(e));
}
/**
 * Does this look like an UNMODIFIED create-vite scaffold? The default App carries the very stable
 * "Vite + React" heading across template versions. An edited App is conservatively treated as a
 * real app (brownfield) so WU5 bails-to-checklist rather than generating over real code.
 */
function looksPristineVite(dir) {
    for (const appFile of ["src/App.tsx", "src/App.jsx"]) {
        const abs = (0, node_path_1.join)(dir, appFile);
        if (!(0, node_fs_1.existsSync)(abs))
            continue;
        try {
            const src = (0, node_fs_1.readFileSync)(abs, "utf8");
            return VITE_TEMPLATE_MARKERS.some((marker) => src.includes(marker));
        }
        catch {
            return false;
        }
    }
    return false;
}
//# sourceMappingURL=target.js.map