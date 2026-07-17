import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyTemplates } from "./copy-templates";

let root: string;
let templates: string;
let target: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "s4copy-"));
  templates = join(root, "templates");
  target = join(root, "app");
  mkdirSync(templates, { recursive: true });
  mkdirSync(target, { recursive: true });

  // Minimal stand-in for the bundled templates/ tree (the 5 adapter items).
  writeFileSync(join(templates, "auth.config.ts"), "// auth.config\n");
  writeFileSync(join(templates, "auth.css"), "/* css */\n");
  writeFileSync(
    join(templates, "vite-env.d.ts"),
    'interface ImportMetaEnv { readonly VITE_USER_POOL_ID?: string }\n',
  );
  mkdirSync(join(templates, "auth"));
  writeFileSync(join(templates, "auth", "RequireAuth.tsx"), "// guard\n");
  mkdirSync(join(templates, "login"));
  writeFileSync(join(templates, "login", "LoginPage.tsx"), "// login\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("lands all five items under src/ for a Vite target", () => {
  copyTemplates(templates, target, { vite: true });
  expect(existsSync(join(target, "src", "auth.config.ts"))).toBe(true);
  expect(existsSync(join(target, "src", "auth.css"))).toBe(true);
  expect(existsSync(join(target, "src", "vite-env.d.ts"))).toBe(true);
  expect(existsSync(join(target, "src", "auth", "RequireAuth.tsx"))).toBe(true);
  expect(existsSync(join(target, "src", "login", "LoginPage.tsx"))).toBe(true);
});

test("skips vite-env.d.ts for a non-Vite target", () => {
  copyTemplates(templates, target, { vite: false });
  expect(existsSync(join(target, "src", "vite-env.d.ts"))).toBe(false);
  // ...but still copies the rest.
  expect(existsSync(join(target, "src", "auth.config.ts"))).toBe(true);
  expect(existsSync(join(target, "src", "auth", "RequireAuth.tsx"))).toBe(true);
});

test("returns the destination paths actually written", () => {
  const written = copyTemplates(templates, target, { vite: false });
  expect(written).not.toContain("src/vite-env.d.ts");
  expect(written).toContain("src/auth.config.ts");
});

test("copies file contents verbatim", () => {
  copyTemplates(templates, target, { vite: true });
  expect(readFileSync(join(target, "src", "auth.config.ts"), "utf8")).toBe("// auth.config\n");
});

test("an existing vite-env.d.ts is never overwritten — adapter types go to s4-auth-env.d.ts", () => {
  const appOwn = '/// <reference types="vite/client" />\ninterface ImportMetaEnv { readonly VITE_APP_TITLE?: string }\n';
  mkdirSync(join(target, "src"), { recursive: true });
  writeFileSync(join(target, "src", "vite-env.d.ts"), appOwn);

  const written = copyTemplates(templates, target, { vite: true });

  // The app's file survives byte-identical — vite/client reference intact.
  expect(readFileSync(join(target, "src", "vite-env.d.ts"), "utf8")).toBe(appOwn);
  // The adapter's declarations land beside it, so interface merging has both halves.
  expect(existsSync(join(target, "src", "s4-auth-env.d.ts"))).toBe(true);
  expect(readFileSync(join(target, "src", "s4-auth-env.d.ts"), "utf8")).toContain("VITE_USER_POOL_ID");
  expect(written).toContain("src/s4-auth-env.d.ts");
  expect(written).not.toContain("src/vite-env.d.ts");
});

test("with no existing vite-env.d.ts the template is written normally", () => {
  const written = copyTemplates(templates, target, { vite: true });
  expect(existsSync(join(target, "src", "vite-env.d.ts"))).toBe(true);
  expect(existsSync(join(target, "src", "s4-auth-env.d.ts"))).toBe(false);
  expect(written).toContain("src/vite-env.d.ts");
});
