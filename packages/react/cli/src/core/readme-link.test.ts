import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HANDWIRE_SECTION, planRouterWiring } from "./router-wire";

// vitest runs from packages/react/cli, so README-main.md is one level up.
const README = readFileSync(join(process.cwd(), "..", "README-main.md"), "utf8");

// planRouterWiring now takes a RouterWireInput (Task 9). A routerless App.tsx keeps the
// focus on the ENTRY-driven bails this file exercises.
const ROUTERLESS_APP = `export default function App() { return <div />; }\n`;
function plan(entrySource: string) {
  return planRouterWiring({ entrySource, appSource: ROUTERLESS_APP, routerPackage: "react-router" });
}

test("the hand-wire section named by bail messages exists in README-main.md", () => {
  expect(README).toContain(`## ${HANDWIRE_SECTION}`);
});

test("no bail reason references a nonexistent 'Step N' section", () => {
  const bails = [
    // name clash: a routerless entry (no `<BrowserRouter>` element) that imports the
    // BrowserRouter identifier — Shapes 1/2 reject all seven injected names, so this bails.
    plan(
      'import { BrowserRouter } from "react-router";\ncreateRoot(document.getElementById("root")).render(<App />);\n'
    ),
    // name clash: single createRoot(...).render(<App />) entry importing an identifier
    // ("Route") that collides with an injected name.
    plan(
      'import { Route } from "./my-route-helper";\ncreateRoot(document.getElementById("root")).render(<App />);\n'
    ),
    // "unrecognized render child": single createRoot(...).render(...) entry whose child has
    // an attribute, so it fails both BARE_ELEMENT and STRICTMODE_WRAPPED.
    plan('createRoot(document.getElementById("root")).render(<App prop="x" />);\n'),
  ];
  for (const plan of bails) {
    expect(plan.action).toBe("bail");
    // Positive guard: the message names the real section...
    expect(plan.reason).toContain(HANDWIRE_SECTION);
    // ...not the stale, never-updated "Step 3" reference.
    expect(plan.reason).not.toMatch(/Step \d/);
  }
});
