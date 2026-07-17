import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVersion } from "./version";

function tmpPackageJson(contents: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "s4-version-"));
  const path = join(dir, "package.json");
  writeFileSync(path, contents);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("returns the version string from a valid package.json", () => {
  const { path, cleanup } = tmpPackageJson(JSON.stringify({ name: "@s4/auth-react", version: "1.2.3" }));
  try {
    expect(resolveVersion(path)).toBe("1.2.3");
  } finally {
    cleanup();
  }
});

test("throws when the version field is missing", () => {
  const { path, cleanup } = tmpPackageJson(JSON.stringify({ name: "@s4/auth-react" }));
  try {
    expect(() => resolveVersion(path)).toThrow(/version/);
  } finally {
    cleanup();
  }
});

test("throws when the version field is empty", () => {
  const { path, cleanup } = tmpPackageJson(JSON.stringify({ version: "" }));
  try {
    expect(() => resolveVersion(path)).toThrow(/version/);
  } finally {
    cleanup();
  }
});
