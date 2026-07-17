"use strict";
// Tiny hand-rolled flag parser. We only accept a known, fixed set of flags, so a dependency
// (yargs/commander) would be more weight than the handful of options here justify.
//
// Supported forms:
//   --flag value
//   --flag=value
//   --bool            (boolean flag, no value)
//   positional        (first non-flag arg = the target directory)
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = void 0;
/** Boolean flags take no value; everything else expects one. */
const BOOLEAN_FLAGS = new Set(["help", "version", "yes", "force"]);
function parseArgs(argv) {
    const flags = {};
    let target;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            flags.help = "true";
            continue;
        }
        if (arg === "-v" || arg === "--version") {
            flags.version = "true";
            continue;
        }
        if (arg.startsWith("--")) {
            const body = arg.slice(2);
            const eq = body.indexOf("=");
            if (eq !== -1) {
                // --flag=value
                flags[body.slice(0, eq)] = body.slice(eq + 1);
                continue;
            }
            const name = body;
            if (BOOLEAN_FLAGS.has(name)) {
                flags[name] = "true";
                continue;
            }
            // --flag value: consume the next token if it isn't itself a flag.
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith("-")) {
                flags[name] = next;
                i++;
            }
            else {
                // Missing value — record empty; the command layer validates required flags (WU4).
                flags[name] = "";
            }
            continue;
        }
        // First non-flag token is the target directory.
        if (target === undefined) {
            target = arg;
        }
    }
    return {
        target,
        flags,
        help: flags.help === "true",
        version: flags.version === "true",
    };
}
exports.parseArgs = parseArgs;
//# sourceMappingURL=args.js.map