// App-wide session-token accessor (M2.1 PR2).
//
// Decouples "get the current session token" from Clerk so the fetch layer
// (api/client.ts) attaches an Authorization header without importing Clerk
// directly, and so the anonymous path (no Clerk) returns null with zero
// Clerk coupling. AuthProvider supplies the real getter (Clerk's getToken)
// on the enabled path; the default returns null (signed out / no Clerk).

import { createContext, useContext } from 'react';

/** Returns the current session JWT, or null when signed out / no Clerk. */
export type GetSessionToken = () => Promise<string | null>;

const anonymousGetToken: GetSessionToken = async () => null;

export const AuthTokenContext =
  createContext<GetSessionToken>(anonymousGetToken);

/** The current session-token getter (Clerk's when signed-in-capable, else
 *  a null-returning stub). Call the returned fn per request. */
export function useSessionToken(): GetSessionToken {
  return useContext(AuthTokenContext);
}
