#!/usr/bin/env node
// Entry point for `npx @s4/auth-react`. Parses args, handles --help/--version, resolves the
// target directory, and dispatches to the auto-detecting command (see commands.ts).

import { join, resolve } from "node:path";
import { parseArgs } from "./args";
import { HELP_TEXT } from "./help";
import { run } from "./commands";
import { resolveVersion } from "./version";

// Read from the package.json shipped one level above the built bin (dist/bin.js -> ../package.json).
// The flat-root distribution layout guarantees the manifest sits there, and the release orchestrator
// stamps its version at publish time — so `--version` always reflects the actual tag, never a literal.
const PACKAGE_JSON = join(__dirname, "..", "package.json");

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (parsed.version) {
    process.stdout.write(`${resolveVersion(PACKAGE_JSON)}\n`);
    return 0;
  }

  const targetDir = resolve(process.cwd(), parsed.target ?? ".");
  return run({ targetDir, args: parsed });
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`s4-auth-react: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
