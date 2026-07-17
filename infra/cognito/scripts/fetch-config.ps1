# fetch-config.ps1 — read-only: pull Cognito stack Outputs into paste-block form.
# Usage: .\fetch-config.ps1 -StackName <name> [-Region <r>] [-Write <auth.config.ts>]
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$StackName,
  [string]$Region,
  [string]$Write
)
$ErrorActionPreference = 'Stop'

$regionArgs = @(); if ($Region) { $regionArgs = @('--region', $Region) }
$json = aws cloudformation describe-stacks @regionArgs `
  --stack-name $StackName --query 'Stacks[0].Outputs' --output json
$outputs = $json | ConvertFrom-Json

function Get-Out([string]$key) {
  ($outputs | Where-Object { $_.OutputKey -eq $key }).OutputValue
}
$up = Get-Out 'UserPoolId'; $cl = Get-Out 'UserPoolClientId'; $dom = Get-Out 'CognitoDomain'
if (-not ($up -and $cl -and $dom)) {
  throw "Stack $StackName missing one of UserPoolId/UserPoolClientId/CognitoDomain"
}

$block = @"
userPoolId: '$up',
clientId: '$cl',
cognitoDomain: '$dom',
"@

if ($Write) {
  if (-not (Test-Path $Write)) { throw "-Write target not found: $Write" }
  $content = Get-Content $Write -Raw
  # VALIDATE FIRST: `-replace` silently no-ops on no match, which would let us
  # report success having changed nothing. Require each of the three value lines
  # to be present up front so a malformed/placeholder-less target throws loudly.
  foreach ($pat in @("userPoolId: '[^']*',", "clientId: '[^']*',", "cognitoDomain: '[^']*',")) {
    if ($content -notmatch $pat) {
      throw "-Write target $Write missing expected line matching: $pat"
    }
  }
  # The `'[^']*',` patterns stop at the closing `',` so any trailing inline comment
  # (e.g. `// CFN Output: UserPoolId`) is preserved.
  $content = $content -replace "userPoolId: '[^']*',",     "userPoolId: '$up',"
  $content = $content -replace "clientId: '[^']*',",       "clientId: '$cl',"
  $content = $content -replace "cognitoDomain: '[^']*',",  "cognitoDomain: '$dom',"
  Set-Content -Path $Write -Value $content -NoNewline
  Write-Host "Wrote pool values into $Write"
} else {
  Write-Output $block
}
