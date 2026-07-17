# destroy.ps1 — delete a Cognito auth stack. DESTRUCTIVE. Operator-run.
# The user pool itself is ALWAYS retained (template DeletionPolicy: Retain +
# DeletionProtection: ACTIVE). This script only runs delete-stack — it NEVER
# calls delete-user-pool. Pool removal is left to operator judgment (a shared
# pool may back another app client). Use -DisablePoolProtection to turn off the
# pool's deletion protection so you CAN later delete it manually; the script
# still does not delete the pool.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Client,
  [Parameter(Mandatory = $true)][ValidateSet('dev','staging','prod')][string]$Environment,
  [string]$ConfirmName,
  [string]$Region,
  [switch]$DisablePoolProtection
)
$ErrorActionPreference = 'Stop'
$stackName = "$Client-$Environment-auth"

# Uniform confirmation gate (ALL environments): operator must retype the client
# name via -ConfirmName. Checked BEFORE any aws call. dev/staging/prod identical.
if ($ConfirmName -ne $Client) {
  # Non-terminating stderr write + exit 3 (Write-Error would terminate and exit 1 here).
  [Console]::Error.WriteLine("destroy requires -ConfirmName '$Client' (got '$ConfirmName').")
  exit 3
}
$regionArgs = @(); if ($Region) { $regionArgs = @('--region', $Region) }

# Fetch the pool id BEFORE delete-stack so the retained-pool notice can name it.
# Non-fatal: the stack may not exist. Capture empty on failure.
$poolId = ''
try {
  $poolId = aws cloudformation describe-stacks @regionArgs --stack-name $stackName `
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text 2>$null
} catch { $poolId = '' }
if ($poolId -eq 'None' -or $null -eq $poolId) { $poolId = '' }
$poolId = "$poolId".Trim()

if ($DisablePoolProtection) {
  Write-Host "NOTE: -DisablePoolProtection: turning OFF the pool's deletion protection."
  Write-Host "      The pool is still NOT deleted by this script."
  if ($poolId) {
    aws cognito-idp update-user-pool @regionArgs --user-pool-id $poolId --deletion-protection INACTIVE
    Write-Host "Disabled deletion protection on $poolId."
  } else {
    [Console]::Error.WriteLine("WARNING: could not resolve UserPoolId; deletion protection NOT changed.")
  }
}

aws cloudformation delete-stack @regionArgs --stack-name $stackName
Write-Host "Requested deletion of $stackName."

# Always-on retained-pool notice (printed with AND without the flag).
$poolLabel = if ($poolId) { $poolId } else { 'the pool' }
$idArg = if ($poolId) { $poolId } else { '<id>' }
$regionNote = if ($Region) { " --region $Region" } else { '' }
Write-Host ""
Write-Host "================================ RETAINED POOL ================================"
Write-Host "The Cognito user pool ($poolLabel) is RETAINED and still exists"
Write-Host "(template DeletionPolicy: Retain). delete-stack does NOT remove it."
Write-Host ""
Write-Host "This is intentional: pool removal is left to your judgment because another"
Write-Host "app client may depend on this pool. Delete it manually only when you are sure"
Write-Host "nothing else uses it:"
Write-Host ""
if ($DisablePoolProtection) {
  Write-Host "  # deletion protection is already OFF (you passed -DisablePoolProtection)"
  Write-Host "  aws cognito-idp delete-user-pool --user-pool-id $idArg$regionNote"
} else {
  Write-Host "  # only if deletion protection is still ON:"
  Write-Host "  aws cognito-idp update-user-pool --user-pool-id $idArg --deletion-protection INACTIVE$regionNote"
  Write-Host "  aws cognito-idp delete-user-pool --user-pool-id $idArg$regionNote"
}
Write-Host "=============================================================================="
