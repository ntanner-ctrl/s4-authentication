import { Tree } from '@angular-devkit/schematics';
import { addAuthRoutes } from './add-routes';

const ctx = () => ({ logger: { warn: () => {} } } as any);

function treeWith(path: string, content: string): Tree {
  const tree = Tree.empty();
  tree.create(path, content);
  return tree;
}

const ROUTES_CONST = `import { Routes } from '@angular/router';\nexport const routes: Routes = [\n  { path: 'home', component: HomeComponent },\n];\n`;
const NGMODULE_ROUTING = `import { NgModule } from '@angular/core';\nimport { RouterModule, Routes } from '@angular/router';\nconst routes: Routes = [];\n@NgModule({ imports: [RouterModule.forRoot(routes)], exports: [RouterModule] })\nexport class AppRoutingModule {}\n`;

describe('addAuthRoutes', () => {
  it('inserts the two routes into a standalone app.routes.ts', () => {
    const tree = treeWith('/src/app/app.routes.ts', ROUTES_CONST);
    const out = addAuthRoutes('/src/app/app.routes.ts')(tree, ctx()) as Tree;
    const text = out.read('/src/app/app.routes.ts')!.toString('utf-8');
    expect(text).toContain("path: 'login'");
    expect(text).toContain("path: 'auth/callback'");
    expect(text).toContain("import('./login/login.component')");
  });

  it('inserts the two routes into an NgModule app-routing.module.ts', () => {
    const tree = treeWith('/src/app/app-routing.module.ts', NGMODULE_ROUTING);
    const out = addAuthRoutes('/src/app/app-routing.module.ts')(tree, ctx()) as Tree;
    const text = out.read('/src/app/app-routing.module.ts')!.toString('utf-8');
    expect(text).toContain("path: 'login'");
    expect(text).toContain("path: 'auth/callback'");
  });

  it('is idempotent — a second pass adds no duplicate', () => {
    const tree = treeWith('/src/app/app-routing.module.ts', NGMODULE_ROUTING);
    const once = addAuthRoutes('/src/app/app-routing.module.ts')(tree, ctx()) as Tree;
    const twice = addAuthRoutes('/src/app/app-routing.module.ts')(once, ctx()) as Tree;
    const text = twice.read('/src/app/app-routing.module.ts')!.toString('utf-8');
    expect(text.split("path: 'auth/callback'").length - 1).toBe(1);
  });

  it('warns and leaves the tree unchanged when the routing file has no routes array', () => {
    const tree = treeWith('/src/app/app-routing.module.ts', 'export const notRoutes = [];\n');
    let warned = '';
    const context = { logger: { warn: (m: string) => { warned = m; } } } as any;
    const out = addAuthRoutes('/src/app/app-routing.module.ts')(tree, context) as Tree;
    expect(out.read('/src/app/app-routing.module.ts')!.toString('utf-8')).toBe('export const notRoutes = [];\n');
    expect(warned).toMatch(/array literal/i);
  });

  it('warns and leaves the tree unchanged when no routing file exists (no throw)', () => {
    const tree = Tree.empty();
    let warned = '';
    const context = { logger: { warn: (m: string) => { warned = m; } } } as any;
    expect(() => addAuthRoutes(undefined)(tree, context)).not.toThrow();
    expect(warned).toMatch(/app\.routes\.ts|app-routing\.module\.ts/);
  });
});
