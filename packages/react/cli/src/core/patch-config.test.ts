import { test, expect } from "vitest";
import { patchAuthConfig } from "./patch-config";

// Representative slice of the real auth.config.ts default block (lines 105-119), with the
// trailing comments that must survive a patch.
const SRC = [
  "export const authConfig: AuthConfig = {",
  "  providers: ['google'], // C8 — set to ['google','microsoft'] etc.",
  "  appTitle: 'Sign in',",
  "  userPoolId: env.VITE_USER_POOL_ID ?? '__USER_POOL_ID__', // CFN Output: UserPoolId",
  "  postLoginRoute: '/home', // C6 — single configurable landing",
  "};",
  "",
].join("\n");

test("rewrites providers to the requested list, keeping the trailing comment", () => {
  const out = patchAuthConfig(SRC, { providers: ["google", "microsoft"] });
  expect(out).toContain("providers: ['google', 'microsoft'], // C8 — set to ['google','microsoft'] etc.");
});

test("rewrites appTitle", () => {
  const out = patchAuthConfig(SRC, { appTitle: "Acme Portal" });
  expect(out).toContain("appTitle: 'Acme Portal',");
});

test("escapes an apostrophe in appTitle so the literal stays valid", () => {
  const out = patchAuthConfig(SRC, { appTitle: "Acme's Portal" });
  expect(out).toContain("appTitle: 'Acme\\'s Portal',");
});

test("rewrites postLoginRoute, keeping its trailing comment", () => {
  const out = patchAuthConfig(SRC, { postLoginRoute: "/dashboard" });
  expect(out).toContain("postLoginRoute: '/dashboard', // C6 — single configurable landing");
});

test("omitted fields are left untouched", () => {
  const out = patchAuthConfig(SRC, { providers: ["microsoft"] });
  expect(out).toContain("appTitle: 'Sign in',");
  expect(out).toContain("postLoginRoute: '/home',");
});

test("does not touch the policy-bound userPoolId line", () => {
  const out = patchAuthConfig(SRC, { providers: ["microsoft"], appTitle: "X", postLoginRoute: "/y" });
  expect(out).toContain("userPoolId: env.VITE_USER_POOL_ID ?? '__USER_POOL_ID__', // CFN Output: UserPoolId");
});

test("is idempotent — re-patching with the same values is a no-op", () => {
  const once = patchAuthConfig(SRC, { providers: ["microsoft"], appTitle: "X", postLoginRoute: "/y" });
  const twice = patchAuthConfig(once, { providers: ["microsoft"], appTitle: "X", postLoginRoute: "/y" });
  expect(twice).toBe(once);
});
