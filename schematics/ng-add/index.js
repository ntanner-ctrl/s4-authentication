"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ngAdd = void 0;
const schematics_1 = require("@angular-devkit/schematics");
const core_1 = require("@angular-devkit/core");
const utility_1 = require("@schematics/angular/utility");
const add_routes_1 = require("./add-routes");
/** Turn the comma-separated `providers` option into a quoted TS array literal body. */
function toProvidersLiteral(providers) {
    return providers
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => `'${p}'`)
        .join(', ');
}
function ngAdd(options) {
    return async (tree, context) => {
        context.logger.info('s4-auth-angular: scaffolding auth files');
        const workspace = await (0, utility_1.readWorkspace)(tree);
        const projectName = options.project || workspace.projects.keys().next().value;
        const project = workspace.projects.get(projectName);
        if (!project) {
            throw new schematics_1.SchematicsException(`Project "${projectName}" not found in workspace.`);
        }
        const providers = options.providers ?? 'google';
        const templateSource = (0, schematics_1.apply)((0, schematics_1.url)('./files'), [
            (0, schematics_1.applyTemplates)({
                ...core_1.strings,
                userPoolId: options.userPoolId,
                clientId: options.clientId,
                cognitoDomain: options.cognitoDomain,
                providersLiteral: toProvidersLiteral(providers),
                appTitle: options.appTitle ?? 'Sign in',
            }),
            // project.root ('projects/demo'), not project.sourceRoot ('projects/demo/src'):
            // the template files already live under 'src/app/…', so moving to sourceRoot
            // would double the segment ('…/src/src/app/…'). The tests assert '/projects/demo/src/app/…'.
            (0, schematics_1.move)((0, core_1.normalize)(project.root)),
        ]);
        const routesPath = [
            (0, core_1.normalize)(`${project.root}/src/app/app.routes.ts`),
            (0, core_1.normalize)(`${project.root}/src/app/app-routing.module.ts`),
        ].find((p) => tree.exists(p));
        return (0, schematics_1.chain)([
            // Amplify v6 baseline: the scaffolded files use v6 APIs throughout. ^6.17.0 =
            // the validated baseline (validation/authval-host shipped aws-amplify@6.17.0);
            // the caret stays within 6.x (latest 6.18.0) and blocks an automatic jump to a
            // future 7.0.0 major — the kind of break the v5->v6 rewrite was.
            (0, utility_1.addDependency)('aws-amplify', '^6.17.0'),
            (0, schematics_1.mergeWith)(templateSource),
            (hostTree) => {
                // Standalone wires into app.config.ts; NgModule into app.module.ts.
                // addRootProvider (below) auto-detects which, but is not itself
                // idempotent — guard against a second ng-add by checking both hosts.
                const providerHosts = [
                    (0, core_1.normalize)(`${project.root}/src/app/app.config.ts`),
                    (0, core_1.normalize)(`${project.root}/src/app/app.module.ts`),
                ];
                const alreadyWired = providerHosts.some((p) => {
                    const buf = hostTree.read(p);
                    return !!buf && buf.toString('utf-8').includes('provideAuth()');
                });
                if (alreadyWired) {
                    return hostTree;
                }
                return (0, utility_1.addRootProvider)(projectName, ({ code, external }) => code `${external('provideAuth', './auth/provide-auth')}()`);
            },
            (0, add_routes_1.addAuthRoutes)(routesPath),
        ]);
    };
}
exports.ngAdd = ngAdd;
//# sourceMappingURL=index.js.map