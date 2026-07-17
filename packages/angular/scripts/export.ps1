# export.ps1 — stage the Angular package payload into $Target.
# Thin wrapper: delegates to export.sh (single source of staging logic).
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Target
)
$ErrorActionPreference = 'Stop'
$sh = Join-Path $PSScriptRoot 'export.sh'

# Prefer a native bash (WSL/Git-Bash) if present; fall back to `wsl bash`.
$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($bash) {
  & $bash.Source $sh $Target
} else {
  & wsl bash $sh $Target
}
