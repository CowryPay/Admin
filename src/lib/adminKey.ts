/**
 * The admin key lives in sessionStorage and nowhere else.
 *
 * The backend has no per-admin-user system — every /admin/* route compares an
 * `x-admin-key` header against a single shared secret (see the backend's
 * middleware/requireAdminKey.ts). So there is no session to establish, no token
 * to refresh, and nothing to log out of server-side: "logged in" here means
 * "this tab is holding a key that /admin/overview accepted".
 *
 * sessionStorage (not localStorage) is the deliberate choice — a shared secret
 * shouldn't outlive the tab it was typed into. The key is never written to a
 * cookie, never put in a URL, and never logged.
 */

const STORAGE_KEY = "cowrypay-admin-key";

export function getAdminKey(): string | null {
  // Guarded for the server render pass — App Router renders these pages on the
  // server first, where sessionStorage doesn't exist.
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function setAdminKey(key: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearAdminKey(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
