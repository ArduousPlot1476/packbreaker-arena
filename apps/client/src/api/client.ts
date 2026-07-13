// § 6.4 API fetch wrapper (M2.1 PR2).
//
// tech-architecture.md § 6.4 specs a thin fetch wrapper for client→server
// requests. This IS that wrapper — it did not exist before (telemetry posts
// via its own transport, emit.ts). It attaches Authorization: Bearer <token>
// ONLY when a session token is present; when null/empty it sends no
// Authorization header, so anonymous requests are byte-identical to pre-auth
// behaviour (PR1's server preHandler tolerates a null user).
//
// The token is injected by the caller (see useApiFetch), not read here —
// keeping this a pure, environment-free function that unit-tests trivially.
// No authenticated caller exists yet in PR2; PR3's run-save is the first.

export interface ApiFetchOptions {
  /** Session JWT to send as a Bearer token; omitted from the request
   *  headers when null/undefined/empty (anonymous request). */
  readonly token?: string | null;
}

export function apiFetch(
  input: string,
  init: RequestInit = {},
  opts: ApiFetchOptions = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = opts.token;
  if (typeof token === 'string' && token.length > 0) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
