import { test, expect } from "vitest";
import { detectRouterPackage } from "./router-package";

const NO_ROUTER_ENTRY = 'import { createRoot } from "react-dom/client";\ncreateRoot(el).render(<App />);\n';

test("an import in App.tsx wins over package.json", () => {
  const r = detectRouterPackage({
    pkgJson: { dependencies: { "react-router": "7.13.0", "react-router-dom": "^7.15.0" } },
    entrySource: NO_ROUTER_ENTRY,
    appSource: "import { BrowserRouter, Routes, Route } from 'react-router-dom';\n",
  });
  expect(r.pkg).toBe("react-router-dom");
});

test("an import in the entry wins over package.json", () => {
  const r = detectRouterPackage({
    pkgJson: { dependencies: { "react-router": "^7" } },
    entrySource: 'import { BrowserRouter } from "react-router-dom";\ncreateRoot(el).render(<App />);\n',
  });
  expect(r.pkg).toBe("react-router-dom");
});

test("no imports → react-router-dom in deps wins over react-router", () => {
  const r = detectRouterPackage({
    pkgJson: { dependencies: { "react-router": "7.13.0", "react-router-dom": "^7.15.0" } },
    entrySource: NO_ROUTER_ENTRY,
    appSource: "export default function App() { return <div />; }\n",
  });
  expect(r.pkg).toBe("react-router-dom");
});

test("no imports, only react-router in deps → react-router", () => {
  const r = detectRouterPackage({
    pkgJson: { dependencies: { "react-router": "^7" } },
    entrySource: NO_ROUTER_ENTRY,
  });
  expect(r.pkg).toBe("react-router");
});

test("neither present (greenfield/vusion) → react-router", () => {
  const r = detectRouterPackage({ pkgJson: {}, entrySource: NO_ROUTER_ENTRY });
  expect(r.pkg).toBe("react-router");
});

test("devDependencies count too", () => {
  const r = detectRouterPackage({
    pkgJson: { devDependencies: { "react-router-dom": "^7" } },
    entrySource: NO_ROUTER_ENTRY,
  });
  expect(r.pkg).toBe("react-router-dom");
});

test("every result carries a human-readable reason", () => {
  expect(detectRouterPackage({ pkgJson: {}, entrySource: NO_ROUTER_ENTRY }).reason).toBeTruthy();
});
