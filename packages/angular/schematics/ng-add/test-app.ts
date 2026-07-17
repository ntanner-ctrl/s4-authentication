import * as path from 'path';
import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';

// Node 22's ESM exports map prevents resolving .json files via package
// specifiers directly.  Resolve collection.json relative to the package root
// (package.json is always resolvable) instead.
const ngCollectionPath = path.join(
  path.dirname(require.resolve('@schematics/angular/package.json')),
  'collection.json',
);

/** Angular version requested from the workspace schematic; bump in one place. */
const NG_VERSION = '17.0.0';

/**
 * Builds a real standalone Angular 17 workspace tree (one app, `demo`, with
 * routing) using @schematics/angular's own workspace+application schematics.
 * The returned tree has src/app/app.config.ts and src/app/app.routes.ts — the
 * targets the ng-add wiring modifies.
 */
export async function createTestApp(projectName = 'demo'): Promise<UnitTestTree> {
  const ngRunner = new SchematicTestRunner(
    '@schematics/angular',
    ngCollectionPath,
  );

  let tree = await ngRunner.runSchematic(
    'workspace',
    { name: 'workspace', newProjectRoot: 'projects', version: NG_VERSION },
    Tree.empty(),
  );

  tree = await ngRunner.runSchematic(
    'application',
    { name: projectName, standalone: true, routing: true, style: 'css' },
    tree,
  );

  return tree;
}

/**
 * Builds a real single-app (default-layout) Angular 17 workspace tree where the
 * app lives at the repo root: project.root === '' and source at /src/app. This is
 * the layout real fleet repos use (vs the multi-project projects/<name> layout of
 * createTestApp).
 */
export async function createRootLayoutApp(projectName = 'app'): Promise<UnitTestTree> {
  const ngRunner = new SchematicTestRunner('@schematics/angular', ngCollectionPath);
  let tree = await ngRunner.runSchematic(
    'workspace',
    { name: 'workspace', version: NG_VERSION },
    Tree.empty(),
  );
  tree = await ngRunner.runSchematic(
    'application',
    // projectRoot: '' places the app at the repo root (project.root === '')
    { name: projectName, standalone: true, routing: true, style: 'css', projectRoot: '' },
    tree,
  );
  return tree;
}

/**
 * Builds a real Angular 17 NgModule workspace tree (one app, `demo`, with
 * routing). `standalone: false` makes @schematics/angular emit app.module.ts +
 * app-routing.module.ts (with `const routes: Routes = []`) + a bootstrapModule
 * main.ts — the NgModule targets the ng-add wiring modifies.
 */
export async function createNgModuleApp(projectName = 'demo'): Promise<UnitTestTree> {
  const ngRunner = new SchematicTestRunner('@schematics/angular', ngCollectionPath);
  let tree = await ngRunner.runSchematic(
    'workspace',
    { name: 'workspace', newProjectRoot: 'projects', version: NG_VERSION },
    Tree.empty(),
  );
  tree = await ngRunner.runSchematic(
    'application',
    { name: projectName, standalone: false, routing: true, style: 'css' },
    tree,
  );
  return tree;
}

/** Root-layout (project.root === '') NgModule variant — app at /src/app. */
export async function createRootLayoutNgModuleApp(projectName = 'app'): Promise<UnitTestTree> {
  const ngRunner = new SchematicTestRunner('@schematics/angular', ngCollectionPath);
  let tree = await ngRunner.runSchematic(
    'workspace',
    { name: 'workspace', version: NG_VERSION },
    Tree.empty(),
  );
  tree = await ngRunner.runSchematic(
    'application',
    { name: projectName, standalone: false, routing: true, style: 'css', projectRoot: '' },
    tree,
  );
  return tree;
}
