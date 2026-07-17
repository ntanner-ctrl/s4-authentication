// WU5 router wiring — wire a Vite/React entry (main.tsx) into the auth router scaffold by
// classifying the app into one of four named shapes, then acting only on a recognized one:
//
//   Shape 1  routerless        — entry + App.tsx have no router: wrap the entry (vusion).
//   Shape 2  router-in-App.tsx — App.tsx owns the router: unwrap it, wire the entry.
//   Shape 3  router-in-entry   — the entry owns the router: rebuild the entry, leave App.tsx.
//   bail                       — everything else: mutate nothing, show the hand-wire checklist.
//
// Mechanism = a conservative STRING transform over that whitelist, NOT an AST codemod (a
// deliberate scope decision, not a limitation): conservative-bail makes AST's generality a
// non-goal, so jscodeshift's dep weight + reflow risk buy nothing on known/stereotyped shapes we
// only mutate on an EXACT match. Anything we don't recognize → bail (spec cross-cutting: "when in
// doubt, mutate nothing"). Crucially, an App.tsx we could not READ is its own state — represented
// as appSource === undefined and bailed on — not silently conflated with "App.tsx has no router".

import type { RouterPackage } from "./router-package";

export interface RouterWireInput {
  /** main.tsx contents. */
  entrySource: string;
  /** App.tsx contents. undefined = the App import could not be resolved. */
  appSource?: string;
  /** The router package the app uses — imports are injected from it (F4). */
  routerPackage: RouterPackage;
}

export interface RouterWirePlan {
  action: "wrap" | "wrap-and-unwrap" | "noop-already-wired" | "bail";
  /** Which recognized shape produced this plan (drives the CLI summary). */
  shape?: "routerless" | "router-in-app" | "router-in-entry";
  /** New main.tsx content (action = wrap | wrap-and-unwrap). */
  entryContent?: string;
  /** New App.tsx content (action = wrap-and-unwrap only). */
  appContent?: string;
  /** Human-facing reason (action = bail | noop-already-wired). */
  reason?: string;
  /** Advisory, non-blocking observations for the summary. */
  notes?: string[];
}

/** Router primitives whose presence means the app already has a router we don't auto-wire. */
const ROUTER_PRIMITIVES = ["BrowserRouter", "createBrowserRouter", "RouterProvider", "<Routes"];

/**
 * The README-main.md heading the bail messages point at. README-main.md is what
 * scripts/export.sh:18 ships as the react-branch README — it is the ONLY README a
 * consumer receives (bundle.sh:20-26 bundles no README). Asserted to exist by
 * readme-link.test.ts, so renaming the heading fails the build rather than
 * silently dangling.
 */
export const HANDWIRE_SECTION = "Unsupported router shape → wire by hand";

/**
 * createRoot(<target>).render(<child>) — non-greedy, whitespace-tolerant (handles indent/newlines).
 * Exported so resolve-app-import.ts can locate the SAME rendered child this module wires against
 * — two independent render-matchers would drift and re-open the F5 double-router bug.
 */
export const CREATE_ROOT_RENDER = /createRoot\s*\(([\s\S]*?)\)\s*\.render\s*\(\s*([\s\S]*?)\s*,?\s*\)\s*;?/;

/** A single recognized rendered child: bare `<App />` or `<StrictMode><App /></StrictMode>`. */
const BARE_ELEMENT = /^<[A-Z][\w]*\s*\/>$/;
const STRICTMODE_WRAPPED = /^<StrictMode>\s*<[A-Z][\w]*\s*\/>\s*<\/StrictMode>$/;

/** A bare `<BrowserRouter>` — no attributes. Anything with props → bail (basename etc.). */
const BARE_BROWSER_ROUTER = /<BrowserRouter\s*>/;
/** Any `<BrowserRouter ...props>`. Does NOT match the closing `</BrowserRouter>`. */
const ANY_BROWSER_ROUTER = /<BrowserRouter(\s[^>]*)?>/;
/**
 * Counting variant. MUST be a separate /g regex: String.match WITHOUT /g returns
 * [fullMatch, captureGroup], so .length is 2 for a single router. With /g it returns the
 * full matches only, so .length is the true count.
 */
const ALL_BROWSER_ROUTERS = /<BrowserRouter(\s[^>]*)?>/g;
/** Data-mode primitives — a different wiring story entirely. */
const DATA_MODE = /\b(createBrowserRouter|RouterProvider)\b/;

/** Adapter identifiers we inject — a clash with any breaks the build. */
const ADAPTER_NAMES = ["AuthRoot", "RequireAuth", "LoginPage", "CallbackPage"];
/** Router identifiers we inject. Expected to be present already in Shape 3. */
const ROUTER_NAMES = ["BrowserRouter", "Routes", "Route"];

const bail = (reason: string): RouterWirePlan => ({
  action: "bail",
  reason: `${reason} — wire by hand per README "${HANDWIRE_SECTION}"`,
});

export function planRouterWiring(input: RouterWireInput): RouterWirePlan {
  const { entrySource: src, appSource, routerPackage } = input;

  // Idempotency FIRST: a prior install left <AuthRoot> — a re-run must no-op, not re-wrap.
  if (/\bAuthRoot\b/.test(src)) {
    return { action: "noop-already-wired", reason: "adapter already wired (AuthRoot present) — nothing to do" };
  }

  const matches = src.match(/createRoot\s*\(/g) ?? [];
  const m = CREATE_ROOT_RENDER.exec(src);
  if (matches.length !== 1 || !m) {
    return bail("no single createRoot(...).render(...) entry — shape not recognized");
  }
  if (DATA_MODE.test(src)) return bail("entry uses React Router data mode");

  const target = m[1].trim();
  const rawChild = m[2].trim();

  /** First injected identifier already bound in `src`, or undefined. */
  const clashIn = (names: string[]): string | undefined =>
    names.find((n) => new RegExp(`\\b${n}\\b`).test(src));

  // ---- Shape 3: the entry owns the router, wrapping the app element. ----
  if (ANY_BROWSER_ROUTER.test(src)) {
    if (!BARE_BROWSER_ROUTER.test(src)) {
      return bail("the entry's <BrowserRouter> carries props (e.g. basename) that hoisting would drop");
    }
    // Router names are EXPECTED here — the entry legitimately has them and we rebuild the
    // router anyway. Only an adapter-name collision is fatal.
    const clash3 = clashIn(ADAPTER_NAMES);
    if (clash3) return bail(`name clash: \`${clash3}\` is already used in the entry`);

    const inner = rawChild.replace(/^<BrowserRouter\s*>/, "").replace(/<\/BrowserRouter>$/, "").trim();
    if (!BARE_ELEMENT.test(inner) && !STRICTMODE_WRAPPED.test(inner)) {
      return bail(`unrecognized element inside the entry's <BrowserRouter>: \`${inner}\``);
    }
    return finish(src, target, inner, undefined, "router-in-entry", routerPackage, []);
  }

  // ---- Shapes 1 & 2: the entry has no router, so EVERY injected name must be free.
  // This preserves the existing guard (router-wire.test.ts:90 — `Route` imported from an
  // app helper must bail). Do NOT relax it to ADAPTER_NAMES here.
  const clash = clashIn([...ADAPTER_NAMES, ...ROUTER_NAMES]);
  if (clash) return bail(`name clash: \`${clash}\` is already used in the entry`);

  if (!BARE_ELEMENT.test(rawChild) && !STRICTMODE_WRAPPED.test(rawChild)) {
    return bail(`unrecognized render child \`${rawChild}\``);
  }

  // Beyond here we MUST see App.tsx. "Could not see it" and "it has no router" are different
  // states — conflating them is exactly the bug F5 was.
  if (appSource === undefined) {
    return bail("could not resolve the App import from the entry, so the app's router shape is unknown");
  }

  // ---- Shape 2: App.tsx owns the router. ----
  if (ANY_BROWSER_ROUTER.test(appSource)) {
    if (DATA_MODE.test(appSource)) return bail("App.tsx uses React Router data mode");
    if (!BARE_BROWSER_ROUTER.test(appSource)) {
      return bail("App.tsx's <BrowserRouter> carries props (e.g. basename) that hoisting would drop");
    }
    // /g matters: without it, .match returns [full, group] and this would read 2 for a
    // single router, rejecting every valid Shape 2 app.
    if ((appSource.match(ALL_BROWSER_ROUTERS) ?? []).length !== 1) {
      return bail("App.tsx has more than one <BrowserRouter>");
    }
    const unwrapped = appSource
      .replace(BARE_BROWSER_ROUTER, "")
      .replace(/<\/BrowserRouter>\s*/, "");
    // The unwrap above removes BrowserRouter's only JSX use, leaving it imported-but-unreferenced
    // — a silent `tsc --noUnusedLocals` break (green install, red build). Drop it from the import
    // line too, but only when nothing else in the file still needs it (F8).
    const appContent = dropUnusedImport(unwrapped, "BrowserRouter");
    // Same write-time tripwire the entry gets: never hand back a structurally broken App.tsx.
    if (!isBalanced(appContent)) {
      return bail("internal: unwrapping App.tsx's router produced unbalanced output");
    }
    const notes: string[] = [];
    if (/path=["']\/login["']/.test(appSource)) {
      notes.push(
        'App.tsx defines its own "/login" route. The adapter\'s /login is matched first, so yours is now ' +
          "unreachable — remove it (this is the README's Replace path)."
      );
    }
    return finish(src, target, rawChild, appContent, "router-in-app", routerPackage, notes);
  }

  // ---- Shape 1: routerless. ----
  if (ROUTER_PRIMITIVES.some((p) => appSource.includes(p))) {
    return bail("App.tsx renders a router in a shape we don't recognize");
  }
  return finish(src, target, rawChild, undefined, "routerless", routerPackage, []);
}

/** Build the wrapped entry (and validate it) for every non-bail shape. */
function finish(
  src: string,
  target: string,
  child: string,
  appContent: string | undefined,
  shape: NonNullable<RouterWirePlan["shape"]>,
  routerPackage: RouterPackage,
  notes: string[]
): RouterWirePlan {
  const newRender = `createRoot(${target}).render(
  <AuthRoot>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route path="/*" element={<RequireAuth>${child}</RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </AuthRoot>
);`;

  const withRender = src.replace(CREATE_ROOT_RENDER, newRender);
  const entryContent = injectImports(stripRouterImport(withRender), routerPackage);

  // Guardrail: never hand back structurally broken output.
  if ((entryContent.match(/createRoot\s*\(/g) ?? []).length !== 1 || !isBalanced(entryContent)) {
    return bail("internal: transform produced unbalanced output");
  }
  return {
    action: appContent === undefined ? "wrap" : "wrap-and-unwrap",
    shape,
    entryContent,
    ...(appContent === undefined ? {} : { appContent }),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/**
 * Remove `name` from a named-import line sourced from `react-router`/`react-router-dom`
 * (single or double quotes), IF `name` is not referenced anywhere else in `source`. Drops the
 * whole import line when `name` was the only named import. Leaves `source` untouched when no
 * matching import line is found, `name` isn't in it, or `name` is still referenced elsewhere
 * (safety first — an app that aliases or re-references the identifier keeps its import).
 *
 * Pure string transform, no throw — used to fix the F8 dangling-`BrowserRouter`-import bug after
 * the Shape-2 unwrap removes its only JSX use. Exported for direct unit testing.
 */
export function dropUnusedImport(source: string, name: string): string {
  const lineRe = new RegExp(
    `^([ \\t]*import\\s*\\{)([^}]*)(\\}\\s*from\\s*(['"])react-router(?:-dom)?\\4;?)([ \\t]*\\r?\\n?)`,
    "m"
  );
  const match = lineRe.exec(source);
  if (!match) return source;

  const names = match[2]
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (!names.includes(name)) return source;

  const [full, head, , tail, , trailer] = match;
  const withoutLine = source.slice(0, match.index) + source.slice(match.index + full.length);

  // Still referenced outside the import line (aliased, re-used, etc.) → leave it alone.
  if (new RegExp(`\\b${name}\\b`).test(withoutLine)) return source;

  const remaining = names.filter((n) => n !== name);
  if (remaining.length === 0) {
    return withoutLine;
  }
  const newLine = `${head} ${remaining.join(", ")} ${tail}${trailer}`;
  return source.slice(0, match.index) + newLine + source.slice(match.index + full.length);
}

/** Shape 3's entry already imports the router; drop that line so injectImports owns it. */
function stripRouterImport(src: string): string {
  return src
    .split("\n")
    .filter((l) => !/^\s*import\s+\{[^}]*\}\s+from\s+['"]react-router(-dom)?['"];?\s*$/.test(l))
    .join("\n");
}

/** Cheap structural check: parens and braces are balanced. Not a parser — a write-time tripwire. */
function isBalanced(s: string): boolean {
  const tally = (open: string, close: string) => (s.split(open).length - 1) === (s.split(close).length - 1);
  return tally("(", ")") && tally("{", "}");
}

/** Insert the adapter + router imports after the last existing import line. */
function injectImports(src: string, routerPackage: RouterPackage): string {
  const imports = [
    'import { AuthRoot } from "./auth/AuthRoot";',
    'import { RequireAuth } from "./auth/RequireAuth";',
    'import { LoginPage } from "./login/LoginPage";',
    'import { CallbackPage } from "./login/CallbackPage";',
    `import { BrowserRouter, Routes, Route } from "${routerPackage}";`,
  ].join("\n");

  const lines = src.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) lastImport = i;
  }
  lines.splice(lastImport + 1, 0, imports);
  return lines.join("\n");
}
