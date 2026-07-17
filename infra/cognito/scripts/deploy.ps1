# deploy.ps1 — deploy the Cognito auth stack. Operator-run, credentialed.
# Secrets read from environment: $env:GOOGLE_CLIENT_SECRET / $env:AZURE_CLIENT_SECRET.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Client,
  [Parameter(Mandatory = $true)][ValidateSet('dev','staging','prod')][string]$Environment,
  [Parameter(Mandatory = $true)][string]$CallbackDomain,
  [Parameter(Mandatory = $true)][string]$DomainPrefix,
  [Parameter(Mandatory = $true)][string]$Owner,
  [string]$GoogleClientId,
  [string]$AzureClientId,
  [string]$AzureTenantId,
  [string]$Region,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$template = Join-Path $PSScriptRoot '..\template.yaml'

$hasGoogle = [bool]($GoogleClientId -and $env:GOOGLE_CLIENT_SECRET)
$hasAzure  = [bool]($AzureClientId -and $AzureTenantId -and $env:AZURE_CLIENT_SECRET)
if (-not ($hasGoogle -or $hasAzure)) {
  # Write to stderr directly (not Write-Error): with $ErrorActionPreference='Stop'
  # Write-Error throws a terminating error and the script exits 1 before reaching
  # our 'exit 2', which must mirror deploy.sh's exit code for the all-empty-IdP case.
  [Console]::Error.WriteLine("ERROR: at least one federated IdP must be fully configured (Google: -GoogleClientId + `$env:GOOGLE_CLIENT_SECRET; Azure: -AzureClientId + -AzureTenantId + `$env:AZURE_CLIENT_SECRET).")
  exit 2
}

$stackName = "$Client-$Environment-auth"
$params = @(
  "Client=$Client", "Environment=$Environment", "CallbackDomain=$CallbackDomain",
  "CognitoDomainPrefix=$DomainPrefix", "OwnerTag=$Owner",
  "GoogleClientId=$GoogleClientId", "GoogleClientSecret=$($env:GOOGLE_CLIENT_SECRET)",
  "AzureClientId=$AzureClientId", "AzureTenantId=$AzureTenantId",
  "AzureClientSecret=$($env:AZURE_CLIENT_SECRET)"
)
$regionArgs = @(); if ($Region) { $regionArgs = @('--region', $Region) }

if ($DryRun) {
  Write-Host "[dry-run] would deploy stack '$stackName' from $template"
  Write-Host "[dry-run] IdPs: google=$hasGoogle azure=$hasAzure"
  exit 0
}

aws cloudformation deploy @regionArgs `
  --template-file $template --stack-name $stackName `
  --parameter-overrides $params --capabilities CAPABILITY_NAMED_IAM
Write-Host "Deployed $stackName. Fetch config with: .\fetch-config.ps1 -StackName $stackName"
