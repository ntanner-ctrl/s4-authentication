#!/usr/bin/env bash
# deploy.sh — deploy the Cognito auth stack. Operator-run, credentialed.
# Secrets (Google/Azure client secrets) are read from the environment at deploy
# time, never passed as literals (STANDARD.md secret hygiene):
#   export GOOGLE_CLIENT_SECRET=... ; export AZURE_CLIENT_SECRET=...
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/../template.yaml"

CLIENT="" ENVIRONMENT="" CALLBACK_DOMAIN="" DOMAIN_PREFIX="" OWNER=""
GOOGLE_CLIENT_ID="" AZURE_CLIENT_ID="" AZURE_TENANT_ID=""
REGION="" DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --client)          CLIENT="${2:?--client requires a value}"; shift 2 ;;
    --environment)     ENVIRONMENT="${2:?--environment requires a value}"; shift 2 ;;
    --callback-domain) CALLBACK_DOMAIN="${2:?--callback-domain requires a value}"; shift 2 ;;
    --domain-prefix)   DOMAIN_PREFIX="${2:?--domain-prefix requires a value}"; shift 2 ;;
    --owner)           OWNER="${2:?--owner requires a value}"; shift 2 ;;
    --google-client-id) GOOGLE_CLIENT_ID="${2:?--google-client-id requires a value}"; shift 2 ;;
    --azure-client-id) AZURE_CLIENT_ID="${2:?--azure-client-id requires a value}"; shift 2 ;;
    --azure-tenant-id) AZURE_TENANT_ID="${2:?--azure-tenant-id requires a value}"; shift 2 ;;
    --region)          REGION="${2:?--region requires a value}"; shift 2 ;;
    --dry-run)         DRY_RUN=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

for req in CLIENT ENVIRONMENT CALLBACK_DOMAIN DOMAIN_PREFIX OWNER; do
  [[ -n "${!req}" ]] || { echo "ERROR: --${req,,} is required" >&2; exit 2; }
done

# All-or-nothing IdP validation (mirrors template Rules AtLeastOneFederatedIdP):
HAS_GOOGLE=0; HAS_AZURE=0
[[ -n "$GOOGLE_CLIENT_ID" && -n "${GOOGLE_CLIENT_SECRET:-}" ]] && HAS_GOOGLE=1
[[ -n "$AZURE_CLIENT_ID" && -n "$AZURE_TENANT_ID" && -n "${AZURE_CLIENT_SECRET:-}" ]] && HAS_AZURE=1
if [[ $HAS_GOOGLE -eq 0 && $HAS_AZURE -eq 0 ]]; then
  echo "ERROR: at least one federated IdP must be fully configured." >&2
  echo "  Google: --google-client-id + GOOGLE_CLIENT_SECRET (env)" >&2
  echo "  Azure:  --azure-client-id + --azure-tenant-id + AZURE_CLIENT_SECRET (env)" >&2
  exit 2
fi

STACK_NAME="${CLIENT}-${ENVIRONMENT}-auth"
PARAMS=(
  "Client=$CLIENT" "Environment=$ENVIRONMENT" "CallbackDomain=$CALLBACK_DOMAIN"
  "CognitoDomainPrefix=$DOMAIN_PREFIX" "OwnerTag=$OWNER"
  "GoogleClientId=$GOOGLE_CLIENT_ID" "GoogleClientSecret=${GOOGLE_CLIENT_SECRET:-}"
  "AzureClientId=$AZURE_CLIENT_ID" "AzureTenantId=$AZURE_TENANT_ID"
  "AzureClientSecret=${AZURE_CLIENT_SECRET:-}"
)
REGION_ARG=(); [[ -n "$REGION" ]] && REGION_ARG=(--region "$REGION")

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] would deploy stack '$STACK_NAME' from $TEMPLATE"
  echo "[dry-run] IdPs: google=$HAS_GOOGLE azure=$HAS_AZURE"
  exit 0
fi

aws cloudformation deploy "${REGION_ARG[@]}" \
  --template-file "$TEMPLATE" \
  --stack-name "$STACK_NAME" \
  --parameter-overrides "${PARAMS[@]}" \
  --capabilities CAPABILITY_NAMED_IAM
echo "Deployed $STACK_NAME. Fetch config with: fetch-config.sh --stack-name $STACK_NAME"
