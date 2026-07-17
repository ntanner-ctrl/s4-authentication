import { test, expect } from "vitest";
import { resolveFromFlags } from "./config";

test("all four Cognito flags present → complete config, nothing missing", () => {
  const r = resolveFromFlags({
    "user-pool-id": "us-east-1_X",
    "client-id": "cid",
    "cognito-domain": "d.auth.amazoncognito.com",
    region: "us-east-1",
  });
  expect(r.cognito).toEqual({
    userPoolId: "us-east-1_X",
    clientId: "cid",
    cognitoDomain: "d.auth.amazoncognito.com",
    region: "us-east-1",
  });
  expect(r.missingCognito).toEqual([]);
});

test("absent required values are reported by flag name, in order", () => {
  const r = resolveFromFlags({ "user-pool-id": "us-east-1_X", region: "us-east-1" });
  expect(r.missingCognito).toEqual(["client-id", "cognito-domain"]);
});

test("blank flag value counts as missing, not present", () => {
  const r = resolveFromFlags({ "client-id": "   " });
  expect(r.missingCognito).toContain("client-id");
  expect(r.cognito.clientId).toBeUndefined();
});

test("providers flag splits a comma list into the patch", () => {
  const r = resolveFromFlags({ providers: "google, microsoft" });
  expect(r.patch.providers).toEqual(["google", "microsoft"]);
});

test("app-title and post-login-route map into the patch", () => {
  const r = resolveFromFlags({ "app-title": "Acme Portal", "post-login-route": "/dashboard" });
  expect(r.patch.appTitle).toBe("Acme Portal");
  expect(r.patch.postLoginRoute).toBe("/dashboard");
});

test("no optional flags → empty patch", () => {
  const r = resolveFromFlags({ "user-pool-id": "x", "client-id": "y", "cognito-domain": "z", region: "r" });
  expect(r.patch).toEqual({});
});
