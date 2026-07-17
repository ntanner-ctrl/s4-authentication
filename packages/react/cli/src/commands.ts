// Command dispatch.
//
// ONE auto-detecting command. It classifies the target dir (WU3) and runs the right path:
//   empty          → scaffold a fresh create-vite react-ts app, then install
//   pristine-vite  → install directly (greenfield shape; WU5 will generate the router)
//   app            → install directly (brownfield; WU5 codemods or bails to a checklist)
// The mechanical install core (WU4) is shared by all three (installCore). Router wiring is WU5;
// handoff/verify is WU6.

import * as p from "@clack/prompts";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ParsedArgs } from "./args";
import { resolveFromFlags, COGNITO_FIELDS } from "./core/config";
import { depInstallFailed } from "./core/deps";
import { applyCore, isAlreadyInstalled, type CoreOutput } from "./core/install";
import { detectRouterPackage, type RouterPackage } from "./core/router-package";
import { HANDWIRE_SECTION, planRouterWiring } from "./core/router-wire";
import { appImportSpecifier } from "./core/resolve-app-import";
import { classifyTarget, type TargetInfo } from "./core/target";
import type { CognitoConfig } from "./core/env-local";
import type { AuthConfigPatch } from "./core/patch-config";

export interface CommandContext {
  /** Resolved absolute target directory. */
  targetDir: string;
  /** Parsed CLI flags (Cognito config, providers, etc.). */
  args: ParsedArgs;
}

/** Classify the target, scaffold if empty, then run the shared install core. */
export async function run(ctx: CommandContext): Promise<number> {
  p.intro("s4-auth-react");

  const info = classifyTarget(ctx.targetDir);
  p.log.info(`target: ${ctx.targetDir} [${describeTarget(info)}]`);

  if (info.targetClass === "empty") {
    if (!scaffoldVite(ctx.targetDir)) {
      p.outro("Nothing was installed.");
      return 1;
    }
    // The scaffold turned the empty dir into a pristine-vite app — re-classify so the install
    // core sees vite=true and the scaffolded package.json.
    return installCore(ctx, classifyTarget(ctx.targetDir));
  }

  return installCore(ctx, info);
}

/** A short human label for the detected target, e.g. "pristine-vite, ts". */
function describeTarget(info: TargetInfo): string {
  if (info.targetClass === "empty") return "empty";
  const tags = [info.vite ? "vite" : null, info.typescript ? "ts" : null].filter(Boolean);
  return [info.targetClass, ...tags].join(", ");
}

/**
 * Scaffold a fresh Vite React-TS app into `dir` via create-vite (WU3). Subprocess — proven by
 * smoke-react.sh (WU6). Returns false on failure so the caller can stop cleanly.
 */
function scaffoldVite(dir: string): boolean {
  mkdirSync(dir, { recursive: true }); // create-vite "." needs the cwd to exist
  p.log.step("Scaffolding a fresh Vite React-TS app (npm create vite)…");
  // shell:true on Windows — npm is a .cmd shim there; spawnSync without a shell throws ENOENT.
  const r = spawnSync("npm", ["create", "vite@latest", ".", "--", "--template", "react-ts"], {
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
async function installCore(ctx: CommandContext, info: TargetInfo): Promise<number> {
  const yes = ctx.args.flags["yes"] === "true";
  const force = ctx.args.flags["force"] === "true";

  // 0. Idempotency guard — bail BEFORE prompting if the adapter is already here (unless --force),
  //    so a re-run never silently clobbers a dev's edits to the copied files.
  if (isAlreadyInstalled(ctx.targetDir) && !force) {
    p.log.warn("Adapter already installed here (src/auth.config.ts exists).");
    p.outro("Re-run with --force to overwrite, or remove src/auth.config.ts first.");
    return 1;
  }

  const resolved = resolveFromFlags(ctx.args.flags);

  // 1. Required Cognito values — flags first, prompt for the rest (error under --yes).
  const cognito: Partial<CognitoConfig> = { ...resolved.cognito };
  if (resolved.missingCognito.length > 0) {
    if (yes) {
      const flags = resolved.missingCognito.map((f) => `--${f}`).join(", ");
      p.log.error(`Missing required values: ${flags}`);
      p.outro("Re-run with those flags, or drop --yes to be prompted.");
      return 1;
    }
    for (const flag of resolved.missingCognito) {
      const field = COGNITO_FIELDS.find((f) => f.flag === flag);
      if (!field) continue;
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
  const patch: AuthConfigPatch = { ...resolved.patch };
  if (!yes) {
    if (patch.providers === undefined) {
      const answer = await p.text({ message: "Enabled IdPs (comma-separated)", placeholder: "google", defaultValue: "google" });
      if (p.isCancel(answer)) {
        p.cancel("Cancelled — no files changed.");
        return 1;
      }
      const list = String(answer).split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length > 0) patch.providers = list;
    }
    if (patch.postLoginRoute === undefined) {
      const answer = await p.text({ message: "Post-login route", placeholder: "/home", defaultValue: "/home" });
      if (p.isCancel(answer)) {
        p.cancel("Cancelled — no files changed.");
        return 1;
      }
      const route = String(answer).trim();
      if (route) patch.postLoginRoute = route;
    }
  }

  // Detect the app's router package BEFORE copying, so the copied adapter's imports and the
  // dep list both target the package the app actually renders with (F4).
  const entryPathForDetect = resolveEntryPath(ctx.targetDir);
  const entrySrcForDetect = entryPathForDetect ? safeRead(entryPathForDetect) : "";
  const appPathForDetect = entryPathForDetect
    ? resolveAppPath(ctx.targetDir, entryPathForDetect, entrySrcForDetect)
    : null;
  const router = detectRouterPackage({
    pkgJson: info.packageJson,
    entrySource: entrySrcForDetect,
    appSource: appPathForDetect ? safeRead(appPathForDetect) : undefined,
  });
  p.log.info(`Router package: ${router.pkg} (${router.reason}).`);

  // 3. Apply the mechanical core. Fail-graceful (spec cross-cutting): a filesystem error
  //    (read-only dir, perms) must surface a clear checklist, not a bare stack-trace.
  let out: CoreOutput;
  try {
    out = applyCore({
      targetDir: ctx.targetDir,
      templatesDir: templatesDir(),
      cognito: cognito as CognitoConfig,
      patch,
      vite: info.vite,
      packageJson: info.packageJson,
      force,
      routerPackage: router.pkg,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    p.log.error(`Could not write into ${ctx.targetDir}: ${reason}`);
    p.outro("No changes completed. Check directory permissions and re-run, or install by hand per the README.");
    return 1;
  }
  p.log.success(`Copied ${out.copied.length} adapter items into src/ and wrote .env.local.`);
  if (out.envBackedUp) p.log.info("Existing .env.local merged (backup: .env.local.bak).");
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
    const r = spawnSync(cmd, argv, {
      cwd: ctx.targetDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (depInstallFailed(r)) {
      depsFailed = true;
      p.log.error(`Dependency install failed — run it manually: ${depsCmdLine}`);
    }
  } else {
    p.log.info("All adapter deps already present — skipping install.");
  }

  // 5. Wire the auth router into the app entry (WU5). Conservative: mutates only a recognized
  //    routerless main.tsx, else leaves it and prints the checklist (never corrupts the entry).
  wireRouter(ctx.targetDir, info, router.pkg);

  // 6. Honest summary. The codemod does ONLY the entry wrap; for a brownfield app the login
  //    replace/bridge + idle-logout arming + logout audit are irreducible manual steps in the
  //    app's OWN code (verified in the vusion install) — never report them as done.
  const stillYours =
    info.targetClass === "app"
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
  p.note(
    [
      ...incomplete,
      "Automated: adapter source → src/, .env.local, auth.config.ts defaults, deps, router.",
      ...stillYours,
    ].join("\n"),
    depsFailed ? "Done (with errors)" : "Done"
  );
  p.outro("s4-auth-react");
  return depsFailed ? 1 : 0;
}

/** Hand-wiring fallback shown when the router can't be auto-wired — paste this by hand. */
function routerChecklist(): string {
  return [
    `Wire the router by hand (README "${HANDWIRE_SECTION}"): above your router, render`,
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
function wireRouter(targetDir: string, info: TargetInfo, routerPackage: RouterPackage): void {
  const entry = resolveEntryPath(targetDir);
  if (!entry) {
    p.log.warn("Could not locate the app entry (src/main.tsx) — router not wired.");
    p.log.info(routerChecklist());
    return;
  }

  let entrySource: string;
  try {
    entrySource = readFileSync(entry, "utf8");
  } catch (err) {
    p.log.warn(`Could not read ${relative(targetDir, entry)} (${errMsg(err)}) — router not wired.`);
    p.log.info(routerChecklist());
    return;
  }

  const appPath = resolveAppPath(targetDir, entry, entrySource);
  let appSource: string | undefined;
  if (appPath) {
    try {
      appSource = readFileSync(appPath, "utf8");
    } catch {
      appSource = undefined; // unreadable == unseen; the planner bails rather than guessing
    }
  }

  const plan = planRouterWiring({ entrySource, appSource, routerPackage });

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
      writeFileSync(`${appPath}.bak`, appSource!);
      writeFileSync(appPath, plan.appContent);
      p.log.success(
        `Removed the <BrowserRouter> from ${relative(targetDir, appPath)} so the entry owns the single router ` +
          `(backup: ${relative(targetDir, appPath)}.bak).`
      );
    }
    writeFileSync(entry, plan.entryContent!);
  } catch (err) {
    p.log.warn(`Could not write the router wiring (${errMsg(err)}) — entry left unchanged.`);
    p.log.info(routerChecklist());
    return;
  }

  p.log.success(`Wired the auth router into ${relative(targetDir, entry)} (shape: ${plan.shape}).`);
  for (const note of plan.notes ?? []) p.log.warn(note);
}

/**
 * Resolve the app entry file. Prefer the real entry declared in index.html's module <script src>
 * (an app may not use src/main.tsx); fall back to the create-vite defaults. null = not found → bail.
 */
function resolveEntryPath(targetDir: string): string | null {
  const indexHtml = join(targetDir, "index.html");
  if (existsSync(indexHtml)) {
    try {
      const m = readFileSync(indexHtml, "utf8").match(/<script[^>]*\bsrc=["']([^"']+\.[jt]sx?)["']/i);
      if (m) {
        const abs = join(targetDir, m[1].replace(/^\//, "")); // "/src/main.tsx" → "src/main.tsx"
        if (existsSync(abs)) return abs;
      }
    } catch {
      /* fall through to defaults */
    }
  }
  for (const cand of ["src/main.tsx", "src/main.jsx"]) {
    const abs = join(targetDir, cand);
    if (existsSync(abs)) return abs;
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
function resolveAppPath(targetDir: string, entryPath: string, entrySource: string): string | null {
  const spec = appImportSpecifier(entrySource);
  if (!spec) return null;
  const base = join(dirname(entryPath), spec.replace(/\.[jt]sx?$/, ""));
  for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

/** Read a file, or "" if unreadable — detection must never throw. */
function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The bundled templates/ dir, sibling of dist/ in the published package. */
function templatesDir(): string {
  return join(__dirname, "..", "templates");
}
