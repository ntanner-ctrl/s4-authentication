#!/usr/bin/env bash
# fetch-config.sh — read-only: pull Cognito stack Outputs into paste-block form.
# Usage: fetch-config.sh --stack-name <name> [--region <r>] [--write <auth.config.ts>]
set -euo pipefail

STACK="" REGION="" WRITE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stack-name) STACK="${2:?--stack-name requires a value}"; shift 2 ;;
    --region)     REGION="${2:?--region requires a value}"; shift 2 ;;
    --write)      WRITE="${2:?--write requires a value}"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$STACK" ]] || { echo "ERROR: --stack-name is required" >&2; exit 2; }

REGION_ARG=(); [[ -n "$REGION" ]] && REGION_ARG=(--region "$REGION")

# Read-only describe. Let the AWS CLI extract each value via JMESPath so we are
# independent of JSON formatting (CLI v2 pretty-prints --output json by default,
# which a compact-JSON grep would miss). --output text yields the bare value, or
# an empty string for a missing key — the non-empty guard below still catches it.
get() {
  aws cloudformation describe-stacks "${REGION_ARG[@]}" \
    --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

UP="$(get UserPoolId)"; CL="$(get UserPoolClientId)"; DOM="$(get CognitoDomain)"
[[ -n "$UP" && -n "$CL" && -n "$DOM" ]] \
  || { echo "ERROR: stack $STACK missing one of UserPoolId/UserPoolClientId/CognitoDomain" >&2; exit 1; }

BLOCK="userPoolId: '$UP',
clientId: '$CL',
cognitoDomain: '$DOM',"

if [[ -n "$WRITE" ]]; then
  [[ -f "$WRITE" ]] || { echo "ERROR: --write target not found: $WRITE" >&2; exit 1; }
  # VALIDATE FIRST: each of the three value lines must already exist in the target.
  # `-replace`/`sed` silently no-op on no-match, which would let us report success
  # while having changed nothing. Require each pattern to match >=1 time up front so
  # a malformed/placeholder-less target FAILS loudly instead of falsely succeeding.
  for pat in "userPoolId: '[^']*'," "clientId: '[^']*'," "cognitoDomain: '[^']*',"; do
    grep -Eq "$pat" "$WRITE" \
      || { echo "ERROR: --write target $WRITE missing expected line matching: $pat" >&2; exit 1; }
  done
  # Portable transform: write to a temp file then atomically mv over the target.
  # NOT `sed -i` (GNU-only; fails on macOS/BSD sed). The `'[^']*',` patterns stop at
  # the closing `',` so any trailing inline comment (e.g. `// CFN Output: UserPoolId`)
  # is preserved.
  tmp="$(mktemp "${WRITE}.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  sed -E \
    -e "s|userPoolId: '[^']*',|userPoolId: '$UP',|" \
    -e "s|clientId: '[^']*',|clientId: '$CL',|" \
    -e "s|cognitoDomain: '[^']*',|cognitoDomain: '$DOM',|" \
    "$WRITE" > "$tmp"
  mv "$tmp" "$WRITE"
  trap - EXIT
  echo "Wrote pool values into $WRITE"
else
  echo "$BLOCK"
fi
