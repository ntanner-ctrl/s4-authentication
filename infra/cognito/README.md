# Cognito Auth Stack

Standardized federated authentication via Amazon Cognito — **one `template.yaml`,
provider mix by config**. Microsoft (Entra ID / OIDC) and/or Google (native) are
each created only when their credentials are supplied. Authored to the
CloudFormation toolkit conventions; **supersedes the toolkit's
`dashboard-auth-stack` + `microsoft-auth-stack`** (which were a fork pair).

> Toolkit placement: drops in as `projects/cognito-auth-stack/template.yaml`.
> One pool **per customer** (the one-Microsoft-IdP-per-pool rule forces it).

## Layout

```
infra/cognito/
├── template.yaml                    # the one generalized stack
└── envs/                            # the three products = three configs (not three templates)
    ├── microsoft-only.example.json
    ├── google-only.example.json
    └── both.example.json
```

## Provider mix = config, not code (C8)

| Product | Supply | Result (`SupportedIdentityProviders`) |
|---------|--------|----------------------------------------|
| Microsoft only | Azure creds; Google empty | `[COGNITO, Microsoft]` |
| Google only | Google creds; Azure empty | `[COGNITO, Google]` |
| Both | both creds | `[COGNITO, Microsoft, Google]` |

Same template; the only thing that changes is the per-deployment config. A
Microsoft-only customer still gets its own isolated stack — shared *template*,
not shared *deployment*.

## What it enforces (Auth Contract)

| Clause | In template |
|--------|-------------|
| **C1** public PKCE code-flow | `GenerateSecret:false`, `AllowedOAuthFlows:[code]`, `ExplicitAuthFlows:[ALLOW_REFRESH_TOKEN_AUTH]` (federated-only, no SRP) |
| **C3** token TTLs | `AccessTokenValidity 60` / `IdTokenValidity 60` / `RefreshTokenValidity 1d` + `TokenValidityUnits` |
| **C8** scopes | baseline `openid email profile`; `aws.cognito.signin.user.admin` opt-in via `EnableAdminScope` |

Outputs (`UserPoolId`, `UserPoolClientId`, `CognitoDomain`, `UserPoolArn`,
`RedirectURI`) feed the frontend `auth.config` Config Vocabulary (`/STANDARD.md`).

## Toolkit conventions applied

`Client`/`Environment`/`ServiceTag`/`OwnerTag` params · `UserPoolTags` map ·
`${Client}-${Environment}-auth-*` naming · `${AWS::StackName}-*` exports ·
`DeletionPolicy`/`UpdateReplacePolicy: Retain` + `DeletionProtection: ACTIVE`.
Validated against the toolkit's custom cfn-lint rules **E9001 (tags)** and
**E9002 (naming)**.

## Secret hygiene

`AzureClientSecret` / `GoogleClientSecret` are `NoEcho`, default empty — source
from SSM Parameter Store / Secrets Manager at deploy time, never literals in VCS.
The `envs/*.json` presets show secrets blank for the same reason.

## Operating the stack (`scripts/`)

`scripts/` holds the operator commands in both **PowerShell** (`.ps1`) and
**POSIX shell** (`.sh`) — same behavior, pick the variant for the platform. All
three need AWS credentials with CloudFormation + Cognito permissions.

- **`deploy`** — create or update the stack. Client secrets come from the
  environment, never the command line (see *Secret hygiene*). At least one
  federated IdP (Google or Azure) must be fully supplied.
  ```bash
  export GOOGLE_CLIENT_SECRET=...          # and/or AZURE_CLIENT_SECRET=...
  ./deploy.sh --client acme --environment prod \
    --callback-domain app.acme.com --domain-prefix acme-auth --owner platform \
    --google-client-id <id> [--region us-east-1] [--dry-run]
  ```
- **`destroy`** — delete the stack. Destructive: requires retyping the client
  name via `--confirm-name`. The user pool itself is always retained.
  ```bash
  ./destroy.sh --client acme --environment prod --confirm-name acme
  ```
- **`fetch-config`** — read-only. Print the stack's Outputs as an `auth.config`
  paste-block, or patch a file in place with `--write`.
  ```bash
  ./fetch-config.sh --stack-name acme-prod-auth [--write src/auth.config.ts]
  ```

The PowerShell variants take the same arguments in PascalCase
(`.\deploy.ps1 -Client acme -Environment prod …`, `$env:GOOGLE_CLIENT_SECRET`).

## Per-deployment decisions

Two settings are deliberately left for each deployment to choose:

- **Admin scope (C8).** `aws.cognito.signin.user.admin` is **off by default**.
  Set `EnableAdminScope=true` only when the app calls Cognito user APIs directly
  from the browser; the standard adapters use `fetchAuthSession` and do not need
  it.
- **Refresh-token TTL (C3).** Defaults to **1 day**. Raise it (an app-client
  config change) only with a recorded business reason for a longer working
  session.
