# export-main.ps1 — regenerate the orphan `main` package branch.
# Thin wrapper: delegates to export-main.sh (single source of git logic).
#
# Layout produced:
#   shared root: README.md, STANDARD.md, infra/cognito/
#   angular/:    package.json, schematics/, README.md   (staged by packages/angular/scripts/export.sh)
#   react/:      README.md, src/                        (staged by packages/react/scripts/export.sh)
#
# Usage: export-main.ps1 [-Version X.Y.Z]
#
# SAFETY INVARIANT: the only mutation to a real ref is `git branch -f main` inside export-main.sh.
[CmdletBinding()]
param([string]$Version)
$ErrorActionPreference = 'Stop'
$sh = Join-Path $PSScriptRoot 'export-main.sh'
$argv = @($sh)
if ($Version) { $argv += @('--version', $Version) }

# Prefer a native bash (WSL/Git-Bash) if present; fall back to `wsl bash`.
$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($bash) {
  & $bash.Source @argv
} else {
  & wsl bash @argv
}
