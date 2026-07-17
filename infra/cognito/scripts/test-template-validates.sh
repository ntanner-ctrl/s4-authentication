#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/../template.yaml"

# 1. The new Output must exist.
grep -q 'AuthConfigBlock:' "$TEMPLATE" \
  || { echo "FAIL: AuthConfigBlock output missing"; exit 1; }

# 2. It must reference all three pool values by their intrinsic refs.
for token in 'CognitoUserPool' 'CognitoUserPoolClient' 'CognitoDomainPrefix'; do
  grep -q "$token" "$TEMPLATE" || { echo "FAIL: $token not referenced in template"; exit 1; }
done

# 3. If the AWS CLI is present, the template must still be valid CloudFormation.
if command -v aws >/dev/null 2>&1; then
  aws cloudformation validate-template --template-body "file://$TEMPLATE" >/dev/null \
    || { echo "FAIL: validate-template rejected the template"; exit 1; }
else
  echo "NOTE: aws CLI absent — skipped validate-template (grep checks passed)"
fi
echo "PASS"
