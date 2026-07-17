// Usage / --help text. Kept as a single source so `--help` and error paths print the same thing.

export const HELP_TEXT = `s4-auth-react — install the S4 React + Cognito OIDC auth adapter

USAGE
  npx @s4/auth-react [target-dir] [options]

DESCRIPTION
  One auto-detecting command. It inspects the target directory and picks a path:
    create   target is empty (or a pristine create-vite default) → scaffold + install
    add      target is an existing app                            → inject auth into it
  You do not choose create vs add — the CLI detects which applies (WU3).

ARGUMENTS
  target-dir            Directory to install into. Defaults to the current directory (".").

OPTIONS
  --user-pool-id <id>   Cognito User Pool ID        (else prompted)        [WU4]
  --client-id <id>      Cognito app client ID        (else prompted)        [WU4]
  --cognito-domain <d>  Cognito hosted domain, no scheme (else prompted)    [WU4]
  --region <r>          AWS region                   (else prompted)        [WU4]
  --providers <list>    Comma-separated IdPs (e.g. google,microsoft)        [WU4]
  --app-title <title>   Login-card heading                                  [WU4]
  --post-login-route <r>  Route to land on after login                      [WU4]
  --yes                 Accept defaults / skip optional prompts             [WU4]
  --force               Overwrite an existing install (else it bails)       [WU4]
  -h, --help            Show this help and exit
  -v, --version         Print the CLI version and exit

EXAMPLES
  npx @s4/auth-react ./my-new-app      # scaffold a fresh app, then install auth
  npx @s4/auth-react .                 # add auth to the app in the current directory
`;
