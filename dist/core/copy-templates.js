"use strict";
// Copy the bundled adapter templates into the target app's src/, mirroring curated-manifest.txt.
//
// The bundled templates/ dir (built by scripts/bundle.sh from reference/react-oidc/) holds the
// five adapter items at its root. This maps them under <target>/src/. vite-env.d.ts is skipped
// for non-Vite targets (a Vite app gets ImportMetaEnv from vite/client; a non-Vite app would
// get a duplicate/irrelevant ambient decl).
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyTemplates = exports.TEMPLATE_ITEMS = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** The five adapter items, mirroring packages/react/scripts/curated-manifest.txt. */
exports.TEMPLATE_ITEMS = [
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
function copyTemplates(templatesDir, targetDir, opts) {
    const written = [];
    for (const item of exports.TEMPLATE_ITEMS) {
        if (item.viteOnly && !opts.vite)
            continue;
        const to = item.fallbackTo && (0, node_fs_1.existsSync)((0, node_path_1.join)(targetDir, item.to)) ? item.fallbackTo : item.to;
        const src = (0, node_path_1.join)(templatesDir, item.from);
        const dst = (0, node_path_1.join)(targetDir, to);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(dst), { recursive: true });
        (0, node_fs_1.cpSync)(src, dst, { recursive: true }); // recursive handles both files and dirs (auth/, login/)
        written.push(to);
    }
    return written;
}
exports.copyTemplates = copyTemplates;
//# sourceMappingURL=copy-templates.js.map