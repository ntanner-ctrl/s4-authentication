import { test, expect } from "vitest";
import { missingDeps, installSpecs, requiredDeps, depInstallFailed } from "./deps";

test("empty package.json → all three required deps missing", () => {
  expect(missingDeps({}, "react-router").map((d) => d.name)).toEqual([
    "react-oidc-context",
    "oidc-client-ts",
    "react-router",
  ]);
});

test("all deps present in dependencies → none missing (idempotent re-run)", () => {
  const pkg = {
    dependencies: {
      "react-oidc-context": "^3.0.0",
      "oidc-client-ts": "^3.0.0",
      "react-router": "^7.0.0",
    },
  };
  expect(missingDeps(pkg, "react-router")).toEqual([]);
});

test("a dep present only in devDependencies counts as present", () => {
  const pkg = { devDependencies: { "oidc-client-ts": "^3.0.0" } };
  expect(missingDeps(pkg, "react-router").map((d) => d.name)).toEqual(["react-oidc-context", "react-router"]);
});

test("installSpecs renders pinned versions as name@range", () => {
  expect(installSpecs(requiredDeps("react-router"))).toEqual([
    "react-oidc-context",
    "oidc-client-ts",
    "react-router@^7",
  ]);
});

test("a clean exit is not a failure", () => {
  expect(depInstallFailed({ status: 0 })).toBe(false);
});

test("a non-zero exit is a failure", () => {
  expect(depInstallFailed({ status: 1 })).toBe(true);
});

test("a spawn error is a failure even though status is null", () => {
  expect(depInstallFailed({ error: new Error("ENOENT"), status: null })).toBe(true);
});

test("a null status with no error is a failure (killed/never ran)", () => {
  expect(depInstallFailed({ status: null })).toBe(true);
});

test("an error alongside a 0 status is still a failure (the error check's only distinct case)", () => {
  expect(depInstallFailed({ error: new Error("spawn ENOENT"), status: 0 })).toBe(true);
});

test("requiredDeps uses the app's router package", () => {
  expect(requiredDeps("react-router-dom").map((d) => d.name)).toEqual([
    "react-oidc-context",
    "oidc-client-ts",
    "react-router-dom",
  ]);
});

test("an app with only react-router-dom is NOT given a second router package", () => {
  const missing = missingDeps({ dependencies: { "react-router-dom": "^7" } }, "react-router-dom");
  expect(missing.map((d) => d.name)).not.toContain("react-router");
});

test("an app with both declared needs no router install", () => {
  const missing = missingDeps(
    { dependencies: { "react-router": "7.13.0", "react-router-dom": "^7.15.0", "oidc-client-ts": "^3" } },
    "react-router-dom"
  );
  expect(missing.map((d) => d.name)).toEqual(["react-oidc-context"]);
});

test("a greenfield app gets react-router installed", () => {
  const missing = missingDeps({}, "react-router");
  expect(missing.map((d) => d.name)).toEqual(["react-oidc-context", "oidc-client-ts", "react-router"]);
});
