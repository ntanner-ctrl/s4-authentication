import { describe, it, test, expect } from "vitest";
import { planRouterWiring, dropUnusedImport } from "./router-wire";
import type { RouterWireInput } from "./router-wire";

// vusion's App.tsx: routerless. Shape 1 now REQUIRES appSource — "I could not see App.tsx"
// and "App.tsx has no router" used to be the same state, and that conflation IS the bug.
const ROUTERLESS_APP = `import "./App.css";
export default function App() {
  return <div className="app">hello</div>;
}
`;

function plan(entrySource: string, over: Partial<RouterWireInput> = {}) {
  return planRouterWiring({
    entrySource,
    appSource: ROUTERLESS_APP,
    routerPackage: "react-router",
    ...over,
  });
}

// vusion's REAL pristine main.tsx (git:HEAD) — indented 2 spaces, leading blank line, no StrictMode.
const VUSION_MAIN = `
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";

  createRoot(document.getElementById("root")!).render(<App />);
`;

describe("planRouterWiring — vusion bare shape (brownfield routerless main)", () => {
  it("wraps the rendered child in the catch-all auth scaffold", () => {
    const p = plan(VUSION_MAIN);
    expect(p.action).toBe("wrap");
    const out = p.entryContent!;
    // public routes
    expect(out).toContain('<Route path="/login" element={<LoginPage />} />');
    expect(out).toContain('<Route path="/auth/callback" element={<CallbackPage />} />');
    // the existing app, gated wholesale via catch-all
    expect(out).toContain('<Route path="/*" element={<RequireAuth><App /></RequireAuth>} />');
    // provider above the router
    expect(out).toMatch(/<AuthRoot>[\s\S]*<BrowserRouter>[\s\S]*<Routes>/);
  });

  it("injects exactly the four adapter imports + react-router import", () => {
    const out = plan(VUSION_MAIN).entryContent!;
    expect(out).toContain('import { AuthRoot } from "./auth/AuthRoot";');
    expect(out).toContain('import { RequireAuth } from "./auth/RequireAuth";');
    expect(out).toContain('import { LoginPage } from "./login/LoginPage";');
    expect(out).toContain('import { CallbackPage } from "./login/CallbackPage";');
    expect(out).toContain('import { BrowserRouter, Routes, Route } from "react-router";');
  });

  it("preserves the createRoot target argument verbatim", () => {
    const out = plan(VUSION_MAIN).entryContent!;
    expect(out).toContain('createRoot(document.getElementById("root")!).render(');
  });

  it("produces brace/paren-balanced output (sanity guardrail)", () => {
    const out = plan(VUSION_MAIN).entryContent!;
    expect(count(out, "(")).toBe(count(out, ")"));
    expect(count(out, "{")).toBe(count(out, "}"));
  });
});

// create-vite react-ts DEFAULT main.tsx — StrictMode-wrapped, single-quoted, trailing comma.
const VITE_DEFAULT_MAIN = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`;

describe("planRouterWiring — create-vite StrictMode shape (greenfield)", () => {
  it("wraps the StrictMode child verbatim inside RequireAuth", () => {
    const p = plan(VITE_DEFAULT_MAIN);
    expect(p.action).toBe("wrap");
    expect(p.entryContent!).toMatch(/<RequireAuth><StrictMode>[\s\S]*<App \/>[\s\S]*<\/StrictMode><\/RequireAuth>/);
    expect(p.entryContent!).toContain('<Route path="/login" element={<LoginPage />} />');
  });
});

describe("planRouterWiring — idempotency + conservative bails (mutate nothing)", () => {
  it("no-ops when the adapter is already wired (AuthRoot present)", () => {
    const wired = plan(VUSION_MAIN).entryContent!;
    const p = plan(wired);
    expect(p.action).toBe("noop-already-wired");
    expect(p.entryContent).toBeUndefined();
  });

  it("bails when the app already has a router (data-mode createBrowserRouter)", () => {
    const dataMode = `import { createBrowserRouter, RouterProvider } from "react-router";
import { createRoot } from "react-dom/client";
import App from "./App";
const router = createBrowserRouter([{ path: "/", element: <App /> }]);
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
`;
    const p = plan(dataMode);
    expect(p.action).toBe("bail");
    expect(p.reason).toMatch(/router/i);
  });

  it("bails on an import-name collision with an injected identifier", () => {
    const collide = `import { createRoot } from "react-dom/client";
import { Route } from "./my-route-helper";
import App from "./App.tsx";
createRoot(document.getElementById("root")!).render(<App />);
`;
    const p = plan(collide);
    expect(p.action).toBe("bail");
    expect(p.reason).toMatch(/Route|clash|collision/i);
  });

  it("bails on the split createRoot/render form", () => {
    const split = `import { createRoot } from "react-dom/client";
import App from "./App.tsx";
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
`;
    expect(plan(split).action).toBe("bail");
  });

  it("bails when there are multiple createRoot calls", () => {
    const multi = `import { createRoot } from "react-dom/client";
createRoot(a).render(<A />);
createRoot(b).render(<B />);
`;
    expect(plan(multi).action).toBe("bail");
  });

  it("bails on legacy ReactDOM.render (no createRoot)", () => {
    const legacy = `import ReactDOM from "react-dom";
import App from "./App";
ReactDOM.render(<App />, document.getElementById("root"));
`;
    expect(plan(legacy).action).toBe("bail");
  });
});

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

test("GOLDEN: vusion's wrapped entry is byte-identical to v0.3.1", () => {
  expect(plan(VUSION_MAIN).entryContent).toMatchSnapshot();
});

// The COMMON React layout the installer never handled: router in App.tsx, entry is a bare
// createRoot(<App />). This is the case F5 shipped blind — router-wire.test.ts:78 only ever
// covered a router in the ENTRY, which the code already handled.
const ROUTER_IN_APP = `import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
`;

describe("planRouterWiring — Shape 2: router in App.tsx (the F5 case)", () => {
  it("unwraps App's BrowserRouter and wires the entry", () => {
    const p = plan(VUSION_MAIN, { appSource: ROUTER_IN_APP, routerPackage: "react-router-dom" });
    expect(p.action).toBe("wrap-and-unwrap");
    expect(p.shape).toBe("router-in-app");
  });

  it("removes exactly the BrowserRouter tags from App.tsx and keeps its routes", () => {
    const out = plan(VUSION_MAIN, { appSource: ROUTER_IN_APP, routerPackage: "react-router-dom" }).appContent!;
    expect(out).not.toContain("<BrowserRouter>");
    expect(out).not.toContain("</BrowserRouter>");
    expect(out).toContain('<Route path="/" element={<DashboardPage />} />');
    expect(out).toContain("<Routes>");
  });

  it("injects the entry import from the app's router package, not react-router", () => {
    const out = plan(VUSION_MAIN, { appSource: ROUTER_IN_APP, routerPackage: "react-router-dom" }).entryContent!;
    expect(out).toContain('import { BrowserRouter, Routes, Route } from "react-router-dom";');
  });

  it("reports that an app-owned /login is now shadowed", () => {
    const p = plan(VUSION_MAIN, { appSource: ROUTER_IN_APP, routerPackage: "react-router-dom" });
    expect(p.notes!.join("\n")).toMatch(/login/i);
  });

  it("bails when App's BrowserRouter carries props (basename would be silently dropped)", () => {
    const withBasename = ROUTER_IN_APP.replace("<BrowserRouter>", '<BrowserRouter basename="/admin">');
    const p = plan(VUSION_MAIN, { appSource: withBasename, routerPackage: "react-router-dom" });
    expect(p.action).toBe("bail");
    expect(p.reason).toMatch(/props|basename/i);
    expect(p.appContent).toBeUndefined();
  });

  it("bails on data mode in App.tsx", () => {
    const dataMode = `import { createBrowserRouter, RouterProvider } from 'react-router-dom';
const router = createBrowserRouter([]);
export default function App() { return <RouterProvider router={router} />; }
`;
    expect(plan(VUSION_MAIN, { appSource: dataMode, routerPackage: "react-router-dom" }).action).toBe("bail");
  });

  // F8: the unwrap above removes BrowserRouter's only JSX use. Left alone, the import line still
  // names it — `tsc --noUnusedLocals` fails with TS6133, a green install / red build silent break.
  describe("F8: the unwrap must not leave a dangling BrowserRouter import", () => {
    it("drops BrowserRouter (first in the list) from App.tsx's import line", () => {
      // ROUTER_IN_APP's import is `import { BrowserRouter, Routes, Route } from 'react-router-dom';`
      const out = plan(VUSION_MAIN, { appSource: ROUTER_IN_APP, routerPackage: "react-router-dom" }).appContent!;
      expect(out).toContain("import { Routes, Route } from 'react-router-dom';");
      expect(out).not.toMatch(/\bBrowserRouter\b/);
      expect(out).toContain("<Routes>");
      expect(out).toContain('<Route path="/" element={<DashboardPage />} />');
    });

    it("drops BrowserRouter when it is last in the list, with no trailing comma", () => {
      const appSource = `import { Routes, Route, BrowserRouter } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div />} />
      </Routes>
    </BrowserRouter>
  );
}
`;
      const out = plan(VUSION_MAIN, { appSource, routerPackage: "react-router-dom" }).appContent!;
      expect(out).toContain("import { Routes, Route } from 'react-router-dom';");
      expect(out).not.toContain(", ,");
      expect(out).not.toMatch(/,\s*\}/);
      expect(out).not.toMatch(/\bBrowserRouter\b/);
    });

    it("removes the whole import line when BrowserRouter was the only named import", () => {
      const appSource = `import { BrowserRouter } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div />} />
      </Routes>
    </BrowserRouter>
  );
}
`;
      const out = plan(VUSION_MAIN, { appSource, routerPackage: "react-router-dom" }).appContent!;
      expect(out).not.toContain("import { BrowserRouter } from 'react-router-dom';");
      expect(out).not.toMatch(/\bBrowserRouter\b/);
      expect(out).toContain("import { Routes, Route } from 'react-router-dom';");
    });

    it("does NOT drop BrowserRouter when App.tsx still references it elsewhere (safety)", () => {
      const appSource = `import { BrowserRouter, Routes, Route } from 'react-router-dom';

// still needed below — a contrived but unambiguous second reference
const RouterRef = BrowserRouter;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div />} />
      </Routes>
    </BrowserRouter>
  );
}
`;
      const out = plan(VUSION_MAIN, { appSource, routerPackage: "react-router-dom" }).appContent!;
      expect(out).toContain("import { BrowserRouter, Routes, Route } from 'react-router-dom';");
      expect(out).toContain("const RouterRef = BrowserRouter;");
    });
  });
});

describe("dropUnusedImport (unit)", () => {
  it("drops a middle name from the list", () => {
    const src = "import { Routes, BrowserRouter, Route } from 'react-router-dom';\nexport {};\n";
    expect(dropUnusedImport(src, "BrowserRouter")).toBe("import { Routes, Route } from 'react-router-dom';\nexport {};\n");
  });

  it("matches bare react-router (not just react-router-dom), double-quoted", () => {
    const src = 'import { BrowserRouter, Routes } from "react-router";\nexport {};\n';
    expect(dropUnusedImport(src, "BrowserRouter")).toBe('import { Routes } from "react-router";\nexport {};\n');
  });

  it("is a no-op when the name isn't in the import list", () => {
    const src = "import { Routes, Route } from 'react-router-dom';\n";
    expect(dropUnusedImport(src, "BrowserRouter")).toBe(src);
  });

  it("is a no-op when there is no react-router import line at all", () => {
    const src = "import App from './App';\nexport {};\n";
    expect(dropUnusedImport(src, "BrowserRouter")).toBe(src);
  });

  it("is a no-op when the name is still referenced elsewhere", () => {
    const src = "import { BrowserRouter, Routes } from 'react-router-dom';\nconst x = BrowserRouter;\n";
    expect(dropUnusedImport(src, "BrowserRouter")).toBe(src);
  });
});

// React Router's own quickstart shape.
const ROUTER_IN_ENTRY = `import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
`;

describe("planRouterWiring — Shape 3: router in the entry (RR quickstart)", () => {
  it("rebuilds the entry and never touches App.tsx", () => {
    const p = plan(ROUTER_IN_ENTRY, { appSource: ROUTER_IN_APP.replace(/<\/?BrowserRouter>/g, ""), routerPackage: "react-router-dom" });
    expect(p.action).toBe("wrap");
    expect(p.shape).toBe("router-in-entry");
    expect(p.appContent).toBeUndefined();
  });

  it("produces the gate-by-default route table (F7 preserved)", () => {
    const out = plan(ROUTER_IN_ENTRY, { appSource: ROUTER_IN_APP.replace(/<\/?BrowserRouter>/g, ""), routerPackage: "react-router-dom" }).entryContent!;
    expect(out).toContain('<Route path="/*" element={<RequireAuth><App /></RequireAuth>} />');
    expect(out).toContain('<Route path="/login" element={<LoginPage />} />');
  });

  it("bails when the entry's BrowserRouter carries props", () => {
    const withBasename = ROUTER_IN_ENTRY.replace("<BrowserRouter>", '<BrowserRouter basename="/x">');
    expect(plan(withBasename, { routerPackage: "react-router-dom" }).action).toBe("bail");
  });
});

describe("planRouterWiring — unseeable App.tsx", () => {
  it("bails rather than guessing when App.tsx could not be read", () => {
    const p = plan(VUSION_MAIN, { appSource: undefined });
    expect(p.action).toBe("bail");
    expect(p.reason).toMatch(/App/i);
  });
});

describe("planRouterWiring — Shape 1 regression (vusion must not change)", () => {
  it("produces byte-identical output to the shipped v0.3.1 behaviour", () => {
    const p = plan(VUSION_MAIN);
    expect(p.action).toBe("wrap");
    expect(p.shape).toBe("routerless");
    expect(p.entryContent!).toContain('<Route path="/*" element={<RequireAuth><App /></RequireAuth>} />');
    expect(p.entryContent!).toContain('import { BrowserRouter, Routes, Route } from "react-router";');
  });
});
