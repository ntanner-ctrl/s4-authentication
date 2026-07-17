import { createTestApp } from './test-app';

describe('createTestApp', () => {
  it('produces a standalone app with config + routes files', async () => {
    const tree = await createTestApp('demo');
    expect(tree.files).toContain('/projects/demo/src/app/app.config.ts');
    expect(tree.files).toContain('/projects/demo/src/app/app.routes.ts');
    const config = tree.readContent('/projects/demo/src/app/app.config.ts');
    expect(config).toContain('provideRouter');
  });
});

import { createNgModuleApp, createRootLayoutNgModuleApp } from './test-app';

describe('createNgModuleApp', () => {
  it('produces an NgModule app with module + routing-module files', async () => {
    const tree = await createNgModuleApp('demo');
    expect(tree.files).toContain('/projects/demo/src/app/app.module.ts');
    expect(tree.files).toContain('/projects/demo/src/app/app-routing.module.ts');
    expect(tree.files).not.toContain('/projects/demo/src/app/app.config.ts');
  });

  it('produces a root-layout NgModule app at /src/app', async () => {
    const tree = await createRootLayoutNgModuleApp('app');
    expect(tree.files).toContain('/src/app/app.module.ts');
    expect(tree.files).toContain('/src/app/app-routing.module.ts');
  });
});
