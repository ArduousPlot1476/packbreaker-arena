// Clerk client config (M2.1 PR2).
//
// Publishable key comes from Vite env (VITE_ prefix → exposed to the
// client bundle). Unset → clerkEnabled=false → the app renders without
// ClerkProvider and every request stays anonymous. Mirrors the server's
// env-optional Clerk seam (apps/server/src/clerk/verifier.ts): local/CI
// without Clerk keys still build and run, anonymously — the concept-brief
// no-forced-login pillar.

const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** The configured Clerk publishable key, or undefined when unset/blank. */
export const CLERK_PUBLISHABLE_KEY: string | undefined =
  typeof rawKey === 'string' && rawKey.length > 0 ? rawKey : undefined;

/** True when a Clerk publishable key is configured. Gates all Clerk UI +
 *  provider mounting so the anonymous path never touches Clerk. */
export const clerkEnabled = CLERK_PUBLISHABLE_KEY !== undefined;
