// Authed fetch hook (M2.1 PR2).
//
// Binds the current session token (AuthTokenContext) to the § 6.4 apiFetch
// wrapper: signed in → the Authorization header carries the Clerk JWT;
// signed out / no Clerk → no header (anonymous, unchanged). This is the
// integration point PR3's run-save calls. No authed request exists in PR2
// yet (telemetry stays on its own anonymous transport).

import { useCallback } from 'react';
import { useSessionToken } from '../auth/authToken';
import { apiFetch } from './client';

export function useApiFetch() {
  const getToken = useSessionToken();
  return useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const token = await getToken();
      return apiFetch(input, init, { token });
    },
    [getToken],
  );
}
