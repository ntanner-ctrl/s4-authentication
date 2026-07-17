"use strict";
// Resolve install config from CLI flags (the non-interactive path). Whatever the flags don't
// supply for the four REQUIRED Cognito values is reported in `missingCognito` so the command
// layer can prompt for exactly those (or error under --yes). Pure: no prompting here.
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFromFlags = exports.COGNITO_FIELDS = void 0;
/** Single source of truth for the four required Cognito values (flag parsing + prompts). */
exports.COGNITO_FIELDS = [
    { flag: "user-pool-id", key: "userPoolId", label: "Cognito User Pool ID (CFN Output: UserPoolId)" },
    { flag: "client-id", key: "clientId", label: "Cognito app client ID (CFN Output: UserPoolClientId)" },
    { flag: "cognito-domain", key: "cognitoDomain", label: "Cognito hosted domain, no scheme (CFN Output: CognitoDomain)" },
    { flag: "region", key: "region", label: "AWS region (e.g. us-east-1)" },
];
function resolveFromFlags(flags) {
    const cognito = {};
    const missingCognito = [];
    for (const { flag, key } of exports.COGNITO_FIELDS) {
        const value = flags[flag]?.trim();
        if (value) {
            cognito[key] = value;
        }
        else {
            missingCognito.push(flag);
        }
    }
    const patch = {};
    const providers = flags["providers"]?.trim();
    if (providers) {
        patch.providers = providers.split(",").map((s) => s.trim()).filter(Boolean);
    }
    const appTitle = flags["app-title"]?.trim();
    if (appTitle) {
        patch.appTitle = appTitle;
    }
    const postLoginRoute = flags["post-login-route"]?.trim();
    if (postLoginRoute) {
        patch.postLoginRoute = postLoginRoute;
    }
    return { cognito, patch, missingCognito };
}
exports.resolveFromFlags = resolveFromFlags;
//# sourceMappingURL=config.js.map