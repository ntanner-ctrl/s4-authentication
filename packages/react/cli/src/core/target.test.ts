import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyTarget } from "./target";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "s4target-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

/** Lay down an unmodified create-vite react-ts scaffold (the bits the classifier inspects). */
function scaffoldPristineViteTs(): void {
  write("package.json", JSON.stringify({
    name: "vite-app",
    devDependencies: { vite: "^5.0.0", typescript: "^5.2.0" },
    dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
  }));
  write("vite.config.ts", "export default {}\n");
  write("index.html", "<div id='root'></div>");
  write("src/main.tsx", "// main\n");
  write("src/App.tsx", "function App() { return <h1>Vite + React</h1> }\nexport default App\n");
}

test("truly empty dir → empty", () => {
  const info = classifyTarget(dir);
  expect(info.targetClass).toBe("empty");
  expect(info.vite).toBe(false);
  expect(info.typescript).toBe(false);
});

test("nonexistent dir → empty", () => {
  const info = classifyTarget(join(dir, "does-not-exist"));
  expect(info.targetClass).toBe("empty");
});

test("dir containing only ignorable entries (.git) → empty", () => {
  mkdirSync(join(dir, ".git"));
  expect(classifyTarget(dir).targetClass).toBe("empty");
});

test("unmodified create-vite react-ts default → pristine-vite (vite + ts)", () => {
  scaffoldPristineViteTs();
  const info = classifyTarget(dir);
  expect(info.targetClass).toBe("pristine-vite");
  expect(info.vite).toBe(true);
  expect(info.typescript).toBe(true);
});

test("current create-vite react template (redesigned, no 'Vite + React' heading) → pristine-vite", () => {
  scaffoldPristineViteTs();
  // create-vite 7 redesigned the demo App: the legacy heading is gone, but the bundled demo-logo
  // import remains — that's the marker the classifier must still recognize as a fresh scaffold.
  write("src/App.tsx", "import reactLogo from './assets/react.svg'\nfunction App() { return <img src={reactLogo} /> }\nexport default App\n");
  expect(classifyTarget(dir).targetClass).toBe("pristine-vite");
});

test("vite app whose App.tsx was edited away from the template → app (not pristine)", () => {
  scaffoldPristineViteTs();
  write("src/App.tsx", "function App() { return <Dashboard /> }\nexport default App\n");
  expect(classifyTarget(dir).targetClass).toBe("app");
});

test("vite app that already has the adapter installed → app (not pristine)", () => {
  scaffoldPristineViteTs();
  write("src/auth.config.ts", "// already installed\n");
  expect(classifyTarget(dir).targetClass).toBe("app");
});

test("non-vite TypeScript app → app, vite false, typescript true", () => {
  write("package.json", JSON.stringify({ name: "node-app", devDependencies: { typescript: "^5.0.0" } }));
  write("tsconfig.json", "{}");
  write("src/index.ts", "// app\n");
  const info = classifyTarget(dir);
  expect(info.targetClass).toBe("app");
  expect(info.vite).toBe(false);
  expect(info.typescript).toBe(true);
});

test("vite detected via vite.config.js even without the dep", () => {
  write("package.json", JSON.stringify({ name: "x" }));
  write("vite.config.js", "export default {}\n");
  write("src/App.jsx", "// custom\n");
  expect(classifyTarget(dir).vite).toBe(true);
});

test("exposes the parsed package.json for reuse by the install core", () => {
  scaffoldPristineViteTs();
  expect(classifyTarget(dir).packageJson.dependencies).toHaveProperty("react");
});
