import { describe, it, expect } from "vitest";
import { appImportSpecifier } from "./resolve-app-import";

describe("appImportSpecifier — regression: F5 double-router via wrong-import resolution", () => {
  // The bug fixture: a relative default import (store) precedes the App import. The OLD
  // resolveAppPath logic (first relative default import in the entry, regardless of what's
  // rendered) returns "./store" here — commands.ts then reads store.ts as if it were App.tsx,
  // sees no <BrowserRouter> in it, and the planner wraps the entry while the REAL App.tsx still
  // owns its own router. Silent double-router. This test pins the correct behavior: resolve the
  // component the entry actually renders, not the first relative import encountered.
  it("resolves App's specifier, NOT the earlier store import", () => {
    const entry = `import ReactDOM from 'react-dom/client'
import store from './store'
import App from './App'
createRoot(document.getElementById('root')!).render(<App />)
`;
    expect(appImportSpecifier(entry)).toBe("./App");
  });
});

describe("appImportSpecifier — StrictMode-wrapped root (create-vite default shape)", () => {
  it("skips StrictMode and resolves the wrapped App's specifier", () => {
    const entry = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`;
    expect(appImportSpecifier(entry)).toBe("./App.tsx");
  });
});

describe("appImportSpecifier — subdirectory + explicit extension", () => {
  it("returns the specifier verbatim, including subdir and extension", () => {
    const entry = `import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
createRoot(document.getElementById("root")!).render(<App />);
`;
    expect(appImportSpecifier(entry)).toBe("./app/App.tsx");
  });
});

describe("appImportSpecifier — no relative App import", () => {
  it("returns null when App is defined inline in the entry (no import to follow)", () => {
    const entry = `import { createRoot } from "react-dom/client";
function App() {
  return <div>hello</div>;
}
createRoot(document.getElementById("root")!).render(<App />);
`;
    expect(appImportSpecifier(entry)).toBeNull();
  });
});

describe("appImportSpecifier — non-relative App import", () => {
  it("returns null when App comes from a package, not a relative path", () => {
    const entry = `import { createRoot } from "react-dom/client";
import App from "some-pkg";
createRoot(document.getElementById("root")!).render(<App />);
`;
    expect(appImportSpecifier(entry)).toBeNull();
  });
});

describe("appImportSpecifier — no createRoot render call", () => {
  it("returns null when there is no single recognizable render call", () => {
    const entry = `import App from "./App";
ReactDOM.render(<App />, document.getElementById("root"));
`;
    expect(appImportSpecifier(entry)).toBeNull();
  });
});
