import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCore, isAlreadyInstalled, type CoreInput } from "./install";

let root: string;
let templates: string;
let target: string;

const COGNITO = {
  userPoolId: "us-east-1_AbC123",
  clientId: "client-xyz",
  cognitoDomain: "app.auth.us-east-1.amazoncognito.com",
  region: "us-east-1",
};

// The patch surface, mirroring the real auth.config.ts default lines.
const AUTH_CONFIG_SRC = [
  "export const authConfig: AuthConfig = {",
  "  providers: ['google'], // C8 — set to ['google','microsoft'] etc.",
  "  appTitle: 'Sign in',",
  "  postLoginRoute: '/home', // C6 — single configurable landing",
  "};",
  "",
].join("\n");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "s4install-"));
  templates = join(root, "templates");
  target = join(root, "app");
  mkdirSync(templates, { recursive: true });
  mkdirSync(target, { recursive: true });

  writeFileSync(join(templates, "auth.config.ts"), AUTH_CONFIG_SRC);
  writeFileSync(join(templates, "auth.css"), "/* css */\n");
  writeFileSync(join(templates, "vite-env.d.ts"), "// vite env\n");
  mkdirSync(join(templates, "auth"));
  writeFileSync(join(templates, "auth", "RequireAuth.tsx"), "// guard\n");
  mkdirSync(join(templates, "login"));
  writeFileSync(join(templates, "login", "LoginPage.tsx"), "// login\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function input(overrides: Partial<CoreInput> = {}): CoreInput {
  return {
    targetDir: target,
    templatesDir: templates,
    cognito: COGNITO,
    patch: { providers: ["google", "microsoft"], appTitle: "Acme", postLoginRoute: "/dash" },
    vite: true,
    packageJson: {},
    force: false,
    routerPackage: "react-router",
    ...overrides,
  };
}

test("copies templates under src/", () => {
  applyCore(input());
  expect(existsSync(join(target, "src", "auth.config.ts"))).toBe(true);
  expect(existsSync(join(target, "src", "auth", "RequireAuth.tsx"))).toBe(true);
});

test("writes .env.local with the four VITE_* values", () => {
  const out = applyCore(input());
  const env = readFileSync(out.envPath, "utf8");
  expect(env).toContain("VITE_USER_POOL_ID=us-east-1_AbC123");
  expect(env).toContain("VITE_USER_POOL_CLIENT_ID=client-xyz");
  expect(env).toContain("VITE_COGNITO_HOSTED_DOMAIN=app.auth.us-east-1.amazoncognito.com");
  expect(env).toContain("VITE_AWS_REGION=us-east-1");
});

test("patches the COPIED auth.config.ts (not the template source)", () => {
  applyCore(input());
  const patched = readFileSync(join(target, "src", "auth.config.ts"), "utf8");
  expect(patched).toContain("providers: ['google', 'microsoft']");
  expect(patched).toContain("appTitle: 'Acme'");
  expect(patched).toContain("postLoginRoute: '/dash'");
  // template source is untouched
  expect(readFileSync(join(templates, "auth.config.ts"), "utf8")).toContain("providers: ['google']");
});

test("reports all three deps to install for an app with none present", () => {
  const out = applyCore(input({ packageJson: {} }));
  expect(out.depsToInstall).toEqual(["react-oidc-context", "oidc-client-ts", "react-router@^7"]);
});

test("reports no deps to install when all present (idempotent)", () => {
  const pkg = {
    dependencies: { "react-oidc-context": "^3", "oidc-client-ts": "^3", "react-router": "^7" },
  };
  expect(applyCore(input({ packageJson: pkg })).depsToInstall).toEqual([]);
});

test("detects the package manager from the target lockfile", () => {
  writeFileSync(join(target, "pnpm-lock.yaml"), "");
  expect(applyCore(input()).pkgManager.name).toBe("pnpm");
});

test("non-Vite target skips vite-env.d.ts", () => {
  applyCore(input({ vite: false }));
  expect(existsSync(join(target, "src", "vite-env.d.ts"))).toBe(false);
});

test("isAlreadyInstalled is false on a fresh target", () => {
  expect(isAlreadyInstalled(target)).toBe(false);
});

test("isAlreadyInstalled is true after a run lands src/auth.config.ts", () => {
  applyCore(input());
  expect(isAlreadyInstalled(target)).toBe(true);
});
