"use strict";
// Orchestrate the mechanical core against a fully-resolved config: copy templates, write
// .env.local, patch the copied auth.config.ts, and DECIDE which deps to install.
//
// Deliberately does NOT run the package manager — returning `depsToInstall` + `pkgManager`
// lets the command layer run the subprocess (and lets this function stay hermetic / unit-
// testable). The real install + `tsc --noEmit` are proven by smoke-react.sh (WU6).
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCore = exports.isAlreadyInstalled = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const copy_templates_1 = require("./copy-templates");
const env_local_1 = require("./env-local");
const patch_config_1 = require("./patch-config");
const pkg_manager_1 = require("./pkg-manager");
const deps_1 = require("./deps");
const rewrite_router_imports_1 = require("./rewrite-router-imports");
/**
 * Has the adapter already been installed here? The copied src/auth.config.ts is the sentinel.
 * The command layer uses this to warn + bail (require --force) before prompting or overwriting,
 * satisfying the cross-cutting idempotency requirement (re-run = no silent clobber).
 */
function isAlreadyInstalled(targetDir) {
    return (0, node_fs_1.existsSync)((0, node_path_1.join)(targetDir, "src", "auth.config.ts"));
}
exports.isAlreadyInstalled = isAlreadyInstalled;
function applyCore(input) {
    // 1. Copy the bundled adapter source into <target>/src/.
    const copied = (0, copy_templates_1.copyTemplates)(input.templatesDir, input.targetDir, { vite: input.vite });
    // 2. Merge the four deploy values into .env.local — NEVER clobber (F3). The file is
    //    git-ignored, so an overwrite is unrecoverable.
    const envPath = (0, node_path_1.join)(input.targetDir, ".env.local");
    const existingEnv = (0, node_fs_1.existsSync)(envPath) ? (0, node_fs_1.readFileSync)(envPath, "utf8") : null;
    const env = (0, env_local_1.mergeEnvLocal)(existingEnv, input.cognito, { force: input.force });
    if (env.merged && existingEnv !== null)
        (0, node_fs_1.writeFileSync)(`${envPath}.bak`, existingEnv);
    (0, node_fs_1.writeFileSync)(envPath, env.content);
    // 3. Patch per-app defaults in the COPIED auth.config.ts (the template source stays pristine).
    const cfgPath = (0, node_path_1.join)(input.targetDir, "src", "auth.config.ts");
    (0, node_fs_1.writeFileSync)(cfgPath, (0, patch_config_1.patchAuthConfig)((0, node_fs_1.readFileSync)(cfgPath, "utf8"), input.patch));
    // 3b. Point the COPIED adapter's router imports at the app's router package (F4). Two
    //     router packages at diverging versions are two React contexts — RequireAuth would
    //     never see the app's router.
    if (input.routerPackage !== "react-router") {
        for (const rel of rewrite_router_imports_1.ROUTER_IMPORT_FILES) {
            const abs = (0, node_path_1.join)(input.targetDir, rel);
            if (!(0, node_fs_1.existsSync)(abs))
                continue;
            (0, node_fs_1.writeFileSync)(abs, (0, rewrite_router_imports_1.rewriteRouterImports)((0, node_fs_1.readFileSync)(abs, "utf8"), input.routerPackage));
        }
    }
    // 4. Decide which deps still need installing; the command layer runs the subprocess.
    const depsToInstall = (0, deps_1.installSpecs)((0, deps_1.missingDeps)(input.packageJson, input.routerPackage));
    const pkgManager = (0, pkg_manager_1.detectPackageManager)(input.targetDir);
    return { copied, envPath, depsToInstall, pkgManager, envConflicts: env.conflicts, envBackedUp: env.merged };
}
exports.applyCore = applyCore;
//# sourceMappingURL=install.js.map