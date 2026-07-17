#!/usr/bin/env bash
# destroy.sh — delete a Cognito auth stack. DESTRUCTIVE. Operator-run.
# The user pool itself is ALWAYS retained (template DeletionPolicy: Retain +
# DeletionProtection: ACTIVE). This script only runs delete-stack — it NEVER
# calls delete-user-pool. Pool removal is left to operator judgment (a shared
# pool may back another app client). Use --disable-pool-protection to turn off
# the pool's deletion protection so you CAN later delete it manually; the script
# still does not delete the pool.
set -euo pipefail

CLIENT="" ENVIRONMENT="" CONFIRM_NAME="" REGION="" DISABLE_POOL_PROTECTION=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --client)                  CLIENT="${2:?--client requires a value}"; shift 2 ;;
    --environment)             ENVIRONMENT="${2:?--environment requires a value}"; shift 2 ;;
    --confirm-name)            CONFIRM_NAME="${2:?--confirm-name requires a value}"; shift 2 ;;
    --region)                  REGION="${2:?--region requires a value}"; shift 2 ;;
    --disable-pool-protection) DISABLE_POOL_PROTECTION=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done
for req in CLIENT ENVIRONMENT; do
  [[ -n "${!req}" ]] || { echo "ERROR: --${req,,} is required" >&2; exit 2; }
done
# Validate environment (parity with destroy.ps1 ValidateSet). A typo like 'prdo'
# would otherwise silently bypass the confirm gate against a malformed stack name.
[[ "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]] \
  || { echo "ERROR: --environment must be dev, staging, or prod (got '$ENVIRONMENT')" >&2; exit 2; }

STACK_NAME="${CLIENT}-${ENVIRONMENT}-auth"

# Uniform confirmation gate (ALL environments): operator must retype the client
# name via --confirm-name. Checked BEFORE any aws call so a mismatch never
# touches AWS. dev/staging/prod all behave identically here.
if [[ "$CONFIRM_NAME" != "$CLIENT" ]]; then
  echo "ERROR: destroy requires --confirm-name '$CLIENT' (got '${CONFIRM_NAME:-}')." >&2
  exit 3
fi

REGION_ARG=(); [[ -n "$REGION" ]] && REGION_ARG=(--region "$REGION")

# Fetch the pool id BEFORE delete-stack so the retained-pool notice can name it.
# Non-fatal: the stack may not exist. Capture empty on failure (|| true keeps
# set -e from aborting here).
POOL_ID="$(aws cloudformation describe-stacks "${REGION_ARG[@]}" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text 2>/dev/null || true)"
[[ "$POOL_ID" == "None" ]] && POOL_ID=""

if [[ $DISABLE_POOL_PROTECTION -eq 1 ]]; then
  echo "NOTE: --disable-pool-protection: turning OFF the pool's deletion protection."
  echo "      The pool is still NOT deleted by this script."
  if [[ -n "$POOL_ID" ]]; then
    aws cognito-idp update-user-pool "${REGION_ARG[@]}" \
      --user-pool-id "$POOL_ID" --deletion-protection INACTIVE
    echo "Disabled deletion protection on $POOL_ID."
  else
    echo "WARNING: could not resolve UserPoolId; deletion protection NOT changed." >&2
  fi
fi

aws cloudformation delete-stack "${REGION_ARG[@]}" --stack-name "$STACK_NAME"
echo "Requested deletion of $STACK_NAME."

# Always-on retained-pool notice (printed with AND without the flag).
pool_label="${POOL_ID:-the pool}"
region_note=""; [[ -n "$REGION" ]] && region_note=" --region $REGION"
echo ""
echo "================================ RETAINED POOL ================================"
echo "The Cognito user pool ($pool_label) is RETAINED and still exists"
echo "(template DeletionPolicy: Retain). delete-stack does NOT remove it."
echo ""
echo "This is intentional: pool removal is left to your judgment because another"
echo "app client may depend on this pool. Delete it manually only when you are sure"
echo "nothing else uses it:"
echo ""
if [[ $DISABLE_POOL_PROTECTION -eq 1 ]]; then
  echo "  # deletion protection is already OFF (you passed --disable-pool-protection)"
  echo "  aws cognito-idp delete-user-pool --user-pool-id ${POOL_ID:-<id>}${region_note}"
else
  echo "  # only if deletion protection is still ON:"
  echo "  aws cognito-idp update-user-pool --user-pool-id ${POOL_ID:-<id>} --deletion-protection INACTIVE${region_note}"
  echo "  aws cognito-idp delete-user-pool --user-pool-id ${POOL_ID:-<id>}${region_note}"
fi
echo "=============================================================================="
