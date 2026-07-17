import { readFileSync } from "node:fs";

/**
 * Resolve the CLI's published version from a package.json at `packageJsonPath`.
 *
 * The version is read at runtime (not baked into the bundle) so it always reflects the manifest
 * shipped beside the built CLI. The release orchestrator stamps `package.json` AFTER the build
 * (scripts/export-main.sh), so a build-time bake would capture the un-stamped source version — a
 * runtime read of the sibling manifest is the only thing that reflects the actual tag.
 */
export function resolveVersion(packageJsonPath: string): string {
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`no usable "version" field in ${packageJsonPath}`);
  }
  return parsed.version;
}
