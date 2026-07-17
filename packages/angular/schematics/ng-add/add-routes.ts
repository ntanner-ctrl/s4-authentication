import { Rule, Tree, SchematicContext } from '@angular-devkit/schematics';
import * as ts from 'typescript';

const ROUTE_SNIPPET = `
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  { path: 'auth/callback', loadComponent: () => import('./login/callback.component').then((m) => m.CallbackComponent) },
`;

/**
 * Insert the login + auth/callback routes at the head of the exported `routes`
 * array. Works for BOTH standalone (app.routes.ts) and NgModule
 * (app-routing.module.ts) routing files — the scaffolded login/callback
 * components are `standalone: true`, so `loadComponent` resolves them either way.
 *
 * The CALLER resolves which file exists and passes it (Task 3). Graceful by
 * design: a missing file or a file with no `routes` array literal produces a
 * warning and an UNCHANGED tree — never a throw, so the surrounding scaffold is
 * not rolled back. Idempotent: a tree already containing an 'auth/callback'
 * route is left unchanged.
 */
export function addAuthRoutes(routesPath: string | undefined): Rule {
  return (tree: Tree, context: SchematicContext) => {
    if (!routesPath || !tree.exists(routesPath)) {
      context.logger.warn(
        `s4-auth-angular: no app.routes.ts or app-routing.module.ts found to wire ` +
        `routes into. Scaffolding completed; add the 'login' and 'auth/callback' ` +
        `routes to your router manually (see the scaffolded login/ components).`,
      );
      return tree;
    }

    const text = tree.read(routesPath)!.toString('utf-8');
    // Single-quote form only (CLI/Prettier default); a user-written double-quoted
    // 'auth/callback' route is an accepted gap — worst case is a duplicate route.
    if (text.includes("path: 'auth/callback'")) {
      return tree; // already wired
    }

    const source = ts.createSourceFile(routesPath, text, ts.ScriptTarget.Latest, true);

    let routesArray: ts.ArrayLiteralExpression | undefined;
    const visit = (node: ts.Node): void => {
      if (
        !routesArray &&
        ts.isVariableDeclaration(node) &&
        node.name.getText(source) === 'routes' &&
        node.initializer &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        routesArray = node.initializer;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    if (!routesArray) {
      context.logger.warn(
        `s4-auth-angular: found ${routesPath} but no \`routes\` array literal to ` +
        `insert into. Add the 'login' and 'auth/callback' routes manually.`,
      );
      return tree;
    }

    const insertPos = routesArray.getStart(source) + 1; // just after `[`
    const recorder = tree.beginUpdate(routesPath);
    recorder.insertLeft(insertPos, ROUTE_SNIPPET);
    tree.commitUpdate(recorder);
    return tree;
  };
}
