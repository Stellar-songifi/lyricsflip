/** Payload of an access token, as signed by `GenerateTokensProvider`. */
export interface ActiveUserData {
  /** User id. */
  sub: string;
  email?: string;
}
