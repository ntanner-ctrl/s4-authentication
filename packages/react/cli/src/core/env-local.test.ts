import { test, expect } from "vitest";
import { renderEnvLocal, mergeEnvLocal } from "./env-local";

const CFG = {
  userPoolId: "us-east-1_AbC123",
  clientId: "1example2client3id",
  cognitoDomain: "myapp.auth.us-east-1.amazoncognito.com",
  region: "us-east-1",
};

test("emits exactly the four VITE_* keys with their values", () => {
  const out = renderEnvLocal(CFG);
  expect(out).toContain("VITE_USER_POOL_ID=us-east-1_AbC123");
  expect(out).toContain("VITE_USER_POOL_CLIENT_ID=1example2client3id");
  expect(out).toContain("VITE_COGNITO_HOSTED_DOMAIN=myapp.auth.us-east-1.amazoncognito.com");
  expect(out).toContain("VITE_AWS_REGION=us-east-1");
});

test("contains exactly four VITE_ assignment lines", () => {
  const out = renderEnvLocal(CFG);
  const assignments = out.split("\n").filter((l) => /^VITE_[A-Z_]+=/.test(l));
  expect(assignments).toHaveLength(4);
});

test("ends with a trailing newline", () => {
  expect(renderEnvLocal(CFG).endsWith("\n")).toBe(true);
});

// The app's real .env.local shape (7 vars). Only VITE_AWS_REGION is ours; the other
// six are the app's and must survive byte-identical. This is the F3 regression:
// the old unconditional write destroyed six of these seven.
const EXISTING = `VITE_REST_API_URL=http://localhost:3000
VITE_APP_TITLE=Admin
VITE_CLIENT_LABEL=acme
VITE_DEV_AUTH=true
VITE_COGNITO_USER_POOL_ID=us-east-1_Old
VITE_COGNITO_CLIENT_ID=oldclient
VITE_AWS_REGION=us-east-1
`;

test("no existing file → identical to a fresh render", () => {
  const r = mergeEnvLocal(null, CFG, { force: false });
  expect(r.content).toBe(renderEnvLocal(CFG));
  expect(r.merged).toBe(false);
  expect(r.conflicts).toEqual([]);
});

test("merging preserves every pre-existing variable", () => {
  const { content } = mergeEnvLocal(EXISTING, CFG, { force: false });
  for (const line of EXISTING.trim().split("\n")) {
    expect(content).toContain(line);
  }
});

test("merging appends only the owned keys that were absent", () => {
  const { content } = mergeEnvLocal(EXISTING, CFG, { force: false });
  expect(content).toContain("VITE_USER_POOL_ID=us-east-1_AbC123");
  expect(content).toContain("VITE_USER_POOL_CLIENT_ID=1example2client3id");
  expect(content).toContain("VITE_COGNITO_HOSTED_DOMAIN=myapp.auth.us-east-1.amazoncognito.com");
  // Already present with the same value — must not be duplicated.
  const region = content.split("\n").filter((l) => l.startsWith("VITE_AWS_REGION="));
  expect(region).toHaveLength(1);
});

test("an owned key with a different value is left alone and reported", () => {
  const existing = "VITE_AWS_REGION=us-west-2\n";
  const r = mergeEnvLocal(existing, CFG, { force: false });
  expect(r.content).toContain("VITE_AWS_REGION=us-west-2");
  expect(r.content).not.toContain("VITE_AWS_REGION=us-east-1");
  expect(r.conflicts).toContain("VITE_AWS_REGION");
});

test("--force overwrites an owned key and reports no conflict", () => {
  const existing = "VITE_AWS_REGION=us-west-2\n";
  const r = mergeEnvLocal(existing, CFG, { force: true });
  expect(r.content).toContain("VITE_AWS_REGION=us-east-1");
  expect(r.conflicts).toEqual([]);
});

test("an unowned key is never touched even under --force", () => {
  const r = mergeEnvLocal(EXISTING, CFG, { force: true });
  expect(r.content).toContain("VITE_REST_API_URL=http://localhost:3000");
  expect(r.content).toContain("VITE_DEV_AUTH=true");
});

test("merged output ends with a trailing newline", () => {
  expect(mergeEnvLocal(EXISTING, CFG, { force: false }).content.endsWith("\n")).toBe(true);
});

// dotenv (which Vite uses to load .env files) strips a leading `export ` prefix and treats
// quoted values as equivalent to unquoted, so both forms are real files a developer may have.

test("an owned key written as `export KEY=value` that disagrees is reported, left byte-identical, and not duplicated", () => {
  const existing = "export VITE_AWS_REGION=us-west-2\nVITE_APP_TITLE=Admin\n";
  const r = mergeEnvLocal(existing, CFG, { force: false });
  expect(r.conflicts).toContain("VITE_AWS_REGION");
  expect(r.content).toContain("export VITE_AWS_REGION=us-west-2");
  // No silent appended duplicate with the desired value.
  const regionLines = r.content.split("\n").filter((l) => l.includes("VITE_AWS_REGION"));
  expect(regionLines).toHaveLength(1);
});

test("an owned key written as `export KEY=value` that agrees is marked seen and not duplicated", () => {
  const existing = "export VITE_AWS_REGION=us-east-1\nVITE_APP_TITLE=Admin\n";
  const r = mergeEnvLocal(existing, CFG, { force: false });
  expect(r.conflicts).not.toContain("VITE_AWS_REGION");
  expect(r.content).toContain("export VITE_AWS_REGION=us-east-1");
  const regionLines = r.content.split("\n").filter((l) => l.includes("VITE_AWS_REGION"));
  expect(regionLines).toHaveLength(1);
});

test("an unowned key with `export ` is preserved byte-identical, prefix and all", () => {
  const existing = "export VITE_REST_API_URL=http://x\nVITE_AWS_REGION=us-east-1\n";
  const r = mergeEnvLocal(existing, CFG, { force: false });
  expect(r.content).toContain("export VITE_REST_API_URL=http://x");
});

test("a quoted value that agrees is not reported as a conflict", () => {
  const existing = 'VITE_AWS_REGION="us-east-1"\n';
  const r = mergeEnvLocal(existing, CFG, { force: false });
  expect(r.conflicts).not.toContain("VITE_AWS_REGION");
  expect(r.content).toContain('VITE_AWS_REGION="us-east-1"');
});

test("--force rewrites an `export KEY=value` line preserving the export prefix", () => {
  const existing = "export VITE_AWS_REGION=us-west-2\n";
  const r = mergeEnvLocal(existing, CFG, { force: true });
  expect(r.content).toContain("export VITE_AWS_REGION=us-east-1");
  expect(r.content).not.toContain("VITE_AWS_REGION=us-west-2");
  expect(r.conflicts).toEqual([]);
});
