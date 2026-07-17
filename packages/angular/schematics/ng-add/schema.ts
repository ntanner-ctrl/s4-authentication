export interface Schema {
  /** Target Angular project name (resolved from the workspace by default). */
  project?: string;
  /** Cognito User Pool ID. */
  userPoolId: string;
  /** Cognito app client ID. */
  clientId: string;
  /** Cognito hosted domain, no scheme. */
  cognitoDomain: string;
  /** Comma-separated enabled IdPs. */
  providers: string;
  /** Login-card heading (defaults to "Sign in"). */
  appTitle?: string;
}
