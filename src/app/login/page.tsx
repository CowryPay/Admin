"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminAuthError, AdminNotConfiguredError, getOverview } from "@/lib/adminApi";
import { setAdminKey } from "@/lib/adminKey";

/**
 * One field, no username.
 *
 * The backend authenticates /admin/* with a single shared secret compared
 * against `x-admin-key` — there are no admin accounts to sign into, so a
 * username field would be theatre. Verification is a real request to
 * /admin/overview with the candidate key: 200 means the backend accepted it,
 * 401 means it didn't. Only then is it stored.
 */
export default function LoginPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const candidate = key.trim();
    if (!candidate || checking) return;

    setChecking(true);
    setError(null);

    try {
      await getOverview(candidate);
      setAdminKey(candidate);
      // replace, not push — the login screen shouldn't sit in history behind
      // the dashboard.
      router.replace("/overview");
    } catch (err) {
      if (err instanceof AdminAuthError) {
        setError("That key was rejected. Check it hasn't been rotated.");
      } else if (err instanceof AdminNotConfiguredError) {
        setError("The backend has no admin key configured, so no key will work until that's set.");
      } else {
        // Network failure, CORS, backend down — not a wrong key, and saying
        // "wrong key" here would send someone hunting for the wrong problem.
        setError(err instanceof Error ? err.message : "Couldn't reach the backend.");
      }
      setChecking(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cowry-dark bg-glow-green px-4">
      <div className="noise w-full max-w-sm rounded-2xl border border-cowry-border bg-cowry-card p-7">
        <div className="mb-6">
          <div className="mb-4 flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-cowry-green" />
            <span className="text-sm font-semibold tracking-tight text-white">CowryPay Admin</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Enter admin key</h1>
          <p className="mt-1.5 text-sm text-cowry-muted">
            Internal ops dashboard. The key is kept for this browser tab only.
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <label htmlFor="admin-key" className="mb-1.5 block text-xs font-medium text-cowry-muted">
            Admin key
          </label>
          <input
            id="admin-key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="off"
            autoFocus
            spellCheck={false}
            placeholder="••••••••••••"
            className="w-full rounded-xl border border-cowry-border bg-cowry-dark px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-cowry-muted/50 focus:border-cowry-green"
          />

          {error ? (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-status-critical">
              <span aria-hidden>⚠</span>
              <span>{error}</span>
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!key.trim() || checking}
            className="mt-5 w-full rounded-xl bg-cowry-green px-4 py-2.5 text-sm font-semibold text-cowry-dark transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
          >
            {checking ? "Verifying…" : "Unlock dashboard"}
          </button>
        </form>
      </div>
    </main>
  );
}
