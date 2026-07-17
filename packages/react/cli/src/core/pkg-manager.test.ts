import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager } from "./pkg-manager";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "s4pm-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function touch(name: string): void {
  writeFileSync(join(dir, name), "");
}

test("pnpm-lock.yaml → pnpm add", () => {
  touch("pnpm-lock.yaml");
  expect(detectPackageManager(dir)).toEqual({ name: "pnpm", addCommand: ["pnpm", "add"] });
});

test("yarn.lock → yarn add", () => {
  touch("yarn.lock");
  expect(detectPackageManager(dir)).toEqual({ name: "yarn", addCommand: ["yarn", "add"] });
});

test("bun.lockb → bun add", () => {
  touch("bun.lockb");
  expect(detectPackageManager(dir)).toEqual({ name: "bun", addCommand: ["bun", "add"] });
});

test("package-lock.json → npm install", () => {
  touch("package-lock.json");
  expect(detectPackageManager(dir)).toEqual({ name: "npm", addCommand: ["npm", "install"] });
});

test("no lockfile → npm default", () => {
  expect(detectPackageManager(dir).name).toBe("npm");
});

test("pnpm wins over package-lock when both present (more specific)", () => {
  touch("package-lock.json");
  touch("pnpm-lock.yaml");
  expect(detectPackageManager(dir).name).toBe("pnpm");
});

test("pnpm workspace root → pnpm add -w", () => {
  touch("pnpm-lock.yaml");
  touch("pnpm-workspace.yaml");
  expect(detectPackageManager(dir)).toEqual({ name: "pnpm", addCommand: ["pnpm", "add", "-w"] });
});

test("pnpm without a workspace file → plain pnpm add", () => {
  touch("pnpm-lock.yaml");
  expect(detectPackageManager(dir).addCommand).toEqual(["pnpm", "add"]);
});

test("a workspace file without a pnpm lockfile does not add -w", () => {
  touch("pnpm-workspace.yaml");
  touch("package-lock.json");
  expect(detectPackageManager(dir)).toEqual({ name: "npm", addCommand: ["npm", "install"] });
});
