import {
  Rule,
  Tree,
  SchematicContext,
  SchematicsException,
  apply,
  url,
  applyTemplates,
  move,
  chain,
  mergeWith,
} from '@angular-devkit/schematics';
import { strings, normalize } from '@angular-devkit/core';
import { readWorkspace, addRootProvider, addDependency } from '@schematics/angular/utility';
import { Schema } from './schema';
import { addAuthRoutes } from './add-routes';

/** Turn the comma-separated `providers` option into a quoted TS array literal body. */
function toProvidersLiteral(providers: string): string {
  return providers
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `'${p}'`)
    .join(', ');
}

export function ngAdd(options: Schema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    context.logger.info('s4-auth-angular: scaffolding auth files');

    const workspace = await readWorkspace(tree);
    const projectName = options.project || workspace.projects.keys().next().value;
    const project = workspace.projects.get(projectName);
    if (!project) {
      throw new SchematicsException(`Project "${projectName}" not found in workspace.`);
    }

    const providers = options.providers ?? 'google';
    const templateSource = apply(url('./files'), [
      applyTemplates({
        ...strings,
        userPoolId: options.userPoolId,
        clientId: options.clientId,
        cognitoDomain: options.cognitoDomain,
        providersLiteral: toProvidersLiteral(providers),
        appTitle: options.appTitle ?? 'Sign in',
      }),
      // project.root ('projects/demo'), not project.sourceRoot ('projects/demo/src'):
      // the template files already live under 'src/app/…', so moving to sourceRoot
      // would double the segment ('…/src/src/app/…'). The tests assert '/projects/demo/src/app/…'.
      move(normalize(project.root)),
    ]);

    const routesPath = [
      normalize(`${project.root}/src/app/app.routes.ts`),
      normalize(`${project.root}/src/app/app-routing.module.ts`),
    ].find((p) => tree.exists(p));
    return chain([
      // Amplify v6 baseline: the scaffolded files use v6 APIs throughout. ^6.17.0 =
      // the validated baseline (validation/authval-host shipped aws-amplify@6.17.0);
      // the caret stays within 6.x (latest 6.18.0) and blocks an automatic jump to a
      // future 7.0.0 major — the kind of break the v5->v6 rewrite was.
      addDependency('aws-amplify', '^6.17.0'),
      mergeWith(templateSource),
      (hostTree: Tree) => {
        // Standalone wires into app.config.ts; NgModule into app.module.ts.
        // addRootProvider (below) auto-detects which, but is not itself
        // idempotent — guard against a second ng-add by checking both hosts.
        const providerHosts = [
          normalize(`${project.root}/src/app/app.config.ts`),
          normalize(`${project.root}/src/app/app.module.ts`),
        ];
        const alreadyWired = providerHosts.some((p) => {
          const buf = hostTree.read(p);
          return !!buf && buf.toString('utf-8').includes('provideAuth()');
        });
        if (alreadyWired) {
          return hostTree;
        }
        return addRootProvider(projectName!, ({ code, external }) =>
          code`${external('provideAuth', './auth/provide-auth')}()`,
        );
      },
      addAuthRoutes(routesPath),
    ]);
  };
}
