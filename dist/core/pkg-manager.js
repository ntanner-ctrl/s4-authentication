"use strict";
// Package-manager detection from the target app's lockfile.
//
// Pure policy: given a directory, decide which package manager the app uses and what the
// "add dependencies" invocation looks like. The actual subprocess run lives in the install
// orchestrator (and is exercised end-to-end by smoke-react.sh), not here — keeping this
// unit fast and hermetic.
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectPackageManager = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Classify the package manager by the lockfile present in `dir`. Order is significant:
 * a repo can carry more than one lockfile, and we prefer the more specific managers before
 * falling back to npm (the default when only package-lock.json or no lockfile is present).
 */
/** Lockfile → manager, most-specific first. npm is the fallback (and matches package-lock.json). */
const LOCKFILES = [
    { file: "pnpm-lock.yaml", pm: { name: "pnpm", addCommand: ["pnpm", "add"] } },
    { file: "yarn.lock", pm: { name: "yarn", addCommand: ["yarn", "add"] } },
    { file: "bun.lockb", pm: { name: "bun", addCommand: ["bun", "add"] } },
    { file: "package-lock.json", pm: { name: "npm", addCommand: ["npm", "install"] } },
];
const NPM_DEFAULT = { name: "npm", addCommand: ["npm", "install"] };
/**
 * A single-package pnpm workspace whose root IS the package (`packages: ['.']`) is a real
 * and common layout. In it, `pnpm add X` refuses with ERR_PNPM_ADDING_TO_ROOT and demands
 * an explicit -w. Detected by the workspace manifest, not the lockfile — the lockfile is
 * identical either way.
 */
function detectPackageManager(dir) {
    for (const { file, pm } of LOCKFILES) {
        if (!(0, node_fs_1.existsSync)((0, node_path_1.join)(dir, file)))
            continue;
        if (pm.name === "pnpm" && (0, node_fs_1.existsSync)((0, node_path_1.join)(dir, "pnpm-workspace.yaml"))) {
            return { name: "pnpm", addCommand: ["pnpm", "add", "-w"] };
        }
        return pm;
    }
    return NPM_DEFAULT;
}
exports.detectPackageManager = detectPackageManager;
//# sourceMappingURL=pkg-manager.js.map