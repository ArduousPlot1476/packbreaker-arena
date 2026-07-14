// Account-link POST with response-gated bounded retry (M2.1 PR2 meta-audit).
//
// Codex round 3: the sign-in→link effect previously consumed the transition
// on SEND and ignored the response (fetch resolves for 4xx/5xx), so a
// transient 401 (token not yet ready) / 503 (DB not yet ready) left the
// account unlinked with no retry. Here "linked" is true ONLY on a genuine
// 2xx. 401/503 are plausibly transient → bounded retry. 400 is a bad
// request → never retried. Any other status / exhausted retries → false, so
// the caller leaves the session unlinked and a later sign-in re-attempts
// (the server is idempotent).

const RETRYABLE_STATUS = new Set([401, 503]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 500;

export interface PostAccountLinkOptions {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  /** Injectable so tests avoid real timers. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** POSTs /v1/account/link with bounded retry. Returns true iff a 2xx was
 *  received (the account is linked); false otherwise. Never throws. */
export async function postAccountLink(
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>,
  anonId: string,
  opts: PostAccountLinkOptions = {},
): Promise<boolean> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res: Response;
    try {
      res = await apiFetch('/v1/account/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonId }),
      });
    } catch {
      // Network error — transient; retry if attempts remain.
      if (attempt < maxAttempts) {
        await sleep(delayMs);
        continue;
      }
      return false;
    }
    if (res.ok) return true; // 2xx → linked
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
      await sleep(delayMs);
      continue; // 401/503 → retry
    }
    return false; // 400 (never retry) / other / exhausted
  }
  return false;
}
