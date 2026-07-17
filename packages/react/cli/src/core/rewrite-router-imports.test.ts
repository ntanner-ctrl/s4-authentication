import { test, expect } from "vitest";
import { rewriteRouterImports, ROUTER_IMPORT_FILES } from "./rewrite-router-imports";

const REQUIRE_AUTH = `import React from 'react';
import { Navigate, useLocation } from 'react-router';

import { authConfig } from '../auth.config';
`;

test("rewrites the router specifier to react-router-dom", () => {
  const out = rewriteRouterImports(REQUIRE_AUTH, "react-router-dom");
  expect(out).toContain("import { Navigate, useLocation } from 'react-router-dom';");
  expect(out).not.toMatch(/from 'react-router'/);
});

test("react-router target is a no-op", () => {
  expect(rewriteRouterImports(REQUIRE_AUTH, "react-router")).toBe(REQUIRE_AUTH);
});

test("does not touch non-router imports", () => {
  const out = rewriteRouterImports(REQUIRE_AUTH, "react-router-dom");
  expect(out).toContain("import React from 'react';");
  expect(out).toContain("import { authConfig } from '../auth.config';");
});

test("does not corrupt react-router-dom if already correct", () => {
  const already = "import { Navigate } from 'react-router-dom';\n";
  expect(rewriteRouterImports(already, "react-router-dom")).toBe(already);
});

test("handles double quotes", () => {
  const dq = 'import { Navigate } from "react-router";\n';
  expect(rewriteRouterImports(dq, "react-router-dom")).toBe('import { Navigate } from "react-router-dom";\n');
});

test("the four adapter files that import the router are listed", () => {
  expect(ROUTER_IMPORT_FILES).toEqual([
    "src/auth/RequireAuth.tsx",
    "src/auth/RequireRole.tsx",
    "src/login/LoginPage.tsx",
    "src/login/CallbackPage.tsx",
  ]);
});
