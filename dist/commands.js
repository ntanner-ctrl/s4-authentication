"use strict";
// Command dispatch.
//
// ONE auto-detecting command. It classifies the target dir (WU3) and runs the right path:
//   empty          → scaffold a fresh create-vite react-ts app, then install
//   pristine-vite  → install directly (greenfield shape; WU5 will generate the router)
//   app            → install directly (brownfield; WU5 codemods or bails to a checklist)
// The mechanical install core (WU4) is shared by all three (installCore). Router wiring is WU5;
// handoff/verify is WU6.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const p = __importStar(require("@clack/prompts"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const config_1 = require("./core/config");
const deps_1 = require("./core/deps");
const install_1 = require("./core/install");
const router_package_1 = require("./core/router-package");
const router_wire_1 = require("./core/router-wire");
const resolve_app_import_1 = require("./core/resolve-app-import");
const target_1 = require("./core/target");
/** Classify the target, scaffold if empty, then run the shared install core. */
async function run(ctx) {
    p.intro("s4-auth-react");
    const info = (0, target_1.classifyTarget)(ctx.targetDir);
    p.log.info(`target: ${ctx.targetDir} [${describeTarget(info)}]`);
    if (info.targetClass === "empty") {
        if (!scaffoldVite(ctx.targetDir)) {
            p.outro("Nothing was installed.");
            return 1;
        }
        // The scaffold turned the empty dir into a pristine-vite app — re-classify so the install
        // core sees vite=true and the scaffolded package.json.
        return installCore(ctx, (0, target_1.classifyTarget)(ctx.targetDir));
    }
    return installCore(ctx, info);
}
exports.run = run;
/** A short human label for the detected target, e.g. "pristine-vite, ts". */
function describeTarget(info) {
    if (info.targetClass === "empty")
        return "empty";
    const tags = [info.vite ? "vite" : null, info.typescript ? "ts" : null].filter(Boolean);
    return [info.targetClass, ...tags].join(", ");
}
/**
 * Scaffold a fresh Vite React-TS app into `dir` via create-vite (WU3). Subprocess — proven by
 * smoke-react.sh (WU6). Returns false on failure so the caller can stop cleanly.
 */
function scaffoldVite(dir) {
    (0, node_fs_1.mkdirSync)(dir, { recursive: true }); // create-vite "." needs the cwd to exist
    p.log.step("Scaffolding a fresh Vite React-TS app (npm create vite)…");
    // shell:true on Windows — npm is a .cmd shim there; spawnSync without a shell throws ENOENT.
    const r = (0, node_child_process_1.spawnSync)("npm", ["create", "vite@latest", ".", "--", "--template", "react-ts"], {
        cwd: dir,
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    if (r.error || r.status !== 0) {
        p.log.error("Scaffold failed — ensure Node/npm are available and the directory is writable.");
        return false;
    }
    return true;
}
/**
 * Shared mechanical install core (WU4): idempotency guard → resolve config from flags, prompt
 * for what's missing → copy templates + write .env.local + patch auth.config.ts → install deps.
 * Router wiring (WU5) and the handoff checklist (WU6) are surfaced as the "what's left" summary.
 */
async function installCore(ctx, info) {
    const yes = ctx.args.flags["yes"] === "true";
    const force = ctx.args.flags["force"] === "true";
    // 0. Idempotency guard — bail BEFORE prompting if the adapter is already here (unless --force),
    //    so a re-run never silently clobbers a dev's edits to the copied files.
    if ((0, install_1.isAlreadyInstalled)(ctx.targetDir) && !force) {
        p.log.warn("Adapter already installed here (src/auth.config.ts exists).");
        p.outro("Re-run with --force to overwrite, or remove src/auth.config.ts first.");
        return 1;
    }
    const resolved = (0, config_1.resolveFromFlags)(ctx.args.flags);
    // 1. Required Cognito values — flags first, prompt for the rest (error under --yes).
    const cognito = { ...resolved.cognito };
    if (resolved.missingCognito.length > 0) {
        if (yes) {
            const flags = resolved.missingCognito.map((f) => `--${f}`).join(", ");
            p.log.error(`Missing required values: ${flags}`);
            p.outro("Re-run with those flags, or drop --yes to be prompted.");
            return 1;
        }
        for (const flag of resolved.missingCognito) {
            const field = config_1.COGNITO_FIELDS.find((f) => f.flag === flag);
            if (!field)
                continue;
            const answer = await p.text({ message: field.label });
            if (p.isCancel(answer)) {
                p.cancel("Cancelled — no files changed.");
                return 1;
            }
            cognito[field.key] = String(answer).trim();
        }
    }
    // 2. Optional per-app patch — flags first, then prompt the light ones (skipped under --yes,
    //    which keeps the template defaults: providers ['google'], appTitle 'Sign in', /home).
    const patch = { ...resolved.patch };
    if (!yes) {
        if (patch.providers === undefined) {
            const answer = await p.text({ message: "Enabled IdPs (comma-separated)", placeholder: "google", defaultValue: "google" });
            if (p.isCancel(answer)) {
                p.cancel("Cancelled — no files changed.");
                return 1;
            }
            const list = String(answer).split(",").map((s) => s.trim()).filter(Boolean);
            if (list.length > 0)
                patch.providers = list;
        }
        if (patch.postLoginRoute === undefined) {
            const answer = await p.text({ message: "Post-login route", placeholder: "/home", defaultValue: "/home" });
            if (p.isCancel(answer)) {
                p.cancel("Cancelled — no files changed.");
                return 1;
            }
            const route = String(answer).trim();
            if (route)
                patch.postLoginRoute = route;
        }
    }
    // Detect the app's router package BEFORE copying, so the copied adapter's imports and the
    // dep list both target the package the app actually renders with (F4).
    const entryPathForDetect = resolveEntryPath(ctx.targetDir);
    const entrySrcForDetect = entryPathForDetect ? safeRead(entryPathForDetect) : "";
    const appPathForDetect = entryPathForDetect
        ? resolveAppPath(ctx.targetDir, entryPathForDetect, entrySrcForDetect)
        : null;
    const router = (0, router_package_1.detectRouterPackage)({
        pkgJson: info.packageJson,
        entrySource: entrySrcForDetect,
        appSource: appPathForDetect ? safeRead(appPathForDetect) : undefined,
    });
    p.log.info(`Router package: ${router.pkg} (${router.reason}).`);
    // 3. Apply the mechanical core. Fail-graceful (spec cross-cutting): a filesystem error
    //    (read-only dir, perms) must surface a clear checklist, not a bare stack-trace.
    let out;
    try {
        out = (0, install_1.applyCore)({
            targetDir: ctx.targetDir,
            templatesDir: templatesDir(),
            cognito: cognito,
            patch,
            vite: info.vite,
            packageJson: info.packageJson,
            force,
            routerPackage: router.pkg,
        });
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        p.log.error(`Could not write into ${ctx.targetDir}: ${reason}`);
        p.outro("No changes completed. Check directory permissions and re-run, or install by hand per the README.");
        return 1;
    }
    p.log.success(`Copied ${out.copied.length} adapter items into src/ and wrote .env.local.`);
    if (out.envBackedUp)
        p.log.info("Existing .env.local merged (backup: .env.local.bak).");
    for (const key of out.envConflicts) {
        p.log.warn(`.env.local already sets ${key} to a different value — left as-is. Re-run with --force to overwrite.`);
    }
    // 4. Install the missing deps via the detected package manager.
    let depsFailed = false;
    let depsCmdLine = "";
    if (out.depsToInstall.length > 0) {
        const [cmd, ...base] = out.pkgManager.addCommand;
        const argv = [...base, ...out.depsToInstall];
        depsCmdLine = `${cmd} ${argv.join(" ")}`;
        p.log.step(`Installing deps (${out.pkgManager.name}): ${out.depsToInstall.join(" ")}`);
        // shell:true on Windows — npm/pnpm/yarn/bun are .cmd/.ps1 shims there, and spawnSync
        // without a shell throws ENOENT on them.
        const r = (0, node_child_process_1.spawnSync)(cmd, argv, {
            cwd: ctx.targetDir,
            stdio: "inherit",
            shell: process.platform === "win32",
        });
        if ((0, deps_1.depInstallFailed)(r)) {
            depsFailed = true;
            p.log.error(`Dependency install failed — run it manually: ${depsCmdLine}`);
        }
    }
    else {
        p.log.info("All adapter deps already present — skipping install.");
    }
    // 5. Wire the auth router into the app entry (WU5). Conservative: mutates only a recognized
    //    routerless main.tsx, else leaves it and prints the checklist (never corrupts the entry).
    wireRouter(ctx.targetDir, info, router.pkg);
    // 6. Honest summary. The codemod does ONLY the entry wrap; for a brownfield app the login
    //    replace/bridge + idle-logout arming + logout audit are irreducible manual steps in the
    //    app's OWN code (verified in the vusion install) — never report them as done.
    const stillYours = info.targetClass === "app"
        ? [
            "REQUIRED next (the codemod can't — these live in your app code):",
            '  1. Replace or bridge your existing login (README "Brownfield: additional required steps").',
            "  2. Arm idle-logout in your app shell:",
            "       const { logout } = useAuthService(); useIdleTimeout(logout);",
            "  3. Audit your logout for app-state teardown.",
        ]
        : ["Boots to /login. Swap the demo src/App.tsx for your app when ready."];
    const incomplete = depsFailed
        ? [
            "INSTALL INCOMPLETE — dependencies did not install.",
            `  The adapter source is in place but the app will NOT build until you run:`,
            `    ${depsCmdLine}`,
        ]
        : [];
    p.note([
        ...incomplete,
        "Automated: adapter source → src/, .env.local, auth.config.ts defaults, deps, router.",
        ...stillYours,
    ].join("\n"), depsFailed ? "Done (with errors)" : "Done");
    p.outro("s4-auth-react");
    return depsFailed ? 1 : 0;
}
/** Hand-wiring fallback shown when the router can't be auto-wired — paste this by hand. */
function routerChecklist() {
    return [
        `Wire the router by hand (README "${router_wire_1.HANDWIRE_SECTION}"): above your router, render`,
        "  <AuthRoot><BrowserRouter><Routes>",
        '    <Route path="/login" element={<LoginPage />} />',
        '    <Route path="/auth/callback" element={<CallbackPage />} />',
        "    …gate your existing routes with <RequireAuth>…",
        "  </Routes></BrowserRouter></AuthRoot>",
    ].join("\n");
}
/**
 * Locate the app entry and wire the auth router into it (WU5). Fail-graceful at every step:
 * a missing/unreadable/unwritable entry, or any shape we don't recognize, prints the checklist
 * and mutates nothing — the entry is an auth boundary, so "when in doubt, don't touch it".
 */
function wireRouter(targetDir, info, routerPackage) {
    const entry = resolveEntryPath(targetDir);
    if (!entry) {
        p.log.warn("Could not locate the app entry (src/main.tsx) — router not wired.");
        p.log.info(routerChecklist());
        return;
    }
    let entrySource;
    try {
        entrySource = (0, node_fs_1.readFileSync)(entry, "utf8");
    }
    catch (err) {
        p.log.warn(`Could not read ${(0, node_path_1.relative)(targetDir, entry)} (${errMsg(err)}) — router not wired.`);
        p.log.info(routerChecklist());
        return;
    }
    const appPath = resolveAppPath(targetDir, entry, entrySource);
    let appSource;
    if (appPath) {
        try {
            appSource = (0, node_fs_1.readFileSync)(appPath, "utf8");
        }
        catch {
            appSource = undefined; // unreadable == unseen; the planner bails rather than guessing
        }
    }
    const plan = (0, router_wire_1.planRouterWiring)({ entrySource, appSource, routerPackage });
    if (plan.action === "noop-already-wired") {
        p.log.info("Router already wired — left the entry untouched.");
        return;
    }
    if (plan.action === "bail") {
        p.log.warn(`Router not auto-wired: ${plan.reason}`);
        p.log.info(routerChecklist());
        return;
    }
    try {
        if (plan.action === "wrap-and-unwrap" && appPath && plan.appContent !== undefined) {
            (0, node_fs_1.writeFileSync)(`${appPath}.bak`, appSource);
            (0, node_fs_1.writeFileSync)(appPath, plan.appContent);
            p.log.success(`Removed the <BrowserRouter> from ${(0, node_path_1.relative)(targetDir, appPath)} so the entry owns the single router ` +
                `(backup: ${(0, node_path_1.relative)(targetDir, appPath)}.bak).`);
        }
        (0, node_fs_1.writeFileSync)(entry, plan.entryContent);
    }
    catch (err) {
        p.log.warn(`Could not write the router wiring (${errMsg(err)}) — entry left unchanged.`);
        p.log.info(routerChecklist());
        return;
    }
    p.log.success(`Wired the auth router into ${(0, node_path_1.relative)(targetDir, entry)} (shape: ${plan.shape}).`);
    for (const note of plan.notes ?? [])
        p.log.warn(note);
}
/**
 * Resolve the app entry file. Prefer the real entry declared in index.html's module <script src>
 * (an app may not use src/main.tsx); fall back to the create-vite defaults. null = not found → bail.
 */
function resolveEntryPath(targetDir) {
    const indexHtml = (0, node_path_1.join)(targetDir, "index.html");
    if ((0, node_fs_1.existsSync)(indexHtml)) {
        try {
            const m = (0, node_fs_1.readFileSync)(indexHtml, "utf8").match(/<script[^>]*\bsrc=["']([^"']+\.[jt]sx?)["']/i);
            if (m) {
                const abs = (0, node_path_1.join)(targetDir, m[1].replace(/^\//, "")); // "/src/main.tsx" → "src/main.tsx"
                if ((0, node_fs_1.existsSync)(abs))
                    return abs;
            }
        }
        catch {
            /* fall through to defaults */
        }
    }
    for (const cand of ["src/main.tsx", "src/main.jsx"]) {
        const abs = (0, node_path_1.join)(targetDir, cand);
        if ((0, node_fs_1.existsSync)(abs))
            return abs;
    }
    return null;
}
/**
 * Follow the entry's default App import to a file. F5: the router may live in App.tsx, so the
 * planner must SEE it — but "could not resolve" must stay distinguishable from "has no router",
 * so this returns null rather than a guess. Resolution is tied to the component the entry
 * actually RENDERS (appImportSpecifier), not merely the first relative import in the file —
 * see resolve-app-import.ts for why that distinction is load-bearing.
 */
function resolveAppPath(targetDir, entryPath, entrySource) {
    const spec = (0, resolve_app_import_1.appImportSpecifier)(entrySource);
    if (!spec)
        return null;
    const base = (0, node_path_1.join)((0, node_path_1.dirname)(entryPath), spec.replace(/\.[jt]sx?$/, ""));
    for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
        if ((0, node_fs_1.existsSync)(base + ext))
            return base + ext;
    }
    return null;
}
/** Read a file, or "" if unreadable — detection must never throw. */
function safeRead(path) {
    try {
        return (0, node_fs_1.readFileSync)(path, "utf8");
    }
    catch {
        return "";
    }
}
function errMsg(err) {
    return err instanceof Error ? err.message : String(err);
}
/** The bundled templates/ dir, sibling of dist/ in the published package. */
function templatesDir() {
    return (0, node_path_1.join)(__dirname, "..", "templates");
}
//# sourceMappingURL=commands.js.map