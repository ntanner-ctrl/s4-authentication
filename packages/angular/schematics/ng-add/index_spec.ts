import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import * as path from 'path';
import { createTestApp, createRootLayoutApp } from './test-app';

const collectionPath = path.join(__dirname, '..', 'collection.json');

const OPTIONS = {
  project: 'demo',
  userPoolId: 'us-east-1_ABC123',
  clientId: 'abcdef1234567890',
  cognitoDomain: 'auth.example.com',
  providers: 'google,microsoft',
  appTitle: 'Reports Login',
};

const APP = '/projects/demo/src/app';

describe('ng-add', () => {
  const runner = new SchematicTestRunner('s4-auth-angular', collectionPath);

  async function run(): Promise<UnitTestTree> {
    const app = await createTestApp('demo');
    return runner.runSchematic('ng-add', OPTIONS, app);
  }

  it('scaffolds the adapter source files into the project', async () => {
    const tree = await run();
    expect(tree.files).toContain(`${APP}/auth.config.ts`);
    expect(tree.files).toContain(`${APP}/auth/auth.service.ts`);
    expect(tree.files).toContain(`${APP}/auth/auth.guard.ts`);
    expect(tree.files).toContain(`${APP}/auth/role.guard.ts`);
    expect(tree.files).toContain(`${APP}/auth/provide-auth.ts`);
    expect(tree.files).toContain(`${APP}/login/login.component.ts`);
    expect(tree.files).toContain(`${APP}/login/callback.component.ts`);
  });

  it('fills the supplied config values into auth.config.ts', async () => {
    const tree = await run();
    const config = tree.readContent(`${APP}/auth.config.ts`);
    expect(config).toContain("userPoolId: 'us-east-1_ABC123'");
    expect(config).toContain("clientId: 'abcdef1234567890'");
    expect(config).toContain("cognitoDomain: 'auth.example.com'");
    expect(config).toContain("providers: ['google', 'microsoft']");
    expect(config).toContain("appTitle: 'Reports Login'");
    expect(config).not.toContain('__USER_POOL_ID__');
    expect(config).not.toContain('<%=');
  });

  it('wires provideAuth() into the app config', async () => {
    const tree = await run();
    const config = tree.readContent('/projects/demo/src/app/app.config.ts');
    expect(config).toContain('provideAuth()');
    expect(config).toMatch(/import\s*\{\s*provideAuth\s*\}\s*from\s*'\.\/auth\/provide-auth'/);
  });

  it('inserts the login and auth/callback routes', async () => {
    const tree = await run();
    const routes = tree.readContent('/projects/demo/src/app/app.routes.ts');
    expect(routes).toContain("path: 'login'");
    expect(routes).toContain("path: 'auth/callback'");
    expect(routes).toContain("import('./login/login.component')");
    expect(routes).toContain("import('./login/callback.component')");
  });

  it('wires a root-layout (single-app) project end-to-end', async () => {
    const app = await createRootLayoutApp('app');
    const tree = await runner.runSchematic(
      'ng-add',
      { ...OPTIONS, project: 'app' },
      app,
    );
    expect(tree.files).toContain('/src/app/auth.config.ts');
    expect(tree.files).toContain('/src/app/auth/auth.service.ts');
    expect(tree.files).toContain('/src/app/auth/auth.guard.ts');
    expect(tree.files).toContain('/src/app/auth/role.guard.ts');
    expect(tree.files).toContain('/src/app/auth/provide-auth.ts');
    expect(tree.files).toContain('/src/app/login/login.component.ts');
    expect(tree.files).toContain('/src/app/login/callback.component.ts');
    expect(tree.readContent('/src/app/app.config.ts')).toContain('provideAuth()');
    const routes = tree.readContent('/src/app/app.routes.ts');
    expect(routes).toContain("path: 'login'");
    expect(routes).toContain("path: 'auth/callback'");
  });

  it('wires a root-layout NgModule project end-to-end', async () => {
    const { createRootLayoutNgModuleApp } = await import('./test-app');
    const app = await createRootLayoutNgModuleApp('app');
    const tree = await runner.runSchematic('ng-add', { ...OPTIONS, project: 'app' }, app);
    expect(tree.files).toContain('/src/app/auth.config.ts');
    expect(tree.files).toContain('/src/app/login/login.component.ts');
    expect(tree.files).not.toContain('/src/app/app.config.ts');
    const mod = tree.readContent('/src/app/app.module.ts');
    expect(mod).toContain('provideAuth()');
    const routes = tree.readContent('/src/app/app-routing.module.ts');
    expect(routes).toContain("path: 'login'");
    expect(routes).toContain("path: 'auth/callback'");
  });

  it('adds the aws-amplify runtime dependency', async () => {
    const tree = await run();
    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.dependencies['aws-amplify']).toBeDefined();
    expect(pkg.dependencies['aws-amplify']).toMatch(/^\^?6\./);
  });

  it('is idempotent across a second ng-add run', async () => {
    const app = await createTestApp('demo');
    const once = await runner.runSchematic('ng-add', OPTIONS, app);
    const twice = await runner.runSchematic('ng-add', OPTIONS, once);

    const routes = twice.readContent('/projects/demo/src/app/app.routes.ts');
    const callbackCount = routes.split("path: 'auth/callback'").length - 1;
    expect(callbackCount).toBe(1);

    const config = twice.readContent('/projects/demo/src/app/app.config.ts');
    const provideCount = config.split('provideAuth()').length - 1;
    expect(provideCount).toBe(1);
  });

  it('wires an NgModule app end-to-end (files, AppModule provider, routing-module routes)', async () => {
    const { createNgModuleApp } = await import('./test-app');
    const app = await createNgModuleApp('demo');
    const tree = await runner.runSchematic('ng-add', OPTIONS, app);

    // Files scaffold to the same src/app locations.
    expect(tree.files).toContain(`${APP}/auth.config.ts`);
    expect(tree.files).toContain(`${APP}/auth/provide-auth.ts`);
    expect(tree.files).toContain(`${APP}/login/login.component.ts`);

    // provideAuth() lands in AppModule (NOT app.config.ts, which does not exist).
    expect(tree.files).not.toContain(`${APP}/app.config.ts`);
    const mod = tree.readContent(`${APP}/app.module.ts`);
    expect(mod).toContain('provideAuth()');
    expect(mod).toMatch(/import\s*\{\s*provideAuth\s*\}\s*from\s*'\.\/auth\/provide-auth'/);

    // Routes land in app-routing.module.ts.
    const routes = tree.readContent(`${APP}/app-routing.module.ts`);
    expect(routes).toContain("path: 'login'");
    expect(routes).toContain("path: 'auth/callback'");
  });

  it('is idempotent on a second NgModule ng-add run', async () => {
    const { createNgModuleApp } = await import('./test-app');
    const app = await createNgModuleApp('demo');
    const once = await runner.runSchematic('ng-add', OPTIONS, app);
    const twice = await runner.runSchematic('ng-add', OPTIONS, once);
    const mod = twice.readContent(`${APP}/app.module.ts`);
    expect(mod.split('provideAuth()').length - 1).toBe(1);
    const routes = twice.readContent(`${APP}/app-routing.module.ts`);
    expect(routes.split("path: 'auth/callback'").length - 1).toBe(1);
  });
});
