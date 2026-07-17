#!/usr/bin/env node
"use strict";
// Entry point for `npx @s4/auth-react`. Parses args, handles --help/--version, resolves the
// target directory, and dispatches to the auto-detecting command (see commands.ts).
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = require("node:path");
const args_1 = require("./args");
const help_1 = require("./help");
const commands_1 = require("./commands");
const version_1 = require("./version");
// Read from the package.json shipped one level above the built bin (dist/bin.js -> ../package.json).
// The flat-root distribution layout guarantees the manifest sits there, and the release orchestrator
// stamps its version at publish time — so `--version` always reflects the actual tag, never a literal.
const PACKAGE_JSON = (0, node_path_1.join)(__dirname, "..", "package.json");
async function main() {
    const parsed = (0, args_1.parseArgs)(process.argv.slice(2));
    if (parsed.help) {
        process.stdout.write(help_1.HELP_TEXT);
        return 0;
    }
    if (parsed.version) {
        process.stdout.write(`${(0, version_1.resolveVersion)(PACKAGE_JSON)}\n`);
        return 0;
    }
    const targetDir = (0, node_path_1.resolve)(process.cwd(), parsed.target ?? ".");
    return (0, commands_1.run)({ targetDir, args: parsed });
}
main()
    .then((code) => process.exit(code))
    .catch((err) => {
    process.stderr.write(`s4-auth-react: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=bin.js.map